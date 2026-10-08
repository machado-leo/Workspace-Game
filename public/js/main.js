// Arranque: login -> avatar (so no primeiro acesso) -> entrada -> escritorio.
// A tela de entrada aparece sempre, mesmo com a sessao ja salva, pra pessoa
// conferir camera e microfone antes de aparecer no mapa.
// Ver docs/plano-login.md, secao 7.
(function () {
  const telaCriador = document.getElementById('tela-criador');
  const telaJogo = document.getElementById('tela-jogo');
  const menuConta = document.getElementById('menu-conta');
  let iniciado = false;
  let contaAtual = null;

  function entrarNoJogo(perfil) {
    telaCriador.classList.add('oculto');
    Auth.esconder();
    Entrada.esconder();
    telaJogo.classList.remove('oculto');
    contaAtual = Object.assign({}, contaAtual, { nome: perfil.name });
    preencherMenu(contaAtual);
    if (!iniciado) {
      Game.init(perfil);
      iniciado = true;
    }
  }

  function abrirEntrada() {
    telaJogo.classList.add('oculto');
    telaCriador.classList.add('oculto');
    Auth.esconder();
    Entrada.mostrar(contaAtual);
  }

  function abrirCriador() {
    telaJogo.classList.add('oculto');
    Auth.esconder();
    Entrada.esconder();
    telaCriador.classList.remove('oculto');
    Creator.init(contaAtual, (perfil) => {
      contaAtual = Object.assign({}, contaAtual, {
        nome: perfil.name,
        appearance: perfil.appearance,
      });
      // O Game so aceita init uma vez; depois disso a troca de avatar exige
      // reconectar, entao recarrega (a sessao continua no cookie).
      if (iniciado) location.reload();
      else abrirEntrada();
    });
  }

  // Primeiro acesso (sem avatar) monta o boneco antes; o resto vai pra entrada.
  function depoisDoLogin(usuario) {
    contaAtual = usuario;
    preencherMenu(usuario);
    if (usuario.appearance) abrirEntrada();
    else abrirCriador();
  }

  function preencherMenu(usuario) {
    document.getElementById('menu-conta-nome').textContent = usuario.nome;
    // Trocar senha (membro); abre a troca obrigatoria se a pessoa entrou com
    // senha provisoria. O botao Diretoria (membros, decorar, situacao) so pra ela.
    Membros.mostrarPara(usuario);
    Diretoria.mostrarPara(usuario);
    WhatsApp.mostrarPara(usuario);
    const avatar = document.getElementById('conta-avatar');
    avatar.textContent = (usuario.nome || '?').trim().slice(0, 1).toUpperCase();
    if (usuario.appearance && usuario.appearance.shirt) {
      avatar.style.background = usuario.appearance.shirt;
    }
    // "Entrou em 06/09/2026", como no cartao da referencia. Conta antiga sem a
    // data nao inventa nada: mostra o e-mail, que e o que sempre existe.
    const desde = document.getElementById('menu-conta-desde');
    desde.textContent = usuario.criadoEm
      ? 'Entrou em ' + new Date(usuario.criadoEm).toLocaleDateString('pt-BR')
      : usuario.email;
  }

  function fecharMenu() {
    menuConta.classList.add('oculto');
    document.getElementById('menu-conta-mais').classList.add('oculto');
  }

  CartaoMesa.init();
  ItemMesa.init();
  Membros.init(fecharMenu);
  Diretoria.init();
  WhatsApp.init(fecharMenu);
  Spotify.init();
  Auth.init(depoisDoLogin);
  Entrada.init(entrarNoJogo, abrirCriador);

  document.getElementById('btn-conta').addEventListener('click', (ev) => {
    ev.stopPropagation();
    menuConta.classList.toggle('oculto');
  });
  document.addEventListener('click', (ev) => {
    if (!menuConta.contains(ev.target)) fecharMenu();
  });

  const menuMais = document.getElementById('menu-conta-mais');
  document.getElementById('btn-conta-mais').addEventListener('click', (ev) => {
    ev.stopPropagation();
    menuMais.classList.toggle('oculto');
  });

  document.getElementById('btn-trocar-avatar').addEventListener('click', () => {
    fecharMenu();
    abrirCriador();
  });

  // So faz sentido oferecer "largar" pra quem tem mesa, entao o item aparece e
  // some junto com a mesa. `Game` avisa a cada atualizacao da lista.
  const btnLargarMesa = document.getElementById('btn-largar-mesa');
  btnLargarMesa.addEventListener('click', () => {
    fecharMenu();
    Network.largarMesa();
  });
  Game.aoMudarMinhaMesa((tem) => btnLargarMesa.classList.toggle('oculto', !tem));

  document.getElementById('btn-sair').addEventListener('click', async () => {
    fecharMenu();
    try { await Auth.sair(); } catch (e) { /* segue pro login do mesmo jeito */ }
    location.reload();
  });

  // Quem ja tem sessao nao ve a tela de login.
  Auth.eu().then(depoisDoLogin).catch(() => Auth.mostrar());
})();
