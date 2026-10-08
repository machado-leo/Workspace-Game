// A estante: clicar numa estante do mapa abre o acervo de livros da sede.
//
// COMO ABRE E COMO FECHA
// Abre no CLIQUE, e so no clique. A primeira versao abria por proximidade e era
// irritante do jeito mais bobo: voce fechava o painel, dava um passo, e ele
// voltava. Agora e uma decisao sua.
//
// E fecha quando voce vai embora: clicar no chao pra andar, `Esc`, ou o X. Sair
// dali e sair dali.
//
// O QUE APARECE
// So a CAPA. E o jeito que a gente procura livro: bate o olho e reconhece. O
// titulo fica pro passar o mouse. Clicar na capa abre o livro no leitor da sede
// (js/leitor.js) - ninguem sai do escritorio, e ninguem precisa de conta Google.
//
// DE ONDE VEM
// Da pasta da biblioteca no Drive, lida pelo servidor (server/acervo.js). Aqui
// nao se cadastra livro: pra por um livro na estante, poe o PDF na pasta.
//
// SETORES
// Cada subpasta e um setor (Marketing, Projetos, Comercial, Gente e Gestao). A
// estante agrupa por setor e poe um filtro no topo - com o acervo crescendo, e
// o jeito de a pessoa de Projetos ir direto no que e dela.
(function () {
  // Px de tela de cada capa, pra desenhar na medida certa. Com a grade em tres
  // colunas num painel de 392px a capa fica com ~104px; desenho em 150 pra ela
  // continuar nitida em tela de alta densidade sem gastar memoria a toa (era
  // 170, de quando a grade tinha duas colunas).
  const LARGURA_CAPA = 150;
  const SEM_SETOR = 'Outros';

  let painel, gradeEl, avisoEl, contaEl, filtrosEl, buscaEl, buscaLinhaEl, limparEl, abasEl, detalheEl;
  let aberto = false;
  let dados = { origem: 'local', livros: [] };
  let carregado = false;

  // DUAS ABAS: os PDFs (Digitais) e os livros de papel da sala da ADM (Na sala).
  // Mesma busca, mesmo filtro por setor, mesmas capas - o que muda e o que o
  // clique faz: o digital abre no leitor, o de papel mostra com quem esta e deixa
  // pegar emprestado. Ver server/emprestimos.js.
  let aba = 'digital';
  let fisico = { livros: [], podeDevolverDeOutros: false, eu: null };
  let carregadoFisico = false;
  let filtro = '';             // '' = todos os setores
  let busca = '';              // texto digitado na busca

  // Busca sem acento e sem caixa: quem procura "gestao" tem que achar "Gestão",
  // e quem procura "MARKETING" tem que achar "Marketing". Digitar o acento
  // certo pra encontrar um livro e exatamente o atrito que a estante existe
  // pra tirar.
  function achatar(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  // Casa por TITULO ou por SETOR. Pelo setor tambem porque "marketing" e as
  // duas coisas ao mesmo tempo aqui, e explicar a diferenca pra quem digitou
  // seria pior do que so mostrar os dois.
  function combina(l, alvo) {
    if (!alvo) return true;
    return achatar(l.titulo).includes(alvo) || achatar(l.setor).includes(alvo)
      || (!!l.autor && achatar(l.autor).includes(alvo));
  }

  // Capa desenhada da 1a pagina, por livro. Fica na memoria da aba: abrir e
  // fechar a estante nao desenha tudo de novo.
  const capasFeitas = new Map();
  let filaCapas = Promise.resolve();

  // ------------------------------------------------------------------ dados

  async function buscar() {
    try {
      const r = await fetch('/api/estante');
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.erro || 'estante indisponivel');
      dados = json;
      carregado = true;
      avisar('');
    } catch (e) {
      avisar(e.message && !/fetch/i.test(e.message) ? e.message : 'Nao consegui abrir a estante agora.');
    }
    render();
  }

  async function buscarFisico() {
    try {
      const r = await fetch('/api/acervo-fisico');
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.erro || 'acervo indisponivel');
      fisico = json;
      carregadoFisico = true;
      // Sede sem acervo fisico (sede de cliente, ACERVO_FISICO=nenhum): a aba
      // "Na sala" some, e com ela a barra de abas - sobra so a estante digital.
      if (json.ativo === false && abasEl) {
        abasEl.classList.add('oculto');
        if (aba === 'sala') aba = 'digital';
      }
      if (aba === 'sala') avisar('');
    } catch (e) {
      if (aba === 'sala') avisar('Nao consegui abrir o acervo da sala agora.');
    }
    if (detalheEl && !detalheEl.classList.contains('oculto') && detalheEl.dataset.id) {
      const l = fisico.livros.find((x) => x.id === detalheEl.dataset.id);
      if (l) abrirDetalhe(l); else fecharDetalhe();
    }
    render();
  }

  async function emprestar(l, acao) {
    try {
      const r = await fetch('/api/acervo-fisico/' + encodeURIComponent(l.id) + '/' + acao, { method: 'POST' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.erro || 'nao deu certo');
      fisico.livros = json.livros;
      const novo = fisico.livros.find((x) => x.id === l.id);
      if (novo) abrirDetalhe(novo);
      render();
    } catch (e) {
      avisar(e.message);
    }
  }

  // ------------------------------------------------------------------- tela

  function avisar(texto) {
    if (!avisoEl) return;
    avisoEl.textContent = texto;
    avisoEl.classList.toggle('oculto', !texto);
  }

  // Cor estavel a partir do titulo: o mesmo livro tem sempre a mesma capa
  // desenhada. Sorteio na hora daria uma capa diferente a cada abertura, e a
  // estante deixaria de ser reconhecivel de relance - que e todo o ponto dela.
  function tomDoTitulo(titulo) {
    let h = 0;
    for (let i = 0; i < titulo.length; i++) h = (h * 31 + titulo.charCodeAt(i)) % 360;
    return h;
  }

  function capaFalsa(l) {
    const div = document.createElement('div');
    div.className = 'estante-capa-desenhada';
    div.style.setProperty('--tom', tomDoTitulo(l.titulo));
    const t = document.createElement('span');
    t.className = 'estante-capa-desenhada-titulo';
    t.textContent = l.titulo;
    div.appendChild(t);
    return div;
  }

  function porImagem(el, src, l) {
    const img = document.createElement('img');
    img.alt = l.titulo;
    img.decoding = 'async';
    img.src = src;
    // Capa que nao carrega deixaria um buraco no meio da grade; a desenhada
    // entra no lugar e a fileira continua inteira.
    img.addEventListener('error', () => {
      const velha = el.querySelector('img, .estante-capa-desenhada');
      if (velha) el.replaceChild(capaFalsa(l), velha);
    });
    const velha = el.querySelector('img, .estante-capa-desenhada');
    if (velha) el.replaceChild(img, velha); else el.prepend(img);
  }

  // Livro sem miniatura (pasta local) ganha a PRIMEIRA PAGINA como capa. Um por
  // vez, em fila: dez PDFs abrindo juntos travariam a aba justo quando a pessoa
  // esta olhando a estante.
  // Manda pro servidor a capa que acabou de ser desenhada, pra ela ser feita
  // UMA vez e nao uma vez por pessoa por abertura. E "melhor esforco": se der
  // errado, a unica consequencia e a proxima pessoa desenhar de novo, entao
  // nada aqui trava ou avisa.
  async function guardarNoServidor(id, url) {
    try {
      const img = await fetch(url).then((r) => r.blob());
      // O leitor exporta JPEG (uma capa de 150px da ~7 KB). O tipo vai no
      // cabecalho, mas quem decide de verdade e o servidor, pelos bytes.
      if (!img || !img.size || img.size > 400 * 1024) return;
      await fetch('/api/estante/' + encodeURIComponent(id) + '/capa', {
        method: 'POST',
        headers: { 'Content-Type': img.type || 'image/jpeg' },
        body: img,
      });
    } catch (e) { /* proxima pessoa tenta */ }
  }

  function capaDaPagina(el, l) {
    if (capasFeitas.has(l.id)) { porImagem(el, capasFeitas.get(l.id), l); return; }
    filaCapas = filaCapas.then(async () => {
      if (!aberto || !el.isConnected) return;
      try {
        const url = await Leitor.capaDaPrimeiraPagina(l.id, LARGURA_CAPA);
        capasFeitas.set(l.id, url);
        if (el.isConnected) porImagem(el, url, l);
        // `precisaCapa` vem do servidor: so desenha e manda quem ainda nao tem
        // capa guardada la. Sem ele, todo mundo mandaria a mesma capa a cada
        // abertura, de graca.
        if (l.precisaCapa !== false) guardarNoServidor(l.id, url);
      } catch (e) {
        // fica a capa desenhada, que ja esta la
      }
    });
  }

  // Quem esta com este livro aberto agora. Sai da lista de gente do jogo - o
  // servidor manda `lendo` junto com cada pessoa e avisa quando muda.
  function leitoresDe(id) {
    if (!window.Game || !Game.getPlayers) return [];
    const lista = [];
    Game.getPlayers().forEach((p) => {
      if (p.lendo && p.lendo.id === id) lista.push(p);
    });
    // eu primeiro: "Voce" na frente e a informacao mais util da etiqueta
    const meu = window.Game.getSelfId ? Game.getSelfId() : null;
    lista.sort((a, b) => (a.id === meu ? -1 : b.id === meu ? 1 : 0));
    return lista;
  }

  // Etiqueta de "quem esta lendo" na capa. E o que faltava pra estante ser
  // biblioteca da SEDE e nao lista de arquivo: da pra ver que alguem ja esta no
  // livro, e puxar assunto por causa disso.
  function seloDeLeitores(l) {
    const gente = leitoresDe(l.id);
    if (!gente.length) return null;
    const meu = window.Game.getSelfId ? Game.getSelfId() : null;
    const nomes = gente.map((p) => (p.id === meu ? 'Voce' : p.name || 'alguem'));

    const selo = document.createElement('span');
    selo.className = 'estante-lendo';
    selo.textContent = nomes.length === 1
      ? nomes[0]
      : nomes[0] + ' +' + (nomes.length - 1);
    // O title lista todo mundo: com tres ou mais, o "+2" sozinho nao diz quem.
    selo.title = nomes.length === 1
      ? nomes[0] + ' esta lendo'
      : nomes.join(', ') + ' estao lendo';
    return selo;
  }

  function cartaoDeLivro(l) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'estante-capa';
    el.title = l.titulo;
    el.setAttribute('aria-label', 'Ler ' + l.titulo);

    el.appendChild(capaFalsa(l));
    if (l.temCapa) {
      porImagem(el, '/api/estante/' + encodeURIComponent(l.id) + '/capa', l);
    } else if (window.Leitor) {
      capaDaPagina(el, l);
    }

    const faixa = document.createElement('span');
    faixa.className = 'estante-capa-faixa';
    faixa.textContent = l.titulo;
    el.appendChild(faixa);

    const selo = seloDeLeitores(l);
    if (selo) el.appendChild(selo);

    el.addEventListener('click', () => {
      if (window.Leitor) Leitor.abrir(l);
    });
    return el;
  }

  // ---- livro de papel ----

  function quandoFoi(ms) {
    const dias = Math.floor((Date.now() - ms) / 86400000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    return 'ha ' + dias + ' dias';
  }

  function situacao(l) {
    if (!l.emprestimo) return { texto: 'Na sala', classe: 'livre' };
    if (l.emprestimo.uid === fisico.eu) return { texto: 'Com voce', classe: 'meu' };
    return { texto: 'Com ' + String(l.emprestimo.nome || 'alguem').split(' ')[0], classe: 'fora' };
  }

  // A versao em PDF legal do mesmo livro, se estiver na aba Digitais.
  function digitalDe(l) {
    if (!l.digital) return null;
    return dados.livros.find((d) => d.titulo === l.digital) || null;
  }

  function cartaoFisico(l) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'estante-capa estante-fisico';
    el.title = l.titulo + (l.autor ? ' - ' + l.autor : '');
    el.appendChild(capaFalsa(l));

    const s = situacao(l);
    const status = document.createElement('span');
    status.className = 'estante-situacao ' + s.classe;
    status.textContent = s.texto;
    el.appendChild(status);

    if (l.codigo) {
      const etiqueta = document.createElement('span');
      etiqueta.className = 'estante-etiqueta';
      etiqueta.textContent = l.codigo;
      el.appendChild(etiqueta);
    }
    if (l.digital) {
      const pdf = document.createElement('span');
      pdf.className = 'estante-tem-pdf';
      pdf.textContent = 'PDF';
      pdf.title = 'Tambem tem na aba Digitais';
      el.appendChild(pdf);
    }
    el.addEventListener('click', () => abrirDetalhe(l));
    return el;
  }

  function botaoDetalhe(texto, classe, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + classe;
    b.textContent = texto;
    b.addEventListener('click', fn);
    return b;
  }

  function abrirDetalhe(l) {
    if (!detalheEl) return;
    detalheEl.dataset.id = l.id;
    detalheEl.innerHTML = '';

    const topo = document.createElement('div');
    topo.className = 'estante-detalhe-topo';
    const h = document.createElement('h3');
    h.textContent = l.titulo;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'btn-fechar-painel';
    x.setAttribute('aria-label', 'Fechar');
    x.textContent = '✕';
    x.addEventListener('click', fecharDetalhe);
    topo.append(h, x);
    detalheEl.appendChild(topo);

    const meta = document.createElement('p');
    meta.className = 'estante-detalhe-meta';
    meta.textContent = [l.autor, l.setor, l.codigo && 'etiqueta ' + l.codigo].filter(Boolean).join(' · ');
    detalheEl.appendChild(meta);

    const onde = document.createElement('p');
    onde.className = 'estante-detalhe-onde';
    if (!l.emprestimo) {
      onde.textContent = 'Esta na estante da sala.';
    } else {
      const quem = l.emprestimo.uid === fisico.eu ? 'voce' : l.emprestimo.nome;
      onde.textContent = 'Esta com ' + quem + ' desde ' + quandoFoi(l.emprestimo.desde) + '.';
    }
    detalheEl.appendChild(onde);

    if (l.conferir) {
      const aviso = document.createElement('p');
      aviso.className = 'estante-detalhe-conferir';
      aviso.textContent = 'Titulo ou autor lido pela metade na foto da estante - confira no livro.';
      detalheEl.appendChild(aviso);
    }

    const acoes = document.createElement('div');
    acoes.className = 'estante-detalhe-acoes';
    const digital = digitalDe(l);
    if (digital && window.Leitor) {
      acoes.appendChild(botaoDetalhe('Ler o PDF', 'btn-secundario', () => Leitor.abrir(digital)));
    }
    if (!l.emprestimo) {
      acoes.appendChild(botaoDetalhe('Peguei este livro', 'btn-primario', () => emprestar(l, 'pegar')));
    } else if (l.emprestimo.uid === fisico.eu) {
      acoes.appendChild(botaoDetalhe('Devolvi na estante', 'btn-primario', () => emprestar(l, 'devolver')));
    } else if (fisico.podeDevolverDeOutros) {
      acoes.appendChild(botaoDetalhe('Marcar como devolvido', 'btn-secundario', () => emprestar(l, 'devolver')));
    }
    if (acoes.children.length) detalheEl.appendChild(acoes);
    detalheEl.classList.remove('oculto');
  }

  function fecharDetalhe() {
    if (!detalheEl) return;
    detalheEl.classList.add('oculto');
    delete detalheEl.dataset.id;
  }

  function pintarAbas() {
    if (!abasEl) return;
    abasEl.querySelectorAll('[data-aba]').forEach((b) => {
      const ativa = b.dataset.aba === aba;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', ativa ? 'true' : 'false');
      const n = b.querySelector('.estante-aba-n');
      if (n) {
        const qtd = b.dataset.aba === 'sala' ? fisico.livros.length : dados.livros.length;
        n.textContent = qtd ? String(qtd) : '';
      }
    });
  }

  // Setores na ordem em que o servidor mandou (a das pastas), sem setor no fim.
  function agruparPorSetor(livros) {
    const grupos = new Map();
    livros.forEach((l) => {
      const s = l.setor || SEM_SETOR;
      if (!grupos.has(s)) grupos.set(s, []);
      grupos.get(s).push(l);
    });
    if (grupos.has(SEM_SETOR)) {
      const soltos = grupos.get(SEM_SETOR);
      grupos.delete(SEM_SETOR);
      grupos.set(SEM_SETOR, soltos);
    }
    return grupos;
  }

  function botaoDeFiltro(rotulo, valor, quantos) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'estante-filtro' + (filtro === valor ? ' ativo' : '');
    b.setAttribute('aria-pressed', filtro === valor ? 'true' : 'false');
    b.textContent = rotulo;
    const n = document.createElement('span');
    n.className = 'estante-filtro-n';
    n.textContent = quantos;
    b.appendChild(n);
    b.addEventListener('click', () => {
      filtro = valor;
      render();
      gradeEl.scrollTop = 0;
    });
    return b;
  }

  function render() {
    if (!gradeEl) return;
    pintarAbas();

    // Aba "Na sala": a mesma grade, com a lista de papel e o cartao dela.
    const naSala = aba === 'sala';
    const acervo = naSala ? fisico.livros : dados.livros;
    const cartao = naSala ? cartaoFisico : cartaoDeLivro;
    const pronto = naSala ? carregadoFisico : carregado;

    const alvo = achatar(busca);
    const visiveis = acervo.filter((l) => combina(l, alvo));

    // A conta mostra o RECORTE quando ha busca, e nao o acervo inteiro: quem
    // digitou quer saber quantos sobraram.
    contaEl.textContent = !acervo.length ? ''
      : alvo ? visiveis.length + ' de ' + acervo.length
        : acervo.length + (acervo.length === 1 ? ' livro' : ' livros');

    gradeEl.innerHTML = '';
    filtrosEl.innerHTML = '';
    if (!pronto) return;

    // A busca so aparece quando ha acervo - campo de busca em estante vazia e
    // so mais uma caixa pra pessoa olhar sem ter o que fazer.
    if (buscaLinhaEl) buscaLinhaEl.classList.toggle('oculto', !acervo.length);
    if (limparEl) limparEl.classList.toggle('oculto', !busca);

    if (!acervo.length) {
      filtrosEl.classList.add('oculto');
      const vazio = document.createElement('p');
      vazio.className = 'estante-vazia';
      vazio.textContent = naSala ? 'O catalogo da sala ainda esta vazio.' : dados.origem === 'drive'
        ? 'A pasta da biblioteca no Drive ainda nao tem nenhum PDF.'
        : 'Nada na estante ainda.';
      gradeEl.appendChild(vazio);
      return;
    }

    if (!visiveis.length) {
      filtrosEl.classList.add('oculto');
      const nada = document.createElement('p');
      nada.className = 'estante-vazia';
      nada.textContent = 'Nenhum livro com "' + busca.trim() + '".';
      gradeEl.appendChild(nada);
      return;
    }

    // Buscando, os filtros de setor saem: a busca ja atravessa os setores, e
    // deixar os dois ligados ao mesmo tempo gera aquele "sumiu tudo" de quando
    // o filtro e a busca se contradizem.
    if (alvo) {
      filtrosEl.classList.add('oculto');
      const grupos2 = agruparPorSetor(visiveis);
      grupos2.forEach((livros, setor) => {
        const titulo = document.createElement('h3');
        titulo.className = 'estante-setor';
        titulo.textContent = setor;
        gradeEl.appendChild(titulo);
        livros.forEach((l) => gradeEl.appendChild(cartao(l)));
      });
      return;
    }

    const grupos = agruparPorSetor(acervo);
    // Acervo sem subpastas: grade simples, sem titulo nem filtro que nao filtra nada.
    const temSetores = !(grupos.size === 1 && grupos.has(SEM_SETOR));
    filtrosEl.classList.toggle('oculto', !temSetores);
    if (!temSetores) {
      acervo.forEach((l) => gradeEl.appendChild(cartao(l)));
      return;
    }

    // setor que sumiu da pasta desde o ultimo clique: volta pra "Todos"
    if (filtro && !grupos.has(filtro)) filtro = '';
    filtrosEl.appendChild(botaoDeFiltro('Todos', '', acervo.length));
    grupos.forEach((livros, setor) => filtrosEl.appendChild(botaoDeFiltro(setor, setor, livros.length)));

    grupos.forEach((livros, setor) => {
      if (filtro && filtro !== setor) return;
      const titulo = document.createElement('h3');
      titulo.className = 'estante-setor';
      titulo.textContent = setor;
      gradeEl.appendChild(titulo);
      livros.forEach((l) => gradeEl.appendChild(cartao(l)));
    });
  }

  // ------------------------------------------------------------ abrir/fechar

  function abrir() {
    if (!painel || aberto) return;
    aberto = true;
    painel.classList.remove('oculto');
    if (window.Paineis) Paineis.abriu('estante');
    // Desenha o que ja tem e busca de novo: livro que acabou de entrar na pasta
    // precisa aparecer sem recarregar a pagina.
    render();
    buscar();
    buscarFisico();
  }

  function limparBusca() {
    busca = '';
    if (buscaEl) { buscaEl.value = ''; buscaEl.focus(); }
    render();
    if (gradeEl) gradeEl.scrollTop = 0;
  }

  function fechar() {
    if (!painel || !aberto) return;
    aberto = false;
    painel.classList.add('oculto');
    // Reabrir a estante tem que ser reabrir a estante, e nao cair no meio de
    // uma busca que a pessoa fez ha dez minutos e ja esqueceu.
    busca = '';
    filtro = '';
    if (buscaEl) buscaEl.value = '';
    fecharDetalhe();
    if (window.Paineis) Paineis.fechou('estante');
  }
  if (window.Paineis) Paineis.registrar('estante', { fechar, botao: 'btn-estante', esc: false });

  // ------------------------------------------------------------------ init

  function iniciar() {
    painel = document.getElementById('painel-estante');
    if (!painel) return;

    gradeEl = document.getElementById('estante-lista');
    avisoEl = document.getElementById('estante-aviso');
    contaEl = document.getElementById('estante-conta');
    filtrosEl = document.getElementById('estante-filtros');
    buscaEl = document.getElementById('estante-busca');
    buscaLinhaEl = document.getElementById('estante-busca-linha');
    limparEl = document.getElementById('estante-busca-limpar');
    abasEl = document.getElementById('estante-abas');
    detalheEl = document.getElementById('estante-detalhe');

    if (abasEl) {
      abasEl.querySelectorAll('[data-aba]').forEach((b) => {
        b.addEventListener('click', () => {
          if (aba === b.dataset.aba) return;
          aba = b.dataset.aba;
          filtro = '';
          fecharDetalhe();
          avisar('');
          render();
          gradeEl.scrollTop = 0;
        });
      });
    }

    if (buscaEl) {
      buscaEl.addEventListener('input', () => {
        busca = buscaEl.value;
        // Digitar zera o filtro de setor, senao os dois brigam e a estante
        // "esvazia" sem a pessoa entender por que.
        filtro = '';
        render();
        gradeEl.scrollTop = 0;
      });
      // Esc com texto LIMPA a busca; Esc de novo (ou com a busca vazia) fecha o
      // painel. Fechar a estante inteira so porque a pessoa quis desfazer a
      // busca seria passar do ponto.
      buscaEl.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape' || !buscaEl.value) return;
        ev.stopPropagation();
        limparBusca();
      });
    }
    if (limparEl) limparEl.addEventListener('click', limparBusca);

    // Alguem abriu ou fechou um livro: redesenha, mas so com a estante aberta.
    // Sem isto o selo de "quem esta lendo" so apareceria no proximo abrir, e
    // uma informacao que envelhece em segundos nao pode depender disso.
    if (window.Network && Network.on) {
      Network.on('lendo-mudou', () => { if (aberto) render(); });
      Network.on('acervo-fisico-mudou', () => { if (aberto) buscarFisico(); });
    }

    document.getElementById('btn-fechar-estante').addEventListener('click', fechar);
    const botao = document.getElementById('btn-estante');
    if (botao) botao.addEventListener('click', () => (aberto ? fechar() : abrir()));

    if (window.Leitor) Leitor.iniciar();

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !aberto) return;
      // Esc fecha primeiro a ficha do livro; de novo, a estante
      if (detalheEl && !detalheEl.classList.contains('oculto')) fecharDetalhe();
      else fechar();
    });
  }

  window.Estante = { iniciar, abrir, fechar, estaAberta: () => aberto };
})();
