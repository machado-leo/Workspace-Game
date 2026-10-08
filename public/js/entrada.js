// Tela de entrada: aparece toda vez que a pessoa vai entrar na sede, mesmo ja
// logada, pra conferir camera/microfone e o nome antes de aparecer no mapa
// (e o "Welcome to..." do Gather).
(function () {
  let tela, videoEl, vazioEl, avisoEl, nomeEl, botao;
  let btnMic, btnCamera;
  let stream = null;
  let micLigado = false;
  let cameraLigada = false;
  let aoEntrar = null;
  let aoEditarAvatar = null;

  function aviso(texto) {
    if (!texto) {
      avisoEl.classList.add('oculto');
      return;
    }
    avisoEl.textContent = texto;
    avisoEl.classList.remove('oculto');
  }

  function pintarBotoes() {
    btnMic.classList.toggle('desligado', !micLigado);
    btnCamera.classList.toggle('desligado', !cameraLigada);
    const temImagem = cameraLigada && stream && stream.getVideoTracks().length > 0;
    videoEl.classList.toggle('oculto', !temImagem);
    vazioEl.classList.toggle('oculto', temImagem);
    vazioEl.textContent = cameraLigada
      ? 'Camera indisponivel — voce entra so com audio'
      : 'Sua camera esta desligada';
  }

  // Uma permissao so pros dois: se ja temos stream, e so ligar/desligar a track.
  async function garantirStream(comVideo) {
    if (stream) {
      const temVideo = stream.getVideoTracks().length > 0;
      if (!comVideo || temVideo) return stream;
      // pediu video e o stream atual e so audio: refaz
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: comVideo, audio: true });
      aviso('');
    } catch (e) {
      if (comVideo) {
        // Camera ocupada/sem driver e comum (OBS, Teams aberto...): cai pro audio.
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        aviso('Camera indisponivel (' + e.message + '). Da pra entrar so com audio.');
      } else {
        throw e;
      }
    }
    videoEl.srcObject = stream;
    return stream;
  }

  function pararStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    videoEl.srcObject = null;
  }

  async function alternarCamera() {
    if (cameraLigada) {
      cameraLigada = false;
      if (stream) stream.getVideoTracks().forEach((t) => { t.enabled = false; });
      if (!micLigado) pararStream();
      pintarBotoes();
      return;
    }
    try {
      await garantirStream(true);
      cameraLigada = true;
      stream.getVideoTracks().forEach((t) => { t.enabled = true; });
      stream.getAudioTracks().forEach((t) => { t.enabled = micLigado; });
    } catch (e) {
      aviso('Nao consegui acessar camera nem microfone: ' + e.message);
    }
    pintarBotoes();
  }

  async function alternarMic() {
    if (micLigado) {
      micLigado = false;
      if (stream) stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      if (!cameraLigada) pararStream();
      pintarBotoes();
      return;
    }
    try {
      await garantirStream(cameraLigada);
      micLigado = true;
      stream.getAudioTracks().forEach((t) => { t.enabled = true; });
      stream.getVideoTracks().forEach((t) => { t.enabled = cameraLigada; });
    } catch (e) {
      aviso('Nao consegui acessar o microfone: ' + e.message);
    }
    pintarBotoes();
  }

  async function entrar(ev) {
    ev.preventDefault();
    const nome = nomeEl.value.trim();
    if (!nome) {
      nomeEl.focus();
      return;
    }

    botao.disabled = true;
    try {
      const usuario = await Auth.salvarPerfil({ nome });
      // Passa o stream ja aberto adiante: sem isso o navegador pediria permissao
      // de novo assim que a chamada por proximidade comecasse.
      if (stream && (micLigado || cameraLigada)) {
        Calls.usarStreamDaEntrada(stream, { micAtivo: micLigado, videoAtivo: cameraLigada });
        stream = null; // quem manda nele agora e o Calls
      } else {
        pararStream();
      }
      esconder();
      aoEntrar({ name: usuario.nome, appearance: usuario.appearance });
    } catch (e) {
      aviso(e.message);
    } finally {
      botao.disabled = false;
    }
  }

  function mostrar(conta) {
    tela.classList.remove('oculto');
    nomeEl.value = conta.nome || '';
    document.getElementById('entrada-email').textContent = conta.email || '';
    document.getElementById('entrada-inicial').textContent =
      (conta.nome || '?').trim().slice(0, 1).toUpperCase();
    pintarBotoes();
    nomeEl.focus();
  }

  function esconder() {
    tela.classList.add('oculto');
  }

  function init(callbackEntrar, callbackAvatar) {
    aoEntrar = callbackEntrar;
    aoEditarAvatar = callbackAvatar;

    tela = document.getElementById('tela-entrada');
    videoEl = document.getElementById('entrada-video');
    vazioEl = document.getElementById('entrada-vazio');
    avisoEl = document.getElementById('entrada-aviso');
    nomeEl = document.getElementById('entrada-nome');
    botao = document.getElementById('btn-entrar-sede');
    btnMic = document.getElementById('entrada-btn-mic');
    btnCamera = document.getElementById('entrada-btn-camera');

    btnMic.addEventListener('click', alternarMic);
    btnCamera.addEventListener('click', alternarCamera);
    document.getElementById('form-entrada').addEventListener('submit', entrar);
    document.getElementById('btn-entrada-avatar').addEventListener('click', () => {
      pararStream();
      esconder();
      aoEditarAvatar();
    });
  }

  window.Entrada = { init, mostrar, esconder };
})();
