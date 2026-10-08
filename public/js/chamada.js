// Chamada marcada: a que funciona de QUALQUER CANTO do mapa.
//
// A sede ja tinha chamada por proximidade - chegou perto, conversa. Isso resolve
// o corredor e nao resolve reuniao. O Caio apontou o caso que derruba a ideia de
// prender a reuniao a uma sala: "vai que a sala de reuniao esta cheia". E tem o
// outro: ninguem deveria ter que largar o lugar onde esta trabalhando pra entrar
// numa reuniao de quinze minutos.
//
// Entao a chamada virou uma SESSAO. Quem entra fala com quem tambem entrou,
// esteja onde estiver. A proximidade continua por baixo, intacta, pra conversa
// de corredor - as duas convivem, e quem decide e o `calls.js`.
//
// Este arquivo e so a cara disso: a barra que diz que voce esta no ar, quem mais
// esta, e o botao de sair. A regra de quem fala com quem mora no calls.js; quem
// guarda quem esta em qual chamada e o servidor.
(function () {
  let barra, tituloEl, genteEl, sairEl;
  let minha = null;        // { id, titulo } ou null
  let porChamada = {};     // id -> { id, titulo, gente: [nomes] }

  function estouEm() { return minha; }

  function entrar(id) {
    if (!id) return;
    Network.entrarNaChamada(id);
  }

  function sair() {
    Network.sairDaChamada();
  }

  function pintar() {
    if (!barra) return;
    barra.classList.toggle('oculto', !minha);
    if (!minha) return;

    tituloEl.textContent = minha.titulo;
    const gente = (porChamada[minha.id] && porChamada[minha.id].gente) || [];
    // Conta quem MAIS esta, nao o total: "voce e mais dois" e o que a pessoa
    // quer saber, e ela ja sabe que ela mesma esta.
    const outros = Math.max(0, gente.length - 1);
    genteEl.textContent = outros === 0
      ? 'so voce por enquanto'
      : outros === 1 ? 'voce e mais 1' : 'voce e mais ' + outros;
  }

  function init() {
    barra = document.getElementById('barra-chamada');
    if (!barra) return;
    tituloEl = document.getElementById('barra-chamada-titulo');
    genteEl = document.getElementById('barra-chamada-gente');
    sairEl = document.getElementById('barra-chamada-sair');
    sairEl.addEventListener('click', sair);

    Network.on('chamada-mudou', (data) => {
      // So me interessa a MINHA: a dos outros o game.js ja guarda no player,
      // que e de onde o calls.js le.
      if (!Game.getSelfId || data.id !== Game.getSelfId()) return;
      minha = data.chamada || null;
      pintar();
    });

    Network.on('chamadas', (lista) => {
      porChamada = {};
      (lista || []).forEach((c) => { porChamada[c.id] = c; });
      pintar();
    });

    // Conexao nova (servidor reiniciado, rede que caiu e voltou): o servidor nao
    // guarda a chamada de quem desconecta, entao a barra nao pode continuar dizendo
    // "voce e mais 1" de uma chamada que ja nao existe. Foi visto de verdade: depois
    // de reiniciar o servidor a barra ficava no ar com o dado velho e a pessoa achava
    // que ainda estava na reuniao. So a barra volta ao zero; entrar de novo e um
    // gesto dela, pela agenda.
    Network.on('init', () => {
      minha = null;
      porChamada = {};
      pintar();
    });
  }

  window.Chamada = { init, entrar, sair, estouEm };
})();
