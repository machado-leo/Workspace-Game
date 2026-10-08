// Pessoas: quem esta na sede agora, em que sala, fazendo o que - e o jeito de
// chegar ate a pessoa. No espirito do Gather: achar alguem, acenar e caminhar ate
// la sem precisar marcar reuniao.
//
// O painel juntou a busca rapida (Ctrl+K) e a visao de salas, que faziam cada uma
// metade: a busca achava a pessoa e ia ate ela, e so; as salas mostravam quem
// estava onde em bolinhas com iniciais, sem acao nenhuma. Agora e uma lista so,
// agrupada por sala, com Acenar, Mensagem e Ir ate em cada pessoa. O Ctrl+K abre
// o painel com o cursor na busca, e setas + Enter continuam levando ate a pessoa.
//
// Acenar agora chega NA pessoa ("Ana acenou pra voce", com som): o aceno antigo
// aparecia so em cima do proprio boneco, e de outra sala ninguem via.
//
// O cartao (clique numa pessoa no mapa) tambem mora aqui.
(function () {
  const ACENO_NA_TELA_MS = 20 * 1000;
  const RETORNO_DO_BOTAO_MS = 2500;

  let cartao, painel, buscaEl, listaEl, contaEl, avisosEl;
  let aberto = false;
  let intervalId = null;
  let assinatura = '';
  let idDoCartao = null;
  let destacado = null;          // pessoa marcada pelas setas (Enter vai ate ela)
  let ordem = [];                // ids na ordem da tela, pras setas
  const retornoAceno = new Map(); // id -> 'feito' | 'espera' (o botao responde ao clique)
  const acenosNaTela = new Map(); // id de quem acenou -> elemento do aviso

  // ------------------------------------------------------ as regras (puras)
  // Sem tela nem relogio: testes/pessoas.js exercita.

  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  // O que a pessoa esta fazendo alem do status: vai na linha dela.
  function detalhe(p) {
    if (p.chamada && p.chamada.titulo) return 'Na chamada ' + p.chamada.titulo;
    if (p.dividindoTela) return 'Apresentando a tela';
    if (p.lendo && p.lendo.titulo) return 'Lendo ' + p.lendo.titulo;
    return '';
  }

  // Agrupa por sala, na ordem das salas do mapa; quem nao esta em sala nenhuma vai
  // pro fim (sala null). A busca vale pro nome da pessoa E pro da sala: "reuniao"
  // mostra quem esta na sala de reuniao. Voce vem primeiro na sua sala.
  // Devolve { grupos: [{ sala, pessoas }], vazias: [nome da sala], total }.
  function agrupar({ pessoas, salas, salaDe, termo, selfId }) {
    const t = semAcento(termo).trim();
    const porSala = new Map();
    salas.forEach((s) => porSala.set(s.id, []));
    const fora = [];
    let total = 0;
    pessoas.forEach((p) => {
      total++;
      const sala = salaDe(p);
      const bate = !t || semAcento(p.name).includes(t) || (!!sala && semAcento(sala.nome).includes(t));
      if (!bate) return;
      if (sala && porSala.has(sala.id)) porSala.get(sala.id).push(p);
      else fora.push(p);
    });
    const ordenar = (a, b) => {
      if (a.id === selfId) return -1;
      if (b.id === selfId) return 1;
      return String(a.name).localeCompare(String(b.name));
    };
    const grupos = [];
    salas.forEach((s) => {
      const lista = porSala.get(s.id);
      if (lista.length) grupos.push({ sala: s, pessoas: lista.sort(ordenar) });
    });
    if (fora.length) grupos.push({ sala: null, pessoas: fora.sort(ordenar) });
    // Com busca, "sala livre" nao diz nada (a sala pode so nao ter batido com o termo).
    const vazias = t ? [] : salas.filter((s) => !porSala.get(s.id).length).map((s) => s.nome);
    return { grupos, vazias, total };
  }

  // Setas: a proxima pessoa (ou a anterior), sem sair das pontas.
  function mover(lista, atual, passo) {
    if (!lista.length) return null;
    const i = lista.indexOf(atual);
    if (i === -1) return passo > 0 ? lista[0] : lista[lista.length - 1];
    return lista[Math.max(0, Math.min(lista.length - 1, i + passo))];
  }

  // ------------------------------------------------------------ utilidades

  function salaDoMapa(p) {
    return OfficeMap.getRoomAt(p.displayX, p.displayY) || null;
  }

  function iniciais(nome) {
    return (nome || '?').trim().slice(0, 2).toUpperCase();
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  const ICONE = {
    acenar: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v7.5a6.5 6.5 0 0 1-6.5 6.5H11a5 5 0 0 1-5-5v-4a1.5 1.5 0 0 1 2.9-.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mensagem: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 6 5.6 7 7 0 0 1 13 5a7 7 0 0 1 7 7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  };

  // ------------------------------------------------------------ o aceno

  function acenar(id, botao) {
    return Network.acenarPara(id, (resp) => {
      retornoAceno.set(id, resp && resp.ok ? 'feito' : 'espera');
      if (botao) pintarBotaoAceno(botao, retornoAceno.get(id));
      setTimeout(() => {
        retornoAceno.delete(id);
        if (aberto) atualizar(true);
      }, RETORNO_DO_BOTAO_MS);
      if (aberto) atualizar(true);
    });
  }

  function pintarBotaoAceno(b, estado) {
    b.classList.toggle('feito', estado === 'feito');
    b.classList.toggle('espera', estado === 'espera');
    if (estado === 'feito') b.title = 'Aceno enviado';
    else if (estado === 'espera') b.title = 'Acabou de acenar - espere uns segundos';
  }

  function fecharAceno(de) {
    const e = acenosNaTela.get(de);
    if (e) e.remove();
    acenosNaTela.delete(de);
  }

  // Chegou um aceno: aviso na tela (o mesmo formato do lembrete de reuniao), o
  // boneco de quem acenou abana a mao aqui, e som/notificacao pelo avisos.js.
  function aoReceberAceno(data) {
    if (!data || !data.de) return;
    const p = Game.getPlayers().get(data.de);
    const nome = (p && p.name) || data.nome || 'Alguem';
    if (p) p.reacao = { emoji: '👋', expiresAt: performance.now() + 2200 };

    if (avisosEl) {
      fecharAceno(data.de);   // o mesmo aceno de novo substitui, nao empilha
      const aviso = el('div', 'lembrete aceno');
      aviso.setAttribute('role', 'status');
      aviso.appendChild(el('strong', 'lembrete-titulo', '👋 ' + nome));   // textContent: o nome vem de outra pessoa
      aviso.appendChild(el('span', 'lembrete-quando', 'acenou pra voce'));
      const ir = el('button', 'lembrete-entrar', 'Ir ate');
      ir.type = 'button';
      ir.addEventListener('click', () => { Game.irAte(data.de); fecharAceno(data.de); });
      const msg = el('button', 'lembrete-entrar lembrete-secundario', 'Mensagem');
      msg.type = 'button';
      msg.addEventListener('click', () => { Chat.abrirDm(data.de); fecharAceno(data.de); });
      const x = el('button', 'lembrete-fechar', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', 'Dispensar o aviso');
      x.addEventListener('click', () => fecharAceno(data.de));
      aviso.appendChild(ir);
      aviso.appendChild(msg);
      aviso.appendChild(x);
      avisosEl.appendChild(aviso);
      acenosNaTela.set(data.de, aviso);
      setTimeout(() => { if (acenosNaTela.get(data.de) === aviso) fecharAceno(data.de); }, ACENO_NA_TELA_MS);
    }
    // O uid vai junto pra central de avisos achar a pessoa depois (o id do socket muda a cada F5).
    if (window.Avisos && Avisos.avisar) Avisos.avisar(nome + ' acenou pra voce', 'Na sede', { tag: 'aceno:' + data.de, uid: p ? p.uid : null });
  }

  // ---------------------------------------------------- cartao de perfil
  function abrirCartao(id, clienteX, clienteY) {
    const p = Game.getPlayers().get(id);
    if (!p) return;
    idDoCartao = id;

    cartao.innerHTML = '';

    const topo = el('div', 'cartao-topo');
    const avatar = el('div', 'cartao-avatar', iniciais(p.name));
    avatar.style.background = (p.appearance && p.appearance.skin) || '#8b98a8';
    topo.appendChild(avatar);

    const info = document.createElement('div');
    const sala = salaDoMapa(p);
    info.appendChild(el('div', 'cartao-nome', (p.isAdmin ? '👑 ' : '') + p.name));
    info.appendChild(el('div', 'cartao-sub', (Game.STATUS_LABEL[p.status] || '') + ' · ' + (sala ? sala.nome : '-')));
    topo.appendChild(info);
    cartao.appendChild(topo);

    const acoes = el('div', 'cartao-acoes');

    const btnAcenar = el('button', 'btn btn-secundario btn-pequeno', '👋 Acenar');
    btnAcenar.type = 'button';
    btnAcenar.addEventListener('click', () => {
      acenar(id);
      fecharCartao();
    });
    acoes.appendChild(btnAcenar);

    const btnMensagem = el('button', 'btn btn-secundario btn-pequeno', '💬 Mensagem');
    btnMensagem.type = 'button';
    btnMensagem.addEventListener('click', () => {
      Chat.abrirDm(id);
      fecharCartao();
    });
    acoes.appendChild(btnMensagem);

    const btnIr = el('button', 'btn btn-primario btn-pequeno', 'Ir ate →');
    btnIr.type = 'button';
    btnIr.addEventListener('click', () => {
      Game.irAte(id);
      fecharCartao();
    });
    acoes.appendChild(btnIr);

    cartao.appendChild(acoes);

    // WhatsApp so aparece se a pessoa cadastrou o numero. Pedido na hora, um
    // cartao por vez: o numero nao anda na lista de gente (ver js/whatsapp.js).
    // Se o cartao ja trocou de pessoa quando a resposta chegar, nao poe nada.
    if (window.WhatsApp && p.uid && p.id !== Game.getSelfId()) {
      WhatsApp.numeroDe(p.uid).then((numero) => {
        if (!numero || idDoCartao !== id) return;
        const btnZap = el('button', 'btn btn-secundario btn-pequeno cartao-whatsapp', 'WhatsApp');
        btnZap.type = 'button';
        btnZap.title = 'Abrir conversa com ' + p.name + ' no WhatsApp';
        btnZap.addEventListener('click', () => {
          WhatsApp.chamar(numero);
          fecharCartao();
        });
        acoes.insertBefore(btnZap, btnIr);
      });
    }

    cartao.classList.remove('oculto');
    // mantem o cartao dentro da tela
    const largura = 226;
    const x = Math.min(Math.max(8, clienteX - largura / 2), window.innerWidth - largura - 8);
    const y = Math.min(clienteY + 14, window.innerHeight - 120);
    cartao.style.left = x + 'px';
    cartao.style.top = y + 'px';
  }

  function fecharCartao() {
    idDoCartao = null;
    cartao.classList.add('oculto');
  }

  // ------------------------------------------------------------ o painel

  function linhaDaPessoa(p, selfId) {
    const eu = p.id === selfId;
    const linha = el('div', 'pessoa-linha' + (eu ? ' pessoa-eu' : '') + (p.id === destacado ? ' destacada' : ''));
    linha.dataset.id = p.id;

    const avatar = el('span', 'pessoa-avatar', iniciais(p.name));
    avatar.style.background = (p.appearance && p.appearance.skin) || '#8b98a8';
    avatar.style.borderColor = Game.STATUS_COR[p.status] || Game.STATUS_COR.livre;
    linha.appendChild(avatar);

    const info = el('div', 'pessoa-info');
    const nome = el('span', 'pessoa-nome', (p.isAdmin ? '👑 ' : '') + p.name);
    if (eu) nome.appendChild(el('span', 'pessoa-voce', 'voce'));
    info.appendChild(nome);
    const extra = detalhe(p);
    const status = el('span', 'pessoa-status', (Game.STATUS_LABEL[p.status] || '') + (extra ? ' · ' + extra : ''));
    status.title = status.textContent;
    info.appendChild(status);
    linha.appendChild(info);

    if (!eu) {
      const acoes = el('div', 'pessoa-acoes');
      const bAcenar = el('button', 'pessoa-acao');
      bAcenar.type = 'button';
      bAcenar.dataset.acao = 'acenar';
      bAcenar.title = 'Acenar pra ' + p.name;
      bAcenar.setAttribute('aria-label', 'Acenar pra ' + p.name);
      bAcenar.innerHTML = ICONE.acenar;
      if (retornoAceno.has(p.id)) pintarBotaoAceno(bAcenar, retornoAceno.get(p.id));
      const bMsg = el('button', 'pessoa-acao');
      bMsg.type = 'button';
      bMsg.dataset.acao = 'mensagem';
      bMsg.title = 'Mensagem pra ' + p.name;
      bMsg.setAttribute('aria-label', 'Mensagem pra ' + p.name);
      bMsg.innerHTML = ICONE.mensagem;
      const bIr = el('button', 'pessoa-ir', 'Ir ate');
      bIr.type = 'button';
      bIr.dataset.acao = 'ir';
      bIr.title = 'Caminhar ate ' + p.name;
      acoes.appendChild(bAcenar);
      acoes.appendChild(bMsg);
      acoes.appendChild(bIr);
      linha.appendChild(acoes);
    }
    return linha;
  }

  // Redesenha so quando algo que aparece mudou: a cada meio segundo a lista e
  // recalculada (gente andando de sala em sala), mas refazer o HTML sem mudanca
  // tiraria o foco e o hover do botao que a pessoa ia clicar.
  function atualizar(forcar) {
    if (!aberto) return;
    const selfId = Game.getSelfId();
    const r = agrupar({
      pessoas: Array.from(Game.getPlayers().values()),
      salas: OfficeMap.ROOMS,
      salaDe: salaDoMapa,
      termo: buscaEl.value,
      selfId,
    });
    ordem = [];
    r.grupos.forEach((g) => g.pessoas.forEach((p) => { if (p.id !== selfId) ordem.push(p.id); }));
    if (destacado && !ordem.includes(destacado)) destacado = null;
    // Com busca, a primeira pessoa ja vem marcada: Ctrl+K, "ana", Enter.
    if (!destacado && buscaEl.value.trim() && ordem.length) destacado = ordem[0];

    const nova = JSON.stringify([
      r.grupos.map((g) => [g.sala && g.sala.id, g.pessoas.map((p) => [p.id, p.name, p.status, detalhe(p), p.isAdmin])]),
      r.vazias, r.total, destacado, Array.from(retornoAceno),
    ]);
    if (!forcar && nova === assinatura) return;
    assinatura = nova;

    contaEl.textContent = r.total === 1 ? '1 na sede' : r.total + ' na sede';
    listaEl.innerHTML = '';
    r.grupos.forEach((g) => {
      const grupo = el('section', 'pessoas-grupo');
      const cab = el('div', 'pessoas-sala');
      const ponto = el('span', 'pessoas-sala-ponto');
      ponto.style.background = (g.sala && g.sala.cor) || 'var(--texto-fraco)';
      cab.appendChild(ponto);
      cab.appendChild(el('span', 'pessoas-sala-nome', g.sala ? g.sala.nome : 'Pelos corredores'));
      cab.appendChild(el('span', 'pessoas-sala-conta', String(g.pessoas.length)));
      grupo.appendChild(cab);
      g.pessoas.forEach((p) => grupo.appendChild(linhaDaPessoa(p, selfId)));
      listaEl.appendChild(grupo);
    });
    if (!r.grupos.length) {
      listaEl.appendChild(el('p', 'pessoas-vazio', 'Ninguem com esse nome ou sala.'));
    } else if (r.total === 1 && !buscaEl.value.trim()) {
      listaEl.appendChild(el('p', 'pessoas-vazio', 'So voce na sede agora.'));
    }
    if (r.vazias.length) {
      listaEl.appendChild(el('p', 'pessoas-livres', 'Salas livres agora: ' + r.vazias.join(', ')));
    }
    const marcada = destacado && listaEl.querySelector('.destacada');
    if (marcada && marcada.scrollIntoView) marcada.scrollIntoView({ block: 'nearest' });
  }

  function agir(acao, id, botao) {
    if (acao === 'ir') {
      Game.irAte(id);
      fechar();   // no celular o painel cobre o mapa: fechar e ver a caminhada
    } else if (acao === 'mensagem') {
      Chat.abrirDm(id);   // o chat abre e o Paineis fecha este
    } else if (acao === 'acenar') {
      acenar(id, botao);
    }
  }

  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    if (window.Paineis) Paineis.abriu('pessoas');
    atualizar(true);
    clearInterval(intervalId);
    intervalId = setInterval(atualizar, 500);
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    clearInterval(intervalId);
    destacado = null;
    if (window.Paineis) Paineis.fechou('pessoas');
  }
  if (window.Paineis) Paineis.registrar('pessoas', { fechar, botao: 'btn-pessoas', esc: true });

  // Ctrl+K: abre (se preciso) e poe o cursor na busca, com o texto velho marcado.
  function buscar() {
    if (!aberto) {
      buscaEl.value = '';
      abrir();
    }
    buscaEl.focus();
    buscaEl.select();
  }

  function teclaNaBusca(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      destacado = mover(ordem, destacado, e.key === 'ArrowDown' ? 1 : -1);
      atualizar(true);
    } else if (e.key === 'Enter' && destacado) {
      e.preventDefault();
      agir('ir', destacado);
    } else if (e.key === 'Escape' && buscaEl.value) {
      // Primeiro Esc limpa a busca; o seguinte (campo vazio) o Paineis fecha.
      e.preventDefault();
      buscaEl.value = '';
      destacado = null;
      atualizar(true);
    }
  }

  function init() {
    cartao = document.getElementById('cartao-pessoa');
    painel = document.getElementById('painel-pessoas');
    buscaEl = document.getElementById('pessoas-busca');
    listaEl = document.getElementById('pessoas-lista');
    contaEl = document.getElementById('pessoas-conta');
    avisosEl = document.getElementById('lembretes-reuniao');

    document.getElementById('btn-pessoas').addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-pessoas').addEventListener('click', fechar);
    buscaEl.addEventListener('input', () => { destacado = null; atualizar(true); });
    buscaEl.addEventListener('keydown', teclaNaBusca);
    listaEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-acao]');
      const linha = b && b.closest('.pessoa-linha');
      if (linha) agir(b.dataset.acao, linha.dataset.id, b);
    });

    document.addEventListener('click', (e) => {
      if (!cartao.classList.contains('oculto') && !cartao.contains(e.target)) fecharCartao();
    }, true);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        buscar();
        return;
      }
      // Esc com o cartao aberto fecha so o cartao (o painel atras continua)
      if (e.key === 'Escape' && !cartao.classList.contains('oculto')) {
        e.preventDefault();
        fecharCartao();
      }
    });

    Network.on('aceno', aoReceberAceno);
  }

  window.Pessoas = {
    init, abrirCartao, buscar,
    // pro testes/pessoas.js
    _agrupar: agrupar, _detalhe: detalhe, _mover: mover,
  };
})();
