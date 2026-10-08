// O Kanban do CRM dentro da sede: server/kanban-crm.js (a ponte) e server/quadros.js (a
// junta com o Trello). Ver docs/plano-kanban-crm.md.
//
// O que este arquivo guarda, em ordem de gravidade:
//   1. QUEM ESTA OLHANDO e sempre a conta logada: o e-mail que vai pro CRM vem da CONTA,
//      e so de conta com e-mail PROVADO - nunca de dentro do pedido do navegador. Conta
//      so com senha nem chega a gerar pedido ao CRM;
//   2. UMA PESSOA NUNCA VE O QUADRO DE OUTRA: o cache e por pessoa, e uma chave forjada
//      de quadro que nao e dela cai no primeiro que e;
//   3. o que o CRM manda e conferido antes de ir pra tela, e os enderecos dos cartoes
//      sao montados aqui a partir do CRM_URL (o endereco que vier na resposta e ignorado);
//   4. quando o CRM falha, a aba diz o porque - sem a chave nem o endereco na frase -,
//      mostra o ultimo quadro bom se der, e NUNCA mostra quadro velho pra quem o CRM
//      acabou de recusar (perdeu o acesso);
//   5. nao coloca e-mail no `player` (que vai pra todo mundo no `init`).
//
// Roda contra um CRM de mentira e um Trello de mentira (servidores HTTP aqui dentro) -
// nunca contra o de verdade. As contas sao criadas numa pasta temporaria; NAO mexe em
// server/data.
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const CHAVE = 'chave-de-teste-do-kanban-com-mais-de-32-caracteres';
const PORTA_SEDE = 3724;

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------- os dados do CRM
const Q_COM = '11111111-1111-4111-8111-111111111111';
const Q_GG = '22222222-2222-4222-8222-222222222222';
const Q_MKT = '33333333-3333-4333-8333-333333333333';
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function cartao(n, titulo, extra) {
  return Object.assign({
    id: uuid(n), titulo, etiquetas: [], membros: [], prazo: null, prazoConcluido: false,
    temDescricao: false, checklist: null, comentarios: 0, anexos: 0,
  }, extra);
}
const quadroCom = () => ({
  id: Q_COM, nome: 'Comercial', area: 'Comercial',
  listas: [{ id: uuid(101), nome: 'Leads', cartoes: [cartao(1, 'LEAD SECRETO DO COMERCIAL')] }],
});
const quadroGg = () => ({
  id: Q_GG, nome: 'Gente e Gestão', area: 'Gente e Gestão (GG)',
  listas: [
    { id: uuid(102), nome: 'A fazer', cartoes: [
      cartao(2, 'Processo seletivo', {
        etiquetas: [{ nome: 'Urgente', cor: 'red' }], membros: ['Ana Souza'], prazo: '2026-09-25', prazoConcluido: false,
        temDescricao: true, checklist: { feitos: 2, total: 5 }, comentarios: 3, anexos: 1,
      }),
      cartao(3, 'Onboarding'),
    ] },
    { id: uuid(103), nome: 'Concluído', cartoes: [cartao(4, 'Feriado do time')] },
  ],
});
const quadroMkt = () => ({
  id: Q_MKT, nome: 'Marketing', area: 'Marketing',
  listas: [{ id: uuid(104), nome: 'Ideias', cartoes: [cartao(5, 'IDEIA SECRETA DO MARKETING')] }],
});

// ---------------------------------------------------------------- o CRM de mentira
const CRM = { pedidos: [], modo: 'ok', porEmail: {}, recusar: new Set() };
function novoCrm() {
  const servidor = http.createServer((req, res) => {
    let texto = '';
    req.on('data', (b) => { texto += b; });
    req.on('end', () => {
      let corpo = null;
      try { corpo = JSON.parse(texto); } catch (e) { corpo = texto; }
      CRM.pedidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization || null, corpo });
      const responder = (status, obj, cabecalhos) => {
        res.writeHead(status, Object.assign({ 'content-type': 'application/json' }, cabecalhos || {}));
        res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
      };
      if (req.method !== 'POST' || req.url !== '/api/kanban/externo/quadros') return responder(404, { error: 'nao existe' });
      if (req.headers.authorization !== 'Bearer ' + CHAVE) return responder(401, { error: 'Chave do escritorio invalida.' });
      switch (CRM.modo) {
        case 'travar': return undefined;                         // nunca responde
        case '500': return responder(500, { error: 'Nao foi possivel ler o Kanban agora.' });
        case '429': return responder(429, { error: 'Muitas requisicoes.' });
        case '401': return responder(401, { error: 'Chave do escritorio invalida.' });
        case '404': return responder(404, '<html>nao achei</html>');
        case '503': return responder(503, { error: 'O Kanban do escritorio nao esta ligado neste CRM.' });
        case 'redirecionar': return responder(302, '', { location: 'https://outro-lugar.exemplo.com/login' });
        case 'lixo': return responder(200, '<html>pagina de login</html>');
        case 'forma-errada': return responder(200, { quadros: 'isto nao e uma lista' });
        default: break;
      }
      const email = String(corpo && corpo.email || '').toLowerCase();
      if (CRM.recusar.has(email)) {
        return responder(403, { error: 'Seu acesso ao CRM está desativado. Fale com um gestor.' });
      }
      if (email === 'bloqueada@adm.com') {
        return responder(403, { error: 'Seu e-mail não tem acesso ao CRM. Peça a um gestor pra liberar o bloqueada@adm.com.' });
      }
      const quadros = CRM.porEmail[email] ? CRM.porEmail[email]() : [];
      return responder(200, { quadros });
    });
  });
  return new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => resolve({ servidor, url: 'http://127.0.0.1:' + servidor.address().port })));
}
const gestorVe = () => [quadroCom(), quadroGg(), quadroMkt()];
const colaboradorVe = () => [quadroGg()];
CRM.porEmail = {
  'provada@adm.com': gestorVe,
  'colab@adm.com': colaboradorVe,
  'diretoria@adm.com': gestorVe,
  'semquadro@adm.com': () => [],
};

// ---------------------------------------------------------- o Trello de mentira
function novoTrello() {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const responder = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (url.searchParams.get('key') !== 'chave-trello' || url.searchParams.get('token') !== 'token-trello') return responder(401, 'x');
    const m = /^\/1\/boards\/([^/]+)(?:\/(lists|cards))?$/.exec(url.pathname);
    if (!m) return responder(404, 'x');
    if (!m[2]) return responder(200, { id: m[1], name: 'Quadro velho do Trello', url: 'https://trello.com/b/' + m[1] });
    if (m[2] === 'lists') return responder(200, [{ id: 'T1', name: 'Coluna do Trello' }]);
    return responder(200, [{ id: 'C1', name: 'Cartao do Trello', url: 'https://trello.com/c/C1', idList: 'T1', pos: 1, labels: [] }]);
  });
  return new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => resolve({ servidor, url: 'http://127.0.0.1:' + servidor.address().port + '/1' })));
}

// ---------------------------------------------------------------- variaveis
function ambiente(crmUrl, extra) {
  const base = {
    CRM_URL: crmUrl, CRM_CHAVE_KANBAN: CHAVE, KANBAN_CHAVE_ESCRITORIO: '', KANBAN_TIMEOUT_MS: '600',
    TRELLO_API_URL: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_QUADROS: '', TRELLO_BOARD_ID: '', TRELLO_TIMEOUT_MS: '600',
  };
  Object.assign(process.env, base, extra || {});
}
const semCrm = () => { delete process.env.CRM_URL; delete process.env.CRM_CHAVE_KANBAN; delete process.env.KANBAN_CHAVE_ESCRITORIO; };

// ------------------------------------------------------------ socket "na unha"
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
async function pedirQuadros(socket, dado) {
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

const nomesDosSetores = (r) => (r.setores || []).map((s) => s.nome);
const cartoesDe = (r) => (r.listas || []).map((l) => l.cartoes.map((c) => c.nome));

(async function () {
  const crm = await novoCrm();
  const trelloFalso = await novoTrello();
  let servidorDaSede = null;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-kanban-'));
  const K = require(path.join(raiz, 'server', 'kanban-crm.js'));
  const Q = require(path.join(raiz, 'server', 'quadros.js'));
  const T = require(path.join(raiz, 'server', 'trello.js'));
  const zerar = () => { K._zerar(); T._zerar(); CRM.pedidos.length = 0; CRM.modo = 'ok'; CRM.recusar.clear(); };

  try {
    // ================================================================ a ponte
    console.log('\nKANBAN DO CRM: A PONTE');
    ambiente(crm.url);
    conferir('com CRM_URL e a chave (32+ caracteres): ligado', K.configurado(), true);
    process.env.CRM_CHAVE_KANBAN = CHAVE.slice(0, 31);
    conferir('  chave com 31 caracteres: desligado (uma porta que le o Kanban nao pode depender de chave curta)', K.configurado(), false);
    process.env.CRM_CHAVE_KANBAN = CHAVE;
    process.env.CRM_URL = 'crm.exemplo.com.br';
    conferir('  endereco sem http(s): desligado', K.configurado(), false);
    process.env.CRM_URL = crm.url;

    // O nome que o CRM usa pra mesma chave (KANBAN_CHAVE_ESCRITORIO) tambem liga a sede: copiar o nome
    // de um lado pro outro e o erro mais facil de cometer no painel da hospedagem.
    delete process.env.CRM_CHAVE_KANBAN;
    process.env.KANBAN_CHAVE_ESCRITORIO = CHAVE;
    conferir('so com o nome do CRM (KANBAN_CHAVE_ESCRITORIO): ligado tambem', K.configurado(), true);
    zerar();
    const pelaOutra = await K.quadrosDe('provada@adm.com');
    conferir('  e e essa chave que vai pro CRM', [pelaOutra.ok, CRM.pedidos.length ? CRM.pedidos[0].auth : null], [true, 'Bearer ' + CHAVE]);
    process.env.CRM_CHAVE_KANBAN = CHAVE;
    process.env.KANBAN_CHAVE_ESCRITORIO = 'y'.repeat(40);
    zerar();
    await K.quadrosDe('provada@adm.com');
    conferir('  com os dois nomes, vale o da sede (CRM_CHAVE_KANBAN)', CRM.pedidos.length ? CRM.pedidos[0].auth : null, 'Bearer ' + CHAVE);
    process.env.KANBAN_CHAVE_ESCRITORIO = CHAVE.slice(0, 31);
    delete process.env.CRM_CHAVE_KANBAN;
    conferir('  e a regra dos 32 caracteres vale pro nome do CRM tambem', K.configurado(), false);
    delete process.env.KANBAN_CHAVE_ESCRITORIO;
    process.env.CRM_CHAVE_KANBAN = CHAVE;
    zerar();

    semCrm();
    conferir('  sem nada: desligado, e "quadrosDe" diz isso sem chamar ninguem', [K.configurado(), (await K.quadrosDe('a@adm.com')).ok, CRM.pedidos.length], [false, false, 0]);
    ambiente(crm.url);

    zerar();
    const r1 = await K.quadrosDe('Provada@Adm.com');
    conferir('o pedido ao CRM: POST na porta do Kanban, com a chave no cabecalho e SO o e-mail no corpo',
      [CRM.pedidos.length, CRM.pedidos[0].metodo, CRM.pedidos[0].url, CRM.pedidos[0].auth, Object.keys(CRM.pedidos[0].corpo)],
      [1, 'POST', '/api/kanban/externo/quadros', 'Bearer ' + CHAVE, ['email']]);
    conferir('  o e-mail vai como a conta o tem (o CRM que compare sem diferenciar maiuscula)', CRM.pedidos[0].corpo.email, 'Provada@Adm.com');
    conferir('  volta ok, com os tres quadros e a hora', [r1.ok, r1.quadros.map((q) => q.nome), typeof r1.atualizadoEm], [true, ['Comercial', 'Gente e Gestão', 'Marketing'], 'number']);

    const gg = r1.quadros.find((q) => q.id === Q_GG);
    conferir('o endereco do quadro e do cartao sao montados aqui, a partir do CRM_URL',
      [gg.url, gg.listas[0].cartoes[0].url], [crm.url + '/kanban?quadro=' + Q_GG, crm.url + '/kanban?quadro=' + Q_GG + '&cartao=' + uuid(2)]);
    conferir('  o cartao chega com o que a tela usa (titulo vira nome, contadores, checklist, prazo em dia)',
      gg.listas[0].cartoes[0],
      { id: uuid(2), nome: 'Processo seletivo', url: crm.url + '/kanban?quadro=' + Q_GG + '&cartao=' + uuid(2),
        etiquetas: [{ nome: 'Urgente', cor: 'red' }], membros: ['Ana Souza'], prazo: '2026-09-25', prazoConcluido: false,
        temDescricao: true, checklist: { feitos: 2, total: 5 }, comentarios: 3, anexos: 1 });
    conferir('  cada lista diz quantos cartoes tem no total', gg.listas.map((l) => [l.nome, l.total, l.cartoes.length]), [['A fazer', 2, 2], ['Concluído', 1, 1]]);

    // ------------------------------------------------ o que vem do CRM e conferido
    console.log('\n  -- o que o CRM manda e conferido antes de ir pra tela');
    zerar();
    CRM.porEmail['sujo@adm.com'] = () => [
      {
        id: Q_GG, nome: 'N'.repeat(500), url: 'javascript:alert(1)', area: 'x',
        listas: [{
          id: uuid(9), nome: 'L'.repeat(500), cartoes: [
            cartao(10, 'T'.repeat(900), {
              url: 'javascript:alert(2)', href: 'javascript:alert(3)',
              etiquetas: Array.from({ length: 30 }, (_, i) => ({ nome: 'E' + i, cor: 'red' })).concat([{ nome: '', cor: 'blue' }, null, 'texto']),
              membros: Array.from({ length: 40 }, (_, i) => 'Pessoa ' + i).concat(['', null, 42]),
              prazo: '25/09/2026', checklist: { feitos: 9, total: 3 }, comentarios: -4, anexos: 999999,
              descricao: 'TEXTO QUE NAO DEVIA CHEGAR', temDescricao: 'sim',
            }),
            { id: 'nao-e-uuid', titulo: 'cartao com id torto' },
            null, 'lixo', 42,
            cartao(11, 'Prazo em texto', { prazo: '2026-13-45' }),
            cartao(12, 'Checklist vazia', { checklist: { feitos: 0, total: 0 } }),
          ],
        }, { id: 'lista-torta', nome: 'lista sem uuid', cartoes: [] }, null],
      },
      { id: 'quadro-torto', nome: 'sem uuid', listas: [] },
      { id: uuid(20), nome: '', listas: [] },
      null, 'lixo',
    ];
    const sujo = await K.quadrosDe('sujo@adm.com');
    const q = sujo.quadros[0];
    const c = q.listas[0].cartoes[0];
    conferir('so passa quadro, lista e cartao com id de verdade (uuid) e quadro com nome', [sujo.quadros.length, q.listas.length, q.listas[0].cartoes.length], [1, 1, 3]);
    conferir('  nome de quadro e de lista cortados', [q.nome.length, q.listas[0].nome.length], [60, 60]);
    conferir('  titulo cortado em 300; etiquetas em 12 (sem as vazias nem as tortas); membros em 20 (sem os vazios)',
      [c.nome.length, c.etiquetas.length, c.membros.length], [300, 12, 20]);
    conferir('  o endereco que vem na resposta (javascript:...) e IGNORADO: o daqui e que vale',
      [q.url, c.url, JSON.stringify(sujo).includes('javascript')], [crm.url + '/kanban?quadro=' + Q_GG, crm.url + '/kanban?quadro=' + Q_GG + '&cartao=' + uuid(10), false]);
    conferir('  prazo que nao e um dia de verdade vira nulo ("25/09/2026" nao e o formato; "2026-13-45" tem a forma, mas nao existe)',
      [c.prazo, q.listas[0].cartoes[1].prazo], [null, null]);
    conferir('  checklist com mais feitos que total e cortada no total; sem itens vira nula',
      [c.checklist, q.listas[0].cartoes[2].checklist], [{ feitos: 3, total: 3 }, null]);
    conferir('  contador negativo vira zero; enorme, no teto', [c.comentarios, c.anexos], [0, 9999]);
    conferir('  descricao nunca passa (so o "tem descricao" verdadeiro de verdade)', [JSON.stringify(sujo).includes('NAO DEVIA'), c.temDescricao], [false, false]);

    zerar();
    CRM.porEmail['grande@adm.com'] = () => [{
      id: Q_GG, nome: 'Grande', listas: [{ id: uuid(9), nome: 'Concluido', cartoes: Array.from({ length: 250 }, (_, i) => cartao(1000 + i, 'Cartao ' + i)) }],
    }];
    const grande = await K.quadrosDe('grande@adm.com');
    conferir('coluna com 250 cartoes: a tela recebe os primeiros ' + K.MAX_CARTOES_POR_LISTA + ', e o total (250) continua certo',
      [grande.quadros[0].listas[0].cartoes.length, grande.quadros[0].listas[0].total, grande.quadros[0].listas[0].cartoes[0].nome], [K.MAX_CARTOES_POR_LISTA, 250, 'Cartao 0']);

    // ------------------------------------------------------------------ cache
    console.log('\n  -- cache e "Atualizar"');
    zerar();
    let relogio = 5_000_000;
    K._definirRelogio(() => relogio);
    const a1 = await K.quadrosDe('provada@adm.com');
    const a2 = await K.quadrosDe('provada@adm.com');
    conferir('abrir de novo dentro de 1 minuto nao pergunta ao CRM outra vez', [CRM.pedidos.length, a2.atualizadoEm === a1.atualizadoEm], [1, true]);
    await K.quadrosDe('PROVADA@ADM.COM');
    conferir('  maiuscula e minuscula no e-mail e a mesma pessoa (um cache so)', CRM.pedidos.length, 1);
    await K.quadrosDe('colab@adm.com');
    conferir('  outra pessoa tem o cache dela (e pergunta ao CRM)', CRM.pedidos.length, 2);
    relogio += 3000;
    await K.quadrosDe('provada@adm.com', { forcar: true });
    conferir('"Atualizar" logo depois (menos de 10 s) nao estoura o CRM: continua no cache', CRM.pedidos.length, 2);
    relogio += K.ATUALIZAR_A_CADA_MS;
    const a3 = await K.quadrosDe('provada@adm.com', { forcar: true });
    conferir('"Atualizar" depois de 10 s passa por cima do cache', [CRM.pedidos.length, a3.atualizadoEm > a1.atualizadoEm], [3, true]);
    relogio += K.CACHE_MS + 1;
    await K.quadrosDe('provada@adm.com');
    conferir('passado 1 minuto, abrir busca de novo', CRM.pedidos.length, 4);

    zerar();
    await Promise.all(Array.from({ length: 6 }, () => K.quadrosDe('provada@adm.com')));
    conferir('seis cliques juntos na mesma conta viram UM pedido', CRM.pedidos.length, 1);

    // ------------------------------------------------------------------ falhas
    console.log('\n  -- quando o CRM falha, a aba diz o que houve (sem a chave nem o endereco)');
    const casos = [
      ['401', /mesma chave do Kanban/, 'a chave da sede nao e a do CRM'],
      ['404', /porta do Kanban.*publicar a versao nova do CRM/, 'o CRM ainda nao foi publicado com a porta nova'],
      ['429', /pediu pra esperar/, 'o CRM limitou as consultas'],
      ['500', /erro \(500\)/, 'o CRM deu erro'],
      ['503', /nao esta ligado neste CRM/, 'o CRM nao tem a chave do escritorio'],
      ['lixo', /formato que a sede nao entende/, 'o CRM respondeu uma pagina (endereco errado?)'],
      ['forma-errada', /formato que a sede nao entende/, 'o JSON nao e a lista de quadros'],
      ['redirecionar', /redireciona pra outro lugar/, 'o CRM_URL redireciona (http no lugar de https?)'],
      ['travar', /demorou demais/, 'o CRM nao responde'],
    ];
    for (const [modo, regra, nome] of casos) {
      zerar();
      CRM.modo = modo;
      const r = await K.quadrosDe('provada@adm.com');
      conferir(nome + ': ' + modo, [r.ok, regra.test(r.erro || ''), (r.erro || '').includes(CHAVE) || (r.erro || '').includes(crm.url)], [false, true, false]);
    }
    zerar();
    process.env.CRM_CHAVE_KANBAN = 'x'.repeat(40);   // a sede com uma chave, o CRM com outra
    const chaveErrada = await K.quadrosDe('provada@adm.com');
    conferir('chave da sede diferente da do CRM (o CRM responde 401 de verdade): a aba manda avisar a diretoria',
      [chaveErrada.ok, /mesma chave do Kanban/.test(chaveErrada.erro), chaveErrada.erro.includes('x'.repeat(40))], [false, true, false]);
    process.env.CRM_CHAVE_KANBAN = CHAVE;
    zerar();
    const recusadaPeloCrm = await K.quadrosDe('bloqueada@adm.com');
    conferir('403: a frase do CRM (que diz o que fazer) chega inteira', [recusadaPeloCrm.ok, /^Seu e-mail não tem acesso ao CRM\. Peça a um gestor/.test(recusadaPeloCrm.erro)], [false, true]);

    zerar();
    process.env.CRM_URL = 'http://127.0.0.1:1';   // porta fechada
    const semRede = await K.quadrosDe('provada@adm.com');
    conferir('CRM fora do ar (porta fechada): "nao conseguiu falar", sem o endereco na frase', [semRede.ok, /nao conseguiu falar com o CRM/.test(semRede.erro), semRede.erro.includes('127.0.0.1')], [false, true, false]);
    process.env.CRM_URL = crm.url;

    // ------------------------------------------------------------- o "velho"
    console.log('\n  -- o ultimo quadro bom, e quando ele NAO pode aparecer');
    zerar();
    relogio = 8_000_000;
    K._definirRelogio(() => relogio);
    const bom = await K.quadrosDe('provada@adm.com');
    CRM.modo = '500';
    relogio += K.CACHE_MS + 1;
    const velho = await K.quadrosDe('provada@adm.com');
    conferir('o CRM cai depois de ter dado certo: mostra o ultimo quadro, dizendo que e velho',
      [velho.ok, velho.quadros.map((x) => x.nome), /^Mostrando o ultimo quadro que deu certo\. O CRM respondeu com erro/.test(velho.aviso), velho.atualizadoEm === bom.atualizadoEm],
      [true, ['Comercial', 'Gente e Gestão', 'Marketing'], true, true]);
    relogio += K.VELHO_VALE_MS;
    const passou = await K.quadrosDe('provada@adm.com');
    conferir('  mas o "velho" tem validade (6 horas): depois disso, so o aviso de erro', [passou.ok, /erro \(500\)/.test(passou.erro)], [false, true]);

    // O caso que importa: a pessoa via os quadros e depois o CRM passa a recusar (mudou de
    // cargo, saiu da ADM). O quadro que ficou no cache NAO pode continuar aparecendo.
    zerar();
    relogio = 9_000_000;
    K._definirRelogio(() => relogio);
    CRM.porEmail['vai-sair@adm.com'] = gestorVe;
    const viu = await K.quadrosDe('vai-sair@adm.com');
    CRM.recusar.add('vai-sair@adm.com');
    relogio += K.CACHE_MS + 1;
    const recusada = await K.quadrosDe('vai-sair@adm.com');
    conferir('o CRM passa a recusar (403) quem antes via: NADA do quadro do cache aparece (perdeu o acesso)',
      [viu.ok, recusada.ok, recusada.quadros === undefined, /desativado/.test(recusada.erro)], [true, false, true, true]);
    CRM.recusar.clear();
    CRM.modo = '500';
    relogio += K.CACHE_MS + 1;
    const semVelho = await K.quadrosDe('vai-sair@adm.com');
    conferir('  e o cache dela foi APAGADO: com o CRM dando erro em seguida, nao sobra quadro velho pra mostrar',
      [semVelho.ok, semVelho.aviso], [false, undefined]);
    K._zerar();

    // ==================================================== a junta com o Trello
    console.log('\nQUADROS: O KANBAN DO CRM + O TRELLO');
    zerar();
    relogio = 20_000_000;
    K._definirRelogio(() => relogio);
    ambiente(crm.url);
    const rGestor = await Q.obter({ email: 'provada@adm.com' });
    conferir('so o CRM ligado: um botao por quadro que o CRM liberou, todos com origem "crm"',
      [nomesDosSetores(rGestor), rGestor.setores.map((s) => s.origem), rGestor.setores.map((s) => s.restrito)],
      [['Comercial', 'Gente e Gestão', 'Marketing'], ['crm', 'crm', 'crm'], [false, false, false]]);
    conferir('  abre o primeiro, com as listas, o endereco do quadro no CRM e a origem',
      [rGestor.atual, rGestor.origem, rGestor.nome, cartoesDe(rGestor), rGestor.url], ['crm:' + Q_COM, 'crm', 'Comercial', [['LEAD SECRETO DO COMERCIAL']], crm.url + '/kanban?quadro=' + Q_COM]);
    const rGg = await Q.obter({ email: 'provada@adm.com', quadro: 'crm:' + Q_GG });
    conferir('  escolher outro quadro devolve o dele (sem novo pedido ao CRM: ja veio tudo junto)',
      [rGg.atual, rGg.nome, cartoesDe(rGg), CRM.pedidos.length], ['crm:' + Q_GG, 'Gente e Gestão', [['Processo seletivo', 'Onboarding'], ['Feriado do time']], 1]);
    conferir('  a hora da atualizacao vai junto', typeof rGg.atualizadoEm, 'number');

    // isolamento entre pessoas
    const rColab = await Q.obter({ email: 'colab@adm.com' });
    const textoColab = JSON.stringify(rColab);
    conferir('o colaborador recebe SO o quadro dele - nem o nome dos outros', [nomesDosSetores(rColab), rColab.atual], [['Gente e Gestão'], 'crm:' + Q_GG]);
    conferir('  e nada do Comercial nem do Marketing vaza (o cache do gestor ja estava cheio)',
      [textoColab.includes('SECRETO'), textoColab.includes(Q_COM), textoColab.includes(Q_MKT)], [false, false, false]);
    const rForjado = await Q.obter({ email: 'colab@adm.com', quadro: 'crm:' + Q_COM });
    conferir('  pedir o quadro do Comercial na marra (chave forjada): volta o dele, sem dado nenhum do outro',
      [rForjado.atual, JSON.stringify(rForjado).includes('SECRETO')], ['crm:' + Q_GG, false]);
    const rInventado = await Q.obter({ email: 'colab@adm.com', quadro: 'crm:99999999-9999-4999-8999-999999999999' });
    conferir('  chave inventada: tambem cai no primeiro dele', rInventado.atual, 'crm:' + Q_GG);
    const rDiretoria = await Q.obter({ email: 'colab@adm.com', diretoria: true });
    conferir('  ser "diretoria" na sede nao muda o que o CRM libera (quem decide e o cargo no CRM)', nomesDosSetores(rDiretoria), ['Gente e Gestão']);

    // o CRM cai depois de a pessoa ter visto os quadros
    zerar();
    relogio = 30_000_000;
    K._definirRelogio(() => relogio);
    await Q.obter({ email: 'colab@adm.com' });
    CRM.modo = '500';
    relogio += K.CACHE_MS + 1;
    const rVelho = await Q.obter({ email: 'colab@adm.com' });
    conferir('o CRM cai depois de a pessoa ter visto os quadros: a aba mostra o ultimo quadro E diz que e velho',
      [nomesDosSetores(rVelho), cartoesDe(rVelho), /^Mostrando o ultimo quadro que deu certo\. O CRM respondeu com erro/.test(rVelho.indisponivel)],
      [['Gente e Gestão'], [['Processo seletivo', 'Onboarding'], ['Feriado do time']], true]);
    CRM.modo = 'ok';

    // sem e-mail provado
    zerar();
    const antesPedidos = CRM.pedidos.length;
    const rSemEmail = await Q.obter({ email: null });
    conferir('conta sem e-mail provado: NENHUM pedido ao CRM, e a aba explica como resolver',
      [CRM.pedidos.length - antesPedidos, rSemEmail.setores, /Entre uma vez com o Google da ADM/.test(rSemEmail.indisponivel)], [0, [], true]);

    // sem quadro liberado
    const rSemQuadro = await Q.obter({ email: 'semquadro@adm.com' });
    conferir('o CRM nao liberou quadro nenhum: a aba diz que o cargo define e manda falar com um gestor',
      [rSemQuadro.setores, /o seu cargo la define quais/.test(rSemQuadro.indisponivel)], [[], true]);

    // CRM recusa
    const rRecusada = await Q.obter({ email: 'bloqueada@adm.com' });
    conferir('o CRM recusa a pessoa: a frase dele aparece na aba', [rRecusada.setores, /não tem acesso ao CRM/.test(rRecusada.indisponivel)], [[], true]);

    // nada ligado
    semCrm();
    zerar();
    const rNada = await Q.obter({ email: 'provada@adm.com' });
    conferir('nem CRM nem Trello: a aba diz que os quadros nao foram ligados', [rNada.setores, /nao foram ligados nesta sede/.test(rNada.indisponivel)], [[], true]);
    conferir('  e o diagnostico diz a mesma coisa', [Q.situacao(), Q.configurado()], [{ kanban: false, trello: false }, false]);

    // -------------------------------------------------- com o Trello ao lado
    console.log('\n  -- com o Trello listado ao lado');
    zerar();
    ambiente(crm.url, {
      TRELLO_API_URL: trelloFalso.url, TRELLO_API_KEY: 'chave-trello', TRELLO_TOKEN: 'token-trello',
      TRELLO_QUADROS: 'Quadro Antigo=antigo0001|diretoria; Outro Antigo=antigo0002',
    });
    const rMisto = await Q.obter({ email: 'colab@adm.com' });
    conferir('os quadros do CRM vem primeiro; os do Trello listados vem depois, marcados como "trello"',
      [nomesDosSetores(rMisto), rMisto.setores.map((s) => s.origem)], [['Gente e Gestão', 'Outro Antigo'], ['crm', 'trello']]);
    const rTrello = await Q.obter({ email: 'colab@adm.com', quadro: 'outro-antigo' });
    conferir('  escolher o do Trello devolve o quadro do Trello, com a origem',
      [rTrello.atual, rTrello.origem, rTrello.nome, cartoesDe(rTrello)], ['outro-antigo', 'trello', 'Outro Antigo', [['Cartao do Trello']]]);
    const rDir = await Q.obter({ email: 'diretoria@adm.com', diretoria: true });
    conferir('  o quadro do Trello "so diretoria" continua so da diretoria (Trello); o do CRM nao depende disso',
      [nomesDosSetores(rDir), nomesDosSetores(rMisto)], [['Comercial', 'Gente e Gestão', 'Marketing', 'Quadro Antigo', 'Outro Antigo'], ['Gente e Gestão', 'Outro Antigo']]);
    const rSemProvar = await Q.obter({ email: null });
    conferir('  sem e-mail provado, o Trello listado continua aparecendo - com o aviso do CRM em cima',
      [nomesDosSetores(rSemProvar), /Entre uma vez com o Google/.test(rSemProvar.indisponivel)], [['Outro Antigo'], true]);
    CRM.modo = '500';
    K._zerar();
    const rCrmCaiu = await Q.obter({ email: 'colab@adm.com' });
    conferir('  CRM fora do ar: o Trello listado segue funcionando, e o aviso do CRM aparece junto',
      [nomesDosSetores(rCrmCaiu), rCrmCaiu.origem, cartoesDe(rCrmCaiu), /O CRM respondeu com erro \(500\)/.test(rCrmCaiu.indisponivel)],
      [['Outro Antigo'], 'trello', [['Cartao do Trello']], true]);
    CRM.modo = 'ok';

    // o quadro antigo (TRELLO_BOARD_ID)
    zerar();
    ambiente(crm.url, {
      TRELLO_API_URL: trelloFalso.url, TRELLO_API_KEY: 'chave-trello', TRELLO_TOKEN: 'token-trello', TRELLO_QUADROS: '', TRELLO_BOARD_ID: 'antigo0009',
    });
    const comLegado = await Q.obter({ email: 'colab@adm.com' });
    conferir('com o CRM ligado, o TRELLO_BOARD_ID de antes (o quadro parado) NAO aparece ao lado dos quadros de verdade',
      [nomesDosSetores(comLegado), JSON.stringify(comLegado).includes('Quadro velho')], [['Gente e Gestão'], false]);
    conferir('  e o diagnostico conta so o CRM', Q.situacao(), { kanban: true, trello: false });
    semCrm();
    zerar();
    const soLegado = await Q.obter({ email: 'colab@adm.com' });
    conferir('sem o CRM, o TRELLO_BOARD_ID de antes continua valendo (nada muda pra quem so tem o Trello)',
      [nomesDosSetores(soLegado), soLegado.origem, cartoesDe(soLegado)], [['Quadro velho do Trello'], 'trello', [['Cartao do Trello']]]);
    conferir('  e o diagnostico conta o Trello', Q.situacao(), { kanban: false, trello: true });

    // o log do arranque
    ambiente(crm.url);
    conferir('o log do arranque: CRM ligado; Trello sem quadro listado explica a regra',
      Q.resumo(), ['Kanban do CRM: ligado', 'Trello: nenhum quadro listado (com o Kanban do CRM ligado, so entram os do TRELLO_QUADROS)']);
    semCrm();
    conferir('  CRM desligado: diz o que definir', /^Kanban do CRM: desligado \(defina CRM_URL e CRM_CHAVE_KANBAN/.test(Q.resumo()[0]), true);
    ambiente(crm.url);

    // ================================================= a sede de verdade (socket)
    console.log('\nA SEDE DE VERDADE: QUEM PEDE, PELO SOCKET');
    zerar();
    // contas escritas pelo proprio usuarios.js (o hash de senha e o formato sao os de verdade)
    execFileSync(process.execPath, ['-e', `
      const u = require(${JSON.stringify(path.join(raiz, 'server', 'usuarios.js'))});
      u.criar({ nome: 'Provada', email: 'provada@adm.com', senha: 'senha-bem-forte-1', emailVerificado: true });
      u.criar({ nome: 'Colab', email: 'colab@adm.com', senha: 'senha-bem-forte-2', emailVerificado: true });
      u.criar({ nome: 'SoSenha', email: 'sosenha@adm.com', senha: 'senha-bem-forte-3' });
      u.criar({ nome: 'Bloqueada', email: 'bloqueada@adm.com', senha: 'senha-bem-forte-4', emailVerificado: true });
      u.criar({ nome: 'Diretoria', email: 'diretoria@adm.com', senha: 'senha-bem-forte-5', emailVerificado: true, isAdmin: true });
    `], { env: Object.assign({}, process.env, { DATA_DIR: pasta }), stdio: 'ignore' });

    const BASE = 'http://127.0.0.1:' + PORTA_SEDE;
    servidorDaSede = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: pasta, PORT: String(PORTA_SEDE), SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', CODIGO_SEDE: '', ADMIN_CODE: '', DIRETORIA_EMAILS: '',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', EMAIL_PROVEDOR: '', EMAIL_CHAVE: '',
        CRM_URL: crm.url, CRM_CHAVE_KANBAN: CHAVE, CRM_CHAVE_DISCADOR: '',
        TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_QUADROS: '', TRELLO_BOARD_ID: '',
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
    conferir('o arranque diz que o Kanban do CRM esta ligado (sem imprimir o endereco nem a chave)',
      [/Kanban do CRM: ligado/.test(saida), saida.includes(CHAVE), saida.includes(crm.url)], [true, false, false]);

    const entrar = (email, senha) => fetch(BASE + '/api/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }),
    }).then((r) => ({ status: r.status, cookie: (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0] }));
    const provada = await entrar('provada@adm.com', 'senha-bem-forte-1');
    const colab = await entrar('colab@adm.com', 'senha-bem-forte-2');
    const soSenha = await entrar('sosenha@adm.com', 'senha-bem-forte-3');
    const bloqueada = await entrar('bloqueada@adm.com', 'senha-bem-forte-4');
    const diretoria = await entrar('diretoria@adm.com', 'senha-bem-forte-5');
    conferir('(as cinco contas entram)', [provada.status, colab.status, soSenha.status, bloqueada.status, diretoria.status], [200, 200, 200, 200, 200]);

    const sProvada = await abrirSocket(BASE, provada.cookie);
    const sColab = await abrirSocket(BASE, colab.cookie);
    const sSoSenha = await abrirSocket(BASE, soSenha.cookie);
    const sBloqueada = await abrirSocket(BASE, bloqueada.cookie);
    const sDiretoria = await abrirSocket(BASE, diretoria.cookie);

    // 5) o e-mail nao mora no `player`, que vai pra todo mundo
    const init = JSON.stringify(sProvada.eventos.find((e) => e[0] === 'init'));
    conferir('o `init` (que leva o player de todo mundo) NAO tem e-mail de ninguem', /@adm\.com/.test(init), false);
    conferir('  nem o `player-joined` de quem entrou depois', /@adm\.com/.test(JSON.stringify(sProvada.eventos.filter((e) => e[0] === 'player-joined'))), false);

    // 1) quem pede
    CRM.pedidos.length = 0;
    const dProvada = await pedirQuadros(sProvada);
    conferir('a Provada (e-mail provado): recebe os tres quadros do CRM, abrindo o primeiro',
      [nomesDosSetores(dProvada), dProvada.atual, dProvada.origem], [['Comercial', 'Gente e Gestão', 'Marketing'], 'crm:' + Q_COM, 'crm']);
    conferir('  o CRM recebeu UM pedido, com o e-mail DA CONTA', [CRM.pedidos.length, CRM.pedidos[0].corpo], [1, { email: 'provada@adm.com' }]);

    await pedirQuadros(sProvada, { quadro: 'crm:' + Q_GG, forcar: true, email: 'colab@adm.com', emailVerificado: true, diretoria: true, isAdmin: true, usuarioId: 'x' });
    await pedirQuadros(sProvada, { email: 'diretoria@adm.com', forcar: true });
    conferir('  mandar outro e-mail (ou "diretoria", ou "emailVerificado") dentro do pedido nao muda nada: o CRM so ouviu falar da propria Provada',
      [...new Set(CRM.pedidos.map((p) => p.corpo.email))], ['provada@adm.com']);

    CRM.pedidos.length = 0;
    const dSoSenha = await pedirQuadros(sSoSenha, { email: 'provada@adm.com', emailVerificado: true });
    conferir('conta so com senha (e-mail nao provado): o CRM NAO recebe pedido nenhum, mesmo ela dizendo que o e-mail e de outra pessoa',
      [CRM.pedidos.length, dSoSenha.setores, /Entre uma vez com o Google da ADM/.test(dSoSenha.indisponivel)], [0, [], true]);

    // 2) uma pessoa nunca ve o quadro de outra
    const dColab = await pedirQuadros(sColab);
    conferir('o Colab recebe so o quadro de Gente e Gestao', [nomesDosSetores(dColab), dColab.atual], [['Gente e Gestão'], 'crm:' + Q_GG]);
    const dColabForja = await pedirQuadros(sColab, { quadro: 'crm:' + Q_COM });
    conferir('  e pedir o do Comercial pelo socket (chave forjada) devolve o dele - sem uma palavra do outro',
      [dColabForja.atual, JSON.stringify(dColabForja).includes('SECRETO')], ['crm:' + Q_GG, false]);
    const dDiretoria = await pedirQuadros(sDiretoria);
    conferir('a Diretoria da sede (isAdmin) recebe o que o CRM libera pra ela - e o CRM libera tudo (gestor)', nomesDosSetores(dDiretoria), ['Comercial', 'Gente e Gestão', 'Marketing']);
    const dBloqueada = await pedirQuadros(sBloqueada);
    conferir('a Bloqueada (o CRM diz 403): a aba mostra a frase do CRM', [dBloqueada.setores, /não tem acesso ao CRM/.test(dBloqueada.indisponivel)], [[], true]);

    // pedidos malformados nao derrubam nada
    const lixo = [null, 'texto', 42, [], { quadro: 42 }, { quadro: { a: 1 } }, { quadro: 'crm:' + 'x'.repeat(5000) }, { forcar: 'sim' }, { quadro: '__proto__' }];
    for (const l of lixo) await pedirQuadros(sColab, l);
    conferir('pedido malformado recebe o quadro padrao e a sede segue de pe',
      [(await fetch(BASE + '/api/saude')).ok, (await pedirQuadros(sColab)).atual], [true, 'crm:' + Q_GG]);

    // o diagnostico
    const diag = await fetch(BASE + '/api/diagnostico').then((r) => r.text());
    const diagJson = JSON.parse(diag);
    conferir('o diagnostico publico diz "kanban: ligado" - e nao deixa vazar a chave nem o endereco do CRM',
      [diagJson.integracoes.kanban, diagJson.integracoes.trello, diag.includes(CHAVE), diag.includes(crm.url)], [true, false, false, false]);

    [sProvada, sColab, sSoSenha, sBloqueada, sDiretoria].forEach((s) => s.fechar());
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    if (servidorDaSede && !servidorDaSede.killed) servidorDaSede.kill();
    for (const s of [crm.servidor, trelloFalso.servidor]) {
      s.close();
      if (s.closeAllConnections) s.closeAllConnections();
    }
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
