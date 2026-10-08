// E-mail transacional: confirmar o e-mail e trocar a senha. Ver docs/email.md.
//
// POR QUE: sem e-mail, o cadastro com senha nao confere nada - qualquer um
// digita fulano@empresa.com.br - e "esqueci minha senha" dependia de alguem da
// diretoria gerar uma senha provisoria na mao. Com uma sede por cliente, as duas
// coisas deixam de fechar a conta.
//
// COMO: API HTTP de um provedor, com `fetch` - sem dependencia nova, do mesmo
// jeito que o Google e o Trello sao feitos aqui. Dois provedores, os dois com
// plano gratis que da e sobra pra este volume (so confirmacao e troca de senha):
//
//   EMAIL_PROVEDOR=resend   (resend.com)     EMAIL_CHAVE = a API key
//   EMAIL_PROVEDOR=brevo    (brevo.com)      EMAIL_CHAVE = a API key (v3)
//   EMAIL_REMETENTE=avisos@sedes.admsolucoes.com.br   (dominio verificado no provedor)
//
// Sem as tres, o e-mail fica DESLIGADO e tudo funciona como antes: cadastro com
// senha entra direto, e quem esqueceu a senha pede pra diretoria.
//
// O nome que aparece como remetente e o da sede (server/marca.js): cada cliente
// recebe e-mail "da Acme Consultoria", e nao da ADM.
const { marca, escaparHtml } = require('./marca');

const PROVEDOR = String(process.env.EMAIL_PROVEDOR || '').trim().toLowerCase();
const CHAVE = String(process.env.EMAIL_CHAVE || '').trim();
const REMETENTE = String(process.env.EMAIL_REMETENTE || '').trim();
// Os testes apontam pra um provedor falso (testes/email.js) - e so fora de
// producao, pra ninguem desviar os e-mails de verdade mexendo numa variavel.
const API_TESTE = process.env.NODE_ENV !== 'production' ? String(process.env.EMAIL_API_TESTE || '').trim() : '';

// O endereco publico da sede: e pra onde os links apontam. Mesma regra do
// Google (server/google.js).
const ENDERECO = String(process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || '').trim();
const SITE_URL = (ENDERECO || 'http://localhost:3500').replace(/\/$/, '');

function configurado() {
  return (PROVEDOR === 'resend' || PROVEDOR === 'brevo') && !!CHAVE && !!REMETENTE;
}

// Em producao, sem o endereco publico, o link iria pra localhost - que nao abre
// no celular de ninguem. Ai o e-mail fica DESLIGADO (e o arranque diz por que):
// ligado com link quebrado, todo cadastro ficaria esperando uma confirmacao que
// nunca chega.
function ligado() {
  return configurado() && (!!ENDERECO || process.env.NODE_ENV !== 'production');
}

// Uma linha pro log do arranque (server/index.js). Sem chave, sem remetente.
function situacao() {
  if (!configurado()) return 'E-mail: desligado (defina EMAIL_PROVEDOR, EMAIL_CHAVE e EMAIL_REMETENTE - ver docs/email.md).';
  if (!ligado()) return 'E-mail: DESLIGADO - falta SITE_URL, o endereco publico da sede, pros links do e-mail abrirem.';
  return 'E-mail: ligado (' + PROVEDOR + '), links para ' + SITE_URL;
}

async function enviar({ para, assunto, texto, html }) {
  if (!ligado()) throw new Error('e-mail nao configurado');
  // Aspas no nome estragariam o cabecalho "Nome <endereco>".
  const nome = marca.nome.replace(/["<>\r\n]/g, '');
  let url;
  let cabecalhos;
  let corpo;
  if (PROVEDOR === 'resend') {
    url = (API_TESTE || 'https://api.resend.com') + '/emails';
    cabecalhos = { Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' };
    corpo = { from: '"' + nome + '" <' + REMETENTE + '>', to: [para], subject: assunto, text: texto, html };
  } else {
    url = (API_TESTE || 'https://api.brevo.com') + '/v3/smtp/email';
    cabecalhos = { 'api-key': CHAVE, 'Content-Type': 'application/json', Accept: 'application/json' };
    corpo = { sender: { name: nome, email: REMETENTE }, to: [{ email: para }], subject: assunto, textContent: texto, htmlContent: html };
  }
  const r = await fetch(url, {
    method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo),
    // provedor fora do ar nao pode segurar o cadastro da pessoa pra sempre
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('o provedor de e-mail respondeu ' + r.status);
}

// ------------------------------------------------------------------ textos
// Texto simples E html: cliente de e-mail que nao mostra html (ou filtro que
// desconfia de e-mail so com html) ainda le o link.

function montar({ saudacao, paragrafo, botao, link, validade }) {
  const texto = [
    saudacao,
    '',
    paragrafo,
    '',
    link,
    '',
    'O link vale ' + validade + '. Se nao foi voce, e so ignorar este e-mail.',
    '',
    '-- ' + marca.nome,
  ].join('\n');
  const e = escaparHtml;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:520px">'
    + '<p>' + e(saudacao) + '</p>'
    + '<p>' + e(paragrafo) + '</p>'
    + '<p><a href="' + e(link) + '" style="display:inline-block;padding:10px 18px;border-radius:8px;'
    + 'background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold">' + e(botao) + '</a></p>'
    + '<p style="color:#6b7280;font-size:13px">Se o botao nao abrir, copie este endereco:<br>' + e(link) + '</p>'
    + '<p style="color:#6b7280;font-size:13px">O link vale ' + e(validade) + '. Se nao foi voce, e so ignorar este e-mail.</p>'
    + '<p style="color:#6b7280;font-size:13px">' + e(marca.nome) + '</p>'
    + '</div>';
  return { texto, html };
}

// Sem o nome da conta nos textos: no cadastro, o nome e digitado por quem
// cadastrou - que pode nao ser o dono do e-mail - e viraria um jeito de mandar
// texto qualquer, com a nossa assinatura, pra caixa de entrada de outra pessoa.

// O link leva pra tela de login, e a conta so e confirmada junto com a SENHA do
// cadastro (server/auth.js, rota /entrar). Abrir o link, sozinho, nao faz nada.
function confirmacao({ token }) {
  const link = SITE_URL + '/?confirmar=' + encodeURIComponent(token);
  return Object.assign({ assunto: 'Confirme seu e-mail - ' + marca.nome }, montar({
    saudacao: 'Oi!',
    paragrafo: 'Pra terminar o cadastro na sede da ' + marca.nome + ', abra o link e entre com a senha que voce escolheu:',
    botao: 'Confirmar e entrar',
    link,
    validade: '24 horas',
  }));
}

function novaSenha({ token }) {
  const link = SITE_URL + '/?redefinir=' + encodeURIComponent(token);
  return Object.assign({ assunto: 'Nova senha - ' + marca.nome }, montar({
    saudacao: 'Oi!',
    paragrafo: 'Alguem pediu uma senha nova pra sua conta na sede da ' + marca.nome + '. Pra escolher a nova:',
    botao: 'Escolher nova senha',
    link,
    validade: '1 hora, e uma vez so',
  }));
}

module.exports = { ligado, configurado, situacao, enviar, confirmacao, novaSenha, SITE_URL };
