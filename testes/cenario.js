// A arte de cenario do pacote LPC vive em TRES lugares que precisam concordar:
//
//   1. public/js/sprites.js                     - que folha e celula cada peca usa
//   2. public/assets/lpc-moveis/                - o PNG
//   3. public/assets/lpc-moveis/CREDITS.md      - a linha de credito daquele PNG
//
// O credito nao e capricho: o pacote e OGA-BY 3.0 / CC-BY 3.0, e **creditar e a
// condicao pra poder usar**. Publicar um PNG sem a linha dele no CREDITS.md
// quebra a licenca — e este projeto ja esta no ar.
//
// Este teste existe porque os dois tipos de erro ja aconteceram, e nenhum deles
// da erro em lugar nenhum - so fica errado na tela:
//
//   - credito faltando: a TV, o quadro e o tapete do lobby entraram no
//     sprites.js sem passar pelo CREDITS.md;
//   - coordenada mal escolhida: a geladeira pegava um terco de OUTRA geladeira
//     (saia torta) e o quadro pegava meia moldura (saia pela metade).
//
// O irmao deste teste e o `roupas.js`, que faz o mesmo pelos sprites de boneco.
const fs = require('fs');
const path = require('path');
const { lerPNG } = require('./png.js');

const raiz = path.join(__dirname, '..');
const ASSETS = 'public/assets/lpc-moveis';
const sprites = fs.readFileSync(path.join(raiz, 'public/js/sprites.js'), 'utf8');
const creditos = fs.readFileSync(path.join(raiz, ASSETS, 'CREDITS.md'), 'utf8');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

// ------------------------------------------------------------------- creditos

// Toda folha citada no arquivo, venha de onde vier: do CATALOGO, do PISOS ou de
// uma constante solta (a cadeira de refeitorio entra por `FOLHA_JANTAR`, nao por
// um campo `f:`). Por isso o teste procura QUALQUER caminho .png escrito no
// sprites.js, e nao so o formato do catalogo — assim ele nao deixa passar folha
// que entrou por um caminho novo.
const folhas = [...new Set(
  [...sprites.matchAll(/'([a-z0-9-]+\/[a-z0-9._-]+\.png)'/g)].map((m) => m[1])
)].sort();

conferir('o sprites.js cita pelo menos uma folha', folhas.length > 0, true);

conferir('toda folha usada existe no disco',
  folhas.filter((f) => !fs.existsSync(path.join(raiz, ASSETS, f))), []);

conferir('toda folha usada esta creditada no CREDITS.md',
  folhas.filter((f) => !creditos.includes('`' + f + '`')), []);

// O contrario tambem incomoda: credito de folha que ninguem usa mais vira ruido
// e faz a tabela mentir sobre o que o jogo desenha.
const creditadas = [...new Set(
  [...creditos.matchAll(/`([a-z0-9-]+\/[a-z0-9._-]+\.png)`/g)].map((m) => m[1])
)].sort();

conferir('nao ha credito sobrando de folha que saiu de uso',
  creditadas.filter((f) => !folhas.includes(f)), []);

// --------------------------------------------------------------- coordenadas

// Le as declaracoes `{ f: '...', c: N, r: N, w: N, h: N }` de um trecho do
// arquivo. `escopo` limita a busca: a checagem de vazamento so vale pro catalogo
// de moveis, nao pro piso.
function declaracoes(escopo) {
  const achadas = [];
  const re = /\{([^}]*f: '[^']+\.png'[^}]*)\}/g;
  let m;
  while ((m = re.exec(escopo))) {
    const campos = m[1];
    const num = (k) => {
      const x = campos.match(new RegExp('\\b' + k + ': (-?\\d+)'));
      return x ? Number(x[1]) : 0;
    };
    achadas.push({
      f: campos.match(/f: '([^']+)'/)[1],
      c: num('c'),
      r: num('r'),
      w: num('w') || 1,
      h: num('h') || 1,
      montar: /montar:/.test(campos),
      emenda: /emenda: true/.test(campos),
    });
  }
  return achadas;
}

const T = 32;
const capa = {};
function alfaDe(arq) {
  if (!capa[arq]) capa[arq] = lerPNG(path.join(raiz, ASSETS, arq));
  return capa[arq];
}
const existe = (p) => fs.existsSync(path.join(raiz, ASSETS, p.f));

// A celula pedida precisa caber na folha, senao o drawImage sai vazio e a peca
// some sem erro nenhum no console.
const foraDaFolha = [];
for (const p of declaracoes(sprites).filter(existe)) {
  const img = alfaDe(p.f);
  if ((p.c + p.w) * T > img.largura || (p.r + p.h) * T > img.altura) {
    foraDaFolha.push(p.f + ' pede ' + p.c + ',' + p.r + ' ' + p.w + 'x' + p.h
      + ' mas a folha so tem ' + (img.largura / T) + 'x' + (img.altura / T));
  }
}
conferir('nenhuma celula pedida cai fora da folha', foraDaFolha, []);

// A arte tem que CABER na celula declarada. Quando ela continua pra fora, o
// desenho sai cortado no mapa. Criterio: se o pixel da ULTIMA coluna de dentro e
// o da PRIMEIRA de fora estao os dois opacos, a arte atravessa a borda ali.
// Alguns pixels soltos sao tolerados (sombra, antisserrilhado).
//
// So o catalogo de MOVEIS entra: piso e textura que emenda de proposito, e
// continuar pro tile vizinho e o comportamento certo dele.
//
// O limite e 8 pixels, e nao zero, por um motivo medido: na `chair-sofa-a` as
// poltronas de frente (coluna 0) se encostam de proposito - o topo do encosto de
// uma invade 7 pixels da celula da outra, porque a folha foi feita pra caber
// gente sentada. Nao ha celula limpa pra essa vista, e 7px de encosto achatado
// nao aparece no jogo. Ja os erros de verdade que este teste pegou eram de outra
// ordem: 24px na cadeira de frente (saia sem encosto), 32px na geladeira (pegava
// um terco de outra) e 96px no tapete (cortava o desenho no meio).
const LIMITE = 8;
const iniCat = sprites.indexOf('const CATALOGO = {');
const fimCat = sprites.indexOf('\n  };', iniCat);
// Peca com `montar` fica de fora: ela NAO recorta um bloco corrido da folha,
// arma o desenho juntando partes soltas (o tapete pega quina, beira e meio em
// lugares diferentes). Medir a borda de um bloco que ela nunca usa acusaria um
// corte que nao existe.
const montadas = (sprites.match(/montar: \(/g) || []).length;
const vazando = [];
for (const p of declaracoes(sprites.slice(iniCat, fimCat)).filter(existe)) {
  if (p.montar) continue;
  // Peca marcada `emenda` tambem sai: a folha desenha uma FILEIRA corrida (a
  // estanteria), e a linha da lateral e dividida entre duas vizinhas. Cortar
  // ali e o uso certo da arte, nao um recorte errado. A marca fica no
  // sprites.js, junto da peca, pra ser uma decisao escrita e nao uma excecao
  // escondida aqui.
  if (p.emenda) continue;
  const img = alfaDe(p.f);
  const A = (px, py) => (px < 0 || py < 0 || px >= img.largura || py >= img.altura)
    ? 0 : img.alfa[py * img.largura + px];
  const x0 = p.c * T;
  const y0 = p.r * T;
  const x1 = x0 + p.w * T;
  const y1 = y0 + p.h * T;
  let dir = 0; let esq = 0; let baixo = 0; let cima = 0;
  for (let y = y0; y < y1; y++) {
    if (A(x1 - 1, y) > 8 && A(x1, y) > 8) dir++;
    if (A(x0, y) > 8 && A(x0 - 1, y) > 8) esq++;
  }
  for (let x = x0; x < x1; x++) {
    if (A(x, y1 - 1) > 8 && A(x, y1) > 8) baixo++;
    if (A(x, y0) > 8 && A(x, y0 - 1) > 8) cima++;
  }
  const lados = [];
  if (dir > LIMITE) lados.push('direita');
  if (esq > LIMITE) lados.push('esquerda');
  if (baixo > LIMITE) lados.push('baixo');
  if (cima > LIMITE) lados.push('cima');
  if (lados.length) {
    vazando.push(p.f + ' em ' + p.c + ',' + p.r + ' ' + p.w + 'x' + p.h
      + ' vaza pra ' + lados.join('+'));
  }
}
conferir('nenhuma peca vaza da celula declarada', vazando, []);

console.log('\n  ' + folhas.length + ' folhas do pacote em uso');
console.log('  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
