// Backup automatico dos dados da sede. Ver docs/backup.md.
//
// O QUE PROTEGE
// A sede guarda tudo em JSON no disco (contas, chat, reunioes, mesas, mapa).
// Sem copia, tres coisas apagam isso de vez: o disco da hospedagem (no Render
// gratis ele SOME quando o site dorme ou atualiza), um arquivo corrompido, e
// erro humano - alguem da diretoria removendo a pessoa errada.
//
// DUAS COPIAS, PORQUE SAO DOIS PERIGOS
//   local  DATA_DIR/backups: uma por hora quando algo mudou, as ultimas 48. Salva
//          de arquivo corrompido e de erro humano. NAO salva de perder o disco -
//          ela mora no mesmo disco.
//   Drive  um drive compartilhado da ADM, pela mesma conta de servico da
//          biblioteca: poucos minutos depois de cada mudanca, e na saida do
//          servidor. Salva de tudo, inclusive do disco sumir.
//
// CRIPTOGRAFADO NO DRIVE, SEMPRE
// O pacote tem as mensagens DIRETAS do chat e o hash das senhas. Quem tiver
// acesso ao drive de backup nao pode ler DM de ninguem. Sem BACKUP_CHAVE nao
// sobe nada pro Drive (a copia local continua): backup em texto aberto numa
// pasta compartilhada seria trocar um risco por outro.
//
// O QUE FICA DE FORA, DE PROPOSITO
//   google.json  tokens do Google Agenda de cada pessoa. Vazar e caro (acesso a
//                agenda dela); perder e barato (a pessoa clica "conectar").
//   capas/       o navegador refaz sozinho.
//   livros/      moram no Drive da biblioteca.
//   backups/     backup de backup.
//
// VOLTA SOZINHO
// Servidor subindo com a pasta de dados vazia e backup no Drive configurado:
// restaura o mais recente ANTES de carregar as contas (server/iniciar.js). E o
// que faz o Render gratis parar de apagar as contas quando dorme.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const pastaDados = require('./dados');
const acervo = require('./acervo');

const ARQUIVOS = [
  'usuarios.json', 'config.json', 'chat.json', 'mesas.json', 'reunioes.json',
  'mapa.json', 'codigo-sede.txt', 'codigo-admin.txt', 'emprestimos.json',
];
const PREFIXO = 'sede-backup-';
const MAGICO = Buffer.from('SEDEBKP1');
const PASTA_LOCAL = pastaDados.arquivo('backups');

const OLHAR_A_CADA_MS = 60 * 1000;
const DRIVE_MIN_INTERVALO_MS = 5 * 60 * 1000;   // mudou: sobe no maximo a cada 5 min
const LOCAL_MIN_INTERVALO_MS = 60 * 60 * 1000;  // copia local: no maximo 1 por hora
const LOCAIS_MAX = 48;
const DRIVE_RECENTES = 30;                       // os 30 mais novos ficam sempre...
const DRIVE_DIAS = 30;                           // ...e mais 1 por dia, por 30 dias
const ESCOPO_ESCRITA = 'https://www.googleapis.com/auth/drive';

// ------------------------------------------------------------------ pacote

// Conteudo atual dos arquivos que existem. `null` = nada pra guardar ainda.
function lerArquivos(pasta = pastaDados.PASTA) {
  const arquivos = {};
  for (const nome of ARQUIVOS) {
    const p = path.join(pasta, nome);
    if (fs.existsSync(p)) arquivos[nome] = fs.readFileSync(p).toString('base64');
  }
  return Object.keys(arquivos).length ? arquivos : null;
}

// Impressao digital do CONTEUDO: e o que decide se ha backup novo a fazer.
function impressao(arquivos) {
  const h = crypto.createHash('sha256');
  Object.keys(arquivos).sort().forEach((k) => h.update(k + '\0' + arquivos[k] + '\0'));
  return h.digest('hex');
}

function chave() {
  const bruto = String(process.env.BACKUP_CHAVE || '').trim();
  return bruto.length >= 16 ? bruto : null;
}

// JSON -> gzip -> AES-256-GCM. A chave de verdade sai da BACKUP_CHAVE por scrypt
// com sal aleatorio por arquivo; o GCM tambem acusa arquivo adulterado ou
// cortado no meio, em vez de restaurar lixo.
//   [SEDEBKP1][sal 16][iv 12][tag 16][dados cifrados]
function empacotar(arquivos, segredo, criadoEm = Date.now()) {
  const claro = zlib.gzipSync(JSON.stringify({ versao: 1, criadoEm, arquivos }));
  if (!segredo) return claro;
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const k = crypto.scryptSync(segredo, sal, 32);
  const cifra = crypto.createCipheriv('aes-256-gcm', k, iv);
  const dados = Buffer.concat([cifra.update(claro), cifra.final()]);
  return Buffer.concat([MAGICO, sal, iv, cifra.getAuthTag(), dados]);
}

function desempacotar(buf, segredo) {
  let claro = buf;
  if (buf.subarray(0, MAGICO.length).equals(MAGICO)) {
    if (!segredo) throw new Error('backup criptografado e BACKUP_CHAVE nao definida');
    let o = MAGICO.length;
    const sal = buf.subarray(o, o += 16);
    const iv = buf.subarray(o, o += 12);
    const tag = buf.subarray(o, o += 16);
    const decifra = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(segredo, sal, 32), iv);
    decifra.setAuthTag(tag);
    try {
      claro = Buffer.concat([decifra.update(buf.subarray(o)), decifra.final()]);
    } catch (e) {
      throw new Error('nao abriu: BACKUP_CHAVE errada ou arquivo corrompido');
    }
  }
  const pacote = JSON.parse(zlib.gunzipSync(claro).toString('utf8'));
  if (!pacote || pacote.versao !== 1 || typeof pacote.arquivos !== 'object') throw new Error('pacote de backup invalido');
  // so nomes conhecidos: um pacote adulterado nao pode escrever fora da lista
  // (e muito menos fora da pasta, com "../")
  for (const nome of Object.keys(pacote.arquivos)) {
    if (!ARQUIVOS.includes(nome)) throw new Error('pacote com arquivo desconhecido: ' + nome);
  }
  return pacote;
}

// Escreve os arquivos do pacote na pasta. O que estava la vai antes pra
// `antes-da-restauracao-<data>/`: restaurar o backup errado nao pode ser mais um
// jeito de perder dado.
function aplicar(pacote, pasta = pastaDados.PASTA) {
  fs.mkdirSync(pasta, { recursive: true });
  const atuais = ARQUIVOS.filter((n) => fs.existsSync(path.join(pasta, n)));
  let guardadoEm = null;
  if (atuais.length) {
    guardadoEm = path.join(pasta, 'antes-da-restauracao-' + carimbo(Date.now()));
    fs.mkdirSync(guardadoEm, { recursive: true });
    atuais.forEach((n) => fs.copyFileSync(path.join(pasta, n), path.join(guardadoEm, n)));
  }
  for (const [nome, b64] of Object.entries(pacote.arquivos)) {
    pastaDados.gravarSeguro(path.join(pasta, nome), Buffer.from(b64, 'base64').toString('utf8'));
  }
  return { arquivos: Object.keys(pacote.arquivos), guardadoEm };
}

function carimbo(ms) {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

function nomeDoBackup(ms) {
  return PREFIXO + carimbo(ms) + '.bin';
}

// "sede-backup-2026-09-14T03-14-00Z.bin" -> ms
function quandoDoNome(nome) {
  const m = String(nome).match(/^sede-backup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.bin$/);
  return m ? Date.parse(m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4] + 'Z') : NaN;
}

// Quais apagar do Drive: ficam os DRIVE_RECENTES mais novos, e alem deles o
// mais novo de cada dia dos ultimos DRIVE_DIAS. Um dia de muita mudanca nao
// empurra pra fora a copia de semana passada.
function quaisApagar(nomes, agora = Date.now()) {
  const validos = nomes.filter((n) => !Number.isNaN(quandoDoNome(n)))
    .sort((a, b) => quandoDoNome(b) - quandoDoNome(a));
  const fica = new Set(validos.slice(0, DRIVE_RECENTES));
  const diasVistos = new Set();
  for (const n of validos) {
    const t = quandoDoNome(n);
    if (agora - t > DRIVE_DIAS * 86400000) continue;
    const dia = new Date(t).toISOString().slice(0, 10);
    if (!diasVistos.has(dia)) { diasVistos.add(dia); fica.add(n); }
  }
  return validos.filter((n) => !fica.has(n));
}

// ------------------------------------------------------------ copia local

function copiaLocal(arquivos, agora = Date.now(), pasta = PASTA_LOCAL) {
  fs.mkdirSync(pasta, { recursive: true });
  const nome = nomeDoBackup(agora);
  // local sem criptografia: mora no mesmo disco dos dados, nao expoe nada novo
  fs.writeFileSync(path.join(pasta, nome), empacotar(arquivos, null, agora));
  const todos = fs.readdirSync(pasta).filter((n) => !Number.isNaN(quandoDoNome(n)))
    .sort((a, b) => quandoDoNome(b) - quandoDoNome(a));
  todos.slice(LOCAIS_MAX).forEach((n) => fs.rmSync(path.join(pasta, n), { force: true }));
  return nome;
}

// ------------------------------------------------------------------ Drive

function pastaDoBackup() {
  const v = String(process.env.BACKUP_DRIVE_PASTA || '').trim();
  const m = v.match(/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{10,}$/.test(v) ? v : '');
}

// So em PRODUCAO. O PC de desenvolvimento subindo com a mesma .env mandaria as
// contas de teste pro backup de verdade - e, pior, com a pasta vazia RESTAURARIA
// as DMs da sede no computador de quem esta programando. BACKUP_EM_DEV=1 libera
// de proposito (pra testar o proprio backup).
function producao() {
  return process.env.NODE_ENV === 'production' || process.env.BACKUP_EM_DEV === '1';
}

function driveConfigurado() {
  return !!(producao() && pastaDoBackup() && acervo.contaDeServico() && chave());
}

let token = null;   // { valor, expira }

async function tokenDeEscrita() {
  if (token && token.expira > Date.now() + 60000) return token.valor;
  const conta = acervo.contaDeServico();
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: acervo.montarJwt(conta, undefined, ESCOPO_ESCRITA),
    }),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || !dados.access_token) throw new Error('o Google recusou a conta de servico (' + resp.status + ')');
  token = { valor: dados.access_token, expira: Date.now() + (dados.expires_in || 3600) * 1000 };
  return token.valor;
}

async function google(url, opcoes = {}) {
  const resp = await fetch(url, Object.assign({}, opcoes, {
    headers: Object.assign({ Authorization: 'Bearer ' + await tokenDeEscrita() }, opcoes.headers || {}),
    signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
  }));
  if (!resp.ok) {
    let motivo = resp.status;
    try { motivo = (await resp.json()).error.message || motivo; } catch (e) { /* sem corpo */ }
    throw new Error('Drive: ' + motivo);
  }
  return resp;
}

// A raiz de um drive compartilhado precisa de corpora+driveId na busca, senao a
// API responde 200 com zero arquivos (mesma pegadinha do acervo.js).
let ehDrive = null;
async function paramsDeBusca() {
  const id = pastaDoBackup();
  if (ehDrive === null) {
    const r = await fetch('https://www.googleapis.com/drive/v3/drives/' + id + '?fields=id', {
      headers: { Authorization: 'Bearer ' + await tokenDeEscrita() },
    });
    ehDrive = r.ok;
  }
  const p = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' };
  if (ehDrive) Object.assign(p, { corpora: 'drive', driveId: id });
  return p;
}

async function listarNoDrive() {
  const q = `'${pastaDoBackup()}' in parents and trashed = false and name contains '${PREFIXO}'`;
  const params = new URLSearchParams(Object.assign({
    q, fields: 'files(id,name,size)', pageSize: '1000', orderBy: 'name desc',
  }, await paramsDeBusca()));
  const r = await google('https://www.googleapis.com/drive/v3/files?' + params);
  return ((await r.json()).files || []).filter((f) => !Number.isNaN(quandoDoNome(f.name)));
}

async function enviarProDrive(conteudo, nome) {
  const limite = 'sede' + crypto.randomBytes(8).toString('hex');
  const meta = JSON.stringify({ name: nome, parents: [pastaDoBackup()], mimeType: 'application/octet-stream' });
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    conteudo,
    Buffer.from(`\r\n--${limite}--`),
  ]);
  const r = await google('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + limite },
    body: corpo,
  });
  return r.json();
}

async function baixarDoDrive(id) {
  const r = await google('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true');
  return Buffer.from(await r.arrayBuffer());
}

async function limparDrive() {
  const arquivos = await listarNoDrive();
  const apagar = new Set(quaisApagar(arquivos.map((f) => f.name)));
  // LIXEIRA, e nao DELETE: backup velho sai da lista mas fica 30 dias
  // recuperavel no Drive. Apagar de vez e o unico erro sem volta num backup.
  for (const f of arquivos.filter((x) => apagar.has(x.name))) {
    await google('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '?supportsAllDrives=true', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }
  return apagar.size;
}

// ------------------------------------------------------------- o agendador

const estado = {
  ultimaImpressaoDrive: null, ultimoDriveEm: 0,
  ultimaImpressaoLocal: null, ultimoLocalEm: 0,
  ultimoErro: null, enviando: null,
  // A restauracao falhou com a pasta vazia: NADA sobe pro Drive neste processo.
  // Senao o proximo backup seria de uma sede vazia, viraria o "mais recente", e
  // o arranque seguinte restauraria o vazio. Os backups bons continuam la.
  envioTravado: false,
};

function travarEnvio() {
  estado.envioTravado = true;
}

// Faz o que estiver devido agora. `forcar` ignora o intervalo minimo (saida do
// servidor): o que mudou nos ultimos minutos nao pode morrer junto com ele.
async function rodada({ forcar = false, agora = Date.now() } = {}) {
  const arquivos = lerArquivos();
  if (!arquivos) return { nada: true };
  const imp = impressao(arquivos);
  const feito = {};

  if (imp !== estado.ultimaImpressaoLocal && (forcar || agora - estado.ultimoLocalEm >= LOCAL_MIN_INTERVALO_MS)) {
    try {
      feito.local = copiaLocal(arquivos, agora);
      estado.ultimaImpressaoLocal = imp;
      estado.ultimoLocalEm = agora;
    } catch (e) {
      console.error('[backup] copia local falhou: ' + e.message);
    }
  }

  if (driveConfigurado() && !estado.envioTravado && imp !== estado.ultimaImpressaoDrive
    && (forcar || agora - estado.ultimoDriveEm >= DRIVE_MIN_INTERVALO_MS)) {
    if (estado.enviando) return feito;   // nao sobrepoe dois envios
    estado.enviando = (async () => {
      try {
        const nome = nomeDoBackup(agora);
        await enviarProDrive(empacotar(arquivos, chave(), agora), nome);
        estado.ultimaImpressaoDrive = imp;
        estado.ultimoDriveEm = agora;
        estado.ultimoErro = null;
        feito.drive = nome;
        const apagados = await limparDrive().catch(() => 0);
        if (apagados) feito.apagadosNoDrive = apagados;
      } catch (e) {
        estado.ultimoErro = e.message;
        console.error('[backup] envio pro Drive falhou: ' + e.message);
      } finally {
        estado.enviando = null;
      }
    })();
    await estado.enviando;
  }
  return feito;
}

let relogio = null;

function agendar() {
  if (relogio) return;
  if (!driveConfigurado()) {
    const falta = [!producao() && 'NODE_ENV=production (em dev o Drive fica de fora)',!pastaDoBackup() && 'BACKUP_DRIVE_PASTA', !chave() && 'BACKUP_CHAVE', !acervo.contaDeServico() && 'GOOGLE_CONTA_SERVICO']
      .filter(Boolean).join(', ');
    console.log('[backup] so copia local (DATA_DIR/backups). Pro Drive falta: ' + falta);
  } else {
    console.log('[backup] local + Drive criptografado ligados.');
  }
  relogio = setInterval(() => { rodada().catch(() => {}); }, OLHAR_A_CADA_MS);
  relogio.unref();
}

// Na saida do servidor (deploy, restart, o Render dormindo): manda o que mudou,
// com prazo - a hospedagem espera ~30s antes de matar o processo.
async function naSaida(prazoMs = 20000) {
  await Promise.race([
    rodada({ forcar: true }).catch(() => {}),
    new Promise((ok) => setTimeout(ok, prazoMs)),
  ]);
}

// ------------------------------------------------------------ restauracao

// Chamado pelo iniciar.js antes de qualquer modulo carregar dados. So age com a
// pasta VAZIA (sem usuarios.json): com dado no disco, o disco e a verdade.
async function restaurarSeVazio() {
  if (fs.existsSync(path.join(pastaDados.PASTA, 'usuarios.json'))) return { motivo: 'ja tem dados' };
  if (!driveConfigurado()) return { motivo: 'backup no Drive nao configurado' };
  const lista = await listarNoDrive();
  if (!lista.length) return { motivo: 'nenhum backup no Drive ainda' };
  const maisNovo = lista.sort((a, b) => quandoDoNome(b.name) - quandoDoNome(a.name))[0];
  const pacote = desempacotar(await baixarDoDrive(maisNovo.id), chave());
  const r = aplicar(pacote);
  // o que acabou de voltar ja esta no Drive: nao precisa subir de novo
  estado.ultimaImpressaoDrive = impressao(lerArquivos());
  estado.ultimoDriveEm = Date.now();
  return { restaurado: maisNovo.name, arquivos: r.arquivos };
}

module.exports = {
  agendar,
  travarEnvio,
  rodada,
  naSaida,
  restaurarSeVazio,
  driveConfigurado,
  listarNoDrive,
  baixarDoDrive,
  desempacotar,
  aplicar,
  chave,
  PASTA_LOCAL,
  ARQUIVOS,
  // expostos pro testes/backup.js
  _empacotar: empacotar,
  _impressao: impressao,
  _lerArquivos: lerArquivos,
  _quaisApagar: quaisApagar,
  _quandoDoNome: quandoDoNome,
  _nomeDoBackup: nomeDoBackup,
  _copiaLocal: copiaLocal,
  _estado: estado,
  _zerar: () => {
    Object.assign(estado, { ultimaImpressaoDrive: null, ultimoDriveEm: 0, ultimaImpressaoLocal: null, ultimoLocalEm: 0, ultimoErro: null, enviando: null, envioTravado: false });
    token = null; ehDrive = null;
  },
};
