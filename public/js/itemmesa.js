// Selecao de uma coisa em cima da mesa: clicar nela abre uma barrinha com
// "Mover" e "Excluir". Ver docs/plano-mesa-pessoal.md, secao 12.
//
// Substitui a borracha "tirar o que esta em cima", que era um chute: ela apagava
// a coisa mais perto do clique, entao com duas canecas encostadas voce nunca
// sabia qual ia sair. Aqui voce aponta exatamente qual, e ainda pode so mudar
// ela de lugar em vez de refazer.
(() => {
  let barra, selecionado = null, movendo = false;

  function fechar() {
    selecionado = null;
    movendo = false;
    if (barra) barra.classList.add('oculto');
  }

  function posicionar() {
    if (!selecionado) return;
    const p = Game.pontoNaTela(selecionado.x, selecionado.y);
    if (!p) return;
    const r = barra.getBoundingClientRect();
    const margem = 8;
    // acima da coisa, pra nao tapar o que voce esta olhando
    barra.style.left = Math.min(Math.max(margem, p.x - r.width / 2), window.innerWidth - r.width - margem) + 'px';
    // acima da coisa: a ancora e o meio visual dela, entao sobe meio tile de
    // arte mais a altura da barra
    barra.style.top = Math.max(margem, p.y - r.height - 34) + 'px';
  }

  function selecionar(item) {
    selecionado = item;
    movendo = false;
    barra.classList.remove('oculto');
    posicionar();
  }

  // O jogo pergunta isso todo quadro: quem esta selecionado (pra desenhar o
  // realce) e se estamos no meio de um arrasto.
  function selecaoAtual() {
    return selecionado;
  }

  function estaMovendo() {
    return movendo && !!selecionado;
  }

  // Enquanto move, a coisa acompanha o cursor. So mandamos pro servidor no
  // clique que solta - senao seria um evento por pixel percorrido.
  function arrastarPara(x, y) {
    if (!estaMovendo()) return;
    selecionado.x = x;
    selecionado.y = y;
    posicionar();
  }

  function soltarEm(x, y) {
    if (!estaMovendo()) return false;
    Network.moverItemDaMesa(selecionado.id, x, y);
    fechar();
    Game.redesenharMapa(); // volta a estampar no mapa, ja no lugar novo
    return true;
  }

  function init() {
    barra = document.getElementById('barra-item');
    if (!barra) return;

    document.getElementById('btn-item-mover').addEventListener('click', () => {
      if (!selecionado) return;
      movendo = true;
      barra.classList.add('oculto'); // sai da frente enquanto voce escolhe o lugar
      // O mapa e pre-renderizado: sem redesenhar, a coisa continuaria estampada
      // no lugar antigo enquanto voce a arrasta.
      Game.redesenharMapa();
    });

    document.getElementById('btn-item-excluir').addEventListener('click', () => {
      if (!selecionado) return;
      Network.tirarItemDaMesa(selecionado.id);
      fechar();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fechar();
      // Delete/Backspace tira a coisa selecionada, como em qualquer editor.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecionado && !movendo) {
        Network.tirarItemDaMesa(selecionado.id);
        fechar();
      }
    });
  }

  window.ItemMesa = {
    init, selecionar, fechar, selecaoAtual, estaMovendo, arrastarPara, soltarEm, posicionar,
  };
})();
