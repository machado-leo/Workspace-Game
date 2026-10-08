// Painel Diretoria (public/js/diretoria.js).
//
// As ferramentas da diretoria estavam espalhadas: "Decorar" solto no trilho, "Membros
// da sede" escondido em Conta > Mais opcoes, e a situacao das integracoes so em
// /diagnostico.html. Este arquivo confere a regra da "Situacao da sede", quem ve o
// botao, e que o decorador continua servindo quem so personaliza a propria mesa.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// Elemento de mentira: o bastante pra init() e mostrarPara().
function elemento() {
  const classes = new Set();
  const ouvintes = {};
  return {
    classes, ouvintes, textContent: '', title: '', innerHTML: '', value: '',
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, liga) => { const v = liga === undefined ? !classes.has(c) : !!liga; v ? classes.add(c) : classes.delete(c); return v; },
    },
    addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    setAttribute() {}, appendChild() {}, focus() {},
    clicar() { (ouvintes.click || []).forEach((fn) => fn({ stopPropagation() {} })); },
  };
}
function contexto(extra) {
  const els = {};
  const registros = [];
  const ctx = Object.assign({
    window: {},
    document: {
      getElementById: (id) => (els[id] = els[id] || elemento()),
      createElement: () => elemento(),
      addEventListener() {},
    },
    fetch: () => Promise.reject(new Error('sem rede no teste')),
  }, extra || {});
  ctx.window.Paineis = {
    registrar: (nome, o) => registros.push([nome, o.botao]),
    abriu() {}, fechou() {},
  };
  ctx.Paineis = ctx.window.Paineis;
  vm.createContext(ctx);
  return { ctx, els, registros };
}

// --------------------------------------------------- a situacao da sede
console.log('\nDIRETORIA: A SITUACAO DA SEDE');
const d = contexto();
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/diretoria.js'), 'utf8'), d.ctx);
const D = d.ctx.window.Diretoria;

const tudoLigado = { contas: 12, diretoria: 3, dadosGravavel: true, nodeSuficiente: true, atrasDeProxy: true, ipPorPessoa: true,
  integracoes: { google: true, drive: true, trello: false, kanban: true, turn: true, backup: true, email: true, discador: true } };
const s1 = D._situacao(tudoLigado);
conferir('uma linha por integracao, na ordem do que mais atrapalha', s1.linhas.map((l) => l.chave),
  ['google', 'kanban', 'drive', 'backup', 'email', 'turn', 'discador']);
conferir('  tudo ligado, nenhum alerta', [s1.linhas.every((l) => l.ligado), s1.alertas], [true, []]);
conferir('  e quantas contas, e quantas na diretoria', [s1.contas, s1.diretoria], [12, 3]);
conferir('  o Trello (quadros antigos) so aparece se ainda estiver ligado',
  D._situacao(Object.assign({}, tudoLigado, { integracoes: Object.assign({}, tudoLigado.integracoes, { trello: true }) })).linhas.map((l) => l.chave).pop(), 'trello');

const semNada = D._situacao({ contas: 1, diretoria: 1, dadosGravavel: false, nodeSuficiente: false, atrasDeProxy: true, ipPorPessoa: false, integracoes: {} });
conferir('integracao desligada diz o que falta configurar', semNada.linhas.find((l) => l.chave === 'kanban'),
  { chave: 'kanban', nome: 'Kanban do CRM (Quadros e prazos na Agenda)', ligado: false, falta: 'CRM_URL e CRM_CHAVE_KANBAN' });
conferir('pasta que nao grava, Node antigo e proxy sem IP viram alerta (as falhas silenciosas)', semNada.alertas.length, 3);
conferir('sem resposta do diagnostico: um alerta, nenhuma linha (e nao quebra)', [D._situacao(null).linhas, D._situacao(null).alertas.length], [[], 1]);

// ------------------------------------------------------- quem ve o botao
console.log('\nDIRETORIA: QUEM VE O BOTAO');
D.init();
const btn = d.els['btn-diretoria'];
btn.classes.add('oculto');   // nasce escondido no HTML
D.mostrarPara({ nome: 'Ana', isAdmin: true });
conferir('diretoria: o botao aparece', btn.classes.has('oculto'), false);
D.mostrarPara({ nome: 'Bia', isAdmin: false });
conferir('membro comum: nao aparece', btn.classes.has('oculto'), true);
D.mostrarPara(null);
conferir('  nem sem conta', btn.classes.has('oculto'), true);
conferir('o painel se registra no Paineis com o proprio botao', d.registros, [['diretoria', 'btn-diretoria']]);

// ------------------------------------- o decorador: diretoria x dono de mesa
console.log('\nDIRETORIA: O DECORADOR');
function decorador(ehAdmin) {
  let aoMudarMesa = null;
  const c = contexto({ Game: { aoMudarMinhaMesa: (fn) => { aoMudarMesa = fn; }, soltarFoco() {} }, OfficeMap: {} });
  c.ctx.window.EditorAreas = null;
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/decorador.js'), 'utf8'), c.ctx);
  c.ctx.window.Decorador.init(ehAdmin);
  return { botao: c.els['btn-decorar'], mesa: (tem) => aoMudarMesa(tem), registros: c.registros, D: c.ctx.window.Decorador };
}
const adm = decorador(true);
conferir('diretoria: o "Decorar" sai do trilho (mora no painel Diretoria)', adm.botao.classes.has('oculto'), true);
adm.mesa(true);
conferir('  mesmo tendo mesa', adm.botao.classes.has('oculto'), true);
conferir('  e com o decorador aberto, o botao marcado e o "Diretoria"', adm.registros.pop(), ['decorador', 'btn-diretoria']);
conferir('  o painel Diretoria consegue abrir o decorador', typeof adm.D.abrir, 'function');
const dono = decorador(false);
conferir('membro sem mesa: nao ve o botao', dono.botao.classes.has('oculto'), true);
dono.mesa(true);
conferir('membro com mesa: ve o botao ("Minha mesa"), como antes', dono.botao.classes.has('oculto'), false);
conferir('  e pra ele o botao marcado continua o proprio', dono.registros, [['decorador', 'btn-decorar']]);

// ------------------------------------------------------------ na pagina
console.log('\nDIRETORIA: NA PAGINA');
const html = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
conferir('o botao "Diretoria" nasce escondido', /<button id="btn-diretoria" class="trilho-btn oculto"/.test(html), true);
conferir('"Membros da sede" saiu de Conta > Mais opcoes (mora no painel)', /id="btn-membros"/.test(html), false);
conferir('o painel tem os atalhos e a situacao', ['painel-diretoria', 'dir-decorar', 'dir-membros', 'dir-situacao'].every((id) => html.includes('id="' + id + '"')), true);
const membros = fs.readFileSync(path.join(raiz, 'public/js/membros.js'), 'utf8');
conferir('o membros.js nao procura mais o botao que saiu (senao quebrava no carregamento)', /btn-membros/.test(membros), false);
conferir('  e deixa o painel abrir a lista', /window\.Membros = \{[^}]*abrirMembros/.test(membros), true);
const main = fs.readFileSync(path.join(raiz, 'public/js/main.js'), 'utf8');
conferir('o main.js liga o painel e mostra o botao conforme a conta', [/Diretoria\.init\(\)/.test(main), /Diretoria\.mostrarPara\(usuario\)/.test(main)], [true, true]);

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
