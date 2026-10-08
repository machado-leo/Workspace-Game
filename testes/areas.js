// Editor de AREAS: a diretoria move e redimensiona o retangulo de cada sala
// (docs/areas.md). Sobe o servidor de verdade, conecta diretoria e membro pelo
// socket, e confere tambem o mapa do cliente (public/js/map.js) numa vm.
//
// O que importa aqui:
//  - so a diretoria mexe, e a checagem e a do servidor;
//  - area nao fica em cima de outra (a pessoa estaria em duas salas, e a
//    chamada fechada de uma vazaria pra outra), nem fora do mapa, nem menor
//    que 2x2;
//  - o que foi mudado sobrevive ao reinicio - inclusive quando uma area foi
//    pro lugar que outra deixou livre (lendo uma de cada vez, bateria);
//  - no cliente, o piso e a sala de cada celula seguem a area.
//
// NAO mexe em server/data: DATA_DIR numa pasta temporaria, apagada no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
// Tabelas puras do servidor (sem efeito colateral): so pra ler as constantes.
const mapaServidor = require('../server/map.js');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-areas-'));
const ARQUIVO = path.join(PASTA, 'mapa.json');
const PORTA = 3738;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'codigo-areas';
const ADMIN_CODE = 'chefe-areas';

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ servidor
let servidor = null;
let saida = '';
function subir() {
  return new Promise((resolve, reject) => {
    saida = '';
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), CODIGO_SEDE, ADMIN_CODE, ARQUIVO_ENV: 'nenhum',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', SEM_LOGIN: '', NODE_ENV: 'test',
        DOMINIOS_SEDE: '', DIRETORIA_EMAILS: '',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', BACKUP_DRIVE_PASTA: '', BACKUP_CHAVE: '',
        EMAIL_PROVEDOR: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    servidor.stdout.on('data', (b) => { saida += b.toString(); });
    servidor.stderr.on('data', (b) => { saida += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + saida));
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

function pedir(rota, corpo) {
  return fetch(BASE + rota, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  }).then(async (r) => ({
    status: r.status,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null,
    corpo: await r.json().catch(() => null),
  }));
}

function entrar(email) {
  return pedir('/api/entrar', { email, senha: 'senha-das-areas-1' }).then((r) => r.cookie);
}

// Socket.io "na unha" (protocolo 4 do engine.io por WebSocket), como no
// testes/contas.js: "40" conecta, "42[...]" e evento, "2" e ping.
function abrirSocket(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 5000);
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) {
        clearTimeout(prazo);
        ws.send('42' + JSON.stringify(['join', {}]));
        resolve({
          eventos,
          mandar: (nome, dados) => ws.send('42' + JSON.stringify([nome, dados])),
          fechar: () => ws.close(),
        });
      } else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('42')) { try { eventos.push(JSON.parse(m.slice(2))); } catch (e) { /* ignora */ } }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

// O evento `nome` que chegar depois da posicao `desde` da lista (ou null).
async function esperarEvento(sock, nome, desde, ms = 2000) {
  const prazo = Date.now() + ms;
  while (Date.now() < prazo) {
    const achado = sock.eventos.slice(desde).find((e) => e[0] === nome);
    if (achado) return achado[1];
    await espera(20);
  }
  return null;
}

function arquivoDeAreas() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')).areas || []; } catch (e) { return null; }
}

// Manda e espera a resposta pra quem mandou: aceita ou recusada.
async function editar(sock, dados) {
  const desde = sock.eventos.length;
  sock.mandar('mapa-area', dados);
  const prazo = Date.now() + 2000;
  while (Date.now() < prazo) {
    const r = sock.eventos.slice(desde).find((e) => e[0] === 'mapa-area-atualizada' || e[0] === 'mapa-area-recusada');
    if (r) return { tipo: r[0] === 'mapa-area-atualizada' ? 'aceita' : 'recusada', dados: r[1] };
    await espera(20);
  }
  return { tipo: 'nada' };
}

async function conectarOsDois() {
  const chefe = await abrirSocket(await entrar('chefe@fora.com.br'));
  const membro = await abrirSocket(await entrar('membro@fora.com.br'));
  const initChefe = await esperarEvento(chefe, 'init', 0);
  await esperarEvento(membro, 'init', 0);
  return { chefe, membro, initChefe };
}

// ---------------------------------------------------- o mapa do cliente (vm)
function mapaDoCliente() {
  const ctx = { console, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/map.js'), 'utf8'), ctx);
  return ctx.window.OfficeMap;
}

(async function () {
  console.log('\nAREAS: MOVER E MUDAR O TAMANHO');
  try {
    // ------------------------------------------------- mapa do cliente, na vm
    const M = mapaDoCliente();
    const focoA = M.ROOMS.find((s) => s.id === 'bairro_a');
    conferir('cliente: Foco comeca com carpete', [M.pisoEmTile(22, 15), M.getRoomAtTile(22, 15).id], ['carpete_roxo', 'bairro_a']);
    conferir('cliente: hall e jardim nao se editam, o resto sim',
      [M.areaEditavel('hall'), M.areaEditavel('jardim'), M.areaEditavel('bairro_a'), M.areaEditavel('nao-existe')],
      [false, false, true, false]);
    conferir('cliente: area em cima de outra e recusada, com o nome dela',
      M.problemaDaArea('bairro_a', { r0: 13, c0: 11, r1: 20, c1: 20 }), 'Ia ficar em cima de "Projetos".');
    conferir('cliente: menor que 2x2 e recusada',
      M.problemaDaArea('bairro_a', { r0: 13, c0: 11, r1: 13, c1: 20 }), 'A area minima e 2 por 2.');
    M.aplicarArea('bairro_a', { r0: 13, c0: 11, r1: 16, c1: 20 });
    conferir('cliente: diminuiu - a celula que saiu vira corredor (piso e sala)',
      [M.pisoEmTile(22, 15), M.getRoomAtTile(22, 15).id], ['tijolo', 'hall']);
    conferir('cliente: e a que ficou continua Foco, com carpete',
      [M.pisoEmTile(13, 15), M.getRoomAtTile(13, 15).id], ['carpete_roxo', 'bairro_a']);
    M.aplicarArea('reuniao', { r0: 4, c0: 13, r1: 8, c1: 17 });
    const reuniao = M.ROOMS.find((s) => s.id === 'reuniao');
    conferir('cliente: a etiqueta anda junto, guardando a distancia do canto',
      [reuniao.labelR, reuniao.labelC], [4, 12]);
    conferir('cliente: o original fica guardado pra voltar',
      M.areaOriginal('bairro_a'), { r0: 13, c0: 11, r1: 18, c1: 26, som: { modo: 'perto', alcance: 2 }, nome: 'Foco', piso: 'carpete_roxo' });
    conferir('cliente: e a sala mexida nao muda o original (copia, nao referencia)', focoA.r1, 16);

    // ------------------------------------------------------------- servidor
    await subir();
    const cad = (nome, email, admin) => pedir('/api/registrar', {
      nome, email, senha: 'senha-das-areas-1', codigo: CODIGO_SEDE, codigoAdmin: admin ? ADMIN_CODE : '',
    });
    const r1 = await cad('Chefe', 'chefe@fora.com.br', true);
    const r2 = await cad('Membro', 'membro@fora.com.br', false);
    conferir('duas contas: uma diretoria, uma nao',
      [r1.status, r1.corpo.usuario.isAdmin, r2.status, r2.corpo.usuario.isAdmin], [200, true, 200, false]);

    let { chefe, membro, initChefe } = await conectarOsDois();
    conferir('o init traz as areas mexidas (nenhuma, na sede nova)', initChefe && initChefe.areasMapa, []);

    // Membro nao mexe.
    const desdeChefe = chefe.eventos.length;
    membro.mandar('mapa-area', { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 });
    await espera(400);
    conferir('membro (nao diretoria) tenta: ninguem recebe nada',
      chefe.eventos.slice(desdeChefe).some((e) => e[0] === 'mapa-area-atualizada'), false);
    conferir('  e nada foi gravado', arquivoDeAreas(), null);

    // A diretoria diminui o Foco A.
    const desdeMembro = membro.eventos.length;
    const diminuiu = await editar(chefe, { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 });
    conferir('diretoria diminui o Foco: aceito',
      [diminuiu.tipo, diminuiu.dados], ['aceita', { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 }]);
    conferir('  e TODO MUNDO recebe na hora (o membro tambem)',
      await esperarEvento(membro, 'mapa-area-atualizada', desdeMembro), { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 });
    conferir('  gravado no mapa.json (so a que mudou)',
      arquivoDeAreas(), [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som: { modo: 'perto', alcance: 2 }, nome: 'Foco', piso: 'carpete_roxo' }]);

    // O que e recusado, e o motivo que volta.
    const casos = [
      ['em cima do Projetos', { id: 'bairro_a', r0: 13, c0: 11, r1: 20, c1: 20 }, 'Ia ficar em cima de "Projetos".'],
      ['fora do mapa', { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 60 }, 'Fora do mapa.'],
      ['menor que 2x2', { id: 'bairro_a', r0: 13, c0: 11, r1: 13, c1: 20 }, 'A area minima e 2 por 2.'],
      ['coordenada que nao e numero', { id: 'bairro_a', r0: 'x', c0: 11, r1: 16, c1: 20 }, 'Fora do mapa.'],
      ['o hall (fundo)', { id: 'hall', r0: 3, c0: 3, r1: 10, c1: 10 }, 'Essa area nao se edita.'],
      ['area que nao existe', { id: 'sala-secreta', r0: 3, c0: 3, r1: 5, c1: 5 }, 'Essa area nao se edita.'],
    ];
    for (const [nome, dados, motivo] of casos) {
      const r = await editar(chefe, dados);
      conferir('recusa ' + nome + ', com o motivo', [r.tipo, r.dados && r.dados.erro], ['recusada', motivo]);
    }
    conferir('  e o arquivo nao mudou com nenhuma delas',
      arquivoDeAreas(), [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som: { modo: 'perto', alcance: 2 }, nome: 'Foco', piso: 'carpete_roxo' }]);

    // ------------------------------------------- a regra de som de cada area
    // Cada area diz de que jeito se ouve dentro dela, e isso muda sem mexer no
    // tamanho: o Foco vira sala fechada ("a sala toda se ouve, e ninguem de
    // fora entra") so trocando a regra. Ver docs/areas.md.
    const somFoco = await editar(chefe, { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som: { modo: 'sala', alcance: 3 } });
    conferir('diretoria transforma o Foco em sala fechada: aceito',
      [somFoco.tipo, somFoco.dados && somFoco.dados.som], ['aceita', { modo: 'sala', alcance: 3 }]);
    conferir('  e a regra vai junto no arquivo',
      arquivoDeAreas(), [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som: { modo: 'sala', alcance: 3 }, nome: 'Foco', piso: 'carpete_roxo' }]);

    const somCasos = [
      ['alcance de 40 tiles', { modo: 'perto', alcance: 40 }, 'O alcance vai de 1 a 12 tiles.'],
      ['alcance quebrado (2,5)', { modo: 'perto', alcance: 2.5 }, 'O alcance vai de 1 a 12 tiles.'],
      ['alcance que nao e numero', { modo: 'perto', alcance: 'muito' }, 'O alcance vai de 1 a 12 tiles.'],
      ['regra de som que nao existe', { modo: 'gritaria', alcance: 3 }, 'Regra de som que nao existe.'],
    ];
    for (const [nome, som, motivo] of somCasos) {
      const r = await editar(chefe, { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som });
      conferir('recusa ' + nome + ', com o motivo', [r.tipo, r.dados && r.dados.erro], ['recusada', motivo]);
    }
    conferir('  e nenhuma delas mexeu no que estava gravado',
      arquivoDeAreas(), [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som: { modo: 'sala', alcance: 3 }, nome: 'Foco', piso: 'carpete_roxo' }]);

    // Uma area vai pro lugar que a outra deixou livre.
    const cabine = await editar(chefe, { id: 'cabine1', r0: 17, c0: 21, r1: 18, c1: 25 });
    conferir('a Cabine 1 vai pro pedaco que o Foco liberou', cabine.tipo, 'aceita');
    const voltarFoco = await editar(chefe, { id: 'bairro_a', restaurar: true });
    conferir('voltar o Foco ao original agora bate na Cabine 1: recusado com o nome dela',
      [voltarFoco.tipo, voltarFoco.dados && voltarFoco.dados.erro], ['recusada', 'Ia ficar em cima de "Cabine 1".']);

    // ------------------------------------------- criar e apagar area (nova)
    // A lista de areas deixou de ser so a do codigo: a diretoria cria a dela,
    // com nome, piso e regra de som proprios, e so essa se apaga.
    async function criar(sock, dados) {
      const desde = sock.eventos.length;
      sock.mandar('mapa-area-nova', dados);
      const prazo = Date.now() + 2000;
      while (Date.now() < prazo) {
        const r = sock.eventos.slice(desde).find((e) => e[0] === 'mapa-area-criada' || e[0] === 'mapa-area-recusada');
        if (r) return { tipo: r[0] === 'mapa-area-criada' ? 'criada' : 'recusada', dados: r[1] };
        await espera(20);
      }
      return { tipo: 'nada' };
    }
    async function apagar(sock, id) {
      const desde = sock.eventos.length;
      sock.mandar('mapa-area-apagar', { id });
      const prazo = Date.now() + 2000;
      while (Date.now() < prazo) {
        const r = sock.eventos.slice(desde).find((e) => e[0] === 'mapa-area-apagada' || e[0] === 'mapa-area-recusada');
        if (r) return { tipo: r[0] === 'mapa-area-apagada' ? 'apagada' : 'recusada', dados: r[1] };
        await espera(20);
      }
      return { tipo: 'nada' };
    }

    const desdeMembro2 = membro.eventos.length;
    const nova = await criar(chefe, { r0: 0, c0: 0, r1: 2, c1: 5, nome: 'Sala do Cafe', piso: 'ladrilho', som: { modo: 'sala', alcance: 3 } });
    conferir('diretoria cria uma area nova: aceita, com id do servidor',
      [nova.tipo, nova.dados && typeof nova.dados.id, nova.dados && nova.dados.nome], ['criada', 'string', 'Sala do Cafe']);
    conferir('  e todo mundo recebe a area inteira (nome, piso, cor e regra)',
      (await esperarEvento(membro, 'mapa-area-criada', desdeMembro2)).piso, 'ladrilho');
    const idNovo = nova.dados.id;
    conferir('  gravada no arquivo, marcada como criada',
      (arquivoDeAreas().find((a) => a.id === idNovo) || {}).criada, true);

    const membroCria = await criar(membro, { r0: 3, c0: 3, r1: 4, c1: 4 });
    conferir('membro (nao diretoria) nao cria', membroCria.tipo, 'nada');

    const casosNovos = [
      ['em cima de outra area', { r0: 13, c0: 11, r1: 15, c1: 15 }, 'Ia ficar em cima de "Foco".'],
      ['menor que 2x2', { r0: 20, c0: 20, r1: 20, c1: 22 }, 'A area minima e 2 por 2.'],
      ['nome vazio', { r0: 26, c0: 3, r1: 27, c1: 6, nome: '   ' }, 'A area precisa de um nome.'],
      ['nome comprido demais', { r0: 26, c0: 3, r1: 27, c1: 6, nome: 'a'.repeat(25) }, 'O nome vai ate 24 letras.'],
      ['piso que nao existe', { r0: 26, c0: 3, r1: 27, c1: 6, piso: 'lava' }, 'Esse piso nao existe.'],
    ];
    for (const [nome, dados, motivo] of casosNovos) {
      const r = await criar(chefe, dados);
      conferir('recusa area nova ' + nome, [r.tipo, r.dados && r.dados.erro], ['recusada', motivo]);
    }

    // O nome vai pra etiqueta do mapa, pra Visao de salas e pro minimapa. O que
    // volta pra TODOS os navegadores tem que ser o nome ja limpo: se so o
    // arquivo ficasse limpo, quem estivesse com o mapa aberto veria a etiqueta
    // torta ate recarregar.
    const desdeRenome = membro.eventos.length;
    const renomeia = await editar(chefe, { id: idNovo, r0: 0, c0: 0, r1: 2, c1: 5, nome: ' Cafe \n do   time ' });
    conferir('renomear: aceito, com o nome limpo (sem quebra de linha nem espaco em fila)',
      [renomeia.tipo, renomeia.dados && renomeia.dados.nome], ['aceita', 'Cafe do time']);
    conferir('  o membro recebe o nome limpo tambem',
      (await esperarEvento(membro, 'mapa-area-atualizada', desdeRenome) || {}).nome, 'Cafe do time');
    conferir('  e o que ficou gravado e o mesmo',
      (arquivoDeAreas().find((a) => a.id === idNovo) || {}).nome, 'Cafe do time');

    const trocaPiso = await editar(chefe, { id: idNovo, r0: 0, c0: 0, r1: 2, c1: 5, piso: 'madeira' });
    conferir('trocar o piso: aceito, e vai no arquivo',
      [trocaPiso.tipo, (arquivoDeAreas().find((a) => a.id === idNovo) || {}).piso], ['aceita', 'madeira']);
    const pisoFalso = await editar(chefe, { id: idNovo, r0: 0, c0: 0, r1: 2, c1: 5, piso: 'lava' });
    conferir('piso que nao existe e recusado, com o motivo',
      [pisoFalso.tipo, pisoFalso.dados && pisoFalso.dados.erro], ['recusada', 'Esse piso nao existe.']);

    // Area de fabrica tambem muda de nome - e "voltar ao original" devolve o
    // nome e deixa o arquivo como estava.
    const antesDoRename = JSON.stringify(arquivoDeAreas());
    const renomeiaFabrica = await editar(chefe, { id: 'bairro_b', r0: 19, c0: 11, r1: 24, c1: 26, nome: 'Squad' });
    conferir('area de fabrica tambem renomeia, e vai no arquivo',
      [renomeiaFabrica.tipo, (arquivoDeAreas().find((a) => a.id === 'bairro_b') || {}).nome], ['aceita', 'Squad']);
    const voltaFabrica = await editar(chefe, { id: 'bairro_b', restaurar: true });
    conferir('  "voltar ao original" devolve o nome e limpa o arquivo',
      [voltaFabrica.dados && voltaFabrica.dados.nome, JSON.stringify(arquivoDeAreas()) === antesDoRename], ['Projetos', true]);

    // ---- apagar area que tem reuniao marcada: recusa, com o motivo
    // Area "sala" com mesa de reuniao passa a poder receber reuniao (docs/areas.md).
    // Apagar com reuniao marcada deixaria ela apontando pra uma sala que nao
    // existe - por isso a diretoria e avisada, e desmarca antes.
    chefe.mandar('mapa-editar', { c: 2, r: 1, t: mapaServidor.MESA_REUNIAO });
    await espera(150);
    const desdeMarca = chefe.eventos.length;
    chefe.mandar('reuniao-marcar', {
      titulo: 'Reuniao do time', inicio: Date.now() + 3600 * 1000, minutos: 30, sala: idNovo,
    });
    const marcadas = await esperarEvento(chefe, 'reunioes', desdeMarca);
    conferir('area criada como sala fechada, com mesa de reuniao, ja recebe reuniao',
      marcadas && marcadas.reunioes.filter((r) => r.sala === idNovo).length, 1);
    const apagaComReuniao = await apagar(chefe, idNovo);
    conferir('area com reuniao marcada NAO se apaga, e o motivo diz o que fazer',
      [apagaComReuniao.tipo, apagaComReuniao.dados && apagaComReuniao.dados.erro],
      ['recusada', 'Tem 1 reuniao marcada nessa area. Desmarque antes de apagar.']);
    conferir('  e a area continua la',
      (arquivoDeAreas() || []).some((a) => a.id === idNovo), true);
    const idReuniao = marcadas.reunioes.find((r) => r.sala === idNovo).id;
    const desdeDesmarca = chefe.eventos.length;
    chefe.mandar('reuniao-desmarcar', { id: idReuniao });
    await esperarEvento(chefe, 'reunioes', desdeDesmarca);
    chefe.mandar('mapa-editar', { c: 2, r: 1, t: 0 });   // devolve a celula como estava
    await espera(150);

    // ---- o limite de areas
    // Nao e limite de memoria: com muito mais que isso a Visao de salas e o
    // minimapa viram sopa de etiqueta. Cria ate o teto na faixa de baixo do
    // jardim (fora de qualquer area editavel) e confere que a proxima e recusada.
    const deFabrica = mapaServidor.ROOMS.length;
    const lugares = [];
    for (let c0 = 0; c0 + 1 <= mapaServidor.COLS - 1; c0 += 3) lugares.push({ r0: 25, c0, r1: 26, c1: c0 + 1 });
    const paraOLimite = [];
    let recusadaPeloLimite = null;
    for (const lugar of lugares) {
      const r = await criar(chefe, lugar);
      if (r.tipo === 'criada') paraOLimite.push(r.dados.id);
      else { recusadaPeloLimite = r; break; }
    }
    conferir('criou ate o teto de ' + mapaServidor.AREAS_MAX + ' areas (as de fabrica contam)',
      paraOLimite.length, mapaServidor.AREAS_MAX - (deFabrica + 1));
    conferir('  e a seguinte e recusada, dizendo o teto',
      [recusadaPeloLimite && recusadaPeloLimite.tipo, recusadaPeloLimite && recusadaPeloLimite.dados && recusadaPeloLimite.dados.erro],
      ['recusada', 'A sede ja tem ' + mapaServidor.AREAS_MAX + ' areas. Apague uma antes de criar outra.']);
    let apagadasDoLimite = 0;
    for (const id of paraOLimite) {
      if ((await apagar(chefe, id)).tipo === 'apagada') apagadasDoLimite++;
    }
    conferir('  apagando essas, sobra so a que a diretoria queria',
      [apagadasDoLimite, (arquivoDeAreas() || []).filter((a) => a.criada).map((a) => a.id)],
      [paraOLimite.length, [idNovo]]);

    const apagaFabrica = await apagar(chefe, 'bairro_a');
    conferir('area de fabrica NAO se apaga',
      [apagaFabrica.tipo, apagaFabrica.dados && apagaFabrica.dados.erro],
      ['recusada', 'So da pra apagar area que a diretoria criou.']);
    const membroApaga = await apagar(membro, idNovo);
    conferir('membro tambem nao apaga', membroApaga.tipo, 'nada');

    chefe.fechar(); membro.fechar();
    await parar();

    // ------------------------------------------------------------ reinicio
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    const areasNoInit = (initChefe.areasMapa || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    conferir('reiniciou: a area que a diretoria criou volta inteira (nome, piso, regra e cor)',
      areasNoInit.filter((a) => a.criada).map((a) => [a.id, a.nome, a.piso, a.som, typeof a.cor]),
      [[idNovo, 'Cafe do time', 'madeira', { modo: 'sala', alcance: 3 }, 'string']]);
    conferir('reiniciou: as duas mudancas voltam - inclusive a que depende da outra ter saido',
      areasNoInit.filter((a) => !a.criada), [
        { id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20, som: { modo: 'sala', alcance: 3 }, nome: 'Foco', piso: 'carpete_roxo' },
        { id: 'cabine1', r0: 17, c0: 21, r1: 18, c1: 25, som: { modo: 'sala', alcance: 3 }, nome: 'Cabine 1', piso: 'espinha_fria' },
      ]);

    // Apagar a que a diretoria criou: sai pra todo mundo e do arquivo.
    const desdeApaga = membro.eventos.length;
    const apagouNova = await apagar(chefe, idNovo);
    conferir('diretoria apaga a area que criou: aceito', [apagouNova.tipo, apagouNova.dados], ['apagada', { id: idNovo }]);
    conferir('  e todo mundo recebe (o membro tambem)',
      await esperarEvento(membro, 'mapa-area-apagada', desdeApaga), { id: idNovo });
    conferir('  e sai do arquivo', (arquivoDeAreas() || []).some((a) => a.id === idNovo), false);

    // Restaurar, na ordem que da.
    const volta1 = await editar(chefe, { id: 'cabine1', restaurar: true });
    conferir('Cabine 1 volta ao original', [volta1.tipo, volta1.dados], ['aceita', { id: 'cabine1', r0: 3, c0: 3, r1: 5, c1: 7, som: { modo: 'sala', alcance: 3 }, nome: 'Cabine 1', piso: 'espinha_fria' }]);
    const volta2 = await editar(chefe, { id: 'bairro_a', restaurar: true });
    conferir('  e ai o Foco tambem volta', [volta2.tipo, volta2.dados], ['aceita', { id: 'bairro_a', r0: 13, c0: 11, r1: 18, c1: 26, som: { modo: 'perto', alcance: 2 }, nome: 'Foco', piso: 'carpete_roxo' }]);
    conferir('  e o arquivo fica sem area nenhuma (tudo de fabrica)', arquivoDeAreas(), []);
    const deNovo = await editar(chefe, { id: 'bairro_a', r0: 13, c0: 11, r1: 18, c1: 26 });
    conferir('mandar o retangulo que ja esta la: responde (pra tela destravar) sem gravar nada',
      [deNovo.tipo, arquivoDeAreas()], ['aceita', []]);
    const membroRestaura = await editar(membro, { id: 'bairro_a', restaurar: true });
    conferir('membro tambem nao restaura nada', membroRestaura.tipo, 'nada');

    chefe.fechar(); membro.fechar();
    await parar();

    // ---------------------------------------- arquivo que nao fecha (a mao)
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    bruto.areas = [
      { id: 'bairro_a', r0: 13, c0: 11, r1: 21, c1: 26 },   // em cima do Projetos
      { id: 'copa', r0: 3, c0: 27, r1: 8, c1: 34 },
    ];
    fs.writeFileSync(ARQUIVO, JSON.stringify(bruto));
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    conferir('mapa.json editado a mao com uma area em cima da outra: fica a planta de fabrica',
      initChefe.areasMapa, []);
    conferir('  e o log diz por que', /areas do mapa\.json nao fecham/.test(saida), true);
    chefe.fechar(); membro.fechar();
    await parar();

    // O mesmo arquivo que nao fecha, mas agora com uma area CRIADA dentro (em
    // lugar livre). A criada entra no mapa ANTES de o arquivo ser conferido
    // (as de fabrica podem ter saido do lugar pra caber ao lado dela) - entao,
    // se o arquivo nao fecha, ela tem que SAIR junto. Se ficasse, a sede
    // subiria com uma sala fantasma que ninguem pode apagar.
    const comCriada = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    comCriada.areas = [
      { id: 'area-abc123-1', criada: true, nome: 'Fantasma', piso: 'tijolo', cor: '#4d8fa0',
        r0: 25, c0: 3, r1: 26, c1: 6, som: { modo: 'perto', alcance: 3 } },
      { id: 'bairro_a', r0: 13, c0: 11, r1: 21, c1: 26 },   // em cima do Projetos: o arquivo nao fecha
    ];
    fs.writeFileSync(ARQUIVO, JSON.stringify(comCriada));
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    conferir('arquivo que nao fecha, com area criada dentro: nada dele entra', initChefe.areasMapa, []);
    const naOndeEstava = await criar(chefe, { r0: 25, c0: 3, r1: 26, c1: 6 });
    conferir('  e a area criada nao ficou como fantasma: da pra criar outra no mesmo lugar',
      naOndeEstava.tipo, 'criada');
    chefe.fechar(); membro.fechar();
    await parar();

    // Id fora do formato que o servidor gera: o arquivo pode ter sido editado a
    // mao, e o id viaja pra todos os navegadores.
    const idEstranho = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    idEstranho.areas = [
      { id: '<img src=x onerror=alert(1)>', criada: true, nome: 'Estranha', piso: 'tijolo',
        r0: 25, c0: 3, r1: 26, c1: 6, som: { modo: 'perto', alcance: 3 } },
    ];
    fs.writeFileSync(ARQUIVO, JSON.stringify(idEstranho));
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    conferir('area criada com id fora do formato do servidor nao entra', initChefe.areasMapa, []);
    chefe.fechar(); membro.fechar();
    await parar();

    // ------------------------------------------- decoracao de outra planta
    // A planta mudou de tamanho (server/map.js, VERSAO_PLANTA): o que foi salvo
    // por celula na antiga cairia no lugar errado. Sai do caminho - guardado
    // com outro nome, e nao apagado - e a sede comeca do zero.
    fs.writeFileSync(ARQUIVO, JSON.stringify({
      mudancas: [{ c: 12, r: 18, t: 8 }],
      areas: [{ id: 'bairro_a', r0: 13, c0: 11, r1: 16, c1: 20 }],
    }));
    await subir();
    ({ chefe, membro, initChefe } = await conectarOsDois());
    conferir('mapa.json de outra planta (sem versao = a antiga): nada dele entra',
      [initChefe.areasMapa, initChefe.mudancasMapa], [[], []]);
    const guardado = fs.readdirSync(PASTA).filter((n) => n.startsWith('mapa.json.planta-'));
    conferir('  e ele nao some: fica guardado como mapa.json.planta-1',
      [guardado, fs.existsSync(ARQUIVO)], [['mapa.json.planta-1'], false]);
    chefe.fechar(); membro.fechar();
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
    try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
