// Quem e "da ADM" pelo e-mail. Um lugar so, porque duas portas dependem disto:
// o cadastro com senha (server/auth.js) e o login com o Google (server/google.js).
//
// ATENCAO: o dominio sozinho NAO prova nada. Qualquer um digita
// fulano@admsolucoes.com.br num formulario. So o login com o Google prova que a
// pessoa e dona do endereco - ver "Entrar com o Google" em docs/plano-login.md.
//
// VARIAS SEDES (scripts/sedes.sh): DOMINIOS_SEDE AUSENTE cai no padrao da ADM,
// como sempre foi. Mas DOMINIOS_SEDE PRESENTE E VAZIO quer dizer "nenhum
// dominio": ninguem cria conta por e-mail. Antes, vazio tambem caia no padrao -
// e a sede de um cliente criado sem dominio aceitaria cadastro de qualquer
// @admsolucoes. Com varias empresas no mesmo servidor, isso e vazamento.
// `aluno.uece.br` (POR ENQUANTO): os membros novos ainda nao tem o e-mail da
// ADM, so o de aluno da UECE. Entao o e-mail da UECE tambem conta como "da sede"
// - entra pelo mesmo caminho do e-mail da ADM. Com o Google ligado, isso quer
// dizer "Entrar com o Google da UECE" (a conta @aluno.uece.br e Google Workspace,
// entao o Google prova quem e, igual a da ADM). Tirar esta entrada da lista
// quando todo mundo ja tiver o e-mail da ADM.
const DOMINIOS_PADRAO = ['admsolucoes.com.br', 'admsolucoes.com', 'aluno.uece.br'];
const bruto = process.env.DOMINIOS_SEDE;
const DOMINIOS = bruto === undefined
  ? DOMINIOS_PADRAO
  : String(bruto).split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

function dominioDe(email) {
  const texto = String(email || '').trim();
  const arroba = texto.lastIndexOf('@');
  return arroba < 0 ? '' : texto.slice(arroba + 1).toLowerCase();
}

function ehEmailDaSede(email) {
  const dominio = dominioDe(email);
  return !!dominio && DOMINIOS.includes(dominio);
}

module.exports = { DOMINIOS, dominioDe, ehEmailDaSede };
