// Rotas de conta: criar, entrar, sair, quem sou eu e salvar o avatar.
// Ver docs/plano-login.md, secao 5.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const usuarios = require('./usuarios');
const sessao = require('./sessao');
const google = require('./google');
const { DOMINIOS, ehEmailDaSede } = require('./dominios');
const { marca } = require('./marca');
const pastaDados = require('./dados');
const discador = require('./discador');
const quadros = require('./quadros');
const acervo = require('./acervo');
// `correio` e nao `email`: dentro das rotas, `email` e o endereco digitado.
const correio = require('./email');
const links = require('./links');

// ---- quem pode criar conta na sede -----------------------------------------
//
// Tres portas, da mais forte pra mais fraca:
//
//   1. ENTRAR COM O GOOGLE da ADM (quando GOOGLE_CLIENT_ID/SECRET estao
//      configurados). O Google prova que a pessoa e dona do e-mail
//      @admsolucoes. Com ele ligado, e-mail da ADM SO entra por aqui.
//   2. e-mail da ADM + senha, SO enquanto o Google nao esta ligado. Sozinho nao
//      prova nada - qualquer um digita fulano@admsolucoes.com.br -, entao essa
//      porta nunca da diretoria e tem limite de contas por IP. Com o e-mail
//      ligado (docs/email.md), passa a provar: a conta so entra com o link que
//      chega naquele endereco.
//   3. e-mail de fora + CODIGO_SEDE (estagiario com e-mail pessoal, parceiro).
//      Sem a variavel configurada, fechada.
//
// Historia, pra ninguem desfazer sem querer: o "codigo da sede" era a porta
// principal e tinha valor padrao escrito neste arquivo - que vai pra um
// repositorio publico. Virou "e-mail da ADM entra direto, e a primeira conta
// nasce diretoria". So que o e-mail nao era conferido: com a sede vazia depois
// de um deploy, o primeiro estranho que digitasse um @admsolucoes qualquer
// virava diretoria. Dai o Google.
const CODIGO_SEDE = String(process.env.CODIGO_SEDE || '').trim();
const ADMIN_CODE = String(process.env.ADMIN_CODE || '').trim();

// Quem entra com o Google e vira diretoria sozinho. Vazio = a primeira pessoa
// que entrar com o Google numa sede SEM diretoria. Ver docs/plano-login.md.
const DIRETORIA_EMAILS = String(process.env.DIRETORIA_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const NOME_NONCE = 'adm_google_nonce';

const MAX_NOME = 18;
const MIN_SENHA = 8;
const MAX_SENHA = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Freio simples de forca bruta por IP (em memoria, some no restart).
const JANELA_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 10;
const tentativas = new Map(); // ip -> { qtd, ate }

function tentativasDoIp(ip) {
  const registro = tentativas.get(ip);
  if (!registro || registro.ate < Date.now()) {
    const novo = { qtd: 0, ate: Date.now() + JANELA_MS };
    tentativas.set(ip, novo);
    return novo;
  }
  return registro;
}

function bloqueado(ip) {
  return tentativasDoIp(ip).qtd >= MAX_TENTATIVAS;
}

function contarErro(ip) {
  tentativasDoIp(ip).qtd += 1;
}

function limparErros(ip) {
  tentativas.delete(ip);
}

// Contas CRIADAS por IP. O freio de cima conta erro; este conta acerto, porque
// criar conta nao precisa errar nada. Folgado de proposito: a sala da ADM (ou a
// UECE) sai pra internet por um IP so, e 20 pessoas se cadastrando no mesmo dia
// e normal. Robo criando conta em serie, nao.
const JANELA_CADASTRO_MS = 60 * 60 * 1000;
const MAX_CADASTROS = 20;
const cadastros = new Map(); // ip -> { qtd, ate }

function cadastrosDoIp(ip) {
  const registro = cadastros.get(ip);
  if (!registro || registro.ate < Date.now()) {
    const novo = { qtd: 0, ate: Date.now() + JANELA_CADASTRO_MS };
    cadastros.set(ip, novo);
    return novo;
  }
  return registro;
}

function loginGoogleLigado() {
  return google.configurado();
}

// ---- e-mail: confirmar o endereco e trocar a senha (docs/email.md) ---------
//
// Com o e-mail ligado, cadastro com senha so entra voltando pelo link que chegou
// no endereco digitado - e com a senha (ver /entrar): e isso que fecha o
// "qualquer um digita fulano@empresa.com.br". E "esqueci minha senha" passa a
// ser um link, e nao alguem da diretoria gerando senha provisoria na mao.
const VALIDADE_CONFIRMAR_MS = 24 * 60 * 60 * 1000;
const VALIDADE_SENHA_MS = 60 * 60 * 1000;

// Um e-mail de cada tipo por conta por minuto. Sem isso, "mandar de novo" (ou
// chutar o login de alguem com a senha certa) vira um jeito de encher a caixa de
// entrada de uma pessoa - e de gastar a cota do provedor. Tipos separados: quem
// acabou de se cadastrar e ja esqueceu a senha nao espera o minuto da confirmacao.
const INTERVALO_ENVIO_MS = 60 * 1000;
const ultimoEnvio = new Map(); // 'tipo:uid' -> quando

function podeMandarPara(uid, tipo) {
  const chave = tipo + ':' + uid;
  if (Date.now() - (ultimoEnvio.get(chave) || 0) < INTERVALO_ENVIO_MS) return false;
  ultimoEnvio.set(chave, Date.now());
  return true;
}

// Pedidos de senha nova por IP: 5 a cada 15 minutos.
const MAX_PEDIDOS_SENHA = 5;
const pedidosSenha = new Map(); // ip -> { qtd, ate }
function pedidosSenhaDoIp(ip) {
  const r = pedidosSenha.get(ip);
  if (!r || r.ate < Date.now()) {
    const novo = { qtd: 0, ate: Date.now() + JANELA_MS };
    pedidosSenha.set(ip, novo);
    return novo;
  }
  return r;
}

async function mandarConfirmacao(conta) {
  const token = links.criar('confirmar', conta.id, VALIDADE_CONFIRMAR_MS);
  const m = correio.confirmacao({ token });
  await correio.enviar({ para: conta.email, assunto: m.assunto, texto: m.texto, html: m.html });
}

// O link de senha nova leva a impressao da senha ATUAL: trocou a senha, todo
// link antigo para de valer - inclusive este mesmo. Uso unico sem guardar nada.
function impressaoDaSenha(conta) {
  return links.impressao('senha:' + (conta.senhaHash || ''));
}

async function mandarNovaSenha(conta) {
  const token = links.criar('senha', conta.id, VALIDADE_SENHA_MS, impressaoDaSenha(conta));
  const m = correio.novaSenha({ token });
  await correio.enviar({ para: conta.email, assunto: m.assunto, texto: m.texto, html: m.html });
}

// A conta de quem o Google acabou de confirmar. Cria se nao existe; se existe,
// vincula (e isso apaga a senha e derruba sessoes - ver usuarios.vincularGoogle).
function contaDoGoogle({ email, nome, sub }) {
  let conta = usuarios.porEmail(email);
  if (!conta) {
    conta = usuarios.criarPeloGoogle({ nome: nome.slice(0, MAX_NOME) || 'Membro', email, sub, isAdmin: false });
    console.log('[contas] ' + email + ' criou conta com o Google.');
  } else {
    conta = usuarios.vincularGoogle(conta.id, sub);
  }

  // Diretoria automatica: so aqui, com e-mail provado pelo Google. Com a lista
  // configurada, vale a lista. Sem ela, vale "a sede nao tem diretoria nenhuma"
  // - senao a sede recem-publicada (plano free apaga as contas) fica sem ninguem
  // que possa decorar, convidar ou gerenciar.
  const naLista = DIRETORIA_EMAILS.includes(email.toLowerCase());
  const semDiretoria = !DIRETORIA_EMAILS.length && usuarios.totalDeDiretoria() === 0;
  if (!conta.isAdmin && (naLista || semDiretoria)) {
    conta = usuarios.definirDiretoria(conta.id, true);
    console.log('[contas] ' + email + ' virou diretoria ' + (naLista ? '(DIRETORIA_EMAILS).' : '(sede sem diretoria).'));
  }
  usuarios.marcarAcesso(conta.id);
  return conta;
}

// Fim do login com o Google: chamado pela rota /api/google/callback do
// index.js, que e dividida com a conexao da agenda.
async function concluirLoginGoogle(req, res) {
  const { code, state, error } = req.query;
  const nonce = sessao.lerCookies(req.headers.cookie)[NOME_NONCE];
  // o nonce serve pra UMA volta so
  sessao.definirCookieCurto(res, NOME_NONCE, '', 0, '/api/google');

  if (error) return res.redirect('/?entrar=cancelado');
  if (typeof code !== 'string' || typeof state !== 'string') return res.redirect('/?entrar=erro');

  const r = await google.identidadeDoLogin(code, state, nonce);
  if (r.erro) {
    console.error('[login google] recusado: ' + r.motivo);
    return res.redirect('/?entrar=' + (r.erro === 'dominio' ? 'dominio' : 'erro'));
  }
  const conta = contaDoGoogle(r);
  sessao.definirCookie(res, conta.id);
  res.redirect('/');
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// `aoEncerrarConta(uid, motivo)` vem do index.js: derruba os sockets abertos da
// pessoa (e larga a mesa dela). A sessao HTTP ja cai sozinha - o cookie deixa
// de valer -, mas uma aba que esta aberta AGORA continuaria dentro da sede ate
// recarregar, e "removi o ex-membro" nao pode significar "ele sai amanha".
function criarRotas(sanitizeAppearance, ganchos = {}) {
  const rotas = express.Router();
  const aoEncerrarConta = typeof ganchos.aoEncerrarConta === 'function' ? ganchos.aoEncerrarConta : () => {};

  rotas.post('/registrar', async (req, res) => {
    const ip = req.ip || 'desconhecido';
    // chutar o codigo da sede e forca bruta como chutar senha
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }
    if (cadastrosDoIp(ip).qtd >= MAX_CADASTROS) {
      return res.status(429).json({ erro: 'Muitas contas criadas daqui. Tenta de novo mais tarde.' });
    }

    const corpo = req.body || {};
    const nome = texto(corpo.nome).slice(0, MAX_NOME);
    const email = texto(corpo.email);
    const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
    const codigo = texto(corpo.codigo);

    if (!nome) return res.status(400).json({ erro: 'Diz teu nome.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ erro: 'E-mail invalido.' });

    if (ehEmailDaSede(email)) {
      // Com o Google ligado, e-mail da ADM so entra provando que e dono dele.
      if (loginGoogleLigado()) {
        return res.status(403).json({
          erro: 'Quem e da ' + marca.sigla + ' entra com o botao "Entrar com o Google" - sem senha nenhuma.',
        });
      }
    } else {
      // Quem nao tem e-mail da empresa precisa do codigo - e se o codigo nao
      // estiver configurado, esse caminho simplesmente nao existe.
      if (!CODIGO_SEDE) {
        return res.status(403).json({
          erro: DOMINIOS.length
            ? 'A sede so aceita e-mail @' + DOMINIOS[0] + '. Peca um convite pra diretoria.'
            : 'Esta sede nao aceita cadastro por e-mail. Peca um convite pra diretoria.',
        });
      }
      if (codigo !== CODIGO_SEDE) {
        contarErro(ip);
        return res.status(403).json({
          erro: 'Com e-mail de fora, precisa do codigo da sede. Peca pra diretoria.',
        });
      }
    }

    if (senha.length < MIN_SENHA) {
      return res.status(400).json({ erro: 'A senha precisa de pelo menos ' + MIN_SENHA + ' caracteres.' });
    }
    if (senha.length > MAX_SENHA) return res.status(400).json({ erro: 'Senha grande demais.' });
    if (usuarios.porEmail(email)) {
      // Com e-mail, quem esqueceu (ou achou a conta cadastrada por outra pessoa
      // com o SEU e-mail) resolve sozinho: o link de senha nova vai pra ele.
      return res.status(409).json({
        erro: 'Ja existe uma conta com esse e-mail.'
          + (correio.ligado() ? ' Se e o seu, use "Esqueci minha senha" na aba Entrar.' : ''),
      });
    }

    // Cadastro com senha NUNCA da diretoria sozinho - nem pra primeira conta.
    // Aqui ninguem provou quem e: "a primeira conta nasce diretoria" deixava o
    // primeiro estranho a digitar um @admsolucoes depois de um deploy mandar na
    // sede. Diretoria automatica so pelo Google (ver contaDoGoogle); por senha,
    // so com o ADMIN_CODE.
    cadastrosDoIp(ip).qtd += 1;
    // Com o e-mail ligado, a conta nasce PENDENTE: so entra depois do link que
    // chega no endereco digitado. Sem ele, entra na hora, como sempre foi.
    const comEmail = correio.ligado();
    const usuario = usuarios.criar({
      nome,
      email,
      senha,
      isAdmin: !!codigoDeAdmin(corpo.codigoAdmin),
      emailVerificado: comEmail ? false : undefined,
    });
    if (comEmail) {
      podeMandarPara(usuario.id, 'confirmar');
      try {
        await mandarConfirmacao(usuario);
      } catch (e) {
        // Sem o e-mail a pessoa ficaria com uma conta que nunca entra: desfaz,
        // pra ela poder tentar de novo daqui a pouco com o mesmo endereco.
        console.error('[email] confirmacao nao saiu: ' + e.message);
        usuarios.remover(usuario.id);
        return res.status(502).json({ erro: 'Nao consegui mandar o e-mail de confirmacao agora. Tenta de novo em alguns minutos.' });
      }
      return res.json({ pendente: true, email: usuario.email });
    }
    sessao.definirCookie(res, usuario.id);
    res.json({ usuario: usuarios.publico(usuario) });
  });

  // (O link de confirmacao NAO tem rota propria: ele abre a tela de login, e
  // quem confirma e o /entrar, junto com a senha. Ver la.)

  // "Esqueci minha senha": manda um link, exista a conta ou nao - a resposta e a
  // MESMA nos dois casos, e o envio fica pra depois da resposta (o tempo dela
  // tambem nao pode entregar quais e-mails tem conta aqui).
  rotas.post('/esqueci-senha', (req, res) => {
    if (!correio.ligado()) {
      return res.status(503).json({ erro: 'Esta sede nao manda e-mail: peca pra diretoria redefinir a sua senha.' });
    }
    const ip = req.ip || 'desconhecido';
    const pedidos = pedidosSenhaDoIp(ip);
    if (pedidos.qtd >= MAX_PEDIDOS_SENHA) {
      return res.status(429).json({ erro: 'Muitos pedidos. Espera uns minutos.' });
    }
    pedidos.qtd += 1;
    const digitado = texto((req.body || {}).email);
    if (!EMAIL_RE.test(digitado)) return res.status(400).json({ erro: 'E-mail invalido.' });

    const conta = usuarios.porEmail(digitado);
    // Conta do Google nao tem senha pra trocar.
    if (conta && conta.senhaHash && podeMandarPara(conta.id, 'senha')) {
      setImmediate(() => {
        mandarNovaSenha(conta).catch((e) => console.error('[email] senha nova nao saiu: ' + e.message));
      });
    }
    res.json({ ok: true, aviso: 'Se esse e-mail tiver conta aqui, o link pra escolher uma senha nova chega em alguns minutos. Confira o spam tambem.' });
  });

  // A senha nova, com o link do e-mail.
  rotas.post('/redefinir-senha', (req, res) => {
    const ip = req.ip || 'desconhecido';
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }
    const corpo = req.body || {};
    const lido = links.ler(texto(corpo.token), 'senha');
    const conta = lido && usuarios.porId(lido.uid);
    if (!conta || !conta.senhaHash || lido.marca !== impressaoDaSenha(conta)) {
      contarErro(ip);
      return res.status(400).json({ erro: 'Esse link nao vale mais: ele vence em 1 hora e serve uma vez so. Peca outro em "Esqueci minha senha".' });
    }
    const nova = typeof corpo.novaSenha === 'string' ? corpo.novaSenha : '';
    if (nova.length < MIN_SENHA) {
      return res.status(400).json({ erro: 'A senha nova precisa de pelo menos ' + MIN_SENHA + ' caracteres.' });
    }
    if (nova.length > MAX_SENHA) return res.status(400).json({ erro: 'Senha grande demais.' });

    limparErros(ip);
    const atualizada = usuarios.redefinirPeloEmail(conta.id, nova);
    // Quem estava logado em outro lugar (inclusive quem pediu o link se passando
    // pela pessoa) sai na hora. Esta aba ganha a sessao nova logo abaixo.
    aoEncerrarConta(conta.id, 'senha-trocada');
    usuarios.marcarAcesso(conta.id);
    sessao.definirCookie(res, conta.id);
    res.json({ usuario: usuarios.publico(atualizada) });
  });

  // O que a tela de login deve oferecer. Publico: a tela aparece antes de ter
  // sessao.
  rotas.get('/login-opcoes', (req, res) => {
    // `dominios`: a tela usa pra decidir quando mostrar o campo do codigo. Cada
    // sede (cliente) tem os seus - a lista fixa da ADM no front nao serve pra elas.
    res.json({ google: loginGoogleLigado(), dominio: DOMINIOS[0] || null, dominios: DOMINIOS, nome: marca.nome, sigla: marca.sigla, email: correio.ligado() });
  });

  // Inicio do login com o Google. O fim e o concluirLoginGoogle.
  rotas.get('/google/entrar', (req, res) => {
    if (!loginGoogleLigado()) return res.redirect('/?entrar=indisponivel');
    const nonce = crypto.randomBytes(24).toString('base64url');
    // 10 min, igual a validade do state; e so o caminho da volta enxerga
    sessao.definirCookieCurto(res, NOME_NONCE, nonce, 600, '/api/google');
    res.redirect(google.urlDeLogin(nonce));
  });

  rotas.post('/entrar', async (req, res) => {
    const ip = req.ip || 'desconhecido';
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }

    const corpo = req.body || {};
    const usuario = usuarios.porEmail(texto(corpo.email));
    const senha = typeof corpo.senha === 'string' ? corpo.senha : '';

    // Mesma resposta nos dois casos: nao entrega quais e-mails existem.
    if (!usuario || !senha || !usuarios.senhaConfere(senha, usuario)) {
      contarErro(ip);
      return res.status(401).json({ erro: 'E-mail ou senha invalidos.' });
    }

    limparErros(ip);
    // Senha certa, mas o e-mail nunca foi confirmado. O link que chegou por
    // e-mail (`confirmar`) SO confirma junto com a senha certa - sozinho ele nao
    // entra em conta nenhuma. "Clicar no link ja entra" deixava dois buracos:
    //  - filtro de e-mail de empresa (Safe Links e parecidos) abre os links que
    //    chegam, sozinho: confirmaria a conta de quem cadastrou o e-mail ALHEIO;
    //  - quem cadastra o e-mail de outra pessoa com uma senha dele so precisa
    //    que ela clique no link - e ai a conta dela teria uma senha que ele sabe.
    // Assim, confirmar exige a caixa de entrada E a senha: as duas metades.
    if (usuario.emailVerificado === false) {
      const lido = links.ler(texto(corpo.confirmar), 'confirmar');
      if (lido && lido.uid === usuario.id) usuarios.confirmarEmail(usuario.id);
    }
    // Ainda pendente: nao entra, e o link vai de novo (no maximo um por minuto).
    // Se o e-mail foi DESLIGADO depois, entra: sem como confirmar, prender a
    // pessoa pra sempre nao protege ninguem.
    if (usuario.emailVerificado === false && correio.ligado()) {
      let reenviado = false;
      if (podeMandarPara(usuario.id, 'confirmar')) {
        try {
          await mandarConfirmacao(usuario);
          reenviado = true;
        } catch (e) {
          console.error('[email] reenvio da confirmacao nao saiu: ' + e.message);
        }
      }
      return res.status(403).json({
        pendente: true,
        erro: 'Falta confirmar seu e-mail. ' + (reenviado
          ? 'Mandamos o link de novo pra ' + usuario.email + '.'
          : 'O link esta na sua caixa de entrada - confira o spam tambem.'),
      });
    }
    usuarios.marcarAcesso(usuario.id);
    sessao.definirCookie(res, usuario.id);
    res.json({ usuario: usuarios.publico(usuario) });
  });

  rotas.post('/sair', (req, res) => {
    sessao.limparCookie(res);
    res.json({ ok: true });
  });

  // Health check da hospedagem: tem que responder 200 SEM login, senao o Render
  // acha que o servico caiu. Nao use /eu pra isso - ele responde 401 de proposito.
  rotas.get('/saude', (req, res) => {
    res.json({ ok: true, contas: usuarios.totalDeContas() });
  });

  // Diagnostico de MUDANCA DE HOSPEDAGEM. Ver public/diagnostico.html.
  //
  // Publico de proposito, e isso e o ponto: ele precisa responder num servidor
  // recem-criado, ANTES de existir a primeira conta - que e exatamente o momento
  // em que a pessoa esta tentando descobrir por que nada funciona.
  //
  // Por isso ele so devolve SIM/NAO e a versao do Node. Nenhum valor, nenhum
  // caminho, nenhum e-mail. Saber que "o Trello esta configurado" nao ajuda
  // ninguem a entrar; saber que "o DATA_DIR nao e gravavel" evita meia tarde
  // perdida.
  rotas.get('/diagnostico', (req, res) => {
    const pasta = pastaDados.PASTA;
    let gravavel = false;
    try {
      pastaDados.garantirPasta();
      const teste = path.join(pasta, '.escrita-de-teste');
      fs.writeFileSync(teste, 'ok');
      fs.rmSync(teste);
      gravavel = true;
    } catch (e) { gravavel = false; }

    // O IP QUE O SERVIDOR ENXERGA, sem dizer qual e.
    //
    // O freio de forca bruta conta erro por IP. Atras de um proxy que nao manda
    // `X-Forwarded-For` (ou com o `trust proxy` errado), o servidor ve o IP do
    // PROXY e conta todo mundo como a mesma pessoa: dez logins errados de gente
    // diferente trancam a sede inteira. Isso nao aparece em lugar nenhum ate
    // acontecer - e ai parece "o login quebrou".
    const encaminhado = !!req.headers['x-forwarded-for'];
    const ipPorPessoa = encaminhado ? req.ip !== req.socket.remoteAddress : true;

    res.json({
      node: process.versions.node,
      // `process.loadEnvFile` so existe do 20.12 em diante. Em versao antiga o
      // .env nao carrega e TODAS as integracoes somem sem erro nenhum - a falha
      // mais silenciosa que este projeto tem.
      nodeSuficiente: typeof process.loadEnvFile === 'function',
      producao: process.env.NODE_ENV === 'production',
      dadosGravavel: gravavel,
      atrasDeProxy: encaminhado,
      ipPorPessoa,
      contas: usuarios.totalDeContas(),
      diretoria: usuarios.totalDeDiretoria(),
      integracoes: {
        google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        // A mesma regra da estante: a chave pode estar na variavel ou no arquivo secreto.
        drive: acervo.origem() === 'drive',
        trello: quadros.situacao().trello,
        kanban: quadros.situacao().kanban,
        turn: !!(process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_TOKEN),
        backup: !!(process.env.BACKUP_DRIVE_PASTA && process.env.BACKUP_CHAVE),
        email: correio.ligado(),
        discador: discador.configurado(),
      },
    });
  });

  rotas.get('/eu', (req, res) => {
    const usuario = sessao.usuarioDaRequisicao(req);
    if (!usuario) return res.status(401).json({ erro: 'Sem sessao.' });
    res.json({ usuario: usuarios.publico(usuario) });
  });

  // ------------------------------------------------------------------- senha
  // Trocar a propria senha. Pede a atual: sessao aberta num PC emprestado nao
  // pode virar conta tomada. Visitante nao tem senha.
  rotas.put('/senha', sessao.exigirLogin, (req, res) => {
    const ip = req.ip || 'desconhecido';
    if (bloqueado(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Espera uns minutos.' });
    }
    const corpo = req.body || {};
    const atual = typeof corpo.senhaAtual === 'string' ? corpo.senhaAtual : '';
    const nova = typeof corpo.novaSenha === 'string' ? corpo.novaSenha : '';

    if (!usuarios.senhaConfere(atual, req.usuario)) {
      contarErro(ip);
      return res.status(403).json({ erro: 'A senha atual nao confere.' });
    }
    if (nova.length < MIN_SENHA) {
      return res.status(400).json({ erro: 'A senha nova precisa de pelo menos ' + MIN_SENHA + ' caracteres.' });
    }
    if (nova.length > MAX_SENHA) return res.status(400).json({ erro: 'Senha grande demais.' });
    if (nova === atual) return res.status(400).json({ erro: 'A senha nova e igual a atual.' });

    limparErros(ip);
    const conta = usuarios.trocarSenha(req.usuario.id, nova);
    // Trocar a senha derruba as OUTRAS sessoes (a versao subiu). Esta aqui
    // ganha um cookie novo na hora, senao a pessoa caia pro login no mesmo
    // clique em que trocou a senha.
    sessao.definirCookie(res, conta.id);
    res.json({ usuario: usuarios.publico(conta) });
  });

  // -------------------------------------------------------------- WhatsApp
  // O proprio numero (vazio apaga).
  rotas.put('/perfil/whatsapp', sessao.exigirLogin, (req, res) => {
    const r = usuarios.definirWhatsapp(req.usuario.id, (req.body || {}).numero);
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json(r);
  });

  // O numero de um colega, pro botao do cartao. Um por vez e so pra membro: o
  // numero nao vai na lista de pessoas que o socket manda pra todo mundo.
  rotas.get('/pessoas/:uid/whatsapp', sessao.exigirLogin, (req, res) => {
    const u = usuarios.porId(req.params.uid);
    if (!u) return res.json({ whatsapp: null });
    res.set('Cache-Control', 'no-store');
    res.json({ whatsapp: u.whatsapp || null });
  });

  // ---------------------------------------------------------------- membros
  // Tela da diretoria. Sem servico de e-mail nao ha "esqueci minha senha" por
  // link: quem esqueceu pede pra diretoria, que gera uma senha provisoria.
  rotas.get('/membros', sessao.exigirDiretoria, (req, res) => {
    res.json({ membros: usuarios.membros(), eu: req.usuario.id });
  });

  function alvoDe(req, res) {
    const alvo = usuarios.porId(req.params.id);
    if (!alvo) {
      res.status(404).json({ erro: 'Essa conta nao existe mais.' });
      return null;
    }
    return alvo;
  }

  rotas.post('/membros/:id/redefinir-senha', sessao.exigirDiretoria, (req, res) => {
    const alvo = alvoDe(req, res);
    if (!alvo) return;
    if (alvo.id === req.usuario.id) {
      return res.status(400).json({ erro: 'Pra sua propria conta, use "Trocar senha".' });
    }
    // Conta provada pelo Google nao ganha senha pela mao de terceiros: seria a
    // diretoria abrindo uma porta que o Google nao confere - e entrando nela.
    if (alvo.googleSub) {
      return res.status(400).json({ erro: 'Essa pessoa entra com o Google: nao ha senha pra redefinir.' });
    }
    const senhaTemporaria = usuarios.redefinirSenha(alvo.id);
    aoEncerrarConta(alvo.id, 'senha-redefinida');
    console.log('[membros] ' + req.usuario.email + ' redefiniu a senha de ' + alvo.email);
    // A provisoria sai UMA vez, nesta resposta. Nao fica guardada em lugar
    // nenhum em texto - so o hash, como qualquer senha.
    res.json({ senhaTemporaria, membros: usuarios.membros() });
  });

  rotas.put('/membros/:id/diretoria', sessao.exigirDiretoria, (req, res) => {
    const alvo = alvoDe(req, res);
    if (!alvo) return;
    const isAdmin = !!(req.body && req.body.isAdmin);
    // Tirar a propria diretoria e o jeito mais facil de trancar a sede sem
    // ninguem que consiga administrar. Outra pessoa da diretoria faz isso.
    if (alvo.id === req.usuario.id && !isAdmin) {
      return res.status(400).json({ erro: 'Peca pra outra pessoa da diretoria tirar a sua.' });
    }
    usuarios.definirDiretoria(alvo.id, isAdmin);
    console.log('[membros] ' + req.usuario.email + (isAdmin ? ' deu' : ' tirou') + ' diretoria de ' + alvo.email);
    res.json({ membros: usuarios.membros() });
  });

  rotas.delete('/membros/:id', sessao.exigirDiretoria, (req, res) => {
    const alvo = alvoDe(req, res);
    if (!alvo) return;
    if (alvo.id === req.usuario.id) {
      return res.status(400).json({ erro: 'Voce nao pode remover a propria conta.' });
    }
    // derruba ANTES de apagar: o gancho ainda acha a mesa e o socket pela conta
    aoEncerrarConta(alvo.id, 'conta-removida');
    usuarios.remover(alvo.id);
    console.log('[membros] ' + req.usuario.email + ' removeu ' + alvo.email);
    res.json({ membros: usuarios.membros() });
  });

  rotas.put('/perfil', sessao.exigirLogin, (req, res) => {
    const corpo = req.body || {};
    const nome = texto(corpo.nome).slice(0, MAX_NOME);
    const atualizado = usuarios.atualizarPerfil(req.usuario.id, {
      nome: nome || undefined,
      appearance: corpo.appearance ? sanitizeAppearance(corpo.appearance) : undefined,
    });
    res.json({ usuario: usuarios.publico(atualizado) });
  });

  return rotas;
}

// Codigo vazio nao casa com nada: sem ADMIN_CODE configurado, este caminho
// fica fechado em vez de aceitar string vazia e promover todo mundo.
function codigoDeAdmin(valor) {
  return !!ADMIN_CODE && typeof valor === 'string' && valor.trim() === ADMIN_CODE;
}

module.exports = {
  criarRotas,
  concluirLoginGoogle,
  loginGoogleLigado,
  CODIGO_SEDE,
  DOMINIOS,
  DIRETORIA_EMAILS,
  // pros testes
  _ehEmailDaSede: ehEmailDaSede,
};
