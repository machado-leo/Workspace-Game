// Painel Pessoas (public/js/pessoas.js) e o aceno pra uma pessoa (server/index.js).
//
// O painel juntou a busca rapida (Ctrl+K) e a visao de salas, que faziam cada uma
// metade. As regras dele sao puras e ficam na primeira parte. A segunda sobe o
// servidor de verdade numa pasta descartavel e confere o aceno: antes, "Acenar"
// aparecia so em cima do proprio boneco e de outra sala ninguem via; agora so a
// pessoa recebe, com o nome de quem acenou, e com freio. NAO mexe em server/data.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

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

// ------------------------------------------------------------ as regras puras
console.log('\nPESSOAS: A LISTA');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/pessoas.js'), 'utf8'), ctx);
const P = ctx.window.Pessoas;

const salas = [
  { id: 'recepcao', nome: 'Recepcao' },
  { id: 'reuniao', nome: 'Sala de Reuniao' },
  { id: 'copa', nome: 'Copa' },
];
const onde = { eu: 'reuniao', ana: 'reuniao', bia: 'recepcao', caio: null, joao: 'reuniao' };
const gente = [
  { id: 'joao', name: 'João' }, { id: 'eu', name: 'Zeca' }, { id: 'ana', name: 'Ana' },
  { id: 'bia', name: 'Bia' }, { id: 'caio', name: 'Caio' },
];
const salaDe = (p) => salas.find((s) => s.id === onde[p.id]) || null;
const lista = (termo) => P._agrupar({ pessoas: gente, salas, salaDe, termo, selfId: 'eu' });
const resumo = (r) => r.grupos.map((g) => [g.sala ? g.sala.id : null, g.pessoas.map((p) => p.id)]);

const tudo = lista('');
conferir('agrupa por sala, na ordem das salas do mapa; quem nao esta em sala vai pro fim',
  resumo(tudo), [['recepcao', ['bia']], ['reuniao', ['eu', 'ana', 'joao']], [null, ['caio']]]);
conferir('  voce vem primeiro na sua sala (mesmo com nome "Zeca"); os outros por nome', tudo.grupos[1].pessoas.map((p) => p.name), ['Zeca', 'Ana', 'João']);
conferir('  e diz as salas livres agora (quem quer uma sala pra conversar)', tudo.vazias, ['Copa']);
conferir('  e quantos estao na sede, voce incluido', tudo.total, 5);

conferir('busca pelo nome, sem acento e sem caixa: "JOAO" acha o João', resumo(lista('JOAO')), [['reuniao', ['joao']]]);
conferir('busca pelo nome da sala: "reuniao" mostra quem esta la', resumo(lista('reuniao')), [['reuniao', ['eu', 'ana', 'joao']]]);
conferir('  com busca, nao lista "salas livres" (a sala pode so nao ter batido)', lista('bia').vazias, []);
conferir('  e o total continua sendo a sede inteira', lista('bia').total, 5);
conferir('busca sem ninguem: nenhum grupo', lista('xuxa').grupos.length, 0);

conferir('o que a pessoa esta fazendo: chamada marcada primeiro',
  P._detalhe({ chamada: { titulo: 'Entrevista' }, dividindoTela: true, lendo: { titulo: 'Livro' } }), 'Na chamada Entrevista');
conferir('  depois apresentando a tela', P._detalhe({ dividindoTela: true, lendo: { titulo: 'Livro' } }), 'Apresentando a tela');
conferir('  depois lendo um livro da estante', P._detalhe({ lendo: { titulo: 'Scrum' } }), 'Lendo Scrum');
conferir('  e nada quando so esta por ali', P._detalhe({ status: 'livre' }), '');

conferir('setas: sem ninguem marcado, descer marca o primeiro', P._mover(['a', 'b', 'c'], null, 1), 'a');
conferir('  subir sem ninguem marcado marca o ultimo', P._mover(['a', 'b', 'c'], null, -1), 'c');
conferir('  nao passa das pontas', [P._mover(['a', 'b'], 'b', 1), P._mover(['a', 'b'], 'a', -1)], ['b', 'a']);
conferir('  lista vazia: ninguem', P._mover([], 'a', 1), null);

// ----------------------------------------- o painel no lugar dos dois antigos
const html = fs.readFileSync(path.join(raiz, 'public/index.html'), 'utf8');
conferir('no trilho, um botao "Pessoas" no lugar de Buscar e Salas',
  [/id="btn-pessoas"/.test(html), /id="btn-busca"/.test(html), /id="btn-salas"/.test(html)], [true, false, false]);
conferir('  a busca rapida e a visao de salas sairam da pagina (e o rooms.js tambem)',
  [/busca-rapida/.test(html), /painel-salas/.test(html), /rooms\.js/.test(html), fs.existsSync(path.join(raiz, 'public/js/rooms.js'))],
  [false, false, false, false]);
const game = fs.readFileSync(path.join(raiz, 'public/js/game.js'), 'utf8');
conferir('  o game.js nao chama mais o Rooms (senao quebrava no carregamento)', /Rooms\.init/.test(game), false);

// ------------------------------------------------------ o aceno, de ponta a ponta
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-pessoas-'));
const PORTA = 3742;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'teste-sede';
let servidor = null;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function subir() {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), CODIGO_SEDE, SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '', CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '',
        EMAIL_PROVEDOR: '',
      }),
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

// Socket.io "na unha" (o projeto nao tem o cliente de Node) - o mesmo do chat-ritmo.js.
function abrirMembro(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const pendentes = new Map();
    let proximo = 1;
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 6000);
    const s = {
      eventos, ws, id: null,
      pedir(ev, dado) {
        const n = proximo++;
        return new Promise((res) => {
          pendentes.set(n, res);
          ws.send('42' + n + JSON.stringify([ev, dado]));
        });
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
          if (e[0] === 'init') { s.id = e[1].selfId; clearTimeout(prazo); resolve(s); }
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

const acenos = (s) => s.eventos.filter((e) => e[0] === 'aceno').map((e) => e[1]);

(async function () {
  console.log('\nPESSOAS: O ACENO CHEGA NA PESSOA');
  const abertos = [];
  try {
    await subir();
    const cookieAna = await conta('Ana', 'ana@adm.com');
    const A = await abrirMembro(cookieAna);
    const A2 = await abrirMembro(cookieAna);   // a Ana em outra aba
    const B = await abrirMembro(await conta('Bia', 'bia@adm.com'));
    const C = await abrirMembro(await conta('Caio', 'caio@adm.com'));
    abertos.push(A, A2, B, C);

    const r1 = await A.pedir('acenar', { para: B.id, nome: 'Nome Inventado' });
    await espera(250);
    conferir('Ana acena pra Bia: o servidor confirma', r1, { ok: true });
    conferir('  a Bia recebe, com o nome que o SERVIDOR sabe (nao o que o cliente mandou)', acenos(B), [{ de: A.id, nome: 'Ana' }]);
    conferir('  o Caio nao recebe nada (o aceno e so pra ela)', acenos(C), []);
    conferir('  nem a propria Ana', [acenos(A), acenos(A2)], [[], []]);

    conferir('acenar pra si mesmo: recusado', await A.pedir('acenar', { para: A.id }), { erro: 'invalido' });
    conferir('  nem pra si mesmo em outra aba (e a mesma conta)', await A.pedir('acenar', { para: A2.id }), { erro: 'invalido' });
    conferir('  nem pra quem nao existe', await A.pedir('acenar', { para: 'socket-inventado' }), { erro: 'invalido' });
    conferir('  nem sem destino', await A.pedir('acenar', {}), { erro: 'invalido' });

    const r2 = await A.pedir('acenar', { para: B.id });
    conferir('acenar de novo pra Bia logo em seguida: "ritmo" (um por par a cada 10 s)', r2 && r2.erro, 'ritmo');
    conferir('  com quanto esperar', r2 && r2.esperarMs > 0 && r2.esperarMs <= 10000, true);
    const r3 = await A2.pedir('acenar', { para: B.id });
    conferir('  e trocar de aba nao zera (o freio e da conta)', r3 && r3.erro, 'ritmo');
    await espera(250);
    conferir('  a Bia continua com um aceno so', acenos(B).length, 1);
    conferir('outra pessoa pode acenar pra Bia na mesma hora', await C.pedir('acenar', { para: B.id }), { ok: true });

    // Teto por conta: 5 a cada 30 s. Ate aqui a Ana gastou 3 da cota - o aceno
    // que chegou na Bia e os dois que o freio do par barrou (o teto da conta conta
    // TENTATIVA com destino valido: senao, errar de proposito em fila nao custava
    // nada). Com mais 3 pessoas ela chega ao teto.
    const outros = [];
    for (const n of ['Duda', 'Edu', 'Fabi']) {
      outros.push(await abrirMembro(await conta(n, n.toLowerCase() + '@adm.com')));
    }
    abertos.push(...outros);
    const respostas = [];
    for (const o of outros) respostas.push(await A.pedir('acenar', { para: o.id }));
    conferir('a Ana acena pra mais 3 pessoas seguidas: 2 passam, a terceira bate no teto (5 em 30 s)',
      respostas.map((r) => (r && r.ok ? 'ok' : r && r.erro)), ['ok', 'ok', 'ritmo']);
    await espera(250);
    conferir('  e quem foi barrado nao recebeu', acenos(outros[2]), []);
    conferir('a conta freada continua conectada (o freio recusa o aceno, nao a pessoa)', A.ws.readyState, 1);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    abertos.forEach((s) => { try { s.ws.close(); } catch (e) { /* ja foi */ } });
    if (servidor && !servidor.killed) servidor.kill();
    try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
