// O freio de ritmo (server/freio.js): no maximo N acoes por pessoa em uma janela.
// Ver testes/chat-ritmo.js pro caminho inteiro, com servidor e sockets.
//
// Relogio dado na mao (`tentar(chave, agora)`): nada de dormir pra testar janela.
const freio = require('../server/freio.js');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

console.log('\nFREIO DE RITMO');

const f = freio.criar({ max: 5, janelaMs: 3000 });
const T = 1_000_000;

// as cinco primeiras passam, a sexta nao
const passou = [0, 1, 2, 3, 4].map((i) => f.tentar('ana', T + i * 10).ok);
conferir('as 5 primeiras acoes da janela passam', passou, [true, true, true, true, true]);
const sexta = f.tentar('ana', T + 50);
conferir('a 6a e barrada', sexta.ok, false);
conferir('  e diz quanto falta pra abrir uma vaga (a mais velha sai da janela)', sexta.esperarMs, 3000 - 50);
conferir('  a 7a tambem, com a espera menor', f.tentar('ana', T + 1000).esperarMs, 3000 - 1000);

// a barrada NAO conta: senao insistir empurraria a vaga pra sempre
conferir('acao barrada nao entra na conta (insistir nao prolonga a espera)',
  f.tentar('ana', T + 2999).esperarMs, 1);

// janela deslizante: a mais velha sai, abre UMA vaga
conferir('quando a mais velha sai da janela, abre uma vaga', f.tentar('ana', T + 3000).ok, true);
conferir('  e so uma (a segunda mais velha ainda esta dentro)', f.tentar('ana', T + 3001).ok, false);
conferir('  a seguinte sai 10 ms depois, e abre a proxima', f.tentar('ana', T + 3011).ok, true);

// cada pessoa tem a sua
conferir('outra pessoa nao e afetada', f.tentar('bia', T + 60).ok, true);
conferir('  nem quando a primeira esta barrada', f.tentar('ana', T + 3012).ok === false && f.tentar('bia', T + 3012).ok, true);

// passou a janela inteira: zera
const g = freio.criar({ max: 2, janelaMs: 1000 });
g.tentar('x', T); g.tentar('x', T);
conferir('com o teto cheio, barra', g.tentar('x', T + 10).ok, false);
conferir('uma janela depois, tudo liberado de novo', [g.tentar('x', T + 1500).ok, g.tentar('x', T + 1500).ok, g.tentar('x', T + 1500).ok], [true, true, false]);

// a espera devolvida nunca e zero nem negativa (o cliente mostra "espere N segundos")
const h = freio.criar({ max: 1, janelaMs: 1000 });
h.tentar('y', T);
conferir('a espera e sempre pelo menos 1 ms', h.tentar('y', T + 999).esperarMs >= 1, true);

// cada chave ocupa memoria: a faxina existe (nao da pra esperar o relogio real aqui,
// entao confere so o que o estado guarda)
conferir('o estado guarda so quem falou', f._tamanho(), 2);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
