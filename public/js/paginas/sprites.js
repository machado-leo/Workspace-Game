// Script da pagina sprites.html. Mora aqui, e nao dentro do HTML, porque a CSP da
// sede (server/index.js) recusa script inline. Ver testes/sem-inline.js.

(function () {
  var M = window.OfficeMap, T = M.TILE, Z = 2;
  var LARG = 4, ALT = 5;   // celulas em volta, pra ver a emenda e a parede
  var PAREDE = M.PAREDE;

  function quadro(nome, id) {
    var cel = document.createElement('div');
    cel.className = 'cel';
    var cv = document.createElement('canvas');
    cv.width = LARG * T * Z;
    cv.height = ALT * T * Z;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(Z, 0, 0, Z, 0, 0);

    for (var r = 0; r < ALT; r++) {
      for (var c = 0; c < LARG; c++) window.Game.desenharPiso(ctx, c, r, T, 0);
    }

    // Grade falsa com PAREDE em cima. E o cenario que expoe o bug: peca em modo
    // 'alto' desenha pra fora da propria celula, pra cima, e apaga a parede
    // que ja tinha sido desenhada ali.
    var grade = [];
    for (r = 0; r < ALT + 2; r++) grade.push(new Array(LARG + 2).fill(0));
    for (c = 0; c < LARG + 2; c++) { grade[1][c] = PAREDE; grade[2][c] = PAREDE; }
    for (r = 3; r <= 4; r++) for (c = 1; c <= 3; c++) grade[r][c] = id;

    ctx.save();
    ctx.translate(-T, -T);
    for (r = 0; r < ALT + 2; r++) {
      for (c = 0; c < LARG + 2; c++) {
        if (grade[r][c]) window.Game.desenharObjeto(ctx, c, r, grade[r][c], T, grade);
      }
    }
    ctx.restore();

    cel.appendChild(cv);
    var p = window.Sprites.CATALOGO[nome];
    cel.insertAdjacentHTML('beforeend',
      '<b>' + nome + '</b><span>' +
      (p.vazio ? '(pintado pelo vizinho)' :
        p.f.split('/').pop().replace('.png', '') + ' ' + p.c + ',' + p.r +
        ' ' + p.w + 'x' + p.h + (p.modo === 'alto' ? ' alto' : '')) +
      '</span>');
    return cel;
  }

  window.Sprites.aoCarregar(function () {
    var g = document.getElementById('grade');
    g.innerHTML = '';
    Object.keys(window.Sprites.CATALOGO).forEach(function (nome) {
      var id = M[nome];
      if (id === undefined) return;
      g.appendChild(quadro(nome, id));
    });
  });
})();
