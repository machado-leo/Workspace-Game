// Os prazos do Kanban do CRM na Agenda da sede.
//
// POR QUE EXISTE
// O pedido mais antigo do Caio: "calendario e trello de cada diretoria lincados". A
// Agenda mostrava so o Google e as reunioes da sede; o prazo de cada cartao morava
// dentro do quadro, e ninguem abria o quadro pra saber o que vencia na semana.
//
// DE ONDE VEM
// Dos MESMOS quadros da aba Quadros (server/kanban-crm.js): os que o CRM libera pro
// cargo da pessoa, pela mesma porta, com a mesma regra (so e-mail PROVADO) e o mesmo
// cache de 1 minuto - abrir a Agenda nao vira uma chamada nova ao CRM.
//
// "MEUS"
// O CRM manda os membros do cartao pelo NOME (a pessoa no CRM), nao pelo e-mail. Entao
// "meu" e o cartao em que um membro tem o nome da conta da sede: mesmo primeiro nome, e
// os nomes do mais curto todos no mais longo ("Caio" e "Caio Lucas" batem; "Caio Lucas"
// e "Caio Silva" nao). A tela diz que e pelo nome.
const JANELA_ATRAS_DIAS = 30;     // atrasado ha mais que isso ja nao e agenda, e abandono
const JANELA_FRENTE_DIAS = 90;
const MAX_PRAZOS = 300;
const PALAVRAS_DE_LIGACAO = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function palavras(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2 && !PALAVRAS_DE_LIGACAO.has(p));
}

function mesmoNome(a, b) {
  const pa = palavras(a);
  const pb = palavras(b);
  if (!pa.length || !pb.length || pa[0] !== pb[0]) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const tem = new Set(longo);
  return curto.every((p) => tem.has(p));
}

function somarDias(dia, n) {
  const d = new Date(dia + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// quadros: o que kanban-crm.quadrosDe devolve. hoje: 'AAAA-MM-DD'.
// -> [{ id, nome, url, prazo, concluido, meu, quadro, lista }], do prazo mais cedo ao mais tarde.
function extrair(quadros, { meuNome, hoje }) {
  const de = somarDias(hoje, -JANELA_ATRAS_DIAS);
  const ate = somarDias(hoje, JANELA_FRENTE_DIAS);
  const saida = [];
  (quadros || []).forEach((q) => {
    (q.listas || []).forEach((l) => {
      (l.cartoes || []).forEach((c) => {
        if (!c.prazo || c.prazo < de || c.prazo > ate) return;
        saida.push({
          id: c.id,
          nome: c.nome,
          url: c.url,
          prazo: c.prazo,
          concluido: c.prazoConcluido === true,
          meu: !!meuNome && (c.membros || []).some((m) => mesmoNome(meuNome, m)),
          quadro: q.nome,
          lista: l.nome,
        });
      });
    });
  });
  saida.sort((a, b) => (a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : a.nome.localeCompare(b.nome)));
  return saida.slice(0, MAX_PRAZOS);
}

module.exports = { extrair, mesmoNome, JANELA_ATRAS_DIAS, JANELA_FRENTE_DIAS, MAX_PRAZOS };
