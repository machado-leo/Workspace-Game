// Avisos: a sede chama a pessoa quando a aba NAO esta na frente. E cada aviso fica
// guardado na central de avisos (js/central.js).
//
// POR QUE EXISTE
// No dia a dia a sede fica numa aba enquanto a pessoa trabalha no Docs, no CRM,
// no WhatsApp. Sem isto, mensagem direta, mencao e chamada chegavam em silencio
// numa aba escondida - e o time voltava pro WhatsApp na primeira semana. Era o
// maior buraco pra uso diario.
//
// O QUE AVISA (e o que nao)
//   - mensagem direta pra mim
//   - mencao: "@Nome" num canal
//   - alguem comecou chamada num canal (o convite com botao "Entrar")
//   - alguem chegou perto e a chamada abriu enquanto eu estava em outra aba
// NAO avisa mensagem comum de canal: um #geral movimentado viraria sirene, e a
// pessoa desligaria os avisos - perdendo tambem os que importam.
//
// COMO AVISA
//   - titulo da aba "(3) ..." ate a pessoa voltar pra aba
//   - som curto (desligavel no menu da conta)
//   - notificacao do sistema, so com a aba escondida e so se a pessoa deixou
// A permissao do navegador e pedida por um BOTAO, nunca sozinha no carregamento:
// pedido sem gesto o Chrome silencia, e a pessoa nega por reflexo.
(function () {
  const TITULO = document.title;
  const CHAVE_SOM = 'avisos:som';
  const CHAVE_DISPENSOU = 'avisos:dispensou-permissao';
  const INTERVALO_CHAMADA_MS = 60 * 1000;  // uma notificacao de chamada por minuto, no maximo

  let pendentes = 0;           // avisos desde que a aba saiu da frente
  let ultimoAvisoChamada = 0;
  let audio = null;
  let iniciado = false;

  // ------------------------------------------------------------ utilidades

  function abaNaFrente() {
    return !document.hidden && document.hasFocus();
  }

  function somLigado() {
    try { return localStorage.getItem(CHAVE_SOM) !== 'desligado'; } catch (e) { return true; }
  }

  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function meuNome() {
    const eu = Game.getPlayers().get(Game.getSelfId());
    return eu ? eu.name : '';
  }

  // "@Ana" ou "@Ana Clara" pra quem se chama Ana Clara. Sem acento e sem caixa:
  // quem digita "@joao" quer chamar o Joao.
  function meMencionou(texto) {
    const nome = semAcento(meuNome()).trim();
    if (!nome) return false;
    const t = semAcento(texto);
    const primeiro = nome.split(/\s+/)[0];
    const alvo = (n) => new RegExp('@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])').test(t);
    return alvo(nome) || alvo(primeiro);
  }

  // ------------------------------------------------------------------ som

  // Dois tons curtos gerados na hora: nenhum arquivo pra baixar, e volume baixo
  // o bastante pra nao assustar quem esta de fone.
  function tocar() {
    if (!somLigado()) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const agora = audio.currentTime;
      [[880, 0], [1318.5, 0.11]].forEach(([freq, atraso]) => {
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        vol.gain.setValueAtTime(0, agora + atraso);
        vol.gain.linearRampToValueAtTime(0.08, agora + atraso + 0.015);
        vol.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.28);
        osc.connect(vol).connect(audio.destination);
        osc.start(agora + atraso);
        osc.stop(agora + atraso + 0.3);
      });
    } catch (e) { /* navegador sem audio: fica o titulo e a notificacao */ }
  }

  // --------------------------------------------------------------- titulo

  function pintarTitulo() {
    document.title = pendentes > 0 ? '(' + (pendentes > 9 ? '9+' : pendentes) + ') ' + TITULO : TITULO;
  }

  // ---------------------------------------------------------- notificacao

  function podeNotificar() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  // Desktop aceita `new Notification`; Android nao (so pelo service worker). Tenta
  // o simples e cai pro service worker. O clique traz a aba pra frente e abre a
  // conversa - o sw.js repassa o clique pra ca quando a notificacao veio dele.
  function notificar(titulo, corpo, dados) {
    if (!podeNotificar()) return;
    const opcoes = {
      body: corpo,
      icon: '/icones/icone-192.png',
      tag: dados.tag,            // mesma conversa substitui a anterior, nao empilha
      renotify: true,
      data: dados,
    };
    try {
      const n = new Notification(titulo, opcoes);
      n.onclick = () => { window.focus(); agir(dados); n.close(); };
    } catch (e) {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(titulo, opcoes)).catch(() => {});
      }
    }
  }

  function agir(dados) {
    if (dados && dados.conversa && window.Chat) Chat.abrir(dados.conversa);
  }

  function avisar(titulo, corpo, dados) {
    const naFrente = abaNaFrente();
    // Com a aba na frente e a conversa aberta na tela, a pessoa ja esta vendo.
    if (naFrente && dados.conversa && window.Chat && Chat.estaVendo(dados.conversa)) return;
    // O que tocou fica guardado na central (js/central.js): o som passa, o aviso fica.
    if (window.Central) Central.guardar(titulo, corpo, dados);
    tocar();
    if (naFrente) return;       // na frente: o som e o badge do chat bastam
    pendentes++;
    pintarTitulo();
    notificar(titulo, corpo, dados);
  }

  // ------------------------------------------------------------- eventos

  function aoChegarMensagem(msg) {
    if (!msg || !msg.conversa) return;
    const eu = Game.getSelfUid();
    const nomeConversa = window.Chat && Chat.nomeDaConversa ? Chat.nomeDaConversa(msg.conversa) : '';

    // convite de chamada no canal (mensagem de sistema com botao "Entrar")
    if (msg.sistema) {
      if (msg.chamada && !(window.Chamada && Chamada.estouEm() && Chamada.estouEm().id === msg.chamada)) {
        avisar('Chamada no #' + nomeConversa, msg.texto, { conversa: msg.conversa, tag: 'chamada:' + msg.chamada });
      }
      return;
    }
    if (!msg.autorId || msg.autorId === eu) return;

    const texto = String(msg.texto || '').slice(0, 140);
    if (String(msg.conversa).startsWith('dm:')) {
      avisar(msg.autorNome, texto, { conversa: msg.conversa, tag: msg.conversa });
    } else if (meMencionou(msg.texto)) {
      avisar(msg.autorNome + ' mencionou voce em #' + nomeConversa, texto, { conversa: msg.conversa, tag: msg.conversa });
    }
  }

  function aoConectarChamada(ev) {
    // Quem entrou numa chamada marcada escolheu estar ali: nao precisa de aviso
    // a cada pessoa que chega. E com a aba na frente a pessoa ve a chamada abrir.
    if (abaNaFrente()) return;
    if (window.Chamada && Chamada.estouEm()) return;
    const agora = Date.now();
    if (agora - ultimoAvisoChamada < INTERVALO_CHAMADA_MS) return;
    ultimoAvisoChamada = agora;
    const p = Game.getPlayers().get(ev.detail && ev.detail.id);
    avisar((p ? p.name : 'Alguem') + ' esta falando com voce', 'Chegou perto de voce na sede.', { tag: 'proximidade' });
  }

  // ------------------------------------------------------ permissao e menu

  function oferecerPermissao() {
    const faixa = document.getElementById('aviso-permissao');
    if (!faixa || !('Notification' in window) || Notification.permission !== 'default') return;
    try { if (localStorage.getItem(CHAVE_DISPENSOU)) return; } catch (e) { /* segue */ }
    faixa.classList.remove('oculto');
    document.getElementById('btn-permitir-avisos').addEventListener('click', async () => {
      faixa.classList.add('oculto');
      try { await Notification.requestPermission(); } catch (e) { /* navegador antigo */ }
      tocar();   // de quebra "destrava" o audio com o gesto da pessoa
    }, { once: true });
    document.getElementById('btn-dispensar-avisos').addEventListener('click', () => {
      faixa.classList.add('oculto');
      try { localStorage.setItem(CHAVE_DISPENSOU, '1'); } catch (e) { /* segue */ }
    }, { once: true });
  }

  function pintarBotaoSom() {
    const b = document.getElementById('btn-som-avisos');
    if (!b) return;
    b.querySelector('span').textContent = somLigado() ? 'Silenciar avisos sonoros' : 'Ligar avisos sonoros';
  }

  function init() {
    if (iniciado) return;
    iniciado = true;

    Network.on('chat-mensagem', aoChegarMensagem);
    window.addEventListener('sede:chamada-conectou', aoConectarChamada);

    const voltou = () => {
      if (!abaNaFrente()) return;
      pendentes = 0;
      pintarTitulo();
    };
    document.addEventListener('visibilitychange', voltou);
    window.addEventListener('focus', voltou);

    // clique na notificacao que veio pelo service worker (Android, app instalado)
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data && ev.data.tipo === 'notificacao-clicada') agir(ev.data.dados);
      });
    }

    const botaoSom = document.getElementById('btn-som-avisos');
    if (botaoSom) {
      pintarBotaoSom();
      botaoSom.addEventListener('click', () => {
        try { localStorage.setItem(CHAVE_SOM, somLigado() ? 'desligado' : 'ligado'); } catch (e) { /* segue */ }
        pintarBotaoSom();
        if (somLigado()) tocar();   // amostra do som que acabou de ligar
      });
    }

    setTimeout(oferecerPermissao, 2500);
  }

  window.Avisos = { init, avisar, _meMencionou: meMencionou };
})();
