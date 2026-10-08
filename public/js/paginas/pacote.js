// Script da pagina pacote.html. Mora aqui, e nao dentro do HTML, porque a CSP da
// sede (server/index.js) recusa script inline. Ver testes/sem-inline.js.

(function () {
  // A lista sai dos manifestos gravados no download, entao a pagina mostra
  // exatamente o que esta no disco - sem lista escrita a mao pra desatualizar.
  var TODAS = [];

  var Z = 3, T = 32, MARGEM = 20;
  var lista = document.getElementById('lista');
  var busca = document.getElementById('busca');
  var contagem = document.getElementById('contagem');

  // Uma caixa por folha, criada JA na ordem: sem isso o onload embaralha tudo.
  function mostrar(entrada) {
    var caminho = entrada.local;
    var caixa = document.createElement('div');
    caixa.className = 'peca';
    lista.appendChild(caixa);

    var img = new Image();
    img.src = 'assets/lpc-moveis/' + caminho;
    img.onload = function () {
      var cols = img.width / T, rows = img.height / T;
      caixa.innerHTML =
        '<h2>' + caminho + '</h2>' +
        '<p class="meta">' + img.width + '&times;' + img.height + ' px = ' +
        cols + '&times;' + rows + ' tiles &mdash; original: <code>' +
        entrada.origem + '</code></p>';

      var rolagem = document.createElement('div');
      rolagem.className = 'rolagem';
      var cv = document.createElement('canvas');
      cv.width = img.width * Z + MARGEM;
      cv.height = img.height * Z + MARGEM;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      for (var yy = 0; yy < cv.height; yy += 8) {
        for (var xx = 0; xx < cv.width; xx += 8) {
          ctx.fillStyle = ((xx + yy) / 8) % 2 ? '#f2f3f7' : '#e6e8ef';
          ctx.fillRect(xx, yy, 8, 8);
        }
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, MARGEM);
      ctx.fillRect(0, 0, MARGEM, cv.height);
      ctx.drawImage(img, MARGEM, MARGEM, img.width * Z, img.height * Z);

      ctx.strokeStyle = 'rgba(91,69,200,.40)';
      ctx.lineWidth = 1;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#5b45c8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var c = 0; c <= cols; c++) {
        var px = MARGEM + c * T * Z + 0.5;
        ctx.beginPath(); ctx.moveTo(px, MARGEM); ctx.lineTo(px, cv.height); ctx.stroke();
        if (c < cols) ctx.fillText(c, MARGEM + (c + 0.5) * T * Z, MARGEM / 2 + 2);
      }
      for (var r = 0; r <= rows; r++) {
        var py = MARGEM + r * T * Z + 0.5;
        ctx.beginPath(); ctx.moveTo(MARGEM, py); ctx.lineTo(cv.width, py); ctx.stroke();
        if (r < rows) ctx.fillText(r, MARGEM / 2 + 2, MARGEM + (r + 0.5) * T * Z);
      }
      rolagem.appendChild(cv);
      caixa.appendChild(rolagem);
    };
    img.onerror = function () {
      caixa.innerHTML = '<h2>' + caminho + '</h2><p class="meta">NAO CARREGOU</p>';
    };
  }

  function aplicar() {
    var termo = busca.value.trim().toLowerCase();
    var vistas = TODAS.filter(function (e) {
      return !termo || e.local.toLowerCase().indexOf(termo) >= 0;
    });
    lista.innerHTML = '';
    // No maximo 40 por vez: 320 folhas em 3x de uma vez so trava a aba.
    vistas.slice(0, 40).forEach(mostrar);
    contagem.textContent = vistas.length + ' de ' + TODAS.length + ' folhas' +
      (vistas.length > 40 ? ' - mostrando as 40 primeiras, filtre pra ver o resto' : '');
  }

  Promise.all([
    fetch('assets/lpc-moveis/lista.json').then(function (r) { return r.json(); }),
    fetch('assets/lpc-moveis/lista-ambiente.json').then(function (r) { return r.json(); })
  ]).then(function (partes) {
    TODAS = partes[0].concat(partes[1])
      .filter(function (e) { return /\.png$/i.test(e.local); })
      .sort(function (a, b) { return a.local < b.local ? -1 : 1; });
    aplicar();
  }).catch(function (e) {
    lista.innerHTML = '<p class="aviso">Nao consegui ler os manifestos: ' + e.message + '</p>';
  });

  busca.addEventListener('input', aplicar);
})();
