// A marca de cada sede. Ver server/marca.js e docs/varias-sedes.md.
//
// Duas coisas, e as duas importam igual:
//   - a sede de um CLIENTE nao mostra "ADM" em lugar nenhum: nem na tela, nem
//     no titulo da aba, nem no app instalado, nem no canal do chat, nem na
//     estante (o acervo fisico e da sala da ADM);
//   - a sede da ADM, sem configurar nada, fica EXATAMENTE como era.
//
// E o nome da empresa vai pro HTML: um nome com < e > tem que sair escapado.
//
// NAO mexe em server/data: DATA_DIR em pastas temporarias, apagadas no fim.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pastas = [];
const servidores = [];

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

function sede(porta, extra) {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-marca-'));
  pastas.push(dados);
  const env = Object.assign({}, process.env);
  // nada herdado do terminal: marca, dominio, acervo e integracoes vem so daqui
  Object.keys(env).filter((k) => /^(GOOGLE_|TRELLO_|CLOUDFLARE_|BACKUP_|DIRETORIA|CODIGO|ADMIN|DOMINIOS|SEM_LOGIN|ARQUIVO_ENV|NOME_SEDE|SIGLA_SEDE|SUBTITULO_SEDE|ACERVO_FISICO|SITE_URL|EMAIL_)/.test(k))
    .forEach((k) => delete env[k]);
  Object.assign(env, {
    ARQUIVO_ENV: 'nenhum', NODE_ENV: 'test', PORT: String(porta), DATA_DIR: dados,
    SESSION_SECRET: 'segredo-de-teste-bem-comprido-' + porta,
  }, extra || {});
  const base = 'http://127.0.0.1:' + porta;
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    servidores.push(proc);
    let erro = '';
    proc.stderr.on('data', (b) => { erro += b.toString(); });
    const prazo = Date.now() + 15000;
    (function tentar() {
      if (proc.exitCode !== null) return reject(new Error('sede ' + porta + ' morreu no arranque:\n' + erro));
      if (Date.now() > prazo) return reject(new Error('sede ' + porta + ' nao subiu em 15s'));
      fetch(base + '/api/saude').then((r) => (r.ok ? resolve({ base }) : setTimeout(tentar, 150)))
        .catch(() => setTimeout(tentar, 150));
    })();
  });
}

function pararTodos() {
  return Promise.all(servidores.map((proc) => new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    proc.once('exit', () => resolve());
    proc.kill();
  })));
}

const texto = (s, rota) => fetch(s.base + rota).then(async (r) => ({ status: r.status, corpo: await r.text() }));

async function contaEEntrar(s, email) {
  const r = await fetch(s.base + '/api/registrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Ana', email, senha: 'senha-da-ana-1' }),
  });
  const cookie = (r.headers.getSetCookie().find((c) => c.startsWith('adm_sessao=')) || '').split(';')[0];
  const init = await new Promise((resolve, reject) => {
    const ws = new WebSocket(s.base.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket', { headers: { Cookie: cookie } });
    const prazo = setTimeout(() => reject(new Error('socket nao conectou')), 5000);
    ws.addEventListener('message', (ev) => {
      const m = String(ev.data);
      if (m.startsWith('0')) { ws.send('40'); return; }
      if (m === '2') { ws.send('3'); return; }
      if (m.startsWith('40')) { ws.send('42' + JSON.stringify(['join', {}])); return; }
      if (m.startsWith('42')) {
        const e = JSON.parse(m.slice(2));
        if (e[0] === 'init') { clearTimeout(prazo); ws.close(); resolve(e[1]); }
      }
    });
  });
  return { cookie, init };
}

// "ADM" como palavra, "admsolucoes" e o subtitulo da EJ: o que nao pode vazar.
const temAdm = (s) => /\bADM\b|admsolucoes|empresa junior/.test(s);

(async function () {
  console.log('\nMARCA: cada sede com o nome dela, e a da ADM igual a antes');
  try {
    // ---------------------------------------------------------------- cliente
    const acme = await sede(3751, {
      NOME_SEDE: 'Acme <Consultoria>', SIGLA_SEDE: 'Acme', DOMINIOS_SEDE: 'acme.com.br', ACERVO_FISICO: 'nenhum',
    });
    const pagina = await texto(acme, '/');
    conferir('a pagina do cliente abre', pagina.status, 200);
    conferir('  com o nome dele no titulo, ESCAPADO', pagina.corpo.includes('<title>Escritorio Virtual - Acme &lt;Consultoria&gt;</title>'), true);
    conferir('  "Entrar com o Google da <sigla>" e o dominio dele no campo de e-mail',
      [pagina.corpo.includes('Entrar com o Google da Acme'), pagina.corpo.includes('voce@acme.com.br')], [true, true]);
    conferir('  e NENHUM "ADM" na pagina inteira (nem em comentario)', temAdm(pagina.corpo), false);
    conferir('  nenhum marcador sobrando ({{...}})', /\{\{[A-Z_]+\}\}/.test(pagina.corpo), false);
    conferir('/index.html sai igual a /', (await texto(acme, '/index.html')).corpo === pagina.corpo, true);

    // A pagina de quem entra numa reuniao pelo link (public/reuniao.html) sai com a
    // marca da sede, pelo mesmo motivo do index: e o cliente de UMA sede que a abre.
    const paginaReuniao = await texto(acme, '/r/qualquer-token');
    conferir('a pagina da reuniao (link) do cliente abre e leva o nome dele, ESCAPADO',
      [paginaReuniao.status, paginaReuniao.corpo.includes('<title>Reuni')
        && paginaReuniao.corpo.includes('Acme &lt;Consultoria&gt;</title>')], [200, true]);
    conferir('  sem "ADM" em lugar nenhum, sem marcador sobrando e sem apontar pra marca da ADM',
      [temAdm(paginaReuniao.corpo), /\{\{[A-Z_]+\}\}/.test(paginaReuniao.corpo), paginaReuniao.corpo.includes('/marca/')], [false, false, false]);
    conferir('  e /reuniao.html (direto) sai igual', (await texto(acme, '/reuniao.html')).corpo === paginaReuniao.corpo, true);

    const manifesto = JSON.parse((await texto(acme, '/manifest.webmanifest')).corpo);
    conferir('o app instalado leva o nome do cliente', [manifesto.name, manifesto.short_name], ['Escritorio Virtual - Acme <Consultoria>', 'Sede Acme']);
    conferir('  e nada de ADM no manifesto', temAdm(JSON.stringify(manifesto)), false);

    const opcoes = JSON.parse((await texto(acme, '/api/login-opcoes')).corpo);
    conferir('a tela de login recebe nome, sigla e dominio da sede', [opcoes.sigla, opcoes.dominio], ['Acme', 'acme.com.br']);

    const { cookie, init } = await contaEEntrar(acme, 'ana@acme.com.br');
    conferir('o canal geral do chat nao fala da ADM', temAdm(JSON.stringify(init.canais)), false);
    const acervo = await fetch(acme.base + '/api/acervo-fisico', { headers: { Cookie: cookie } }).then((r) => r.json());
    conferir('sem acervo fisico: a estante esconde a aba e nao mostra os livros da ADM', [acervo.ativo, acervo.livros.length], [false, 0]);
    conferir('o catalogo da ADM nao esta mais aberto no endereco do cliente', (await texto(acme, '/dados/acervo-fisico.json')).status, 404);
    conferir('o logotipo da ADM nao e servido na sede do cliente, nem pra quem adivinha o endereco',
      [(await texto(acme, '/marca/icone-branco.png')).status, (await texto(acme, '/marca/icone-vermelho.png')).status], [404, 404]);
    conferir('  e a tela do cliente nao aponta pra marca nenhuma da ADM', pagina.corpo.includes('/marca/'), false);

    // ------------------------------------------------------ a ADM, sem nada
    const adm = await sede(3752);
    const paginaAdm = (await texto(adm, '/')).corpo;
    conferir('a sede da ADM sem configurar nada fica como era',
      [paginaAdm.includes('<title>Escritorio Virtual - ADM Soluções</title>'), paginaAdm.includes('<h1>ADM Soluções</h1>'),
        paginaAdm.includes('Escritório virtual da empresa júnior'), paginaAdm.includes('Entrar com o Google da ADM'),
        paginaAdm.includes('voce@admsolucoes.com.br')],
      [true, true, true, true, true]);
    conferir('  o app instalado continua "Sede ADM"', JSON.parse((await texto(adm, '/manifest.webmanifest')).corpo).short_name, 'Sede ADM');
    // O logotipo e o ARQUIVO do BrandingBook, o mesmo do CRM - nao um desenho
    // parecido feito aqui. Se um dia alguem trocar por SVG "na mao", quebra.
    conferir('  o logotipo sai como arquivo nos dois lugares (painel escuro e barra clara)',
      [paginaAdm.includes('<span class="login-marca"><img src="/marca/icone-branco.png"'),
        paginaAdm.includes('<span class="entrada-logo"><img src="/marca/icone-vermelho.png"')], [true, true]);
    const reuniaoAdm = (await texto(adm, '/r/qualquer-token')).corpo;
    conferir('  e a pagina da reuniao (link) leva o logotipo da ADM em arquivo, como o resto',
      [reuniaoAdm.includes('<span class="entrada-logo"><img src="/marca/icone-vermelho.png"'), reuniaoAdm.includes('ADM Soluções')], [true, true]);
    const icone = await fetch(adm.base + '/marca/icone-branco.png');
    const bytes = Buffer.from(await icone.arrayBuffer());
    const original = fs.readFileSync(path.join(raiz, 'server/marca-arquivos/marca-icone-branco.png'));
    conferir('  e o arquivo entregue e byte a byte o do BrandingBook',
      [icone.status, icone.headers.get('content-type'), bytes.equals(original)], [200, 'image/png', true]);
    conferir('  nome fora da lista (inclusive subindo pasta) nao serve arquivo nenhum',
      [(await texto(adm, '/marca/qualquer.png')).status, (await texto(adm, '/marca/..%2F..%2Fserver%2Fauth.js')).status], [404, 404]);
    const admLogada = await contaEEntrar(adm, 'ana@admsolucoes.com.br');
    const acervoAdm = await fetch(adm.base + '/api/acervo-fisico', { headers: { Cookie: admLogada.cookie } }).then((r) => r.json());
    conferir('  e o acervo fisico da sala continua la (96 livros)', [acervoAdm.ativo, acervoAdm.livros.length], [true, 96]);
    conferir('  o canal geral ainda fala da ADM Soluções', admLogada.init.canais[0].descricao, 'Avisos e assuntos gerais da ADM Soluções');
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await pararTodos();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
