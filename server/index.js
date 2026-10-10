const path = require('path');

// Credenciais (.env) antes dos require de baixo: google.js e turn.js leem o
// ambiente na hora em que sao carregados. Ver server/ambiente.js.
require('./ambiente');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const map = require('./map');
const mapaEditado = require('./mapa-editado');
const usuariosStore = require('./usuarios');
const sessao = require('./sessao');
const auth = require('./auth');
const marcaDaSede = require('./marca');
const google = require('./google');
const agenda = require('./agenda');
const quadros = require('./quadros');
const kanbanCrm = require('./kanban-crm');
const prazos = require('./prazos');
const discador = require('./discador');
const acervo = require('./acervo');
const turn = require('./turn');
const correio = require('./email');
const emprestimos = require('./emprestimos');
const mesasStore = require('./mesas');
const reunioes = require('./reunioes');
const visitantes = require('./visitantes');
const chatDisco = require('./chat-disco');
const freio = require('./freio');
const canais = require('./canais');
const spotify = require('./spotify');
const backup = require('./backup');

const PORT = process.env.PORT || 3500;

const app = express();
const server = http.createServer(app);
// A sessao anda em cookie, entao a origem tem que ser a propria pagina.
const io = new Server(server);

// Atras do proxy do Render/Railway, `req.ip` precisa ser o IP real: o freio de
// forca bruta conta por IP e o cookie Secure depende disso. O valor e QUANTOS
// proxies confiaveis ha na frente (Render/Railway = 1). Errar aqui quebra o
// freio de dois jeitos: com proxies DEMAIS confiados, da pra forjar
// X-Forwarded-For e furar o limite; com proxies DE MENOS, todo mundo vira o IP
// do proxy e dez erros de gente diferente trancam a sede inteira. Por isso e
// configuravel (TRUST_PROXY) - cada hospedagem tem a sua topologia. O
// /api/diagnostico ajuda a conferir se ficou certo.
app.set('trust proxy', lerTrustProxy(process.env.TRUST_PROXY));

// TRUST_PROXY: numero de proxies confiaveis na frente (padrao 1), ou 'true' /
// 'false', ou uma lista de IPs/sub-redes que o Express entende ('loopback',
// '10.0.0.0/8', ...). Vazio mantem o 1 de antes.
function lerTrustProxy(bruto) {
  const v = String(bruto == null ? '' : bruto).trim();
  if (!v) return 1;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // 'loopback', lista de IPs/CIDR - o Express resolve
}

// Nao anunciar o que roda aqui. Nao impede nada sozinho, mas "x-powered-by:
// Express" e a primeira linha de qualquer varredura automatica: e dizer de
// graca por onde comecar.
app.disable('x-powered-by');

// ---- cabecalhos de seguranca ------------------------------------------------
//
// A sede subiu sem NENHUM deles - conferido no ar com curl. Cada um fecha uma
// porta diferente, e todos sao barato:
//
// CSP e a mais importante, e e cinto de seguranca: hoje o chat escapa o texto
// direito (`formatar()` escapa & < > " ' ANTES de montar o HTML, e o auto-link
// so aceita http/https). A CSP e o que segura o dia em que alguem mexer nisso e
// errar. `script-src` sem 'unsafe-inline' foi o motivo de o unico <script>
// inline da pagina virar arquivo: com 'unsafe-inline' a CSP para de proteger
// contra XSS, que e justamente pra isso que ela esta aqui.
//
// `style-src` PRECISA de 'unsafe-inline': o painel de salas monta
// `style="background:..."` e varias telas escrevem `el.style.x`. Tirar isso
// pediria refatorar meia interface, e estilo inline nao executa codigo - o
// risco e outra ordem de grandeza.
//
// De onde a pagina carrega coisa de fora, conferido no codigo: PDF.js do cdnjs
// (com worker, que pode nascer de blob:), a fonte do Google (CSS em
// fonts.googleapis, arquivo em fonts.gstatic). O WhatsApp so aparece como link
// clicavel, entao nao precisa de diretiva.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' https://cdnjs.cloudflare.com https://www.youtube.com https://s.ytimg.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // data: e blob: sao as capas que o proprio navegador desenha do PDF, e o
  // canvas do avatar. media: o video do WebRTC chega como blob.
  "img-src 'self' data: blob: https://i.scdn.co",
  "media-src 'self' blob:",
  // o socket e o proprio servidor; o Cloudflare TURN e chamado do SERVIDOR,
  // nunca do navegador
  "connect-src 'self'",
  // o unico iframe da sede e o player incorporado do Spotify (public/js/spotify.js)
  "frame-src https://open.spotify.com https://www.youtube.com",
  // ninguem coloca a sede dentro de um iframe: com camera, microfone e botao de
  // diretoria na tela, clickjacking aqui custa caro
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // X-Frame-Options e o mesmo que frame-ancestors, pra navegador antigo
  res.setHeader('X-Frame-Options', 'DENY');
  // O endereco da sede nao precisa viajar junto pro site que a pessoa clicar
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Camera e microfone so a propria sede pede; o resto fica fechado
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()');
  // HSTS so em producao: em desenvolvimento e http, e um HSTS gravado no
  // navegador do dev gruda e atrapalha depois.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '32kb' }));

// Estado de presenca em memoria (sem banco de dados)
// A chave e o id do socket (some quando a aba fecha). Cada player tambem carrega
// um `uid` estavel - o id da conta logada: e ele que identifica a pessoa entre um
// F5 e outro, e ate entre computadores diferentes.
const players = new Map(); // socket.id -> player

// Ultimo nome visto de cada uid, pra uma DM antiga continuar mostrando "Maria"
// mesmo com a Maria offline.
const nomesPorUid = new Map(); // uid -> nome

// Chat da sede: canais fixos + mensagens diretas entre duas pessoas online.
// Tudo em memoria (some se o servidor reiniciar, igual ao resto da presenca).
// Ver docs/plano-chat.md.
const MENSAGENS_MAX = 200;
const MAX_MSG_LEN = 500;
const EMOJIS_REACAO = ['👍', '😂', '❤️', '🎉', '👏'];

// Ritmo: no maximo 5 mensagens em 3 segundos por CONTA (ver server/freio.js). Sem
// freio, uma conta mandava ~990 por segundo e apagava o historico do canal - que
// guarda 200. Reacao e clique, mas cada uma vira um `io.emit` pra sede inteira:
// teto mais folgado.
const freioDeChat = freio.criar({ max: 5, janelaMs: 3000 });
const freioDeReacao = freio.criar({ max: 10, janelaMs: 3000 });
// Aceno PRA alguem (painel Pessoas, cartao da pessoa) toca som e pode virar
// notificacao na outra ponta: um por par a cada 10 s, e no maximo 5 por conta a
// cada 30 s (senao dava pra acenar pra sede inteira em fila).
const freioDeAcenoPorPar = freio.criar({ max: 1, janelaMs: 10 * 1000 });
const freioDeAceno = freio.criar({ max: 5, janelaMs: 30 * 1000 });

// O cliente pode pedir confirmacao (`socket.emit(evento, dados, aoResponder)`);
// quem manda sem callback (o teste, um cliente antigo) continua funcionando.
function responder(ack, resposta) {
  if (typeof ack === 'function') ack(resposta);
}

// geral, social, projetos e um canal por diretoria. Ver server/canais.js.
const CANAIS = canais.montar({
  nomeEmpresa: marcaDaSede.marca.nome,
  ehAdm: marcaDaSede.ehAdm,
  lista: process.env.CANAIS_DIRETORIAS,
});

// O historico vem do disco: reiniciar o servidor nao apaga mais a conversa.
// Ver server/chat-disco.js e docs/plano-chat-no-disco.md.
const doDisco = chatDisco.carregar(MENSAGENS_MAX);
const conversas = doDisco.conversas; // conversaId -> [mensagem]
let proximoMsgId = doDisco.proximoMsgId;

function salvarChat() {
  chatDisco.agendar(conversas, proximoMsgId);
}

// O historico voltou do disco, mas `nomesPorUid` so enche quando a pessoa
// conecta. Sem isto, logo depois de reiniciar a lista de conversas mostrava
// "Alguem" no lugar do nome de quem ainda nao tinha entrado - com a conversa
// dela ali, legivel, do lado. Os nomes vem da mesma lista de contas do login.
conversas.forEach((_, conversaId) => {
  if (!conversaId.startsWith('dm:')) return;
  participantesDaDm(conversaId).forEach((uid) => {
    if (nomesPorUid.has(uid)) return;
    const conta = usuariosStore.porId(uid);
    if (conta) nomesPorUid.set(uid, conta.nome);
  });
});

// Grava na saida: sem isto as ultimas mensagens antes do desligamento morriam
// na espera de 1,5s do gravador.
// E manda o backup do que mudou (server/backup.js) - deploy, restart e o Render
// dormindo passam todos por aqui, e a hospedagem espera ~30s antes de matar.
// Segundo Ctrl+C sai na hora: ninguem fica preso esperando o Drive.
let saindo = false;
['SIGINT', 'SIGTERM'].forEach((sinal) => {
  process.on(sinal, async () => {
    if (saindo) process.exit(0);
    saindo = true;
    chatDisco.agora();
    await backup.naSaida(20000);
    process.exit(0);
  });
});

function idCanal(canalId) {
  return 'canal:' + canalId;
}

// Os dois uids entram ordenados pra chave da DM ser a mesma dos dois lados - e,
// por serem estaveis, a conversa continua a mesma depois de recarregar a pagina.
function idDm(a, b) {
  return 'dm:' + [a, b].sort().join('|');
}

function participantesDaDm(conversaId) {
  return conversaId.slice(3).split('|');
}

function conversaExiste(conversaId) {
  if (typeof conversaId !== 'string') return false;
  if (conversaId.startsWith('canal:')) {
    return CANAIS.some((c) => idCanal(c.id) === conversaId);
  }
  if (conversaId.startsWith('dm:')) {
    const partes = participantesDaDm(conversaId);
    return partes.length === 2 && partes[0] !== partes[1];
  }
  return false;
}

// Canal e aberto; DM so vale pra quem esta nela.
function podeAcessar(conversaId, socketId) {
  if (!conversaExiste(conversaId)) return false;
  if (conversaId.startsWith('canal:')) return true;
  const player = players.get(socketId);
  return !!player && participantesDaDm(conversaId).includes(player.uid);
}

// A mesma pessoa pode estar em mais de uma aba: a DM vai pra todas elas.
function socketsDoUid(uid) {
  const ids = [];
  players.forEach((p, socketId) => {
    if (p.uid === uid) ids.push(socketId);
  });
  return ids;
}

// Pra quem esse evento vai: canal e pra todo mundo, DM so pros dois.
function entregar(conversaId, evento, dado) {
  if (conversaId.startsWith('canal:')) {
    io.emit(evento, dado);
    return;
  }
  participantesDaDm(conversaId).forEach((uid) => {
    socketsDoUid(uid).forEach((socketId) => io.to(socketId).emit(evento, dado));
  });
}

// DMs que esse uid ja tem historico, pra lista voltar montada depois do F5
// (inclusive com quem nao esta online agora).
function dmsDoUid(uid) {
  const lista = [];
  conversas.forEach((mensagens, conversaId) => {
    if (!conversaId.startsWith('dm:') || !mensagens.length) return;
    const partes = participantesDaDm(conversaId);
    if (!partes.includes(uid)) return;
    const outro = partes[0] === uid ? partes[1] : partes[0];
    lista.push({
      conversa: conversaId,
      uid: outro,
      nome: nomesPorUid.get(outro) || 'Alguem',
      ts: mensagens[mensagens.length - 1].ts,
    });
  });
  return lista.sort((a, b) => b.ts - a.ts);
}

function guardarMensagem(conversaId, mensagem) {
  if (!conversas.has(conversaId)) conversas.set(conversaId, []);
  const lista = conversas.get(conversaId);
  lista.push(mensagem);
  if (lista.length > MENSAGENS_MAX) lista.shift();
  salvarChat();
  return mensagem;
}

function mensagensDe(conversaId) {
  return conversas.get(conversaId) || [];
}

// "Fulano entrou na sede" / "saiu da sede".
//
// NAO e guardado no historico, e nao e por economia: presenca e informacao que
// vale AGORA. Gravada, ela vira arqueologia - quem abrisse o #geral amanha leria
// dez linhas de gente entrando e saindo ontem antes de achar a primeira
// conversa de verdade. Quem esta na sede ja se ve no mapa e na lista de pessoas.
//
// E tem o COOLDOWN, que e o que resolve o caso comum: recarregar a pagina
// desconecta e reconecta, e sem ele cada F5 rendia um "saiu" e um "entrou". Nao
// e noticia. Dois minutos por pessoa.
const ultimoAvisoDePresenca = new Map();   // uid -> quando
const ESPERA_AVISO = 2 * 60 * 1000;

// Aviso da sede que FICA no historico: reuniao marcada, reuniao desmarcada.
// Ao contrario do entra/sai, quem nao estava online na hora precisa ler depois.
function avisar(texto) {
  const conversaId = idCanal('geral');
  io.emit('chat-mensagem', guardarMensagem(conversaId, {
    id: proximoMsgId++,
    conversa: conversaId,
    autorId: null,
    autorNome: '',
    autorIsAdmin: false,
    texto,
    ts: Date.now(),
    sistema: true,
    reacoes: {},
  }));
}

// A lista e as salas vao juntas: a tela precisa das duas pra montar o formulario
// e nao faz sentido pedir em dois eventos.
function dadosDeReunioes() {
  return { reunioes: reunioes.listar(), salas: reunioes.salasDisponiveis() };
}

function avisoDePresenca(uid, texto) {
  const agora = Date.now();
  if (uid && agora - (ultimoAvisoDePresenca.get(uid) || 0) < ESPERA_AVISO) return;
  if (uid) ultimoAvisoDePresenca.set(uid, agora);
  io.emit('chat-mensagem', {
    id: 'presenca-' + agora,   // id de verdade e do historico; este nunca entra la
    conversa: idCanal('geral'),
    autorId: null,
    autorNome: '',
    autorIsAdmin: false,
    texto,
    ts: agora,
    sistema: true,
    reacoes: {},
  });
}

// Tem alguem em pe nessa celula? (usado pra nao deixar decorar em cima de gente)
function alguemNoTile(col, row) {
  for (const p of players.values()) {
    if (Math.floor(p.x / map.TILE) === col && Math.floor(p.y / map.TILE) === row) return true;
  }
  return false;
}


const MAX_NAME_LEN = 18;
// 'ligacao' nao e escolhido no botao de status: e o discador que marca,
// enquanto a pessoa esta numa ligacao com cliente (ver public/js/discador.js).
const STATUS_VALIDOS = ['livre', 'focado', 'reuniao', 'ligacao'];
const EMOJIS_VALIDOS = ['👋', '👍', '🎉', '😂', '❤️', '👏'];
// O `uid` do player e o id da conta (uuid), entregue pelo cookie assinado - nao
// vem mais do cliente. Ver server/auth.js e docs/plano-login.md.

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Visitante';
  const trimmed = name.trim().slice(0, MAX_NAME_LEN);
  return trimmed.length > 0 ? trimmed : 'Visitante';
}

function sanitizeAppearance(appearance) {
  const a = appearance && typeof appearance === 'object' ? appearance : {};
  const allowedHex = (v, fallback) =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  const allowedEnum = (v, options, fallback) =>
    options.includes(v) ? v : fallback;

  return {
    skin: allowedHex(a.skin, '#e8b48c'),
    shirt: allowedHex(a.shirt, '#35bdf0'),
    bottom: allowedHex(a.bottom, '#6a7ce0'),
    shoes: allowedHex(a.shoes, '#2b2f38'),
    hairColor: allowedHex(a.hairColor, '#2b3038'),
    hairStyle: allowedEnum(a.hairStyle, ['careca', 'curto', 'raspado', 'espetado', 'cacheado', 'afro', 'dread', 'pixie', 'chanel', 'longo', 'moicano', 'franja', 'bagunca', 'topete', 'trancinhas', 'twists', 'chanel_reto', 'longo_messy', 'cachos', 'ondulado', 'tranca', 'rabo'], 'curto'),
    glasses: !!a.glasses,
    glassesColor: allowedHex(a.glassesColor, '#2b3038'),
    // As formas de roupa. A lista tem que bater com a do public/js/character.js
    // - se divergir, o servidor troca calado a peca da pessoa pelo padrao.
    topStyle: allowedEnum(a.topStyle, ['camiseta', 'vneck', 'polo', 'regata', 'manga', 'social', 'gola'], 'camiseta'),
    jaqueta: allowedEnum(a.jaqueta, ['nenhuma', 'blazer', 'cardigan', 'sobretudo'], 'nenhuma'),
    jaquetaColor: allowedHex(a.jaquetaColor, '#2b2f38'),
    bottomStyle: allowedEnum(a.bottomStyle, ['calca', 'social', 'bermuda', 'saia', 'legging', 'dobrada'], 'calca'),
    barba: allowedEnum(a.barba, ['nenhuma', 'bigode', 'curta', 'chevron', 'cheia'], 'nenhuma'),
    chapeu: allowedEnum(a.chapeu, ['nenhum', 'bandana', 'bone', 'coco', 'faixa'], 'nenhum'),
    chapeuColor: allowedHex(a.chapeuColor, '#e03a3a'),
    shoesStyle: allowedEnum(a.shoesStyle, ['tenis', 'sandalia', 'bota', 'pantufa', 'descalco'], 'tenis'),
    pescoco: allowedEnum(a.pescoco, ['nenhum', 'gravata', 'lenco'], 'nenhum'),
    pescocoColor: allowedHex(a.pescocoColor, '#a03028'),
  };
}

// So conecta quem tem sessao valida. Como a identidade sai do cookie assinado, o
// cliente nao consegue mais se dizer outra pessoa (nem pra ler DM dos outros).
io.use((socket, next) => {
  const usuario = sessao.usuarioDoSocket(socket);
  if (!usuario) return next(new Error('sem-sessao'));
  socket.data.usuarioId = usuario.id;
  next();
});

// ---- repasse de movimento: cada um recebe so o que precisa ver ----------------
//
// ANTES: cada passo de cada pessoa saia NA HORA pra todas as outras. Isso cresce
// ao quadrado - 60 pessoas davam ~35 mil envios por segundo, e o teste de carga
// (scripts/medir-carga.js) mostrou o servidor enchendo um nucleo inteiro ali e o
// boneco dos outros comecando a teleportar.
//
// AGORA, a cada CICLO_MS, cada pessoa recebe UM pacote com quem mudou:
//   - quem esta NA TELA dela (+ uma margem): todo ciclo, 20 vezes por segundo;
//   - quem esta FORA da tela: um ciclo a cada LONGE_A_CADA (2 vezes por segundo).
//     Ninguem some: o minimapa, a lista de pessoas e "seguir alguem" continuam
//     certos, so atualizam mais devagar - e ninguem ve esse boneco andar.
//
// "Na tela" e calculado aqui do mesmo jeito que a camera do cliente enquadra
// (centralizada na pessoa, travando na borda do mapa - ver atualizarCamera no
// game.js), com o tamanho da tela que o cliente manda no evento 'vista'.
//
// Cliente que nao mandou 'vista' (versao antiga no cache do navegador) continua
// recebendo do jeito antigo: tudo, e uma mensagem 'player-moved' por posicao.
//
// O estado fica FORA do objeto do player de proposito: o player vai inteiro no
// `init` e no `player-joined`, e isto vazaria pra todo mundo junto.
const CICLO_MS = 50;
const LONGE_A_CADA = 10;
const MARGEM_VISTA = 3 * map.TILE;   // quem esta quase entrando na tela ja chega liso
const repasse = new Map();           // socket.id -> { seq, pacote, vista, vistos }
let cicloDeRepasse = 0;
let ultimoCicloComMovimento = -Infinity;

function estadoDeRepasse(id) {
  let r = repasse.get(id);
  if (!r) {
    // seq: quantas vezes a pessoa andou; vistos: outroId -> ultimo seq ja entregue
    r = { seq: 0, pacote: null, vista: null, vistos: new Map() };
    repasse.set(id, r);
  }
  return r;
}

// O retangulo que a pessoa esta vendo, com a margem. null = ve tudo.
function areaDaTela(pessoa, vista) {
  if (!vista) return null;
  const W = map.COLS * map.TILE;
  const H = map.ROWS * map.TILE;
  const x = vista.w >= W ? 0 : Math.max(0, Math.min(W - vista.w, pessoa.x - vista.w / 2));
  const y = vista.h >= H ? 0 : Math.max(0, Math.min(H - vista.h, pessoa.y - vista.h / 2));
  return {
    x0: x - MARGEM_VISTA, y0: y - MARGEM_VISTA,
    x1: x + vista.w + MARGEM_VISTA, y1: y + vista.h + MARGEM_VISTA,
  };
}

function cicloDoRepasse() {
  cicloDeRepasse += 1;
  // Sede parada: ninguem andou e todo atrasado (quem estava longe) ja foi
  // entregue. E o caso mais comum - a sede aberta com todo mundo sentado.
  if (cicloDeRepasse - ultimoCicloComMovimento > LONGE_A_CADA) return;
  const vezDeQuemEstaLonge = cicloDeRepasse % LONGE_A_CADA === 0;

  players.forEach((receptor, id) => {
    const sock = io.sockets.sockets.get(id);
    if (!sock) return;
    const meu = estadoDeRepasse(id);
    const tela = areaDaTela(receptor, meu.vista);
    const lote = [];
    repasse.forEach((r, outroId) => {
      if (outroId === id || !r.pacote) return;
      if (meu.vistos.get(outroId) === r.seq) return; // nada novo desse
      const p = r.pacote;
      const naTela = !tela || (p.x >= tela.x0 && p.x <= tela.x1 && p.y >= tela.y0 && p.y <= tela.y1);
      if (!naTela && !vezDeQuemEstaLonge) return;
      lote.push(p);
      meu.vistos.set(outroId, r.seq);
    });
    if (!lote.length) return;
    if (meu.vista) sock.emit('players-moved', lote);
    else lote.forEach((p) => sock.emit('player-moved', p)); // cliente antigo
  });
}
setInterval(cicloDoRepasse, CICLO_MS);

// ---- chamadas com hora marcada, que funcionam de qualquer canto ----------
//
// A sede ja tinha chamada por PROXIMIDADE: chegou perto, conversa. Isso
// resolve o corredor e nao resolve reuniao - reuniao precisa acontecer mesmo
// com a sala de reuniao ocupada, e com gente que nao quer largar o lugar onde
// esta trabalhando.
//
// Entao a chamada vira uma SESSAO: quem entra nela fala com quem tambem
// entrou, esteja onde estiver no mapa. A proximidade continua existindo por
// baixo, pra conversa de corredor.
//
// O id diz de onde a chamada veio, e e ele que faz duas pessoas caírem na
// MESMA sessao sem combinar nada:
//     reuniao:12   a reuniao 12 da agenda
//     canal:geral  o grupo #geral do chat
//
// O TITULO E RESOLVIDO AQUI, contra a agenda e a lista de canais - nunca vem
// do cliente. Ele aparece na tela de todo mundo que esta na chamada, e aceitar
// texto de fora seria deixar qualquer um escrever ali.
function tituloDaChamada(id) {
  if (typeof id !== 'string') return null;
  const [tipo, resto] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  if (tipo === 'reuniao') {
    const r = reunioes.obter(resto);
    return r ? r.titulo : null;
  }
  if (tipo === 'canal') {
    const c = CANAIS.find((x) => x.id === resto);
    return c ? '#' + c.nome : null;
  }
  return null;
}

// Quem esta em cada chamada agora. Sai da presenca, entao nao precisa de
// arquivo: chamada e coisa do momento - o que fica salvo e a REUNIAO.
function quemEstaEm(chamadaId) {
  const nomes = [];
  players.forEach((p) => { if (p.chamada && p.chamada.id === chamadaId) nomes.push(p.name); });
  return nomes;
}

function avisarChamadas() {
  const mapa = {};
  players.forEach((p) => {
    if (!p.chamada) return;
    if (!mapa[p.chamada.id]) mapa[p.chamada.id] = { id: p.chamada.id, titulo: p.chamada.titulo, gente: [] };
    mapa[p.chamada.id].gente.push(p.name);
  });
  // Quem entrou pelo link da reuniao tambem esta nela (server/visitantes.js).
  const deFora = salaDeVisitas.gentePorChamada();
  Object.keys(deFora).forEach((id) => {
    if (!mapa[id]) {
      const titulo = tituloDaChamada(id);
      if (!titulo) return;
      mapa[id] = { id, titulo, gente: [] };
    }
    mapa[id].gente.push(...deFora[id]);
  });
  io.emit('chamadas', Object.values(mapa));
}

// Quem entra numa reuniao pelo LINK dela (e so nela): canal proprio do socket.io,
// sem cookie, sem mapa, sem chat. Ver server/visitantes.js.
const salaDeVisitas = visitantes.iniciar({
  io, players, reunioes, turn,
  aoMudarChamadas: avisarChamadas,
  sede: marcaDaSede.marca,
});

// Quando o mapa customizado é alterado no disco, avisa todos os clientes conectados
map.aoAtualizar((dadosMapa) => {
  console.log('[mapa] Mapa atualizado no disco! Enviando atualização em tempo real para os clientes...');
  io.emit('mapa-base-atualizado', dadosMapa);
});

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    if (players.has(socket.id)) return; // ja entrou

    const conta = usuariosStore.porId(socket.data.usuarioId);
    if (!conta) {
      socket.disconnect(true); // conta apagada no meio da sessao
      return;
    }

    // Aparencia e a unica coisa que ainda vem do cliente - e vai pra conta.
    const appearance = sanitizeAppearance(
      (payload && payload.appearance) || conta.appearance
    );
    usuariosStore.atualizarPerfil(conta.id, { appearance });

    const spawn = map.getSpawnPoint();
    const player = {
      id: socket.id,
      uid: conta.id,
      usuario: conta.usuario,
      bio: conta.bio || '',
      name: sanitizeName(conta.nome),
      appearance,
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      sentado: false,
      status: 'livre',
      dividindoTela: false,
      midiaAtiva: false,
      youtube: null,
      // Livro aberto no leitor, ou null. Vai junto no `init` pra quem chega
      // depois ja ver quem esta lendo o que, como o dividindoTela.
      lendo: null,
      // Chamada em que a pessoa entrou DE PROPOSITO (reuniao, grupo), ou null.
      // Ver o bloco de chamadas mais abaixo.
      chamada: null,
      isAdmin: !!conta.isAdmin,
    };
    players.set(socket.id, player);
    nomesPorUid.set(player.uid, player.name);

    // O `init` logo abaixo ja leva a posicao atual de todo mundo: quem chega
    // comeca "em dia" com cada um, e o ciclo de repasse so manda o que mudar
    // daqui pra frente (senao o primeiro ciclo repetiria a sede inteira).
    const meuRepasse = estadoDeRepasse(socket.id);
    repasse.forEach((r, outroId) => {
      if (outroId !== socket.id) meuRepasse.vistos.set(outroId, r.seq);
    });

    socket.emit('init', {
      selfId: socket.id,
      selfUid: player.uid,
      map: {
        cols: map.COLS,
        rows: map.ROWS,
        tile: map.TILE,
        tiles: map.tiles,
        rooms: map.ROOMS,
        zonasPiso: map.ZONAS_PISO,
      },
      players: Array.from(players.values()),
      canais: CANAIS,
      conversaPadrao: idCanal('geral'),
      mensagens: mensagensDe(idCanal('geral')),
      dms: dmsDoUid(player.uid),
      mesas: mesasStore.paraEnvio(),
      mudancasMapa: mapaEditado.paraEnvio(),
      objetosMapa: mapaEditado.objetosParaEnvio(),
      conteudosMapa: mapaEditado.conteudosParaEnvio(),
      areasMapa: mapaEditado.areasParaEnvio(),
    });

    socket.broadcast.emit('player-joined', player);
    avisoDePresenca(player.uid, player.name + ' entrou na sede');
  });

  socket.on('perfil-atualizado', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;

    player.name = data.name || player.name;
    if (data.bio !== undefined) player.bio = String(data.bio).slice(0, 160);
    if (data.appearance) {
      player.appearance = sanitizeAppearance(data.appearance);
    }
    nomesPorUid.set(player.uid, player.name);

    io.emit('player-atualizado', {
      id: socket.id,
      uid: player.uid,
      name: player.name,
      usuario: player.usuario,
      bio: player.bio,
      appearance: player.appearance
    });
  });

  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;

    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < 0 || y < 0 || x > map.COLS * map.TILE || y > map.ROWS * map.TILE) return;

    player.x = x;
    player.y = y;
    player.dir = ['up', 'down', 'left', 'right'].includes(data.dir) ? data.dir : player.dir;
    player.moving = !!data.moving;
    // So vale como sentado se a celula for mesmo um assento (o cliente decide,
    // o servidor confere - senao da pra "sentar" no meio do corredor).
    const tileAtual = map.tiles[Math.floor(y / map.TILE)];
    player.sentado = !!data.sentado && !!tileAtual
      && map.ASSENTOS.has(tileAtual[Math.floor(x / map.TILE)]);

    // Kart: 0 a 1 e um angulo em radianos. Aqui e so repasse - isto e desenho,
    // e desenho nao muda onde a pessoa esta nem no que ela esbarra. O servidor
    // so garante que e numero e que esta na faixa, pra um cliente adulterado
    // nao mandar NaN e apagar o boneco na tela dos outros.
    const kart = Number(data.kart);
    const kartAng = Number(data.kartAng);
    player.kart = Number.isFinite(kart) ? Math.max(0, Math.min(1, kart)) : 0;
    player.kartAng = Number.isFinite(kartAng) ? kartAng : 0;

    // Pacote enxuto: e o que mais gasta trafego na hospedagem. Campo no valor
    // padrao nao vai (o cliente ja trata ausente como falso/zero).
    const pacote = { id: socket.id, x: Math.round(player.x), y: Math.round(player.y), dir: player.dir };
    if (player.moving) pacote.moving = true;
    if (player.sentado) pacote.sentado = true;
    if (player.kart) { pacote.kart = player.kart; pacote.kartAng = player.kartAng; }
    // Nao sai daqui: fica guardado, e o ciclo de repasse (mais abaixo) entrega
    // a cada um so o que ele precisa ver.
    const r = estadoDeRepasse(socket.id);
    r.seq += 1;
    r.pacote = pacote;
    ultimoCicloComMovimento = cicloDeRepasse;
  });

  // Tamanho da tela da pessoa, em pixels do mapa (largura/zoom). E o que diz ao
  // ciclo de repasse quem esta na tela dela. Mentir aqui so muda o que a PROPRIA
  // pessoa recebe - no maximo, todo mundo a toda hora, que e o que ja era antes.
  socket.on('vista', (data) => {
    if (!data) return;
    const w = Number(data.w);
    const h = Number(data.h);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 64 || h < 64) return;
    estadoDeRepasse(socket.id).vista = { w: Math.min(w, 8192), h: Math.min(h, 8192) };
  });

  socket.on('status', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    if (!STATUS_VALIDOS.includes(data.status)) return;
    player.status = data.status;
    io.emit('player-status', { id: socket.id, status: player.status });
  });

  // Quem esta dividindo a tela. Fica no player como o status, e vai junto no
  // `init` pra quem chega depois ja ver a apresentacao em andamento.
  socket.on('tela', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const ligado = !!data.ligado;
    if (player.dividindoTela === ligado) return;
    player.dividindoTela = ligado;
    io.emit('tela-mudou', { id: socket.id, ligado });
    salaDeVisitas.aoMudarTela(player);
  });

  // Quem ativou camera/microfone. Permite que a proximidade saiba se o outro
  // lado esta com midia ligada antes de abrir a conexao P2P.
  socket.on('youtube', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    player.youtube = data.youtube || null;
    io.emit('youtube-mudou', { id: socket.id, youtube: player.youtube });
  });

  socket.on('midia', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const ativa = !!data.ativa;
    if (player.midiaAtiva === ativa) return;
    player.midiaAtiva = ativa;
    io.emit('midia-mudou', { id: socket.id, midiaAtiva: ativa });
  });

  // Quem esta lendo o que. A estante passa a mostrar na capa quem pegou o
  // livro, e o mapa marca quem esta lendo - que e o que faltava pra ela ser
  // biblioteca da sede e nao lista de arquivo.
  //
  // O TITULO VEM DAQUI, NAO DO CLIENTE. O cliente manda so o id; o servidor
  // procura no acervo e usa o titulo que ele mesmo tem. Aceitar o titulo do
  // cliente deixaria qualquer pessoa transmitir o texto que quisesse pra tela
  // de todo mundo - e isso aparece na capa e em cima da cabeca do boneco.
  //
  // Id que nao esta no acervo e ignorado: nao da pra "estar lendo" um livro que
  // a sede nao tem.
  socket.on('lendo', async (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const id = data && typeof data.id === 'string' ? data.id : '';
    if (!id) {
      if (!player.lendo) return;
      player.lendo = null;
      io.emit('lendo-mudou', { id: socket.id, livro: null });
      return;
    }
    let livro = null;
    try { livro = await acervo.acharLivro(id); } catch (e) { return; }
    if (!livro) return;
    if (player.lendo && player.lendo.id === livro.id) return;

    player.lendo = { id: livro.id, titulo: livro.titulo };
    io.emit('lendo-mudou', { id: socket.id, livro: player.lendo });
  });

  socket.on('reagir', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    if (!EMOJIS_VALIDOS.includes(data.emoji)) return;
    if (!freioDeReacao.tentar(player.uid).ok) return;
    io.emit('reacao', { id: socket.id, emoji: data.emoji });
  });

  // Aceno pra UMA pessoa: so ela recebe, com o nome de quem acenou. O 'reagir'
  // acima aparece em cima do proprio boneco - de outra sala a pessoa nem via. O
  // nome sai daqui, nao do cliente.
  socket.on('acenar', (data, ack) => {
    const player = players.get(socket.id);
    if (!player || !data) return responder(ack, { erro: 'invalido' });
    const alvo = players.get(String(data.para || ''));
    // a mesma conta em outra aba tambem e "eu"
    if (!alvo || alvo.uid === player.uid) return responder(ack, { erro: 'invalido' });
    const geral = freioDeAceno.tentar(player.uid);
    if (!geral.ok) return responder(ack, { erro: 'ritmo', esperarMs: geral.esperarMs });
    const par = freioDeAcenoPorPar.tentar(player.uid + '>' + alvo.uid);
    if (!par.ok) return responder(ack, { erro: 'ritmo', esperarMs: par.esperarMs });
    io.to(alvo.id).emit('aceno', { de: socket.id, nome: player.name });
    responder(ack, { ok: true });
  });

  // Agenda do time, vinda do CRM. Sob demanda (so quem abre o painel pede) e
  // com cache no agenda.js, entao abrir o painel nao vira chamada ao Google.
  // A agenda aqui nao e a sua: e a de TODO MUNDO que conectou o Google - titulo,
  // horario e de quem e cada compromisso do time inteiro. E a lista de reunioes da
  // sede vai junto. Quem de fora entra por um link de reuniao, num canal separado
  // (server/visitantes.js), e nunca chega a este evento.
  socket.on('agenda-pedir', async () => {
    const player = players.get(socket.id);
    if (!player) return;
    const dados = await agenda.obter();
    socket.emit('agenda', dados);
    socket.emit('reunioes', dadosDeReunioes());
  });

  socket.on('chamada-entrar', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const titulo = tituloDaChamada(data.id);
    if (!titulo) return;   // id inventado, reuniao que ja saiu da lista: nao entra
    const antes = player.chamada;
    player.chamada = { id: data.id, titulo };
    io.emit('chamada-mudou', { id: socket.id, chamada: player.chamada });
    avisarChamadas();
    salaDeVisitas.aoMudarDeChamada(socket.id, player, antes, player.chamada);
  });

  socket.on('chamada-sair', () => {
    const player = players.get(socket.id);
    if (!player || !player.chamada) return;
    const antes = player.chamada;
    player.chamada = null;
    io.emit('chamada-mudou', { id: socket.id, chamada: null });
    avisarChamadas();
    salaDeVisitas.aoMudarDeChamada(socket.id, player, antes, null);
  });

  // "Ligar pro grupo": quem chamou entra, e todo mundo recebe o convite no
  // canal. Nao arrasta ninguem pra dentro - chamada que comeca sozinha no ouvido
  // dos outros e o tipo de coisa que faz a pessoa desligar o app.
  socket.on('chamada-chamar-grupo', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const canalId = String(data.canal || '');
    const canal = CANAIS.find((c) => c.id === canalId);
    if (!canal) return;

    const id = 'canal:' + canal.id;
    const antes = player.chamada;
    player.chamada = { id, titulo: '#' + canal.nome };
    io.emit('chamada-mudou', { id: socket.id, chamada: player.chamada });
    avisarChamadas();
    salaDeVisitas.aoMudarDeChamada(socket.id, player, antes, player.chamada);

    const conversaId = idCanal(canal.id);
    io.emit('chat-mensagem', guardarMensagem(conversaId, {
      id: proximoMsgId++,
      conversa: conversaId,
      autorId: null,
      autorNome: '',
      autorIsAdmin: false,
      texto: player.name + ' comecou uma chamada no #' + canal.nome + '.',
      ts: Date.now(),
      sistema: true,
      chamada: id,          // e isto que vira o botao "Entrar" na mensagem
      reacoes: {},
    }));
  });

  // Reunioes internas: marcar, desmarcar. Ver server/reunioes.js.
  socket.on('reuniao-marcar', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const r = reunioes.criar({
      titulo: data.titulo, inicio: data.inicio, minutos: data.minutos, sala: data.sala,
    }, { uid: player.uid, nome: player.name, isAdmin: player.isAdmin });

    if (r.erro) return socket.emit('reuniao-recusada', r.erro);

    io.emit('reunioes', dadosDeReunioes());
    // Reuniao marcada e AVISO, entao vai pro #geral - e fica gravada ali, ao
    // contrario do entra/sai. Quem nao estava online na hora precisa ver.
    const quando = new Date(r.reuniao.inicio);
    avisar(player.name + ' marcou "' + r.reuniao.titulo + '" na ' + r.reuniao.salaNome
      + ', ' + quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      + ' as ' + quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  });

  socket.on('reuniao-desmarcar', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const r = reunioes.remover(data.id, { uid: player.uid, isAdmin: player.isAdmin });
    if (r.erro) return socket.emit('reuniao-recusada', r.erro);
    io.emit('reunioes', dadosDeReunioes());
    avisar(player.name + ' desmarcou "' + r.reuniao.titulo + '".');
    salaDeVisitas.aoDesmarcar(r.reuniao.id);
  });

  // "Novo link": o que vazou para de abrir. Nao ha aviso no chat - o link novo
  // e so de quem ve a agenda, e quem precisa dele copia de la.
  socket.on('reuniao-novo-link', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const r = reunioes.novoLink(data.id, { uid: player.uid, isAdmin: player.isAdmin });
    if (r.erro) return socket.emit('reuniao-recusada', r.erro);
    io.emit('reunioes', dadosDeReunioes());
    salaDeVisitas.aoTrocarLink(r.reuniao.id);
  });

  // Quem esta na chamada da reuniao decide quem de fora entra (e tira quem
  // entrou). Quem decide e conferido em server/visitantes.js.
  socket.on('visitante-decidir', (data) => {
    salaDeVisitas.decidir(players.get(socket.id), data);
  });

  socket.on('visitante-remover', (data) => {
    salaDeVisitas.remover(players.get(socket.id), data);
  });

  // Os quadros das diretorias (o Kanban do CRM e, se listados, o Trello), sob demanda e
  // com cache em quadros.js. Chave e token nunca saem do servidor: o cliente recebe o
  // quadro ja montado. O nome do evento e de quando so havia o Trello.
  //
  // O pedido diz qual quadro ({ quadro: chave }) e se e um "Atualizar" ({ forcar }).
  // Quem pede e decidido AQUI, pela conta, e nunca por um campo do pedido:
  //   - `diretoria` esconde os quadros "so diretoria" do Trello de quem nao e;
  //   - `email` e o que diz ao CRM quem esta olhando (e o CRM decide, pelo cargo, quais
  //     quadros do Kanban a pessoa ve). So vai se a conta PROVOU o e-mail - a mesma
  //     regra do discador. Ele nao mora no `player`: o `player` e mandado a todo mundo.
  // Uma chave que nao existe (ou de um quadro que a pessoa nao pode ver) cai no primeiro
  // da lista.
  socket.on('trello-pedir', async (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const pedido = data && typeof data === 'object' ? data : {};
    const conta = usuariosStore.porId(player.uid);
    socket.emit('trello', await quadros.obter({
      quadro: typeof pedido.quadro === 'string' ? pedido.quadro.slice(0, 60) : undefined,
      forcar: pedido.forcar === true,
      diretoria: !!player.isAdmin,
      email: conta && conta.emailVerificado === true && conta.email ? conta.email : null,
    }));
  });

  // Os prazos dos cartoes do Kanban do CRM, pra Agenda (server/prazos.js). Os mesmos
  // quadros da aba Quadros, com a mesma regra do e-mail PROVADO e o mesmo cache: abrir
  // a Agenda nao vira chamada nova ao CRM.
  socket.on('prazos-pedir', async () => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!kanbanCrm.configurado()) return socket.emit('prazos', { ligado: false, prazos: [] });
    const conta = usuariosStore.porId(player.uid);
    const email = conta && conta.emailVerificado === true && conta.email ? conta.email : null;
    if (!email) {
      return socket.emit('prazos', {
        ligado: true, prazos: [],
        aviso: 'Entre uma vez com o Google da ' + marcaDaSede.marca.sigla + ' (ou confirme seu e-mail) pra ver os prazos do Kanban.',
      });
    }
    const r = await kanbanCrm.quadrosDe(email);
    if (!r.ok) return socket.emit('prazos', { ligado: true, prazos: [], aviso: r.erro });
    socket.emit('prazos', {
      ligado: true,
      prazos: prazos.extrair(r.quadros, { meuNome: conta.nome, hoje: new Date().toISOString().slice(0, 10) }),
      atualizadoEm: r.atualizadoEm,
      aviso: r.aviso || null,
    });
  });

  // Reivindicar/largar uma mesa. So vale em tile de mesa e cada pessoa fica com
  // no maximo uma - reivindicar outra libera a anterior.
  socket.on('mesa-reivindicar', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const col = Number(data.col);
    const row = Number(data.row);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return;

    // O dono e a CONTA. Clicar em qualquer celula pega o movel inteiro; clicar
    // de novo larga. Quem decide as duas coisas e o server/mesas.js.
    if (!mesasStore.alternar(col, row, player.uid)) return;
    io.emit('mesas-atualizadas', mesasStore.paraEnvio());
  });

  // Largar pelo cartao do perfil, como o "Unclaim my desk" da referencia.
  socket.on('mesa-largar', () => {
    const player = players.get(socket.id);
    if (!player || !mesasStore.largarDe(player.uid)) return;
    io.emit('mesas-atualizadas', mesasStore.paraEnvio());
  });

  // Personalizar a PROPRIA mesa. Nao exige diretoria de proposito: e o
  // `mesa-item` que faz a mesa ser sua de verdade. Quem decide se pode e o
  // server/mesas.js - a celula tem que ser de uma mesa reivindicada por voce.
  socket.on('mesa-item', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    // x e y vem COM FRACAO: a pessoa poe onde quiser em cima da mesa, nao no
    // centro da celula.
    if (!mesasStore.porItem(Number(data.x), Number(data.y), Number(data.o), player.uid)) return;
    io.emit('mesas-atualizadas', mesasStore.paraEnvio());
  });

  // Mover e tirar apontam a coisa pelo id, nao por "a mais perto do clique":
  // com duas canecas encostadas, chute nao serve.
  socket.on('mesa-item-mover', (data) => {
    const player = players.get(socket.id);
    if (!player || !data || typeof data.id !== 'string') return;
    if (!mesasStore.moverItem(data.id, Number(data.x), Number(data.y), player.uid)) return;
    io.emit('mesas-atualizadas', mesasStore.paraEnvio());
  });

  socket.on('mesa-item-tirar', (data) => {
    const player = players.get(socket.id);
    if (!player || !data || typeof data.id !== 'string') return;
    if (!mesasStore.tirarItem(data.id, player.uid)) return;
    io.emit('mesas-atualizadas', mesasStore.paraEnvio());
  });

  // Decorar o escritorio: so a diretoria. A checagem que vale e essa aqui - o
  // botao escondido no cliente e so conforto. Ver docs/plano-decorador.md.
  socket.on('mapa-editar', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data) return;

    const c = Number(data.c);
    const r = Number(data.r);
    const t = Number(data.t);
    if (!mapaEditado.posicaoValida(c, r) || !mapaEditado.tileValido(t)) return;
    // Nao deixa emparedar alguem: a celula onde tem gente em pe fica de fora.
    if (t !== 0 && alguemNoTile(c, r)) return;

    const resultado = mapaEditado.editar(c, r, t);
    if (!resultado.mudou) return;
    io.emit('mapa-atualizado', { c, r, t });
    if (resultado.objetoCaiu) io.emit('mapa-objeto-atualizado', { c, r, o: 0 });
    if (resultado.linkCaiu) io.emit('mapa-conteudo-atualizado', { c, r, conteudo: null });
  });

  // Mover e redimensionar uma AREA (docs/areas.md). So a diretoria, como o resto
  // do decorador. A recusa volta so pra quem tentou, com o motivo: a tela dele
  // ja esta mostrando o retangulo novo e precisa desfazer.
  // Area NOVA: nasce aqui (o id tambem), e todo mundo recebe pra desenhar.
  socket.on('mapa-area-nova', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data) return;
    const r = mapaEditado.criarArea(data);
    if (r.erro) {
      socket.emit('mapa-area-recusada', { id: null, erro: r.erro });
      return;
    }
    io.emit('mapa-area-criada', r.area);
  });

  // Apagar: so area que a diretoria criou. A de fabrica tem piso e movel
  // desenhados pra ela - pra "sumir" com ela, a diretoria diminui.
  socket.on('mapa-area-apagar', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data || typeof data.id !== 'string') return;
    // Reuniao marcada la dentro ficaria apontando pra uma sala que nao existe
    // mais. Em vez de sumir com ela calado (ou deixar orfa ate o proximo
    // reinicio), a diretoria e avisada e desmarca - ou decide que nao apaga.
    const marcadas = reunioes.listar().filter((x) => x.sala === data.id && x.fim > Date.now()).length;
    if (marcadas) {
      socket.emit('mapa-area-recusada', {
        id: data.id,
        erro: marcadas === 1
          ? 'Tem 1 reuniao marcada nessa area. Desmarque antes de apagar.'
          : 'Tem ' + marcadas + ' reunioes marcadas nessa area. Desmarque antes de apagar.',
      });
      return;
    }
    const r = mapaEditado.apagarArea(data.id);
    if (r.erro) {
      socket.emit('mapa-area-recusada', { id: data.id, erro: r.erro });
      return;
    }
    io.emit('mapa-area-apagada', { id: r.id });
  });

  socket.on('mapa-area', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data || typeof data.id !== 'string') return;
    const r = data.restaurar ? mapaEditado.restaurarArea(data.id) : mapaEditado.editarArea(data.id, data);
    if (r.erro) {
      socket.emit('mapa-area-recusada', { id: data.id, erro: r.erro });
      return;
    }
    const area = Object.assign({ id: data.id }, r.area);
    // Nada mudou: responde so pra ele, que esta esperando a resposta.
    if (!r.mudou) socket.emit('mapa-area-atualizada', area);
    else io.emit('mapa-area-atualizada', area);
  });

  // Camada de cima: monitor, caneca, papelada... apoiados numa celula.
  socket.on('mapa-objeto', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data) return;

    const c = Number(data.c);
    const r = Number(data.r);
    const o = Number(data.o);
    if (!mapaEditado.posicaoValida(c, r) || !mapaEditado.objetoValido(o)) return;
    // Em cima de MESA quem manda e o dono dela, pelo `mesa-item`. Deixar a
    // diretoria pintar aqui criava uma armadilha: parecia igual, mas encaixava
    // no centro da celula e nao dava pra mover nem excluir clicando.
    // Tirar (o === 0) continua valendo, pra limpar o que ficou de antes.
    if (o && map.MESAS_DE_TRABALHO.has(map.tiles[r][c])) return;
    if (!mapaEditado.editarObjeto(c, r, o)) return;
    io.emit('mapa-objeto-atualizado', { c, r, o });
  });

  // Terceira camada: o que o movel ABRE no clique. Ver docs/plano-conteudo.md.
  // So a diretoria poe e tira - o link vai ser aberto pelo navegador de todo
  // mundo que visita a sede, entao quem escolhe o endereco importa.
  socket.on('mapa-conteudo', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin || !data) return;

    const c = Number(data.c);
    const r = Number(data.r);
    if (!mapaEditado.posicaoValida(c, r)) return;

    // Sem url = tirar o link.
    if (!data.url) {
      if (!mapaEditado.tirarConteudo(c, r)) return;
      io.emit('mapa-conteudo-atualizado', { c, r, conteudo: null });
      return;
    }

    if (!mapaEditado.definirConteudo(c, r, data, player.uid)) {
      // O cliente precisa saber POR QUE nao pegou, senao a pessoa fica clicando
      // em "salvar" achando que o servidor nao respondeu.
      socket.emit('mapa-conteudo-recusado', {
        c,
        r,
        motivo: !mapaEditado.podeTerConteudo(c, r)
          ? 'Escolhe um movel: chao vazio nao abre nada.'
          : (!mapaEditado.urlValida(data.url)
            ? 'O link precisa comecar com http:// ou https://'
            : 'Poe um nome pro conteudo.'),
      });
      return;
    }
    io.emit('mapa-conteudo-atualizado', {
      c, r, conteudo: mapaEditado.conteudosParaEnvio().find((x) => x.c === c && x.r === r),
    });
  });

  socket.on('chat-historico', (data) => {
    const conversaId = data && data.conversa;
    if (!players.has(socket.id) || !podeAcessar(conversaId, socket.id)) return;
    socket.emit('chat-historico', { conversa: conversaId, mensagens: mensagensDe(conversaId) });
  });

  socket.on('chat-mensagem', (data, ack) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const conversaId = data.conversa;
    if (!podeAcessar(conversaId, socket.id)) return;
    const texto = typeof data.texto === 'string' ? data.texto.trim().slice(0, MAX_MSG_LEN) : '';
    if (!texto) return;

    // O freio vem DEPOIS de validar: mensagem invalida nao gasta a cota de ninguem.
    // Recusada, a mensagem some - e o cliente e avisado (e devolve o texto pra
    // caixa), senao quem foi barrado veria a propria mensagem sumir sem saber por que.
    const ritmo = freioDeChat.tentar(player.uid);
    if (!ritmo.ok) return responder(ack, { erro: 'ritmo', esperarMs: ritmo.esperarMs });

    const mensagem = guardarMensagem(conversaId, {
      id: proximoMsgId++,
      conversa: conversaId,
      autorId: player.uid,
      autorNome: player.name,
      autorIsAdmin: player.isAdmin,
      texto,
      ts: Date.now(),
      reacoes: {},
    });

    entregar(conversaId, 'chat-mensagem', mensagem);
    responder(ack, { ok: true });
  });

  socket.on('chat-reagir', (data) => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const conversaId = data.conversa;
    if (!podeAcessar(conversaId, socket.id)) return;
    if (!EMOJIS_REACAO.includes(data.emoji)) return;
    if (!freioDeReacao.tentar(player.uid).ok) return;

    const mensagem = mensagensDe(conversaId).find((m) => m.id === data.mensagemId);
    if (!mensagem) return;

    // Guardado por uid: quem recarrega a pagina continua vendo a propria reacao.
    const quem = mensagem.reacoes[data.emoji] || [];
    const jaReagiu = quem.includes(player.uid);
    const atualizado = jaReagiu
      ? quem.filter((id) => id !== player.uid)
      : quem.concat(player.uid);

    if (atualizado.length) mensagem.reacoes[data.emoji] = atualizado;
    else delete mensagem.reacoes[data.emoji];
    salvarChat(); // a reacao tambem e conteudo: some junto se nao for gravada

    entregar(conversaId, 'chat-reacao', {
      conversa: conversaId,
      mensagemId: mensagem.id,
      reacoes: mensagem.reacoes,
    });
  });

  // Sinalizacao WebRTC para chamada por proximidade: o servidor so repassa a
  // mensagem para o destinatario certo, sem entender/guardar o conteudo (offer/
  // answer/ICE candidate) nem mediar audio/video (isso e P2P entre os navegadores).
  socket.on('rtc-signal', (data) => {
    if (!data || typeof data.to !== 'string') return;
    // Pra quem entrou pelo link da reuniao: so se os dois estao na mesma reuniao
    if (salaDeVisitas.ehVisitante(data.to)) {
      salaDeVisitas.repassarDoMembro(socket.id, players.get(socket.id), data);
      return;
    }
    if (!players.has(data.to) || !players.has(socket.id)) return;
    io.to(data.to).emit('rtc-signal', {
      from: socket.id,
      signal: data.signal,
    });
  });

  socket.on('disconnect', () => {
    repasse.delete(socket.id);
    repasse.forEach((r) => r.vistos.delete(socket.id));
    if (players.has(socket.id)) {
      const saiu = players.get(socket.id);
      players.delete(socket.id);
      avisoDePresenca(saiu.uid, saiu.name + ' saiu da sede');
      // Quem desconecta sai da chamada junto. Sem isto a lista de quem esta na
      // chamada acumularia gente que fechou a aba.
      if (saiu.chamada) {
        avisarChamadas();
        salaDeVisitas.aoMudarDeChamada(socket.id, saiu, saiu.chamada, null);
      }
      // A mesa NAO e largada aqui: ela e da conta, nao da sessao. Quem quiser
      // sair dela clica nela de novo ou usa o botao no proprio perfil.
      io.emit('player-left', { id: socket.id });
    }
  });
});

// ---- conectar o Google Agenda da propria pessoa ----
// Quem esta conectando sai da sessao, nunca de um uid mandado na URL.
app.get('/api/google/status', sessao.exigirLogin, (req, res) => {
  res.json({
    configurado: google.configurado(),
    conectado: google.conectado(req.usuario.id),
    email: google.emailConectado(req.usuario.id),
  });
});

app.get('/api/google/conectar', sessao.exigirLogin, (req, res) => {
  if (!google.configurado()) return res.status(503).send('Agenda nao configurada no servidor.');
  res.redirect(google.urlDeConsentimento(req.usuario.id));
});

// Um endereco de volta so pro Google (menos coisa pra cadastrar no Google Cloud),
// dividido entre dois fluxos: ENTRAR na sede e CONECTAR a agenda. O `state`
// assinado diz qual - e cada fluxo confere a assinatura do seu jeito.
app.get('/api/google/callback', async (req, res) => {
  if (google.tipoDoEstado(req.query.state) === 'login') return auth.concluirLoginGoogle(req, res);
  const { code, state, error } = req.query;
  if (error) return res.redirect('/?agenda=recusada');
  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.redirect('/?agenda=erro');
  }
  const r = await google.trocarCodigoPorToken(code, state);
  if (r.erro) {
    console.error('Conexao com o Google falhou:', r.erro);
    return res.redirect('/?agenda=erro');
  }
  agenda.invalidarCache();
  res.redirect('/?agenda=ok');
});

app.post('/api/google/desconectar', sessao.exigirLogin, (req, res) => {
  google.desconectar(req.usuario.id);
  agenda.invalidarCache();
  res.json({ ok: true });
});

// ---- a estante: o acervo da biblioteca ----
// Os livros vem da pasta da biblioteca no Drive (ou de DATA_DIR/livros, enquanto
// o Drive nao estiver ligado) - ver server/acervo.js e docs/estante.md.
//
// O livro chega no navegador PELO NOSSO servidor, nunca por link do Drive: a
// pasta continua privada, ninguem precisa de conta Google, e ler e baixar
// acontecem dentro da sede.

// A lista (titulo e capa) de quem esta logado.
// Nome e capa de um link do Spotify, pro mini-player (server/spotify.js). So membro, e
// com freio: cada link novo vira um pedido ao Spotify.
const freioDeSpotify = freio.criar({ max: 20, janelaMs: 60 * 1000 });
app.get('/api/spotify/:tipo/:id', sessao.exigirLogin, async (req, res) => {
  if (!spotify.valido(req.params.tipo, req.params.id)) return res.status(400).json({ erro: 'Link do Spotify invalido.' });
  if (!freioDeSpotify.tentar(req.usuario ? req.usuario.id : req.ip).ok) return res.status(429).json({ erro: 'Muitos pedidos seguidos.' });
  const r = await spotify.obter(req.params.tipo, req.params.id);
  if (!r) return res.status(404).json({ erro: 'O Spotify nao deu o nome desse link.' });
  res.json(r);
});

app.get('/api/estante', sessao.exigirLogin, async (req, res) => {
  try {
    const { origem, livros } = await acervo.listar();
    res.json({ origem, livros: livros.map(acervo.publico) });
  } catch (e) {
    console.error('[acervo]', e.message);
    res.status(502).json({ erro: 'Nao consegui ler a pasta da biblioteca agora.' });
  }
});

// O LIVRO so pra quem e da sede. O acervo e material interno (e parte dele pode
// ter direito autoral que nao permite mostrar pra fora): quem de fora entra so na
// reuniao, pelo link, e nunca chega a esta rota.
app.get('/api/estante/:id/arquivo', sessao.exigirLogin, async (req, res) => {
  try {
    const livro = await acervo.acharLivro(req.params.id);
    if (!livro) return res.status(404).json({ erro: 'Esse livro nao esta mais na estante.' });
    const baixar = req.query.baixar === '1';
    // nome com acento e espaco precisa do filename* codificado, senao o
    // navegador salva como "arquivo" ou quebra no meio
    const nomeArquivo = livro.titulo.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
    const disposicao = (baixar ? 'attachment' : 'inline') + "; filename*=UTF-8''" + encodeURIComponent(nomeArquivo);
    const aberto = await acervo.abrirArquivo(livro, req.headers.range);
    if (aberto.caminho) {
      // sendFile ja responde Range sozinho, que e o que o leitor usa pra pedir
      // so as paginas que vai mostrar
      return res.sendFile(aberto.caminho, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposicao, 'Cache-Control': 'private, max-age=300' } });
    }
    res.status(aberto.status);
    res.set(Object.assign({}, aberto.headers, { 'Content-Disposition': disposicao, 'Cache-Control': 'private, max-age=300' }));
    aberto.stream.on('error', () => res.destroy());
    // o leitor cancela pedaco que nao precisa mais (virou a pagina rapido):
    // para de puxar do Drive tambem
    res.on('close', () => aberto.stream.destroy());
    aberto.stream.pipe(res);
  } catch (e) {
    console.error('[acervo]', e.message);
    if (!res.headersSent) res.status(502).json({ erro: 'Nao consegui abrir o livro agora.' });
  }
});

app.get('/api/estante/:id/capa', sessao.exigirLogin, async (req, res) => {
  try {
    const livro = await acervo.acharLivro(req.params.id);
    const capa = livro && await acervo.abrirCapa(livro);
    if (!capa) return res.status(404).end();
    res.set(Object.assign({}, capa.headers, { 'Cache-Control': 'private, max-age=3600' }));
    capa.stream.pipe(res);
  } catch (e) {
    console.error('[acervo]', e.message);
    if (!res.headersSent) res.status(502).end();
  }
});

// ---- acervo FISICO da sala: catalogo + quem esta com cada livro ----
// Ver server/emprestimos.js.
app.get('/api/acervo-fisico', sessao.exigirLogin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    // false = sede sem acervo fisico (ACERVO_FISICO=nenhum): a tela esconde a aba
    ativo: emprestimos.ativo(),
    livros: emprestimos.listar(),
    podeDevolverDeOutros: !!req.usuario.isAdmin,
    eu: req.usuario.id,
  });
});

['pegar', 'devolver'].forEach((acao) => {
  app.post('/api/acervo-fisico/:id/' + acao, sessao.exigirLogin, (req, res) => {
    const r = emprestimos[acao](String(req.params.id), req.usuario);
    if (r.erro) return res.status(r.status || 400).json({ erro: r.erro });
    // quem esta com a estante aberta ve o livro mudar de dono na hora
    io.emit('acervo-fisico-mudou');
    res.json({ ok: true, livros: emprestimos.listar() });
  });
});

// Servidores da chamada de video (STUN, e TURN da Cloudflare se configurado).
// So logado: a credencial do TURN e banda paga por nos. Ver server/turn.js.
// Discador do CRM, dentro da sede. Ver docs/discador.md e server/discador.js:
// a sede so faz a ponte, sempre em nome da conta LOGADA e de e-mail provado.
app.get('/api/discador/estado', sessao.exigirLogin, (req, res) => {
  const r = discador.recusa(req.usuario);
  res.json({ ligado: discador.configurado(), pode: !r, motivo: r ? r.erro : null });
});

app.post('/api/discador/fila', sessao.exigirLogin, async (req, res) => {
  const r = discador.recusa(req.usuario);
  if (r) return res.status(r.status).json({ erro: r.erro });
  const resposta = await discador.fila(req.usuario, req.body && req.body.filtros);
  res.status(resposta.status).json(resposta.corpo);
});

app.post('/api/discador/ligacao', sessao.exigirLogin, async (req, res) => {
  const r = discador.recusa(req.usuario);
  if (r) return res.status(r.status).json({ erro: r.erro });
  const resposta = await discador.registrar(req.usuario, req.body && req.body.ligacao);
  res.status(resposta.status).json(resposta.corpo);
});

app.get('/api/ice', sessao.exigirLogin, async (req, res) => {
  const { iceServers, turn: comTurn } = await turn.obter();
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers, turn: comTurn });
});

// API para ler e salvar o mapa customizado através do editor visual
app.get('/api/mapa-custom', (req, res) => {
  const caminho = process.env.MAPA_ARQUIVO || path.join(__dirname, 'data', 'mapa-custom.json');
  if (fs.existsSync(caminho)) {
    try {
      const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
      return res.json({ ok: true, custom: true, mapa: dados });
    } catch (e) {
      return res.status(500).json({ ok: false, erro: e.message });
    }
  }
  res.json({
    ok: true,
    custom: false,
    mapa: {
      cols: map.COLS,
      rows: map.ROWS,
      versaoPlanta: map.VERSAO_PLANTA,
      spawnPoints: map.SPAWN_POINTS.map((p) => ({ col: p.x / map.TILE, row: p.y / map.TILE })),
      rooms: map.ROOMS,
      zonasPiso: map.ZONAS_PISO,
      tiles: map.tiles,
    },
  });
});

app.post('/api/mapa-custom', express.json({ limit: '2mb' }), (req, res) => {
  const dados = req.body;
  if (!dados || !Array.isArray(dados.tiles)) {
    return res.status(400).json({ ok: false, erro: 'Formato inválido (requer array "tiles")' });
  }

  const pasta = path.join(__dirname, 'data');
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });

  const caminho = process.env.MAPA_ARQUIVO || path.join(pasta, 'mapa-custom.json');
  dados.versaoPlanta = (Number(dados.versaoPlanta) || 10) + 1;

  try {
    const tmp = caminho + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
    fs.renameSync(tmp, caminho);
    map.carregarArquivoCustomizado(caminho);
    res.json({ ok: true, versaoPlanta: dados.versaoPlanta });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Recebe a capa que o navegador desenhou da pagina 1, pra ela ser feita UMA vez
// e nao uma vez por pessoa por abertura. Ver o porque em server/acervo.js.
//
// So quem e da sede manda: visitante nem abre o livro, entao nao teria como ter
// desenhado a pagina 1 - se ele mandar, ou nao e a capa, ou nao devia ter tido
// acesso. Nos dois casos a resposta e nao.
//
// `express.raw` so nesta rota: o resto da API e JSON, e ligar raw global faria
// toda requisicao carregar bytes que ninguem le.
app.post('/api/estante/:id/capa',
  sessao.exigirLogin,
  express.raw({ type: ['image/png', 'image/jpeg'], limit: '400kb' }),
  async (req, res) => {
    try {
      const livro = await acervo.acharLivro(req.params.id);
      if (!livro) return res.status(404).end();
      const recusa = acervo.guardarCapa(livro.id, req.body);
      // "ja tem" nao e erro: duas pessoas abrindo a estante ao mesmo tempo
      // desenham a mesma capa, e a segunda chega depois. A primeira vence e a
      // segunda nao precisa saber de nada.
      if (recusa && recusa !== 'ja tem') return res.status(400).json({ erro: recusa });
      res.json({ ok: true });
    } catch (e) {
      console.error('[acervo] capa:', e.message);
      if (!res.headersSent) res.status(500).end();
    }
  });

// Rotas de conta antes do estatico: /api/... nunca cai no index.html.
// Conta removida ou senha redefinida pela diretoria: quem esta com a sede
// aberta AGORA sai na hora, com o motivo na tela. A mesa de quem foi removido
// volta a ficar livre - senao a sede acumularia mesa presa de ex-membro.
function encerrarConta(uid, motivo) {
  io.sockets.sockets.forEach((s) => {
    if (s.data.usuarioId !== uid) return;
    s.emit('conta-encerrada', { motivo });
    s.disconnect(true);
  });
  if (motivo === 'conta-removida') {
    if (mesasStore.largarDe(uid)) io.emit('mesas-atualizadas', mesasStore.paraEnvio());
    google.desconectar(uid);
  }
}

app.use('/api', auth.criarRotas(sanitizeAppearance, { aoEncerrarConta: encerrarConta }));
// Em desenvolvimento o navegador NAO guarda nada em cache.
//
// Isto existe porque custou tempo de verdade: depois de mexer no game.js, a
// pagina continuava mostrando o desenho velho, e a conclusao facil era "a
// correcao nao funcionou" quando o problema era o arquivo antigo em cache. Em
// producao o cache continua valendo - so o modo de desenvolvimento abre mao
// dele, que e onde o arquivo muda a cada minuto.
if (sessao.SEM_LOGIN) {
  app.use((req, res, proximo) => {
    res.set('Cache-Control', 'no-store, must-revalidate');
    proximo();
  });
}
// A pagina e o manifesto saem com a MARCA da sede (server/marca.js): com uma sede
// por cliente, a tela nao pode dizer "ADM Solucoes" pra outra empresa. Vem ANTES
// da pasta estatica, senao ela entregaria o index.html cru, com os marcadores.
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(marcaDaSede.paginaInicial({ dominio: auth.DOMINIOS[0] }));
});
// O link de uma reuniao, pra quem e de fora: `/r/<token>`. A pagina e a mesma pra
// qualquer token - quem confere o link e o socket (server/visitantes.js), e a
// tela mostra o que ele responder. Assim um link errado nao diz nada a mais que
// um certo, e nao ha o que "adivinhar" por aqui.
//
// Sem cache (o link e uma credencial) e sem `Referer`: o token esta no endereco,
// e nao pode ir parar no log de nenhum site que a pessoa abra depois.
app.get(['/r/:token', '/reuniao.html'], (req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.type('html').send(marcaDaSede.paginaDeReuniao({ dominio: auth.DOMINIOS[0] }));
});
app.get('/manifest.webmanifest', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify(marcaDaSede.manifesto()));
});
// Os arquivos do logotipo. Ficam fora de public/ pra sede de cliente nao
// servir a marca da ADM nem pra quem adivinhar o endereco: aqui so responde
// quem e a sede da ADM, e so os nomes que o marca.js conhece.
app.get('/marca/:arquivo', (req, res) => {
  const caminho = marcaDaSede.caminhoDeArquivo(req.params.arquivo);
  if (!caminho) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(caminho);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// SEM_LOGIN=1: entra direto numa conta de desenvolvimento, sem a tela de login.
// A conta e criada aqui no servidor e o cliente continua sem poder dizer quem e.
function prepararContaDev() {
  const EMAIL = 'dev@local';
  let conta = usuariosStore.porEmail(EMAIL);
  if (!conta) {
    conta = usuariosStore.criar({
      nome: 'Dev',
      email: EMAIL,
      senha: require('crypto').randomBytes(24).toString('hex'), // ninguem loga por senha nessa conta
      isAdmin: true,
    });
    usuariosStore.atualizarPerfil(conta.id, { appearance: APARENCIA_DEV });
    conta = usuariosStore.porId(conta.id);
  }
  sessao.definirUsuarioDev(conta);
  prepararContaBot();
  return conta;
}

// Segunda conta de desenvolvimento, pro bot de teste (`/?bot=1`). Sem ela nao
// da pra testar chamada, divisao de tela nem conversa sozinho - e com uma conta
// so, as duas abas entrariam como "Dev" e ninguem saberia quem e quem.
function prepararContaBot() {
  const EMAIL = 'bot@local';
  let conta = usuariosStore.porEmail(EMAIL);
  if (!conta) {
    conta = usuariosStore.criar({
      nome: 'Bot',
      email: EMAIL,
      senha: require('crypto').randomBytes(24).toString('hex'),
      isAdmin: false, // o bot nao edita o mapa: um clique torto dele estragaria a sede
    });
  }
  // Aparencia bem diferente da do Dev, senao os dois bonecos ficam iguais na
  // tela e o teste de proximidade vira adivinhacao.
  usuariosStore.atualizarPerfil(conta.id, { appearance: APARENCIA_BOT });
  sessao.definirUsuarioBot(usuariosStore.porId(conta.id));
}

const APARENCIA_BOT = sanitizeAppearance({
  skin: '#8d5524', shirt: '#e0607e', bottom: '#2f7d8c', shoes: '#3a2f2a',
  hairColor: '#f0a83c', hairStyle: 'longo', glasses: true, glassesColor: '#2b3038',
});

const APARENCIA_DEV = sanitizeAppearance({
  skin: '#f1c27d', shirt: '#35bdf0', bottom: '#6a7ce0', shoes: '#2b2f38',
  hairColor: '#2b3038', hairStyle: 'curto', glasses: false, glassesColor: '#2b3038',
});

server.listen(PORT, () => {
  console.log(`Escritorio virtual ${marcaDaSede.marca.nome} rodando em http://localhost:${PORT}`);
  backup.agendar();
  console.log(`Contas cadastradas: ${usuariosStore.totalDeContas()}`);
  if (google.configurado()) {
    console.log('Google (login e agenda): registre este redirect URI no Google Cloud:');
    console.log('  ' + google.REDIRECT_URI);
    if (!process.env.SITE_URL) {
      console.log('  (veio do padrao; defina SITE_URL se o endereco for outro)');
    }
  }
  console.log(turn.configurado()
    ? 'Chamada: TURN da Cloudflare ligado.'
    : 'Chamada: so STUN (defina CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_TOKEN pra redes restritas).');
  quadros.resumo().forEach((linha) => console.log(linha));
  console.log(correio.situacao());
  if (sessao.SEM_LOGIN) {
    const dev = prepararContaDev();
    console.log(`SEM_LOGIN=1: tela de login desativada, entrando como "${dev.nome}".`);
    console.log('Isso e so pra desenvolvimento - nao suba assim.');
  }
  // Quem entra na sede, dito no arranque. Antes aqui morava um aviso de "voce
  // esta com o codigo padrao" - que era o pior tipo de aviso: um log que
  // ninguem le protegendo uma senha escrita num repositorio publico. Agora o
  // padrao nao existe, e o que sobra e informacao util.
  if (!auth.DOMINIOS.length) {
    console.log('Cria conta: ninguem pelo dominio do e-mail (DOMINIOS_SEDE vazio).');
  } else if (auth.loginGoogleLigado()) {
    console.log('Cria conta: "Entrar com o Google" pra @' + auth.DOMINIOS.join(', @'));
  } else {
    console.log('Cria conta: e-mail @' + auth.DOMINIOS.join(', @') + ' com senha ' + (correio.ligado()
      ? '(conferido pelo link que chega no e-mail)'
      : '(SEM verificacao: ligue o Google - GOOGLE_CLIENT_ID/SECRET - ou o e-mail - docs/email.md)'));
  }
  if (auth.CODIGO_SEDE) console.log('  e e-mail de fora com o codigo da sede.');
  if (auth.loginGoogleLigado() && usuariosStore.totalDeDiretoria() === 0) {
    console.log(auth.DIRETORIA_EMAILS.length
      ? 'Sem diretoria ainda: vira diretoria quem entrar com o Google sendo de DIRETORIA_EMAILS.'
      : 'Sem diretoria ainda: a PRIMEIRA pessoa a entrar com o Google vira diretoria (defina DIRETORIA_EMAILS pra escolher).');
  }
});
