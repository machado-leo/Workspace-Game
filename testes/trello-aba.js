// A aba do Trello no navegador (public/js/trello.js), com um DOM de mentira: o
// que ela PEDE ao servidor e o que faz com o que volta.
//
// O servidor (server/trello.js) tem o teste dele, em trello.js. Aqui ficam as
// coisas que so a tela decide e que quebram calado:
//   - qual setor pedir (o lembrado, o que a pessoa clicou);
//   - a resposta de um setor que a pessoa ja largou NAO pode ir por cima do que ela
//     escolheu depois (dois cliques seguidos, a resposta do primeiro chega por ultimo);
//   - mas o setor que o servidor nem lista mais nao pode prender a aba em
//     "Carregando..." pra sempre;
//   - "Atualizar" pede `forcar`;
//   - nada do Trello entra na tela como HTML (nome de cartao e texto de terceiros).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const bate = JSON.stringify(veio) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio)));
  bate ? ok++ : falhou++;
}

const CODIGO = fs.readFileSync(path.join(__dirname, '../public/js/trello.js'), 'utf8');

// ---------------------------------------------------------------- DOM de mentira
function novoElemento() {
  const el = {
    filhos: [], classes: new Set(), atributos: {}, style: {}, ouvintes: {},
    href: '', title: '', target: '', rel: '', type: '', _texto: '',
  };
  el.classList = {
    add: (...c) => c.forEach((x) => el.classes.add(x)),
    remove: (...c) => c.forEach((x) => el.classes.delete(x)),
    toggle: (c, liga) => {
      const vai = liga === undefined ? !el.classes.has(c) : !!liga;
      vai ? el.classes.add(c) : el.classes.delete(c);
      return vai;
    },
    contains: (c) => el.classes.has(c),
  };
  Object.defineProperty(el, 'className', {
    get: () => [...el.classes].join(' '),
    set: (v) => { el.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  // innerHTML so pode ser usado pra LIMPAR: qualquer HTML de verdade e um erro
  Object.defineProperty(el, 'innerHTML', {
    get: () => '',
    set: (v) => { if (v !== '') el.html = v; el.filhos = []; },
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._texto,
    set: (v) => { el._texto = String(v); el.filhos = []; },
  });
  Object.defineProperty(el, 'childNodes', { get: () => el.filhos });
  el.appendChild = (f) => { el.filhos.push(f); return f; };
  el.setAttribute = (k, v) => { el.atributos[k] = v; };
  el.addEventListener = (tipo, fn) => { (el.ouvintes[tipo] = el.ouvintes[tipo] || []).push(fn); };
  el.clicar = () => (el.ouvintes.click || []).forEach((fn) => fn());
  return el;
}

const IDS = ['painel-trello', 'trello-colunas', 'trello-titulo', 'trello-link', 'trello-aviso',
  'trello-setores', 'trello-nota', 'btn-trello', 'btn-fechar-trello', 'btn-atualizar-trello'];

// Uma aba nova, com o que o navegador guardou (`guardado`) e o servidor de mentira.
function abrirAba(guardado) {
  const elementos = {};
  IDS.forEach((id) => { elementos[id] = novoElemento(); });
  // o HTML de verdade comeca com estes escondidos
  ['painel-trello', 'trello-setores', 'trello-nota', 'trello-link'].forEach((id) => elementos[id].classes.add('oculto'));

  const pedidos = [];
  const ouvintes = {};
  const armazem = new Map(Object.entries(guardado || {}));
  const contexto = {
    console,
    window: {},
    document: {
      getElementById: (id) => elementos[id],
      createElement: () => novoElemento(),
    },
    Network: {
      on: (nome, fn) => { ouvintes[nome] = fn; },
      pedirTrello: (opcoes) => pedidos.push(JSON.parse(JSON.stringify(opcoes))),
    },
    localStorage: {
      getItem: (k) => (armazem.has(k) ? armazem.get(k) : null),
      setItem: (k, v) => { armazem.set(k, String(v)); },
    },
  };
  vm.createContext(contexto);
  vm.runInContext(CODIGO, contexto);
  contexto.window.Trello.init();

  return {
    el: elementos,
    pedidos,
    armazem,
    abrir: () => elementos['btn-trello'].clicar(),
    // o servidor responde
    chega: (dados) => ouvintes.trello(dados),
    // os botoes de setor que estao na tela, pelo nome
    botoes: () => elementos['trello-setores'].filhos,
    botao: (nome) => elementos['trello-setores'].filhos.find((b) => b.textContent === nome),
    nomesDasColunas: () => elementos['trello-colunas'].filhos
      .map((c) => c.filhos[0] && c.filhos[0].filhos[0] && c.filhos[0].filhos[0].textContent),
  };
}

// O que o servidor manda (o formato de server/trello.js `obter`)
const SETORES = [
  { chave: 'comercial', nome: 'Comercial', restrito: false },
  { chave: 'marketing', nome: 'Marketing', restrito: false },
  { chave: 'direx', nome: 'Direx', restrito: true },
];
function resposta(atual, extra) {
  const setor = SETORES.find((s) => s.chave === atual);
  return Object.assign({
    setores: SETORES, atual, nome: setor.nome, url: 'https://trello.com/b/' + atual,
    atualizadoEm: 1_800_000_000_000,
    listas: [{ id: 'l-' + atual, nome: 'Lista do ' + setor.nome, cartoes: [] }],
  }, extra);
}

console.log('\nABA DO TRELLO (no navegador)');

// ------------------------------------------------------------ o que pede
{
  const a = abrirAba();
  a.abrir();
  conferir('abrir a aba pede o quadro; sem nada lembrado, nao escolhe setor (o servidor escolhe)',
    a.pedidos, [{}]);
  conferir('  o painel abre e mostra "Carregando" enquanto espera',
    [a.el['painel-trello'].classes.has('oculto'), a.el['trello-aviso'].textContent, a.el['trello-aviso'].classes.has('oculto')],
    [false, 'Carregando o quadro...', false]);

  a.chega(resposta('comercial'));
  conferir('chegou: mostra o setor, o titulo e a coluna do quadro',
    [a.el['trello-titulo'].textContent, a.nomesDasColunas(), a.el['trello-aviso'].classes.has('oculto')],
    ['Comercial', ['Lista do Comercial'], true]);
  conferir('  um botao por setor, e o do setor atual e o ativo',
    [a.botoes().map((b) => b.textContent), a.botoes().map((b) => b.classes.has('ativo'))],
    [['Comercial', 'Marketing', 'Direx'], [true, false, false]]);
  conferir('  o quadro so da diretoria vem marcado (o cadeado)',
    a.botoes().map((b) => b.classes.has('restrito')), [false, false, true]);
  conferir('  o botao do setor atual diz isso pra quem usa leitor de tela',
    a.botoes().map((b) => b.atributos['aria-selected']), ['true', 'false', 'false']);
  conferir('  o link "Abrir no Trello" aparece, apontando pro quadro do setor',
    [a.el['trello-link'].classes.has('oculto'), a.el['trello-link'].href], [false, 'https://trello.com/b/comercial']);
  conferir('  o setor fica lembrado neste navegador', a.armazem.get('sede:trello-setor'), 'comercial');
  conferir('  e o "atualizado as" aparece', /^atualizado as \d\d:\d\d$/.test(a.el['trello-nota'].textContent), true);
}

{
  const a = abrirAba({ 'sede:trello-setor': 'marketing' });
  a.abrir();
  conferir('o setor lembrado e o que se pede ao abrir de novo', a.pedidos, [{ quadro: 'marketing' }]);
}

{
  const a = abrirAba();
  a.abrir();
  a.chega(resposta('comercial'));
  a.botao('Marketing').clicar();
  conferir('clicar noutro setor pede aquele setor',
    a.pedidos[a.pedidos.length - 1], { quadro: 'marketing' });
  conferir('  e enquanto espera diz de qual setor e (e a coluna do outro sai da tela)',
    [a.el['trello-aviso'].textContent, a.nomesDasColunas()], ['Carregando o quadro de Marketing...', []]);
  a.chega(resposta('marketing'));
  conferir('  a resposta troca o quadro e o botao ativo',
    [a.el['trello-titulo'].textContent, a.botoes().map((b) => b.classes.has('ativo'))],
    ['Marketing', [false, true, false]]);
  a.botao('Marketing').clicar();
  conferir('clicar no setor que ja esta na tela nao pede de novo', a.pedidos.length, 2);

  a.el['btn-atualizar-trello'].clicar();
  conferir('"Atualizar" pede o quadro que esta na tela E manda forcar (passa por cima do cache do servidor)',
    a.pedidos[a.pedidos.length - 1], { quadro: 'marketing', forcar: true });
  conferir('  e o clique seguinte em "Atualizar" tambem',
    (a.el['btn-atualizar-trello'].clicar(), a.pedidos[a.pedidos.length - 1]), { quadro: 'marketing', forcar: true });
  conferir('  mas abrir e fechar a aba nao forca (so o botao)',
    (a.el['btn-fechar-trello'].clicar(), a.abrir(), a.pedidos[a.pedidos.length - 1]), { quadro: 'marketing' });
}

// -------------------------------------------- resposta fora de hora
{
  const a = abrirAba();
  a.abrir();
  a.chega(resposta('comercial'));

  // A pessoa clica no Marketing e, sem esperar, na Direx. A do Marketing demora
  // mais e chega DEPOIS da da Direx (ou antes: os dois casos).
  a.botao('Marketing').clicar();
  a.botao('Direx').clicar();
  conferir('dois cliques seguidos: o ultimo e o que vale', a.pedidos.slice(-2), [{ quadro: 'marketing' }, { quadro: 'direx' }]);

  a.chega(resposta('marketing'));
  conferir('a resposta do Marketing chega primeiro: nao aparece (a pessoa ja esta na Direx)',
    [a.el['trello-titulo'].textContent, a.nomesDasColunas(), a.el['trello-aviso'].textContent],
    ['Comercial', [], 'Carregando o quadro de Direx...']);

  a.chega(resposta('direx'));
  conferir('a da Direx chega: e a que aparece',
    [a.el['trello-titulo'].textContent, a.nomesDasColunas(), a.botoes().map((b) => b.classes.has('ativo'))],
    ['Direx', ['Lista do Direx'], [false, false, true]]);

  a.chega(resposta('marketing'));
  conferir('a do Marketing chega DEPOIS da Direx: continua a Direx (nao volta pro que a pessoa largou)',
    [a.el['trello-titulo'].textContent, a.nomesDasColunas(), a.armazem.get('sede:trello-setor')],
    ['Direx', ['Lista do Direx'], 'direx']);
}

// ------------------------- o setor que o servidor nao lista mais nao trava a aba
{
  const a = abrirAba({ 'sede:trello-setor': 'direx' });
  a.abrir();
  a.chega(resposta('direx'));
  conferir('(comeco: a pessoa esta na Direx)', a.el['trello-titulo'].textContent, 'Direx');

  // A diretoria tirou o quadro da Direx (ou a pessoa deixou de ser da diretoria):
  // o servidor responde com o primeiro setor que ela pode ver, sem a Direx na lista.
  const semDirex = [SETORES[0], SETORES[1]];
  a.botao('Direx').clicar();
  a.chega(Object.assign(resposta('comercial'), { setores: semDirex }));
  conferir('o setor pedido nao existe mais: mostra o que o servidor mandou, em vez de ficar em "Carregando..." pra sempre',
    [a.el['trello-titulo'].textContent, a.nomesDasColunas(), a.el['trello-aviso'].classes.has('oculto')],
    ['Comercial', ['Lista do Comercial'], true]);
  conferir('  a lista de botoes acompanha o servidor (a Direx saiu)', a.botoes().map((b) => b.textContent), ['Comercial', 'Marketing']);
  conferir('  e o lembrado deixa de ser a Direx', a.armazem.get('sede:trello-setor'), 'comercial');
}

// ---------------------------------------------- um setor so, ou nenhum
{
  const a = abrirAba();
  a.abrir();
  a.chega({ setores: [SETORES[0]], atual: 'comercial', nome: 'Comercial', url: 'u', listas: [{ id: '1', nome: 'A fazer', cartoes: [] }] });
  conferir('com um setor so nao ha o que escolher: os botoes nem aparecem',
    a.el['trello-setores'].classes.has('oculto'), true);
}
{
  const a = abrirAba();
  a.abrir();
  a.chega({ setores: [], listas: [], indisponivel: 'Trello nao configurado (falta TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_QUADROS).' });
  conferir('Trello sem configurar: o aviso do servidor aparece, sem botoes nem link',
    [a.el['trello-aviso'].textContent.slice(0, 22), a.el['trello-aviso'].classes.has('oculto'),
      a.el['trello-setores'].classes.has('oculto'), a.el['trello-link'].classes.has('oculto')],
    ['Trello nao configurado', false, true, true]);
}
{
  const a = abrirAba();
  a.abrir();
  a.chega(resposta('comercial', { listas: [], nome: 'Comercial' }));
  conferir('quadro sem nenhuma lista aberta diz isso (nao fica uma tela em branco)',
    a.el['trello-colunas'].filhos.map((f) => f.textContent), ['Esse quadro nao tem listas abertas.']);
}
{
  const a = abrirAba();
  a.abrir();
  a.chega(resposta('comercial', { filtro: ['Marketing', 'Gente'] }));
  conferir('setor que divide o quadro avisa qual etiqueta esta valendo',
    a.el['trello-nota'].textContent.includes('so cartoes com a etiqueta Marketing, Gente'), true);
}
{
  const a = abrirAba();
  a.abrir();
  a.chega(resposta('comercial', { indisponivel: 'Mostrando o ultimo quadro que deu certo. O Trello demorou demais pra responder.' }));
  conferir('quadro velho (o Trello caiu depois de dar certo): mostra o aviso E o quadro',
    [a.el['trello-aviso'].classes.has('oculto'), a.el['trello-aviso'].textContent.slice(0, 26), a.nomesDasColunas()],
    [false, 'Mostrando o ultimo quadro ', ['Lista do Comercial']]);
}

// O setor que falha ao abrir nao pode herdar o link do quadro do setor anterior
{
  const a = abrirAba();
  a.abrir();
  a.chega(resposta('comercial'));
  a.botao('Marketing').clicar();
  a.chega({
    setores: SETORES, atual: 'marketing', nome: 'Marketing', listas: [],
    indisponivel: 'A conta dona do token nao enxerga o quadro "Marketing": ou o codigo esta errado, ou falta convidar essa conta pra ele no Trello.',
  });
  conferir('setor que falhou mostra o aviso e NAO herda o "Abrir no Trello" do setor anterior',
    [a.el['trello-titulo'].textContent, a.el['trello-link'].classes.has('oculto'), a.el['trello-aviso'].classes.has('oculto')],
    ['Marketing', true, false]);
}

// ------------------------------------------------- o Kanban do CRM (a origem "crm")
console.log('\nABA DE QUADROS: O KANBAN DO CRM');
{
  const a = abrirAba();
  a.abrir();
  a.chega({
    setores: [
      { chave: 'crm:1', nome: 'Gente e Gestão', restrito: false, origem: 'crm' },
      { chave: 'antigo', nome: 'Quadro Antigo', restrito: true, origem: 'trello' },
    ],
    atual: 'crm:1', origem: 'crm', nome: 'Gente e Gestão', url: 'https://crm.exemplo.com.br/kanban?quadro=1',
    atualizadoEm: 1_800_000_000_000, listas: [],
  });
  conferir('o link do quadro do CRM diz "Abrir no CRM"', [a.el['trello-link'].textContent, a.el['trello-link'].href], ['Abrir no CRM', 'https://crm.exemplo.com.br/kanban?quadro=1']);
  conferir('  a nota diz de onde vem o quadro', /^Kanban do CRM · atualizado as \d\d:\d\d$/.test(a.el['trello-nota'].textContent), true);
  conferir('  cada botao diz a origem (e o do Trello restrito diz que so a diretoria ve)',
    a.botoes().map((b) => b.title), ['Kanban do CRM', 'Quadro do Trello - so a diretoria ve este quadro']);
  a.chega(resposta('comercial', { origem: 'trello' }));
  conferir('o quadro do Trello continua dizendo "Abrir no Trello", e a nota "Trello"',
    [a.el['trello-link'].textContent, /^Trello · atualizado as/.test(a.el['trello-nota'].textContent)], ['Abrir no Trello', true]);
}

// os selinhos do cartao
{
  const a = abrirAba();
  a.abrir();
  const cartao = (nome, extra) => Object.assign({
    id: nome, nome, url: 'https://crm.exemplo.com.br/kanban?quadro=1&cartao=' + nome,
    etiquetas: [], membros: [], prazo: null, prazoConcluido: false,
    temDescricao: false, checklist: null, comentarios: 0, anexos: 0,
  }, extra);
  a.chega(resposta('comercial', {
    origem: 'crm',
    listas: [{
      id: 'l', nome: 'A fazer', total: 3, cartoes: [
        cartao('cheio', { temDescricao: true, checklist: { feitos: 2, total: 5 }, comentarios: 3, anexos: 1 }),
        cartao('completo', { checklist: { feitos: 4, total: 4 }, comentarios: 1, anexos: 2 }),
        cartao('simples', {}),
      ],
    }],
  }));
  const cartoes = a.el['trello-colunas'].filhos[0].filhos[1].filhos;
  const selos = (c) => (c.filhos[c.filhos.length - 1].filhos || []).filter((s) => /trello-selo/.test(s.className)).map((s) => [s.textContent, s.title, s.classes.has('completo')]);
  conferir('cartao com tudo: descricao, checklist (2 de 5), comentarios e anexos - com a dica de cada um',
    selos(cartoes[0]), [['≡', 'Tem descricao', false], ['✓ 2/5', 'Checklist: 2 de 5 itens', false], ['💬 3', '3 comentarios', false], ['📎 1', '1 anexo', false]]);
  conferir('  checklist toda feita fica marcada como completa; um comentario e um anexo, no singular',
    selos(cartoes[1]), [['✓ 4/4', 'Checklist: 4 de 4 itens', true], ['💬 1', '1 comentario', false], ['📎 2', '2 anexos', false]]);
  conferir('  cartao simples: nenhum selinho (nem rodape vazio)', [cartoes[2].filhos.length, cartoes[2].filhos.some((f) => f.className === 'trello-cartao-rodape')], [1, false]);
  conferir('  o cartao leva ao cartao no CRM', cartoes[0].href, 'https://crm.exemplo.com.br/kanban?quadro=1&cartao=cheio');
}

// coluna grande: a tela recebe so os primeiros
{
  const a = abrirAba();
  a.abrir();
  const cartao = (n) => ({ id: 'c' + n, nome: 'Cartao ' + n, url: 'u', etiquetas: [], membros: [], prazo: null, prazoConcluido: false });
  a.chega(resposta('comercial', {
    origem: 'crm', url: 'https://crm.exemplo.com.br/kanban?quadro=1',
    listas: [
      { id: 'g', nome: 'Concluido', total: 250, cartoes: [cartao(1), cartao(2)] },
      { id: 'p', nome: 'A fazer', total: 1, cartoes: [cartao(3)] },
    ],
  }));
  const colunas = a.el['trello-colunas'].filhos;
  const contagem = (c) => c.filhos[0].filhos[1].textContent;
  const mais = (c) => c.filhos[1].filhos.filter((f) => f.className === 'trello-mais').map((f) => [f.textContent, f.href]);
  conferir('coluna com 250 cartoes recebidos so 2: o numero do topo e o total (250), nao 2', [contagem(colunas[0]), contagem(colunas[1])], ['250', '1']);
  conferir('  e um link diz quantos ficaram de fora e leva ao quadro; coluna completa nao tem esse link',
    [mais(colunas[0]), mais(colunas[1])], [[['+ 248 cartoes no quadro', 'https://crm.exemplo.com.br/kanban?quadro=1']], []]);
}

// o prazo do CRM e um DIA
{
  // O fuso do Brasil (UTC-3) e onde o erro aparecia: "2026-09-25" lido como instante (meia-noite
  // em UTC) virava 21h do dia 24. Vale pra qualquer fuso; aqui fixa o do Brasil.
  process.env.TZ = 'America/Fortaleza';
  const a = abrirAba();
  a.abrir();
  const doisDigitos = (n) => String(n).padStart(2, '0');
  const dia = (deslocamento) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + deslocamento);
    return { iso: d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate()), rotulo: doisDigitos(d.getDate()) + '/' + doisDigitos(d.getMonth() + 1) };
  };
  const cartao = (nome, prazo, concluido) => ({ id: nome, nome, url: 'u', etiquetas: [], membros: [], prazo, prazoConcluido: !!concluido });
  const ontem = dia(-1);
  const hoje = dia(0);
  const amanha = dia(1);
  const daqui5 = dia(5);
  a.chega(resposta('comercial', {
    origem: 'crm',
    listas: [{ id: 'l', nome: 'Prazos', total: 6, cartoes: [
      cartao('ontem', ontem.iso), cartao('hoje', hoje.iso), cartao('amanha', amanha.iso), cartao('daqui5', daqui5.iso),
      cartao('feito', ontem.iso, true), cartao('fixo', '2020-01-25'),
    ] }],
  }));
  const cartoes = a.el['trello-colunas'].filhos[0].filhos[1].filhos;
  const prazoDe = (c) => { const p = c.filhos[c.filhos.length - 1].filhos[0]; return [p.textContent, p.className]; };
  conferir('prazo de ontem: a data, "(atrasado)" e vermelho', prazoDe(cartoes[0]), [ontem.rotulo + ' (atrasado)', 'trello-prazo atrasado']);
  conferir('  prazo de hoje: "hoje", e AINDA nao atrasado (so atrasa depois que o dia termina)', prazoDe(cartoes[1]), ['hoje', 'trello-prazo']);
  conferir('  prazo de amanha: "amanha"', prazoDe(cartoes[2]), ['amanha', 'trello-prazo']);
  conferir('  prazo daqui a 5 dias: a data', prazoDe(cartoes[3]), [daqui5.rotulo, 'trello-prazo']);
  conferir('  prazo vencido mas concluido: verde, sem "atrasado"', prazoDe(cartoes[4]), [ontem.rotulo, 'trello-prazo concluido']);
  // Data fixa sempre no PASSADO: uma data fixa perto de hoje apodrece com o calendario - o
  // "2026-09-25" que estava aqui virou "amanha" no dia 24/09 e derrubou a bateria.
  conferir('  o dia 25 continua sendo o dia 25 no fuso do Brasil (nao vira 24 as 21h)', prazoDe(cartoes[5]), ['25/01 (atrasado)', 'trello-prazo atrasado']);
}

// ------------------------------------------------------- texto de terceiros
{
  const a = abrirAba();
  a.abrir();
  const maldade = '<img src=x onerror=alert(1)>';
  a.chega(resposta('comercial', {
    nome: maldade,
    listas: [{
      id: 'l', nome: maldade,
      cartoes: [{
        id: 'c', nome: maldade, url: 'https://trello.com/c/x',
        etiquetas: [{ nome: maldade, cor: 'red' }], membros: [maldade], prazo: null, prazoConcluido: false,
      }],
    }],
  }));
  const todos = [];
  (function andar(el) { todos.push(el); (el.filhos || []).forEach(andar); })(a.el['trello-colunas']);
  todos.push(a.el['trello-titulo'], a.el['trello-setores'], a.el['trello-nota'], a.el['trello-aviso']);
  conferir('nome de cartao, lista, etiqueta e membro entram como TEXTO (nunca innerHTML)',
    todos.filter((el) => el.html !== undefined).length, 0);
  conferir('  o titulo tambem e texto', a.el['trello-titulo'].textContent, maldade);
}

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
