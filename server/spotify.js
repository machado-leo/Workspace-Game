// Titulo e capa de um link do Spotify, pro mini-player da sede (public/js/spotify.js).
//
// O player incorporado mostra a musica, mas a lista de "suas playlists" do mini-player
// precisa do NOME de cada uma - "Playlist 1, Playlist 2" nao diz nada. O Spotify
// entrega nome e capa de qualquer link publico pelo oEmbed, sem chave nem conta:
// https://open.spotify.com/oembed?url=...
//
// Quem pede e o SERVIDOR (a CSP da pagina nao deixa o navegador falar com o Spotify),
// so pra quem esta logado, com o link montado AQUI a partir de tipo e id conferidos -
// nunca um endereco que veio do navegador. A capa so passa se for do servidor de
// imagens do Spotify (i.scdn.co), que e o unico liberado no img-src da CSP.
const TIPOS = new Set(['playlist', 'album', 'track', 'episode', 'show', 'artist']);
const ID = /^[A-Za-z0-9]{22}$/;
const CAPA = /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/;
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;
const TEMPO_MAXIMO_MS = 5000;

const cache = new Map();   // "tipo/id" -> { valor, em }

function valido(tipo, id) {
  return TIPOS.has(tipo) && ID.test(String(id || ''));
}

async function buscarNoSpotify(tipo, id) {
  const alvo = 'https://open.spotify.com/' + tipo + '/' + id;
  const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(alvo), {
    redirect: 'manual',
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  });
  if (!r.ok) return null;
  return r.json();
}

// -> { titulo, capa } | null. Nunca lanca: sem nome, o mini-player so mostra o tipo.
// `buscar` so existe pro teste trocar o Spotify por um falso.
async function obter(tipo, id, { buscar = buscarNoSpotify, agora = Date.now() } = {}) {
  if (!valido(tipo, id)) return null;
  const chave = tipo + '/' + id;
  const guardado = cache.get(chave);
  if (guardado && agora - guardado.em < VALIDADE_MS) return guardado.valor;

  let corpo = null;
  try { corpo = await buscar(tipo, id); } catch (e) { corpo = null; }
  if (!corpo || typeof corpo.title !== 'string' || !corpo.title.trim()) return null;
  const valor = {
    titulo: corpo.title.replace(/[\r\n<>]/g, ' ').trim().slice(0, 120),
    capa: typeof corpo.thumbnail_url === 'string' && CAPA.test(corpo.thumbnail_url) ? corpo.thumbnail_url : null,
  };
  cache.delete(chave);
  cache.set(chave, { valor, em: agora });
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return valor;
}

module.exports = { obter, valido, _zerar: () => cache.clear() };
