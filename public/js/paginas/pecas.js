// Script da pagina pecas.html. Mora aqui, e nao dentro do HTML, porque a CSP da
// sede (server/index.js) recusa script inline. Ver testes/sem-inline.js.

(function () {
  var M = window.OfficeMap, T = M.TILE;
  var Z = 1.15;     // zoom do recorte
  var VOLTA = 1;    // tiles de folga em volta da peca

  function nomeDe(id) {
    return Object.keys(M).find(function (k) { return M[k] === id && typeof M[k] === 'number'; });
  }

  // Uma ocorrencia de cada tipo de tile presente no mapa. Pega a PRIMEIRA de
  // cada, que e estavel entre execucoes - assim dois relatorios sao
  // comparaveis.
  function umaDeCada() {
    var vistos = {};
    for (var r = 0; r < M.ROWS; r++) {
      for (var c = 0; c < M.COLS; c++) {
        var t = M.tiles[r][c];
        if (!t || vistos[t]) continue;
        vistos[t] = { c: c, r: r, t: t };
      }
    }
    return Object.keys(vistos).map(function (k) { return vistos[k]; });
  }

  function montar() {
    window.Game.redesenharMapa();
    var mapa = window.Game.canvasDoMapa();
    var E = window.Game.escalaDoMapa();
    var g = document.getElementById('grade');
    g.innerHTML = '';

    umaDeCada()
      .sort(function (a, b) { return (nomeDe(a.t) || '').localeCompare(nomeDe(b.t) || ''); })
      .forEach(function (p) {
        var lado = VOLTA * 2 + 1;
        var c0 = Math.max(0, Math.min(M.COLS - lado, p.c - VOLTA));
        var r0 = Math.max(0, Math.min(M.ROWS - lado, p.r - VOLTA));

        var cel = document.createElement('div');
        cel.className = 'cel';
        var cv = document.createElement('canvas');
        cv.width = lado * T * Z;
        cv.height = lado * T * Z;
        var x = cv.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.drawImage(mapa, c0 * T * E, r0 * T * E, lado * T * E, lado * T * E,
          0, 0, cv.width, cv.height);

        // marca discreta na celula da peca, pra nao confundir com o vizinho
        x.strokeStyle = 'rgba(255,90,90,.85)';
        x.lineWidth = 2;
        x.strokeRect((p.c - c0) * T * Z + 1, (p.r - r0) * T * Z + 1, T * Z - 2, T * Z - 2);

        cel.appendChild(cv);
        cel.insertAdjacentHTML('beforeend',
          '<b>' + (nomeDe(p.t) || ('tile ' + p.t)) + '</b>' +
          '<span>' + p.c + ',' + p.r +
          (window.Sprites.temSprite(p.t) ? ' &middot; pacote' : ' &middot; desenhado') + '</span>');
        g.appendChild(cel);
      });
  }

  window.Sprites.aoCarregar(function () { setTimeout(montar, 80); });
})();
