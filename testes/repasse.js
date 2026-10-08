// O repasse de movimento: cada um recebe so o que precisa ver.
// Ver o bloco "repasse de movimento" em server/index.js.
//
// O que este teste guarda:
//   - quem esta NA TELA chega no ritmo cheio, em pacote ('players-moved');
//   - quem esta LONGE chega devagar - mas chega: a posicao final sempre vem;
//   - cliente antigo (sem 'vista') continua recebendo do jeito antigo;
//   - o estado do repasse NAO vaza pro `init` (que leva o player inteiro).
//
// Servidor de verdade, com SEM_LOGIN=1 so pra nao precisar criar contas.
// NAO mexe em server/data: DATA_DIR numa pasta temporaria, apagada no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PORTA = 3721;
const BASE = 'http://127.0.0.1:' + PORTA;
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-repasse-'));

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

let servidor = null;
function subir() {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), NODE_ENV: 'test', SEM_LOGIN: '1',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '',
        TRELLO_BOARD_ID: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', BACKUP_DRIVE_PASTA: '', BACKUP_CHAVE: '',
      }),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let erro = '';
    servidor.stderr.on('data', (b) => { erro += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude').then((r) => (r.ok ? resolve() : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

function parar() {
  return new Promise((resolve) => {
    // morto por sinal (o kill), o exitCode fica null e quem diz e o signalCode
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

// Socket.io "na unha" (engine.io 4 por WebSocket). Guarda cada evento com a
// hora em que chegou.
function conectar({ vista } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket');
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 5000);
    let init = null;
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) { ws.send('40'); return; }
      if (m === '2') { ws.send('3'); return; }
      if (m.startsWith('40')) {
        ws.send('42' + JSON.stringify(['join', { name: 'Teste' }]));
        if (vista) ws.send('42' + JSON.stringify(['vista', vista]));
        return;
      }
      if (!m.startsWith('42')) return;
      let e;
      try { e = JSON.parse(m.slice(2)); } catch (x) { return; }
      eventos.push({ nome: e[0], dados: e[1], t: Date.now() });
      if (e[0] === 'init' && !init) {
        init = e[1];
        clearTimeout(prazo);
        resolve({ ws, eventos, init, id: init.selfId });
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const andar = (cliente, x, y) => cliente.ws.send('42' + JSON.stringify(['move', { x, y, dir: 'down', moving: true }]));

// Todas as posicoes que um cliente recebeu de alguem, nos dois formatos.
function posicoesDe(cliente, idDoOutro, desde) {
  const saida = [];
  cliente.eventos.filter((e) => e.t >= desde).forEach((e) => {
    if (e.nome === 'player-moved' && e.dados.id === idDoOutro) saida.push(e.dados);
    if (e.nome === 'players-moved') e.dados.filter((d) => d.id === idDoOutro).forEach((d) => saida.push(d));
  });
  return saida;
}

(async function () {
  console.log('\nREPASSE DE MOVIMENTO: cada um recebe so o que precisa ver');
  try {
    await subir();
    // A: cliente novo, com tela pequena (400x300 px do mapa) e parado.
    const A = await conectar({ vista: { w: 400, h: 300 } });
    // C: cliente ANTIGO, sem 'vista'.
    const C = await conectar();
    // B: quem anda.
    const B = await conectar({ vista: { w: 400, h: 300 } });
    await espera(300);

    const eu = A.init.players.find((p) => p.id === A.id);
    conferir('o init NAO leva o estado do repasse (ele vai pra todo mundo)',
      A.init.players.some((p) => 'vistos' in p || 'pacote' in p || 'seq' in p || 'vista' in p), false);

    // ---- perto: B anda do lado de A, dentro da tela de A
    let t0 = Date.now();
    for (let i = 0; i < 10; i++) { andar(B, eu.x + 10 + i * 4, eu.y); await espera(100); }
    await espera(200);
    const pertoA = posicoesDe(A, B.id, t0);
    conferir('perto: chega no ritmo cheio (10 posicoes em 1 s)', pertoA.length >= 9, true);
    conferir('  e em PACOTE pro cliente novo',
      A.eventos.some((e) => e.t >= t0 && e.nome === 'players-moved') && !A.eventos.some((e) => e.t >= t0 && e.nome === 'player-moved'), true);
    conferir('  e a ultima posicao certa', pertoA.length && pertoA[pertoA.length - 1].x, eu.x + 10 + 9 * 4);

    const pertoC = posicoesDe(C, B.id, t0);
    conferir('cliente ANTIGO continua recebendo tudo, uma mensagem por posicao',
      [pertoC.length >= 9, C.eventos.some((e) => e.t >= t0 && e.nome === 'players-moved')], [true, false]);

    // ---- longe: B anda la no outro canto, fora da tela de A
    // Dentro do mapa (a planta compacta tem 1216 px de largura) e bem fora da
    // tela de A (400 px + a margem de 3 tiles).
    const longeX = eu.x > 600 ? 80 : 1100;
    t0 = Date.now();
    for (let i = 0; i < 10; i++) { andar(B, longeX + i * 4, 90); await espera(100); }
    const noSegundo = posicoesDe(A, B.id, t0).length;
    await espera(700); // o ciclo de quem esta longe e de 500 ms
    const longeA = posicoesDe(A, B.id, t0);
    conferir('longe: chega DEVAGAR (no maximo 3 em 1 s, em vez de 10)', noSegundo <= 3, true);
    conferir('  mas chega: a posicao final sempre vem',
      longeA.length && [longeA[longeA.length - 1].x, longeA[longeA.length - 1].y], [longeX + 9 * 4, 90]);
    conferir('  e o cliente antigo continua vendo tudo, mesmo longe',
      posicoesDe(C, B.id, t0).length >= 9, true);

    // ---- sede parada: ninguem anda, ninguem recebe nada
    await espera(300);
    t0 = Date.now();
    await espera(800);
    conferir('sede parada: nenhuma mensagem de movimento',
      A.eventos.filter((e) => e.t >= t0 && /moved/.test(e.nome)).length, 0);

    // ---- quem entra depois ja comeca em dia (nao recebe a sede inteira de novo)
    const D = await conectar({ vista: { w: 400, h: 300 } });
    await espera(400);
    conferir('quem entra depois nao recebe de novo o que ja veio no init',
      D.eventos.filter((e) => /moved/.test(e.nome)).length, 0);

    [A, B, C, D].forEach((c) => { try { c.ws.close(); } catch (e) { /* ja foi */ } });
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
    try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
