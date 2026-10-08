// Script da pagina mapa.html. Mora aqui, e nao dentro do HTML, porque a CSP da
// sede (server/index.js) recusa script inline. Ver testes/sem-inline.js.

(function () {
  var cv = document.getElementById('planta');
  var ctx = cv.getContext('2d');

  function desenhar(escala) {
    var m = window.OfficeMap;
    var T = m.TILE;
    cv.width = m.COLS * T * escala;
    cv.height = m.ROWS * T * escala;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);

    for (var r = 0; r < m.ROWS; r++) {
      for (var c = 0; c < m.COLS; c++) {
        window.Game.desenharPiso(ctx, c, r, T, m.pisoEmTile(c, r));
      }
    }
    for (r = 0; r < m.ROWS; r++) {
      for (c = 0; c < m.COLS; c++) {
        var t = m.tiles[r][c];
        if (t) window.Game.desenharObjeto(ctx, c, r, t, T, m.tiles);
      }
    }
    for (r = 0; r < m.ROWS; r++) {
      for (c = 0; c < m.COLS; c++) {
        var o = m.objetos && m.objetos[r] && m.objetos[r][c];
        if (o) window.Game.desenharApoiado(ctx, c, r, o, T, m.tiles);
      }
    }
    // nome de cada sala, como no jogo
    m.ROOMS.forEach(function (sala) {
      if (sala.id === 'jardim') return;
      window.Game.desenharEtiquetaSala(ctx, sala, T);
    });
  }

  // ------------------------------------------------------------- planta
  // Arte em miniatura NAO serve pra julgar distribuicao: de longe vira uma
  // manchinha colorida e nao da pra dizer se uma sala esta grande demais ou
  // no lugar errado. Esta vista joga a arte fora e mostra o que decide isso:
  // onde cada sala comeca e termina, quanto ela ocupa, e o que tem dentro.
  function desenharEsquema() {
    var m = window.OfficeMap;
    var P = 22; // pixels por tile: grande o bastante pra caber texto
    cv.width = m.COLS * P;
    cv.height = m.ROWS * P;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;

    ctx.fillStyle = '#f7f6fb';
    ctx.fillRect(0, 0, cv.width, cv.height);

    // grade de fundo, de 5 em 5 tiles: da pra contar sem medir
    ctx.strokeStyle = '#e7e4f0';
    ctx.lineWidth = 1;
    for (var gc = 0; gc <= m.COLS; gc += 5) {
      ctx.beginPath(); ctx.moveTo(gc * P + .5, 0); ctx.lineTo(gc * P + .5, cv.height); ctx.stroke();
    }
    for (var gr = 0; gr <= m.ROWS; gr += 5) {
      ctx.beginPath(); ctx.moveTo(0, gr * P + .5); ctx.lineTo(cv.width, gr * P + .5); ctx.stroke();
    }

    // area de cada sala, no fundo
    m.ROOMS.forEach(function (s) {
      if (s.id === 'jardim' || s.id === 'hall') return;
      ctx.fillStyle = s.cor + '26';
      ctx.fillRect(s.c0 * P, s.r0 * P, (s.c1 - s.c0 + 1) * P, (s.r1 - s.r0 + 1) * P);
      ctx.strokeStyle = s.cor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.c0 * P + .75, s.r0 * P + .75, (s.c1 - s.c0 + 1) * P - 1.5, (s.r1 - s.r0 + 1) * P - 1.5);
    });

    // parede e janela, que sao o esqueleto do andar
    for (var r = 0; r < m.ROWS; r++) {
      for (var c = 0; c < m.COLS; c++) {
        var t = m.tiles[r][c];
        if (t === m.PAREDE) { ctx.fillStyle = '#3b4152'; ctx.fillRect(c * P, r * P, P, P); }
        else if (t === m.JANELA) { ctx.fillStyle = '#8fc5e8'; ctx.fillRect(c * P, r * P, P, P); }
        else if (m.MESAS_DE_TRABALHO.has(t)) { ctx.fillStyle = '#b9b3d4'; ctx.fillRect(c * P + 2, r * P + 2, P - 4, P - 4); }
        else if (m.ASSENTOS.has(t)) {
          ctx.fillStyle = '#7d8496';
          ctx.beginPath(); ctx.arc(c * P + P / 2, r * P + P / 2, P * 0.22, 0, Math.PI * 2); ctx.fill();
        } else if (t) {
          ctx.fillStyle = '#cfcade'; ctx.fillRect(c * P + 5, r * P + 5, P - 10, P - 10);
        }
      }
    }

    // nome e tamanho de cada sala, por cima
    ctx.textAlign = 'center';
    m.ROOMS.forEach(function (s) {
      if (s.id === 'jardim' || s.id === 'hall') return;
      var larg = s.c1 - s.c0 + 1;
      var alt = s.r1 - s.r0 + 1;
      var mx = (s.c0 + larg / 2) * P;
      var my = (s.r0 + alt / 2) * P;
      var som = (s.som && s.som.modo) || 'perto';
      var regra = som === 'sala' ? ' • fechada' : som === 'silencio' ? ' • silencio' : '';
      var rotulo = s.nome + regra;
      var medida = larg + '×' + alt + ' tiles';

      ctx.font = '600 12px Inter, system-ui, sans-serif';
      var w = Math.max(ctx.measureText(rotulo).width, ctx.measureText(medida).width) + 14;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(mx - w / 2, my - 17, w, 32);
      ctx.strokeStyle = s.cor;
      ctx.lineWidth = 1;
      ctx.strokeRect(mx - w / 2 + .5, my - 16.5, w - 1, 31);

      ctx.fillStyle = '#23283a';
      ctx.fillText(rotulo, mx, my - 4);
      ctx.font = '500 10.5px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#6b7183';
      ctx.fillText(medida, mx, my + 10);
    });
  }

  function trocar(modo) {
    if (modo === 'esquema') desenharEsquema();
    else desenhar(modo);
    // A planta NAO e espremida pra caber: espremida, o nome da sala fica
    // ilegivel e ela deixa de servir pro que existe. Em 1056px cabe na
    // maioria das telas, e o quadro rola quando nao couber.
    cv.classList.toggle('cabe', modo === 2);
    document.getElementById('btn-esquema').classList.toggle('ativo', modo === 'esquema');
    document.getElementById('btn-2').classList.toggle('ativo', modo === 2);
    document.getElementById('btn-4').classList.toggle('ativo', modo === 4);
  }

  var modoAtual = 'esquema';
  document.getElementById('btn-esquema').addEventListener('click', function () { modoAtual = 'esquema'; trocar('esquema'); });
  document.getElementById('btn-2').addEventListener('click', function () { modoAtual = 2; trocar(2); });
  document.getElementById('btn-4').addEventListener('click', function () { modoAtual = 4; trocar(4); });
  trocar('esquema');
  // as folhas do pacote chegam depois do primeiro desenho: redesenha
  if (window.Sprites) window.Sprites.aoCarregar(function () { trocar(modoAtual); });
})();
