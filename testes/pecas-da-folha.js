// Onde esta cada peca dentro de uma folha do pacote.
//
//   node testes/pecas-da-folha.js furniture/countertop.png
//   node testes/pecas-da-folha.js structure-floor        (a pasta inteira)
//
// Por que existe: escolher recorte olhando a folha ampliada na tela e como a
// gente vinha fazendo, e foi assim que o VASO_FLORES ficou meses apontando pra
// uma celula quase vazia (5% de pixel) sem ninguem ver. Aqui as pecas saem
// MEDIDAS: acha as ilhas de pixel opaco, junta o que se toca, e devolve a caixa
// de cada uma em coordenada de tile - que e o que o sprites.js pede.
const fs = require('fs');
const path = require('path');
const { lerPNG } = require('./png.js');

const BASE = path.join(__dirname, '..', 'public', 'assets', 'lpc-moveis');
const T = 32;
const ALFA_MIN = 24; // abaixo disso e sombra/anti-serrilhado, nao desenho

// Ilhas de pixel opaco, por varredura em largura. Iterativa e nao recursiva: uma
// folha de 2016x672 estoura a pilha em recursao.
function ilhas(png) {
  const { largura: L, altura: A, alfa } = png;
  const visto = new Uint8Array(L * A);
  const achadas = [];

  for (let y0 = 0; y0 < A; y0++) {
    for (let x0 = 0; x0 < L; x0++) {
      const i0 = y0 * L + x0;
      if (visto[i0] || alfa[i0] < ALFA_MIN) continue;

      let minX = x0, maxX = x0, minY = y0, maxY = y0, pixels = 0;
      const fila = [i0];
      visto[i0] = 1;

      while (fila.length) {
        const i = fila.pop();
        const x = i % L;
        const y = (i - x) / L;
        pixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // 8 vizinhos: peca com anti-serrilhado costuma se ligar na diagonal, e
        // com 4 vizinhos ela sairia partida em dois ou tres pedacos.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= L || ny >= A) continue;
            const ni = ny * L + nx;
            if (visto[ni] || alfa[ni] < ALFA_MIN) continue;
            visto[ni] = 1;
            fila.push(ni);
          }
        }
      }
      achadas.push({ minX, maxX, minY, maxY, pixels });
    }
  }
  return achadas;
}

// Quanto da celula esta pintado. E o numero que denuncia recorte errado: peca de
// verdade passa de 25%; abaixo disso e canto de outra coisa.
function preenchimento(png, c, r) {
  let cheios = 0;
  for (let y = r * T; y < (r + 1) * T && y < png.altura; y++) {
    for (let x = c * T; x < (c + 1) * T && x < png.largura; x++) {
      if (png.alfa[y * png.largura + x] >= ALFA_MIN) cheios++;
    }
  }
  return cheios / (T * T);
}

function analisar(rel) {
  const caminho = path.join(BASE, rel);
  let png;
  try {
    png = lerPNG(caminho);
  } catch (e) {
    console.log(rel + ' -> ' + e.message);
    return;
  }

  const cols = Math.ceil(png.largura / T);
  const rows = Math.ceil(png.altura / T);
  console.log('\n== ' + rel + '   ' + png.largura + 'x' + png.altura + ' = ' + cols + 'x' + rows + ' tiles');

  // So as ilhas que valem a pena: pedacinho solto de 20 pixels e sujeira.
  const grandes = ilhas(png).filter((i) => i.pixels > 180);
  if (!grandes.length) {
    console.log('   (nenhuma peca acima de 180 pixels)');
    return;
  }

  // Ordena como se le: de cima pra baixo, da esquerda pra direita.
  grandes.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));

  grandes.slice(0, 40).forEach((i) => {
    const c0 = Math.floor(i.minX / T);
    const r0 = Math.floor(i.minY / T);
    const c1 = Math.floor(i.maxX / T);
    const r1 = Math.floor(i.maxY / T);
    const w = c1 - c0 + 1;
    const h = r1 - r0 + 1;
    // `desloca` do sprites.js centraliza peca larga; saber a sobra ajuda a decidir.
    const sobraEsq = i.minX - c0 * T;
    const sobraDir = (c1 + 1) * T - 1 - i.maxX;
    console.log(
      '   c:' + String(c0).padEnd(3) + 'r:' + String(r0).padEnd(3)
      + 'w:' + String(w).padEnd(3) + 'h:' + String(h).padEnd(3)
      + '  ' + String(i.pixels).padStart(6) + 'px'
      + '  celula c0r0 ' + (preenchimento(png, c0, r0) * 100).toFixed(0) + '% cheia'
      + (sobraEsq || sobraDir ? '   folga ' + sobraEsq + '/' + sobraDir : '')
    );
  });
  if (grandes.length > 40) console.log('   ... e mais ' + (grandes.length - 40) + ' pecas');
}

const alvo = process.argv[2];
if (!alvo) {
  console.log('uso: node testes/pecas-da-folha.js <arquivo.png ou pasta>');
  process.exit(1);
}

const completo = path.join(BASE, alvo);
if (fs.existsSync(completo) && fs.statSync(completo).isDirectory()) {
  fs.readdirSync(completo).filter((f) => f.endsWith('.png')).forEach((f) => analisar(alvo + '/' + f));
} else {
  analisar(alvo);
}
