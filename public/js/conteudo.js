// Objeto que abre conteudo: a diretoria pendura um link num movel, e quem
// clica nele abre o que estiver ali.
// Ver docs/plano-conteudo.md.
//
// Duas telas no mesmo arquivo porque sao dois lados da mesma coisa:
//   - visitante clica no movel -> ve o que e e decide abrir
//   - diretoria, com o decorador aberto, clica -> poe ou tira o link
(function () {
  // chave "c,r" -> { titulo, url, porUid, em }
  const porCelula = new Map();
  let ehAdmin = false;
  let painelVer, painelPor, celulaEmEdicao = null;

  function chave(c, r) { return c + ',' + r; }

  function em(c, r) {
    return porCelula.get(chave(c, r)) || null;
  }

  // A arte alta (estante, geladeira, quadro) ocupa a celula de CIMA na tela mas
  // mora na de baixo. Sem olhar as duas, clicar na metade que a pessoa mais ve
  // nao abriria nada - foi exatamente o bug que a estante ja teve.
  function perto(c, r) {
    return em(c, r) || em(c, r + 1);
  }

  function carregar(lista) {
    porCelula.clear();
    (lista || []).forEach((x) => porCelula.set(chave(x.c, x.r), x));
  }

  function aplicar(c, r, conteudo) {
    if (conteudo) porCelula.set(chave(c, r), conteudo);
    else porCelula.delete(chave(c, r));
  }

  function todos() {
    return Array.from(porCelula.entries()).map(([k, v]) => {
      const [c, r] = k.split(',').map(Number);
      return { c, r, conteudo: v };
    });
  }

  // ---------------------------------------------------------------- ver
  function abrirVer(conteudo) {
    document.getElementById('conteudo-titulo').textContent = conteudo.titulo;
    const endereco = document.getElementById('conteudo-url');
    endereco.textContent = conteudo.url;
    painelVer.classList.remove('oculto');
    painelVer.dataset.url = conteudo.url;
  }

  function fecharVer() {
    painelVer.classList.add('oculto');
  }

  // Abre em ABA NOVA, nunca dentro da pagina. Duas razoes: a maioria dos sites
  // recusa ser embutido (X-Frame-Options) e sairia um quadro branco sem
  // explicacao; e um site embutido dentro da sede pode se passar por ela.
  function abrirLink() {
    const url = painelVer.dataset.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    fecharVer();
  }

  // ---------------------------------------------------------------- por
  function abrirPor(c, r) {
    celulaEmEdicao = { c, r };
    const existente = em(c, r);
    document.getElementById('por-conteudo-titulo').value = existente ? existente.titulo : '';
    document.getElementById('por-conteudo-url').value = existente ? existente.url : '';
    mostrarErro('');
    document.getElementById('btn-tirar-conteudo').classList.toggle('oculto', !existente);
    document.getElementById('por-conteudo-onde').textContent = 'coluna ' + c + ', linha ' + r;
    painelPor.classList.remove('oculto');
    document.getElementById('por-conteudo-titulo').focus();
  }

  // A faixa de erro tem fundo vermelho: vazia e visivel, vira uma tarja rosa
  // no meio do formulario sem nada escrito.
  function mostrarErro(texto) {
    const el = document.getElementById('por-conteudo-erro');
    el.textContent = texto || '';
    el.classList.toggle('oculto', !texto);
  }

  function fecharPor() {
    painelPor.classList.add('oculto');
    celulaEmEdicao = null;
  }

  function salvar(ev) {
    if (ev) ev.preventDefault();
    if (!celulaEmEdicao) return;
    Network.porConteudoNoMapa(
      celulaEmEdicao.c,
      celulaEmEdicao.r,
      document.getElementById('por-conteudo-titulo').value,
      document.getElementById('por-conteudo-url').value
    );
    // Nao fecha agora: espera o servidor. Se ele recusar, a pessoa precisa ver
    // o motivo com o que digitou ainda na tela.
  }

  function tirar() {
    if (!celulaEmEdicao) return;
    Network.porConteudoNoMapa(celulaEmEdicao.c, celulaEmEdicao.r, '', '');
    fecharPor();
  }

  // O servidor recusou: mostra o motivo no formulario que ainda esta aberto.
  function recusado(dados) {
    if (!celulaEmEdicao) return;
    mostrarErro(dados.motivo || 'Nao deu.');
  }

  function aceito(c, r) {
    if (celulaEmEdicao && celulaEmEdicao.c === c && celulaEmEdicao.r === r) fecharPor();
  }

  // ---------------------------------------------------------------- clique
  // Devolve true quando o clique foi tratado aqui (e o boneco nao deve andar).
  function cliqueEm(c, r, decoradorAberto) {
    if (ehAdmin && decoradorAberto) {
      abrirPor(c, r);
      return true;
    }
    const achado = perto(c, r);
    if (!achado) return false;
    abrirVer(achado);
    return true;
  }

  function init(admin) {
    ehAdmin = !!admin;
  }

  function ligarTelas() {
    painelVer = document.getElementById('painel-conteudo');
    painelPor = document.getElementById('painel-por-conteudo');

    document.getElementById('btn-abrir-conteudo').addEventListener('click', abrirLink);
    document.getElementById('btn-fechar-conteudo').addEventListener('click', fecharVer);
    painelVer.addEventListener('click', (ev) => { if (ev.target === painelVer) fecharVer(); });

    document.getElementById('form-por-conteudo').addEventListener('submit', salvar);
    document.getElementById('btn-tirar-conteudo').addEventListener('click', tirar);
    document.getElementById('btn-cancelar-conteudo').addEventListener('click', fecharPor);
    painelPor.addEventListener('click', (ev) => { if (ev.target === painelPor) fecharPor(); });

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!painelVer.classList.contains('oculto')) fecharVer();
      if (!painelPor.classList.contains('oculto')) fecharPor();
    });
  }

  ligarTelas();

  window.Conteudo = {
    init, carregar, aplicar, em, perto, todos, cliqueEm, recusado, aceito,
    fecharVer, fecharPor,
  };
})();
