// As formas de roupa vivem em TRES lugares que precisam concordar:
//
//   1. public/js/character.js  - o catalogo (id, nome, arquivo)
//   2. server/index.js         - a lista que o servidor aceita
//   3. public/assets/lpc/      - o PNG de cada forma, mais o credito dele
//
// Esquecer qualquer um falha calado. O pior e o servidor: ele nao recusa a
// roupa desconhecida, ele **troca pelo padrao** - a pessoa escolhe blazer,
// salva, e volta de camiseta sem nenhum erro em lugar nenhum.
//
// O credito nao e capricho: os arquivos LPC sao CC-BY-SA / OGA-BY / GPL, e
// creditar e a condicao pra poder usar. Publicar um PNG sem a linha dele no
// CREDITS.md quebra a licenca.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const character = fs.readFileSync(path.join(raiz, 'public/js/character.js'), 'utf8');
const servidor = fs.readFileSync(path.join(raiz, 'server/index.js'), 'utf8');
const creditos = fs.readFileSync(path.join(raiz, 'public/assets/lpc/CREDITS.md'), 'utf8');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

// ---- o catalogo do cliente ----------------------------------------------
function catalogo(lista) {
  const bloco = character.match(new RegExp('const ' + lista + ' = \\[([\\s\\S]*?)\\n  \\];'));
  if (!bloco) return null;
  // `arqAtras` e a folha que vai atras do corpo (cabelo comprido). Ela conta
  // como arquivo em uso: precisa existir e precisa estar creditada igual.
  return [...bloco[1].matchAll(/\{\s*id:\s*'([^']+)'[^}]*?arq:\s*(?:'([^']+)'|null)(?:[^}]*?arqAtras:\s*'([^']+)')?/g)]
    .map((m) => ({ id: m[1], arq: m[2] || null, arqAtras: m[3] || null }));
}

const LISTAS = {
  TOPS: 'topStyle',
  JAQUETAS: 'jaqueta',
  BOTTOMS: 'bottomStyle',
  BARBAS: 'barba',
  CHAPEUS: 'chapeu',
  CABELOS: 'hairStyle',
  SAPATOS: 'shoesStyle',
  PESCOCOS: 'pescoco',
};

const todas = {};
Object.keys(LISTAS).forEach((nome) => { todas[nome] = catalogo(nome); });

conferir('as oito listas existem no character.js',
  Object.keys(todas).filter((n) => !todas[n]), []);

// ---- cliente x servidor --------------------------------------------------
Object.entries(LISTAS).forEach(([lista, campo]) => {
  const doServidor = servidor.match(new RegExp(campo + ':\\s*allowedEnum\\(a\\.' + campo + ',\\s*\\[([^\\]]*)\\]'));
  const aceitos = doServidor
    ? [...doServidor[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    : null;
  conferir('servidor aceita as mesmas formas de ' + lista,
    aceitos, todas[lista] ? todas[lista].map((p) => p.id) : null);
});

// ---- os arquivos existem, e estao creditados ------------------------------
const arquivos = [];
Object.values(todas).forEach((lista) => {
  (lista || []).forEach((peca) => {
    [peca.arq, peca.arqAtras].forEach((arq) => {
      if (arq && !arquivos.includes(arq)) arquivos.push(arq);
    });
  });
});

conferir('todo arquivo de roupa existe em assets/lpc',
  arquivos.filter((arq) => !fs.existsSync(path.join(raiz, 'public/assets/lpc', arq))), []);

conferir('todo arquivo de roupa esta creditado no CREDITS.md',
  arquivos.filter((arq) => !creditos.includes('`' + arq + '`')), []);

console.log('\n  ' + arquivos.length + ' folhas de roupa no catalogo');
console.log('  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
