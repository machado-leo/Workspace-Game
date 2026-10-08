// Diretoria: as ferramentas de quem cuida da sede, num painel so.
//
// POR QUE EXISTE
// Estavam espalhadas: "Decorar" era um botao solto no trilho, "Membros da sede" morava
// escondido em Conta > Mais opcoes, e saber se o Drive, o Kanban ou o backup estavam
// ligados exigia abrir /diagnostico.html. Agora a diretoria tem um botao proprio.
//
// So quem e diretoria ve o botao. E conforto, nao seguranca: quem confere cada acao
// (decorar a sede, mexer em membros) continua sendo o servidor.
//
// A "Situacao da sede" le o /api/diagnostico, que e publico e so diz SIM/NAO - nenhum
// valor de chave passa por aqui (ver server/auth.js e testes/diagnostico.js).
(function () {
  // Na ordem em que a falta mais atrapalha o dia a dia. `falta` diz o que configurar.
  const INTEGRACOES = [
    ['google', 'Login e agenda do Google', 'GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET'],
    ['kanban', 'Kanban do CRM (Quadros e prazos na Agenda)', 'CRM_URL e CRM_CHAVE_KANBAN'],
    ['drive', 'Estante no Drive', 'GOOGLE_DRIVE_PASTA e a chave da conta de servico'],
    ['backup', 'Backup no Drive', 'BACKUP_DRIVE_PASTA e BACKUP_CHAVE'],
    ['email', 'E-mail (confirmar cadastro, esqueci a senha)', 'EMAIL_PROVEDOR, EMAIL_CHAVE e EMAIL_REMETENTE'],
    ['turn', 'Chamada em rede restrita (TURN)', 'CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_TOKEN'],
    ['discador', 'Discador do CRM', 'CRM_URL e CRM_CHAVE_DISCADOR'],
  ];

  let painel, botao, situacaoEl, contasEl;
  let aberto = false;

  // ------------------------------------------------------ a regra (pura)
  // O diagnostico -> linhas da tela. testes/diretoria.js exercita.
  function situacao(diag) {
    if (!diag || typeof diag !== 'object') return { contas: null, alertas: ['Nao consegui ler a situacao da sede agora.'], linhas: [] };
    const i = diag.integracoes || {};
    const linhas = INTEGRACOES.map(([chave, nome, falta]) => ({ chave, nome, ligado: i[chave] === true, falta }));
    // O Trello e dos quadros de antes do Kanban: so aparece se ainda estiver ligado.
    if (i.trello === true) linhas.push({ chave: 'trello', nome: 'Trello (quadros antigos)', ligado: true, falta: '' });
    const alertas = [];
    if (diag.dadosGravavel === false) alertas.push('A pasta de dados nao aceita gravacao: nada do que muda na sede esta sendo salvo.');
    if (diag.nodeSuficiente === false) alertas.push('Versao do Node antiga: o .env nao carrega e as integracoes somem.');
    if (diag.atrasDeProxy && diag.ipPorPessoa === false) alertas.push('Atras de um proxy sem o IP de cada pessoa: um login errado pode trancar todo mundo.');
    return {
      contas: typeof diag.contas === 'number' ? diag.contas : null,
      diretoria: typeof diag.diretoria === 'number' ? diag.diretoria : null,
      alertas,
      linhas,
    };
  }

  // ------------------------------------------------------------ na tela
  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function pintarSituacao(s) {
    situacaoEl.innerHTML = '';
    s.alertas.forEach((a) => situacaoEl.appendChild(el('li', 'dir-alerta', a)));
    s.linhas.forEach((l) => {
      const li = el('li', 'dir-linha' + (l.ligado ? ' ligado' : ''));
      li.appendChild(el('span', 'dir-marca', l.ligado ? '✓' : '–'));
      const txt = el('span', 'dir-linha-texto');
      txt.appendChild(el('span', 'dir-linha-nome', l.nome));
      txt.appendChild(el('span', 'dir-linha-sub', l.ligado ? 'Ligado' : 'Desligado · falta ' + l.falta));
      li.appendChild(txt);
      situacaoEl.appendChild(li);
    });
    contasEl.textContent = s.contas === null ? ''
      : s.contas + (s.contas === 1 ? ' conta' : ' contas') + (s.diretoria ? ', ' + s.diretoria + ' na diretoria' : '');
  }

  async function carregarSituacao() {
    situacaoEl.innerHTML = '<li class="dir-carregando">Conferindo...</li>';
    let diag = null;
    try {
      const r = await fetch('/api/diagnostico', { credentials: 'same-origin' });
      if (r.ok) diag = await r.json();
    } catch (e) { diag = null; }
    pintarSituacao(situacao(diag));
  }

  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    if (window.Paineis) Paineis.abriu('diretoria');
    carregarSituacao();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    if (window.Paineis) Paineis.fechou('diretoria');
  }
  if (window.Paineis) Paineis.registrar('diretoria', { fechar, botao: 'btn-diretoria', esc: true });

  // Chamado pelo main.js quando a conta carrega.
  function mostrarPara(usuario) {
    const sim = !!(usuario && usuario.isAdmin);
    botao.classList.toggle('oculto', !sim);
    if (!sim && aberto) fechar();
  }

  function init() {
    painel = document.getElementById('painel-diretoria');
    botao = document.getElementById('btn-diretoria');
    situacaoEl = document.getElementById('dir-situacao');
    contasEl = document.getElementById('dir-contas');

    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-diretoria').addEventListener('click', fechar);
    document.getElementById('dir-atualizar').addEventListener('click', carregarSituacao);
    // O decorador e a lista de membros abrem por cima: o Paineis fecha este.
    document.getElementById('dir-decorar').addEventListener('click', () => {
      if (window.Decorador && Decorador.abrir) Decorador.abrir();
    });
    document.getElementById('dir-membros').addEventListener('click', () => {
      fechar();
      if (window.Membros && Membros.abrirMembros) Membros.abrirMembros();
    });
  }

  window.Diretoria = { init, mostrarPara, _situacao: situacao };
})();
