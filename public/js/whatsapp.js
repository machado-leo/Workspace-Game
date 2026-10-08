// WhatsApp pessoal dentro da rotina da sede.
//
// O QUE DA E O QUE NAO DA
// O WhatsApp Web se recusa a abrir DENTRO de outro site (o proprio WhatsApp
// bloqueia iframe). E as ferramentas que "colam" o WhatsApp numa pagina nao sao
// oficiais: violam as regras dele e podem banir o numero da pessoa. Por isso o
// jeito aqui e o oficial, e o mais perto de "dentro" que existe:
//
//   - botao na barra: abre o WhatsApp Web da pessoa numa JANELA colada do lado
//     direito da sede - sempre a mesma janela, sem abrir uma nova a cada clique
//   - numero opcional no perfil: quem cadastra ganha "WhatsApp" no cartao, e o
//     colega clica e ja cai na conversa com a pessoa
//   - no celular, os dois abrem direto o app do WhatsApp
//
// PRIVACIDADE
// O numero nao vai na lista de pessoas que o servidor manda pra todo mundo. O
// cartao pede um por vez (/api/pessoas/:uid/whatsapp), so membro recebe, e
// visitante nunca ve. Cadastrar e escolha da pessoa, e apagar e deixar vazio.
(function () {
  const JANELA = 'whatsapp-sede';
  let usuarioAtual = null;
  let painel, campo, erroEl, aoAbrir;

  function noCelular() {
    return JanelaAoLado.noCelular();
  }

  // Janela do lado direito, na altura da tela, sempre a MESMA (js/janela.js).
  function abrirJanela(url) {
    return JanelaAoLado.abrir(url, { nome: JANELA });
  }

  function avisarBloqueio() {
    JanelaAoLado.avisarBloqueio('WhatsApp');
  }

  function abrirMeuWhatsApp() {
    const url = noCelular() ? 'whatsapp://send' : 'https://web.whatsapp.com/';
    if (!abrirJanela(url)) avisarBloqueio();
  }

  function chamar(numero) {
    const n = String(numero || '').replace(/[^0-9]/g, '');
    if (!n) return;
    const url = noCelular()
      ? 'https://wa.me/' + n
      : 'https://web.whatsapp.com/send?phone=' + n;
    if (!abrirJanela(url)) avisarBloqueio();
  }

  // Numero de um colega, pro botao do cartao. Cache curto: abrir o mesmo cartao
  // duas vezes seguidas nao precisa ir ao servidor de novo.
  const cache = new Map();   // uid -> { numero, em }
  async function numeroDe(uid) {
    const c = cache.get(uid);
    if (c && Date.now() - c.em < 60000) return c.numero;
    try {
      const r = await fetch('/api/pessoas/' + encodeURIComponent(uid) + '/whatsapp', { credentials: 'same-origin' });
      if (!r.ok) return null;
      const numero = (await r.json()).whatsapp || null;
      cache.set(uid, { numero, em: Date.now() });
      return numero;
    } catch (e) {
      return null;
    }
  }

  // ------------------------------------------------------------ meu numero

  function formatar(numero) {
    const n = String(numero || '');
    const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : (n ? '+' + n : '');
  }

  function abrirCadastro() {
    campo.value = formatar(usuarioAtual && usuarioAtual.whatsapp);
    erroEl.classList.add('oculto');
    document.getElementById('btn-tirar-whatsapp').classList.toggle('oculto', !(usuarioAtual && usuarioAtual.whatsapp));
    painel.classList.remove('oculto');
    campo.focus();
  }

  function fecharCadastro() {
    painel.classList.add('oculto');
  }

  async function salvar(numero) {
    try {
      const r = await fetch('/api/perfil/whatsapp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ numero }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Nao consegui salvar.');
      if (usuarioAtual) usuarioAtual.whatsapp = j.whatsapp;
      fecharCadastro();
    } catch (e) {
      erroEl.textContent = e.message;
      erroEl.classList.remove('oculto');
    }
  }

  // ------------------------------------------------------------------ init

  function mostrarPara(usuario) {
    usuarioAtual = usuario;
    const membro = !!usuario;
    const item = document.getElementById('btn-meu-whatsapp');
    if (item) item.classList.toggle('oculto', !membro);
  }

  function init(fecharMenu) {
    aoAbrir = fecharMenu;
    painel = document.getElementById('painel-whatsapp');
    campo = document.getElementById('whatsapp-numero');
    erroEl = document.getElementById('whatsapp-erro');

    const botao = document.getElementById('btn-whatsapp');
    if (botao) botao.addEventListener('click', abrirMeuWhatsApp);

    const item = document.getElementById('btn-meu-whatsapp');
    if (item) item.addEventListener('click', () => { if (aoAbrir) aoAbrir(); abrirCadastro(); });

    if (painel) {
      document.getElementById('form-whatsapp').addEventListener('submit', (ev) => {
        ev.preventDefault();
        salvar(campo.value);
      });
      document.getElementById('btn-fechar-whatsapp').addEventListener('click', fecharCadastro);
      document.getElementById('btn-tirar-whatsapp').addEventListener('click', () => salvar(''));
      painel.addEventListener('click', (ev) => { if (ev.target === painel) fecharCadastro(); });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && !painel.classList.contains('oculto')) fecharCadastro();
      });
    }
  }

  window.WhatsApp = { init, mostrarPara, chamar, numeroDe, _formatar: formatar };
})();
