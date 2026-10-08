// Visitantes de reuniao: quem entra pelo link `/r/<token>` (ver
// server/link-reuniao.js) e fica SO naquela chamada. Ver
// docs/plano-reuniao-por-link.md.
//
// O QUE FAZ ISTO SER SEGURO E SIMPLES: O VISITANTE NAO TEM CONTA NEM COOKIE
// A versao anterior criava uma conta de visitante e deixava a pessoa entrar na
// sede inteira - e nao ha como fechar uma sede por dentro: cada rota, cada evento
// do socket e cada `io.emit` teria que lembrar de perguntar "e visitante?". O
// teste mostrou o resultado: o visitante lia os tres canais do chat e entrava na
// chamada de qualquer reuniao.
//
// Aqui o caminho e o contrario. O visitante conecta num CANAL SEPARADO do
// socket.io (`/reuniao`), so com o token. Tudo que a sede transmite - posicoes,
// chat, agenda, mapa - sai por `io.emit` no canal principal e NUNCA chega la; e
// como ele nao tem cookie de sessao, nenhuma rota nem evento da sede o reconhece.
// A lista do que ele pode fazer e a deste arquivo, e e curta:
//
//   pedir-entrada  diz o nome e pede pra entrar
//   cancelar       desiste do pedido
//   rtc-signal     sinalizacao da chamada (so com quem esta na mesma reuniao)
//   tela           avisa que comecou/parou de dividir a tela
//   sair           sai da reuniao
//
// COMO NO MEET: O VISITANTE PEDE, UM MEMBRO DEIXA
// Um link solto num grupo de WhatsApp nao pode ser uma porta aberta. Quem chega
// fica numa sala de espera; so entra quando um MEMBRO QUE ESTA NA CHAMADA da
// reuniao clica em "Admitir". Sem ninguem da sede na chamada, o pedido espera - e
// aparece pra quem entrar depois (e, na hora, pra quem marcou a reuniao).
//
// Nada aqui e guardado em disco: visitante e coisa do momento.
const crypto = require('crypto');
const linkReuniao = require('./link-reuniao');

const NAMESPACE = '/reuniao';
const MAX_NOME = 18;              // o mesmo do nome de membro: cabe no mesmo quadro
const MAX_ESPERANDO = 10;         // pedidos parados por reuniao
const MAX_DENTRO = 10;            // visitantes por reuniao (a chamada e malha P2P: pesa)
const MAX_POR_IP = 12;            // conexoes de visitante abertas por IP
const MAX_FALHAS_POR_IP = 20;     // links errados por IP...
const JANELA_FALHAS_MS = 15 * 60 * 1000;   // ...a cada 15 minutos
const ESPERA_APOS_RECUSA_MS = 30 * 1000;   // quem foi recusado/removido espera pra pedir de novo
// Reconectar depois de uma queda de rede sem pedir de novo. Tambem existe pro teste.
const PASSE_VALE_MS = Number(process.env.VISITANTES_PASSE_MS) || 10 * 60 * 1000;
// Ultimo membro saiu: quanto esperar antes de mandar os visitantes de volta pra
// espera. Quem cai da rede e volta em segundos nao pode perder o lugar. A variavel
// existe pro teste (testes/reuniao-link.js) nao ficar um minuto parado.
const SEM_MEMBRO_ESPERA_MS = Number(process.env.VISITANTES_SEM_MEMBRO_MS) || 60 * 1000;
const VARREDURA_MS = 30 * 1000;
const SINAL_MAX_BYTES = 64 * 1024;         // um SDP com muitos candidatos tem ~10 KB
const SINAIS_POR_JANELA = 400;             // sinalizacao normal e uma rajada de dezenas
const JANELA_SINAIS_MS = 10 * 1000;

// Um quadro colorido pra quem nao liga a camera, escolhido pelo id: o membro ve a
// mesma cor toda vez que a pessoa reconecta no mesmo tab, e cores vizinhas nao
// se confundem.
const CORES = ['#5b8def', '#e0607e', '#3aa675', '#d99a2b', '#8a63d2', '#2f9db5', '#c9603a', '#6f7d8c'];

function corDe(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CORES[h % CORES.length];
}

// Nome que vai aparecer na tela dos outros. Tira controle e os caracteres
// invisiveis e de direcao (U+202E inverte o texto na tela: "Diana" viraria outra
// coisa) e junta espacos. A tela usa textContent, entao HTML nao executa - isto
// e pro nome nao enganar quem le.
function limparNome(bruto) {
  return String(bruto === undefined || bruto === null ? '' : bruto)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOME);
}

function idDaChamada(reuniaoId) {
  return 'reuniao:' + reuniaoId;
}

// O id da reuniao de uma chamada `reuniao:N`, ou null (canal e outras chamadas
// nao tem visitante).
function reuniaoDaChamada(chamada) {
  if (!chamada || typeof chamada.id !== 'string' || !chamada.id.startsWith('reuniao:')) return null;
  const n = Number(chamada.id.slice('reuniao:'.length));
  return Number.isInteger(n) ? n : null;
}

// O IP de quem chegou. Atras de UM proxy (Render), o ultimo item de
// X-Forwarded-For e o que o proxy viu; os anteriores o cliente escreve.
function ipDe(socket) {
  const xff = String(socket.handshake.headers['x-forwarded-for'] || '');
  const partes = xff.split(',').map((s) => s.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : socket.handshake.address || 'desconhecido';
}

function iniciar({ io, players, reunioes, turn, aoMudarChamadas, sede }) {
  const nsp = io.of(NAMESPACE);
  const visitantes = new Map();      // vid -> visitante
  const passes = new Map();          // passe -> { reuniaoId, criadaEm, nome, venceEm }
  const falhasPorIp = new Map();     // ip -> { qtd, ate }
  const abertosPorIp = new Map();    // ip -> quantos sockets abertos
  const friosPorIp = new Map();      // ip -> ate quando nao pode pedir de novo
  const semMembro = new Map();       // reuniaoId -> timer

  // ------------------------------------------------------------ consultas

  function daReuniao(reuniaoId, estado) {
    const lista = [];
    visitantes.forEach((v) => {
      if (v.reuniaoId === reuniaoId && (!estado || v.estado === estado)) lista.push(v);
    });
    return lista;
  }

  // Os membros que estao na chamada dessa reuniao: [{ id (socket), player }].
  function membrosNaChamada(reuniaoId) {
    const lista = [];
    players.forEach((p, socketId) => {
      if (reuniaoDaChamada(p.chamada) === reuniaoId) lista.push({ id: socketId, player: p });
    });
    return lista;
  }

  function faltaMembro(reuniaoId) {
    return membrosNaChamada(reuniaoId).length === 0;
  }

  function gentePorChamada() {
    const mapa = {};
    visitantes.forEach((v) => {
      if (v.estado !== 'dentro') return;
      const id = idDaChamada(v.reuniaoId);
      (mapa[id] = mapa[id] || []).push(v.nome + ' (visitante)');
    });
    return mapa;
  }

  // ---------------------------------------------------- pro membro (painel)

  // Quem recebe o estado da reuniao: os que estao na chamada e quem marcou a
  // reuniao (esse e avisado mesmo fora dela: e ele que espera o convidado).
  function destinatarios(reuniaoId) {
    const r = reunioes.obter(reuniaoId);
    const ids = new Set();
    players.forEach((p, socketId) => {
      if (reuniaoDaChamada(p.chamada) === reuniaoId || (r && p.uid === r.criadaPorUid)) ids.add(socketId);
    });
    return ids;
  }

  function fotografia(reuniaoId) {
    const r = reunioes.obter(reuniaoId);
    return {
      reuniaoId,
      chamada: idDaChamada(reuniaoId),
      titulo: r ? r.titulo : '',
      esperando: daReuniao(reuniaoId, 'esperando').map((v) => ({ id: v.vid, nome: v.nome })),
      dentro: daReuniao(reuniaoId, 'dentro').map((v) => ({
        id: v.vid, nome: v.nome, cor: corDe(v.vid), dividindoTela: v.dividindoTela,
      })),
    };
  }

  function avisarMembros(reuniaoId) {
    const foto = fotografia(reuniaoId);
    destinatarios(reuniaoId).forEach((socketId) => io.to(socketId).emit('visitantes-mudou', foto));
  }

  // ------------------------------------------------- pro visitante (roster)

  // Quem esta na reuniao, do ponto de vista de quem esta DENTRO dela. Membro sai
  // so com o que a tela precisa (nome, cor do quadro e se divide a tela): nada
  // de e-mail, uid nem se e da diretoria.
  function participantes(reuniaoId) {
    const lista = [];
    membrosNaChamada(reuniaoId).forEach(({ id, player }) => {
      lista.push({
        id, nome: player.name, visitante: false,
        cor: (player.appearance && player.appearance.skin) || '#3a4a52',
        dividindoTela: !!player.dividindoTela,
      });
    });
    daReuniao(reuniaoId, 'dentro').forEach((v) => {
      lista.push({ id: v.vid, nome: v.nome, visitante: true, cor: corDe(v.vid), dividindoTela: v.dividindoTela });
    });
    return lista;
  }

  function enviarParticipantes(reuniaoId) {
    const lista = participantes(reuniaoId);
    daReuniao(reuniaoId, 'dentro').forEach((v) => v.socket.emit('participantes', lista));
  }

  function avisarEspera(reuniaoId) {
    const vazio = faltaMembro(reuniaoId);
    daReuniao(reuniaoId, 'esperando').forEach((v) => v.socket.emit('estado', { estado: 'esperando', semMembro: vazio }));
  }

  // O que mudou na reuniao, dito a todo mundo que precisa saber.
  function espalhar(reuniaoId) {
    enviarParticipantes(reuniaoId);
    avisarEspera(reuniaoId);
    avisarMembros(reuniaoId);
    aoMudarChamadas();
  }

  // ----------------------------------------------------------- transicoes

  function recusar(v, motivo) {
    const estava = v.estado;
    v.estado = 'fora';
    v.socket.emit('recusado', { motivo });
    v.socket.disconnect(true);
    if (estava === 'dentro' || estava === 'esperando') espalhar(v.reuniaoId);
  }

  function esfriar(v) {
    friosPorIp.set(v.ip, Date.now() + ESPERA_APOS_RECUSA_MS);
    if (v.passe) passes.delete(v.passe);
  }

  // Nunca deixa uma falha aqui virar "rejeicao nao tratada": no Node isso derruba o
  // servidor inteiro - e a sede toda cairia por causa de um visitante.
  function admitir(v) {
    return admitirDeVerdade(v).catch((e) => console.error('[visitantes] nao consegui admitir: ' + e.message));
  }

  async function admitirDeVerdade(v) {
    if (v.estado !== 'esperando') return;
    const r = reunioes.obter(v.reuniaoId);
    if (!r) return recusar(v, 'desmarcada');
    if (daReuniao(v.reuniaoId, 'dentro').length >= MAX_DENTRO) return recusar(v, 'cheia');

    v.estado = 'dentro';
    v.jaAdmitido = true;
    const passe = crypto.randomBytes(16).toString('hex');
    passes.set(passe, {
      reuniaoId: v.reuniaoId, criadaEm: r.criadaEm, nome: v.nome, venceEm: Date.now() + PASSE_VALE_MS,
    });
    if (v.passe) passes.delete(v.passe);
    v.passe = passe;

    // Os servidores ICE (STUN e o TURN da Cloudflare, se ligado) vao junto: o
    // visitante nao tem cookie, entao nao pode buscar em /api/ice. Sem TURN a
    // chamada dele nao fecha em rede de faculdade ou empresa - e e exatamente onde
    // o cliente de uma entrevista costuma estar.
    let iceServers;
    try { iceServers = (await turn.obter()).iceServers; } catch (e) { iceServers = undefined; }
    // Saiu (ou foi removido) enquanto a credencial vinha
    if (v.estado !== 'dentro') return;

    v.socket.emit('admitido', {
      vid: v.vid,
      passe,
      iceServers,
      titulo: r.titulo,
      participantes: participantes(v.reuniaoId),
    });
    espalhar(v.reuniaoId);
  }

  // O ultimo membro saiu da chamada: os visitantes nao ficam la sozinhos. Com
  // eles dois na sala e ninguem da sede, viraria uma sala de reuniao gratis de
  // gente de fora. Voltam pra espera, e entram sem pedir de novo quando um membro
  // voltar.
  function agendarSemMembro(reuniaoId) {
    if (semMembro.has(reuniaoId)) return;
    if (!daReuniao(reuniaoId, 'dentro').length) return;
    const t = setTimeout(() => {
      semMembro.delete(reuniaoId);
      if (!faltaMembro(reuniaoId)) return;
      // `espalhar` avisa quem voltou pra espera ("ninguem da sede na reuniao") e a
      // lista dos membros
      daReuniao(reuniaoId, 'dentro').forEach((v) => { v.estado = 'esperando'; });
      espalhar(reuniaoId);
    }, SEM_MEMBRO_ESPERA_MS);
    if (t.unref) t.unref();
    semMembro.set(reuniaoId, t);
  }

  function cancelarSemMembro(reuniaoId) {
    const t = semMembro.get(reuniaoId);
    if (!t) return;
    clearTimeout(t);
    semMembro.delete(reuniaoId);
  }

  // ---------------------------------------------------------------- limites

  function contarFalha(ip) {
    const agora = Date.now();
    const f = falhasPorIp.get(ip);
    if (!f || f.ate < agora) falhasPorIp.set(ip, { qtd: 1, ate: agora + JANELA_FALHAS_MS });
    else f.qtd += 1;
  }

  function barradoPorFalhas(ip) {
    const f = falhasPorIp.get(ip);
    return !!f && f.ate > Date.now() && f.qtd >= MAX_FALHAS_POR_IP;
  }

  // Sinalizacao demais de um visitante so serve pra encher a tela de um membro
  // com lixo: a de verdade e uma rajada curta no comeco e o resto e calmo.
  function sinalPermitido(v) {
    const agora = Date.now();
    if (agora > v.janelaSinais.ate) v.janelaSinais = { qtd: 0, ate: agora + JANELA_SINAIS_MS };
    v.janelaSinais.qtd += 1;
    return v.janelaSinais.qtd <= SINAIS_POR_JANELA;
  }

  function tamanhoDoSinal(signal) {
    try { return JSON.stringify(signal).length; } catch (e) { return Infinity; }
  }

  // ------------------------------------------------------------- o canal

  nsp.use((socket, next) => {
    const ip = ipDe(socket);
    if (barradoPorFalhas(ip)) return next(new Error('muitas-tentativas'));

    const auth = socket.handshake.auth || {};
    const r = reunioes.porLink(linkReuniao.ler(auth.token));
    if (!r) {
      contarFalha(ip);
      return next(new Error('link-invalido'));
    }
    if ((abertosPorIp.get(ip) || 0) >= MAX_POR_IP) return next(new Error('muitas-tentativas'));

    socket.data.reuniaoId = r.id;
    socket.data.ip = ip;
    next();
  });

  nsp.on('connection', (socket) => {
    const ip = socket.data.ip;
    const vid = 'v-' + socket.id;
    const v = {
      vid, socket, ip,
      reuniaoId: socket.data.reuniaoId,
      nome: '',
      estado: 'ligado',            // ligado -> esperando -> dentro (ou fora)
      dividindoTela: false,
      jaAdmitido: false,
      passe: null,
      janelaSinais: { qtd: 0, ate: 0 },
    };
    visitantes.set(vid, v);
    abertosPorIp.set(ip, (abertosPorIp.get(ip) || 0) + 1);

    function informar() {
      const r = reunioes.obter(v.reuniaoId);
      if (!r) return recusar(v, 'desmarcada');
      socket.emit('info', {
        titulo: r.titulo,
        inicio: r.inicio,
        fim: r.fim,
        estado: reunioes.estadoDoLink(r),
        sede: sede.nome,
        sigla: sede.sigla,
      });
    }
    informar();

    // A pagina pergunta de novo de tempos em tempos: e assim que o botao "Pedir
    // para entrar" libera sozinho quando a reuniao abre.
    socket.on('info-pedir', () => { if (v.estado !== 'fora') informar(); });

    socket.on('pedir-entrada', (dados) => {
      if (v.estado !== 'ligado') return;
      const r = reunioes.obter(v.reuniaoId);
      if (!r) return recusar(v, 'desmarcada');

      const janela = reunioes.estadoDoLink(r);
      if (janela !== 'aberta') return recusar(v, janela);

      const nome = limparNome(dados && dados.nome);
      if (!nome) return socket.emit('nome-invalido');

      if ((friosPorIp.get(ip) || 0) > Date.now()) return socket.emit('recusado-agora', { motivo: 'espere' });
      if (daReuniao(v.reuniaoId, 'esperando').length >= MAX_ESPERANDO) return recusar(v, 'cheia');

      v.nome = nome;
      v.estado = 'esperando';

      // Quem ja foi admitido nessa reuniao e so caiu da rede: o passe vale
      // por uns minutos e evita pedir de novo (e incomodar quem ja disse sim).
      const antigo = dados && typeof dados.passe === 'string' ? passes.get(dados.passe) : null;
      if (antigo && antigo.reuniaoId === v.reuniaoId && antigo.criadaEm === r.criadaEm && antigo.venceEm > Date.now()) {
        v.jaAdmitido = true;
        v.passe = dados.passe;
      }

      if (v.jaAdmitido && !faltaMembro(v.reuniaoId)) return admitir(v);

      socket.emit('estado', { estado: 'esperando', semMembro: faltaMembro(v.reuniaoId) });
      avisarMembros(v.reuniaoId);
    });

    socket.on('cancelar', () => {
      if (v.estado !== 'esperando') return;
      v.estado = 'ligado';
      avisarMembros(v.reuniaoId);
    });

    socket.on('tela', (dados) => {
      if (v.estado !== 'dentro') return;
      const ligado = !!(dados && dados.ligado);
      if (v.dividindoTela === ligado) return;
      v.dividindoTela = ligado;
      enviarParticipantes(v.reuniaoId);
      avisarMembros(v.reuniaoId);
    });

    // Sinalizacao WebRTC: o visitante so fala com quem esta na MESMA reuniao que
    // ele - membro na chamada dela, ou outro visitante ja admitido nela.
    socket.on('rtc-signal', (dados) => {
      if (v.estado !== 'dentro' || !dados || typeof dados.to !== 'string') return;
      if (dados.to === v.vid) return;
      if (!sinalPermitido(v)) return;
      if (tamanhoDoSinal(dados.signal) > SINAL_MAX_BYTES) return;

      const alvoVisitante = visitantes.get(dados.to);
      if (alvoVisitante) {
        if (alvoVisitante.estado !== 'dentro' || alvoVisitante.reuniaoId !== v.reuniaoId) return;
        alvoVisitante.socket.emit('rtc-signal', { from: v.vid, signal: dados.signal });
        return;
      }
      const membro = players.get(dados.to);
      if (!membro || reuniaoDaChamada(membro.chamada) !== v.reuniaoId) return;
      io.to(dados.to).emit('rtc-signal', { from: v.vid, signal: dados.signal });
    });

    socket.on('sair', () => {
      if (v.estado === 'fora') return;
      const estava = v.estado;
      v.estado = 'fora';
      if (v.passe) passes.delete(v.passe);
      socket.disconnect(true);
      if (estava === 'dentro' || estava === 'esperando') espalhar(v.reuniaoId);
    });

    socket.on('disconnect', () => {
      const estava = v.estado;
      v.estado = 'fora';
      visitantes.delete(vid);
      const n = (abertosPorIp.get(ip) || 1) - 1;
      if (n <= 0) abertosPorIp.delete(ip); else abertosPorIp.set(ip, n);
      if (estava === 'dentro' || estava === 'esperando') espalhar(v.reuniaoId);
    });
  });

  // ------------------------------------------------ o que os MEMBROS fazem

  // Um membro decide o pedido de um visitante. So vale se ele esta na chamada da
  // reuniao: quem decide quem entra e quem esta la dentro.
  function decidir(player, dados) {
    if (!player || !dados) return;
    const v = visitantes.get(String(dados.id || ''));
    if (!v || v.estado !== 'esperando') return;
    if (reuniaoDaChamada(player.chamada) !== v.reuniaoId) return;
    if (dados.admitir) return admitir(v);
    esfriar(v);
    recusar(v, 'negado');
  }

  function remover(player, dados) {
    if (!player || !dados) return;
    const v = visitantes.get(String(dados.id || ''));
    if (!v || v.estado !== 'dentro') return;
    if (reuniaoDaChamada(player.chamada) !== v.reuniaoId) return;
    esfriar(v);
    recusar(v, 'removido');
  }

  // Sinalizacao de um membro pra um visitante (o membro manda `to: 'v-...'`).
  function doMembro(player, dados) {
    if (!player || !dados) return;
    const v = visitantes.get(dados.to);
    if (!v || v.estado !== 'dentro') return;
    if (reuniaoDaChamada(player.chamada) !== v.reuniaoId) return;
    if (tamanhoDoSinal(dados.signal) > SINAL_MAX_BYTES) return;
    return { visitante: v };
  }

  function repassarDoMembro(socketId, player, dados) {
    const achado = doMembro(player, dados);
    if (!achado) return;
    achado.visitante.socket.emit('rtc-signal', { from: socketId, signal: dados.signal });
  }

  // O membro entrou ou saiu de uma chamada (ou trocou de uma pela outra):
  // `antes` e a chamada em que estava, `depois` a de agora.
  function aoMudarDeChamada(socketId, player, antes, depois) {
    const a = reuniaoDaChamada(antes);
    const d = reuniaoDaChamada(depois);
    if (a !== null && a !== d) {
      // quem saiu nao recebe mais o painel dessa reuniao (a nao ser que tenha marcado)
      const r = reunioes.obter(a);
      if (!r || r.criadaPorUid !== player.uid) {
        io.to(socketId).emit('visitantes-mudou', {
          reuniaoId: a, chamada: idDaChamada(a), titulo: '', esperando: [], dentro: [],
        });
      }
      if (faltaMembro(a)) agendarSemMembro(a);
      espalhar(a);
    }
    if (d !== null && d !== a) {
      cancelarSemMembro(d);
      // Visitantes que ja tinham sido admitidos (a chamada ficou sem membro) voltam
      // sozinhos: o membro que chegou nao precisa dizer sim de novo.
      daReuniao(d, 'esperando').filter((v) => v.jaAdmitido).forEach((v) => admitir(v));
      io.to(socketId).emit('visitantes-mudou', fotografia(d));
      espalhar(d);
    }
  }

  function aoMudarTela(player) {
    const id = reuniaoDaChamada(player.chamada);
    if (id !== null) enviarParticipantes(id);
  }

  // A reuniao foi desmarcada: o link morreu, e quem esta nele sai.
  function aoDesmarcar(reuniaoId) {
    cancelarSemMembro(reuniaoId);
    daReuniao(reuniaoId).forEach((v) => recusar(v, 'desmarcada'));
  }

  // "Novo link": quem ainda esperava com o link velho e barrado. Quem ja foi
  // admitido por um membro fica - foi uma decisao de gente, e "Remover" existe.
  function aoTrocarLink(reuniaoId) {
    daReuniao(reuniaoId).filter((v) => v.estado !== 'dentro').forEach((v) => recusar(v, 'link-mudou'));
  }

  // ---------------------------------------------------------------- limpeza

  function varrer() {
    const agora = Date.now();
    passes.forEach((p, chave) => { if (p.venceEm < agora) passes.delete(chave); });
    friosPorIp.forEach((ate, ip) => { if (ate < agora) friosPorIp.delete(ip); });
    falhasPorIp.forEach((f, ip) => { if (f.ate < agora) falhasPorIp.delete(ip); });
    // A janela do link fechou: quem esperava nao entra mais, e quem estava
    // dentro e encerrado - reuniao nao fica aberta pra sempre so porque alguem
    // esqueceu a aba.
    visitantes.forEach((v) => {
      const r = reunioes.obter(v.reuniaoId);
      if (!r) return recusar(v, 'desmarcada');
      if (reunioes.estadoDoLink(r) === 'encerrada') recusar(v, 'encerrada');
    });
  }
  const timerVarredura = setInterval(varrer, VARREDURA_MS);
  if (timerVarredura.unref) timerVarredura.unref();

  return {
    NAMESPACE,
    decidir, remover, repassarDoMembro,
    aoMudarDeChamada, aoMudarTela, aoDesmarcar, aoTrocarLink,
    gentePorChamada,
    ehVisitante: (id) => typeof id === 'string' && id.startsWith('v-'),
    _limparNome: limparNome,
  };
}

module.exports = { iniciar, limparNome, NAMESPACE };
