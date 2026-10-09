// Conta por usuario e senha: cadastro aberto (sem e-mail, dominio ou codigo da
// sede), login por usuario, nome do personagem unico e migracao das contas
// antigas, que so tinham e-mail.
//
// Sobe o servidor de verdade numa pasta de dados descartavel (DATA_DIR) e conversa
// com ele por HTTP. NAO mexe em server/data.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-usuario-'));
const PORTA = 3731;
const BASE = 'http://127.0.0.1:' + PORTA;

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

let servidor = null;
function parar() {
  return new Promise((resolve) => {
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

async function derrubar() {
  await parar();
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
}

function subir() {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), CODIGO_SEDE: '', ADMIN_CODE: 'teste-chefe',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', SEM_LOGIN: '', NODE_ENV: 'test',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '',
        TRELLO_BOARD_ID: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', EMAIL_PROVEDOR: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let erro = '';
    servidor.stderr.on('data', (b) => { erro += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude').then((r) => (r.ok ? resolve() : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

function pedir(rota, { metodo = 'GET', corpo, cookie } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (cookie) cabecalhos.Cookie = cookie;
  return fetch(BASE + rota, {
    method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => ({
    status: r.status,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null,
    corpo: await r.json().catch(() => null),
  }));
}

const registrar = (corpo) => pedir('/api/registrar', { metodo: 'POST', corpo });
const entrar = (corpo) => pedir('/api/entrar', { metodo: 'POST', corpo });

(async function () {
  console.log('\nCONTAS: USUARIO, SENHA E NOME UNICO');
  try {
    // Uma conta antiga, so com e-mail, gravada como o servidor de antes gravava:
    // a subida tem que dar um usuario a ela sem trancar ninguem fora.
    const crypto = require('crypto');
    const salt = 'a'.repeat(32);
    const params = { N: 16384, r: 8, p: 1 };
    const hash = crypto.scryptSync('senha-antiga-1', salt, 64, {
      cost: params.N, blockSize: params.r, parallelization: params.p, maxmem: 128 * params.N * params.r * 2,
    }).toString('hex');
    fs.writeFileSync(path.join(PASTA, 'usuarios.json'), JSON.stringify({
      usuarios: [{
        id: 'id-antigo', nome: 'Antiga', email: 'Maria.Silva@empresa.com',
        emailChave: 'maria.silva@empresa.com', salt, senhaHash: hash, isAdmin: false,
        appearance: null, criadoEm: 1, ultimoAcesso: 1,
      }],
    }));
    await subir();

    // ---------------------------------------------------------- migracao
    const antiga = await entrar({ usuario: 'maria.silva', senha: 'senha-antiga-1' });
    conferir('conta antiga entra pelo usuario tirado do e-mail', antiga.status, 200);
    conferir('  e o usuario dela e a parte antes do @', antiga.corpo.usuario.usuario, 'maria.silva');
    const antigaPorEmail = await entrar({ email: 'Maria.Silva@empresa.com', senha: 'senha-antiga-1' });
    conferir('conta antiga ainda entra pelo e-mail (ninguem fica trancado)', antigaPorEmail.status, 200);

    // ---------------------------------------------------------- cadastro
    const novo = await registrar({ usuario: 'Joao_123', nome: 'Joao', senha: 'senha-nova-123' });
    conferir('cadastra so com usuario, nome e senha (sem e-mail, dominio ou codigo)', novo.status, 200);
    conferir('  o usuario e guardado em minusculo', novo.corpo.usuario.usuario, 'joao_123');
    conferir('  e nunca nasce diretoria', novo.corpo.usuario.isAdmin, false);

    const loginMaiusculo = await entrar({ usuario: 'JOAO_123', senha: 'senha-nova-123' });
    conferir('entra com o usuario em maiuscula (nao diferencia)', loginMaiusculo.status, 200);
    const loginErrado = await entrar({ usuario: 'joao_123', senha: 'errada-errada' });
    conferir('senha errada nao entra', loginErrado.status, 401);
    const loginInexistente = await entrar({ usuario: 'ninguem', senha: 'senha-nova-123' });
    conferir('usuario que nao existe da a MESMA resposta (nao entrega quem tem conta)',
      [loginInexistente.status, loginInexistente.corpo.erro], [loginErrado.status, loginErrado.corpo.erro]);

    // ---------------------------------------------------------- unicidade
    const usuarioRepetido = await registrar({ usuario: 'JOAO_123', nome: 'Outro Nome', senha: 'senha-nova-123' });
    conferir('usuario repetido (mesmo em maiuscula) e recusado', usuarioRepetido.status, 409);
    const nomeRepetido = await registrar({ usuario: 'joana', nome: '  joao ', senha: 'senha-nova-123' });
    conferir('nome do personagem repetido (sem diferenciar caixa nem espaco) e recusado', nomeRepetido.status, 409);

    const usuarioRuim = await registrar({ usuario: 'a b', nome: 'Ruim', senha: 'senha-nova-123' });
    conferir('usuario com espaco e recusado', usuarioRuim.status, 400);
    const usuarioCurto = await registrar({ usuario: 'ab', nome: 'Curto', senha: 'senha-nova-123' });
    conferir('usuario curto demais e recusado', usuarioCurto.status, 400);
    const senhaCurta = await registrar({ usuario: 'curtinha', nome: 'Curtinha', senha: '123' });
    conferir('senha curta e recusada', senhaCurta.status, 400);

    // ---------------------------------------------------------- perfil
    const maria = await registrar({ usuario: 'maria', nome: 'Maria', senha: 'senha-nova-123' });
    const tomaNome = await pedir('/api/perfil', { metodo: 'PUT', cookie: maria.cookie, corpo: { nome: 'JOAO' } });
    conferir('trocar o nome pra um que ja existe e recusado', tomaNome.status, 409);
    const mesmoNome = await pedir('/api/perfil', { metodo: 'PUT', cookie: maria.cookie, corpo: { nome: 'Maria' } });
    conferir('salvar o PROPRIO nome de novo nao conta como repetido', mesmoNome.status, 200);
    const trocaNome = await pedir('/api/perfil', { metodo: 'PUT', cookie: maria.cookie, corpo: { nome: 'Mari' } });
    conferir('trocar o nome pra um livre funciona', [trocaNome.status, trocaNome.corpo.usuario.nome], [200, 'Mari']);
    conferir('  e o usuario de login nao muda junto', trocaNome.corpo.usuario.usuario, 'maria');
    const nomeLiberado = await registrar({ usuario: 'maria2', nome: 'Maria', senha: 'senha-nova-123' });
    conferir('o nome antigo fica livre pra outra pessoa', nomeLiberado.status, 200);
  } catch (e) {
    falhou++;
    console.log('  FALHOU (erro inesperado): ' + e.message);
  } finally {
    await derrubar();
  }

  console.log('\n' + ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})();
