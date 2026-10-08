// Sessao por cookie assinado, sem estado no servidor: o proprio valor carrega o id
// do usuario e a validade, e a assinatura garante que ninguem editou.
// Ver docs/plano-login.md, secao 4.
const crypto = require('crypto');
const usuarios = require('./usuarios');

const NOME_COOKIE = 'adm_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const PRODUCAO = process.env.NODE_ENV === 'production';

// Modo de desenvolvimento: pula a tela de login entrando sempre numa conta fixa.
// A identidade continua vindo do servidor - o cliente NAO passa a mandar quem
// ele e -, entao o furo que o login fechou (ler DM dos outros) segue fechado.
// Nunca liga junto com NODE_ENV=production.
const SEM_LOGIN = process.env.SEM_LOGIN === '1' && !PRODUCAO;
let usuarioDev = null;
// Segunda conta de desenvolvimento, so pro bot de teste. Existe porque testar
// chamada, divisao de tela ou chat sozinho e impossivel: e preciso uma segunda
// pessoa na sede. Com uma conta so, os dois entrariam como "Dev" e nao daria
// pra saber quem e quem na tela.
let usuarioBot = null;

function definirUsuarioDev(u) {
  usuarioDev = u;
}

function definirUsuarioBot(u) {
  usuarioBot = u;
}

// O bot se identifica no handshake do socket (`query.bot`). So vale com
// SEM_LOGIN ligado, que por sua vez nunca liga em producao - entao nao ha como
// alguem virar outra pessoa na sede publica dizendo que e um bot.
function ehBot(socket) {
  return SEM_LOGIN && !!usuarioBot
    && socket.handshake && socket.handshake.query && socket.handshake.query.bot === '1';
}

function assinar(dados) {
  return crypto.createHmac('sha256', usuarios.getSegredoSessao()).update(dados).digest('hex');
}

// O token leva a VERSAO da sessao da conta (ver usuarios.js, "gestao de conta"):
// trocar ou redefinir a senha sobe a versao, e todo cookie antigo para de valer.
// Cookie emitido antes de existir versao nao tem o terceiro campo e conta como
// versao 0 - por isso ninguem foi deslogado quando isto entrou.
function criarToken(usuarioId, duracaoMs) {
  const dura = Number(duracaoMs) > 0 ? Number(duracaoMs) : DURACAO_MS;
  const conta = usuarios.porId(usuarioId);
  const versao = usuarios.versaoSessao(conta);
  const corpo = Buffer.from(usuarioId + '.' + (Date.now() + dura) + '.' + versao).toString('base64url');
  return corpo + '.' + assinar(corpo);
}

// Dono do token, se a assinatura bate, nao venceu, a conta existe e a versao da
// sessao e a atual.
function contaDoToken(token) {
  const lido = lerToken(token);
  if (!lido) return null;
  const conta = usuarios.porId(lido.usuarioId);
  if (!conta || usuarios.versaoSessao(conta) !== lido.versao) return null;
  return conta;
}

function lerToken(token) {
  if (typeof token !== 'string') return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;

  const corpo = token.slice(0, corte);
  const assinatura = token.slice(corte + 1);
  const esperada = assinar(corpo);
  // Comparacao em tempo constante: nao entrega a assinatura certa byte a byte.
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;

  const [usuarioId, expiraEm, versao] = Buffer.from(corpo, 'base64url').toString('utf8').split('.');
  if (!usuarioId || !expiraEm || Number(expiraEm) < Date.now()) return null;
  return { usuarioId, versao: Number(versao) || 0 };
}

// Parser de cookie pequeno o suficiente pra nao valer uma dependencia nova.
function lerCookies(header) {
  const saida = {};
  String(header || '').split(';').forEach((parte) => {
    const igual = parte.indexOf('=');
    if (igual < 0) return;
    const nome = parte.slice(0, igual).trim();
    if (nome) saida[nome] = decodeURIComponent(parte.slice(igual + 1).trim());
  });
  return saida;
}

// Lax, e nao Strict, de proposito: a volta do login com o Google e uma navegacao
// que CHEGA de accounts.google.com, e com Strict o navegador nao mandaria o
// cookie do nonce nela.
function atributosCookie(maxAgeSegundos, caminho) {
  const partes = [
    'Path=' + (caminho || '/'),
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + maxAgeSegundos,
  ];
  // Sem HTTPS o navegador descarta um cookie Secure - por isso so em producao.
  if (PRODUCAO) partes.push('Secure');
  return partes.join('; ');
}

// Acrescenta em vez de sobrescrever: a volta do Google grava a sessao E apaga
// o cookie do nonce na mesma resposta.
function anexarCookie(res, valor) {
  const atual = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', (atual ? [].concat(atual) : []).concat(valor));
}

function definirCookie(res, usuarioId, duracaoMs) {
  const dura = Number(duracaoMs) > 0 ? Number(duracaoMs) : DURACAO_MS;
  const token = criarToken(usuarioId, dura);
  anexarCookie(res, NOME_COOKIE + '=' + token + '; ' + atributosCookie(dura / 1000));
}

function limparCookie(res) {
  anexarCookie(res, NOME_COOKIE + '=; ' + atributosCookie(0));
}

// Cookie de vida curta e caminho restrito (o nonce do login com o Google).
function definirCookieCurto(res, nome, valor, segundos, caminho) {
  anexarCookie(res, nome + '=' + encodeURIComponent(valor) + '; ' + atributosCookie(segundos, caminho));
}

// Usuario da requisicao HTTP (ou null).
function usuarioDaRequisicao(req) {
  if (SEM_LOGIN && usuarioDev) return usuarioDev;
  const cookies = lerCookies(req.headers.cookie);
  return contaDoToken(cookies[NOME_COOKIE]);
}

// Usuario do handshake do socket (mesmo cookie).
function usuarioDoSocket(socket) {
  if (ehBot(socket)) return usuarioBot;
  if (SEM_LOGIN && usuarioDev) return usuarioDev;
  const cookies = lerCookies(socket.handshake.headers.cookie);
  return contaDoToken(cookies[NOME_COOKIE]);
}

// Barra a rota pra quem nao esta logado.
function exigirLogin(req, res, next) {
  const usuario = usuarioDaRequisicao(req);
  if (!usuario) return res.status(401).json({ erro: 'Faca login pra continuar.' });
  req.usuario = usuario;
  next();
}

// Barra quem nao e diretoria.
function exigirDiretoria(req, res, next) {
  const usuario = usuarioDaRequisicao(req);
  if (!usuario) return res.status(401).json({ erro: 'Faca login pra continuar.' });
  if (!usuario.isAdmin) return res.status(403).json({ erro: 'So a diretoria pode isso.' });
  req.usuario = usuario;
  next();
}

module.exports = {
  definirCookie,
  limparCookie,
  definirCookieCurto,
  lerCookies,
  usuarioDaRequisicao,
  usuarioDoSocket,
  exigirLogin,
  exigirDiretoria,
  SEM_LOGIN,
  definirUsuarioDev,
  definirUsuarioBot,
};
