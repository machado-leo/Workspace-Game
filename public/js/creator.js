// Editor de avatar, no formato do Gather: categorias na lateral, grade de
// opcoes e paleta de cores no meio, preview ao vivo do lado.
// As categorias sao as da referencia (30-avatar-cabelo.png): pele, cabelo,
// barba, camisa, jaqueta, calca, sapato, chapeu e oculos. Cada uma tem uma
// grade de FORMAS e uma paleta - antes so cabelo e oculos tinham forma, o
// resto era cor pura, porque so havia uma folha de sprite por camada.
// O nome e a aparencia moram na conta (servidor), nao no navegador: assim o avatar
// segue a pessoa em qualquer maquina. Ver docs/plano-login.md.
(function () {
  // Os catalogos do character.js ja vem com id e nome de cada forma, entao a
  // lista de opcoes sai deles - nao ha uma segunda lista de nomes pra manter
  // em dia aqui.
  const doCatalogo = (lista) => lista.map((peca) => ({ valor: peca.id, rotulo: peca.nome }));
  const ROUPA = () => Character.ROUPA_COLORS;

  const CATEGORIAS = [
    { id: 'skin', nome: 'Pele', campoCor: 'skin', paleta: () => Character.SKIN_TONES },
    {
      id: 'hair', nome: 'Cabelo', campoCor: 'hairColor', paleta: () => Character.HAIR_COLORS,
      campoOpcao: 'hairStyle', opcoes: () => doCatalogo(Character.CABELOS),
    },
    {
      // Sem paleta de proposito: a barba segue a cor do cabelo. Duas cores
      // separadas pra pelo da mesma cabeca so daria trabalho de acertar.
      id: 'barba', nome: 'Barba',
      campoOpcao: 'barba', opcoes: () => doCatalogo(Character.BARBAS),
    },
    {
      id: 'top', nome: 'Camisa', campoCor: 'shirt', paleta: ROUPA,
      campoOpcao: 'topStyle', opcoes: () => doCatalogo(Character.TOPS),
    },
    {
      id: 'jaqueta', nome: 'Jaqueta', campoCor: 'jaquetaColor', paleta: ROUPA,
      campoOpcao: 'jaqueta', opcoes: () => doCatalogo(Character.JAQUETAS),
    },
    {
      id: 'pescoco', nome: 'Pescoco', campoCor: 'pescocoColor', paleta: ROUPA,
      campoOpcao: 'pescoco', opcoes: () => doCatalogo(Character.PESCOCOS),
    },
    {
      id: 'bottom', nome: 'Calca', campoCor: 'bottom', paleta: ROUPA,
      campoOpcao: 'bottomStyle', opcoes: () => doCatalogo(Character.BOTTOMS),
    },
    {
      id: 'shoes', nome: 'Sapato', campoCor: 'shoes', paleta: ROUPA,
      campoOpcao: 'shoesStyle', opcoes: () => doCatalogo(Character.SAPATOS),
    },
    {
      id: 'chapeu', nome: 'Chapeu', campoCor: 'chapeuColor', paleta: ROUPA,
      campoOpcao: 'chapeu', opcoes: () => doCatalogo(Character.CHAPEUS),
    },
    {
      id: 'glasses', nome: 'Oculos', campoCor: 'glassesColor', paleta: ROUPA,
      campoOpcao: 'glasses',
      opcoes: () => [{ valor: false, rotulo: 'Sem' }, { valor: true, rotulo: 'Com' }],
    },
  ];

  let appearance = null;
  let categoriaAtual = CATEGORIAS[0];
  // Da pra voltar ao editor pelo menu da conta, entao esses ficam no modulo: os
  // listeners entram uma vez so e leem sempre o estado da abertura atual.
  let listenersProntos = false;
  let onEntrarAtual = null;
  let previewIntervalId = null;


  // O manequim cinza da referencia (31-avatar-chapeu.png): na grade o boneco
  // sai todo neutro e SO a peca daquela categoria vem colorida. Mostrar o
  // avatar inteiro colorido em cada celula, como eu tinha feito, deixava as
  // opcoes quase identicas - escolher chapeu virava caca as diferencas.
  const MANEQUIM = {
    skin: '#b9bcc4', shirt: '#9aa0ad', bottom: '#888d99', shoes: '#787d8a',
    hairColor: '#9aa0ad', jaquetaColor: '#9aa0ad', chapeuColor: '#9aa0ad',
    pescocoColor: '#9aa0ad', glassesColor: '#9aa0ad',
  };

  // Miniatura da opcao. `neutra` = a da grade, com manequim; sem ela e o seu
  // boneco de verdade, que e o que a lateral de categorias mostra.
  function desenharMiniatura(canvas, variacao, escala, neutra) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cor = neutra && neutra.campoCor
      ? { [neutra.campoCor]: appearance[neutra.campoCor] }
      : null;
    const aparenciaVariante = neutra
      ? Object.assign({}, appearance, MANEQUIM, variacao, cor)
      : Object.assign({}, appearance, variacao);
    Character.draw(ctx, canvas.width / 2, canvas.height - 4, aparenciaVariante, {
      dir: 'down', moving: false, walkTime: 0, scale: escala || 1.05,
    });
  }

  function montarCategorias() {
    const nav = document.getElementById('editor-categorias');
    nav.innerHTML = '';
    CATEGORIAS.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-categoria' + (cat.id === categoriaAtual.id ? ' ativa' : '');

      // miniatura do proprio boneco ao lado do nome, como na referencia
      const mini = document.createElement('canvas');
      mini.width = 30;
      mini.height = 34;
      btn.appendChild(mini);
      Character.ready.then(() => desenharMiniatura(mini, {}, 0.55));

      const rotulo = document.createElement('span');
      rotulo.textContent = cat.nome;
      btn.appendChild(rotulo);

      btn.addEventListener('click', () => {
        categoriaAtual = cat;
        montarCategorias();
        montarPainel();
      });
      nav.appendChild(btn);
    });
  }

  function montarPainel() {
    const grade = document.getElementById('editor-opcoes');
    const paleta = document.getElementById('editor-paleta');
    const cat = categoriaAtual;

    // A grade sempre mostra variacoes do SEU boneco, como no editor do Gather.
    // Categoria com formas mostra as formas; a que so tem cor (pele) mostra uma
    // variacao por cor da paleta. Barba tem forma e nao tem paleta.
    const variacoes = cat.opcoes
      ? cat.opcoes().map((opt) => ({
        rotulo: opt.rotulo,
        variacao: { [cat.campoOpcao]: opt.valor },
        selecionada: appearance[cat.campoOpcao] === opt.valor,
        aplicar: () => { appearance[cat.campoOpcao] = opt.valor; },
      }))
      : cat.paleta().map((cor) => ({
        rotulo: '',
        variacao: { [cat.campoCor]: cor },
        selecionada: appearance[cat.campoCor] === cor,
        aplicar: () => { appearance[cat.campoCor] = cor; },
      }));

    grade.innerHTML = '';
    variacoes.forEach((v) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'editor-opcao' + (v.selecionada ? ' selecionada' : '');

      const mini = document.createElement('canvas');
      mini.width = 56;
      mini.height = 62;
      item.appendChild(mini);

      if (v.rotulo) {
        const rotulo = document.createElement('span');
        rotulo.textContent = v.rotulo;
        item.appendChild(rotulo);
      }

      Character.ready.then(() => desenharMiniatura(mini, v.variacao, undefined, cat));

      item.addEventListener('click', () => {
        v.aplicar();
        montarPainel();
        montarCategorias();
      });
      grade.appendChild(item);
    });

    paleta.innerHTML = '';
    (cat.paleta ? cat.paleta() : []).forEach((cor) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (appearance[cat.campoCor] === cor ? ' selecionado' : '');
      sw.style.background = cor;
      sw.setAttribute('aria-label', cor);
      sw.addEventListener('click', () => {
        appearance[cat.campoCor] = cor;
        montarPainel();
      });
      paleta.appendChild(sw);
    });
  }

  // `conta` e o usuario logado ({ nome, appearance, ... }).
  function init(conta, onEntrar) {
    appearance = Character.resolver((conta && conta.appearance) || Character.randomAppearance());
    onEntrarAtual = onEntrar;

    const inputNome = document.getElementById('input-nome');
    inputNome.value = (conta && conta.nome) || '';

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    let previewTime = 0;

    function renderPreview() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      previewTime += 1 / 60;
      Character.draw(ctx, canvas.width / 2, canvas.height - 26, appearance, {
        dir: 'down', moving: true, walkTime: previewTime * 0.4, scale: 2,
      });
    }
    clearInterval(previewIntervalId);
    previewIntervalId = setInterval(renderPreview, 1000 / 60);

    montarCategorias();
    montarPainel();
    ligarListeners();
  }

  function ligarListeners() {
    if (listenersProntos) return;
    listenersProntos = true;

    const inputNome = document.getElementById('input-nome');
    const botaoPronto = document.getElementById('btn-entrar');

    document.getElementById('btn-aleatorio').addEventListener('click', () => {
      appearance = Character.resolver(Character.randomAppearance());
      montarPainel();
    });

    document.getElementById('form-criador').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nome = inputNome.value.trim();
      if (!nome) {
        inputNome.focus();
        return;
      }

      botaoPronto.disabled = true;
      try {
        // O avatar e do dono da conta: quem manda e o servidor.
        const salvo = await Auth.salvarPerfil({ nome, appearance });
        clearInterval(previewIntervalId);
        onEntrarAtual({ name: salvo.nome, appearance: salvo.appearance });
      } catch (e) {
        alertaSalvar(e.message);
      } finally {
        botaoPronto.disabled = false;
      }
    });
  }

  function alertaSalvar(mensagem) {
    const rodape = document.querySelector('.editor-rodape');
    let aviso = document.getElementById('editor-erro');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = 'editor-erro';
      aviso.className = 'login-erro';
      rodape.appendChild(aviso);
    }
    aviso.textContent = mensagem;
  }

  window.Creator = { init };
})();
