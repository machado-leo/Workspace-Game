// Lembrete das reunioes da sede (public/js/lembretes.js): quem e lembrado, e
// quando. As duas regras sao puras e saem expostas em `window.Lembretes`.
//
// O caso que fez isto existir: marcar uma reuniao da sede pra daqui a 3 minutos e
// nenhum aviso aparecer (o "comeca em 5 minutos" so existia pros compromissos do
// Google, e dentro da Agenda - que fica fechada).
//
// A parte de tela (o aviso, o botao, o sino no cartao) foi conferida no navegador;
// aqui ficam as regras, que sao o que quebra calado.
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

const contexto = { console, window: {}, document: {}, setInterval: () => 0 };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/lembretes.js'), 'utf8'), contexto);
const L = contexto.window.Lembretes;

const MIN = 60 * 1000;
const AGORA = 1_800_000_000_000;
const eu = 'u-eu';
const reuniao = (extra) => Object.assign({
  id: 1, titulo: 'Alinhamento', criadaEm: 1000, criadaPorUid: eu,
  inicio: AGORA + 4 * MIN, fim: AGORA + 64 * MIN,
}, extra);
const decidir = (reunioes, extra) => L._decidir(Object.assign({
  reunioes, agora: AGORA, meuUid: eu, escolhas: {}, vistos: {},
}, extra));

console.log('\nLEMBRETE DE REUNIAO DA SEDE');

// ------------------------------------------------------------ quem e lembrado
conferir('quem MARCOU a reuniao e lembrado, sem fazer nada', decidir([reuniao()]).length, 1);
conferir('quem so ve a reuniao na agenda NAO e (senao a sede inteira apitava a cada reuniao)',
  decidir([reuniao({ criadaPorUid: 'u-outro' })]).length, 0);
conferir('quem ligou o sino e lembrado, mesmo sem ter marcado',
  decidir([reuniao({ criadaPorUid: 'u-outro' })], { escolhas: { '1:1000': true } }).length, 1);
conferir('quem marcou pode DESLIGAR (a escolha da pessoa ganha)',
  decidir([reuniao()], { escolhas: { '1:1000': false } }).length, 0);
conferir('sem saber quem eu sou (ainda conectando), ninguem e lembrado',
  decidir([reuniao()], { meuUid: null }).length, 0);

// Reuniao gravada antes de existir o "quem marcou" (sem criadaPorUid) nao pode casar
// com "eu nao sei quem sou": undefined === undefined seria "todo mundo e lembrado".
conferir('reuniao sem "quem marcou" nao lembra ninguem por acaso (undefined nao e igual a undefined)',
  decidir([reuniao({ criadaPorUid: undefined })], { meuUid: undefined }).length, 0);

// A escolha e da reuniao, nao do numero: o id volta a 1 se o disco do servidor apagar
conferir('escolha de uma reuniao antiga nao vale pra outra que herdou o mesmo numero',
  decidir([reuniao({ criadaPorUid: 'u-outro', criadaEm: 2000 })], { escolhas: { '1:1000': true } }).length, 0);
conferir('  a chave mistura o id e o momento em que foi criada', L._chaveDe(reuniao()), '1:1000');

// ------------------------------------------------------------------- quando
const em = (faltamMs) => decidir([reuniao({ inicio: AGORA + faltamMs, fim: AGORA + faltamMs + 60 * MIN })]);
conferir('faltando 10 minutos: ainda nao', em(10 * MIN).length, 0);
conferir('faltando 5 min + 1 ms: ainda nao', em(5 * MIN + 1).length, 0);
conferir('faltando exatamente 5 minutos: avisa', em(5 * MIN).map((i) => i.tipo), ['antes']);
conferir('faltando 1 ms: ainda e o "antes"', em(1).map((i) => i.tipo), ['antes']);
conferir('na hora: e o "comecou"', em(0).map((i) => i.tipo), ['inicio']);
conferir('1 minuto depois do comeco: ainda "comecou"', em(-1 * MIN).map((i) => i.tipo), ['inicio']);
conferir('2 minutos e 1 ms depois: "comecou agora" ja nao e verdade',
  em(-(2 * MIN + 1)).length, 0);
conferir('  o limite da tolerancia (exatamente 2 min) tambem ja passou', em(-2 * MIN).length, 0);
conferir('a faltar 3 minutos diz quanto falta', em(3 * MIN)[0].faltamMs, 3 * MIN);
conferir('reuniao que ja acabou nunca avisa',
  decidir([reuniao({ inicio: AGORA - 90 * MIN, fim: AGORA - 30 * MIN })]).length, 0);

// ------------------------------------------------------------- so uma vez
const primeira = decidir([reuniao()]);
conferir('cada aviso tem a sua chave (antes e inicio sao dois)',
  [primeira[0].chave, decidir([reuniao({ inicio: AGORA - MIN })])[0].chave], ['1:1000:antes', '1:1000:inicio']);
conferir('ja visto nesta aba: nao repete (recarregar no meio nao avisa de novo)',
  decidir([reuniao()], { vistos: { '1:1000:antes': true } }).length, 0);
conferir('  mas o "comecou" e outro aviso, e vem',
  decidir([reuniao({ inicio: AGORA - MIN })], { vistos: { '1:1000:antes': true } }).length, 1);

// -------------------------------------------------------- varias reunioes
const varias = decidir([
  reuniao({ id: 1 }),
  reuniao({ id: 2, criadaEm: 1001, inicio: AGORA + 4 * MIN }),
  reuniao({ id: 3, criadaEm: 1002, criadaPorUid: 'u-outro' }),
  reuniao({ id: 4, criadaEm: 1003, inicio: AGORA + 30 * MIN, fim: AGORA + 90 * MIN }),
]);
conferir('varias ao mesmo tempo: cada uma que cabe, e so as lembradas e na janela',
  varias.map((i) => i.reuniao.id), [1, 2]);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
