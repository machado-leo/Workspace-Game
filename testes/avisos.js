// Regras dos avisos (public/js/avisos.js): o que chama a pessoa e o que nao.
//
// O erro caro aqui e nos dois sentidos. Avisar de menos e o bug original (DM
// chegando em silencio numa aba escondida). Avisar de mais e pior a medio prazo:
// um #geral movimentado vira sirene, a pessoa silencia tudo e perde tambem o que
// importa. Por isso os casos de "NAO avisa" pesam tanto quanto os de "avisa".
//
// Roda o arquivo de verdade num navegador de mentira: document, Network, Chat e
// Game falsos, contando titulo e notificacoes.
const fs = require('fs');
const path = require('path');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const bate = JSON.stringify(veio) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio)));
  bate ? ok++ : falhou++;
}

const EU = 'uid-eu';
const estado = { escondida: true, focada: false, vendo: null, notificacoes: [], estouEmChamada: null };
const ouvintes = {};
const ouvintesJanela = {};

global.document = {
  title: 'Sede',
  get hidden() { return estado.escondida; },
  hasFocus: () => estado.focada,
  addEventListener: () => {},
  getElementById: () => null,
};
global.window = {
  addEventListener: (ev, fn) => { ouvintesJanela[ev] = fn; },
  focus: () => {},
  AudioContext: undefined,
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.navigator = {};
global.Notification = function (titulo, opcoes) { estado.notificacoes.push({ titulo, corpo: opcoes.body }); };
global.Notification.permission = 'granted';
global.window.Notification = global.Notification;
global.Network = { on: (ev, fn) => { ouvintes[ev] = fn; } };
global.Game = {
  getSelfUid: () => EU,
  getSelfId: () => 'sock-eu',
  getPlayers: () => new Map([['sock-eu', { name: 'Ana Clara' }], ['sock-bia', { name: 'Bia' }]]),
};
global.window.Chat = global.Chat = {
  estaVendo: (c) => estado.vendo === c,
  nomeDaConversa: (c) => c.replace('canal:', ''),
  abrir: () => {},
};
global.window.Chamada = global.Chamada = { estouEm: () => estado.estouEmChamada };
global.setTimeout = () => 0;

eval(fs.readFileSync(path.join(__dirname, '../public/js/avisos.js'), 'utf8'));
window.Avisos.init();

const chegar = (msg) => ouvintes['chat-mensagem'](msg);
const conectar = (id) => ouvintesJanela['sede:chamada-conectou']({ detail: { id } });
function rodada(fn) {
  estado.notificacoes = [];
  document.title = 'Sede';
  fn();
  return estado.notificacoes.map((n) => n.titulo);
}

console.log('\nAVISOS');

// ------------------------------------------------------- aba escondida
conferir('DM de outra pessoa: avisa',
  rodada(() => chegar({ conversa: 'dm:uid-bia|uid-eu', autorId: 'uid-bia', autorNome: 'Bia', texto: 'oi' })), ['Bia']);
conferir('  e o titulo da aba ganha o contador', document.title, '(1) Sede');

conferir('mensagem comum de canal: NAO avisa',
  rodada(() => chegar({ conversa: 'canal:geral', autorId: 'uid-bia', autorNome: 'Bia', texto: 'bom dia time' })), []);
conferir('mencao pelo primeiro nome, sem acento: avisa',
  rodada(() => chegar({ conversa: 'canal:geral', autorId: 'uid-bia', autorNome: 'Bia', texto: 'e ai @ana, viu?' })),
  ['Bia mencionou voce em #geral']);
conferir('mencao a outra pessoa com nome parecido: NAO avisa',
  rodada(() => chegar({ conversa: 'canal:geral', autorId: 'uid-bia', autorNome: 'Bia', texto: '@anabela pode ver?' })), []);
conferir('a minha propria mensagem: NAO avisa',
  rodada(() => chegar({ conversa: 'dm:uid-bia|uid-eu', autorId: EU, autorNome: 'Ana Clara', texto: 'oi' })), []);
conferir('aviso de sistema comum (entrou na sede): NAO avisa',
  rodada(() => chegar({ conversa: 'canal:geral', autorId: null, sistema: true, texto: 'Bia entrou na sede' })), []);
conferir('convite de chamada no canal: avisa',
  rodada(() => chegar({ conversa: 'canal:comercial', autorId: null, sistema: true, chamada: 'canal:comercial', texto: 'Bia comecou uma chamada' })),
  ['Chamada no #comercial']);
estado.estouEmChamada = { id: 'canal:comercial' };
conferir('  mas nao pra quem ja esta nessa chamada',
  rodada(() => chegar({ conversa: 'canal:comercial', autorId: null, sistema: true, chamada: 'canal:comercial', texto: 'x' })), []);
estado.estouEmChamada = null;

conferir('alguem chegou perto e a chamada abriu: avisa com o nome',
  rodada(() => conectar('sock-bia')), ['Bia esta falando com voce']);
conferir('  a segunda em menos de um minuto: NAO avisa de novo',
  rodada(() => conectar('sock-bia')), []);

// ---------------------------------------------------------- aba na frente
estado.escondida = false;
estado.focada = true;
conferir('aba na frente: sem notificacao do sistema (so som e badge)',
  rodada(() => chegar({ conversa: 'dm:uid-bia|uid-eu', autorId: 'uid-bia', autorNome: 'Bia', texto: 'oi' })), []);
conferir('  e o titulo nao ganha contador', document.title, 'Sede');

// ------------------------------------------------------------- permissao
estado.escondida = true;
estado.focada = false;
Notification.permission = 'denied';
conferir('sem permissao do navegador: nao tenta notificar (nem quebra)',
  rodada(() => chegar({ conversa: 'dm:uid-bia|uid-eu', autorId: 'uid-bia', autorNome: 'Bia', texto: 'oi' })), []);
conferir('  mas o titulo ainda avisa', /^\(\d\) Sede$/.test(document.title), true);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
