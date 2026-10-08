// O motor de chamada (public/js/calls.js) com visitante de reuniao e com
// reconexao. Ver docs/plano-reuniao-por-link.md.
//
// Tres coisas que quebram calado, e por isso ficam aqui:
//
//   1. O `init` do jogo chega DE NOVO a cada reconexao (servidor reiniciado, rede
//      que volta): antes cada volta empilhava um ouvinte de sinalizacao e um
//      clique em cada botao - o do microfone passava a "desligar e ligar" e parecia
//      morto. Achado depois de reiniciar o servidor com uma chamada aberta.
//   2. O visitante nao esta no mapa (nao tem boneco nem posicao). So entra na
//      conta se estiver na MESMA chamada que eu - e sai dela quando eu saio.
//   3. A pagina do visitante nao tem cookie: a lista de servidores ICE vem de
//      `Network.pedirIce`, e nao de /api/ice.
//
// Roda o calls.js de verdade, com o WebRTC trocado por um de mentira.
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

// ----------------------------------------------------------------- o ambiente
const cliques = {};          // id do botao -> quantos ouvintes de clique
const buscas = [];           // o que o calls.js buscou por fetch
const sinais = [];           // { para, tipo }
const conexoes = [];         // { config, fechada }
const ouvintesDeRede = {};   // evento -> quantos ouvintes

const elemento = (id) => new Proxy({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {} }, {
  get: (alvo, k) => {
    if (k === 'addEventListener') return (tipo) => { if (tipo === 'click') cliques[id] = (cliques[id] || 0) + 1; };
    if (k === 'appendChild') return (el) => el;
    return k in alvo ? alvo[k] : () => {};
  },
  set: (alvo, k, v) => { alvo[k] = v; return true; },
});

class ConexaoDeMentira {
  constructor(config) {
    this.config = config;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.senders = [];
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

function criar(comPedirIce) {
  cliques.length = 0;
  Object.keys(cliques).forEach((k) => delete cliques[k]);
  Object.keys(ouvintesDeRede).forEach((k) => delete ouvintesDeRede[k]);
  conexoes.length = 0;
  buscas.length = 0;
  sinais.length = 0;
  const jogadores = new Map();
  const rede = {
    on(evento) { ouvintesDeRede[evento] = (ouvintesDeRede[evento] || 0) + 1; },
    sendRtcSignal(para, sinal) { sinais.push({ para, tipo: sinal.type }); },
  };
  if (comPedirIce) rede.pedirIce = () => Promise.resolve({ iceServers: [{ urls: 'turn:relay.teste' }] });
  const contexto = {
    console, setTimeout, clearTimeout, setInterval: () => 0,
    fetch: (url) => { buscas.push(url); return Promise.resolve({ ok: false }); },
    RTCPeerConnection: ConexaoDeMentira,
    window: { dispatchEvent() {} },
    document: { getElementById: (id) => elemento(id), createElement: () => elemento('novo') },
    navigator: { mediaDevices: {} },
    Network: rede,
    CustomEvent: function () {},
  };
  contexto.window.document = contexto.document;
  contexto.window.Network = rede;
  contexto.window.Game = { getPlayers: () => jogadores };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/calls.js'), 'utf8'), contexto);
  return { Calls: contexto.window.Calls, jogadores };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  console.log('\nCHAMADA: RECONEXAO E VISITANTE DE REUNIAO');

  // ------------------------------------------- init chega de novo (reconexao)
  {
    const { Calls } = criar(false);
    Calls.usarStreamDaEntrada(stream, {});
    Calls.init('socket-1');
    const depoisDaPrimeira = { rede: ouvintesDeRede['rtc-signal'], botoes: { ...cliques } };
    Calls.init('socket-2');   // o servidor reiniciou: a pessoa ganhou outro id
    Calls.init('socket-3');
    conferir('o init da primeira vez liga UM ouvinte de sinal e UM clique por botao',
      [depoisDaPrimeira.rede, depoisDaPrimeira.botoes['btn-camera'], depoisDaPrimeira.botoes['btn-mic'], depoisDaPrimeira.botoes['btn-video-toggle']],
      [1, 1, 1, 1]);
    conferir('reconectar (o init chega de novo) NAO empilha ouvinte de sinal', ouvintesDeRede['rtc-signal'], 1);
    conferir('  nem clique no botao de camera', cliques['btn-camera'], 1);
    conferir('  nem no de microfone (senao um clique "desligava e ligava")', cliques['btn-mic'], 1);
    conferir('  nem no de video', cliques['btn-video-toggle'], 1);
    conferir('  e buscou os servidores ICE uma vez so', buscas.filter((u) => u === '/api/ice').length, 1);
  }

  // O id novo vale: quem chega com outro id passa a ser "eu" no mapa
  {
    const { Calls, jogadores } = criar(false);
    Calls.usarStreamDaEntrada(stream, {});
    Calls.init('velho');
    Calls.init('novo');
    jogadores.set('novo', { id: 'novo', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    jogadores.set('colega', { id: 'colega', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    Calls.updateProximity(jogadores);
    await esperar(20);
    conferir('depois de reconectar, a chamada marcada volta a abrir com o id novo',
      sinais.filter((s) => s.para === 'colega' && s.tipo === 'offer').length, 1);
  }

  // ------------------------------------------------ visitante da mesma chamada
  {
    const { Calls, jogadores } = criar(false);
    Calls.usarStreamDaEntrada(stream, {});
    Calls.init('eu');
    const eu = { id: 'eu', x: 100, y: 100, chamada: { id: 'reuniao:1', titulo: 'Entrevista' } };
    jogadores.set('eu', eu);
    // Na vida real o visitante nao tem posicao. Aqui ele ganha uma, EXATAMENTE em cima
    // de mim: se o filtro "so da minha chamada" saisse, a regra de proximidade
    // (perto = conversa) o ligaria a mim - e e isso que o teste pega.
    const visitante = (id, chamada, dividindo) => ({
      id, name: id + ' (visitante)', chamada: { id: chamada, titulo: '' }, appearance: { skin: '#5b8def' },
      dividindoTela: !!dividindo, isAdmin: false, x: 100, y: 100,
    });
    Calls.definirVisitantes(new Map([
      ['v-da-minha', visitante('v-da-minha', 'reuniao:1')],
      ['v-de-outra', visitante('v-de-outra', 'reuniao:2')],
    ]));

    Calls.updateProximity(jogadores);
    await esperar(20);
    conferir('o visitante da MINHA chamada recebe oferta (mesmo sem estar no mapa)',
      sinais.filter((s) => s.para === 'v-da-minha' && s.tipo === 'offer').length, 1);
    conferir('o visitante de OUTRA reuniao nao', sinais.filter((s) => s.para === 'v-de-outra').length, 0);
    conferir('  e o resto do mapa nem foi consultado (visitante nao tem posicao)', conexoes.length, 1);

    conferir('a grade sabe o nome dele (nao esta no mapa)', (Calls.jogadorDe('v-da-minha') || {}).name, 'v-da-minha (visitante)');
    conferir('  e quem nao existe, nao', Calls.jogadorDe('ninguem'), null);
    conferir('  quem esta no mapa continua vindo do mapa', Calls.jogadorDe('eu'), eu);

    // ele divide a tela: a chamada grande precisa saber (so aparece quem apresenta)
    Calls.definirVisitantes(new Map([['v-da-minha', visitante('v-da-minha', 'reuniao:1', true)]]));
    Calls._peers.get('v-da-minha').pc.connectionState = 'connected';
    Calls._peers.get('v-da-minha').videoEl = { volume: 1, readyState: 4, videoWidth: 640, srcObject: {}, remove() {} };
    conferir('quem apresenta a tela e reconhecido mesmo sendo visitante', Calls.temVideoRemoto('v-da-minha'), true);

    // sai da lista: a conexao cai
    Calls.definirVisitantes(new Map());
    Calls.updateProximity(jogadores);
    conferir('o visitante saiu da reuniao: a conexao dele e derrubada', conexoes[0].fechada === true, true);
    conferir('  e some da lista de conexoes', Calls._peers.has('v-da-minha'), false);
  }

  // Eu saio da chamada: os visitantes saem da conta junto
  {
    const { Calls, jogadores } = criar(false);
    Calls.usarStreamDaEntrada(stream, {});
    Calls.init('eu');
    const eu = { id: 'eu', x: 100, y: 100, chamada: { id: 'reuniao:1' } };
    jogadores.set('eu', eu);
    Calls.definirVisitantes(new Map([['v1', { id: 'v1', name: 'V', chamada: { id: 'reuniao:1' }, dividindoTela: false }]]));
    Calls.updateProximity(jogadores);
    await esperar(20);
    conferir('na chamada: abre a conexao com o visitante', conexoes.length, 1);
    eu.chamada = null;
    Calls.updateProximity(jogadores);
    conferir('saiu da chamada: a conexao com o visitante cai (ele nao esta no mapa, nao ha "perto")', conexoes[0].fechada === true, true);
    conferir('  e nao abre outra', conexoes.length, 1);

    eu.chamada = { id: 'reuniao:1' };
    Calls.updateProximity(jogadores);
    await esperar(20);
    conferir('entrou de novo: a conexao volta', conexoes.length, 2);

    // outra chamada (o grupo #geral): o visitante da reuniao nao vem junto
    eu.chamada = { id: 'canal:geral' };
    Calls.updateProximity(jogadores);
    conferir('em outra chamada, o visitante da reuniao nao conta', conexoes[1].fechada === true, true);
  }

  // ---------------------------------------- ICE sem cookie (pagina do visitante)
  {
    const { Calls, jogadores } = criar(true);
    Calls.usarStreamDaEntrada(stream, {});
    Calls.init('eu');
    conferir('com `Network.pedirIce` (pagina sem cookie) o calls.js nao busca /api/ice', buscas.filter((u) => u === '/api/ice').length, 0);
    await esperar(30);
    jogadores.set('eu', { id: 'eu', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    jogadores.set('membro', { id: 'membro', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    Calls.updateProximity(jogadores);
    await esperar(30);
    conferir('  e as conexoes nascem com os servidores que vieram junto (o TURN)',
      conexoes.length === 1 && JSON.stringify(conexoes[0].config.iceServers), JSON.stringify([{ urls: 'turn:relay.teste' }]));
  }

  // fecharConexoes: a pagina do visitante derruba tudo ao voltar de uma queda
  {
    const { Calls, jogadores } = criar(false);
    Calls.usarStreamDaEntrada(stream, {});
    Calls.init('eu');
    jogadores.set('eu', { id: 'eu', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    jogadores.set('a', { id: 'a', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    jogadores.set('b', { id: 'b', x: 0, y: 0, chamada: { id: 'reuniao:1' } });
    Calls.updateProximity(jogadores);
    await esperar(20);
    Calls.fecharConexoes();
    conferir('fecharConexoes derruba todas', [conexoes.length, conexoes.every((c) => c.fechada), Calls._peers.size], [2, true, 0]);
  }

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
