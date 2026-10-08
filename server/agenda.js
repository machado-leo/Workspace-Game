// Agenda do time: junta os eventos de quem conectou o Google na sede.
// Ver docs/plano-calendario.md.
const google = require('./google');
const usuarios = require('./usuarios');

// Sem cache, cada pessoa abrindo o painel viraria uma chamada ao Google por
// pessoa conectada. Com 60s, o pico vira uma rodada so.
const CACHE_MS = 60 * 1000;
const JANELA_MS = 14 * 24 * 60 * 60 * 1000;

let cache = null;
let cacheEm = 0;
let buscando = null;

async function montar() {
  const agora = Date.now();
  const inicioISO = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
  const fimISO = new Date(agora + JANELA_MS).toISOString();

  const conectados = usuarios.todos().filter((u) => google.conectado(u.id));
  const eventos = [];
  const erros = [];

  // em paralelo: sao poucas pessoas e cada uma e uma chamada independente
  const resultados = await Promise.all(
    conectados.map(async (u) => ({ u, r: await google.listarEventos(u.id, inicioISO, fimISO) }))
  );

  resultados.forEach(({ u, r }) => {
    if (r.erro) {
      erros.push(u.nome + ': ' + r.erro);
      return;
    }
    r.eventos.forEach((ev) => {
      eventos.push({
        titulo: ev.titulo,
        inicio: ev.inicio,
        fim: ev.fim,
        diaInteiro: ev.diaInteiro,
        pessoaNome: u.nome,
        uid: u.id,
      });
    });
  });

  eventos.sort((a, b) => a.inicio - b.inicio);
  return { eventos, erros, conectados: conectados.length };
}

// Nunca lanca: se o Google falhar, o painel avisa e a sede segue funcionando.
async function obter() {
  if (!google.configurado()) {
    return {
      eventos: [],
      indisponivel: 'Agenda nao configurada (falta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).',
    };
  }

  if (cache && Date.now() - cacheEm < CACHE_MS) return cache;

  if (!buscando) {
    buscando = montar()
      .then((dados) => {
        cache = dados;
        cacheEm = Date.now();
        return cache;
      })
      .catch((e) => {
        console.error('Agenda indisponivel:', e.message);
        return cache
          ? Object.assign({}, cache, { indisponivel: 'Mostrando a ultima agenda que deu certo.' })
          : { eventos: [], indisponivel: 'Nao consegui falar com o Google agora.' };
      })
      .finally(() => { buscando = null; });
  }

  return buscando;
}

// Chamado quando alguem conecta ou desconecta: a proxima leitura ja reflete.
function invalidarCache() {
  cache = null;
  cacheEm = 0;
}

module.exports = { obter, invalidarCache };
