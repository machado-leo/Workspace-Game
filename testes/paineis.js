// Um painel do trilho por vez (public/js/paineis.js).
//
// O defeito que fez isto existir: com o chat aberto, clicar na Agenda abria a agenda
// por cima e deixava o chat aberto por baixo (no celular, a agenda abria ATRAS do
// chat e o botao parecia nao funcionar), e o botao marcado no trilho continuava o do
// primeiro painel.
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

// ------------------------------------------------------------ DOM de mentira
function botao() {
  const classes = new Set();
  const atributos = {};
  return {
    classes, atributos,
    classList: { toggle: (c, liga) => { liga ? classes.add(c) : classes.delete(c); } },
    setAttribute: (k, v) => { atributos[k] = v; },
  };
}
const botoes = { 'btn-a': botao(), 'btn-b': botao(), 'btn-c': botao() };
let tecla = null;
const contexto = {
  window: { addEventListener: (tipo, fn) => { if (tipo === 'keydown') tecla = fn; } },
  document: { getElementById: (id) => botoes[id] || null, activeElement: null },
};
contexto.window.document = contexto.document;
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/paineis.js'), 'utf8'), contexto);
const P = contexto.window.Paineis;

// Tres paineis de mentira, que fazem o que os de verdade fazem: fechar avisa.
const fechados = [];
function painel(nome, botaoId, esc) {
  const p = { aberto: false };
  p.abrir = () => { p.aberto = true; P.abriu(nome); };
  p.fechar = () => { p.aberto = false; fechados.push(nome); P.fechou(nome); };
  P.registrar(nome, { fechar: p.fechar, botao: botaoId, esc });
  return p;
}
const a = painel('chat', 'btn-a', true);
const b = painel('agenda', 'btn-b', true);
const c = painel('estante', 'btn-c', false);
const ativos = () => Object.keys(botoes).filter((k) => botoes[k].classes.has('ativo'));
const esc = (extra) => tecla(Object.assign({ key: 'Escape', defaultPrevented: false }, extra));

console.log('\nUM PAINEL DO TRILHO POR VEZ');

a.abrir();
conferir('abrir o chat: ele e o painel da frente, e o botao dele fica marcado', [P.atual(), ativos()], ['chat', ['btn-a']]);
conferir('  e o botao diz isso pra quem usa leitor de tela', botoes['btn-a'].atributos['aria-pressed'], 'true');

b.abrir();
conferir('com o chat aberto, abrir a agenda FECHA o chat (o defeito era ficar os dois)', [a.aberto, b.aberto, fechados], [false, true, ['chat']]);
conferir('  e o botao marcado passa a ser o da agenda', [P.atual(), ativos(), botoes['btn-a'].atributos['aria-pressed']], ['agenda', ['btn-b'], 'false']);

b.abrir();
conferir('abrir de novo o que ja esta aberto nao fecha ele mesmo', [b.aberto, fechados], [true, ['chat']]);

b.fechar();
conferir('fechar o painel da frente: nenhum aberto, nenhum botao marcado', [P.atual(), ativos()], [null, []]);

// ----------------------------------------------------------------- Esc
fechados.length = 0;
a.abrir();
esc();
conferir('Esc fecha o painel da frente (o chat pede Esc)', [a.aberto, fechados, P.atual()], [false, ['chat'], null]);

c.abrir();
esc();
conferir('Esc NAO fecha a estante (ela tem o Esc dela, que primeiro limpa a busca)', [c.aberto, P.atual()], [true, 'estante']);
c.fechar();

a.abrir();
contexto.document.activeElement = { tagName: 'TEXTAREA', value: 'estou escrevendo' };
esc();
conferir('Esc com texto num campo nao fecha nada (a pessoa esta no meio de uma frase)', a.aberto, true);
contexto.document.activeElement = { tagName: 'INPUT', value: '   ' };
esc();
conferir('  campo so com espacos conta como vazio: fecha', a.aberto, false);
contexto.document.activeElement = null;

a.abrir();
esc({ defaultPrevented: true });
conferir('Esc que outro ja tratou (defaultPrevented) nao fecha', a.aberto, true);
esc({ key: 'Enter' });
conferir('outra tecla nao fecha', a.aberto, true);
a.fechar();
esc();
conferir('Esc sem painel aberto nao quebra nada', P.atual(), null);

// Dois paineis dividindo um botao (o decorador da diretoria acende o "Diretoria").
// O defeito que isto pega: quem era pintado por ultimo apagava o botao do outro.
// O que acende e o registrado ANTES (a estante): e ai que o outro, pintado depois, apagava.
const d1 = painel('decorador-teste', 'btn-c', false);
c.abrir();
conferir('dois paineis com o mesmo botao: com o primeiro aberto, o botao fica aceso', ativos(), ['btn-c']);
d1.abrir();
conferir('  com o segundo aberto tambem', ativos(), ['btn-c']);
d1.fechar();
conferir('  e fechar apaga', ativos(), []);

// -------------------------------------- os paineis de verdade usam o mesmo nome
// Um nome digitado diferente no abriu e no fechou deixaria o botao preso marcado.
console.log('\n  -- os sete paineis de verdade');
const esperados = {
  'chat.js': ['chat', 'btn-chat'], 'calendario.js': ['agenda', 'btn-calendario'], 'trello.js': ['quadros', 'btn-trello'],
  'estante.js': ['estante', 'btn-estante'], 'pessoas.js': ['pessoas', 'btn-pessoas'], 'discador.js': ['discador', 'btn-discador'],
  'decorador.js': ['decorador', 'btn-decorar'], 'diretoria.js': ['diretoria', 'btn-diretoria'],
  'central.js': ['avisos', 'btn-avisos'],
};
// O decorador se registra duas vezes: com o "Decorar" (quem personaliza a mesa) e, pra
// diretoria, de novo com o "Diretoria" - e de la que ela abre o decorador.
const botoesExtras = { 'decorador.js': ['btn-diretoria'] };
for (const [arq, [nome, botaoId]] of Object.entries(esperados)) {
  const t = fs.readFileSync(path.join(__dirname, '../public/js', arq), 'utf8');
  const reg = [...t.matchAll(/Paineis\.registrar\('([^']+)', \{ fechar, botao: '([^']+)'/g)].map((m) => [m[1], m[2]]);
  const abre = [...t.matchAll(/Paineis\.abriu\('([^']+)'\)/g)].map((m) => m[1]);
  const fecha = [...t.matchAll(/Paineis\.fechou\('([^']+)'\)/g)].map((m) => m[1]);
  conferir(arq + ': registra, abre e fecha com o mesmo nome, e com o botao certo',
    [reg, abre, fecha], [[[nome, botaoId]].concat((botoesExtras[arq] || []).map((b) => [nome, b])), [nome], [nome]]);
}
// Todos os sete tem que carregar DEPOIS: quem carrega antes nao acha o Paineis e nao
// se registra (foi o que aconteceu com as salas - o rooms.js vinha antes, e o painel
// de salas ficava aberto por baixo do chat).
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const posPaineis = html.indexOf('<script src="js/paineis.js">');
conferir('o index.html carrega o paineis.js ANTES de todos os paineis',
  Object.keys(esperados).filter((arq) => !(posPaineis > 0 && posPaineis < html.indexOf('<script src="js/' + arq + '">'))), []);

// ------------------------------------------------- o botao "Mais" (celular)
// No celular a barra de baixo nao comporta os 9 botoes: WhatsApp, Discador, Estante e
// Decorar moram num menu "Mais". Um DOM de mentira um pouco maior, so pra isto.
console.log('\n  -- o botao "Mais" do celular');
function elemento() {
  const classes = new Set();
  const atributos = {};
  const ouvintes = {};
  const e = {
    classes, atributos, ouvintes, filhos: [],
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, liga) => { const v = liga === undefined ? !classes.has(c) : !!liga; v ? classes.add(c) : classes.delete(c); return v; },
    },
    setAttribute: (k, v) => { atributos[k] = v; },
    addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    contains: (x) => x === e || e.filhos.includes(x),
    closest: () => null,
    disparar: (tipo, ev) => (ouvintes[tipo] || []).forEach((fn) => fn(ev)),
  };
  return e;
}
const trilho = elemento();
const mais = elemento();
const grupo = elemento();
const bEstante = elemento();
const bChat = elemento();
grupo.filhos.push(bEstante);
bEstante.closest = (sel) => (sel === '.trilho-mais-grupo' ? grupo : null);
const els = { 'btn-mais': mais, 'trilho-mais-grupo': grupo, 'btn-estante': bEstante, 'btn-chat': bChat };
const noDocumento = {};
let teclaCel = null;
const ctx2 = {
  window: { addEventListener: (tipo, fn) => { if (tipo === 'keydown') teclaCel = fn; } },
  document: {
    getElementById: (id) => els[id] || null,
    querySelector: (sel) => (sel === '.trilho' ? trilho : null),
    addEventListener: (tipo, fn) => { (noDocumento[tipo] = noDocumento[tipo] || []).push(fn); },
    activeElement: null,
  },
};
vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/paineis.js'), 'utf8'), ctx2);
const P2 = ctx2.window.Paineis;
const est = { aberto: false };
est.fechar = () => { est.aberto = false; P2.fechou('estante'); };
P2.registrar('estante', { fechar: est.fechar, botao: 'btn-estante', esc: false });
const cht = { aberto: false };
cht.fechar = () => { cht.aberto = false; P2.fechou('chat'); };
P2.registrar('chat', { fechar: cht.fechar, botao: 'btn-chat', esc: true });
const clicarMais = () => mais.disparar('click', { target: mais, stopPropagation() {} });
const cliqueNaTela = (alvo) => (noDocumento.click || []).forEach((fn) => fn({ target: alvo }));
const menuAberto = () => [trilho.classes.has('mais-aberto'), mais.atributos['aria-expanded']];

clicarMais();
conferir('tocar no "Mais" abre o menu (e diz isso pra leitor de tela)', menuAberto(), [true, 'true']);
clicarMais();
conferir('  tocar de novo fecha', menuAberto(), [false, 'false']);
clicarMais();
grupo.disparar('click', { target: bEstante });
conferir('escolher um item do menu fecha o menu', menuAberto(), [false, 'false']);
clicarMais();
cliqueNaTela({});
conferir('tocar fora fecha o menu', menuAberto(), [false, 'false']);
clicarMais();
cliqueNaTela(bEstante);
conferir('  mas tocar DENTRO do menu nao conta como fora', trilho.classes.has('mais-aberto'), true);

cht.aberto = true; P2.abriu('chat');
teclaCel({ key: 'Escape', defaultPrevented: false });
conferir('Esc com o menu aberto fecha SO o menu (o chat atras continua aberto)', [trilho.classes.has('mais-aberto'), cht.aberto], [false, true]);
teclaCel({ key: 'Escape', defaultPrevented: false });
conferir('  o Esc seguinte fecha o chat', cht.aberto, false);

est.aberto = true; P2.abriu('estante');
conferir('painel aberto que mora no "Mais" (a estante): o "Mais" fica marcado', mais.classes.has('ativo'), true);
cht.aberto = true; P2.abriu('chat');
conferir('  painel que fica na barra (o chat): o "Mais" desmarca', [mais.classes.has('ativo'), est.aberto], [false, false]);

const htmlMais = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const trechoGrupo = htmlMais.slice(htmlMais.indexOf('id="trilho-mais-grupo"'), htmlMais.indexOf('id="btn-mais"'));
conferir('no HTML, o grupo do "Mais" tem exatamente WhatsApp, Spotify, Discador, Estante, Diretoria e Decorar',
  [...trechoGrupo.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]), ['btn-whatsapp', 'btn-spotify', 'btn-discador', 'btn-estante', 'btn-diretoria', 'btn-decorar']);
conferir('todo botao do trilho tem nome escrito embaixo do icone',
  [...htmlMais.slice(htmlMais.indexOf('<nav class="trilho">'), htmlMais.indexOf('id="menu-conta"')).matchAll(/<button id="(btn-[^"]+)" class="trilho-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)]
    .filter((m) => !/class="trilho-nome"/.test(m[2])).map((m) => m[1]), []);

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
