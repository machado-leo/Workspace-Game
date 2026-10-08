// O historico do chat tem que sobreviver a um reinicio do servidor.
//
// Este teste existe porque o modo de falhar aqui e silencioso: nada quebra na
// tela, a conversa simplesmente nao esta mais la quando o processo volta - e no
// plano gratuito do Render, que derruba o processo quando ninguem acessa, isso
// acontecia sozinho de madrugada.
//
// ATENCAO: este teste escreve em `server/data/chat.json`. Ele guarda o arquivo
// que estava la e devolve no fim. Nao rode com o servidor de pe: o processo
// vivo tem o historico em memoria e vai regravar por cima quando alguem falar.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ARQUIVO = path.join(raiz, 'server/data/chat.json');
const chatDisco = require('../server/chat-disco.js');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

// guarda o que ja estava la
const tinhaAntes = fs.existsSync(ARQUIVO) ? fs.readFileSync(ARQUIVO) : null;
function restaurar() {
  if (tinhaAntes) fs.writeFileSync(ARQUIVO, tinhaAntes);
  else if (fs.existsSync(ARQUIVO)) fs.unlinkSync(ARQUIVO);
}

try {
  const MAX = 200;
  const msg = (id, texto, autorId) => ({
    id, conversa: 'canal:geral', autorId: autorId === undefined ? 'u1' : autorId,
    autor: 'Ana', texto, ts: 1700000000000 + id, reacoes: {},
  });

  // ---------------------------------------------------- ida e volta simples
  const conversas = new Map();
  conversas.set('canal:geral', [msg(1, 'bom dia'), msg(2, 'bom dia!')]);
  conversas.set('dm:a|b', [msg(3, 'me chama quando puder')]);
  chatDisco.agendar(conversas, 4);
  chatDisco.agora();

  let voltou = chatDisco.carregar(MAX);
  conferir('o canal volta com as duas mensagens',
    voltou.conversas.get('canal:geral').map((m) => m.texto), ['bom dia', 'bom dia!']);
  conferir('a DM volta junto',
    voltou.conversas.get('dm:a|b').map((m) => m.texto), ['me chama quando puder']);
  conferir('o proximo id continua de onde parou', voltou.proximoMsgId, 4);
  conferir('a reacao volta com a mensagem',
    typeof voltou.conversas.get('canal:geral')[0].reacoes, 'object');

  // ------------------------------------------- aviso de sistema nao e guardado
  // "fulano entrou" faz sentido enquanto a sessao esta viva. Depois de um
  // reinicio vira parede de entra-e-sai de gente que nem esta online.
  const comAviso = new Map();
  comAviso.set('canal:geral', [msg(1, 'oi'), msg(2, 'Bruno entrou', null), msg(3, 'tudo bem?')]);
  chatDisco.agendar(comAviso, 4);
  chatDisco.agora();
  voltou = chatDisco.carregar(MAX);
  conferir('aviso de entrou/saiu fica de fora',
    voltou.conversas.get('canal:geral').map((m) => m.texto), ['oi', 'tudo bem?']);

  // ------------------------------------------------------- o corte na LEITURA
  // Um chat.json escrito por uma versao com limite maior nao pode encher a
  // memoria de volta: o corte vale na ida e na volta.
  const longa = new Map();
  longa.set('canal:geral', Array.from({ length: 30 }, (_, i) => msg(i + 1, 'm' + (i + 1))));
  chatDisco.agendar(longa, 31);
  chatDisco.agora();
  voltou = chatDisco.carregar(10);
  const lidas = voltou.conversas.get('canal:geral');
  conferir('a leitura corta no limite pedido', lidas.length, 10);
  conferir('e o que sobra sao as MAIS NOVAS', lidas[lidas.length - 1].texto, 'm30');

  // --------------------------------------------------- arquivo ruim nao derruba
  fs.writeFileSync(ARQUIVO, 'isto nao e json');
  voltou = chatDisco.carregar(MAX);
  conferir('arquivo corrompido comeca limpo em vez de quebrar', voltou.conversas.size, 0);
  conferir('  e o id volta pro comeco', voltou.proximoMsgId, 1);

  // ------------------------------------------------- conversa vazia nao entra
  const vazia = new Map();
  vazia.set('canal:geral', [msg(1, 'oi')]);
  vazia.set('canal:social', []);
  chatDisco.agendar(vazia, 2);
  chatDisco.agora();
  voltou = chatDisco.carregar(MAX);
  conferir('canal sem mensagem nao ocupa espaco no arquivo',
    [...voltou.conversas.keys()], ['canal:geral']);
} finally {
  restaurar();
}

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
