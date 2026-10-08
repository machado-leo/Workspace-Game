// Discador do CRM, dentro da sede. Ver docs/discador.md.
//
// A sede NAO decide nada do discador: quem monta a fila, escreve o roteiro e
// grava cada ligacao e o CRM (crm-adm/src/lib/discador-servidor.ts). Aqui e so
// a ponte: o servidor da sede fala com a porta do CRM usando uma chave
// combinada, e diz em nome de QUEM.
//
// E por isso a regra dura deste arquivo: o "em nome de quem" e sempre o e-mail
// da CONTA LOGADA, e so de conta com o e-mail PROVADO (entrou com o Google, ou
// confirmou pelo link). Conta criada so com senha nao prova nada - qualquer um
// digita fulano@admsolucoes.com.br - e aqui ela leria os leads do CRM e
// ligaria em nome de outra pessoa. O e-mail NUNCA vem do corpo do pedido.
//
// Mesma linha do google.js: a sede nao recebe a chave de servico do Supabase
// do CRM (que abre o banco inteiro). A chave daqui so abre o discador.
const CRM_URL = String(process.env.CRM_URL || '').trim().replace(/\/+$/, '');
const CHAVE = String(process.env.CRM_CHAVE_DISCADOR || '').trim();

const TEMPO_MAXIMO_MS = 15000;

function configurado() {
  return !!(CRM_URL && /^https?:\/\//.test(CRM_URL) && CHAVE.length >= 32);
}

// Quem pode usar - e, se nao pode, a frase que explica o que fazer.
function recusa(usuario) {
  if (!usuario) return { status: 401, erro: 'Faca login pra continuar.' };
  // "Nao ligado" antes de tudo: numa sede de cliente o discador nao existe, e a
  // frase de baixo (que fala do Google da ADM) nao tem nada que aparecer la.
  if (!configurado()) return { status: 503, erro: 'O discador ainda nao foi ligado nesta sede.' };
  if (usuario.emailVerificado !== true) {
    return {
      status: 403,
      erro: 'Entre uma vez com o Google da ADM (ou confirme seu e-mail pelo link) pra usar o discador: '
        + 'e isso que prova ao CRM quem esta ligando.',
    };
  }
  return null;
}

async function pedirAoCrm(caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(CRM_URL + caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CHAVE },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
  } catch (e) {
    console.error('[discador] CRM fora do ar: ' + (e && e.name));
    return { status: 502, corpo: { erro: 'O CRM nao respondeu. Tenta de novo em instantes.' } };
  }
  let dados = {};
  try { dados = await resposta.json(); } catch (e) { dados = {}; }
  if (!resposta.ok) {
    // O CRM responde `error`; a sede fala `erro`. A mensagem dele e pra gente
    // (ex.: "Seu e-mail nao tem acesso ao CRM"), entao passa adiante - menos
    // a da chave, que e problema de configuracao e nao da pessoa.
    const msg = resposta.status === 401
      ? 'A sede e o CRM nao estao com a mesma chave do discador. Avise a diretoria.'
      : (dados && (dados.error || dados.erro)) || ('O CRM recusou (' + resposta.status + ').');
    return { status: resposta.status, corpo: { erro: msg } };
  }
  return { status: 200, corpo: dados };
}

// So os filtros que existem, com o tipo certo. O resto do corpo nao viaja.
function filtrosLimpos(f) {
  const entrada = f && typeof f === 'object' ? f : {};
  const saida = {};
  if (typeof entrada.segmento === 'string') saida.segmento = entrada.segmento.slice(0, 120);
  if (typeof entrada.cidade === 'string') saida.cidade = entrada.cidade.slice(0, 120);
  if (['', 'Quente', 'Morno', 'Frio', 'sem'].includes(entrada.temperatura)) saida.temperatura = entrada.temperatura;
  if (typeof entrada.nuncaLigado === 'boolean') saida.nuncaLigado = entrada.nuncaLigado;
  if (entrada.semContatoDias === null
    || (Number.isInteger(entrada.semContatoDias) && entrada.semContatoDias >= 1 && entrada.semContatoDias <= 365)) {
    saida.semContatoDias = entrada.semContatoDias;
  }
  return saida;
}

function fila(usuario, filtros) {
  return pedirAoCrm('/api/discador/externo/fila', { email: usuario.email, filtros: filtrosLimpos(filtros) });
}

// A ligacao em si o CRM valida campo a campo (zod). Aqui so garante que e um
// objeto e que o e-mail e o da conta - nunca um que tenha vindo dentro dela.
function registrar(usuario, ligacao) {
  const l = ligacao && typeof ligacao === 'object' && !Array.isArray(ligacao) ? Object.assign({}, ligacao) : {};
  delete l.email;
  return pedirAoCrm('/api/discador/externo/ligacao', { email: usuario.email, ligacao: l });
}

module.exports = { configurado, recusa, fila, registrar, filtrosLimpos };
