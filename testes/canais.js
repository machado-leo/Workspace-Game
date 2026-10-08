// Um canal de chat por diretoria (server/canais.js).
//
// Com tres canais fixos, assunto de diretoria se perdia no #projetos ou no #geral e
// a conversa voltava pro WhatsApp. A primeira parte confere a regra da lista; a
// segunda sobe o servidor de verdade (pasta de dados descartavel) nos tres jeitos:
// sede da ADM, sede de cliente e lista propria. NAO mexe em server/data.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const canais = require('../server/canais');

const raiz = path.join(__dirname, '..');
let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

console.log('\nCANAIS: UM POR DIRETORIA');
const ids = (lista) => lista.map((c) => c.id);
const diretorias = (lista) => lista.filter((c) => c.grupo === 'diretoria').map((c) => c.nome);

const adm = canais.montar({ nomeEmpresa: 'ADM Soluções', ehAdm: true });
conferir('sede da ADM: os tres de sempre e as cinco diretorias', ids(adm),
  ['geral', 'social', 'projetos', 'comercial', 'marketing', 'gente-e-gestao', 'financas', 'presidencia']);
conferir('  o nome aparece como e (com acento e maiuscula)', diretorias(adm), ['Comercial', 'Marketing', 'Gente e Gestão', 'Finanças', 'Presidência']);
conferir('  os de sempre nao mudam (o historico gravado e por id)', adm.slice(0, 3).map((c) => [c.id, c.grupo || null]),
  [['geral', null], ['social', null], ['projetos', null]]);
conferir('  o #geral continua falando da empresa', adm[0].descricao, 'Avisos e assuntos gerais da ADM Soluções');

const cliente = canais.montar({ nomeEmpresa: 'Acme', ehAdm: false });
conferir('sede de cliente sem configurar: nenhuma diretoria (as da ADM nao vazam)', ids(cliente), ['geral', 'social', 'projetos']);

conferir('lista propria (CANAIS_DIRETORIAS) vale pra sede de cliente',
  diretorias(canais.montar({ nomeEmpresa: 'Acme', ehAdm: false, lista: 'Vendas, Operações ,  RH' })), ['Vendas', 'Operações', 'RH']);
conferir('  e troca a lista da ADM', ids(canais.montar({ nomeEmpresa: 'ADM', ehAdm: true, lista: 'Projetos Internos' })),
  ['geral', 'social', 'projetos', 'projetos-internos']);
conferir('  "-" desliga', ids(canais.montar({ nomeEmpresa: 'ADM', ehAdm: true, lista: '-' })), ['geral', 'social', 'projetos']);
conferir('  so espacos conta como nao definida (a ADM fica com as dela)',
  diretorias(canais.montar({ nomeEmpresa: 'ADM', ehAdm: true, lista: '   ' })).length, 5);
conferir('  nome repetido, vazio ou que bate com um fixo nao vira canal',
  diretorias(canais.montar({ nomeEmpresa: 'X', ehAdm: false, lista: 'Comercial,,comercial,Geral, ,Social' })), ['Comercial']);
conferir('  nome com sinal de HTML ou quebra de linha e limpo',
  diretorias(canais.montar({ nomeEmpresa: 'X', ehAdm: false, lista: 'Mar<b>keting' })), ['Marbketing']);
conferir('  no maximo 12 diretorias',
  diretorias(canais.montar({ nomeEmpresa: 'X', ehAdm: false, lista: Array.from({ length: 20 }, (_, i) => 'D' + i).join(',') })).length, 12);
conferir('o id sai do nome sem acento', [canais.paraId('Gente e Gestão'), canais.paraId('  Finanças & Contábil ')], ['gente-e-gestao', 'financas-contabil']);

// ------------------------------------------------------------ de ponta a ponta
const PORTA = 3743;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'teste-sede';
const pastas = [];
let servidor = null;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function subir(env) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-canais-'));
  pastas.push(pasta);
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: pasta, PORT: String(PORTA), CODIGO_SEDE, SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '', CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '',
        EMAIL_PROVEDOR: '', NOME_SEDE: '', CANAIS_DIRETORIAS: '',
      }, env || {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let erro = '';
    servidor.stderr.on('data', (b) => { erro += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (servidor.exitCode !== null) return reject(new Error('o servidor morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('o servidor nao subiu em 15s'));
      fetch(BASE + '/api/saude').then((r) => (r.ok ? resolve() : setTimeout(tentar, 150))).catch(() => setTimeout(tentar, 150));
    })();
  });
}

function parar() {
  return new Promise((resolve) => {
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

// Socket.io "na unha" - o mesmo do chat-ritmo.js.
function abrirMembro(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const pendentes = new Map();
    let proximo = 1;
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 6000);
    const s = {
      eventos, ws, init: null,
      pedir(ev, dado) {
        const n = proximo++;
        return new Promise((res) => { pendentes.set(n, res); ws.send('42' + n + JSON.stringify([ev, dado])); });
      },
    };
    ws.addEventListener('message', (evt) => {
      const m = String(evt.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) ws.send('42' + JSON.stringify(['join', {}]));
      else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('43')) {
        const achou = /^43(\d+)(.*)$/s.exec(m);
        if (achou && pendentes.has(Number(achou[1]))) {
          const res = pendentes.get(Number(achou[1]));
          pendentes.delete(Number(achou[1]));
          try { res(JSON.parse(achou[2])[0]); } catch (e) { res(null); }
        }
      } else if (m.startsWith('42')) {
        try {
          const e = JSON.parse(m.slice(2));
          eventos.push(e);
          if (e[0] === 'init') { s.init = e[1]; clearTimeout(prazo); resolve(s); }
        } catch (x) { /* ignora */ }
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

async function conta(nome, email) {
  const r = await fetch(BASE + '/api/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, email, senha: 'senha-bem-longa', codigo: CODIGO_SEDE }),
  });
  if (!r.ok) throw new Error('conta ' + email + ': ' + r.status);
  return (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0];
}

(async function () {
  const abertos = [];
  try {
    // ------------------------------------------------ sede da ADM (sem NOME_SEDE)
    await subir();
    const A = await abrirMembro(await conta('Ana', 'ana@adm.com'));
    const B = await abrirMembro(await conta('Bia', 'bia@adm.com'));
    abertos.push(A, B);
    conferir('servidor da ADM: quem entra recebe os 8 canais', ids(A.init.canais),
      ['geral', 'social', 'projetos', 'comercial', 'marketing', 'gente-e-gestao', 'financas', 'presidencia']);
    const r = await A.pedir('chat-mensagem', { conversa: 'canal:gente-e-gestao', texto: 'processo seletivo sexta' });
    await espera(250);
    conferir('mensagem no #Gente e Gestão passa', r, { ok: true });
    conferir('  e chega em quem esta na sede (canal aberto, como os outros)',
      B.eventos.filter((e) => e[0] === 'chat-mensagem' && e[1].conversa === 'canal:gente-e-gestao').map((e) => e[1].texto), ['processo seletivo sexta']);
    const hist = await new Promise((res) => {
      B.ws.send('42' + JSON.stringify(['chat-historico', { conversa: 'canal:gente-e-gestao' }]));
      setTimeout(() => res(B.eventos.filter((e) => e[0] === 'chat-historico').pop()), 250);
    });
    conferir('  e fica no historico do canal', hist && hist[1].mensagens.map((m) => m.texto), ['processo seletivo sexta']);
    // Conversa invalida o servidor descarta calado (nem responde): confere que nao chegou.
    A.ws.send('42' + JSON.stringify(['chat-mensagem', { conversa: 'canal:diretoria-secreta', texto: 'x' }]));
    await espera(250);
    conferir('canal que nao existe continua recusado (a mensagem nao chega em ninguem)',
      B.eventos.filter((e) => e[0] === 'chat-mensagem' && e[1].conversa === 'canal:diretoria-secreta').length, 0);
    abertos.forEach((s) => s.ws.close());
    abertos.length = 0;
    await parar();

    // ------------------------------------------ sede de cliente, sem configurar
    await subir({ NOME_SEDE: 'Acme Consultoria' });
    const C = await abrirMembro(await conta('Caio', 'caio@acme.com'));
    abertos.push(C);
    conferir('sede de cliente: so os tres de sempre', ids(C.init.canais), ['geral', 'social', 'projetos']);
    C.ws.close();
    abertos.length = 0;
    await parar();

    // ---------------------------------------------------- lista propria
    await subir({ NOME_SEDE: 'Acme Consultoria', CANAIS_DIRETORIAS: 'Vendas,Operações' });
    const D = await abrirMembro(await conta('Duda', 'duda@acme.com'));
    abertos.push(D);
    conferir('sede de cliente com CANAIS_DIRETORIAS: as dela', D.init.canais.filter((c) => c.grupo === 'diretoria').map((c) => [c.id, c.nome]),
      [['vendas', 'Vendas'], ['operacoes', 'Operações']]);
    conferir('  e da pra ligar pro grupo de um canal de diretoria', await (async () => {
      D.ws.send('42' + JSON.stringify(['chamada-chamar-grupo', { canal: 'operacoes' }]));
      await espera(300);
      const c = D.eventos.filter((e) => e[0] === 'chamada-mudou').pop();
      return c && c[1].chamada;
    })(), { id: 'canal:operacoes', titulo: '#Operações' });
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    abertos.forEach((s) => { try { s.ws.close(); } catch (e) { /* ja foi */ } });
    await parar();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
