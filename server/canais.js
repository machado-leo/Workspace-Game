// Os canais do chat: os tres de sempre (geral, social, projetos) e um por diretoria.
//
// POR QUE EXISTE
// Com tres canais fixos, assunto de uma diretoria ia pro #projetos ou pro #geral e se
// perdia no meio do resto - e a conversa voltava pro grupo de WhatsApp da diretoria.
//
// OS DAS DIRETORIAS
// Abertos pra sede inteira, como os outros: qualquer um le e escreve (canal
// privado e outra decisao, que ficou pra depois - ver docs/plano-trilho.md). Eles
// aparecem numa secao propria do chat, "Diretorias".
//
// Na sede da ADM (sem NOME_SEDE, ver server/marca.js) ja vem com as cinco
// diretorias. Sede de cliente nao tem nenhum, a nao ser que liste os nomes em
// CANAIS_DIRETORIAS, separados por virgula. A variavel tambem troca a lista da ADM,
// e "-" desliga.
//
// O id do canal sai do nome ("Gente e Gestão" -> "gente-e-gestao") e fica no
// historico gravado: trocar o nome de uma diretoria na variavel comeca um canal novo.
const DIRETORIAS_ADM = ['Comercial', 'Marketing', 'Gente e Gestão', 'Finanças', 'Presidência'];
const MAX_DIRETORIAS = 12;
const MAX_NOME = 40;

function paraId(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// { nomeEmpresa, ehAdm, lista } -> [{ id, nome, descricao, grupo? }]
//   lista  o valor de CANAIS_DIRETORIAS (undefined = nao definida)
function montar({ nomeEmpresa, ehAdm, lista }) {
  const fixos = [
    { id: 'geral', nome: 'geral', descricao: 'Avisos e assuntos gerais da ' + nomeEmpresa },
    { id: 'social', nome: 'social', descricao: 'Conversa fiada, memes e combinados' },
    { id: 'projetos', nome: 'projetos', descricao: 'Andamento dos projetos e clientes' },
  ];

  const definida = lista !== undefined && String(lista).trim() !== '';
  let nomes;
  if (definida) nomes = String(lista).trim() === '-' ? [] : String(lista).split(',');
  else nomes = ehAdm ? DIRETORIAS_ADM : [];

  const usados = new Set(fixos.map((c) => c.id));
  const diretorias = [];
  nomes.forEach((bruto) => {
    // Sem quebra de linha nem sinal de HTML: o nome vai pra tela de todo mundo.
    const nome = String(bruto).replace(/[\r\n<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);
    const id = paraId(nome);
    if (!id || usados.has(id) || diretorias.length >= MAX_DIRETORIAS) return;
    usados.add(id);
    diretorias.push({ id, nome, descricao: 'Assuntos da diretoria ' + nome + ' (aberto pra sede toda)', grupo: 'diretoria' });
  });
  return fixos.concat(diretorias);
}

module.exports = { montar, paraId, DIRETORIAS_ADM };
