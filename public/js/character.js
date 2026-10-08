// Boneco com sprites LPC (Liberated Pixel Cup - CC-BY-SA/GPL/OGA-BY, ver ASSETS_CREDITS.md)
// compostos em camadas (corpo, roupa, cabelo) e recoloridos por canvas para dar as
// opcoes de personalizacao (tom de pele, cor da camisa, cor do cabelo).
(function () {
  const SKIN_TONES = ['#ffe0bd', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5a3825'];
  // paletas no espirito do editor do Gather: poucas opcoes de pele, muitas de
  // cabelo e uma paleta cheia pras roupas
  const HAIR_COLORS = [
    '#ffffff', '#2b3038', '#d2683a', '#a8642e', '#9a8b4a', '#f0c65a',
    '#a03028', '#ef8a2a', '#f0609a', '#b06ad8', '#45c3ee', '#3aa050',
  ];
  const ROUPA_COLORS = [
    '#e03a3a', '#f0862a', '#f5c518', '#6b8c3a', '#3aa84a', '#1f7a6a',
    '#35bdf0', '#6a7ce0', '#9a5cd0', '#e83ab5', '#f06aa0', '#b06a3a',
    '#e8d4b0', '#ffffff', '#9aa0ad', '#2b2f38',
  ];
  const SHIRT_COLORS = ROUPA_COLORS;
  // O cabelo ja tinha formas, mas num formato proprio (uma lista de nomes
  // mais um `careca` tratado a parte). Virou o mesmo formato das roupas: uma
  // peca com arquivo, e `arq: null` no careca - a mesma coisa que "sem
  // jaqueta". Um jeito so de descrever peca, um jeito so de desenhar.
  const CABELOS = [
    { id: 'careca', nome: 'Careca', arq: null },
    { id: 'curto', nome: 'Curto', arq: 'hair_curto.png' },
    { id: 'raspado', nome: 'Raspado', arq: 'hair_raspado.png' },
    { id: 'espetado', nome: 'Espetado', arq: 'hair_espetado.png' },
    { id: 'cacheado', nome: 'Cacheado', arq: 'hair_cacheado.png' },
    { id: 'afro', nome: 'Afro', arq: 'hair_afro.png' },
    { id: 'dread', nome: 'Dreads', arq: 'hair_dread.png' },
    { id: 'pixie', nome: 'Pixie', arq: 'hair_pixie.png' },
    { id: 'chanel', nome: 'Chanel', arq: 'hair_chanel.png' },
    { id: 'longo', nome: 'Longo', arq: 'hair_longo.png' },
    { id: 'moicano', nome: 'Moicano', arq: 'hair_moicano.png' },
    { id: 'franja', nome: 'Franja', arq: 'hair_franja.png' },
    { id: 'bagunca', nome: 'Bagunca', arq: 'hair_bagunca.png' },
    { id: 'topete', nome: 'Topete', arq: 'hair_topete.png' },
    { id: 'trancinhas', nome: 'Trancinhas', arq: 'hair_trancinhas.png' },
    { id: 'twists', nome: 'Twists', arq: 'hair_twists.png' },
    { id: 'chanel_reto', nome: 'Chanel reto', arq: 'hair_chanel_reto.png' },
    { id: 'longo_messy', nome: 'Longo solto', arq: 'hair_longo_messy.png' },
    { id: 'cachos', nome: 'Cachos', arq: 'hair_cachos.png' },
    // Estes tem DUAS folhas: `arqAtras` vai atras do corpo (o volume que cai
    // nas costas) e `arq` na frente. E assim que o LPC monta cabelo comprido -
    // sem isso, so dava pra usar os penteados que cabem todos na frente.
    { id: 'ondulado', nome: 'Ondulado', arq: 'hair_ondulado_fg.png', arqAtras: 'hair_ondulado_bg.png' },
    { id: 'tranca', nome: 'Tranca', arq: 'hair_tranca_fg.png', arqAtras: 'hair_tranca_bg.png' },
    { id: 'rabo', nome: 'Rabo de cavalo', arq: 'hair_rabo_fg.png', arqAtras: 'hair_rabo_bg.png' },
  ];
  // Camada do pescoco - fica por cima da camisa e por baixo da cabeca.
  const PESCOCOS = [
    { id: 'nenhum', nome: 'Nada', arq: null },
    { id: 'gravata', nome: 'Gravata', arq: 'neck_gravata.png' },
    { id: 'lenco', nome: 'Lenco', arq: 'neck_lenco.png' },
  ];
  const SAPATOS = [
    { id: 'tenis', nome: 'Tenis', arq: 'feet.png' },
    { id: 'sandalia', nome: 'Sandalia', arq: 'pes_sandalia.png' },
    { id: 'bota', nome: 'Bota', arq: 'pes_bota.png' },
    { id: 'pantufa', nome: 'Pantufa', arq: 'pes_pantufa.png' },
    { id: 'descalco', nome: 'Descalco', arq: null },
  ];

  // As FORMAS de roupa. Cada uma e uma spritesheet LPC propria (576x256, as
  // mesmas 4 direcoes x 9 quadros das outras camadas) - e por isso que da pra
  // trocar a forma, e nao so a cor. `arq: null` = camada desligada.
  //
  // Ver assets/lpc/CREDITS.md: cada arquivo tem autor e licenca proprios.
  const TOPS = [
    { id: 'camiseta', nome: 'Camiseta', arq: 'torso.png' },
    { id: 'vneck', nome: 'Gola V', arq: 'top_vneck.png' },
    { id: 'polo', nome: 'Polo', arq: 'top_polo.png' },
    { id: 'regata', nome: 'Regata', arq: 'top_regata.png' },
    { id: 'manga', nome: 'Manga longa', arq: 'top_manga.png' },
    { id: 'social', nome: 'Social', arq: 'top_social.png' },
    { id: 'gola', nome: 'Gola careca', arq: 'top_gola.png' },
  ];
  const JAQUETAS = [
    { id: 'nenhuma', nome: 'Sem jaqueta', arq: null },
    { id: 'blazer', nome: 'Blazer', arq: 'jaqueta_blazer.png' },
    { id: 'cardigan', nome: 'Cardigan', arq: 'jaqueta_cardigan.png' },
    { id: 'sobretudo', nome: 'Sobretudo', arq: 'jaqueta_sobretudo.png' },
  ];
  const BOTTOMS = [
    { id: 'calca', nome: 'Calca', arq: 'legs.png' },
    { id: 'social', nome: 'Calca social', arq: 'baixo_social.png' },
    { id: 'bermuda', nome: 'Bermuda', arq: 'baixo_bermuda.png' },
    { id: 'saia', nome: 'Saia', arq: 'baixo_saia.png' },
    { id: 'legging', nome: 'Legging', arq: 'baixo_legging.png' },
    { id: 'dobrada', nome: 'Calca dobrada', arq: 'baixo_dobrada.png' },
  ];
  const BARBAS = [
    { id: 'nenhuma', nome: 'Sem barba', arq: null },
    { id: 'bigode', nome: 'Bigode', arq: 'barba_bigode.png' },
    { id: 'curta', nome: 'Barba', arq: 'barba_curta.png' },
    { id: 'chevron', nome: 'Chevron', arq: 'barba_chevron.png' },
    { id: 'cheia', nome: 'Barba cheia', arq: 'barba_cheia.png' },
  ];
  const CHAPEUS = [
    { id: 'nenhum', nome: 'Sem chapeu', arq: null },
    { id: 'bandana', nome: 'Bandana', arq: 'chapeu_bandana.png' },
    { id: 'bone', nome: 'Bone', arq: 'chapeu_bone.png' },
    { id: 'coco', nome: 'Chapeu coco', arq: 'chapeu_coco.png' },
    { id: 'faixa', nome: 'Faixa', arq: 'chapeu_faixa.png' },
  ];

  const ids = (lista) => lista.map((peca) => peca.id);
  const acha = (lista, id) => lista.find((peca) => peca.id === id) || lista[0];

  // Mantido porque outros arquivos ja pediam essa lista pelo nome antigo.
  const HAIR_STYLES = ids(CABELOS);

  const PADROES = {
    skin: '#f1c27d',
    shirt: '#35bdf0',
    bottom: '#6a7ce0',
    shoes: '#2b2f38',
    hairColor: '#2b3038',
    hairStyle: 'curto',
    glassesColor: '#2b3038',
    topStyle: 'camiseta',
    jaqueta: 'nenhuma',
    jaquetaColor: '#2b2f38',
    bottomStyle: 'calca',
    barba: 'nenhuma',
    chapeu: 'nenhum',
    chapeuColor: '#e03a3a',
    shoesStyle: 'tenis',
    pescoco: 'nenhum',
    pescocoColor: '#a03028',
  };

  // Perfis antigos (salvos no navegador antes de existirem calca/sapato/cor de
  // oculos) caem nos padroes em vez de quebrar o desenho.
  function resolver(a) {
    const ap = a || {};
    return {
      skin: ap.skin || PADROES.skin,
      shirt: ap.shirt || PADROES.shirt,
      bottom: ap.bottom || PADROES.bottom,
      shoes: ap.shoes || PADROES.shoes,
      hairColor: ap.hairColor || PADROES.hairColor,
      hairStyle: acha(CABELOS, ap.hairStyle).id,
      glasses: !!ap.glasses,
      glassesColor: ap.glassesColor || PADROES.glassesColor,
      // formas novas: perfil salvo antes delas existirem cai no padrao, que e
      // o que `acha` faz quando nao reconhece o id
      topStyle: acha(TOPS, ap.topStyle).id,
      jaqueta: acha(JAQUETAS, ap.jaqueta).id,
      jaquetaColor: ap.jaquetaColor || PADROES.jaquetaColor,
      bottomStyle: acha(BOTTOMS, ap.bottomStyle).id,
      barba: acha(BARBAS, ap.barba).id,
      chapeu: acha(CHAPEUS, ap.chapeu).id,
      chapeuColor: ap.chapeuColor || PADROES.chapeuColor,
      shoesStyle: acha(SAPATOS, ap.shoesStyle).id,
      pescoco: acha(PESCOCOS, ap.pescoco).id,
      pescocoColor: ap.pescocoColor || PADROES.pescocoColor,
    };
  }

  const FRAME = 64;
  const SHEET_W = FRAME * 9;
  const SHEET_H = FRAME * 4;
  const ROW_POR_DIR = { up: 0, left: 1, down: 2, right: 3 };
  // pes do personagem dentro do quadro 64x64 (medido nos sprites originais)
  const PE_X = 32, PE_Y = 61;

  const ASSET_BASE = 'assets/lpc/';

  // A chave da peca no mapa de imagens sai do nome do arquivo, entao duas
  // formas que apontem pro mesmo PNG compartilham a imagem carregada.
  function chaveDaPeca(peca) { return 'peca_' + peca.arq.replace('.png', ''); }

  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomAppearance() {
    return {
      skin: randomOf(SKIN_TONES),
      shirt: randomOf(ROUPA_COLORS),
      bottom: randomOf(ROUPA_COLORS),
      shoes: randomOf(ROUPA_COLORS),
      hairColor: randomOf(HAIR_COLORS),
      hairStyle: randomOf(ids(CABELOS)),
      glasses: Math.random() < 0.5,
      glassesColor: randomOf(ROUPA_COLORS),
      topStyle: randomOf(ids(TOPS)),
      jaqueta: randomOf(ids(JAQUETAS)),
      jaquetaColor: randomOf(ROUPA_COLORS),
      bottomStyle: randomOf(ids(BOTTOMS)),
      barba: randomOf(ids(BARBAS)),
      chapeu: randomOf(ids(CHAPEUS)),
      chapeuColor: randomOf(ROUPA_COLORS),
      shoesStyle: randomOf(ids(SAPATOS)),
      pescoco: randomOf(ids(PESCOCOS)),
      pescocoColor: randomOf(ROUPA_COLORS),
    };
  }

  function carregarImagem(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  const imagens = {};
  const ready = (async () => {
    const nomes = {
      body: 'body.png',
      head: 'head.png',
      legs: 'legs.png',
      feet: 'feet.png',
      torso: 'torso.png',
      glasses: 'glasses.png',
    };
    // uma entrada por forma. A opcao "sem" (careca, descalco, sem jaqueta)
    // nao tem arquivo e nao carrega nada.
    [].concat(TOPS, JAQUETAS, BOTTOMS, BARBAS, CHAPEUS, CABELOS, SAPATOS, PESCOCOS).forEach((peca) => {
      if (peca.arq) nomes[chaveDaPeca(peca)] = peca.arq;
      if (peca.arqAtras) nomes['peca_' + peca.arqAtras.replace('.png', '')] = peca.arqAtras;
    });
    const entradas = Object.entries(nomes);
    const carregadas = await Promise.all(entradas.map(([, arq]) => carregarImagem(ASSET_BASE + arq)));
    entradas.forEach(([chave], i) => { imagens[chave] = carregadas[i]; });
  })();

  // Recolore uma spritesheet preservando sombra/luz (canvas blend "color" + mascara de alpha original).
  function recolorir(img, corAlvo) {
    if (!img) return null;   // camada desligada, ou folha ainda carregando
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = corAlvo;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  const cacheSprites = new Map();

  function chaveAparencia(a) {
    return [
      a.skin, a.shirt, a.bottom, a.shoes, a.hairColor, a.hairStyle,
      a.glasses ? 1 : 0, a.glassesColor,
      a.topStyle, a.jaqueta, a.jaquetaColor, a.bottomStyle, a.barba,
      a.chapeu, a.chapeuColor, a.shoesStyle, a.pescoco, a.pescocoColor,
    ].join('|');
  }

  // Monta (e guarda em cache) a spritesheet 576x256 final de um jogador, com todas
  // as camadas ja compostas e recoloridas.
  function getSpriteSheet(aparenciaCrua) {
    const appearance = resolver(aparenciaCrua);
    const chave = chaveAparencia(appearance);
    if (cacheSprites.has(chave)) return cacheSprites.get(chave);

    // a folha da forma escolhida em cada slot; null quando a camada esta off
    const folhaDe = (lista, id) => {
      const peca = acha(lista, id);
      return peca.arq ? imagens[chaveDaPeca(peca)] : null;
    };

    const corpoR = recolorir(imagens.body, appearance.skin);
    const cabecaR = recolorir(imagens.head, appearance.skin);
    const torsoR = recolorir(folhaDe(TOPS, appearance.topStyle), appearance.shirt);
    const pernasR = recolorir(folhaDe(BOTTOMS, appearance.bottomStyle), appearance.bottom);
    const pesR = recolorir(folhaDe(SAPATOS, appearance.shoesStyle), appearance.shoes);
    const jaquetaR = recolorir(folhaDe(JAQUETAS, appearance.jaqueta), appearance.jaquetaColor);
    const barbaImg = folhaDe(BARBAS, appearance.barba);
    const chapeuR = recolorir(folhaDe(CHAPEUS, appearance.chapeu), appearance.chapeuColor);
    const pescocoR = recolorir(folhaDe(PESCOCOS, appearance.pescoco), appearance.pescocoColor);

    const cabelo = acha(CABELOS, appearance.hairStyle);
    const cabeloAtrasR = cabelo.arqAtras
      ? recolorir(imagens['peca_' + cabelo.arqAtras.replace('.png', '')], appearance.hairColor)
      : null;

    const out = document.createElement('canvas');
    out.width = SHEET_W;
    out.height = SHEET_H;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // A ordem e a de vestir: corpo, calca, sapato, camisa, jaqueta por cima da
    // camisa, cabeca, barba, oculos, cabelo, e o chapeu por ultimo de todos.
    const por = (img) => { if (img) ctx.drawImage(img, 0, 0); };
    por(cabeloAtrasR);   // o cabelo que cai nas costas fica ATRAS do corpo
    por(corpoR);
    por(pernasR);
    por(pesR);
    por(torsoR);
    por(pescocoR);   // a gravata cai sobre a camisa, sob a jaqueta
    por(jaquetaR);
    por(cabecaR);
    // barba acompanha a cor do cabelo: ninguem espera escolher as duas
    if (barbaImg) por(recolorir(barbaImg, appearance.hairColor));
    if (appearance.glasses) por(recolorir(imagens.glasses, appearance.glassesColor));
    por(recolorir(folhaDe(CABELOS, appearance.hairStyle), appearance.hairColor));
    por(chapeuR);

    cacheSprites.set(chave, out);
    return out;
  }

  // Desenha o personagem centrado em (x, y), com y sendo o ponto dos pes.
  // opts: { dir: 'down'|'up'|'left'|'right', moving: bool, walkTime: seconds, scale }
  function draw(ctx, x, y, appearance, opts) {
    if (!imagens.body) return; // sprites ainda carregando

    const dir = (opts && opts.dir) || 'down';
    const moving = !!(opts && opts.moving);
    const t = (opts && opts.walkTime) || 0;
    const escala = (opts && opts.scale) || 0.72;

    const sheet = getSpriteSheet(appearance);
    const row = ROW_POR_DIR[dir] != null ? ROW_POR_DIR[dir] : 2;
    const col = moving ? 1 + Math.floor((t * 9) % 8) : 0;

    const larguraDestino = FRAME * escala;
    const alturaDestino = FRAME * escala;
    const destX = x - PE_X * escala;
    const destY = y - PE_Y * escala;

    // sombra no chao
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheet,
      col * FRAME, row * FRAME, FRAME, FRAME,
      destX, destY, larguraDestino, alturaDestino
    );
  }

  window.Character = {
    SKIN_TONES,
    SHIRT_COLORS,
    ROUPA_COLORS,
    HAIR_COLORS,
    HAIR_STYLES,
    CABELOS,
    SAPATOS,
    PESCOCOS,
    TOPS,
    JAQUETAS,
    BOTTOMS,
    BARBAS,
    CHAPEUS,
    PADROES,
    resolver,
    randomAppearance,
    draw,
    ready,
  };
})();
