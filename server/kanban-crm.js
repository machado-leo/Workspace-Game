// O Kanban do CRM, dentro da sede. Ver docs/plano-kanban-crm.md.
//
// O Kanban e do CRM (crm-adm/src/app/kanban): um quadro por diretoria, cada um com a
// sua regra de quem ve. E la que o time trabalha hoje - o Trello ficou pra tras (o CRM
// ganhou o Kanban proprio em agosto). Esta ponte traz os quadros pra aba da sede.
//
// A sede NAO le o banco do CRM, e nao recebe a chave de servico do Supabase (que abre o
// banco inteiro): mesma linha do discador.js e do google.js. Ela bate na PORTA que o CRM
// abriu so pra isso (crm-adm/src/app/api/kanban/externo/quadros), com uma chave que so
// abre essa leitura, e diz em nome de QUEM.
//
// A REGRA DURA e a do discador.js: o "em nome de quem" e sempre o e-mail da CONTA
// LOGADA, e so de e-mail PROVADO (entrou com o Google, ou confirmou pelo link). Quem
// chama (server/quadros.js) so passa o e-mail se a conta provou; ele nunca vem de dentro
// de um pedido do navegador. Quem decide o que cada pessoa ve e o CRM, pelo cargo dela.
//
// O que chega do CRM e conferido campo a campo antes de ir pra tela, e os enderecos dos
// cartoes sao montados AQUI a partir do CRM_URL - nunca um endereco que veio na resposta.
const CACHE_MS = 60 * 1000;
// "Atualizar" passa por cima do cache, mas nao mais de uma vez a cada 10 s por pessoa: a
// sede inteira chega no CRM pelo mesmo IP, e o CRM limita o que passa por ele.
const ATUALIZAR_A_CADA_MS = 10 * 1000;
// Com o CRM fora do ar, o ultimo quadro que deu certo serve - mas por quanto tempo? Alguem
// pode ter perdido o acesso enquanto isso, entao o "velho" tem prazo de validade.
const VELHO_VALE_MS = 6 * 60 * 60 * 1000;
const TEMPO_MAXIMO_MS = 15000;
// A tela nao precisa de mais que isto por coluna (a "Concluido" so cresce), e cada cartao
// vai por socket pra quem abrir a aba. O total continua aparecendo no topo da coluna.
const MAX_CARTOES_POR_LISTA = 100;
const MAX_QUADROS = 50;
const MAX_LISTAS_POR_QUADRO = 40;
const MAX_PESSOAS_NO_CACHE = 300;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

// Lidas a CADA uso: o teste troca as variaveis entre um caso e outro.
function ambiente() {
  return {
    url: String(process.env.CRM_URL || '').trim().replace(/\/+$/, ''),
    // O nome daqui e CRM_CHAVE_KANBAN; o CRM guarda a MESMA chave como KANBAN_CHAVE_ESCRITORIO, e e
    // facil copiar o nome de la pro painel da hospedagem. Os dois ligam o Kanban; se os dois
    // estiverem definidos, vale o daqui.
    chave: String(process.env.CRM_CHAVE_KANBAN || process.env.KANBAN_CHAVE_ESCRITORIO || '').trim(),
    timeoutMs: Number(process.env.KANBAN_TIMEOUT_MS) || TEMPO_MAXIMO_MS,
  };
}

function configurado() {
  const env = ambiente();
  return /^https?:\/\//.test(env.url) && env.chave.length >= 32;
}

// ------------------------------------------------------------ a resposta

function texto(valor, max) {
  return typeof valor === 'string' ? valor.slice(0, max) : '';
}

// O prazo e um DIA: AAAA-MM-DD, e que exista no calendario ("2026-13-45" tem a forma, mas
// nao e dia - a tela ia rolar pro ano seguinte sem avisar).
function diaValido(valor) {
  if (typeof valor !== 'string' || !DIA.test(valor)) return null;
  const d = new Date(valor + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === valor ? valor : null;
}

function contador(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 9999) : 0;
}

function cartaoDaPorta(c, quadroId, base) {
  if (!c || typeof c !== 'object' || !ID.test(String(c.id))) return null;
  const checklist = c.checklist && typeof c.checklist === 'object' && contador(c.checklist.total) > 0
    ? { feitos: Math.min(contador(c.checklist.feitos), contador(c.checklist.total)), total: contador(c.checklist.total) }
    : null;
  return {
    id: c.id,
    nome: texto(c.titulo, 300),
    url: base + '/kanban?quadro=' + quadroId + '&cartao=' + c.id,
    etiquetas: (Array.isArray(c.etiquetas) ? c.etiquetas : []).slice(0, 12)
      .filter((e) => e && typeof e === 'object' && texto(e.nome, 40))
      .map((e) => ({ nome: texto(e.nome, 40), cor: texto(e.cor, 20) })),
    membros: (Array.isArray(c.membros) ? c.membros : []).slice(0, 20).map((m) => texto(m, 60)).filter(Boolean),
    prazo: diaValido(c.prazo),
    prazoConcluido: c.prazoConcluido === true,
    temDescricao: c.temDescricao === true,
    checklist,
    comentarios: contador(c.comentarios),
    anexos: contador(c.anexos),
  };
}

// Confere o que a porta devolveu. Devolve null se nao e a resposta da porta.
function normalizar(corpo, base) {
  if (!corpo || typeof corpo !== 'object' || !Array.isArray(corpo.quadros)) return null;
  return corpo.quadros.slice(0, MAX_QUADROS)
    .filter((q) => q && typeof q === 'object' && ID.test(String(q.id)) && texto(q.nome, 60))
    .map((q) => ({
      id: q.id,
      nome: texto(q.nome, 60),
      url: base + '/kanban?quadro=' + q.id,
      listas: (Array.isArray(q.listas) ? q.listas : []).slice(0, MAX_LISTAS_POR_QUADRO)
        .filter((l) => l && typeof l === 'object' && ID.test(String(l.id)))
        .map((l) => {
          const todos = (Array.isArray(l.cartoes) ? l.cartoes : []).map((c) => cartaoDaPorta(c, q.id, base)).filter(Boolean);
          return {
            id: l.id,
            nome: texto(l.nome, 60),
            total: todos.length,
            cartoes: todos.slice(0, MAX_CARTOES_POR_LISTA),
          };
        }),
    }));
}

// ------------------------------------------------------------ a porta do CRM

class ErroDoCrm extends Error {
  constructor(mensagem, { status, rede, mensagemDoCrm } = {}) {
    super(mensagem);
    this.status = status || null;
    this.rede = !!rede;
    this.mensagemDoCrm = mensagemDoCrm || null;
  }
}

async function pedirAoCrm(env, email) {
  let resposta;
  try {
    resposta = await fetch(env.url + '/api/kanban/externo/quadros', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.chave },
      body: JSON.stringify({ email }),
      // A porta nao redireciona. Se redirecionar, o CRM_URL esta errado (http no lugar de
      // https, ou um "www" no meio) - e a chave nao pode sair seguindo o redirecionamento.
      redirect: 'manual',
      signal: AbortSignal.timeout(env.timeoutMs),
    });
  } catch (e) {
    // Nunca repassa a mensagem crua: ela pode ecoar o endereco.
    const demorou = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new ErroDoCrm(demorou ? 'timeout' : 'rede', { rede: true });
  }
  let corpo = null;
  try { corpo = await resposta.json(); } catch (e) { corpo = null; }
  if (resposta.status >= 300) {
    // O CRM responde `error`, e a mensagem dele e pra gente (ex.: "Seu e-mail nao tem
    // acesso ao CRM") - mas so texto, e curto.
    const mensagemDoCrm = corpo && typeof corpo.error === 'string' ? corpo.error.slice(0, 240) : null;
    throw new ErroDoCrm('HTTP ' + resposta.status, { status: resposta.status, mensagemDoCrm });
  }
  return corpo;
}

// A frase que a aba mostra. Diz o que fazer, e nunca carrega a chave.
function explicar(erro) {
  if (erro.rede) {
    return erro.message === 'timeout'
      ? 'O CRM demorou demais pra responder. Tente atualizar em instantes.'
      : 'A sede nao conseguiu falar com o CRM agora.';
  }
  if (erro.message === 'resposta') {
    return 'A resposta do CRM veio num formato que a sede nao entende. Avise a diretoria.';
  }
  if (erro.status >= 300 && erro.status < 400) {
    return 'O endereco do CRM (CRM_URL) redireciona pra outro lugar: confira se e o endereco final do CRM.';
  }
  if (erro.status === 401) return 'A sede e o CRM nao estao com a mesma chave do Kanban. Avise a diretoria.';
  if (erro.status === 403) return erro.mensagemDoCrm || 'O CRM nao liberou o Kanban pra voce.';
  if (erro.status === 404) return 'O CRM ainda nao tem a porta do Kanban: falta publicar a versao nova do CRM.';
  if (erro.status === 429) return 'O CRM pediu pra esperar (muitas consultas seguidas). Atualize daqui a pouco.';
  if (erro.status === 503) return erro.mensagemDoCrm || 'O Kanban do escritorio nao esta ligado no CRM.';
  return 'O CRM respondeu com erro (' + (erro.status || '?') + '). Tente de novo em instantes.';
}

// ------------------------------------------------------------ cache

const cache = new Map();       // e-mail -> { quadros, em }
const buscando = new Map();    // e-mail -> promessa em andamento
let relogio = () => Date.now();

function guardar(chave, valor) {
  cache.delete(chave);           // volta pro fim da fila: o mais antigo e o primeiro a sair
  cache.set(chave, valor);
  while (cache.size > MAX_PESSOAS_NO_CACHE) cache.delete(cache.keys().next().value);
}

// Os quadros que ESTA pessoa pode ver, com tudo dentro (uma chamada so; trocar de quadro
// na aba nao pede nada de novo). Nunca lanca: devolve { ok: true, quadros, atualizadoEm,
// aviso? } ou { ok: false, erro }.
async function quadrosDe(email, { forcar } = {}) {
  if (!configurado()) return { ok: false, erro: 'O Kanban do CRM nao esta ligado nesta sede.' };
  const chave = String(email || '').trim().toLowerCase();
  if (!chave) return { ok: false, erro: 'Sem o e-mail da conta, a sede nao sabe pedir os quadros ao CRM.' };

  const guardado = cache.get(chave);
  if (guardado) {
    const idade = relogio() - guardado.em;
    if (idade < CACHE_MS && !forcar) return { ok: true, quadros: guardado.quadros, atualizadoEm: guardado.em };
    if (forcar && idade < ATUALIZAR_A_CADA_MS) return { ok: true, quadros: guardado.quadros, atualizadoEm: guardado.em };
  }

  if (!buscando.has(chave)) {
    const env = ambiente();
    buscando.set(chave, (async () => {
      try {
        const quadros = normalizar(await pedirAoCrm(env, String(email).trim()), env.url);
        if (!quadros) throw new ErroDoCrm('resposta');
        const em = relogio();
        guardar(chave, { quadros, em });
        return { ok: true, quadros, atualizadoEm: em };
      } catch (e) {
        const erro = e instanceof ErroDoCrm ? e : new ErroDoCrm('resposta');
        const frase = explicar(erro);
        console.error('[kanban-crm] ' + (erro.status ? 'HTTP ' + erro.status : erro.message));
        // 401 e 403 sao o CRM dizendo "voce nao": o que estava guardado deixa de valer
        // (alguem que perdeu o acesso nao pode continuar vendo o quadro do cache).
        if (erro.status === 401 || erro.status === 403) {
          cache.delete(chave);
          return { ok: false, erro: frase };
        }
        // Qualquer outra falha (rede, CRM caiu, limite): mostra o ultimo quadro que deu
        // certo, dizendo que e velho - se ainda nao passou do prazo.
        const velho = cache.get(chave);
        if (velho && relogio() - velho.em < VELHO_VALE_MS) {
          return {
            ok: true,
            quadros: velho.quadros,
            atualizadoEm: velho.em,
            aviso: 'Mostrando o ultimo quadro que deu certo. ' + frase,
          };
        }
        return { ok: false, erro: frase };
      }
    })().finally(() => { buscando.delete(chave); }));
  }
  return buscando.get(chave);
}

module.exports = {
  quadrosDe,
  configurado,
  // pros testes
  _normalizar: normalizar,
  _zerar: () => { cache.clear(); buscando.clear(); relogio = () => Date.now(); },
  _definirRelogio: (fn) => { relogio = fn; },
  CACHE_MS,
  ATUALIZAR_A_CADA_MS,
  VELHO_VALE_MS,
  MAX_CARTOES_POR_LISTA,
};
