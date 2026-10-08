// Script da pagina auditoria.html. Mora aqui, e nao dentro do HTML, porque a CSP da
// sede (server/index.js) recusa script inline. Ver testes/sem-inline.js.

(function () {
  var M = window.OfficeMap, T = M.TILE;

  function nome(id) {
    return Object.keys(M).find(function (k) { return M[k] === id && typeof M[k] === 'number'; });
  }

  function medir() {
    // Desenha o mapa pelo MESMO caminho do jogo e le o canvas pronto.
    window.Game.redesenharMapa();
    var cv = window.Game.canvasDoMapa();
    var E = window.Game.escalaDoMapa();
    var W = cv.width;
    var d = cv.getContext('2d').getImageData(0, 0, W, cv.height).data;

    // As cores da face do muro DEPOIS da paleta do pacote (game.js encaixa
    // toda cor solida na paleta LPC, entao o #6f7889 do codigo vira #726b7e).
    function ehFace(px, py) {
      var i = (py * W + px) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      return (Math.abs(R - 0x72) < 18 && Math.abs(G - 0x6b) < 18 && Math.abs(B - 0x7e) < 18)
          || (Math.abs(R - 0x5b) < 18 && Math.abs(G - 0x63) < 18 && Math.abs(B - 0x76) < 18)
          || (Math.abs(R - 0x6f) < 18 && Math.abs(G - 0x78) < 18 && Math.abs(B - 0x89) < 18);
    }

    function pontua(c, r) {
      var n = 0, t = 0;
      for (var px = Math.round((c * T + 3) * E); px < Math.round((c * T + T - 3) * E); px++) {
        for (var py = Math.round((r * T + 1) * E); py < Math.round((r * T + 7) * E); py++) {
          t++; if (ehFace(px, py)) n++;
        }
      }
      return t ? n / t : 0;
    }

    var ehP = function (c, r) {
      var t = M.tiles[r] && M.tiles[r][c];
      return t === M.PAREDE || t === M.JANELA;
    };
    // Muro DEITADO: parede sem parede em cima nem embaixo. So ele tem face.
    var deitado = function (c, r) { return ehP(c, r) && !ehP(c, r - 1) && !ehP(c, r + 1); };

    // Mesma regra do game.js: separa dois lugares e alcanca um muro deitado.
    function naLinha(c, r) {
      var t = M.tiles[r][c];
      if (!t || ehP(c, r) || M.isTileWalkable(c, r)) return false;
      if (ehP(c, r - 1)) return false;      // junção em T: parede em pe nao tem face
      var a = M.getRoomAtTile(c, r - 1), b = M.getRoomAtTile(c, r + 1);
      if ((a ? a.id : null) === (b ? b.id : null)) return false;
      for (var s = 0; s < 2; s++) {
        var p = s ? 1 : -1;
        for (var k = c + p, n = 0; n < 12; k += p, n++) {
          var v = M.tiles[r][k];
          if (v === undefined) break;
          if (deitado(k, r)) return true;
          if (v === M.LIVRE || M.isTileWalkable(k, r)) break;
        }
      }
      return false;
    }

    var puras = [], moveis = [];
    for (var r = 1; r < M.ROWS - 1; r++) {
      for (var c = 1; c < M.COLS - 1; c++) {
        if (deitado(c, r)) puras.push({ c: c, r: r, s: pontua(c, r) });
        else if (naLinha(c, r)) moveis.push({ c: c, r: r, peca: nome(M.tiles[r][c]), s: pontua(c, r) });
      }
    }
    var ordenadas = puras.map(function (o) { return o.s; }).sort();
    var med = ordenadas[Math.floor(ordenadas.length / 2)] || 0;
    var corte = med * 0.6;
    var falhas = puras.filter(function (o) { return o.s < corte; })
      .map(function (o) { return 'PAREDE ' + o.c + ',' + o.r + ' - ' + Math.round(o.s * 100) + '%'; })
      .concat(moveis.filter(function (o) { return o.s < corte; })
        .map(function (o) { return o.peca + ' ' + o.c + ',' + o.r + ' - ' + Math.round(o.s * 100) + '%'; }));

    var pecas = moveis.map(function (o) { return o.peca; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();

    document.getElementById('saida').innerHTML =
      '<p class="placar"><strong>' + puras.length + '</strong> paredes deitadas e <strong>' +
      moveis.length + '</strong> moveis encostados na linha delas.</p>' +
      '<p class="placar">Sem a faixa do muro: <span class="' + (falhas.length ? 'ruim' : 'bom') + '">' +
      falhas.length + '</span></p>' +
      (falhas.length ? '<ul><li>' + falhas.join('</li><li>') + '</li></ul>' : '') +
      '<p class="aviso" style="margin-top:12px">Pecas conferidas na linha do muro: ' +
      pecas.join(', ') + '.</p>';
  }

  // As folhas do pacote chegam depois: mede quando tudo estiver carregado.
  window.Sprites.aoCarregar(function () { setTimeout(medir, 60); });
})();
