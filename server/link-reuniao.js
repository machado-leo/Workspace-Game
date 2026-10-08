// O link de UMA reuniao, pra quem e de fora da sede: `/r/<token>`. Ver
// docs/plano-reuniao-por-link.md.
//
// COMO NO MEET: o visitante nao entra na sede - entra na reuniao, e so nela. Nao
// tem conta, nao tem cookie, nao ve o mapa nem o chat. O token e o unico
// documento dele, e vale para uma reuniao so.
//
// O token nao guarda estado no servidor: o proprio valor diz de qual reuniao e,
// e a assinatura garante que ninguem editou. Mesma ideia do cookie de sessao
// (server/sessao.js), e pelo mesmo motivo: nao ha banco, e uma lista de links
// emitidos seria mais um arquivo pra sincronizar.
//
// Tres coisas entram no token, e cada uma fecha uma porta:
//   - o ID da reuniao (qual sala e essa);
//   - o `criadaEm` dela: o id volta a 1 se o disco for apagado (Render gratis),
//     e sem isto o link de uma reuniao antiga abriria a reuniao NOVA que herdou
//     o numero;
//   - a VERSAO do link, que e o botao "Novo link": subir a versao mata o link
//     que vazou sem apagar a reuniao.
const crypto = require('crypto');
const usuarios = require('./usuarios');

// 128 bits de assinatura: adivinhar e impossivel, e o link continua curto.
const TAMANHO_ASSINATURA = 32;
const TAMANHO_MAXIMO = 200;

// O segredo e o mesmo do cookie de sessao; o prefixo separa os usos, entao uma
// assinatura feita pra um lugar nunca serve no outro.
function assinar(corpo) {
  return crypto.createHmac('sha256', usuarios.getSegredoSessao())
    .update('link-reuniao:' + corpo)
    .digest('hex')
    .slice(0, TAMANHO_ASSINATURA);
}

function criar({ id, criadaEm, versao }) {
  const corpo = Buffer.from([id, criadaEm, versao].join('.')).toString('base64url');
  return corpo + '.' + assinar(corpo);
}

// { id, criadaEm, versao } se a assinatura bate, ou null. NAO confere se a
// reuniao existe nem se o horario vale: isso e da reuniao (server/reunioes.js).
function ler(token) {
  if (typeof token !== 'string' || token.length > TAMANHO_MAXIMO) return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;

  const corpo = token.slice(0, corte);
  const assinatura = token.slice(corte + 1);
  const esperada = assinar(corpo);
  // Comparacao em tempo constante, como em sessao.js: nao entrega a assinatura
  // certa byte a byte pra quem ficar tentando.
  if (assinatura.length !== esperada.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;

  const [id, criadaEm, versao] = Buffer.from(corpo, 'base64url').toString('utf8').split('.').map(Number);
  if (![id, criadaEm, versao].every(Number.isFinite)) return null;
  return { id, criadaEm, versao };
}

module.exports = { criar, ler };
