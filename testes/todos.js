// Roda a bateria inteira e so depois diz o que falhou.
//
// POR QUE ISTO EXISTE
// Antes a bateria era uma linha de `node testes/a.js && node testes/b.js && ...`
// no package.json. O `&&` para no primeiro erro - e isso custou caro de um jeito
// especifico: um teste de backup apodreceu com o calendario (ele datava os
// backups "velhos" a partir de Date.now() e os novos de um relogio fixo, entao
// tres dias depois o velho virou o mais novo). Aquele unico erro DERRUBOU OS
// SEIS TESTES SEGUINTES, entre eles os dois de seguranca - contas.js e
// login-google.js.
//
// O resultado: a suite dizia "226 checagens" quando eram 415, e ninguem tinha
// como saber que a parte mais importante nem tinha rodado. Teste que esconde
// outro teste e pior que teste que falta, porque o numero verde mente.
//
// Agora todos rodam sempre, e no fim sai um resumo com o que falhou.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Estes dois nao sao teste: png.js e biblioteca e pecas-da-folha.js e ferramenta
// de linha de comando (recebe um arquivo e mede as pecas).
const NAO_SAO_TESTE = new Set(['todos.js', 'png.js', 'pecas-da-folha.js']);

const pasta = __dirname;
const arquivos = fs.readdirSync(pasta)
  .filter((n) => n.endsWith('.js') && !n.startsWith('.') && !NAO_SAO_TESTE.has(n))
  .sort();

const resultados = [];
let totalOk = 0;
let totalFalhou = 0;

for (const arquivo of arquivos) {
  const r = spawnSync(process.execPath, [path.join(pasta, arquivo)], {
    encoding: 'utf8',
    // stdio herdado: a saida de cada teste continua aparecendo na hora, como
    // antes. Quem roda a bateria quer ver o progresso, nao um silencio de dois
    // minutos seguido de um resumo.
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // Cada teste imprime "N passaram, M falharam" e sai com codigo != 0 se
  // falhou. O codigo de saida e a fonte da verdade aqui: teste que estourou no
  // meio (como o do gunzip) nem chega a imprimir o resumo.
  const passou = r.status === 0;
  resultados.push({ arquivo, passou, status: r.status, sinal: r.signal });
  if (passou) totalOk++; else totalFalhou++;
}

console.log('\n' + '='.repeat(60));
console.log('  BATERIA COMPLETA: ' + arquivos.length + ' arquivos');
console.log('='.repeat(60));

if (totalFalhou) {
  console.log('\n  FALHARAM (' + totalFalhou + '):');
  resultados.filter((r) => !r.passou).forEach((r) => {
    console.log('     ' + r.arquivo
      + (r.sinal ? '  (morto por ' + r.sinal + ')' : '  (saiu com ' + r.status + ')'));
  });
}

console.log('\n  ' + totalOk + ' arquivo(s) passaram, ' + totalFalhou + ' falharam\n');
process.exit(totalFalhou ? 1 : 0);
