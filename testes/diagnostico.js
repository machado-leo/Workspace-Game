// A rota /api/diagnostico, num servidor RECEM-CRIADO.
//
// Ela existe pro momento em que a sede acabou de subir num lugar novo e nada
// funciona - antes de existir a primeira conta. Por isso e publica, e por isso
// tem uma regra dura: **so SIM/NAO e a versao do Node**. Nenhum valor, nenhum
// caminho, nenhum e-mail. Este arquivo existe principalmente pra guardar essa
// regra: o teste do fim monta um servidor com TODAS as integracoes configuradas
// e confere que nenhum dos valores aparece na resposta.
//
// NAO mexe em server/data: DATA_DIR numa pasta temporaria, apagada no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PORTA = 3718;
const BASE = 'http://127.0.0.1:' + PORTA;
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

function novaPasta() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-diag-'));
  pastas.push(p);
  return p;
}

let servidor = null;
function subir(env) {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: novaPasta(), PORT: String(PORTA), SEM_LOGIN: '', NODE_ENV: 'test',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        CODIGO_SEDE: '', ADMIN_CODE: '', DIRETORIA_EMAILS: '',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_DRIVE_PASTA: '',
        GOOGLE_CONTA_SERVICO: '', GOOGLE_CONTA_SERVICO_ARQUIVO: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '',
        BACKUP_DRIVE_PASTA: '', BACKUP_CHAVE: '', EMAIL_PROVEDOR: '', EMAIL_CHAVE: '', EMAIL_REMETENTE: '', SITE_URL: '',
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
    // morto por sinal (o kill), o exitCode fica null e quem diz e o signalCode
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

function pedir(cabecalhos) {
  return fetch(BASE + '/api/diagnostico', { headers: cabecalhos || {} })
    .then(async (r) => ({ status: r.status, texto: await r.text() }))
    .then((r) => ({ status: r.status, texto: r.texto, corpo: JSON.parse(r.texto) }));
}

(async function () {
  console.log('\nDIAGNOSTICO DA HOSPEDAGEM');
  try {
    // ---------------------------------------------- servidor limpo, sem nada
    await subir();
    const limpo = await pedir();
    conferir('responde SEM login (e o ponto: nao ha conta ainda)', limpo.status, 200);
    conferir('  sede zerada: nenhuma conta, nenhuma diretoria',
      [limpo.corpo.contas, limpo.corpo.diretoria], [0, 0]);
    conferir('  diz a versao do Node e se ela serve',
      [limpo.corpo.node === process.versions.node, limpo.corpo.nodeSuficiente], [true, true]);
    conferir('  a pasta de dados aceita escrita', limpo.corpo.dadosGravavel, true);
    conferir('  nenhuma integracao configurada', limpo.corpo.integracoes,
      { google: false, drive: false, trello: false, kanban: false, turn: false, backup: false, email: false, discador: false });

    // Conexao direta: o IP que chega e o da pessoa mesmo.
    conferir('sem proxy no meio: IP por pessoa',
      [limpo.corpo.atrasDeProxy, limpo.corpo.ipPorPessoa], [false, true]);
    const comProxy = await pedir({ 'X-Forwarded-For': '203.0.113.7' });
    conferir('com X-Forwarded-For: reconhece o proxy e o IP real chega',
      [comProxy.corpo.atrasDeProxy, comProxy.corpo.ipPorPessoa], [true, true]);
    await parar();

    // ------------------------------------------- tudo configurado: nao vaza
    const segredos = {
      GOOGLE_CLIENT_ID: 'id-secreto-do-cliente', GOOGLE_CLIENT_SECRET: 'senha-do-cliente',
      GOOGLE_DRIVE_PASTA: '0ABCpastaDoDrive', GOOGLE_CONTA_SERVICO: '{"client_email":"robo@projeto.iam.gserviceaccount.com","private_key":"chave-falsa-so-pro-teste"}',
      TRELLO_API_KEY: 'chave-do-trello', TRELLO_TOKEN: 'token-do-trello', TRELLO_BOARD_ID: 'quadro123',
      CLOUDFLARE_TURN_KEY_ID: 'turn-id', CLOUDFLARE_TURN_TOKEN: 'turn-token',
      BACKUP_DRIVE_PASTA: '0ABCpastaDoBackup', BACKUP_CHAVE: 'chave-do-backup-bem-comprida',
      EMAIL_PROVEDOR: 'resend', EMAIL_CHAVE: 're_chave-secreta-do-email', EMAIL_REMETENTE: 'avisos@sedes.exemplo.com.br',
      // sem o endereco publico, em producao o e-mail fica desligado (testes/email.js)
      SITE_URL: 'https://acme.sedes.exemplo.com.br',
      CRM_URL: 'https://crm-secreto.exemplo.com.br', CRM_CHAVE_DISCADOR: 'chave-do-discador-com-mais-de-trinta-e-dois',
      CRM_CHAVE_KANBAN: 'chave-do-kanban-com-mais-de-trinta-e-dois-caracteres',
      NODE_ENV: 'production',
    };
    await subir(segredos);
    const cheio = await pedir();
    conferir('com tudo configurado: diz que esta configurado', cheio.corpo.integracoes,
      { google: true, drive: true, trello: false, kanban: true, turn: true, backup: true, email: true, discador: true });
    conferir('  e sabe que esta em producao', cheio.corpo.producao, true);

    // A REGRA: nenhum valor sai daqui.
    const vazou = Object.entries(segredos)
      .filter(([chave, valor]) => chave !== 'NODE_ENV' && cheio.texto.includes(valor))
      .map(([chave]) => chave);
    conferir('NAO vaza nenhum valor das variaveis', vazou, []);
    conferir('  nem caminho de pasta (DATA_DIR, server/data)',
      /data|\/|\\\\/.test(cheio.texto.replace(/"[a-z]+":/gi, '')), false);
    conferir('  nem e-mail nenhum', /@/.test(cheio.texto), false);
    conferir('  so os campos combinados', Object.keys(cheio.corpo).sort(),
      ['atrasDeProxy', 'contas', 'dadosGravavel', 'diretoria', 'integracoes', 'ipPorPessoa', 'node', 'nodeSuficiente', 'producao']);
    await parar();

    // A chave do Drive SO no arquivo secreto (o "Secret File" do Render): o diagnostico tem que
    // dizer que o Drive esta ligado - e por ele que se confere se o arquivo foi posto certo.
    const arquivoChave = path.join(novaPasta(), 'conta-servico.json');
    fs.writeFileSync(arquivoChave, JSON.stringify({ client_email: 'robo@projeto.iam.gserviceaccount.com', private_key: 'chave-falsa-so-pro-teste' }));
    await subir({ GOOGLE_DRIVE_PASTA: '0ABCpastaDoDrive', GOOGLE_CONTA_SERVICO_ARQUIVO: arquivoChave });
    const soArquivo = await pedir();
    conferir('chave do Drive so no arquivo secreto (Secret File do Render): drive ligado', soArquivo.corpo.integracoes.drive, true);
    conferir('  e nem o caminho nem o conteudo do arquivo aparecem no diagnostico',
      /conta-servico|chave-falsa|@/.test(soArquivo.texto), false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
