(function () {
  // player_id -> YT.Player (o iframe tocando a musica dele)
  const playersYT = new Map();
  let scriptCarregado = false;
  let apiPronta = false;

  function carregarAPI() {
    if (scriptCarregado) return;
    scriptCarregado = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    
    // O YouTube chama essa funcao global quando a API ta pronta
    window.onYouTubeIframeAPIReady = () => {
      apiPronta = true;
      // se alguem mandou tocar antes de carregar, toca agora
      playersYT.forEach((info, id) => {
        if (!info.player && info.videoId) tocarPara(id, info.videoId);
      });
    };
  }

  function criarContainer(id) {
    let div = document.getElementById('yt-container-' + id);
    if (!div) {
      div = document.createElement('div');
      div.id = 'yt-container-' + id;
      // Totalmente invisivel, mas presente no DOM pra tocar o som
      div.style.position = 'absolute';
      div.style.width = '1px';
      div.style.height = '1px';
      div.style.opacity = '0';
      div.style.pointerEvents = 'none';
      div.style.overflow = 'hidden';
      // div.style.display = 'none'; // se der display: none o youtube pode recusar a tocar
      document.body.appendChild(div);
      
      const frameHolder = document.createElement('div');
      frameHolder.id = 'yt-player-' + id;
      div.appendChild(frameHolder);
    }
    return 'yt-player-' + id;
  }

  function tocarPara(id, videoId) {
    if (!videoId) {
      pararPara(id);
      return;
    }

    if (!scriptCarregado) carregarAPI();

    let info = playersYT.get(id);
    if (!info) {
      info = { videoId: videoId, player: null };
      playersYT.set(id, info);
    } else {
      if (info.videoId === videoId && info.player) return; // ja ta tocando
      info.videoId = videoId;
    }

    if (!apiPronta) return; // espera o callback

    if (info.player) {
      info.player.loadVideoById(videoId);
    } else {
      const elId = criarContainer(id);
      info.player = new YT.Player(elId, {
        height: '100',
        width: '100',
        videoId: videoId,
        playerVars: {
          'playsinline': 1,
          'controls': 0,
          'disablekb': 1,
          'fs': 0,
          'rel': 0,
          'modestbranding': 1,
          // 'autoplay': 1 // IFrame API method loadVideoById ja faz autoplay
        },
        events: {
          'onReady': (ev) => {
            ev.target.setVolume(0); // comeca mudo ate calcular
            ev.target.playVideo();
          },
          'onStateChange': (ev) => {
            // Se o video acabar, ou dar erro, podemos tratar
            if (ev.data === YT.PlayerState.ENDED) {
               // loop? ev.target.playVideo();
            }
          }
        }
      });
    }
  }

  function pararPara(id) {
    const info = playersYT.get(id);
    if (info) {
      if (info.player && info.player.destroy) info.player.destroy();
      playersYT.delete(id);
    }
    const div = document.getElementById('yt-container-' + id);
    if (div) div.remove();
  }

  // Funcao que ajusta o volume (chamada a cada quadro pelo game.js)
  // Reutilizamos o volumePara(dist, alcance) de Calls.
  // 1 tile = OfficeMap.TILE. Vamos usar 9 tiles como alcance de som (som ambiente bem amplo)
  function atualizarVolumes(idLocal, todosPlayers, getVolumeLogic) {
    if (!apiPronta) return;

    const selfPlayer = todosPlayers.get(idLocal);
    if (!selfPlayer) return;

    playersYT.forEach((info, id) => {
      if (!info.player || typeof info.player.setVolume !== 'function') return;
      
      if (id === idLocal) {
         // O seu proprio boombox! Toca no volume medio pra nao te deixar surdo,
         // ou 100% se quiser.
         info.player.setVolume(30);
         return;
      }

      const p = todosPlayers.get(id);
      if (!p) {
        pararPara(id); // saiu da sede
        return;
      }

      // getVolumeLogic e a mesma de calls.js: dist, alcance (9 * TILE)
      // Ex: getVolumeLogic(Math.hypot(p.x - self.x, p.y - self.y), 9.0 * 32)
      const dist = Math.hypot(p.displayX - selfPlayer.displayX, p.displayY - selfPlayer.displayY);
      const volume = getVolumeLogic(dist); 
      info.player.setVolume(Math.round(volume * 100));
    });
  }

  // Extrair ID de https://www.youtube.com/watch?v=dQw4w9WgXcQ, shorts ou ID direto
  function parseLink(url) {
    if (!url || typeof url !== 'string') return null;
    const limpo = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(limpo)) return limpo;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = limpo.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  window.Youtube = {
    tocarPara, pararPara, atualizarVolumes, parseLink
  };
})();
