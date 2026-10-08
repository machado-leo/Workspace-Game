// Janela ao lado da sede: o jeito de ter WhatsApp e Spotify "dentro" da rotina.
//
// Os dois se recusam a abrir DENTRO de outro site (bloqueiam iframe), e o que "cola"
// um deles numa pagina nao e oficial. Entao cada um abre o proprio site numa janela
// colada no lado direito da tela, sempre a MESMA janela (nome fixo): clicar de novo
// traz ela pra frente em vez de abrir outra. No celular abre uma aba (ou o app).
//
// A pessoa entra na PROPRIA conta, na pagina do proprio servico: a sede nao ve
// senha, nao guarda nada e nao fala com o WhatsApp nem com o Spotify.
(function () {
  function noCelular() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) && window.innerWidth < 900;
  }

  // { nome, largura (fracao da tela, com teto em px), altura (fracao), embaixo: encosta embaixo }
  // Devolve false se o navegador bloqueou o pop-up.
  function abrir(url, { nome, largura = 0.42, maxLargura = 560, altura = 1, embaixo = false } = {}) {
    if (noCelular()) {
      window.open(url, '_blank', 'noopener');
      return true;
    }
    // O navegador pode ignorar tamanho e posicao (cada um tem sua regra pra pop-up);
    // o nome fixo garante ao menos que e sempre a mesma janela.
    const tela = window.screen || {};
    const w = Math.min(maxLargura, Math.round((tela.availWidth || 1280) * largura));
    const h = Math.round((tela.availHeight || 800) * altura);
    const esquerda = (tela.availLeft || 0) + (tela.availWidth || 1280) - w;
    const topo = (tela.availTop || 0) + (embaixo ? (tela.availHeight || 800) - h : 0);
    const recursos = 'popup=yes,width=' + w + ',height=' + h + ',left=' + esquerda + ',top=' + topo;
    const janela = window.open(url, nome, recursos);
    if (!janela) return false;
    try { janela.opener = null; } catch (e) { /* ja navegou */ }
    try { janela.focus(); } catch (e) { /* segue */ }
    return true;
  }

  function avisarBloqueio(quem) {
    const aviso = document.getElementById('aviso-camera');
    if (!aviso) return;
    aviso.textContent = 'O navegador bloqueou a janela do ' + quem + '. Libere pop-ups pra este site e clique de novo.';
    aviso.classList.remove('oculto');
    setTimeout(() => aviso.classList.add('oculto'), 6000);
  }

  window.JanelaAoLado = { abrir, avisarBloqueio, noCelular };
})();
