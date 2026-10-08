// Reunioes internas da sede: marcadas aqui, guardadas aqui, e com a chamada
// junto. Ver docs/plano-reunioes.md.
//
// POR QUE NAO E O GOOGLE AGENDA
// A aba Agenda mostra o Google de cada pessoa, e isso continua. Mas o Google so
// LE: a sede nunca escreve na agenda de ninguem, de proposito (docs/plano-
// calendario.md). Entao nao havia como marcar uma reuniao DA SEDE - e "reuniao
// interna" e justamente a que nao precisa de convite, link nem conta Google.
//
// A CHAMADA E UMA SALA DO MAPA, E NAO UM LINK
// Foi a decisao de projeto. A sede ja tem chamada por proximidade, sala de
// reuniao fechada e TV que espelha quem apresenta. Uma reuniao marcada nao
// precisa de um segundo sistema de video em paralelo: precisa dizer ONDE e
// QUANDO. Entrar na reuniao leva a pessoa ate a sala, e a chamada acontece
// porque todo mundo esta no mesmo lugar - que e como funciona num escritorio.
//
// Isso tambem e o que faz a reuniao "ficar salva": a sala existe sempre, entao
// nao ha chamada que morre quando o ultimo sai.
//
// PRA QUEM E DE FORA, HA O LINK
// Quem e da sede entra pela agenda. Quem NAO e - cliente, candidato, entrevistado
// - entra pelo link da reuniao (`/r/<token>`, ver server/link-reuniao.js), como
// no Meet: so naquela chamada, sem conta, sem ver o mapa nem o chat. Ver
// docs/plano-reuniao-por-link.md.
const fs = require('fs');
const map = require('./map');
const pastaDados = require('./dados');
const linkReuniao = require('./link-reuniao');

const ARQUIVO = pastaDados.arquivo('reunioes.json');

const TITULO_MAX = 80;
const MIN_DURACAO = 15;
const MAX_DURACAO = 8 * 60;
const REUNIOES_MAX = 200;
// Reuniao que acabou ha mais de meio dia sai da lista sozinha. Sem isso a
// agenda da sede viraria um arquivo morto que so cresce.
const GUARDAR_DEPOIS_MS = 12 * 60 * 60 * 1000;

// Quando o LINK vale: abre meia hora antes (quem chega cedo nao fica olhando pra
// uma tela de erro) e fecha duas horas depois do fim marcado (reuniao estoura, e
// quem estava nela nao pode ser barrado ao voltar do banheiro). Antes e depois
// disso o link mostra a hora, em vez de "invalido". Quem esta DENTRO nao e
// tirado no fim: isto so decide quem entra.
const LINK_ABRE_ANTES_MS = 30 * 60 * 1000;
const LINK_FECHA_DEPOIS_MS = 2 * 60 * 60 * 1000;

let reunioes = [];
let proximoId = 1;

// Onde cabe marcar uma reuniao. Sai da PLANTA, nao de uma lista escrita a mao:
// mudou o mapa, muda isto junto.
//
// Duas condicoes, e as duas sao sobre a sala de verdade:
//
//   1. SALA FECHADA (`som.modo === 'sala'`) - e onde a chamada nao vaza pra
//      quem passa do lado de fora.
//   2. tem MESA DE REUNIAO ou MESA REDONDA, ou seja, uma mesa em volta da qual
//      se senta.
//
// A segunda existe pra separar sala de reuniao de CABINE DE CHAMADA. As tres
// cabines tambem sao privativas, mas sao pra uma pessoa so: o movel delas e uma
// poltrona e uma mesinha de apoio (MESA_CENTRO). Marcar "Alinhamento do
// Comercial" numa cabine seria marcar reuniao num lugar onde nao cabe reuniao.
//
// Da pra fazer isso por area (cabine tem 15 tiles, huddle 30), mas o numero
// seria arbitrario e quebraria na primeira vez que alguem mexesse na planta. O
// movel diz o que a sala E.
const MESAS_DE_REUNIAO = [map.MESA_REUNIAO, map.MESA_REDONDA].filter((t) => t !== undefined);

function moveisDaSala(s) {
  const achados = new Set();
  for (let r = s.r0; r <= s.r1; r++) {
    for (let c = s.c0; c <= s.c1; c++) {
      const t = map.tiles[r] && map.tiles[r][c];
      if (t) achados.add(t);
    }
  }
  return achados;
}

function lugaresDaSala(s) {
  let n = 0;
  for (let r = s.r0; r <= s.r1; r++) {
    for (let c = s.c0; c <= s.c1; c++) {
      if (map.ASSENTOS.has(map.tiles[r] && map.tiles[r][c])) n++;
    }
  }
  return n;
}

function salasDisponiveis() {
  return (map.ROOMS || [])
    // Area de som "sala": a conversa fica dentro dela e nao vaza pra quem
    // passa do lado de fora. A diretoria muda isso no editor de areas
    // (docs/areas.md) - marcou uma area como sala fechada, ela passa a poder
    // receber reuniao, desde que tenha mesa de se sentar em volta.
    .filter((s) => map.somDaArea(s.som).modo === 'sala')
    .filter((s) => {
      const moveis = moveisDaSala(s);
      return MESAS_DE_REUNIAO.some((t) => moveis.has(t));
    })
    .map((s) => ({ id: s.id, nome: s.nome, lugares: lugaresDaSala(s) }));
}

function salaValida(id) {
  return salasDisponiveis().some((s) => s.id === id);
}

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    reunioes = Array.isArray(bruto.reunioes) ? bruto.reunioes : [];
    // Reuniao marcada numa sala que saiu da planta (o segundo huddle, na planta
    // compacta) nao tem onde acontecer.
    const existentes = new Set((map.ROOMS || []).map((s) => s.id));
    const antes = reunioes.length;
    reunioes = reunioes.filter((x) => existentes.has(x.sala));
    if (reunioes.length < antes) {
      console.log('[reunioes] ' + (antes - reunioes.length) + ' reuniao(oes) numa sala que nao existe mais ficaram de fora.');
    }
    proximoId = Number(bruto.proximoId) || (reunioes.length + 1);
    limpar();
  } catch (e) {
    console.error('[reunioes] nao consegui ler o arquivo: ' + e.message);
    reunioes = [];
  }
}

let gravando = null;
function salvar() {
  // Junta as gravacoes: marcar tres reunioes seguidas nao escreve tres vezes.
  if (gravando) return;
  gravando = setTimeout(() => {
    gravando = null;
    try {
      pastaDados.gravarSeguro(ARQUIVO, JSON.stringify({ reunioes, proximoId }, null, 2));
    } catch (e) {
      console.error('[reunioes] nao consegui gravar: ' + e.message);
    }
  }, 400);
}

function limpar() {
  const corte = Date.now() - GUARDAR_DEPOIS_MS;
  const antes = reunioes.length;
  reunioes = reunioes.filter((r) => r.fim > corte);
  if (reunioes.length !== antes) salvar();
}

// O link e CALCULADO, nunca guardado: o arquivo so tem a versao dele. Assim o
// reunioes.json nao vira um cofre de links, e o botao "Novo link" e so um numero.
function versaoDoLink(r) {
  return Number(r.linkVersao) || 1;
}

function caminhoDoLink(r) {
  return '/r/' + linkReuniao.criar({ id: r.id, criadaEm: r.criadaEm, versao: versaoDoLink(r) });
}

function listar() {
  limpar();
  return reunioes
    .slice()
    .sort((a, b) => a.inicio - b.inicio)
    .map((r) => Object.assign({}, r, { link: caminhoDoLink(r) }));
}

function obter(id) {
  limpar();
  return reunioes.find((r) => r.id === Number(id)) || null;
}

// A reuniao a que esse link se refere, ou null: assinatura boa (ja conferida por
// quem chamou `link-reuniao.ler`), reuniao ainda existente, a MESMA reuniao (o id
// pode ter sido reaproveitado) e a versao atual do link. Nao olha o horario -
// isso e `estadoDoLink`, porque fora do horario o visitante precisa ver a hora e
// nao um erro.
function porLink(lido) {
  if (!lido) return null;
  const r = obter(lido.id);
  if (!r || r.criadaEm !== lido.criadaEm) return null;
  if (versaoDoLink(r) !== lido.versao) return null;
  return r;
}

// 'antes' | 'aberta' | 'encerrada'
function estadoDoLink(r, agora) {
  const t = agora === undefined ? Date.now() : agora;
  if (t < r.inicio - LINK_ABRE_ANTES_MS) return 'antes';
  if (t > r.fim + LINK_FECHA_DEPOIS_MS) return 'encerrada';
  return 'aberta';
}

// "Novo link": o link que vazou (grupo de WhatsApp, e-mail encaminhado) para de
// abrir e o novo vale no lugar. E de quem marcou ou da diretoria, como desmarcar.
function novoLink(id, autor) {
  const r = reunioes.find((x) => x.id === Number(id));
  if (!r) return { erro: 'Essa reuniao nao existe mais.' };
  if (r.criadaPorUid !== autor.uid && !autor.isAdmin) {
    return { erro: 'So quem marcou (ou a diretoria) troca o link.' };
  }
  r.linkVersao = versaoDoLink(r) + 1;
  salvar();
  return { reuniao: Object.assign({}, r, { link: caminhoDoLink(r) }) };
}

// Devolve { erro } ou { reuniao }. O texto do erro vai direto pra tela, entao
// ele diz o que fazer, e nao so o que esta errado.
function criar({ titulo, inicio, minutos, sala }, autor) {
  const t = String(titulo || '').trim().slice(0, TITULO_MAX);
  if (!t) return { erro: 'Poe um titulo na reuniao.' };

  const comeco = Number(inicio);
  if (!Number.isFinite(comeco)) return { erro: 'Escolhe a data e a hora.' };
  // Um dia pra tras e aceito de proposito: marcar as 14h faltando cinco
  // minutos, ou registrar a que acabou de acontecer, sao casos de verdade.
  if (comeco < Date.now() - 24 * 60 * 60 * 1000) {
    return { erro: 'Essa data ja passou faz tempo.' };
  }
  if (comeco > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return { erro: 'Essa data esta longe demais.' };
  }

  const dur = Math.round(Number(minutos));
  if (!Number.isFinite(dur) || dur < MIN_DURACAO || dur > MAX_DURACAO) {
    return { erro: 'A duracao tem que ficar entre ' + MIN_DURACAO + ' minutos e 8 horas.' };
  }

  if (!salaValida(sala)) return { erro: 'Escolhe uma sala da sede.' };

  if (reunioes.length >= REUNIOES_MAX) return { erro: 'A agenda da sede esta cheia.' };

  const fim = comeco + dur * 60000;

  // Duas reunioes na mesma sala no mesmo horario e o erro que estraga a reuniao
  // de verdade: as duas turmas chegam e uma tem que sair. A sala e fisica, entao
  // o choque e real - nao da pra "entrar nas duas".
  const choque = reunioes.find((r) => r.sala === sala && r.inicio < fim && r.fim > comeco);
  if (choque) {
    return { erro: 'Essa sala ja tem "' + choque.titulo + '" nesse horario.' };
  }

  const reuniao = {
    id: proximoId++,
    titulo: t,
    inicio: comeco,
    fim,
    sala,
    salaNome: (salasDisponiveis().find((s) => s.id === sala) || {}).nome || sala,
    criadaPorUid: autor.uid,
    criadaPorNome: autor.nome,
    criadaEm: Date.now(),
    linkVersao: 1,
  };
  reunioes.push(reuniao);
  salvar();
  return { reuniao: Object.assign({}, reuniao, { link: caminhoDoLink(reuniao) }) };
}

// Desmarcar e de quem marcou, ou da diretoria. Reuniao da sede nao pode ser
// apagada por qualquer um - mas prender a chave so em quem marcou deixaria a
// sede travada quando a pessoa sai da empresa.
function remover(id, autor) {
  const i = reunioes.findIndex((r) => r.id === Number(id));
  if (i < 0) return { erro: 'Essa reuniao nao existe mais.' };
  const r = reunioes[i];
  if (r.criadaPorUid !== autor.uid && !autor.isAdmin) {
    return { erro: 'So quem marcou (ou a diretoria) desmarca.' };
  }
  reunioes.splice(i, 1);
  salvar();
  return { reuniao: r };
}

carregar();

module.exports = {
  listar,
  obter,
  criar,
  remover,
  novoLink,
  porLink,
  estadoDoLink,
  salasDisponiveis,
  LINK_ABRE_ANTES_MS,
  LINK_FECHA_DEPOIS_MS,
  // pros testes
  _limpar: () => { reunioes = []; proximoId = 1; },
  _ARQUIVO: ARQUIVO,
};
