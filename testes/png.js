// Leitor de PNG minimo, so o que os testes precisam: largura, altura e o canal
// ALFA de cada pixel. Serve pra conferir se a arte de uma peca cabe dentro da
// celula que o `sprites.js` declara - fora daqui ninguem decodifica imagem no
// projeto, e puxar uma dependencia pra isso nao se paga.
//
// O pacote vem em dois formatos: cor tipo 6 (RGBA, 296 arquivos) e tipo 3
// (paleta, 25 arquivos - ali o alfa vem do pedaco tRNS, indexado pela paleta).
// Os dois com 8 bits e sem entrelacamento. Qualquer outra coisa levanta erro em
// vez de devolver lixo.
const fs = require('fs');
const zlib = require('zlib');

function lerPNG(caminho) {
  const b = fs.readFileSync(caminho);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('nao e PNG: ' + caminho);

  let largura = 0;
  let altura = 0;
  let bits = 0;
  let cor = 0;
  let entrelacado = 0;
  let transp = null;    // tRNS: alfa de cada indice da paleta
  const pedacos = [];

  for (let i = 8; i < b.length;) {
    const tam = b.readUInt32BE(i);
    const tipo = b.toString('ascii', i + 4, i + 8);
    const dados = b.subarray(i + 8, i + 8 + tam);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      bits = dados[8];
      cor = dados[9];
      entrelacado = dados[12];
    } else if (tipo === 'tRNS') {
      transp = Buffer.from(dados);
    } else if (tipo === 'IDAT') {
      pedacos.push(dados);
    } else if (tipo === 'IEND') {
      break;
    }
    i += 12 + tam; // tamanho + tipo + dados + crc
  }

  if (bits !== 8 || (cor !== 6 && cor !== 3) || entrelacado !== 0) {
    throw new Error('PNG fora do formato esperado (RGBA ou paleta, 8 bits, sem entrelacar): ' + caminho);
  }

  const cru = zlib.inflateSync(Buffer.concat(pedacos));
  const canais = cor === 6 ? 4 : 1;
  const linha = largura * canais;
  const alfa = new Uint8Array(largura * altura);
  const anterior = Buffer.alloc(linha);
  let atual = Buffer.alloc(linha);

  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    cru.copy(atual, 0, y * (linha + 1) + 1, y * (linha + 1) + 1 + linha);

    // desfaz o filtro da linha (spec do PNG, secao 9)
    for (let i = 0; i < linha; i++) {
      const a = i >= canais ? atual[i - canais] : 0;   // pixel a esquerda
      const c = i >= canais ? anterior[i - canais] : 0; // diagonal
      const cima = anterior[i];
      let v = atual[i];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += cima;
      else if (filtro === 3) v += (a + cima) >> 1;
      else if (filtro === 4) {
        const p = a + cima - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - cima);
        const pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? cima : c);
      }
      atual[i] = v & 0xff;
    }

    for (let x = 0; x < largura; x++) {
      // RGBA: o alfa e o quarto canal. Paleta: o byte e o INDICE, e o alfa dele
      // vem do tRNS (indice sem entrada no tRNS e opaco).
      alfa[y * largura + x] = cor === 6
        ? atual[x * 4 + 3]
        : (transp && atual[x] < transp.length ? transp[atual[x]] : 255);
    }
    atual.copy(anterior);
    atual = Buffer.alloc(linha);
  }

  return { largura, altura, alfa };
}

module.exports = { lerPNG };
