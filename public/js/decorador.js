// Decorador do escritorio, no formato do painel "Decorator" do Gather: busca,
// abas de categoria e grade de objetos. Decorar = escrever um tile na grade, o
// que ja resolve colisao e desenho. Ver docs/plano-decorador.md.
(function () {
  const M = () => OfficeMap;

  // As abas da referencia. Um item pode ser:
  //   { t }           - um tile de movel
  //   { t, w, h }     - peca grande: escreve varias celulas de uma vez
  //   { o }           - coisa apoiada em cima (camada de objetos)
  function construirCategorias() {
    const m = M();
    const O = m.OBJETOS;
    return [
      {
        // A mesa da referencia tem **duas fileiras**: o fundo (onde os monitores
        // apoiam) e a frente (com o gaveteiro). Por isso as pecas padrao sao 2
        // de altura - com 1 fileira so fica aquela mesinha estreita.
        id: 'mesas', nome: 'Mesas', icone: '🪟', itens: [
          { t: m.MESA, w: 2, h: 2, nome: 'Mesa 2x2' },
          { t: m.MESA, w: 3, h: 2, nome: 'Mesa grande 3x2' },
          { t: m.MESA, w: 4, h: 2, nome: 'Bancada 4x2' },
          { t: m.MESA, w: 6, h: 2, nome: 'Bancada longa 6x2' },
          { t: m.MESA_REUNIAO, w: 4, h: 3, nome: 'Mesa de reuniao 4x3' },
          { t: m.MESA, w: 2, h: 1, nome: 'Mesa rasa 2x1' },
          { t: m.MESA, nome: 'Mesa 1x1' },
          { t: m.BALCAO, w: 3, h: 1, nome: 'Balcao 3x1' },
          { t: m.MESA_CENTRO, nome: 'Mesa de centro' },
          { t: m.MESA_MONITOR, nome: 'Posto de trabalho' },
        ],
      },
      // ---- o que vai EM CIMA da mesa ----
      // `deMesa: true` = aba que quem tem mesa ve mesmo sem ser da diretoria.
      // Sao quatro pra caber sem virar uma lista de 37 sem fim.
      {
        id: 'emcima', nome: 'Computador', icone: '🖥️', deMesa: true, itens: [
          { o: O.MONITOR, giros: [O.MONITOR, O.MONITOR_LADO, O.MONITOR_COSTAS], nome: 'Monitor' },
          { o: O.MONITOR_DUPLO, nome: 'Dois monitores' },
          { o: O.MONITOR_ULTRAWIDE, nome: 'Monitor ultrawide' },
          { o: O.TORRE_PC, nome: 'PC com gabinete' },
          { o: O.SETUP_GAMER, nome: 'Setup gamer' },
          { o: O.NOTEBOOK, nome: 'Notebook' },
          { o: O.TABLET, nome: 'Tablet e caneta' },

          { o: O.TECLADO, nome: 'Teclado e mouse' },
          { o: O.TECLADO_GAMER, nome: 'Teclado colorido' },
          { o: O.HEADSET, nome: 'Headset no suporte' },
          { o: O.CAIXAS_SOM, nome: 'Caixas de som' },
          { o: O.WEBCAM, nome: 'Webcam' },
          { o: O.NENHUM, nome: 'Tirar da decoracao da casa', soAdmin: true },
        ],
      },
      {
        id: 'mesa-cafe', nome: 'Cafe e comida', icone: '☕', deMesa: true, itens: [
          { o: O.CANECA, nome: 'Caneca' },
          { o: O.COPO_CAFE, nome: 'Copo de cafe' },
          { o: O.CAFETEIRA, nome: 'Cafeteira' },
          { o: O.GARRAFA, nome: 'Garrafa de agua' },
          { o: O.DONUT, nome: 'Donut no pratinho' },
          { o: O.TIGELA, nome: 'Tigela de salada' },
          { o: O.POTE_BISCOITO, nome: 'Pote de biscoito' },
        ],
      },
      {
        id: 'mesa-papel', nome: 'Papelada', icone: '📒', deMesa: true, itens: [
          { o: O.PAPELADA, nome: 'Papelada' },
          { o: O.LIVROS, nome: 'Livros' },
          { o: O.CADERNO, nome: 'Caderno' },
          { o: O.PORTA_LAPIS, nome: 'Porta-lapis' },
          { o: O.CALENDARIO, nome: 'Calendario de mesa' },
          { o: O.POST_ITS, nome: 'Post-its' },
          { o: O.TELEFONE, nome: 'Telefone' },
        ],
      },
      {
        id: 'mesa-pessoal', nome: 'Coisas suas', icone: '🏆', deMesa: true, itens: [
          { o: O.PLANTINHA, nome: 'Plantinha' },
          { o: O.CACTINHO, nome: 'Cactinho' },
          { o: O.FLORES, nome: 'Flores' },
          { o: O.PORTA_RETRATO, nome: 'Porta-retrato' },
          { o: O.TROFEU, nome: 'Trofeu' },
          { o: O.BONECO, nome: 'Bonequinho' },
          { o: O.BOLA, nome: 'Bola' },
          { o: O.VELA, nome: 'Vela' },
          { o: O.LUMINARIA, nome: 'Luminaria' },
        ],
      },
      {
        // Cadeira e mesa existem em quatro tiles, um por direcao. Isso e
        // detalhe de desenho: na lista aparece UMA cadeira e UMA mesa, e a
        // pessoa gira com R ou com o selo no canto da celula. Ter as quatro na
        // era achar a mesma coisa quatro vezes pra descobrir qual olhava pro
        // lado certo.
        id: 'trabalho', nome: 'Cadeiras e mesas', icone: '🪑', itens: [
          { t: m.CADEIRA, giros: [m.CADEIRA, m.CADEIRA_DIR, m.CADEIRA_BAIXO, m.CADEIRA_ESQ], nome: 'Cadeira' },
          {
            t: m.CADEIRA_VERMELHA, nome: 'Cadeira vermelha',
            giros: [m.CADEIRA_VERMELHA, m.CADEIRA_VERMELHA_DIR, m.CADEIRA_VERMELHA_BAIXO, m.CADEIRA_VERMELHA_ESQ],
          },
          { t: m.POLTRONA, nome: 'Poltrona (senta)' },
          { t: m.PUFE, nome: 'Pufe (senta)' },
          { t: m.MESA_REDONDA, nome: 'Mesa redonda' },
          // A direcao da mesa e pro lado que olha quem senta nela - gire ate
          // casar com a cadeira que voce puser do lado. Todas vem vazias:
          // "posto de trabalho" e a que da pra reivindicar e personalizar; a
          // "mesa" comum e so movel.
          {
            t: m.MESA_MONITOR, nome: 'Posto (da pra pegar)',
            giros: [m.MESA_MONITOR, m.MESA_MONITOR_DIR, m.MESA_MONITOR_BAIXO, m.MESA_MONITOR_ESQ],
          },
          { t: m.MESA, giros: [m.MESA, m.MESA_DIR, m.MESA_BAIXO, m.MESA_ESQ], nome: 'Mesa' },
          { t: m.MESA_NOTEBOOK, nome: 'Mesa pronta (notebook)' },
          { t: m.IMPRESSORA, nome: 'Impressora' },
          { t: m.LOUSA, nome: 'Lousa' },
        ],
      },
      {
        id: 'decoracao', nome: 'Decoracao', icone: '🪴', itens: [
          { t: m.PLANTA, nome: 'Planta' },
          { t: m.PLANTA_GRANDE, nome: 'Planta grande' },
          { t: m.VASO_FLORES, nome: 'Vaso de flores' },
          { t: m.CACTO, nome: 'Cacto' },
          { t: m.QUADRO, nome: 'Quadro' },
          { t: m.RELOGIO, nome: 'Relogio' },
          { t: m.TV, nome: 'Televisao' },
          { t: m.CAVALETE, nome: 'Cavalete' },
          { t: m.CABIDE, nome: 'Cabide' },
          { t: m.GELADEIRA, nome: 'Geladeira' },
          { t: m.AQUARIO, nome: 'Aquario' },
          { t: m.LUMINARIA_PE, nome: 'Luminaria de pe' },
          { t: m.PORTA, nome: 'Porta' },
          { t: m.TAPETE, nome: 'Tapete' },
          { t: m.TAPETE_REDONDO, nome: 'Tapete redondo' },
        ],
      },
      {
        id: 'estar', nome: 'Estar', icone: '🛋️', itens: [
          // Um sofa so, que gira. Os dois tiles sao o mesmo sofa de frente ou
          // de costas - eram duas entradas na lista pra dizer isso, do mesmo
          // jeito que a cadeira tinha quatro.
          { t: m.SOFA_CIMA, giros: [m.SOFA_CIMA, m.SOFA_BAIXO], nome: 'Sofa' },
          { t: m.SOFA_CIMA, w: 2, h: 1, giros: [m.SOFA_CIMA, m.SOFA_BAIXO], nome: 'Sofa grande' },
          { t: m.BANCO, nome: 'Banco' },
          { t: m.ESTANTE, nome: 'Estante' },
          { t: m.ARMARIO, nome: 'Armario' },
          { t: m.BALCAO, nome: 'Balcao' },
          { t: m.BEBEDOURO, nome: 'Bebedouro' },
        ],
      },
      {
        id: 'estrutura', nome: 'Estrutura', icone: '🧱', itens: [
          { t: m.PAREDE, nome: 'Parede' },
          { t: m.JANELA, nome: 'Janela' },
          { t: m.CERCA, nome: 'Cerca' },
        ],
      },
      {
        id: 'externo', nome: 'Area externa', icone: '🌳', itens: [
          { t: m.ARVORE, nome: 'Arvore' },
          { t: m.ARBUSTO, nome: 'Arbusto' },
          { t: m.PEDRA, nome: 'Pedra' },
          { t: m.AGUA, nome: 'Agua' },
        ],
      },
      {
        id: 'apagar', nome: 'Borracha', icone: '🧽', itens: [
          { t: m.LIVRE, nome: 'Apagar (volta o chao)' },
        ],
      },
      // Nao e grade de objetos: e o editor de AREAS (public/js/areas.js) -
      // mover e redimensionar o retangulo de cada sala. So diretoria (nao tem
      // `deMesa`). Ver docs/areas.md.
      { id: 'areas', nome: 'Areas: mover e mudar o tamanho', icone: '📐', itens: [] },
    ];
  }

  // A aba de areas esta na tela? (e nao a busca, que mostra objetos)
  function modoAreas() {
    return aberto && souAdmin && abaAtual === 'areas' && !filtro.trim() && !!window.EditorAreas;
  }

  // Liga e desliga o editor de areas junto com a aba. Os dois modos de clique
  // (pintar objeto e arrastar area) nao convivem.
  function sincronizarAreas() {
    if (!window.EditorAreas) return;
    const quer = modoAreas();
    if (quer && !EditorAreas.estaAtivo()) {
      selecionado = null;
      modoLink = false;
      atualizarBotaoLink();
      EditorAreas.ligar(render);
    } else if (!quer && EditorAreas.estaAtivo()) {
      EditorAreas.desligar();
    }
  }

  // Montado uma vez so: o item selecionado e comparado por identidade.
  // Quem nao e da diretoria so ve a aba "Em cima da mesa": o resto e mobilia da
  // casa, que ele nao mexe.
  function soAbaDaMesa() {
    return !souAdmin;
  }

  // De que camada e essa celula. Decide pela CELULA, nao pelo cargo: a
  // diretoria tambem tem mesa, e o que ela poe na propria mesa e dela, nao
  // decoracao da casa. Fora da sua mesa, so a diretoria mexe.
  function ehMinhaMesa(col, row) {
    return Game.celulaEhMinha(col, row);
  }

  let CATEGORIAS = null;
  function categorias() {
    if (!CATEGORIAS) CATEGORIAS = construirCategorias();
    if (soAbaDaMesa()) return CATEGORIAS.filter((c) => c.deMesa);
    return CATEGORIAS;
  }

  let painel, gradeEl, buscaEl, abasEl;
  let souAdmin = false;
  // Sem ser da diretoria, o painel ainda abre pra quem tem mesa - so que
  // mostrando a aba "Em cima da mesa" e deixando pousar coisa **so na sua
  // mesa**. E o que faz a personalizacao ser da pessoa e nao da casa.
  let tenhoMesa = false;
  let aberto = false;
  let selecionado = null; // { t, nome }
  // Quantos quartos de volta a peca na mao levou. Zera a cada troca de item:
  // ninguem espera pegar uma cadeira e ela ja vir virada da vez passada.
  let giro = 0;
  let filtro = '';
  let abaAtual = 'mesas';
  const feitos = []; // pilha de desfazer: { c, r, de, para }
  const refazer = [];

  // ---------- desenho ----------

  function larguraDe(item) { return item.w || 1; }
  function alturaDe(item) { return item.h || 1; }
  function ehObjeto(item) { return item && item.o !== undefined; }

  // O id que vai ser pintado de verdade, ja com a rotacao aplicada. Quem nao
  // tem `giros` devolve o proprio id - a maioria das coisas nao gira.
  function idAtual(item) {
    if (!item) return 0;
    if (item.giros) return item.giros[giro % item.giros.length];
    return ehObjeto(item) ? item.o : item.t;
  }

  function podeGirar(item) { return !!(item && item.giros); }

  // Grade falsa do tamanho da peca (mais uma borda), pra funcao de desenho poder
  // olhar os vizinhos e as pecas grandes sairem emendadas na miniatura.
  function gradeFalsa(tile, w, h) {
    return Array.from({ length: h + 2 }, (_, r) => Array.from({ length: w + 2 }, (_, c) => (
      (r === 0 || c === 0 || r === h + 1 || c === w + 1) ? 0 : tile
    )));
  }

  // Miniatura. O jeito antigo desenhava a coisa na celula (0,0) de um quadrado
  // de 64 e torcia pra caber. Nao cabia: a arte de um monitor sobe ate y=-45,
  // ou seja, pra FORA da celula por cima, e o que aparecia na lista era a tira
  // de baixo da tela. Por isso os tres monitores viravam a mesma listinha azul.
  //
  // Agora a miniatura ENQUADRA: pergunta ao Game a caixa que a arte ocupa de
  // verdade e encaixa ela no quadrado, centrada e com uma folga. O item e
  // desenhado num tile 3x maior que o do mapa, senao a arte fina de 128
  // unidades chega borrada ao ampliar.
  // A arte dos itens e desenhada numa malha fina fixa (128 unidades = 32px de
  // mundo), entao NAO adianta pedir um tile maior pra ganhar detalhe: o que
  // amplia e a escala do contexto, em vizinho-mais-proximo. Que e o certo pra
  // pixel art de qualquer jeito.
  const MINI = 132;          // resolucao interna do quadradinho

  function desenharItem(canvas, item) {
    canvas.width = MINI;
    canvas.height = MINI;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Sem fundo: na referencia a arte flutua no branco do painel. O piso
    // quadriculado que ficava atras era ruido puro atras de uma coisa pequena,
    // e ainda mudava de tom de celula pra celula.

    // O item na mao mostra a rotacao em que esta; os outros, a de fabrica.
    const id = item === selecionado ? idAtual(item) : (ehObjeto(item) ? item.o : item.t);

    if (ehObjeto(item)) {
      if (!id) { riscoDeBorracha(ctx, MINI); return; }
      const TILE = M().TILE;
      enquadrar(ctx, Game.caixaDoItem(id), TILE, () => {
        Game.desenharApoiado(ctx, 0, 0, id, TILE);
      });
      return;
    }
    if (id === M().LIVRE) { riscoDeBorracha(ctx, MINI); return; }

    // movel: a peca ocupa celulas inteiras, entao a caixa e a propria peca
    const TILE = M().TILE;
    const w = larguraDe(item);
    const h = alturaDe(item);
    const grade = gradeFalsa(id, w, h);
    const caixa = { x0: 0, y0: 0, x1: w * 128, y1: h * 128 };
    enquadrar(ctx, caixa, TILE, () => {
      ctx.save();
      ctx.translate(-TILE, -TILE); // a grade falsa tem uma borda de folga
      for (let r = 1; r <= h; r++) {
        for (let c = 1; c <= w; c++) {
          Game.desenharObjeto(ctx, c, r, id, TILE, grade);
        }
      }
      ctx.restore();
    });
  }

  // Escala e centraliza `caixa` (em unidades finas de 128 por tile) dentro do
  // quadradinho, e chama `pintar` com a transformacao ja aplicada.
  function enquadrar(ctx, caixa, TILE, pintar) {
    const u = TILE / 128;
    const cw = Math.max(1, (caixa.x1 - caixa.x0) * u);
    const ch = Math.max(1, (caixa.y1 - caixa.y0) * u);
    const escala = (MINI * 0.84) / Math.max(cw, ch);
    ctx.save();
    ctx.translate(MINI / 2, MINI / 2);
    ctx.scale(escala, escala);
    ctx.translate(-(caixa.x0 * u + cw / 2), -(caixa.y0 * u + ch / 2));
    pintar();
    ctx.restore();
  }

  function riscoDeBorracha(ctx, TILE) {
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = Math.max(3, TILE / 14);
    ctx.beginPath();
    ctx.moveTo(7, 7); ctx.lineTo(TILE - 7, TILE - 7);
    ctx.moveTo(TILE - 7, 7); ctx.lineTo(7, TILE - 7);
    ctx.stroke();
  }

  // Previa translucida sob o cursor. Escreve na grade so pelo tempo do desenho:
  // assim a peca ja aparece emendada com os vizinhos, igual ao resultado.
  function desenharPreviaNoMapa(ctx, col, row, TILE, x, y) {
    if (!selecionado) return;

    if (ehObjeto(selecionado)) {
      if (!idAtual(selecionado)) return;
      // Na sua mesa a previa segue o cursor de verdade (posicao livre); na
      // camada da casa ela encaixa na celula.
      if (ehMinhaMesa(col, row) && x !== undefined) {
        Game.desenharApoiado(ctx, x, y, idAtual(selecionado), TILE, M().tiles, true);
      } else {
        Game.desenharApoiado(ctx, col, row, idAtual(selecionado), TILE, M().tiles);
      }
      return;
    }
    if (idAtual(selecionado) === M().LIVRE) return; // borracha nao mostra nada

    const tiles = M().tiles;
    const antes = [];
    celulasDa(col, row).forEach(([c, r, t]) => {
      if (!tiles[r] || tiles[r][c] === undefined) return;
      antes.push([c, r, tiles[r][c], t]);
      tiles[r][c] = t;
    });
    antes.forEach(([c, r, , t]) => Game.desenharObjeto(ctx, c, r, t, TILE, tiles));
    antes.forEach(([c, r, valor]) => { tiles[r][c] = valor; });
  }

  // Celulas que a peca ocupa a partir do canto sob o cursor.
  // [coluna, linha, tile] de cada celula que a peca ocupa.
  function celulasDa(col, row) {
    const lista = [];
    for (let dr = 0; dr < alturaDe(selecionado); dr++) {
      for (let dc = 0; dc < larguraDe(selecionado); dc++) {
        lista.push([col + dc, row + dr, idAtual(selecionado)]);
      }
    }
    return lista;
  }

  // ---------- catalogo ----------

  function itensVisiveis() {
    const termo = filtro.trim().toLowerCase();
    if (termo) {
      return categorias()
        .flatMap((c) => c.itens)
        .filter((i) => (souAdmin || !i.soAdmin) && i.nome.toLowerCase().includes(termo));
    }
    const cat = categorias().find((c) => c.id === abaAtual);
    // Itens marcados `soAdmin` (a borracha da casa) nao aparecem pra quem so
    // decora a propria mesa - ali quem tira e o "Excluir" da coisa selecionada.
    return cat ? cat.itens.filter((i) => souAdmin || !i.soAdmin) : [];
  }

  function renderAbas() {
    abasEl.innerHTML = '';
    categorias().forEach((cat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'decor-aba' + (cat.id === abaAtual && !filtro ? ' ativa' : '');
      b.textContent = cat.icone;
      b.title = cat.nome;
      b.addEventListener('click', () => {
        abaAtual = cat.id;
        filtro = '';
        buscaEl.value = '';
        render();
      });
      abasEl.appendChild(b);
    });
  }

  function renderGrade() {
    gradeEl.innerHTML = '';
    const areas = modoAreas();
    gradeEl.classList.toggle('decor-grade-areas', areas);
    if (areas) {
      EditorAreas.renderPainel(gradeEl);
      return;
    }
    const itens = itensVisiveis();
    if (!itens.length) {
      const vazio = document.createElement('p');
      vazio.className = 'decor-vazio';
      vazio.textContent = 'Nada com esse nome.';
      gradeEl.appendChild(vazio);
      return;
    }
    // A celula segue o painel do Gather (referencias/42-decorator-mesas.png):
    // so a arte, grande, sem legenda embaixo e sem caixa em volta. O nome vira
    // tooltip - com a arte deste tamanho, ler o nome de cada um so atrapalhava.
    itens.forEach((item) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'decor-item' + (selecionado === item ? ' ativa' : '');
      b.title = item.nome;

      const canvas = document.createElement('canvas');
      desenharItem(canvas, item);
      b.appendChild(canvas);

      // O selo de girar, no canto de cima a direita, como na referencia: quem
      // gira avisa que gira, sem precisar selecionar antes pra descobrir.
      if (podeGirar(item)) {
        const selo = document.createElement('span');
        selo.className = 'decor-girar';
        selo.title = 'Girar (R)';
        selo.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12">'
          + '<path d="M20 11.5a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
          + '<path d="M20 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        selo.addEventListener('click', (e) => {
          e.stopPropagation();   // girar nao e escolher: nao pode largar a peca
          giro = (selecionado === item) ? giro + 1 : 1;
          selecionado = item;
          render();
        });
        b.appendChild(selo);
      }

      b.addEventListener('click', () => {
        selecionado = (selecionado === item) ? null : item;
        giro = 0;   // peca nova vem sempre na posicao de fabrica
        render();
      });
      gradeEl.appendChild(b);
    });
  }

  // Um quarto de volta. A ordem dos `giros` e horaria: cima, direita, baixo,
  // esquerda - girar tem que dar a volta pro mesmo lado sempre, senao a pessoa
  // nao consegue prever onde vai parar.
  function girar() {
    if (!podeGirar(selecionado)) return;
    giro = (giro + 1) % selecionado.giros.length;
    render();
  }

  function render() {
    sincronizarAreas();
    renderAbas();
    renderGrade();
    const dica = document.getElementById('decor-dica');
    if (modoAreas()) {
      dica.textContent = EditorAreas.dica();
      return;
    }
    // Com um item de apoiar na mao a dica muda: e o unico caso em que existe
    // um lugar certo pra clicar (a malha verde), e nao adianta descobrir isso
    // no erro.
    const gira = podeGirar(selecionado) ? ' R gira.' : '';
    dica.textContent = !selecionado
      ? 'Escolha um objeto e clique no escritorio.'
      : ehObjeto(selecionado)
        ? 'Coloque "' + selecionado.nome + '" em cima de uma mesa - a malha verde mostra onde da.' + gira
        : 'Clique no mapa pra colocar "' + selecionado.nome + '". Esc pra soltar.' + gira;
  }

  // ---------- edicao ----------

  // Modo "link no objeto": o clique no mapa deixa de pintar e passa a pendurar
  // conteudo no movel. Ver docs/plano-conteudo.md.
  //
  // E um modo separado, e nao mais um item da grade, porque a acao e de outra
  // natureza: pintar escreve um tile e pronto, pendurar link abre formulario e
  // precisa saber o que JA tem naquela celula.
  let modoLink = false;

  function estaPintando() {
    return aberto && !!selecionado && !modoLink;
  }

  function noModoLink() {
    return aberto && souAdmin && modoLink;
  }

  function alternarModoLink() {
    modoLink = !modoLink;
    if (modoLink) selecionado = null;   // os dois modos nao convivem
    if (modoLink && abaAtual === 'areas') abaAtual = 'mesas';
    atualizarBotaoLink();
    render();
  }

  function atualizarBotaoLink() {
    const b = document.getElementById('decor-link');
    if (!b) return;
    b.classList.toggle('ativo', modoLink);
    b.classList.toggle('oculto', !souAdmin);
    const dica = document.getElementById('decor-dica');
    if (modoLink && dica) dica.textContent = 'Clique num movel do mapa pra pendurar (ou tirar) um link nele.';
  }

  function temGenteEm(col, row) {
    const TILE = M().TILE;
    let ocupado = false;
    Game.getPlayers().forEach((pl) => {
      if (Math.floor(pl.x / TILE) === col && Math.floor(pl.y / TILE) === row) ocupado = true;
    });
    return ocupado;
  }

  function podeColocarEm(col, row, x, y) {
    const m = M();
    if (ehObjeto(selecionado)) {
      // Apoiar em cima nao depende de gente - depende de ter em que apoiar.
      // A regra e a mesma do servidor: so vale em SUPERFICIES, que sao
      // exatamente as celulas que a malha verde acende.
      if (!m.objetos[row] || m.objetos[row][col] === undefined) return false;
      if (idAtual(selecionado) && !m.SUPERFICIES.has(m.tiles[row][col])) return false;
      // Na sua mesa vale pra qualquer um; fora dela, so a diretoria. E a mesma
      // regra que o servidor aplica nos dois eventos.
      //
      // Na propria mesa nao ha "ja tem isso aqui": a coisa pousa onde voce
      // clicar, e podem conviver varias na mesma celula. A borracha nao vale
      // aqui - pra tirar da SUA mesa voce clica na coisa e usa "Excluir", que
      // acerta qual e em vez de chutar a mais proxima.
      // A malha verde ja desenha so o tampo; aqui a regra bate com ela e com a
      // do servidor, pra nao existir ponto que acende e recusa em silencio.
      if (ehMinhaMesa(col, row)) {
        if (!idAtual(selecionado)) return false;
        return x === undefined || M().noTampo(x, y);
      }
      // Mesa dos outros e fora do alcance de todo mundo, inclusive da diretoria:
      // quem poe coisa em cima de uma mesa e quem senta nela.
      if (m.MESAS_DE_TRABALHO.has(m.tiles[row][col])) return false;
      if (!souAdmin) return false;
      return m.objetos[row][col] !== idAtual(selecionado);
    }
    // peca grande: todas as celulas tem que caber e estar livres de gente
    return celulasDa(col, row).every(([c, r, t]) => (
      m.tiles[r] && m.tiles[r][c] !== undefined
      && (t === m.LIVRE || !temGenteEm(c, r))
    )) && celulasDa(col, row).some(([c, r, t]) => m.tiles[r][c] !== t);
  }

  function pintarEm(col, row, x, y) {
    if (!estaPintando() || !podeColocarEm(col, row, x, y)) return;
    const m = M();
    refazer.length = 0;

    if (ehObjeto(selecionado)) {
      if (ehMinhaMesa(col, row)) {
        // Posicao livre: o desfazer guarda o ponto, nao a celula.
        const px = x === undefined ? col + 0.5 : x;
        const py = y === undefined ? row + 0.5 : y;
        feitos.push({ obj: true, minha: true, x: px, y: py, para: idAtual(selecionado) });
        Network.itemNaMinhaMesa(px, py, idAtual(selecionado));
        return;
      }
      feitos.push({ obj: true, c: col, r: row, de: m.objetos[row][col], para: idAtual(selecionado) });
      Network.editarObjetoMapa(col, row, idAtual(selecionado));
      return;
    }

    // Uma peca grande vira um passo so no desfazer.
    const passo = { celulas: [] };
    celulasDa(col, row).forEach(([c, r, t]) => {
      if (m.tiles[r][c] === t) return;
      passo.celulas.push({ c, r, de: m.tiles[r][c], para: t });
      Network.editarMapa(c, r, t);
    });
    if (passo.celulas.length) feitos.push(passo);
  }

  function aplicar(passo, voltando) {
    if (passo.obj) {
      // O passo lembra de que camada veio: a sua mesa ou a decoracao da casa.
      // Na mesa, desfazer e tirar de volta o que foi posto naquele ponto; nao
      // existe "valor anterior", porque varias coisas convivem no mesmo lugar.
      if (passo.minha) {
        Network.itemNaMinhaMesa(passo.x, passo.y, voltando ? 0 : passo.para);
        return;
      }
      Network.editarObjetoMapa(passo.c, passo.r, voltando ? passo.de : passo.para);
      return;
    }
    passo.celulas.forEach((cel) => {
      Network.editarMapa(cel.c, cel.r, voltando ? cel.de : cel.para);
    });
  }

  function desfazer() {
    const ultimo = feitos.pop();
    if (!ultimo) return;
    refazer.push(ultimo);
    aplicar(ultimo, true);
  }

  function refazerUltimo() {
    const passo = refazer.pop();
    if (!passo) return;
    feitos.push(passo);
    aplicar(passo, false);
  }

  // ---------- abrir/fechar ----------

  function abrir() {
    if (!souAdmin && !tenhoMesa) return;
    aberto = true;
    painel.classList.remove('oculto');
    // O botao marcado (o "Decorar" ou, pra diretoria, o "Diretoria") quem pinta e o Paineis.
    if (window.Paineis) Paineis.abriu('decorador');
    render();
  }

  function fechar() {
    aberto = false;
    selecionado = null;
    modoLink = false;
    if (window.EditorAreas && EditorAreas.estaAtivo()) EditorAreas.desligar();
    atualizarBotaoLink();
    painel.classList.add('oculto');
    // Se o painel foi aberto pela plantinha do cartao, a camera ficou colada na
    // mesa. Fechar aqui e o fim daquele passeio.
    Game.soltarFoco();
    if (window.Paineis) Paineis.fechou('decorador');
  }
  if (window.Paineis) Paineis.registrar('decorador', { fechar, botao: 'btn-decorar', esc: false });

  function init(ehAdmin) {
    souAdmin = !!ehAdmin;
    painel = document.getElementById('painel-decorador');
    gradeEl = document.getElementById('decor-grade');
    buscaEl = document.getElementById('decor-busca');
    abasEl = document.getElementById('decor-abas');

    const botao = document.getElementById('btn-decorar');
    const titulo = document.getElementById('decor-titulo');
    const botaoLink = document.getElementById('decor-link');
    if (botaoLink) botaoLink.addEventListener('click', alternarModoLink);
    atualizarBotaoLink();

    // A diretoria decora a casa toda; quem tem mesa decora a propria. Quem nao
    // e nem uma coisa nem outra nao ve o botao (o servidor recusa de qualquer
    // jeito - o botao escondido e so conforto).
    //
    // A diretoria abre o decorador pelo painel Diretoria (js/diretoria.js): no
    // trilho, este botao fica so pra quem personaliza a propria mesa, e o botao
    // marcado com o decorador aberto passa a ser o "Diretoria".
    if (souAdmin && window.Paineis) Paineis.registrar('decorador', { fechar, botao: 'btn-diretoria', esc: false });
    function atualizarBotao() {
      const podeAbrir = souAdmin || tenhoMesa;
      botao.classList.toggle('oculto', souAdmin || !tenhoMesa);
      botao.title = souAdmin ? 'Decorar o escritorio' : 'Personalizar a minha mesa';
      if (titulo) titulo.textContent = souAdmin ? 'Decorador' : 'Minha mesa';
      // Perdeu a mesa com o painel aberto: fecha, senao ficaria um painel que
      // nao deixa fazer nada.
      if (!podeAbrir && aberto) fechar();
      if (aberto) render();
    }

    Game.aoMudarMinhaMesa((tem) => {
      tenhoMesa = tem;
      atualizarBotao();
    });
    atualizarBotao();

    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-decorador').addEventListener('click', fechar);
    document.getElementById('decor-desfazer').addEventListener('click', desfazer);
    document.getElementById('decor-refazer').addEventListener('click', refazerUltimo);

    buscaEl.addEventListener('input', () => {
      filtro = buscaEl.value;
      render();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window.EditorAreas && EditorAreas.cancelar()) return;
      if (e.key === 'Escape' && selecionado) {
        selecionado = null;
        render();
        return;
      }
      // digitando na busca, R e a letra R
      const digitando = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if (!digitando && (e.key === 'r' || e.key === 'R') && podeGirar(selecionado)) {
        girar();
      }
    });
  }

  // true quando o item na mao e de apoiar em cima de movel - e quando faz
  // sentido mostrar a malha das superficies.
  function pintandoEmCima() {
    return estaPintando() && ehObjeto(selecionado) && !!idAtual(selecionado);
  }

  // Atalho do menu da mesa: abre ja na aba certa, com a busca limpa, pra quem
  // clicou em "Personalizar" nao cair numa aba de parede.
  function abrirEmCima() {
    abaAtual = 'emcima';
    filtro = '';
    if (buscaEl) buscaEl.value = '';
    abrir();
  }

  window.Decorador = {
    init, abrir, estaPintando, pintarEm, podeColocarEm, desenharPreviaNoMapa, pintandoEmCima,
    abrirEmCima, noModoLink,
  };
})();
