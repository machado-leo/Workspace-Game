// A página de quem entra numa reunião pelo link (public/reuniao.html). Ver
// docs/plano-reuniao-por-link.md.
//
// Quem chega aqui não é da sede: não tem conta, não tem cookie, não vê o mapa nem
// o chat. Fala com o servidor por um canal só dele (`/reuniao`, ver
// server/visitantes.js), com o token do endereço como única credencial, e o que
// esse canal oferece é curto: dizer o nome, pedir pra entrar, e a sinalização da
// chamada.
//
// O CAMINHO É O DE MEET
//   1. abre o link e vê o título e o horário;
//   2. diz o nome, liga (ou não) câmera e microfone, e pede pra entrar;
//   3. espera um MEMBRO da sede que esteja na chamada deixar entrar;
//   4. entra na chamada.
//
// A CHAMADA É A DA SEDE
// O motor de chamada (calls.js) e a grade (callgrid.js) são os mesmos do
// escritório - nada de um segundo WebRTC pra manter. Eles pedem duas coisas ao
// resto da página, `Network` e `Game`; aqui as duas são fininhas e falam com o
// canal da reunião, em vez do mapa.
(function () {
  const $ = (id) => document.getElementById(id);

  // /r/<token>
  const token = (location.pathname.match(/^\/r\/([^/]+)/) || [])[1] || '';
  const CHAVE = 'reuniao-visita';
  const ATUALIZAR_INFO_MS = 20 * 1000;

  const TELAS = ['tela-carregando', 'tela-aviso', 'tela-visita', 'tela-reuniao'];

  let socket = null;
  let info = null;              // { titulo, inicio, fim, estado, sede, sigla }
  // carregando -> pronto -> esperando -> dentro (e fim, de onde não se volta)
  let fase = 'carregando';
  let nome = '';
  let passe = null;             // o "já foi admitido": reconectar sem pedir de novo
  let vid = null;
  let jaPediu = false;          // pediu entrada nesta aba: repete o pedido ao reconectar
  let chamadaIniciada = false;
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  let relogio = null;
  let relogioInfo = null;

  const jogadores = new Map();  // id -> o que o calls.js e o callgrid.js esperam de um jogador
  const ouvintes = {};

  // ------------------------------------------------- Network e Game da página

  window.Network = {
    on(evento, cb) { (ouvintes[evento] = ouvintes[evento] || []).push(cb); },
    sendRtcSignal(para, sinal) {
      if (socket && socket.connected) socket.emit('rtc-signal', { to: para, signal: sinal });
    },
    // Avisa quem está na reunião que comecei (ou parei) de dividir a tela
    dividirTela(ligado) {
      if (socket && socket.connected) socket.emit('tela', { ligado: !!ligado });
    },
    // Quem entra pelo link não tem cookie, então o calls.js não pode buscar
    // /api/ice: a lista vem junto com a admissão.
    pedirIce() { return Promise.resolve({ iceServers }); },
  };
  window.Game = {
    getPlayers: () => jogadores,
    getSelfId: () => vid,
  };

  function emitir(evento, dados) {
    (ouvintes[evento] || []).forEach((cb) => cb(dados));
  }

  // ------------------------------------------------------------------ telas

  function mostrar(id) {
    TELAS.forEach((t) => $(t).classList.toggle('oculto', t !== id));
  }

  function textoDoAviso(texto) {
    return String(texto || '').replace('{sigla}', (info && info.sigla) || 'sede');
  }

  // Uma tela só pros casos em que não há mais o que fazer aqui (ou é preciso
  // esperar sem formulário): o texto de cada um vem da tabela abaixo.
  function aviso(titulo, texto, botao) {
    mostrar('tela-aviso');
    $('aviso-titulo').textContent = titulo;
    $('aviso-texto').textContent = textoDoAviso(texto);
    const b = $('aviso-botao');
    b.classList.toggle('oculto', !botao);
    if (botao) {
      b.textContent = botao.texto;
      b.onclick = botao.acao;
    }
  }

  const RECARREGAR = { texto: 'Abrir de novo', acao: () => location.reload() };

  const MOTIVOS = {
    'link-invalido': ['Esse link não vale mais', 'Ele pode ter sido trocado, ou a reunião foi desmarcada. Peça o link novo para quem te convidou.'],
    'muitas-tentativas': ['Muitas tentativas', 'Espere alguns minutos e abra o link de novo.', RECARREGAR],
    negado: ['Sua entrada não foi liberada', 'Alguém da {sigla} recusou o pedido.', RECARREGAR],
    removido: ['Você foi removido da reunião', 'Alguém da {sigla} tirou você da chamada.'],
    encerrada: ['Essa reunião terminou', 'O link não abre mais. Se ainda precisa falar com a {sigla}, peça um novo.'],
    desmarcada: ['Essa reunião foi desmarcada', 'Peça o link da nova data para quem te convidou.'],
    cheia: ['A reunião está cheia', 'Tente de novo em alguns minutos.', RECARREGAR],
    'link-mudou': ['O link mudou', 'Peça o link novo para quem te convidou.'],
    saiu: ['Você saiu da reunião', 'Pode fechar esta página.', RECARREGAR],
    antes: ['A reunião ainda não abriu', 'Volte mais perto do horário.', RECARREGAR],
  };

  // Acabou. Solta câmera, microfone e conexões, e nunca mais volta ao formulário.
  function fim(motivo) {
    fase = 'fim';
    pararRelogios();
    pararMidia();
    if (window.Calls) {
      if (Calls.estaDividindoTela && Calls.estaDividindoTela()) Calls.alternarTela();
      const local = Calls.getLocalStream && Calls.getLocalStream();
      if (local) local.getTracks().forEach((t) => t.stop());
      if (Calls.fecharConexoes) Calls.fecharConexoes();
    }
    esquecer();
    if (socket) socket.close();
    const m = MOTIVOS[motivo] || MOTIVOS.saiu;
    aviso(m[0], m[1], m[2] || null);
  }

  function pararRelogios() {
    clearInterval(relogio);
    clearInterval(relogioInfo);
  }

  // ------------------------------------------------- o que fica na aba (F5)
  // sessionStorage: some com a aba, e nunca vai pra outro computador. Guarda o
  // nome (pra não digitar de novo) e o passe (pra não pedir de novo depois de uma
  // queda de rede ou de um F5).

  function lembrar() {
    try { sessionStorage.setItem(CHAVE, JSON.stringify({ token, nome, passe })); } catch (e) { /* sem storage: digita de novo */ }
  }

  function lembrado() {
    try {
      const d = JSON.parse(sessionStorage.getItem(CHAVE));
      return d && d.token === token ? d : null;
    } catch (e) { return null; }
  }

  function esquecer() {
    try { sessionStorage.removeItem(CHAVE); } catch (e) { /* segue */ }
  }

  // ------------------------------------------------- câmera e microfone
  // O mesmo desenho da tela de entrada da sede (js/entrada.js): começa tudo
  // desligado, e a permissão do navegador só é pedida no clique.

  let stream = null;
  let micLigado = false;
  let cameraLigada = false;

  function avisoDeMidia(texto) {
    const el = $('visita-aviso');
    el.textContent = texto || '';
    el.classList.toggle('oculto', !texto);
  }

  function pintarBotoes() {
    $('visita-btn-mic').classList.toggle('desligado', !micLigado);
    $('visita-btn-camera').classList.toggle('desligado', !cameraLigada);
    const temImagem = cameraLigada && stream && stream.getVideoTracks().length > 0;
    $('visita-video').classList.toggle('oculto', !temImagem);
    $('visita-vazio').classList.toggle('oculto', temImagem);
    $('visita-vazio').textContent = cameraLigada
      ? 'Câmera indisponível — você entra só com áudio'
      : 'Sua câmera está desligada';
  }

  async function garantirStream(comVideo) {
    if (stream) {
      const temVideo = stream.getVideoTracks().length > 0;
      if (!comVideo || temVideo) return stream;
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('este navegador não liberou câmera e microfone nesta conexão');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: comVideo, audio: true });
      avisoDeMidia('');
    } catch (e) {
      if (!comVideo) throw e;
      // Câmera ocupada ou sem driver é comum (Teams aberto...): cai pro áudio.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      avisoDeMidia('Câmera indisponível (' + e.message + '). Dá para entrar só com áudio.');
    }
    $('visita-video').srcObject = stream;
    return stream;
  }

  function pararMidia() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $('visita-video').srcObject = null;
  }

  async function alternarCamera() {
    if (cameraLigada) {
      cameraLigada = false;
      if (stream) stream.getVideoTracks().forEach((t) => { t.enabled = false; });
      if (!micLigado) pararMidia();
      pintarBotoes();
      return;
    }
    try {
      await garantirStream(true);
      cameraLigada = true;
      stream.getVideoTracks().forEach((t) => { t.enabled = true; });
      stream.getAudioTracks().forEach((t) => { t.enabled = micLigado; });
    } catch (e) {
      avisoDeMidia('Não consegui acessar câmera nem microfone: ' + e.message);
    }
    pintarBotoes();
  }

  async function alternarMic() {
    if (micLigado) {
      micLigado = false;
      if (stream) stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      if (!cameraLigada) pararMidia();
      pintarBotoes();
      return;
    }
    try {
      await garantirStream(cameraLigada);
      micLigado = true;
      stream.getAudioTracks().forEach((t) => { t.enabled = true; });
      stream.getVideoTracks().forEach((t) => { t.enabled = cameraLigada; });
    } catch (e) {
      avisoDeMidia('Não consegui acessar o microfone: ' + e.message);
    }
    pintarBotoes();
  }

  // ------------------------------------------------------- antes de entrar

  function quando(i) {
    const inicio = new Date(i.inicio);
    const fimDaReuniao = new Date(i.fim);
    const hora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dia = inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    return dia + ' · ' + hora(inicio) + ' às ' + hora(fimDaReuniao);
  }

  function erroDoFormulario(texto) {
    const el = $('visita-erro');
    el.textContent = texto || '';
    el.classList.toggle('oculto', !texto);
  }

  function pintarInfo() {
    if (!info) return;
    $('visita-titulo').textContent = info.titulo;
    $('visita-quando').textContent = quando(info);
    document.title = info.titulo + ' - ' + info.sede;
    const aberta = info.estado === 'aberta';
    if (fase === 'pronto') {
      $('visita-enviar').disabled = !aberta;
      $('visita-ajuda').textContent = aberta
        ? 'Alguém da ' + info.sigla + ' vai precisar deixar você entrar.'
        : 'A reunião abre meia hora antes do horário. Deixe esta página aberta: o botão libera sozinho.';
    }
  }

  // O formulário volta ao que era antes do pedido
  function voltarAoFormulario(erro) {
    fase = 'pronto';
    jaPediu = false;
    $('visita-nome').disabled = false;
    $('visita-enviar').classList.remove('oculto');
    $('visita-cancelar').classList.add('oculto');
    erroDoFormulario(erro);
    pintarInfo();
  }

  function pintarEspera(semMembro) {
    $('visita-ajuda').textContent = semMembro
      ? 'Ainda não há ninguém da ' + info.sigla + ' na reunião. Você entra assim que alguém abrir a chamada.'
      : 'Aguardando alguém da ' + info.sigla + ' deixar você entrar…';
  }

  function pedirEntrada(ev) {
    if (ev) ev.preventDefault();
    if (fase !== 'pronto' || !info || info.estado !== 'aberta') return;
    nome = $('visita-nome').value.replace(/\s+/g, ' ').trim();
    if (!nome) {
      erroDoFormulario('Diga seu nome para os outros saberem quem é.');
      $('visita-nome').focus();
      return;
    }
    erroDoFormulario('');
    fase = 'esperando';
    jaPediu = true;
    lembrar();
    $('visita-nome').disabled = true;
    $('visita-enviar').classList.add('oculto');
    $('visita-cancelar').classList.remove('oculto');
    pintarEspera(false);
    socket.emit('pedir-entrada', { nome, passe });
  }

  function cancelarPedido() {
    if (socket) socket.emit('cancelar');
    voltarAoFormulario('');
  }

  // ------------------------------------------------------ dentro da reunião

  // O que chega do servidor vira "jogador" no formato do calls.js: só o que ele
  // e a grade leem (nome, cor do quadro, se divide a tela e em que chamada esta).
  function aplicarParticipantes(lista) {
    jogadores.clear();
    (lista || []).forEach((p) => {
      jogadores.set(p.id, {
        id: p.id,
        // "(visitante)" ao lado do nome de quem é de fora: ninguém se passa por
        // membro só digitando o nome dele
        name: p.visitante && p.id !== vid ? p.nome + ' (visitante)' : p.nome,
        appearance: { skin: p.cor },
        dividindoTela: !!p.dividindoTela,
        isAdmin: false,
        chamada: { id: 'reuniao', titulo: info ? info.titulo : '' },
      });
    });
    const outros = Math.max(0, jogadores.size - 1);
    $('barra-chamada-gente').textContent = outros === 0
      ? 'só você por enquanto'
      : outros === 1 ? 'você e mais 1' : 'você e mais ' + outros;
  }

  function entrarNaReuniao(dados) {
    fase = 'dentro';
    vid = dados.vid;
    passe = dados.passe;
    nome = nome || $('visita-nome').value.trim();
    lembrar();
    if (Array.isArray(dados.iceServers) && dados.iceServers.length) iceServers = dados.iceServers;
    aplicarParticipantes(dados.participantes);
    $('barra-chamada-titulo').textContent = dados.titulo || (info && info.titulo) || 'Reunião';
    mostrar('tela-reuniao');

    if (!chamadaIniciada) {
      chamadaIniciada = true;
      // A câmera e o microfone que já estavam abertos na tela anterior passam
      // adiante: sem isto o navegador pediria permissão de novo.
      if (stream && (micLigado || cameraLigada)) {
        Calls.usarStreamDaEntrada(stream, { micAtivo: micLigado, videoAtivo: cameraLigada });
        stream = null;
      } else {
        pararMidia();
      }
      Calls.init(vid);
      CallGrid.init({ semCamera: true });
      // O jogo chama isto a cada quadro; aqui, umas vezes por segundo bastam
      relogio = setInterval(() => {
        if (fase === 'dentro') Calls.updateProximity(jogadores);
      }, 400);
    } else {
      // Voltou (queda de rede, ou a sede ficou sem ninguém e depois voltou): o id
      // pode ter mudado, e conexão antiga não serve pra oferta nova.
      Calls.init(vid);
      Calls.fecharConexoes();
    }
  }

  // A sede ficou sem ninguém na chamada: o servidor mandou o visitante de volta
  // pra espera. Volta sozinho quando alguém entrar.
  function voltarParaEspera() {
    fase = 'esperando';
    jogadores.clear();
    Calls.fecharConexoes();
    aviso('Aguardando a ' + (info ? info.sigla : 'sede'),
      'Não há ninguém da ' + (info ? info.sigla : 'sede') + ' na reunião agora. Você volta para a chamada assim que alguém entrar.',
      { texto: 'Sair da reunião', acao: sair });
  }

  function sair() {
    if (socket) socket.emit('sair');
    fim('saiu');
  }

  function avisoDeRede(visivel) {
    $('aviso-rede').classList.toggle('oculto', !visivel);
  }

  // ----------------------------------------------------------------- socket

  function conectar() {
    socket = io('/reuniao', {
      auth: { token },
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });

    socket.on('connect', () => {
      avisoDeRede(false);
      // Reconexão: o servidor não lembra de mim, então o pedido sai de novo - e o
      // passe faz ele valer sem incomodar quem já tinha dito sim.
      if (jaPediu && fase !== 'fim') socket.emit('pedir-entrada', { nome, passe });
    });

    socket.on('disconnect', () => {
      if (fase === 'dentro' || fase === 'esperando') avisoDeRede(true);
    });

    socket.on('connect_error', (erro) => {
      const m = erro && erro.message;
      // Link errado nao adianta tentar de novo; o resto (rede) o socket.io tenta sozinho
      if (m === 'link-invalido' || m === 'muitas-tentativas') {
        fim(m);
        return;
      }
      if (fase === 'dentro' || fase === 'esperando') avisoDeRede(true);
    });

    socket.on('info', (dados) => {
      info = dados;
      if (fase === 'carregando') {
        fase = 'pronto';
        const antes = lembrado();
        if (antes) {
          $('visita-nome').value = antes.nome || '';
          passe = antes.passe || null;
        }
        mostrar('tela-visita');
        pintarBotoes();
      }
      if (info.estado === 'encerrada' && fase !== 'dentro') { fim('encerrada'); return; }
      pintarInfo();
    });

    socket.on('estado', (dados) => {
      if (fase === 'dentro') { voltarParaEspera(); return; }
      if (fase === 'esperando') pintarEspera(!!dados.semMembro);
    });

    socket.on('admitido', (dados) => {
      if (fase === 'fim') return;
      entrarNaReuniao(dados);
    });

    socket.on('participantes', (lista) => {
      if (fase === 'dentro') aplicarParticipantes(lista);
    });

    socket.on('nome-invalido', () => {
      voltarAoFormulario('Diga seu nome para os outros saberem quem é.');
    });

    socket.on('recusado-agora', () => {
      voltarAoFormulario('Espere alguns segundos antes de pedir de novo.');
    });

    socket.on('recusado', (dados) => fim((dados && dados.motivo) || 'negado'));

    socket.on('rtc-signal', (dados) => emitir('rtc-signal', dados));
  }

  // -------------------------------------------------------------------- init

  function init() {
    if (!token) {
      // Aberta direto em /reuniao.html, sem link
      fim('link-invalido');
      return;
    }
    $('visita-btn-mic').addEventListener('click', alternarMic);
    $('visita-btn-camera').addEventListener('click', alternarCamera);
    $('form-visita').addEventListener('submit', pedirEntrada);
    $('visita-cancelar').addEventListener('click', cancelarPedido);
    $('barra-chamada-sair').addEventListener('click', sair);

    // Enquanto a reunião não abriu (ou não terminou), pergunta de novo de tempos
    // em tempos: o botão "Pedir para entrar" libera sozinho na hora certa.
    relogioInfo = setInterval(() => {
      if (socket && socket.connected && (fase === 'pronto' || fase === 'esperando')) socket.emit('info-pedir');
    }, ATUALIZAR_INFO_MS);

    conectar();
  }

  init();
})();
