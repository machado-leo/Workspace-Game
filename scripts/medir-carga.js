// Quantas pessoas a sede aguenta? Mede, em vez de chutar.
//
//   node scripts/medir-carga.js            (10, 30 e 60 pessoas)
//   node scripts/medir-carga.js 10 25 50 80
//
// O QUE ELE MEDE, E POR QUE
// O que mais pesa na sede nao e a chamada de video - essa vai direto de um
// navegador pro outro, sem passar aqui. E a POSICAO dos bonecos: cada pessoa
// manda onde esta 10 vezes por segundo e o servidor repassa pra todas as
// outras. Isso cresce ao quadrado: 10 pessoas = ~900 mensagens/s; 60 = ~35 mil.
//
// Por isso ele mede tres coisas por nivel:
//   - PROCESSADOR do servidor (em "nucleos"): 1.0 = um nucleo inteiro ocupado.
//     O KVM 1 da Hostinger tem UM nucleo - passar de ~0.7 ja e zona de risco.
//   - ATRASO de ponta a ponta: o tempo entre uma pessoa andar e a OUTRA ver.
//     E o numero que a pessoa sente: acima de ~200 ms o boneco "teleporta".
//   - MENSAGENS e TRAFEGO que saem do servidor (a conta da hospedagem).
//
// A medida sai na SUA maquina, que e mais forte que o VPS: trate o resultado
// como teto otimista, nao como promessa. O que ele mostra bem e a CURVA - onde
// dobrar a quantidade de gente deixa de custar o dobro e passa a custar quatro
// vezes mais.
//
// Sobe com SEM_LOGIN=1 (modo de desenvolvimento) so pra nao precisar criar 60
// contas: o caminho da mensagem de movimento e exatamente o mesmo.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PORTA = 3719;
const BASE = 'http://127.0.0.1:' + PORTA;
const SEGUNDOS = 15;          // tempo andando em cada nivel
const ENVIOS_POR_SEGUNDO = 10; // igual ao cliente de verdade (game.js)

// --espalhados: cada pessoa num canto do escritorio (o caso real, gente em salas
// diferentes). Sem ele, todo mundo amontoado na mesma sala: o PIOR caso, em que
// todo mundo ve todo mundo.
const ESPALHADOS = process.argv.includes('--espalhados');
// Area que cada pessoa enxerga, em pixels do mapa: tela de notebook (~1800x1000)
// no zoom padrao (2). O servidor usa isso pra saber quem esta na tela de quem.
const VISTA = { w: 900, h: 500 };
const niveis = process.argv.slice(2).map(Number).filter((n) => n > 0);
const NIVEIS = niveis.length ? niveis : [10, 30, 60];

const pastas = [];
let servidor = null;

function subir() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-carga-'));
  pastas.push(pasta);
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: pasta, PORT: String(PORTA), NODE_ENV: 'test', SEM_LOGIN: '1',
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
      if (servidor.exitCode !== null) return reject(new Error('servidor morreu:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('servidor nao subiu'));
      fetch(BASE + '/api/saude').then((r) => (r.ok ? resolve() : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

function parar() {
  return new Promise((resolve) => {
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

// Segundos de processador ja gastos pelo processo do servidor. No Windows vem
// do PowerShell; nos outros, do /proc.
function cpuDoServidor() {
  try {
    if (process.platform === 'win32') {
      const saida = execFileSync('powershell', ['-NoProfile', '-Command',
        '(Get-Process -Id ' + servidor.pid + ').CPU'], { encoding: 'utf8' });
      return parseFloat(String(saida).trim().replace(',', '.')) || 0;
    }
    const campos = fs.readFileSync('/proc/' + servidor.pid + '/stat', 'utf8').split(' ');
    return (Number(campos[13]) + Number(campos[14])) / 100;
  } catch (e) {
    return NaN;
  }
}

// Uma "pessoa": WebSocket cru falando engine.io na mao (o projeto nao tem o
// cliente de socket.io no Node). "0" e abertura, "40" conecta, "42[...]" e
// evento, "2" e ping do servidor.
function pessoa(indice, estado) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket');
    const prazo = setTimeout(() => reject(new Error('socket ' + indice + ' nao conectou')), 10000);
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      estado.bytes += m.length;
      if (m.startsWith('0') && !m.startsWith('40')) { ws.send('40'); return; }
      if (m === '2') { ws.send('3'); return; }
      if (m.startsWith('40')) {
        clearTimeout(prazo);
        ws.send('42' + JSON.stringify(['join', { name: 'Carga ' + indice }]));
        // Cliente novo avisa o tamanho da tela (o antigo nao manda, e o servidor
        // continua falando com ele do jeito antigo).
        ws.send('42' + JSON.stringify(['vista', VISTA]));
        resolve(ws);
        return;
      }
      if (!m.startsWith('42')) return;
      let evento;
      try { evento = JSON.parse(m.slice(2)); } catch (e) { return; }
      // 'player-moved' e o formato antigo (uma posicao por mensagem);
      // 'players-moved' e o novo (um pacote com varias).
      let posicoes;
      if (evento[0] === 'player-moved') posicoes = [evento[1]];
      else if (evento[0] === 'players-moved') posicoes = evento[1];
      else return;
      estado.recebidas += 1;
      estado.posicoes += posicoes.length;
      // O relogio: a pessoa 0 anda pra uma coluna com marca de tempo, e a
      // pessoa 1 diz quando viu. Isso e o atraso que se SENTE na tela.
      if (indice === 1) {
        posicoes.forEach((d) => {
          if (!estado.marcas.has(d.x)) return;
          estado.atrasos.push(Date.now() - estado.marcas.get(d.x));
          estado.marcas.delete(d.x);
        });
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket ' + indice)); });
  });
}

function percentil(lista, p) {
  if (!lista.length) return NaN;
  const ordenada = [...lista].sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor(ordenada.length * p))];
}

// Um ponto por pessoa espalhado pelo escritorio inteiro (grade de 8x5 lugares).
function cantoDe(i) {
  const col = i % 8;
  const lin = Math.floor(i / 8) % 5;
  return { x: 80 + col * 175, y: 80 + lin * 180 };
}

async function medir(quantas) {
  const estado = { recebidas: 0, posicoes: 0, bytes: 0, atrasos: [], marcas: new Map() };
  const sockets = [];
  for (let i = 0; i < quantas; i++) sockets.push(await pessoa(i, estado));
  await new Promise((r) => setTimeout(r, 1000)); // todo mundo dentro

  estado.recebidas = 0; estado.posicoes = 0; estado.bytes = 0;
  const cpuAntes = cpuDoServidor();
  const comeco = Date.now();

  let passo = 0;
  const relogio = setInterval(() => {
    passo += 1;
    sockets.forEach((ws, i) => {
      if (ws.readyState !== 1) return;
      // anda em circulo dentro do mapa, sem sair da area valida
      // As pessoas 0 e 1 (o relogio do atraso) ficam sempre juntas: o atraso que
      // importa e o de quem esta na mesma tela.
      const base = ESPALHADOS && i > 1 ? cantoDe(i) : { x: 100, y: 100 };
      const x = base.x + ((passo * 3 + i * 7) % 120);
      const y = base.y + ((passo * 2 + i * 5) % 90);
      if (i === 0 && passo % 5 === 0) estado.marcas.set(x, Date.now()); // marca do relogio
      ws.send('42' + JSON.stringify(['move', { x, y, dir: 'down', moving: true }]));
    });
  }, 1000 / ENVIOS_POR_SEGUNDO);

  await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));
  clearInterval(relogio);

  const duracao = (Date.now() - comeco) / 1000;
  const cpu = (cpuDoServidor() - cpuAntes) / duracao;
  const linha = {
    pessoas: quantas,
    nucleos: Number(cpu.toFixed(2)),
    msgsPorSegundo: Math.round(estado.recebidas / duracao),
    posicoesPorSegundo: Math.round(estado.posicoes / duracao),
    mbPorMinuto: Number((estado.bytes / duracao * 60 / 1024 / 1024).toFixed(1)),
    atrasoTipico: percentil(estado.atrasos, 0.5),
    atrasoRuim: percentil(estado.atrasos, 0.95),
    amostrasDeAtraso: estado.atrasos.length,
  };
  sockets.forEach((ws) => { try { ws.close(); } catch (e) { /* ja foi */ } });
  await new Promise((r) => setTimeout(r, 500));
  return linha;
}

(async function () {
  console.log('\nCARGA DA SEDE - ' + (ESPALHADOS ? 'ESPALHADOS pelo escritorio' : 'todo mundo AMONTOADO na mesma sala')
    + ' - ' + SEGUNDOS + 's por nivel, ' + ENVIOS_POR_SEGUNDO + ' movimentos/s por pessoa');
  console.log('Maquina: ' + os.cpus().length + ' nucleos, ' + os.cpus()[0].model.trim());
  console.log('(o KVM 1 da Hostinger tem 1 nucleo - por isso a coluna "nucleos" e a que importa)\n');
  const linhas = [];
  try {
    for (const n of NIVEIS) {
      await subir();
      process.stdout.write('  medindo ' + n + ' pessoas... ');
      const r = await medir(n);
      linhas.push(r);
      console.log('nucleos ' + r.nucleos + ' | ' + r.msgsPorSegundo + ' msg/s | atraso ' + r.atrasoTipico + ' ms');
      await parar();
    }
  } catch (e) {
    console.log('\n  FALHOU: ' + (e.stack || e.message));
  } finally {
    await parar();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }

  console.log('\n  pessoas | nucleos | msg/s   | MB/min | atraso tipico | atraso ruim (95%)');
  console.log('  --------|---------|---------|------------|--------|---------------|------------------');
  linhas.forEach((l) => {
    console.log('  ' + String(l.pessoas).padStart(7) + ' | ' + String(l.nucleos).padStart(7) + ' | '
      + String(l.msgsPorSegundo).padStart(7) + ' | ' + String(l.posicoesPorSegundo).padStart(10) + ' | ' + String(l.mbPorMinuto).padStart(6) + ' | '
      + String(l.atrasoTipico + ' ms').padStart(13) + ' | ' + String(l.atrasoRuim + ' ms').padStart(17));
  });
  console.log('\n  nucleos 1.0 = um nucleo inteiro ocupado. O KVM 1 tem um so.');
  console.log('  atraso e o tempo entre uma pessoa andar e a outra ver o boneco mexer.\n');
})();
