// E-mail transacional, de ponta a ponta: confirmar o e-mail do cadastro e trocar
// a senha por link. Ver docs/email.md.
//
// O servidor sobe de verdade e manda os e-mails pra um PROVEDOR FALSO (um
// servidor HTTP aqui mesmo, via EMAIL_API_TESTE - que so vale fora de producao).
// O provedor falso guarda o que "chegou na caixa de entrada", e o teste abre os
// links de la como a pessoa abriria.
//
// O que importa aqui:
//  - abrir o link de confirmacao, SOZINHO, nao entra em conta nenhuma. E o que
//    um filtro de e-mail de empresa (Safe Links) faz com todo link que chega - e
//    quem cadastrou o e-mail de outra pessoa com uma senha dele contaria com isso;
//  - o link de senha nova vale uma vez so, e trocar a senha derruba as sessoes;
//  - "esqueci minha senha" responde IGUAL pra e-mail que tem conta e que nao tem;
//  - sem provedor configurado, tudo funciona como antes.
//
// NAO mexe em server/data: DATA_DIR em pastas temporarias, apagadas no fim.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PORTA = 3719;
const PORTA_PROVEDOR = 3729;
const BASE = 'http://127.0.0.1:' + PORTA;
const SITE = 'https://acme.sedes.exemplo.com.br';
const CHAVE = 're_chave-de-teste';
const REMETENTE = 'avisos@sedes.exemplo.com.br';
const CODIGO_SEDE = 'codigo-da-acme';
const ADMIN_CODE = 'codigo-do-chefe';
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
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-email-'));
  pastas.push(p);
  return p;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ provedor falso
// Responde como a API do Resend/Brevo. `falhar` simula o provedor fora do ar.
const caixa = [];
let falhar = false;
const provedor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (b) => { corpo += b; });
  req.on('end', () => {
    let json = null;
    try { json = JSON.parse(corpo); } catch (e) { /* fica null */ }
    caixa.push({ caminho: req.url, cabecalhos: req.headers, corpo: json });
    if (falhar) { res.writeHead(500); res.end('{"message":"fora do ar"}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"id":"falso-' + caixa.length + '"}');
  });
});

// Espera chegar o e-mail numero `n` (contando do 1) na caixa do provedor falso.
async function esperarEmail(n) {
  const prazo = Date.now() + 3000;
  while (caixa.length < n && Date.now() < prazo) await espera(25);
  return caixa[n - 1] || null;
}

// O texto do e-mail, dos dois formatos (Resend: text; Brevo: textContent).
function textoDo(msg) {
  return (msg && msg.corpo && (msg.corpo.text || msg.corpo.textContent)) || '';
}

// O token do link que veio no e-mail, e o link trocado pro servidor do teste.
function linkDo(msg, param) {
  const m = textoDo(msg).match(new RegExp(SITE.replace(/[.]/g, '\\.') + '/\\?' + param + '=([^\\s]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// ------------------------------------------------------------------ servidor
let servidor = null;
function subir(env) {
  return new Promise((resolve, reject) => {
    servidor = spawn(process.execPath, [path.join(raiz, 'server', 'index.js')], {
      env: Object.assign({}, process.env, {
        PORT: String(PORTA), SEM_LOGIN: '', NODE_ENV: 'test', ARQUIVO_ENV: 'nenhum',
        SESSION_SECRET: 'segredo-de-teste-bem-comprido',
        CODIGO_SEDE, ADMIN_CODE, DOMINIOS_SEDE: 'acme.com.br', DIRETORIA_EMAILS: '',
        NOME_SEDE: 'Acme Consultoria', SIGLA_SEDE: 'Acme', SITE_URL: SITE,
        GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_DRIVE_PASTA: '', GOOGLE_CONTA_SERVICO: '',
        TRELLO_API_KEY: '', TRELLO_TOKEN: '', TRELLO_BOARD_ID: '',
        CLOUDFLARE_TURN_KEY_ID: '', CLOUDFLARE_TURN_TOKEN: '', BACKUP_DRIVE_PASTA: '', BACKUP_CHAVE: '',
        EMAIL_PROVEDOR: 'resend', EMAIL_CHAVE: CHAVE, EMAIL_REMETENTE: REMETENTE,
        EMAIL_API_TESTE: 'http://127.0.0.1:' + PORTA_PROVEDOR,
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

// `ip`: o servidor confia em UM proxy (trust proxy 1), entao o X-Forwarded-For
// faz o papel de "outra pessoa, de outro lugar" - cada freio por IP e testado
// sem gastar o dos outros testes.
function pedir(rota, { metodo = 'GET', corpo, cookie, ip } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (cookie) cabecalhos.Cookie = cookie;
  if (ip) cabecalhos['X-Forwarded-For'] = ip;
  return fetch(BASE + rota, {
    method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual',
  }).then(async (r) => {
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { /* html */ }
    return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0] || null, corpo: json, texto };
  });
}

function registrar(nome, email, senha, extra) {
  return pedir('/api/registrar', { metodo: 'POST', corpo: Object.assign({ nome, email, senha }, extra) });
}

function entrar(email, senha, confirmar, ip) {
  return pedir('/api/entrar', { metodo: 'POST', corpo: { email, senha, confirmar }, ip });
}

(async function () {
  console.log('\nE-MAIL: CONFIRMAR CADASTRO E TROCAR SENHA');
  await new Promise((r) => provedor.listen(PORTA_PROVEDOR, '127.0.0.1', r));
  try {
    const dados = novaPasta();
    await subir({ DATA_DIR: dados });

    const opcoes = await pedir('/api/login-opcoes');
    conferir('a tela de login sabe que a sede manda e-mail', opcoes.corpo.email, true);

    // ------------------------------------------------ cadastro fica pendente
    const bia = await registrar('Bia', 'bia@acme.com.br', 'senha-da-bia-1');
    conferir('cadastro com o e-mail ligado: fica PENDENTE',
      [bia.status, bia.corpo.pendente, bia.corpo.email], [200, true, 'bia@acme.com.br']);
    conferir('  e NAO entra: sem cookie de sessao, sem usuario', [bia.cookie, bia.corpo.usuario], [null, undefined]);

    const msg1 = await esperarEmail(1);
    conferir('o e-mail de confirmacao saiu pelo provedor (Resend)',
      [msg1 && msg1.caminho, msg1 && msg1.cabecalhos.authorization], ['/emails', 'Bearer ' + CHAVE]);
    conferir('  pra quem cadastrou, com o NOME DA SEDE no remetente (nao "ADM")',
      [msg1.corpo.to, msg1.corpo.from], [['bia@acme.com.br'], '"Acme Consultoria" <' + REMETENTE + '>']);
    conferir('  assunto de confirmacao', /^Confirme seu e-mail - Acme Consultoria$/.test(msg1.corpo.subject), true);
    const tokenBia = linkDo(msg1, 'confirmar');
    conferir('  com o link pro endereco PUBLICO da sede (SITE_URL)', !!tokenBia, true);
    conferir('  o link vai no texto E no html', msg1.corpo.html.includes(SITE + '/?confirmar='), true);
    // O nome e digitado por quem cadastrou - que pode nao ser o dono do e-mail.
    conferir('  e o nome digitado no cadastro NAO vai pro e-mail',
      /Bia/.test(textoDo(msg1) + msg1.corpo.html), false);

    // ----------------------------------- o link, sozinho, nao entra em nada
    const naoConfirmada = await entrar('bia@acme.com.br', 'senha-da-bia-1');
    conferir('senha certa, sem confirmar: 403 e nao entra',
      [naoConfirmada.status, naoConfirmada.corpo.pendente, naoConfirmada.cookie], [403, true, null]);
    conferir('  e nao manda outro e-mail logo em seguida (um por minuto)', caixa.length, 1);

    // O que o filtro de e-mail (Safe Links) faz: abre o link, sem senha nenhuma.
    const aberto = await pedir('/?confirmar=' + encodeURIComponent(tokenBia));
    conferir('abrir o link (o que o filtro de e-mail faz): so a pagina, sem cookie',
      [aberto.status, aberto.cookie], [200, null]);
    conferir('  e a conta continua pendente',
      (await entrar('bia@acme.com.br', 'senha-da-bia-1')).status, 403);

    conferir('link certo com a senha ERRADA: nao entra e nao confirma',
      (await entrar('bia@acme.com.br', 'senha-errada-1', tokenBia)).status, 401);
    conferir('  (continua pendente)', (await entrar('bia@acme.com.br', 'senha-da-bia-1')).status, 403);

    // O link de uma conta nao confirma outra.
    const duda = await registrar('Duda', 'duda@acme.com.br', 'senha-da-duda-1');
    const tokenDuda = linkDo(await esperarEmail(2), 'confirmar');
    conferir('link de OUTRA conta, com a senha certa: nao confirma',
      [duda.status, (await entrar('bia@acme.com.br', 'senha-da-bia-1', tokenDuda)).status], [200, 403]);

    const adulterado = tokenBia.replace(/^(.)/, (c) => (c === 'e' ? 'f' : 'e'));
    conferir('link adulterado, com a senha certa: nao confirma',
      (await entrar('bia@acme.com.br', 'senha-da-bia-1', adulterado)).status, 403);

    // ---------------------------------------------- link + senha: confirma
    const confirmada = await entrar('bia@acme.com.br', 'senha-da-bia-1', tokenBia);
    conferir('link + senha certa: confirma e entra',
      [confirmada.status, !!confirmada.cookie, confirmada.corpo.usuario && confirmada.corpo.usuario.email],
      [200, true, 'bia@acme.com.br']);
    const cookieBia = confirmada.cookie;
    conferir('  a sessao vale', (await pedir('/api/eu', { cookie: cookieBia })).status, 200);
    conferir('  e dai em diante entra so com a senha', (await entrar('bia@acme.com.br', 'senha-da-bia-1')).status, 200);

    // ------------------------------------------------ o provedor fora do ar
    falhar = true;
    const semProvedor = await registrar('Edu', 'edu@acme.com.br', 'senha-do-edu-1');
    falhar = false;
    conferir('provedor fora do ar no cadastro: 502 com explicacao',
      [semProvedor.status, /e-mail de confirmacao/.test(semProvedor.corpo.erro)], [502, true]);
    const deNovo = await registrar('Edu', 'edu@acme.com.br', 'senha-do-edu-1');
    conferir('  e a conta NAO fica presa: o mesmo e-mail cadastra de novo depois', deNovo.status, 200);

    const repetido = await registrar('Outra Bia', 'bia@acme.com.br', 'outra-senha-1');
    conferir('e-mail que ja tem conta: 409, apontando o "Esqueci minha senha"',
      [repetido.status, /Esqueci minha senha/.test(repetido.corpo.erro)], [409, true]);

    // -------------------------------------------------- esqueci minha senha
    const antes = caixa.length;
    const ninguem = await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'ninguem@acme.com.br' }, ip: '198.51.100.1' });
    const temConta = await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'bia@acme.com.br' }, ip: '198.51.100.1' });
    conferir('esqueci a senha: a MESMA resposta pra quem tem conta e pra quem nao tem',
      [ninguem.status, temConta.status, ninguem.texto === temConta.texto], [200, 200, true]);
    const msgSenha = await esperarEmail(antes + 1);
    await espera(200);
    conferir('  so quem tem conta recebe e-mail', caixa.length - antes, 1);
    conferir('  e e o de senha nova, pra ela',
      [msgSenha.corpo.to, /^Nova senha - Acme Consultoria$/.test(msgSenha.corpo.subject)], [['bia@acme.com.br'], true]);
    const tokenSenha = linkDo(msgSenha, 'redefinir');
    conferir('  com o link de senha nova', !!tokenSenha, true);

    const outroPedido = await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'bia@acme.com.br' }, ip: '198.51.100.2' });
    await espera(300);
    conferir('pedir de novo no mesmo minuto: responde igual, mas nao manda outro',
      [outroPedido.status, caixa.length - antes], [200, 1]);
    conferir('e-mail invalido: 400',
      (await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'sem-arroba' }, ip: '198.51.100.3' })).status, 400);

    const ipTeimoso = '198.51.100.9';
    const seguidos = [];
    for (let i = 0; i < 6; i++) {
      seguidos.push((await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'x' + i + '@acme.com.br' }, ip: ipTeimoso })).status);
    }
    conferir('mais de 5 pedidos do mesmo IP em 15 min: 429', seguidos, [200, 200, 200, 200, 200, 429]);

    // ------------------------------------------------------ a senha nova
    conferir('o link de CONFIRMAR nao serve pra trocar senha',
      (await pedir('/api/redefinir-senha', { metodo: 'POST', corpo: { token: tokenBia, novaSenha: 'senha-nova-da-bia' }, ip: '198.51.100.20' })).status, 400);
    conferir('senha nova curta: 400 (e o link continua valendo)',
      (await pedir('/api/redefinir-senha', { metodo: 'POST', corpo: { token: tokenSenha, novaSenha: 'curta' }, ip: '198.51.100.20' })).status, 400);
    const trocou = await pedir('/api/redefinir-senha', {
      metodo: 'POST', corpo: { token: tokenSenha, novaSenha: 'senha-nova-da-bia' }, ip: '198.51.100.20',
    });
    conferir('link + senha nova: troca e ja entra',
      [trocou.status, !!trocou.cookie, trocou.corpo.usuario && trocou.corpo.usuario.email], [200, true, 'bia@acme.com.br']);
    conferir('  a sessao ANTIGA (outro aparelho) caiu', (await pedir('/api/eu', { cookie: cookieBia })).status, 401);
    conferir('  a senha velha nao entra mais', (await entrar('bia@acme.com.br', 'senha-da-bia-1', undefined, '198.51.100.21')).status, 401);
    conferir('  a nova entra', (await entrar('bia@acme.com.br', 'senha-nova-da-bia', undefined, '198.51.100.21')).status, 200);
    conferir('o MESMO link de novo: 400 (vale uma vez so)',
      (await pedir('/api/redefinir-senha', { metodo: 'POST', corpo: { token: tokenSenha, novaSenha: 'mais-uma-senha-1' }, ip: '198.51.100.22' })).status, 400);

    // Quem achou o proprio e-mail cadastrado por outra pessoa (a conta da Duda
    // nunca foi confirmada): o link de senha nova vai pra caixa de entrada DELA,
    // e a senha que o outro escolheu deixa de valer.
    const antesDuda = caixa.length;
    await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'duda@acme.com.br' }, ip: '198.51.100.30' });
    const tokenSenhaDuda = linkDo(await esperarEmail(antesDuda + 1), 'redefinir');
    const retomou = await pedir('/api/redefinir-senha', {
      metodo: 'POST', corpo: { token: tokenSenhaDuda, novaSenha: 'agora-e-minha-1' }, ip: '198.51.100.30',
    });
    conferir('conta pendente + senha nova pelo link: entra (e o e-mail fica confirmado)',
      [retomou.status, (await entrar('duda@acme.com.br', 'agora-e-minha-1', undefined, '198.51.100.31')).status], [200, 200]);
    conferir('  e a senha do cadastro nao vale mais',
      (await entrar('duda@acme.com.br', 'senha-da-duda-1', undefined, '198.51.100.32')).status, 401);

    // ------------------------------- diretoria: ve o pendente e pode liberar
    await registrar('Chefe', 'chefe@acme.com.br', 'senha-do-chefe-1', { codigoAdmin: ADMIN_CODE });
    const tokenChefe = linkDo(caixa[caixa.length - 1], 'confirmar');
    const chefe = await entrar('chefe@acme.com.br', 'senha-do-chefe-1', tokenChefe, '198.51.100.40');
    const lista = await pedir('/api/membros', { cookie: chefe.cookie });
    const edu = lista.corpo && lista.corpo.membros.find((m) => m.email === 'edu@acme.com.br');
    conferir('a diretoria ve quem ainda nao confirmou o e-mail',
      [lista.status, edu && edu.emailPendente, lista.corpo.membros.find((m) => m.email === 'bia@acme.com.br').emailPendente],
      [200, true, false]);
    const provisoria = await pedir('/api/membros/' + encodeURIComponent(edu.id) + '/redefinir-senha', { metodo: 'POST', cookie: chefe.cookie });
    const eduEntrou = await entrar('edu@acme.com.br', provisoria.corpo.senhaTemporaria, undefined, '198.51.100.41');
    conferir('  e a senha provisoria que ela entrega vale como confirmacao (quem nao recebeu o e-mail entra)',
      [provisoria.status, eduEntrou.status], [200, 200]);

    // Uma conta que fica pendente pra ver o que acontece quando o e-mail desliga.
    await registrar('Fabi', 'fabi@acme.com.br', 'senha-da-fabi-1');
    await parar();

    // ------------------------------------------ e-mail desligado depois
    // Mesma pasta de dados: a Fabi ficou pendente e o provedor saiu.
    await subir({ DATA_DIR: dados, EMAIL_PROVEDOR: '', EMAIL_CHAVE: '', EMAIL_REMETENTE: '' });
    conferir('sem provedor: a tela sabe que nao ha e-mail', (await pedir('/api/login-opcoes')).corpo.email, false);
    conferir('  quem ficou pendente entra (sem como confirmar, prender nao protege ninguem)',
      (await entrar('fabi@acme.com.br', 'senha-da-fabi-1', undefined, '198.51.100.50')).status, 200);
    const direto = await registrar('Gabi', 'gabi@acme.com.br', 'senha-da-gabi-1');
    conferir('  cadastro entra na hora, como antes do e-mail',
      [direto.status, !!direto.cookie, !!direto.corpo.usuario], [200, true, true]);
    conferir('  "esqueci minha senha" diz que e com a diretoria (503)',
      (await pedir('/api/esqueci-senha', { metodo: 'POST', corpo: { email: 'gabi@acme.com.br' }, ip: '198.51.100.51' })).status, 503);
    await parar();

    // ----------------------------------------------------- Brevo, e a marca
    // Nome da sede com caractere que estragaria o cabecalho ou o html.
    const antesBrevo = caixa.length;
    await subir({ DATA_DIR: novaPasta(), EMAIL_PROVEDOR: 'brevo', NOME_SEDE: 'Acme & "Filhos" <Ltda>' });
    await registrar('Hugo', 'hugo@acme.com.br', 'senha-do-hugo-1');
    const msgBrevo = await esperarEmail(antesBrevo + 1);
    conferir('Brevo: a API dele, com a chave no cabecalho api-key',
      [msgBrevo && msgBrevo.caminho, msgBrevo && msgBrevo.cabecalhos['api-key']], ['/v3/smtp/email', CHAVE]);
    conferir('  remetente e destinatario no formato do Brevo',
      [msgBrevo.corpo.sender, msgBrevo.corpo.to], [{ name: 'Acme & Filhos Ltda', email: REMETENTE }, [{ email: 'hugo@acme.com.br' }]]);
    conferir('  com o link no texto e no html',
      [!!linkDo(msgBrevo, 'confirmar'), msgBrevo.corpo.htmlContent.includes(SITE + '/?confirmar=')], [true, true]);
    conferir('  e o nome da sede escapado no html (nada de tag vinda da variavel)',
      [msgBrevo.corpo.htmlContent.includes('Acme &amp; &quot;Filhos&quot; &lt;Ltda&gt;'), msgBrevo.corpo.htmlContent.includes('<Ltda>')],
      [true, false]);
    await parar();

    // ------------------------------------ producao sem o endereco publico
    // Link pra localhost nao abre no celular de ninguem: sem SITE_URL, o e-mail
    // fica desligado em vez de prender todo cadastro numa confirmacao que nao vem.
    await subir({ DATA_DIR: novaPasta(), NODE_ENV: 'production', SITE_URL: '', RENDER_EXTERNAL_URL: '' });
    conferir('producao sem SITE_URL: e-mail desligado', (await pedir('/api/login-opcoes')).corpo.email, false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU ' + (e.stack || e.message));
  } finally {
    await parar();
    provedor.close();
    pastas.forEach((p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* ja foi */ } });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
