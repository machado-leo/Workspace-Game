// Google Agenda direto da sede: OAuth proprio e cofre de token proprio.
// Ver docs/plano-calendario.md.
//
// Por que nao lemos os tokens do Supabase do CRM: precisaria da chave de
// servico do Supabase aqui dentro (que ignora RLS e abre o banco inteiro do
// CRM), e os dois apps renovando o mesmo refresh token disputariam a mesma
// linha. Aqui a sede tem o token dela, e o CRM continua com o dele.
//
// Sem dependencia nova: OAuth e Calendar sao chamadas HTTP comuns.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// so pelo segredo que assina o `state` do OAuth (o mesmo das sessoes)
const usuarios = require('./usuarios');
const pastaDados = require('./dados');
const { DOMINIOS, dominioDe } = require('./dominios');

const PASTA = pastaDados.PASTA;
const ARQUIVO = path.join(PASTA, 'google.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// O Google exige que o redirect URI bata exatamente com o endereco publico.
// RENDER_EXTERNAL_URL e preenchido sozinho pela hospedagem, entao no Render nao
// precisa configurar nada; SITE_URL so e necessario com dominio proprio.
const SITE_URL = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3500')
  .replace(/\/$/, '');
const REDIRECT_URI = SITE_URL + '/api/google/callback';

// So leitura: a sede mostra a agenda, nao escreve nela.
const ESCOPO = 'https://www.googleapis.com/auth/calendar.readonly';
// O login pede so quem a pessoa e: nada de agenda, Drive ou e-mail dela.
const ESCOPO_LOGIN = 'openid email profile';

// Endereco do Google que troca o codigo pelo token. Os testes apontam pra um
// servidor falso (testes/login-google.js) - e so fora de producao, pra ninguem
// conseguir desviar o login de verdade mexendo numa variavel.
const TOKEN_URL = (process.env.NODE_ENV !== 'production' && process.env.GOOGLE_TOKEN_URL_TESTE)
  || 'https://oauth2.googleapis.com/token';

// uid da conta da sede -> { accessToken, refreshToken, expiraEm, email }
const contas = new Map();
// O `state` do OAuth impede que um site qualquer complete a conexao no lugar da
// pessoa. Ele e **assinado**, nao guardado: se fosse um Map em memoria, um
// restart do servidor no meio do fluxo derrubaria a conexao (e em hospedagem
// sem disco isso acontece a toa). Assinado, ele sobrevive ao restart e continua
// impossivel de forjar sem o segredo.
const ESTADO_VALIDADE_MS = 10 * 60 * 1000;

function assinarEstado(dados) {
  return crypto.createHmac('sha256', usuarios.getSegredoSessao()).update(dados).digest('hex');
}

// O estado diz PRA QUE e o pedido - 'agenda' (valor = uid de quem conecta) ou
// 'login' (valor = hash do nonce guardado no cookie do navegador). Sem o tipo
// assinado junto, um estado de login serviria pra conectar agenda e vice-versa.
function criarEstado(tipo, valor) {
  const corpo = Buffer.from(tipo + '.' + valor + '.' + Date.now()).toString('base64url');
  return corpo + '.' + assinarEstado(corpo);
}

function abrirEstado(state) {
  if (typeof state !== 'string') return null;
  const corte = state.lastIndexOf('.');
  if (corte < 1) return null;
  const [tipo, valor, criadoEm] = Buffer.from(state.slice(0, corte), 'base64url').toString('utf8').split('.');
  return { tipo, valor, criadoEm, corpo: state.slice(0, corte), assinatura: state.slice(corte + 1) };
}

// So pra rota do callback decidir QUAL fluxo continua. Nao confere nada: quem
// confere e o lerEstado, dentro de cada fluxo.
function tipoDoEstado(state) {
  const e = abrirEstado(state);
  return e ? e.tipo : null;
}

// Devolve o valor, ou null se a assinatura nao bater, o tipo for outro ou o
// pedido tiver vencido.
function lerEstado(state, tipo) {
  const e = abrirEstado(state);
  if (!e) return null;
  const esperada = assinarEstado(e.corpo);
  if (e.assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(e.assinatura), Buffer.from(esperada))) return null;
  if (e.tipo !== tipo || !e.valor || !e.criadoEm) return null;
  if (Date.now() - Number(e.criadoEm) > ESTADO_VALIDADE_MS) return null;
  return e.valor;
}

function configurado() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    Object.entries(dados.contas || {}).forEach(([uid, c]) => contas.set(uid, c));
  } catch (e) {
    console.error('Nao consegui ler google.json:', e.message);
  }
}

function salvar() {
  try {
    const obj = {};
    contas.forEach((c, uid) => { obj[uid] = c; });
    pastaDados.gravarSeguro(ARQUIVO, JSON.stringify({ contas: obj }, null, 2));
  } catch (e) {
    console.error('Nao consegui salvar google.json:', e.message);
  }
}

carregar();

function conectado(uid) {
  return contas.has(uid);
}

function emailConectado(uid) {
  const c = contas.get(uid);
  return c ? c.email : null;
}

function desconectar(uid) {
  contas.delete(uid);
  salvar();
}

// ---------- fluxo de OAuth ----------

function urlDeConsentimento(uid) {
  const state = criarEstado('agenda', uid);

  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: ESCOPO,
    access_type: 'offline', // precisa pra vir refresh_token
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

async function trocarCodigoPorToken(code, state) {
  const uid = lerEstado(state, 'agenda');
  if (!uid) return { erro: 'Pedido de conexao expirado ou invalido. Tente de novo.' };

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const dados = await resp.json();
  if (!resp.ok) return { erro: dados.error_description || 'O Google recusou a conexao.' };
  if (!dados.refresh_token) {
    return { erro: 'O Google nao mandou refresh token. Desconecte a sede na sua conta Google e tente de novo.' };
  }

  const email = await buscarEmail(dados.access_token);
  contas.set(uid, {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token,
    expiraEm: Date.now() + (dados.expires_in || 3600) * 1000,
    email,
  });
  salvar();
  return { ok: true, uid };
}

async function buscarEmail(accessToken) {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.email || null;
  } catch (e) {
    return null;
  }
}

// Renova antes de vencer. Uma renovacao por vez por pessoa, senao duas chamadas
// simultaneas gastam dois refresh e uma invalida a outra.
const renovando = new Map();

async function tokenValido(uid) {
  const conta = contas.get(uid);
  if (!conta) return null;
  if (Date.now() < conta.expiraEm - 60 * 1000) return conta.accessToken;

  if (renovando.has(uid)) return renovando.get(uid);

  const promessa = (async () => {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: conta.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const dados = await resp.json();
    if (!resp.ok) {
      // refresh revogado: tira a conta pra pessoa poder reconectar
      console.error('Refresh do Google falhou para', uid, dados.error);
      contas.delete(uid);
      salvar();
      return null;
    }
    conta.accessToken = dados.access_token;
    conta.expiraEm = Date.now() + (dados.expires_in || 3600) * 1000;
    salvar();
    return conta.accessToken;
  })().finally(() => renovando.delete(uid));

  renovando.set(uid, promessa);
  return promessa;
}

// ---------- eventos ----------

async function listarEventos(uid, inicioISO, fimISO) {
  const token = await tokenValido(uid);
  if (!token) return { erro: 'Conta do Google desconectada.' };

  const p = new URLSearchParams({
    timeMin: inicioISO,
    timeMax: fimISO,
    singleEvents: 'true', // ja expande as recorrentes
    orderBy: 'startTime',
    maxResults: '100',
  });

  const resp = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?' + p.toString(),
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!resp.ok) {
    const d = await resp.json().catch(() => ({}));
    return { erro: (d.error && d.error.message) || 'O Google recusou a consulta.' };
  }

  const dados = await resp.json();
  const eventos = (dados.items || [])
    .filter((ev) => ev.status !== 'cancelled' && ev.start)
    .map((ev) => ({
      titulo: ev.summary || '(sem titulo)',
      // evento de dia inteiro vem em `date`; com hora, em `dateTime`
      inicio: new Date(ev.start.dateTime || ev.start.date).getTime(),
      fim: new Date((ev.end && (ev.end.dateTime || ev.end.date)) || ev.start.dateTime).getTime(),
      diaInteiro: !ev.start.dateTime,
    }))
    .filter((ev) => Number.isFinite(ev.inicio) && Number.isFinite(ev.fim));

  return { eventos };
}

// ---------- entrar na sede com o Google ----------
//
// POR QUE: o cadastro com senha aceita qualquer fulano@admsolucoes.com.br que a
// pessoa DIGITAR - a sede nao tem como mandar e-mail de confirmacao. O Google
// tem: so completa o login quem e dono da conta, e a conta de Workspace da ADM
// e administrada pela propria ADM. Entao o Google vira a prova de que a pessoa e
// da casa.
//
// O redirect e o mesmo da agenda (/api/google/callback): um endereco so pra
// cadastrar no Google Cloud. O `state` assinado diz qual dos dois fluxos e.
//
// LOGIN CSRF: sem amarrar o pedido ao navegador, um site malicioso poderia
// completar o login com o codigo de OUTRA conta e deixar a vitima logada na
// conta do atacante (e tudo que ela escrevesse, ele leria). Por isso o inicio
// grava um nonce num cookie HttpOnly, o `state` leva o hash dele, o Google
// devolve o mesmo hash dentro do id_token, e o fim confere os tres.

function hashNonce(nonce) {
  return crypto.createHash('sha256').update(String(nonce)).digest('hex');
}

function urlDeLogin(nonce) {
  const h = hashNonce(nonce);
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: ESCOPO_LOGIN,
    state: criarEstado('login', h),
    nonce: h,
    prompt: 'select_account',
    // So uma DICA pro seletor de contas do Google mostrar a conta da empresa.
    // Nao protege nada sozinha (da pra tirar da URL) - quem barra e o
    // validarIdentidade, com o `hd` que volta assinado no id_token.
    hd: DOMINIOS.length === 1 ? DOMINIOS[0] : '*',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString();
}

// O id_token chega por conexao direta nossa com o Google, em HTTPS - nao passou
// pelo navegador. Nesse caso a especificacao do OpenID (3.1.3.7) dispensa
// conferir a assinatura: o TLS ja garante de quem veio. O resto confere aqui.
function lerIdToken(idToken) {
  try {
    const partes = String(idToken).split('.');
    if (partes.length !== 3) return null;
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Decide se o id_token prova uma pessoa da ADM. Funcao pura, pros testes.
// Devolve { email, nome, sub } ou { erro: 'dominio' | 'invalido' }.
function validarIdentidade(c, { clientId, nonce, agora }) {
  if (!c || typeof c !== 'object') return { erro: 'invalido' };
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') return { erro: 'invalido' };
  if (c.aud !== clientId) return { erro: 'invalido' };
  if (!(Number(c.exp) * 1000 > agora)) return { erro: 'invalido' };
  if (!nonce || c.nonce !== nonce) return { erro: 'invalido' };
  if (!c.sub || !c.email) return { erro: 'invalido' };

  const dominio = dominioDe(c.email);
  if (!DOMINIOS.includes(dominio)) return { erro: 'dominio' };
  // e-mail verificado E conta administrada pelo Workspace desse dominio. Sem o
  // `hd`, seria uma conta Google comum que alguem abriu usando um endereco da
  // ADM - o Google nao garante que ela ainda e da pessoa que tem a caixa.
  if (c.email_verified !== true && c.email_verified !== 'true') return { erro: 'dominio' };
  if (String(c.hd || '').toLowerCase() !== dominio) return { erro: 'dominio' };

  const nome = String(c.given_name || c.name || c.email.split('@')[0]).trim();
  return { email: String(c.email).trim().toLowerCase(), nome, sub: String(c.sub) };
}

// Troca o codigo do callback por quem a pessoa e. `nonceDoCookie` e o que o
// inicio do login gravou NESTE navegador.
async function identidadeDoLogin(code, state, nonceDoCookie) {
  const valor = lerEstado(state, 'login');
  if (!valor) return { erro: 'invalido', motivo: 'estado vencido ou adulterado' };
  const doCookie = nonceDoCookie ? hashNonce(nonceDoCookie) : '';
  if (doCookie.length !== valor.length
    || !crypto.timingSafeEqual(Buffer.from(doCookie), Buffer.from(valor))) {
    return { erro: 'invalido', motivo: 'o login nao comecou neste navegador' };
  }

  let dados;
  try {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    dados = await resp.json().catch(() => ({}));
    if (!resp.ok || !dados.id_token) {
      return { erro: 'invalido', motivo: dados.error_description || dados.error || 'o Google recusou o codigo' };
    }
  } catch (e) {
    return { erro: 'invalido', motivo: 'sem conexao com o Google: ' + e.message };
  }

  const r = validarIdentidade(lerIdToken(dados.id_token), { clientId: CLIENT_ID, nonce: valor, agora: Date.now() });
  if (r.erro) r.motivo = r.erro === 'dominio' ? 'conta Google fora do dominio da sede' : 'id_token nao confere';
  return r;
}

module.exports = {
  configurado, conectado, emailConectado, desconectar,
  urlDeConsentimento, trocarCodigoPorToken, listarEventos,
  urlDeLogin, identidadeDoLogin, tipoDoEstado,
  REDIRECT_URI,
  // pros testes
  _validarIdentidade: validarIdentidade,
  _criarEstado: criarEstado,
  _lerEstado: lerEstado,
};
