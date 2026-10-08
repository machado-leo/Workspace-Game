// A ponte da sede pro discador do CRM (server/discador.js, docs/discador.md).
//
// O que este arquivo guarda, em ordem de gravidade:
//   1. o CRM so ouve falar de conta com e-mail PROVADO - conta so com senha
//      (qualquer um digita fulano@admsolucoes) nem chega a gerar pedido;
//   2. o e-mail que vai pro CRM e SEMPRE o da conta logada: um "email" mandado
//      no corpo, por fora ou por dentro da ligacao, e ignorado;
//   3. a chave vai no cabecalho, e so pro endereco configurado;
//   4. sem configuracao, a porta diz "nao ligado" - e nao tenta nada.
//
// Um CRM de mentira (servidor HTTP local) anota cada pedido que recebe. As
// contas sao criadas direto na pasta de dados temporaria, antes de a sede
// subir. NAO mexe em server/data.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PORTA = 3721;
const PORTA_CRM = 3722;
const BASE = 'http://127.0.0.1:' + PORTA;
const CHAVE = 'chave-de-teste-do-discador-com-mais-de-32-caracteres';
const pastas = [];

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

// ---- o CRM de mentira ------------------------------------------------------
const recebidos = [];
let respostaDoCrm = { status: 200, corpo: { fila: [], total: 0 } };
const crm = http.createServer((req, res) => {
  let texto = '';
  req.on('data', (b) => { texto += b; });
  req.on('end', () => {
    let corpo = null;
    try { corpo = JSON.parse(texto); } catch (e) { corpo = texto; }
    recebidos.push({ url: req.url, auth: req.headers.authorization || null, corpo });
    res.writeHead(respostaDoCrm.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(respostaDoCrm.corpo));
  });
});

// ---- a sede ----------------------------------------------------------------
function novaPasta() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-discador-'));
  pastas.push(p);
  return p;
}

// Contas escritas pelo proprio usuarios.js, num processo a parte com o mesmo
// DATA_DIR - assim o hash de senha e o formato sao os de verdade.
function criarContas(pasta) {
  execFileSync(process.execPath, ['-e', `
    const u = require(${JSON.stringify(path.join(raiz, 'server', 'usuarios.js'))});
    u.criar({ nome: 'Provada', email: 'provada@admsolucoes.com.br', senha: 'senha-bem-forte-1', emailVerificado: true });
    u.criar({ nome: 'SoSenha', email: 'sosenha@admsolucoes.com.br', senha: 'senha-bem-forte-2' });
    u.criar({ nome: 'Pendente', email: 'pendente@admsolucoes.com.br', senha: 'senha-bem-forte-3', emailVerificado: false });
  `], { env: Object.assign({}, process.env, { DATA_DIR: pasta }), stdio: 'ignore' });
}

let servidor = null;
function subir(env) {
  const pasta = novaPasta();
  criarContas(pasta);
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: pasta, PORT: String(PORTA), SEM_LOGIN: '', NODE_ENV: 'test',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        CODIGO_SEDE: '', ADMIN_CODE: '', DIRETORIA_EMAILS: '',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', EMAIL_PROVEDOR: '', EMAIL_CHAVE: '',
        CRM_URL: '', CRM_CHAVE_DISCADOR: '',
      }, env),
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

function parar() {
  return new Promise((resolve) => {
    if (!servidor || servidor.exitCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

async function entrar(email, senha) {
  const r = await fetch(BASE + '/api/entrar', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, senha }),
  });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { status: r.status, cookie };
}

async function pedir(metodo, caminho, cookie, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { status: r.status, json };
}

(async () => {
  await new Promise((r) => crm.listen(PORTA_CRM, '127.0.0.1', r));
  try {
    // ---------------------------------------------------- sem configuracao
    console.log('\nDISCADOR NA SEDE - SEM CONFIGURACAO');
    await subir({});
    const semConf = await entrar('provada@admsolucoes.com.br', 'senha-bem-forte-1');
    conferir('a conta provada entra', semConf.status, 200);
    const estado0 = await pedir('GET', '/api/discador/estado', semConf.cookie);
    conferir('estado: nao ligado', estado0.json && estado0.json.ligado, false);
    const fila0 = await pedir('POST', '/api/discador/fila', semConf.cookie, {});
    conferir('fila sem configuracao: 503', fila0.status, 503);
    conferir('  e o CRM nao recebeu nada', recebidos.length, 0);
    await parar();

    // ------------------------------------------------------ configurado
    console.log('\nDISCADOR NA SEDE - LIGADO');
    await subir({ CRM_URL: 'http://127.0.0.1:' + PORTA_CRM + '/', CRM_CHAVE_DISCADOR: CHAVE });

    const anonimo = await pedir('POST', '/api/discador/fila', null, {});
    conferir('sem login: 401', anonimo.status, 401);

    const soSenha = await entrar('sosenha@admsolucoes.com.br', 'senha-bem-forte-2');
    conferir('conta so com senha entra na sede', soSenha.status, 200);
    const estadoSoSenha = await pedir('GET', '/api/discador/estado', soSenha.cookie);
    conferir('  mas o discador diz que ela nao pode, e explica', [estadoSoSenha.json.ligado, estadoSoSenha.json.pode, /Google/.test(estadoSoSenha.json.motivo || '')], [true, false, true]);
    const filaSoSenha = await pedir('POST', '/api/discador/fila', soSenha.cookie, {});
    conferir('  fila da conta so com senha: 403', filaSoSenha.status, 403);
    const ligSoSenha = await pedir('POST', '/api/discador/ligacao', soSenha.cookie, { ligacao: { resultado: 'atendeu' } });
    conferir('  ligacao da conta so com senha: 403', ligSoSenha.status, 403);
    conferir('  e NENHUM pedido chegou no CRM em nome dela', recebidos.length, 0);

    const provada = await entrar('provada@admsolucoes.com.br', 'senha-bem-forte-1');
    const estadoProvada = await pedir('GET', '/api/discador/estado', provada.cookie);
    conferir('conta provada: pode', [estadoProvada.json.ligado, estadoProvada.json.pode], [true, true]);

    respostaDoCrm = { status: 200, corpo: { vendedor: 'Provada', fila: [{ empresaId: 'x' }], total: 1 } };
    const fila = await pedir('POST', '/api/discador/fila', provada.cookie, {
      email: 'diretor@admsolucoes.com.br', // tentativa de ligar em nome de outro
      filtros: { segmento: 'Varejo', temperatura: 'Quente', semContatoDias: 7, etapas: ['Proposta'], lixo: { a: 1 } },
    });
    conferir('fila: a resposta do CRM chega inteira', fila.json, respostaDoCrm.corpo);
    const pedidoFila = recebidos[recebidos.length - 1];
    conferir('  foi pra porta certa do CRM (sem barra dobrada)', pedidoFila.url, '/api/discador/externo/fila');
    conferir('  com a chave no cabecalho', pedidoFila.auth, 'Bearer ' + CHAVE);
    conferir('  em nome da conta LOGADA, nao do "email" do corpo', pedidoFila.corpo.email, 'provada@admsolucoes.com.br');
    conferir('  so os filtros conhecidos viajam', pedidoFila.corpo.filtros, { segmento: 'Varejo', temperatura: 'Quente', semContatoDias: 7 });

    respostaDoCrm = { status: 200, corpo: { ok: true, id: 'l1', avisos: [] } };
    const lig = await pedir('POST', '/api/discador/ligacao', provada.cookie, {
      email: 'diretor@admsolucoes.com.br',
      ligacao: { email: 'diretor@admsolucoes.com.br', empresaId: 'e1', resultado: 'atendeu', iniciadaEm: '2026-09-19T12:00:00.000Z' },
    });
    conferir('ligacao: ok', lig.json, { ok: true, id: 'l1', avisos: [] });
    const pedidoLig = recebidos[recebidos.length - 1];
    conferir('  foi pra porta da ligacao', pedidoLig.url, '/api/discador/externo/ligacao');
    conferir('  em nome da conta logada', pedidoLig.corpo.email, 'provada@admsolucoes.com.br');
    conferir('  o "email" escondido DENTRO da ligacao nao passa', 'email' in pedidoLig.corpo.ligacao, false);
    conferir('  o resto da ligacao passa como veio', pedidoLig.corpo.ligacao, { empresaId: 'e1', resultado: 'atendeu', iniciadaEm: '2026-09-19T12:00:00.000Z' });

    respostaDoCrm = { status: 403, corpo: { error: 'Seu e-mail não tem acesso ao CRM.' } };
    const semGc = await pedir('POST', '/api/discador/fila', provada.cookie, {});
    conferir('CRM diz que o e-mail nao tem acesso: a pessoa le a frase do CRM', [semGc.status, semGc.json.erro], [403, 'Seu e-mail não tem acesso ao CRM.']);

    respostaDoCrm = { status: 401, corpo: { error: 'Chave do escritório inválida.' } };
    const chaveErrada = await pedir('POST', '/api/discador/fila', provada.cookie, {});
    conferir('chave diferente nos dois lados: a sede explica que e configuracao', [chaveErrada.status, /mesma chave/.test(chaveErrada.json.erro)], [401, true]);

    await new Promise((r) => crm.close(r));
    const foraDoAr = await pedir('POST', '/api/discador/fila', provada.cookie, {});
    conferir('CRM fora do ar: 502 com frase, e a sede nao cai', [foraDoAr.status, /nao respondeu/.test(foraDoAr.json.erro)], [502, true]);
    const saude = await fetch(BASE + '/api/saude');
    conferir('  a sede continua de pe', saude.status, 200);
  } catch (e) {
    falhou++;
    console.log('  FALHOU (erro) ' + e.message);
  } finally {
    await parar();
    try { crm.close(); } catch (e) { /* ja fechado */ }
    pastas.forEach((p) => fs.rmSync(p, { recursive: true, force: true }));
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
