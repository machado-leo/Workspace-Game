// Quadros do Trello da sede, UM POR SETOR (diretoria). Ver docs/plano-trello.md.
//
// SO NO SERVIDOR. Quem tem o TRELLO_TOKEN acessa a conta inteira do Trello,
// entao ele nunca vai pro navegador: o cliente recebe o quadro ja montado,
// nunca a credencial. Mesma regra do crm-adm/src/lib/trello.ts.
//
// POR SETOR, E NAO UM QUADRO SO
// Comecou com um `TRELLO_BOARD_ID` unico - o quadro "Marketing - Gente - Gestao",
// o mesmo que o CRM lia. Mas cada diretoria tem o SEU quadro, com as suas listas
// (o Comercial trabalha em objetivo e resultado-chave; a Direx, em "a fazer /
// validacao / concluido"), e a aba mostrava um so, "como se fosse um". Alem disso o
// quadro unico ficou parado: a ultima atividade foi em 04/08/2026, quando o CRM
// ganhou o Kanban proprio.
//
// Agora `TRELLO_QUADROS` lista os setores, um por quadro:
//
//   TRELLO_QUADROS="Comercial=AbCdEfGh; Marketing=IjKlMnOp|etiqueta=Marketing; Direx=QrStUvWx|diretoria"
//
//   Nome=quadro         o nome do SETOR (o que aparece na aba) e o quadro: o codigo
//                       curto da URL (trello.com/b/AbCdEfGh/...), o id de 24
//                       caracteres, ou o proprio link
//   |etiqueta=A,B       mostra so os cartoes com alguma dessas etiquetas: e como
//                       dois setores dividem UM quadro (o Marketing e o Gente e
//                       Gestao dividem o mesmo, separados por etiqueta)
//   |diretoria          so a diretoria (conta admin) ve esse quadro
//
// Sem `TRELLO_QUADROS`, vale o `TRELLO_BOARD_ID` de antes: um quadro, de todos.
// O TOKEN e um so (o da conta que criou a chave), entao esse dono precisa ser
// membro de cada quadro: quadro que a conta nao enxerga aparece na aba com o aviso
// certo, e nao derruba os outros.
const BASE_PADRAO = 'https://api.trello.com/1';

// O quadro muda devagar (e coisa de pessoa arrastando cartao), entao um cache
// mais folgado que o da agenda ja evita bater na API a cada abertura.
const CACHE_MS = 2 * 60 * 1000;
// "Atualizar" passa por cima do cache - mas nao mais de uma vez a cada 10 s por
// quadro: a API do Trello limita a 100 pedidos por 10 s por token, e cada quadro
// custa 3.
const ATUALIZAR_A_CADA_MS = 10 * 1000;
// O motivo de uma falha (token ruim x quadro sem acesso) e conferido uma vez e
// lembrado por um minuto: nao vale um pedido a mais a cada clique.
const MOTIVO_MS = 60 * 1000;

// Lidas a CADA uso, e nao uma vez no carregamento: o teste troca as variaveis
// entre um caso e outro, e a sede nao perde nada com isso (e so um process.env).
function ambiente() {
  return {
    base: String(process.env.TRELLO_API_URL || BASE_PADRAO).replace(/\/+$/, ''),
    chave: String(process.env.TRELLO_API_KEY || '').trim(),
    token: String(process.env.TRELLO_TOKEN || '').trim(),
    quadros: String(process.env.TRELLO_QUADROS || ''),
    quadroUnico: String(process.env.TRELLO_BOARD_ID || ''),
    timeoutMs: Number(process.env.TRELLO_TIMEOUT_MS) || 8000,
  };
}

// ------------------------------------------------------------ configuracao

// O codigo do quadro, venha como vier: o link, o codigo curto (8) ou o id (24).
// So letras, numeros, "_" e "-": ele entra no caminho da URL da API, entao nada de
// "/" nem "?" (o `TRELLO_BOARD_ID` de antes aceitava qualquer texto, e continua
// aceitando tudo o que um quadro de verdade tem).
function codigoDoQuadro(texto) {
  const t = String(texto || '').trim();
  const link = /^(?:https?:[/][/])?(?:www[.])?trello[.]com[/]b[/]([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(t);
  if (link) return link[1];
  if (/^[A-Za-z0-9_-]{6,64}$/.test(t)) return t;
  return null;
}

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function chaveDoNome(nome, usadas) {
  const base = semAcento(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'setor';
  let chave = base;
  for (let n = 2; usadas.has(chave); n++) chave = base + '-' + n;
  usadas.add(chave);
  return chave;
}

// Le o texto do TRELLO_QUADROS. Nunca lanca: entrada que nao da pra entender vira
// um aviso em `problemas` (que o arranque mostra) e o resto segue valendo.
function interpretar(texto) {
  const setores = [];
  const problemas = [];
  const usadas = new Set();

  String(texto || '').split(/[;\n]+/).map((s) => s.trim()).filter(Boolean).forEach((entrada) => {
    const partes = entrada.split('|').map((s) => s.trim());
    const principal = partes.shift();
    const igual = principal.indexOf('=');
    if (igual < 1) {
      problemas.push('"' + entrada.slice(0, 30) + '": falta o formato Nome=quadro');
      return;
    }
    const nome = principal.slice(0, igual).trim().slice(0, 40);
    const quadro = codigoDoQuadro(principal.slice(igual + 1));
    if (!quadro) {
      problemas.push('"' + nome + '": nao entendi o quadro (use o codigo curto da URL, o id ou o link do Trello)');
      return;
    }
    const setor = { chave: chaveDoNome(nome, usadas), nome, quadro, etiquetas: [], diretoria: false };
    partes.forEach((opcao) => {
      const i = opcao.indexOf('=');
      const nomeDaOpcao = semAcento(i < 0 ? opcao : opcao.slice(0, i));
      const valor = i < 0 ? '' : opcao.slice(i + 1).trim();
      if (nomeDaOpcao === 'diretoria') setor.diretoria = true;
      else if (nomeDaOpcao === 'etiqueta' || nomeDaOpcao === 'etiquetas') {
        setor.etiquetas = valor.split(',').map((e) => e.trim()).filter(Boolean);
      } else if (nomeDaOpcao) problemas.push('"' + nome + '": opcao "' + nomeDaOpcao + '" desconhecida');
    });
    setores.push(setor);
  });
  return { setores, problemas };
}

// Os setores em vigor: TRELLO_QUADROS, ou o quadro unico de antes. `legado: false`
// desliga o quadro unico de antes: com o Kanban do CRM ligado (server/quadros.js) o
// TRELLO_BOARD_ID - o quadro antigo, parado - nao pode aparecer ao lado dos quadros
// de verdade. Quem quiser um quadro do Trello ali lista ele no TRELLO_QUADROS.
function setoresEmVigor(env, legado = true) {
  const lidos = interpretar(env.quadros);
  if (lidos.setores.length || env.quadros.trim() || !legado) return lidos;
  const unico = codigoDoQuadro(env.quadroUnico);
  if (unico) {
    // sem nome: o nome vem do proprio Trello, na primeira leitura
    return { setores: [{ chave: 'quadro', nome: null, quadro: unico, etiquetas: [], diretoria: false }], problemas: [] };
  }
  const problemas = env.quadroUnico.trim() ? ['TRELLO_BOARD_ID: nao entendi o quadro'] : [];
  return { setores: [], problemas };
}

function configurado({ legado = true } = {}) {
  const env = ambiente();
  return Boolean(env.chave && env.token && setoresEmVigor(env, legado).setores.length);
}

// Uma linha pro log do arranque (server/index.js).
function resumo({ legado = true } = {}) {
  const env = ambiente();
  const { setores, problemas } = setoresEmVigor(env, legado);
  const avisos = problemas.length ? ' (atencao: ' + problemas.join('; ') + ')' : '';
  if (!env.chave || !env.token || !setores.length) {
    return 'Trello: desligado (defina TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_QUADROS - ver docs/plano-trello.md)' + avisos;
  }
  const nomes = setores.map((s) => (s.nome || 'quadro') + (s.diretoria ? ' (so diretoria)' : ''));
  return 'Trello: ' + setores.length + (setores.length === 1 ? ' quadro' : ' quadros') + ' - ' + nomes.join(', ') + avisos;
}

// ------------------------------------------------------------------- a API

class ErroDoTrello extends Error {
  constructor(mensagem, { status, rede } = {}) {
    super(mensagem);
    this.status = status || null;
    this.rede = !!rede;
  }
}

async function pedir(env, caminho, params) {
  const p = new URLSearchParams(Object.assign({ key: env.chave, token: env.token }, params));
  const url = env.base + caminho + '?' + p.toString();
  let resp;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(env.timeoutMs) });
  } catch (e) {
    // Nunca repassa a mensagem crua: ela pode ecoar a URL, e a URL leva key e token.
    const demorou = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new ErroDoTrello(demorou ? 'timeout' : 'rede', { rede: true });
  }
  if (!resp.ok) {
    // nunca repassa o corpo cru: pode conter eco da credencial
    throw new ErroDoTrello('Trello respondeu ' + resp.status, { status: resp.status });
  }
  return resp.json();
}

// Cartao do jeito que o cliente usa. `pos` ordena dentro da lista, como no Trello.
function cartaoDaApi(c) {
  return {
    id: c.id,
    nome: c.name,
    url: c.url,
    etiquetas: (c.labels || []).filter((l) => l.name).map((l) => ({ nome: l.name, cor: l.color })),
    membros: (c.members || []).map((m) => m.fullName),
    prazo: c.due || null,
    prazoConcluido: Boolean(c.dueComplete),
    pos: Number(c.pos) || 0,
  };
}

async function montar(env, setor) {
  const [quadro, listas, cartoes] = await Promise.all([
    pedir(env, '/boards/' + setor.quadro, { fields: 'name,url' }),
    pedir(env, '/boards/' + setor.quadro + '/lists', { fields: 'id,name', filter: 'open' }),
    // `labels` TEM que estar no `fields`: a API so devolve o que se pede. Sem ele
    // as etiquetas nunca chegavam (o stub do primeiro teste devolvia tudo, entao
    // isso so apareceu com o Trello de verdade). `desc` saiu: a tela nao usa, e a
    // descricao de cartao e texto a mais pra mandar a todo mundo.
    pedir(env, '/boards/' + setor.quadro + '/cards', {
      fields: 'id,name,url,idList,due,dueComplete,pos,labels',
      members: 'true',
      member_fields: 'fullName',
    }),
  ]);

  const filtro = setor.etiquetas.map(semAcento);
  const porLista = new Map();
  cartoes.forEach((c) => {
    const cartao = cartaoDaApi(c);
    // Setor que divide o quadro com outro: so os cartoes das etiquetas dele
    if (filtro.length && !cartao.etiquetas.some((e) => filtro.includes(semAcento(e.nome)))) return;
    if (!porLista.has(c.idList)) porLista.set(c.idList, []);
    porLista.get(c.idList).push(cartao);
  });

  return {
    nomeNoTrello: quadro.name,
    url: quadro.url,
    filtro: setor.etiquetas.slice(),
    listas: listas.map((l) => ({
      id: l.id,
      nome: l.name,
      cartoes: (porLista.get(l.id) || []).sort((a, b) => a.pos - b.pos).map(({ pos, ...resto }) => resto),
    })),
  };
}

// ------------------------------------------------------ cache e diagnostico

const cache = new Map();       // chave do setor -> { dados, em }
const buscando = new Map();    // chave do setor -> promessa em andamento
let motivo = null;             // { veredito, em }
let relogio = () => Date.now();

// Por que uma leitura deu 401 ou 404: o token e ruim (vale pra sede inteira) ou so
// aquele quadro nao esta ao alcance da conta? Um pedido a mais, e so na falha.
async function veredito(env) {
  if (motivo && relogio() - motivo.em < MOTIVO_MS) return motivo.veredito;
  let v;
  try {
    await pedir(env, '/members/me', { fields: 'id' });
    v = 'token-bom';
  } catch (e) {
    v = e.rede ? 'sem-rede' : 'token-ruim';
  }
  motivo = { veredito: v, em: relogio() };
  return v;
}

// A frase que a aba mostra. Diz o que fazer, e nunca carrega credencial.
async function explicar(env, erro, setor) {
  if (erro.rede) {
    return erro.message === 'timeout'
      ? 'O Trello demorou demais pra responder. Tente atualizar em instantes.'
      : 'A sede nao conseguiu falar com o Trello agora (rede do servidor).';
  }
  if (erro.status === 429) return 'O Trello pediu pra esperar (muitas consultas seguidas). Atualize daqui a pouco.';
  if (erro.status === 401 || erro.status === 403 || erro.status === 404) {
    const v = await veredito(env);
    if (v === 'token-ruim') {
      return 'O Trello recusou a chave ou o token (venceu ou foi revogado). Gere outro e atualize TRELLO_API_KEY e TRELLO_TOKEN.';
    }
    if (v === 'sem-rede') return 'A sede nao conseguiu falar com o Trello agora (rede do servidor).';
    return 'A conta dona do token nao enxerga o quadro "' + (setor.nome || 'do setor')
      + '": ou o codigo esta errado, ou falta convidar essa conta pra ele no Trello.';
  }
  return 'O Trello respondeu com erro (' + (erro.status || '?') + '). Tente de novo em instantes.';
}

// Le UM quadro (com cache, e sem nunca lancar): devolve { dados, indisponivel }.
async function ler(env, setor, forcar) {
  const agora = relogio();
  const guardado = cache.get(setor.chave);
  if (guardado) {
    const idade = agora - guardado.em;
    if (idade < CACHE_MS && !forcar) return { dados: guardado.dados };
    if (forcar && idade < ATUALIZAR_A_CADA_MS) return { dados: guardado.dados };
  }

  if (!buscando.has(setor.chave)) {
    buscando.set(setor.chave, montar(env, setor)
      .then((dados) => {
        const novo = Object.assign({}, dados, { atualizadoEm: relogio() });
        cache.set(setor.chave, { dados: novo, em: relogio() });
        return { dados: novo };
      })
      .catch(async (e) => {
        const frase = await explicar(env, e, setor);
        console.error('[trello] ' + (setor.nome || setor.quadro) + ': '
          + (e.status ? 'HTTP ' + e.status : e.message));
        // Falhou mas ja deu certo antes: mostra o ultimo quadro bom, dizendo que e velho
        if (guardado) return { dados: guardado.dados, indisponivel: 'Mostrando o ultimo quadro que deu certo. ' + frase };
        return { dados: null, indisponivel: frase };
      })
      .finally(() => { buscando.delete(setor.chave); }));
  }
  return buscando.get(setor.chave);
}

// ---------------------------------------------------------------- o pedido

// O nome que a aba mostra: o do setor, ou (quadro unico de antes, sem nome) o que o
// proprio Trello deu na primeira leitura.
function nomeDoSetor(s) {
  return s.nome || (cache.get(s.chave) && cache.get(s.chave).dados.nomeNoTrello) || 'Quadro';
}

function descricaoDoSetor(s) {
  return { chave: s.chave, nome: nomeDoSetor(s), restrito: s.diretoria };
}

// Os setores que ESTA pessoa pode ver (sem ler nenhum quadro): quadro marcado como
// "so diretoria" nem aparece pra quem nao e. Vazio se o Trello nao esta ligado.
function listar({ diretoria, legado = true } = {}) {
  const env = ambiente();
  if (!env.chave || !env.token) return [];
  return setoresEmVigor(env, legado).setores
    .filter((s) => !s.diretoria || diretoria)
    .map((s) => descricaoDoSetor(s));
}

// { quadro, forcar, diretoria }: `quadro` e a chave do setor (a da lista que a
// propria aba recebeu), `diretoria` diz se quem pede e da diretoria. Nunca lanca:
// se o Trello cair, o painel avisa e a sede segue funcionando.
async function obter({ quadro, forcar, diretoria, legado = true } = {}) {
  const env = ambiente();
  const { setores } = setoresEmVigor(env, legado);

  if (!env.chave || !env.token || !setores.length) {
    return {
      setores: [],
      listas: [],
      indisponivel: 'Trello nao configurado (falta TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_QUADROS).',
    };
  }

  // Quadro marcado como "so diretoria" nem aparece pra quem nao e
  const visiveis = setores.filter((s) => !s.diretoria || diretoria);
  if (!visiveis.length) {
    return { setores: [], listas: [], indisponivel: 'Nenhum quadro do Trello foi liberado pra voce.' };
  }

  // Uma chave que nao existe (ou de um quadro restrito) cai no primeiro: nunca
  // vira erro, e nunca deixa alguem ler o que nao devia.
  const setor = visiveis.find((s) => s.chave === quadro) || visiveis[0];
  const { dados, indisponivel } = await ler(env, setor, forcar === true);

  const resposta = {
    setores: visiveis.map((s) => descricaoDoSetor(s)),
    atual: setor.chave,
    nome: nomeDoSetor(setor),
    listas: [],
  };
  if (dados) {
    resposta.url = dados.url;
    resposta.filtro = dados.filtro;
    resposta.listas = dados.listas;
    resposta.atualizadoEm = dados.atualizadoEm;
  }
  if (indisponivel) resposta.indisponivel = indisponivel;
  return resposta;
}

module.exports = {
  obter,
  listar,
  configurado,
  resumo,
  // pros testes
  _interpretar: interpretar,
  _codigoDoQuadro: codigoDoQuadro,
  _zerar: () => { cache.clear(); buscando.clear(); motivo = null; relogio = () => Date.now(); },
  _definirRelogio: (fn) => { relogio = fn; },
  CACHE_MS,
  ATUALIZAR_A_CADA_MS,
};
