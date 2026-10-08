// Chamada de video/audio por proximidade (WebRTC P2P, sinalizacao via Socket.io).
// Quando dois bonecos ficam pertinho um do outro, os navegadores deles se conectam
// diretamente (o servidor so entrega o "bilhete" de sinalizacao, nunca ve o video).
(function () {
  // ---------------------------------------------------------------- alcance
  // Medido em TILES, e nao em pixels soltos: o mapa e uma grade, e "tres tiles"
  // e uma distancia que da pra enxergar na tela e conferir no mapa. Antes eram
  // 130px, que dao 4,1 tiles - com o zoom em 2x isso e meia tela de distancia,
  // e a chamada abria com gente que voce mal via.
  const TILE = 32;
  const TILES_ENTRAR = 3;
  // Sair tem folga: sem ela a chamada pisca com a pessoa andando na borda. E
  // proporcao, e nao numero fixo, porque agora cada area tem o seu alcance
  // (docs/areas.md) - 1,5x de 2 tiles e 3; de 6 tiles, 9.
  const FOLGA_SAIR = 1.5;
  const RAIO_ENTRAR = TILES_ENTRAR * TILE;

  // De onde o som ja comeca a cair. Perto e volume cheio; dai pra fora vai
  // sumindo ate zero no raio de saida, como no Gather - o corte seco fazia a
  // conversa aparecer e desaparecer de uma vez.
  const TILES_VOLUME_CHEIO = 1.5;

  // Quanto tempo uma conexao pode ficar "quase la" antes de ser considerada
  // perdida. Ver `podarConexoesPresas`.
  const PACIENCIA_MS = 12000;

  // Quem nunca atende. A conexao que nasce e nao conecta (o outro esta com a aba
  // parada, sem camera, ou atras de uma rede que nao passa) era derrubada depois da
  // paciencia e refeita NO QUADRO SEGUINTE, pra sempre: medido, ~30 tentativas em
  // ~7 minutos pra dois bonecos que nunca respondiam - cada uma com oferta,
  // candidatos ICE e uma conexao nova. Agora cada falha seguida com a MESMA pessoa
  // dobra a espera (15 s, 30 s, 60 s... ate 5 min); conectar, ou a pessoa sair do
  // mapa, zera.
  const ESPERA_BASE_MS = 15000;
  const ESPERA_MAX_MS = 5 * 60 * 1000;

  // Servidores ICE vem do servidor (/api/ice): STUN, e o TURN da Cloudflare
  // quando configurado - sem TURN a chamada nao fecha em rede de faculdade,
  // empresa e parte do 4G. Comeca com o STUN de sempre: se a busca falhar, a
  // chamada fica exatamente como era antes, e nao pior.
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  let icePronto = Promise.resolve();
  const ESPERA_ICE_MS = 4000;
  const RENOVAR_ICE_MS = 6 * 60 * 60 * 1000; // a credencial do TURN vence em 24h

  function buscarIce() {
    // Quem entra pelo link de uma reuniao nao tem cookie, entao /api/ice o
    // barraria: a pagina dele diz de onde vem a lista (o socket da reuniao) por
    // `Network.pedirIce`. Ver public/js/paginas/reuniao-rede.js.
    const origem = window.Network && window.Network.pedirIce
      ? Promise.resolve(window.Network.pedirIce())
      : fetch('/api/ice', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
    const busca = origem
      .then((j) => {
        if (j && Array.isArray(j.iceServers) && j.iceServers.length) iceServers = j.iceServers;
      })
      .catch(() => { /* fica o STUN */ });
    // Conexao nao espera pra sempre: rede lenta no arranque nao pode segurar a
    // primeira chamada. Passou do prazo, abre com o que tiver.
    icePronto = Promise.race([busca, new Promise((ok) => setTimeout(ok, ESPERA_ICE_MS))]);
    return icePronto;
  }

  let selfId = null;
  let localStream = null;
  let cameraAtiva = false;
  let temVideo = false;
  let micAtivo = true;
  // discador em ligacao: ver abafarParaLigacao()
  let abafado = false;
  let micAntesDeAbafar = true;
  let videoAtivo = true;
  let streamPendente = null; // camera aberta na tela de entrada, esperando o init
  let telaStream = null; // o que o navegador devolveu do getDisplayMedia
  let telaTrack = null; // a track de video da tela, enquanto ela esta dividida

  // ------------------------------------------------------ chamada grande
  // A chamada e direta entre as pessoas (malha P2P): cada uma manda o proprio
  // video pra CADA uma das outras. Com 6 pessoas sao 5 videos subindo da internet
  // de cada participante; com 15, catorze - a conexao de casa e o processador
  // nao dao conta e a chamada inteira trava, pra todo mundo.
  //
  // Passou de 6 pessoas, as CAMERAS saem do ar e fica so a voz (audio e leve:
  // ~40 kbps por pessoa). Compartilhar tela continua, porque numa reuniao grande
  // e justamente a tela que importa, e so quem apresenta manda. Volta a ter
  // camera quando cair pra 5 - a folga evita ligar e desligar a cada um que
  // entra e sai na borda.
  //
  // Reuniao geral de verdade (15, 30 pessoas com video) pede um servidor de
  // video no meio; ate la, a regra e esta. Ver docs/deploy.md.
  const LIMITE_OUTROS_COM_VIDEO = 5;   // eu + 5 = 6 pessoas
  const VOLTA_VIDEO_OUTROS = 4;        // eu + 4 = 5
  let soVoz = false;

  const peers = new Map(); // id do outro jogador -> { pc, videoEl, videoSender, remoteDescDefinida, candidatosPendentes }
  const desistencias = new Map(); // id -> { falhas, ateQuando }: quem nunca atende (ver ESPERA_BASE_MS)

  function registrarFalha(id) {
    const d = desistencias.get(id) || { falhas: 0, ateQuando: 0 };
    d.falhas += 1;
    d.ateQuando = Date.now() + Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * Math.pow(2, d.falhas - 1));
    desistencias.set(id, d);
  }

  function emEspera(id) {
    const d = desistencias.get(id);
    return !!d && Date.now() < d.ateQuando;
  }

  // Quem entrou na reuniao pelo LINK dela (visitante). Nao tem boneco nem posicao,
  // entao nao vem no mapa de jogadores que o jogo entrega: quem sabe deles e o
  // visitantes.js, que os passa pra ca. So contam enquanto EU estou na mesma
  // chamada - ela e a unica coisa que liga um visitante a mim. Ver
  // docs/plano-reuniao-por-link.md.
  let visitantes = new Map(); // id 'v-...' -> { id, name, chamada, appearance, dividindoTela }

  function definirVisitantes(mapa) {
    visitantes = mapa && typeof mapa.forEach === 'function' ? mapa : new Map();
  }

  // Quem e esse id: um jogador do mapa ou, na chamada, um visitante.
  function jogadorDe(id) {
    const G = window.Game;
    return (G && G.getPlayers && G.getPlayers().get(id)) || visitantes.get(id) || null;
  }

  function palco() {
    return document.getElementById('palco-remoto');
  }

  function criarVideoRemoto(id) {
    const v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    // quem chega no meio de uma ligacao do discador ja nasce sem som
    v.muted = abafado;
    v.dataset.peerId = id;
    palco().appendChild(v);
    return v;
  }

  function fecharPeer(id) {
    const p = peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch (e) { /* ja fechada */ }
    if (p.videoEl) p.videoEl.remove();
    peers.delete(id);
  }

  // Qual video sai daqui agora: a tela, quando esta sendo dividida, senao a
  // camera. Um so - ver docs/plano-dividir-tela.md.
  function videoQueVaiSair() {
    if (telaTrack) return telaTrack;
    if (soVoz) return null;
    return localStream ? (localStream.getVideoTracks()[0] || null) : null;
  }

  function ajustarChamadaGrande() {
    const outros = peers.size;
    if (!soVoz && outros > LIMITE_OUTROS_COM_VIDEO) {
      soVoz = true;
      mostrarAviso('Chamada com mais de 6 pessoas: as cameras sairam do ar pra ninguem travar. A voz e o compartilhar tela continuam.');
    } else if (soVoz && outros <= VOLTA_VIDEO_OUTROS) {
      soVoz = false;
      mostrarAviso('A chamada diminuiu: as cameras voltaram.');
    } else {
      return;
    }
    peers.forEach((p, id) => {
      if (sincronizarTracks(p)) renegociar(id);
    });
  }

  // Garante que todas as tracks locais estao sendo enviadas nessa conexao.
  // Retorna true se alguma foi adicionada agora (ou seja, precisa renegociar).
  // Sem isso, quem cria a conexao antes da propria camera abrir fica mudo pro
  // outro lado pelo resto da chamada.
  //
  // O transmissor de VIDEO fica guardado em `p.videoSender`, e nao e procurado
  // de novo a cada vez. Motivo: ao parar a divisao de tela o transmissor fica
  // com track nula, e um transmissor de track nula nao diz de que tipo era -
  // procurando por `s.track.kind` a gente nao acharia esse e criaria um segundo
  // transmissor de video, o que faz o outro lado receber dois quadros.
  function sincronizarTracks(p) {
    if (!localStream) return false;
    let mudou = false;

    const jaEnviadas = p.pc.getSenders().map((s) => s.track).filter(Boolean);
    localStream.getAudioTracks().forEach((track) => {
      if (jaEnviadas.indexOf(track) === -1) {
        p.pc.addTrack(track, localStream);
        mudou = true;
      }
    });

    const video = videoQueVaiSair();
    if (video) {
      if (!p.videoSender) {
        p.videoSender = p.pc.addTrack(video, localStream);
        mudou = true;
      } else if (p.videoSender.track !== video) {
        // troca sem renegociar: e o que faz a tela entrar na hora
        p.videoSender.replaceTrack(video);
      }
    } else if (p.videoSender && p.videoSender.track) {
      // chamada grande: para de mandar a camera sem derrubar o transmissor
      p.videoSender.replaceTrack(null);
    }
    return mudou;
  }

  async function renegociar(id) {
    const p = peers.get(id);
    if (!p || p.pc.signalingState !== 'stable') return;
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      Network.sendRtcSignal(id, { type: 'offer', sdp: offer.sdp });
    } catch (e) {
      /* renegociacao falhou: a chamada segue com o que ja estava negociado */
    }
  }

  function garantirPeer(id) {
    let p = peers.get(id);
    if (p) return p;

    const pc = new RTCPeerConnection({ iceServers });
    const videoEl = criarVideoRemoto(id);
    p = {
      pc, videoEl, videoSender: null,
      remoteDescDefinida: false, candidatosPendentes: [],
      nascidoEm: Date.now(), // pra saber quando desistir (ver podarConexoesPresas)
    };
    peers.set(id, p);

    sincronizarTracks(p);

    pc.ontrack = (ev) => { videoEl.srcObject = ev.streams[0]; };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) Network.sendRtcSignal(id, { type: 'candidate', candidate: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      // Um evento tardio de uma conexao que ja foi trocada nao pode derrubar a nova
      // (o id e o mesmo).
      if (peers.get(id) !== p) return;
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // Nunca chegou a conectar: conta como tentativa perdida (ver registrarFalha)
        if (!p.avisouConexao) registrarFalha(id);
        fecharPeer(id);
        return;
      }
      // A chamada ABRIU de fato (audio passando). O avisos.js usa isto pra chamar
      // quem esta com a sede numa aba escondida quando alguem chega perto.
      if (pc.connectionState === 'connected' && !p.avisouConexao) {
        p.avisouConexao = true;
        desistencias.delete(id);
        window.dispatchEvent(new CustomEvent('sede:chamada-conectou', { detail: { id } }));
      }
    };

    return p;
  }

  async function iniciarChamada(id) {
    await icePronto;
    const p = garantirPeer(id);
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      Network.sendRtcSignal(id, { type: 'offer', sdp: offer.sdp });
    } catch (e) {
      fecharPeer(id);
    }
  }

  async function tratarSinal({ from, signal }) {
    if (!signal || !from) return;
    // Mesma espera do iniciarChamada, pro lado que RECEBE a oferta tambem abrir
    // a conexao com o TURN. Todos os sinais esperam a mesma promessa, entao
    // oferta e candidatos continuam saindo na ordem em que chegaram.
    await icePronto;

    if (signal.type === 'offer') {
      const p = garantirPeer(from);

      // Se os dois lados ofertarem ao mesmo tempo, quem tem o id maior cede
      // (desfaz a propria oferta e aceita a do outro); o de id menor ignora.
      const colisao = p.pc.signalingState !== 'stable';
      if (colisao && selfId < from) return;
      if (colisao) {
        try { await p.pc.setLocalDescription({ type: 'rollback' }); } catch (e) { return; }
      }

      await p.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      p.remoteDescDefinida = true;
      for (const c of p.candidatosPendentes) { try { await p.pc.addIceCandidate(c); } catch (e) { /* ignora */ } }
      p.candidatosPendentes = [];
      // a camera pode ter aberto depois que essa conexao nasceu: a resposta ja
      // sai levando as tracks locais
      sincronizarTracks(p);
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      Network.sendRtcSignal(from, { type: 'answer', sdp: answer.sdp });
    } else if (signal.type === 'answer') {
      const p = peers.get(from);
      if (!p || p.pc.signalingState !== 'have-local-offer') return;
      await p.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      p.remoteDescDefinida = true;
      for (const c of p.candidatosPendentes) { try { await p.pc.addIceCandidate(c); } catch (e) { /* ignora */ } }
      p.candidatosPendentes = [];
    } else if (signal.type === 'candidate') {
      const p = garantirPeer(from);
      if (p.remoteDescDefinida) {
        try { await p.pc.addIceCandidate(signal.candidate); } catch (e) { /* ignora */ }
      } else {
        p.candidatosPendentes.push(signal.candidate);
      }
    }
  }

  // Tem parede entre os dois? Anda pela reta que liga um ao outro, de quarto em
  // quarto de tile, e olha o que tem no caminho.
  //
  // So PAREDE e JANELA cortam. Movel nao: duas pessoas conversando por cima de
  // uma mesa e a coisa mais normal de um escritorio, e a mesa e tile solido
  // igual a parede - barrar por "solido" calaria a sede inteira.
  function paredeEntre(a, b) {
    const M = window.OfficeMap;
    if (!M) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const passos = Math.ceil(Math.hypot(dx, dy) / (TILE / 4));
    if (passos <= 0) return false;
    for (let i = 1; i < passos; i++) {
      const x = a.x + (dx * i) / passos;
      const y = a.y + (dy * i) / passos;
      const t = M.tiles[Math.floor(y / TILE)] && M.tiles[Math.floor(y / TILE)][Math.floor(x / TILE)];
      if (t === M.PAREDE || t === M.JANELA) return true;
    }
    return false;
  }

  // ----------------------------------------------------- salas de conversa
  // A regra de som do lugar onde a pessoa esta: quem decide e a AREA, e cada
  // area tem a sua (a diretoria muda no editor - ver docs/areas.md).
  //
  //   { id, modo: 'perto'|'sala'|'silencio', alcance: <tiles, so no 'perto'> }
  //
  // Fora de qualquer area, vale o padrao de corredor.
  function regraDe(p) {
    const M = window.OfficeMap;
    const sala = M && M.getRoomAtTile ? M.getRoomAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) : null;
    const som = M && M.somDaArea ? M.somDaArea(sala && sala.som) : { modo: 'perto', alcance: TILES_ENTRAR };
    return { id: sala ? sala.id : null, modo: som.modo, alcance: som.alcance };
  }

  // Em que sala FECHADA a pessoa esta, se estiver em alguma (`modo: 'sala'`).
  function salaFechadaDe(p) {
    const r = regraDe(p);
    return r.modo === 'sala' ? r.id : null;
  }

  // Quantos tiles de alcance valem entre duas pessoas: o MENOR dos dois lados.
  // Quem esta no Foco leva o silencio do Foco pra conversa - senao alguem
  // parado no corredor, com alcance maior, puxaria pra chamada quem foi pro
  // Foco justamente pra nao ser puxado.
  function alcanceEntre(a, b) {
    return Math.min(a.alcance, b.alcance) * TILE;
  }

  // Sala SILENCIOSA (`silenciosa: true` no mapa): a biblioteca. E a "library
  // zone" dos escritorios por atividade - area com regra explicita de nao
  // conversar. Sem ela o silencio da biblioteca seria so desenho: bastava duas
  // pessoas se sentarem na mesma mesa pra chamada abrir. Ver
  // docs/plano-biblioteca.md.
  function salaSilenciosaDe(p) {
    return regraDe(p).modo === 'silencio';
  }

  // Status que a pessoa escolheu na barra de cima. 'livre' e o unico que aceita
  // conversa de corredor - 'focado' e 'reuniao' sao a pessoa dizendo, com todas
  // as letras, que nao quer ser interrompida.
  //
  // Sem isto o botao era enfeite: dava pra marcar "Em reuniao" e cair numa
  // chamada mesmo assim, no meio da reuniao, so porque alguem passou perto.
  // Botao que promete e nao cumpre e pior do que botao que nao existe.
  function ocupado(p) {
    return !!p && !!p.status && p.status !== 'livre';
  }

  // A decisao de falar ou nao com alguem, num lugar so.
  //
  // Sala fechada MANDA mais que distancia, nos dois sentidos:
  //
  //   dentro da mesma sala -> conversa, e nao importa se estao nas duas pontas
  //     dela. Reuniao nao e proximidade: quem senta na outra ponta da mesa de
  //     conferencia participa igual.
  //
  //   um dentro, outro fora -> NAO conversa, e nao importa se estao a um passo
  //     um do outro. E o ponto inteiro de uma sala fechada: dava pra encostar do
  //     lado de fora da porta e cair na reuniao.
  //
  // Fora de sala fechada, vale o de sempre: perto e sem parede no meio.
  // As duas pessoas entraram na MESMA chamada marcada?
  //
  // Esta e a unica regra que ignora o mapa inteiro - distancia, parede, sala,
  // status. E ela existe porque prender a reuniao a uma sala quebra no caso
  // obvio: a sala de reuniao esta ocupada. E porque ninguem deveria ter que
  // largar o lugar onde esta trabalhando pra entrar numa reuniao.
  //
  // Entrar numa chamada dessas e um ato deliberado - a pessoa clicou em
  // "entrar". Por isso ela ganha ate da sala silenciosa: quem entrou na reuniao
  // e depois foi buscar um livro na biblioteca continua na reuniao.
  function naMesmaChamada(self, outro) {
    return !!(self && outro && self.chamada && outro.chamada
      && self.chamada.id === outro.chamada.id);
  }

  function deveFalarCom(self, outro) {
    if (naMesmaChamada(self, outro)) return true;

    const aqui = regraDe(self);
    const la = regraDe(outro);
    // Silencio manda mais que tudo, inclusive sala fechada.
    if (aqui.modo === 'silencio' || la.modo === 'silencio') return false;
    if (aqui.modo === 'sala' || la.modo === 'sala') return aqui.id === la.id;

    // Status barra a conversa de corredor - mas so DEPOIS da sala fechada, e de
    // proposito. Entrar numa sala de reuniao e um ato deliberado: quem cruza
    // aquela porta quis participar, e travar a chamada ali deixaria a sala
    // muda. Passar perto de alguem no corredor e acidente, e e isso que o
    // status protege. Vale pros dois lados: nem interrompo quem esta focado,
    // nem sou puxado pra uma conversa quando eu e que estou.
    if (ocupado(self) || ocupado(outro)) return false;

    const dist = Math.hypot(outro.x - self.x, outro.y - self.y);
    return dist < alcanceEntre(aqui, la) && !paredeEntre(self, outro);
  }

  // Sair tem folga maior que entrar, senao a chamada pisca com a pessoa andando
  // em cima da borda. Dentro da mesma sala fechada nao ha borda: so sai quem
  // sair da sala.
  //
  // Status NAO entra aqui, e isso e escolha. Mudar o proprio status pra "Focado"
  // no meio de uma conversa derrubaria a chamada na cara do outro, sem ele ter
  // feito nada - quem quer sair, sai andando. O status barra chamada NOVA; nao
  // desliga a que ja esta acontecendo.
  function deveContinuarCom(self, outro) {
    if (naMesmaChamada(self, outro)) return true;

    const aqui = regraDe(self);
    const la = regraDe(outro);
    // Entrou na biblioteca em chamada? A chamada acaba ali. E o contrario da sala
    // fechada: la dentro todo mundo conversa; aqui ninguem conversa.
    if (aqui.modo === 'silencio' || la.modo === 'silencio') return false;
    if (aqui.modo === 'sala' || la.modo === 'sala') return aqui.id === la.id;
    const dist = Math.hypot(outro.x - self.x, outro.y - self.y);
    return dist <= alcanceEntre(aqui, la) * FOLGA_SAIR && !paredeEntre(self, outro);
  }

  // Volume pela distancia: cheio pertinho, sumindo ate zero no raio de saida.
  // O raio e o da conversa (que muda com a area), e nao um numero fixo: numa
  // area de alcance curto o som tem que sumir mais cedo, senao a pessoa sai do
  // alcance ainda ouvindo alto e a chamada cai de uma vez.
  function volumePara(dist, alcance) {
    const sair = (alcance || RAIO_ENTRAR) * FOLGA_SAIR;
    const cheio = Math.min(TILES_VOLUME_CHEIO * TILE, sair / 2);
    if (dist <= cheio) return 1;
    if (dist >= sair) return 0;
    return 1 - (dist - cheio) / (sair - cheio);
  }

  // Conexao que nasceu e nunca chegou a conectar vira lixo que BLOQUEIA: como
  // `peers.has(id)` continua verdadeiro, a proximidade nunca tenta de novo e as
  // duas pessoas ficam lado a lado sem chamada, pra sempre. Acontece de verdade
  // quando o outro lado recarrega a pagina no meio da negociacao.
  //
  // Depois da paciencia, o par e derrubado - e a proximidade, que roda todo
  // quadro, refaz a chamada sozinha no instante seguinte.
  function podarConexoesPresas() {
    const agora = Date.now();
    peers.forEach((p, id) => {
      if (p.pc.connectionState === 'connected') return;
      if (agora - p.nascidoEm < PACIENCIA_MS) return;
      registrarFalha(id);
      fecharPeer(id);
    });
  }

  // Chamado a cada frame do jogo com o mapa atual de jogadores (id -> {x,y,...}).
  function updateProximity(mapaDoJogo) {
    if (!selfId) return;
    const self = mapaDoJogo.get(selfId);
    if (!self) return;

    // Os visitantes da MINHA chamada entram na conta como se fossem jogadores:
    // `naMesmaChamada` os liga a mim, e o resto do mapa (posicao, sala, parede) nem
    // chega a ser consultado.
    let playersMap = mapaDoJogo;
    if (self.chamada && visitantes.size) {
      playersMap = new Map(mapaDoJogo);
      visitantes.forEach((v, id) => {
        if (v.chamada && v.chamada.id === self.chamada.id) playersMap.set(id, v);
      });
    }

    podarConexoesPresas();

    playersMap.forEach((p, id) => {
      if (id === selfId) return;
      const jaConectado = peers.has(id);

      if (!jaConectado) {
        // QUALQUER um dos dois propoe - e nao so o de id menor, como era antes.
        //
        // O motivo e concreto: `updateProximity` roda no laco de desenho, e o
        // navegador CONGELA esse laco em aba de segundo plano. Com a regra
        // antiga, se justamente a pessoa de id menor estivesse com a aba atras
        // (alt-tab, o tempo todo), a chamada nunca abria - as duas ficavam lado
        // a lado sem nada acontecer, e nem dava pra desconfiar do porque.
        //
        // Os dois propondo ao mesmo tempo nao e problema: o `tratarSinal` ja
        // resolve a colisao de ofertas - o de id maior desfaz a propria e aceita
        // a do outro. Essa regra continua sendo a que decide quem cede.
        if (cameraAtiva && !emEspera(id) && deveFalarCom(self, p)) iniciarChamada(id);
        return;
      }

      if (!deveContinuarCom(self, p)) {
        fecharPeer(id);
        return;
      }

      const par = peers.get(id);
      if (par && par.videoEl) {
        // Volume cheio quando a conversa NAO e de corredor: na mesma chamada
        // marcada, ou na mesma sala fechada. Numa reuniao ninguem fala mais
        // baixo por estar na outra cabeceira - e menos ainda por estar na outra
        // ponta do escritorio, que e o caso novo: quem entra numa chamada
        // marcada continua no lugar onde estava.
        par.videoEl.volume = (naMesmaChamada(self, p) || salaFechadaDe(self))
          ? 1
          : volumePara(Math.hypot(p.x - self.x, p.y - self.y), alcanceEntre(regraDe(self), regraDe(p)));
      }
    });

    peers.forEach((_, id) => { if (!playersMap.has(id)) fecharPeer(id); });
    // quem saiu do mapa (ou trocou de id) leva a fila de espera junto
    desistencias.forEach((_, id) => { if (!playersMap.has(id)) desistencias.delete(id); });
    ajustarChamadaGrande();
  }

  function mostrarAviso(texto) {
    const el = document.getElementById('aviso-camera');
    if (!el) return;
    el.textContent = texto;
    el.classList.remove('oculto');
    clearTimeout(mostrarAviso._timer);
    mostrarAviso._timer = setTimeout(() => el.classList.add('oculto'), 4500);
  }

  async function ligarCamera() {
    let avisoParcial = null;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      temVideo = true;
    } catch (eComVideo) {
      // camera falhou (ocupada, sem driver, etc) - tenta so com audio pra nao bloquear a chamada
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        temVideo = false;
        avisoParcial = 'Camera indisponivel (' + eComVideo.message + '). Entrando so com audio.';
      } catch (eSoAudio) {
        mostrarAviso('Nao foi possivel acessar camera nem microfone: ' + eSoAudio.message);
        return;
      }
    }
    cameraAtiva = true;
    micAtivo = true;
    videoAtivo = temVideo;

    // Conexoes que ja existiam nasceram sem as nossas tracks (a camera abriu
    // depois). Manda as tracks agora e renegocia, senao o outro lado nunca
    // recebe nosso video/audio nessa chamada.
    peers.forEach((p, id) => {
      if (sincronizarTracks(p)) renegociar(id);
    });

    aplicarUiCamera();
    if (avisoParcial) mostrarAviso(avisoParcial);
  }

  function aplicarUiCamera() {
    const videoLocal = document.getElementById('video-local');
    // Dividindo a tela, a previa mostra a TELA: sem esta guarda, qualquer mexida
    // na camera (mudo, video on/off) devolvia a previa pro rosto no meio da
    // apresentacao, e so a previa - o que o outro lado recebia continuava sendo
    // a tela. Ver duas coisas diferentes e pior que ver a errada.
    if (!telaTrack) videoLocal.srcObject = localStream;
    document.getElementById('preview-local').classList.remove('oculto');
    document.getElementById('preview-local').classList.toggle('sem-video', !temVideo && !telaTrack);
    document.getElementById('btn-camera').classList.add('ativo');
    document.getElementById('btn-mic').classList.toggle('desativado', !micAtivo);
    document.getElementById('btn-video-toggle').classList.toggle('desativado', !videoAtivo);
  }

  function desligarCamera() {
    // A tela vai junto: dividir tela com a camera desligada deixaria a pessoa
    // mandando a propria tela sem microfone e sem quadro nenhum na tela dela
    // pra lembrar disso.
    if (telaTrack) pararTela();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    cameraAtiva = false;
    document.getElementById('preview-local').classList.add('oculto');
    document.getElementById('btn-camera').classList.remove('ativo');
    peers.forEach((_, id) => fecharPeer(id));
  }

  function alternarCamera() {
    if (cameraAtiva) desligarCamera();
    else ligarCamera();
  }

  // ------------------------------------------------------------ dividir a tela
  // A tela ENTRA NO LUGAR da camera, e nao junto: e uma troca de track no
  // transmissor que ja existe, entao o outro lado nao muda nada - o quadro que
  // mostrava seu rosto passa a mostrar sua tela. Ver docs/plano-dividir-tela.md.

  async function ligarTela() {
    if (!cameraAtiva) {
      mostrarAviso('Ligue a camera ou o microfone antes de dividir a tela.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) {
      return; // a pessoa fechou a janela de escolha: nao ha nada a desfazer
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    telaStream = stream;
    telaTrack = track;
    // O navegador tem o proprio botao de "parar de compartilhar", fora da nossa
    // pagina. Sem escutar isto, a divisao parava pra ele e continuava ligada pra
    // gente: o botao ficaria aceso mandando uma track morta.
    telaTrack.addEventListener('ended', pararTela);

    peers.forEach((p, id) => {
      if (sincronizarTracks(p)) renegociar(id); // so-audio: nao havia video pra trocar
    });
    aplicarUiTela();
  }

  function pararTela() {
    if (!telaTrack) return;
    const camera = localStream ? (localStream.getVideoTracks()[0] || null) : null;
    telaTrack.removeEventListener('ended', pararTela);
    peers.forEach((p) => {
      // `replaceTrack(null)` para de mandar video sem derrubar o transmissor -
      // e por isso que `p.videoSender` fica guardado.
      if (p.videoSender) p.videoSender.replaceTrack(camera);
    });
    telaStream.getTracks().forEach((t) => t.stop());
    telaStream = null;
    telaTrack = null;
    aplicarUiTela();
  }

  function alternarTela() {
    if (telaTrack) pararTela();
    else ligarTela();
  }

  function aplicarUiTela() {
    const dividindo = !!telaTrack;
    // Um lugar so decide a UI da tela dividida, entao e daqui que o aviso pro
    // resto da sede sai tambem - nao de cada caminho que liga ou desliga.
    if (window.Network && Network.dividirTela) Network.dividirTela(dividindo);
    const botao = document.getElementById('btn-tela');
    if (botao) {
      botao.classList.toggle('ativo', dividindo);
      botao.title = dividindo ? 'Parar de dividir a tela' : 'Dividir a tela';
    }
    const videoLocal = document.getElementById('video-local');
    if (videoLocal) {
      videoLocal.srcObject = dividindo ? telaStream : localStream;
      // no proprio video, e nao no quadro: a grade de chamada move este
      // elemento pra dentro dela (ver style.css, `video.mostrando-tela`)
      videoLocal.classList.toggle('mostrando-tela', dividindo);
    }
    const preview = document.getElementById('preview-local');
    if (preview) {
      preview.classList.toggle('sem-video', !dividindo && !temVideo);
      preview.classList.toggle('dividindo-tela', dividindo);
      if (dividindo) preview.classList.remove('oculto');
    }
  }

  // ---- discador: a sede nao ouve nem e ouvida durante a ligacao ----------
  //
  // O status "Em ligacao" barra conversa NOVA (ver ocupado()), mas de proposito
  // nao derruba a que ja esta acontecendo - e e justamente essa que vazaria:
  // o colega do lado ouvindo a ligacao com o cliente, e a voz dele entrando
  // nela. Quem liga pelo computador com o "Vincular ao Celular" fala pelo
  // MESMO microfone e ouve pelo MESMO alto-falante que a sede usa.
  //
  // Entao, enquanto o discador estiver ligando: microfone da sede desligado e
  // o som dos outros mudo. Ao sair, o microfone volta como estava - se a pessoa
  // ja estava muda antes, continua muda.
  function abafarParaLigacao(sim) {
    sim = !!sim;
    if (sim === abafado) return;
    abafado = sim;
    if (sim) micAntesDeAbafar = micAtivo;
    micAtivo = sim ? false : micAntesDeAbafar;
    if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = micAtivo; });
    const btn = document.getElementById('btn-mic');
    if (btn) btn.classList.toggle('desativado', !micAtivo);
    peers.forEach((p) => { if (p.videoEl) p.videoEl.muted = sim; });
  }

  function alternarMic() {
    if (!localStream) return;
    // No meio de uma ligacao do discador o microfone da sede fica preso em
    // desligado: um clique sem querer aqui poria o cliente no ar pro corredor.
    if (abafado) {
      mostrarAviso('Microfone da sede desligado durante a ligacao do discador.');
      return;
    }
    micAtivo = !micAtivo;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micAtivo; });
    document.getElementById('btn-mic').classList.toggle('desativado', !micAtivo);
  }

  function alternarVideo() {
    if (!localStream) return;
    videoAtivo = !videoAtivo;
    localStream.getVideoTracks().forEach((t) => { t.enabled = videoAtivo; });
    document.getElementById('btn-video-toggle').classList.toggle('desativado', !videoAtivo);
  }

  // A tela de entrada ja pediu permissao e abriu a camera/microfone. Guardamos o
  // stream aqui pra nao pedir tudo de novo quando a primeira chamada comecar.
  function usarStreamDaEntrada(streamDaEntrada, prefs) {
    streamPendente = { stream: streamDaEntrada, prefs: prefs || {} };
  }

  function adotarStreamPendente() {
    if (!streamPendente) return;
    const { stream, prefs } = streamPendente;
    streamPendente = null;

    localStream = stream;
    temVideo = stream.getVideoTracks().length > 0;
    cameraAtiva = true;
    micAtivo = prefs.micAtivo !== false;
    if (abafado) {
      micAntesDeAbafar = micAtivo;
      micAtivo = false;
    }
    videoAtivo = temVideo && prefs.videoAtivo !== false;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micAtivo; });
    localStream.getVideoTracks().forEach((t) => { t.enabled = videoAtivo; });
    aplicarUiCamera();
  }

  // O `init` do jogo chega DE NOVO a cada reconexao (servidor reiniciado, rede que
  // caiu e voltou): a pessoa ganha outro id de socket. Sem esta guarda, cada
  // reconexao empilhava mais um ouvinte de sinalizacao e mais um clique em cada
  // botao - o botao de microfone, por exemplo, passava a "desligar e ligar" a cada
  // toque e parecia morto. Na volta so o id muda; o resto ja esta ligado.
  let iniciado = false;

  function init(idJogadorLocal) {
    selfId = idJogadorLocal;
    if (iniciado) return;
    iniciado = true;
    buscarIce();
    setInterval(buscarIce, RENOVAR_ICE_MS);
    Network.on('rtc-signal', tratarSinal);
    adotarStreamPendente();
    document.getElementById('btn-camera').addEventListener('click', alternarCamera);
    document.getElementById('btn-mic').addEventListener('click', alternarMic);
    document.getElementById('btn-video-toggle').addEventListener('click', alternarVideo);

    const btnTela = document.getElementById('btn-tela');
    // Navegador sem `getDisplayMedia` (celular, quase sempre) nao ganha um botao
    // que so daria erro ao ser tocado.
    if (btnTela && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      btnTela.addEventListener('click', alternarTela);
    } else if (btnTela) {
      btnTela.remove();
    }
  }

  function temChamadaAtiva(id) {
    const p = peers.get(id);
    return !!(p && p.pc.connectionState === 'connected');
  }

  // true so quando ja da pra desenhar video de verdade (tem frame decodificado);
  // uma chamada so-audio fica com temChamadaAtiva=true mas isso aqui false.
  function temVideoRemoto(id) {
    const p = peers.get(id);
    // Chamada grande: a camera do outro saiu do ar e o <video> ficaria congelado
    // no ultimo quadro. Mostra a inicial - menos quem esta apresentando a tela.
    if (soVoz && !apresentando(id)) return false;
    return !!(p && p.videoEl && p.videoEl.readyState >= 2 && p.videoEl.videoWidth > 0);
  }

  function apresentando(id) {
    const outro = jogadorDe(id);
    return !!(outro && outro.dividindoTela);
  }

  function getVideoRemoto(id) {
    const p = peers.get(id);
    return p ? p.videoEl : null;
  }

  // Lista de participantes da(s) chamada(s) ativa(s) agora, pra montar o grid
  // de chamada (um grid so, mesmo que a "malha" P2P seja varias conexoes 1-a-1).
  function getPeersConectados() {
    const lista = [];
    peers.forEach((p, id) => {
      if (p.pc.connectionState !== 'connected') return;
      lista.push({
        id,
        stream: p.videoEl ? p.videoEl.srcObject : null,
        temVideo: temVideoRemoto(id),
      });
    });
    return lista;
  }

  // Derruba todas as conexoes. A pagina de visitante chama isto ao voltar de uma
  // queda de rede: o id dele mudou e os membros abrem conexao NOVA com o id novo -
  // uma oferta nova, com outra impressao digital, nao pode ser aplicada por cima
  // da conexao velha. Sem elas, a proximidade refaz cada uma no quadro seguinte.
  function fecharConexoes() {
    peers.forEach((_, id) => fecharPeer(id));
  }

  function getLocalStream() { return localStream; }
  function isCameraAtiva() { return cameraAtiva; }
  // Na chamada grande a propria camera tambem sai da grade: mostrar o proprio
  // video faria a pessoa achar que os outros estao vendo ela.
  function temVideoLocal() { return temVideo && !soVoz; }

  function estaDividindoTela() { return !!telaTrack; }

  // O <video> local, pra TV do mapa poder espelhar a minha propria tela sem
  // passar pelo WebRTC (eu nao sou peer de mim mesmo).
  function videoDaTelaLocal() {
    return telaTrack ? document.getElementById('video-local') : null;
  }

  window.Calls = {
    init, updateProximity, temChamadaAtiva, temVideoRemoto, getVideoRemoto,
    getPeersConectados, getLocalStream, isCameraAtiva, temVideoLocal,
    definirVisitantes, jogadorDe, fecharConexoes,
    usarStreamDaEntrada, alternarTela, estaDividindoTela, videoDaTelaLocal,
    // As duas regras de decisao saem expostas pra `testes/proximidade.js`
    // conseguir exercita-las sem navegador. Mesma ideia do `canvasDoMapa` do
    // game.js: e caro demais so conferir isso a olho, numa chamada de verdade.
    deveFalarCom, deveContinuarCom,
    abafarParaLigacao,
    estaAbafado: () => abafado,
    emChamadaGrande: () => soVoz,
    _ajustarChamadaGrande: ajustarChamadaGrande,
    _peers: peers,
  };
})();
