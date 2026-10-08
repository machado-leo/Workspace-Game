// Central de avisos (public/js/central.js).
//
// Os avisos passavam e sumiam: o aceno saia da tela em 20 s, o lembrete de reuniao
// sumia ao fechar, e a mencao so tocava um som. Aqui: a regra (tipo, agrupar,
// limite), a lista guardada por CONTA, e o gancho no Avisos.avisar - o que tocou fica.
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

// Um "navegador": localStorage de mentira (compartilhado entre recargas) e a conta logada.
function navegador(armazem, uid, extra) {
  const ctx = Object.assign({
    window: {},
    localStorage: {
      getItem: (k) => (k in armazem ? armazem[k] : null),
      setItem: (k, v) => { armazem[k] = String(v); },
    },
    Game: { getSelfUid: () => uid, getPlayers: () => new Map() },
    document: { title: 'Sede', hidden: true, hasFocus: () => false, getElementById: () => null, addEventListener() {} },
  }, extra || {});
  ctx.window.Game = ctx.Game;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/central.js'), 'utf8'), ctx);
  return ctx;
}

console.log('\nCENTRAL DE AVISOS: A REGRA');
const C = navegador({}, 'u1').window.Central;
conferir('o tipo sai da etiqueta do aviso',
  ['aceno:abc', 'lembrete-3:1:antes', 'chamada:canal:geral', 'visitante-9', 'proximidade', 'dm:a|b', 'canal:geral', 'x'].map((tag) => C._tipoDe({ tag })),
  ['aceno', 'reuniao', 'chamada', 'visitante', 'proximidade', 'dm', 'mencao', 'outro']);
conferir('  e quem manda o tipo explicito ganha', C._tipoDe({ tag: 'canal:geral', tipo: 'aceno' }), 'aceno');

const a = (tag, titulo, lido) => ({ tag, titulo, lido: !!lido, ts: 0 });
let l = C._acrescentar([], a('dm:a|b', 'Ana'));
l = C._acrescentar(l, a('canal:geral', 'Bia mencionou voce'));
l = C._acrescentar(l, a('dm:a|b', 'Ana'));
conferir('o mais novo vem no topo; a mesma DM nao lida nao empilha, conta as vezes',
  l.map((x) => [x.titulo, x.vezes || 1]), [['Ana', 2], ['Bia mencionou voce', 1]]);
l = C._acrescentar([a('dm:a|b', 'Ana', true)], a('dm:a|b', 'Ana'));
conferir('  mas a que ja foi lida nao junta com a nova (e outra conversa)', l.length, 2);
let muitos = [];
for (let i = 0; i < 60; i++) muitos = C._acrescentar(muitos, a('t' + i, 'aviso ' + i));
conferir('guarda os ultimos 50', [muitos.length, muitos[0].titulo, muitos[49].titulo], [50, 'aviso 59', 'aviso 10']);

const agora = new Date(2026, 8, 24, 15, 0).getTime();
conferir('quando foi: agora, minutos, horas, e data pra mais de um dia',
  [C._quandoFoi(agora - 20000, agora), C._quandoFoi(agora - 5 * 60000, agora), C._quandoFoi(agora - 3 * 3600000, agora), C._quandoFoi(new Date(2026, 8, 22, 9, 5).getTime(), agora)],
  ['agora', 'ha 5 min', 'ha 3 h', '22/09 09:05']);

console.log('\nCENTRAL DE AVISOS: GUARDADA POR CONTA');
const armazem = {};
const n1 = navegador(armazem, 'ana').window.Central;
n1.guardar('Bia acenou pra voce', 'Na sede', { tag: 'aceno:s1', uid: 'bia' });
n1.guardar('Bia esta falando com voce', 'Chegou perto', { tag: 'proximidade' });
n1.guardar('Reuniao X comeca em 5 minutos', 'Reuniao da sede', { tag: 'lembrete-7:1:antes', reuniao: 7 });
conferir('guarda aceno e lembrete, mas nao o "chegou perto" (so vale na hora)', n1._lista().map((x) => x.tipo), ['reuniao', 'aceno']);
conferir('  o lembrete leva a reuniao (o clique entra na chamada), o aceno leva a pessoa',
  [n1._lista()[0].reuniao, n1._lista()[1].uid], [7, 'bia']);
conferir('  e nasce nao lido', n1._lista().every((x) => x.lido === false), true);
const n2 = navegador(armazem, 'ana').window.Central;
n2.guardar('Caio mencionou voce em #geral', 'oi @ana', { tag: 'canal:geral', conversa: 'canal:geral' });
conferir('recarregar a pagina: a lista volta (e o novo entra em cima)', n2._lista().map((x) => x.tipo), ['mencao', 'reuniao', 'aceno']);
const outra = navegador(armazem, 'bia').window.Central;
outra.guardar('Aviso da Bia', '', { tag: 'dm:x|y' });
conferir('outra conta no mesmo navegador nao ve os avisos da Ana', outra._lista().map((x) => x.titulo), ['Aviso da Bia']);
const semConta = navegador({}, null).window.Central;
semConta.guardar('antes de entrar', '', { tag: 'dm:x|y' });
conferir('sem conta ainda (antes do init do servidor), nada e guardado', semConta._lista().length, 0);
const semStorage = navegador({}, 'ana', { localStorage: { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } } }).window.Central;
semStorage.guardar('mesmo assim', '', { tag: 'dm:x|y' });
conferir('navegador sem storage (janela privada): funciona na sessao e nao quebra', semStorage._lista().length, 1);

console.log('\nCENTRAL DE AVISOS: O GANCHO NO AVISOS.AVISAR');
const ctx = navegador({}, 'ana', {
  Chat: { estaVendo: (c) => c === 'canal:social' },
  Notification: undefined,
});
ctx.window.Chat = ctx.Chat;
ctx.Central = ctx.window.Central;
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/avisos.js'), 'utf8'), ctx);
const Av = ctx.window.Avisos;
Av.avisar('Caio', 'me liga', { conversa: 'dm:ana|caio', tag: 'dm:ana|caio' });
conferir('o que o Avisos.avisar toca entra na central', ctx.Central._lista().map((x) => [x.tipo, x.titulo]), [['dm', 'Caio']]);
ctx.document.hidden = false;
ctx.document.hasFocus = () => true;
Av.avisar('Bia mencionou voce em #social', 'oi', { conversa: 'canal:social', tag: 'canal:social' });
conferir('  com a conversa aberta na tela nao entra (a pessoa ja esta vendo)', ctx.Central._lista().length, 1);

console.log('\nCENTRAL DE AVISOS: NA PAGINA');
const html = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
const trilho = html.slice(html.indexOf('<nav class="trilho">'), html.indexOf('id="trilho-mais-grupo"'));
conferir('o botao "Avisos" fica na barra (fora do "Mais"), com o contador', /id="btn-avisos"[\s\S]*?id="avisos-badge"/.test(trilho), true);
conferir('o painel e o script estao na pagina, o script depois do avisos.js',
  [html.includes('id="painel-avisos"'), html.indexOf('<script src="js/central.js">') > html.indexOf('<script src="js/avisos.js">')], [true, true]);
const lemb = fs.readFileSync(path.join(raiz, 'public/js/lembretes.js'), 'utf8');
const pess = fs.readFileSync(path.join(raiz, 'public/js/pessoas.js'), 'utf8');
conferir('o lembrete manda o id da reuniao e o aceno manda o uid (pro clique na central)',
  [/reuniao: item\.reuniao\.id/.test(lemb), /tag: 'aceno:' \+ data\.de, uid:/.test(pess)], [true, true]);

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
