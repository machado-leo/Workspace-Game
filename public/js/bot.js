// Bot de teste: uma segunda pessoa na sede, pra dar pra testar sozinho.
//
// POR QUE EXISTE
// Chamada por proximidade, divisao de tela e conversa precisam de DUAS pessoas.
// Sozinho nao da pra ver se a camera do outro abre, se a tela dividida chega do
// outro lado, se a mensagem aparece. Abrir `/?bot=1` numa segunda aba resolve.
//
// COMO FUNCIONA
// Nao e um cliente separado: e o JOGO INTEIRO, com tres coisas por cima.
// Escrever um cliente proprio pro bot seria escrever um segundo cliente que
// descola do primeiro na primeira mudanca - e ai o bot passaria a testar a si
// mesmo em vez de testar a sede.
//
//   1. a camera vira um video sintetico (a sua webcam continua livre pra voce);
//   2. a tela de entrada e preenchida e enviada sozinha;
//   3. o boneco anda de tempos em tempos, pra dar pra testar a aproximacao.
//
// So funciona com SEM_LOGIN ligado (`npm run dev`). O servidor recusa a conta de
// bot fora disso, e SEM_LOGIN nunca liga em producao.
(function () {
  if (new URLSearchParams(location.search).get('bot') !== '1') return;

  const PASSO_MS = 7000; // de quanto em quanto tempo o bot escolhe outro lugar

  // ------------------------------------------------------- camera de mentira
  // Um canvas animado no lugar da webcam. Precisa MEXER: um quadro parado nao
  // prova nada - o video podia estar congelado e ninguem notaria.
  function camerasFalsas() {
    const cv = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
    const ctx = cv.getContext('2d');
    let t = 0;
    // setInterval, e nao requestAnimationFrame: o rAF PARA quando a aba vai pro
    // segundo plano, o canvas congela e o `captureStream` degenera pra 2x2 - do
    // outro lado o quadro do bot vira um bloco de cor. Com relogio, a aba
    // escondida so desacelera (~1 quadro/s), e o video continua vivo.
    setInterval(function pintar() {
      t += 0.12;
      ctx.fillStyle = '#1d2433';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#e0607e';
      ctx.beginPath();
      ctx.arc(160 + Math.cos(t) * 70, 120 + Math.sin(t * 1.3) * 45, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eceaf4';
      ctx.font = 'bold 34px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BOT', 160, 210);
      ctx.font = '15px ui-monospace, monospace';
      ctx.fillStyle = '#8b91a4';
      ctx.fillText(new Date().toLocaleTimeString(), 160, 34);
    }, 80);

    const stream = cv.captureStream(12);
    // Uma faixa de audio muda, pra chamada nascer com video E audio como a de
    // uma pessoa de verdade. Volume zero: ninguem quer um apito no teste.
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const ganho = ac.createGain();
      ganho.gain.value = 0;
      const destino = ac.createMediaStreamDestination();
      const osc = ac.createOscillator();
      osc.connect(ganho).connect(destino);
      osc.start();
      destino.stream.getAudioTracks().forEach((faixa) => stream.addTrack(faixa));
    } catch (e) {
      /* sem audio: o video sozinho ja serve pro teste */
    }
    return stream;
  }

  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (pedido) => {
    const stream = camerasFalsas();
    // Respeita o que foi pedido: se pediram so audio, nao devolve video.
    if (pedido && pedido.video === undefined) {
      stream.getVideoTracks().forEach((faixa) => { stream.removeTrack(faixa); faixa.stop(); });
    }
    return stream;
  };
  navigator.mediaDevices.getUserMedia.original = original;

  // ------------------------------------------------------------- entrar so
  function esperarPor(acharElemento, aoAchar, tentativas = 120) {
    const alvo = acharElemento();
    if (alvo) return aoAchar(alvo);
    if (tentativas <= 0) return;
    setTimeout(() => esperarPor(acharElemento, aoAchar, tentativas - 1), 250);
  }

  esperarPor(
    () => {
      const tela = document.getElementById('tela-entrada');
      const botao = document.getElementById('btn-entrar-sede');
      return tela && !tela.classList.contains('oculto') && botao ? botao : null;
    },
    (botao) => {
      const nome = document.getElementById('entrada-nome');
      if (nome && !nome.value.trim()) nome.value = 'Bot';
      // Liga a camera antes de entrar: assim o stream ja vai pronto pro Calls e
      // a chamada por proximidade tem video desde o primeiro encontro.
      const btnCamera = document.getElementById('entrada-btn-camera');
      if (btnCamera) btnCamera.click();
      setTimeout(() => botao.click(), 900);
    }
  );

  // --------------------------------------------------------------- andar so
  //
  // PARADO por padrao. A primeira versao andava sozinha a cada 7s e era inutil
  // pra testar: voce caminhava ate ele, ele saia andando, e voce passava o teste
  // inteiro correndo atras. Quem testa quer um alvo parado.
  //
  // Pra ver movimento (util pra conferir a saida da chamada quando alguem se
  // afasta), abra com `/?bot=1&andar=1`.
  const ANDA = new URLSearchParams(location.search).get('andar') === '1';

  function tileLivreAoAcaso() {
    const M = window.OfficeMap;
    for (let tentativa = 0; tentativa < 200; tentativa++) {
      const c = Math.floor(Math.random() * M.COLS);
      const r = Math.floor(Math.random() * M.ROWS);
      if (!M.isTileWalkable(c, r)) continue;
      const sala = M.getRoomAtTile(c, r);
      if (!sala || sala.id === 'jardim') continue; // fica dentro do predio
      return { c, r };
    }
    return null;
  }

  esperarPor(
    () => (window.Game && window.Game.moverPara && window.OfficeMap ? window.Game : null),
    (Game) => {
      if (!ANDA) {
        console.log('[bot] na sede, PARADO. Chegue perto pra abrir a chamada.');
        console.log('[bot] pra ele andar: /?bot=1&andar=1');
        return;
      }
      setInterval(() => {
        const alvo = tileLivreAoAcaso();
        if (alvo) Game.moverPara((alvo.c + 0.5) * 32, (alvo.r + 0.5) * 32);
      }, PASSO_MS);
      console.log('[bot] na sede, andando a cada ' + (PASSO_MS / 1000) + 's.');
    }
  );

  // Deixa claro na aba qual e qual, pra nao confundir as duas janelas abertas.
  document.title = '[BOT] ' + document.title;
})();
