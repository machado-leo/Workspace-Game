// Servidores ICE da chamada: STUN sempre, TURN da Cloudflare quando configurado.
// Ver docs/deploy.md, secao 4.
//
// POR QUE TURN
// So com STUN a chamada fecha na maioria das redes de casa, mas NAO em NAT
// simetrico - rede da faculdade, de empresa, parte do 4G. Ali os dois se veem no
// mapa e o video nunca conecta. O TURN retransmite o audio/video quando a
// conexao direta falha.
//
// A CHAVE FICA NO SERVIDOR
// CLOUDFLARE_TURN_TOKEN gera credencial pra conta inteira da Cloudflare, entao
// ele nunca vai pro navegador. O que vai e uma credencial TEMPORARIA (usuario e
// senha que vencem sozinhos), gerada aqui e entregue so pra quem esta logado.
//
// UMA CREDENCIAL PRA SEDE, NAO UMA POR PESSOA
// Gerar por pessoa a cada pagina aberta seria uma chamada a Cloudflare por F5, e
// o risco e o mesmo: quem esta logado consegue ler a credencial que recebeu. Uma
// so, renovada antes de vencer, e menos rede e menos coisa pra dar errado.
//
// NUNCA QUEBRA A CHAMADA
// Sem as variaveis, ou com a Cloudflare fora do ar, devolve so o STUN - que e
// exatamente o que a sede usava antes. Pior caso e o comportamento de antes.
const KEY_ID = String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim();
const TOKEN = String(process.env.CLOUDFLARE_TURN_TOKEN || '').trim();

const VALIDADE_S = 24 * 60 * 60;       // a credencial vale um dia...
const RENOVAR_ANTES_MS = 12 * 60 * 60 * 1000; // ...e e trocada quando falta metade
const TIMEOUT_MS = 5000;

const SO_STUN = [{ urls: ['stun:stun.l.google.com:19302'] }];

let cache = null;          // { iceServers, venceEm }
let buscando = null;       // promessa em andamento: dez pessoas entrando juntas geram UMA credencial

function configurado() {
  return Boolean(KEY_ID && TOKEN && /^[A-Za-z0-9_-]+$/.test(KEY_ID));
}

// A Cloudflare lista URLs na porta 53 em algumas contas; navegador bloqueia
// essa porta e a tentativa so atrasa a conexao ate dar timeout. Fora com ela.
function limpar(servidores) {
  return (Array.isArray(servidores) ? servidores : [])
    .map((s) => {
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls])
        .filter((u) => typeof u === 'string' && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
      if (!urls.length) return null;
      const limpo = { urls };
      if (s.username) limpo.username = String(s.username);
      if (s.credential) limpo.credential = String(s.credential);
      return limpo;
    })
    .filter(Boolean);
}

async function gerar() {
  const corta = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const resp = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: VALIDADE_S }),
      signal: corta,
    }
  );
  // nunca repassa o corpo: resposta de erro de API as vezes ecoa o que recebeu
  if (!resp.ok) throw new Error('Cloudflare respondeu ' + resp.status);
  const dados = await resp.json();
  const iceServers = limpar(dados.iceServers);
  if (!iceServers.some((s) => s.urls.some((u) => /^turns?:/.test(u)))) {
    throw new Error('Cloudflare nao devolveu servidor TURN');
  }
  return { iceServers, venceEm: Date.now() + VALIDADE_S * 1000 };
}

// Devolve { iceServers, turn } - `turn` diz se o relay esta de fato na lista.
async function obter() {
  if (!configurado()) return { iceServers: SO_STUN, turn: false };
  if (cache && cache.venceEm - Date.now() > RENOVAR_ANTES_MS) {
    return { iceServers: cache.iceServers, turn: true };
  }
  if (!buscando) {
    buscando = gerar()
      .then((novo) => { cache = novo; })
      .catch((e) => { console.error('[turn] ' + e.message); })
      .finally(() => { buscando = null; });
  }
  await buscando;
  // Falhou a renovacao mas a credencial velha ainda vale? Usa ela.
  if (cache && cache.venceEm > Date.now()) return { iceServers: cache.iceServers, turn: true };
  return { iceServers: SO_STUN, turn: false };
}

module.exports = {
  configurado,
  obter,
  // expostos pro testes/turn.js
  _limpar: limpar,
  _zerar: () => { cache = null; buscando = null; },
};
