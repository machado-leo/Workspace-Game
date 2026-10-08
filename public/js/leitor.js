// O leitor de livros da biblioteca: abre o PDF do acervo dentro da sede.
//
// O livro vem de /api/estante/<id>/arquivo, que e o NOSSO servidor - nunca um
// link do Drive. A pessoa nao sai da sede, nao precisa de conta Google, e a
// pasta da biblioteca continua privada.
//
// QUEM DESENHA O PDF
// PDF.js, o leitor da Mozilla (o mesmo do Firefox), carregado so quando alguem
// abre o primeiro livro - quem nunca vai na biblioteca nao paga o download dele.
// A versao e fixa de proposito: `import()` de CDN sem versao fixa e codigo de
// terceiro mudando embaixo da sede sem ninguem saber.
//
// Versao 4.x, e nao a 3.11 que ainda aparece em todo tutorial: a 3.x tem uma
// falha (CVE-2024-4367) em que um PDF preparado roda codigo na pagina de quem
// abre. Mesmo assim `isEvalSupported: false` vai ligado - o acervo vem de uma
// pasta onde muita gente poe arquivo.
(function () {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;

  let pdfjsPronto = null;      // promessa do import, uma vez so

  let raiz, palco, folha, canvas, tituloEl, paginaEl, zoomEl, statusEl, baixarEl;
  let livro = null;            // { id, titulo }
  let doc = null;              // documento do PDF.js
  let pagina = 1;
  let zoom = 1;                // 1 = a pagina inteira cabe na tela
  let tarefa = null;           // render em andamento, pra cancelar ao virar rapido
  let abrindo = 0;             // contador: livro aberto por cima de outro que ainda carregava
  let vez = 0;                 // contador: cada desenho pedido ganha um numero, so o mais novo pinta

  // ------------------------------------------------------------------ PDF.js

  function carregarPdfjs() {
    if (!pdfjsPronto) {
      pdfjsPronto = import(PDFJS + 'pdf.min.mjs').then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
        return lib;
      }).catch((e) => {
        pdfjsPronto = null;    // deixa tentar de novo no proximo clique
        throw e;
      });
    }
    return pdfjsPronto;
  }

  // Abre um PDF do acervo so com o que precisa: o PDF.js pede ao servidor so os
  // pedacos (Range) das paginas mostradas. Livro de 600 paginas abre na primeira
  // sem baixar o resto.
  //
  // Precisa dos DOIS: `disableAutoFetch` sozinho nao basta. O primeiro pedido do
  // PDF.js e o arquivo inteiro, e com streaming ligado ele CONTINUA baixando esse
  // pedido ate o fim mesmo sabendo usar Range - medido: o livro de 142 MB saia
  // inteiro so pra mostrar a capa. `disableStream` faz ele cancelar esse pedido
  // assim que ve que o servidor aceita Range.
  async function abrirPdf(id) {
    const lib = await carregarPdfjs();
    return lib.getDocument({
      url: '/api/estante/' + encodeURIComponent(id) + '/arquivo',
      withCredentials: true,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 256 * 1024,
    }).promise;
  }

  // Primeira pagina como imagem pequena: e a capa dos livros que nao vem com
  // miniatura (os da pasta local). Usado pela estante.
  async function capaDaPrimeiraPagina(id, largura) {
    const d = await abrirPdf(id);
    try {
      const p = await d.getPage(1);
      const base = p.getViewport({ scale: 1 });
      const escala = (largura * (window.devicePixelRatio || 1)) / base.width;
      const vp = p.getViewport({ scale: escala });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      await p.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      return cv.toDataURL('image/jpeg', 0.82);
    } finally {
      d.destroy();
    }
  }

  // ------------------------------------------------------------------ tela

  function lembrarPagina() {
    if (!livro) return;
    try { localStorage.setItem('leitor:pagina:' + livro.id, String(pagina)); } catch (e) { /* sem storage */ }
  }

  function paginaLembrada(id) {
    try { return parseInt(localStorage.getItem('leitor:pagina:' + id), 10) || 1; } catch (e) { return 1; }
  }

  function status(texto) {
    statusEl.textContent = texto || '';
    statusEl.classList.toggle('oculto', !texto);
  }

  // Virar tres paginas rapido pede tres desenhos que correm juntos. Sem o `vez`,
  // o `getPage` da pagina 2 podia voltar DEPOIS do da 4 e pintar por cima: o
  // contador dizia "4 / 5" com o Sumario na tela. Agora quem foi passado pra
  // tras desiste em cada espera, e so o ultimo pedido chega no canvas.
  async function desenhar() {
    if (!doc) return;
    const minha = ++vez;
    const meu = abrindo;
    if (tarefa) { tarefa.cancel(); tarefa = null; }

    const p = await doc.getPage(pagina);
    if (minha !== vez || meu !== abrindo || !doc) return;

    // "Caber na tela" e a medida de 100%: a pagina inteira visivel, sem rolar.
    // Zoom acima disso vira leitura de perto, e o palco passa a rolar.
    const base = p.getViewport({ scale: 1 });
    const livreW = palco.clientWidth - 140;     // espaco das setas dos lados
    const livreH = palco.clientHeight - 48;
    const caber = Math.max(0.1, Math.min(livreW / base.width, livreH / base.height));
    const escalaCss = caber * zoom;
    const dpr = window.devicePixelRatio || 1;
    const vp = p.getViewport({ scale: escalaCss * dpr });

    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    canvas.style.width = Math.round(vp.width / dpr) + 'px';
    canvas.style.height = Math.round(vp.height / dpr) + 'px';

    const minhaTarefa = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    tarefa = minhaTarefa;
    try {
      await minhaTarefa.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    } finally {
      // so limpa se ainda for a dela: a de um desenho mais novo fica
      if (tarefa === minhaTarefa) tarefa = null;
    }
    if (minha !== vez) return;

    paginaEl.textContent = pagina + ' / ' + doc.numPages;
    zoomEl.textContent = Math.round(zoom * 100) + '%';
    raiz.querySelector('#leitor-anterior').disabled = pagina <= 1;
    raiz.querySelector('#leitor-proxima').disabled = pagina >= doc.numPages;
  }

  function irPara(n) {
    if (!doc) return;
    const alvo = Math.max(1, Math.min(doc.numPages, n));
    if (alvo === pagina) return;
    pagina = alvo;
    lembrarPagina();
    palco.scrollTop = 0;
    desenhar();
  }

  function ajustarZoom(delta) {
    const novo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((zoom + delta) * 100) / 100));
    if (novo === zoom) return;
    zoom = novo;
    desenhar();
  }

  // ------------------------------------------------------------ abrir/fechar

  async function abrir(l) {
    if (!raiz || !l) return;
    const meu = ++abrindo;
    livro = { id: l.id, titulo: l.titulo };
    tituloEl.textContent = l.titulo;
    paginaEl.textContent = '';
    zoomEl.textContent = '100%';
    baixarEl.href = '/api/estante/' + encodeURIComponent(l.id) + '/arquivo?baixar=1';
    canvas.width = 0;
    raiz.classList.remove('oculto');
    document.body.classList.add('lendo');
    status('Abrindo o livro...');

    try {
      if (doc) { doc.destroy(); doc = null; }
      const d = await abrirPdf(l.id);
      if (meu !== abrindo) { d.destroy(); return; }
      doc = d;
      // So avisa a sede DEPOIS que o livro abriu de verdade. Avisar no clique
      // marcaria como "lendo" quem tentou abrir e levou erro de rede.
      if (window.Network) Network.estouLendo(l.id);
      zoom = 1;
      pagina = Math.min(paginaLembrada(l.id), doc.numPages);
      await desenhar();
      status(pagina > 1 ? 'Continuando da pagina ' + pagina : '');
      if (pagina > 1) setTimeout(() => { if (meu === abrindo) status(''); }, 2200);
    } catch (e) {
      if (meu !== abrindo) return;
      const semRede = e && /import|fetch|Failed/i.test(String(e.message || e));
      status(e && e.status === 403
        ? 'So quem e da sede abre os livros da biblioteca.'
        : semRede
          ? 'Nao consegui carregar o leitor. Confira a internet e tente de novo.'
          : 'Nao consegui abrir esse livro. Da pra baixar ele no botao ali em cima.');
      console.warn('[leitor]', e);
    }
  }

  function fechar() {
    if (!raiz || raiz.classList.contains('oculto')) return;
    abrindo++;
    if (tarefa) { tarefa.cancel(); tarefa = null; }
    if (doc) { doc.destroy(); doc = null; }
    livro = null;
    raiz.classList.add('oculto');
    document.body.classList.remove('lendo');
    if (window.Network) Network.estouLendo(null);
  }

  function estaAberto() {
    return !!raiz && !raiz.classList.contains('oculto');
  }

  // ------------------------------------------------------------------ init

  function iniciar() {
    raiz = document.getElementById('leitor');
    if (!raiz) return;
    palco = document.getElementById('leitor-palco');
    folha = raiz.querySelector('.leitor-folha');
    canvas = document.getElementById('leitor-canvas');
    tituloEl = document.getElementById('leitor-titulo');
    paginaEl = document.getElementById('leitor-pagina');
    zoomEl = document.getElementById('leitor-zoom');
    statusEl = document.getElementById('leitor-status');
    baixarEl = document.getElementById('leitor-baixar');

    document.getElementById('leitor-fechar').addEventListener('click', fechar);
    document.getElementById('leitor-anterior').addEventListener('click', () => irPara(pagina - 1));
    document.getElementById('leitor-proxima').addEventListener('click', () => irPara(pagina + 1));
    document.getElementById('leitor-menos').addEventListener('click', () => ajustarZoom(-0.25));
    document.getElementById('leitor-mais').addEventListener('click', () => ajustarZoom(0.25));

    // Clique na metade esquerda da folha volta, na direita avanca - que e o gesto
    // de virar pagina, e sobra a seta pra quem prefere mirar.
    folha.addEventListener('click', (ev) => {
      if (zoom > 1) return;   // de perto o clique e pra rolar/ler, nao pra virar
      const r = folha.getBoundingClientRect();
      irPara(pagina + (ev.clientX - r.left < r.width / 2 ? -1 : 1));
    });

    // Fase de CAPTURA e parar a propagacao: varios paineis da sede fecham no Esc
    // (estante, cartao da mesa, decorador). Com o leitor aberto por cima, o Esc
    // e dele - senao fechava a estante junto, atras dele.
    window.addEventListener('keydown', (ev) => {
      if (!estaAberto()) return;
      const k = ev.key;
      let usou = true;
      if (k === 'Escape') fechar();
      else if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !ev.shiftKey)) irPara(pagina + 1);
      else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && ev.shiftKey)) irPara(pagina - 1);
      else if (k === 'Home') irPara(1);
      else if (k === 'End' && doc) irPara(doc.numPages);
      else if (k === '+' || k === '=') ajustarZoom(0.25);
      else if (k === '-') ajustarZoom(-0.25);
      else usou = false;
      if (usou) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, true);

    let espera = null;
    window.addEventListener('resize', () => {
      if (!estaAberto()) return;
      clearTimeout(espera);
      espera = setTimeout(desenhar, 120);
    });
  }

  window.Leitor = { iniciar, abrir, fechar, estaAberto, capaDaPrimeiraPagina };
})();
