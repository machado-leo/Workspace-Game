// Guarda o catalogo de coisas que vao em cima da mesa.
//
//   npm run teste
//
// Existe por causa de uma armadilha real: um item novo precisa entrar em CINCO
// lugares, e esquecer qualquer um deles falha **em silencio**. O pior e o
// `OBJETO_MAX`: o servidor descarta o id maior que ele sem erro nenhum, entao o
// item some e nao ha nada no console pra explicar. Este arquivo checa os cinco.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const servidor = require(path.join(RAIZ, 'server', 'map.js'));

// carrega o map.js do cliente num window falso
global.window = {};
new Function(fs.readFileSync(path.join(RAIZ, 'public', 'js', 'map.js'), 'utf8'))();
const cliente = global.window.OfficeMap;

const game = fs.readFileSync(path.join(RAIZ, 'public', 'js', 'game.js'), 'utf8');
const decorador = fs.readFileSync(path.join(RAIZ, 'public', 'js', 'decorador.js'), 'utf8');

let ok = 0;
let falhou = 0;

function conferir(nome, real, esperado) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(real)));
  bate ? ok++ : falhou++;
}

const nomes = Object.keys(cliente.OBJETOS).filter((n) => n !== 'NENHUM');
const ids = nomes.map((n) => cliente.OBJETOS[n]);

console.log('\n  ' + nomes.length + ' coisas de mesa no catalogo\n');

// 1 e 2: os dois map.js contam a mesma historia
conferir('cliente e servidor tem o mesmo enum de objetos',
  JSON.stringify(cliente.OBJETOS), JSON.stringify(servidor.OBJETOS));

// 3: a armadilha silenciosa
conferir('OBJETO_MAX cobre o maior id (senao o servidor descarta calado)',
  servidor.OBJETO_MAX >= Math.max.apply(null, ids), true);

conferir('nenhum id repetido', new Set(ids).size, ids.length);

// 4: sem desenho o item fica invisivel - colocado, salvo, e nao aparece
conferir('todo item tem desenho em game.js',
  nomes.filter((n) => !game.includes('obj === O.' + n + ')')), []);

// 5: sem entrada no catalogo ninguem consegue escolher. Um item entra de duas
// formas: como entrada propria (`{ o: O.X }`) ou dentro de um `giros`, que e
// como as direcoes de um mesmo movel aparecem. Por isso o teste procura o nome
// seguido de qualquer coisa que nao seja letra - `O.X,` ou `O.X]` - e nao so
// da virgula: quando o MONITOR_COSTAS virou o ultimo item de um giros ele
// passou a terminar em `]` e o teste acusou falta dele no catalogo.
conferir('todo item aparece no catalogo do decorador',
  nomes.filter((n) => !new RegExp('O\\.' + n + '\\b(?!_)').test(decorador)), []);

// as abas que quem tem mesa ve sem ser da diretoria
conferir('existem abas marcadas `deMesa`', /deMesa: true/.test(decorador), true);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
