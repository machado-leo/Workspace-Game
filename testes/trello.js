// A aba do Trello, um quadro por setor (server/trello.js). Ver docs/plano-trello.md.
//
// O que este teste guarda de verdade:
//
//   1. AS ETIQUETAS CHEGAM. O servidor pedia os cartoes sem `labels` no `fields`, e a
//      API do Trello so devolve o que se pede: em producao nenhuma etiqueta aparecia.
//      O primeiro teste (06/09) usava um stub que devolvia tudo - entao passava. O
//      stub daqui RESPEITA o `fields`, como a API de verdade.
//   2. CADA SETOR COM O SEU QUADRO, e o quadro "so diretoria" nem sai do servidor
//      pra quem nao e da diretoria (nem os dados, nem o nome).
//   3. QUANDO FALHA, A ABA DIZ O PORQUE - e nunca com a credencial na frase. Token
//      recusado, quadro que a conta nao enxerga, limite de consultas, rede e
//      demora sao cinco problemas diferentes com cinco consertos diferentes.
//   4. "ATUALIZAR" ATUALIZA (passa por cima do cache de 2 minutos, com um freio
//      pra nao estourar o limite da API).
//
// Roda contra um Trello de mentira (um servidor HTTP aqui dentro) - nunca contra o de
// verdade, e nunca com credencial de verdade.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

const CHAVE = 'chave-de-mentira-do-trello';
const TOKEN = 'token-de-mentira-do-trello-bem-longo';

// ------------------------------------------------------------ o Trello de mentira

// Os quadros. `cartoes` tem o formato COMPLETO da API; o servidor abaixo devolve so os
// campos pedidos, como o de verdade.
const QUADROS = {
  comercial01: {
    name: 'Comercial', url: 'https://trello.com/b/comercial01/comercial',
    listas: [{ id: 'L1', name: '1. Objetivo' }, { id: 'L2', name: '2. Resultado Chave' }, { id: 'L3', name: '3. Iniciativas' }],
    cartoes: [
      { id: 'C1', name: 'Fechar 20 contratos', idList: 'L1', pos: 2, labels: [{ name: 'Objetivo', color: 'purple' }] },
      { id: 'C2', name: 'Bater a meta de reunioes', idList: 'L2', pos: 1, due: '2026-10-01T15:00:00.000Z', dueComplete: false, labels: [{ name: 'Importante', color: 'green' }, { name: '', color: 'blue' }], members: [{ fullName: 'Ana Souza' }] },
      { id: 'C3', name: 'Ligar pros leads frios', idList: 'L3', pos: 1, labels: [], members: [{ fullName: 'Bia Lima' }, { fullName: 'Caio Costa' }] },
    ],
  },
  combinado1: {
    name: 'Kanban Marketing Gente Gestao', url: 'https://trello.com/b/combinado1/kanban',
    listas: [{ id: 'M1', name: 'Backlog' }, { id: 'M2', name: 'Fazendo' }],
    cartoes: [
      { id: 'K1', name: 'Post do Instagram', idList: 'M1', pos: 3, labels: [{ name: 'Marketing', color: 'blue' }] },
      { id: 'K2', name: 'Roteiro do video', idList: 'M1', pos: 1, labels: [{ name: 'Marketing', color: 'blue' }, { name: 'Urgente', color: 'red' }] },
      { id: 'K3', name: 'Processo seletivo', idList: 'M1', pos: 2, labels: [{ name: 'Gente', color: 'green' }] },
      { id: 'K4', name: 'Relatorio do trimestre', idList: 'M2', pos: 1, labels: [{ name: 'Gestão', color: 'yellow' }] },
      { id: 'K5', name: 'Sem etiqueta nenhuma', idList: 'M2', pos: 2, labels: [] },
    ],
  },
  direx00001: {
    name: 'Direx', url: 'https://trello.com/b/direx00001/direx',
    listas: [{ id: 'D1', name: 'A fazer' }, { id: 'D2', name: 'Concluido' }],
    cartoes: [{ id: 'X1', name: 'PLANEJAMENTO ESTRATEGICO CONFIDENCIAL', idList: 'D1', pos: 1, labels: [] }],
  },
};

function novoTrello() {
  const registro = { pedidos: [], porCaminho: {} };
  // aliases pra modos de falha (o id do quadro escolhe o comportamento)
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.searchParams;
    registro.pedidos.push({ caminho: url.pathname, fields: p.get('fields'), members: p.get('members'), quadro: (url.pathname.match(/^\/1\/boards\/([^/]+)/) || [])[1] });
    registro.porCaminho[url.pathname] = (registro.porCaminho[url.pathname] || 0) + 1;

    const responder = (status, corpo) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    };
    // credencial: o Trello devolve texto puro e 401
    if (p.get('key') !== CHAVE) return responder(401, 'invalid key');
    if (p.get('token') !== TOKEN || registro.tokenRuim) return responder(401, 'invalid token');

    if (url.pathname === '/1/members/me') return responder(200, { id: 'eu' });

    const m = /^\/1\/boards\/([^/]+)(?:\/(lists|cards))?$/.exec(url.pathname);
    if (!m) return responder(404, 'not found');
    const [, id, recurso] = m;
    if (id === 'travado001') return; // nunca responde: o cliente desiste por tempo
    if (id === 'limitado01') return responder(429, 'API_TOO_MANY_REQUESTS');
    if (id === 'semacesso1') return responder(401, 'unauthorized board access');
    if (id === 'naoexiste1') return responder(404, 'The requested resource was not found.');
    if (registro.quebrar && registro.quebrar.has(id)) return responder(500, 'boom');
    const q = QUADROS[id];
    if (!q) return responder(404, 'The requested resource was not found.');

    const pedidos = new Set(String(p.get('fields') || '').split(',').filter(Boolean));
    const so = (obj, extras) => {
      const saida = { id: obj.id };
      pedidos.forEach((f) => { if (f in obj) saida[f] = obj[f]; });
      Object.assign(saida, extras || {});
      return saida;
    };
    if (!recurso) return responder(200, { id, name: q.name, url: q.url });
    if (recurso === 'lists') return responder(200, q.listas.map((l) => so(l)));
    // cartoes: `labels` so vem se estiver no `fields` (como a API); `members` so com members=true
    return responder(200, q.cartoes.map((c) => so(c, p.get('members') === 'true' ? { members: (c.members || []).map((mm) => ({ id: 'm', fullName: mm.fullName })) } : {})));
  });
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => resolve({ servidor, registro, url: 'http://127.0.0.1:' + servidor.address().port + '/1' }));
  });
}

// ------------------------------------------------------- variaveis do ambiente

function definir(url, quadros, extra) {
  process.env.TRELLO_API_URL = url;
  process.env.TRELLO_API_KEY = CHAVE;
  process.env.TRELLO_TOKEN = TOKEN;
  process.env.TRELLO_TIMEOUT_MS = '600';
  if (quadros === null) delete process.env.TRELLO_QUADROS; else process.env.TRELLO_QUADROS = quadros;
  delete process.env.TRELLO_BOARD_ID;
  Object.keys(extra || {}).forEach((k) => { process.env[k] = extra[k]; });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const nomes = (r) => (r.listas || []).map((l) => l.nome);
const cartoesDe = (r) => (r.listas || []).map((l) => l.cartoes.map((c) => c.nome));
const vazamento = (resposta) => JSON.stringify(resposta).includes(CHAVE) || JSON.stringify(resposta).includes(TOKEN);

// --------------------------------------------------------------- socket "na unha"

function abrirSocket(base, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 6000);
    const s = { eventos, ws, enviar: (ev, dado) => ws.send('42' + JSON.stringify(dado === undefined ? [ev] : [ev, dado])), fechar: () => ws.close() };
    ws.addEventListener('message', (evt) => {
      const m = String(evt.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) ws.send('42' + JSON.stringify(['join', {}]));
      else if (m.startsWith('42')) {
        try {
          const e = JSON.parse(m.slice(2));
          eventos.push(e);
          if (e[0] === 'init') { clearTimeout(prazo); resolve(s); }
        } catch (x) { /* ignora */ }
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

async function pedirAoServidor(socket, dado) {
  const antes = socket.eventos.filter((e) => e[0] === 'trello').length;
  socket.enviar('trello-pedir', dado);
  const limite = Date.now() + 6000;
  while (Date.now() < limite) {
    const todos = socket.eventos.filter((e) => e[0] === 'trello');
    if (todos.length > antes) return todos[todos.length - 1][1];
    await espera(30);
  }
  return null;
}

(async function () {
  console.log('\nTRELLO: UM QUADRO POR SETOR');
  const trello = await novoTrello();
  let servidorDaSede = null;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-trello-'));

  try {
    // Os modulos leem o ambiente a cada uso: define antes de carregar so pra ficar claro
    definir(trello.url, null);
    const T = require('../server/trello.js');

    // ------------------------------------------------------------ o texto do TRELLO_QUADROS
    console.log('\n  -- o que se escreve no TRELLO_QUADROS');
    const lido = T._interpretar('Comercial=AbCdEfGh; Gente e Gestão=IjKlMnOp|etiqueta=Gente,Gestão; Direx=https://trello.com/b/QrStUvWx/direx|diretoria');
    conferir('tres setores, na ordem em que foram escritos', lido.setores.map((s) => s.nome), ['Comercial', 'Gente e Gestão', 'Direx']);
    conferir('  o codigo do quadro sai de um link tambem', lido.setores.map((s) => s.quadro), ['AbCdEfGh', 'IjKlMnOp', 'QrStUvWx']);
    conferir('  etiquetas e "so diretoria" vem das opcoes', [lido.setores[1].etiquetas, lido.setores[2].diretoria, lido.setores[0].diretoria], [['Gente', 'Gestão'], true, false]);
    conferir('  a chave do setor e o nome sem acento nem espaco', lido.setores.map((s) => s.chave), ['comercial', 'gente-e-gestao', 'direx']);
    conferir('  sem problema nenhum', lido.problemas, []);
    conferir('dois setores com o mesmo nome nao se confundem',
      T._interpretar('Marketing=aaaaaaaa; Marketing=bbbbbbbb').setores.map((s) => s.chave), ['marketing', 'marketing-2']);
    const ruim = T._interpretar('sem-igual; X=lixo; =abcdefgh; Y=abcdefgh|foo; Z=../members/me');
    conferir('o que nao se entende vira aviso (e o resto vale)', [ruim.setores.map((s) => s.nome), ruim.problemas.length], [['Y'], 5]);
    conferir('quadro com "/" ou ".." nunca entra no caminho da API',
      ['../members/me', 'a/b/c/d/e', 'abc', ''].map(T._codigoDoQuadro), [null, null, null, null]);
    conferir('o codigo curto, o id de 24 e o link valem',
      ['AbCdEfGh', '0123456789abcdef01234567', 'trello.com/b/IjKlMnOp/nome-do-quadro'].map(T._codigoDoQuadro), ['AbCdEfGh', '0123456789abcdef01234567', 'IjKlMnOp']);

    // ------------------------------------------------------------------ sem configurar
    console.log('\n  -- configuracao');
    T._zerar();
    definir(trello.url, null);
    conferir('sem nada configurado: avisa, sem quebrar', [T.configurado(), (await T.obter()).indisponivel.startsWith('Trello nao configurado')], [false, true]);
    delete process.env.TRELLO_API_KEY;
    definir(trello.url, 'Comercial=comercial01');
    delete process.env.TRELLO_API_KEY;
    conferir('quadros sem a chave da API: continua desligado', T.configurado(), false);
    T._zerar();

    // ---------------------------------------------------------- o quadro unico de antes
    definir(trello.url, null, { TRELLO_BOARD_ID: 'comercial01' });
    conferir('TRELLO_BOARD_ID sozinho continua valendo (um quadro, de todos)', T.configurado(), true);
    const unico = await T.obter();
    conferir('  o nome vem do proprio Trello', [unico.nome, unico.setores.length, unico.setores[0].restrito], ['Comercial', 1, false]);
    conferir('  e o quadro monta', nomes(unico), ['1. Objetivo', '2. Resultado Chave', '3. Iniciativas']);
    conferir('TRELLO_QUADROS ganha do TRELLO_BOARD_ID', (() => {
      definir(trello.url, 'So=direx00001', { TRELLO_BOARD_ID: 'comercial01' });
      return T.resumo().includes('So');
    })(), true);

    // --------------------------------------------------------------- varios setores
    T._zerar();
    trello.registro.pedidos.length = 0;
    definir(trello.url, 'Comercial=comercial01; Marketing=combinado1|etiqueta=Marketing; Gente e Gestão=combinado1|etiqueta=Gente,Gestao; Direx=direx00001|diretoria');
    conferir('o resumo do arranque diz quais setores e quais sao so da diretoria',
      T.resumo(), 'Trello: 4 quadros - Comercial, Marketing, Gente e Gestão, Direx (so diretoria)');

    const padrao = await T.obter({ diretoria: false });
    conferir('sem escolher, vem o primeiro setor', [padrao.atual, padrao.nome], ['comercial', 'Comercial']);
    conferir('a lista de setores e a que a pessoa pode ver (sem o da diretoria)', padrao.setores, [
      { chave: 'comercial', nome: 'Comercial', restrito: false },
      { chave: 'marketing', nome: 'Marketing', restrito: false },
      { chave: 'gente-e-gestao', nome: 'Gente e Gestão', restrito: false },
    ]);
    conferir('escolher um setor traz o quadro dele, com as listas dele (cada diretoria trabalha do seu jeito)',
      [nomes(await T.obter({ quadro: 'marketing' })), nomes(padrao)], [['Backlog', 'Fazendo'], ['1. Objetivo', '2. Resultado Chave', '3. Iniciativas']]);
    conferir('o link e a hora da leitura acompanham o quadro', [padrao.url, typeof padrao.atualizadoEm], ['https://trello.com/b/comercial01/comercial', 'number']);

    // --------------------------------------------------- etiquetas (o bug da API real)
    console.log('\n  -- etiquetas e cartoes');
    const pedidoDeCartoes = trello.registro.pedidos.find((x) => x.caminho === '/1/boards/comercial01/cards');
    conferir('os cartoes sao pedidos COM `labels` no fields (sem isso a API nao manda etiqueta nenhuma)',
      pedidoDeCartoes.fields.split(',').includes('labels'), true);
    conferir('  e sem `desc`: a tela nao usa, e descricao e texto a mais pra todo mundo', pedidoDeCartoes.fields.split(',').includes('desc'), false);
    const c2 = padrao.listas[1].cartoes[0];
    conferir('a etiqueta chega, com a cor (a sem nome fica de fora)', c2.etiquetas, [{ nome: 'Importante', cor: 'green' }]);
    conferir('membros e prazo tambem', [c2.membros, c2.prazo, c2.prazoConcluido], [['Ana Souza'], '2026-10-01T15:00:00.000Z', false]);
    conferir('cartao sem prazo, sem etiqueta e com dois membros',
      padrao.listas[2].cartoes[0], { id: 'C3', nome: 'Ligar pros leads frios', url: undefined, etiquetas: [], membros: ['Bia Lima', 'Caio Costa'], prazo: null, prazoConcluido: false });
    conferir('a posicao interna nao vai pra tela', 'pos' in padrao.listas[0].cartoes[0], false);

    // um quadro, dois setores: separados por etiqueta
    const mkt = await T.obter({ quadro: 'marketing' });
    const gg = await T.obter({ quadro: 'gente-e-gestao' });
    conferir('o Marketing so ve os cartoes da etiqueta Marketing, na ordem do Trello (pos)', cartoesDe(mkt), [['Roteiro do video', 'Post do Instagram'], []]);
    conferir('o Gente e Gestao (Gente + Gestao, sem depender de acento) ve os dele', cartoesDe(gg), [['Processo seletivo'], ['Relatorio do trimestre']]);
    conferir('  e o quadro inteiro NAO vaza pra quem so pediu um setor',
      JSON.stringify([mkt, gg]).includes('Sem etiqueta nenhuma'), false);
    conferir('a tela e avisada de que ha filtro', [mkt.filtro, gg.filtro], [['Marketing'], ['Gente', 'Gestao']]);
    conferir('cada setor mostra o proprio nome, mesmo dividindo o quadro com outro',
      [mkt.nome, gg.nome], ['Marketing', 'Gente e Gestão']);

    // --------------------------------------------------------- so diretoria
    console.log('\n  -- so diretoria');
    trello.registro.pedidos.length = 0;
    const doMembro = await T.obter({ quadro: 'direx', diretoria: false });
    conferir('quem nao e da diretoria pede o quadro da Direx e recebe o primeiro setor (nunca o dela)',
      [doMembro.atual, JSON.stringify(doMembro).includes('CONFIDENCIAL')], ['comercial', false]);
    conferir('  o quadro nem foi consultado no Trello por causa dele', trello.registro.pedidos.some((x) => x.quadro === 'direx00001'), false);
    const daDiretoria = await T.obter({ quadro: 'direx', diretoria: true });
    conferir('a diretoria ve o setor e o quadro', [daDiretoria.atual, cartoesDe(daDiretoria)[0], daDiretoria.setores.map((s) => s.chave + (s.restrito ? '*' : ''))],
      ['direx', ['PLANEJAMENTO ESTRATEGICO CONFIDENCIAL'], ['comercial', 'marketing', 'gente-e-gestao', 'direx*']]);
    definir(trello.url, 'Direx=direx00001|diretoria');
    conferir('se so ha quadro da diretoria, quem nao e dela ve que nao ha nenhum liberado',
      [(await T.obter({ diretoria: false })).indisponivel, (await T.obter({ diretoria: false })).setores], ['Nenhum quadro do Trello foi liberado pra voce.', []]);
    definir(trello.url, 'Comercial=comercial01; Marketing=combinado1|etiqueta=Marketing; Gente e Gestão=combinado1|etiqueta=Gente,Gestao; Direx=direx00001|diretoria');

    // ----------------------------------------------------------------------- cache
    console.log('\n  -- cache e "Atualizar"');
    let agora = 5_000_000;
    T._definirRelogio(() => agora);
    T._zerar();
    T._definirRelogio(() => agora);
    trello.registro.pedidos.length = 0;
    const contarQuadro = (id) => trello.registro.pedidos.filter((x) => x.quadro === id).length;
    await T.obter({ quadro: 'comercial' });
    conferir('ler um quadro custa 3 pedidos (quadro, listas, cartoes)', contarQuadro('comercial01'), 3);
    await T.obter({ quadro: 'comercial' });
    conferir('abrir de novo dentro de 2 minutos nao bate na API', contarQuadro('comercial01'), 3);
    await Promise.all([1, 2, 3, 4, 5].map(() => T.obter({ quadro: 'comercial', forcar: true })));
    conferir('"Atualizar" logo depois (menos de 10 s) nao estoura a API: continua no cache', contarQuadro('comercial01'), 3);
    agora += T.ATUALIZAR_A_CADA_MS + 1;
    await Promise.all([1, 2, 3, 4, 5].map(() => T.obter({ quadro: 'comercial', forcar: true })));
    conferir('"Atualizar" depois de 10 s passa por cima do cache (o botao antigo nao passava) - e cinco cliques juntos viram UMA leitura', contarQuadro('comercial01'), 6);
    agora += T.CACHE_MS + 1;
    await T.obter({ quadro: 'comercial' });
    conferir('passados os 2 minutos, abrir le de novo sozinho', contarQuadro('comercial01'), 9);
    conferir('cada setor tem o seu cache (ler o Comercial nao custou nada aos outros)', [contarQuadro('combinado1'), contarQuadro('direx00001')], [0, 0]);

    // ------------------------------------------------------------------------ falhas
    console.log('\n  -- quando o Trello falha');
    const cada = async (chave) => T.obter({ quadro: chave, diretoria: true });
    T._zerar();
    definir(trello.url, 'Bom=comercial01; Sem acesso=semacesso1; Nao existe=naoexiste1; Limitado=limitado01; Travado=travado001; Quebrado=combinado1', {});
    trello.registro.quebrar = new Set(['combinado1']);
    const semAcesso = await cada('sem-acesso');
    conferir('quadro que a conta do token nao enxerga: diz isso e nomeia o quadro',
      semAcesso.indisponivel, 'A conta dona do token nao enxerga o quadro "Sem acesso": ou o codigo esta errado, ou falta convidar essa conta pra ele no Trello.');
    conferir('  e o quadro vem vazio, sem derrubar a aba (a lista de setores continua)', [semAcesso.listas, semAcesso.setores.length], [[], 6]);
    conferir('quadro que nao existe recebe o mesmo aviso (e o Trello devolve 404, nao 401)',
      (await cada('nao-existe')).indisponivel.startsWith('A conta dona do token nao enxerga o quadro "Nao existe"'), true);
    conferir('limite de consultas do Trello: pede pra esperar', (await cada('limitado')).indisponivel, 'O Trello pediu pra esperar (muitas consultas seguidas). Atualize daqui a pouco.');
    conferir('Trello que nao responde: diz que demorou', (await cada('travado')).indisponivel, 'O Trello demorou demais pra responder. Tente atualizar em instantes.');
    conferir('erro do Trello (500): diz o codigo, sem inventar causa', (await cada('quebrado')).indisponivel, 'O Trello respondeu com erro (500). Tente de novo em instantes.');
    conferir('o setor bom continua funcionando com os outros quebrados', nomes(await cada('bom')), ['1. Objetivo', '2. Resultado Chave', '3. Iniciativas']);
    conferir('a explicacao "quadro sem acesso" custou UM pedido a mais (o de "quem e o dono do token"), lembrado por um minuto',
      trello.registro.porCaminho['/1/members/me'], 1);

    // token ruim: vale pra sede inteira, e a frase e outra
    T._zerar();
    trello.registro.quebrar = null;
    trello.registro.tokenRuim = true;
    const tokenRuim = await cada('bom');
    conferir('token recusado (venceu ou foi revogado): diz pra gerar outro',
      tokenRuim.indisponivel, 'O Trello recusou a chave ou o token (venceu ou foi revogado). Gere outro e atualize TRELLO_API_KEY e TRELLO_TOKEN.');
    trello.registro.tokenRuim = false;

    // rede: o Trello inteiro fora do ar
    T._zerar();
    definir('http://127.0.0.1:1/1', 'Bom=comercial01');
    const semRede = await T.obter();
    conferir('sem rede ate o Trello: diz que e a rede do servidor', semRede.indisponivel, 'A sede nao conseguiu falar com o Trello agora (rede do servidor).');

    // nunca a credencial
    conferir('em NENHUM dos avisos aparece a chave nem o token', [semAcesso, tokenRuim, semRede].some(vazamento), false);

    // o ultimo quadro que deu certo
    T._zerar();
    let relogio = 9_000_000;
    T._definirRelogio(() => relogio);
    definir(trello.url, 'Comercial=comercial01');
    const bom = await T.obter();
    trello.registro.quebrar = new Set(['comercial01']);
    relogio += T.CACHE_MS + 1;
    const velho = await T.obter();
    conferir('o Trello cai depois de ter dado certo: mostra o ultimo quadro, dizendo que e velho',
      [nomes(velho), velho.indisponivel.startsWith('Mostrando o ultimo quadro que deu certo.'), velho.atualizadoEm === bom.atualizadoEm], [nomes(bom), true, true]);
    trello.registro.quebrar = null;
    T._zerar();

    // ------------------------------------------------- o servidor de verdade (socket)
    console.log('\n  -- a sede de verdade: quem pode ver o que, pelo socket');
    const PORTA = 3714;
    const BASE = 'http://127.0.0.1:' + PORTA;
    servidorDaSede = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: pasta, PORT: String(PORTA), CODIGO_SEDE: 'teste-sede', ADMIN_CODE: 'teste-chefe',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_BOARD_ID: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', EMAIL_PROVEDOR: '',
        TRELLO_API_URL: trello.url, TRELLO_API_KEY: CHAVE, TRELLO_TOKEN: TOKEN, TRELLO_TIMEOUT_MS: '3000',
        TRELLO_QUADROS: 'Comercial=comercial01; Marketing=combinado1|etiqueta=Marketing; Direx=direx00001|diretoria',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let saida = '';
    servidorDaSede.stdout.on('data', (b) => { saida += b.toString(); });
    servidorDaSede.stderr.on('data', (b) => { saida += b.toString(); });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(BASE + '/api/saude')).ok) break; } catch (e) { /* ainda subindo */ }
      await espera(150);
    }
    conferir('o arranque diz quantos quadros o Trello tem (e quais sao so da diretoria)',
      /Trello: 3 quadros - Comercial, Marketing, Direx \(so diretoria\)/.test(saida), true);

    const registrar = (nome, email, extra) => fetch(BASE + '/api/registrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ nome, email, senha: 'senha-bem-longa', codigo: 'teste-sede' }, extra || {})),
    }).then((r) => ({ status: r.status, cookie: (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0] }));
    const chefe = await registrar('Chefe', 'chefe@adm.com', { codigoAdmin: 'teste-chefe' });
    const ana = await registrar('Ana', 'ana@adm.com');
    const sChefe = await abrirSocket(BASE, chefe.cookie);
    const sAna = await abrirSocket(BASE, ana.cookie);

    const diag = await fetch(BASE + '/api/diagnostico').then((r) => r.json());
    conferir('o diagnostico publico diz "trello: ligado" com TRELLO_QUADROS (antes so olhava o TRELLO_BOARD_ID)', diag.integracoes.trello, true);

    const dAna = await pedirAoServidor(sAna);
    conferir('a Ana (membro): ve Comercial e Marketing, e nada da Direx',
      [dAna.setores.map((s) => s.nome), dAna.atual, JSON.stringify(dAna).includes('CONFIDENCIAL'), JSON.stringify(dAna).includes('Direx')], [['Comercial', 'Marketing'], 'comercial', false, false]);
    const anaPedeDirex = await pedirAoServidor(sAna, { quadro: 'direx' });
    conferir('  pedir o da Direx na marra: volta o primeiro setor, sem dado nenhum dela',
      [anaPedeDirex.atual, JSON.stringify(anaPedeDirex).includes('CONFIDENCIAL')], ['comercial', false]);
    const anaSeDizDiretoria = await pedirAoServidor(sAna, { quadro: 'direx', diretoria: true, isAdmin: true });
    conferir('  e dizer no pedido que e da diretoria nao adianta (quem decide e a conta, no servidor)',
      [anaSeDizDiretoria.atual, JSON.stringify(anaSeDizDiretoria).includes('CONFIDENCIAL')], ['comercial', false]);
    const dChefe = await pedirAoServidor(sChefe, { quadro: 'direx' });
    conferir('o Chefe (diretoria) ve os tres e abre o da Direx',
      [dChefe.setores.map((s) => s.nome), dChefe.atual, cartoesDe(dChefe)[0]], [['Comercial', 'Marketing', 'Direx'], 'direx', ['PLANEJAMENTO ESTRATEGICO CONFIDENCIAL']]);

    // pedidos malformados nao derrubam nada
    const lixo = [null, 'texto', 42, [], { quadro: 42 }, { quadro: { a: 1 } }, { quadro: 'x'.repeat(5000) }, { forcar: 'sim' }, { quadro: '__proto__' }];
    for (const l of lixo) await pedirAoServidor(sAna, l);
    conferir('pedido malformado (string, numero, objeto no lugar da chave, chave enorme, __proto__) recebe o quadro padrao e o servidor segue de pe',
      [(await fetch(BASE + '/api/saude')).ok, (await pedirAoServidor(sAna)).atual], [true, 'comercial']);
    const anaComTexto = await pedirAoServidor(sAna, { quadro: 'marketing', forcar: 'true' });
    conferir('"forcar" escrito como texto nao quebra nada: o pedido vale como um pedido normal', anaComTexto.atual, 'marketing');

    sChefe.fechar();
    sAna.fechar();
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    if (servidorDaSede && !servidorDaSede.killed) servidorDaSede.kill();
    trello.servidor.close();
    if (trello.servidor.closeAllConnections) trello.servidor.closeAllConnections();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
