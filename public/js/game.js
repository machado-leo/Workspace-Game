// Loop principal do jogo: mapa, movimento, multiplayer e chamada por proximidade.
(function () {
  const SPEED = 150; // px/s

  // ---- WASD e o modo kart -------------------------------------------------
  // Segurando Shift o boneco acelera e passa a ter INERCIA: a velocidade deixa
  // de virar na hora e e arrastada pra direcao nova. E isso, e so isso, que da
  // a sensacao de drift - nao ha fisica de pneu nenhuma aqui, e uma velocidade
  // que demora pra mudar de ideia.
  const SPEED_KART = 320;      // px/s no talo
  const ACEL_KART = 1100;      // px/s2
  const ATRITO_KART = 2.6;     // por segundo: o quanto a velocidade morre sozinha
  const POEIRA_MAX = 40;

  // O KART APARECENDO E SUMINDO
  // Estes tres numeros sao a animacao inteira. Nenhum estado liga/desliga: o
  // kart tem um valor de 0 a 1 que persegue o alvo, e todo o resto (tamanho,
  // opacidade, o boneco sentando) sai desse mesmo valor. Por isso soltar o
  // Shift no meio da entrada nao da tranco - o valor so muda de destino.
  const KART_ENTRA = 7;   // por segundo: quao rapido ele materializa
  const KART_SAI = 5;     //              e quao rapido ele evapora
  const KART_GIRO = 11;   // por segundo: o chassi perseguindo a direcao pedida

  // Angulo de cada direcao do boneco. O kart nasce ja apontando pra ela, senao
  // ele surgiria virado pra direita e giraria sozinho no primeiro quadro.
  const ANG_DIR = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  // Caminho mais curto no circulo. Sem isto, virar de 170 pra -170 graus faz o
  // kart dar a volta inteira ao contrario em vez de cruzar os 180.
  function aproximarAngulo(atual, alvo, f) {
    let d = alvo - atual;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return atual + d * f;
  }

  const teclas = new Set();
  const poeira = [];   // rastro de derrapagem: { x, y, vida }

  // Nao mover o boneco enquanto a pessoa DIGITA. Sem isto, escrever "was" no
  // chat faz o avatar sair andando pela sede.
  function digitando() {
    const a = document.activeElement;
    if (!a) return false;
    const t = (a.tagName || '').toLowerCase();
    return t === 'input' || t === 'textarea' || a.isContentEditable;
  }

  window.addEventListener('keydown', (e) => {
    if (digitando()) return;
    teclas.add(e.code);
    // as setas rolam a pagina; W A S D nao, entao so estas precisam de freio
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => teclas.delete(e.code));
  // Perder o foco da janela com tecla apertada deixava o boneco andando sozinho
  // pra sempre, porque o keyup acontecia fora da pagina.
  window.addEventListener('blur', () => teclas.clear());
  // 10 envios por segundo, e nao 22. O movimento e o maior gasto de trafego da
  // sede: cada pacote vai pra TODO mundo online, e hospedagem cobra por GB. Quem
  // olha nao percebe - interpolarRemotos anda o boneco na velocidade estimada
  // entre um pacote e outro, e fica ate mais liso que antes.
  const MOVE_SEND_INTERVAL = 100; // ms
  // Resolucao interna do mapa: cada tile de 32 e desenhado em 128 pixels de
  // verdade. E o que da espaco pra detalhe (moldura de monitor, trama da
  // cadeira, brilho de 1px) em vez de blocao.
  const RENDER_SCALE = 4;
  let escalaDoMapa = RENDER_SCALE; // vira 2 ou 1 se o canvas 4x nao couber

  let ctx, canvas, mapCanvas;
  let players = new Map();
  let selfId = null; // id da conexao: muda a cada recarregar
  let selfUid = null; // id da pessoa: sobrevive ao recarregar (usado nas DMs)
  let lastFrameTime = 0;
  let lastMoveSent = 0;
  let localWalkTime = 0;
  let lastSentState = { x: null, y: null, dir: null, moving: null };

  const STATUS_ORDEM = ['livre', 'focado', 'reuniao'];
  // 'ligacao' fica FORA do ciclo do botao de status: quem marca e o discador,
  // enquanto a pessoa fala com um cliente (js/discador.js), e ele mesmo devolve
  // o status de antes. Pro resto da sede e um status como os outros.
  const STATUS_VALIDOS = STATUS_ORDEM.concat('ligacao');
  const STATUS_LABEL = { livre: 'Livre', focado: 'Focado', reuniao: 'Em reuniao', ligacao: 'Em ligacao' };
  const STATUS_COR = { livre: '#63d9c4', focado: '#ffb454', reuniao: '#e0607e', ligacao: '#8f7cff' };

  // Uma mesa e um movel inteiro, com varias celulas - por isso as duas colecoes:
  // `mesas` guarda uma entrada por MESA (pra placa sair uma vez so) e
  // `mesaPorCelula` responde "que mesa e essa daqui" pro clique e pro hover.
  let mesas = new Map();       // chave da mesa -> { chave, celulas, donoUid, donoNome }
  let mesaPorCelula = new Map(); // "col,row" -> a mesma mesa
  // Lista de { o, x, y } com x/y em tiles COM FRACAO. Camada separada da
  // decoracao da diretoria (OfficeMap.objetos): sao as coisas que o dono pos na
  // propria mesa, e ele escolhe o lugar exato de cada uma.
  let itensDeMesa = [];
  let mesaHover = null;        // a mesa sob o cursor
  let celulaAlvo = null;       // { col, row } sob o cursor enquanto decora

  // Quem quer saber se eu tenho mesa. E uma LISTA: o menu da conta e o
  // decorador escutam os dois, e com um slot so o segundo apagava o primeiro.
  const ouvintesDaMinhaMesa = [];

  function aplicarMesas(lista) {
    mesas = new Map((lista || []).map((m) => [m.chave, m]));
    mesaPorCelula = new Map();
    const itensAntes = chaveDosItens();
    itensDeMesa = [];
    mesas.forEach((m) => {
      (m.celulas || []).forEach(([c, r]) => mesaPorCelula.set(c + ',' + r, m));
      (m.itens || []).forEach((it) => itensDeMesa.push(it));
    });
    const tenho = Boolean(minhaMesa());
    ouvintesDaMinhaMesa.forEach((fn) => fn(tenho));

    if (esperandoMesa) {
      const m = mesaPorCelula.get(esperandoMesa.col + ',' + esperandoMesa.row);
      if (m) CartaoMesa.abrir(m, esperandoMesa.telaX, esperandoMesa.telaY);
      esperandoMesa = null;
    }

    // O mapa e pre-renderizado, entao so vale redesenhar quando as coisas em
    // cima das mesas realmente mudaram (reivindicar mesa nao mexe no desenho).
    if (chaveDosItens() !== itensAntes) prerenderMap();
  }

  function chaveDosItens() {
    return itensDeMesa.map((it) => it.o + '@' + it.x + ',' + it.y).sort().join('|');
  }

  // Uma celula e da minha mesa? (o painel so deixa pousar coisa nelas)
  function celulaEhMinha(col, row) {
    const m = mesaPorCelula.get(col + ',' + row);
    return Boolean(m && m.donoUid && m.donoUid === selfUid);
  }

  // Qual coisa esta debaixo desse ponto. Testa o desenho de verdade e prefere a
  // que esta MAIS NA FRENTE (maior y), que e a que a pessoa esta vendo por cima
  // quando duas se sobrepoem.
  function itemPertoDe(x, y) {
    const TILE = OfficeMap.TILE;
    let achado = null;
    itensDeMesa.forEach((it) => {
      if (!acertaNoDesenho(it, x, y, TILE)) return;
      if (!achado || it.y > achado.y) achado = it;
    });
    return achado;
  }

  function minhaMesa() {
    for (const m of mesas.values()) if (m.donoUid && m.donoUid === selfUid) return m;
    return null;
  }

  function aoMudarMinhaMesa(fn) {
    ouvintesDaMinhaMesa.push(fn);
    fn(Boolean(minhaMesa()));
  }

  // Retangulo que cobre o movel todo, pra plaquinha e contorno tratarem a mesa
  // como uma peca so.
  function areaDaMesa(celulas) {
    let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
    celulas.forEach(([c, r]) => {
      if (c < c0) c0 = c;
      if (r < r0) r0 = r;
      if (c > c1) c1 = c;
      if (r > r1) r1 = r;
    });
    return { c0, r0, c1, r1 };
  }

  // Contorno da mesa, como no Gather: branco quando voce passa o mouse, teal na
  // mesa que e sua.
  function contornoMesa(ctx, celulas, cor, largura) {
    const TILE = OfficeMap.TILE;
    const a = areaDaMesa(celulas);
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = largura;
    ctx.beginPath();
    ctx.roundRect(
      a.c0 * TILE + 1,
      a.r0 * TILE + 1,
      (a.c1 - a.c0 + 1) * TILE - 2,
      (a.r1 - a.r0 + 1) * TILE - 2,
      4
    );
    ctx.stroke();
    ctx.restore();
  }

  // Balaozinho escuro de contexto ("Mesa livre", "Mesa de fulano"), igual ao que
  // o Gather mostra em cima do movel apontado.
  function dicaContexto(ctx, x, y, texto) {
    ctx.save();
    ctx.font = '700 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(texto).width + 16;
    ctx.fillStyle = 'rgba(30,33,41,0.92)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 8, w, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(texto, x, y + 0.5);
    ctx.restore();
  }

  // Plaquinha com o nome de quem reivindicou cada mesa.
  function desenharMesas(ctx) {
    const TILE = OfficeMap.TILE;
    // A plaquinha do dono fica apoiada na fileira da FRENTE do movel, que e
    // justamente onde entram teclado e mouse. Com uma coisa na mao pra pousar
    // ela sai da frente - o contorno da mesa fica, que esse ajuda a mirar.
    const posandoNaMesa = !!(Decorador.pintandoEmCima && Decorador.pintandoEmCima());
    ctx.save();
    ctx.font = '700 8px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    mesas.forEach((m) => {
      const a = areaDaMesa(m.celulas || []);
      // centrada na largura do movel e apoiada na fileira da frente
      const x = ((a.c0 + a.c1 + 1) / 2) * TILE;
      const y = a.r1 * TILE + TILE - 7;
      if (!posandoNaMesa) {
        const texto = (m.donoNome || '').split(' ')[0] || '?';
        const w = ctx.measureText(texto).width + 10;
        ctx.fillStyle = m.donoUid === selfUid ? 'rgba(124,92,212,0.95)' : 'rgba(45,50,62,0.85)';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 6, w, 12, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(texto, x, y + 0.5);
      }

      if (m.donoUid === selfUid) contornoMesa(ctx, m.celulas, 'rgba(99,217,196,0.95)', 2);
    });
    ctx.restore();

    if (mesaHover) {
      const m = mesaPorCelula.get(mesaHover.col + ',' + mesaHover.row);
      // acende o movel todo, nao so a celula sob o cursor
      const celulas = m ? m.celulas : OfficeMap.celulasDaMesa(mesaHover.col, mesaHover.row);
      const a = areaDaMesa(celulas);
      contornoMesa(ctx, celulas, 'rgba(255,255,255,0.95)', 2);
      const texto = !m ? 'Mesa livre'
        : (m.donoUid === selfUid ? 'Sua mesa' : 'Mesa de ' + m.donoNome);
      dicaContexto(
        ctx,
        ((a.c0 + a.c1 + 1) / 2) * TILE,
        a.r1 * TILE + TILE + 12,
        texto
      );
    }

    // Coisa selecionada em cima da mesa: um anel em volta, e a propria coisa
    // seguindo o cursor enquanto esta sendo movida.
    const selecao = ItemMesa.selecaoAtual();
    if (selecao) {
      // a ancora e o meio visual da arte, entao o anel fica centrado nela
      const cx = selecao.x * TILE;
      const cy = selecao.y * TILE;
      ctx.save();
      ctx.strokeStyle = 'rgba(99,217,196,0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(cx - TILE * 0.44, cy - TILE * 0.46, TILE * 0.88, TILE * 0.92, 6);
      ctx.stroke();
      ctx.restore();
      if (ItemMesa.estaMovendo()) {
        drawObjectTile(ctx, selecao.x, selecao.y, selecao.o, TILE, OfficeMap.tiles, true);
      }
      ItemMesa.posicionar();
    }

    // Fantasma da celula que vai receber o objeto (decorador aberto).
    // A "malha": com um item de apoiar na mao, as superficies livres acendem uma
    // gradinha discreta, mostrando onde da pra pousar a coisa. E o equivalente
    // do Gather deixar a mesa virar um tabuleiro na hora de decorar.
    if (Decorador.pintandoEmCima && Decorador.pintandoEmCima()) {
      const M = OfficeMap;
      const vista = tamanhoDaVista();
      const c0 = Math.max(0, Math.floor(camX / TILE));
      const c1 = Math.min(M.COLS - 1, Math.ceil((camX + vista.w) / TILE));
      const r0 = Math.max(0, Math.floor(camY / TILE));
      const r1 = Math.min(M.ROWS - 1, Math.ceil((camY + vista.h) / TILE));
      ctx.save();
      ctx.lineWidth = 1;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!M.SUPERFICIES.has(M.tiles[r][c])) continue;
          // A malha so acende onde da pra pousar de verdade: quem nao e da
          // diretoria so mexe na propria mesa, entao acender o escritorio
          // inteiro seria mentira.
          if (!Decorador.podeColocarEm(c, r)) continue;
          // Na sua mesa a coisa pousa onde voce clicar, entao nao existe
          // "celula ocupada": a malha so mostra que ali da pra pousar.
          const ocupada = celulaEhMinha(c, r) ? false : (M.objetos[r] && M.objetos[r][c]);
          ctx.strokeStyle = ocupada ? 'rgba(248,180,84,0.55)' : 'rgba(120,220,160,0.55)';
          // a gradinha cobre so o tampo: na fileira da frente de uma mesa e uma
          // tirinha, e e exatamente ali que a coisa vai pousar
          const alto = fimDoTampo(M.tiles, c, r) * U;
          ctx.strokeRect(c * TILE + 2.5, r * TILE + 2.5, TILE - 5, Math.max(6, alto - 5));
        }
      }
      ctx.restore();
    }

    // Marca dos moveis que abrem conteudo. Fica FORA do pre-render de proposito:
    // pendurar um link nao pode custar redesenhar o mapa inteiro, e a marca
    // precisa poder piscar sem isso.
    //
    // Sem ela o recurso nao existe: um movel com link e visualmente identico a
    // um sem link, e ninguem clica no que nao parece clicavel.
    desenharMarcasDeConteudo(ctx, TILE);
    desenharTelaNaTV(ctx, TILE);
    desenharPortas(ctx, TILE);
    desenharPoeira(ctx);

    if (celulaAlvo && Decorador.estaPintando()) {
      const podeAqui = Decorador.podeColocarEm(celulaAlvo.col, celulaAlvo.row, celulaAlvo.x, celulaAlvo.y);
      ctx.save();
      ctx.globalAlpha = 0.75;
      Decorador.desenharPreviaNoMapa(ctx, celulaAlvo.col, celulaAlvo.row, TILE, celulaAlvo.x, celulaAlvo.y);
      ctx.globalAlpha = 1;
      contornoMesa(
        ctx, celulaAlvo.col, celulaAlvo.row,
        podeAqui ? 'rgba(74,222,128,0.95)' : 'rgba(248,113,113,0.95)', 2
      );
      ctx.restore();
    }
  }

  // Porta que abre quando alguem chega perto.
  //
  // Ela e CAMINHAVEL: nunca fecha passagem. O que ela faz e dizer que ali e
  // passagem - antes as portas da sede eram buracos na parede, e num corredor
  // de parede continua um buraco nao le como porta, le como parede faltando.
  //
  // Fica no passe de cada quadro, e nao no pre-render, porque o quadro da
  // animacao muda com a posicao das pessoas.
  //
  // Medidas tiradas da folha, nao chutadas: o quadro FECHADO ocupa x 32..63 e
  // y 16..63 do bloco de 2x2 (1 tile de largura por 1,5 de altura, comecando
  // meio tile acima da celula); o ABERTO e a lasca de 8px em x 28..35.
  // Rastro de derrapagem. Fica embaixo do boneco de proposito: poeira sai do
  // chao, e por cima ela taparia os pes de quem esta correndo.
  function desenharPoeira(ctx) {
    if (!poeira.length) return;
    ctx.save();
    poeira.forEach((g) => {
      const t = Math.max(0, g.vida);
      ctx.fillStyle = 'rgba(210,200,180,' + (t * 0.45).toFixed(3) + ')';
      const raio = 3 + (1 - t) * 5;
      ctx.beginPath();
      ctx.arc(g.x, g.y, raio, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // PORTA DESENHADA, e nao tirada do pacote.
  //
  // A folha do LPC (`12-panel-door-a`) e uma porta vista DE FRENTE: ela assume
  // parede alta, de 3 tiles. A sede ve o muro DE CIMA, como uma faixa de 1 tile.
  // Tentei encaixar aquela arte de tres jeitos - inteira (sobrava meio tile),
  // girada 90 graus (virava tabua deitada) e encolhida (ficou baixa e estranha)
  // - e procurei substituta em acervo aberto: o que existe e a propria LPC
  // Animated Doors, porta de nave espacial ou tileset generico. Nenhuma feita
  // pra muro de 1 tile visto de cima.
  //
  // Entao a porta e desenhada aqui, na projecao certa: visto de cima, o que se
  // ve de uma porta e uma TABUA girando em torno da dobradica. Fechada, ela
  // deita no vao; aberta, aponta pra dentro da sala. Isso nao tem como ficar
  // "cortado" nem "atravessado" - a geometria e a do nosso mapa.
  const PORTA_PERTO = 1.8;         // em tiles: a que distancia ela abre
  const PORTA_VELOCIDADE = 0.10;   // quanto do giro anda por quadro
  const PORTA_ESPESSURA = 7;       // em unidades de 128 por tile... nao: em px de mundo
  const PORTA_MADEIRA = '#9c6b3f';
  const PORTA_MADEIRA_CLARA = '#b8834f';
  const PORTA_MADEIRA_ESCURA = '#6f4a2b';
  // Porta de VIDRO, pra entrada. Escritorio de verdade poe vidro na rua e
  // madeira dentro, e de cima o vidro tem outra vantagem: le como passagem
  // mesmo fechado, porque se enxerga atraves dele.
  const PORTA_VIDRO = '#8fc5e0';
  const PORTA_VIDRO_CLARO = '#c2e4f2';
  const PORTA_METAL = '#59617a';
  const PORTA_METAL_CLARO = '#8b93a8';

  // Quanto cada porta esta aberta, de 0 a 1. Guardado entre quadros - e o que
  // faz ela GIRAR em vez de trocar de estado num piscar.
  const aberturaDaPorta = new Map();

  function desenharPortas(ctx, TILE) {
    if (!window.OfficeMap) return;
    const M = OfficeMap;

    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        if (M.tiles[r][c] !== M.PORTA) continue;

        // Alguem por perto? Distancia pelo centro da celula, em tiles.
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        let aberta = false;
        players.forEach((p) => {
          if (aberta) return;
          const d = Math.hypot(p.displayX - cx, p.displayY - cy) / TILE;
          if (d <= PORTA_PERTO) aberta = true;
        });

        // Porta dupla: cada folha recua pra sua propria ponta.
        const parEsquerda = M.tiles[r][c + 1] === M.PORTA;
        const parDireita = M.tiles[r][c - 1] === M.PORTA;

        const chave = c + ',' + r;
        const alvo = aberta ? 1 : 0;
        let t = aberturaDaPorta.has(chave) ? aberturaDaPorta.get(chave) : 0;
        if (t < alvo) t = Math.min(alvo, t + PORTA_VELOCIDADE);
        else if (t > alvo) t = Math.max(alvo, t - PORTA_VELOCIDADE);
        aberturaDaPorta.set(chave, t);

        // Vidro na FACHADA, madeira por dentro: porta que da pra fora do predio
        // (um dos lados e o jardim) e de vidro. E o que escritorio faz, e de
        // cima o vidro ainda ajuda - le como passagem mesmo fechado. Pela sala
        // vizinha, e nao por linha fixa: a planta ja mudou de tamanho uma vez.
        const naRua = (cc, rr) => {
          const s = M.getRoomAtTile(cc, rr);
          return !s || s.id === 'jardim';
        };
        const deVidro = naRua(c, r - 1) || naRua(c, r + 1) || naRua(c - 1, r) || naRua(c + 1, r);

        const jamba = 4;
        const x0 = c * TILE;
        const y0 = r * TILE;

        // batente: so no lado que da na parede (entre duas folhas ha vao)
        // Madeira clara, como o batente da referencia (#e8b48e no print).
        ctx.fillStyle = '#e4a47c';
        if (!parDireita) ctx.fillRect(x0, y0, jamba, TILE);
        if (!parEsquerda) ctx.fillRect(x0 + TILE - jamba, y0, jamba, TILE);
        ctx.fillStyle = '#edc5a8';
        if (!parDireita) ctx.fillRect(x0, y0, jamba, 8);
        if (!parEsquerda) ctx.fillRect(x0 + TILE - jamba, y0, jamba, 8);

        // A FOLHA. Vista de cima, porta fechada nao e um risco: e o VAO CHEIO
        // de madeira, com a mesma estrutura de faixa do muro (luz em cima,
        // corpo embaixo). Abrindo, ela RECUA pra dentro da propria ombreira e
        // descobre o chao, que ja esta desenhado no mapa.
        //
        // Recuar em vez de girar e o que escritorio visto de cima faz. Girar
        // exigiria a folha varrendo o tile vizinho, e foi o que deu errado: a
        // tabua caia na grama e as duas folhas se encavalavam.
        // O vao vai de batente a batente - e onde NAO ha batente (entre as duas
        // folhas de uma porta dupla) ele vai ate a borda da celula. Sem isso
        // sobrava uma fresta de 4px no meio do par, e dava pra ver a rua por ela
        // com as duas portas fechadas.
        const bordaEsq = parDireita ? x0 : x0 + jamba;
        const bordaDir = parEsquerda ? x0 + TILE : x0 + TILE - jamba;
        const vao = bordaDir - bordaEsq;
        const larg = Math.max(0, Math.round(vao * (1 - t)));
        if (larg > 0) {
          const fx = parDireita ? bordaDir - larg : bordaEsq;
          if (deVidro) {
            // VIDRO: caixilho de metal, pano de vidro claro e um risco de
            // reflexo. A mesma linguagem das janelas da fachada.
            ctx.fillStyle = PORTA_METAL;
            ctx.fillRect(fx, y0, larg, TILE);
            ctx.fillStyle = PORTA_VIDRO;
            ctx.fillRect(fx + 2, y0 + 3, larg - 4, TILE - 7);
            ctx.fillStyle = PORTA_VIDRO_CLARO;
            ctx.fillRect(fx + 2, y0 + 3, larg - 4, 5);
            if (larg > 10) {
              // reflexo em diagonal, em degraus (nada de linha lisa: o resto
              // da sede e pixel, e diagonal suave destoa)
              ctx.fillStyle = 'rgba(255,255,255,0.45)';
              for (let k = 0; k < 5; k++) {
                const rx = fx + 3 + k * 2;
                if (rx < fx + larg - 3) ctx.fillRect(rx, y0 + 18 - k * 2, 2, 3);
              }
            }
            ctx.fillStyle = PORTA_METAL_CLARO;
            if (larg > 8) {
              // puxador vertical, na ponta que abre
              const px = parDireita ? fx + 3 : fx + larg - 4;
              ctx.fillRect(px, y0 + 9, 2, TILE - 18);
            }
          } else {
            ctx.fillStyle = PORTA_MADEIRA_ESCURA;
            ctx.fillRect(fx, y0, larg, TILE);
            ctx.fillStyle = PORTA_MADEIRA;
            ctx.fillRect(fx, y0 + 2, larg, TILE - 4);
            ctx.fillStyle = PORTA_MADEIRA_CLARA;
            ctx.fillRect(fx, y0 + 2, larg, 6);                // luz no topo, como o muro
            ctx.fillStyle = PORTA_MADEIRA_ESCURA;
            ctx.fillRect(fx, y0 + TILE - 6, larg, 4);          // sombra na base
            if (larg > 14) {
              ctx.fillStyle = PORTA_MADEIRA_ESCURA;
              ctx.fillRect(fx + 3, y0 + 11, larg - 6, 1);
              ctx.fillRect(fx + 3, y0 + 20, larg - 6, 1);
            }
            if (larg > 8) {
              ctx.fillStyle = '#d8cf9a';
              const mx = parDireita ? fx + 3 : fx + larg - 5;
              ctx.fillRect(mx, y0 + 14, 3, 4);
            }
          }
        }
      }
    }
  }

  // A TV espelha a tela de quem esta apresentando NA MESMA SALA que ela.
  //
  // Mesma sala e a regra inteira: sem ela, a apresentacao da reuniao apareceria
  // tambem numa TV do outro lado do andar, pra quem nao esta na conversa. E o
  // mesmo criterio que o calls.js ja usa pro som.
  //
  // Fica FORA do pre-render, no passe de cada quadro, porque video muda 30
  // vezes por segundo e o mapa pre-renderizado e estatico.
  function desenharTelaNaTV(ctx, TILE) {
    if (!window.Calls || !window.OfficeMap) return;

    // Ninguem apresentando: nem sai procurando TV no mapa.
    let quem = null;
    players.forEach((p) => { if (p.dividindoTela) quem = p; });
    if (!quem) return;

    const video = quem.id === selfId
      ? Calls.videoDaTelaLocal()
      : Calls.getVideoRemoto(quem.id);
    if (!video || !video.videoWidth) return;

    const M = OfficeMap;
    const salaDele = M.getRoomAtTile(Math.floor(quem.x / TILE), Math.floor(quem.y / TILE));
    if (!salaDele) return;

    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        if (M.tiles[r][c] !== M.TV) continue;
        if (M.tiles[r][c - 1] === M.TV) continue;   // so a ponta esquerda do aparelho
        const sala = M.getRoomAtTile(c, r);
        if (!sala || sala.id !== salaDele.id) continue;

        let c1 = c;
        while (M.tiles[r][c1 + 1] === M.TV) c1++;

        // A moldura da TV: mesma caixa que o `telaLigada` pinta, pra imagem
        // cair exatamente dentro dela e nao por cima da borda do aparelho.
        const x0 = c * TILE + (TILE * 18) / 128;
        const x1 = (c1 + 1) * TILE - (TILE * 18) / 128;
        const y0 = r * TILE - (TILE * 86) / 128;
        const y1 = r * TILE + (TILE * 66) / 128;
        desenharVideoCobrindo(ctx, video, x0, y0, x1 - x0, y1 - y0);

        // vidro por cima, pra tela nao ficar com cara de adesivo colado
        ctx.save();
        ctx.fillStyle = 'rgba(150,200,255,0.10)';
        ctx.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.35);
        ctx.restore();
      }
    }
  }

  // Recorta o video pra COBRIR o retangulo sem deformar. Esticar a imagem numa
  // tela larga achata rosto e texto, que e justamente o que se quer ler numa
  // apresentacao.
  function desenharVideoCobrindo(ctx, video, x, y, larg, alt) {
    const escala = Math.max(larg / video.videoWidth, alt / video.videoHeight);
    const lv = larg / escala;
    const av = alt / escala;
    ctx.drawImage(
      video,
      (video.videoWidth - lv) / 2, (video.videoHeight - av) / 2, lv, av,
      x, y, larg, alt
    );
  }

  // Um selo pequeno no canto de cima do movel, com um brilho que respira. Nao e
  // enfeite: e a unica pista de que aquele movel faz alguma coisa.
  function desenharMarcasDeConteudo(ctx, TILE) {
    if (!window.Conteudo) return;
    const lista = Conteudo.todos();
    if (!lista.length) return;

    const pulso = 0.72 + 0.28 * Math.sin(Date.now() / 420);
    ctx.save();
    lista.forEach(({ c, r }) => {
      // A marca sobe um tile quando o movel e alto (estante, geladeira, quadro):
      // ali embaixo ela ficaria escondida atras da propria arte.
      const alto = ehMovelAlto(c, r);
      const cx = c * TILE + TILE - 8;
      const cy = (alto ? r - 1 : r) * TILE + 8;

      ctx.beginPath();
      ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(23,27,38,0.55)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99,102,241,' + pulso.toFixed(3) + ')';
      ctx.fill();

      // elo de corrente minusculo, em dois tracos
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 2.6, cy + 1.4);
      ctx.lineTo(cx - 0.4, cy - 0.8);
      ctx.moveTo(cx + 0.4, cy + 0.8);
      ctx.lineTo(cx + 2.6, cy - 1.4);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Movel cuja arte passa do proprio tile pra cima. Vale a mesma lista que o
  // clique olha, senao a marca aparece num lugar e o clique funciona noutro.
  function ehMovelAlto(c, r) {
    const M = OfficeMap;
    const t = M.tiles[r] && M.tiles[r][c];
    return t === M.ESTANTE || t === M.GELADEIRA || t === M.ARMARIO
      || t === M.QUADRO || t === M.LOUSA || t === M.TV || t === M.PLANTA_GRANDE;
  }

  const cores = new Map();
  function corDoId(id) {
    if (!cores.has(id)) {
      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
      const hue = hash % 360;
      cores.set(id, `hsl(${hue}, 70%, 60%)`);
    }
    return cores.get(id);
  }

  function prerenderMap() {
    const { COLS, ROWS, TILE, tiles } = OfficeMap;
    // O mapa inteiro em 4x da ~96MB de canvas. Se o navegador nao aguentar
    // (maquina fraca, aba com pouca memoria), cai pra 2x em vez de ficar com a
    // tela em branco. O `escala` fica guardado porque o desenho depende dele.
    for (const tentativa of [RENDER_SCALE, 2, 1]) {
      mapCanvas = document.createElement('canvas');
      mapCanvas.width = COLS * TILE * tentativa;
      mapCanvas.height = ROWS * TILE * tentativa;
      const teste = mapCanvas.getContext('2d');
      // um canvas grande demais nasce em branco: testa escrevendo 1 pixel
      if (teste) {
        teste.fillStyle = '#000';
        teste.fillRect(0, 0, 1, 1);
        if (teste.getImageData(0, 0, 1, 1).data[3] === 255) {
          escalaDoMapa = tentativa;
          break;
        }
      }
      if (tentativa !== 1) console.warn('[mapa] ' + tentativa + 'x nao coube, tentando menor');
    }

    const mctx = mapCanvas.getContext('2d');
    mctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mctx.imageSmoothingEnabled = false;
    mctx.scale(escalaDoMapa, escalaDoMapa);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) drawFloorTile(mctx, c, r, TILE, OfficeMap.pisoEmTile(c, r));
    }
    // moldura fina marcando as areas (o Gather usa isso pra delimitar zonas:
    // toda ilha de carpete aparece com um contorno claro em volta). Vem das
    // AREAS - que a diretoria pode mover (docs/areas.md) - e das ilhas soltas.
    OfficeMap.ROOMS.concat(OfficeMap.ZONAS_PISO).forEach((z) => {
      if (z.id === 'jardim' || z.id === 'hall') return;
      const cor = z.contorno || (String(z.piso).startsWith('carpete') ? 'rgba(255,255,255,0.18)' : null);
      if (!cor) return;
      mctx.save();
      mctx.strokeStyle = cor;
      mctx.lineWidth = 2;
      mctx.beginPath();
      mctx.roundRect(
        z.c0 * TILE + 2, z.r0 * TILE + 2,
        (z.c1 - z.c0 + 1) * TILE - 4, (z.r1 - z.r0 + 1) * TILE - 4, 6
      );
      mctx.stroke();
      mctx.restore();
    });

    // arvores ficam por ultimo: a copa passa do proprio tile e nao pode ser
    // cortada pelo tile desenhado depois
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const type = tiles[r][c];
        if (type !== OfficeMap.LIVRE && type !== OfficeMap.ARVORE) {
          drawObstacleTile(mctx, c, r, type, TILE, tiles);
        }
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (tiles[r][c] === OfficeMap.ARVORE) drawObstacleTile(mctx, c, r, OfficeMap.ARVORE, TILE, tiles);
      }
    }

    // A FACE DO MURO SEMPRE POR CIMA - a regra, aplicada de uma vez no fim.
    //
    // Nao basta tratar o movel que ocupa a celula do muro: peca alta plantada na
    // fileira de BAIXO tambem sobe e cobre o muro, e a arvore e a planta grande
    // fazem isso de proposito (`atravessa`). Depois que tudo ja foi desenhado,
    // esta passada devolve a faixa de cima de todo muro deitado. E o que garante
    // que a linha da parede nunca some, venha o que vier na frente dela.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const deitado = ehParede(tiles[r][c])
          && !ehParede(tiles[r - 1] && tiles[r - 1][c])
          && !ehParede(tiles[r + 1] && tiles[r + 1][c]);
        if (deitado || movelNoMuro(tiles, r, c)) {
          faceDoMuro(mctx, c * TILE, r * TILE, bordasMuro(tiles, r, c));
        }
      }
    }

    // camada de cima por ultimo: o que esta apoiado fica visivel sobre o movel
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const obj = OfficeMap.objetos[r][c];
        if (obj) drawObjectTile(mctx, c, r, obj, TILE, tiles);
      }
    }
    // O que o dono pos na propria mesa vem por cima da decoracao da casa, e nao
    // anda pela grade: cada coisa tem a posicao que a pessoa escolheu. Ordenado
    // por y pra quem esta mais na frente tapar quem esta atras.
    const emMovimento = ItemMesa.estaMovendo() ? ItemMesa.selecaoAtual() : null;
    itensDeMesa.slice().sort((a, b) => a.y - b.y).forEach((it) => {
      // A que esta sendo arrastada sai daqui: ela e desenhada ao vivo, seguindo
      // o cursor, senao ficaria congelada no lugar antigo ate soltar.
      if (emMovimento && it.id === emMovimento.id) return;
      drawObjectTile(mctx, it.x, it.y, it.o, TILE, tiles, true);
    });
    // A etiqueta da sala NAO entra aqui. Assada no canvas do mapa, ela e
    // rasterizada em RENDER_SCALE e depois reduzida na hora de desenhar - com o
    // alisamento desligado, o texto sai serrilhado. Na referencia o nome da sala
    // e texto de interface, nitido. Agora ela e desenhada na camada viva, onde o
    // proprio rasterizador da fonte cuida do tamanho final.
  }

  // Cada ambiente tem seu proprio chao (duas tonalidades alternadas, em xadrez
  // sutil), no lugar do piso de madeira unico que valia pro escritorio inteiro.
  //
  // MEDIDO NO PRINT do Gather (referencias/Captura de tela 2026-09-07 172652.png),
  // pixel a pixel, e encaixado na paleta do pacote (naPaleta): corredor #efe4d9,
  // carpete #878dce/#8e9edb, ladrilho claro #d6d8ea, grama #d9efda. A paleta tem
  // par quase exato pra varias (a grama vira #d9f1d8, o carpete #838ad1); onde
  // o par da paleta mudaria o tom - a junta do tijolo, o segundo tom do carpete -
  // a cor vai em rgba(), que passa direto: e sombra/brilho por cima do material,
  // exatamente o caso que a regra da paleta deixa de fora.
  const CORES_PISO = {
    // O creme do corredor fica FORA da paleta, de proposito e so ele: e o chao
    // que mais aparece, e a paleta nao tem creme - o mais perto (#faece7) sai
    // rosado, e o #e3e7d3 que o naPaleta escolheria sai esverdeado. rgb() nao
    // passa pelo naPaleta (so '#...' passa).
    tijolo: { base: 'rgb(239,228,217)', junta: 'rgba(240,190,140,0.30)', luz: 'rgba(255,255,255,0.25)' },
    tijolo_quente: { base: '#e6d3b4', junta: '#d3bd9a', luz: '#eeddc2', sombra: '#dcc9a6' },
    cinza: { base: '#d2d6dd', junta: '#adb4c0', luz: '#e4e7ec', sombra: '#c2c7d1' },
    ladrilho: { base: '#d2d8ef', junta: 'rgba(70,80,140,0.16)', luz: 'rgba(255,255,255,0.45)' },
    // Carpete das ilhas de mesa: lavanda com zigue-zague, como o da referencia.
    // Os dois tons do print caem na MESMA cor da paleta (#838ad1), entao o
    // desenho do zigue-zague vai por cima, em rgba.
    carpete_roxo: { base: '#838ad1', claro: 'rgba(170,200,255,0.24)' },
    carpete_azul: { base: '#5d6577', claro: '#6e7789' },
    grama: { base: '#d9f1d8', claro: 'rgba(80,150,90,0.22)' },
  };

  // Piso de tijolinho em fiada alternada (a fiada usa a linha global, senao a
  // emenda entre tiles fica visivel).
  // Na grade fina, a junta e 1 unidade (= 1 pixel de verdade no canvas 4x), em vez
  // do traco de lineWidth 1 que virava 4 pixels e engrossava o piso todo. Cada
  // tijolo ganha um fio de luz em cima e sombra embaixo, dando relevo.
  function pisoTijolo(ctx, x, y, TILE, c, r, cores) {
    // Medido na referencia (172839) com a cadeira de regua - 1 cadeira = 1 tile
    // = ~45px naquele print: o tijolo tem **1 tile de largura por meio de
    // altura**, ou seja 2 fiadas por tile e a junta vertical a cada tile.
    //
    // A nossa era 1/2 x 1/4 de tile: quatro vezes mais tijolo na mesma area, o
    // que dava aquela textura miuda e ocupada em vez do ladrilho grande e calmo
    // do Gather.
    //
    // A junta tem 4 unidades (um pixel de arte). Com menos, ela some quando a
    // tela desenha o canvas 4x em zoom 2.
    q(ctx, x, y, 0, 0, 128, 128, cores.base);
    for (let i = 0; i < 2; i++) {
      const fy = i * 64;
      q(ctx, x, y, 0, fy, 128, 4, cores.junta);
      // So um fio de luz embaixo da junta. Com luz em cima E sombra embaixo o
      // tijolo ganhava um bisel de azulejo de banheiro; o da referencia e
      // chapado, com a junta quase do tom da base.
      q(ctx, x, y, 0, fy + 4, 128, 4, cores.luz);
      // Fiada alternada pela LINHA GLOBAL: contando so dentro do tile, a emenda
      // entre um tile e o vizinho aparecia como uma falha na parede de tijolo.
      const desloc = ((r * 2 + i) % 2 === 0) ? 0 : 64;
      for (let vx = desloc; vx < 128 + 64; vx += 128) {
        if (vx >= 128) continue;
        q(ctx, x, y, vx, fy, 4, 64, cores.junta);
      }
    }
  }

  function pisoCarpete(ctx, x, y, TILE, c, r, cores, listrado) {
    q(ctx, x, y, 0, 0, 128, 128, cores.base);

    if (listrado) {
      for (let vx = 0; vx < 128; vx += 36) {
        q(ctx, x, y, vx, 0, 16, 128, cores.claro);
        q(ctx, x, y, vx, 0, 4, 128, 'rgba(255,255,255,0.10)');
      }
      return;
    }

    // Placas em degrau, como o carpete das ilhas de mesa da referencia (medido
    // no print em 10x): fileiras de 1/4 de tile com blocos claro/escuro de meio
    // tile, cada fileira deslocada MEIO BLOCO da anterior - de longe isso vira o
    // zigue-zague. A borda de cada bloco claro e "penteada" (dente de um pixel de
    // arte), que e o que da cara de carpete e nao de azulejo. Bloco e fileira
    // dividem o tile, entao a fase e a mesma em todo tile e o desenho emenda
    // sozinho com o vizinho.
    const FILEIRA = 32;
    const BLOCO = 64;
    for (let fy = 0; fy < 128; fy += FILEIRA) {
      const desloc = ((r * 4 + fy / FILEIRA) % 2) * (BLOCO / 2);
      // ate 128 + BLOCO: o bloco que comeca no tile vizinho ainda poe o dente
      // da borda esquerda DENTRO deste tile
      for (let x0 = desloc - 2 * BLOCO; x0 < 128 + BLOCO; x0 += 2 * BLOCO) {
        const a = Math.max(0, x0);
        const b = Math.min(128, x0 + BLOCO);
        if (b > a) q(ctx, x, y, a, fy, b - a, FILEIRA, cores.claro);
        for (let dy = 0; dy < FILEIRA; dy += 8) {
          if (x0 - 4 >= 0 && x0 - 4 < 128) q(ctx, x, y, x0 - 4, fy + dy, 4, 4, cores.claro);
          if (x0 + BLOCO >= 0 && x0 + BLOCO < 128) q(ctx, x, y, x0 + BLOCO, fy + dy + 4, 4, 4, cores.claro);
        }
      }
    }
  }

  function drawFloorTile(ctx, c, r, TILE, piso) {
    const x = c * TILE, y = r * TILE;
    const meioTile = TILE / 2;
    const cores = CORES_PISO[piso] || CORES_PISO.tijolo;

    // Chao do pacote LPC primeiro; o desenho a mao abaixo e o reserva.
    if (window.Sprites && Sprites.desenharPiso(ctx, c, r, TILE, piso)) return;

    if (piso === 'carpete_roxo') return pisoCarpete(ctx, x, y, TILE, c, r, cores, false);
    if (piso === 'carpete_azul') return pisoCarpete(ctx, x, y, TILE, c, r, cores, true);

    if (piso === 'ladrilho') {
      // ladrilho em losango, em degraus (a linha diagonal do ctx.stroke saia
      // borrada e fugia da cara de pixel do resto)
      q(ctx, x, y, 0, 0, 128, 128, cores.base);
      for (let i = 0; i < 16; i++) {
        const d = i * 4;
        q(ctx, x, y, d, 60 - d, 4, 4, cores.junta);
        q(ctx, x, y, 64 + d, d, 4, 4, cores.junta);
        q(ctx, x, y, 124 - d, 64 + d, 4, 4, cores.junta);
        q(ctx, x, y, 60 - d, 124 - d, 4, 4, cores.junta);
      }
      q(ctx, x, y, 60, 60, 8, 8, cores.luz); // brilho no centro do losango
      return;
    }

    if (piso === 'grama') {
      q(ctx, x, y, 0, 0, 128, 128, cores.base);
      // A grama da referencia e quase lisa: verde-menta claro com um tufinho em
      // "v" aqui e ali. Cinco tufos por tile, como era, viravam textura de
      // gramado de futebol. Posicao estavel (depende so de c/r).
      for (let i = 0; i < 2; i++) {
        if ((c * 7 + r * 13 + i * 5) % 3 === 0) continue;
        const gx = ((c * 29 + r * 53 + i * 61) % 88) + 16;
        const gy = ((c * 41 + r * 23 + i * 47) % 88) + 16;
        q(ctx, x, y, gx, gy, 4, 8, cores.claro);
        q(ctx, x, y, gx + 12, gy, 4, 8, cores.claro);
        q(ctx, x, y, gx + 4, gy + 4, 8, 8, cores.claro);
      }
      return;
    }

    pisoTijolo(ctx, x, y, TILE, c, r, cores);
  }

  // Etiqueta flutuante com o nome do ambiente (mesma ideia das "salas" do Gather
  // 2.0: cada zona se identifica por nome e cor logo de cara, sem precisar abrir
  // a Visao de salas).
  function desenharEtiquetaSala(ctx, sala, TILE) {
    const col = sala.labelC != null ? sala.labelC : sala.c0;
    const row = sala.labelR != null ? sala.labelR : sala.r0;
    const x = col * TILE + 5;
    const y = row * TILE + 5;
    const cor = sala.cor || '#8b98a8';
    const texto = sala.nome;

    ctx.save();
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const largura = ctx.measureText(texto).width;
    const padX = 8, ponto = 12, h = 17;
    const w = padX * 2 + ponto + largura;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(x + padX + 3, y + h / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3c4453';
    ctx.fillText(texto, x + padX + ponto, y + h / 2 + 0.5);
    ctx.restore();
  }

  // Placa de creditos da arte. A arte e do banco aberto LPC (OGA-BY / CC-BY-SA):
  // usar e livre, e o credito VISIVEL no produto e a contrapartida - um arquivo
  // no repositorio sozinho nao conta. O Caio pediu "num canto que ninguem vai":
  // fica na faixa de fora do predio, no canto de baixo a direita, e clicar abre
  // a lista inteira (public/creditos.html).
  let placaCreditos = null; // { x, y, w, h } em coordenadas do mapa, pro clique

  function desenharPlacaCreditos(ctx, TILE) {
    const texto = 'Arte: LPC (OGA-BY / CC-BY-SA) · creditos';
    ctx.save();
    ctx.font = '600 8px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const padX = 6, h = 14;
    const w = padX * 2 + ctx.measureText(texto).width;
    const x = OfficeMap.COLS * TILE - w - 6;
    const y = (OfficeMap.ROWS - 1) * TILE + (TILE - h) / 2;

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#5b6472';
    ctx.fillText(texto, x + padX, y + h / 2 + 0.5);
    ctx.restore();
    placaCreditos = { x, y, w, h };
  }

  function cliqueNaPlaca(x, y) {
    const p = placaCreditos;
    return !!p && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }

  // Parede e janela formam um muro so: pra decidir a borda, as duas contam como
  // parede (senao aparece um traco entre a parede e o janelao ao lado).
  function ehParede(t) {
    return t === OfficeMap.PAREDE || t === OfficeMap.JANELA;
  }

  // Movel que o MAPA colocou na linha do muro. Varrendo pros lados na mesma
  // linha, chega em parede dos dois lados sem cruzar chao livre.
  //
  // Isto existe porque o mapa usa celulas do muro pra encostar estante,
  // geladeira e balcao - e como o tile do movel SUBSTITUI o da parede, o muro
  // ficava com um vao ali. A copa, por exemplo, tinha cinco moveis seguidos no
  // lugar da parede norte, e dava pra ver a grama do lado de fora.
  // Movel que o MAPA colocou na linha do muro. Duas condicoes, e as duas
  // importam:
  //
  //   1. a celula SEPARA dois lugares - o que tem em cima nao e a mesma sala do
  //      que tem embaixo. Movel no meio de uma sala tem a mesma sala dos dois
  //      lados, e nao entra na regra;
  //   2. andando pros lados por celulas solidas, chega num muro DEITADO (parede
  //      que nao tem parede em cima nem embaixo, ou seja: muro na horizontal,
  //      que e o que tem face visivel).
  //
  // Basta chegar num muro de UM lado. A primeira versao exigia dos dois, e por
  // isso a estante no fim de um trecho de parede - com chao livre do outro lado
  // - ficava de fora da regra e continuava apagando o muro.
  function movelNoMuro(tiles, r, c) {
    const M = OfficeMap;
    const t = tiles[r] && tiles[r][c];
    if (!t || ehParede(t)) return false;
    if (M.isTileWalkable && M.isTileWalkable(c, r)) return false;

    const acima = M.getRoomAtTile(c, r - 1);
    const abaixo = M.getRoomAtTile(c, r + 1);
    if ((acima ? acima.id : null) === (abaixo ? abaixo.id : null)) return false;

    const muroDeitado = (k) => ehParede(tiles[r] && tiles[r][k])
      && !ehParede(tiles[r - 1] && tiles[r - 1][k])
      && !ehParede(tiles[r + 1] && tiles[r + 1][k]);

    for (const passo of [-1, 1]) {
      for (let k = c + passo, n = 0; n < 12; k += passo, n++) {
        const v = tiles[r] && tiles[r][k];
        if (v === undefined) break;
        if (muroDeitado(k)) return true;
        if (v === M.LIVRE) break;
        if (M.isTileWalkable && M.isTileWalkable(k, r)) break;
      }
    }
    return false;
  }


  // "E muro pra efeito de desenho?" - parede de verdade ou movel encostado na
  // linha dela. Sem contar o movel, o muro saia com risco de borda de cada lado
  // da estante, como se cada pedaco fosse um muro solto.
  function ehMuroVisual(tiles, r, c) {
    if (!tiles[r]) return false;
    return ehParede(tiles[r][c]) || movelNoMuro(tiles, r, c);
  }

  function bordasMuro(tiles, r, c) {
    const cima = !ehMuroVisual(tiles, r - 1, c);
    const esq = !ehMuroVisual(tiles, r, c - 1);
    const dir = !ehMuroVisual(tiles, r, c + 1);
    return {
      cima,
      baixo: !ehMuroVisual(tiles, r + 1, c),
      esq,
      dir,
      // `deitado` = a celula faz parte de uma fileira HORIZONTAL de muro
      // (tem muro na esquerda ou na direita).
      //
      // Existe por causa do buraco no L. A faixa clara do topo so era pintada
      // quando nao havia muro acima; num encontro em L a celula onde a parede
      // vertical desce TEM muro acima, entao era a unica da fileira sem faixa -
      // e no meio de uma linha continua isso le como buraco. Numa fileira
      // horizontal a faixa tem que atravessar a emenda.
      deitado: !esq || !dir,
    };
  }

  // As cores do muro. O print do Gather (referencias/...172652.png) tem parede
  // cinza-esverdeada media: #566368 na face, #809295 no topo. A paleta do pacote
  // nao tem esse verde-acinzentado (o mais perto, #6f6464, puxa pro marrom);
  // o par mais proximo que nao muda o tom e este cinza-azulado. O que havia
  // antes era ardosia quase preta puxada pro roxo (#4b4b60/#726b7e depois da
  // paleta), e era o que mais pesava o mapa inteiro.
  const MURO = {
    corpo: '#6a7587',
    topo: '#818e97',
    luz: '#a8b3b8',
    sombra: '#4b4b60',
    rodape: '#4b4b60',
    rodapeLuz: '#818e97',
  };

  // O desenho do muro em si, separado pra poder sair tambem POR BAIXO do movel
  // que ocupa a celula dele.
  function pintarMuro(ctx, x, y, b) {
    q(ctx, x, y, 0, 0, 128, 128, MURO.corpo);
    // A face de cima aparece no topo do muro E ao longo de toda fileira
    // horizontal, pra linha nao quebrar nos encontros em L e em T.
    if (b.cima || b.deitado) {
      q(ctx, x, y, 0, 0, 128, 30, MURO.topo);
      q(ctx, x, y, 0, 0, 128, 3, MURO.luz); // luz na quina
      q(ctx, x, y, 0, 30, 128, 2, MURO.sombra); // sombra sob a face de cima
    }
    if (b.baixo) {
      q(ctx, x, y, 0, 104, 128, 24, MURO.rodape); // rodape
      q(ctx, x, y, 0, 104, 128, 2, MURO.rodapeLuz); // fio de luz
    }
    // emenda de painel: vertical no muro deitado, horizontal no muro em pe
    if (b.cima || b.baixo) q(ctx, x, y, 63, 34, 2, 68, 'rgba(38,43,56,0.35)');
    else q(ctx, x, y, 0, 63, 128, 2, 'rgba(38,43,56,0.30)');
    if (b.cima) q(ctx, x, y, 0, 0, 128, 2, TRACO);
    if (b.baixo) q(ctx, x, y, 0, 126, 128, 2, TRACO);
    if (b.esq) q(ctx, x, y, 0, 0, 2, 128, TRACO);
    if (b.dir) q(ctx, x, y, 126, 0, 2, 128, TRACO);
  }

  // So a face do muro: a faixa clara de cima e o contorno. E o que garante que a
  // linha do muro continue visivel POR CIMA de qualquer movel encostado nela.
  //
  // Sem isto nao adianta pintar o muro por baixo: estante, geladeira e balcao
  // sao opacos e ocupam a celula inteira, entao tapavam o muro do mesmo jeito e
  // o corredor continuava parecendo aberto.
  function faceDoMuro(ctx, x, y, b) {
    if (b.cima || b.deitado) {
      q(ctx, x, y, 0, 0, 128, 30, MURO.topo);
      q(ctx, x, y, 0, 0, 128, 3, MURO.luz);
      q(ctx, x, y, 0, 30, 128, 2, MURO.sombra);
      // O contorno de cima so no topo DE VERDADE: na emenda com uma parede
      // vertical ele cortaria a parede que segue pra cima.
      if (b.cima) q(ctx, x, y, 0, 0, 128, 2, TRACO);
    }
    if (b.esq) q(ctx, x, y, 0, 0, 2, 128, TRACO);
    if (b.dir) q(ctx, x, y, 126, 0, 2, 128, TRACO);
  }

  // Rabisco de caneta na lousa. Nada abaixo de 16 unidades finas: a lousa tem
  // 128 de largura e vira 32 pixels na tela, entao traco de 4 unidades some.
  function escritaNaLousa(ctx, x, y) {
    q(ctx, x, y, 28, 40, 60, 6, '#3f7fc4');
    q(ctx, x, y, 28, 56, 44, 6, '#3f7fc4');
    q(ctx, x, y, 28, 72, 52, 6, '#e0607e');
    q(ctx, x, y, 84, 70, 16, 16, '#3fa85c');
  }

  // Onde esta esta celula dentro da TV de 3 tiles: a tela e um retangulo so,
  // atravessando as tres, entao a borda escura do aparelho fica nas pontas.
  function posicaoNaTV(tiles, c, r) {
    const igual = (cc) => tiles[r] && tiles[r][cc] === OfficeMap.TV;
    if (!igual(c - 1)) return 'esq';
    if (!igual(c + 1)) return 'dir';
    return 'meio';
  }

  // Tela acesa: azul do projetor com um par de blocos claros de "slide". Sem
  // isto a TV e um retangulo preto, que na parede le como buraco.
  function telaLigada(ctx, x, y, onde) {
    // A arte da TV tem 2 tiles de altura e e ancorada na celula de BAIXO: a
    // tela comeca quase um tile ACIMA desta celula. Por isso o `ay` negativo -
    // desenhando so a partir de 0, acendia a metade de baixo e a de cima
    // continuava preta, que foi o que apareceu na primeira tentativa.
    const x0 = onde === 'esq' ? 18 : 0;
    const larg = 128 - (onde === 'esq' ? 18 : 0) - (onde === 'dir' ? 18 : 0);
    q(ctx, x, y, x0, -86, larg, 152, '#2f6ea8');
    q(ctx, x, y, x0, -86, larg, 34, '#3f8bc9');   // luz no alto da tela
    if (onde === 'meio') {
      q(ctx, x, y, 14, -40, 64, 10, 'rgba(255,255,255,0.88)');
      q(ctx, x, y, 14, -16, 44, 10, 'rgba(255,255,255,0.60)');
      q(ctx, x, y, 14, 8, 52, 10, 'rgba(255,255,255,0.45)');
    }
    if (onde === 'esq') q(ctx, x, y, 40, -40, 56, 10, 'rgba(255,255,255,0.50)');
    if (onde === 'dir') q(ctx, x, y, 12, -16, 48, 10, 'rgba(255,255,255,0.35)');
  }

  function bordasParede(tiles, r, c) {
    return {
      cima: !(tiles[r - 1] && ehParede(tiles[r - 1][c])),
      baixo: !(tiles[r + 1] && ehParede(tiles[r + 1][c])),
      esq: !ehParede(tiles[r][c - 1]),
      dir: !ehParede(tiles[r][c + 1]),
    };
  }

  // Moveis que ocupam varios tiles (mesa de reuniao, sofa, tapete) so desenham
  // a borda no lado em que o vizinho e de outro tipo, pra virarem uma peca so.
  // ---- utilitarios de pixel art ----
  // Tudo em retangulos inteiros: e o que da a cara de sprite da referencia, no
  // lugar de forma vetorial lisa. Cada movel usa contorno escuro + 3 tons.
  const TRACO = '#252a36';

  // ---- grid fino de 128 unidades por tile ----
  // O mapa e pre-renderizado em RENDER_SCALE = 4, entao 1/4 de unidade de tile e
  // exatamente 1 pixel de verdade. A arte dos moveis e desenhada nessa grade de
  // 128x128 por tile - quatro vezes o detalhe que dava pra ter antes.
  // ---- a paleta do pacote, para a arte a mao nao destoar da comprada ----
  //
  // O escritorio mistura duas fontes de arte: os moveis vem do pacote LPC
  // Revised e os itens de computador sao desenhados aqui (o acervo aberto
  // simplesmente nao tem monitor, teclado nem mouse em vista de cima - procurei
  // em nove pacotes). Lado a lado na mesma mesa a diferenca saltava: o pacote e
  // quente e discreto, o nosso saia frio e saturado.
  //
  // Nao e problema de desenho, e de PALETA. O LPC publica a dele - as 128 cores
  // de `assets/lpc-moveis/_paleta-lpc.png` - entao toda cor solida que a gente
  // pinta e trocada pela mais proxima dela. As formas continuam nossas; o
  // colorido passa a ser o mesmo.
  //
  // `rgba(...)` passa direto: sombra e brilho sao camadas por cima, nao cor de
  // material, e encaixar isso na paleta so sujaria.
  const PALETA_LPC = '#000000,#0f1218,#ffffff,#fdf5cc,#f4d7a0,#1b192b,#1a1213,#ebede9,#faece7,#8b7949,#edc5a8,#eecc8c,#2a1722,#e0f2f3,#d9f1d8,#e4a47c,#f8bc76,#ccaaa6,#d38b59,#ad844f,#e09c4c,#ff8a00,#ae7771,#fdd082,#c7cfcc,#e3e7d3,#f9d5ba,#ae6b3f,#a2794b,#cf6f30,#e56010,#d2d8ef,#bde6e5,#af8a35,#a8b3b8,#c4b59f,#7f4c31,#946b44,#b54936,#bf4000,#c7341b,#ffad97,#988fba,#a4b0dc,#a4dddb,#d0da91,#adcca6,#b5ee2d,#f4e48d,#836332,#818e97,#867e7f,#958080,#cc8665,#644133,#6b3c2e,#75502d,#95381c,#a42600,#ef747e,#7c6ea6,#838ad1,#8abec9,#73bed3,#6cdce7,#a8ca58,#c7c65a,#86b278,#9ecf23,#f6e768,#f3c35f,#6a7587,#40361d,#4b4b60,#726b7e,#6f6464,#99423c,#442725,#603429,#61482c,#7b2008,#aa3a6a,#bd5169,#655789,#636fc7,#4f899d,#4f8fba,#3aafc2,#75a743,#a1a03d,#5f874d,#7cb82f,#f0e059,#d19428,#2b2511,#343043,#484152,#6a1d16,#792a53,#4c3b64,#3b428e,#3a5a72,#3c5e8b,#2a8598,#468232,#677831,#456238,#5c9a2a,#dbbd00,#a16018,#29253a,#5e2043,#2e1f1c,#3e111a,#481945,#2c2452,#253a5e,#18506f,#25562e,#314829,#517610,#bca51c,#794117,#172038,#0d283e,#19332d,#3e6115,#978c02'.split(',').map((h) => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), h,
  ]);

  const cacheCor = new Map();

  function naPaleta(cor) {
    if (typeof cor !== 'string' || cor.charCodeAt(0) !== 35) return cor;  // rgba(), nomes
    const achado = cacheCor.get(cor);
    if (achado) return achado;
    const r = parseInt(cor.slice(1, 3), 16);
    const g = parseInt(cor.slice(3, 5), 16);
    const b = parseInt(cor.slice(5, 7), 16);
    let melhor = cor;
    let menor = Infinity;
    for (let i = 0; i < PALETA_LPC.length; i++) {
      const p = PALETA_LPC[i];
      // distancia com peso: o olho separa verde melhor que azul, entao comparar
      // R, G e B com o mesmo peso troca cor por cor visivelmente diferente.
      const rm = (r + p[0]) / 2;
      const d = (2 + rm / 256) * (r - p[0]) * (r - p[0])
        + 4 * (g - p[1]) * (g - p[1])
        + (2 + (255 - rm) / 256) * (b - p[2]) * (b - p[2]);
      if (d < menor) { menor = d; melhor = p[3]; }
    }
    cacheCor.set(cor, melhor);
    return melhor;
  }
  const U = 32 / 128; // = 0.25

  // O tamanho de UM pixel da arte, na malha fina.
  //
  // Medi as corridas de cor num print do Gather (referencias/11-MESA-...png):
  // 5, 10, 15, 35, 40, 80 - **todas multiplas de 5**, que e o tamanho de um
  // pixel dele naquele zoom. Ou seja: a arte dele tem ~32 pixels por tile.
  // Medindo a nossa do mesmo jeito, a corrida mais comum era **1** - um quinto
  // de pixel de mundo. Estava tudo desenhado quatro vezes mais fino que a
  // referencia, e por isso ficava com pixel demais: detalhe miudo, ocupado, sem
  // o degrau grosso que faz uma coisa parecer sprite.
  //
  // Com 128 unidades por tile, 4 unidades = 1 pixel de arte = os 32 por tile
  // da referencia. Encaixar aqui vale pra tudo de uma vez: qArred, qContorno e
  // blob desembocam todos em q.
  const PX = 4;
  const enc = (v) => Math.round(v / PX) * PX;
  const encTam = (v) => Math.max(PX, Math.round(v / PX) * PX);

  function q(ctx, x, y, ax, ay, aw, ah, cor) {
    // largura ou altura nao-positiva nao desenha nada. Antes o fillRect ja
    // engolia isso sozinho; agora que existe um minimo de um pixel, sem esta
    // guarda um `aw - recuo * 2` negativo do qArred viraria uma lasca visivel.
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = naPaleta(cor);
    ctx.fillRect(x + enc(ax) * U, y + enc(ay) * U, encTam(aw) * U, encTam(ah) * U);
  }

  // Retangulo com canto arredondado, em unidades finas.
  function qArred(ctx, x, y, ax, ay, aw, ah, raio, cor) {
    for (let i = 0; i < ah; i++) {
      const d = Math.min(i, ah - 1 - i);
      const recuo = d < raio ? raio - d : 0;
      q(ctx, x, y, ax + recuo, ay + i, aw - recuo * 2, 1, cor);
    }
  }

  // Elipse em degraus, na grade fina. Serve pra copa de arvore, arbusto e pedra:
  // circulo de verdade (ctx.arc) sai liso e vetorial, que e o que destoava do
  // resto da arte. Em degraus de `passo` unidades fica com cara de sprite.
  function blob(ctx, x, y, cx, cy, rw, rh, cor, passo) {
    const p2 = passo || 6;
    for (let dy = -rh; dy < rh; dy += p2) {
      const t = (dy + p2 / 2) / rh;
      const larg = Math.round((rw * Math.sqrt(Math.max(0, 1 - t * t))) / p2) * p2;
      if (larg <= 0) continue;
      q(ctx, x, y, cx - larg, cy + dy, larg * 2, p2, cor);
    }
  }

  // Contorno arredondado (so a casca), pra dar o traco escuro dos sprites.
  function qContorno(ctx, x, y, ax, ay, aw, ah, raio, cor) {
    for (let i = 0; i < ah; i++) {
      const d = Math.min(i, ah - 1 - i);
      const recuo = d < raio ? raio - d : 0;
      const larg = aw - recuo * 2;
      const dProx = Math.min(i + 1, ah - 2 - i);
      const recuoProx = dProx < raio ? raio - dProx : 0;
      if (i === 0 || i === ah - 1 || recuo !== recuoProx) {
        q(ctx, x, y, ax + recuo, ay + i, larg, 1, cor);
      } else {
        q(ctx, x, y, ax + recuo, ay + i, 1, 1, cor);
        q(ctx, x, y, ax + aw - recuo - 1, ay + i, 1, 1, cor);
      }
    }
  }

  // Caixa com contorno de 1px, tampo claro em cima e sombra embaixo.
  // Na grade fina: contorno arredondado, corpo, fio de luz no topo e sombra na
  // base. `ax..ah` em unidades de 0..128.
  function caixa(ctx, x, y, ax, ay, aw, ah, base, claro, escuro, raio) {
    const rr = raio == null ? 4 : raio;
    qContorno(ctx, x, y, ax, ay, aw, ah, rr, TRACO);
    qArred(ctx, x, y, ax + 2, ay + 2, aw - 4, ah - 4, Math.max(0, rr - 1), base);
    if (claro) q(ctx, x, y, ax + 5, ay + 3, aw - 10, 3, claro);
    if (escuro) q(ctx, x, y, ax + 5, ay + ah - 7, aw - 10, 3, escuro);
  }

  // Monitor no grid fino. `ax/ay` sao o canto em unidades de 1/64 do tile.
  // `inclinacao` -1/1 abaixa o lado de fora, dando o "V" dos dois monitores da
  // referencia; 0 desenha reto.
  function monitor(ctx, x, y, ax, ay, aw, ah, tema, inclinacao) {
    const t = tema || {};
    const telaEscura = t.telaEscura || '#2f8fc4';
    const telaClara = t.tela || '#4fb3dd';
    const bloco = t.bloco || '#f4fcff';
    const inc = inclinacao || 0;
    // quanto cada coluna desce (o lado de fora fica mais baixo)
    const queda = (col) => (inc === 0 ? 0 : Math.round((inc > 0 ? col : (aw - 1 - col)) * 5 / aw));

    const bordaTela = 7;              // espessura da moldura
    const alturaTela = ah - 20;       // sobra pra aba de baixo do monitor

    for (let i = 0; i < aw; i++) {
      const oy = ay + queda(i);
      // canto arredondado: as colunas das pontas comecam mais abaixo
      const dPonta = Math.min(i, aw - 1 - i);
      const recuo = dPonta < 3 ? 3 - dPonta : 0;

      q(ctx, x, y, ax + i, oy + recuo, 1, ah - recuo * 2, '#4e5a72');            // contorno
      if (i >= 2 && i < aw - 2) {
        const r2 = Math.max(0, recuo - 1);
        q(ctx, x, y, ax + i, oy + 2 + r2, 1, ah - 4 - r2 * 2, '#dee4ee');        // moldura
        q(ctx, x, y, ax + i, oy + 2 + r2, 1, 2, '#f8fafd');                      // luz no topo
        q(ctx, x, y, ax + i, oy + ah - 4 - r2, 1, 2, '#aeb8c8');                 // sombra na base
      }
      if (i >= bordaTela && i < aw - bordaTela) {
        q(ctx, x, y, ax + i, oy + bordaTela, 1, alturaTela, telaEscura);
        q(ctx, x, y, ax + i, oy + bordaTela, 1, Math.round(alturaTela * 0.5), telaClara);
        q(ctx, x, y, ax + i, oy + bordaTela, 1, 1, '#1f6c99');                   // sombra interna
      }
    }

    // "interface" na tela: barra de titulo com bolinhas, painel grande e coluna
    const t0 = bordaTela + 3;
    const tw = aw - bordaTela * 2 - 6;
    for (let i = t0; i < t0 + tw; i++) {
      const oy = ay + queda(i);
      const rel = i - t0;
      q(ctx, x, y, ax + i, oy + bordaTela + 3, 1, 5, bloco);                     // barra de titulo
      if (rel < tw * 0.62) {
        q(ctx, x, y, ax + i, oy + bordaTela + 11, 1, 10, bloco);                 // painel grande
        if (rel < tw * 0.45) q(ctx, x, y, ax + i, oy + bordaTela + 24, 1, 4, bloco);
        if (rel < tw * 0.3) q(ctx, x, y, ax + i, oy + bordaTela + 30, 1, 4, bloco);
      } else if (rel > tw * 0.68) {
        q(ctx, x, y, ax + i, oy + bordaTela + 11, 1, 23, bloco);                 // coluna lateral
      }
    }
    // pontinhos da barra de titulo
    [0, 4, 8].forEach((d, k) => {
      const col = t0 + 2 + d;
      q(ctx, x, y, ax + col, ay + queda(col) + bordaTela + 4, 3, 3,
        ['#e0705a', '#f0b45a', '#6cc07d'][k]);
    });
    // brilho diagonal no vidro
    for (let i = bordaTela + 1; i < Math.min(aw - bordaTela, bordaTela + 22); i++) {
      const oy = ay + queda(i);
      q(ctx, x, y, ax + i, oy + bordaTela + (i - bordaTela), 1, 5, 'rgba(255,255,255,0.16)');
    }

    // Pescoco e base. As duas medidas SEGUEM a largura da tela: um pe fixo de
    // 38 debaixo de um ultrawide de 172 dava 22% - a tela parecia equilibrada
    // num palito. E a base tinha 6 unidades de altura, quase um risco, sem
    // espessura nenhuma pra dizer que aquilo apoia em alguma coisa.
    const meio = Math.round(aw / 2);
    const baseY = ay + queda(meio) + ah;
    const pesc = Math.max(10, Math.round(aw * 0.09));
    const bw = Math.max(46, Math.round(aw * 0.40));
    const px0 = ax + meio - Math.round(pesc / 2);
    const bx0 = ax + meio - Math.round(bw / 2);

    q(ctx, x, y, px0, baseY - 2, pesc, 13, '#a7b1c2');            // pescoco
    q(ctx, x, y, px0, baseY - 2, 2, 13, '#ccd3de');               // luz na quina
    q(ctx, x, y, px0 + pesc - 2, baseY - 2, 2, 13, '#8793a6');    // sombra do outro lado

    // a base em duas faixas: o tampo dela e a frente, que e o que da espessura
    qArred(ctx, x, y, bx0, baseY + 9, bw, 9, 3, '#9aa5b8');
    q(ctx, x, y, bx0 + 3, baseY + 9, bw - 6, 3, '#c3cad6');
    qArred(ctx, x, y, bx0, baseY + 16, bw, 5, 2, '#6f7a8f');
  }

  // Teclado com fileiras de teclas e barra de espaco.
  // Redesenhado em multiplos de PX depois que a malha virou 32 pixels por tile.
  // As teclas tinham 4 de largura com passo 6: fora da grade, elas ora caiam no
  // mesmo pixel da vizinha ora deixavam vao dobrado, e a fileira inteira virava
  // um borrao. Agora e 4 de tecla, 4 de vao, e a altura fecha certinho em 32:
  // borda, duas fileiras, barra de espaco, borda.
  function teclado(ctx, x, y, ax, ay, aw) {
    const ah = 32;
    qContorno(ctx, x, y, ax, ay, aw, ah, 4, '#7b8699');
    qArred(ctx, x, y, ax + 4, ay + 4, aw - 8, ah - 8, 4, '#e5eaf2');
    q(ctx, x, y, ax + 4, ay + 4, aw - 8, 4, '#f9fbfd');        // luz no topo
    for (let fila = 0; fila < 2; fila++) {
      for (let i = 8; i < aw - 8; i += 8) {
        q(ctx, x, y, ax + i, ay + 8 + fila * 8, 4, 4, '#b5bfcd');
      }
    }
    q(ctx, x, y, ax + 16, ay + 24, aw - 32, 4, '#b5bfcd');     // barra de espaco
  }

  function mouse(ctx, x, y, ax, ay) {
    qContorno(ctx, x, y, ax, ay, 14, 20, 5, '#7b8699');
    qArred(ctx, x, y, ax + 1, ay + 1, 12, 18, 5, '#eef1f6');
    q(ctx, x, y, ax + 3, ay + 3, 3, 10, '#ffffff');   // brilho
    q(ctx, x, y, ax + 6, ay + 4, 2, 6, '#b5bfcd');    // rodinha
    q(ctx, x, y, ax + 2, ay + 9, 10, 1, '#cdd4df');   // divisao dos botoes
  }

  function caneca(ctx, x, y, ax, ay, cor) {
    const c = cor || '#e0705a';
    qContorno(ctx, x, y, ax, ay, 20, 20, 3, TRACO);
    qArred(ctx, x, y, ax + 2, ay + 2, 16, 16, 2, c);
    q(ctx, x, y, ax + 4, ay + 4, 4, 9, 'rgba(255,255,255,0.32)'); // brilho
    q(ctx, x, y, ax + 4, ay + 3, 12, 2, 'rgba(255,255,255,0.20)');
    q(ctx, x, y, ax + 20, ay + 5, 6, 10, TRACO); // asa
    q(ctx, x, y, ax + 22, ay + 7, 2, 6, c);
  }

  // Tampo compartilhado por todas as mesas, no padrao da referencia: superficie
  // branca e, na frente, o gaveteiro cinza com os puxadores. Sem contorno entre
  // celulas vizinhas, pra duas mesas encostadas virarem uma bancada so.
  // Medido na referencia (referencias/...154025.png): a mesa e uma placa lilas
  // clara e a faixa da frente ocupa ~1/4 da altura dela - bem mais grossa do que
  // eu tinha feito. Nela fica a gaveteira ocupando UM bloco numa ponta e o pe
  // na outra, nao um puxador por celula.
  const MESA_TAMPO = '#eceaf6';
  const MESA_TAMPO_LUZ = '#f7f6fc';
  const MESA_BORDA = '#a9b0c4';
  // Cores tiradas a conta-gotas da referencia (ver o mapa de faixas em
  // tampoDeMesa): a quina do tampo, o risco escuro embaixo dela, e o cinza
  // dos moveis que ficam no vao (gaveteira e pe).
  const MESA_QUINA = '#afbdd0';
  const MESA_RISCO = '#5f6f7c';
  const MESA_MOVEL = '#8695ad';
  // O vao NAO e um painel pintado: e o proprio carpete coberto por esta
  // sombra. Por isso e translucido - o piso ja foi desenhado embaixo.
  const MESA_SOMBRA_VAO = 'rgba(46,52,74,0.5)';

  function tampoDeMesa(ctx, x, y, TILE, b, gavetas) {
    // A mesa da referencia (referencias/10-MESA-closeup-gavetas-e-pe.png) ocupa
    // DUAS celulas na vertical, e cada uma faz um papel:
    //
    //   fileira de tras   -> so o tampo: e a "malha" onde os itens sao apoiados
    //   fileira da frente -> tampo + a mesa vista de frente, em tres faixas:
    //                        (1) a espessura do tampo,
    //                        (2) o vao escuro debaixo dele,
    //                        (3) dentro do vao, a GAVETEIRA numa ponta e o PE
    //                            na outra.
    //
    // E a faixa (2) que da a ilusao de 3D: sem ela a mesa fica chapada. E por
    // isso que gaveteira e pe saem so nas pontas do bloco (b.esq / b.dir): uma
    // bancada de 4 celulas tem uma gaveteira e um pe, nao quatro de cada.
    const topo = b.cima ? 8 : 0;

    if (!b.baixo) {
      // fileira de tras: tampo liso de ponta a ponta
      q(ctx, x, y, 0, topo, 128, 128 - topo, MESA_TAMPO);
      if (b.cima) {
        q(ctx, x, y, 0, topo, 128, 5, MESA_TAMPO_LUZ);
        q(ctx, x, y, 0, topo, 128, 2, MESA_BORDA);
      }
      if (b.esq) q(ctx, x, y, 0, topo, 2, 128 - topo, MESA_BORDA);
      if (b.dir) q(ctx, x, y, 126, topo, 2, 128 - topo, MESA_BORDA);
      return;
    }

    // Debaixo do tampo a gente ve o CHAO. So a gaveteira (numa ponta) e o pe (na
    // outra) sao solidos - no meio fica vazio, que e onde entram as pernas de
    // quem senta. Encher a faixa inteira de gaveta, como eu tinha feito, some
    // com o piso e a mesa vira um paredao.
    // Profundidade, medida em referencias/11-MESA-cadeira-closeup.png com a
    // cadeira como regua: a mesa tem **1,6 tile de fundo**, dos quais 1,15 e
    // tampo e 0,45 e a frente. Isso nao cabe numa celula so - por isso a mesa
    // usa duas fileiras, e o quanto sobra pro tampo aqui depende de ter ou nao
    // outra mesa atras.
    // As faixas abaixo do tampo saiam de uma leitura pixel a pixel da
    // referencia (11-MESA-cadeira-closeup.png, coluna x=870, que cai no vao
    // entre a gaveteira e o pe da mesa da direita):
    //
    //   #efedf7         tampo
    //   #afbdd0  15px   a quina do tampo
    //   #5f6f7c   5px   o risco escuro logo abaixo dela
    //   #555f86  45px   <- o CHAO, so que na sombra da mesa
    //   #878dce         carpete no sol
    //
    // #555f86 dividido por #878dce da ~0,63: e o mesmo carpete multiplicado.
    // Nao existe painel fechando a frente da mesa - quem fecha sao a gaveteira
    // e o pe, e entre eles o piso continua aparecendo.
    const temMesaAtras = !b.cima;
    const FIM_TAMPO = temMesaAtras ? 24 : 72;
    const FIM_QUINA = FIM_TAMPO + 13;      // 15px na referencia
    const FIM_RISCO = FIM_QUINA + 4;       // 5px na referencia
    const CHAO = temMesaAtras ? FIM_RISCO + 38 : 110;

    // (0) tampo
    q(ctx, x, y, 0, topo, 128, FIM_TAMPO - topo, MESA_TAMPO);
    if (b.cima) {
      q(ctx, x, y, 0, topo, 128, 5, MESA_TAMPO_LUZ);
      q(ctx, x, y, 0, topo, 128, 2, MESA_BORDA);
    }

    // (1) a quina do tampo: a espessura da placa, vista de frente
    q(ctx, x, y, 0, FIM_TAMPO, 128, FIM_QUINA - FIM_TAMPO, MESA_QUINA);
    q(ctx, x, y, 0, FIM_QUINA, 128, FIM_RISCO - FIM_QUINA, MESA_RISCO);

    // (2) o vao: aqui NAO se pinta nada por cima do piso, so se escurece. E
    //     esse pedaco de carpete na sombra que faz a mesa parecer suspensa.
    q(ctx, x, y, 0, FIM_RISCO, 128, CHAO - FIM_RISCO, MESA_SOMBRA_VAO);

    if (gavetas !== false) {
      // (3) dentro do vao ficam os dois unicos volumes solidos: a GAVETEIRA,
      //     que ocupa um bloco (a ponta esquerda), e o PE, uma coluna
      //     estreita na outra ponta. O meio da bancada fica vazado.
      const gy = FIM_RISCO;
      const gh = CHAO - FIM_RISCO - 4;   // os ultimos 4 sao so sombra no chao
      if (b.esq) {
        // A gaveteira nao e uma placa lisa. Ampliando a referencia ela e uma
        // moldura escura com tres pecas dentro: uma coluna estreita em cada
        // ponta (as laterais do movel) e, no meio, a face das duas gavetas -
        // cada uma com um puxador curto e centralizado.
        const GX = 7, GW = 118;
        q(ctx, x, y, GX, gy, GW, gh, MESA_RISCO);               // a moldura
        q(ctx, x, y, GX + 5, gy + 1, 8, gh - 2, MESA_MOVEL);    // lateral esquerda
        q(ctx, x, y, GX + 108, gy + 1, 7, gh - 2, MESA_MOVEL);  // lateral direita

        const fx = GX + 17, fw = 85;                            // a face das gavetas
        q(ctx, x, y, fx, gy + 1, fw, gh - 2, MESA_MOVEL);
        q(ctx, x, y, fx, gy + 4, fw, 5, MESA_RISCO);            // fresta de cima
        q(ctx, x, y, fx, gy + 18, fw, 3, MESA_RISCO);           // fresta entre as duas
        q(ctx, x, y, fx, gy + 29, fw, 5, MESA_RISCO);           // rodape
        const pux = fx + Math.round((fw - 17) / 2);
        q(ctx, x, y, pux, gy + 9, 17, 4, MESA_RISCO);           // puxador da de cima
        q(ctx, x, y, pux, gy + 21, 17, 4, MESA_RISCO);          // puxador da de baixo
      }
      if (b.dir) {
        q(ctx, x, y, 101, gy, 14, gh, MESA_MOVEL);
        q(ctx, x, y, 101, gy + 29, 14, 5, MESA_RISCO);
      }
    }

    // contorno so onde a bancada termina
    if (b.esq) q(ctx, x, y, 0, topo, 2, FIM_QUINA - topo, MESA_BORDA);
    if (b.dir) q(ctx, x, y, 126, topo, 2, FIM_QUINA - topo, MESA_BORDA);
  }

  // Monitor visto por tras: e o que se ve numa mesa virada pra cima da tela
  // (quem usa senta acima e a tela olha pra ele, nao pra nos).
  // Estes dois nao sao mais usados pela mesa (ela vem vazia agora) - ficam pro
  // catalogo de itens, onde monitor de perfil e de costas fazem sentido pra quem
  // senta de lado. Ver docs/plano-mesa-pessoal.md, secao 4.
  function monitorDeCostas(ctx, x, y, ax, ay, aw, ah) {
    qContorno(ctx, x, y, ax, ay, aw, ah, 4, '#4e5a72');
    qArred(ctx, x, y, ax + 1, ay + 1, aw - 2, ah - 2, 4, '#aab3c4');
    q(ctx, x, y, ax + 3, ay + 3, aw - 6, 3, '#c9d0dc');          // luz no topo
    q(ctx, x, y, ax + 3, ay + ah - 6, aw - 6, 3, '#8b95a8');     // sombra na base
    // grade de ventilacao
    for (let i = ax + 10; i < ax + aw - 10; i += 7) {
      q(ctx, x, y, i, ay + 10, 2, ah - 22, 'rgba(78,90,114,0.28)');
    }
    const meio = Math.round(aw / 2);
    qArred(ctx, x, y, ax + meio - 11, ay + Math.round(ah / 2) - 7, 22, 14, 3, '#98a2b5');
    q(ctx, x, y, ax + meio - 4, ay + ah - 2, 8, 11, '#a7b1c2');  // pescoco
    q(ctx, x, y, ax + meio - 4, ay + ah - 2, 2, 11, '#ccd3de');
    qArred(ctx, x, y, ax + meio - 19, ay + ah + 9, 38, 6, 2, '#8e99ad'); // base
    q(ctx, x, y, ax + meio - 17, ay + ah + 9, 34, 2, '#bcc4d1');
  }

  // Monitor de perfil, pras mesas viradas pros lados. `paraDireita` = a tela
  // olha pra direita (ou seja, quem usa senta a direita da mesa).
  // Monitor VIRADO, nao de perfil. Antes isto tinha 15 unidades de largura -
  // menos de quatro pixels - e saia uma lamina: nao dava pra ver que era
  // monitor. Agora aparece a lateral escura de um lado e o painel com a tela
  // do outro, que e como a referencia resolve um movel virado: ela nao desenha
  // a espessura de verdade, poe as duas faces lado a lado.
  function monitorDeLado(ctx, x, y, ax, ay, ah, paraDireita) {
    const lateral = 12;
    const painel = 28;
    const aw = lateral + painel;
    const lx = paraDireita ? ax : ax + painel;      // a lateral que aparece
    const px = paraDireita ? ax + lateral : ax;     // a face com a tela

    q(ctx, x, y, lx, ay, lateral, ah, '#5f6a80');
    q(ctx, x, y, lx, ay, lateral, 4, '#7b8699');    // luz no topo da lateral

    qContorno(ctx, x, y, px, ay, painel, ah, 4, '#4e5a72');
    qArred(ctx, x, y, px + 4, ay + 4, painel - 8, ah - 8, 4, '#dee4ee');
    q(ctx, x, y, px + 8, ay + 8, painel - 16, ah - 24, '#2f8fc4');
    q(ctx, x, y, px + 8, ay + 8, painel - 16, Math.round((ah - 24) / 8) * 4, '#4fb3dd');

    const meio = ax + Math.round(aw / 8) * 4;
    q(ctx, x, y, meio - 4, ay + ah, 8, 12, '#a7b1c2');              // pescoco
    qArred(ctx, x, y, meio - 16, ay + ah + 12, 32, 8, 4, '#8e99ad'); // base
    q(ctx, x, y, meio - 12, ay + ah + 12, 24, 4, '#bcc4d1');
  }

  function bordasDoMovel(tiles, r, c, tipo) {
    return {
      cima: !(tiles[r - 1] && tiles[r - 1][c] === tipo),
      baixo: !(tiles[r + 1] && tiles[r + 1][c] === tipo),
      esq: tiles[r][c - 1] !== tipo,
      dir: tiles[r][c + 1] !== tipo,
    };
  }

  // Trava de re-entrada da regra do muro: o desenho do movel chama esta mesma
  // funcao de novo, e sem isto ela cairia na regra outra vez, pra sempre.
  let dentroDaRegraDoMuro = false;

  function drawObstacleTile(ctx, c, r, type, TILE, tiles) {
    const x = c * TILE, y = r * TILE;
    const M = OfficeMap;
    const meio = TILE / 2;

    if (!tiles) tiles = M.tiles;

    // REGRA DO MURO: movel encostado na linha do muro nunca apaga o muro.
    //
    // O mapa encosta estante, geladeira e balcao ESCREVENDO nas celulas do muro
    // - o tile do movel substitui o da parede, e o muro ficava com um vao ali.
    // Pintar o muro so por baixo nao resolve: o movel e opaco e ocupa a celula
    // toda. Entao vai em sanduiche: muro embaixo, movel no meio, e a FACE do
    // muro por cima. O movel encosta no muro em vez de virar o muro.
    if (type !== M.PAREDE && !dentroDaRegraDoMuro && movelNoMuro(tiles, r, c)) {
      const bm = bordasMuro(tiles, r, c);
      pintarMuro(ctx, x, y, bm);
      dentroDaRegraDoMuro = true;                       // trava a re-entrada
      try {
        drawObstacleTile(ctx, c, r, type, TILE, tiles); // o movel
      } finally {
        dentroDaRegraDoMuro = false;
      }
      faceDoMuro(ctx, x, y, bm);
      return;
    }

    // Arte do pacote LPC primeiro; o desenho a mao abaixo e o reserva. Enquanto
    // a folha nao chegou (ou a peca nao tem sprite) isto devolve false e o mapa
    // sai desenhado como antes, em vez de sair com buraco.
    // Creditos: public/assets/lpc-moveis/CREDITS.md
    if (window.Sprites
        && Sprites.desenhar(ctx, c, r, type, TILE, tiles, dentroDaRegraDoMuro)) {
      // Conteudo desenhado POR CIMA da arte do pacote.
      //
      // A lousa do pacote e uma moldura vazia e a TV e uma tela apagada: as
      // duas leem como "nada" na parede da sala de reuniao. A moldura e o
      // aparelho vem do pacote, que e o que da a forma certa; o que esta
      // ESCRITO neles e desenhado, porque conteudo de tela nenhum pacote traz.
      if (type === M.LOUSA) escritaNaLousa(ctx, x, y);
      else if (type === M.TV) telaLigada(ctx, x, y, posicaoNaTV(tiles, c, r));
      return;
    }

    if (type === M.PAREDE) {
      // parede cinza-azulada escura, como as divisorias do Gather.
      // As bordas olham `ehMuroVisual`, e nao so `ehParede`: assim o movel
      // encostado na linha do muro conta como muro, e o risco de borda nao
      // aparece de cada lado dele.
      pintarMuro(ctx, x, y, bordasMuro(tiles, r, c));

    } else if (M.MESAS_DIRECIONAIS.has(type)) {
      // A placa da mesa e sempre a mesma: a camera olha de cima e do sul, entao
      // a face vertical aparece embaixo em qualquer mesa. O que muda com a
      // direcao e de que lado fica quem usa - logo, onde ficam o computador e as
      // gavetas, e se a gente ve a tela ou a traseira dela.
      const b = bordasDoMovel(tiles, r, c, type);
      const direcao = M.DIRECAO_MESA[type];
      // Um posto por mesa, nao um por celula: sem isso uma mesa de 3 tiles vira
      // tres computadores lado a lado, e a referencia mostra UMA pessoa por
      // mesa. Conta quantas celulas iguais tem a esquerda e so equipa a do meio
      // de cada trio - numa bancada longa isso vira um posto a cada 3 tiles.
      let recuo = 0;
      while (tiles[r] && tiles[r][c - recuo - 1] === type) recuo++;
      // ...e so na fileira da FRENTE (`b.baixo` = nao tem mesa embaixo). O
      // monitor dessa fileira ja avanca pro tile de tras, entao equipar as duas
      // daria dois computadores empilhados na mesma mesa.
      // gavetas ficam do lado de quem usa: numa mesa virada pra cima elas
      // caem atras da placa e nao aparecem
      tampoDeMesa(ctx, x, y, TILE, b, direcao !== 'down');

      // A mesa vem VAZIA de proposito. O computador desenhado dentro do tile
      // era o mesmo pra todo mundo e nao dava pra tirar - agora quem senta poe o
      // que quiser pela camada de objetos, que e o que faz a mesa ser dela.

    } else if (type === M.MESA_REUNIAO) {
      const b = bordasDoMovel(tiles, r, c, type);
      // sem emenda entre tiles vizinhos: so a fileira de baixo ganha sombra/borda
      const altura = b.baixo ? 116 : 128;
      if (b.baixo) q(ctx, x, y, 4, 116, 120, 8, 'rgba(45,50,64,0.20)');
      // BRANCA, nao de madeira: a mesa de conferencia da referencia (172825) e
      // as das salas de reuniao (172704) sao claras.
      q(ctx, x, y, 0, 0, 128, altura, '#e8eaf1'); // tampo
      q(ctx, x, y, 0, 0, 128, altura, 'rgba(0,0,0,0)');
      // veio da madeira, so na horizontal, pra nao virar xadrez
      for (let i = 12; i < altura - 8; i += 26) {
        q(ctx, x, y, 6, i, 116, 2, 'rgba(150,158,175,0.16)');
      }
      if (b.cima) q(ctx, x, y, 0, 0, 128, 8, '#f7f8fc');
      if (b.baixo) q(ctx, x, y, 0, altura - 10, 128, 6, '#c9cedb');
      const contorno = 'rgba(130,138,156,0.60)';
      if (b.cima) q(ctx, x, y, 0, 0, 128, 3, contorno);
      if (b.baixo) q(ctx, x, y, 0, altura - 3, 128, 3, contorno);
      if (b.esq) q(ctx, x, y, 0, 0, 3, altura, contorno);
      if (b.dir) q(ctx, x, y, 125, 0, 3, altura, contorno);

    } else if (type === M.SOFA_CIMA || type === M.SOFA_BAIXO) {
      // SOFA_CIMA e SOFA_BAIXO sao o MESMO sofa virado, nao duas metades: um
      // tem o encosto em cima, o outro embaixo. Por isso as bordas olham o
      // mesmo tipo - dois sofas de costas um pro outro nao devem se emendar.
      const b = bordasDoMovel(tiles, r, c, type);
      const encostoEmCima = type === M.SOFA_CIMA;
      // recepcao usa sofa azul (como o Lobby do Gather); o lounge, marrom
      const sala = OfficeMap.getRoomAtTile(c, r);
      const paleta = (sala && sala.id === 'entrada')
        ? { base: '#7d93bf', escuro: '#41537a', encosto: '#5a6f9e', claro: '#9db0d3' }
        : { base: '#c99566', escuro: '#8a5931', encosto: '#a97244', claro: '#dcab7c' };

      const corpoY = 8; // topo do sofa na grade fina
      const corpoH = 108;
      // Onde o sofa continua na celula vizinha, o corpo vai ate a borda do
      // tile: senao sobrava uma faixa de chao no meio do proprio sofa.
      const preencheY = b.cima ? corpoY : 0;
      const preencheAte = b.baixo ? corpoY + corpoH : 128;
      if (b.baixo) q(ctx, x, y, 4, 120, 120, 6, 'rgba(45,50,64,0.18)'); // sombra no chao

      q(ctx, x, y, 0, preencheY, 128, preencheAte - preencheY, paleta.base);

      // encosto: faixa bem mais escura que o assento, senao o sofa vira balcao
      const encY = encostoEmCima ? corpoY : corpoY + corpoH - 46;
      q(ctx, x, y, 0, encY, 128, 46, paleta.escuro);
      q(ctx, x, y, 0, encostoEmCima ? encY + 3 : encY + 41, 128, 3, paleta.claro);
      // almofadas do encosto, uma por tile, com vinco entre elas
      qArred(ctx, x, y, 8, encY + 8, 112, 30, 6, paleta.encosto);
      q(ctx, x, y, 12, encY + 10, 104, 2, 'rgba(255,255,255,0.18)');

      // Braco nas PONTAS da fileira. Sem eles o sofa lia como um balcao
      // estofado: e o braco que fecha a peca e diz onde ela comeca e acaba.
      // Um sofa de 3 tiles tem braco no primeiro e no ultimo, e nada no meio.
      if (b.esq) {
        qArred(ctx, x, y, 0, encostoEmCima ? corpoY + 40 : corpoY, 22, 68, 6, paleta.escuro);
        q(ctx, x, y, 4, (encostoEmCima ? corpoY + 40 : corpoY) + 6, 14, 4, paleta.claro);
      }
      if (b.dir) {
        qArred(ctx, x, y, 106, encostoEmCima ? corpoY + 40 : corpoY, 22, 68, 6, paleta.escuro);
        q(ctx, x, y, 110, (encostoEmCima ? corpoY + 40 : corpoY) + 6, 14, 4, paleta.claro);
      }

      // uma almofada de assento por tile: o vao cai na emenda entre os tiles,
      // que e o que faz parecer sofa e nao uma frente de gavetas
      const assY = encostoEmCima ? corpoY + 50 : corpoY + 10;
      q(ctx, x, y, 6, assY + 44, 116, 6, 'rgba(0,0,0,0.16)'); // sombra sob a almofada
      qArred(ctx, x, y, 6, assY, 116, 46, 10, paleta.base);
      q(ctx, x, y, 16, assY + 3, 96, 3, 'rgba(255,255,255,0.26)'); // luz na quina

      // bracos so nas pontas livres do sofa
      if (b.esq) {
        qArred(ctx, x, y, 0, corpoY, 22, corpoH, 5, paleta.escuro);
        q(ctx, x, y, 3, corpoY + 4, 16, 3, paleta.claro);
      }
      if (b.dir) {
        qArred(ctx, x, y, 106, corpoY, 22, corpoH, 5, paleta.escuro);
        q(ctx, x, y, 109, corpoY + 4, 16, 3, paleta.claro);
      }

      // contorno so onde o sofa termina
      if (b.cima) q(ctx, x, y, 0, corpoY, 128, 2, TRACO);
      if (b.baixo) q(ctx, x, y, 0, corpoY + corpoH - 2, 128, 2, TRACO);
      if (b.esq) q(ctx, x, y, 0, corpoY, 2, corpoH, TRACO);
      if (b.dir) q(ctx, x, y, 126, corpoY, 2, corpoH, TRACO);

    } else if (type === M.TAPETE) {
      const b = bordasDoMovel(tiles, r, c, type);
      // O desenho tem que sobreviver ao TAMANHO REAL. Um tile de 128 unidades
      // finas vira 32 pixels na tela, ou seja 4 unidades = 1 pixel: a trama
      // antiga era de pontinhos de 6 unidades, que viravam UM pixel e meio e
      // sumiam. De longe o tapete era um bloco de cor chapado.
      //
      // Agora nada tem menos de 16 unidades (4 pixels na tela), e o losango usa
      // a posicao GLOBAL da celula pra continuar de um tile pro outro - senao
      // cada tile repetiria o mesmo desenho e apareceria a emenda.
      q(ctx, x, y, 0, 0, 128, 128, '#c9a184');

      const gx = c * 128;
      const gy = r * 128;
      for (let i = 0; i < 128; i += 16) {
        for (let j = 0; j < 128; j += 16) {
          // losango: pinta onde a soma das coordenadas globais cai no ritmo
          const sx = (gx + j) / 16;
          const sy = (gy + i) / 16;
          if ((sx + sy) % 4 === 0) q(ctx, x, y, j, i, 16, 16, '#b98c6d');
          else if ((sx - sy + 400) % 4 === 0) q(ctx, x, y, j, i, 16, 16, '#d8b294');
        }
      }

      // Debrum: faixa larga na volta, com um fio claro por dentro. E o que faz
      // ler como tapete e nao como mancha no chao.
      const debrum = '#8a5c43';
      if (b.cima) { q(ctx, x, y, 0, 0, 128, 16, debrum); q(ctx, x, y, 0, 20, 128, 4, '#e4c4a8'); }
      if (b.baixo) { q(ctx, x, y, 0, 112, 128, 16, debrum); q(ctx, x, y, 0, 104, 128, 4, '#e4c4a8'); }
      if (b.esq) { q(ctx, x, y, 0, 0, 16, 128, debrum); q(ctx, x, y, 20, 0, 4, 128, '#e4c4a8'); }
      if (b.dir) { q(ctx, x, y, 112, 0, 16, 128, debrum); q(ctx, x, y, 104, 0, 4, 128, '#e4c4a8'); }

    } else if (type === M.MESA_CENTRO) {
      // O tampo fica ALTO e menor, pra o pe aparecer embaixo dele: centrado e
      // grande, ele cobria o proprio pe e a mesa virava um disco no chao.
      q(ctx, x, y, 28, 104, 72, 8, 'rgba(120,100,70,0.20)'); // sombra
      q(ctx, x, y, 56, 72, 16, 32, '#8a6242'); // pe central
      qArred(ctx, x, y, 40, 96, 48, 12, 4, '#7d5327'); // base do pe
      blob(ctx, x, y, 64, 48, 48, 36, '#7d5327', 4); // borda grossa do tampo
      blob(ctx, x, y, 64, 46, 42, 30, '#c99565', 4); // tampo
      blob(ctx, x, y, 56, 38, 20, 12, '#e0b98a', 4);

    } else if (type === M.ESTANTE) {
      const LIVROS = ['#e05a5a', '#5a86d0', '#e0a25a', '#5ab07a', '#a76fd0', '#4ec0c0'];
      q(ctx, x, y, 6, 118, 116, 6, 'rgba(45,50,64,0.18)'); // sombra no chao

      qContorno(ctx, x, y, 2, 6, 124, 116, 4, TRACO);
      qArred(ctx, x, y, 4, 8, 120, 112, 3, '#5e6678'); // caixa
      q(ctx, x, y, 6, 10, 116, 3, '#79839a'); // luz no topo
      q(ctx, x, y, 6, 10, 4, 108, '#6b7488'); // lateral iluminada
      q(ctx, x, y, 118, 10, 4, 108, '#4b5266'); // lateral na sombra

      // tres prateleiras, cada uma com fundo escuro e livros de altura variada
      [16, 52, 88].forEach((prat, nivel) => {
        q(ctx, x, y, 10, prat, 108, 28, '#3b4152'); // vao escuro
        let bx = 13;
        let i = 0;
        while (bx < 112) {
          const larg = 7 + ((c + r + nivel + i) % 3) * 3;
          const alt = 20 + ((c * 3 + r + nivel + i) % 4) * 2;
          const cor = LIVROS[(i + c + r + nivel) % LIVROS.length];
          q(ctx, x, y, bx, prat + 28 - alt, larg, alt, cor);
          q(ctx, x, y, bx, prat + 28 - alt, larg, 2, 'rgba(255,255,255,0.30)');
          q(ctx, x, y, bx + larg - 1, prat + 28 - alt, 1, alt, 'rgba(0,0,0,0.22)');
          bx += larg + 2;
          i++;
        }
        q(ctx, x, y, 8, prat + 28, 112, 4, '#474e5e'); // tabua
        q(ctx, x, y, 8, prat + 28, 112, 1, '#7d879d');
      });

    } else if (type === M.PLANTA) {
      // vasos coloridos (rosa/azul/roxo/teal), como a decoracao do Gather
      const VASOS = [['#e26aa5', '#f08cbd', '#b8477f'], ['#5a9fe0', '#7bb8ee', '#3f77b0'],
        ['#9b6fd6', '#b48ee6', '#7449b0'], ['#3fb0a5', '#5cc7bd', '#2d867e']];
      const vaso = VASOS[(c * 3 + r * 5) % VASOS.length];
      q(ctx, x, y, 38, 106, 52, 8, 'rgba(45,50,64,0.20)');
      // folhagem em blocos com contorno, no lugar dos circulos lisos
      [[36, 42], [72, 42], [54, 22], [54, 58]].forEach(([fx, fy]) => {
        blob(ctx, x, y, fx + 10, fy + 10, 18, 15, '#215a2f', 4);
        blob(ctx, x, y, fx + 10, fy + 9, 14, 11, '#3f8a4a', 4);
        blob(ctx, x, y, fx + 7, fy + 6, 7, 5, '#55a862', 4);
      });
      q(ctx, x, y, 61, 56, 5, 24, '#215a2f'); // caule
      caixa(ctx, x, y, 38, 76, 52, 38, vaso[0], vaso[1], vaso[2]);
      q(ctx, x, y, 42, 80, 44, 4, vaso[1]);

    } else if (type === M.ARVORE) {
      // arvore grande: a copa passa do tile (por isso e desenhada por ultimo)
      const CX = 64, BASE = 122;
      q(ctx, x, y, 24, BASE - 8, 80, 12, 'rgba(46,84,46,0.20)'); // sombra no chao
      q(ctx, x, y, 34, BASE - 4, 60, 4, 'rgba(46,84,46,0.14)');

      q(ctx, x, y, CX - 14, BASE - 54, 28, 54, '#7a5636'); // tronco
      q(ctx, x, y, CX - 14, BASE - 54, 8, 54, '#93694230'); // luz na esquerda
      q(ctx, x, y, CX + 4, BASE - 54, 10, 54, 'rgba(60,40,24,0.45)'); // sombra
      q(ctx, x, y, CX - 14, BASE - 34, 28, 3, 'rgba(60,40,24,0.35)'); // no da casca

      // copa em tres camadas: contorno escuro, corpo e luz em cima a esquerda
      blob(ctx, x, y, CX, BASE - 108, 66, 46, '#2c6636', 6);
      blob(ctx, x, y, CX - 34, BASE - 74, 40, 30, '#2c6636', 6);
      blob(ctx, x, y, CX + 34, BASE - 74, 40, 30, '#2c6636', 6);
      blob(ctx, x, y, CX, BASE - 108, 58, 39, '#3f8a4a', 6);
      blob(ctx, x, y, CX - 30, BASE - 74, 33, 24, '#3f8a4a', 6);
      blob(ctx, x, y, CX + 30, BASE - 74, 33, 24, '#3f8a4a', 6);
      blob(ctx, x, y, CX - 18, BASE - 122, 30, 20, '#5cae67', 6);
      blob(ctx, x, y, CX + 22, BASE - 100, 20, 14, '#5cae67', 6);
      blob(ctx, x, y, CX - 26, BASE - 96, 14, 10, '#74c47e', 6);

    } else if (type === M.QUADRO) {
      // moldura com paisagem: ceu, morro e sol
      qContorno(ctx, x, y, 12, 12, 104, 82, 3, '#6f5334');
      qArred(ctx, x, y, 14, 14, 100, 78, 2, '#a97f52'); // moldura
      q(ctx, x, y, 22, 22, 84, 62, '#f3efe6'); // passe-partout
      q(ctx, x, y, 26, 26, 76, 54, '#7fb3dd'); // ceu
      q(ctx, x, y, 26, 26, 76, 14, '#a3cdea');
      blob(ctx, x, y, 84, 40, 10, 10, '#f7d97a', 4); // sol
      // morros em degraus
      for (let i = 0; i < 9; i++) {
        q(ctx, x, y, 26 + i * 4, 62 - i * 4, 8, 4 + i * 4, '#5ba86a');
      }
      for (let i = 0; i < 8; i++) {
        q(ctx, x, y, 62 + i * 5, 54 + i * 3, 6, 26 - i * 3, '#468a55');
      }
      q(ctx, x, y, 26, 74, 76, 6, '#3f7a4a'); // chao
      q(ctx, x, y, 22, 84, 84, 4, '#8a6242'); // sombra sob o quadro

    } else if (type === M.LOUSA) {
      const b = bordasDoMovel(tiles, r, c, type);
      q(ctx, x, y, 0, 8, 128, 88, '#b5ab9b'); // moldura
      q(ctx, x, y, 0, 16, 128, 72, '#f8f7f2'); // quadro branco
      q(ctx, x, y, 0, 16, 128, 4, '#ffffff');
      q(ctx, x, y, 10, 30, 108, 5, '#7fb3dd'); // rabiscos
      q(ctx, x, y, 10, 44, 76, 5, '#d0785a');
      q(ctx, x, y, 10, 58, 92, 5, '#7fb3dd');
      q(ctx, x, y, 10, 72, 54, 5, '#8f97a8');
      q(ctx, x, y, 0, 88, 128, 8, '#9d9384'); // calha dos marcadores
      q(ctx, x, y, 24, 90, 18, 4, '#d0785a');
      q(ctx, x, y, 50, 90, 18, 4, '#4da3d6');
      const cont = 'rgba(110,100,88,0.7)';
      if (b.cima) q(ctx, x, y, 0, 8, 128, 3, cont);
      if (b.baixo) q(ctx, x, y, 0, 93, 128, 3, cont);
      if (b.esq) q(ctx, x, y, 0, 8, 3, 88, cont);
      if (b.dir) q(ctx, x, y, 125, 8, 3, 88, cont);

    } else if (type === M.ARMARIO) {
      // armario de duas portas, com puxadores e pes
      q(ctx, x, y, 8, 116, 112, 8, 'rgba(45,50,64,0.20)'); // sombra
      qContorno(ctx, x, y, 2, 6, 124, 112, 4, TRACO);
      qArred(ctx, x, y, 4, 8, 120, 108, 3, '#6a7286');
      q(ctx, x, y, 6, 10, 116, 4, '#8a94aa'); // luz no topo
      q(ctx, x, y, 6, 10, 5, 104, '#7d879d'); // lateral iluminada
      q(ctx, x, y, 117, 10, 5, 104, '#545b6d'); // lateral na sombra
      q(ctx, x, y, 62, 12, 4, 100, '#464d5e'); // fresta entre as portas
      // painel rebaixado de cada porta
      q(ctx, x, y, 14, 22, 42, 76, '#5f6779');
      q(ctx, x, y, 72, 22, 42, 76, '#5f6779');
      q(ctx, x, y, 14, 22, 42, 3, '#7d879d');
      q(ctx, x, y, 72, 22, 42, 3, '#7d879d');
      q(ctx, x, y, 48, 56, 6, 18, '#cfd5e2'); // puxadores
      q(ctx, x, y, 74, 56, 6, 18, '#cfd5e2');
      q(ctx, x, y, 12, 116, 14, 8, TRACO); // pes
      q(ctx, x, y, 102, 116, 14, 8, TRACO);

    } else if (type === M.BALCAO) {
      const b = bordasDoMovel(tiles, r, c, type);
      q(ctx, x, y, 0, 116, 128, 8, 'rgba(45,50,64,0.20)'); // sombra
      q(ctx, x, y, 0, 32, 128, 84, '#dfe2ea'); // corpo
      q(ctx, x, y, 0, 26, 128, 12, '#f7f9fc'); // tampo saliente
      q(ctx, x, y, 0, 38, 128, 3, '#b9c0cd'); // sombra sob o tampo
      q(ctx, x, y, 0, 100, 128, 12, '#a8aebd'); // rodape
      q(ctx, x, y, 0, 100, 128, 2, '#ffffff40');
      for (let i = 8; i < 128; i += 26) { // ripas verticais
        q(ctx, x, y, i, 48, 3, 46, '#c3c9d6');
        q(ctx, x, y, i + 3, 48, 2, 46, '#eef1f6');
      }
      if (b.cima) q(ctx, x, y, 0, 26, 128, 2, TRACO);
      if (b.baixo) q(ctx, x, y, 0, 114, 128, 2, TRACO);
      if (b.esq) q(ctx, x, y, 0, 26, 2, 90, TRACO);
      if (b.dir) q(ctx, x, y, 126, 26, 2, 90, TRACO);

    } else if (type === M.CERCA) {
      ctx.fillStyle = '#c99f70';
      q(ctx, x, y, 0, 42, 128, 14, '#c99f70'); // travessas
      q(ctx, x, y, 0, 42, 128, 3, '#ddb98c');
      q(ctx, x, y, 0, 53, 128, 3, '#a67f55');
      q(ctx, x, y, 0, 74, 128, 14, '#c99f70');
      q(ctx, x, y, 0, 74, 128, 3, '#ddb98c');
      q(ctx, x, y, 0, 85, 128, 3, '#a67f55');
      [14, 94].forEach((px) => { // mourões
        q(ctx, x, y, px, 18, 20, 94, '#a97f52');
        q(ctx, x, y, px, 18, 6, 94, '#c09062');
        q(ctx, x, y, px + 16, 18, 4, 94, '#8a6642');
        q(ctx, x, y, px, 18, 20, 4, '#d0a476'); // topo do mourão
      });
      q(ctx, x, y, 10, 108, 28, 6, 'rgba(60,66,82,0.18)');
      q(ctx, x, y, 90, 108, 28, 6, 'rgba(60,66,82,0.18)');

    } else if (type === M.JANELA) {
      // Janelao como o da referencia: caixilho ESCURO (azul-marinho quase
      // preto) e vidro verde-agua em painel grande - #a9e1d6 medido no print,
      // #a4dddb na paleta. O caixilho branco com vidro azul-bebe que havia lia
      // como janela de casa; o escuro com verde-agua e o de predio comercial.
      const b = bordasParede(tiles, r, c);
      q(ctx, x, y, 0, 0, 128, 128, MURO.corpo);
      if (b.cima) {
        q(ctx, x, y, 0, 0, 128, 24, MURO.topo);
        q(ctx, x, y, 0, 0, 128, 3, MURO.luz);
      }
      q(ctx, x, y, 0, 24, 128, 80, '#343043'); // caixilho
      q(ctx, x, y, 8, 32, 112, 64, '#a4dddb'); // vidro
      q(ctx, x, y, 8, 32, 112, 16, '#bde6e5'); // ceu refletido no alto
      // reflexo diagonal, em degraus
      for (let i = 0; i < 10; i++) {
        q(ctx, x, y, 20 + i * 4, 88 - i * 4, 8, 4, 'rgba(255,255,255,0.28)');
      }
      q(ctx, x, y, 60, 32, 8, 64, '#343043'); // montante
      q(ctx, x, y, 8, 60, 112, 4, '#343043'); // travessa
      if (b.baixo) {
        q(ctx, x, y, 0, 104, 128, 24, MURO.rodape);
        q(ctx, x, y, 0, 104, 128, 2, MURO.rodapeLuz);
      }

    } else if (type === M.AGUA) {
      const b = bordasDoMovel(tiles, r, c, type);
      // O lago da referencia e redondo, e o nosso era um retangulo azul. Cada
      // celula da beirada corta o canto EXTERNO - aquele onde as duas laterais
      // sao borda -, e o conjunto fecha numa poca arredondada. O recorte nao
      // pinta nada: so impede a agua de chegar ali, e o chao que ja foi
      // desenhado aparece.
      const L = 128 * U;
      const raio = 0.42 * L;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, L, L, [
        b.cima && b.esq ? raio : 0,
        b.cima && b.dir ? raio : 0,
        b.baixo && b.dir ? raio : 0,
        b.baixo && b.esq ? raio : 0,
      ]);
      ctx.clip();
      // Agua com FUNDO: escura no meio, clareando pra beira. Antes era uma cor
      // chapada com a metade de cima mais clara, o que dava um retangulo
      // pintado - a profundidade e o que faz ler como lago em vez de piscina.
      q(ctx, x, y, 0, 0, 128, 128, '#2b6b96');            // parte funda
      if (b.cima) {
        q(ctx, x, y, 0, 0, 128, 30, '#3f8fc9');
        q(ctx, x, y, 0, 0, 128, 12, '#5aa8d8');           // raso junto da margem
      }
      if (b.baixo) {
        q(ctx, x, y, 0, 98, 128, 30, '#3f8fc9');
        q(ctx, x, y, 0, 116, 128, 12, '#5aa8d8');
      }
      if (b.esq) {
        q(ctx, x, y, 0, 0, 30, 128, '#3f8fc9');
        q(ctx, x, y, 0, 0, 12, 128, '#5aa8d8');
      }
      if (b.dir) {
        q(ctx, x, y, 98, 0, 30, 128, '#3f8fc9');
        q(ctx, x, y, 116, 0, 12, 128, '#5aa8d8');
      }
      // marolas: menos e mais discretas que antes, so pra quebrar a cor lisa
      for (let i = 0; i < 3; i++) {
        const ox = ((c * 41 + r * 23 + i * 37) % 88) + 16;
        const oy = ((c * 29 + r * 53 + i * 43) % 96) + 16;
        q(ctx, x, y, ox, oy, 20, 2, 'rgba(255,255,255,0.20)');
        q(ctx, x, y, ox + 7, oy + 6, 10, 2, 'rgba(255,255,255,0.12)');
      }
      // carpa: corpo, cabeca clara e cauda
      if ((c + r) % 3 === 0) {
        const px = 40, py = 54;
        q(ctx, x, y, px, py, 34, 14, '#ef8a34');
        q(ctx, x, y, px + 4, py - 4, 22, 6, '#f6a75c');
        q(ctx, x, y, px + 30, py + 2, 12, 4, '#ef8a34');
        q(ctx, x, y, px + 38, py - 2, 8, 12, '#f6a75c');
        q(ctx, x, y, px + 8, py + 2, 8, 4, '#ffffff');
        q(ctx, x, y, px + 2, py + 4, 4, 4, TRACO);
      }
      // Espuma na margem, no lugar do risco escuro que tinha antes: agua nao faz
      // contorno escuro contra a grama, faz uma linha clara de arrebentacao.
      if (b.cima) q(ctx, x, y, 0, 0, 128, 4, 'rgba(233,246,252,0.75)');
      if (b.baixo) q(ctx, x, y, 0, 124, 128, 4, 'rgba(233,246,252,0.75)');
      if (b.esq) q(ctx, x, y, 0, 0, 4, 128, 'rgba(233,246,252,0.75)');
      if (b.dir) q(ctx, x, y, 124, 0, 4, 128, 'rgba(233,246,252,0.75)');
      ctx.restore();

    } else if (type === M.PEDRA) {
      q(ctx, x, y, 20, 96, 88, 12, 'rgba(52,62,52,0.20)'); // sombra no chao
      blob(ctx, x, y, 64, 62, 50, 40, '#6f767e', 6); // contorno escuro
      blob(ctx, x, y, 64, 60, 44, 34, '#9aa0a6', 6); // corpo
      blob(ctx, x, y, 52, 48, 24, 16, '#bcc2c8', 6); // facet iluminada
      q(ctx, x, y, 74, 62, 22, 4, 'rgba(60,68,76,0.35)'); // trinca
      q(ctx, x, y, 46, 74, 30, 4, 'rgba(60,68,76,0.25)');

    } else if (type === M.ARBUSTO) {
      q(ctx, x, y, 22, 104, 84, 10, 'rgba(46,84,46,0.18)');
      blob(ctx, x, y, 44, 76, 32, 26, '#2c6636', 6);
      blob(ctx, x, y, 86, 76, 32, 26, '#2c6636', 6);
      blob(ctx, x, y, 64, 56, 40, 32, '#2c6636', 6);
      blob(ctx, x, y, 44, 74, 26, 21, '#3f8a4a', 6);
      blob(ctx, x, y, 86, 74, 26, 21, '#3f8a4a', 6);
      blob(ctx, x, y, 64, 54, 33, 26, '#3f8a4a', 6);
      blob(ctx, x, y, 52, 44, 17, 12, '#5cae67', 6);
      q(ctx, x, y, 70, 62, 8, 6, '#e8577f'); // florzinha
      q(ctx, x, y, 88, 82, 6, 6, '#f0c65a');

    } else if (type === M.BANCO) {
      // banco de ripas com encosto, tipo praca
      q(ctx, x, y, 12, 106, 104, 8, 'rgba(45,50,64,0.20)');
      // MADEIRA, nao azul: os bancos da referencia sao de ripa de madeira, tanto
      // no lounge (172725) quanto em volta do lago (172749).
      caixa(ctx, x, y, 8, 20, 112, 30, '#a5743f', '#c99565', '#7d5327'); // encosto
      q(ctx, x, y, 14, 30, 100, 3, '#7d5327'); // fresta do encosto
      caixa(ctx, x, y, 8, 48, 112, 42, '#bd8a52', '#dcae76', '#96683a'); // assento
      q(ctx, x, y, 14, 62, 100, 3, '#96683a'); // ripas
      q(ctx, x, y, 14, 65, 100, 2, '#d2a171');
      q(ctx, x, y, 14, 76, 100, 3, '#96683a');
      q(ctx, x, y, 14, 79, 100, 2, '#d2a171');
      q(ctx, x, y, 16, 88, 12, 22, TRACO); // pes
      q(ctx, x, y, 100, 88, 12, 22, TRACO);

    } else if (type === M.CABIDE) {
      // Cabide de pe com dois casacos pendurados.
      //
      // Antes os casacos eram bolinhas de 16x18 unidades (4x4 pixels) presas em
      // ganchos de 6 unidades, um pixel e meio: na tela virava um bale de baloes
      // num palito. Casaco tem forma de casaco - ombro largo em cima, corpo
      // comprido descendo - e pra essa forma aparecer ela precisa de tamanho.
      q(ctx, x, y, 40, 108, 48, 8, 'rgba(60,66,82,0.18)');
      q(ctx, x, y, 48, 98, 32, 12, '#3b4152');                     // base
      q(ctx, x, y, 60, 20, 8, 80, '#4a5162');                      // haste
      q(ctx, x, y, 60, 20, 4, 80, '#626b80');                      // luz na haste
      q(ctx, x, y, 28, 28, 72, 8, '#4a5162');                      // travessa dos ganchos
      // casaco da esquerda
      q(ctx, x, y, 24, 32, 32, 12, '#d8a838');                     // ombros
      q(ctx, x, y, 28, 44, 24, 40, '#f0c65a');                     // corpo
      q(ctx, x, y, 28, 44, 8, 40, '#ffe08a');                      // dobra clara
      // casaco da direita
      q(ctx, x, y, 72, 32, 32, 12, '#b84848');                     // ombros
      q(ctx, x, y, 76, 44, 24, 44, '#e05a5a');                     // corpo
      q(ctx, x, y, 76, 44, 8, 44, '#f08080');                      // dobra clara

    } else if (type === M.IMPRESSORA) {
      q(ctx, x, y, 12, 106, 104, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 10, 38, 108, 70, '#7d879d', '#a5b0c4', '#5b6376');
      q(ctx, x, y, 22, 62, 84, 16, '#2c3240'); // fenda de saida
      q(ctx, x, y, 22, 62, 84, 3, '#1e232e');
      q(ctx, x, y, 26, 78, 76, 6, '#f7f8fc'); // papel saindo
      // bandeja de cima com pilha de papel
      q(ctx, x, y, 28, 22, 72, 18, '#f7f8fc');
      q(ctx, x, y, 28, 22, 72, 3, '#ffffff');
      q(ctx, x, y, 28, 38, 72, 3, '#c3c9d6');
      q(ctx, x, y, 92, 46, 12, 8, '#5ab07a'); // luz verde
      q(ctx, x, y, 20, 46, 34, 6, '#5b6376'); // painel

    } else if (type === M.CAVALETE) {
      q(ctx, x, y, 20, 112, 88, 8, 'rgba(45,50,64,0.18)');
      q(ctx, x, y, 22, 72, 10, 46, '#8a6242'); // pernas
      q(ctx, x, y, 96, 72, 10, 46, '#8a6242');
      q(ctx, x, y, 22, 72, 4, 46, '#a67c56');
      q(ctx, x, y, 30, 94, 68, 6, '#8a6242'); // travessa
      qContorno(ctx, x, y, 12, 10, 104, 66, 3, '#7d746a');
      q(ctx, x, y, 14, 12, 100, 62, '#f7f8fc'); // folha
      q(ctx, x, y, 14, 12, 100, 4, '#ffffff');
      // rabiscos do grafico
      q(ctx, x, y, 26, 48, 14, 20, '#4da3d6');
      q(ctx, x, y, 46, 36, 14, 32, '#4da3d6');
      q(ctx, x, y, 66, 26, 14, 42, '#e07a5f');
      q(ctx, x, y, 86, 42, 14, 26, '#f0c65a');
      q(ctx, x, y, 22, 68, 82, 3, '#b5ab9b'); // linha de base

    } else if (M.ASSENTOS.has(type) && type !== M.POLTRONA && type !== M.PUFE) {
      // POLTRONA e PUFE tambem sao assento, mas tem desenho proprio - sem estas
      // duas excecoes eles saiam como cadeira de escritorio.
      const vermelha = type === M.CADEIRA_VERMELHA || type === M.CADEIRA_VERMELHA_BAIXO
        || type === M.CADEIRA_VERMELHA_ESQ || type === M.CADEIRA_VERMELHA_DIR;
      const cores = vermelha
        ? ['#8f3b30', '#c0574a', '#5e211a']
        : ['#4a5162', '#6b7488', '#2b3040'];
      // A vermelha da referencia (172825) e POLTRONA, nao cadeira de escritorio
      // pintada de vermelho: e o que aparece em volta da mesa de conferencia.
      const desenhar = vermelha ? poltronaEstofada : cadeiraDeEscritorio;
      desenhar(ctx, x, y, TILE, cores[0], cores[1], cores[2], M.DIRECAO_ASSENTO[type]);

    // ---- variacoes do catalogo do decorador ----

    } else if (type === M.MESA_DUPLA) {
      // A mesa da referencia: dois monitores lado a lado, teclado e caneca.
      tampoDeMesa(ctx, x, y, TILE, bordasDoMovel(tiles, r, c, type));
      monitor(ctx, x, y, -6, -16, 70, 62, { tela: '#4fb3dd' }, -1);
      monitor(ctx, x, y, 64, -16, 70, 62, { tela: '#4aaad4' }, 1);
      teclado(ctx, x, y, 28, 56, 72);
      mouse(ctx, x, y, 106, 58);

    } else if (type === M.MESA_NOTEBOOK) {
      tampoDeMesa(ctx, x, y, TILE, bordasDoMovel(tiles, r, c, type));
      // tampa levantada
      qContorno(ctx, x, y, 32, 14, 68, 50, 3, TRACO);
      q(ctx, x, y, 34, 16, 64, 46, '#5b6376');
      q(ctx, x, y, 38, 20, 56, 38, '#3f7fb5');
      q(ctx, x, y, 42, 24, 32, 4, '#a7d8f0');
      q(ctx, x, y, 42, 32, 20, 4, '#a7d8f0');
      q(ctx, x, y, 42, 40, 26, 4, '#7fc0e8');
      q(ctx, x, y, 38, 20, 4, 38, 'rgba(255,255,255,0.32)'); // brilho na tela
      // base com teclado e trackpad
      qContorno(ctx, x, y, 28, 64, 76, 26, 3, TRACO);
      q(ctx, x, y, 30, 66, 72, 22, '#c9cfdd');
      for (let i = 34; i < 98; i += 8) q(ctx, x, y, i, 70, 5, 4, '#8f97a8');
      for (let i = 38; i < 94; i += 8) q(ctx, x, y, i, 76, 5, 4, '#8f97a8');
      q(ctx, x, y, 56, 82, 20, 4, '#8f97a8'); // trackpad
      caneca(ctx, x, y, 8, 72, '#e0705a');

    } else if (type === M.PLANTA_GRANDE) {
      // vaso alto, folhas grandes recortadas (estilo costela-de-adao)
      q(ctx, x, y, 28, 108, 72, 8, 'rgba(45,50,64,0.20)');
      q(ctx, x, y, 60, 48, 8, 32, '#1f5c30'); // caule
      [[22, 50], [76, 50], [46, 22], [18, 26], [78, 26], [48, 58]].forEach(([fx, fy]) => {
        blob(ctx, x, y, fx + 15, fy + 12, 22, 17, '#215a2f', 4); // contorno
        blob(ctx, x, y, fx + 15, fy + 11, 18, 13, '#2f7a41', 4);
        blob(ctx, x, y, fx + 11, fy + 7, 9, 6, '#49a35c', 4);
        q(ctx, x, y, fx + 14, fy + 4, 3, 16, '#1f5c30'); // nervura
      });
      caixa(ctx, x, y, 34, 76, 60, 40, '#b1704a', '#e0a07a', '#8a5334');
      q(ctx, x, y, 38, 80, 52, 5, '#c98358');

    } else if (type === M.VASO_FLORES) {
      q(ctx, x, y, 38, 104, 52, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 38, 72, 52, 40, '#d8dde8', '#f6f8fb', '#aeb4c4');
      q(ctx, x, y, 61, 38, 6, 36, '#3f8a4a'); // caule central
      q(ctx, x, y, 44, 52, 18, 4, '#3f8a4a');
      q(ctx, x, y, 66, 52, 18, 4, '#3f8a4a');
      [['#e8657f', 64, 26], ['#f0a83c', 38, 40], ['#c77fe0', 90, 40]].forEach(([cor, fx, fy]) => {
        blob(ctx, x, y, fx, fy, 15, 15, TRACO, 4);
        blob(ctx, x, y, fx, fy, 12, 12, cor, 4);
        q(ctx, x, y, fx - 4, fy - 4, 8, 8, '#fff3c4'); // miolo
      });

    } else if (type === M.CACTO) {
      q(ctx, x, y, 38, 104, 52, 8, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 48, 16, 32, 72, 6, TRACO);
      qArred(ctx, x, y, 50, 18, 28, 68, 5, '#4f9e5c'); // corpo
      q(ctx, x, y, 52, 22, 8, 60, '#6bbd78'); // luz
      qContorno(ctx, x, y, 20, 42, 26, 38, 6, TRACO);
      qArred(ctx, x, y, 22, 44, 22, 34, 5, '#4f9e5c'); // braco esquerdo
      qContorno(ctx, x, y, 82, 34, 26, 40, 6, TRACO);
      qArred(ctx, x, y, 84, 36, 22, 36, 5, '#4f9e5c'); // braco direito
      for (let i = 26; i < 84; i += 12) q(ctx, x, y, 62, i, 3, 5, '#2f6b3a'); // espinhos
      blob(ctx, x, y, 64, 14, 10, 8, '#e8657f', 4); // florzinha
      caixa(ctx, x, y, 38, 82, 52, 34, '#c98358', '#e6ab84', '#9c6340');

    } else if (type === M.POLTRONA) {
      // Mesma arte da cadeira vermelha, noutra cor: e a poltrona verde-agua das
      // salas de huddle da referencia (172815).
      poltronaEstofada(ctx, x, y, TILE, '#4fa8b8', '#7fd0dd', '#2f7d8c', 'up');

    } else if (type === M.BEBEDOURO) {
      q(ctx, x, y, 30, 108, 68, 8, 'rgba(45,50,64,0.20)');
      caixa(ctx, x, y, 34, 44, 60, 68, '#d8dde8', '#f6f8fb', '#aeb4c4');
      // galao azul em cima, com nivel de agua
      qContorno(ctx, x, y, 42, 8, 44, 40, 5, TRACO);
      qArred(ctx, x, y, 44, 10, 40, 36, 4, '#63b6e0');
      q(ctx, x, y, 44, 10, 40, 10, '#8fd0ec'); // ar em cima
      q(ctx, x, y, 48, 14, 6, 26, 'rgba(255,255,255,0.40)'); // brilho
      q(ctx, x, y, 54, 62, 20, 6, TRACO); // torneiras
      q(ctx, x, y, 58, 76, 12, 14, TRACO);
      q(ctx, x, y, 60, 78, 8, 8, '#8fd6ee');
      q(ctx, x, y, 44, 96, 40, 4, '#aeb4c4');

    } else if (type === M.TV) {
      q(ctx, x, y, 24, 104, 80, 8, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 6, 18, 116, 74, 4, TRACO);
      q(ctx, x, y, 8, 20, 112, 70, '#39404f'); // moldura
      q(ctx, x, y, 16, 28, 96, 54, '#2f5e86'); // tela
      q(ctx, x, y, 16, 28, 96, 16, '#3d76a4'); // ceu da imagem
      q(ctx, x, y, 22, 34, 32, 5, '#8fd6ee');
      q(ctx, x, y, 22, 44, 20, 5, '#8fd6ee');
      q(ctx, x, y, 84, 62, 18, 12, '#f0a83c');
      q(ctx, x, y, 16, 28, 5, 54, 'rgba(255,255,255,0.26)'); // brilho
      q(ctx, x, y, 52, 92, 24, 12, TRACO); // pe
      q(ctx, x, y, 40, 104, 48, 6, TRACO);

    } else if (type === M.RELOGIO) {
      blob(ctx, x, y, 64, 64, 34, 34, TRACO, 4);
      blob(ctx, x, y, 64, 64, 30, 30, '#f7f8fc', 4);
      blob(ctx, x, y, 64, 62, 22, 20, '#ffffff', 4);
      q(ctx, x, y, 61, 38, 6, 6, '#8f97a8'); // marcas das horas
      q(ctx, x, y, 61, 84, 6, 6, '#8f97a8');
      q(ctx, x, y, 38, 61, 6, 6, '#8f97a8');
      q(ctx, x, y, 84, 61, 6, 6, '#8f97a8');
      q(ctx, x, y, 62, 44, 4, 22, '#2c3240'); // ponteiro das horas
      q(ctx, x, y, 64, 62, 22, 4, '#e0705a'); // ponteiro dos minutos
      q(ctx, x, y, 60, 60, 8, 8, '#2c3240'); // eixo

    } else if (type === M.GELADEIRA) {
      // Geladeira de porta de vidro da copa (referencia 172742): as latas
      // coloridas atras do vidro sao o que a identifica de longe.
      //
      // TAMANHO IMPORTA MAIS QUE DETALHE. Um tile tem 128 unidades finas e sai
      // com 32 pixels: 4 unidades = 1 pixel. A versao antiga tinha DOZE latas de
      // 12 unidades (3 pixels cada) e tres prateleiras de 4 unidades (UM pixel).
      // Nada daquilo aparecia de longe: era uma caixa cinza com sujeira dentro.
      // Agora sao SEIS latas de 24 unidades - 6 pixels - que a gente enxerga.
      q(ctx, x, y, 12, 116, 104, 8, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 12, 8, 104, 112, 4, '#20242e');
      qArred(ctx, x, y, 13, 9, 102, 110, 3, '#c3c9d6');            // carcaca
      qArred(ctx, x, y, 20, 16, 88, 80, 2, '#6fbdd8');             // vidro
      q(ctx, x, y, 20, 16, 88, 16, '#9ed8ea');                     // luz no alto do vidro
      // duas prateleiras, tres latas grandes em cada
      [24, 60].forEach((py) => {
        ['#e0607e', '#f0a83c', '#3fb08a'].forEach((cor, k) => {
          q(ctx, x, y, 26 + k * 28, py, 24, 28, cor);
          q(ctx, x, y, 26 + k * 28, py, 8, 28, 'rgba(255,255,255,0.28)');
        });
        q(ctx, x, y, 20, py + 28, 88, 4, '#dfe6ee');               // prateleira
      });
      q(ctx, x, y, 96, 40, 12, 36, '#8f97a8');                     // puxador
      q(ctx, x, y, 20, 100, 88, 16, '#a8aebd');                    // rodape

    } else if (type === M.AQUARIO) {
      // Aquario da sala de huddle (172815): agua clara, cascalho e UM peixe.
      //
      // Pela mesma conta da geladeira: o peixe media 16x8 unidades, ou seja 4x2
      // pixels, e as plantinhas 8 unidades - 2 pixels. O aquario saia na tela
      // como um retangulo azul liso. Menos coisas dentro, cada uma grande o
      // bastante pra existir, e ai da pra ver que e um aquario.
      q(ctx, x, y, 12, 116, 104, 8, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 16, 88, 96, 28, 3, '#5b6376');             // movel de baixo
      q(ctx, x, y, 20, 92, 88, 6, '#7b8496');
      qContorno(ctx, x, y, 16, 24, 96, 64, 3, '#20242e');
      qArred(ctx, x, y, 17, 25, 94, 62, 2, '#3fa8c4');             // agua
      q(ctx, x, y, 17, 25, 94, 20, '#6fc9dd');                     // luz da superficie
      q(ctx, x, y, 20, 72, 88, 16, '#c9a86a');                     // cascalho
      q(ctx, x, y, 28, 44, 16, 32, '#3f8a4a');                     // planta da esquerda
      q(ctx, x, y, 84, 40, 16, 36, '#4f9c58');                     // planta da direita
      // o peixe, grande o bastante pra ser um peixe e nao um risco laranja
      q(ctx, x, y, 48, 46, 32, 18, '#f0a83c');                     // corpo
      q(ctx, x, y, 40, 50, 12, 10, '#f0a83c');                     // cauda
      q(ctx, x, y, 68, 50, 8, 6, '#ffffff');                       // olho
      q(ctx, x, y, 20, 28, 12, 44, 'rgba(255,255,255,0.26)');      // reflexo no vidro

    } else if (type === M.LUMINARIA_PE) {
      // Luminaria de globos (172815): haste fina com bolas de luz espalhadas.
      q(ctx, x, y, 40, 112, 48, 8, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 44, 104, 40, 10, 3, '#5b6376');            // base
      q(ctx, x, y, 60, 36, 8, 68, '#8f97a8');                      // haste
      q(ctx, x, y, 60, 36, 3, 68, '#b6bcc8');
      // bracos e globos
      [[28, 40], [96, 48], [40, 20], [88, 24], [64, 12]].forEach(([gx, gy]) => {
        q(ctx, x, y, Math.min(gx, 64), gy + 8, Math.abs(64 - gx) + 4, 4, '#8f97a8');
        blob(ctx, x, y, gx, gy, 12, 12, '#f0d99a', 4);
        blob(ctx, x, y, gx, gy, 8, 8, '#fff6d8', 4);
      });

    } else if (type === M.PUFE) {
      // Pufe do lounge (referencia 172725): saco baixo e redondo, sem pe nem
      // encosto. O afundado no meio e o que o distingue de uma almofada.
      const cores = ['#4da3d6', '#a06cd4', '#e0607e', '#3fb08a'];
      const cor = cores[(c * 3 + r) % cores.length];
      // Grande: na referencia o pufe ocupa quase o tile inteiro, do tamanho de
      // uma poltrona. Pequeno, ele lia como almofada largada no chao.
      q(ctx, x, y, 16, 108, 96, 8, 'rgba(45,50,64,0.20)');
      blob(ctx, x, y, 64, 64, 60, 48, TRACO, 4);
      blob(ctx, x, y, 64, 62, 56, 44, cor, 4);
      blob(ctx, x, y, 46, 44, 24, 14, 'rgba(255,255,255,0.28)', 4);  // luz em cima
      blob(ctx, x, y, 64, 74, 32, 12, 'rgba(0,0,0,0.16)', 4);        // afundado do assento

    } else if (type === M.MESA_REDONDA) {
      // Mesa redonda das salas de huddle (172815): tampo cinza claro num pe so.
      // O tampo fica ALTO na celula e o pe aparece embaixo dele. Centrado no
      // meio, o tampo cobria o proprio pe e a mesa virava um ovo flutuando.
      q(ctx, x, y, 32, 100, 64, 8, 'rgba(45,50,64,0.20)');
      q(ctx, x, y, 56, 72, 16, 24, '#8f97a8');                       // pe
      qArred(ctx, x, y, 44, 92, 40, 8, 3, '#77808f');                // base
      blob(ctx, x, y, 64, 48, 48, 32, TRACO, 4);
      blob(ctx, x, y, 64, 46, 44, 28, '#d7dbe6', 4);
      blob(ctx, x, y, 64, 40, 36, 16, '#eef1f7', 4);                 // luz do tampo
      blob(ctx, x, y, 64, 58, 40, 8, 'rgba(120,128,143,0.30)', 4);   // quina de baixo

    } else if (type === M.TAPETE_REDONDO) {
      // tapete em aneis, em degraus pra ficar pixelado como a referencia
      [[60, '#a58ede'], [44, '#c9b6e8'], [28, '#e5dbf7']].forEach(([raio, cor]) => {
        blob(ctx, x, y, 64, 64, raio, raio, cor, 4);
      });
    }
  }

  // Ate onde vai o tampo nesta celula, na malha fina. Numa mesa de duas
  // fileiras a da frente so tem uma tirinha de tampo em cima - o resto e a
  // frente do movel e o vao. Quem for apoiado ali precisa subir, senao a caneca
  // fica boiando na frente da gaveteira. Espelha o que tampoDeMesa desenha.
  // Mora no map.js agora, que e o arquivo espelhado com o servidor - os dois
  // precisam concordar sobre onde acaba o tampo, senao o cliente deixa pousar
  // num lugar que o servidor recusa (ou pior: o contrario).
  //
  // A versao antiga daqui dizia 24 na fileira da frente enquanto `tampoDeMesa`
  // desenhava 64 de tampo. Resultado: a malha verde mostrava uma tirinha e a
  // mesa parecia ter muito menos espaco do que tem.
  function fimDoTampo(tiles, c, r) {
    const limite = OfficeMap.tampoAte(c, r);
    return limite || 128;
  }

  // Camada de cima: o que fica apoiado na celula. Desenhado depois dos moveis,
  // entao um monitor pousa em cima da mesa em vez de virar parte dela.
  // A arte de cada coisa mora numa caixa de 128 unidades, apoiando por volta de
  // y=90. `livre` = a posicao veio do clique da pessoa (item de mesa): a caixa
  // e centrada nesse ponto e nao ha correcao de altura, porque quem escolheu a
  // altura foi ela. Sem `livre`, e a camada da casa: cai na celula e sobe ate o
  // tampo quando ele acaba antes.
  const APOIO = 90;
  // ---- volume: a mesma arte 2D, com cara de coisa que ocupa espaco ----
  //
  // Em vez de retocar 37 desenhos na mao, cada item e desenhado uma vez num
  // buffer e a **silhueta dele** vira as tres coisas que dao volume:
  //
  //   1. sombra no chao - a silhueta achatada, deitada na base;
  //   2. espessura - copias escuras deslocadas pra baixo e pra direita, atras
  //      da arte, que aparecem como a "lateral" da coisa;
  //   3. luz de cima - uma copia clara deslocada pra cima e pra esquerda.
  //
  // A luz vem sempre de cima e da esquerda, como no resto do escritorio.
  //
  // O truque da silhueta e `source-in`: o preenchimento so pinta onde ja tem
  // pixel, e **mantem a transparencia** do original. Por isso a sombrinha fraca
  // que alguns itens ja desenhavam continua fraca na silhueta, em vez de virar
  // um retangulo preto.
  const BUF_TILES = 2;           // 2x2 tiles: cabe o que passa pra fora da celula
  const BUF_ESCALA = RENDER_SCALE;
  let bufItem = null;
  let bufSilhueta = null;

  function prepararBuffers(TILE) {
    const lado = BUF_TILES * TILE * BUF_ESCALA;
    if (bufItem && bufItem.width === lado) return;
    bufItem = document.createElement('canvas');
    bufSilhueta = document.createElement('canvas');
    bufItem.width = bufItem.height = lado;
    bufSilhueta.width = bufSilhueta.height = lado;
  }

  // Onde fica a origem da caixa do item dentro do buffer: sobra 1 tile pra cima
  // (o monitor passa do topo) e meio pros lados.
  const BUF_OX = 0.5;
  const BUF_OY = 1;

  // Repinta a silhueta de uma cor so. `source-in` pinta apenas onde ja existe
  // pixel e **mantem a transparencia** - por isso a sombrinha fraca que alguns
  // itens ja desenhavam continua fraca, em vez de virar um retangulo solido.
  function tingirSilhueta(cor) {
    const bs = bufSilhueta.getContext('2d');
    const lado = bufSilhueta.width;
    bs.setTransform(1, 0, 0, 1, 0, 0);
    bs.clearRect(0, 0, lado, lado);
    bs.globalCompositeOperation = 'source-over';
    bs.drawImage(bufItem, 0, 0);
    bs.globalCompositeOperation = 'source-in';
    bs.fillStyle = cor;
    bs.fillRect(0, 0, lado, lado);
    bs.globalCompositeOperation = 'source-over';
  }

  // Onde a arte de cada item termina, na malha fina. A sombra de contato tem
  // que sair DAI. A janela fixa que havia antes (60 a 98) partia do principio
  // de que toda arte encosta por volta de y=90; o monitor ultrawide acaba em
  // 61, entao a janela caia inteira no vazio e ele saia **sem sombra nenhuma** -
  // era isso que dava a sensacao de tela flutuando sobre a mesa.
  //
  // Medido uma vez por item, na silhueta que acabou de ser desenhada, e
  // guardado: sao 37 itens e a arte nao muda em tempo de execucao.
  // A caixa serve pra duas coisas: o `fundo` diz onde nasce a sombra, e a caixa
  // inteira deixa a miniatura do painel enquadrar o item em vez de cortar a
  // cabeca dele.
  const caixaDaArte = new Map();

  // A conversao NAO depende do TILE que se passa por ai: `q` e companhia
  // desenham a malha fina sempre com U, que e 32px por tile. Passar um TILE
  // maior move as coisas de celula, mas nao amplia a arte - eu cai nessa
  // tentando desenhar a miniatura num tile 3x e as caixas sairam 3x menores.
  function medirCaixa(chave) {
    if (caixaDaArte.has(chave)) return caixaDaArte.get(chave);
    const lado = bufSilhueta.width;
    const dados = bufSilhueta.getContext('2d').getImageData(0, 0, lado, lado).data;
    let x0 = lado, y0 = lado, x1 = -1, y1 = -1;
    for (let py = 0; py < lado; py++) {
      for (let px = 0; px < lado; px++) {
        if (dados[(py * lado + px) * 4 + 3] > 12) {
          if (px < x0) x0 = px;
          if (px > x1) x1 = px;
          if (py < y0) y0 = py;
          if (py > y1) y1 = py;
        }
      }
    }
    const porUnidade = U * BUF_ESCALA;
    const emUnidades = (v, folgaTiles) => Math.round(v / porUnidade) - folgaTiles * 128;
    const caixa = x1 < 0
      ? { x0: 0, y0: 0, x1: 128, y1: APOIO, fundo: APOIO }
      : {
        x0: emUnidades(x0, BUF_OX), x1: emUnidades(x1, BUF_OX),
        y0: emUnidades(y0, BUF_OY), y1: emUnidades(y1, BUF_OY),
        fundo: emUnidades(y1, BUF_OY),
      };
    caixaDaArte.set(chave, caixa);
    return caixa;
  }

  // Pra quem esta fora do desenho do mapa - o painel do decorador. Garante que
  // a caixa foi medida, desenhando o item uma vez no buffer se ainda nao foi.
  function caixaDoItem(obj) {
    if (caixaDaArte.has(obj)) return caixaDaArte.get(obj);
    const t = OfficeMap.TILE;
    prepararBuffers(t);
    const bi = bufItem.getContext('2d');
    const lado = bufItem.width;
    bi.setTransform(1, 0, 0, 1, 0, 0);
    bi.clearRect(0, 0, lado, lado);
    bi.imageSmoothingEnabled = false;
    bi.setTransform(BUF_ESCALA, 0, 0, BUF_ESCALA, 0, 0);
    pintarObjeto(bi, BUF_OX * t, BUF_OY * t, obj, t);
    tingirSilhueta('#000000');
    return medirCaixa(obj);
  }

  function comVolume(ctx, x, y, TILE, desenhar, chave) {
    prepararBuffers(TILE);
    const bi = bufItem.getContext('2d');
    const lado = bufItem.width;

    bi.setTransform(1, 0, 0, 1, 0, 0);
    bi.clearRect(0, 0, lado, lado);
    bi.imageSmoothingEnabled = false;
    bi.setTransform(BUF_ESCALA, 0, 0, BUF_ESCALA, 0, 0);
    desenhar(bi, BUF_OX * TILE, BUF_OY * TILE);

    const px = x - BUF_OX * TILE;
    const py = y - BUF_OY * TILE;
    const larg = BUF_TILES * TILE;
    const u = TILE / 128;        // uma unidade da grade fina, em pixels de mundo

    tingirSilhueta('#000000');

    // a linha onde a coisa encosta na superficie: o fundo da propria arte
    const fundo = chave === undefined ? APOIO : medirCaixa(chave).fundo;
    const baseY = y + fundo * u;

    ctx.save();

    // 1. Sombra no chao. So a **faixa de baixo** da silhueta entra: usar a
    // silhueta inteira transformava um monitor numa barra cinza do tamanho da
    // tela. O que faz sombra e o que toca a superficie.
    // A faixa e FINA de proposito. Com 34 unidades ela ainda pegava a barriga
    // do painel do monitor, e a sombra saia da largura da TELA em vez da largura
    // do pe - uma tira cinza comprida passando longe da base. O que encosta na
    // mesa sao os ultimos dedos da arte.
    const faixaTopo = (BUF_OY * 128 + fundo - 16) * u * BUF_ESCALA;
    const faixaAlt = 20 * u * BUF_ESCALA;
    ctx.globalAlpha = 0.17;
    ctx.drawImage(
      bufSilhueta,
      0, faixaTopo, lado, faixaAlt,
      px + larg * 0.03 + u, baseY - 9 * u, larg * 0.94, 14 * u
    );

    // 2. Espessura: copias escuras descendo pra direita, atras da arte. Sao elas
    // que aparecem como a lateral da coisa.
    //
    // Os degraus eram de UMA unidade fina, que a 32px por tile da 0,25px de
    // mundo: os tres somavam menos de um pixel e a coisa saia chapada. Agora o
    // degrau e de 2 unidades e sao 5 copias - 10 unidades de lateral, que e o
    // que se ve numa caneca ou num monitor de verdade.
    ctx.globalAlpha = 0.16;
    for (let i = 1; i <= 2; i++) {
      ctx.drawImage(bufSilhueta, px + i * PX * u, py + i * PX * u, larg, larg);
    }
    ctx.restore();

    // 3. Luz vindo de cima e da esquerda, como no resto do escritorio.
    tingirSilhueta('#ffffff');
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.drawImage(bufSilhueta, px - u, py - u, larg, larg);
    ctx.restore();

    // 4. A arte de verdade, por ultimo.
    ctx.drawImage(bufItem, px, py, larg, larg);
  }

  // Onde, na caixa de 128, fica o "meio visual" da arte. E por aqui que a coisa
  // e pendurada no ponto que a pessoa clicou.
  //
  // Antes ela era pendurada pela BASE (`APOIO`, 90), o que era fisicamente certo
  // e na pratica ruim: a arte sobe ~0.7 tile a partir da ancora, entao clicar
  // perto da borda de tras da mesa desenhava a coisa fora dela, e os cantos de
  // cima ficavam inutilizaveis. Pendurando pelo meio, o que voce ve nasce onde
  // voce clicou - em qualquer canto.
  const ANCORA = 60;

  function drawObjectTile(ctx, c, r, obj, TILE, tiles, livre) {
    const sobe = livre ? 0 : Math.max(0, APOIO - fimDoTampo(tiles, c, r));
    const x = (livre ? c - 0.5 : c) * TILE;
    const y = (livre ? r - ANCORA / 128 : r) * TILE - sobe * U;
    comVolume(ctx, x, y, TILE, (bctx, bx, by) => pintarObjeto(bctx, bx, by, obj, TILE), obj);
  }

  // ---- acertar numa coisa: pelo desenho, nao por um circulo ----
  //
  // O teste antigo era um circulo em volta da ancora. Como a arte sobe a partir
  // dela, clicar na TELA de um monitor caia fora do circulo: a coisa nao
  // selecionava e, por tabela, nao dava pra excluir. Agora o teste e no pixel:
  // desenha o item num buffer e olha se ali tem tinta.
  let bufToque = null;
  function acertaNoDesenho(it, x, y, TILE) {
    const lado = 128; // um tile em unidades finas, na resolucao do teste
    if (!bufToque) {
      bufToque = document.createElement('canvas');
      bufToque.width = bufToque.height = lado * 2;
    }
    // posicao do clique dentro da caixa do item, em unidades finas
    const bx = (x - (it.x - 0.5)) * 128 + lado * 0.5;
    const by = (y - (it.y - ANCORA / 128)) * 128 + lado * 0.5;
    if (bx < 0 || by < 0 || bx >= lado * 2 || by >= lado * 2) return false;

    const bc = bufToque.getContext('2d', { willReadFrequently: true });
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, lado * 2, lado * 2);
    bc.imageSmoothingEnabled = false;
    // desenha na escala do TILE mas medindo em unidades finas
    const escala = lado / TILE;
    bc.setTransform(escala, 0, 0, escala, 0, 0);
    pintarObjeto(bc, (lado * 0.5) / escala, (lado * 0.5) / escala, it.o, TILE);

    const alfa = bc.getImageData(Math.floor(bx), Math.floor(by), 1, 1).data[3];
    return alfa > 24; // ignora o fiapo de sombra que alguns itens desenham
  }

  // A arte crua de cada coisa, na caixa de 128 apoiando em APOIO. Quem chama e
  // o `comVolume`, que cuida da sombra e do relevo.
  function pintarObjeto(ctx, x, y, obj, TILE) {
    const O = OfficeMap.OBJETOS;
    const meio = TILE / 2;

    // Os monitores sao altos e **passam do tile pra cima**, como na referencia:
    // o pe apoia no tampo e a tela sobe por cima da mesa. Da certo porque a
    // camada de cima e desenhada depois de tudo.
    if (obj === O.MONITOR) {
      monitor(ctx, x, y, 0, -44, 128, 96);

    } else if (obj === O.MONITOR_DUPLO) {
      // os dois em "V", como na foto: o de fora de cada lado cai um pouco
      monitor(ctx, x, y, -18, -40, 88, 84, { tela: '#4fb3dd' }, -1);
      monitor(ctx, x, y, 58, -40, 88, 84, { tela: '#4aaad4' }, 1);

    } else if (obj === O.NOTEBOOK) {
      // tampa levantada com dobradica, base com teclado e trackpad
      qContorno(ctx, x, y, 26, 4, 76, 52, 4, '#242935');
      qArred(ctx, x, y, 27, 5, 74, 50, 4, '#5b6376');
      qArred(ctx, x, y, 32, 10, 64, 40, 2, '#2f7fb5');
      qArred(ctx, x, y, 32, 10, 64, 20, 2, '#4198cf');
      q(ctx, x, y, 36, 15, 34, 4, '#bfe6fa');
      q(ctx, x, y, 36, 23, 22, 3, '#bfe6fa');
      q(ctx, x, y, 36, 31, 44, 3, '#bfe6fa');
      q(ctx, x, y, 32, 10, 3, 40, 'rgba(255,255,255,0.30)');
      q(ctx, x, y, 26, 54, 76, 4, '#242935');                 // dobradica
      qContorno(ctx, x, y, 18, 58, 92, 30, 4, '#242935');      // base
      qArred(ctx, x, y, 19, 59, 90, 28, 4, '#ccd3e0');
      q(ctx, x, y, 21, 60, 86, 2, '#eef1f7');
      for (let i = 24; i < 104; i += 6) q(ctx, x, y, i, 64, 4, 4, '#98a2b4');
      qArred(ctx, x, y, 52, 74, 24, 9, 2, '#aab4c4');          // trackpad

    } else if (obj === O.TECLADO) {
      teclado(ctx, x, y, 20, 52, 78);
      mouse(ctx, x, y, 106, 56);

    } else if (obj === O.MONITOR_ULTRAWIDE) {
      monitor(ctx, x, y, -22, -32, 172, 76);

    } else if (obj === O.TORRE_PC) {
      // gabinete de pe ao lado do monitor, como no print dos eletronicos
      monitor(ctx, x, y, 26, -40, 92, 76);
      qContorno(ctx, x, y, -6, 22, 32, 66, 3, '#20242e');
      qArred(ctx, x, y, -5, 23, 30, 64, 3, '#4a5162');
      q(ctx, x, y, -2, 26, 24, 3, '#6b7488');                  // luz no topo
      for (let i = 30; i < 76; i += 8) q(ctx, x, y, 0, i, 20, 3, '#39404f'); // grade
      q(ctx, x, y, 2, 78, 6, 6, '#63d9c4');                    // ledzinho ligado
      q(ctx, x, y, 12, 78, 8, 3, '#8f97a8');

    } else if (obj === O.SETUP_GAMER) {
      monitor(ctx, x, y, 4, -38, 120, 80, { tela: '#7c5cd4', telaEscura: '#4b34a0' });
      // teclado com as teclas coloridas
      qContorno(ctx, x, y, 24, 56, 80, 26, 3, '#181c24');
      qArred(ctx, x, y, 25, 57, 78, 24, 3, '#2b3040');
      const cores = ['#e0607e', '#f0a83c', '#63d9c4', '#4da3d6', '#a58ede'];
      for (let fila = 0; fila < 3; fila++) {
        for (let i = 0; i < 12; i++) {
          q(ctx, x, y, 29 + i * 6, 61 + fila * 6, 4, 4, cores[(i + fila) % cores.length]);
        }
      }
      mouse(ctx, x, y, 108, 60);

    } else if (obj === O.MONITOR_LADO) {
      monitorDeLado(ctx, x, y, 44, -8, 72, true);

    } else if (obj === O.MONITOR_COSTAS) {
      monitorDeCostas(ctx, x, y, 20, -6, 88, 58);

    } else if (obj === O.TABLET) {
      q(ctx, x, y, 32, 86, 64, 5, 'rgba(45,50,64,0.18)');
      qContorno(ctx, x, y, 30, 34, 68, 54, 4, '#20242e');      // corpo, meio deitado
      qArred(ctx, x, y, 31, 35, 66, 52, 4, '#39404f');
      qArred(ctx, x, y, 35, 39, 58, 44, 2, '#2f7fb5');         // tela
      qArred(ctx, x, y, 35, 39, 58, 20, 2, '#4198cf');
      q(ctx, x, y, 40, 45, 30, 4, '#bfe6fa');
      q(ctx, x, y, 40, 55, 20, 3, '#bfe6fa');
      q(ctx, x, y, 35, 39, 3, 44, 'rgba(255,255,255,0.28)');   // brilho
      qArred(ctx, x, y, 100, 40, 8, 44, 3, '#8f97a8');         // caneta
      q(ctx, x, y, 101, 42, 3, 38, '#c3cad8');
      q(ctx, x, y, 100, 80, 8, 6, '#2c3240');

    } else if (obj === O.CAIXAS_SOM) {
      [22, 84].forEach((ax) => {
        q(ctx, x, y, ax, 86, 24, 5, 'rgba(45,50,64,0.18)');
        qContorno(ctx, x, y, ax, 34, 24, 54, 3, '#20242e');
        qArred(ctx, x, y, ax + 1, 35, 22, 52, 3, '#4a5162');
        q(ctx, x, y, ax + 3, 37, 18, 3, '#6b7488');
        blob(ctx, x, y, ax + 12, 52, 8, 8, '#2b3040', 3);      // alto-falante grande
        blob(ctx, x, y, ax + 12, 52, 4, 4, '#68718a', 2);
        blob(ctx, x, y, ax + 12, 74, 5, 5, '#2b3040', 3);      // tweeter
      });

    } else if (obj === O.TECLADO_GAMER) {
      qContorno(ctx, x, y, 14, 52, 100, 30, 3, '#181c24');
      qArred(ctx, x, y, 15, 53, 98, 28, 3, '#2b3040');
      q(ctx, x, y, 18, 55, 92, 2, '#4a5162');
      const paleta = ['#e0607e', '#f0a83c', '#63d9c4', '#4da3d6', '#a58ede'];
      for (let fila = 0; fila < 3; fila++) {
        for (let i = 0; i < 15; i++) {
          q(ctx, x, y, 19 + i * 6, 58 + fila * 6, 4, 4, paleta[(i + fila * 2) % paleta.length]);
        }
      }
      q(ctx, x, y, 14, 84, 100, 3, 'rgba(124,92,212,0.55)');   // brilho embaixo

    } else if (obj === O.HEADSET) {
      // Refeito inteiro na grade de 4. O arco era uma parabola montada com 23
      // lasquinhas de 3 por 6 - abaixo de um pixel cada uma - e com a malha
      // nova elas se empilhavam no mesmo lugar e viravam um borrao. Agora sao
      // sete blocos em degrau, que e como a referencia desenha curva: escada,
      // nao curva de verdade. As conchas tambem cresceram: 20x30 com contorno
      // de 6 nao sobrava miolo nenhum depois de encaixar.
      q(ctx, x, y, 40, 88, 48, 4, 'rgba(45,50,64,0.18)');      // sombra
      qArred(ctx, x, y, 44, 80, 40, 8, 4, '#68718a');          // base do suporte
      q(ctx, x, y, 48, 80, 32, 4, '#8f97a8');
      q(ctx, x, y, 60, 28, 8, 56, '#8f97a8');                  // haste
      q(ctx, x, y, 60, 28, 4, 56, '#a7b1c2');

      [[36, 32, 8, 20], [40, 28, 8, 8], [48, 24, 8, 8], [56, 20, 16, 8],
       [72, 24, 8, 8], [80, 28, 8, 8], [84, 32, 8, 20]].forEach(([bx, by, bw, bh]) => {
        q(ctx, x, y, bx, by, bw, bh, '#2b3040');               // arco
        q(ctx, x, y, bx, by, bw, 4, '#4a5162');                // luz em cima
      });

      [32, 80].forEach((cx) => {                               // conchas
        q(ctx, x, y, cx, 48, 16, 24, '#181c24');
        q(ctx, x, y, cx + 4, 52, 8, 16, '#e8934a');            // espuma
        q(ctx, x, y, cx + 4, 52, 8, 4, '#f0b45a');
      });

    } else if (obj === O.WEBCAM) {
      q(ctx, x, y, 46, 84, 36, 5, 'rgba(45,50,64,0.18)');
      qArred(ctx, x, y, 44, 74, 40, 10, 3, '#4a5162');         // base
      q(ctx, x, y, 60, 60, 8, 16, '#68718a');                  // pescoco
      qContorno(ctx, x, y, 40, 32, 48, 32, 8, '#181c24');
      qArred(ctx, x, y, 41, 33, 46, 30, 7, '#39404f');
      blob(ctx, x, y, 64, 48, 12, 12, '#20242e', 3);           // lente
      blob(ctx, x, y, 64, 48, 8, 8, '#2f7fb5', 3);
      blob(ctx, x, y, 61, 45, 3, 3, '#bfe6fa', 2);             // brilho
      q(ctx, x, y, 78, 38, 5, 5, '#e0607e');                   // led gravando

    } else if (obj === O.CANECA) {
      q(ctx, x, y, 48, 82, 34, 6, 'rgba(45,50,64,0.20)');      // sombra
      qContorno(ctx, x, y, 44, 44, 36, 42, 5, '#7a2c1f');      // corpo
      qArred(ctx, x, y, 45, 45, 34, 40, 5, '#e0705a');
      q(ctx, x, y, 48, 48, 6, 32, '#f2917d');                  // luz
      q(ctx, x, y, 72, 48, 5, 32, '#b8503c');                  // sombra
      qContorno(ctx, x, y, 78, 54, 16, 20, 5, '#7a2c1f');      // asa
      qArred(ctx, x, y, 82, 58, 8, 12, 3, '#e0705a');
      qArred(ctx, x, y, 47, 43, 30, 7, 3, '#5b2417');          // cafe
      qArred(ctx, x, y, 50, 45, 24, 4, 2, '#7a3a24');
      q(ctx, x, y, 56, 30, 3, 10, 'rgba(255,255,255,0.55)');   // vapor
      q(ctx, x, y, 66, 26, 3, 12, 'rgba(255,255,255,0.40)');

    } else if (obj === O.COPO_CAFE) {
      // Copo de papel: tronco de cone em TRES degraus, um pixel de arte cada.
      // Antes eram 44 fatias de altura 1 com o recuo andando de 1 em 1 - tudo
      // abaixo de um pixel, entao a conicidade sumia e as fatias se empilhavam.
      //
      // Tudo centrado em x=64 e em multiplos de PX. Sem isso a peca sai torta:
      // com a sombra em 46 (que o encaixe joga pra 48) e a cinta em 44, as duas
      // ficavam desalinhadas do corpo e o copo parecia cair pra direita.
      q(ctx, x, y, 48, 84, 32, 4, 'rgba(45,50,64,0.20)');      // sombra, na base
      q(ctx, x, y, 40, 40, 48, 12, '#f6f7fb');                 // boca
      q(ctx, x, y, 44, 52, 40, 16, '#eceef4');
      q(ctx, x, y, 48, 68, 32, 16, '#e2e5ee');                 // fundo
      q(ctx, x, y, 48, 56, 32, 12, '#8a5a3c');                 // cinta de papelao
      q(ctx, x, y, 48, 56, 32, 4, '#a5744f');
      qArred(ctx, x, y, 36, 32, 56, 8, 4, '#c9ccd8');          // tampa, sobrando a boca
      q(ctx, x, y, 40, 32, 48, 4, '#e6e8ef');
      q(ctx, x, y, 60, 24, 8, 8, '#b6bac8');                   // bico
      q(ctx, x, y, 48, 44, 4, 8, 'rgba(255,255,255,0.45)');    // brilho, so na boca

    } else if (obj === O.GARRAFA) {
      q(ctx, x, y, 50, 88, 30, 5, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 48, 34, 34, 54, 5, '#1f5c4a');      // corpo
      qArred(ctx, x, y, 49, 35, 32, 52, 4, '#3f9e7c');
      q(ctx, x, y, 52, 40, 6, 42, '#63d9a8');                  // brilho
      q(ctx, x, y, 74, 40, 4, 42, '#2b7a5f');
      qArred(ctx, x, y, 54, 52, 22, 16, 2, '#f2f6f4');         // rotulo
      q(ctx, x, y, 57, 57, 16, 3, '#3f9e7c');
      q(ctx, x, y, 58, 24, 14, 12, '#2b7a5f');                 // gargalo
      qArred(ctx, x, y, 55, 16, 20, 10, 3, '#4a5162');         // tampa

    } else if (obj === O.DONUT) {
      q(ctx, x, y, 40, 82, 50, 5, 'rgba(45,50,64,0.18)');
      blob(ctx, x, y, 64, 74, 34, 12, '#f2f4f8', 4);           // pratinho
      blob(ctx, x, y, 64, 62, 28, 22, '#b5762f', 4);           // massa
      blob(ctx, x, y, 64, 58, 26, 20, '#e8a04a', 4);
      blob(ctx, x, y, 64, 56, 24, 17, '#e8657f', 4);           // cobertura rosa
      blob(ctx, x, y, 64, 58, 8, 6, '#b5762f', 3);             // buraco
      [[50, 48, '#63d9c4'], [76, 50, '#f0e05a'], [58, 64, '#4da3d6'], [72, 62, '#f6f7fb']]
        .forEach(([gx, gy, cor]) => q(ctx, x, y, gx, gy, 5, 3, cor)); // granulado

    } else if (obj === O.TIGELA) {
      q(ctx, x, y, 38, 84, 52, 5, 'rgba(45,50,64,0.18)');
      blob(ctx, x, y, 64, 58, 30, 14, '#7bc47f', 4);           // salada dentro
      blob(ctx, x, y, 54, 54, 10, 8, '#e0607e', 3);
      blob(ctx, x, y, 76, 56, 9, 7, '#f0a83c', 3);
      // tigela: meia elipse
      for (let i = 0; i < 26; i++) {
        const larg = Math.round(30 * Math.sqrt(Math.max(0, 1 - (i / 26) * (i / 26))));
        q(ctx, x, y, 64 - larg, 60 + i, larg * 2, 1, i < 3 ? '#f2f4f8' : '#dfe3ec');
      }
      q(ctx, x, y, 34, 58, 60, 4, '#c3c9d6');                  // borda

    } else if (obj === O.POTE_BISCOITO) {
      q(ctx, x, y, 42, 86, 44, 5, 'rgba(45,50,64,0.18)');
      qContorno(ctx, x, y, 40, 40, 48, 46, 5, '#8a5a3c');
      qArred(ctx, x, y, 41, 41, 46, 44, 4, 'rgba(220,232,240,0.55)'); // vidro
      [[52, 58], [68, 56], [58, 70], [74, 70]].forEach(([bx, by]) => {
        blob(ctx, x, y, bx, by, 9, 8, '#c08a4e', 3);           // biscoitos
        q(ctx, x, y, bx - 3, by - 2, 3, 3, '#6b4426');
        q(ctx, x, y, bx + 2, by + 2, 3, 3, '#6b4426');
      });
      q(ctx, x, y, 44, 44, 6, 38, 'rgba(255,255,255,0.35)');   // reflexo
      qArred(ctx, x, y, 36, 28, 56, 14, 4, '#e0607e');         // tampa
      q(ctx, x, y, 40, 30, 48, 3, '#f2917d');

    } else if (obj === O.CAFETEIRA) {
      q(ctx, x, y, 36, 88, 56, 5, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 34, 20, 60, 68, 4, '#20242e');
      qArred(ctx, x, y, 35, 21, 58, 66, 3, '#4a5162');
      q(ctx, x, y, 38, 24, 52, 3, '#6b7488');
      qArred(ctx, x, y, 42, 30, 44, 20, 2, '#2b3040');         // painel
      q(ctx, x, y, 46, 36, 14, 4, '#63d9c4');
      q(ctx, x, y, 64, 36, 6, 4, '#e0607e');
      q(ctx, x, y, 58, 52, 12, 8, '#39404f');                  // bico
      qContorno(ctx, x, y, 46, 60, 36, 24, 3, '#20242e');      // jarra
      qArred(ctx, x, y, 47, 61, 34, 22, 2, 'rgba(220,232,240,0.5)');
      qArred(ctx, x, y, 49, 70, 30, 12, 2, '#5b2417');         // cafe
      q(ctx, x, y, 50, 64, 4, 16, 'rgba(255,255,255,0.4)');

    } else if (obj === O.PAPELADA) {
      q(ctx, x, y, 30, 82, 66, 5, 'rgba(45,50,64,0.16)');
      qContorno(ctx, x, y, 26, 40, 66, 46, 2, '#9aa2b4');      // folha de baixo
      qArred(ctx, x, y, 27, 41, 64, 44, 2, '#e8eaf0');
      qContorno(ctx, x, y, 32, 34, 66, 46, 2, '#8f97a8');      // folha de cima
      qArred(ctx, x, y, 33, 35, 64, 44, 2, '#fbfbfd');
      q(ctx, x, y, 40, 44, 42, 3, '#aeb6c6');                  // linhas de texto
      q(ctx, x, y, 40, 52, 32, 3, '#c3c9d6');
      q(ctx, x, y, 40, 60, 46, 3, '#c3c9d6');
      q(ctx, x, y, 40, 68, 24, 3, '#c3c9d6');
      qArred(ctx, x, y, 88, 30, 8, 40, 3, '#e0705a');          // caneta em cima
      q(ctx, x, y, 89, 32, 3, 34, '#f2917d');
      q(ctx, x, y, 88, 66, 8, 6, '#2c3240');

    } else if (obj === O.PORTA_LAPIS) {
      q(ctx, x, y, 46, 88, 38, 5, 'rgba(45,50,64,0.20)');
      // lapis e canetas espetados, desenhados ANTES do copo pra ele tapar a base
      [['#e0607e', 50, 28], ['#4da3d6', 60, 22], ['#f0a83c', 70, 30], ['#63d9c4', 78, 26]]
        .forEach(([cor, lx, ly]) => {
          q(ctx, x, y, lx, ly, 7, 46, cor);
          q(ctx, x, y, lx, ly, 2, 46, 'rgba(255,255,255,0.35)');
          q(ctx, x, y, lx, ly, 7, 6, '#2c3240');               // ponta
        });
      qContorno(ctx, x, y, 44, 54, 42, 34, 4, '#2b3040');      // copo
      qArred(ctx, x, y, 45, 55, 40, 32, 3, '#68718a');
      q(ctx, x, y, 48, 58, 6, 26, '#8f97a8');
      q(ctx, x, y, 76, 58, 5, 26, '#4a5162');

    } else if (obj === O.CADERNO) {
      q(ctx, x, y, 30, 84, 68, 5, 'rgba(45,50,64,0.18)');
      qContorno(ctx, x, y, 28, 44, 72, 42, 3, '#2b3040');      // capa
      qArred(ctx, x, y, 29, 45, 70, 40, 2, '#c25a4a');
      q(ctx, x, y, 32, 48, 64, 3, '#dd7a63');
      qArred(ctx, x, y, 40, 54, 50, 24, 2, '#f2f4f8');         // etiqueta
      q(ctx, x, y, 45, 60, 32, 3, '#aeb6c6');
      q(ctx, x, y, 45, 67, 22, 3, '#c3c9d6');
      for (let i = 46; i < 86; i += 8) q(ctx, x, y, 26, i, 8, 4, '#8f97a8'); // espiral
      qArred(ctx, x, y, 92, 38, 8, 44, 3, '#f0a83c');          // caneta em cima
      q(ctx, x, y, 93, 40, 3, 38, '#f6c780');

    } else if (obj === O.CALENDARIO) {
      q(ctx, x, y, 32, 86, 64, 5, 'rgba(45,50,64,0.18)');
      q(ctx, x, y, 40, 78, 48, 8, '#8f97a8');                  // cavalete
      qContorno(ctx, x, y, 32, 32, 64, 50, 3, '#2b3040');
      qArred(ctx, x, y, 33, 33, 62, 48, 2, '#f6f7fb');
      q(ctx, x, y, 33, 33, 62, 14, '#c25a4a');                 // faixa do mes
      q(ctx, x, y, 40, 36, 24, 4, '#f6d7d0');
      // Grade dos dias: 8 de celula e 4 de vao, tudo multiplo de PX. Com 6 de
      // celula e passo 9 - nenhum dos dois na malha - as celulas encostavam
      // umas nas outras e a grade virava uma barra cinza.
      for (let l = 0; l < 3; l++) {
        for (let c2 = 0; c2 < 5; c2++) {
          q(ctx, x, y, 40 + c2 * 12, 50 + l * 12, 8, 8,
            (l === 1 && c2 === 2) ? '#4da3d6' : '#d7dbe6');
        }
      }

    } else if (obj === O.POST_ITS) {
      q(ctx, x, y, 34, 84, 60, 5, 'rgba(45,50,64,0.16)');
      // tres bloquinhos meio tortos, como ficam de verdade
      [['#f0e05a', 36, 46, -1], ['#7bd6a8', 58, 42, 1], ['#f2917d', 46, 60, 0]]
        .forEach(([cor, px, py, giro]) => {
          qContorno(ctx, x, y, px + giro, py, 40, 34, 2, 'rgba(45,50,64,0.22)');
          qArred(ctx, x, y, px + giro, py, 40, 34, 2, cor);
          q(ctx, x, y, px + giro + 5, py + 8, 26, 3, 'rgba(45,50,64,0.28)');
          q(ctx, x, y, px + giro + 5, py + 16, 18, 3, 'rgba(45,50,64,0.20)');
        });

    } else if (obj === O.CACTINHO) {
      q(ctx, x, y, 44, 88, 40, 5, 'rgba(45,50,64,0.20)');
      qContorno(ctx, x, y, 56, 30, 18, 44, 5, '#2f6b3a');
      qArred(ctx, x, y, 57, 31, 16, 42, 4, '#4f9e5c');         // corpo
      q(ctx, x, y, 59, 34, 5, 36, '#6bbd78');
      qContorno(ctx, x, y, 42, 44, 14, 22, 5, '#2f6b3a');      // bracinho
      qArred(ctx, x, y, 43, 45, 12, 20, 4, '#4f9e5c');
      for (let i = 36; i < 70; i += 8) q(ctx, x, y, 64, i, 2, 4, '#2f6b3a');
      blob(ctx, x, y, 65, 28, 7, 6, '#e8657f', 3);             // florzinha
      caixa(ctx, x, y, 44, 66, 40, 22, '#c98358', '#e6ab84', '#9c6340');

    } else if (obj === O.PORTA_RETRATO) {
      q(ctx, x, y, 34, 86, 60, 5, 'rgba(45,50,64,0.18)');
      q(ctx, x, y, 56, 76, 16, 10, '#8f97a8');                 // pezinho
      qContorno(ctx, x, y, 32, 30, 64, 50, 3, '#8a5a3c');      // moldura
      qArred(ctx, x, y, 33, 31, 62, 48, 2, '#b1784f');
      qArred(ctx, x, y, 39, 37, 50, 36, 2, '#8fd0ec');         // ceu da foto
      q(ctx, x, y, 39, 58, 50, 15, '#7bc47f');                 // grama
      blob(ctx, x, y, 56, 54, 7, 9, '#f1c27d', 3);             // duas pessoinhas
      blob(ctx, x, y, 72, 54, 7, 9, '#f1c27d', 3);
      q(ctx, x, y, 52, 58, 9, 12, '#e0607e');
      q(ctx, x, y, 68, 58, 9, 12, '#4da3d6');
      blob(ctx, x, y, 80, 43, 6, 6, '#f0e05a', 3);             // sol

    } else if (obj === O.TROFEU) {
      q(ctx, x, y, 44, 88, 40, 5, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 42, 76, 44, 12, 3, '#5b4a2f');         // base
      q(ctx, x, y, 45, 78, 38, 3, '#7d6742');
      q(ctx, x, y, 58, 62, 12, 16, '#c9a227');                 // haste
      for (let i = 0; i < 26; i++) {                           // taca
        const larg = Math.round(22 * Math.sqrt(Math.max(0, 1 - (i / 26) * (i / 26))));
        q(ctx, x, y, 64 - larg, 36 + i, larg * 2, 1, '#e8c34a');
      }
      q(ctx, x, y, 44, 32, 40, 6, '#f2d97a');                  // borda
      q(ctx, x, y, 50, 38, 5, 20, 'rgba(255,255,255,0.45)');
      [36, 86].forEach((ax) => qContorno(ctx, x, y, ax, 40, 10, 20, 4, '#c9a227')); // alcas
      q(ctx, x, y, 56, 80, 16, 4, '#f2d97a');

    } else if (obj === O.BONECO) {
      q(ctx, x, y, 46, 88, 36, 5, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 44, 82, 40, 8, 3, '#4a5162');          // pedestal
      q(ctx, x, y, 56, 62, 6, 20, '#3d5a9e');                  // pernas
      q(ctx, x, y, 66, 62, 6, 20, '#3d5a9e');
      qArred(ctx, x, y, 52, 40, 24, 26, 4, '#e0607e');         // tronco
      q(ctx, x, y, 62, 44, 5, 18, '#f6d7d0');
      q(ctx, x, y, 44, 42, 9, 20, '#e0607e');                  // bracos
      q(ctx, x, y, 75, 36, 9, 20, '#e0607e');
      blob(ctx, x, y, 64, 30, 12, 12, '#f1c27d', 3);           // cabeca
      q(ctx, x, y, 55, 22, 18, 7, '#2b3040');                  // cabelo
      q(ctx, x, y, 59, 30, 3, 3, '#2b3040');
      q(ctx, x, y, 67, 30, 3, 3, '#2b3040');

    } else if (obj === O.FLORES) {
      q(ctx, x, y, 44, 88, 40, 5, 'rgba(45,50,64,0.20)');
      [[52, 40], [64, 30], [76, 40], [58, 50], [70, 50]].forEach(([fx, fy], i) => {
        q(ctx, x, y, fx + 2, fy + 6, 4, 24, '#3f8a4a');        // caule
        const cor = ['#e8657f', '#f0e05a', '#c77fe0', '#f2917d', '#8fd0ec'][i];
        blob(ctx, x, y, fx + 4, fy, 11, 10, cor, 3);
        blob(ctx, x, y, fx + 4, fy, 4, 4, '#fff3c4', 2);
      });
      qContorno(ctx, x, y, 48, 62, 32, 26, 4, '#2b6b8a');      // vaso
      qArred(ctx, x, y, 49, 63, 30, 24, 3, '#4da3d6');
      q(ctx, x, y, 52, 66, 6, 18, '#8fd0ec');

    } else if (obj === O.BOLA) {
      q(ctx, x, y, 44, 84, 40, 5, 'rgba(45,50,64,0.20)');
      blob(ctx, x, y, 64, 64, 24, 24, '#2c3240', 4);
      blob(ctx, x, y, 64, 64, 21, 21, '#f6f7fb', 4);
      blob(ctx, x, y, 64, 60, 8, 7, '#2c3240', 3);             // gomos
      blob(ctx, x, y, 50, 70, 6, 5, '#2c3240', 3);
      blob(ctx, x, y, 78, 70, 6, 5, '#2c3240', 3);
      blob(ctx, x, y, 64, 78, 6, 4, '#2c3240', 3);
      q(ctx, x, y, 52, 52, 6, 5, 'rgba(255,255,255,0.6)');     // brilho

    } else if (obj === O.VELA) {
      q(ctx, x, y, 50, 88, 30, 5, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 48, 78, 34, 10, 3, '#8f97a8');         // pires
      qContorno(ctx, x, y, 54, 44, 22, 36, 3, '#b8a58a');      // vela
      qArred(ctx, x, y, 55, 45, 20, 34, 2, '#f2ead8');
      q(ctx, x, y, 58, 48, 5, 28, '#fff9ec');
      q(ctx, x, y, 71, 48, 3, 28, '#ded1b6');
      q(ctx, x, y, 63, 38, 3, 8, '#4a4034');                   // pavio
      blob(ctx, x, y, 64, 32, 7, 10, '#f0a83c', 3);            // chama
      blob(ctx, x, y, 64, 31, 4, 6, '#ffe9a8', 2);

    } else if (obj === O.TELEFONE) {
      // Estava com 80 de largura e 59 de altura: a MESMA pegada de um teclado
      // inteiro (104 x 37) e quase metade da largura do ultrawide. Telefone de
      // mesa e mais ou menos meio teclado - 56 de largura.
      q(ctx, x, y, 40, 86, 48, 5, 'rgba(45,50,64,0.18)');
      qContorno(ctx, x, y, 36, 58, 56, 30, 3, '#1d222c');      // base
      qArred(ctx, x, y, 37, 59, 54, 28, 3, '#4a5162');
      q(ctx, x, y, 39, 60, 50, 2, '#68718a');
      for (let i = 0; i < 3; i++) {                            // teclado
        for (let j = 0; j < 3; j++) {
          q(ctx, x, y, 41 + i * 7, 68 + j * 6, 5, 4, '#98a2b4');
        }
      }
      qArred(ctx, x, y, 64, 67, 22, 15, 2, '#39404f');         // visor
      q(ctx, x, y, 66, 69, 18, 3, '#7ad39a');
      qContorno(ctx, x, y, 36, 46, 56, 13, 4, '#1d222c');      // fone no gancho
      qArred(ctx, x, y, 37, 47, 54, 11, 4, '#5f6a80');
      q(ctx, x, y, 39, 48, 50, 2, '#8f97a8');

    } else if (obj === O.LUMINARIA) {
      q(ctx, x, y, 44, 92, 42, 5, 'rgba(45,50,64,0.20)');
      qArred(ctx, x, y, 42, 82, 44, 10, 4, '#4a5162');         // base
      q(ctx, x, y, 45, 83, 38, 2, '#6b7488');
      q(ctx, x, y, 60, 44, 8, 40, '#5f6a80');                  // haste
      q(ctx, x, y, 60, 44, 2, 40, '#828da8');
      q(ctx, x, y, 60, 44, 26, 6, '#5f6a80');                  // braco
      qContorno(ctx, x, y, 74, 20, 40, 28, 6, '#8a5a12');      // cupula
      qArred(ctx, x, y, 75, 21, 38, 26, 5, '#f0a83c');
      qArred(ctx, x, y, 78, 24, 30, 8, 3, '#ffd98a');
      qArred(ctx, x, y, 78, 44, 32, 6, 2, '#fff3c4');          // luz saindo

    } else if (obj === O.PLANTINHA) {
      q(ctx, x, y, 44, 90, 42, 5, 'rgba(45,50,64,0.18)');
      [[26, 34], [70, 34], [48, 18], [34, 52], [66, 52]].forEach(([fx, fy]) => {
        qContorno(ctx, x, y, fx, fy, 34, 26, 8, '#1e5c33');
        qArred(ctx, x, y, fx + 1, fy + 1, 32, 24, 7, '#3f8a4a');
        qArred(ctx, x, y, fx + 4, fy + 4, 18, 7, 3, '#5fb06c');
        q(ctx, x, y, fx + 15, fy + 6, 3, 14, '#1e5c33');       // nervura
      });
      qContorno(ctx, x, y, 42, 62, 44, 30, 4, '#1f6b64');      // vaso
      qArred(ctx, x, y, 43, 63, 42, 28, 4, '#3fb0a5');
      q(ctx, x, y, 45, 64, 38, 3, '#6ad4c9');
      q(ctx, x, y, 43, 70, 42, 3, '#2d8b82');

    } else if (obj === O.LIVROS) {
      q(ctx, x, y, 26, 86, 76, 5, 'rgba(45,50,64,0.18)');
      const cores = [
        ['#c0392b', '#e0705a', '#8f2418'],
        ['#3f7fb5', '#69a6d8', '#2b5c88'],
        ['#f0a83c', '#ffd08a', '#c07d1c'],
        ['#7449b0', '#a37fd6', '#4f2d80'],
      ];
      cores.forEach((cor, i) => {
        const bx = 24 + i * 17;
        const alt = 44 + (i % 2) * 10;
        qContorno(ctx, x, y, bx, 86 - alt, 15, alt, 2, '#20242e');
        qArred(ctx, x, y, bx + 1, 87 - alt, 13, alt - 2, 2, cor[0]);
        q(ctx, x, y, bx + 2, 89 - alt, 4, alt - 6, cor[1]);      // lombada clara
        q(ctx, x, y, bx + 11, 89 - alt, 2, alt - 6, cor[2]);     // sombra
        q(ctx, x, y, bx + 3, 95 - alt, 9, 3, 'rgba(255,255,255,0.55)'); // faixa
        q(ctx, x, y, bx + 3, 78, 9, 2, 'rgba(255,255,255,0.35)');
      });
      q(ctx, x, y, 22, 84, 80, 4, '#20242e');                    // apoio
    }
  }

  // Cadeira de escritorio como na referencia: vista **por tras**, com o encosto
  // de tela (a pessoa senta de costas pra gente, virada pra mesa). O encosto e
  // desenhado por cima de quem senta, entao so a cabeca fica aparecendo.
  // Painel de tela do encosto (grade de 128), com trama em losango e volume.
  function painelDeTela(ctx, x, y, ax, ay, aw, ah, base, claro, escuro) {
    qContorno(ctx, x, y, ax - 3, ay - 3, aw + 6, ah + 6, 8, escuro);
    qArred(ctx, x, y, ax - 2, ay - 2, aw + 4, ah + 4, 7, base);
    qArred(ctx, x, y, ax, ay, aw, ah, 6, '#343b49');
    // Trama diagonal nos dois sentidos, em degraus de UM pixel de arte.
    //
    // A versao anterior andava de 1 em 1 desenhando marcas de 2x1. Com a malha
    // de 4 unidades por pixel, quatro passos seguidos caem no mesmo pixel: em
    // vez de diagonal saia um borrao, e cada marca era desenhada quatro vezes.
    // Andando de PX em PX, cada bloco cai num pixel proprio e a diagonal vira a
    // escada que a referencia desenha.
    for (let d = -ah; d < aw; d += PX * 3) {
      for (let j = PX; j < ah - PX; j += PX) {
        const i1 = d + j;
        const i2 = d + (ah - j);
        if (i1 > PX && i1 < aw - PX) q(ctx, x, y, ax + i1, ay + j, PX, PX, claro);
        if (i2 > PX && i2 < aw - PX) q(ctx, x, y, ax + i2, ay + j, PX, PX, claro);
      }
    }
    // volume: luz em cima/esquerda, sombra embaixo/direita
    qArred(ctx, x, y, ax, ay, aw, 3, 2, 'rgba(255,255,255,0.30)');
    q(ctx, x, y, ax + 1, ay + 4, 2, ah - 8, 'rgba(255,255,255,0.16)');
    qArred(ctx, x, y, ax, ay + ah - 4, aw, 4, 2, 'rgba(0,0,0,0.30)');
    q(ctx, x, y, ax + aw - 3, ay + 4, 2, ah - 8, 'rgba(0,0,0,0.22)');
  }

  // Base em estrela de 5 pernas com rodinhas, vista de cima.
  function baseDaCadeira(ctx, x, y) {
    q(ctx, x, y, 30, 112, 68, 8, 'rgba(45,50,64,0.20)'); // sombra no chao
    const pernas = [[-38, 6], [38, 6], [-24, 16], [24, 16], [0, 20]];
    pernas.forEach(([dx, dy]) => {
      const px0 = 64 + Math.round(dx * 0.55) - 4;
      qArred(ctx, x, y, px0, 96, 9, dy + 6, 3, '#2f3542');
      qArred(ctx, x, y, 64 + dx - 5, 96 + dy, 11, 9, 4, '#454c5c');   // rodinha
      q(ctx, x, y, 64 + dx - 3, 96 + dy + 1, 6, 2, '#6b7488');
    });
    qArred(ctx, x, y, 58, 84, 12, 20, 3, '#59617a');                  // coluna
    q(ctx, x, y, 59, 84, 3, 20, '#79839c');
  }

  // Cadeira de escritorio nas quatro direcoes. `direcao` e pra que lado a pessoa
  // que senta fica virada: 'up' mostra o encosto de costas (como na referencia),
  // 'down' mostra o assento de frente, 'left'/'right' de perfil.
  // Poltrona estofada, vista de cima. Na referencia (172815, 172825, 172704) a
  // poltrona nao e uma cadeira de escritorio de outra cor: e um bloco macio com
  // ENCOSTO alto e um braco de cada lado, sem pe de estrela e sem rodinha.
  //
  // `direcao` = pra onde olha quem senta. O encosto fica do lado oposto, que e
  // o que a gente ve de fora.
  function poltronaEstofada(ctx, x, y, TILE, base, claro, escuro, direcao) {
    const d = direcao || 'up';
    q(ctx, x, y, 16, 112, 96, 8, 'rgba(45,50,64,0.20)');   // sombra no chao

    function bloco(ax, ay, aw, ah, cor, luz) {
      qContorno(ctx, x, y, ax, ay, aw, ah, 8, '#20242e');
      qArred(ctx, x, y, ax + 4, ay + 4, aw - 8, ah - 8, 6, cor);
      if (luz) q(ctx, x, y, ax + 8, ay + 8, aw - 16, 4, luz);
    }

    if (d === 'left' || d === 'right') {
      const paraEsq = d === 'left';
      // encosto no lado oposto a quem senta
      bloco(paraEsq ? 84 : 12, 16, 32, 96, escuro, claro);
      bloco(paraEsq ? 16 : 36, 24, 76, 80, base, claro);   // assento
      q(ctx, x, y, paraEsq ? 20 : 40, 40, 68, 4, escuro);  // vinco
      // bracos: em cima e embaixo, que e como aparecem de perfil
      qArred(ctx, x, y, paraEsq ? 20 : 40, 16, 64, 16, 5, escuro);
      qArred(ctx, x, y, paraEsq ? 20 : 40, 96, 64, 16, 5, escuro);
      return;
    }

    const encostoEmCima = d === 'up';
    // Virada pra cima a gente ve o ENCOSTO por inteiro; virada pra baixo ve o
    // assento, com uma fatia de encosto atras.
    if (encostoEmCima) {
      qArred(ctx, x, y, 20, 84, 88, 24, 6, escuro);        // fatia do assento
      bloco(16, 12, 96, 80, base, claro);                  // encosto
      q(ctx, x, y, 28, 28, 72, 4, claro);
      q(ctx, x, y, 60, 32, 4, 48, escuro);                 // costura do meio
    } else {
      bloco(20, 8, 88, 40, escuro, claro);                 // encosto atras
      bloco(16, 40, 96, 68, base, claro);                  // assento
      q(ctx, x, y, 60, 56, 4, 44, escuro);
    }
    // bracos, um de cada lado
    qArred(ctx, x, y, 8, 40, 20, 64, 6, escuro);
    qArred(ctx, x, y, 100, 40, 20, 64, 6, escuro);
    q(ctx, x, y, 12, 46, 12, 4, claro);
    q(ctx, x, y, 104, 46, 12, 4, claro);
  }

  function cadeiraDeEscritorio(ctx, x, y, TILE, base, claro, escuro, direcao) {
    // Sobe dentro da celula pra ENCOSTAR na mesa, invadindo a faixa da frente -
    // e o que a referencia mostra (`referencias/README.md`: "ela e mais alta que
    // 1 tile e encosta na mesa"). Com o recuo antigo de 5px sobrava um vao e a
    // cadeira parecia estacionada longe.
    y -= 48 * U; // ~3/8 de tile
    baseDaCadeira(ctx, x, y);

    // Apoio de braco com a barra laranja da referencia.
    function braco(ax, ay, aw, ah) {
      qContorno(ctx, x, y, ax, ay, aw, ah, 3, '#20242e');
      qArred(ctx, x, y, ax + 1, ay + 1, aw - 2, ah - 2, 3, escuro);
      qArred(ctx, x, y, ax + 1, ay + 7, aw - 2, ah - 16, 2, '#e8934a');
      q(ctx, x, y, ax + 2, ay + 8, 2, ah - 18, '#f6b877');
      q(ctx, x, y, ax + aw - 4, ay + 8, 2, ah - 18, '#c4732f');
    }

    if (direcao === 'down') {
      // de frente: encosto atras (visto de topo, mais fino) e assento na frente
      qContorno(ctx, x, y, 28, 14, 72, 26, 8, '#20242e');
      qArred(ctx, x, y, 29, 15, 70, 24, 7, base);
      qArred(ctx, x, y, 31, 17, 66, 8, 4, claro);
      braco(14, 44, 16, 40);
      braco(98, 44, 16, 40);
      qContorno(ctx, x, y, 26, 38, 76, 52, 10, '#20242e');
      qArred(ctx, x, y, 27, 39, 74, 50, 9, base);
      qArred(ctx, x, y, 30, 42, 68, 14, 6, claro);       // borda do assento
      q(ctx, x, y, 63, 46, 3, 40, 'rgba(0,0,0,0.22)');   // costura do meio
      qArred(ctx, x, y, 27, 82, 74, 7, 5, 'rgba(0,0,0,0.28)');
      return;
    }

    if (direcao === 'left' || direcao === 'right') {
      const paraEsq = direcao === 'left';
      qContorno(ctx, x, y, 26, 44, 76, 44, 9, '#20242e');
      qArred(ctx, x, y, 27, 45, 74, 42, 8, base);        // assento de perfil
      qArred(ctx, x, y, 30, 48, 68, 10, 5, claro);
      // encosto do lado das costas
      painelDeTela(ctx, x, y, paraEsq ? 74 : 22, 20, 32, 66, base, claro, escuro);
      braco(paraEsq ? 20 : 92, 48, 16, 34);
      return;
    }

    // 'up': de costas pra gente, como na foto da referencia
    braco(10, 42, 16, 46);
    braco(102, 42, 16, 46);
    painelDeTela(ctx, x, y, 26, 30, 76, 62, base, claro, escuro);
    qArred(ctx, x, y, 24, 88, 80, 10, 4, escuro);        // apoio lombar
    q(ctx, x, y, 27, 89, 74, 2, 'rgba(255,255,255,0.20)');
    qContorno(ctx, x, y, 40, 8, 48, 26, 8, '#20242e');   // encosto de cabeca
    qArred(ctx, x, y, 41, 9, 46, 24, 7, base);
    qArred(ctx, x, y, 44, 12, 40, 7, 3, claro);
    q(ctx, x, y, 44, 27, 40, 4, 'rgba(0,0,0,0.25)');
  }

  // Encosto redesenhado por cima de quem esta sentado. Como na referencia, a
  // pessoa fica de costas: so a cabeca aparece acima do encosto.
  function desenharEncostoPorCima(ctx, px, py) {
    const TILE = OfficeMap.TILE;
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    const tile = OfficeMap.tiles[row] && OfficeMap.tiles[row][col];
    if (!OfficeMap.ASSENTOS.has(tile)) return;

    const direcao = OfficeMap.DIRECAO_ASSENTO[tile] || 'up';
    // Virado pra baixo o encosto fica **atras** da pessoa: nao volta por cima.
    if (direcao === 'down') return;

    const x = col * TILE;
    const y = row * TILE;
    // Só a parte onde ficam as costas: pra cima cobre tudo (a cabeca esta acima
    // do tile), de perfil cobre so a metade de tras.
    let recorte = [x, y + 1, TILE, TILE - 1];
    if (direcao === 'left') recorte = [x + TILE / 2, y + 1, TILE / 2, TILE - 1];
    if (direcao === 'right') recorte = [x, y + 1, TILE / 2, TILE - 1];

    ctx.save();
    ctx.beginPath();
    ctx.rect(recorte[0], recorte[1], recorte[2], recorte[3]);
    ctx.clip();
    drawObstacleTile(ctx, col, row, tile, TILE, OfficeMap.tiles);
    ctx.restore();
  }

  // Camera que segue a pessoa, com zoom fixo (o mapa e maior que a tela). Antes
  // o mapa inteiro era espremido pra caber, o que deixava tudo minusculo.
  let ZOOM = 2;
  const ZOOM_MIN = 1.25;
  const ZOOM_MAX = 3.5;
  const ZOOM_MESA = 3.25; // de perto o bastante pra escolher onde pousar a coisa
  let camX = 0;
  let camY = 0;

  // O zoom e a camera nao pulam pro valor novo: perseguem um alvo, um pouco a
  // cada quadro. E isso que faz "chegar na mesa" parecer uma aproximacao em vez
  // de um corte.
  let zoomAlvo = 2;
  let zoomDoUsuario = 2;   // o que a pessoa escolheu no +/-, pra voltar depois
  let focoCamera = null;   // ponto do mundo pra centralizar; null = segue a pessoa

  // ------------------------------------------------------------- celular
  // Um dedo e o clique de sempre: o navegador transforma o toque em 'click', e
  // o boneco anda ate ali. Dois dedos fazem pinca de zoom - no celular nao ha
  // botao de roda nem espaco sobrando pro +/-. O canvas tem touch-action: none
  // (style.css): sem isso a pinca daria zoom na PAGINA inteira, com a interface
  // junto, em vez de no mapa.
  let pincaFimEm = 0;

  function ligarPinca() {
    let inicio = null;   // { dist, zoom }
    const distancia = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2) return;
      inicio = { dist: distancia(e.touches) || 1, zoom: zoomAlvo };
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (!inicio || e.touches.length !== 2) return;
      e.preventDefault();
      const z = inicio.zoom * (distancia(e.touches) / inicio.dist);
      zoomAlvo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
      zoomDoUsuario = zoomAlvo;
    }, { passive: false });
    const soltar = (e) => {
      if (!inicio || e.touches.length >= 2) return;
      inicio = null;
      pincaFimEm = performance.now();
    };
    canvas.addEventListener('touchend', soltar);
    canvas.addEventListener('touchcancel', soltar);
  }

  function ajustarZoom(passo) {
    zoomAlvo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoomAlvo + passo) * 100) / 100));
    zoomDoUsuario = zoomAlvo;
  }

  // Chega perto de uma mesa e centraliza nela.
  function focarNaMesa(celulas) {
    if (!celulas || !celulas.length) return;
    const TILE = OfficeMap.TILE;
    let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
    celulas.forEach(([c, r]) => {
      if (c < c0) c0 = c;
      if (r < r0) r0 = r;
      if (c > c1) c1 = c;
      if (r > r1) r1 = r;
    });
    focoCamera = {
      x: ((c0 + c1 + 1) / 2) * TILE,
      y: ((r0 + r1 + 1) / 2) * TILE,
    };
    zoomAlvo = Math.max(zoomDoUsuario, ZOOM_MESA);
  }

  function soltarFoco() {
    focoCamera = null;
    zoomAlvo = zoomDoUsuario;
  }

  // Centraliza a camera num ponto sem mexer no zoom (editor de areas: escolher
  // uma area da lista leva a vista ate ela). Solta com soltarFoco.
  function olharPara(x, y) {
    focoCamera = { x, y };
  }

  // Aproximacao exponencial, independente da taxa de quadros: num monitor de
  // 144Hz o movimento e o mesmo que num de 60Hz.
  function perseguir(atual, alvo, dt, velocidade) {
    const t = 1 - Math.pow(0.001, dt * velocidade);
    return atual + (alvo - atual) * t;
  }

  function animarCamera(dt) {
    ZOOM = Math.abs(zoomAlvo - ZOOM) < 0.002 ? zoomAlvo : perseguir(ZOOM, zoomAlvo, dt, 1.1);
  }

  function setCanvasSize() {
    const wrap = document.querySelector('.area-jogo');
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    canvas.width = Math.round(wrap.clientWidth * dpr);
    canvas.height = Math.round(wrap.clientHeight * dpr);
    ctx.imageSmoothingEnabled = false;
  }

  // Onde, na tela, cai um ponto do mundo (em tiles com fracao). E o que deixa a
  // barrinha da coisa selecionada acompanhar a camera.
  function pontoNaTela(tx, ty) {
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + (tx * OfficeMap.TILE - camX) * ZOOM,
      y: r.top + (ty * OfficeMap.TILE - camY) * ZOOM,
    };
  }

  function tamanhoDaVista() {
    return {
      w: canvas.clientWidth / ZOOM,
      h: canvas.clientHeight / ZOOM,
    };
  }

  function atualizarCamera(dt) {
    const self = players.get(selfId);
    if (!self) return;
    const vista = tamanhoDaVista();
    const worldW = OfficeMap.COLS * OfficeMap.TILE;
    const worldH = OfficeMap.ROWS * OfficeMap.TILE;
    // centraliza na pessoa - ou na mesa, quando o cartao dela esta aberto -,
    // mas sem passar da borda do mapa
    const alvoX = focoCamera ? focoCamera.x : self.displayX;
    const alvoY = focoCamera ? focoCamera.y : self.displayY;
    const destinoX = worldW <= vista.w
      ? (worldW - vista.w) / 2
      : Math.max(0, Math.min(worldW - vista.w, alvoX - vista.w / 2));
    const destinoY = worldH <= vista.h
      ? (worldH - vista.h) / 2
      : Math.max(0, Math.min(worldH - vista.h, alvoY - vista.h / 2));

    // O primeiro quadro (dt indefinido) assenta a camera no lugar, senao ela
    // entraria deslizando da esquina do mapa.
    if (!dt) {
      camX = destinoX;
      camY = destinoY;
      return;
    }
    // Rapido o bastante pra andar nao parecer arrastado, lento o bastante pra
    // aproximacao da mesa nao virar um corte.
    camX = perseguir(camX, destinoX, dt, 2.2);
    camY = perseguir(camY, destinoY, dt, 2.2);
  }

  function tryMove(px, py, dx, dy) {
    let x = px, y = py;
    if (dx !== 0 && OfficeMap.isWalkable(px + dx, py)) x = px + dx;
    if (dy !== 0 && OfficeMap.isWalkable(x, py + dy)) y = py + dy;
    return { x, y };
  }

  function criarJogadorLocal(data) {
    return Object.assign(criarJogadorRemoto(data), {
      moveTarget: null,
      path: [],
      destinoFinal: null,
      vx: 0,
      vy: 0,
    });
  }

  function criarJogadorRemoto(data) {
    return {
      id: data.id,
      uid: data.uid, // identidade estavel da pessoa: e por ela que a DM anda
      name: data.name,
      appearance: data.appearance,
      x: data.x,
      y: data.y,
      displayX: data.x,
      displayY: data.y,
      targetX: data.x,
      targetY: data.y,
      dir: data.dir || 'down',
      moving: !!data.moving,
      sentado: !!data.sentado,
      status: STATUS_VALIDOS.includes(data.status) ? data.status : 'livre',
      dividindoTela: !!data.dividindoTela,
      isAdmin: !!data.isAdmin,
      // Chamada marcada e livro aberto vem junto no `init`: quem chega depois
      // ja cai na chamada em andamento em vez de ficar de fora ate a proxima
      // mudanca de estado.
      chamada: data.chamada || null,
      lendo: data.lendo || null,
      reacao: null,
    };
  }

  function ajustarBotaoStatus(status) {
    const btn = document.getElementById('btn-status');
    STATUS_VALIDOS.forEach((s) => btn.classList.remove('status-' + s));
    btn.classList.add('status-' + status);
    btn.querySelector('.texto-status').textContent = STATUS_LABEL[status];
  }

  // O discador marca "Em ligacao" enquanto a pessoa fala com um cliente, e
  // devolve o status de antes quando a sessao pausa ou acaba. Devolve o status
  // que estava, pra ele saber o que restaurar.
  function definirStatusProprio(status) {
    const self = players.get(selfId);
    if (!self || !STATUS_VALIDOS.includes(status)) return null;
    const antes = self.status;
    if (antes === status) return antes;
    self.status = status;
    ajustarBotaoStatus(status);
    Network.sendStatus(status);
    return antes;
  }

  function setIndicador(estado) {
    const el = document.getElementById('indicador-conexao');
    const texto = el.querySelector('.texto-indicador');
    el.classList.remove('indicador-conectado', 'indicador-conectando');
    if (estado === 'conectado') {
      el.classList.add('indicador-conectado');
      texto.textContent = 'Conectado';
    } else {
      el.classList.add('indicador-conectando');
      texto.textContent = 'Reconectando...';
    }
  }

  // Cracha do ambiente atual no topo esquerdo (o Gather mostra em que sala voce
  // esta). So mexe no DOM quando a sala muda de verdade.
  let salaExibida = null;
  function atualizarBadgeSala() {
    const self = players.get(selfId);
    if (!self) return;
    const sala = OfficeMap.getRoomAt(self.x, self.y);
    const nome = sala ? sala.nome : 'Escritorio';
    if (nome === salaExibida) return;
    salaExibida = nome;
    const el = document.getElementById('badge-sala-nome');
    if (el) el.textContent = nome;
  }

  // Diz ao servidor o tamanho da tela em pixels do mapa. E com isso que ele
  // separa quem esta na tela desta pessoa (posicao 20x por segundo) de quem esta
  // longe (2x) - ver o ciclo de repasse em server/index.js.
  //
  // Usa o MENOR zoom entre o atual e o alvo: durante um zoom-out a tela ja vai
  // ficar maior, e e melhor receber um pouco a mais do que ver alguem entrar na
  // borda aos saltos. Manda so quando muda de verdade (mais de 8%).
  let vistaEnviada = null;
  let proximaChecagemVista = 0;
  function talvezEnviarVista(now) {
    if (!selfId || now < proximaChecagemVista) return;
    proximaChecagemVista = now + 400;
    const z = Math.min(ZOOM, zoomAlvo);
    const w = Math.round(canvas.clientWidth / z);
    const h = Math.round(canvas.clientHeight / z);
    if (!w || !h) return;
    const mudou = !vistaEnviada
      || Math.abs(w - vistaEnviada.w) / vistaEnviada.w > 0.08
      || Math.abs(h - vistaEnviada.h) / vistaEnviada.h > 0.08;
    if (!mudou) return;
    vistaEnviada = { w, h };
    Network.enviarVista(vistaEnviada);
  }

  function loop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    localWalkTime += dt;

    atualizarJogadorLocal(dt);
    interpolarRemotos(dt);
    Calls.updateProximity(players);
    atualizarBadgeSala();
    animarCamera(dt);
    talvezEnviarVista(now);
    render(now, dt);
  }

  function atualizarJogadorLocal(dt) {
    const self = players.get(selfId);
    if (!self) return;

    // ---- teclado: WASD/setas, com Shift virando kart --------------------
    const ix = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0)
      - (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0);
    const iy = (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0)
      - (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0);
    const temInput = ix !== 0 || iy !== 0;
    const kart = teclas.has('ShiftLeft') || teclas.has('ShiftRight');

    if (temInput) {
      // teclado manda: cancela o caminho do clique
      self.moveTarget = null;
      self.path = [];
      self.destinoFinal = null;
    }

    if (self.vx === undefined) { self.vx = 0; self.vy = 0; }

    if (temInput || self.vx || self.vy) {
      const n = Math.hypot(ix, iy) || 1;
      if (kart && temInput) {
        // acelera na direcao pedida, MAS mantem o que ja tinha - e a inercia
        // que faz a curva sair aberta
        self.vx += (ix / n) * ACEL_KART * dt;
        self.vy += (iy / n) * ACEL_KART * dt;
      } else if (temInput) {
        // no passo normal a resposta e imediata: andar dentro do escritorio
        // tem que ser preciso
        self.vx = (ix / n) * SPEED;
        self.vy = (iy / n) * SPEED;
      }
      if (!temInput || kart) {
        const freio = Math.exp(-ATRITO_KART * dt);
        self.vx *= freio;
        self.vy *= freio;
      }
      const v = Math.hypot(self.vx, self.vy);
      const teto = kart ? SPEED_KART : SPEED;
      if (v > teto) { self.vx = (self.vx / v) * teto; self.vy = (self.vy / v) * teto; }
      if (v < 4 && !temInput) { self.vx = 0; self.vy = 0; }
    }

    let moving = false;

    if (self.vx || self.vy) {
      const antes = { x: self.x, y: self.y };
      const r = tryMove(self.x, self.y, self.vx * dt, self.vy * dt);
      if (r.x === antes.x && self.vx) self.vx = 0;   // bateu na parede: para o eixo
      if (r.y === antes.y && self.vy) self.vy = 0;
      self.x = r.x;
      self.y = r.y;

      const vel = Math.hypot(self.vx, self.vy);
      moving = vel > 6;
      if (temInput) {
        if (Math.abs(ix) > Math.abs(iy)) self.dir = ix > 0 ? 'right' : 'left';
        else if (iy !== 0) self.dir = iy > 0 ? 'down' : 'up';
      }

      // POEIRA: so quando esta derrapando de verdade, ou seja quando a
      // velocidade aponta pra um lado diferente do que a pessoa esta pedindo.
      if (kart && vel > SPEED_KART * 0.45 && temInput) {
        const n2 = Math.hypot(ix, iy) || 1;
        const alinhamento = (self.vx * (ix / n2) + self.vy * (iy / n2)) / vel;
        if (alinhamento < 0.93 && poeira.length < POEIRA_MAX) {
          poeira.push({ x: self.x, y: self.y + 8, vida: 1 });
        }
      }
    }

    // ---- o kart em si: aparece, gira e some ------------------------------
    if (self.kart === undefined) { self.kart = 0; self.kartAng = 0; }
    // Nasce apontando pro lado que o boneco ja esta olhando.
    if (self.kart === 0 && kart) self.kartAng = ANG_DIR[self.dir] || 0;

    const alvoKart = kart ? 1 : 0;
    const taxa = alvoKart > self.kart ? KART_ENTRA : KART_SAI;
    self.kart += (alvoKart - self.kart) * (1 - Math.exp(-taxa * dt));
    // Encosta nas pontas, senao ele fica eternamente em 0.999 e nunca "some".
    if (self.kart < 0.004) self.kart = 0;
    if (self.kart > 0.996) self.kart = 1;

    // Pra onde o carrinho esta REALMENTE indo (a direcao da velocidade), e nao
    // pra onde a pessoa esta apontando.
    //
    // Isso importa: o desenho compara este angulo com a direcao pra qual o
    // boneco OLHA, e inclina o carrinho pela diferenca. Enquanto a pessoa nao
    // vira, os dois batem e o carrinho fica reto; no meio da curva o boneco ja
    // olha pro lado novo e a velocidade ainda aponta pro antigo - e ai ele
    // tomba. Se eu perseguisse o input aqui, os dois seriam a mesma coisa e a
    // inclinacao nunca apareceria.
    if (self.kart > 0) {
      const vel = Math.hypot(self.vx || 0, self.vy || 0);
      let alvoAng = self.kartAng;
      if (vel > 20) alvoAng = Math.atan2(self.vy, self.vx);
      else if (temInput) alvoAng = Math.atan2(iy, ix);
      self.kartAng = aproximarAngulo(self.kartAng, alvoAng, 1 - Math.exp(-KART_GIRO * dt));
    }

    if (self.moveTarget) {
      const dxTotal = self.moveTarget.x - self.x;
      const dyTotal = self.moveTarget.y - self.y;
      const dist = Math.hypot(dxTotal, dyTotal);

      if (dist < 3) {
        self.moveTarget = (self.path && self.path.length) ? self.path.shift() : null;
        if (!self.moveTarget) self.destinoFinal = null;
      } else {
        const passo = Math.min(SPEED * dt, dist);
        const stepX = (dxTotal / dist) * passo;
        const stepY = (dyTotal / dist) * passo;
        const antes = { x: self.x, y: self.y };
        const result = tryMove(self.x, self.y, stepX, stepY);
        self.x = result.x;
        self.y = result.y;

        const percorrido = Math.hypot(self.x - antes.x, self.y - antes.y);
        if (percorrido < 0.05) {
          self.moveTarget = null;
          self.path = [];
          self.destinoFinal = null;
        } else {
          moving = true;
          if (Math.abs(dxTotal) > Math.abs(dyTotal)) self.dir = dxTotal > 0 ? 'right' : 'left';
          else self.dir = dyTotal > 0 ? 'down' : 'up';
        }
      }
    }
    self.moving = moving;

    // Parou em cima de uma cadeira? Senta: encaixa no centro da celula e vira
    // pra mesa (a cadeira sempre olha pra cima no desenho).
    const TILE = OfficeMap.TILE;
    const col = Math.floor(self.x / TILE);
    const row = Math.floor(self.y / TILE);
    const emAssento = !moving && !self.moveTarget
      && OfficeMap.tiles[row] && OfficeMap.ASSENTOS.has(OfficeMap.tiles[row][col]);

    if (emAssento) {
      if (!self.sentado) {
        self.x = col * TILE + TILE / 2;
        self.y = row * TILE + TILE / 2;
        // vira pro lado que a cadeira aponta
        self.dir = OfficeMap.DIRECAO_ASSENTO[OfficeMap.tiles[row][col]] || 'up';
        self.sentado = true;
      }
    } else {
      self.sentado = false;
    }

    self.displayX = self.x;
    self.displayY = self.y;

    for (let i = poeira.length - 1; i >= 0; i--) {
      poeira[i].vida -= dt * 1.8;
      if (poeira[i].vida <= 0) poeira.splice(i, 1);
    }

    const agora = performance.now();
    // O kart vai arredondado: a 2 casas no angulo e a 1/20 no valor. Sem isso
    // ele mudaria em TODO quadro (e um numero que persegue outro, nunca chega
    // redondo) e a pessoa parada de Shift apertado viraria uma fonte de
    // mensagem continua pro servidor sem sair do lugar.
    // Posicao em pixel inteiro: casa decimal de pixel nao aparece na tela e
    // engordava cada pacote em ~20 bytes.
    const estado = {
      x: Math.round(self.x), y: Math.round(self.y), dir: self.dir, moving: self.moving, sentado: self.sentado,
      kart: Math.round(self.kart * 20) / 20,
      kartAng: Math.round(self.kartAng * 100) / 100,
    };
    const mudou = Object.keys(estado).some((c) => lastSentState[c] !== estado[c]);
    if (mudou && agora - lastMoveSent > MOVE_SEND_INTERVAL) {
      Network.sendMove(estado);
      lastMoveSent = agora;
      lastSentState = estado;
    }
  }

  function interpolarRemotos(dt) {
    const fator = Math.min(1, dt * 12);
    const agora = performance.now();
    players.forEach((p) => {
      if (p.id === selfId) return;
      // Posicao chega 10x por segundo (MOVE_SEND_INTERVAL). Perseguir so o
      // ultimo ponto faz a pessoa andar aos trancos: acelera quando o pacote
      // chega, freia ate o proximo. Entao a mira anda na velocidade estimada
      // enquanto o proximo nao vem - mas so por um intervalo e meio: pacote
      // atrasado nao pode fazer o boneco atravessar parede. Simulado: a
      // velocidade na tela oscilava 18% a 22 pacotes/s e fica em 0% assim.
      const idade = (agora - (p.tPacote || 0)) / 1000;
      const adiante = idade < 0.15 ? idade : 0;
      const miraX = p.targetX + (p.vx || 0) * adiante;
      const miraY = p.targetY + (p.vy || 0) * adiante;
      p.displayX += (miraX - p.displayX) * fator;
      p.displayY += (miraY - p.displayY) * fator;

      // Mesmo tratamento pro kart: quem olha ve a mesma animacao suave que
      // quem dirige, e nao um kart piscando a cada pacote.
      if (p.kart === undefined) { p.kart = p.kartAlvo || 0; p.kartAng = p.kartAngAlvo || 0; }
      p.kart += ((p.kartAlvo || 0) - p.kart) * fator;
      if (p.kart < 0.004) p.kart = 0;
      p.kartAng = aproximarAngulo(p.kartAng, p.kartAngAlvo || 0, fator);
    });
  }

  function desenharBolhaVideo(ctx, x, y, videoEl, corAnel) {
    const raio = 21;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#0d1117';
    ctx.fill();
    ctx.clip();
    const vw = videoEl.videoWidth || 4, vh = videoEl.videoHeight || 3;
    const escalaV = Math.max((raio * 2) / vw, (raio * 2) / vh);
    const dw = vw * escalaV, dh = vh * escalaV;
    ctx.drawImage(videoEl, x - dw / 2, y - dh / 2, dw, dh);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.strokeStyle = corAnel;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Chamada so de audio (sem camera): bolha com um iconezinho de microfone.
  function desenharBolhaAudio(ctx, x, y, corAnel) {
    const raio = 21;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.fillStyle = '#1c2430';
    ctx.fill();
    ctx.strokeStyle = corAnel;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = corAnel;
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 10, 8, 13, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y + 3, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = corAnel;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x, y + 13);
    ctx.stroke();
    ctx.restore();
  }

  // ---- o carrinho, que e o "kart" da sede ---------------------------------
  //
  // Arte do PROPRIO pacote: moveable/shopping-cart.png, de Eliza Wyatt, sob
  // OGA-BY 3.0 (esta no credits.txt da pasta moveable).
  //
  // A minha primeira tentativa foi desenhar um kart, e ficou pessimo por um
  // motivo que da pra nomear: eu desenhei em VISTA DE CIMA debaixo de um boneco
  // em 3/4. E a mesma incompatibilidade de projecao que derrubou as portas.
  // Procurei kart pronto e NAO EXISTE em LPC - o gerador oficial tem 21
  // categorias e nenhuma de veiculo. Esta arte, ao contrario, ja e 3/4, ja e do
  // mesmo pacote e ja e do mesmo traco.
  //
  // A folha e 32x64 = DOIS quadros de 32: o mesmo carrinho espelhado, um com a
  // alca pra direita e outro pra esquerda. Entao esquerda e direita vem
  // prontas. Cima e baixo nao existem na folha e sao desenhadas aqui, com as
  // cores TIRADAS da propria arte (amostradas da folha, nao escolhidas a olho).
  const FOLHA_CARRINHO = new Image();
  FOLHA_CARRINHO.src = 'assets/lpc-moveis/moveable/shopping-cart.png';
  // Amostradas de moveable/shopping-cart.png: as 8 cores que aparecem em mais
  // de 40 pixels, mais o verde da empunhadura.
  // ALTURA e CORTE sao MEDIDOS. Contando os pixels opacos de cada uma das 32
  // linhas da folha:
  //
  //     linhas  1..3    a alca, estreita
  //     linhas  4..11   o aro da cesta, na largura toda (x 1..30)
  //     linhas 12..25   o corpo da cesta, afinando (x 6..30)
  //     linhas 26..30   as rodas (x 8..26)
  //
  // ALTURA = 30 sai de uma conta: o boneco tem 46px e a cintura fica uns 22px
  // acima do pe; pra cesta engolir a pessoa da cintura pra baixo, o aro (linha
  // 4) tem que cair nessa altura, e isso da 30px de carrinho.
  //
  // CORTE = 12 e onde o aro acaba e o corpo da cesta comeca: a linha que separa
  // o que fica ATRAS da pessoa do que fica NA FRENTE dela.
  //
  // MIOLO = a faixa de colunas que vira a vista de frente e de tras. Ver
  // desenharCarrinho.
  const ALTURA_CARRINHO = 30;
  const CORTE_CARRINHO = 12;
  // ---- as duas vistas que a folha nao tem ---------------------------------
  //
  // Norte e sul nao existem no pacote, e nao existem em lugar nenhum: procurei
  // carrinho de 4 direcoes e nao ha, nem no repositorio da autora (o arquivo
  // original tem os mesmos 1.405 bytes e os mesmos dois quadros). Entao sao
  // desenhadas aqui - mas desenhadas como PIXEL ART, com a gramatica da folha,
  // e nao com retangulos meus.
  //
  // A gramatica saiu de despejar o quadro de lado pixel a pixel:
  //   - contorno SEMPRE `a` (#343043), 1px, em volta de tudo
  //   - trama: vertical a cada 3 colunas, e um fio horizontal claro `h` a cada
  //     3 linhas. E isso que faz ler como cesta e nao como caixa
  //   - o aro ganha uma linha `b` (a cor mais clara da folha) em cima
  //   - roda de 5x5, no mesmo desenho das da folha
  //   - onze cores, todas da folha. Nenhuma inventada.
  //
  // A perspectiva e o que faz as duas funcionarem: o aro de TRAS e mais
  // estreito e mais alto (esta mais longe), o aro da FRENTE e mais largo e mais
  // baixo, e o painel afunila pra baixo. Quem senta aparece entre os dois.
  //
  // Duas versoes anteriores foram pro lixo aqui: um desenho meu a mao (virou
  // grade de cadeia) e um recorte das colunas do meio do quadro de lado
  // (continuava com a perspectiva de lado, so que estreita).
  const PALETA_CARRINHO = {
    a: '#343043', b: '#c7cfcc', c: '#818e97', d: '#86b278', e: '#456238',
    f: '#6a7587', g: '#4b4b60', h: '#a8b3b8', i: '#29253a', j: '#1b192b',
  };

  const CARRINHO_SUL = [
    '................................',
    '................................',
    '................................',
    '................................',
    '........aaaaaaaaaaaaaaaa........',
    '........abbbbbbbbbbbbbba........',
    '........ahhhhhhhhhhhhhha........',
    '........afcfccfccfccfcca........',
    '........agiiiiiiiiiiiiga........',
    '........agiiiiiiiiiiiiga........',
    '........agiiiiiiiiiiiiga........',
    '........afiiiiiiiiiiiifa........',
    '......aaaaaaaaaaaaaaaaaaaa......',
    '......abbbbbbbbbbbbbbbbbba......',
    '......ahhhhhhhhhhhhhhhhhha......',
    '......afifiififiififiififa......',
    '......acacaacacaacacaacaca......',
    '......ahhhhhhhhhhhhhhhhhha......',
    '......afifiififiififiififa......',
    '......acacaacacaacacaacaca......',
    '.......ahhhhhhhhhhhhhhhha.......',
    '.......afifiififiififiifa.......',
    '.......acacaacacaacacaaca.......',
    '........ahhhhhhhhhhhhhha........',
    '........agggggggggggggga........',
    '........aaaaaaaaaaaaaaaa........',
    '........gijig......gijig........',
    '........ijjji......ijjji........',
    '........jjgjj......jjgjj........',
    '........ijjji......ijjji........',
    '.........iji........iji.........',
    '................................',
  ];

  // Igual ao sul, mais a BARRA DE EMPURRAR. Ela fica 1px mais larga que a cesta
  // de cada lado e leva contorno em cima e embaixo: e isso que a faz ler como
  // barra na frente da cesta, e nao como uma listra verde pintada nela.
  const CARRINHO_NORTE = [
    '................................',
    '................................',
    '................................',
    '................................',
    '........aaaaaaaaaaaaaaaa........',
    '........abbbbbbbbbbbbbba........',
    '........ahhhhhhhhhhhhhha........',
    '........afcfccfccfccfcca........',
    '........agiiiiiiiiiiiiga........',
    '........agiiiiiiiiiiiiga........',
    '........agiiiiiiiiiiiiga........',
    '........afiiiiiiiiiiiifa........',
    '......aaaaaaaaaaaaaaaaaaaa......',
    '......abbbbbbbbbbbbbbbbbba......',
    '......ahhhhhhhhhhhhhhhhhha......',
    '......afifiififiififiififa......',
    '.....aaaaaaaaaaaaaaaaaaaaaa.....',
    '.....adddddddddddddddddddda.....',
    '.....aeeeeeeeeeeeeeeeeeeeea.....',
    '.....aaaaaaaaaaaaaaaaaaaaaa.....',
    '.......ahhhhhhhhhhhhhhhha.......',
    '.......afifiififiififiifa.......',
    '.......acacaacacaacacaaca.......',
    '........ahhhhhhhhhhhhhha........',
    '........agggggggggggggga........',
    '........aaaaaaaaaaaaaaaa........',
    '........gijig......gijig........',
    '........ijjji......ijjji........',
    '........jjgjj......jjgjj........',
    '........ijjji......ijjji........',
    '.........iji........iji.........',
    '................................',
  ];

  function pintarMapaDoCarrinho(ctx, mapa) {
    for (let y = 0; y < mapa.length; y++) {
      const linha = mapa[y];
      for (let x = 0; x < linha.length; x++) {
        const cor = PALETA_CARRINHO[linha[x]];
        if (!cor) continue;
        ctx.fillStyle = cor;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // `parte` e o ponto todo desta funcao:
  //   'atras'  = aro e alca, desenhado ANTES do boneco (fica atras das costas)
  //   'frente' = corpo da cesta e rodas, DEPOIS do boneco (tapa as pernas)
  //
  // Sem essa divisao o carrinho inteiro vinha por cima e a parede DE TRAS da
  // cesta tapava o peito - que foi o Caio dizer "ele parece nao estar dentro do
  // kart". Ninguem esta dentro de nada se a parede de tras passa na frente. E o
  // mesmo raciocinio do encosto da cadeira.
  //
  // Leste e oeste saem da folha do pacote; norte e sul, dos mapas de pixel
  // acima. O corte em 12 vale pros tres casos porque os tres foram construidos
  // na mesma grade de 32.
  function desenharCarrinho(ctx, x, y, dir, k, inclina, parte) {
    if (k <= 0.01) return;
    const deLado = dir === 'left' || dir === 'right';
    if (deLado && !FOLHA_CARRINHO.naturalWidth) return;
    const s = (0.7 + 0.3 * k) * (ALTURA_CARRINHO / 32);
    const L = 32 * s;

    ctx.save();
    ctx.translate(x, y + 2 - L / 2);
    // O carrinho tomba um pouco pro lado pra onde a pessoa esta VIRANDO
    // enquanto o corpo ainda desliza reto. No maximo 14 graus de proposito -
    // arte de pixel girada demais vira borrao.
    if (inclina) ctx.rotate(Math.max(-0.25, Math.min(0.25, inclina)));
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.imageSmoothingEnabled = false;
    // Daqui pra baixo tudo fala em coordenada da FOLHA (32x32), o que deixa os
    // numeros medidos acima valerem literalmente no codigo.
    ctx.translate(-L / 2, -L / 2);
    ctx.scale(s, s);

    ctx.beginPath();
    if (parte === 'atras') ctx.rect(0, 0, 32, CORTE_CARRINHO);
    else ctx.rect(0, CORTE_CARRINHO, 32, 32 - CORTE_CARRINHO);
    ctx.clip();

    if (deLado) {
      // Quadro 0 = alca a direita (carrinho apontando pra ESQUERDA);
      // quadro 1 = o espelho dele.
      ctx.drawImage(FOLHA_CARRINHO, 0, (dir === 'left' ? 0 : 1) * 32, 32, 32, 0, 0, 32, 32);
    } else {
      pintarMapaDoCarrinho(ctx, dir === 'up' ? CARRINHO_NORTE : CARRINHO_SUL);
    }
    ctx.restore();
  }

  // Ate onde o boneco pode aparecer: o fundo da cesta (linha 25 da folha).
  // Abaixo disso sao as rodas, e entre elas a folha e VAZIA - era por esse vao
  // que os pes apareciam embaixo do carrinho. Recortar o boneco nesta linha
  // resolve em todas as quatro direcoes de uma vez, em vez de eu tapar buraco
  // direcao por direcao.
  function fundoDaCesta(y, k) {
    const s = (0.7 + 0.3 * k) * (ALTURA_CARRINHO / 32);
    return y + 2 - 32 * s + 25 * s;
  }

  function desenharAnelStatus(ctx, x, y, status) {
    ctx.save();
    ctx.strokeStyle = STATUS_COR[status] || STATUS_COR.livre;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function desenharIconeFone(ctx, x, y, cor) {
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, 4, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = cor;
    ctx.fillRect(x - 5.5, y - 1, 2.5, 4.5);
    ctx.fillRect(x + 3, y - 1, 2.5, 4.5);
    ctx.restore();
  }

  // Cracha do jogador no estilo Gather: pilula escura com bolinha de status
  // (ou fone, quando a pessoa esta numa chamada) e o nome do lado.
  // A placa de nome.
  //
  // Era grande, roxa e em negrito, e flutuava bem acima da cabeca. Com uma
  // pessoa so passava; com o escritorio cheio viravam etiquetas coloridas
  // tapando o cenario, e e isso que o Caio leu como amador.
  //
  // A referencia (`referencias/03-site-pods-por-time.png`) faz o contrario, e
  // faz por um motivo: a placa e INFORMACAO DE APOIO, nao o assunto da tela. La
  // ela e uma pilula ESCURA E TRANSLUCIDA, pequena, colada no boneco. O que
  // chama atencao continua sendo o boneco e o escritorio.
  //
  // Entao: fundo escuro em vez de roxo saturado, 10px em vez de 11 em negrito,
  // 16px de altura em vez de 19, e um ponto redondo de status no lugar do
  // quadradinho. Quem sou EU ganha um contorno claro de 1px - continua dando
  // pra achar o proprio boneco de relance, sem precisar de cor gritante.
  function desenharCracha(ctx, x, y, texto, corStatus, emChamada, isSelf) {
    ctx.save();
    // TAMANHO FIXO DE TELA. A placa era desenhada dentro do mundo, entao o zoom
    // da camera multiplicava ela: com ZOOM em 3,25 (o que a camera usa ao focar
    // uma mesa) um texto de 10px virava 32px na tela. Era essa a placa gigante.
    //
    // Placa de nome e INTERFACE, nao cenario: tem que ter o mesmo tamanho em
    // qualquer zoom, como um rotulo de mapa. Ancora no mundo (ela segue a
    // pessoa), desenho em pixel de tela.
    ctx.translate(x, y);
    ctx.scale(1 / ZOOM, 1 / ZOOM);

    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const larguraTexto = ctx.measureText(texto).width;
    const padX = 7, icone = 12, h = 17;
    const w = padX * 2 + icone + larguraTexto;
    const px = Math.round(-w / 2);
    const py = Math.round(-h);

    ctx.fillStyle = isSelf ? 'rgba(28,30,40,0.90)' : 'rgba(28,30,40,0.78)';
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, 8);
    ctx.fill();
    if (isSelf) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const cx = px + padX + 3.5;
    const cy = py + h / 2;
    if (emChamada) {
      desenharIconeFone(ctx, cx, cy, '#ffffff');
    } else {
      // QUADRADINHO arredondado, nao circulo. Ampliando o print da referencia
      // (referencias/03-site-pods-por-time.png, a etiqueta "You") o marcador e
      // claramente um quadrado de canto redondo. O codigo original ja fazia
      // assim e eu troquei por circulo sem conferir - este comentario existe
      // pra ninguem "consertar" de novo.
      ctx.fillStyle = corStatus;
      ctx.beginPath();
      ctx.roundRect(cx - 3.2, cy - 3.2, 6.4, 6.4, 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.textAlign = 'left';
    ctx.fillText(texto, px + padX + icone, cy + 0.5);
    ctx.restore();
  }

  function desenharReacao(ctx, x, y, reacao, now) {
    const DURACAO = 2200;
    const decorrido = DURACAO - (reacao.expiresAt - now);
    const t = Math.min(1, Math.max(0, decorrido / DURACAO));
    const bounce = Math.sin(Math.min(1, t * 2) * Math.PI) * 8;
    ctx.save();
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
    ctx.fillText(reacao.emoji, x, y - bounce);
    ctx.restore();
  }

  function desenharMinimapa() {
    const mini = document.getElementById('minimapa');
    if (!mini) return;
    const mctx = mini.getContext('2d');
    const w = mini.width, h = mini.height;
    const { COLS, ROWS, TILE, tiles, LIVRE, CADEIRA, TAPETE } = OfficeMap;
    const worldW = COLS * TILE, worldH = ROWS * TILE;
    const escala = Math.min(w / worldW, h / worldH);
    const offX = (w - worldW * escala) / 2;
    const offY = (h - worldH * escala) / 2;
    const lado = TILE * escala + 0.6;

    mctx.clearRect(0, 0, w, h);

    // minimapa escuro, como o do Gather: o predio aparece claro sobre o fundo
    // escuro da propria caixinha e as paredes/moveis viram um cinza mais forte.
    mctx.fillStyle = 'rgba(255,255,255,0.10)';
    mctx.fillRect(offX, offY, worldW * escala, worldH * escala);
    OfficeMap.ROOMS.forEach((sala) => {
      // o "jardim" e o retangulo que sobra cobrindo o mapa inteiro: pintar ele
      // aqui deixaria o minimapa todo verde e escondia as salas de verdade
      if (sala.id === 'jardim') return;
      mctx.fillStyle = sala.cor;
      mctx.globalAlpha = 0.30;
      mctx.fillRect(
        offX + sala.c0 * TILE * escala, offY + sala.r0 * TILE * escala,
        (sala.c1 - sala.c0 + 1) * TILE * escala, (sala.r1 - sala.r0 + 1) * TILE * escala
      );
      mctx.globalAlpha = 1;
    });

    mctx.fillStyle = 'rgba(255,255,255,0.34)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = tiles[r][c];
        if (t !== LIVRE && t !== CADEIRA && t !== TAPETE) {
          mctx.fillRect(offX + c * TILE * escala, offY + r * TILE * escala, lado, lado);
        }
      }
    }

    players.forEach((p) => {
      mctx.beginPath();
      mctx.arc(offX + p.displayX * escala, offY + p.displayY * escala, p.id === selfId ? 3 : 2.2, 0, Math.PI * 2);
      mctx.fillStyle = p.id === selfId ? '#ffb454' : corDoId(p.id);
      mctx.fill();
    });
  }

  function render(now, dt) {
    atualizarCamera(dt);
    const dpr = window.devicePixelRatio || 1;
    const vista = tamanhoDaVista();
    ctx.setTransform(ZOOM * dpr, 0, 0, ZOOM * dpr, -camX * ZOOM * dpr, -camY * ZOOM * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(camX, camY, vista.w, vista.h);
    ctx.drawImage(mapCanvas, 0, 0, OfficeMap.COLS * OfficeMap.TILE, OfficeMap.ROWS * OfficeMap.TILE);

    // Nome das salas, por cima do mapa e em resolucao de tela. Editando areas,
    // quem mostra o nome e o proprio editor (com o tamanho junto).
    const editandoAreas = !!(window.EditorAreas && EditorAreas.estaAtivo());
    if (!editandoAreas) {
      OfficeMap.ROOMS.forEach((sala) => {
        if (sala.id === 'jardim') return;
        desenharEtiquetaSala(ctx, sala, OfficeMap.TILE);
      });
    }
    desenharPlacaCreditos(ctx, OfficeMap.TILE);

    const self = players.get(selfId);
    if (self && self.destinoFinal) {
      const pulso = 3 + Math.sin(now / 120) * 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,180,84,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(self.destinoFinal.x, self.destinoFinal.y, 6 + pulso, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    desenharMesas(ctx);

    // Com uma coisa na mao pra pousar na mesa, os bonecos viram fantasma e as
    // placas de nome somem. A placa e o pior estorvo: ela fica flutuando bem em
    // cima do tampo - exatamente onde a pessoa esta mirando - e some com o que
    // ja tem posto ali. O boneco sentado e o encosto da cadeira tapam a fileira
    // da frente pelo mesmo motivo.
    const posandoNaMesa = !!(Decorador.pintandoEmCima && Decorador.pintandoEmCima());

    const lista = Array.from(players.values()).sort((a, b) => a.displayY - b.displayY);
    lista.forEach((p) => {
      // Sentado: desce uns pixels pra encaixar no assento e nao subir em cima da
      // mesa que esta na celula de tras. Tambem para a animacao de caminhada.
      const py = p.displayY + (p.sentado ? 2 : 0);

      if (posandoNaMesa) { ctx.save(); ctx.globalAlpha = 0.3; }
      desenharAnelStatus(ctx, p.displayX, p.displayY, p.status);

      // DENTRO do carrinho, e nao em cima dele. Sao TRES camadas, nesta ordem:
      //
      //   1. o aro e a alca  (parede de TRAS da cesta: fica atras das costas)
      //   2. o boneco
      //   3. o corpo da cesta e as rodas (parede da FRENTE: tapa as pernas)
      //
      // Desenhar o carrinho inteiro por cima era o erro: a parede de tras
      // passava na frente do peito, e ninguem esta dentro de nada assim. E o
      // mesmo raciocinio do encosto da cadeira (desenharEncostoPorCima).
      //
      // O boneco NAO sobe nem desce: a conta de ALTURA_CARRINHO ja foi feita
      // pro aro cair na cintura dele. Levantar o boneco, que foi o que eu fiz
      // antes, desfaz justamente essa conta.
      const k = p.kart || 0;
      // O quanto o carrinho esta fora de esquadro com a direcao que o boneco
      // olha - e disso que sai a inclinacao da derrapagem.
      let fora = 0;
      if (k > 0) {
        fora = (p.kartAng || 0) - (ANG_DIR[p.dir] || 0);
        while (fora > Math.PI) fora -= Math.PI * 2;
        while (fora < -Math.PI) fora += Math.PI * 2;
        desenharCarrinho(ctx, p.displayX, p.displayY, p.dir, k, fora, 'atras');
      }

      // Os pes apareciam embaixo do carrinho: entre as duas rodas a folha e
      // vazia, e o pe cabia no vao. Recorto o boneco no fundo da cesta - a
      // linha desce junto com o `k`, entao nao ha corte seco quando o carrinho
      // aparece.
      const recorta = k > 0.02;
      if (recorta) {
        ctx.save();
        ctx.beginPath();
        const chao = fundoDaCesta(p.displayY, k);
        const limite = p.displayY + 14 + (chao - (p.displayY + 14)) * k;
        ctx.rect(p.displayX - 40, p.displayY - 80, 80, limite - (p.displayY - 80));
        ctx.clip();
      }
      Character.draw(ctx, p.displayX, py, p.appearance, {
        dir: p.dir,
        moving: (p.sentado || k > 0.5) ? false : p.moving,
        walkTime: localWalkTime,
      });
      if (recorta) ctx.restore();

      if (k > 0) desenharCarrinho(ctx, p.displayX, p.displayY, p.dir, k, fora, 'frente');

      // Sentado: o encosto volta por cima do corpo, senao o boneco fica "em pe
      // em cima" da cadeira em vez de sentado nela.
      if (p.sentado) desenharEncostoPorCima(ctx, p.displayX, p.displayY);
      if (posandoNaMesa) { ctx.restore(); return; }   // sem placa, sem bolha, sem reacao

      // Colada no boneco (a cabeca dele termina uns 37px acima do pe), e nao
      // flutuando a 44. Placa longe da pessoa vira etiqueta solta no cenario e
      // obriga o olho a ligar uma coisa na outra.
      const labelY = py - 38;
      // O status entra na placa quando nao e "Livre".
      //
      // Nao e enfeite: agora "Focado" e "Em reuniao" BARRAM a chamada de
      // corredor (calls.js). Sem ler o motivo em cima da cabeca da pessoa, quem
      // chegasse perto e nao caisse em chamada concluiria que o app quebrou -
      // que e exatamente o tipo de bug fantasma que da trabalho pra achar.
      // "lendo" ganha do status na placa: quem esta com o leitor aberto na
      // cara nao esta vendo o escritorio, e isso e mais util saber do que se a
      // pessoa se marcou como Livre. E usa o espaco que a placa ja tem, em vez
      // de mais um simbolo flutuando na cabeca dela.
      const rotuloStatus = p.lendo ? 'lendo'
        : (p.status && p.status !== 'livre' ? STATUS_LABEL[p.status] : '');
      // A coroa de diretoria saiu DAQUI (so daqui - ela continua na lista de
      // pessoas e no chat). Emoji numa pilula de 10px sai borrado, e ser
      // diretoria nao e informacao que alguem precise ler atravessando o
      // escritorio - precisa e na hora de saber quem pode decorar ou convidar.
      // A referencia nao poe cargo nenhum em cima da cabeca.
      // "Voce" no lugar do proprio nome, como a referencia faz (a etiqueta
      // "You" no print dos pods). Duas razoes praticas: voce acha o seu boneco
      // de relance numa sala cheia, e a etiqueta encurta - com 32 mesas em
      // fileira, cada pixel de etiqueta a menos e uma sobreposicao a menos.
      // Seu proprio nome voce ja sabe.
      const ehEu = p.id === selfId;
      const nomeExibido = (ehEu ? 'Voce' : p.name)
        + (rotuloStatus ? ' · ' + rotuloStatus : '');
      const emChamada = p.id === selfId
        ? (Calls.isCameraAtiva() && Calls.getPeersConectados().length > 0)
        : Calls.temChamadaAtiva(p.id);
      desenharCracha(
        ctx, p.displayX, labelY, nomeExibido,
        STATUS_COR[p.status] || STATUS_COR.livre, emChamada, p.id === selfId
      );

      // a bolha flutuante so aparece quando o grid de chamada NAO esta cobrindo
      // esse mesmo participante (o grid vira a visao principal da chamada).
      if (p.id !== selfId && Calls.temChamadaAtiva(p.id) && !CallGrid.estaAtivo()) {
        const video = Calls.getVideoRemoto(p.id);
        if (video && Calls.temVideoRemoto(p.id)) {
          desenharBolhaVideo(ctx, p.displayX, labelY - 26, video, corDoId(p.id));
        } else {
          desenharBolhaAudio(ctx, p.displayX, labelY - 26, corDoId(p.id));
        }
      }

      if (p.reacao) {
        if (p.reacao.expiresAt > now) {
          desenharReacao(ctx, p.displayX, p.displayY - 78, p.reacao, now);
        } else {
          p.reacao = null;
        }
      }
    });

    // Editor de areas por cima de tudo: as alcas nao podem sumir atras de quem
    // esta em pe na borda da sala.
    if (editandoAreas) EditorAreas.desenhar(ctx, ZOOM);

    desenharMinimapa();
  }

  function moverPara(destinoX, destinoY) {
    // Andou pra algum lugar? Entao saiu da estante. Sair dali e sair dali.
    if (window.Estante) Estante.fechar();
    const self = players.get(selfId);
    if (!self) return false;
    const TILE = OfficeMap.TILE;
    const destino = Pathfinding.nearestWalkable(Math.floor(destinoX / TILE), Math.floor(destinoY / TILE), 4);
    if (!destino) return false;

    const celulas = Pathfinding.findPath(
      Math.floor(self.x / TILE), Math.floor(self.y / TILE), destino.col, destino.row
    );
    if (!celulas || celulas.length === 0) return false;

    // se o ponto exato clicado for caminhavel, termina nele; senao, no centro do
    // tile caminhavel mais proximo
    const exato = OfficeMap.isWalkable(destinoX, destinoY);
    const alvoX = exato ? destinoX : destino.col * TILE + TILE / 2;
    const alvoY = exato ? destinoY : destino.row * TILE + TILE / 2;

    const pontos = celulas.map((cel, i) => {
      if (i === 0) return { x: self.x, y: self.y };
      if (i === celulas.length - 1) return { x: alvoX, y: alvoY };
      return { x: cel.col * TILE + TILE / 2, y: cel.row * TILE + TILE / 2 };
    });

    self.path = suavizarCaminho(pontos).slice(1);
    self.moveTarget = self.path.shift() || null;
    self.destinoFinal = self.moveTarget ? { x: alvoX, y: alvoY } : null;
    return true;
  }

  // "Walk over" do Gather: caminha ate ficar do lado da pessoa.
  function irAte(id) {
    const alvo = players.get(id);
    if (!alvo || id === selfId) return false;
    const TILE = OfficeMap.TILE;
    const col = Math.floor(alvo.displayX / TILE);
    const row = Math.floor(alvo.displayY / TILE);
    const vizinhos = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
    for (const [vc, vr] of vizinhos) {
      if (OfficeMap.isTileWalkable(vc, vr)) {
        return moverPara(vc * TILE + TILE / 2, vr * TILE + TILE / 2);
      }
    }
    return moverPara(alvo.displayX, alvo.displayY);
  }

  function coordsDoEvento(e) {
    const rect = canvas.getBoundingClientRect();
    const TILE = OfficeMap.TILE;
    const maxX = OfficeMap.COLS * TILE - 1;
    const maxY = OfficeMap.ROWS * TILE - 1;
    return {
      x: Math.max(0, Math.min(maxX, camX + (e.clientX - rect.left) / ZOOM)),
      y: Math.max(0, Math.min(maxY, camY + (e.clientY - rect.top) / ZOOM)),
    };
  }

  // Quem foi clicado: caixa aproximada do boneco (o sprite fica acima dos pes).
  function jogadorEm(x, y) {
    let achado = null;
    players.forEach((p) => {
      if (p.id === selfId) return;
      if (Math.abs(x - p.displayX) < 16 && y > p.displayY - 46 && y < p.displayY + 6) achado = p;
    });
    return achado;
  }

  function onCanvasClick(e) {
    const self = players.get(selfId);
    if (!self) return;
    // O dedo que sobra no vidro depois da pinca vira 'click': sem esta linha,
    // dar zoom mandava o boneco andar pra onde o dedo estava.
    if (performance.now() - pincaFimEm < 450) return;
    const { x: clickX, y: clickY } = coordsDoEvento(e);

    // Editando areas, clicar e arrastar e o gesto do editor (mousedown/mouseup
    // la embaixo) - o boneco nao sai andando atras do mouse.
    if (window.EditorAreas && EditorAreas.estaAtivo()) return;

    // Decorador no modo link: o clique pendura conteudo no movel, nao anda.
    // Ver docs/plano-conteudo.md.
    if (Decorador.noModoLink && Decorador.noModoLink()) {
      const TILE_L = OfficeMap.TILE;
      Conteudo.cliqueEm(Math.floor(clickX / TILE_L), Math.floor(clickY / TILE_L), true);
      return;
    }

    // Com o decorador aberto e um item na mao, o clique coloca em vez de andar.
    if (Decorador.estaPintando()) {
      const tx = clickX / OfficeMap.TILE;
      const ty = clickY / OfficeMap.TILE;
      Decorador.pintarEm(Math.floor(tx), Math.floor(ty), tx, ty);
      return;
    }

    // A placa de creditos abre a lista completa numa aba nova (a sede continua).
    if (cliqueNaPlaca(clickX, clickY)) {
      window.open('/creditos.html', '_blank', 'noopener');
      return;
    }

    const pessoa = jogadorEm(clickX, clickY);
    if (pessoa) {
      Pessoas.abrirCartao(pessoa.id, e.clientX, e.clientY);
      return;
    }

    const TILE = OfficeMap.TILE;
    const col = Math.floor(clickX / TILE);
    const row = Math.floor(clickY / TILE);
    const tileX = clickX / TILE;
    const tileY = clickY / TILE;

    // Soltando uma coisa que estava sendo movida - vale mesmo fora da mesa,
    // porque o servidor e quem recusa cair na mesa de outro.
    if (ItemMesa.estaMovendo()) {
      ItemMesa.soltarEm(tileX, tileY);
      return;
    }

    // Clicou EM CIMA de uma coisa da sua mesa? Entao a intencao e mexer nela.
    //
    // Isto vem ANTES de olhar que tile foi clicado, de proposito: um monitor
    // sobe quase um tile acima da ancora, entao o alto da tela dele cai na
    // celula de CIMA, que nao e mesa. Amarrado ao tile, clicar ali nao
    // selecionava nada - e era por isso que nao dava pra excluir o monitor.
    const coisa = itemPertoDe(tileX, tileY);
    if (coisa && celulaEhMinha(Math.floor(coisa.x), Math.floor(coisa.y))) {
      ItemMesa.selecionar(coisa);
      return;
    }

    // Clicou numa estante? Abre o acervo, e ninguem sai do lugar.
    //
    // Vale a celula de cima tambem: a estante tem 2 tiles de arte e so 1 de
    // chao, entao a metade que a pessoa ve mais - as prateleiras - cai na
    // celula ACIMA da estante. Amarrado so ao tile do chao, clicar no meio da
    // estante nao abria nada.
    const ehEstante = (c, r) => OfficeMap.tiles[r] && OfficeMap.tiles[r][c] === OfficeMap.ESTANTE;
    if (ehEstante(col, row) || ehEstante(col, row + 1)) {
      ItemMesa.fechar();
      Estante.abrir();
      return;
    }

    // Movel com conteudo pendurado: abre o que tem ali. Olha a celula de cima
    // pelo mesmo motivo da estante - a arte alta some da celula de baixo.
    if (Conteudo.cliqueEm(col, row, false)) {
      ItemMesa.fechar();
      return;
    }
    if (OfficeMap.tiles[row] && OfficeMap.MESAS_DE_TRABALHO.has(OfficeMap.tiles[row][col])) {
      ItemMesa.fechar();
      cliqueNaMesa(col, row, e.clientX, e.clientY);
      return;
    }
    ItemMesa.fechar();

    moverPara(clickX, clickY);
  }

  // Onde sentar nessa mesa: a cadeira dela, se tiver. Senao, a celula
  // caminhavel mais perto - melhor encostar na mesa do que nao ir a lugar nenhum.
  function lugarDaMesa(celulas) {
    const daMesa = new Set(celulas.map(([c, r]) => c + ',' + r));
    const vizinhas = [];
    celulas.forEach(([c, r]) => {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
        const nc = c + dc;
        const nr = r + dr;
        if (daMesa.has(nc + ',' + nr)) return;
        if (!OfficeMap.isTileWalkable(nc, nr)) return;
        vizinhas.push([nc, nr]);
      });
    });
    if (!vizinhas.length) return null;
    const cadeira = vizinhas.find(([c, r]) => OfficeMap.ASSENTOS.has(OfficeMap.tiles[r][c]));
    return cadeira || vizinhas[0];
  }

  function irParaMesa(celulas) {
    const lugar = lugarDaMesa(celulas);
    if (!lugar) return;
    const TILE = OfficeMap.TILE;
    moverPara(lugar[0] * TILE + TILE / 2, lugar[1] * TILE + TILE / 2);
  }

  // Clicar numa mesa livre faz as duas coisas de uma vez: ela vira sua e o
  // boneco vai sentar nela. Em qualquer caso abre o cartao da mesa.
  //
  // Clicar de novo NAO larga mais: largar mudou de lugar, foi pro "..." do
  // cartao. Com o cartao abrindo no clique, largar no clique tambem seria uma
  // armadilha - voce clicaria pra ver a mesa e perderia ela.
  function cliqueNaMesa(col, row, telaX, telaY) {
    const ja = mesaPorCelula.get(col + ',' + row);

    if (ja) {
      if (ja.donoUid === selfUid) irParaMesa(ja.celulas);
      CartaoMesa.abrir(ja, telaX, telaY);
      return;
    }

    const celulas = OfficeMap.celulasDaMesa(col, row);
    if (celulas) irParaMesa(celulas);
    Network.reivindicarMesa(col, row);
    // O cartao so abre quando o servidor confirmar: se a mesa tiver sido pega
    // por outra pessoa no meio do caminho, ele nao pode prometer o que nao
    // aconteceu.
    esperandoMesa = { col, row, telaX, telaY };
  }

  // Preenchido por `cliqueNaMesa`, consumido na proxima lista de mesas.
  let esperandoMesa = null;

  function temLinhaDeVisao(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const passos = Math.max(1, Math.ceil(dist / 8));
    for (let i = 1; i <= passos; i++) {
      const t = i / passos;
      if (!OfficeMap.isWalkable(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  function suavizarCaminho(pontos) {
    if (pontos.length <= 2) return pontos;
    const resultado = [pontos[0]];
    let atual = 0;
    while (atual < pontos.length - 1) {
      let proximo = atual + 1;
      for (let i = pontos.length - 1; i > atual; i--) {
        if (temLinhaDeVisao(pontos[atual].x, pontos[atual].y, pontos[i].x, pontos[i].y)) {
          proximo = i;
          break;
        }
      }
      resultado.push(pontos[proximo]);
      atual = proximo;
    }
    return resultado;
  }

  function init(profile) {
    canvas = document.getElementById('canvas-jogo');
    ctx = canvas.getContext('2d');
    prerenderMap();
    // O pre-render roda antes das folhas do pacote chegarem, entao a primeira
    // passada sai com o desenho a mao. Quando as imagens carregam, refaz.
    if (window.Sprites) Sprites.aoCarregar(() => prerenderMap());
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    canvas.addEventListener('click', onCanvasClick);
    ligarPinca();
    // Tela de celular mostra poucos tiles com o zoom de computador: a pessoa via
    // meia sala. Comeca mais afastado; a pinca aproxima.
    if (window.innerWidth < 640) {
      zoomAlvo = zoomDoUsuario = 1.5;
    }

    canvas.addEventListener('mousemove', (e) => {
      const { x, y } = coordsDoEvento(e);
      const TILE = OfficeMap.TILE;
      const col = Math.floor(x / TILE);
      const row = Math.floor(y / TILE);

      if (window.EditorAreas && EditorAreas.estaAtivo()) {
        celulaAlvo = null;
        mesaHover = null;
        canvas.style.cursor = EditorAreas.cursorEm(x, y, ZOOM);
        return;
      }

      if (Decorador.estaPintando()) {
        celulaAlvo = { col, row, x: x / TILE, y: y / TILE };
        mesaHover = null;
        canvas.style.cursor = 'crosshair';
        // Arrastar com o botao pressionado pinta uma sequencia - mas isso e pra
        // mobilia da casa. Numa mesa livre o arrasto despejaria uma trilha de
        // canecas, entao ali so vale o clique.
        if (e.buttons === 1 && !celulaEhMinha(col, row)) Decorador.pintarEm(col, row, x / TILE, y / TILE);
        return;
      }
      celulaAlvo = null;

      if (ItemMesa.estaMovendo()) {
        ItemMesa.arrastarPara(x / TILE, y / TILE);
        mesaHover = null;
        canvas.style.cursor = 'grabbing';
        return;
      }

      const ehMesa = Boolean(OfficeMap.tiles[row] && OfficeMap.MESAS_DE_TRABALHO.has(OfficeMap.tiles[row][col]));
      mesaHover = ehMesa ? { col, row } : null;
      canvas.style.cursor = (ehMesa || jogadorEm(x, y)) ? 'pointer' : 'default';
    });
    canvas.addEventListener('mouseleave', () => { mesaHover = null; celulaAlvo = null; });

    // Editor de areas (docs/areas.md): o gesto e apertar, arrastar e soltar. O
    // arrasto e seguido pela JANELA, nao so pelo mapa - a pessoa que passa com
    // o mouse por cima do painel no meio do gesto nao perde a area.
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !window.EditorAreas || !EditorAreas.estaAtivo()) return;
      const { x, y } = coordsDoEvento(e);
      if (EditorAreas.pressionar(x, y, ZOOM)) e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!window.EditorAreas || !EditorAreas.arrastando()) return;
      const { x, y } = coordsDoEvento(e);
      EditorAreas.arrastar(x, y);
    });
    window.addEventListener('mouseup', () => {
      if (window.EditorAreas && EditorAreas.arrastando()) EditorAreas.soltar();
    });

    document.getElementById('btn-status').addEventListener('click', () => {
      const self = players.get(selfId);
      if (!self) return;
      const proximo = STATUS_ORDEM[(STATUS_ORDEM.indexOf(self.status) + 1) % STATUS_ORDEM.length];
      self.status = proximo;
      ajustarBotaoStatus(proximo);
      Network.sendStatus(proximo);
    });

    const barraReacoes = document.getElementById('barra-reacoes');
    document.querySelectorAll('.btn-reacao').forEach((btn) => {
      btn.addEventListener('click', () => {
        Network.sendReaction(btn.dataset.emoji);
        barraReacoes.classList.add('oculto');
      });
    });
    document.getElementById('btn-emojis').addEventListener('click', (ev) => {
      ev.stopPropagation();
      barraReacoes.classList.toggle('oculto');
    });
    document.getElementById('btn-aceno').addEventListener('click', () => Network.sendReaction('👋'));
    document.addEventListener('click', (ev) => {
      if (!barraReacoes.contains(ev.target)) barraReacoes.classList.add('oculto');
    });

    document.getElementById('btn-zoom-mais').addEventListener('click', () => ajustarZoom(0.25));
    document.getElementById('btn-zoom-menos').addEventListener('click', () => ajustarZoom(-0.25));

    // Quem usa o dedo nao tem WASD nem Shift: a dica diz o que funciona ali.
    const dicaEl = document.getElementById('dica-controles');
    if (dicaEl && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      dicaEl.textContent = 'Toque no chao pra andar · dois dedos pra zoom · chegue perto de alguem pra conversar';
    }

    // a dica de controle some sozinha depois dos primeiros segundos (a referencia
    // nao tem nada fixo em cima da barra)
    setTimeout(() => {
      const dica = document.getElementById('dica-controles');
      if (dica) dica.classList.add('oculto');
    }, 9000);

    Network.on('conexao', (estado) => setIndicador(estado));

    Network.on('init', (data) => {
      selfId = data.selfId;
      selfUid = data.selfUid || null;
      // Conexao nova (inclusive reconexao) = servidor sem o tamanho da tela
      // desta aba: manda de novo no proximo quadro.
      vistaEnviada = null;
      proximaChecagemVista = 0;
      players.clear();
      data.players.forEach((p) => {
        players.set(p.id, p.id === selfId ? criarJogadorLocal(p) : criarJogadorRemoto(p));
      });
      ajustarBotaoStatus(players.get(selfId).status);
      // A decoracao guardada no servidor entra antes de qualquer coisa desenhar.
      const temDecoracao = (data.mudancasMapa && data.mudancasMapa.length)
        || (data.objetosMapa && data.objetosMapa.length);
      (data.mudancasMapa || []).forEach((m) => {
        if (OfficeMap.tiles[m.r]) OfficeMap.tiles[m.r][m.c] = m.t;
      });
      (data.objetosMapa || []).forEach((o) => {
        if (OfficeMap.objetos[o.r]) OfficeMap.objetos[o.r][o.c] = o.o;
      });
      // Areas da diretoria (docs/areas.md): o piso de cada uma vai junto. As
      // criadas por ela nem existem na planta - entram antes de serem aplicadas.
      (data.areasMapa || []).forEach((a) => { if (a.criada) OfficeMap.adicionarArea(a); });
      (data.areasMapa || []).forEach((a) => OfficeMap.aplicarArea(a.id, a));
      if (temDecoracao || (data.areasMapa && data.areasMapa.length)) prerenderMap();
      Conteudo.carregar(data.conteudosMapa);
      Conteudo.init(players.get(selfId).isAdmin);
      Decorador.init(players.get(selfId).isAdmin);
      Calls.init(selfId);
      Chat.carregarHistorico(data);
      aplicarMesas(data.mesas);
    });

    Network.on('mesas-atualizadas', (lista) => aplicarMesas(lista));

    // Alguem decorou: escreve o tile e redesenha o mapa inteiro (48x32, e barato).
    Network.on('mapa-atualizado', (m) => {
      if (!OfficeMap.tiles[m.r]) return;
      OfficeMap.tiles[m.r][m.c] = m.t;
      prerenderMap();
    });

    Network.on('mapa-objeto-atualizado', (m) => {
      if (!OfficeMap.objetos[m.r]) return;
      OfficeMap.objetos[m.r][m.c] = m.o;
      prerenderMap();
    });

    // Uma area mudou de lugar, de tamanho ou de regra de som: o retangulo (que
    // decide com quem se conversa e a Visao de salas na hora) e o piso dela.
    Network.on('mapa-area-atualizada', (a) => {
      if (!a || !OfficeMap.aplicarArea(a.id, a)) return;
      prerenderMap();
      if (window.EditorAreas) EditorAreas.aceita(a);
    });
    // Area nova, criada pela diretoria: entra na lista antes do hall/jardim e
    // o mapa e redesenhado com o piso dela.
    Network.on('mapa-area-criada', (a) => {
      if (!a || !OfficeMap.adicionarArea(a)) return;
      prerenderMap();
      if (window.EditorAreas) EditorAreas.criada(a);
    });
    Network.on('mapa-area-apagada', (m) => {
      if (!m || !OfficeMap.removerArea(m.id)) return;
      prerenderMap();
      if (window.EditorAreas) EditorAreas.apagada(m.id);
    });
    Network.on('mapa-area-recusada', (m) => {
      if (window.EditorAreas) EditorAreas.recusada(m);
    });

    // Conteudo nao entra no pre-render: a marca e desenhada a cada quadro, em
    // cima do mapa ja pronto. Assim pendurar um link nao custa redesenhar 48x32.
    Network.on('mapa-conteudo-atualizado', (m) => {
      Conteudo.aplicar(m.c, m.r, m.conteudo);
      Conteudo.aceito(m.c, m.r);
    });
    Network.on('mapa-conteudo-recusado', (m) => Conteudo.recusado(m));

    Network.on('player-joined', (data) => {
      players.set(data.id, criarJogadorRemoto(data));
      Chat.pessoasMudaram();
    });

    Network.on('player-left', (data) => {
      players.delete(data.id);
      Chat.pessoasMudaram();
    });

    Network.on('player-moved', (data) => {
      const p = players.get(data.id);
      if (!p) return;
      const agora = performance.now();
      // Velocidade estimada entre dois pacotes: e o que deixa o movimento dos
      // outros liso chegando so 10 vezes por segundo (ver interpolarRemotos).
      // Parou, ou ficou muito tempo sem pacote (acabou de voltar a andar): zero.
      const intervalo = (agora - (p.tPacote || 0)) / 1000;
      if (data.moving && p.tPacote && intervalo > 0 && intervalo < 0.3) {
        p.vx = (data.x - p.targetX) / intervalo;
        p.vy = (data.y - p.targetY) / intervalo;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      p.tPacote = agora;
      p.targetX = data.x;
      p.targetY = data.y;
      // `x`/`y` e a posicao que as REGRAS leem: distancia da chamada, volume,
      // sala em que a pessoa esta, TV. Ate aqui so o `target` era atualizado, e
      // essas regras enxergavam o outro parado no ponto onde ele ENTROU na sede:
      // a chamada abria perto do lugar em que a pessoa nasceu, e nao de onde ela
      // estava. Estava assim desde a primeira versao.
      p.x = data.x;
      p.y = data.y;
      p.dir = data.dir;
      p.moving = data.moving;
      p.sentado = !!data.sentado;
      // Alvo, e nao valor: o kart dos outros e suavizado em interpolarRemotos
      // junto com a posicao. Chegando so a cada 45ms, cravar o valor faria o
      // kart dos outros aparecer aos saltos.
      p.kartAlvo = typeof data.kart === 'number' ? data.kart : 0;
      p.kartAngAlvo = typeof data.kartAng === 'number' ? data.kartAng : 0;
    });

    // Alguem comecou ou parou de apresentar: a TV da sala onde ele esta passa
    // a espelhar (ou para de espelhar) a tela dele.
    Network.on('tela-mudou', (data) => {
      const p = players.get(data.id);
      if (p) p.dividindoTela = !!data.ligado;
    });

    // Alguem abriu ou fechou um livro. O objeto vem do servidor ja validado
    // contra o acervo - aqui e so guardar e deixar a estante e o mapa lerem.
    Network.on('lendo-mudou', (data) => {
      const p = players.get(data.id);
      if (p) p.lendo = data.livro || null;
    });

    // Alguem entrou ou saiu de uma chamada marcada. O calls.js le isto pra
    // decidir com quem falar - e e o que faz a chamada funcionar de qualquer
    // canto do mapa, e nao so perto.
    Network.on('chamada-mudou', (data) => {
      const p = players.get(data.id);
      if (p) p.chamada = data.chamada || null;
    });

    Network.on('player-status', (data) => {
      const p = players.get(data.id);
      if (!p || !STATUS_VALIDOS.includes(data.status)) return;
      p.status = data.status;
      if (data.id === selfId) ajustarBotaoStatus(data.status);
    });

    Network.on('reacao', (data) => {
      const p = players.get(data.id);
      if (!p) return;
      p.reacao = { emoji: data.emoji, expiresAt: performance.now() + 2200 };
    });

    Network.on('chat-mensagem', (data) => Chat.receberMensagem(data));
    Network.on('chat-historico', (data) => Chat.receberHistorico(data));
    Network.on('chat-reacao', (data) => Chat.receberReacao(data));

    CallGrid.init();
    Chat.init();
    if (window.Avisos) Avisos.init();
    if (window.Central) Central.init();
    Calendario.init();
    if (window.Lembretes) Lembretes.init();
    if (window.Chamada) Chamada.init();
    if (window.Visitantes) Visitantes.init();
    Trello.init();
    if (window.Discador) Discador.init();
    Estante.iniciar();
    Pessoas.init();
    Network.connect(profile);

    lastFrameTime = performance.now();
    setInterval(() => loop(performance.now()), 1000 / 60);
  }

  window.Game = {
    init,
    getPlayers: () => players,
    getSelfId: () => selfId,
    getSelfUid: () => selfUid,
    aoMudarMinhaMesa,
    minhaMesa,
    focarNaMesa,
    soltarFoco,
    olharPara,
    pontoNaTela,
    celulaEhMinha,
    itemPertoDe,
    // usados pelo decorador: desenhar as miniaturas do catalogo com a mesma
    // funcao que desenha no mapa, e redesenhar depois de uma edicao
    desenharObjeto: drawObstacleTile,
    desenharApoiado: drawObjectTile,
    caixaDoItem,
    desenharPiso: drawFloorTile,
    desenharEtiquetaSala,
    redesenharMapa: prerenderMap,
    // O canvas do pre-render, pra poder CONFERIR o mapa pronto em vez de
    // redesenhar uma replica e conferir a replica. E assim que a auditoria
    // mede se a face do muro sobreviveu a tudo que foi desenhado por cima.
    canvasDoMapa: () => mapCanvas,
    escalaDoMapa: () => escalaDoMapa,
    STATUS_COR,
    STATUS_LABEL,
    definirStatusProprio,
    corDoId,
    irAte,
    moverPara,
  };
})();
