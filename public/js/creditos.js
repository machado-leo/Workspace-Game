// Mostra os CREDITS.md da arte como pagina. Ver public/creditos.html.
//
// Le os arquivos na hora, em vez de copiar o texto: a lista de creditos e UMA
// so (a que o testes/roupas.js confere), e uma copia aqui desatualizaria na
// primeira roupa nova.
//
// O markdown e simples (titulos, paragrafos, tabelas, `codigo`, **negrito** e
// links), entao o leitor e pequeno. Tudo entra com textContent - nada de
// innerHTML com texto do arquivo -, e link so vira link se for http(s).
(function () {
  const FONTES = [
    { titulo: 'Bonecos e roupas', arquivo: '/assets/lpc/CREDITS.md' },
    { titulo: 'Moveis e cenario', arquivo: '/assets/lpc-moveis/CREDITS.md' },
  ];

  // `codigo`, **negrito** e [texto](url) dentro de uma linha.
  function trechoInline(texto, pai) {
    const padrao = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
    let ultimo = 0;
    let m;
    while ((m = padrao.exec(texto))) {
      if (m.index > ultimo) pai.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
      const pedaco = m[0];
      if (pedaco.startsWith('`')) {
        const el = document.createElement('code');
        el.textContent = pedaco.slice(1, -1);
        pai.appendChild(el);
      } else if (pedaco.startsWith('**')) {
        const el = document.createElement('strong');
        el.textContent = pedaco.slice(2, -2);
        pai.appendChild(el);
      } else {
        const partes = pedaco.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (partes && /^https?:\/\//.test(partes[2])) {
          const a = document.createElement('a');
          a.href = partes[2];
          a.textContent = partes[1];
          a.target = '_blank';
          a.rel = 'noopener';
          pai.appendChild(a);
        } else {
          pai.appendChild(document.createTextNode(partes ? partes[1] : pedaco));
        }
      }
      ultimo = m.index + pedaco.length;
    }
    if (ultimo < texto.length) pai.appendChild(document.createTextNode(texto.slice(ultimo)));
  }

  function celulas(linha) {
    return linha.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  function renderizar(md, destino) {
    const linhas = md.replace(/\r/g, '').split('\n');
    let paragrafo = [];
    const fecharParagrafo = () => {
      if (!paragrafo.length) return;
      const p = document.createElement('p');
      trechoInline(paragrafo.join(' '), p);
      destino.appendChild(p);
      paragrafo = [];
    };

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      if (/^#{1,3}\s/.test(linha)) {
        fecharParagrafo();
        const nivel = linha.match(/^#+/)[0].length;
        const h = document.createElement(nivel === 1 ? 'h2' : 'h3');
        trechoInline(linha.replace(/^#+\s*/, ''), h);
        destino.appendChild(h);
      } else if (/^\s*\|/.test(linha)) {
        fecharParagrafo();
        // tabela: cabecalho, separador (|---|), e as linhas
        const tabela = document.createElement('table');
        const cab = document.createElement('tr');
        celulas(linha).forEach((c) => {
          const th = document.createElement('th');
          trechoInline(c, th);
          cab.appendChild(th);
        });
        tabela.appendChild(cab);
        if (linhas[i + 1] && /^\s*\|\s*-/.test(linhas[i + 1])) i++;
        while (linhas[i + 1] && /^\s*\|/.test(linhas[i + 1])) {
          i++;
          const tr = document.createElement('tr');
          celulas(linhas[i]).forEach((c) => {
            const td = document.createElement('td');
            trechoInline(c, td);
            tr.appendChild(td);
          });
          tabela.appendChild(tr);
        }
        const caixa = document.createElement('div');
        caixa.className = 'creditos-tabela';
        caixa.appendChild(tabela);
        destino.appendChild(caixa);
      } else if (/^>\s?/.test(linha)) {
        fecharParagrafo();
        const q = document.createElement('blockquote');
        trechoInline(linha.replace(/^>\s?/, ''), q);
        destino.appendChild(q);
      } else if (!linha.trim()) {
        fecharParagrafo();
      } else {
        paragrafo.push(linha.trim());
      }
    }
    fecharParagrafo();
  }

  async function carregar() {
    const alvo = document.getElementById('creditos-conteudo');
    alvo.innerHTML = '';
    for (const f of FONTES) {
      const secao = document.createElement('section');
      secao.className = 'creditos-secao';
      const h = document.createElement('h2');
      h.className = 'creditos-grupo';
      h.textContent = f.titulo;
      secao.appendChild(h);
      try {
        const r = await fetch(f.arquivo, { cache: 'no-store' });
        if (!r.ok) throw new Error('resposta ' + r.status);
        renderizar(await r.text(), secao);
      } catch (e) {
        const p = document.createElement('p');
        p.textContent = 'Nao consegui carregar ' + f.arquivo + ' (' + e.message + ').';
        secao.appendChild(p);
      }
      alvo.appendChild(secao);
    }
  }

  carregar();
})();
