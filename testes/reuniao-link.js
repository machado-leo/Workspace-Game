// Reuniao por LINK, testada de ponta a ponta: quem e de fora entra so na chamada
// de UMA reuniao, pelo link dela, e nao ve mais nada da sede. Ver
// docs/plano-reuniao-por-link.md.
//
// Este teste substitui o do "link de visitante" antigo (testes/convidado.js), que
// dava ao visitante uma conta de verdade e depois tentava fechar, uma por uma, as
// portas que ele nao devia abrir - e a varredura mostrou que ele lia os tres
// canais do chat e entrava na chamada de qualquer reuniao. Aqui a pergunta e
// outra: o visitante nem RECEBE o que a sede transmite. A prova e o registro de
// tudo que chegou pra ele, comparado com o que a sede fez enquanto ele estava la.
//
// Sobe o servidor de verdade numa pasta de dados descartavel (nao mexe em
// server/data; pode rodar com o servidor de desenvolvimento de pe) e conversa por
// HTTP e por socket.io "na unha" (o projeto nao tem o cliente de Node).
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-reuniao-link-'));
const PORTA = 3712;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'teste-sede';
const ADMIN_CODE = 'teste-chefe';
const SEGREDO = 'segredo-de-teste-bem-comprido';
const SEM_MEMBRO_MS = 700;   // o servidor de producao espera um minuto
const PASSE_MS = 3000;       // ...e o passe vale dez

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
function derrubar() {
  if (servidor && !servidor.killed) servidor.kill();
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Uma conta de visitante do MODELO ANTIGO, gravada antes de o servidor subir: o
// arranque tem que apagar. Sem isso o cookie dela (12 horas de vida) seguiria
// abrindo a sede inteira.
function contaDoModeloAntigo() {
  return {
    id: 'convidado-antigo-1', nome: 'Visitante Velho', email: 'convidado-antigo-1@local',
    emailChave: 'convidado-antigo-1@local', salt: null, senhaHash: null, isAdmin: false,
    convidado: true, appearance: null, criadoEm: Date.now(), ultimoAcesso: Date.now(),
  };
}

// O cookie que o servidor emitiria pra essa conta (mesmo formato do sessao.js):
// o teste o monta sozinho, com o segredo que ele mesmo deu ao servidor.
function cookieDe(usuarioId) {
  const corpo = Buffer.from(usuarioId + '.' + (Date.now() + 3600 * 1000) + '.0').toString('base64url');
  const assinatura = crypto.createHmac('sha256', SEGREDO).update(corpo).digest('hex');
  return 'adm_sessao=' + corpo + '.' + assinatura;
}

// O token de reuniao que so o servidor deveria saber montar. O teste sabe porque
// escolheu o segredo: e assim que confere o que uma assinatura VALIDA de uma
// reuniao que nao existe (ou de outra versao) faz.
function tokenFalso(id, criadaEm, versao, segredo) {
  const corpo = Buffer.from([id, criadaEm, versao].join('.')).toString('base64url');
  const assinatura = crypto.createHmac('sha256', segredo || SEGREDO)
    .update('link-reuniao:' + corpo).digest('hex').slice(0, 32);
  return corpo + '.' + assinatura;
}

function subir() {
  fs.writeFileSync(path.join(PASTA, 'usuarios.json'), JSON.stringify({ usuarios: [contaDoModeloAntigo()] }));
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA,
        PORT: String(PORTA),
        CODIGO_SEDE,
        ADMIN_CODE,
        SESSION_SECRET: SEGREDO,
        SEM_LOGIN: '',
        NODE_ENV: 'test',
        VISITANTES_SEM_MEMBRO_MS: String(SEM_MEMBRO_MS),
        VISITANTES_PASSE_MS: String(PASSE_MS),
        // Vazias de proposito: o ambiente ganha do .env
        ARQUIVO_ENV: 'nenhum',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        TRELLO_API_KEY: '',
        TRELLO_TOKEN: '',
        TRELLO_BOARD_ID: '',
        GOOGLE_DRIVE_PASTA: '',
        GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '',
        CLOUDFLARE_TURN_TOKEN: '',
        EMAIL_PROVEDOR: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let erroDoServidor = '';
    servidor.stderr.on('data', (b) => { erroDoServidor += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + erroDoServidor));
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude')
        .then((r) => (r.ok ? resolve() : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

// ------------------------------------------------------------------ sockets
//
// Socket.io "na unha": protocolo 4 do engine.io por WebSocket. "40" conecta o
// canal principal, `40/reuniao,{...}` conecta o canal da reuniao (com a
// credencial no corpo), "42[...]" e evento, "44" e recusa, "2" e ping.

function lerPacote(m) {
  // 42/reuniao,["evento",{...}]   ou   42["evento",{...}]
  const resto = m.slice(2);
  const virgula = resto.startsWith('/') ? resto.indexOf(',') : -1;
  const texto = virgula >= 0 ? resto.slice(virgula + 1) : resto;
  return JSON.parse(texto);
}

// O canal principal: o da sede, que exige cookie de sessao.
function abrirMembro(cookie, ip) {
  return new Promise((resolve, reject) => {
    const cab = { Cookie: cookie };
    if (ip) cab['X-Forwarded-For'] = ip;
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: cab });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket da sede nao conectou')), 6000);
    const s = {
      eventos, ws, id: null,
      enviar: (ev, dado) => ws.send('42' + JSON.stringify(dado === undefined ? [ev] : [ev, dado])),
      fechar: () => ws.close(),
    };
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) ws.send('42' + JSON.stringify(['join', {}]));
      else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('42')) {
        try {
          const e = lerPacote(m);
          eventos.push(e);
          if (e[0] === 'init') { s.id = e[1].selfId; clearTimeout(prazo); resolve(s); }
        } catch (x) { /* ignora */ }
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket da sede')); });
  });
}

// O canal do visitante: so o token. Resolve quando o servidor responde a
// conexao - aceita (`conectou: true`) ou recusa (`erro: 'link-invalido'`...).
function abrirVisitante(token, ip) {
  return new Promise((resolve, reject) => {
    const cab = ip ? { 'X-Forwarded-For': ip } : {};
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: cab });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket do visitante nao respondeu')), 6000);
    const v = {
      eventos, ws, conectou: false, erro: null, encerrado: false,
      enviar: (ev, dado) => ws.send('42/reuniao,' + JSON.stringify(dado === undefined ? [ev] : [ev, dado])),
      fechar: () => ws.close(),
    };
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) ws.send('40/reuniao,' + JSON.stringify({ token }));
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40/reuniao')) { v.conectou = true; clearTimeout(prazo); resolve(v); }
      else if (m.startsWith('44/reuniao')) {
        try { v.erro = JSON.parse(m.slice(m.indexOf(',') + 1)).message; } catch (e) { v.erro = '?'; }
        clearTimeout(prazo);
        ws.close();
        resolve(v);
      } else if (m.startsWith('41')) { v.encerrado = true; }
      else if (m.startsWith('42')) { try { eventos.push(lerPacote(m)); } catch (x) { /* ignora */ } }
    });
    ws.addEventListener('close', () => { v.encerrado = true; });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket do visitante')); });
  });
}

// Espera chegar um evento que atenda ao teste, olhando tambem o que ja chegou.
// Nada de `espera(600)` e torcer: a bateria ja ficou intermitente por isso.
//
// `desde` (o valor de `marca(soquete)` tirado ANTES da acao) so olha o que chegou
// depois. Sem ele, "a lista ficou sem o visitante" e satisfeita por uma lista
// ANTIGA, de antes de ele entrar - a prova de mutacao pegou isso: o teste passava
// com o servidor sem avisar ninguem.
function esperar(soquete, nome, teste, prazoMs = 5000, desde = 0) {
  const limite = Date.now() + prazoMs;
  return new Promise((resolve) => {
    (function olhar() {
      const achado = soquete.eventos.slice(desde).find((e) => e[0] === nome && (!teste || teste(e[1])));
      // evento sem corpo (`nome-invalido`) chega como undefined: vira {} pra contar como "chegou"
      if (achado) return resolve(achado[1] === undefined ? {} : achado[1]);
      if (Date.now() > limite) return resolve(null);
      setTimeout(olhar, 30);
    })();
  });
}

const marca = (soquete) => soquete.eventos.length;

// Ultimo evento com esse nome (a fotografia MAIS NOVA, quando o servidor manda
// o estado inteiro a cada mudanca).
function ultimo(soquete, nome) {
  const lista = soquete.eventos.filter((e) => e[0] === nome);
  return lista.length ? lista[lista.length - 1][1] : null;
}

// A fotografia mais nova de uma reuniao: quem marcou duas recebe as duas, e o
// "ultimo evento" pode ser a da outra.
function fotoAtual(soquete, reuniaoId) {
  const lista = soquete.eventos.filter((e) => e[0] === 'visitantes-mudou' && e[1].reuniaoId === reuniaoId);
  return lista.length ? lista[lista.length - 1][1] : null;
}

// O id que o servidor deu ao pedido de alguem, esperando a fotografia que o traz.
async function pedidoDe(soquete, reuniaoId, nome) {
  const foto = await esperar(soquete, 'visitantes-mudou', (d) => d.reuniaoId === reuniaoId && d.esperando.some((p) => p.nome === nome));
  return foto ? foto.esperando.find((p) => p.nome === nome).id : null;
}

function contar(soquete, nome, teste) {
  return soquete.eventos.filter((e) => e[0] === nome && (!teste || teste(e[1]))).length;
}

function pedir(rota, { metodo = 'GET', corpo, cookie } = {}) {
  const cab = { 'Content-Type': 'application/json' };
  if (cookie) cab.Cookie = cookie;
  return fetch(BASE + rota, {
    method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => ({
    status: r.status,
    cabecalhos: r.headers,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null,
    corpo: await r.text().then((t) => { try { return JSON.parse(t); } catch (e) { return t; } }),
  }));
}

async function conta(nome, email, extra) {
  const r = await pedir('/api/registrar', {
    metodo: 'POST',
    corpo: Object.assign({ nome, email, senha: 'senha-bem-longa', codigo: CODIGO_SEDE }, extra || {}),
  });
  if (r.status !== 200) throw new Error('nao criou a conta ' + email + ': ' + JSON.stringify(r.corpo));
  return r;
}

// Cada visitante do teste vem de um "IP" diferente: os limites por IP (recusa,
// pedidos parados) nao podem vazar de um cenario pro outro.
let proximoIp = 10;
const ip = () => '10.0.0.' + (proximoIp++);

// Tudo que a sede transmite, e que o visitante NUNCA pode receber. Se algum
// desses aparecer no registro dele, a separacao dos canais furou.
const EVENTOS_DA_SEDE = [
  'init', 'player-joined', 'player-left', 'player-moved', 'players-moved', 'player-status', 'reacao',
  'chat-mensagem', 'chat-historico', 'chat-reacao', 'mesas-atualizadas', 'mapa-atualizado',
  'mapa-objeto-atualizado', 'mapa-area-atualizada', 'mapa-area-criada', 'mapa-area-apagada',
  'tela-mudou', 'lendo-mudou', 'agenda', 'reunioes', 'reuniao-recusada', 'chamada-mudou', 'chamadas',
  'trello', 'acervo-fisico-mudou', 'conta-encerrada', 'visitantes-mudou',
];
const EVENTOS_DO_VISITANTE = ['info', 'estado', 'admitido', 'participantes', 'recusado', 'recusado-agora', 'nome-invalido', 'rtc-signal'];

const HORA = 60 * 60 * 1000;
// "Alice Silva XXXXXXXXXXXXXXXXXXXXXX" sem os invisiveis, cortado nos 18 da sede
const NOME_ALICE = 'Alice Silva XXXXXX';

(async function () {
  console.log('\nREUNIAO POR LINK (visitante so na chamada, como no Meet)');
  try {
    await subir();

    // ------------------------------------------------------------- a sede
    const chefe = await conta('Chefe', 'chefe@adm.com', { codigoAdmin: ADMIN_CODE });
    const ana = await conta('Ana', 'ana@adm.com');
    const bia = await conta('Bia', 'bia@adm.com');
    conferir('a diretoria e um membro comum entram', [chefe.status, ana.status], [200, 200]);
    conferir('a conta de visitante do modelo antigo foi apagada no arranque',
      (await pedir('/api/eu', { cookie: cookieDe('convidado-antigo-1') })).status, 401);
    conferir('  e nao conta como conta da sede', (await pedir('/api/saude')).corpo.contas, 3);

    const sChefe = await abrirMembro(chefe.cookie);
    const sAna = await abrirMembro(ana.cookie);
    const sBia = await abrirMembro(bia.cookie);

    sChefe.enviar('agenda-pedir');
    const lista0 = await esperar(sChefe, 'reunioes');
    const salas = lista0.salas.map((s) => s.id);
    conferir('a sede tem duas salas de reuniao pra este teste', salas.length >= 2, true);

    const agora = Date.now();
    // duas de agora (uma em cada sala), uma que so acontece em tres dias, e uma
    // que acabou faz horas
    [
      { titulo: 'Entrevista Um', inicio: agora + 10 * 60000, minutos: 60, sala: salas[0] },
      { titulo: 'Reuniao Dois', inicio: agora + 10 * 60000, minutos: 60, sala: salas[1] },
      { titulo: 'Reuniao Futura', inicio: agora + 72 * HORA, minutos: 60, sala: salas[0] },
      { titulo: 'Reuniao Antiga', inicio: agora - 5 * HORA, minutos: 60, sala: salas[0] },
    ].forEach((r) => sChefe.enviar('reuniao-marcar', r));
    const lista1 = await esperar(sChefe, 'reunioes', (d) => d.reunioes.length === 4);
    const por = (t) => lista1.reunioes.find((r) => r.titulo === t);
    const M1 = por('Entrevista Um');
    const M2 = por('Reuniao Dois');
    const M3 = por('Reuniao Futura');
    const M4 = por('Reuniao Antiga');
    const tok = (m) => m.link.slice('/r/'.length);

    conferir('cada reuniao nasce com um link /r/<token>', [M1, M2, M3, M4].every((m) => /^\/r\/[\w.-]+$/.test(m.link)), true);
    conferir('e links diferentes', new Set([M1, M2, M3, M4].map((m) => m.link)).size, 4);
    // A gravacao em disco espera uns 400 ms (junta varias). O teste espera o arquivo.
    const arquivo = path.join(PASTA, 'reunioes.json');
    for (let i = 0; i < 60 && !(fs.existsSync(arquivo) && /Reuniao Antiga/.test(fs.readFileSync(arquivo, 'utf8'))); i++) await espera(100);
    const gravado = JSON.parse(fs.readFileSync(arquivo, 'utf8')).reunioes;
    conferir('o link e calculado: o arquivo so guarda a versao dele, nunca o link',
      [JSON.stringify(gravado).includes('/r/'), gravado.every((r) => r.linkVersao === 1)], [false, true]);

    // --------------------------------------------------- a pagina do link
    const pagina = await pedir(M1.link);
    conferir('o link abre a pagina da reuniao', pagina.status, 200);
    conferir('  com a marca aplicada (sem marcador solto)', /\{\{/.test(pagina.corpo), false);
    conferir('  nao fica em cache (o endereco e uma credencial)', pagina.cabecalhos.get('cache-control'), 'no-store');
    conferir('  e nao vai no Referer de outro site', pagina.cabecalhos.get('referrer-policy'), 'no-referrer');
    conferir('  nem em buscador', /noindex/.test(pagina.cabecalhos.get('x-robots-tag') || ''), true);
    conferir('  e a CSP da sede vale nela (so scripts do proprio site)', /script-src 'self'/.test(pagina.cabecalhos.get('content-security-policy') || ''), true);
    conferir('  e o script dela nao e inline (a CSP recusaria)', /<script(?![^>]*\bsrc=)[^>]*>/.test(pagina.corpo), false);
    const paginaLixo = await pedir('/r/qualquer-coisa');
    conferir('link errado abre a mesma pagina, sem dizer nada a mais', paginaLixo.corpo === pagina.corpo, true);
    conferir('o script da pagina de visitante existe', (await pedir('/js/paginas/reuniao.js')).status, 200);

    // ------------------------------------------- o que o servidor recusa
    const semToken = await abrirVisitante('');
    conferir('sem token nao conecta', semToken.erro, 'link-invalido');
    const adulterado = await abrirVisitante(tok(M1).slice(0, -2) + (tok(M1).endsWith('ff') ? '00' : 'ff'));
    conferir('token adulterado nao conecta', adulterado.erro, 'link-invalido');
    const inventado = await abrirVisitante('qualquer-coisa.abc');
    conferir('token inventado nao conecta', inventado.erro, 'link-invalido');
    const naoExiste = await abrirVisitante(tokenFalso(999, M1.criadaEm, 1));
    conferir('assinatura VALIDA de uma reuniao que nao existe nao conecta', naoExiste.erro, 'link-invalido');
    const outraCriadaEm = await abrirVisitante(tokenFalso(M1.id, M1.criadaEm + 1, 1));
    conferir('id reaproveitado (criadaEm de outra reuniao) nao conecta', outraCriadaEm.erro, 'link-invalido');
    const outraVersao = await abrirVisitante(tokenFalso(M1.id, M1.criadaEm, 2));
    conferir('versao do link que ainda nao existe nao conecta', outraVersao.erro, 'link-invalido');
    const outroSegredo = await abrirVisitante(tokenFalso(M1.id, M1.criadaEm, 1, 'outro-segredo-qualquer'));
    conferir('assinado com outro segredo nao conecta', outroSegredo.erro, 'link-invalido');
    const comoSessao = await abrirVisitante(chefe.cookie.split('=')[1]);
    conferir('o cookie de sessao de alguem nao serve de link', comoSessao.erro, 'link-invalido');

    const canalDaSede = await new Promise((resolve) => {
      const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket');
      const t = setTimeout(() => { ws.close(); resolve(''); }, 3000);
      ws.addEventListener('message', (ev) => {
        const m = String(ev.data);
        if (m.startsWith('0')) ws.send('40' + JSON.stringify({ token: tok(M1) }));
        else if (m.startsWith('44') || m.startsWith('40')) { clearTimeout(t); ws.close(); resolve(m); }
      });
    });
    conferir('o token da reuniao NAO abre o canal da sede (sem cookie nao ha sede)',
      /sem-sessao/.test(String(canalDaSede)), true);

    conferir('o modelo antigo acabou: nao ha mais rota de convite',
      [
        (await pedir('/api/convite', { metodo: 'POST', cookie: chefe.cookie })).status,
        (await pedir('/api/convite/entrar', { metodo: 'POST', corpo: { token: 'x', nome: 'Y' } })).status,
        (await pedir('/api/convite/revogar', { metodo: 'POST', cookie: chefe.cookie })).status,
      ], [404, 404, 404]);
    conferir('e ninguem entra na sede sem cookie (o link nao e sessao)',
      [(await pedir('/api/eu')).status, (await pedir('/api/ice')).status], [401, 401]);

    // --------------------------------------------------- janela do horario
    const vFuturo = await abrirVisitante(tok(M3), ip());
    const infoFutura = await esperar(vFuturo, 'info');
    conferir('reuniao de daqui a tres dias: o link abre e mostra o horario, ainda fechado',
      [infoFutura && infoFutura.titulo, infoFutura && infoFutura.estado], ['Reuniao Futura', 'antes']);
    vFuturo.enviar('pedir-entrada', { nome: 'Cedo' });
    const cedo = await esperar(vFuturo, 'recusado');
    conferir('  e pedir entrada antes da hora e recusado', cedo && cedo.motivo, 'antes');

    const vAntigo = await abrirVisitante(tok(M4), ip());
    const infoAntiga = await esperar(vAntigo, 'info');
    conferir('reuniao que acabou ha horas: o link diz que encerrou', infoAntiga && infoAntiga.estado, 'encerrada');
    vAntigo.enviar('pedir-entrada', { nome: 'Tarde' });
    const tarde = await esperar(vAntigo, 'recusado');
    conferir('  e nao deixa entrar', tarde && tarde.motivo, 'encerrada');

    // ------------------------------------------- o visitante que chega
    const ipAlice = ip();
    const alice = await abrirVisitante(tok(M1), ipAlice);
    conferir('o link de uma reuniao aberta conecta', alice.conectou, true);
    const info1 = await esperar(alice, 'info');
    conferir('  e diz so o titulo, o horario e a marca',
      Object.keys(info1).sort(), ['estado', 'fim', 'inicio', 'sede', 'sigla', 'titulo']);
    conferir('  reuniao de agora esta aberta', info1.estado, 'aberta');

    alice.enviar('pedir-entrada', { nome: '   ' });
    conferir('sem nome nao entra na espera', !!(await esperar(alice, 'nome-invalido')), true);

    // Nome com caractere de inversao de texto (U+202E) e controle: o que os
    // outros leem tem que ser limpo. O teste monta o texto sem escapes.
    const invisivel = String.fromCharCode(0x202e);
    const controle = String.fromCharCode(7);
    alice.enviar('pedir-entrada', { nome: 'Alice' + invisivel + controle + '   Silva' + ' '.repeat(5) + 'XXXXXXXXXXXXXXXXXXXXXX' });
    const espAlice = await esperar(alice, 'estado');
    conferir('pedir entrada leva pra sala de espera', espAlice.estado, 'esperando');
    conferir('  e sem ninguem da sede na chamada, o visitante fica sabendo', espAlice.semMembro, true);

    // Quem marcou a reuniao (chefe) e avisado mesmo fora dela; os outros nao
    const foto1 = await esperar(sChefe, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.esperando.length === 1);
    conferir('quem marcou a reuniao recebe o pedido, mesmo fora da chamada', !!foto1, true);
    conferir('  o nome chega LIMPO (sem inversao de texto, sem controle, sem espacos sobrando, no tamanho da sede)',
      foto1.esperando[0].nome, NOME_ALICE);
    conferir('  nada alem de id e nome do visitante', Object.keys(foto1.esperando[0]).sort(), ['id', 'nome']);
    await espera(200);
    conferir('um membro que nao marcou nem esta na chamada nao recebe nada',
      contar(sAna, 'visitantes-mudou') + contar(sBia, 'visitantes-mudou'), 0);

    // ------------------------------------- so quem esta na chamada decide
    const idAlice = foto1.esperando[0].id;
    sBia.enviar('visitante-decidir', { id: idAlice, admitir: true });
    sChefe.enviar('visitante-decidir', { id: idAlice, admitir: true });
    await espera(300);
    conferir('membro fora da chamada da reuniao nao admite (nem a diretoria)',
      contar(alice, 'admitido'), 0);

    // O chefe e a Ana entram na chamada da reuniao 1; a Bia entra na da 2
    sChefe.enviar('chamada-entrar', { id: 'reuniao:' + M1.id });
    sAna.enviar('chamada-entrar', { id: 'reuniao:' + M1.id });
    sBia.enviar('chamada-entrar', { id: 'reuniao:' + M2.id });
    const semVazio = await esperar(alice, 'estado', (d) => d.semMembro === false);
    conferir('quando alguem da sede entra na chamada, o visitante fica sabendo', !!semVazio, true);
    const fotoNaChamada = await esperar(sAna, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.esperando.length === 1);
    conferir('quem entra na chamada ja ve quem esta esperando la', !!fotoNaChamada, true);

    // ------------------------------------------------------- admitir
    const idChefe = sChefe.id;
    sAna.enviar('visitante-decidir', { id: idAlice, admitir: true });
    const admitido = await esperar(alice, 'admitido');
    conferir('um membro da chamada admite: o visitante entra', !!admitido, true);
    conferir('  com o id dele na chamada (v-...)', /^v-/.test(admitido.vid), true);
    conferir('  e a lista de servidores ICE, que ele nao tem como buscar sozinho',
      Array.isArray(admitido.iceServers) && admitido.iceServers.length > 0, true);
    conferir('  e um passe pra reconectar', typeof admitido.passe === 'string' && admitido.passe.length >= 20, true);
    conferir('  e o titulo da reuniao', admitido.titulo, 'Entrevista Um');
    const nomesDaChamada = admitido.participantes.map((p) => p.nome).sort();
    conferir('  ve quem esta na chamada: os dois membros e ele',
      nomesDaChamada, [NOME_ALICE, 'Ana', 'Chefe']);
    conferir('  mas so o que a tela precisa (nada de e-mail, uid, diretoria)',
      admitido.participantes.every((p) => Object.keys(p).sort().join() === 'cor,dividindoTela,id,nome,visitante'), true);
    conferir('  e ninguem da OUTRA reuniao aparece (a Bia esta na chamada 2)',
      admitido.participantes.some((p) => p.nome === 'Bia'), false);

    const fotoDentro = await esperar(sChefe, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.dentro.length === 1);
    conferir('os membros da chamada veem o visitante como "dentro"',
      [fotoDentro.esperando.length, fotoDentro.dentro[0].nome], [0, NOME_ALICE]);
    const chamadas = await esperar(sBia, 'chamadas', (l) => l.some((c) => c.gente.some((g) => /visitante/.test(g))));
    conferir('a lista de chamadas conta o visitante, marcado como visitante',
      chamadas.find((c) => c.id === 'reuniao:' + M1.id).gente.includes(NOME_ALICE + ' (visitante)'), true);

    // --------------------------------------------- sinalizacao entre os dois
    const idAna = sAna.id;
    const vidAlice = admitido.vid;
    sChefe.enviar('rtc-signal', { to: vidAlice, signal: { type: 'offer', sdp: 'do-chefe' } });
    const doChefe = await esperar(alice, 'rtc-signal', (d) => d.signal.sdp === 'do-chefe');
    conferir('o membro manda sinal pro visitante e ele chega, dizendo de quem veio',
      doChefe && doChefe.from, idChefe);
    alice.enviar('rtc-signal', { to: idChefe, signal: { type: 'answer', sdp: 'da-alice' } });
    alice.enviar('rtc-signal', { to: idAna, signal: { type: 'offer', sdp: 'da-alice-pra-ana' } });
    const daAlice = await esperar(sChefe, 'rtc-signal', (d) => d.signal.sdp === 'da-alice');
    conferir('o visitante manda sinal pro membro da chamada', daAlice && daAlice.from, vidAlice);
    conferir('  e pra outro membro dela', !!(await esperar(sAna, 'rtc-signal', (d) => d.signal.sdp === 'da-alice-pra-ana')), true);

    // A Bia esta em OUTRA chamada: nada passa, nos dois sentidos
    sBia.enviar('rtc-signal', { to: vidAlice, signal: { type: 'offer', sdp: 'da-bia' } });
    alice.enviar('rtc-signal', { to: sBia.id, signal: { type: 'offer', sdp: 'pra-bia' } });
    // e id de socket que nao existe, ou de string qualquer
    alice.enviar('rtc-signal', { to: 'nao-existe', signal: { type: 'offer', sdp: 'pra-ninguem' } });
    alice.enviar('rtc-signal', { to: 12345, signal: { type: 'offer', sdp: 'id-numerico' } });
    alice.enviar('rtc-signal', { signal: { type: 'offer', sdp: 'sem-destino' } });
    // pra si mesmo: nao volta (nao ha o que negociar consigo)
    alice.enviar('rtc-signal', { to: vidAlice, signal: { type: 'offer', sdp: 'eco' } });
    // sinal imenso: nao vale
    alice.enviar('rtc-signal', { to: idChefe, signal: { type: 'offer', sdp: 'x'.repeat(70 * 1024) } });
    // ponto de sincronia: este passa, entao os de cima ja foram julgados
    alice.enviar('rtc-signal', { to: idChefe, signal: { type: 'offer', sdp: 'sincronia-1' } });
    await esperar(sChefe, 'rtc-signal', (d) => d.signal.sdp === 'sincronia-1');
    conferir('membro de OUTRA reuniao nao alcanca o visitante', contar(alice, 'rtc-signal', (d) => d.signal.sdp === 'da-bia'), 0);
    conferir('o visitante nao alcanca membro de outra reuniao', contar(sBia, 'rtc-signal'), 0);
    conferir('destino que nao existe ou invalido nao vai a lugar nenhum',
      contar(sChefe, 'rtc-signal', (d) => /ninguem|numerico|sem-destino/.test(d.signal.sdp)), 0);
    conferir('sinal de mais de 64 KB e descartado', contar(sChefe, 'rtc-signal', (d) => d.signal.sdp.length > 60000), 0);
    conferir('sinal do visitante pra ele mesmo nao volta pra ele', contar(alice, 'rtc-signal', (d) => d.signal.sdp === 'eco'), 0);

    // Enchente de sinalizacao: o servidor entrega o normal e corta o resto
    for (let i = 0; i < 600; i++) alice.enviar('rtc-signal', { to: idChefe, signal: { type: 'candidate', n: i } });
    alice.enviar('rtc-signal', { to: idChefe, signal: { type: 'offer', sdp: 'sincronia-2' } });
    await espera(600);
    const chegaram = contar(sChefe, 'rtc-signal', (d) => d.signal.type === 'candidate');
    conferir('uma enchente de sinais do visitante e cortada (nao passa de ~400 por 10 s)', chegaram > 0 && chegaram <= 400, true);

    // ------------------------------------------------------ divide a tela
    alice.enviar('tela', { ligado: true });
    const fotoTela = await esperar(sChefe, 'visitantes-mudou', (d) => d.dentro.some((v) => v.dividindoTela));
    conferir('o visitante divide a tela e os membros ficam sabendo', !!fotoTela, true);
    const ptela = await esperar(alice, 'participantes', (l) => l.some((p) => p.visitante && p.dividindoTela));
    conferir('  e a lista de participantes dele tambem', !!ptela, true);
    sChefe.enviar('tela', { ligado: true });
    const ptelaMembro = await esperar(alice, 'participantes', (l) => l.some((p) => p.nome === 'Chefe' && p.dividindoTela));
    conferir('membro divide a tela: o visitante ve quem apresenta', !!ptelaMembro, true);
    sChefe.enviar('tela', { ligado: false });
    alice.enviar('tela', { ligado: false });

    // ------------------------------- o VISITANTE NAO ENXERGA A SEDE (o ponto)
    // Enquanto ele estava dentro, a sede fez de tudo: chat, DM, andar, marcar
    // reuniao, mudar de status. Nada disso pode ter chegado.
    sChefe.enviar('chat-mensagem', { conversa: 'canal:projetos', texto: 'INTERNO: contrato do cliente Y atrasou, valor R$ 12.000' });
    sChefe.enviar('chat-mensagem', { conversa: 'canal:geral', texto: 'INTERNO: reajuste da mensalidade' });
    sAna.enviar('chat-mensagem', { conversa: 'dm:' + [chefe.corpo.usuario.id, ana.corpo.usuario.id].sort().join('|'), texto: 'DM privada da Ana' });
    sChefe.enviar('move', { x: 300, y: 300, dir: 'left', moving: true });
    sAna.enviar('status', { status: 'focado' });
    sAna.enviar('reagir', { emoji: '👍' });
    sChefe.enviar('reuniao-marcar', { titulo: 'Corte de custos (CONFIDENCIAL)', inicio: agora + 30 * HORA, minutos: 30, sala: salas[1] });
    const sinc = await esperar(sBia, 'chat-mensagem', (m) => /reajuste/.test(m.texto));
    conferir('(a sede de fato transmitiu tudo isso: a Bia recebeu)', !!sinc, true);
    await esperar(sBia, 'reunioes', (d) => d.reunioes.some((r) => /CONFIDENCIAL/.test(r.titulo)));
    await espera(400);
    const recebeu = new Set(alice.eventos.map((e) => e[0]));
    conferir('o visitante so recebeu eventos do canal dele', [...recebeu].every((e) => EVENTOS_DO_VISITANTE.includes(e)), true);
    conferir('  e NENHUM evento da sede', EVENTOS_DA_SEDE.some((e) => recebeu.has(e)), false);
    conferir('  em particular: nada de chat, DM nem agenda',
      JSON.stringify(alice.eventos).includes('INTERNO') || JSON.stringify(alice.eventos).includes('CONFIDENCIAL') || JSON.stringify(alice.eventos).includes('DM privada'), false);

    // E o que ele TENTAR fazer nao e ouvido: nenhum evento da sede funciona no canal dele
    const ativos = contar(sBia, 'chat-mensagem');
    alice.enviar('join', {});
    alice.enviar('chat-mensagem', { conversa: 'canal:geral', texto: 'VISITANTE ESCREVEU NO GERAL' });
    alice.enviar('chat-mensagem', { conversa: 'canal:projetos', texto: 'VISITANTE ESCREVEU EM PROJETOS' });
    alice.enviar('chat-historico', { conversa: 'canal:projetos' });
    alice.enviar('agenda-pedir');
    alice.enviar('trello-pedir');
    alice.enviar('chamada-entrar', { id: 'reuniao:' + M2.id });
    alice.enviar('chamada-chamar-grupo', { canal: 'geral' });
    alice.enviar('reuniao-marcar', { titulo: 'Reuniao do visitante', inicio: agora + 40 * HORA, minutos: 30, sala: salas[0] });
    alice.enviar('reuniao-desmarcar', { id: M2.id });
    alice.enviar('reuniao-novo-link', { id: M2.id });
    alice.enviar('visitante-decidir', { id: idAlice, admitir: true });
    alice.enviar('visitante-remover', { id: idAlice });
    alice.enviar('move', { x: 10, y: 10 });
    alice.enviar('status', { status: 'focado' });
    alice.enviar('mesa-reivindicar', { col: 5, row: 5 });
    alice.enviar('lendo', { id: 'qualquer' });
    alice.enviar('rtc-signal', { to: sBia.id, signal: { type: 'offer', sdp: 'x' } });
    await espera(500);
    conferir('o que o visitante tenta na sede nao chega a ninguem: chat', contar(sBia, 'chat-mensagem') - ativos, 0);
    conferir('  nem a lista de jogadores (ele nao aparece no mapa)',
      [sChefe, sAna, sBia].some((s) => contar(s, 'player-joined', (p) => /Alice/.test(p.name || ''))), false);
    conferir('  nem uma reuniao marcada em nome dele',
      ultimo(sChefe, 'reunioes').reunioes.some((r) => /do visitante/.test(r.titulo)), false);
    conferir('  e a reuniao 2 continua no lugar (ele nao desmarca nem troca o link)',
      ultimo(sChefe, 'reunioes').reunioes.some((r) => r.id === M2.id && r.link === M2.link), true);
    conferir('  e ele continua na reuniao dele, sem ter entrado na outra',
      [fotoAtual(sChefe, M1.id).dentro.length, contar(sBia, 'visitantes-mudou', (d) => d.reuniaoId === M2.id && d.dentro.length > 0)], [1, 0]);
    conferir('  e nada do que ele tentou gerou resposta da sede',
      alice.eventos.every((e) => EVENTOS_DO_VISITANTE.includes(e[0])), true);

    // -------------------------------------------- quem e da sede nao e barrado
    sBia.enviar('chamada-sair');
    sBia.enviar('chamada-entrar', { id: 'reuniao:' + M2.id });
    await espera(300);
    conferir('quem e da sede continua saindo e entrando na chamada de uma reuniao (o link nao muda nada pra ela)',
      contar(sBia, 'chamada-mudou', (d) => d.chamada && d.chamada.id === 'reuniao:' + M2.id) >= 2, true);

    // --------------------------------------------------------- o passe
    const passeAlice = admitido.passe;
    const antesChefe = marca(sChefe);
    const antesBia = marca(sBia);
    alice.fechar();
    const fotoSaiu = await esperar(sChefe, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.dentro.length === 0, 5000, antesChefe);
    conferir('o visitante fecha a aba: some da lista dos membros', !!fotoSaiu, true);
    const chamadasSaiu = await esperar(sBia, 'chamadas', (l) => !l.some((c) => c.gente.some((g) => /visitante/.test(g))), 5000, antesBia);
    conferir('  e da lista de chamadas', !!chamadasSaiu, true);

    const volta = await abrirVisitante(tok(M1), ipAlice);
    volta.enviar('pedir-entrada', { nome: 'Alice', passe: passeAlice });
    const voltou = await esperar(volta, 'admitido');
    conferir('com o passe ele volta direto, sem pedir de novo (queda de rede, F5)', !!voltou, true);
    conferir('  e ganha um passe novo', voltou.passe !== passeAlice, true);

    // O passe vence: um passe guardado por horas nao pode abrir a reuniao de novo
    const efemero = await abrirVisitante(tok(M1), ip());
    efemero.enviar('pedir-entrada', { nome: 'Efemero' });
    sAna.enviar('visitante-decidir', { id: await pedidoDe(sChefe, M1.id, 'Efemero'), admitir: true });
    const passeEfemero = (await esperar(efemero, 'admitido')).passe;
    efemero.fechar();
    const tPasse = Date.now();

    const semPasse = await abrirVisitante(tok(M1), ip());
    semPasse.enviar('pedir-entrada', { nome: 'Penetra', passe: 'passe-inventado' });
    const penetra = await esperar(semPasse, 'estado');
    conferir('passe inventado nao vale: vai pra espera como qualquer um', penetra && penetra.estado, 'esperando');
    const passeVelho = await abrirVisitante(tok(M1), ip());
    passeVelho.enviar('pedir-entrada', { nome: 'Reuso', passe: passeAlice });
    const reuso = await esperar(passeVelho, 'estado');
    conferir('passe ja usado nao vale de novo (cada admissao troca o passe)', reuso && reuso.estado, 'esperando');

    // passe de OUTRA reuniao
    const noutra = await abrirVisitante(tok(M2), ip());
    noutra.enviar('pedir-entrada', { nome: 'Alice', passe: voltou.passe });
    const noutraEstado = await esperar(noutra, 'estado');
    conferir('passe de uma reuniao nao vale em outra', noutraEstado && noutraEstado.estado, 'esperando');

    // ...e o passe do "Efemero", depois de vencer, ja nao vale
    await espera(Math.max(0, PASSE_MS + 400 - (Date.now() - tPasse)));
    const passeVencido = await abrirVisitante(tok(M1), ip());
    passeVencido.enviar('pedir-entrada', { nome: 'Efemero', passe: passeEfemero });
    const vencido = await esperar(passeVencido, 'estado');
    conferir('passe vencido nao vale (depois do prazo ele pede como qualquer um)', vencido && vencido.estado, 'esperando');
    passeVencido.fechar();

    // Dois visitantes admitidos: na MESMA reuniao se alcancam; em reunioes
    // diferentes, nao (nos dois sentidos)
    const dora = await abrirVisitante(tok(M1), ip());
    dora.enviar('pedir-entrada', { nome: 'Dora' });
    sAna.enviar('visitante-decidir', { id: await pedidoDe(sChefe, M1.id, 'Dora'), admitir: true });
    const doraDentro = await esperar(dora, 'admitido');
    sBia.enviar('visitante-decidir', { id: await pedidoDe(sChefe, M2.id, 'Alice'), admitir: true });   // a Bia esta na chamada da 2
    const noutraDentro = await esperar(noutra, 'admitido');
    conferir('a Bia admite na reuniao dela (a 2)', !!noutraDentro, true);
    volta.enviar('rtc-signal', { to: doraDentro.vid, signal: { type: 'offer', sdp: 'volta-pra-dora' } });
    dora.enviar('rtc-signal', { to: noutraDentro.vid, signal: { type: 'offer', sdp: 'dora-pra-outra-reuniao' } });
    noutra.enviar('rtc-signal', { to: doraDentro.vid, signal: { type: 'offer', sdp: 'outra-reuniao-pra-dora' } });
    noutra.enviar('rtc-signal', { to: voltou.vid, signal: { type: 'offer', sdp: 'outra-reuniao-pra-volta' } });
    volta.enviar('rtc-signal', { to: doraDentro.vid, signal: { type: 'offer', sdp: 'sincronia-visitantes' } });
    await esperar(dora, 'rtc-signal', (d) => d.signal.sdp === 'sincronia-visitantes');
    conferir('visitantes da MESMA reuniao se alcancam', contar(dora, 'rtc-signal', (d) => d.signal.sdp === 'volta-pra-dora'), 1);
    conferir('visitante de OUTRA reuniao nao alcanca o daqui (nem o contrario)',
      [contar(noutra, 'rtc-signal'), contar(dora, 'rtc-signal', (d) => /outra-reuniao/.test(d.signal.sdp)), contar(volta, 'rtc-signal', (d) => /outra-reuniao/.test(d.signal.sdp))],
      [0, 0, 0]);
    noutra.fechar();
    dora.fechar();

    // ------------------------------------------------- recusar e remover
    const idPenetra = await pedidoDe(sChefe, M1.id, 'Penetra');
    sAna.enviar('visitante-decidir', { id: idPenetra, admitir: false });
    const negado = await esperar(semPasse, 'recusado');
    conferir('um membro recusa: o visitante e avisado', negado && negado.motivo, 'negado');
    conferir('  e a conexao dele e encerrada', await new Promise((r) => { const t = Date.now(); (function o() { if (semPasse.encerrado) return r(true); if (Date.now() - t > 3000) return r(false); setTimeout(o, 50); })(); }), true);

    const ipQuenteRecusado = ip();
    const insiste = await abrirVisitante(tok(M1), ipQuenteRecusado);
    insiste.enviar('pedir-entrada', { nome: 'Insistente' });
    await esperar(insiste, 'estado');
    const idInsiste = await pedidoDe(sChefe, M1.id, 'Insistente');
    sChefe.enviar('visitante-decidir', { id: idInsiste, admitir: false });
    await esperar(insiste, 'recusado');
    const insiste2 = await abrirVisitante(tok(M1), ipQuenteRecusado);
    insiste2.enviar('pedir-entrada', { nome: 'Insistente' });
    conferir('quem acabou de ser recusado nao pode pedir de novo na hora (do mesmo lugar)',
      !!(await esperar(insiste2, 'recusado-agora')), true);
    insiste2.fechar();

    // remover quem ja esta dentro
    const idVolta = voltou.vid;
    sBia.enviar('visitante-remover', { id: idVolta });   // a Bia esta na chamada da OUTRA reuniao
    await espera(300);
    conferir('membro da chamada de outra reuniao nao remove o visitante', [volta.encerrado, contar(volta, 'recusado')], [false, 0]);
    const antesRemover = marca(sChefe);
    sAna.enviar('visitante-remover', { id: idVolta });
    const removido = await esperar(volta, 'recusado');
    conferir('um membro remove quem ja esta na reuniao', removido && removido.motivo, 'removido');
    const fotoRemovido = await esperar(sChefe, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.dentro.length === 0, 5000, antesRemover);
    conferir('  e some da lista dos membros', !!fotoRemovido, true);
    passeVelho.fechar();

    // --------------------------------------- todos da sede saem da chamada
    const ipVolta = ip();
    const carol = await abrirVisitante(tok(M1), ipVolta);
    carol.enviar('pedir-entrada', { nome: 'Carol' });
    await esperar(carol, 'estado');
    const idCarol = await pedidoDe(sChefe, M1.id, 'Carol');
    sChefe.enviar('visitante-decidir', { id: idCarol, admitir: true });
    const carolDentro = await esperar(carol, 'admitido');
    conferir('outra visitante entra na mesma reuniao', !!carolDentro, true);

    const antesCarol = marca(carol);
    const antesChefe2 = marca(sChefe);
    sChefe.enviar('chamada-sair');
    sAna.enviar('chamada-sair');
    const ptSaiu = await esperar(carol, 'participantes', (l) => !l.some((p) => !p.visitante), 5000, antesCarol);
    conferir('os membros saem da chamada: a lista de participantes dela esvazia de membros', !!ptSaiu, true);
    const paraEspera = await esperar(carol, 'estado', (d) => d.estado === 'esperando' && d.semMembro === true, 6000);
    conferir('sem ninguem da sede, a visitante nao fica la sozinha: volta pra espera', !!paraEspera, true);
    const fotoVazia = await esperar(sChefe, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.dentro.length === 0 && d.esperando.length === 1, 5000, antesChefe2);
    conferir('  e quem marcou a reuniao e avisado (ela esta esperando)', !!fotoVazia, true);

    const antesDeVoltar = contar(carol, 'admitido');
    const antesAna = marca(sAna);
    sAna.enviar('chamada-entrar', { id: 'reuniao:' + M1.id });
    for (let i = 0; i < 100 && contar(carol, 'admitido') === antesDeVoltar; i++) await espera(50);
    conferir('quando um membro volta, quem ja tinha sido admitido volta sem pedir de novo',
      contar(carol, 'admitido') - antesDeVoltar, 1);
    const voltouSozinha = carol.eventos.filter((e) => e[0] === 'admitido').pop()[1];
    const fotoDepois = await esperar(sAna, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.esperando.length === 0 && d.dentro.length === 1, 5000, antesAna);
    conferir('  e nao ha novo pedido pendente pros membros', !!fotoDepois, true);
    conferir('  (a resposta traz a lista, com a Ana)', !!voltouSozinha && voltouSozinha.participantes.some((p) => p.nome === 'Ana'), true);

    // um membro que cai (fecha a aba) sai da chamada junto
    const sDois = await abrirMembro(ana.cookie);
    sDois.enviar('chamada-entrar', { id: 'reuniao:' + M1.id });
    await esperar(carol, 'participantes', (l) => l.filter((p) => p.nome === 'Ana').length === 2);
    const antesSemDois = marca(carol);
    sDois.fechar();
    const semDois = await esperar(carol, 'participantes', (l) => l.filter((p) => p.nome === 'Ana').length === 1, 5000, antesSemDois);
    conferir('membro que fecha a aba sai da lista do visitante', !!semDois, true);

    // ------------------------------------------------------- novo link
    const doChefeLink = M1.link;
    const outroPedido = await abrirVisitante(tok(M1), ip());
    outroPedido.enviar('pedir-entrada', { nome: 'Esperando' });
    await esperar(outroPedido, 'estado');
    sAna.enviar('reuniao-novo-link', { id: M1.id });
    const recusaNovoLink = await esperar(sAna, 'reuniao-recusada');
    conferir('membro que nao marcou nem e diretoria nao troca o link', /quem marcou/.test(recusaNovoLink || ''), true);
    conferir('  e o link continua o mesmo', (await abrirVisitante(tok(M1), ip())).conectou, true);

    sChefe.enviar('reuniao-novo-link', { id: M1.id });
    const listaNova = await esperar(sChefe, 'reunioes', (d) => {
      const r = d.reunioes.find((x) => x.id === M1.id);
      return !!r && r.link !== doChefeLink;
    });
    const M1novo = listaNova.reunioes.find((r) => r.id === M1.id);
    conferir('quem marcou troca o link', M1novo.link !== doChefeLink, true);
    conferir('  e o link velho para de abrir', (await abrirVisitante(tok(M1), ip())).erro, 'link-invalido');
    conferir('  e o novo abre', (await abrirVisitante(M1novo.link.slice(3), ip())).conectou, true);
    const barrado = await esperar(outroPedido, 'recusado');
    conferir('  quem esperava com o link velho e barrado', barrado && barrado.motivo, 'link-mudou');
    conferir('  mas quem ja estava dentro continua (foi decisao de um membro)',
      carol.encerrado, false);
    conferir('  e o link da OUTRA reuniao nao mudou',
      listaNova.reunioes.find((r) => r.id === M2.id).link, M2.link);

    // a diretoria (que nao marcou) troca o link de outra reuniao
    sBia.enviar('reuniao-novo-link', { id: M2.id });
    await esperar(sBia, 'reuniao-recusada', (t) => /quem marcou/.test(t));
    const admin2 = await conta('Outra Diretora', 'diretora2@adm.com', { codigoAdmin: ADMIN_CODE });
    const sAdmin2 = await abrirMembro(admin2.cookie);
    sAdmin2.enviar('reuniao-novo-link', { id: M2.id });
    const listaAdmin = await esperar(sAdmin2, 'reunioes', (d) => d.reunioes.find((r) => r.id === M2.id && r.link !== M2.link));
    conferir('a diretoria troca o link de reuniao que nao marcou', !!listaAdmin, true);
    sAdmin2.fechar();

    // --------------------------------------------------------- desmarcar
    const tokM2 = tok(M2);
    const dois = await abrirVisitante(tok(listaAdmin.reunioes.find((r) => r.id === M2.id)), ip());
    dois.enviar('pedir-entrada', { nome: 'Dani' });
    await esperar(dois, 'estado');
    sChefe.enviar('reuniao-desmarcar', { id: M2.id });
    const desmarcada = await esperar(dois, 'recusado');
    conferir('reuniao desmarcada: quem esperava nela e avisado', desmarcada && desmarcada.motivo, 'desmarcada');
    conferir('  e o link morre', (await abrirVisitante(tokM2, ip())).erro, 'link-invalido');

    // --------------------------------------------- limites e abuso
    const ipsCheios = [];
    for (let i = 0; i < 10; i++) {
      const v = await abrirVisitante(M1novo.link.slice(3), ip());
      v.enviar('pedir-entrada', { nome: 'Fila ' + i });
      ipsCheios.push(v);
    }
    await esperar(sChefe, 'visitantes-mudou', (d) => d.reuniaoId === M1.id && d.esperando.length >= 10);
    const decimoPrimeiro = await abrirVisitante(M1novo.link.slice(3), ip());
    decimoPrimeiro.enviar('pedir-entrada', { nome: 'Nao cabe' });
    const cheia = await esperar(decimoPrimeiro, 'recusado');
    conferir('mais de 10 pedidos parados na mesma reuniao: o resto e barrado', cheia && cheia.motivo, 'cheia');
    ipsCheios.forEach((v) => v.fechar());

    // gente DENTRO: a chamada e malha P2P e nao aguenta um auditorio
    const dentroDaSala = [];
    for (let i = 0; i < 9; i++) {
      const v = await abrirVisitante(M1novo.link.slice(3), ip());
      v.enviar('pedir-entrada', { nome: 'Dentro ' + i });
      sAna.enviar('visitante-decidir', { id: await pedidoDe(sChefe, M1.id, 'Dentro ' + i), admitir: true });
      await esperar(v, 'admitido');
      dentroDaSala.push(v);
    }
    const excedente = await abrirVisitante(M1novo.link.slice(3), ip());
    excedente.enviar('pedir-entrada', { nome: 'Sobrou' });
    sAna.enviar('visitante-decidir', { id: await pedidoDe(sChefe, M1.id, 'Sobrou'), admitir: true });
    const semLugar = await esperar(excedente, 'recusado');
    conferir('com 10 visitantes dentro, o proximo admitido nao cabe', semLugar && semLugar.motivo, 'cheia');
    dentroDaSala.forEach((v) => v.fechar());

    // links errados demais, do mesmo lugar
    const ipChato = ip();
    for (let i = 0; i < 22; i++) await abrirVisitante('token-errado-' + i + '.abc', ipChato);
    conferir('quem erra o link muitas vezes e barrado, ate com o link certo',
      (await abrirVisitante(M1novo.link.slice(3), ipChato)).erro, 'muitas-tentativas');
    conferir('  mas so ele: outro lugar continua entrando', (await abrirVisitante(M1novo.link.slice(3), ip())).conectou, true);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    derrubar();
  }

  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
