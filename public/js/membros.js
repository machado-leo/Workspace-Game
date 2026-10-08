// Gestao de conta: trocar a propria senha e, pra diretoria, a lista de membros
// (redefinir senha, dar/tirar diretoria, remover quem saiu da ADM) - aberta pelo
// painel Diretoria (js/diretoria.js).
//
// Existe porque a EJ troca de gente todo semestre. Sem isto, ex-membro seguia
// com acesso ao chat, a biblioteca e ao Trello, e quem esquecia a senha ficava
// trancado pra fora. Regras e seguranca no servidor (server/auth.js).
(function () {
  let usuarioAtual = null;
  let aoAbrir = null;            // fecha o menu da conta

  // ------------------------------------------------------------------ rede
  async function pedir(rota, metodo, corpo) {
    const r = await fetch('/api' + rota, {
      method: metodo || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let dados = null;
    try { dados = await r.json(); } catch (e) { dados = null; }
    if (!r.ok) throw new Error((dados && dados.erro) || 'Nao consegui falar com o servidor.');
    return dados;
  }

  function mostrar(el, texto) {
    el.textContent = texto || '';
    el.classList.toggle('oculto', !texto);
  }

  // ------------------------------------------------------------ trocar senha
  let painelSenha, formSenha, erroSenha;
  let senhaObrigatoria = false;

  function abrirSenha({ provisoria } = {}) {
    senhaObrigatoria = !!provisoria;
    formSenha.reset();
    mostrar(erroSenha, '');
    document.getElementById('senha-titulo').textContent = provisoria ? 'Crie a sua senha' : 'Trocar senha';
    document.getElementById('senha-ajuda').textContent = provisoria
      ? 'Voce entrou com uma senha provisoria, que passou pela mao de outra pessoa. '
        + 'Crie uma sua pra continuar.'
      : 'Trocar a senha desconecta a sua conta dos outros aparelhos.';
    document.getElementById('senha-rotulo-atual').textContent = provisoria ? 'Senha provisoria' : 'Senha atual';
    // Provisoria nao tem "cancelar": a sede continua aberta por tras, mas o
    // aviso volta no proximo acesso ate a senha ser trocada.
    document.getElementById('btn-fechar-senha').textContent = provisoria ? 'Depois' : 'Cancelar';
    painelSenha.classList.remove('oculto');
    document.getElementById('senha-atual').focus();
  }

  function fecharSenha() {
    painelSenha.classList.add('oculto');
  }

  async function salvarSenha(ev) {
    ev.preventDefault();
    const atual = document.getElementById('senha-atual').value;
    const nova = document.getElementById('senha-nova').value;
    const repetir = document.getElementById('senha-repetir').value;
    if (!atual) return mostrar(erroSenha, 'Digite a senha ' + (senhaObrigatoria ? 'provisoria.' : 'atual.'));
    if (nova.length < 8) return mostrar(erroSenha, 'A senha nova precisa de pelo menos 8 caracteres.');
    if (nova !== repetir) return mostrar(erroSenha, 'As duas senhas novas nao sao iguais.');

    const botao = document.getElementById('btn-salvar-senha');
    botao.disabled = true;
    try {
      const r = await pedir('/senha', 'PUT', { senhaAtual: atual, novaSenha: nova });
      usuarioAtual = r.usuario;
      fecharSenha();
    } catch (e) {
      mostrar(erroSenha, e.message);
    } finally {
      botao.disabled = false;
    }
  }

  // ----------------------------------------------------------------- membros
  let painelMembros, listaEl, erroMembros, provisoriaEl;

  function quando(ms) {
    if (!ms) return 'nunca';
    const dias = Math.floor((Date.now() - ms) / 86400000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 30) return 'ha ' + dias + ' dias';
    return new Date(ms).toLocaleDateString('pt-BR');
  }

  function botao(texto, classe, aoClicar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'membro-acao ' + (classe || '');
    b.textContent = texto;
    b.addEventListener('click', aoClicar);
    return b;
  }

  function desenharMembros(membros, euId) {
    listaEl.innerHTML = '';
    document.getElementById('membros-conta').textContent =
      membros.length + (membros.length === 1 ? ' pessoa' : ' pessoas');

    membros.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'membro';

      const info = document.createElement('div');
      info.className = 'membro-info';
      const nome = document.createElement('strong');
      nome.textContent = m.nome + (m.id === euId ? ' (voce)' : '');
      const email = document.createElement('span');
      email.className = 'membro-email';
      email.textContent = m.email;
      const meta = document.createElement('span');
      meta.className = 'membro-meta';
      meta.textContent = (m.isAdmin ? 'Diretoria · ' : '') + 'ultimo acesso ' + quando(m.ultimoAcesso)
        + (m.google ? ' · entra com o Google' : '')
        + (m.emailPendente ? ' · e-mail nao confirmado' : '')
        + (m.senhaTemporaria ? ' · senha provisoria' : '');
      info.append(nome, email, meta);

      const acoes = document.createElement('div');
      acoes.className = 'membro-acoes';
      if (m.id !== euId) {
        // Conta do Google nao tem senha - e dar uma a ela abriria uma porta que
        // o Google nao confere. Quem esqueceu, entra com o Google de novo.
        if (!m.google) acoes.append(botao('Redefinir senha', '', () => redefinir(m)));
        acoes.append(
          botao(m.isAdmin ? 'Tirar diretoria' : 'Dar diretoria', '', () => diretoria(m, !m.isAdmin)),
          botao('Remover', 'perigo', () => remover(m)),
        );
      }
      li.append(info, acoes);
      listaEl.appendChild(li);
    });
  }

  async function carregarMembros() {
    mostrar(erroMembros, '');
    try {
      const r = await pedir('/membros');
      desenharMembros(r.membros, r.eu);
    } catch (e) {
      mostrar(erroMembros, e.message);
    }
  }

  async function acao(fn) {
    mostrar(erroMembros, '');
    listaEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await fn();
    } catch (e) {
      mostrar(erroMembros, e.message);
      carregarMembros();
    }
  }

  function redefinir(m) {
    if (!confirm('Redefinir a senha de ' + m.nome + '?\n\nA senha atual para de valer e a pessoa sai da sede agora. '
      + 'Voce recebe uma senha provisoria pra passar pra ela.')) return;
    acao(async () => {
      const r = await pedir('/membros/' + encodeURIComponent(m.id) + '/redefinir-senha', 'POST');
      document.getElementById('membros-provisoria-texto').textContent =
        'Senha provisoria de ' + m.nome + '. Ela aparece so agora: copie e passe pra pessoa. '
        + 'No primeiro acesso a sede pede pra ela criar uma senha propria.';
      document.getElementById('membros-provisoria-senha').value = r.senhaTemporaria;
      provisoriaEl.classList.remove('oculto');
      desenharMembros(r.membros, usuarioAtual && usuarioAtual.id);
    });
  }

  function diretoria(m, dar) {
    const texto = dar
      ? 'Dar diretoria pra ' + m.nome + '? A pessoa passa a decorar a sede, convidar visitantes e gerenciar membros.'
      : 'Tirar a diretoria de ' + m.nome + '?';
    if (!confirm(texto)) return;
    acao(async () => {
      const r = await pedir('/membros/' + encodeURIComponent(m.id) + '/diretoria', 'PUT', { isAdmin: dar });
      desenharMembros(r.membros, usuarioAtual && usuarioAtual.id);
    });
  }

  function remover(m) {
    if (!confirm('Remover ' + m.nome + ' (' + m.email + ') da sede?\n\n'
      + 'A pessoa sai agora, perde o acesso e a mesa dela fica livre. As mensagens que ela mandou continuam no chat. '
      + 'Isso nao da pra desfazer: pra voltar, ela cria uma conta nova com o codigo da sede.')) return;
    acao(async () => {
      const r = await pedir('/membros/' + encodeURIComponent(m.id), 'DELETE');
      provisoriaEl.classList.add('oculto');
      desenharMembros(r.membros, usuarioAtual && usuarioAtual.id);
    });
  }

  function abrirMembros() {
    provisoriaEl.classList.add('oculto');
    painelMembros.classList.remove('oculto');
    listaEl.innerHTML = '<li class="membro-carregando">Carregando...</li>';
    carregarMembros();
  }

  function fecharMembros() {
    painelMembros.classList.add('oculto');
    // a provisoria nao fica na tela depois de fechar
    document.getElementById('membros-provisoria-senha').value = '';
    provisoriaEl.classList.add('oculto');
  }

  async function copiarProvisoria() {
    const campo = document.getElementById('membros-provisoria-senha');
    const b = document.getElementById('btn-copiar-provisoria');
    campo.select();
    try {
      await navigator.clipboard.writeText(campo.value);
      b.textContent = 'Copiado';
    } catch (e) {
      b.textContent = 'Aperte Ctrl+C';
    }
    setTimeout(() => { b.textContent = 'Copiar'; }, 1800);
  }

  // ----------------------------------------------------------------- publico

  // Chamado pelo main.js quando a conta carrega.
  function mostrarPara(usuario) {
    usuarioAtual = usuario;
    const membro = !!usuario;
    // quem entra com o Google nao tem senha pra trocar
    document.getElementById('btn-trocar-senha').classList.toggle('oculto', !(membro && usuario.temSenha));
    // "Membros da sede" mora no painel Diretoria (js/diretoria.js), que chama abrirMembros.
    if (membro && usuario.senhaTemporaria) abrirSenha({ provisoria: true });
  }

  function init(fecharMenu) {
    aoAbrir = fecharMenu;
    painelSenha = document.getElementById('painel-senha');
    formSenha = document.getElementById('form-senha');
    erroSenha = document.getElementById('senha-erro');
    painelMembros = document.getElementById('painel-membros');
    listaEl = document.getElementById('membros-lista');
    erroMembros = document.getElementById('membros-erro');
    provisoriaEl = document.getElementById('membros-provisoria');

    document.getElementById('btn-trocar-senha').addEventListener('click', () => {
      if (aoAbrir) aoAbrir();
      abrirSenha();
    });
    formSenha.addEventListener('submit', salvarSenha);
    document.getElementById('btn-fechar-senha').addEventListener('click', fecharSenha);
    document.getElementById('btn-fechar-membros').addEventListener('click', fecharMembros);
    document.getElementById('btn-copiar-provisoria').addEventListener('click', copiarProvisoria);
    painelMembros.addEventListener('click', (ev) => { if (ev.target === painelMembros) fecharMembros(); });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!painelMembros.classList.contains('oculto')) fecharMembros();
      else if (!painelSenha.classList.contains('oculto')) fecharSenha();
    });
  }

  window.Membros = { init, mostrarPara, abrirSenha, abrirMembros };
})();
