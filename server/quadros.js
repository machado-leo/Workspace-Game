// A aba de quadros da sede: um botao por diretoria. Ver docs/plano-kanban-crm.md.
//
// De onde vem cada quadro:
//   - do KANBAN DO CRM (server/kanban-crm.js): os quadros que o CRM diz que ESTA pessoa
//     pode ver, pelo cargo dela. E la que o time trabalha hoje;
//   - do TRELLO (server/trello.js): so os que a sede listar em TRELLO_QUADROS. Eram os
//     quadros de antes do CRM ter o Kanban proprio.
//
// Este arquivo so junta os dois numa lista so e entrega o quadro escolhido; quem
// fala com cada lado, com cache e mensagem de falha, sao os outros dois. O evento do
// socket continua se chamando `trello-pedir` / `trello` (nome de quando so havia o Trello).
const kanbanCrm = require('./kanban-crm');
const trello = require('./trello');

// A chave de um quadro do CRM. Nenhuma chave de setor do Trello tem ":", entao as duas
// familias nunca se confundem.
const PREFIXO_CRM = 'crm:';

const SEM_EMAIL_PROVADO = 'Entre uma vez com o Google da ADM (ou confirme seu e-mail pelo link) pra ver os quadros do CRM: '
  + 'e isso que prova ao CRM quem esta olhando.';
const SEM_QUADRO_NO_CRM = 'Nenhum quadro do Kanban foi liberado pra voce no CRM (o seu cargo la define quais). Fale com um gestor.';
const NADA_LIGADO = 'Os quadros ainda nao foram ligados nesta sede (falta o Kanban do CRM ou o Trello - ver docs/plano-kanban-crm.md).';

// Com o Kanban do CRM ligado, o TRELLO_BOARD_ID de antes (o quadro antigo, parado) deixa
// de aparecer: so entra do Trello o que estiver listado no TRELLO_QUADROS.
function trelloComLegado() {
  return !kanbanCrm.configurado();
}

// O que esta ligado, pro diagnostico: o Kanban do CRM e o Trello (este, contando o quadro
// antigo so quando o CRM esta desligado).
function situacao() {
  return { kanban: kanbanCrm.configurado(), trello: trello.configurado({ legado: trelloComLegado() }) };
}

function configurado() {
  const s = situacao();
  return s.kanban || s.trello;
}

// Linhas pro log do arranque (server/index.js).
function resumo() {
  const crm = kanbanCrm.configurado();
  const linhas = [crm
    ? 'Kanban do CRM: ligado'
    : 'Kanban do CRM: desligado (defina CRM_URL e CRM_CHAVE_KANBAN - ver docs/plano-kanban-crm.md)'];
  linhas.push(crm && !trello.configurado({ legado: false })
    ? 'Trello: nenhum quadro listado (com o Kanban do CRM ligado, so entram os do TRELLO_QUADROS)'
    : trello.resumo({ legado: trelloComLegado() }));
  return linhas;
}

const juntar = (...avisos) => avisos.filter(Boolean).join(' ');

// { quadro, forcar, diretoria, email }
//   quadro     a chave do quadro pedido (a de um botao que a propria aba recebeu);
//   forcar     "Atualizar": passa por cima do cache (com freio, nos dois lados);
//   diretoria  a conta e da diretoria (decide quais quadros do TRELLO ela ve);
//   email      o e-mail PROVADO da conta, ou null. E ele que diz ao CRM quem esta olhando:
//              quem chama passa null pra conta que nao provou o e-mail.
// Nunca lanca: se o CRM ou o Trello cair, a aba avisa e a sede segue funcionando.
async function obter({ quadro, forcar, diretoria, email } = {}) {
  const crmLigado = kanbanCrm.configurado();
  const entradas = [];
  let doCrm = null;
  let avisoCrm = null;

  if (crmLigado) {
    if (!email) {
      avisoCrm = SEM_EMAIL_PROVADO;
    } else {
      const r = await kanbanCrm.quadrosDe(email, { forcar: forcar === true });
      if (r.ok) {
        doCrm = r;
        avisoCrm = r.aviso || (r.quadros.length ? null : SEM_QUADRO_NO_CRM);
        r.quadros.forEach((q) => entradas.push({ chave: PREFIXO_CRM + q.id, nome: q.nome, restrito: false, origem: 'crm' }));
      } else {
        avisoCrm = r.erro;
      }
    }
  }
  trello.listar({ diretoria, legado: trelloComLegado() })
    .forEach((s) => entradas.push({ chave: s.chave, nome: s.nome, restrito: s.restrito, origem: 'trello' }));

  if (!entradas.length) {
    return { setores: [], listas: [], indisponivel: avisoCrm || NADA_LIGADO };
  }

  // Uma chave que nao existe (ou de um quadro que a pessoa nao pode ver) cai no primeiro:
  // nunca vira erro, e nunca deixa alguem ler o que nao devia.
  const atual = entradas.find((e) => e.chave === quadro) || entradas[0];
  const resposta = {
    setores: entradas,
    atual: atual.chave,
    origem: atual.origem,
    listas: [],
  };

  if (atual.origem === 'crm') {
    const q = doCrm.quadros.find((x) => PREFIXO_CRM + x.id === atual.chave);
    resposta.nome = q.nome;
    resposta.url = q.url;
    resposta.listas = q.listas;
    resposta.atualizadoEm = doCrm.atualizadoEm;
    if (avisoCrm) resposta.indisponivel = avisoCrm;
  } else {
    const t = await trello.obter({ quadro: atual.chave, forcar, diretoria, legado: trelloComLegado() });
    resposta.nome = t.nome;
    resposta.url = t.url;
    resposta.filtro = t.filtro;
    resposta.listas = t.listas;
    resposta.atualizadoEm = t.atualizadoEm;
    // O quadro antigo (TRELLO_BOARD_ID) nao tem nome de setor: o nome vem do proprio Trello,
    // e so se sabe depois da primeira leitura.
    const nomesDoTrello = new Map((t.setores || []).map((s) => [s.chave, s.nome]));
    resposta.setores = entradas.map((e) => (e.origem === 'trello' && nomesDoTrello.has(e.chave)
      ? Object.assign({}, e, { nome: nomesDoTrello.get(e.chave) })
      : e));
    const aviso = juntar(avisoCrm, t.indisponivel);
    if (aviso) resposta.indisponivel = aviso;
  }
  return resposta;
}

module.exports = { obter, configurado, situacao, resumo, PREFIXO_CRM };
