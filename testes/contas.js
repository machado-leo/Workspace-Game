// Gestao de conta, de ponta a ponta: sobe o servidor de verdade numa pasta de
// dados descartavel e conversa com ele por HTTP e pelo socket.
//
// O que importa aqui e o que so aparece na costura: o cookie antigo que continua
// valendo depois de trocar a senha, a aba aberta do ex-membro que continua
// dentro da sede, o membro comum que chega na rota da diretoria.
//
// NAO mexe em server/data: usa DATA_DIR numa pasta temporaria, apagada no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-contas-'));
const PORTA = 3712;
const BASE = 'http://127.0.0.1:' + PORTA;
const CODIGO_SEDE = 'teste-sede';
const ADMIN_CODE = 'teste-chefe';

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
// Espera o processo morrer de verdade: o segundo servidor sobe na mesma porta.
function parar() {
  return new Promise((resolve) => {
    // morto por sinal (o kill), o exitCode fica null e quem diz e o signalCode
    if (!servidor || servidor.exitCode !== null || servidor.signalCode !== null) return resolve();
    servidor.once('exit', () => resolve());
    servidor.kill();
  });
}

async function derrubar() {
  await parar();
  try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }
}

function subir() {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        DATA_DIR: PASTA, PORT: String(PORTA), CODIGO_SEDE, ADMIN_CODE,
        SESSION_SECRET: 'segredo-de-teste-bem-comprido', SEM_LOGIN: '', NODE_ENV: 'test',
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRELLO_API_KEY: '', TRELLO_TOKEN: '',
        TRELLO_BOARD_ID: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', EMAIL_PROVEDOR: '',
      }),
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

function pedir(rota, { metodo = 'GET', corpo, cookie } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (cookie) cabecalhos.Cookie = cookie;
  return fetch(BASE + rota, {
    method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (r) => ({
    status: r.status,
    cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null,
    corpo: await r.json().catch(() => null),
  }));
}

// Socket.io "na unha" (o projeto nao tem o cliente de Node): protocolo 4 do
// engine.io por WebSocket. "40" conecta, "42[...]" e evento, "2" e ping.
function abrirSocket(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const eventos = [];
    let fechou = false;
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 5000);
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) ws.send('40');
      else if (m === '2') ws.send('3');
      else if (m.startsWith('40')) {
        clearTimeout(prazo);
        ws.send('42' + JSON.stringify(['join', {}]));
        resolve({ eventos, fechado: () => fechou, ws });
      } else if (m.startsWith('44')) { clearTimeout(prazo); reject(new Error('recusado: ' + m)); }
      else if (m.startsWith('42')) { try { eventos.push(JSON.parse(m.slice(2))); } catch (e) { /* ignora */ } }
      else if (m === '41') fechou = true;
    });
    ws.addEventListener('close', () => { fechou = true; });
    ws.addEventListener('error', () => { clearTimeout(prazo); reject(new Error('erro no socket')); });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function registrar(nome, email, admin) {
  return pedir('/api/registrar', {
    metodo: 'POST',
    corpo: { nome, email, senha: 'senha-original-1', codigo: CODIGO_SEDE, codigoAdmin: admin ? ADMIN_CODE : '' },
  });
}

(async function () {
  console.log('\nCONTAS: SENHA E MEMBROS');
  try {
    await subir();

    // ------------------------------------------------- quem pode criar conta
    // A regra mudou: e-mail da empresa entra SEM codigo. O codigo so vale pra
    // e-mail de fora - e sem CODIGO_SEDE configurado, e-mail de fora nao entra
    // de jeito nenhum (antes caia num padrao escrito no codigo-fonte, que esta
    // num repositorio publico).
    const daEmpresa = await pedir('/api/registrar', {
      metodo: 'POST',
      corpo: { nome: 'Caio', email: 'caio@admsolucoes.com.br', senha: 'senha-original-1' },
    });
    // (este servidor sobe SEM o Google; com ele ligado, e-mail da ADM nao se
    // cadastra com senha - ver testes/login-google.js)
    conferir('e-mail da empresa cria conta SEM codigo (Google desligado)', daEmpresa.status, 200);
    // Cadastro com senha nao prova quem e: a primeira conta NAO vira diretoria.
    // Antes virava - e com a sede vazia depois de um deploy, o primeiro estranho
    // a digitar um @admsolucoes qualquer mandava na sede.
    conferir('  e nem a PRIMEIRA conta vira diretoria por senha',
      daEmpresa.corpo.usuario.isAdmin, false);
    conferir('  conta com senha diz que tem senha (a tela mostra "Trocar senha")',
      [daEmpresa.corpo.usuario.temSenha, daEmpresa.corpo.usuario.google], [true, false]);

    const deForaSemCodigo = await pedir('/api/registrar', {
      metodo: 'POST',
      corpo: { nome: 'Fora', email: 'alguem@gmail.com', senha: 'senha-original-1' },
    });
    conferir('e-mail de fora SEM codigo e recusado', deForaSemCodigo.status, 403);

    const deForaCodigoErrado = await pedir('/api/registrar', {
      metodo: 'POST',
      corpo: { nome: 'Fora', email: 'alguem@gmail.com', senha: 'senha-original-1', codigo: 'chutando' },
    });
    conferir('e com o codigo errado tambem', deForaCodigoErrado.status, 403);

    const segunda = await pedir('/api/registrar', {
      metodo: 'POST',
      corpo: { nome: 'Bia', email: 'bia@admsolucoes.com.br', senha: 'senha-original-1' },
    });
    conferir('a SEGUNDA conta ja nao e diretoria', segunda.corpo.usuario.isAdmin, false);

    const chefe = await registrar('Chefe', 'chefe@adm.com', true);
    const ana = await registrar('Ana', 'ana@adm.com', false);
    conferir('e-mail de fora COM o codigo entra', [chefe.status, ana.status], [200, 200]);
    // Com a primeira conta ja criada acima, este e o unico teste que ainda
    // prova que o codigo de diretoria funciona.
    conferir('  e o codigo de diretoria promove quem usa', chefe.corpo.usuario.isAdmin, true);
    conferir('  e nao promove quem nao usa', ana.corpo.usuario.isAdmin, false);

    // ------------------------------------------------------ trocar a senha
    const errada = await pedir('/api/senha', { metodo: 'PUT', cookie: ana.cookie, corpo: { senhaAtual: 'chute', novaSenha: 'nova-senha-da-ana' } });
    conferir('trocar senha com a atual errada: recusa', errada.status, 403);
    const curta = await pedir('/api/senha', { metodo: 'PUT', cookie: ana.cookie, corpo: { senhaAtual: 'senha-original-1', novaSenha: '123' } });
    conferir('senha nova curta: recusa', curta.status, 400);

    // um "outro aparelho" logado antes da troca
    const outroAparelho = await pedir('/api/entrar', { metodo: 'POST', corpo: { email: 'ana@adm.com', senha: 'senha-original-1' } });
    const troca = await pedir('/api/senha', { metodo: 'PUT', cookie: ana.cookie, corpo: { senhaAtual: 'senha-original-1', novaSenha: 'nova-senha-da-ana' } });
    conferir('trocar senha certa: aceita', troca.status, 200);
    conferir('  e devolve cookie novo pra esta aba', !!troca.cookie && troca.cookie !== ana.cookie, true);
    conferir('  a aba que trocou continua logada (cookie novo)', (await pedir('/api/eu', { cookie: troca.cookie })).status, 200);
    conferir('  o OUTRO aparelho cai', (await pedir('/api/eu', { cookie: outroAparelho.cookie })).status, 401);
    conferir('  a senha velha nao entra mais', (await pedir('/api/entrar', { metodo: 'POST', corpo: { email: 'ana@adm.com', senha: 'senha-original-1' } })).status, 401);
    let anaCookie = (await pedir('/api/entrar', { metodo: 'POST', corpo: { email: 'ana@adm.com', senha: 'nova-senha-da-ana' } })).cookie;
    conferir('  a nova entra', !!anaCookie, true);

    // ---------------------------------------------- tela da diretoria
    conferir('membro comum nao ve a lista de membros', (await pedir('/api/membros', { cookie: anaCookie })).status, 403);
    conferir('membro comum nao remove ninguem', (await pedir('/api/membros/qualquer', { metodo: 'DELETE', cookie: anaCookie })).status, 403);
    const lista = await pedir('/api/membros', { cookie: chefe.cookie });
    conferir('diretoria ve a lista', lista.status, 200);
    conferir('  com todas as contas, em ordem',
      lista.corpo.membros.map((m) => m.nome), ['Ana', 'Bia', 'Caio', 'Chefe']);
    conferir('  sem hash nem salt', lista.corpo.membros.some((m) => 'senhaHash' in m || 'salt' in m), false);
    const idAna = lista.corpo.membros.find((m) => m.nome === 'Ana').id;
    const idChefe = lista.corpo.eu;

    conferir('diretoria nao redefine a propria senha por aqui', (await pedir('/api/membros/' + idChefe + '/redefinir-senha', { metodo: 'POST', cookie: chefe.cookie })).status, 400);
    conferir('diretoria nao tira a propria diretoria', (await pedir('/api/membros/' + idChefe + '/diretoria', { metodo: 'PUT', cookie: chefe.cookie, corpo: { isAdmin: false } })).status, 400);
    conferir('diretoria nao remove a propria conta', (await pedir('/api/membros/' + idChefe, { metodo: 'DELETE', cookie: chefe.cookie })).status, 400);

    // ------------------------------------------------- dar/tirar diretoria
    await pedir('/api/membros/' + idAna + '/diretoria', { metodo: 'PUT', cookie: chefe.cookie, corpo: { isAdmin: true } });
    conferir('deu diretoria: a pessoa passa a ver os membros', (await pedir('/api/membros', { cookie: anaCookie })).status, 200);
    await pedir('/api/membros/' + idAna + '/diretoria', { metodo: 'PUT', cookie: chefe.cookie, corpo: { isAdmin: false } });
    conferir('tirou: deixa de ver', (await pedir('/api/membros', { cookie: anaCookie })).status, 403);

    // ------------------------------------------------------ redefinir senha
    const sockAntes = await abrirSocket(anaCookie);
    await espera(300);
    const redef = await pedir('/api/membros/' + idAna + '/redefinir-senha', { metodo: 'POST', cookie: chefe.cookie });
    conferir('redefinir: devolve a senha provisoria', redef.status === 200 && /^[a-z]+-[a-z]+-[a-z]+-\d{4}$/.test(redef.corpo.senhaTemporaria), true);
    await espera(400);
    conferir('  a aba aberta da pessoa recebe o motivo', sockAntes.eventos.some((e) => e[0] === 'conta-encerrada' && e[1].motivo === 'senha-redefinida'), true);
    conferir('  e e desconectada', sockAntes.fechado(), true);
    conferir('  o cookie dela para de valer', (await pedir('/api/eu', { cookie: anaCookie })).status, 401);
    const comProvisoria = await pedir('/api/entrar', { metodo: 'POST', corpo: { email: 'ana@adm.com', senha: redef.corpo.senhaTemporaria } });
    conferir('  ela entra com a provisoria', comProvisoria.status, 200);
    conferir('  e a sede sabe que e provisoria (pede a troca)', comProvisoria.corpo.usuario.senhaTemporaria, true);
    const trocaProv = await pedir('/api/senha', { metodo: 'PUT', cookie: comProvisoria.cookie, corpo: { senhaAtual: redef.corpo.senhaTemporaria, novaSenha: 'senha-propria-da-ana' } });
    conferir('  trocou a provisoria: deixa de ser provisoria', trocaProv.corpo.usuario.senhaTemporaria, false);
    anaCookie = trocaProv.cookie;

    // --------------------------------------------------------------- WhatsApp
    const zapInvalido = await pedir('/api/perfil/whatsapp', { metodo: 'PUT', cookie: anaCookie, corpo: { numero: '9999' } });
    conferir('WhatsApp invalido: recusa', zapInvalido.status, 400);
    const zap = await pedir('/api/perfil/whatsapp', { metodo: 'PUT', cookie: anaCookie, corpo: { numero: '(85) 99999-8888' } });
    conferir('WhatsApp: guarda so os digitos, com o 55', zap.corpo.whatsapp, '5585999998888');
    conferir('  e a propria pessoa ve o numero no /api/eu', (await pedir('/api/eu', { cookie: anaCookie })).corpo.usuario.whatsapp, '5585999998888');
    conferir('  um colega membro consulta pro botao do cartao', (await pedir('/api/pessoas/' + idAna + '/whatsapp', { cookie: chefe.cookie })).corpo.whatsapp, '5585999998888');
    const sockZap = await abrirSocket(chefe.cookie);
    await espera(400);
    const init = sockZap.eventos.find((e) => e[0] === 'init');
    conferir('  o numero NAO vai na lista de pessoas do socket', !!init && !JSON.stringify(init[1]).includes('99999'), true);
    sockZap.ws.close();
    await pedir('/api/perfil/whatsapp', { metodo: 'PUT', cookie: anaCookie, corpo: { numero: '' } });
    conferir('  apagar tira o numero', (await pedir('/api/pessoas/' + idAna + '/whatsapp', { cookie: chefe.cookie })).corpo.whatsapp, null);
    await pedir('/api/perfil/whatsapp', { metodo: 'PUT', cookie: anaCookie, corpo: { numero: '85999998888' } });

    // ---------------------------------------------------------------- remover
    const sockRemover = await abrirSocket(anaCookie);
    await espera(300);
    const rem = await pedir('/api/membros/' + idAna, { metodo: 'DELETE', cookie: chefe.cookie });
    conferir('remover: aceita', rem.status, 200);
    conferir('  e some da lista', rem.corpo.membros.map((m) => m.nome), ['Bia', 'Caio', 'Chefe']);
    await espera(400);
    conferir('  a aba aberta recebe "conta removida"', sockRemover.eventos.some((e) => e[0] === 'conta-encerrada' && e[1].motivo === 'conta-removida'), true);
    conferir('  e sai da sede na hora', sockRemover.fechado(), true);
    conferir('  o cookie para de valer', (await pedir('/api/eu', { cookie: anaCookie })).status, 401);
    conferir('  e a senha nao entra mais', (await pedir('/api/entrar', { metodo: 'POST', corpo: { email: 'ana@adm.com', senha: 'senha-propria-da-ana' } })).status, 401);
    conferir('  mas o e-mail fica livre pra conta nova', (await registrar('Ana de novo', 'ana@adm.com', false)).status, 200);

    // ---------------------------------------- cookie de antes desta mudanca
    conferir('a diretoria segue logada do inicio ao fim', (await pedir('/api/eu', { cookie: chefe.cookie })).status, 200);

    // --------------------------------------------------- freios do cadastro
    // POR ULTIMO: eles travam o IP 127.0.0.1, e travariam os testes de cima.
    //
    // 1. contas criadas por IP. Ate aqui foram 5 (Caio, Bia, Chefe, Ana, Ana de
    //    novo); o teto e 20 por hora.
    let criadas = 5;
    let travouEm = null;
    for (let i = 0; i < 20 && travouEm === null; i++) {
      const r = await pedir('/api/registrar', {
        metodo: 'POST',
        corpo: { nome: 'Robo ' + i, email: 'robo' + i + '@admsolucoes.com.br', senha: 'senha-original-1' },
      });
      if (r.status === 200) criadas++;
      else travouEm = r.status;
    }
    conferir('robo criando conta em serie: para na 20a conta do mesmo IP', [criadas, travouEm], [20, 429]);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
  }

  // 2. chutar o codigo da sede. Servidor novo, pra o teto de contas de cima nao
  //    se misturar com este.
  try {
    await subir();
    const chutes = [];
    for (let i = 0; i < 11; i++) {
      chutes.push((await pedir('/api/registrar', {
        metodo: 'POST',
        corpo: { nome: 'Fora', email: 'alguem@gmail.com', senha: 'senha-original-1', codigo: 'chute-' + i },
      })).status);
    }
    conferir('chutar o codigo da sede: 10 erros e o IP trava', [chutes[9], chutes[10]], [403, 429]);
    const certoDepois = await registrar('Fora Certo', 'certo@gmail.com', false);
    conferir('  travado, nem o codigo certo passa (ate a janela vencer)', certoDepois.status, 429);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await derrubar();
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
