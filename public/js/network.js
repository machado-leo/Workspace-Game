// Fina camada sobre o cliente Socket.io.
(function () {
  let socket = null;
  const listeners = {};

  function emitLocal(event, data) {
    (listeners[event] || []).forEach((cb) => cb(data));
  }

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function connect(profile) {
    // `?bot=1` entra como a segunda conta de desenvolvimento, pra dar pra testar
    // chamada e divisao de tela sozinho. O servidor so aceita isso com
    // SEM_LOGIN ligado, que nunca liga em producao. Ver public/js/bot.js.
    const ehBot = new URLSearchParams(location.search).get('bot') === '1';
    socket = io({
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      query: ehBot ? { bot: '1' } : {},
    });

    socket.on('connect', () => {
      emitLocal('conexao', 'conectado');
      socket.emit('join', profile);
    });
    socket.on('disconnect', () => emitLocal('conexao', 'desconectado'));
    socket.io.on('reconnect_attempt', () => emitLocal('conexao', 'reconectando'));
    socket.on('connect_error', (erro) => {
      // Sessao caiu (expirou ou saiu em outra aba): volta pro login em vez de
      // ficar tentando reconectar pra sempre.
      if (erro && erro.message === 'sem-sessao') {
        socket.close();
        location.reload();
        return;
      }
      emitLocal('conexao', 'reconectando');
    });

    // A diretoria removeu a conta ou redefiniu a senha: o servidor derruba o
    // socket e nao ha o que reconectar. Guarda o motivo pra tela de login dizer
    // o que aconteceu, em vez de a pessoa cair no login sem entender.
    socket.on('conta-encerrada', (data) => {
      try { sessionStorage.setItem('aviso-login', (data && data.motivo) || ''); } catch (e) { /* sem storage */ }
      socket.close();
      location.reload();
    });

    socket.on('init', (data) => emitLocal('init', data));
    socket.on('player-joined', (data) => emitLocal('player-joined', data));
    socket.on('player-left', (data) => emitLocal('player-left', data));
    socket.on('player-moved', (data) => emitLocal('player-moved', data));
    // O servidor novo manda as posicoes em pacote (uma mensagem por ciclo, com
    // quem mudou). Cada uma segue pelo mesmo caminho da mensagem avulsa.
    socket.on('players-moved', (lista) => {
      if (Array.isArray(lista)) lista.forEach((data) => emitLocal('player-moved', data));
    });
    socket.on('player-status', (data) => emitLocal('player-status', data));
    socket.on('reacao', (data) => emitLocal('reacao', data));
    socket.on('aceno', (data) => emitLocal('aceno', data));
    socket.on('rtc-signal', (data) => emitLocal('rtc-signal', data));
    socket.on('chat-mensagem', (data) => emitLocal('chat-mensagem', data));
    socket.on('chat-historico', (data) => emitLocal('chat-historico', data));
    socket.on('chat-reacao', (data) => emitLocal('chat-reacao', data));
    socket.on('mesas-atualizadas', (data) => emitLocal('mesas-atualizadas', data));
    socket.on('mapa-atualizado', (data) => emitLocal('mapa-atualizado', data));
    socket.on('mapa-objeto-atualizado', (data) => emitLocal('mapa-objeto-atualizado', data));
    socket.on('mapa-area-atualizada', (data) => emitLocal('mapa-area-atualizada', data));
    socket.on('mapa-area-criada', (data) => emitLocal('mapa-area-criada', data));
    socket.on('mapa-area-apagada', (data) => emitLocal('mapa-area-apagada', data));
    socket.on('mapa-area-recusada', (data) => emitLocal('mapa-area-recusada', data));
    socket.on('tela-mudou', (data) => emitLocal('tela-mudou', data));
    socket.on('lendo-mudou', (data) => emitLocal('lendo-mudou', data));
    socket.on('mapa-conteudo-atualizado', (data) => emitLocal('mapa-conteudo-atualizado', data));
    socket.on('mapa-conteudo-recusado', (data) => emitLocal('mapa-conteudo-recusado', data));
    socket.on('agenda', (data) => emitLocal('agenda', data));
    socket.on('reunioes', (data) => emitLocal('reunioes', data));
    socket.on('reuniao-recusada', (data) => emitLocal('reuniao-recusada', data));
    socket.on('chamada-mudou', (data) => emitLocal('chamada-mudou', data));
    socket.on('chamadas', (data) => emitLocal('chamadas', data));
    socket.on('visitantes-mudou', (data) => emitLocal('visitantes-mudou', data));
    socket.on('trello', (data) => emitLocal('trello', data));
    socket.on('prazos', (data) => emitLocal('prazos', data));
    socket.on('acervo-fisico-mudou', (data) => emitLocal('acervo-fisico-mudou', data));
  }

  function sendMove(state) {
    if (socket && socket.connected) socket.emit('move', state);
  }

  // Tamanho da tela em pixels do mapa: o servidor usa pra mandar a posicao de
  // quem esta na tela com frequencia, e a de quem esta longe devagar.
  function enviarVista(vista) {
    if (socket && socket.connected) socket.emit('vista', vista);
  }

  function sendStatus(status) {
    if (socket && socket.connected) socket.emit('status', { status });
  }

  // Avisa a sede que comecei (ou parei) de dividir a tela. Sem este aviso o
  // resto do escritorio nao tem como saber: a tela dividida so TROCA a faixa de
  // video do WebRTC, e isso acontece calado dentro da conexao. E e o aviso que
  // deixa a TV da sala de reuniao espelhar quem esta apresentando.
  function dividirTela(ligado) {
    if (socket && socket.connected) socket.emit('tela', { ligado: !!ligado });
  }

  // Abri (ou fechei) um livro no leitor. Manda so o ID - o titulo quem resolve
  // e o servidor, contra o acervo dele. Ver o porque em server/index.js.
  function estouLendo(id) {
    if (socket && socket.connected) socket.emit('lendo', { id: id || '' });
  }

  // Reunioes internas da sede. O titulo e a sala sao conferidos no servidor -
  // ver server/reunioes.js.
  function marcarReuniao(dados) {
    if (socket && socket.connected) socket.emit('reuniao-marcar', dados);
  }

  function desmarcarReuniao(id) {
    if (socket && socket.connected) socket.emit('reuniao-desmarcar', { id });
  }

  // O link que vazou para de abrir e um novo vale no lugar. So quem marcou ou a
  // diretoria; o servidor confere.
  function novoLinkDaReuniao(id) {
    if (socket && socket.connected) socket.emit('reuniao-novo-link', { id });
  }

  // Quem de fora pediu pra entrar na reuniao: quem esta na chamada admite ou
  // recusa, e pode tirar quem ja entrou. Ver public/js/visitantes.js.
  function decidirVisitante(id, admitir) {
    if (socket && socket.connected) socket.emit('visitante-decidir', { id, admitir: !!admitir });
  }

  function removerVisitante(id) {
    if (socket && socket.connected) socket.emit('visitante-remover', { id });
  }

  // Chamada com hora marcada: entra de qualquer canto do mapa, ao contrario da
  // chamada de corredor, que e por proximidade. Ver server/index.js.
  function entrarNaChamada(id) {
    if (socket && socket.connected) socket.emit('chamada-entrar', { id });
  }

  function sairDaChamada() {
    if (socket && socket.connected) socket.emit('chamada-sair');
  }

  // Comeca uma chamada do grupo e CONVIDA o canal - nao arrasta ninguem.
  function ligarProGrupo(canal) {
    if (socket && socket.connected) socket.emit('chamada-chamar-grupo', { canal });
  }

  function sendReaction(emoji) {
    if (socket && socket.connected) socket.emit('reagir', { emoji });
  }

  // Aceno pra UMA pessoa (so ela recebe). Mesmo contrato do sendChatMessage:
  // false sem conexao; a resposta e { ok: true } ou { erro: 'ritmo', esperarMs }.
  function acenarPara(id, aoResponder) {
    if (!socket || !socket.connected) return false;
    socket.emit('acenar', { para: id }, typeof aoResponder === 'function' ? aoResponder : () => {});
    return true;
  }

  function sendRtcSignal(to, signal) {
    if (socket && socket.connected) socket.emit('rtc-signal', { to, signal });
  }

  // Devolve false se nao saiu (sem conexao). `aoResponder` recebe a resposta do
  // servidor: { ok: true } ou { erro: 'ritmo', esperarMs } quando mandou rapido
  // demais (server/freio.js).
  function sendChatMessage(conversa, texto, aoResponder) {
    if (!socket || !socket.connected) return false;
    if (typeof aoResponder === 'function') socket.emit('chat-mensagem', { conversa, texto }, aoResponder);
    else socket.emit('chat-mensagem', { conversa, texto });
    return true;
  }

  function pedirHistorico(conversa) {
    if (socket && socket.connected) socket.emit('chat-historico', { conversa });
  }

  function reagirMensagem(conversa, mensagemId, emoji) {
    if (socket && socket.connected) socket.emit('chat-reagir', { conversa, mensagemId, emoji });
  }

  function reivindicarMesa(col, row) {
    if (socket && socket.connected) socket.emit('mesa-reivindicar', { col, row });
  }

  // Largar sem precisar achar a mesa no mapa - e o "Unclaim my desk" da
  // referencia, que fica no proprio perfil.
  function largarMesa() {
    if (socket && socket.connected) socket.emit('mesa-largar');
  }

  // Poe/tira coisa em cima da PROPRIA mesa, na posicao exata do clique (x e y
  // sao tiles com fracao). O servidor recusa nas mesas dos outros.
  function itemNaMinhaMesa(x, y, o) {
    if (socket && socket.connected) socket.emit('mesa-item', { x, y, o });
  }

  // Mover e tirar apontam pelo id da coisa, nao pela posicao.
  function moverItemDaMesa(id, x, y) {
    if (socket && socket.connected) socket.emit('mesa-item-mover', { id, x, y });
  }

  function tirarItemDaMesa(id) {
    if (socket && socket.connected) socket.emit('mesa-item-tirar', { id });
  }

  function pedirAgenda() {
    if (socket && socket.connected) socket.emit('agenda-pedir');
  }

  // { quadro: chave do setor, forcar: true no "Atualizar" }. Sem opcoes, o servidor
  // manda o primeiro setor que a pessoa pode ver.
  function pedirTrello(opcoes) {
    if (socket && socket.connected) socket.emit('trello-pedir', opcoes || {});
  }

  // Os prazos dos cartoes do Kanban, pra Agenda (server/prazos.js).
  function pedirPrazos() {
    if (socket && socket.connected) socket.emit('prazos-pedir');
  }

  function editarMapa(c, r, t) {
    if (socket && socket.connected) socket.emit('mapa-editar', { c, r, t });
  }

  function editarObjetoMapa(c, r, o) {
    if (socket && socket.connected) socket.emit('mapa-objeto', { c, r, o });
  }

  // Area movida, redimensionada ou com outra regra de som (docs/areas.md).
  // false = sem conexao. `som` so vai quando mudou - sem ele, o servidor
  // mantem o que ja estava.
  function editarArea(id, a) {
    if (!socket || !socket.connected) return false;
    const dados = { id, r0: a.r0, c0: a.c0, r1: a.r1, c1: a.c1 };
    if (a.som) dados.som = { modo: a.som.modo, alcance: a.som.alcance };
    if (a.nome !== undefined) dados.nome = a.nome;
    if (a.piso) dados.piso = a.piso;
    socket.emit('mapa-area', dados);
    return true;
  }

  function restaurarArea(id) {
    if (!socket || !socket.connected) return false;
    socket.emit('mapa-area', { id, restaurar: true });
    return true;
  }

  // Area nova: o id nasce no servidor (dois navegadores criando ao mesmo tempo
  // mandariam o mesmo, e a segunda viraria edicao da primeira).
  function criarArea(a) {
    if (!socket || !socket.connected) return false;
    socket.emit('mapa-area-nova', {
      r0: a.r0, c0: a.c0, r1: a.r1, c1: a.c1, nome: a.nome, piso: a.piso, som: a.som,
    });
    return true;
  }

  function apagarArea(id) {
    if (!socket || !socket.connected) return false;
    socket.emit('mapa-area-apagar', { id });
    return true;
  }

  // Pendura (ou tira, com url vazia) um link num movel. Ver docs/plano-conteudo.md.
  function porConteudoNoMapa(c, r, titulo, url) {
    if (socket && socket.connected) socket.emit('mapa-conteudo', { c, r, titulo, url });
  }

  window.Network = {
    connect, on, sendMove, enviarVista, sendStatus, dividirTela, estouLendo, marcarReuniao, desmarcarReuniao, novoLinkDaReuniao, decidirVisitante, removerVisitante, entrarNaChamada, sairDaChamada, ligarProGrupo, sendReaction, acenarPara, sendRtcSignal, sendChatMessage,
    pedirHistorico, reagirMensagem, reivindicarMesa, largarMesa, itemNaMinhaMesa, moverItemDaMesa, tirarItemDaMesa,
    editarMapa, editarObjetoMapa, porConteudoNoMapa, editarArea, restaurarArea, criarArea, apagarArea,
    pedirAgenda, pedirTrello, pedirPrazos,
  };
})();
