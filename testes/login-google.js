// Entrar com o Google da ADM, de ponta a ponta - sem internet.
//
// Um servidor falso faz o papel do endpoint de token do Google
// (GOOGLE_TOKEN_URL_TESTE, que so vale fora de producao) e devolve o id_token
// que cada teste montar. Todo o resto e o servidor de verdade: o inicio do login,
// o cookie do nonce, o state assinado, a volta e a sessao.
//
// O que importa provar e o que um atacante tentaria:
//   - digitar o e-mail de alguem da ADM no cadastro com senha (fechado);
//   - conta do Google que nao e do Workspace da ADM (recusada);
//   - completar o login de OUTRO navegador, o "login CSRF" (recusado);
//   - ter criado antes a conta de um colega com senha, e continuar dentro
//     depois que o dono de verdade entra com o Google (derrubado).
//
// NAO mexe em server/data: DATA_DIR em pastas temporarias, apagadas no fim.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PORTA = 3713;
const PORTA_GOOGLE = 3716;
const BASE = 'http://127.0.0.1:' + PORTA;
const CLIENTE = 'cliente-de-teste.apps.googleusercontent.com';
const pastas = [];

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
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-google-'));
  pastas.push(p);
  return p;
}

// ------------------------------------------------------------ parte 1: unidade
// Carrega o google.js direto, numa pasta de dados descartavel.
process.env.DATA_DIR = novaPasta();
process.env.SESSION_SECRET = 'segredo-de-teste-bem-comprido';
const google = require(path.join(raiz, 'server', 'google.js'));

function unidade() {
  console.log('\nLOGIN COM O GOOGLE: a conferencia do id_token');
  const agora = Date.now();
  const base = {
    iss: 'https://accounts.google.com', aud: CLIENTE, exp: Math.floor(agora / 1000) + 3600,
    nonce: 'n1', sub: '1001', email: 'caio@admsolucoes.com.br', email_verified: true,
    hd: 'admsolucoes.com.br', given_name: 'Caio',
  };
  const validar = (mudar) => google._validarIdentidade(Object.assign({}, base, mudar),
    { clientId: CLIENTE, nonce: 'n1', agora });

  conferir('conta do Workspace da ADM passa', validar({}),
    { email: 'caio@admsolucoes.com.br', nome: 'Caio', sub: '1001' });
  conferir('e-mail em maiuscula vira minuscula', validar({ email: 'Caio@ADMsolucoes.com.br' }).email, 'caio@admsolucoes.com.br');
  conferir('Gmail comum: fora da ADM', validar({ email: 'caio@gmail.com', hd: undefined }).erro, 'dominio');
  conferir('conta Google COMUM aberta com e-mail da ADM (sem hd): recusa', validar({ hd: undefined }).erro, 'dominio');
  conferir('hd de outra empresa: recusa', validar({ hd: 'outra.com.br' }).erro, 'dominio');
  conferir('e-mail nao verificado: recusa', validar({ email_verified: false }).erro, 'dominio');
  conferir('token feito pra OUTRO app (aud): recusa', validar({ aud: 'outro-app' }).erro, 'invalido');
  conferir('token vencido: recusa', validar({ exp: Math.floor(agora / 1000) - 10 }).erro, 'invalido');
  conferir('nonce de outro pedido: recusa', validar({ nonce: 'n2' }).erro, 'invalido');
  conferir('emissor que nao e o Google: recusa', validar({ iss: 'https://evil.example' }).erro, 'invalido');
  conferir('sem sub: recusa', validar({ sub: '' }).erro, 'invalido');

  const agenda = google._criarEstado('agenda', 'uid-1');
  conferir('state da agenda nao serve de login', google._lerEstado(agenda, 'login'), null);
  conferir('  e serve pra agenda', google._lerEstado(agenda, 'agenda'), 'uid-1');
  const adulterado = agenda.slice(0, -1) + (agenda.endsWith('a') ? 'b' : 'a');
  conferir('state adulterado: nao serve pra nada', google._lerEstado(adulterado, 'agenda'), null);
}

// ------------------------------------------------- o "Google" de mentira
const idTokenDoCodigo = new Map();
const googleFalso = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const p = new URLSearchParams(corpo);
    const claims = idTokenDoCodigo.get(p.get('code'));
    res.setHeader('Content-Type', 'application/json');
    if (!claims || p.get('client_id') !== CLIENTE || p.get('redirect_uri') !== BASE + '/api/google/callback') {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'invalid_grant' }));
    }
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    res.end(JSON.stringify({ access_token: 'x', id_token: b64({ alg: 'RS256' }) + '.' + b64(claims) + '.assinatura' }));
  });
});

// ------------------------------------------------------------ servidor da sede
let servidor = null;
function subir(env) {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        PORT: String(PORTA), SESSION_SECRET: 'segredo-de-teste-bem-comprido', SEM_LOGIN: '', NODE_ENV: 'test',
        CODIGO_SEDE: '', ADMIN_CODE: '', DIRETORIA_EMAILS: '', DOMINIOS_SEDE: 'admsolucoes.com.br,admsolucoes.com',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', SITE_URL: BASE,
        GOOGLE_TOKEN_URL_TESTE: 'http://127.0.0.1:' + PORTA_GOOGLE + '/token',
        TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '', GOOGLE_DRIVE_PASTA: '',
        GOOGLE_CONTA_SERVICO: '', CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', EMAIL_PROVEDOR: '',
      }, env),
      stdio: ['ignore', 'pipe', 'pipe'],
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

const COM_GOOGLE = { GOOGLE_CLIENT_ID: CLIENTE, GOOGLE_CLIENT_SECRET: 'segredo-do-cliente' };

function cookieDe(resposta, nome) {
  const linha = resposta.headers.getSetCookie().find((c) => c.startsWith(nome + '='));
  return linha ? linha.split(';')[0] : null;
}

async function pedir(rota, { metodo = 'GET', corpo, cookie } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (cookie) cabecalhos.Cookie = cookie;
  const r = await fetch(BASE + rota, {
    method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual',
  });
  return { r, status: r.status, local: r.headers.get('location'), corpo: await r.json().catch(() => null) };
}

// Comeca o login como o navegador faria: devolve o que a sede mandou pro Google.
async function comecar() {
  const { r, status, local } = await pedir('/api/google/entrar');
  const url = new URL(local);
  return {
    status, url, r,
    nonceCookie: cookieDe(r, 'adm_google_nonce'),
    atributosNonce: (r.headers.getSetCookie().find((c) => c.startsWith('adm_google_nonce=')) || ''),
    state: url.searchParams.get('state'),
    nonce: url.searchParams.get('nonce'),
  };
}

let codigos = 0;
// A volta do Google com um id_token montado a partir de `claims`.
async function voltar({ state, nonceCookie, claims }) {
  const code = 'codigo-' + (++codigos);
  idTokenDoCodigo.set(code, claims);
  const q = new URLSearchParams({ code, state });
  const { r, local } = await pedir('/api/google/callback?' + q, { cookie: nonceCookie || undefined });
  return { local, sessao: cookieDe(r, 'adm_sessao') };
}

function claimsDe(email, sub, nonce, extra) {
  return Object.assign({
    iss: 'https://accounts.google.com', aud: CLIENTE, exp: Math.floor(Date.now() / 1000) + 3600,
    nonce, sub, email, email_verified: true, hd: email.split('@')[1], given_name: email.split('@')[0],
  }, extra);
}

async function entrarComGoogle(email, sub, extra) {
  const ida = await comecar();
  return voltar({ state: ida.state, nonceCookie: ida.nonceCookie, claims: claimsDe(email, sub, ida.nonce, extra) });
}

async function ponta() {
  console.log('\nLOGIN COM O GOOGLE: de ponta a ponta');
  await new Promise((r) => googleFalso.listen(PORTA_GOOGLE, '127.0.0.1', r));

  // -------- fase A: a sede ANTES do Google (so e-mail e senha)
  const pastaA = novaPasta();
  await subir({ DATA_DIR: pastaA });
  conferir('sem Google configurado, a tela nao oferece o botao', (await pedir('/api/login-opcoes')).corpo.google, false);
  // Um intruso cria a conta da Lu com senha, antes de a Lu aparecer.
  const intruso = await pedir('/api/registrar', {
    metodo: 'POST', corpo: { nome: 'Lu', email: 'lu@admsolucoes.com.br', senha: 'senha-do-intruso' },
  });
  const cookieIntruso = cookieDe(intruso.r, 'adm_sessao');
  conferir('sem Google: o intruso consegue criar a conta da Lu com senha', intruso.status, 200);
  conferir('  mas nao vira diretoria nem sendo a primeira conta', intruso.corpo.usuario.isAdmin, false);
  await parar();

  // -------- fase B: o Google e ligado, com DIRETORIA_EMAILS
  await subir(Object.assign({ DATA_DIR: pastaA, DIRETORIA_EMAILS: 'chefe@admsolucoes.com.br' }, COM_GOOGLE));
  const opcoes = (await pedir('/api/login-opcoes')).corpo;
  conferir('com Google: a tela oferece o botao', [opcoes.google, opcoes.dominio], [true, 'admsolucoes.com.br']);

  const cadastroAdm = await pedir('/api/registrar', {
    metodo: 'POST', corpo: { nome: 'Falso', email: 'presidente@admsolucoes.com.br', senha: 'qualquer-senha' },
  });
  conferir('com Google: e-mail da ADM NAO se cadastra com senha', cadastroAdm.status, 403);

  const ida = await comecar();
  conferir('o inicio manda pro Google', [ida.status, ida.url.origin], [302, 'https://accounts.google.com']);
  conferir('  pedindo so identidade (nada de agenda nem Drive)', ida.url.searchParams.get('scope'), 'openid email profile');
  conferir('  com o endereco de volta da sede', ida.url.searchParams.get('redirect_uri'), BASE + '/api/google/callback');
  conferir('  e grava o nonce num cookie HttpOnly, curto, so pro caminho do Google',
    [!!ida.nonceCookie, /HttpOnly/.test(ida.atributosNonce), /Max-Age=600/.test(ida.atributosNonce), /Path=\/api\/google/.test(ida.atributosNonce)],
    [true, true, true, true]);

  // Caio: conta nova, fora da lista de diretoria
  const caio = await voltar({ state: ida.state, nonceCookie: ida.nonceCookie, claims: claimsDe('caio@admsolucoes.com.br', 'g-caio', ida.nonce, { given_name: 'Caio' }) });
  conferir('a volta do Google cria a conta e ja entra', [caio.local, !!caio.sessao], ['/', true]);
  const euCaio = (await pedir('/api/eu', { cookie: caio.sessao })).corpo.usuario;
  conferir('  conta com o nome do Google, sem senha', [euCaio.nome, euCaio.email, euCaio.temSenha, euCaio.google],
    ['Caio', 'caio@admsolucoes.com.br', false, true]);
  conferir('  e NAO e diretoria (nao esta em DIRETORIA_EMAILS)', euCaio.isAdmin, false);

  const repetida = await voltar({ state: ida.state, nonceCookie: ida.nonceCookie, claims: claimsDe('caio@admsolucoes.com.br', 'g-caio', ida.nonce) });
  conferir('entrar de novo cai na MESMA conta', (await pedir('/api/eu', { cookie: repetida.sessao })).corpo.usuario.id, euCaio.id);

  const chefe = await entrarComGoogle('chefe@admsolucoes.com.br', 'g-chefe');
  conferir('quem esta em DIRETORIA_EMAILS entra como diretoria',
    (await pedir('/api/eu', { cookie: chefe.sessao })).corpo.usuario.isAdmin, true);

  // A Lu de verdade aparece
  conferir('antes da Lu entrar, o intruso esta dentro', (await pedir('/api/eu', { cookie: cookieIntruso })).status, 200);
  const lu = await entrarComGoogle('lu@admsolucoes.com.br', 'g-lu');
  const euLu = (await pedir('/api/eu', { cookie: lu.sessao })).corpo.usuario;
  conferir('a Lu de verdade entra com o Google na conta que tinha o e-mail dela', euLu.email, 'lu@admsolucoes.com.br');
  conferir('  e o intruso cai na hora', (await pedir('/api/eu', { cookie: cookieIntruso })).status, 401);
  const senhaIntruso = await pedir('/api/entrar', { metodo: 'POST', corpo: { email: 'lu@admsolucoes.com.br', senha: 'senha-do-intruso' } });
  conferir('  e a senha que ele criou nao entra mais', senhaIntruso.status, 401);
  conferir('  a conta passa a ser so do Google', [euLu.temSenha, euLu.google], [false, true]);

  // Ataques na volta
  const semCookie = await voltar({ state: ida.state, nonceCookie: null, claims: claimsDe('caio@admsolucoes.com.br', 'g-caio', ida.nonce) });
  conferir('volta SEM o cookie do nonce (outro navegador): recusa', [semCookie.local, semCookie.sessao], ['/?entrar=erro', null]);

  const vitima = await comecar();
  const atacante = await comecar();
  const csrf = await voltar({ state: atacante.state, nonceCookie: vitima.nonceCookie, claims: claimsDe('caio@admsolucoes.com.br', 'g-caio', atacante.nonce) });
  conferir('login CSRF (state do atacante, cookie da vitima): recusa', [csrf.local, csrf.sessao], ['/?entrar=erro', null]);

  const gmail = await entrarComGoogle('alguem@gmail.com', 'g-fora', { hd: undefined });
  conferir('Gmail comum: volta com "conta fora da ADM"', [gmail.local, gmail.sessao], ['/?entrar=dominio', null]);
  const semHd = await entrarComGoogle('diretor@admsolucoes.com.br', 'g-comum', { hd: undefined });
  conferir('conta Google comum com e-mail da ADM (sem Workspace): recusa', [semHd.local, semHd.sessao], ['/?entrar=dominio', null]);
  const outroApp = await entrarComGoogle('caio@admsolucoes.com.br', 'g-caio', { aud: 'outro-app' });
  conferir('id_token de outro app: recusa', [outroApp.local, outroApp.sessao], ['/?entrar=erro', null]);

  const ida2 = await comecar();
  const adulterado = ida2.state.slice(0, -2) + (ida2.state.endsWith('0') ? '11' : '00');
  const stateAdulterado = await voltar({ state: adulterado, nonceCookie: ida2.nonceCookie, claims: claimsDe('caio@admsolucoes.com.br', 'g-caio', ida2.nonce) });
  conferir('state adulterado: recusa', [stateAdulterado.local, stateAdulterado.sessao], ['/?entrar=erro', null]);

  const cancelou = await pedir('/api/google/callback?' + new URLSearchParams({ error: 'access_denied', state: ida2.state }), { cookie: ida2.nonceCookie });
  conferir('a pessoa cancelou no Google: volta avisando', cancelou.local, '/?entrar=cancelado');

  // A diretoria nao da senha pra conta do Google
  const membros = (await pedir('/api/membros', { cookie: chefe.sessao })).corpo.membros;
  const idCaio = membros.find((m) => m.email === 'caio@admsolucoes.com.br').id;
  conferir('a lista de membros diz quem entra com o Google', membros.find((m) => m.id === idCaio).google, true);
  conferir('diretoria NAO redefine senha de conta do Google',
    (await pedir('/api/membros/' + idCaio + '/redefinir-senha', { metodo: 'POST', cookie: chefe.sessao })).status, 400);
  await parar();

  // -------- fase C: sede zerada (deploy do plano free), Google ligado, SEM lista
  await subir(Object.assign({ DATA_DIR: novaPasta() }, COM_GOOGLE));
  const primeiro = await entrarComGoogle('bia@admsolucoes.com.br', 'g-bia');
  const segundo = await entrarComGoogle('rafa@admsolucoes.com.br', 'g-rafa');
  conferir('sem DIRETORIA_EMAILS: a primeira pessoa com Google numa sede sem diretoria vira diretoria',
    (await pedir('/api/eu', { cookie: primeiro.sessao })).corpo.usuario.isAdmin, true);
  conferir('  a segunda, nao', (await pedir('/api/eu', { cookie: segundo.sessao })).corpo.usuario.isAdmin, false);
  await parar();
}

(async function () {
  try {
    unidade();
    await ponta();
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
    googleFalso.close();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
