// scripts/sedes.sh, o comando que cria e remove clientes no VPS.
//
// O script de verdade precisa de Linux (systemd, nginx, certbot, useradd). Aqui
// ele roda em SEDES_SIMULAR=1: faz tudo que e ARQUIVO (configuracao, molde do
// servico, site do nginx, copia final) em pastas temporarias, e so mostra os
// comandos de sistema. Isso cobre o que mais da errado num script assim: porta
// repetida, segredo repetido, validacao que nao valida, remover que apaga demais.
//
// E a ponte com o app: sobe uma sede de VERDADE com as variaveis que o script
// escreveu pro cliente - lidas como o systemd le - e confere que ela sai com o
// dominio, o nome e o modo certos. Script que gera configuracao que o app nao
// entende passaria em teste de script e quebraria no VPS.
//
// Sem bash na maquina, o teste avisa e sai sem falhar.
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const SCRIPT = path.join(raiz, 'scripts', 'sedes.sh');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-sedes-'));

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

// Caminho no formato do bash (no Windows, o Git Bash quer /c/Users/..., nao C:\Users\...).
function doBash(p) {
  if (process.platform !== 'win32') return p;
  return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => '/' + l.toLowerCase());
}

// E a volta: o script escreve caminho de bash no arquivo do cliente. No Linux e
// o proprio caminho; no Windows, o Node leria "/c/Users/..." como C:\c\Users\...
// - e a sede de teste gravaria numa pasta que ninguem ia olhar (ja aconteceu, e
// a conferencia de "grava na pasta dela" passou gravando no lugar errado).
function doNode(p) {
  if (process.platform !== 'win32') return p;
  return p.replace(/^\/([a-z])\//, (_, l) => l.toUpperCase() + ':\\').replace(/\//g, '\\');
}

const ENV = Object.assign({}, process.env, {
  SEDES_SIMULAR: '1',
  SEDES_APP: doBash(path.join(T, 'app')),
  SEDES_ETC: doBash(path.join(T, 'etc')),
  SEDES_DADOS: doBash(path.join(T, 'dados')),
  SEDES_BACKUPS: doBash(path.join(T, 'backups')),
  SEDES_NGINX: doBash(path.join(T, 'nginx')),
  SEDES_UNIDADE: doBash(path.join(T, 'systemd', 'sede@.service')),
});

function sedes(...args) {
  const r = spawnSync('bash', [doBash(SCRIPT), ...args], { env: ENV, encoding: 'utf8' });
  return { codigo: r.status, saida: (r.stdout || '') + (r.stderr || '') };
}

// Le um arquivo de variaveis como o systemd le (KEY=VALOR; # e comentario).
function lerEnv(arquivo) {
  const saida = {};
  fs.readFileSync(arquivo, 'utf8').split('\n').forEach((linha) => {
    if (!linha.trim() || linha.trim().startsWith('#')) return;
    const i = linha.indexOf('=');
    if (i > 0) saida[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  });
  return saida;
}

function subirSedeCom(vars, porta) {
  const env = Object.assign({}, process.env);
  // do jeito que o servico do cliente sobe: nada herdado, tudo do arquivo dele
  Object.keys(env).filter((k) => /^(GOOGLE_|TRELLO_|CLOUDFLARE_|BACKUP_|DIRETORIA|CODIGO|ADMIN|DOMINIOS|SEM_LOGIN|ARQUIVO_ENV|NOME_SEDE|SITE_URL|EMAIL_)/.test(k))
    .forEach((k) => delete env[k]);
  Object.assign(env, vars, { ARQUIVO_ENV: 'nenhum', PORT: String(porta) });
  const proc = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let erro = '';
  proc.stderr.on('data', (b) => { erro += b.toString(); });
  const base = 'http://127.0.0.1:' + porta;
  return new Promise((resolve, reject) => {
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (proc.exitCode !== null) return reject(new Error('a sede do cliente morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('a sede do cliente nao subiu em 15s'));
      fetch(base + '/api/saude').then((r) => (r.ok ? resolve({ proc, base }) : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

(async function () {
  console.log('\nSCRIPT DE CLIENTES (scripts/sedes.sh), em modo simulado');
  if (spawnSync('bash', ['-c', 'true']).status !== 0) {
    console.log('  (sem bash nesta maquina - teste pulado)\n\n  0 passaram, 0 falharam\n');
    process.exit(0);
  }
  let sede = null;
  try {
    const etc = path.join(T, 'etc');

    // ---- antes de configurar, nada funciona
    conferir('criar sem configurar antes: recusa', sedes('criar', 'acme', '--nome', 'Acme', '--email-dominio', 'acme.com.br').codigo !== 0, true);

    // ---- configurar
    const conf = sedes('configurar', '--dominio-base', 'sedes.exemplo.com.br', '--email', 'ti@exemplo.com.br');
    conferir('configurar: funciona', conf.codigo, 0);
    const unidade = fs.readFileSync(path.join(T, 'systemd', 'sede@.service'), 'utf8');
    conferir('o molde do servico: usuario proprio por cliente', /User=sede-%i/.test(unidade), true);
    conferir('  nao le o .env da pasta do codigo (ARQUIVO_ENV=nenhum)', /Environment=ARQUIVO_ENV=nenhum/.test(unidade), true);
    conferir('  o arquivo do cliente vem DEPOIS do padrao (e ganha dele)',
      unidade.indexOf('padrao.env') < unidade.indexOf('%i.env') && unidade.indexOf('padrao.env') > 0, true);
    conferir('  so escreve na pasta do proprio cliente', /ReadWritePaths=.*\/%i/.test(unidade), true);
    conferir('  e tem teto de memoria e processador por cliente', /MemoryMax=/.test(unidade) && /CPUQuota=/.test(unidade), true);
    conferir('o padrao.env NAO tem nada que identifique cliente',
      /^(DOMINIOS_SEDE|DIRETORIA_EMAILS|CODIGO_SEDE|ADMIN_CODE|SESSION_SECRET|BACKUP_)/m.test(fs.readFileSync(path.join(etc, 'padrao.env'), 'utf8')), false);

    // ---- criar dois clientes
    const acme = sedes('criar', 'acme', '--nome', 'Acme "Consultoria"', '--email-dominio', 'ACME.com.br', '--diretoria', 'Ana@acme.com.br');
    const beta = sedes('criar', 'beta', '--nome', 'Beta', '--email-dominio', 'beta.com.br', '--sem-google');
    conferir('criar dois clientes: funciona', [acme.codigo, beta.codigo], [0, 0]);
    const a = lerEnv(path.join(etc, 'acme.env'));
    const b = lerEnv(path.join(etc, 'beta.env'));
    conferir('cada cliente ganha uma porta propria', [a.PORT, b.PORT], ['4001', '4002']);
    conferir('segredo de sessao e chave de backup sorteados por cliente (e compridos)',
      [a.SESSION_SECRET !== b.SESSION_SECRET, a.BACKUP_CHAVE !== b.BACKUP_CHAVE, a.SESSION_SECRET.length >= 64], [true, true, true]);
    conferir('pasta de dados propria', [a.DATA_DIR.endsWith('/acme'), b.DATA_DIR.endsWith('/beta')], [true, true]);
    conferir('dominio e diretoria em minuscula, nome sem aspas',
      [a.DOMINIOS_SEDE, a.DIRETORIA_EMAILS, a.NOME_SEDE], ['acme.com.br', 'ana@acme.com.br', 'Acme Consultoria']);
    conferir('o codigo de diretoria aparece UMA vez, na criacao', acme.saida.includes(a.ADMIN_CODE), true);
    conferir('--sem-google desliga o Google so pra aquele cliente',
      ['GOOGLE_CLIENT_ID' in b, b.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID' in a], [true, '', false]);
    const site = fs.readFileSync(path.join(T, 'nginx', 'sites-available', 'sede-acme'), 'utf8');
    conferir('nginx: o endereco do cliente vai pra porta DELE, com as linhas do WebSocket',
      [site.includes('server_name acme.sedes.exemplo.com.br;'), site.includes('proxy_pass http://127.0.0.1:4001;'), /Upgrade \$http_upgrade/.test(site)],
      [true, true, true]);

    // ---- o que tem que recusar
    conferir('cliente repetido: recusa', sedes('criar', 'acme', '--nome', 'X', '--email-dominio', 'x.com').codigo !== 0, true);
    conferir('nome reservado (www): recusa', sedes('criar', 'www', '--nome', 'X', '--email-dominio', 'x.com').codigo !== 0, true);
    conferir('nome com maiuscula ou espaco: recusa', sedes('criar', 'Minha Empresa', '--nome', 'X', '--email-dominio', 'x.com').codigo !== 0, true);
    conferir('esqueceu --email-dominio: recusa (senao ninguem entraria por e-mail sem ninguem perceber)',
      sedes('criar', 'gama', '--nome', 'Gama').codigo !== 0, true);
    conferir('dominio invalido: recusa', sedes('criar', 'gama', '--nome', 'Gama', '--email-dominio', 'gama com br').codigo !== 0, true);
    conferir('  e nenhuma tentativa recusada deixou arquivo pra tras', fs.existsSync(path.join(etc, 'gama.env')), false);

    // ---- listar
    const lista = sedes('listar').saida;
    conferir('listar mostra os dois clientes', [/acme\s+4001/.test(lista), /beta\s+4002/.test(lista)], [true, true]);

    // ---- a ponte: a configuracao gerada sobe uma sede de verdade, com o jeito do cliente
    const pastaAcme = doNode(a.DATA_DIR);
    conferir('o caminho de dados do arquivo aponta pra pasta que o script criou',
      path.resolve(pastaAcme), path.resolve(path.join(T, 'dados', 'acme')));
    sede = await subirSedeCom(Object.assign({}, a, { DATA_DIR: pastaAcme }), 3741);
    const opcoes = await (await fetch(sede.base + '/api/login-opcoes')).json();
    conferir('a sede sobe com o arquivo gerado e o dominio e o do cliente', opcoes.dominios, ['acme.com.br']);
    const diag = await (await fetch(sede.base + '/api/diagnostico')).json();
    conferir('  em producao, sem integracao herdada',
      [diag.producao, diag.integracoes.google, diag.integracoes.trello], [true, false, false]);
    // A prova de "grava na pasta DELA": uma conta criada aparece no arquivo de
    // contas dentro da pasta que o script separou pra esse cliente.
    const cadastro = await fetch(sede.base + '/api/registrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Ana', email: 'ana@acme.com.br', senha: 'senha-da-ana-1' }),
    });
    const contas = fs.existsSync(path.join(pastaAcme, 'usuarios.json'))
      ? JSON.parse(fs.readFileSync(path.join(pastaAcme, 'usuarios.json'), 'utf8')).usuarios.map((u) => u.email) : null;
    conferir('  e a conta criada fica na pasta DO cliente', [cadastro.status, contas], [200, ['ana@acme.com.br']]);

    // ---- remover
    const rem = sedes('remover', 'beta', '--sim');
    conferir('remover: funciona', rem.codigo, 0);
    const copias = fs.readdirSync(path.join(T, 'backups')).filter((n) => n.startsWith('beta-') && n.endsWith('.tar.gz'));
    conferir('antes de apagar, faz a copia final', copias.length, 1);
    conferir('apaga configuracao, dados e site do nginx DO cliente',
      [fs.existsSync(path.join(etc, 'beta.env')), fs.existsSync(path.join(T, 'dados', 'beta')), fs.existsSync(path.join(T, 'nginx', 'sites-available', 'sede-beta'))],
      [false, false, false]);
    conferir('  e nao encosta no outro cliente',
      [fs.existsSync(path.join(etc, 'acme.env')), fs.existsSync(path.join(T, 'dados', 'acme'))], [true, true]);
    conferir('remover cliente que nao existe: recusa', sedes('remover', 'zeta', '--sim').codigo !== 0, true);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    if (sede) await new Promise((r) => { sede.proc.once('exit', r); sede.proc.kill(); });
    try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
