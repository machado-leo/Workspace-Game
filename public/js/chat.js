// Chat da sede: canais (os de sempre e um por diretoria) + mensagens diretas, no formato da referencia do
// Gather (coluna de conversas + conversa aberta). Ver docs/plano-chat.md.
// Historico e presenca vivem em memoria no servidor: somem se ele reiniciar.
(function () {
  const EMOJIS_REACAO = ['👍', '😂', '❤️', '🎉', '👏'];
  const JANELA_AGRUPAMENTO = 5 * 60 * 1000; // mensagens seguidas da mesma pessoa

  let painel, listaEl, formEl, inputEl, badgeEl, conversasEl, buscaEl, tituloEl, contagemEl;
  let aberto = false;

  let canais = [];
  let conversaAtual = null;
  const historico = new Map(); // conversaId -> [mensagem]
  const naoLidas = new Map(); // conversaId -> quantidade
  // Nome de quem ja trocou DM com a gente, mesmo offline: e o que faz a conversa
  // continuar na lista depois de recarregar a pagina.
  const nomesConhecidos = new Map(); // uid -> nome
  let filtroBusca = '';

  // ---------- helpers ----------

  // A DM anda pelo uid (estavel), nao pelo id do socket (novo a cada F5).
  function selfUid() { return Game.getSelfUid(); }

  function idDm(outroUid) {
    return 'dm:' + [selfUid(), outroUid].sort().join('|');
  }

  function ehDm(conversaId) { return String(conversaId).startsWith('dm:'); }

  function outroDaDm(conversaId) {
    const partes = conversaId.slice(3).split('|');
    return partes[0] === selfUid() ? partes[1] : partes[0];
  }

  function jogadorPorUid(uid) {
    let achado = null;
    Game.getPlayers().forEach((p) => { if (p.uid === uid) achado = p; });
    return achado;
  }

  function nomeDoUid(uid) {
    const p = jogadorPorUid(uid);
    if (p) return p.name;
    return nomesConhecidos.get(uid) || 'Conversa';
  }

  function nomeDaConversa(conversaId) {
    if (!conversaId) return '';
    if (ehDm(conversaId)) return nomeDoUid(outroDaDm(conversaId));
    const canal = canais.find((c) => 'canal:' + c.id === conversaId);
    return canal ? canal.nome : conversaId;
  }

  function iniciais(nome) {
    return (nome || '?').trim().slice(0, 2).toUpperCase();
  }

  function corDoAutor(autorUid) {
    const p = jogadorPorUid(autorUid);
    return (p && p.appearance && p.appearance.skin) || '#c9cdd6';
  }

  function formatarHora(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function escapar(texto) {
    return texto.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Formatacao leve do composer. Escapa TUDO antes: o que vier de outra pessoa
  // nunca vira HTML - as unicas tags da string sao as que a gente coloca aqui.
  function formatar(texto) {
    let s = escapar(texto);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    // aceita pontuacao colada depois do fecha-underline ("_italico_," por exemplo)
    s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s),.!?;:]|$)/g, '$1<em>$2</em>');
    s = s.replace(/https?:\/\/[^\s<]+/g, (url) => (
      '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>'
    ));
    return s.replace(/\n/g, '<br>');
  }

  function mensagensDe(conversaId) {
    return historico.get(conversaId) || [];
  }

  function estaNoFim() {
    return listaEl.scrollHeight - listaEl.scrollTop - listaEl.clientHeight < 60;
  }

  // ---------- coluna das conversas ----------

  function montarItemConversa(conversaId, conteudo, naoLidasQtd) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chat-conversa-item' + (conversaId === conversaAtual ? ' ativa' : '');
    conteudo.forEach((el) => item.appendChild(el));

    if (naoLidasQtd > 0) {
      const badge = document.createElement('span');
      badge.className = 'chat-nao-lidas';
      badge.textContent = naoLidasQtd > 9 ? '9+' : String(naoLidasQtd);
      item.appendChild(badge);
    }

    item.addEventListener('click', () => abrirConversa(conversaId));
    return item;
  }

  function textoEl(classe, texto) {
    const el = document.createElement('span');
    el.className = classe;
    el.textContent = texto;
    return el;
  }

  // `p` e o jogador online, ou null pra quem so existe na conversa antiga.
  function avatarConversa(nome, p) {
    const av = document.createElement('span');
    av.className = 'chat-conversa-avatar';
    av.style.background = (p && p.appearance && p.appearance.skin) || '#c9cdd6';
    av.textContent = iniciais(nome);
    const presenca = document.createElement('span');
    presenca.className = 'chat-conversa-presenca' + (p ? '' : ' offline');
    presenca.style.background = p
      ? (Game.STATUS_COR[p.status] || Game.STATUS_COR.livre)
      : '#c2c7d0';
    av.appendChild(presenca);
    return av;
  }

  // "gestao" acha "Gente e Gestão": os canais das diretorias tem acento e maiuscula.
  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function secaoDeCanais(titulo, lista) {
    if (!lista.length) return;
    conversasEl.appendChild(textoEl('chat-secao', titulo));
    lista.forEach((c) => {
      const id = 'canal:' + c.id;
      conversasEl.appendChild(montarItemConversa(id, [
        textoEl('chat-conversa-cerquilha', '#'),
        textoEl('chat-conversa-nome', c.nome),
      ], naoLidas.get(id) || 0));
    });
  }

  function renderConversas() {
    if (!conversasEl) return;
    const filtro = semAcento(filtroBusca.trim());
    conversasEl.innerHTML = '';

    // Os de sempre em "Canais"; um por diretoria em "Diretorias" (server/canais.js).
    const canaisFiltrados = canais.filter((c) => !filtro || semAcento(c.nome).includes(filtro));
    secaoDeCanais('Canais', canaisFiltrados.filter((c) => c.grupo !== 'diretoria'));
    secaoDeCanais('Diretorias', canaisFiltrados.filter((c) => c.grupo === 'diretoria'));

    // Quem esta online agora, mais as conversas antigas de quem ja saiu.
    const entradas = new Map(); // uid -> { uid, nome, jogador }
    Game.getPlayers().forEach((p) => {
      if (!p.uid || p.uid === selfUid()) return;
      entradas.set(p.uid, { uid: p.uid, nome: p.name + (p.isAdmin ? ' 👑' : ''), jogador: p });
    });
    nomesConhecidos.forEach((nome, uid) => {
      if (uid === selfUid() || entradas.has(uid)) return;
      entradas.set(uid, { uid, nome, jogador: null });
    });

    const pessoas = Array.from(entradas.values())
      .filter((e) => !filtro || semAcento(e.nome).includes(filtro))
      // online primeiro, depois em ordem alfabetica
      .sort((a, b) => (!!b.jogador - !!a.jogador) || a.nome.localeCompare(b.nome));

    conversasEl.appendChild(textoEl('chat-secao', 'Mensagens diretas'));
    if (!pessoas.length) {
      conversasEl.appendChild(textoEl('chat-vazio-lista', 'Ninguem mais online agora.'));
    }
    pessoas.forEach((e) => {
      const id = idDm(e.uid);
      const item = montarItemConversa(id, [
        avatarConversa(e.nome, e.jogador),
        textoEl('chat-conversa-nome', e.nome),
      ], naoLidas.get(id) || 0);
      if (!e.jogador) item.classList.add('offline');
      conversasEl.appendChild(item);
    });
  }

  // ---------- conversa aberta ----------

  function montarAbertura(conversaId) {
    const bloco = document.createElement('div');
    bloco.className = 'chat-abertura';
    const titulo = document.createElement('h4');
    const p = document.createElement('p');

    if (ehDm(conversaId)) {
      titulo.textContent = 'Conversa com ' + nomeDoUid(outroDaDm(conversaId));
      p.textContent = 'So voces dois veem essas mensagens. Elas continuam aqui depois de recarregar a pagina.';
    } else {
      const canal = canais.find((c) => 'canal:' + c.id === conversaId);
      titulo.textContent = 'Comeco do #' + (canal ? canal.nome : '');
      p.textContent = canal ? canal.descricao : '';
    }

    bloco.appendChild(titulo);
    bloco.appendChild(p);
    return bloco;
  }

  function montarReacoes(msg) {
    const reacoes = msg.reacoes || {};
    const emojis = Object.keys(reacoes).filter((e) => (reacoes[e] || []).length);
    if (!emojis.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'chat-reacoes';
    emojis.forEach((emoji) => {
      const quem = reacoes[emoji];
      const pilula = document.createElement('button');
      pilula.type = 'button';
      pilula.className = 'chat-reacao-pilula' + (quem.includes(selfUid()) ? ' minha' : '');
      pilula.textContent = emoji + ' ' + quem.length;
      pilula.addEventListener('click', () => Network.reagirMensagem(msg.conversa, msg.id, emoji));
      wrap.appendChild(pilula);
    });
    return wrap;
  }

  function montarAcoes(msg) {
    const acoes = document.createElement('div');
    acoes.className = 'chat-msg-acoes';
    EMOJIS_REACAO.forEach((emoji) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji;
      b.title = 'Reagir com ' + emoji;
      b.addEventListener('click', () => Network.reagirMensagem(msg.conversa, msg.id, emoji));
      acoes.appendChild(b);
    });
    return acoes;
  }

  function montarMensagem(msg, anterior) {
    if (msg.sistema) {
      const el = document.createElement('div');
      el.className = 'chat-msg-sistema';
      el.textContent = msg.texto;
      // "Fulano comecou uma chamada": o convite vira BOTAO na propria mensagem.
      // Sem ele a pessoa leria "tem chamada rolando" e nao teria pra onde
      // clicar - teria que adivinhar que o botao Ligar do topo tambem entra.
      if (msg.chamada) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-msg-entrar';
        b.textContent = 'Entrar';
        b.addEventListener('click', () => window.Chamada && Chamada.entrar(msg.chamada));
        el.appendChild(b);
      }
      return el;
    }

    const agrupada = !!anterior && !anterior.sistema
      && anterior.autorId === msg.autorId
      && (msg.ts - anterior.ts) < JANELA_AGRUPAMENTO;

    const item = document.createElement('div');
    item.className = 'chat-msg' + (agrupada ? ' agrupada' : '');
    item.dataset.mensagemId = String(msg.id);

    const avatar = document.createElement('div');
    avatar.className = 'chat-msg-avatar';
    avatar.style.background = corDoAutor(msg.autorId);
    avatar.textContent = iniciais(msg.autorNome);
    item.appendChild(avatar);

    const corpo = document.createElement('div');
    corpo.className = 'chat-msg-corpo';

    if (!agrupada) {
      const cabecalho = document.createElement('div');
      cabecalho.className = 'chat-msg-cabecalho';
      const nome = document.createElement('span');
      nome.className = 'chat-msg-nome';
      nome.textContent = (msg.autorIsAdmin ? '👑 ' : '') + msg.autorNome;
      cabecalho.appendChild(nome);
      const hora = document.createElement('span');
      hora.className = 'chat-msg-hora';
      hora.textContent = formatarHora(msg.ts);
      cabecalho.appendChild(hora);
      corpo.appendChild(cabecalho);
    }

    const texto = document.createElement('div');
    texto.className = 'chat-msg-texto';
    texto.innerHTML = formatar(msg.texto); // texto ja escapado dentro de formatar()
    corpo.appendChild(texto);

    const reacoes = montarReacoes(msg);
    if (reacoes) corpo.appendChild(reacoes);

    item.appendChild(corpo);
    item.appendChild(montarAcoes(msg));
    return item;
  }

  function renderConversaAtual(manterRolagem) {
    if (!conversaAtual) return;
    const naoFim = manterRolagem && !estaNoFim();

    tituloEl.textContent = (ehDm(conversaAtual) ? '' : '# ') + nomeDaConversa(conversaAtual);
    if (ehDm(conversaAtual)) {
      contagemEl.textContent = 'conversa direta';
    } else {
      contagemEl.textContent = Game.getPlayers().size + ' na sede';
    }

    const mensagens = mensagensDe(conversaAtual);
    listaEl.innerHTML = '';
    listaEl.appendChild(montarAbertura(conversaAtual));
    mensagens.forEach((msg, i) => listaEl.appendChild(montarMensagem(msg, mensagens[i - 1])));

    if (!naoFim) listaEl.scrollTop = listaEl.scrollHeight;
  }

  // ---------- estado ----------

  function atualizarBadge() {
    let total = 0;
    naoLidas.forEach((n) => { total += n; });
    if (total > 0) {
      badgeEl.textContent = total > 9 ? '9+' : String(total);
      badgeEl.classList.remove('oculto');
    } else {
      badgeEl.classList.add('oculto');
    }
  }

  // O botao "Ligar" so aparece em CANAL, nao em DM: ligar pra uma pessoa so e
  // chegar perto dela no mapa, que e o que a sede ja faz. Chamada marcada existe
  // pra juntar GRUPO de qualquer canto.
  function ajustarBotaoLigar(conversaId) {
    const b = document.getElementById('chat-ligar');
    if (!b) return;
    b.classList.toggle('oculto', ehDm(conversaId));
  }

  function abrirConversa(conversaId) {
    conversaAtual = conversaId;
    // No celular o chat e uma coluna so: abrir conversa troca a lista pela
    // conversa (style.css, .vendo-conversa). No computador a classe nao muda nada.
    painel.classList.add('vendo-conversa');
    naoLidas.delete(conversaId);
    atualizarBadge();
    renderConversas();
    ajustarBotaoLigar(conversaId);

    if (historico.has(conversaId)) renderConversaAtual(false);
    else {
      listaEl.innerHTML = '';
      tituloEl.textContent = (ehDm(conversaId) ? '' : '# ') + nomeDaConversa(conversaId);
      Network.pedirHistorico(conversaId);
    }
    if (aberto) inputEl.focus();
  }

  function receberMensagem(msg) {
    // Alguem abriu uma DM comigo: guarda o nome pra conversa entrar na lista.
    if (ehDm(msg.conversa) && msg.autorId && msg.autorId !== selfUid()) {
      nomesConhecidos.set(msg.autorId, msg.autorNome);
    }

    const lista = historico.get(msg.conversa);
    if (lista) {
      lista.push(msg);
      if (lista.length > 200) lista.shift();
    } else if (msg.conversa === conversaAtual) {
      historico.set(msg.conversa, [msg]);
    }

    if (msg.conversa === conversaAtual && aberto) {
      renderConversaAtual(true);
      return;
    }
    if (msg.autorId === selfUid() || msg.sistema) return;
    naoLidas.set(msg.conversa, (naoLidas.get(msg.conversa) || 0) + 1);
    atualizarBadge();
    renderConversas();
  }

  function receberHistorico(dado) {
    historico.set(dado.conversa, dado.mensagens || []);
    if (dado.conversa === conversaAtual) renderConversaAtual(false);
  }

  function receberReacao(dado) {
    const lista = historico.get(dado.conversa);
    if (!lista) return;
    const msg = lista.find((m) => m.id === dado.mensagemId);
    if (!msg) return;
    msg.reacoes = dado.reacoes;
    if (dado.conversa === conversaAtual) renderConversaAtual(true);
  }

  // Chamado pelo game quando alguem entra/sai, pra lista de DMs acompanhar.
  function pessoasMudaram() {
    if (aberto) renderConversas();
  }

  function carregarHistorico(dados) {
    canais = (dados && dados.canais) || [];
    // DMs que o servidor ja tinha pra esse uid: e o que reaparece depois do F5.
    ((dados && dados.dms) || []).forEach((d) => nomesConhecidos.set(d.uid, d.nome));
    const padrao = (dados && dados.conversaPadrao) || 'canal:geral';
    historico.set(padrao, (dados && dados.mensagens) || []);
    conversaAtual = padrao;
    renderConversas();
    renderConversaAtual(false);
  }

  // ---------- composer ----------

  function envolverSelecao(prefixo, sufixo) {
    const ini = inputEl.selectionStart;
    const fim = inputEl.selectionEnd;
    const valor = inputEl.value;
    const selecionado = valor.slice(ini, fim) || 'texto';
    inputEl.value = valor.slice(0, ini) + prefixo + selecionado + sufixo + valor.slice(fim);
    inputEl.focus();
    inputEl.setSelectionRange(ini + prefixo.length, ini + prefixo.length + selecionado.length);
  }

  function aplicarFormato(formato) {
    if (formato === 'negrito') envolverSelecao('**', '**');
    else if (formato === 'italico') envolverSelecao('_', '_');
    else if (formato === 'riscado') envolverSelecao('~~', '~~');
    else if (formato === 'codigo') envolverSelecao('`', '`');
    else if (formato === 'emoji') {
      const ini = inputEl.selectionStart;
      inputEl.value = inputEl.value.slice(0, ini) + '🙂' + inputEl.value.slice(ini);
      inputEl.focus();
      inputEl.setSelectionRange(ini + 2, ini + 2);
    }
    // os marcadores entram no texto sem passar pelo `input`
    atualizarContador();
  }

  function ajustarAltura() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(140, inputEl.scrollHeight) + 'px';
  }

  // ---------- avisos do campo de mensagem ----------

  let avisoTimer = null;
  function avisoDoChat(texto) {
    const el = document.getElementById('chat-aviso');
    if (!el) return;
    clearTimeout(avisoTimer);
    el.textContent = texto || '';
    el.classList.toggle('oculto', !texto);
    if (texto) avisoTimer = setTimeout(() => el.classList.add('oculto'), 5000);
  }

  // O limite (o mesmo do `maxlength` do campo e do servidor) era cortado sem
  // avisar: quem colava um texto grande via a mensagem sair pela metade. Agora o
  // contador aparece nos ultimos 100 caracteres, e a colagem que estoura diz o
  // que aconteceu.
  function limiteDoCampo() {
    return Number(inputEl.getAttribute('maxlength')) || 500;
  }

  function atualizarContador() {
    const el = document.getElementById('chat-contador');
    if (!el) return;
    const limite = limiteDoCampo();
    const n = inputEl.value.length;
    el.classList.toggle('oculto', n < limite - 100);
    el.classList.toggle('no-limite', n >= limite);
    el.textContent = n + '/' + limite;
  }

  function aoColar(ev) {
    const dados = ev.clipboardData || window.clipboardData;
    const colado = dados ? String(dados.getData('text') || '') : '';
    const limite = limiteDoCampo();
    const selecionado = inputEl.selectionEnd - inputEl.selectionStart;
    const cabe = limite - (inputEl.value.length - selecionado);
    if (colado.length > cabe) {
      avisoDoChat('O texto colado tem ' + colado.length + ' caracteres e o limite e ' + limite
        + ': o final foi cortado. Divida em duas mensagens.');
    }
  }

  function enviar(e) {
    if (e) e.preventDefault();
    const texto = inputEl.value.trim();
    if (!texto || !conversaAtual) return;

    const saiu = Network.sendChatMessage(conversaAtual, texto, (resposta) => {
      if (!resposta || resposta.erro !== 'ritmo') return;
      // Barrada por mandar rapido demais: o texto nao pode sumir. Volta pra caixa,
      // a menos que a pessoa ja tenha comecado outra mensagem.
      if (!inputEl.value.trim()) {
        inputEl.value = texto;
        ajustarAltura();
        atualizarContador();
      }
      const seg = Math.max(1, Math.ceil((resposta.esperarMs || 1000) / 1000));
      avisoDoChat('Muitas mensagens seguidas. Espere ' + seg + (seg === 1 ? ' segundo' : ' segundos') + ' e envie de novo.');
    });
    if (!saiu) {
      // Sem conexao a mensagem nao vai, e apagar o campo perderia o que a pessoa escreveu.
      avisoDoChat('Sem conexao com a sede agora. Sua mensagem continua aqui - tente de novo em instantes.');
      return;
    }
    avisoDoChat('');
    inputEl.value = '';
    ajustarAltura();
    atualizarContador();
  }

  // ---------- abrir/fechar ----------

  function abrir(conversaId) {
    aberto = true;
    painel.classList.remove('oculto');
    document.getElementById('btn-chat').classList.add('ativo');
    if (window.Paineis) Paineis.abriu('chat');
    if (conversaId) abrirConversa(conversaId);
    else if (conversaAtual) abrirConversa(conversaAtual);
    // Abrindo pelo botao do chat, no celular a pessoa cai na LISTA de conversas -
    // e dali escolhe. Cair direto no #geral esconderia as DMs.
    if (!conversaId) painel.classList.remove('vendo-conversa');
    renderConversas();
    inputEl.focus();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    document.getElementById('btn-chat').classList.remove('ativo');
    if (window.Paineis) Paineis.fechou('chat');
  }
  if (window.Paineis) Paineis.registrar('chat', { fechar, botao: 'btn-chat', esc: true });

  // Aceita o id do socket (vem do cartao da pessoa) ou o uid direto.
  function abrirDm(outroId) {
    const p = Game.getPlayers().get(outroId);
    abrir(idDm(p ? p.uid : outroId));
  }

  function init() {
    painel = document.getElementById('painel-chat');
    listaEl = document.getElementById('chat-lista');
    formEl = document.getElementById('form-chat');
    inputEl = document.getElementById('chat-input');
    badgeEl = document.getElementById('chat-badge');
    conversasEl = document.getElementById('chat-conversas');
    buscaEl = document.getElementById('chat-busca');
    tituloEl = document.getElementById('chat-titulo');
    contagemEl = document.getElementById('chat-contagem');

    document.getElementById('btn-chat').addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-chat').addEventListener('click', fechar);
    const voltar = document.getElementById('chat-voltar');
    if (voltar) voltar.addEventListener('click', () => painel.classList.remove('vendo-conversa'));
    formEl.addEventListener('submit', enviar);

    const ligar = document.getElementById('chat-ligar');
    if (ligar) {
      ligar.addEventListener('click', () => {
        if (!conversaAtual || ehDm(conversaAtual)) return;
        // Manda so o id do canal. Quem monta o convite e resolve o titulo e o
        // servidor - e ele tambem que decide quem recebe.
        Network.ligarProGrupo(conversaAtual.slice('canal:'.length));
      });
    }

    inputEl.addEventListener('input', () => {
      ajustarAltura();
      atualizarContador();
    });
    inputEl.addEventListener('paste', aoColar);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) enviar(e);
    });

    buscaEl.addEventListener('input', () => {
      filtroBusca = buscaEl.value;
      renderConversas();
    });

    document.querySelectorAll('.chat-tool').forEach((btn) => {
      btn.addEventListener('click', () => aplicarFormato(btn.dataset.formato));
    });
  }

  window.Chat = {
    init,
    carregarHistorico,
    receberMensagem,
    receberHistorico,
    receberReacao,
    pessoasMudaram,
    abrirDm,
    abrir,
    nomeDaConversa,
    // O avisos.js pergunta isto pra nao tocar som de uma conversa que a pessoa
    // ja esta lendo na tela.
    estaVendo: (conversaId) => aberto && conversaAtual === conversaId,
  };
})();
