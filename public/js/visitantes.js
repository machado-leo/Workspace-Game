// Visitantes da reuniao, do lado de quem e da sede. Ver
// docs/plano-reuniao-por-link.md.
//
// Quem e de fora entra numa reuniao pelo LINK dela, como no Meet: nao tem conta,
// nao ve o mapa nem o chat, e fica numa sala de espera ate um membro que ESTA NA
// CHAMADA deixar entrar. Este arquivo e a cara disso pra quem e da sede:
//
//   - o pedido ("Ana quer entrar" - Admitir / Recusar);
//   - a lista de quem ja entrou (com "Remover");
//   - o aviso pra quem marcou a reuniao e ainda nao entrou nela: o convidado
//     chegou e esta esperando;
//   - a ponte com o calls.js, que precisa saber quem esta na chamada pra abrir a
//     conexao com eles (visitante nao esta no mapa, entao o jogo nao o conhece).
//
// O servidor manda uma FOTOGRAFIA da reuniao a cada mudanca (`visitantes-mudou`),
// nao um evento por pessoa: a tela sempre pinta o estado inteiro e nao ha como
// ela ficar com pedido velho na tela.
(function () {
  let painel, listaEl;
  const fotos = new Map();     // id da reuniao -> ultima fotografia
  let minha = null;            // { id, titulo }: a chamada em que estou
  const avisados = new Set();  // pedidos pelos quais ja avisei

  function estouNaChamadaDe(foto) {
    return !!minha && minha.id === foto.chamada;
  }

  function botao(texto, classe, aoClicar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'visitantes-botao ' + classe;
    b.textContent = texto;
    b.addEventListener('click', aoClicar);
    return b;
  }

  function linha(textoNome, sufixo, botoes) {
    const li = document.createElement('li');
    li.className = 'visitantes-linha';
    const nome = document.createElement('span');
    nome.className = 'visitantes-nome';
    // textContent: o nome vem de fora e nunca vira HTML
    nome.textContent = textoNome;
    li.appendChild(nome);
    if (sufixo) {
      const s = document.createElement('span');
      s.className = 'visitantes-sufixo';
      s.textContent = sufixo;
      li.appendChild(s);
    }
    const acoes = document.createElement('span');
    acoes.className = 'visitantes-acoes';
    botoes.forEach((b) => acoes.appendChild(b));
    li.appendChild(acoes);
    return li;
  }

  function pintar() {
    if (!painel) return;
    listaEl.innerHTML = '';

    fotos.forEach((foto) => {
      const dentro = estouNaChamadaDe(foto);
      foto.esperando.forEach((p) => {
        if (dentro) {
          listaEl.appendChild(linha(p.nome, 'quer entrar em "' + foto.titulo + '"', [
            botao('Admitir', 'primario', () => Network.decidirVisitante(p.id, true)),
            botao('Recusar', '', () => Network.decidirVisitante(p.id, false)),
          ]));
        } else {
          // Quem marcou a reuniao e ainda nao esta nela: o convidado chegou e
          // ninguem da sede esta la pra deixar entrar.
          listaEl.appendChild(linha(p.nome, 'esta esperando em "' + foto.titulo + '"', [
            botao('Entrar na reuniao', 'primario', () => {
              if (window.Chamada) Chamada.entrar(foto.chamada);
            }),
          ]));
        }
      });
      if (dentro) {
        foto.dentro.forEach((v) => {
          listaEl.appendChild(linha(v.nome, 'visitante', [
            botao('Remover', '', () => Network.removerVisitante(v.id)),
          ]));
        });
      }
    });

    painel.classList.toggle('oculto', !listaEl.children.length);
  }

  // Passa pro calls.js quem esta na chamada. Ele so abre conexao com os que
  // estao na MESMA chamada que eu; aqui vai a lista de todos que a sede conhece.
  function passarProCalls() {
    const mapa = new Map();
    fotos.forEach((foto) => {
      foto.dentro.forEach((v) => {
        mapa.set(v.id, {
          id: v.id,
          name: v.nome + ' (visitante)',
          chamada: { id: foto.chamada, titulo: foto.titulo },
          appearance: { skin: v.cor },
          dividindoTela: !!v.dividindoTela,
          isAdmin: false,
          visitante: true,
        });
      });
    });
    if (window.Calls && Calls.definirVisitantes) Calls.definirVisitantes(mapa);
  }

  // Um pedido novo chegou: som e, com a aba escondida, notificacao do sistema.
  function avisarNovos() {
    const agora = new Set();
    fotos.forEach((foto) => {
      foto.esperando.forEach((p) => {
        agora.add(p.id);
        if (avisados.has(p.id)) return;
        avisados.add(p.id);
        if (window.Avisos && Avisos.avisar) {
          Avisos.avisar(p.nome + ' quer entrar na reuniao', foto.titulo, { tag: 'visitante-' + p.id });
        }
      });
    });
    avisados.forEach((id) => { if (!agora.has(id)) avisados.delete(id); });
  }

  function receber(foto) {
    if (!foto || typeof foto.reuniaoId !== 'number') return;
    if (!foto.esperando.length && !foto.dentro.length) fotos.delete(foto.reuniaoId);
    else fotos.set(foto.reuniaoId, foto);
    avisarNovos();
    passarProCalls();
    pintar();
  }

  function init() {
    painel = document.getElementById('painel-visitantes');
    if (!painel) return;
    listaEl = document.getElementById('painel-visitantes-lista');

    Network.on('visitantes-mudou', receber);

    Network.on('chamada-mudou', (data) => {
      // So a MINHA chamada importa: a dos outros o game.js guarda no player
      if (!Game.getSelfId || data.id !== Game.getSelfId()) return;
      minha = data.chamada || null;
      pintar();
    });

    // Conexao nova (F5 do servidor, rede que voltou): o servidor nao lembra em que
    // chamada eu estava, entao a tela tambem nao pode lembrar.
    Network.on('init', () => {
      minha = null;
      fotos.clear();
      avisados.clear();
      passarProCalls();
      pintar();
    });
  }

  window.Visitantes = { init };
})();
