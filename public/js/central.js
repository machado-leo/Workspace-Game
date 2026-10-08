// Central de avisos: o que a sede avisou fica guardado num lugar so.
//
// POR QUE EXISTE
// Os avisos passavam e sumiam: o "Ana acenou pra voce" saia da tela em 20 s, o
// lembrete de reuniao sumia ao fechar, e a mencao (@nome) tocava um som e so - quem
// estava em outra aba e voltou depois nao tinha onde ver o que perdeu.
//
// O QUE ENTRA
// Tudo o que passa pelo Avisos.avisar (js/avisos.js): mencao, mensagem direta,
// convite de chamada no canal, lembrete de reuniao, aceno e visitante pedindo pra
// entrar. Fica de fora o "fulano chegou perto de voce": isso so vale na hora.
// Com a conversa aberta na tela nada entra - a pessoa ja esta vendo.
//
// ONDE FICA
// No navegador (localStorage), por conta: os ultimos 50. E conveniencia de cada um,
// como o "so os meus" da Agenda - quem troca de computador comeca a lista de novo, e o
// que aconteceu com a sede fechada nao entra (a tela diz isso).
(function () {
  const MAX = 50;
  const PREFIXO = 'avisos:central:';

  let lista = [];
  let donoCarregado = null;     // uid cuja lista esta em memoria
  let painel, botao, listaEl, badgeEl;
  let aberto = false;

  // ------------------------------------------------------ as regras (puras)
  // testes/central.js exercita.

  function tipoDe(dados) {
    if (dados && dados.tipo) return dados.tipo;
    const tag = String((dados && dados.tag) || '');
    if (tag.startsWith('aceno:')) return 'aceno';
    if (tag.startsWith('lembrete-')) return 'reuniao';
    if (tag.startsWith('chamada:')) return 'chamada';
    if (tag.startsWith('visitante-')) return 'visitante';
    if (tag === 'proximidade') return 'proximidade';
    if (tag.startsWith('dm:')) return 'dm';
    if (tag.startsWith('canal:')) return 'mencao';
    return 'outro';
  }

  // Poe o aviso no topo. O mesmo assunto ainda nao lido (varias mensagens da mesma
  // pessoa na DM) nao empilha: atualiza o que ja estava e conta quantas vezes.
  function acrescentar(atual, aviso) {
    const i = atual.findIndex((a) => !a.lido && a.tag && a.tag === aviso.tag);
    let novo = aviso;
    let resto = atual;
    if (i !== -1) {
      novo = Object.assign({}, aviso, { vezes: (atual[i].vezes || 1) + 1 });
      resto = atual.slice(0, i).concat(atual.slice(i + 1));
    }
    return [novo].concat(resto).slice(0, MAX);
  }

  function quandoFoi(ts, agora) {
    const min = Math.floor((agora - ts) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return 'ha ' + min + ' min';
    const h = Math.floor(min / 60);
    if (h < 24) return 'ha ' + h + ' h';
    const d = new Date(ts);
    const dd = (n) => String(n).padStart(2, '0');
    return dd(d.getDate()) + '/' + dd(d.getMonth() + 1) + ' ' + dd(d.getHours()) + ':' + dd(d.getMinutes());
  }

  // ------------------------------------------------------------ guardado

  function meuUid() {
    return window.Game && Game.getSelfUid ? Game.getSelfUid() : null;
  }

  // A lista e da CONTA: duas pessoas no mesmo computador nao veem os avisos uma da outra.
  function carregar() {
    const uid = meuUid();
    if (!uid || uid === donoCarregado) return !!uid;
    donoCarregado = uid;
    lista = [];
    try {
      const bruto = JSON.parse(localStorage.getItem(PREFIXO + uid) || '[]');
      if (Array.isArray(bruto)) lista = bruto.filter((a) => a && typeof a.titulo === 'string').slice(0, MAX);
    } catch (e) { /* sem storage ou lixo: comeca vazia */ }
    return true;
  }

  function gravar() {
    if (!donoCarregado) return;
    try { localStorage.setItem(PREFIXO + donoCarregado, JSON.stringify(lista)); } catch (e) { /* so nao lembra */ }
  }

  // Chamado pelo Avisos.avisar.
  function guardar(titulo, corpo, dados) {
    const tipo = tipoDe(dados);
    if (tipo === 'proximidade' || !carregar()) return;
    const d = dados || {};
    lista = acrescentar(lista, {
      tipo,
      titulo: String(titulo || '').slice(0, 160),
      corpo: String(corpo || '').slice(0, 200),
      tag: d.tag || null,
      conversa: d.conversa || null,
      reuniao: d.reuniao || null,
      uid: d.uid || null,
      ts: Date.now(),
      lido: aberto,          // com a central aberta, a pessoa ja esta vendo
    });
    gravar();
    pintarBadge();
    if (aberto) desenhar();
  }

  // ------------------------------------------------------------ na tela

  const ICONE = {
    mencao: '@', dm: '✉', chamada: '☎', reuniao: '⏰', aceno: '👋', visitante: '🚪', outro: '•',
  };

  function pintarBadge() {
    if (!badgeEl) return;
    const n = lista.filter((a) => !a.lido).length;
    badgeEl.textContent = n > 9 ? '9+' : String(n);
    badgeEl.classList.toggle('oculto', n === 0);
  }

  // O clique leva ao assunto: a conversa, a chamada da reuniao, ou a pessoa que acenou.
  function agir(a) {
    if (a.reuniao && window.Chamada) {
      Chamada.entrar('reuniao:' + a.reuniao);
      fechar();
    } else if (a.uid && window.Game) {
      let online = null;
      Game.getPlayers().forEach((p) => { if (p.uid === a.uid) online = p; });
      if (online) { Game.irAte(online.id); fechar(); }
      else if (window.Chat && meuUid()) Chat.abrir('dm:' + [meuUid(), a.uid].sort().join('|'));
    } else if (a.conversa && window.Chat) {
      Chat.abrir(a.conversa);   // o chat abre e o Paineis fecha este
    }
  }

  function desenhar() {
    listaEl.innerHTML = '';
    if (!lista.length) {
      const vazio = document.createElement('p');
      vazio.className = 'central-vazio';
      vazio.textContent = 'Nada por aqui. Mencoes, mensagens diretas, convites de chamada, lembretes de reuniao e acenos ficam guardados aqui.';
      listaEl.appendChild(vazio);
      return;
    }
    const agora = Date.now();
    lista.forEach((a) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'central-item' + (a.lido ? '' : ' nao-lido');
      const icone = document.createElement('span');
      icone.className = 'central-icone central-' + a.tipo;
      icone.textContent = ICONE[a.tipo] || ICONE.outro;
      item.appendChild(icone);
      const txt = document.createElement('span');
      txt.className = 'central-texto';
      const t = document.createElement('span');
      t.className = 'central-titulo';
      t.textContent = a.titulo + (a.vezes > 1 ? ' (' + a.vezes + ')' : '');   // textContent: vem de outras pessoas
      txt.appendChild(t);
      if (a.corpo) {
        const c = document.createElement('span');
        c.className = 'central-corpo';
        c.textContent = a.corpo;
        txt.appendChild(c);
      }
      const q = document.createElement('span');
      q.className = 'central-quando';
      q.textContent = quandoFoi(a.ts, agora);
      txt.appendChild(q);
      item.appendChild(txt);
      item.addEventListener('click', () => agir(a));
      listaEl.appendChild(item);
    });
  }

  function abrir() {
    carregar();
    aberto = true;
    painel.classList.remove('oculto');
    if (window.Paineis) Paineis.abriu('avisos');
    desenhar();                              // o que e novo aparece marcado...
    lista = lista.map((a) => (a.lido ? a : Object.assign({}, a, { lido: true })));
    gravar();                                // ...e conta como lido dai em diante
    pintarBadge();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    if (window.Paineis) Paineis.fechou('avisos');
  }
  if (window.Paineis) Paineis.registrar('avisos', { fechar, botao: 'btn-avisos', esc: true });

  function limpar() {
    lista = [];
    gravar();
    pintarBadge();
    desenhar();
  }

  function init() {
    painel = document.getElementById('painel-avisos');
    botao = document.getElementById('btn-avisos');
    listaEl = document.getElementById('central-lista');
    badgeEl = document.getElementById('avisos-badge');
    botao.addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-avisos').addEventListener('click', fechar);
    document.getElementById('btn-limpar-avisos').addEventListener('click', limpar);
    // O badge precisa da conta; ela chega com o `init` do servidor.
    if (window.Network) Network.on('init', () => { carregar(); pintarBadge(); });
  }

  window.Central = {
    init, guardar,
    // pro testes/central.js
    _tipoDe: tipoDe, _acrescentar: acrescentar, _quandoFoi: quandoFoi, _lista: () => lista,
  };
})();
