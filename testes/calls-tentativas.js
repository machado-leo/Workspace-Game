// Quem nunca atende: o calls.js nao pode ficar refazendo a conexao com a mesma
// pessoa a cada 12 segundos pra sempre.
//
// Medido de verdade (comparativo com o Gather, parte 1): dois bonecos que nunca
// respondiam, e o app fechou ~30 conexoes em ~7 minutos com quem estava perto -
// cada uma com oferta, candidatos ICE e uma conexao nova. Sinalizacao e CPU
// gastos com quem nao vai atender (aba parada, sem camera, rede que nao passa).
//
// Agora cada falha seguida com a MESMA pessoa dobra a espera: 15 s, 30 s, 60 s...
// ate 5 min. Conectar (ou ela sair do mapa) zera.
//
// Roda o calls.js de verdade, com o WebRTC e o RELOGIO de mentira.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const bate = JSON.stringify(veio) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio)));
  bate ? ok++ : falhou++;
}

let tempo = 1_000_000;                    // o relogio que o calls.js enxerga
const sinais = [];                        // { para, tipo }
const conexoes = [];

const elemento = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {} }, {
  get: (alvo, k) => (k in alvo ? alvo[k] : () => {}),
  set: (alvo, k, v) => { alvo[k] = v; return true; },
});

class ConexaoDeMentira {
  constructor() {
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.senders = [];
    this.nasceuEm = tempo;
    conexoes.push(this);
  }
  getSenders() { return this.senders; }
  addTrack(track) { const s = { track, replaceTrack() {} }; this.senders.push(s); return s; }
  async createOffer() { return { type: 'offer', sdp: 'oferta' }; }
  async setLocalDescription() {}
  close() { this.fechada = true; this.connectionState = 'closed'; }
}

const camera = { kind: 'video', enabled: true, stop() {} };
const microfone = { kind: 'audio', enabled: true, stop() {} };
const stream = { getAudioTracks: () => [microfone], getVideoTracks: () => [camera], getTracks: () => [microfone, camera] };
const jogadores = new Map();

const contexto = {
  console, setTimeout, clearTimeout, setInterval: () => 0,
  Date: { now: () => tempo },
  fetch: () => Promise.resolve({ ok: false }),
  RTCPeerConnection: ConexaoDeMentira,
  window: { dispatchEvent() {} },
  document: { getElementById: () => elemento(), createElement: () => elemento() },
  navigator: { mediaDevices: {} },
  Network: { on() {}, sendRtcSignal(para, sinal) { sinais.push({ para, tipo: sinal.type }); } },
  CustomEvent: function () {},
};
contexto.window.document = contexto.document;
contexto.window.Game = { getPlayers: () => jogadores };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/calls.js'), 'utf8'), contexto);
const Calls = contexto.window.Calls;

Calls.usarStreamDaEntrada(stream, {});
Calls.init('eu');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Os dois na MESMA chamada marcada: dispensa o mapa (distancia, parede, sala) e
// deixa so a regra que este teste guarda.
const chamada = { id: 'reuniao:1', titulo: 'x' };
jogadores.set('eu', { id: 'eu', x: 0, y: 0, chamada });
jogadores.set('mudo', { id: 'mudo', x: 0, y: 0, chamada });

// passa o tempo e roda o laco do jogo uma vez
async function avancar(segundos) {
  tempo += segundos * 1000;
  Calls.updateProximity(jogadores);
  await esperar(5);   // o iniciarChamada e assincrono
}

const ofertasPara = (id) => sinais.filter((s) => s.para === id && s.tipo === 'offer').length;

(async function () {
  console.log('\nCHAMADA: QUEM NUNCA ATENDE');

  await avancar(0);
  conferir('a primeira tentativa sai na hora', ofertasPara('mudo'), 1);
  conferir('  e nada de outra enquanto a conexao esta "quase la" (paciencia de 12 s)', (await avancar(5), ofertasPara('mudo')), 1);

  // Falha 1: a paciencia acaba, a conexao cai, e a espera e de 15 s
  await avancar(8);   // t = 13 s
  conferir('passou a paciencia: a conexao cai', conexoes[0].fechada === true, true);
  conferir('  e NAO e refeita no quadro seguinte (era o bug: refazia sempre)', ofertasPara('mudo'), 1);
  await avancar(10);  // t = 23 s
  conferir('  nem 10 s depois', ofertasPara('mudo'), 1);
  await avancar(5);   // t = 28 s: 15 s depois da queda
  conferir('  15 s depois da queda ela tenta de novo', ofertasPara('mudo'), 2);

  // Falha 2: espera de 30 s
  await avancar(13);  // a segunda tambem nunca conectou
  conferir('a segunda tambem cai', conexoes[1].fechada === true, true);
  await avancar(29);
  conferir('  desta vez a espera dobrou: 29 s depois ainda nada', ofertasPara('mudo'), 2);
  await avancar(2);
  conferir('  e com 30 s tenta a terceira', ofertasPara('mudo'), 3);

  // Falhas seguintes: 60, 120, 240 e o teto de 300 s
  const esperas = [60, 120, 240, 300, 300];
  let tentativas = 3;
  for (const s of esperas) {
    await avancar(13);                       // cai
    await avancar(s - 1);
    const antes = ofertasPara('mudo');
    await avancar(2);
    conferir('espera de ' + s + ' s: ' + (s - 1) + ' s depois ainda nada, e com ' + s + ' s tenta',
      [antes, ofertasPara('mudo')], [tentativas, tentativas + 1]);
    tentativas += 1;
  }
  await avancar(13);
  await avancar(299);
  conferir('o teto e 5 minutos: nao passa disso mesmo depois de muitas falhas', ofertasPara('mudo'), tentativas);
  await avancar(2);
  conferir('  e com 300 s tenta', ofertasPara('mudo'), tentativas + 1);
  tentativas += 1;

  // ------------------------------------------------ cada pessoa tem a sua espera
  jogadores.set('outro', { id: 'outro', x: 0, y: 0, chamada });
  await avancar(0);
  conferir('uma pessoa NOVA nao herda a espera de quem nunca atende', ofertasPara('outro'), 1);

  // ---------------------------------------------- conectar zera a espera
  const dele = conexoes[conexoes.length - 1];   // a do "outro"
  dele.connectionState = 'connected';
  dele.onconnectionstatechange();
  conferir('conectou: a conexao fica', dele.fechada === undefined, true);
  dele.connectionState = 'disconnected';        // a rede dele caiu depois de conectar
  dele.onconnectionstatechange();
  await avancar(1);
  conferir('quem CONECTOU e depois caiu nao entra na espera: reconecta na hora (falha de rede != "nunca atende")',
    ofertasPara('outro'), 2);

  // Conectar zera a CONTA, e nao so a espera: depois de falhar duas vezes e conectar
  // na terceira, a proxima falha volta a valer 15 s (e nao 60 s, a quarta da fila).
  jogadores.set('irregular', { id: 'irregular', x: 0, y: 0, chamada });
  await avancar(0);                       // 1a tentativa
  await avancar(13);                      // cai (falha 1)
  await avancar(15);                      // 2a tentativa
  await avancar(13);                      // cai (falha 2)
  await avancar(30);                      // 3a tentativa
  const deles = sinais.filter((x) => x.para === 'irregular' && x.tipo === 'offer').length;
  conferir('(o "irregular" ja falhou duas vezes e esta na terceira tentativa)', deles, 3);
  const terceira = conexoes[conexoes.length - 1];
  terceira.connectionState = 'connected';
  terceira.onconnectionstatechange();     // conectou: zera a conta
  terceira.connectionState = 'disconnected';
  terceira.onconnectionstatechange();     // e caiu depois (rede)
  await avancar(1);
  conferir('  conectou e caiu: reconecta na hora', sinais.filter((x) => x.para === 'irregular' && x.tipo === 'offer').length, 4);
  await avancar(13);                      // a 4a nunca conecta: cai
  await avancar(14);
  const antes = sinais.filter((x) => x.para === 'irregular' && x.tipo === 'offer').length;
  await avancar(2);
  conferir('  e a proxima falha vale 15 s de espera (a conta zerou ao conectar - nao 60 s)',
    [antes, sinais.filter((x) => x.para === 'irregular' && x.tipo === 'offer').length], [4, 5]);
  jogadores.delete('irregular');

  // ---------------------------------- quem sai do mapa leva a espera junto
  jogadores.delete('mudo');
  await avancar(1);
  jogadores.set('mudo', { id: 'mudo', x: 0, y: 0, chamada });
  const antesDeVoltar = ofertasPara('mudo');
  await avancar(1);
  conferir('saiu do mapa e voltou (ex.: outro id, mesma pessoa): a espera nao vale mais', ofertasPara('mudo'), antesDeVoltar + 1);

  // ---------------------- a conexao velha nao derruba a nova (evento tardio)
  const nova = conexoes[conexoes.length - 1];
  const totalAntes = conexoes.length;
  // um evento "closed" chegando de uma conexao ANTIGA do mesmo id nao pode fechar a atual
  const velha = conexoes.find((c) => c.fechada === true && typeof c.onconnectionstatechange === 'function');
  velha.connectionState = 'failed';
  velha.onconnectionstatechange();
  conferir('evento tardio de uma conexao ja trocada nao derruba a conexao nova do mesmo id',
    [nova.fechada === true, conexoes.length], [false, totalAntes]);

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
