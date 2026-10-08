// Lembrete das reunioes da sede: "Entrevista X comeca em 5 minutos - Entrar na
// chamada", num aviso que aparece por cima do escritorio, com a agenda fechada.
//
// POR QUE EXISTE
// O unico lembrete que havia era o dos compromissos do GOOGLE de cada pessoa, e
// ele aparecia dentro do painel da Agenda - que fica fechado. Marcar uma reuniao
// da sede pra daqui a 3 minutos e ficar esperando o aviso nao dava em nada (testado).
//
// QUEM E LEMBRADO
// Reuniao da sede nao tem lista de convidados: qualquer um entra. Lembrar a sede
// inteira de toda reuniao viraria sirene (a entrevista de duas pessoas avisando
// trinta), e a pessoa desligaria tudo. Entao:
//   - quem MARCOU a reuniao e lembrado (e quem vai abrir a sala);
//   - qualquer outro liga o sino no cartao da reuniao ("Lembrar-me");
//   - a escolha da pessoa vale, nos dois sentidos: quem marcou pode desligar.
// A escolha fica no navegador (localStorage): e conveniencia de cada um, nao
// dado da sede.
//
// QUANDO
// Duas vezes: 5 minutos antes e na hora ("comecou"). Cada uma aparece uma vez por
// aba (sessionStorage): recarregar a pagina no meio nao repete o aviso.
//
// COMO AVISA
// O aviso na tela, mais o som e a notificacao do sistema quando a aba esta
// escondida (os mesmos do avisos.js).
(function () {
  const ANTECEDENCIA_MS = 5 * 60 * 1000;
  const TOLERANCIA_INICIO_MS = 2 * 60 * 1000;   // depois disso "comecou agora" ja nao e verdade
  const VERIFICAR_A_CADA_MS = 15 * 1000;
  const CHAVE_ESCOLHAS = 'sede:lembretes';
  const CHAVE_VISTOS = 'sede:lembretes-vistos';

  let reunioes = [];
  let escolhas = {};            // chave da reuniao -> true | false
  let vistos = {};              // chave do aviso -> true
  let caixaEl = null;
  const abertos = new Map();    // chave do aviso -> elemento na tela

  // ------------------------------------------------------------- guardado

  function ler(armazem, chave) {
    try {
      const bruto = window[armazem].getItem(chave);
      const dado = bruto ? JSON.parse(bruto) : null;
      return dado && typeof dado === 'object' ? dado : {};
    } catch (e) {
      return {};   // sem storage (janela privada, bloqueado): so nao lembra entre visitas
    }
  }

  function gravar(armazem, chave, dado) {
    try { window[armazem].setItem(chave, JSON.stringify(dado)); } catch (e) { /* segue em memoria */ }
  }

  // O id volta a 1 se o disco do servidor for apagado (Render gratis): sem o
  // `criadaEm`, a escolha de uma reuniao velha valeria pra uma nova que herdou o numero.
  function chaveDe(r) {
    return r.id + ':' + r.criadaEm;
  }

  // ------------------------------------------------------------ as regras
  // Puras (sem tela nem relogio): `testes/lembretes.js` exercita as duas.

  // A escolha da pessoa vale; sem escolha, so quem marcou a reuniao e lembrado.
  function querLembrete(r, meuUid, escolhasDaPessoa) {
    const e = escolhasDaPessoa[chaveDe(r)];
    if (e === true || e === false) return e;
    return !!meuUid && r.criadaPorUid === meuUid;
  }

  // O que mostrar agora: [{ chave, reuniao, tipo: 'antes'|'inicio', faltamMs }]
  function decidir({ reunioes: lista, agora, meuUid, escolhas: escolhasDaPessoa, vistos: jaVistos }) {
    const saida = [];
    lista.forEach((r) => {
      if (!querLembrete(r, meuUid, escolhasDaPessoa)) return;
      const faltam = r.inicio - agora;
      let tipo = null;
      if (faltam > 0 && faltam <= ANTECEDENCIA_MS) tipo = 'antes';
      else if (faltam <= 0 && faltam > -TOLERANCIA_INICIO_MS && agora < r.fim) tipo = 'inicio';
      if (!tipo) return;
      const chave = chaveDe(r) + ':' + tipo;
      if (jaVistos[chave]) return;
      saida.push({ chave, reuniao: r, tipo, faltamMs: faltam });
    });
    return saida;
  }

  // ------------------------------------------------------------- na tela

  function textoDe(item) {
    if (item.tipo === 'inicio') return 'comecou agora';
    const min = Math.max(1, Math.ceil(item.faltamMs / 60000));
    return 'comeca em ' + min + (min === 1 ? ' minuto' : ' minutos');
  }

  function fecharAviso(chave) {
    const el = abertos.get(chave);
    if (el) el.remove();
    abertos.delete(chave);
  }

  function mostrar(item) {
    vistos[item.chave] = true;
    gravar('sessionStorage', CHAVE_VISTOS, vistos);
    // "comecou agora" toma o lugar do "comeca em 5 minutos" da mesma reuniao
    if (item.tipo === 'inicio') fecharAviso(chaveDe(item.reuniao) + ':antes');

    // Quem ja esta na chamada dessa reuniao nao precisa ser lembrado dela
    const minha = window.Chamada && Chamada.estouEm && Chamada.estouEm();
    if (minha && minha.id === 'reuniao:' + item.reuniao.id) return;

    const el = document.createElement('div');
    el.className = 'lembrete';
    el.setAttribute('role', 'status');

    const titulo = document.createElement('strong');
    titulo.className = 'lembrete-titulo';
    titulo.textContent = item.reuniao.titulo;     // textContent: o titulo vem de outra pessoa
    const quando = document.createElement('span');
    quando.className = 'lembrete-quando';
    quando.textContent = textoDe(item);
    el.appendChild(titulo);
    el.appendChild(quando);

    const entrar = document.createElement('button');
    entrar.type = 'button';
    entrar.className = 'lembrete-entrar';
    entrar.textContent = 'Entrar na chamada';
    entrar.addEventListener('click', () => {
      if (window.Chamada) Chamada.entrar('reuniao:' + item.reuniao.id);
      fecharAviso(item.chave);
    });
    el.appendChild(entrar);

    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'lembrete-fechar';
    fechar.setAttribute('aria-label', 'Dispensar o lembrete');
    fechar.textContent = '✕';
    fechar.addEventListener('click', () => fecharAviso(item.chave));
    el.appendChild(fechar);

    caixaEl.appendChild(el);
    abertos.set(item.chave, el);

    // Som e notificacao do sistema (aba escondida): a mesma via dos outros avisos
    if (window.Avisos && Avisos.avisar) {
      // `reuniao`: o clique na central de avisos (js/central.js) entra na chamada dela.
      Avisos.avisar(item.reuniao.titulo + ' ' + textoDe(item), 'Reuniao da sede', { tag: 'lembrete-' + item.chave, reuniao: item.reuniao.id });
    }
  }

  function verificar() {
    if (!caixaEl) return;
    const meuUid = window.Game && Game.getSelfUid && Game.getSelfUid();
    if (!meuUid) return;
    decidir({ reunioes, agora: Date.now(), meuUid, escolhas, vistos }).forEach(mostrar);

    // O "5 minutos" que ficou na tela ja nao e verdade quando a hora chega, e a
    // reuniao que acabou ou foi desmarcada nao tem por que continuar la.
    abertos.forEach((_, chave) => {
      const id = Number(chave.split(':')[0]);
      const r = reunioes.find((x) => x.id === id);
      if (!r || Date.now() > r.fim) fecharAviso(chave);
    });
  }

  // ------------------------------------------------- o sino do cartao

  function ativo(r) {
    const meuUid = window.Game && Game.getSelfUid && Game.getSelfUid();
    return querLembrete(r, meuUid, escolhas);
  }

  // Liga ou desliga; devolve o estado novo.
  function alternar(r) {
    const novo = !ativo(r);
    escolhas[chaveDe(r)] = novo;
    gravar('localStorage', CHAVE_ESCOLHAS, escolhas);
    verificar();   // ligou faltando 3 minutos: avisa ja, nao daqui a 15 s
    return novo;
  }

  function receber(dados) {
    reunioes = (dados && dados.reunioes) || [];
    // Escolha de reuniao que nao existe mais nao fica pra sempre no navegador. Lista
    // vazia nao poda nada: pode ser so um momento sem dado, e apagar aqui perderia
    // a escolha de reunioes que voltam na proxima lista.
    if (reunioes.length) {
      const vivas = new Set(reunioes.map(chaveDe));
      let mudou = false;
      Object.keys(escolhas).forEach((k) => { if (!vivas.has(k)) { delete escolhas[k]; mudou = true; } });
      if (mudou) gravar('localStorage', CHAVE_ESCOLHAS, escolhas);
    }
    verificar();
  }

  function init() {
    caixaEl = document.getElementById('lembretes-reuniao');
    if (!caixaEl) return;
    escolhas = ler('localStorage', CHAVE_ESCOLHAS);
    vistos = ler('sessionStorage', CHAVE_VISTOS);
    Network.on('reunioes', receber);
    setInterval(verificar, VERIFICAR_A_CADA_MS);
  }

  window.Lembretes = {
    init, ativo, alternar,
    // pro testes/lembretes.js
    _decidir: decidir,
    _querLembrete: querLembrete,
    _chaveDe: chaveDe,
    ANTECEDENCIA_MS,
    TOLERANCIA_INICIO_MS,
  };
})();
