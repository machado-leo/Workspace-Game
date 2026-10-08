// Duas sedes no MESMO servidor nao se enxergam. Ver docs/varias-sedes.md.
//
// O modelo de venda e "cada cliente tem a sua sala, e nada liga uma a outra -
// so o servidor". Aqui sobem duas sedes de verdade lado a lado, como o
// scripts/sedes.sh sobe no VPS (mesmo codigo, pasta de dados e segredo
// proprios), e o teste tenta o que um cliente tentaria contra o outro:
//
//   - entrar na sede B com a conta da sede A (e-mail e senha, e o cookie);
//   - ver na sede B quem esta na sede A, ou o chat da sede A;
//   - criar conta na sede B com o e-mail da empresa A.
//
// E a configuracao errada mais provavel: duas sedes com o MESMO segredo de
// sessao. Mesmo assim o cookie de uma nao vale na outra - a conta nao existe la.
//
// Por ultimo, o vazamento que o ARQUIVO_ENV fecha: com varias sedes rodando o
// mesmo codigo, o .env da pasta do codigo valeria pra todas ao mesmo tempo.
//
// NAO mexe em server/data: tudo em pastas temporarias, apagadas no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pastas = [];
const servidores = [];

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

function novaPasta() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-isola-'));
  pastas.push(p);
  return p;
}

// Uma sede, do jeito que o systemd do scripts/sedes.sh sobe: ARQUIVO_ENV=nenhum
// e cada variavel vindo do servico. As integracoes sao APAGADAS do ambiente
// (e nao postas em branco) pra este processo nao herdar nada do terminal.
function sede({ porta, dados, segredo, dominio, extra }) {
  const env = Object.assign({}, process.env);
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_DRIVE_PASTA', 'GOOGLE_CONTA_SERVICO',
    'TRELLO_API_KEY', 'TRELLO_TOKEN', 'TRELLO_BOARD_ID', 'CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_TOKEN',
    'BACKUP_DRIVE_PASTA', 'BACKUP_CHAVE', 'DIRETORIA_EMAILS', 'CODIGO_SEDE', 'ADMIN_CODE',
    'DOMINIOS_SEDE', 'SEM_LOGIN', 'ARQUIVO_ENV', 'EMAIL_PROVEDOR', 'EMAIL_CHAVE', 'EMAIL_REMETENTE'].forEach((k) => delete env[k]);
  Object.assign(env, {
    ARQUIVO_ENV: 'nenhum', NODE_ENV: 'test', PORT: String(porta), DATA_DIR: dados,
    SESSION_SECRET: segredo, DOMINIOS_SEDE: dominio,
  }, extra || {});
  const base = 'http://127.0.0.1:' + porta;
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    servidores.push(proc);
    let erro = '';
    proc.stderr.on('data', (b) => { erro += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (proc.exitCode !== null) return reject(new Error('sede ' + porta + ' morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('sede ' + porta + ' nao subiu em 15s'));
      fetch(base + '/api/saude').then((r) => (r.ok ? resolve({ base, proc, dados }) : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

function pararTodos() {
  return Promise.all(servidores.map((proc) => new Promise((resolve) => {
    // morto por sinal (o kill), o exitCode fica null e quem diz e o signalCode
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    proc.once('exit', () => resolve());
    proc.kill();
  })));
}

async function pedir(s, rota, { metodo = 'GET', corpo, cookie } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (cookie) cabecalhos.Cookie = cookie;
  const r = await fetch(s.base + rota, { method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined });
  return {
    status: r.status,
    cookie: (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0] || null,
    corpo: await r.json().catch(() => null),
  };
}

// Socket.io "na unha" (engine.io 4 por WebSocket), com o cookie da conta.
function entrar(s, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(s.base.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 5000);
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) { ws.send('40'); return; }
      if (m === '2') { ws.send('3'); return; }
      if (m.startsWith('40')) { ws.send('42' + JSON.stringify(['join', {}])); return; }
      if (!m.startsWith('42')) return;
      let e;
      try { e = JSON.parse(m.slice(2)); } catch (x) { return; }
      eventos.push(e);
      if (e[0] === 'init') { clearTimeout(prazo); resolve({ ws, eventos, init: e[1] }); }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  console.log('\nISOLAMENTO: duas sedes no mesmo servidor nao se enxergam');
  try {
    const segredoA = 'segredo-da-sede-acme-bem-comprido';
    const A = await sede({ porta: 3731, dados: novaPasta(), segredo: segredoA, dominio: 'acme.com.br' });
    const B = await sede({ porta: 3732, dados: novaPasta(), segredo: 'segredo-da-sede-beta-bem-comprido', dominio: 'beta.com.br' });

    // ---- cada empresa cria a sua conta na sua sede
    const ana = await pedir(A, '/api/registrar', { metodo: 'POST', corpo: { nome: 'Ana', email: 'ana@acme.com.br', senha: 'senha-da-ana-1' } });
    const bia = await pedir(B, '/api/registrar', { metodo: 'POST', corpo: { nome: 'Bia', email: 'bia@beta.com.br', senha: 'senha-da-bia-1' } });
    conferir('cada empresa cria conta na PROPRIA sede', [ana.status, bia.status], [200, 200]);

    // ---- a conta de A nao existe em B
    conferir('conta da sede A nao entra na sede B (e-mail e senha)',
      (await pedir(B, '/api/entrar', { metodo: 'POST', corpo: { email: 'ana@acme.com.br', senha: 'senha-da-ana-1' } })).status, 401);
    conferir('o cookie da sede A nao vale na sede B',
      (await pedir(B, '/api/eu', { cookie: ana.cookie })).status, 401);
    conferir('e-mail da empresa A nao cria conta na sede B',
      (await pedir(B, '/api/registrar', { metodo: 'POST', corpo: { nome: 'Ana', email: 'ana@acme.com.br', senha: 'senha-da-ana-1' } })).status, 403);

    // ---- presenca e chat de A nao aparecem em B
    const naA = await entrar(A, ana.cookie);
    naA.ws.send('42' + JSON.stringify(['chat-mensagem', { conversa: 'canal:geral', texto: 'segredo comercial da acme' }]));
    await espera(400);
    const naB = await entrar(B, bia.cookie);
    await espera(300);
    conferir('quem esta na sede A nao aparece na sede B',
      naB.init.players.map((p) => p.name), ['Bia']);
    conferir('o chat da sede A nao aparece na sede B',
      JSON.stringify(naB.init).includes('segredo comercial'), false);
    conferir('  (e na propria sede A a mensagem esta la)',
      naA.eventos.some((e) => e[0] === 'chat-mensagem' && e[1].texto === 'segredo comercial da acme'), true);
    naA.ws.close();
    naB.ws.close();

    // ---- os dados ficam em pastas separadas
    const contasDe = (s) => JSON.parse(fs.readFileSync(path.join(s.dados, 'usuarios.json'), 'utf8')).usuarios.map((u) => u.email);
    conferir('cada pasta de dados so tem as contas da propria sede',
      [contasDe(A), contasDe(B)], [['ana@acme.com.br'], ['bia@beta.com.br']]);

    // ---- configuracao errada: MESMO segredo de sessao em duas sedes
    const C = await sede({ porta: 3733, dados: novaPasta(), segredo: segredoA, dominio: 'gama.com.br' });
    conferir('mesmo com o MESMO segredo, o cookie de A nao vale em C (a conta nao existe la)',
      (await pedir(C, '/api/eu', { cookie: ana.cookie })).status, 401);

    // ---- sede de cliente SEM dominio de e-mail nao herda o da ADM
    // (antes, dominio vazio caia no padrao @admsolucoes - e a sede de outra
    // empresa aceitaria cadastro de qualquer um da ADM)
    const semDominio = await sede({ porta: 3736, dados: novaPasta(), segredo: 'outro-segredo-bem-comprido-3', dominio: '' });
    conferir('sede de cliente sem dominio NAO aceita e-mail da ADM',
      (await pedir(semDominio, '/api/registrar', { metodo: 'POST', corpo: { nome: 'Caio', email: 'caio@admsolucoes.com.br', senha: 'senha-qualquer-1' } })).status, 403);
    conferir('  e a tela recebe a lista de dominios DELA (vazia), nao a da ADM',
      (await pedir(semDominio, '/api/login-opcoes')).corpo.dominios, []);
    conferir('  enquanto a sede A informa o dominio dela',
      (await pedir(A, '/api/login-opcoes')).corpo.dominios, ['acme.com.br']);

    // ---- ARQUIVO_ENV: o .env da pasta do codigo nao vaza pras sedes
    const arquivo = path.join(novaPasta(), 'teste.env');
    fs.writeFileSync(arquivo, 'GOOGLE_CLIENT_ID=id-de-teste\nGOOGLE_CLIENT_SECRET=segredo-de-teste\n');
    const comArquivo = await sede({ porta: 3734, dados: novaPasta(), segredo: 'outro-segredo-bem-comprido-1', dominio: 'x.com.br', extra: { ARQUIVO_ENV: arquivo } });
    conferir('ARQUIVO_ENV=<arquivo>: le o arquivo indicado (controle do teste)',
      (await pedir(comArquivo, '/api/login-opcoes')).corpo.google, true);
    const semArquivo = await sede({ porta: 3735, dados: novaPasta(), segredo: 'outro-segredo-bem-comprido-2', dominio: 'x.com.br' });
    conferir('ARQUIVO_ENV=nenhum: nao le arquivo nenhum - nem o .env da pasta do codigo',
      (await pedir(semArquivo, '/api/login-opcoes')).corpo.google, false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await pararTodos();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
