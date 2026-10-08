// Os prazos do Kanban do CRM na Agenda (server/prazos.js, public/js/calendario.js).
//
// O pedido mais antigo do Caio era "calendario e trello de cada diretoria lincados": o
// prazo de cada cartao morava dentro do quadro e a Agenda nao sabia dele. Tres partes:
// a regra do servidor, a regra da tela, e a sede de verdade falando com um CRM falso
// (pasta de dados descartavel - NAO mexe em server/data).
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');
const P = require('../server/prazos');

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

function dia(base, n) {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------ o servidor
console.log('\nPRAZOS: QUEM E "MEU"');
conferir('"Caio" e "Caio Lucas" batem (o CRM pode ter o nome inteiro)', P.mesmoNome('Caio', 'Caio Lucas'), true);
conferir('  sem acento e sem caixa: "joao pedro" e "João Pedro"', P.mesmoNome('joao pedro', 'João Pedro'), true);
conferir('  "da/de/dos" nao contam: "Ana da Silva" e "Ana Silva"', P.mesmoNome('Ana da Silva', 'Ana Silva'), true);
conferir('  "Caio Lucas" e "Caio Silva" NAO (sobrenome diferente)', P.mesmoNome('Caio Lucas', 'Caio Silva'), false);
conferir('  primeiro nome diferente NAO: "Lucas" e "Caio Lucas"', P.mesmoNome('Lucas', 'Caio Lucas'), false);
conferir('  nome vazio nunca bate', [P.mesmoNome('', 'Caio'), P.mesmoNome('Caio', '')], [false, false]);

console.log('\nPRAZOS: O QUE VAI PRA AGENDA');
const HOJE = '2026-09-24';
const cartao = (nome, prazo, extra) => Object.assign({ id: nome, nome, url: 'u/' + nome, membros: [], prazo, prazoConcluido: false }, extra || {});
const quadros = [
  { nome: 'Comercial', listas: [
    { nome: 'A fazer', cartoes: [cartao('Proposta FAPESP', dia(HOJE, 3), { membros: ['Caio Lucas Silva'] }), cartao('Sem prazo', null)] },
    { nome: 'Feito', cartoes: [cartao('Contrato assinado', dia(HOJE, -2), { prazoConcluido: true, membros: ['Bia'] })] },
  ] },
  { nome: 'Marketing', listas: [
    { nome: 'Fazendo', cartoes: [
      cartao('Post do evento', HOJE, { membros: ['Caio Mendes'] }),
      cartao('Esquecido', dia(HOJE, -31)),
      cartao('Longe demais', dia(HOJE, 91)),
      cartao('Atrasado', dia(HOJE, -5), { membros: ['caio lucas'] }),
    ] },
  ] },
];
const lista = P.extrair(quadros, { meuNome: 'Caio Lucas', hoje: HOJE });
conferir('so cartoes com prazo, de 30 dias atras ate 90 pra frente, do mais cedo ao mais tarde',
  lista.map((p) => p.nome), ['Atrasado', 'Contrato assinado', 'Post do evento', 'Proposta FAPESP']);
conferir('  cada um diz de que quadro e lista veio', lista.map((p) => p.quadro + ' > ' + p.lista),
  ['Marketing > Fazendo', 'Comercial > Feito', 'Marketing > Fazendo', 'Comercial > A fazer']);
conferir('  "meu" e pelo nome do membro (Caio Lucas sim, Caio Mendes nao)', lista.map((p) => p.meu), [true, false, false, true]);
conferir('  o concluido vem marcado (a tela risca, e tira da lista de pendentes)', lista.map((p) => p.concluido), [false, true, false, false]);
conferir('  e o link e o do cartao no CRM', lista[3].url, 'u/Proposta FAPESP');
conferir('sem nome da conta, nada e "meu"', P.extrair(quadros, { meuNome: '', hoje: HOJE }).some((p) => p.meu), false);
conferir('sem quadros, lista vazia (e nao quebra)', [P.extrair(null, { hoje: HOJE }), P.extrair([{ nome: 'X' }], { hoje: HOJE })], [[], []]);

// ------------------------------------------------------------ a tela
console.log('\nPRAZOS: COMO A AGENDA ESCREVE');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, 'public/js/calendario.js'), 'utf8'), ctx);
const C = ctx.window.Calendario;
conferir('hoje, amanha, em N dias',
  [C._rotuloDoPrazo(HOJE, HOJE), C._rotuloDoPrazo(dia(HOJE, 1), HOJE), C._rotuloDoPrazo(dia(HOJE, 6), HOJE)], ['hoje', 'amanha', 'em 6 dias']);
conferir('  atrasado, no singular e no plural', [C._rotuloDoPrazo(dia(HOJE, -1), HOJE), C._rotuloDoPrazo(dia(HOJE, -4), HOJE)], ['atrasado 1 dia', 'atrasado 4 dias']);
conferir('  de uma semana em diante, dia da semana e data', C._rotuloDoPrazo('2026-10-07', HOJE), 'qua, 07/10');
conferir('  a conta de dias atravessa mes e ano', [C._diasEntre('2026-12-30', '2027-01-02'), C._diasEntre('2026-03-01', '2026-02-27')], [3, -2]);
const naLista = (soMeus) => C._prazosDaLista(lista.concat([{ nome: 'Daqui a 15', prazo: dia(HOJE, 15), concluido: false, meu: true }]), HOJE, soMeus).map((p) => p.nome);
conferir('a lista da lateral: pendentes, dos atrasados ate duas semanas (sem o concluido, sem o de 15 dias)',
  naLista(false), ['Atrasado', 'Post do evento', 'Proposta FAPESP']);
conferir('  "so os meus" deixa so os do meu nome', naLista(true), ['Atrasado', 'Proposta FAPESP']);

// ------------------------------------------------------ a sede de verdade
const CHAVE = 'chave-de-teste-do-kanban-com-mais-de-32-caracteres';
const PORTA = 3744;
const BASE = 'http://127.0.0.1:' + PORTA;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-prazos-'));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let servidor = null;
let crm = null;

function subirCrm(hoje) {
  const pedidos = [];
  return new Promise((resolve) => {
    crm = http.createServer((req, res) => {
      let corpo = '';
      req.on('data', (b) => { corpo += b; });
      req.on('end', () => {
        pedidos.push({ auth: req.headers.authorization, corpo: JSON.parse(corpo || '{}') });
        if (req.headers.authorization !== 'Bearer ' + CHAVE) { res.writeHead(401); return res.end('{}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ quadros: [{
          id: uuid(1), nome: 'Comercial', listas: [{ id: uuid(2), nome: 'A fazer', cartoes: [
            { id: uuid(3), titulo: 'Proposta do cliente', membros: ['Caio Lucas Silva'], prazo: dia(hoje, 2), prazoConcluido: false },
            { id: uuid(4), titulo: 'Relatorio do mes', membros: ['Bia Souza'], prazo: dia(hoje, 1), prazoConcluido: false },
            { id: uuid(5), titulo: 'Sem prazo', membros: ['Caio Lucas'], prazo: null },
          ] }],
        }] }));
      });
    });
    crm.listen(0, '127.0.0.1', () => resolve({ url: 'http://127.0.0.1:' + crm.address().port, pedidos }));
  });
}

function abrirSocket(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 6000);
    ws.addEventListener('message', (evt) => {
      const m = String(evt.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) ws.send('42' + JSON.stringify(['join', {}]));
      else if (m.startsWith('42')) {
        try {
          const e = JSON.parse(m.slice(2));
          eventos.push(e);
          if (e[0] === 'init') { clearTimeout(prazo); resolve({ ws, eventos }); }
        } catch (x) { /* ignora */ }
      }
    });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

async function pedirPrazos(s) {
  const antes = s.eventos.filter((e) => e[0] === 'prazos').length;
  s.ws.send('42' + JSON.stringify(['prazos-pedir', { email: 'outra@adm.com' }]));
  for (let i = 0; i < 40; i++) {
    const todos = s.eventos.filter((e) => e[0] === 'prazos');
    if (todos.length > antes) return todos[todos.length - 1][1];
    await espera(100);
  }
  return null;
}

(async function () {
  console.log('\nPRAZOS: A SEDE DE VERDADE, COM UM CRM FALSO');
  const abertos = [];
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const C2 = await subirCrm(hoje);
    execFileSync(process.execPath, ['-e', `
      const u = require(${JSON.stringify(path.join(raiz, 'server', 'usuarios.js'))});
      u.criar({ nome: 'Caio Lucas', email: 'caio@adm.com', senha: 'senha-bem-forte-1', emailVerificado: true });
      u.criar({ nome: 'SoSenha', email: 'sosenha@adm.com', senha: 'senha-bem-forte-2' });
    `], { env: Object.assign({}, process.env, { DATA_DIR: pasta }), stdio: 'ignore' });

    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: pasta, PORT: String(PORTA), SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', CODIGO_SEDE: '', ADMIN_CODE: '', DIRETORIA_EMAILS: '',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', EMAIL_PROVEDOR: '', EMAIL_CHAVE: '',
        CRM_URL: C2.url, CRM_CHAVE_KANBAN: CHAVE, KANBAN_CHAVE_ESCRITORIO: '', CRM_CHAVE_DISCADOR: '',
        TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_QUADROS: '', TRELLO_BOARD_ID: '',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(BASE + '/api/saude')).ok) break; } catch (e) { /* ainda subindo */ }
      await espera(150);
    }
    const entrar = (email, senha) => fetch(BASE + '/api/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }),
    }).then((r) => (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0]);

    const caio = await abrirSocket(await entrar('caio@adm.com', 'senha-bem-forte-1'));
    const soSenha = await abrirSocket(await entrar('sosenha@adm.com', 'senha-bem-forte-2'));
    abertos.push(caio, soSenha);

    const d = await pedirPrazos(caio);
    conferir('a conta com e-mail provado recebe os prazos dos quadros dela, do mais cedo ao mais tarde',
      d && d.prazos.map((p) => [p.nome, p.meu]), [['Relatorio do mes', false], ['Proposta do cliente', true]]);
    conferir('  ligado e sem aviso', d && [d.ligado, d.aviso], [true, null]);
    conferir('  o link do cartao e montado a partir do CRM_URL', d && d.prazos[1].url, C2.url + '/kanban?quadro=' + uuid(1) + '&cartao=' + uuid(3));
    conferir('  o CRM so ouviu o e-mail DA CONTA (o do pedido e ignorado)', [...new Set(C2.pedidos.map((p) => p.corpo.email))], ['caio@adm.com']);

    const antes = C2.pedidos.length;
    await pedirPrazos(caio);
    conferir('abrir a Agenda de novo usa o cache (nao vira outra chamada ao CRM)', C2.pedidos.length, antes);

    const s = await pedirPrazos(soSenha);
    conferir('conta sem e-mail provado: nenhum prazo, e o aviso de como liberar',
      s && [s.ligado, s.prazos.length, /Entre uma vez com o Google/.test(s.aviso || '')], [true, 0, true]);
    conferir('  e o CRM nem ouve falar dela', C2.pedidos.some((p) => p.corpo.email === 'sosenha@adm.com'), false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e && e.stack ? e.stack : e));
  } finally {
    abertos.forEach((s) => { try { s.ws.close(); } catch (e) { /* ja foi */ } });
    if (servidor && !servidor.killed) servidor.kill();
    if (crm) crm.close();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
