// Recorte que atravessa a EMENDA entre duas pecas da folha.
//
// O bug que este teste existe pra pegar: o catalogo pede uma peca de 2 tiles de
// altura, mas na folha aquilo sao DUAS pecas de 1 tile empilhadas (variacoes de
// cor, quase sempre). O jogo entao desenha as duas, uma em cima da outra.
//
// Aconteceu com a MESA_CENTRO: `end-table.png` e 2x7 = catorze mesinhas de um
// tile cada, e o recorte pedia h:2. Na frente do sofa da copa aparecia uma mesa
// em cima da outra. Ninguem viu por semanas, porque nao quebra nada - so fica
// errado na tela.
//
// COMO ELE DECIDE
// Se o recorte tem 2 ou mais tiles, olha cada emenda interna e pergunta:
//   1. as duas metades tem desenho de verdade (mais de 60px opacos cada)?
//   2. algum pixel encosta no outro lado da emenda?
// Peca ALTA de verdade atravessa a emenda - geladeira, arvore, sofa, TV: o
// desenho e continuo. Duas pecas empilhadas nao encostam: existe uma linha
// transparente entre elas, que e a borda da celula na folha.
//
// POR QUE NAO TEM O CHECK CONTRARIO
// O erro simetrico - recorte pequeno demais, que CORTA a peca ao meio - parece
// facil de achar do mesmo jeito: e so ver se tem desenho encostando na borda de
// fora do recorte. Tentei, e nao presta: acusa 7 pecas, e as 7 estao certas. Em
// varias folhas do pacote as pecas ficam COLADAS, sem linha transparente entre
// elas, e ai o pixel do lado de fora e a peca VIZINHA, nao a continuacao desta.
// O detector nao tem como distinguir as duas coisas. Um teste que acusa 7 vezes
// errado nao seria lido depois da segunda.
//
// (E a mesma llicao de sempre por aqui: medir diz onde HA pixel, nao onde a
// peca ACABA.)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { lerPNG } = require('./png.js');

const raiz = path.join(__dirname, '..');
const BASE = path.join(raiz, 'public', 'assets', 'lpc-moveis');
const T = 32;
const ALFA = 24;      // abaixo disso e sombra/anti-serrilhado, nao desenho
const MINIMO = 60;    // px opacos pra uma metade contar como "tem desenho"

const ctx = {
  console,
  window: {},
  Image: function () { this.addEventListener = () => {}; },
  document: { createElement: () => ({ getContext: () => ({}) }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/map.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/sprites.js'), 'utf8'), ctx);
const CAT = ctx.window.Sprites.CATALOGO;

const cache = {};
function folha(f) {
  if (!(f in cache)) {
    const p = path.join(BASE, f);
    cache[f] = fs.existsSync(p) ? lerPNG(p) : null;
  }
  return cache[f];
}

const opaco = (g, x, y) => (
  x >= 0 && y >= 0 && x < g.largura && y < g.altura && g.alfa[y * g.largura + x] >= ALFA
);

function peso(g, x0, x1, y0, y1) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (opaco(g, x, y)) n++;
  return n;
}

// Encosta alguma coisa dos dois lados da emenda? A tolerancia de uma coluna
// (ou linha) pro lado existe porque o traco do pacote e diagonal em muita peca:
// o pixel de cima nem sempre cai exatamente em cima do de baixo.
function cruzaLinha(g, x0, x1, y) {
  for (let x = x0; x < x1; x++) {
    if (!opaco(g, x, y - 1)) continue;
    for (let d = -1; d <= 1; d++) if (opaco(g, x + d, y)) return true;
  }
  return false;
}
function cruzaColuna(g, y0, y1, x) {
  for (let y = y0; y < y1; y++) {
    if (!opaco(g, x - 1, y)) continue;
    for (let d = -1; d <= 1; d++) if (opaco(g, x, y + d)) return true;
  }
  return false;
}

let ok = 0;
let falhou = 0;
function conferir(texto, cond) {
  if (cond) { ok++; console.log('  ok   ' + texto); return; }
  falhou++;
  console.log('  FALHOU ' + texto);
}

console.log('\nRECORTE ATRAVESSANDO EMENDA DE PECA');

const suspeitos = [];
const semArquivo = [];

Object.keys(CAT).forEach((nome) => {
  const p = CAT[nome];
  if (!p || !p.f) return;               // peca desenhada a mao: nao tem folha
  const g = folha(p.f);
  if (!g) { semArquivo.push(nome + ' -> ' + p.f); return; }

  const w = p.w || 1;
  const h = p.h || 1;
  const x0 = (p.c || 0) * T;
  const y0 = (p.r || 0) * T;
  const x1 = x0 + w * T;
  const y1 = y0 + h * T;

  for (let k = 1; k < h; k++) {
    const y = y0 + k * T;
    const cima = peso(g, x0, x1, y - T, y);
    const baixo = peso(g, x0, x1, y, y + T);
    if (cima > MINIMO && baixo > MINIMO && !cruzaLinha(g, x0, x1, y)) {
      suspeitos.push(nome + ' (' + p.f + '): linha ' + k + ' da peca. '
        + 'As duas metades tem desenho (' + cima + 'px e ' + baixo + 'px) e nada '
        + 'encosta na emenda - provavelmente sao DUAS pecas de 1 tile, nao uma de ' + h + '.');
    }
  }
  for (let k = 1; k < w; k++) {
    const x = x0 + k * T;
    const esq = peso(g, x - T, x, y0, y1);
    const dir = peso(g, x, x + T, y0, y1);
    if (esq > MINIMO && dir > MINIMO && !cruzaColuna(g, y0, y1, x)) {
      suspeitos.push(nome + ' (' + p.f + '): coluna ' + k + ' da peca. '
        + 'Os dois lados tem desenho (' + esq + 'px e ' + dir + 'px) e nada '
        + 'encosta na emenda - provavelmente sao DUAS pecas de 1 tile, nao uma de ' + w + '.');
    }
  }
});

if (semArquivo.length) {
  console.log('  (folha nao encontrada, pulei: ' + semArquivo.join(', ') + ')');
}
suspeitos.forEach((s) => console.log('       ' + s));
conferir('nenhum recorte junta duas pecas da folha (' + suspeitos.length + ' suspeito(s))',
  suspeitos.length === 0);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
