// Links assinados que vao por e-mail: confirmar o e-mail e trocar a senha.
// Ver docs/email.md.
//
// Mesma ideia do cookie de sessao e do `state` do Google: o link NAO fica
// guardado no servidor. Ele carrega pra que serve, de quem e e quando vence, e a
// assinatura (HMAC com o segredo das sessoes) garante que ninguem inventou nem
// editou. Sem tabela de "tokens pendentes", nada pra limpar, e reiniciar o
// servidor nao invalida link nenhum.
//
// USO UNICO sem guardar nada: o link carrega uma IMPRESSAO do estado que ele vai
// mudar. O de trocar senha leva a impressao da senha ATUAL - trocou a senha, a
// impressao nao bate mais, e o mesmo link (ou um mais velho, que tenha ficado
// na caixa de entrada) para de valer.
const crypto = require('crypto');
const usuarios = require('./usuarios');

function hmac(texto) {
  return crypto.createHmac('sha256', usuarios.getSegredoSessao()).update(texto).digest('hex');
}

// A impressao de um valor, curta: so pra comparar, nunca pra recuperar.
function impressao(valor) {
  return hmac('impressao:' + String(valor || '')).slice(0, 16);
}

function criar(finalidade, uid, validadeMs, marca) {
  const corpo = Buffer.from(JSON.stringify({
    f: finalidade, u: uid, e: Date.now() + validadeMs, m: marca || '',
  })).toString('base64url');
  return corpo + '.' + hmac('link:' + corpo);
}

// { uid, marca } se o link e desta finalidade, assinado por nos e nao venceu.
function ler(token, finalidade) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;
  const corpo = token.slice(0, corte);
  const assinatura = token.slice(corte + 1);
  const esperada = hmac('link:' + corpo);
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;
  let dados;
  try { dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!dados || dados.f !== finalidade || !dados.u) return null;
  if (!(Number(dados.e) > Date.now())) return null;
  return { uid: dados.u, marca: dados.m || '' };
}

module.exports = { criar, ler, impressao };
