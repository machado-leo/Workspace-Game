const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');

let avisosMostrados = [];
let avisosInterativos = [];

function criarMockElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    children: [],
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, v) { if (v) this._classes.add(c); else this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    style: {},
    dataset: {},
    appendChild(child) {
      this.children.push(child);
      if (child.className === 'btn-ativar-aviso') {
        avisosInterativos.push(child);
      }
    },
    querySelector(sel) {
      return this.children.find(c => c.className === sel.replace('.', '')) || null;
    },
    addEventListener(event, fn) {
      this._listener = fn;
    },
    play() { return Promise.resolve(); },
  };
}

const mockElements = {
  'aviso-camera': criarMockElement('aviso-camera'),
  'video-local': criarMockElement('video-local'),
  'preview-local': criarMockElement('preview-local'),
  'btn-camera': criarMockElement('btn-camera'),
  'btn-mic': criarMockElement('btn-mic'),
  'btn-video-toggle': criarMockElement('btn-video-toggle'),
  'btn-desligar': criarMockElement('btn-desligar'),
  'palco-remoto': criarMockElement('palco-remoto'),
  'grade-chamada': criarMockElement('grade-chamada'),
  'grade-chamada-tiles': criarMockElement('grade-chamada-tiles'),
  'grade-chamada-info': criarMockElement('grade-chamada-info'),
  'preview-local-controles': criarMockElement('preview-local-controles'),
  'btn-grade-toggle': criarMockElement('btn-grade-toggle'),
  'btn-minimizar-grade': criarMockElement('btn-minimizar-grade'),
  'btn-desligar-grade': criarMockElement('btn-desligar-grade'),
};

const contexto = {
  console,
  window: {
    addEventListener: () => {},
  },
  document: {
    body: { appendChild: () => {} },
    getElementById: (id) => mockElements[id] || null,
    createElement: (tag) => {
      const el = criarMockElement('');
      el.tag = tag;
      return el;
    },
  },
  navigator: {},
  fetch: () => Promise.resolve({ ok: false }),
  RTCPeerConnection: class {
    constructor() {
      this.connectionState = 'new';
      this.signalingState = 'stable';
    }
    getSenders() { return []; }
    addTrack() { return {}; }
    createOffer() { return Promise.resolve({ sdp: 'fake-sdp' }); }
    setLocalDescription() { return Promise.resolve(); }
    close() { this.connectionState = 'closed'; }
  },
  setTimeout: (fn) => setTimeout(fn, 1),
  clearTimeout: () => {},
  setInterval: () => {},
  Date,
  Math,
};

contexto.window.document = contexto.document;
contexto.Network = {
  avisarMidia: (ativa) => {
    contexto.ultimaMidiaAvisada = ativa;
  },
  sendRtcSignal: (to, signal) => {
    contexto.ultimosSinais = contexto.ultimosSinais || [];
    contexto.ultimosSinais.push({ to, signal });
  },
  on: () => {},
};
contexto.window.Network = contexto.Network;

vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/map.js'), 'utf8'), contexto);
contexto.window.OfficeMap = contexto.window.OfficeMap || contexto.OfficeMap;
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/calls.js'), 'utf8'), contexto);

const M = contexto.window.OfficeMap;
const Calls = contexto.window.Calls;
const TILE = M.TILE;

console.log('\nTESTES DE ATIVACAO MUTUA E AVISOS DE PROXIMIDADE');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  if (veio === esperado) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio));
}

// Encontra dois tiles livres vizinhos no mapa
let abertos = null;
for (let r = 1; r < M.ROWS - 1 && !abertos; r++) {
  for (let c = 1; c < M.COLS - 2; c++) {
    const livre = (cc, rr) => M.isWalkable(cc * TILE + TILE / 2, rr * TILE + TILE / 2);
    const sala = (cc, rr) => M.getRoomAtTile(cc, rr);
    if (!livre(c, r) || !livre(c + 1, r)) continue;
    const s1 = sala(c, r);
    const s2 = sala(c + 1, r);
    const aberta = (s) => !s || M.somDaArea(s.som).modo === 'perto';
    if (!aberta(s1) || !aberta(s2)) continue;
    abertos = [[c, r], [c + 1, r]];
    break;
  }
}

if (!abertos) {
  console.log('FALHOU: nenhum par de tiles abertos encontrado');
  process.exit(1);
}

const [A, B] = abertos;

const player1 = {
  id: 'player-1',
  name: 'Alice',
  x: A[0] * TILE + TILE / 2,
  y: A[1] * TILE + TILE / 2,
  status: 'livre',
  midiaAtiva: true,
};

const player2 = {
  id: 'player-2',
  name: 'Bob',
  x: B[0] * TILE + TILE / 2,
  y: B[1] * TILE + TILE / 2,
  status: 'livre',
  midiaAtiva: false,
};

const mapaJogadores = new Map([
  ['player-1', player1],
  ['player-2', player2],
]);

contexto.window.Game = {
  getPlayers: () => mapaJogadores,
};
contexto.Game = contexto.window.Game;

// Inicializa Alice com selfId = 'player-1'
Calls.init('player-1');

// 1. Teste: alcance fisico
conferir('Bob esta no alcance fisico de Alice', Calls.estaNoAlcanceFisico('player-2'), true);

// Injetamos getUserMedia fake para poder chamar ligarCamera
contexto.navigator.mediaDevices = {
  getUserMedia: async () => ({
    getVideoTracks: () => [{ stop() {} }],
    getAudioTracks: () => [{ stop() {} }],
    getTracks: () => [{ stop() {} }],
  }),
};

(async () => {
  const elAviso = mockElements['aviso-camera'];

  // 2. Alice liga a camera
  await Calls.ligarCamera();
  conferir('Alice ligou camera (cameraAtiva = true)', Calls.isCameraAtiva(), true);
  conferir('Alice enviou aviso de midia true para a rede', contexto.ultimaMidiaAvisada, true);

  // Bob esta inativo (midiaAtiva = false)
  Calls.updateProximity(mapaJogadores);
  conferir('Chamada nao conecta porque Bob esta inativo', Calls.getPeersConectados().length, 0);
  conferir('Aviso para Alice mostra que Bob esta com midia desligada', elAviso.textContent, 'Bob está por perto, mas com câmera e microfone desligados.');

  // 3. Agora simulamos o ponto de vista de Bob (inativo) quando Alice (ativa) se aproxima
  const contextoBob = {
    console,
    window: {},
    document: contexto.document,
    navigator: contexto.navigator,
    fetch: contexto.fetch,
    RTCPeerConnection: contexto.RTCPeerConnection,
    setTimeout: (fn) => setTimeout(fn, 1),
    clearTimeout: () => {},
    setInterval: () => {},
    Date,
    Math,
  };
  contextoBob.window.document = contextoBob.document;
  contextoBob.Network = {
    avisarMidia: (ativa) => { contextoBob.ultimaMidiaAvisada = ativa; },
    sendRtcSignal: () => {},
    on: () => {},
  };
  contextoBob.window.Network = contextoBob.Network;
  contextoBob.window.OfficeMap = M;
  contextoBob.OfficeMap = M;
  contextoBob.window.Game = contexto.window.Game;
  contextoBob.Game = contexto.Game;

  vm.createContext(contextoBob);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/calls.js'), 'utf8'), contextoBob);
  
  const CallsBob = contextoBob.window.Calls;
  CallsBob.init('player-2');

  elAviso.textContent = '';
  elAviso.children = [];
  avisosInterativos = [];

  // Bob roda updateProximity: Bob inativo, Alice ativa
  CallsBob.updateProximity(mapaJogadores);
  conferir('Chamada nao conecta para Bob', CallsBob.getPeersConectados().length, 0);
  const temBotaoInterativo = avisosInterativos.length > 0;
  conferir('Bob recebe aviso interativo com botao em destaque', temBotaoInterativo, true);
  if (temBotaoInterativo) {
    conferir('Texto do botao em destaque', avisosInterativos[0].textContent, 'Ativar câmera e microfone');
  }

  // 4. Quando Bob ativa a camera (ambos com midiaAtiva: true)
  player2.midiaAtiva = true;
  await CallsBob.ligarCamera();
  conferir('Bob ativou camera', CallsBob.isCameraAtiva(), true);

  // Agora ambos ativos, Bob roda updateProximity:
  CallsBob.updateProximity(mapaJogadores);
  await new Promise(r => setTimeout(r, 20));
  conferir('Peer connection iniciada para Alice pois ambos estao ativos', CallsBob._peers.has('player-1'), true);

  // 5. Teste da tela grande (CallGrid)
  // Carrega callgrid.js no contexto
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/callgrid.js'), 'utf8'), contexto);
  const CallGrid = contexto.window.CallGrid;
  CallGrid.init();

  // Simula conexão ativa em Alice
  const pPeer = Calls._peers.get('player-2') || {
    pc: { connectionState: 'connected' },
    videoEl: {
      srcObject: {
        getVideoTracks: () => [{ enabled: true, readyState: 'live' }],
      },
    },
  };
  Calls._peers.set('player-2', pPeer);

  // Abre tela grande
  CallGrid.abrir();
  conferir('CallGrid esta ativo', CallGrid.estaAtivo(), true);

  const tileSelf = mockElements['grade-chamada-tiles'].children.find(c => c.id === 'chamada-tile-self');
  conferir('Tile local (Voce) criado na grade', !!tileSelf, true);

  const videoSelf = tileSelf ? tileSelf.children.find(c => c.id === 'video-grade-self') : null;
  conferir('Video local criado e com midia na grade', !!(videoSelf && videoSelf.srcObject), true);

  const tileBob = mockElements['grade-chamada-tiles'].children.find(c => c.className === 'chamada-tile');
  conferir('Tile de Bob criado na grade', !!tileBob, true);

  const videoBob = tileBob ? tileBob.children.find(c => c.tag === 'video') : null;
  conferir('Video de Bob criado com muted=true (evita bloqueio de autoplay)', !!(videoBob && videoBob.muted), true);
  conferir('Video de Bob tem stream remoto atribuido', !!(videoBob && videoBob.srcObject), true);

  console.log(`\n${ok} passaram, ${falhou} falharam\n`);
  if (falhou > 0) process.exit(1);
})();
