// Grid de chamada estilo Meet/Zoom:
// Permite alternar entre o modo de tela grande (com todas as câmeras compartilhando um espaço amplo)
// e o modo compacto no mapa (com as bolhas de vídeo flutuantes circulares acima dos avatares).
(function () {
  let painel, grade, previewLocal, controlesLocais, selfNomeEl, selfFallback, selfVideo;
  let btnGradeToggle, btnMinimizar, btnDesligarGrade, infoEl;
  let ativo = false;
  let modoGradeManual = false;
  let semCameraTambem = false;
  let emChamadaAnterior = false;
  const tilesRemotos = new Map(); // id -> { el, video, nomeEl, fallback }

  function iniciais(nome) {
    return (nome || '?').trim().slice(0, 2).toUpperCase();
  }

  function montarTileSelf() {
    if (document.getElementById('chamada-tile-self')) return;
    const tile = document.createElement('div');
    tile.className = 'chamada-tile chamada-tile-self';
    tile.id = 'chamada-tile-self';

    selfFallback = document.createElement('div');
    selfFallback.className = 'chamada-fallback oculto';
    tile.appendChild(selfFallback);

    selfVideo = document.createElement('video');
    selfVideo.id = 'video-grade-self';
    selfVideo.autoplay = true;
    selfVideo.muted = true;
    selfVideo.playsInline = true;
    tile.appendChild(selfVideo);

    selfNomeEl = document.createElement('div');
    selfNomeEl.className = 'chamada-nome';
    selfNomeEl.textContent = 'Voce';
    tile.appendChild(selfNomeEl);

    grade.appendChild(tile);
  }

  function garantirTileRemoto(id) {
    let t = tilesRemotos.get(id);
    if (t) return t;

    const el = document.createElement('div');
    el.className = 'chamada-tile';

    const fallback = document.createElement('div');
    fallback.className = 'chamada-fallback oculto';
    el.appendChild(fallback);

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true; // Mudo essencial para nunca bloquear autoplay nem dar eco
    video.playsInline = true;
    el.appendChild(video);

    const nomeEl = document.createElement('div');
    nomeEl.className = 'chamada-nome';
    el.appendChild(nomeEl);

    grade.appendChild(el);
    t = { el, video, nomeEl, fallback };
    tilesRemotos.set(id, t);
    return t;
  }

  function removerTile(id) {
    const t = tilesRemotos.get(id);
    if (!t) return;
    t.el.remove();
    tilesRemotos.delete(id);
  }

  function limparTilesRemotos() {
    tilesRemotos.forEach((t) => t.el.remove());
    tilesRemotos.clear();
  }

  function nomeExibido(player) {
    if (!player) return '...';
    return (player.isAdmin ? '👑 ' : '') + player.name;
  }

  function atualizarFallback(fallback, player) {
    fallback.style.background = (player && player.appearance && player.appearance.skin) || '#3a4a52';
    fallback.textContent = iniciais(player && player.name);
  }

  function atualizar() {
    if (!window.Calls) return;
    const Calls = window.Calls;
    const peers = Calls.getPeersConectados();
    const emChamada = peers.length > 0;

    // Na pagina avulsa de reuniao sem mapa, abre a grade direto
    if (emChamada && !emChamadaAnterior) {
      if (semCameraTambem) {
        modoGradeManual = true;
      }
    }
    emChamadaAnterior = emChamada;

    if (!emChamada) {
      modoGradeManual = false;
    }

    const deveEstarAtivo = emChamada && (modoGradeManual || semCameraTambem);

    if (btnGradeToggle) {
      if (emChamada) {
        btnGradeToggle.classList.remove('oculto');
        btnGradeToggle.classList.toggle('ativo', deveEstarAtivo);
        btnGradeToggle.title = deveEstarAtivo
          ? 'Minimizar chamada para o mapa'
          : 'Abrir chamada em tela grande';
      } else {
        btnGradeToggle.classList.add('oculto');
        btnGradeToggle.classList.remove('ativo');
      }
    }

    if (deveEstarAtivo !== ativo) {
      ativo = deveEstarAtivo;
      alternarVisibilidade();
    }
    if (!ativo) return;

    if (infoEl) {
      if (peers.length === 1) {
        const colega = Calls.jogadorDe ? Calls.jogadorDe(peers[0].id) : null;
        infoEl.textContent = 'Chamada com ' + (colega ? colega.name : '1 colega');
      } else {
        infoEl.textContent = 'Chamada em grupo (' + (peers.length + 1) + ' pessoas)';
      }
    }

    const players = window.Game && window.Game.getPlayers ? Game.getPlayers() : new Map();
    const selfId = window.Game && window.Game.getSelfId ? Game.getSelfId() : null;
    const self = players.get(selfId);
    if (selfNomeEl) selfNomeEl.textContent = nomeExibido(self) + ' (voce)';

    // ---- Tile local (Voce) ----
    const localStream = Calls.getLocalStream ? Calls.getLocalStream() : null;
    const dividindoLocal = Calls.estaDividindoTela && Calls.estaDividindoTela();
    const vTelaLocal = Calls.getVideoTela ? Calls.getVideoTela() : null;

    let localTemVideo = false;
    let streamLocalMostrar = null;

    if (dividindoLocal && vTelaLocal && (vTelaLocal.srcObject || vTelaLocal.readyState >= 2)) {
      streamLocalMostrar = vTelaLocal.srcObject;
      localTemVideo = true;
      if (selfVideo) selfVideo.classList.add('mostrando-tela');
    } else if (Calls.isCameraAtiva && Calls.isCameraAtiva() && localStream) {
      const vTracks = localStream.getVideoTracks ? localStream.getVideoTracks() : [];
      if (vTracks.length > 0 && vTracks.some((tr) => tr.enabled !== false && tr.readyState !== 'ended')) {
        streamLocalMostrar = localStream;
        localTemVideo = true;
      }
      if (selfVideo) selfVideo.classList.remove('mostrando-tela');
    }

    if (selfVideo) {
      if (localTemVideo && streamLocalMostrar) {
        if (selfVideo.srcObject !== streamLocalMostrar) {
          selfVideo.srcObject = streamLocalMostrar;
        }
        selfVideo.play().catch(() => {});
        selfVideo.classList.remove('oculto');
        if (selfFallback) selfFallback.classList.add('oculto');
      } else {
        selfVideo.classList.add('oculto');
        if (selfFallback) {
          atualizarFallback(selfFallback, self);
          selfFallback.classList.remove('oculto');
        }
      }
    }

    // ---- Tiles remotos ----
    const idsAtuais = new Set(peers.map((p) => p.id));
    tilesRemotos.forEach((_, id) => { if (!idsAtuais.has(id)) removerTile(id); });

    peers.forEach((p) => {
      const player = players.get(p.id) || (Calls.jogadorDe && Calls.jogadorDe(p.id));
      const t = garantirTileRemoto(p.id);
      t.nomeEl.textContent = nomeExibido(player);

      const videoRemotoEl = Calls.getVideoRemoto ? Calls.getVideoRemoto(p.id) : null;
      const stream = p.stream || (videoRemotoEl ? videoRemotoEl.srcObject : null);

      if (stream) {
        if (t.video.srcObject !== stream) {
          t.video.srcObject = stream;
        }
        t.video.play().catch(() => {});
      }

      const vTracks = stream && stream.getVideoTracks ? stream.getVideoTracks() : [];
      const temVideoTrack = vTracks.length > 0 && vTracks.some((tr) => tr.enabled !== false && tr.readyState !== 'ended');
      const temVideoAtivo = temVideoTrack || (Calls.temVideoRemoto && Calls.temVideoRemoto(p.id)) || !!(t.video && t.video.videoWidth > 0);

      const remotoDividindo = !!(player && player.dividindoTela);
      t.video.classList.toggle('mostrando-tela', remotoDividindo);

      if (temVideoAtivo && stream) {
        t.video.classList.remove('oculto');
        t.fallback.classList.add('oculto');
      } else {
        t.video.classList.add('oculto');
        atualizarFallback(t.fallback, player);
        t.fallback.classList.remove('oculto');
      }
    });
  }

  function alternarVisibilidade() {
    if (!painel) return;
    painel.classList.toggle('oculto', !ativo);

    const tileSelf = document.getElementById('chamada-tile-self');

    if (ativo) {
      if (previewLocal) previewLocal.style.display = 'none';
      if (tileSelf && controlesLocais) tileSelf.appendChild(controlesLocais);
    } else {
      if (previewLocal) {
        previewLocal.style.display = '';
        if (controlesLocais) previewLocal.appendChild(controlesLocais);
      }
      limparTilesRemotos();
    }
  }

  function estaAtivo() { return ativo; }

  function abrir() {
    modoGradeManual = true;
    atualizar();
  }

  function fechar() {
    modoGradeManual = false;
    atualizar();
  }

  function alternar() {
    modoGradeManual = !ativo;
    atualizar();
  }

  function init(opcoes) {
    semCameraTambem = !!(opcoes && opcoes.semCamera);
    painel = document.getElementById('grade-chamada');
    grade = document.getElementById('grade-chamada-tiles');
    infoEl = document.getElementById('grade-chamada-info');
    previewLocal = document.getElementById('preview-local');
    controlesLocais = document.getElementById('preview-local-controles');
    btnGradeToggle = document.getElementById('btn-grade-toggle');
    btnMinimizar = document.getElementById('btn-minimizar-grade');
    btnDesligarGrade = document.getElementById('btn-desligar-grade');

    if (btnGradeToggle) {
      btnGradeToggle.addEventListener('click', () => alternar());
    }

    if (btnMinimizar) {
      btnMinimizar.addEventListener('click', () => fechar());
    }

    if (btnDesligarGrade) {
      btnDesligarGrade.addEventListener('click', () => {
        if (window.Calls && Calls.desligar) Calls.desligar();
        fechar();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ativo) {
        fechar();
      }
    });

    if (grade) montarTileSelf();
    setInterval(atualizar, 400);
  }

  window.CallGrid = {
    init,
    estaAtivo,
    abrir,
    fechar,
    alternar,
  };
})();
