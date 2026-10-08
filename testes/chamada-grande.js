// Chamada grande (public/js/calls.js): passou de 6 pessoas, as cameras saem do
// ar e fica a voz - senao a malha P2P (cada um mandando video pra cada um)
// derruba a chamada inteira. Compartilhar tela continua.
//
// Roda o calls.js de verdade com conexoes falsas: conta quem parou de mandar
// camera e o que a grade mostra.
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

// elemento de mentira: aceita qualquer coisa que o calls.js faca com ele
const elemento = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {} }, style: {} }, {
  get: (alvo, k) => (k in alvo ? alvo[k] : () => {}),
});
const avisos = [];
const camera = { kind: 'video', enabled: true, stop() {} };
const microfone = { kind: 'audio', enabled: true, stop() {} };
const stream = { getAudioTracks: () => [microfone], getVideoTracks: () => [camera], getTracks: () => [microfone, camera] };
const jogadores = new Map();

const contexto = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
  fetch: () => Promise.resolve({ ok: false }),
  window: { dispatchEvent() {} },
  document: {
    getElementById: (id) => (id === 'aviso-camera'
      ? { classList: { add() {}, remove() {} }, set textContent(v) { avisos.push(v); } }
      : elemento()),
    createElement: () => elemento(),
  },
  navigator: { mediaDevices: {} },
  Network: { on() {}, sendRtcSignal() {} },
  CustomEvent: function () {},
};
contexto.window.document = contexto.document;
contexto.window.Game = { getPlayers: () => jogadores };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/calls.js'), 'utf8'), contexto);
const Calls = contexto.window.Calls;

Calls.usarStreamDaEntrada(stream, {});
Calls.init('eu');

// conexao falsa, ja mandando a camera
function conexao(id) {
  const sender = { track: camera, trocas: [], replaceTrack(t) { this.track = t; this.trocas.push(t ? t.kind : null); } };
  const p = {
    pc: {
      signalingState: 'stable', connectionState: 'connected',
      getSenders: () => [{ track: microfone }, sender], addTrack: () => sender,
      createOffer: async () => ({ sdp: '' }), setLocalDescription: async () => {},
    },
    videoEl: { volume: 1, readyState: 4, videoWidth: 640, srcObject: {} },
    videoSender: sender, remoteDescDefinida: true, candidatosPendentes: [], nascidoEm: Date.now(),
  };
  Calls._peers.set(id, p);
  jogadores.set(id, { id, dividindoTela: false });
  return p;
}
function tirar(id) { Calls._peers.delete(id); }

console.log('\nCHAMADA GRANDE');

const ids = ['a', 'b', 'c', 'd', 'e'];
const conexoes = ids.map(conexao);
Calls._ajustarChamadaGrande();
conferir('6 pessoas (eu + 5): continua com camera', Calls.emChamadaGrande(), false);
conferir('  ninguem parou de mandar video', conexoes.every((p) => p.videoSender.track === camera), true);

conexoes.push(conexao('f'));
Calls._ajustarChamadaGrande();
conferir('7 pessoas: vira so voz', Calls.emChamadaGrande(), true);
conferir('  a camera para de ir pra TODAS as conexoes', conexoes.every((p) => p.videoSender.track === null), true);
conferir('  o microfone continua', conexoes.every((p) => p.pc.getSenders()[0].track === microfone), true);
conferir('  e a pessoa e avisada do porque', /mais de 6 pessoas/.test(avisos[avisos.length - 1] || ''), true);
conferir('  a grade mostra a inicial, nao o quadro congelado', Calls.temVideoRemoto('a'), false);
conferir('  a propria camera tambem sai da grade', Calls.temVideoLocal(), false);

jogadores.get('b').dividindoTela = true;
conferir('  mas quem esta apresentando a tela continua aparecendo', Calls.temVideoRemoto('b'), true);
jogadores.get('b').dividindoTela = false;

tirar('f');
Calls._ajustarChamadaGrande();
conferir('caiu pra 6: continua so voz (folga, pra nao piscar)', Calls.emChamadaGrande(), true);

tirar('e');
Calls._ajustarChamadaGrande();
conferir('caiu pra 5: as cameras voltam', Calls.emChamadaGrande(), false);
conferir('  e voltam a ir pras conexoes', conexoes.slice(0, 4).every((p) => p.videoSender.track === camera), true);
conferir('  com aviso', /cameras voltaram/.test(avisos[avisos.length - 1] || ''), true);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
