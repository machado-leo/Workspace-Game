// Freio de ritmo do chat, de ponta a ponta: uma conta que manda mensagem demais e
// barrada, avisada, e nao apaga o historico de ninguem. Ver server/freio.js.
//
// O que foi medido antes do freio: 300 mensagens em 0,3 s de UMA conta, todas
// aceitas (~990 por segundo). O canal guarda 200 por conversa, entao a enchente
// apagou o historico inteiro e ainda entregou cada mensagem a cada pessoa online.
//
// Sobe o servidor de verdade numa pasta de dados descartavel e fala por
// socket.io "na unha" (o projeto nao tem o cliente de Node). NAO mexe em
// server/data.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-chat-ritmo-'));
const PORTA = 3713;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'teste-sede';

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
function derrubar() {
  if (servidor && !servidor.killed) servidor.kill();
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function subir() {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), CODIGO_SEDE, SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '', CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '',
        EMAIL_PROVEDOR: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let erro = '';
    servidor.stderr.on('data', (b) => { erro += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude').then((r) => (r.ok ? resolve() : setTimeout(tentar, 150))).catch(() => setTimeout(tentar, 150));
    })();
  });
}

// Socket.io "na unha". Com `enviar(evento, dados, comConfirmacao)` o pedido leva
// um numero (`42<n>[...]`) e a resposta do servidor volta como `43<n>[...]`.
function abrirMembro(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const pendentes = new Map();
    let proximo = 1;
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 6000);
    const s = {
      eventos, ws,
      enviar(ev, dado) { ws.send('42' + JSON.stringify([ev, dado])); },
      // devolve a promessa da resposta do servidor
      pedir(ev, dado) {
        const id = proximo++;
        return new Promise((res) => {
          pendentes.set(id, res);
          ws.send('42' + id + JSON.stringify([ev, dado]));
        });
      },
      fechar() { ws.close(); },
    };
    ws.addEventListener('message', (evt) => {
      const m = String(evt.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) ws.send('42' + JSON.stringify(['join', {}]));
      else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('43')) {
        const achou = /^43(\d+)(.*)$/s.exec(m);
        if (achou && pendentes.has(Number(achou[1]))) {
          const res = pendentes.get(Number(achou[1]));
          pendentes.delete(Number(achou[1]));
          try { res(JSON.parse(achou[2])[0]); } catch (e) { res(null); }
        }
      } else if (m.startsWith('42')) {
        try {
          const e = JSON.parse(m.slice(2));
          eventos.push(e);
          if (e[0] === 'init') { clearTimeout(prazo); resolve(s); }
        } catch (x) { /* ignora */ }
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

async function conta(nome, email) {
  const r = await fetch(BASE + '/api/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, email, senha: 'senha-bem-longa', codigo: CODIGO_SEDE }),
  });
  if (!r.ok) throw new Error('conta ' + email + ': ' + r.status);
  return { cookie: (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0], corpo: await r.json() };
}

const contar = (s, nome, teste) => s.eventos.filter((e) => e[0] === nome && (!teste || teste(e[1]))).length;

(async function () {
  console.log('\nCHAT: FREIO DE RITMO');
  try {
    await subir();
    const ana = await conta('Ana', 'ana@adm.com');
    const bia = await conta('Bia', 'bia@adm.com');
    const A = await abrirMembro(ana.cookie);
    const B = await abrirMembro(bia.cookie);

    // ------------------------------------------------- uma enchente de uma conta
    const respostas = await Promise.all(
      Array.from({ length: 12 }, (_, i) => A.pedir('chat-mensagem', { conversa: 'canal:projetos', texto: 'flood ' + i })));
    const aceitas = respostas.filter((r) => r && r.ok);
    const barradas = respostas.filter((r) => r && r.erro === 'ritmo');
    conferir('12 mensagens de uma vez: 5 passam', aceitas.length, 5);
    conferir('  e as outras 7 recebem "ritmo" (o cliente sabe que nao saiu)', barradas.length, 7);
    conferir('  com quanto esperar (em ms, ate 3 s)', barradas.every((r) => r.esperarMs > 0 && r.esperarMs <= 3000), true);
    await espera(300);
    const chegaram = B.eventos.filter((e) => e[0] === 'chat-mensagem' && /^flood/.test(e[1].texto)).map((e) => e[1].texto);
    conferir('quem esta online recebe SO as 5 aceitas, na ordem', chegaram, ['flood 0', 'flood 1', 'flood 2', 'flood 3', 'flood 4']);

    // ---------------------------------------- o historico nao foi apagado
    B.enviar('chat-historico', { conversa: 'canal:projetos' });
    await espera(300);
    const historico = B.eventos.filter((e) => e[0] === 'chat-historico' && e[1].conversa === 'canal:projetos').pop()[1].mensagens;
    conferir('o historico do canal tem so o que passou (nada de 300 mensagens apagando o resto)',
      historico.map((m) => m.texto), ['flood 0', 'flood 1', 'flood 2', 'flood 3', 'flood 4']);

    // ---------------------------------------------------------- por conta, nao por socket
    const A2 = await abrirMembro(ana.cookie);   // a mesma pessoa em outra aba
    const dela = await A2.pedir('chat-mensagem', { conversa: 'canal:geral', texto: 'da outra aba' });
    conferir('a mesma conta em OUTRA aba continua barrada (o limite e da conta)', dela && dela.erro, 'ritmo');
    conferir('outra pessoa nao e afetada', (await B.pedir('chat-mensagem', { conversa: 'canal:geral', texto: 'da Bia' })).ok, true);

    // DM tambem: o freio e da pessoa, nao do canal
    const idAna = ana.corpo.usuario.id;
    const idBia = bia.corpo.usuario.id;
    const dm = 'dm:' + [idAna, idBia].sort().join('|');
    conferir('DM tambem conta (senao era so mandar por DM)', (await A.pedir('chat-mensagem', { conversa: dm, texto: 'psiu' })).erro, 'ritmo');

    // ------------------------------------------ passou a janela: volta ao normal
    await espera(3300);
    const depois = await A.pedir('chat-mensagem', { conversa: 'canal:geral', texto: 'voltei' });
    conferir('depois da janela (3 s) a conta volta a mandar', depois && depois.ok, true);
    await espera(200);
    conferir('  e a mensagem chega', contar(B, 'chat-mensagem', (m) => m.texto === 'voltei'), 1);

    // ----------------------------------- quem manda sem confirmacao (cliente antigo)
    await espera(3300);
    for (let i = 0; i < 8; i++) A.enviar('chat-mensagem', { conversa: 'canal:social', texto: 'sem-ack ' + i });
    await espera(400);
    conferir('cliente que nao pede confirmacao tambem e freado (e nao quebra)',
      contar(B, 'chat-mensagem', (m) => /^sem-ack/.test(m.texto)), 5);

    // ------------------------- mensagem invalida NAO gasta a cota de ninguem
    await espera(3300);
    for (let i = 0; i < 20; i++) A.enviar('chat-mensagem', { conversa: 'canal:geral', texto: '   ' });
    for (let i = 0; i < 20; i++) A.enviar('chat-mensagem', { conversa: 'canal:inexistente', texto: 'x' });
    for (let i = 0; i < 20; i++) A.enviar('chat-mensagem', { conversa: 'canal:geral', texto: 123 });
    const cincoBoas = await Promise.all([1, 2, 3, 4, 5].map((i) => A.pedir('chat-mensagem', { conversa: 'canal:geral', texto: 'boa ' + i })));
    conferir('60 tentativas invalidas nao gastam a cota: as 5 boas seguintes passam', cincoBoas.every((r) => r && r.ok), true);

    // ------------------------------------------------------------- reacoes
    // Reacao e clique, mas cada uma vira um evento pra sede inteira: teto de 10 por 3 s.
    await espera(3300);
    const msg = B.eventos.filter((e) => e[0] === 'chat-mensagem' && /^boa/.test(e[1].texto)).pop()[1];
    const antesDeReagir = contar(B, 'chat-reacao');
    for (let i = 0; i < 40; i++) A.enviar('chat-reagir', { conversa: 'canal:geral', mensagemId: msg.id, emoji: '👍' });
    await espera(500);
    const reacoes = contar(B, 'chat-reacao') - antesDeReagir;
    conferir('40 cliques de reacao no chat: passam 10 (o teto), nao 40', reacoes, 10);

    await espera(3300);
    const antesMapa = contar(B, 'reacao');
    for (let i = 0; i < 40; i++) A.enviar('reagir', { emoji: '👋' });
    await espera(500);
    conferir('40 acenos no mapa: passam 10', contar(B, 'reacao') - antesMapa, 10);

    // depois de tudo isso, quem foi barrado continua na sede, conectado
    conferir('a conta barrada nao foi derrubada (o freio recusa a acao, nao a pessoa)', A.ws.readyState, 1);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    derrubar();
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
