// Editor de AREAS: mover e redimensionar o retangulo de cada sala, como a
// "area" do Gather - arrasta o meio pra mudar de lugar, puxa a borda ou a quina
// pra mudar o tamanho, como foto. Abre pela aba "Areas" do decorador, so pra
// diretoria. Ver docs/areas.md.
//
// A area e o que decide chamada fechada, sala silenciosa, piso, etiqueta e a
// Visao de salas. Parede e movel NAO andam junto - sao do decorador.
//
// Quem decide e o servidor (server/mapa-editado.js): aqui o retangulo novo so
// fica "pendente" ate a resposta chegar. Aceito, ele volta pra todo mundo pelo
// `mapa-area-atualizada`; recusado, o retangulo de verdade nunca mudou e a
// tela so desfaz a previa e mostra o motivo.
(function () {
  const M = () => window.OfficeMap;

  let ativo = false;
  let selecionada = null;   // id da area
  let arraste = null;       // { id, modo, x0, y0, inicial, atual }
  let pendente = null;      // { id, area, prazo } - mandada, esperando o servidor
  let criando = false;      // { prazo } - area nova pedida, esperando o id
  let aviso = '';
  let aoMudar = () => {};   // o painel do decorador redesenha

  const ESPERA_MS = 6000;   // sem resposta nesse tempo, desiste da previa

  const salas = () => M().ROOMS.filter((s) => M().areaEditavel(s.id));
  const sala = (id) => M().ROOMS.find((s) => s.id === id) || null;
  const retangulo = (s) => ({ r0: s.r0, c0: s.c0, r1: s.r1, c1: s.c1 });
  const igual = (a, b) => a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1;
  const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

  function avisar() {
    try { aoMudar(); } catch (e) { /* painel fechado no meio */ }
  }

  // ---------------------------------------------------------------- estado

  function ligar(fnMudou) {
    ativo = true;
    if (typeof fnMudou === 'function') aoMudar = fnMudou;
  }

  function desligar() {
    ativo = false;
    arraste = null;
    selecionada = null;
    aviso = '';
    if (window.Game && Game.soltarFoco) Game.soltarFoco();
  }

  function estaAtivo() { return ativo; }
  function arrastando() { return ativo && !!arraste; }

  // O retangulo que a area MOSTRA agora: o do arraste, o mandado ou o de verdade.
  function retanguloAtual(s) {
    if (arraste && arraste.id === s.id) return arraste.atual;
    if (pendente && pendente.id === s.id) return pendente.area;
    return retangulo(s);
  }

  // Chamada a cada quadro (desenhar), e nao de dentro do retanguloAtual: de la,
  // o aviso redesenharia o painel no meio do proprio desenho do painel.
  function conferirPrazo() {
    const esperando = pendente || criando;
    if (!esperando || Date.now() < esperando.prazo) return;
    pendente = null;
    criando = false;
    aviso = 'O servidor nao respondeu. Confira a conexao e tente de novo.';
    avisar();
  }

  // Onde o ponteiro esta na area: numa borda ou quina (redimensionar) ou no
  // meio (mover). A tolerancia e em pixels de TELA, entao o alvo tem o mesmo
  // tamanho em qualquer zoom.
  function modoEm(s, x, y, zoom) {
    const T = M().TILE;
    const a = retanguloAtual(s);
    const x0 = a.c0 * T;
    const y0 = a.r0 * T;
    const x1 = (a.c1 + 1) * T;
    const y1 = (a.r1 + 1) * T;
    const tol = 8 / (zoom || 1);
    if (x < x0 - tol || x > x1 + tol || y < y0 - tol || y > y1 + tol) return null;
    const vert = Math.abs(y - y0) <= tol ? 'n' : (Math.abs(y - y1) <= tol ? 's' : '');
    const horiz = Math.abs(x - x0) <= tol ? 'w' : (Math.abs(x - x1) <= tol ? 'e' : '');
    if (vert || horiz) return vert + horiz;
    if (x > x0 && x < x1 && y > y0 && y < y1) return 'mover';
    return null;
  }

  function areaEm(x, y) {
    const T = M().TILE;
    const c = Math.floor(x / T);
    const r = Math.floor(y / T);
    return salas().find((s) => {
      const a = retanguloAtual(s);
      return r >= a.r0 && r <= a.r1 && c >= a.c0 && c <= a.c1;
    }) || null;
  }

  // ------------------------------------------------------------- o gesto

  function pressionar(x, y, zoom) {
    if (!ativo) return false;
    // A selecionada primeiro: a borda dela pode ficar em cima de outra area.
    let alvo = selecionada ? sala(selecionada) : null;
    let modo = alvo ? modoEm(alvo, x, y, zoom) : null;
    if (!modo) {
      alvo = areaEm(x, y);
      modo = alvo ? (modoEm(alvo, x, y, zoom) || 'mover') : null;
    }
    if (!alvo) {
      selecionada = null;
      aviso = '';
      avisar();
      return true;
    }
    selecionada = alvo.id;
    aviso = '';
    // Enquanto a anterior nao voltou do servidor, seleciona mas nao arrasta.
    if (pendente) { avisar(); return true; }
    const inicial = retanguloAtual(alvo);
    arraste = { id: alvo.id, modo, x0: x, y0: y, inicial, atual: inicial };
    avisar();
    return true;
  }

  function arrastar(x, y) {
    if (!arraste) return;
    const { TILE: T, COLS, ROWS } = M();
    const dc = Math.round((x - arraste.x0) / T);
    const dr = Math.round((y - arraste.y0) / T);
    const i = arraste.inicial;
    const a = { r0: i.r0, c0: i.c0, r1: i.r1, c1: i.c1 };
    if (arraste.modo === 'mover') {
      const larg = i.c1 - i.c0;
      const alt = i.r1 - i.r0;
      a.c0 = limitar(i.c0 + dc, 0, COLS - 1 - larg);
      a.c1 = a.c0 + larg;
      a.r0 = limitar(i.r0 + dr, 0, ROWS - 1 - alt);
      a.r1 = a.r0 + alt;
    } else {
      // Nunca menor que 2x2: a borda puxada para uma celula antes da outra.
      if (arraste.modo.includes('w')) a.c0 = limitar(i.c0 + dc, 0, i.c1 - 1);
      if (arraste.modo.includes('e')) a.c1 = limitar(i.c1 + dc, i.c0 + 1, COLS - 1);
      if (arraste.modo.includes('n')) a.r0 = limitar(i.r0 + dr, 0, i.r1 - 1);
      if (arraste.modo.includes('s')) a.r1 = limitar(i.r1 + dr, i.r0 + 1, ROWS - 1);
    }
    if (!igual(a, arraste.atual)) {
      arraste.atual = a;
      avisar();
    }
  }

  function soltar() {
    if (!arraste) return;
    const { id, inicial, atual } = arraste;
    arraste = null;
    if (igual(inicial, atual)) { avisar(); return; }
    // O retangulo de verdade nunca mudou: recusar aqui e so nao mandar.
    const problema = M().problemaDaArea(id, atual);
    if (problema) {
      aviso = problema;
      avisar();
      return;
    }
    mandar(id, atual, () => Network.editarArea(id, atual));
  }

  function mandar(id, area, enviar) {
    aviso = '';   // o motivo da recusa anterior nao vale pra esta
    if (!window.Network || !enviar()) {
      aviso = 'Sem conexao com o servidor agora.';
      avisar();
      return;
    }
    pendente = { id, area, prazo: Date.now() + ESPERA_MS };
    avisar();
  }

  function restaurar(id) {
    const original = M().areaOriginal(id);
    if (!original || pendente) return;
    const problema = M().problemaDaArea(id, original);
    if (problema) {
      aviso = 'Nao da pra voltar ao lugar original: ' + problema.charAt(0).toLowerCase() + problema.slice(1);
      avisar();
      return;
    }
    mandar(id, original, () => Network.restaurarArea(id));
  }

  // Esc: primeiro desfaz o arraste em andamento, depois solta a selecao.
  function cancelar() {
    if (!ativo) return false;
    if (arraste) { arraste = null; avisar(); return true; }
    if (selecionada) { selecionada = null; aviso = ''; avisar(); return true; }
    return false;
  }

  // Resposta do servidor (chega pra todo mundo, inclusive quem nao esta editando).
  function aceita(a) {
    if (pendente && a && pendente.id === a.id) pendente = null;
    if (ativo) avisar();
  }

  function recusada(m) {
    if (pendente && (!m || m.id === null || pendente.id === m.id)) pendente = null;
    if (m && m.id === null) criando = false;
    aviso = (m && m.erro) || 'O servidor nao aceitou essa mudanca.';
    if (ativo) avisar();
  }

  // ---- criar e apagar area (docs/areas.md) --------------------------------
  // O quadrado livre MAIS PERTO de quem esta criando, do maior pro menor (4x4,
  // 3x3, 2x2). A diretoria arrasta dali pro lugar que quiser - e o mesmo gesto
  // de sempre, sem modo novo de desenhar retangulo.
  //
  // Perto da pessoa, e nao "o primeiro da lista": varrendo do canto de cima, a
  // area nascia no jardim, em cima da parede, fora do que ela estava olhando.
  function lugarLivre() {
    const T = M().TILE;
    const eu = window.Game && Game.getPlayers && Game.getPlayers().get(Game.getSelfId());
    const ref = eu ? { r: eu.y / T, c: eu.x / T } : { r: 0, c: 0 };
    for (const lado of [4, 3, 2]) {
      let melhor = null;
      for (let r = 0; r + lado - 1 < M().ROWS; r++) {
        for (let c = 0; c + lado - 1 < M().COLS; c++) {
          const a = { r0: r, c0: c, r1: r + lado - 1, c1: c + lado - 1 };
          if (M().problemaDaArea(null, a)) continue;
          const d = Math.hypot(r + (lado - 1) / 2 - ref.r, c + (lado - 1) / 2 - ref.c);
          if (!melhor || d < melhor.d) melhor = { a, d };
        }
      }
      if (melhor) return melhor.a;
    }
    return null;
  }

  function criar() {
    if (pendente || criando) return;
    if (M().ROOMS.length >= M().AREAS_MAX) {
      aviso = 'A sede ja tem ' + M().AREAS_MAX + ' areas. Apague uma antes de criar outra.';
      avisar();
      return;
    }
    const onde = lugarLivre();
    if (!onde) {
      aviso = 'Nao ha espaco livre pra uma area nova. Diminua alguma antes.';
      avisar();
      return;
    }
    aviso = '';
    if (!window.Network || !Network.criarArea(Object.assign({ nome: 'Area nova', piso: 'tijolo' }, onde))) {
      aviso = 'Sem conexao com o servidor agora.';
      avisar();
      return;
    }
    criando = { prazo: Date.now() + ESPERA_MS };
    avisar();
  }

  // Chegou do servidor: a area ja entrou no mapa (game.js). Aqui so seleciona,
  // pra pessoa ja sair arrastando a que acabou de criar.
  function criada(a) {
    if (criando) {
      criando = false;
      if (a && a.id) {
        selecionada = a.id;
        if (window.Game && Game.olharPara) {
          const T = M().TILE;
          Game.olharPara(((a.c0 + a.c1 + 1) / 2) * T, ((a.r0 + a.r1 + 1) / 2) * T);
        }
      }
    }
    if (ativo) avisar();
  }

  function apagar(id) {
    if (pendente || criando || !M().areaCriada(id)) return;
    const s = sala(id);
    if (!confirm('Apagar a area "' + (s ? s.nome : id) + '"? O chao dela volta a ser o que era antes (corredor ou jardim).')) return;
    aviso = '';
    if (!window.Network || !Network.apagarArea(id)) {
      aviso = 'Sem conexao com o servidor agora.';
      avisar();
      return;
    }
    pendente = { id, area: retanguloAtual(s), prazo: Date.now() + ESPERA_MS };
    avisar();
  }

  function apagada(id) {
    if (pendente && pendente.id === id) pendente = null;
    if (selecionada === id) selecionada = null;
    if (ativo) avisar();
  }

  function cursorEm(x, y, zoom) {
    if (!ativo) return 'default';
    if (arraste) return arraste.modo === 'mover' ? 'grabbing' : cursorDoModo(arraste.modo);
    const s = selecionada ? sala(selecionada) : null;
    const modo = s ? modoEm(s, x, y, zoom) : null;
    if (modo) return modo === 'mover' ? 'grab' : cursorDoModo(modo);
    return areaEm(x, y) ? 'pointer' : 'default';
  }

  function cursorDoModo(modo) {
    if (modo === 'n' || modo === 's') return 'ns-resize';
    if (modo === 'e' || modo === 'w') return 'ew-resize';
    if (modo === 'ne' || modo === 'sw') return 'nesw-resize';
    return 'nwse-resize';
  }

  // ------------------------------------------------------------- desenho

  // No mapa, por cima de tudo: cada area como um retangulo da cor dela, e a
  // selecionada com alcas nas quinas e no meio das bordas. Tudo em pixels de
  // TELA (dividido pelo zoom), pra linha e texto nao engrossarem de perto.
  function desenhar(ctx, zoom) {
    if (!ativo) return;
    conferirPrazo();
    const T = M().TILE;
    const px = 1 / (zoom || 1);
    salas().forEach((s) => {
      const a = retanguloAtual(s);
      const x = a.c0 * T;
      const y = a.r0 * T;
      const w = (a.c1 - a.c0 + 1) * T;
      const h = (a.r1 - a.r0 + 1) * T;
      const sel = s.id === selecionada;
      const emArraste = arraste && arraste.id === s.id;
      const invalida = emArraste && !!M().problemaDaArea(s.id, a);
      const cor = invalida ? '#ef4444' : (s.cor || '#6366f1');

      ctx.save();
      ctx.globalAlpha = sel ? 0.24 : 0.12;
      ctx.fillStyle = cor;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = cor;
      ctx.lineWidth = (sel ? 3 : 2) * px;
      if (!sel) ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // nome e tamanho, numa pilula no canto de cima
      const texto = s.nome + '  ' + (a.c1 - a.c0 + 1) + ' x ' + (a.r1 - a.r0 + 1);
      ctx.font = '600 ' + (11 * px) + 'px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(texto).width + 12 * px;
      const th = 18 * px;
      ctx.fillStyle = sel ? cor : 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.roundRect(x + 4 * px, y + 4 * px, tw, th, 9 * px);
      ctx.fill();
      ctx.fillStyle = sel ? '#ffffff' : '#1f2937';
      ctx.fillText(texto, x + 10 * px, y + 4 * px + th / 2);

      if (sel) {
        const lado = 9 * px;
        const pontos = [
          [x, y], [x + w / 2, y], [x + w, y],
          [x, y + h / 2], [x + w, y + h / 2],
          [x, y + h], [x + w / 2, y + h], [x + w, y + h],
        ];
        pontos.forEach(([hx, hy]) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx - lado / 2, hy - lado / 2, lado, lado);
          ctx.lineWidth = 2 * px;
          ctx.strokeStyle = cor;
          ctx.strokeRect(hx - lado / 2, hy - lado / 2, lado, lado);
        });
      }
      ctx.restore();
    });
  }

  // ------------------------------------------------------------- o painel

  function dica() {
    return 'Arraste o meio de uma area pra mudar de lugar, e a borda ou a quina pra mudar o tamanho. '
      + 'Com a area escolhida, da pra mudar tambem como se ouve dentro dela. '
      + 'Parede e movel ficam onde estao (use as outras abas).';
  }

  // ---- a regra de som da area (docs/areas.md) -----------------------------
  // Cada area diz de que jeito se ouve dentro dela. E aqui que a sala de
  // reuniao vira "a sala toda" e o Foco vira "so quem senta do lado" - antes
  // isso era marca fixa no codigo, em quatro salas escolhidas a dedo.
  const ROTULO_SOM = {
    perto: 'So quem esta perto',
    sala: 'A sala toda',
    silencio: 'Ninguem (silencio)',
  };
  const EXPLICA_SOM = {
    perto: 'Conversa quem chega a ate o alcance abaixo, sem parede no meio.',
    sala: 'Quem esta dentro conversa com quem esta dentro, em qualquer canto dela - e ninguem de fora entra, nem colado na porta. E o tamanho da area que vale.',
    silencio: 'Aqui a chamada por proximidade nao abre. E a regra da biblioteca.',
  };

  function mandarSom(s, som) {
    if (pendente) return;
    const area = Object.assign(retanguloAtual(s), { som: som });
    const problema = M().problemaDaArea(s.id, area);
    if (problema) { aviso = problema; avisar(); return; }
    mandar(s.id, area, () => Network.editarArea(s.id, area));
  }

  // Nome e piso da area. Mudam pelo mesmo caminho do tamanho e da regra de som:
  // manda pro servidor, que confere e devolve pra todo mundo.
  function controleDeNome(s) {
    const bloco = document.createElement('div');
    bloco.className = 'area-identidade';

    const linhaNome = document.createElement('label');
    linhaNome.className = 'area-campo';
    const rotulo = document.createElement('span');
    rotulo.textContent = 'Nome';
    const campo = document.createElement('input');
    campo.type = 'text';
    campo.value = s.nome;
    campo.maxLength = M().NOME_MAX;
    campo.disabled = !!pendente;
    campo.addEventListener('change', () => {
      const novo = campo.value.trim();
      if (!novo || novo === s.nome) { campo.value = s.nome; return; }
      mandarCampo(s, { nome: novo });
    });
    linhaNome.append(rotulo, campo);

    const linhaPiso = document.createElement('label');
    linhaPiso.className = 'area-campo';
    const rotuloPiso = document.createElement('span');
    rotuloPiso.textContent = 'Piso';
    const lista = document.createElement('select');
    lista.disabled = !!pendente;
    M().PISOS_DE_AREA.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.nome;
      if (p.id === s.piso) o.selected = true;
      lista.appendChild(o);
    });
    lista.addEventListener('change', () => {
      if (lista.value !== s.piso) mandarCampo(s, { piso: lista.value });
    });
    linhaPiso.append(rotuloPiso, lista);

    bloco.append(linhaNome, linhaPiso);
    return bloco;
  }

  function mandarCampo(s, campos) {
    if (pendente) return;
    const area = Object.assign(retanguloAtual(s), campos);
    const problema = M().problemaDaArea(s.id, area);
    if (problema) { aviso = problema; avisar(); return; }
    mandar(s.id, area, () => Network.editarArea(s.id, area));
  }

  function controleDeSom(s) {
    const som = M().somDaArea(s.som);
    const bloco = document.createElement('div');
    bloco.className = 'area-som';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Como se ouve na ' + s.nome;
    bloco.appendChild(titulo);

    const modos = document.createElement('div');
    modos.className = 'area-som-modos';
    modos.setAttribute('role', 'group');
    M().SOM_MODOS.forEach((modo) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'area-som-modo' + (modo === som.modo ? ' ativo' : '');
      b.setAttribute('aria-pressed', modo === som.modo ? 'true' : 'false');
      b.textContent = ROTULO_SOM[modo];
      b.disabled = !!pendente;
      b.addEventListener('click', () => {
        if (modo === som.modo) return;
        mandarSom(s, { modo: modo, alcance: som.alcance });
      });
      modos.appendChild(b);
    });
    bloco.appendChild(modos);

    if (som.modo === 'perto') {
      const linha = document.createElement('label');
      linha.className = 'area-som-alcance';
      const texto = document.createElement('span');
      texto.textContent = 'Alcance';
      const campo = document.createElement('input');
      campo.type = 'number';
      campo.min = String(M().ALCANCE_MIN);
      campo.max = String(M().ALCANCE_MAX);
      campo.step = '1';
      campo.value = String(som.alcance);
      campo.disabled = !!pendente;
      // 'change', e nao 'input': digitar "1" pra chegar em "12" mandaria duas
      // vezes, e a primeira ja teria mudado a area pra todo mundo.
      campo.addEventListener('change', () => {
        const n = limitar(Math.round(Number(campo.value) || 0), M().ALCANCE_MIN, M().ALCANCE_MAX);
        campo.value = String(n);
        if (n !== som.alcance) mandarSom(s, { modo: 'perto', alcance: n });
      });
      const unidade = document.createElement('span');
      unidade.className = 'area-som-unidade';
      unidade.textContent = 'tiles (' + M().ALCANCE_MIN + ' a ' + M().ALCANCE_MAX + ')';
      linha.append(texto, campo, unidade);
      bloco.appendChild(linha);
    }

    const explica = document.createElement('p');
    explica.className = 'area-som-explica';
    explica.textContent = EXPLICA_SOM[som.modo];
    bloco.appendChild(explica);
    return bloco;
  }

  function renderPainel(el) {
    el.innerHTML = '';
    const lista = document.createElement('div');
    lista.className = 'areas-lista';
    salas().forEach((s) => {
      const a = retanguloAtual(s);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'area-item' + (s.id === selecionada ? ' ativa' : '');
      const ponto = document.createElement('span');
      ponto.className = 'area-ponto';
      ponto.style.background = s.cor || '#6366f1';
      const nome = document.createElement('span');
      nome.className = 'area-nome';
      nome.textContent = s.nome;
      const tam = document.createElement('span');
      tam.className = 'area-tamanho';
      tam.textContent = (a.c1 - a.c0 + 1) + ' x ' + (a.r1 - a.r0 + 1);
      b.append(ponto, nome, tam);
      b.addEventListener('click', () => {
        selecionada = s.id;
        aviso = '';
        // leva a camera ate ela: da lista, a area pode estar fora da tela
        if (window.Game && Game.olharPara) {
          const T = M().TILE;
          Game.olharPara(((a.c0 + a.c1 + 1) / 2) * T, ((a.r0 + a.r1 + 1) / 2) * T);
        }
        avisar();
      });
      lista.appendChild(b);
    });
    el.appendChild(lista);

    const nova = document.createElement('button');
    nova.type = 'button';
    nova.className = 'btn btn-secundario area-nova';
    nova.textContent = '+ Area nova';
    nova.disabled = !!pendente || !!criando || M().ROOMS.length >= M().AREAS_MAX;
    nova.addEventListener('click', criar);
    el.appendChild(nova);

    const s = selecionada ? sala(selecionada) : null;
    if (s) {
      el.appendChild(controleDeNome(s));
      el.appendChild(controleDeSom(s));
      if (M().areaCriada(s.id)) {
        const apaga = document.createElement('button');
        apaga.type = 'button';
        apaga.className = 'btn btn-secundario area-apagar';
        apaga.textContent = 'Apagar "' + s.nome + '"';
        apaga.disabled = !!pendente || !!criando;
        apaga.addEventListener('click', () => apagar(s.id));
        el.appendChild(apaga);
      } else {
        const original = M().areaOriginal(s.id);
        const mexida = original && (!igual(original, retanguloAtual(s)) || !M().somIgual(original.som, s.som)
          || original.nome !== s.nome || original.piso !== s.piso);
        const volta = document.createElement('button');
        volta.type = 'button';
        volta.className = 'btn btn-secundario area-restaurar';
        // "ao original", e nao "ao tamanho original": o botao devolve tambem o
        // nome, o piso e a regra de som de fabrica.
        volta.textContent = mexida ? 'Voltar "' + s.nome + '" ao original' : '"' + s.nome + '" esta como veio de fabrica';
        volta.disabled = !mexida || !!pendente;
        volta.addEventListener('click', () => restaurar(s.id));
        el.appendChild(volta);
      }
    }
    if (pendente) {
      const p = document.createElement('p');
      p.className = 'area-status';
      p.textContent = 'Salvando...';
      el.appendChild(p);
    }
    if (aviso) {
      const p = document.createElement('p');
      p.className = 'area-aviso';
      p.textContent = aviso;
      el.appendChild(p);
    }
  }

  window.EditorAreas = {
    ligar, desligar, estaAtivo, arrastando,
    pressionar, arrastar, soltar, cancelar, restaurar,
    aceita, recusada, criada, apagada, cursorEm, desenhar, renderPainel, dica,
  };
})();
