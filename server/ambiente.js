// Credenciais das integracoes (Google, Trello, Drive, backup) moram em
// escritorio-virtual/.env, que NAO vai pro git - modelo em .env.example.
//
// Modulo proprio porque dois arranques precisam dele: o index.js e o
// iniciar.js (que restaura o backup ANTES de o index.js carregar as contas).
// Variavel que ja veio do ambiente ganha do arquivo: e assim que o Render (que
// nao tem .env) e os testes mandam. Carregar duas vezes nao muda nada.
//
// VARIAS SEDES NO MESMO SERVIDOR (scripts/sedes.sh): todas rodam o MESMO codigo,
// entao todas enxergariam o MESMO .env da pasta do codigo - e o que estivesse
// nele (quem e diretoria, dominio de e-mail, segredos) valeria pra todos os
// clientes ao mesmo tempo. Por isso ARQUIVO_ENV:
//   - ARQUIVO_ENV=nenhum  -> nao le arquivo nenhum: tudo vem do servico (o
//                            systemd de cada cliente passa as variaveis dele);
//   - ARQUIVO_ENV=/caminho -> le esse arquivo no lugar do .env da pasta;
//   - sem ARQUIVO_ENV     -> o .env da pasta do codigo, como sempre foi.
const path = require('path');

const escolhido = String(process.env.ARQUIVO_ENV || '').trim();

if (escolhido !== 'nenhum') {
  const arquivo = escolhido ? path.resolve(escolhido) : path.join(__dirname, '..', '.env');
  try {
    if (typeof process.loadEnvFile === 'function') process.loadEnvFile(arquivo);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[env] nao consegui ler ' + arquivo + ': ' + e.message);
  }
}
