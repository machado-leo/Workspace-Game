// Sobe um tunel do ngrok apontando pra porta local e devolve o link publico.
// Fica separado do publicar.js porque a parte chata e so esperar o ngrok
// responder: ele demora um pouco pra abrir a API local dele (127.0.0.1:4040).
const { spawn } = require('child_process');
const http = require('http');

const API_NGROK = { host: '127.0.0.1', port: 4040, path: '/api/tunnels', timeout: 2000 };
const TENTATIVAS = 40;   // ~20s no total
const ESPERA_MS = 500;

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pergunta pro proprio ngrok qual endereco publico ele abriu.
function consultarTuneis() {
  return new Promise((resolve, reject) => {
    const req = http.get(API_NGROK, (res) => {
      let corpo = '';
      res.on('data', (d) => { corpo += d; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(corpo));
        } catch (e) {
          reject(new Error('resposta do ngrok nao era JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function urlPublica(dados) {
  const lista = (dados && dados.tunnels) || [];
  const https = lista.find((t) => String(t.public_url).startsWith('https://'));
  const escolhido = https || lista[0];
  return escolhido ? escolhido.public_url : null;
}

// Resolve com { url, processo } ou { erro } - nunca joga excecao, porque o
// servidor local tem que continuar de pe mesmo sem tunel.
async function abrir(porta) {
  // A porta entra em linha de comando: so aceita numero, pra nao dar chance de
  // alguem injetar argumento por variavel de ambiente.
  const p = Number(porta);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    return { erro: 'porta invalida: ' + porta };
  }

  let processo;
  try {
    // Sem `shell` de proposito: com shell o Node avisa que os argumentos nao
    // sao escapados. No Windows o ngrok e um .exe e o spawn direto acha ele.
    processo = spawn('ngrok', ['http', String(p), '--log', 'stdout'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (e) {
    return { erro: 'nao consegui executar o ngrok: ' + e.message };
  }

  let morreu = null;
  let saida = '';
  processo.on('error', (e) => {
    morreu = e.code === 'ENOENT'
      ? 'ngrok nao encontrado no PATH - instale em https://ngrok.com/download'
      : e.message;
  });
  processo.on('exit', (code) => {
    if (morreu === null && code !== 0) morreu = 'ngrok saiu com codigo ' + code;
  });
  // guarda a saida do ngrok pra conseguir explicar o erro (token faltando etc)
  const guardar = (d) => { saida += d.toString(); };
  processo.stdout.on('data', guardar);
  processo.stderr.on('data', guardar);

  for (let i = 0; i < TENTATIVAS; i++) {
    if (morreu) return { erro: morreu, saida: saida.trim() };
    await esperar(ESPERA_MS);
    try {
      const url = urlPublica(await consultarTuneis());
      if (url) return { url, processo };
    } catch (e) { /* ainda subindo, tenta de novo */ }
  }

  try { processo.kill(); } catch (e) { /* ja morreu */ }
  return { erro: 'o ngrok nao abriu o tunel em 20s', saida: saida.trim() };
}

module.exports = { abrir };
