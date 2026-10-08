// Spotify de cada um, flutuando no escritorio.
//
// O PEDIDO: "cada um tivesse o seu e logasse na sua conta e escutasse suas musicas" -
// depois "da pra ficar um pop-up no escritorio?" e, entre as opcoes, "3": o mini-player
// no escritorio E o Spotify completo da pessoa a um clique.
//
// O QUE DA E O QUE NAO DA
// O site completo do Spotify (a biblioteca, as curtidas, a busca de cada um) se recusa a
// abrir DENTRO de outro site, e um player com a biblioteca de cada conta so sai pela API
// deles - que desde fev/2026 aceita no maximo 5 pessoas por app (docs/plano-trilho.md).
// Entao sao duas coisas, lado a lado:
//
//   - o MINI-PLAYER no canto do escritorio: o player incorporado oficial
//     (open.spotify.com/embed). Toca as playlists, albuns e podcasts que a pessoa colar
//     (ficam guardados pra conta dela, neste navegador). Musica inteira pra quem e
//     Premium e esta logado no Spotify neste navegador; sem isso, a previa de 30 s;
//   - "ABRIR MEU SPOTIFY COMPLETO": o site do Spotify numa janela ao lado
//     (js/janela.js), onde a pessoa entra na conta dela e tem tudo, gratis ou Premium.
//
// Minimizar nao para a musica (o player continua na pagina); o X fecha e para.
//
// SEGURANCA: o endereco do player e montado AQUI, so com tipo e id conferidos; nome e
// capa vem do servidor (server/spotify.js), e a capa so vale se for do i.scdn.co - o
// unico endereco de imagem de fora que a CSP deixa.
(function () {
  const URL_SPOTIFY = 'https://open.spotify.com/';
  const JANELA = 'spotify-sede';
  const TIPOS = { playlist: 'Playlist', album: 'Album', track: 'Musica', episode: 'Episodio', show: 'Podcast', artist: 'Artista' };
  const CAPA = /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/;
  const MAX_SALVOS = 8;
  const PREFIXO = 'spotify:';

  let caixa, playerEl, menuEl, menuItensEl, tirarEl, formEl, linkEl, erroEl;
  let botao, atualEl, nomeEl, tipoEl, capaEl;
  let salvos = { itens: [], atual: 0 };
  let dono = null;
  let iframe = null;

  // ------------------------------------------------------ as regras (puras)
  // testes/spotify.js exercita.

  // "https://open.spotify.com/intl-pt/playlist/<id>?si=..." ou "spotify:playlist:<id>"
  // -> { tipo, id } | { erro }
  function lerLink(texto) {
    const t = String(texto || '').trim();
    if (!t) return { erro: 'Cole o link de uma playlist, album, musica ou podcast do Spotify.' };
    if (/spotify\.link\//i.test(t)) {
      return { erro: 'Esse e o link curto do celular: abra ele no navegador e copie o endereco que aparecer (open.spotify.com/...).' };
    }
    if (/\/collection\/|:collection/i.test(t)) {
      return { erro: 'As Musicas Curtidas nao tocam fora do Spotify. Ponha elas numa playlist e cole o link da playlist - ou abra o seu Spotify completo.' };
    }
    const tipos = Object.keys(TIPOS).join('|');
    const m = new RegExp('^https?://open\\.spotify\\.com/(?:intl-[a-z-]+/)?(?:embed/)?(' + tipos + ')/([A-Za-z0-9]{22})(?:[/?#].*)?$').exec(t)
      || new RegExp('^spotify:(' + tipos + '):([A-Za-z0-9]{22})$').exec(t);
    if (!m) return { erro: 'Nao reconheci esse link. No Spotify: Compartilhar > Copiar link da playlist, album, musica ou podcast.' };
    return { tipo: m[1], id: m[2] };
  }

  function urlDoPlayer(item) {
    return URL_SPOTIFY + 'embed/' + item.tipo + '/' + item.id + '?utm_source=generator';
  }

  // Poe no topo (sem repetir) e fica com os ultimos MAX_SALVOS. O que ja tinha nome
  // e capa continua com eles.
  function acrescentar(itens, item) {
    const antigo = itens.find((x) => x.tipo === item.tipo && x.id === item.id);
    const sem = itens.filter((x) => x !== antigo);
    return [Object.assign({}, antigo || {}, item)].concat(sem).slice(0, MAX_SALVOS);
  }

  // O que veio do navegador (localStorage) passa de novo pela regra: um valor mexido la
  // nao vira iframe nem imagem de outro lugar.
  function limparItem(x) {
    const r = lerLink('spotify:' + (x && x.tipo) + ':' + (x && x.id));
    if (r.erro) return null;
    return {
      tipo: r.tipo,
      id: r.id,
      titulo: x && typeof x.titulo === 'string' && x.titulo.trim() ? x.titulo.slice(0, 120) : null,
      capa: x && CAPA.test(String(x.capa || '')) ? x.capa : null,
    };
  }

  // O lugar do mini-player (a pessoa arrasta pra onde quiser) e guardado como FRACAO do
  // espaco livre: 0 = encostado a esquerda/em cima, 1 = a direita/embaixo. Assim ele fica
  // no mesmo canto quando a janela muda de tamanho ou quando o player abre e minimiza.
  const MARGEM = 8;
  function paraPixels(lugar, livreX, livreY) {
    return {
      x: MARGEM + Math.round(lugar.fx * Math.max(0, livreX)),
      y: MARGEM + Math.round(lugar.fy * Math.max(0, livreY)),
    };
  }
  function paraFracao(x, y, livreX, livreY) {
    const fracao = (v, livre) => (livre > 0 ? Math.min(1, Math.max(0, (v - MARGEM) / livre)) : 0);
    return { fx: fracao(x, livreX), fy: fracao(y, livreY) };
  }
  function lugarValido(l) {
    return !!l && typeof l === 'object' && Number.isFinite(l.fx) && Number.isFinite(l.fy)
      && l.fx >= 0 && l.fx <= 1 && l.fy >= 0 && l.fy <= 1;
  }

  // ------------------------------------------------------------ guardado
  function meuUid() {
    return window.Game && Game.getSelfUid ? Game.getSelfUid() : null;
  }

  function carregar() {
    const uid = meuUid();
    if (uid === dono) return;
    dono = uid;
    salvos = { itens: [], atual: 0 };
    if (!uid) return;
    try {
      const bruto = JSON.parse(localStorage.getItem(PREFIXO + uid) || 'null');
      if (bruto && Array.isArray(bruto.itens)) {
        const itens = bruto.itens.map(limparItem).filter(Boolean).slice(0, MAX_SALVOS);
        salvos = { itens, atual: Math.min(Math.max(0, Number(bruto.atual) || 0), Math.max(0, itens.length - 1)) };
      }
    } catch (e) { /* sem storage: so nao lembra */ }
  }

  function gravar() {
    if (!dono) return;
    try { localStorage.setItem(PREFIXO + dono, JSON.stringify(salvos)); } catch (e) { /* so nao lembra */ }
  }

  // Nome e capa, pelo servidor (server/spotify.js). Sem resposta, fica o tipo.
  async function buscarNome(item) {
    if (!item || item.titulo) return;
    try {
      const r = await fetch('/api/spotify/' + item.tipo + '/' + item.id, { credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json();
      const alvo = salvos.itens.find((x) => x.tipo === item.tipo && x.id === item.id);
      if (!alvo) return;   // saiu da lista enquanto isso
      alvo.titulo = typeof d.titulo === 'string' && d.titulo.trim() ? d.titulo.slice(0, 120) : null;
      alvo.capa = CAPA.test(String(d.capa || '')) ? d.capa : null;
      gravar();
      pintar();
    } catch (e) { /* sem rede: fica o tipo */ }
  }

  // ------------------------------------------------------------ na tela
  const itemAtual = () => salvos.itens[salvos.atual] || null;
  const nomeDe = (item) => (item.titulo || TIPOS[item.tipo] || 'Spotify');

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function capaOuNota(item, classe) {
    if (item && item.capa) {
      const img = el('img', classe);
      img.src = item.capa;
      img.alt = '';
      img.width = 28;
      img.height = 28;
      return img;
    }
    const nota = el('span', classe + ' spotify-sem-capa', '♪');
    nota.setAttribute('aria-hidden', 'true');
    return nota;
  }

  function pintar() {
    const item = itemAtual();
    caixa.classList.toggle('vazio', !item);
    nomeEl.textContent = item ? nomeDe(item) : 'Sua musica';
    tipoEl.textContent = item ? (TIPOS[item.tipo] || 'Spotify') : 'Cole um link do Spotify';
    if (item && item.capa) {
      capaEl.src = item.capa;
      capaEl.classList.remove('oculto');
    } else {
      capaEl.removeAttribute('src');
      capaEl.classList.add('oculto');
    }
    atualEl.title = item ? 'Trocar ou adicionar musica' : '';

    menuItensEl.innerHTML = '';
    salvos.itens.forEach((x, i) => {
      const b = el('button', 'spotify-menu-item' + (i === salvos.atual ? ' atual' : ''));
      b.type = 'button';
      b.dataset.indice = String(i);
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', i === salvos.atual ? 'true' : 'false');
      b.appendChild(capaOuNota(x, 'spotify-menu-capa'));
      const txt = el('span', 'spotify-menu-texto');
      txt.appendChild(el('span', 'spotify-menu-nome', nomeDe(x)));   // textContent: vem do Spotify
      txt.appendChild(el('span', 'spotify-menu-tipo', TIPOS[x.tipo] || 'Spotify'));
      b.appendChild(txt);
      menuItensEl.appendChild(b);
    });
    tirarEl.classList.toggle('oculto', !item);
    aplicarLugar();
  }

  function tocarAtual() {
    const item = itemAtual();
    if (!item) {
      if (iframe) { iframe.remove(); iframe = null; }
      return;
    }
    const src = urlDoPlayer(item);
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.title = 'Player do Spotify';
      iframe.width = '100%';
      iframe.height = '152';
      // encrypted-media: sem isto o Spotify so toca a previa de 30 s.
      iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
      iframe.setAttribute('frameborder', '0');
      playerEl.appendChild(iframe);
    }
    if (iframe.getAttribute('src') !== src) iframe.setAttribute('src', src);
  }

  function mostrarErro(texto) {
    erroEl.textContent = texto || '';
    erroEl.classList.toggle('oculto', !texto);
  }

  function menuAberto() { return !menuEl.classList.contains('oculto'); }
  function fecharMenu() {
    menuEl.classList.add('oculto');
    atualEl.setAttribute('aria-expanded', 'false');
    aplicarLugar();
  }
  function abrirMenu() {
    menuEl.classList.remove('oculto');
    atualEl.setAttribute('aria-expanded', 'true');
    aplicarLugar();
  }

  function mostrarForm(sim) {
    caixa.classList.toggle('adicionando', !!sim);
    mostrarErro('');
    if (sim) { fecharMenu(); linkEl.focus(); }
    aplicarLugar();
  }

  function estado() {
    if (caixa.classList.contains('oculto')) return 'fechado';
    return caixa.classList.contains('minimizado') ? 'minimizado' : 'aberto';
  }

  function pintarBotao() {
    if (botao) botao.classList.toggle('ativo', estado() !== 'fechado');
  }

  function abrir() {
    carregar();
    caixa.classList.remove('oculto', 'minimizado');
    pintar();
    tocarAtual();
    if (!itemAtual()) mostrarForm(true);
    salvos.itens.forEach(buscarNome);
    aplicarLugar();
    pintarBotao();
  }

  // Vira uma pilula no canto; o player continua na pagina, entao a musica continua.
  function minimizar() {
    fecharMenu();
    caixa.classList.remove('adicionando');
    caixa.classList.add('minimizado');
    aplicarLugar();
    pintarBotao();
  }

  // Botao do trilho: fechado ou minimizado -> abre; aberto -> minimiza.
  function alternar() {
    if (estado() === 'aberto') minimizar();
    else abrir();
  }

  // X: fecha e para (o player sai da pagina).
  function fechar() {
    fecharMenu();
    caixa.classList.add('oculto');
    caixa.classList.remove('minimizado', 'adicionando');
    if (iframe) { iframe.remove(); iframe = null; }
    pintarBotao();
  }

  function adicionar(ev) {
    ev.preventDefault();
    const r = lerLink(linkEl.value);
    if (r.erro) return mostrarErro(r.erro);
    salvos = { itens: acrescentar(salvos.itens, r), atual: 0 };
    gravar();
    linkEl.value = '';
    mostrarForm(false);
    pintar();
    tocarAtual();
    buscarNome(salvos.itens[0]);
  }

  function escolher(i) {
    if (!salvos.itens[i]) return;
    salvos.atual = i;
    gravar();
    fecharMenu();
    pintar();
    tocarAtual();
  }

  function tirarAtual() {
    salvos.itens.splice(salvos.atual, 1);
    salvos.atual = 0;
    gravar();
    fecharMenu();
    pintar();
    tocarAtual();
    if (!itemAtual()) mostrarForm(true);
  }

  // O Spotify completo da pessoa (biblioteca, curtidas, busca), numa janela ao lado.
  function abrirCompleto() {
    const ok = JanelaAoLado.abrir(URL_SPOTIFY, { nome: JANELA, largura: 0.3, maxLargura: 460, altura: 0.62, embaixo: true });
    if (!ok) JanelaAoLado.avisarBloqueio('Spotify');
    return ok;
  }

  // ------------------------------------------------------------ arrastar
  // Pelo topo (ou pela alca de pontinhos). Clique curto no nome continua abrindo o menu:
  // so vira arraste depois de 5 px. No celular fica fixo em cima da barra (CSS).
  const CHAVE_LUGAR = 'spotify:lugar';   // do navegador, nao da conta: e sobre esta tela
  let topoEl, alcaEl, cantoEl;
  let lugar = null;                       // { fx, fy } | null = o canto de baixo, do CSS
  let arraste = null;
  let acabouDeArrastar = false;

  function noCelular() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  }

  // O espaco em que ele pode andar: a area do escritorio menos o trilho da esquerda
  // (encostado nele, o Spotify cobriria os botoes).
  function espacoLivre() {
    const pai = caixa.offsetParent || document.body;
    const trilho = document.querySelector('.trilho');
    const esq = trilho ? Math.max(0, Math.round(trilho.getBoundingClientRect().right - pai.getBoundingClientRect().left)) : 0;
    return {
      pai,
      esq,
      livreX: pai.clientWidth - esq - caixa.offsetWidth - 2 * MARGEM,
      livreY: pai.clientHeight - caixa.offsetHeight - 2 * MARGEM,
    };
  }

  function aplicarLugar() {
    if (!caixa) return;
    const solto = !!lugar && !noCelular();
    caixa.classList.toggle('solto', solto);
    if (cantoEl) cantoEl.classList.toggle('oculto', !lugar);
    if (!solto || caixa.classList.contains('oculto')) {
      caixa.style.left = caixa.style.top = caixa.style.right = caixa.style.bottom = '';
      return;
    }
    const { esq, livreX, livreY } = espacoLivre();
    const p = paraPixels(lugar, livreX, livreY);
    caixa.style.left = (esq + p.x) + 'px';
    caixa.style.top = p.y + 'px';
    caixa.style.right = 'auto';
    caixa.style.bottom = 'auto';
  }

  function gravarLugar() {
    try {
      if (lugar) localStorage.setItem(CHAVE_LUGAR, JSON.stringify(lugar));
      else localStorage.removeItem(CHAVE_LUGAR);
    } catch (e) { /* so nao lembra */ }
  }

  function voltarProCanto() {
    lugar = null;
    gravarLugar();
    fecharMenu();
    aplicarLugar();
  }

  function comecarArraste(ev) {
    if (noCelular() || ev.button !== 0 || ev.target.closest('.spotify-icone')) return;
    const r = caixa.getBoundingClientRect();
    arraste = { id: ev.pointerId, ox: ev.clientX, oy: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, moveu: false };
    // Na janela toda, e nao so no topo: um puxao rapido sai de cima do topo no primeiro
    // movimento, e o arraste se perdia.
    window.addEventListener('pointermove', arrastar);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  function arrastar(ev) {
    if (!arraste || ev.pointerId !== arraste.id) return;
    if (!arraste.moveu) {
      if (Math.hypot(ev.clientX - arraste.ox, ev.clientY - arraste.oy) < 5) return;
      arraste.moveu = true;
      caixa.classList.add('arrastando');
      fecharMenu();
    }
    const { pai, esq, livreX, livreY } = espacoLivre();
    const base = pai.getBoundingClientRect();
    lugar = paraFracao(ev.clientX - base.left - esq - arraste.dx, ev.clientY - base.top - arraste.dy, livreX, livreY);
    aplicarLugar();
  }

  function soltar(ev) {
    if (!arraste || ev.pointerId !== arraste.id) return;
    window.removeEventListener('pointermove', arrastar);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    if (arraste.moveu) {
      caixa.classList.remove('arrastando');
      gravarLugar();
      // o clique que vem logo depois do soltar nao abre o menu
      acabouDeArrastar = true;
      setTimeout(() => { acabouDeArrastar = false; }, 0);
    }
    arraste = null;
  }

  // Teclado: com a alca em foco, as setas movem e o Home volta pro canto.
  function moverComTeclado(ev) {
    const passo = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (ev.key === 'Home') { ev.preventDefault(); voltarProCanto(); return; }
    if (!passo || noCelular()) return;
    ev.preventDefault();
    const { livreX, livreY } = espacoLivre();
    const atual = lugar || { fx: 1, fy: 1 };
    const agora = paraPixels(atual, livreX, livreY);
    lugar = paraFracao(agora.x + passo[0] * 24, agora.y + passo[1] * 24, livreX, livreY);
    gravarLugar();
    aplicarLugar();
  }

  function init() {
    caixa = document.getElementById('spotify-mini');
    botao = document.getElementById('btn-spotify');
    if (!caixa || !botao) return;
    playerEl = document.getElementById('spotify-player');
    menuEl = document.getElementById('spotify-menu');
    menuItensEl = document.getElementById('spotify-menu-itens');
    tirarEl = document.getElementById('spotify-tirar');
    formEl = document.getElementById('spotify-form');
    linkEl = document.getElementById('spotify-link');
    erroEl = document.getElementById('spotify-erro');
    atualEl = document.getElementById('spotify-atual');
    nomeEl = document.getElementById('spotify-nome');
    tipoEl = document.getElementById('spotify-tipo');
    capaEl = document.getElementById('spotify-capa');
    topoEl = caixa.querySelector('.spotify-topo');
    alcaEl = document.getElementById('spotify-alca');
    cantoEl = document.getElementById('spotify-canto');

    try {
      const l = JSON.parse(localStorage.getItem(CHAVE_LUGAR) || 'null');
      if (lugarValido(l)) lugar = { fx: l.fx, fy: l.fy };
    } catch (e) { /* sem storage: fica no canto */ }
    topoEl.addEventListener('pointerdown', comecarArraste);
    alcaEl.addEventListener('keydown', moverComTeclado);
    alcaEl.addEventListener('dblclick', voltarProCanto);
    cantoEl.addEventListener('click', voltarProCanto);
    window.addEventListener('resize', aplicarLugar);

    botao.addEventListener('click', alternar);
    document.getElementById('spotify-minimizar').addEventListener('click', minimizar);
    document.getElementById('spotify-fechar').addEventListener('click', fechar);
    document.getElementById('spotify-completo').addEventListener('click', abrirCompleto);
    document.getElementById('spotify-cancelar').addEventListener('click', () => mostrarForm(false));
    document.getElementById('spotify-adicionar').addEventListener('click', () => mostrarForm(true));
    tirarEl.addEventListener('click', tirarAtual);
    formEl.addEventListener('submit', adicionar);

    atualEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (acabouDeArrastar) return;   // era o fim de um arraste, nao um clique
      if (estado() === 'minimizado') abrir();
      else if (!itemAtual()) mostrarForm(true);
      else if (menuAberto()) fecharMenu();
      else abrirMenu();
    });
    menuItensEl.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-indice]');
      if (b) escolher(Number(b.dataset.indice));
    });
    document.addEventListener('click', (ev) => {
      if (menuAberto() && !menuEl.contains(ev.target)) fecharMenu();
    });
    caixa.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (menuAberto()) { ev.preventDefault(); fecharMenu(); atualEl.focus(); }
      else if (caixa.classList.contains('adicionando') && itemAtual()) { ev.preventDefault(); mostrarForm(false); }
    });
  }

  window.Spotify = {
    init, alternar, fechar, abrirCompleto, URL: URL_SPOTIFY, JANELA,
    // pro testes/spotify.js
    _lerLink: lerLink, _urlDoPlayer: urlDoPlayer, _acrescentar: acrescentar, _limparItem: limparItem,
    _paraPixels: paraPixels, _paraFracao: paraFracao, _lugarValido: lugarValido,
  };
})();
