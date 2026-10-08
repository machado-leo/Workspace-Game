// Backup automatico (server/backup.js), com um Google Drive FALSO em memoria.
//
// Backup que nunca foi restaurado e so esperanca. Por isso o centro deste teste
// e a volta: pasta apagada, servidor subindo, dados de volta - e os jeitos de
// dar errado sem ninguem ver (chave errada, arquivo adulterado, a sede vazia
// subindo por cima dos backups bons).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const bate = JSON.stringify(veio) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio)));
  bate ? ok++ : falhou++;
}

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-backup-'));
process.env.DATA_DIR = PASTA;
process.env.NODE_ENV = 'production';
process.env.BACKUP_CHAVE = 'uma-chave-de-teste-bem-comprida';
process.env.BACKUP_DRIVE_PASTA = '0AAdriveDeBackupTeste';
delete process.env.BACKUP_EM_DEV;
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.GOOGLE_CONTA_SERVICO = JSON.stringify({ client_email: 'robo@teste.iam.gserviceaccount.com', private_key: privateKey });

// ---------------------------------------------------------- Drive falso
const drive = new Map();   // id -> { name, dados: Buffer }
let proximoId = 1;
let apagadosDeVez = 0;
const lixeira = [];
const pedidos = [];
const escoposPedidos = [];
global.fetch = async (url, opcoes = {}) => {
  const u = new URL(url);
  pedidos.push((opcoes.method || 'GET') + ' ' + u.pathname);
  const json = (obj, status = 200) => ({ ok: status < 300, status, json: async () => obj, arrayBuffer: async () => new ArrayBuffer(0) });
  if (u.hostname === 'oauth2.googleapis.com') {
    const jwt = new URLSearchParams(opcoes.body).get('assertion');
    escoposPedidos.push(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).scope);
    return json({ access_token: 'tok', expires_in: 3600 });
  }
  if (u.pathname.startsWith('/drive/v3/drives/')) return json({ id: 'x' });
  if (u.pathname === '/upload/drive/v3/files') {
    const corpo = opcoes.body;
    const limite = opcoes.headers['Content-Type'].split('boundary=')[1];
    const texto = corpo.toString('latin1');
    const meta = JSON.parse(texto.split('\r\n\r\n')[1].split('\r\n--' + limite)[0]);
    const inicio = texto.indexOf('\r\n\r\n', texto.indexOf('application/octet-stream')) + 4;
    const fim = texto.lastIndexOf('\r\n--' + limite + '--');
    const id = 'f' + proximoId++;
    drive.set(id, { name: meta.name, parents: meta.parents, dados: corpo.subarray(inicio, fim) });
    return json({ id, name: meta.name });
  }
  if (u.pathname === '/drive/v3/files') {
    const files = [...drive.entries()].map(([id, f]) => ({ id, name: f.name, size: String(f.dados.length) }));
    return json({ files });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
  if (m && opcoes.method === 'DELETE') { apagadosDeVez++; drive.delete(decodeURIComponent(m[1])); return json({}, 204); }
  if (m && opcoes.method === 'PATCH' && JSON.parse(opcoes.body).trashed) { lixeira.push(drive.get(decodeURIComponent(m[1])).name); drive.delete(decodeURIComponent(m[1])); return json({}); }
  if (m && u.searchParams.get('alt') === 'media') {
    const f = drive.get(decodeURIComponent(m[1]));
    return { ok: !!f, status: f ? 200 : 404, arrayBuffer: async () => f.dados.buffer.slice(f.dados.byteOffset, f.dados.byteOffset + f.dados.length) };
  }
  return json({ erro: 'rota falsa nao prevista: ' + u.pathname }, 500);
};
const erroOriginal = console.error;

const backup = require('../server/backup');
const escrever = (nome, texto) => fs.writeFileSync(path.join(PASTA, nome), texto);
const ler = (nome) => fs.readFileSync(path.join(PASTA, nome), 'utf8');

console.log('\nBACKUP');

(async function () {
  try {
    // ------------------------------------------------------------- pacote
    escrever('usuarios.json', '{"usuarios":[{"id":"u1","nome":"Ana","senhaHash":"abc"}]}');
    escrever('chat.json', '{"conversas":{"dm:u1|u2":[{"texto":"segredo da DM"}]}}');
    escrever('google.json', '{"contas":{"u1":{"refreshToken":"NAO-PODE-SAIR"}}}');
    const arquivos = backup._lerArquivos();
    conferir('entra conta e chat', Object.keys(arquivos).sort(), ['chat.json', 'usuarios.json']);
    conferir('token do Google (google.json) fica de fora', 'google.json' in arquivos, false);

    const cifrado = backup._empacotar(arquivos, process.env.BACKUP_CHAVE);
    conferir('no Drive vai cifrado: a DM nao aparece nos bytes', cifrado.toString('latin1').includes('segredo'), false);
    conferir('abre com a chave certa', Buffer.from(backup.desempacotar(cifrado, process.env.BACKUP_CHAVE).arquivos['chat.json'], 'base64').toString(), ler('chat.json'));
    let erro = null;
    try { backup.desempacotar(cifrado, 'outra-chave-qualquer-comprida'); } catch (e) { erro = e.message; }
    conferir('chave errada: recusa (nao restaura lixo)', /BACKUP_CHAVE errada/.test(erro || ''), true);
    const adulterado = Buffer.from(cifrado); adulterado[adulterado.length - 5] ^= 0xff;
    erro = null;
    try { backup.desempacotar(adulterado, process.env.BACKUP_CHAVE); } catch (e) { erro = e.message; }
    conferir('arquivo adulterado ou cortado: recusa', /corrompido/.test(erro || ''), true);
    const malicioso = backup._empacotar({ '../../server/index.js': Buffer.from('x').toString('base64') }, process.env.BACKUP_CHAVE);
    erro = null;
    try { backup.desempacotar(malicioso, process.env.BACKUP_CHAVE); } catch (e) { erro = e.message; }
    conferir('pacote tentando escrever fora da lista: recusa', /desconhecido/.test(erro || ''), true);

    // ------------------------------------------------------ retencao Drive
    const agora = Date.parse('2026-09-14T12:00:00Z');
    const nomes = [];
    for (let h = 0; h < 24 * 45; h += 2) nomes.push(backup._nomeDoBackup(agora - h * 3600000));
    const apagar = new Set(backup._quaisApagar(nomes, agora));
    const ficam = nomes.filter((n) => !apagar.has(n));
    conferir('retencao: os 30 mais novos ficam', nomes.slice(0, 30).every((n) => !apagar.has(n)), true);
    conferir('  e 1 por dia nos ultimos 30 dias', new Set(ficam.map((n) => n.slice(12, 22))).size, 31);
    conferir('  e nada com mais de 30 dias', ficam.every((n) => agora - backup._quandoDoNome(n) <= 31 * 86400000), true);

    // a limpeza de verdade, pelo Drive falso: 35 backups velhos + os novos
    //
    // Datados a partir do `agora` do teste, e NAO de `Date.now()`. Com
    // `Date.now()` este teste APODRECIA COM O CALENDARIO: os backups de verdade
    // nascem no relogio fixo (14/09/2026) e os "velhos" nasciam relativos ao
    // dia em que a bateria rodasse. Escrito no dia 15 funcionava - o mais velho
    // caia no dia 13. Rodando no dia 17, o "velho1" caia no dia 15, virava o
    // MAIS NOVO do Drive, e a restauracao pegava esse arquivo de 1 byte:
    // "unexpected end of file" no gunzip, tres dias depois, sem ninguem ter
    // tocado no codigo.
    //
    // Agora eles ficam sempre ATRAS do `agora`, e a conta para de depender de
    // que dia e hoje.
    for (let d = 1; d <= 35; d++) {
      const id = 'velho' + d;
      drive.set(id, { name: backup._nomeDoBackup(agora - d * 40 * 86400000 / 35 - 86400000), parents: ['0AAdriveDeBackupTeste'], dados: Buffer.alloc(1) });
    }
    // -------------------------------------------------------- copia local
    for (let i = 0; i < 55; i++) backup._copiaLocal(arquivos, agora - i * 3600000);
    conferir('copia local guarda so as 48 mais novas', fs.readdirSync(backup.PASTA_LOCAL).length, 48);
    fs.rmSync(backup.PASTA_LOCAL, { recursive: true, force: true });

    // ------------------------------------------------------------- rodada
    backup._zerar();
    let r = await backup.rodada({ agora });
    conferir('primeira rodada: copia local E Drive', [!!r.local, !!r.drive], [true, true]);
    conferir('  subiu com escopo de escrita so pra isso', escoposPedidos.includes('https://www.googleapis.com/auth/drive'), true);
    conferir('  o arquivo esta no Drive, na pasta certa', ([...drive.values()].find((f) => f.name === r.drive) || {}).parents, ['0AAdriveDeBackupTeste']);
    conferir('  backup com mais de 30 dias vai pra LIXEIRA do Drive', lixeira.length > 0 && lixeira.every((n) => Date.now() - backup._quandoDoNome(n) > 30 * 86400000), true);
    conferir('  e nunca e apagado de vez (da pra recuperar)', apagadosDeVez, 0);
    r = await backup.rodada({ agora: agora + 10 * 60000 });
    conferir('nada mudou: nao sobe de novo', r, {});
    escrever('chat.json', '{"conversas":{"canal:geral":[{"texto":"nova"}]}}');
    r = await backup.rodada({ agora: agora + 12 * 60000 });
    conferir('mudou: sobe pro Drive (a local espera a hora)', [!!r.local, !!r.drive], [false, true]);
    escrever('chat.json', '{"conversas":{"canal:geral":[{"texto":"mais uma"}]}}');
    r = await backup.rodada({ agora: agora + 13 * 60000 });
    conferir('mudou de novo 1 min depois: espera os 5 min', !!r.drive, false);
    r = await backup.rodada({ agora: agora + 13.5 * 60000, forcar: true });
    conferir('  mas na saida do servidor sobe na hora', [!!r.drive, !!r.local], [true, true]);

    // falha do Drive nao derruba nada
    console.error = () => {};
    const fetchBom = global.fetch;
    global.fetch = async (url, o) => (String(url).includes('/upload/') ? { ok: false, status: 503, json: async () => ({ error: { message: 'fora do ar' } }) } : fetchBom(url, o));
    escrever('mesas.json', '{"mesas":[]}');
    r = await backup.rodada({ agora: agora + 30 * 60000 });
    conferir('Drive fora do ar: nao quebra, e guarda o erro', [!!r.drive, backup._estado.ultimoErro], [false, 'Drive: fora do ar']);
    global.fetch = fetchBom;
    r = await backup.rodada({ agora: agora + 40 * 60000 });
    conferir('  e sobe na rodada seguinte, quando voltar', !!r.drive, true);
    console.error = erroOriginal;

    // --------------------------------------------- volta sozinho (o ponto)
    const antes = { usuarios: ler('usuarios.json'), chat: ler('chat.json'), mesas: ler('mesas.json') };
    ['usuarios.json', 'chat.json', 'mesas.json', 'google.json'].forEach((n) => fs.rmSync(path.join(PASTA, n)));
    backup._zerar();
    const volta = await backup.restaurarSeVazio();
    conferir('pasta apagada: restaura o mais novo do Drive', !!volta.restaurado, true);
    conferir('  contas, chat e mesas exatamente como estavam',
      { usuarios: ler('usuarios.json'), chat: ler('chat.json'), mesas: ler('mesas.json') }, antes);
    conferir('  e o que acabou de voltar nao sobe de novo', await backup.rodada({ agora: Date.now() + 3600000 }).then((x) => !!x.drive), false);

    conferir('com dados no disco: NAO restaura por cima', (await backup.restaurarSeVazio()).motivo, 'ja tem dados');

    // ----------------------------------------------- restauracao que falha
    fs.rmSync(path.join(PASTA, 'usuarios.json'));
    process.env.BACKUP_CHAVE = 'chave-trocada-por-engano-no-painel';
    backup._zerar();
    erro = null;
    try { await backup.restaurarSeVazio(); } catch (e) { erro = e.message; }
    conferir('chave errada no arranque: avisa (o iniciar.js mostra o erro)', /BACKUP_CHAVE errada/.test(erro || ''), true);
    backup.travarEnvio();
    const quantosAntes = drive.size;
    escrever('usuarios.json', '{"usuarios":[]}');   // sede subindo vazia
    r = await backup.rodada({ agora: Date.now() + 7200000, forcar: true });
    conferir('  e a sede vazia NAO sobe por cima dos backups bons', drive.size, quantosAntes);
    process.env.BACKUP_CHAVE = 'uma-chave-de-teste-bem-comprida';

    // ------------------------------------------- aplicar guarda o anterior
    escrever('usuarios.json', '{"usuarios":["o de agora"]}');
    const pac = backup.desempacotar(drive.get([...drive.keys()].pop()).dados, process.env.BACKUP_CHAVE);
    const ap = backup.aplicar(pac);
    conferir('restaurar guarda antes o que estava na pasta', fs.readFileSync(path.join(ap.guardadoEm, 'usuarios.json'), 'utf8'), '{"usuarios":["o de agora"]}');

    // ---------------------------------------------------------- fora de producao
    process.env.NODE_ENV = 'development';
    conferir('em desenvolvimento o Drive fica de fora (nem sobe, nem restaura)', backup.driveConfigurado(), false);
    process.env.NODE_ENV = 'production';
    delete process.env.BACKUP_CHAVE;
    conferir('sem BACKUP_CHAVE nada vai pro Drive (nunca em texto aberto)', backup.driveConfigurado(), false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU com erro: ' + e.stack);
  } finally {
    console.error = erroOriginal;
    fs.rmSync(PASTA, { recursive: true, force: true });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
