// Peca ALTA nao pode ter movel na celula que a arte dela invade.
//
// No modo `alto` do sprites.js a peca e ancorada na celula de BAIXO e a arte
// sobe: uma peca de h=2 pintada em (c, r) cobre tambem (c, r-1). Se houver
// outro movel ali, a arte passa por cima dele e sai aquilo que o Caio viu -
// uma mesinha de centro plantada no meio do sofa.
//
// E um erro invisivel pra todo o resto: colisao, sala e som continuam certos,
// o mapa passa em todos os outros testes, e so aparece olhando a tela. Por isso
// existe esta checagem.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');

const ctx = {
  console,
  window: {},
  Image: function () { this.addEventListener = () => {}; },
  document: { createElement: () => ({ getContext: () => ({}) }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/map.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/sprites.js'), 'utf8'), ctx);

const M = ctx.window.OfficeMap;
const S = ctx.window.Sprites;
const CAT = S.CATALOGO;

const nome = (id) => Object.keys(M).find((k) => M[k] === id && typeof M[k] === 'number');

let ok = 0;
let falhou = 0;
function conferir(texto, cond) {
  if (cond) { ok++; console.log('  ok   ' + texto); return; }
  falhou++;
  console.log('  FALHOU ' + texto);
}

console.log('\nPECA ALTA POR CIMA DE MOVEL');

// tile -> peca do catalogo
const porTile = {};
Object.keys(CAT).forEach((n) => {
  const id = M[n];
  if (id !== undefined) porTile[id] = CAT[n];
});

// Quantas linhas a arte de uma peca invade pra cima da celula ancora.
function sobe(peca) {
  if (!peca || !peca.f || peca.modo !== 'alto') return 0;
  return (peca.h || 1) - 1;
}

const choques = [];
for (let r = 0; r < M.ROWS; r++) {
  for (let c = 0; c < M.COLS; c++) {
    const t = M.tiles[r][c];
    const peca = porTile[t];
    const acima = sobe(peca);
    if (!acima) continue;

    for (let d = 1; d <= acima; d++) {
      const rr = r - d;
      if (rr < 0) continue;
      const alvo = M.tiles[rr][c];
      if (!alvo || alvo === M.LIVRE) continue;
      // Parede e janela sao caso conhecido e tratado: o game.js repinta a face
      // do muro POR CIMA do movel justamente pra isso (`faceDoMuro`).
      if (alvo === M.PAREDE || alvo === M.JANELA) continue;
      // Peca do mesmo tipo e um bloco so, nao um choque.
      if (alvo === t) continue;
      // `solto` = cada celula desenha a peca inteira; empilhar e o efeito
      // desejado (folhagem de arvore por cima de arvore, por exemplo).
      if (peca.solto) continue;
      // Celula marcada `vazio` no catalogo existe justamente pra ser coberta:
      // o sofa e UMA peca de 3x2 cuja metade de cima e SOFA_CIMA, que nao
      // desenha nada. Isso e projeto, nao choque.
      if (porTile[alvo] && porTile[alvo].vazio) continue;
      choques.push(nome(t) + ' em ' + c + ',' + r + ' sobe por cima de ' + nome(alvo) + ' em ' + c + ',' + rr);
    }
  }
}

if (choques.length) {
  choques.slice(0, 25).forEach((x) => console.log('       ' + x));
  if (choques.length > 25) console.log('       ... e mais ' + (choques.length - 25));
}
conferir('nenhuma peca alta desenha por cima de outro movel (' + choques.length + ' choque(s))',
  choques.length === 0);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
