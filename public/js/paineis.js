// Um painel do trilho por vez.
//
// Cada painel (chat, agenda, quadros, estante, salas, discador, decorador) abria e
// fechava sozinho, sem saber dos outros: com o chat aberto, clicar na Agenda abria a
// agenda POR CIMA e deixava o chat aberto por baixo - no celular a agenda abria ATRAS
// do chat e o botao parecia nao funcionar. E o botao marcado no trilho continuava o
// do primeiro painel.
//
// Agora cada painel se registra aqui e avisa quando abre e quando fecha. Abrir um
// fecha o que estava aberto, e o botao marcado e sempre o do painel da frente.
//
// Esc fecha o painel da frente so nos que pedem (`esc: true`). A estante ja tem o
// Esc dela (primeiro limpa a busca), o decorador usa o Esc pra soltar o objeto
// escolhido, e fechar o discador no meio da sessao a pausa - esses tres ficam de fora.
// E Esc com texto num campo nao fecha nada: a pessoa pode estar no meio de uma frase.
(function () {
  const registrados = new Map();   // nome -> { fechar, botao, esc }
  let atual = null;                // o painel aberto agora (ou null)

  function marcarBotoes() {
    // Dois paineis podem dividir um botao (o decorador da diretoria acende o
    // "Diretoria"): decide primeiro qual botao acende, depois pinta todos - senao
    // quem pintasse por ultimo apagava o do outro.
    const daFrente = atual && registrados.get(atual) ? registrados.get(atual).botao : null;
    registrados.forEach((p) => {
      const b = p.botao ? document.getElementById(p.botao) : null;
      if (!b) return;
      const ligado = p.botao === daFrente;
      b.classList.toggle('ativo', ligado);
      b.setAttribute('aria-pressed', ligado ? 'true' : 'false');
    });
    // No celular o painel da frente pode ser um dos que moram no "Mais" (WhatsApp,
    // Discador, Estante, Decorar): ai quem fica marcado e o "Mais".
    const mais = document.getElementById('btn-mais');
    if (mais) {
      const p = atual ? registrados.get(atual) : null;
      const b = p && p.botao ? document.getElementById(p.botao) : null;
      mais.classList.toggle('ativo', !!(b && b.closest && b.closest('.trilho-mais-grupo')));
    }
  }

  // ------------------------------------------------ o botao "Mais" (celular)
  // Abre o grupo num menu em cima da barra. Escolher um item, clicar fora ou Esc fecha.
  function trilho() {
    return document.querySelector ? document.querySelector('.trilho') : null;
  }

  function fecharMais() {
    const t = trilho();
    const mais = document.getElementById('btn-mais');
    if (t) t.classList.remove('mais-aberto');
    if (mais) mais.setAttribute('aria-expanded', 'false');
  }

  function ligarMais() {
    const t = trilho();
    const mais = document.getElementById('btn-mais');
    const grupo = document.getElementById('trilho-mais-grupo');
    if (!t || !mais || !grupo) return;
    mais.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const liga = !t.classList.contains('mais-aberto');
      t.classList.toggle('mais-aberto', liga);
      mais.setAttribute('aria-expanded', liga ? 'true' : 'false');
    });
    // O clique no item chega primeiro no botao dele (que abre o painel) e depois aqui.
    grupo.addEventListener('click', fecharMais);
    document.addEventListener('click', (ev) => {
      if (!grupo.contains(ev.target) && !mais.contains(ev.target)) fecharMais();
    });
  }

  function registrar(nome, opcoes) {
    registrados.set(nome, {
      fechar: opcoes.fechar,
      botao: opcoes.botao || null,
      esc: opcoes.esc === true,
    });
  }

  // O painel `nome` acabou de abrir: o anterior fecha.
  function abriu(nome) {
    const anterior = atual;
    atual = nome;
    if (anterior && anterior !== nome) {
      const p = registrados.get(anterior);
      // O fechar do outro chama fechou(anterior), que nao mexe mais no `atual`.
      if (p && typeof p.fechar === 'function') p.fechar();
    }
    marcarBotoes();
  }

  function fechou(nome) {
    if (atual === nome) atual = null;
    marcarBotoes();
  }

  function campoComTexto(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
    return String(el.value || '').trim() !== '';
  }

  // No `window`, e nao no `document`: assim quem trata o Esc no document (a busca,
  // a estante, o decorador) fala primeiro.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented) return;
    // Com o menu "Mais" aberto, o primeiro Esc fecha so ele.
    const t = trilho();
    if (t && t.classList.contains('mais-aberto')) { fecharMais(); return; }
    if (!atual) return;
    const p = registrados.get(atual);
    if (!p || !p.esc) return;
    if (campoComTexto(document.activeElement)) return;
    p.fechar();
  });

  ligarMais();

  window.Paineis = {
    registrar,
    abriu,
    fechou,
    atual: () => atual,
  };
})();
