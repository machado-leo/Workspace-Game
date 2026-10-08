// Sobe a sede pra valer e **ja devolve o link de fora**: login ligado, cookie
// Secure, codigos sorteados e o tunel do ngrok aberto por conta propria.
//
// Uso:  npm run publicar
// Nao precisa de segundo terminal - o link sai na tela. Ctrl+C derruba os dois.
//
// Ver docs/deploy.md, secao "Link rapido com tunel".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tunel = require('./tunel');
const pastaDados = require('./dados');

if (process.env.SEM_LOGIN === '1') {
  console.error('SEM_LOGIN=1 nao combina com publicar: todo mundo que abrisse o');
  console.error('link entraria na MESMA conta de desenvolvimento. Tire a variavel.');
  process.exit(1);
}

const PASTA = pastaDados.PASTA;
const PALAVRAS = ['tucano', 'caju', 'vento', 'mare', 'sertao', 'farol', 'coco', 'duna',
  'jangada', 'aroeira', 'buriti', 'cariri'];

// Os codigos ficam em server/data/ (fora do git) e sao os MESMOS a cada
// restart - se sorteasse de novo, quem ja tinha o codigo ficava de fora.
function codigoFixo(arquivo, prefixo) {
  const caminho = path.join(PASTA, arquivo);
  try {
    const salvo = fs.readFileSync(caminho, 'utf8').trim();
    if (salvo) return salvo;
  } catch (e) { /* primeira vez: sorteia abaixo */ }

  const palavra = PALAVRAS[crypto.randomInt(PALAVRAS.length)];
  const codigo = `${prefixo}-${palavra}-${crypto.randomInt(1000, 10000)}`;
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(caminho, codigo + '\n', { mode: 0o600 });
  return codigo;
}

process.env.NODE_ENV = 'production';
process.env.PORT = process.env.PORT || '3600';
process.env.CODIGO_SEDE = process.env.CODIGO_SEDE || codigoFixo('codigo-sede.txt', 'adm');
process.env.ADMIN_CODE = process.env.ADMIN_CODE || codigoFixo('codigo-admin.txt', 'chefe');

require('./index.js');

function bloco(linhas) {
  const larg = Math.max(...linhas.map((l) => l.length)) + 4;
  console.log('');
  console.log('  +' + '-'.repeat(larg) + '+');
  linhas.forEach((l) => console.log('  |  ' + l.padEnd(larg - 3) + '|'));
  console.log('  +' + '-'.repeat(larg) + '+');
  console.log('');
}

(async () => {
  const resultado = await tunel.abrir(process.env.PORT);

  if (resultado.url) {
    bloco([
      'Link pra mandar pra pessoa testar:',
      '',
      '  ' + resultado.url,
      '',
      'Codigo da sede (todo mundo precisa, pra criar conta):',
      '  ' + process.env.CODIGO_SEDE,
      'Codigo de diretoria (so pra quem vai decorar o escritorio):',
      '  ' + process.env.ADMIN_CODE,
    ]);
    console.log('  Na primeira visita o ngrok mostra um aviso: e so clicar em "Visit Site".');
    console.log('  O link vale enquanto este terminal ficar aberto. Ctrl+C derruba tudo.');
    console.log('');

    const encerrar = () => {
      try { resultado.processo.kill(); } catch (e) { /* ja morreu */ }
      process.exit(0);
    };
    process.on('SIGINT', encerrar);
    process.on('SIGTERM', encerrar);
  } else {
    console.log('');
    console.log('  O servidor local subiu, mas o tunel nao: ' + resultado.erro);
    if (resultado.saida) {
      console.log('  Saida do ngrok: ' + resultado.saida.split(String.fromCharCode(10)).slice(-3).join(' | '));
    }
    console.log('');
    console.log('  Da pra abrir o tunel na mao, num outro terminal:');
    console.log('     ngrok http ' + process.env.PORT);
    console.log('');
    console.log('  Codigo da sede: ' + process.env.CODIGO_SEDE);
    console.log('  Codigo de diretoria: ' + process.env.ADMIN_CODE);
    console.log('');
  }
})();
