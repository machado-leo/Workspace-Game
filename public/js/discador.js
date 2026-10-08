// Discador do CRM, dentro da sede. Ver docs/discador.md.
//
// A fila, o roteiro e cada ligacao sao do CRM - a sede so faz a ponte (ver
// server/discador.js). Este painel e a mesma sessao da tela do CRM
// (crm-adm/src/components/discador/SessaoDiscador.tsx), com duas coisas que so
// existem aqui:
//
//   - enquanto a sessao esta ligando, o status da pessoa vira "Em ligacao" e a
//     sede nao ouve nem e ouvida (Calls.abafarParaLigacao). Sem isso o colega
//     do lado escutava a ligacao com o cliente pela conversa de proximidade;
//   - atalho de teclado so pros numeros 1 a 8 (o resultado). Letra aqui anda
//     com o boneco: o "S" de pular, no CRM, aqui levaria a pessoa pra baixo.
(function () {
  const MARCA_DOR = '{{dor}}';

  let painel, corpo, botao;
  let tique = null;       // relogio da duracao / contagem

  const e = {
    aberto: false,
    tela: 'carregando',   // carregando | aviso | montar | sessao | resumo
    aviso: null,
    podeTentarDeNovo: false,
    dados: null,          // resposta da fila (CRM)
    buscando: false,
    filtros: { segmento: '', cidade: '', temperatura: '', ultimo: '' },
    meta: 20,
    intervalo: 3,
    discarSozinho: true,
    // sessao
    sessao: null,
    fila: [],
    indice: 0,
    fase: 'pronto',       // pronto | contagem | ligando
    pausado: false,
    restante: 3,
    contagemFim: 0,       // quando a contagem acaba (ms)
    restanteMs: 0,        // o que faltava quando pausou
    iniciadaEm: null,
    voltouEm: null,
    saiu: false,
    escolhido: null,
    data: '',
    hora: '',
    nota: '',
    servicoId: null,
    registros: [],
    naoSalvas: [],
    avisos: [],
    modoLigacao: false,
    statusAntes: null,
  };

  // ---- utilidades -----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function somarDias(data, dias) {
    const p = String(data).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10);
  }

  function formatarData(data) {
    const p = String(data || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  }

  function duracao(segundos) {
    const s = Math.max(0, Math.round(segundos));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m ? m + ' min ' + String(r).padStart(2, '0') + ' s' : r + ' s';
  }

  function primeiroNome(nome) {
    return String(nome || '').trim().split(/\s+/)[0] || '';
  }

  async function pedir(metodo, url, corpoPedido) {
    try {
      const r = await fetch(url, {
        method: metodo,
        credentials: 'same-origin',
        headers: corpoPedido ? { 'content-type': 'application/json' } : {},
        body: corpoPedido ? JSON.stringify(corpoPedido) : undefined,
      });
      let json = {};
      try { json = await r.json(); } catch (err) { json = {}; }
      if (!r.ok) return { ok: false, erro: json.erro || ('A sede recusou (' + r.status + ').') };
      return { ok: true, json };
    } catch (err) {
      return { ok: false, erro: 'Sem conexao com a sede.' };
    }
  }

  function resultado(valor) {
    return ((e.dados && e.dados.resultados) || []).find((r) => r.valor === valor) || null;
  }

  function itemAtual() {
    return e.fila[e.indice] || null;
  }

  function servicoAtual(item) {
    const lista = (e.dados && e.dados.servicos) || [];
    if (!item || !lista.length) return null;
    return lista.find((s) => s.id === e.servicoId) || lista.find((s) => s.id === item.servicoInicial) || lista[0];
  }

  // ---- modo ligacao: status e audio -----------------------------------------
  // Liga no primeiro "Ligar" e fica ligado a sessao inteira, e nao ligacao a
  // ligacao: nos 3 s entre uma e outra o status piscaria pra "Livre" pro mapa
  // todo, e dava tempo de uma conversa de corredor abrir no meio.
  function entrarModoLigacao() {
    if (e.modoLigacao) return;
    e.modoLigacao = true;
    e.statusAntes = window.Game && Game.definirStatusProprio ? Game.definirStatusProprio('ligacao') : null;
    if (window.Calls && Calls.abafarParaLigacao) Calls.abafarParaLigacao(true);
  }

  function sairModoLigacao() {
    if (!e.modoLigacao) return;
    e.modoLigacao = false;
    const volta = e.statusAntes && e.statusAntes !== 'ligacao' ? e.statusAntes : 'livre';
    e.statusAntes = null;
    if (window.Game && Game.definirStatusProprio) Game.definirStatusProprio(volta);
    if (window.Calls && Calls.abafarParaLigacao) Calls.abafarParaLigacao(false);
  }

  // ---- carregar ---------------------------------------------------------------
  function filtrosParaPedido() {
    const f = e.filtros;
    return {
      segmento: f.segmento,
      cidade: f.cidade,
      temperatura: f.temperatura,
      nuncaLigado: f.ultimo === 'nunca',
      semContatoDias: f.ultimo && f.ultimo !== 'nunca' ? Number(f.ultimo) : null,
    };
  }

  async function carregarFila() {
    e.buscando = true;
    render();
    const r = await pedir('POST', '/api/discador/fila', { filtros: filtrosParaPedido() });
    e.buscando = false;
    if (!r.ok) {
      e.tela = 'aviso';
      e.aviso = r.erro;
      e.podeTentarDeNovo = true;
      render();
      return;
    }
    e.dados = r.json;
    if (e.tela !== 'resumo') e.tela = 'montar';
    render();
  }

  // ---- sessao -------------------------------------------------------------------
  function comecarSessao() {
    if (!e.dados || !e.dados.fila.length) return;
    e.sessao = window.crypto && crypto.randomUUID ? crypto.randomUUID() : null;
    e.fila = e.dados.fila.slice();
    e.indice = 0;
    e.fase = 'pronto';
    e.pausado = false;
    e.registros = [];
    e.naoSalvas = [];
    e.avisos = [];
    limparLigacao();
    e.tela = 'sessao';
    render();
  }

  function limparLigacao() {
    e.iniciadaEm = null;
    e.voltouEm = null;
    e.saiu = false;
    e.escolhido = null;
    e.data = '';
    e.hora = '';
    e.nota = '';
    e.servicoId = null;
    e.restante = e.intervalo;
  }

  // Chamado pelo clique no link tel: - real ou o que a contagem dispara. O
  // navegador abre o discador sozinho (e o link); aqui so marca o inicio.
  function comecarLigacao() {
    e.iniciadaEm = new Date().toISOString();
    e.voltouEm = null;
    e.saiu = false;
    e.escolhido = null;
    e.fase = 'ligando';
    entrarModoLigacao();
  }

  function irPara(proximo, depoisDeRegistrar) {
    e.indice = proximo;
    limparLigacao();
    e.fase = depoisDeRegistrar && e.discarSozinho && !e.pausado && proximo < e.fila.length ? 'contagem' : 'pronto';
    // Contra um horario-alvo, e nao "menos 1 a cada tique": o tique nao comeca
    // junto com a contagem, e os 3 s virariam entre 2 e 3.
    e.contagemFim = Date.now() + e.intervalo * 1000;
    render();
    if (corpo) corpo.scrollTop = 0;
  }

  async function salvar(registro) {
    const r = await pedir('POST', '/api/discador/ligacao', { ligacao: registro.corpo });
    if (!r.ok) e.naoSalvas.push({ registro, erro: r.erro });
    else if (r.json.avisos && r.json.avisos.length) e.avisos.push.apply(e.avisos, r.json.avisos);
    else return;
    render();
  }

  function escolher(valor) {
    const opcao = resultado(valor);
    if (!opcao || e.fase !== 'ligando') return;
    if (opcao.pedeData) {
      e.escolhido = opcao;
      if (!e.data) e.data = somarDias(e.dados.hoje, 1);
      render();
      return;
    }
    confirmar(opcao);
  }

  function confirmar(opcao) {
    const item = itemAtual();
    if (!item || !e.iniciadaEm) return;
    if (opcao.pedeData && !e.data) return;
    const servico = servicoAtual(item);
    const fim = e.voltouEm || new Date().toISOString();
    const registro = {
      empresa: item.nome,
      resultado: opcao.valor,
      data: opcao.pedeData ? e.data : null,
      hora: opcao.pedeData === 'reuniao' && e.hora ? e.hora : null,
      segundos: (Date.parse(fim) - Date.parse(e.iniciadaEm)) / 1000,
      corpo: {
        empresaId: item.empresaId,
        sessao: e.sessao,
        resultado: opcao.valor,
        nota: e.nota.trim() || null,
        servicoId: servico ? servico.id : null,
        iniciadaEm: e.iniciadaEm,
        voltouEm: e.voltouEm,
        data: opcao.pedeData ? e.data : null,
        hora: opcao.pedeData === 'reuniao' && e.hora ? e.hora : null,
      },
    };
    e.registros.push(registro);
    salvar(registro);
    irPara(e.indice + 1, true);
  }

  function pular() {
    if (e.fase === 'ligando' || !itemAtual()) return;
    irPara(e.indice + 1, false);
  }

  function alternarPausa() {
    if (e.fase === 'ligando') return;
    e.pausado = !e.pausado;
    // a contagem congela onde estava, e continua dali
    if (e.pausado) e.restanteMs = Math.max(e.contagemFim - Date.now(), 0);
    else e.contagemFim = Date.now() + (e.restanteMs || e.intervalo * 1000);
    // Pausado, a pessoa volta pro escritorio: status e audio como estavam.
    if (e.pausado) sairModoLigacao();
    render();
  }

  function encerrar() {
    if (e.fase === 'ligando' && !confirm('A ligacao em andamento ainda nao foi marcada e vai ficar sem registro. Encerrar mesmo assim?')) return;
    if (e.naoSalvas.length && !confirm(e.naoSalvas.length + ' ligacao(oes) nao foram salvas. Se encerrar agora, elas se perdem. Encerrar?')) return;
    sairModoLigacao();
    e.tela = 'resumo';
    e.fase = 'pronto';
    render();
    carregarFila(); // a fila da proxima sessao e o total do dia mudaram
  }

  function tentarDeNovo(i) {
    const alvo = e.naoSalvas[i];
    if (!alvo) return;
    e.naoSalvas.splice(i, 1);
    render();
    salvar(alvo.registro);
  }

  // A contagem acabou: disca sozinho se o navegador ainda deixa (o toque no
  // resultado vale ~5 s no Chrome, menos no iPhone); senao, botao "Ligar".
  function fimDaContagem() {
    if (e.fase !== 'contagem' || !itemAtual()) return;
    const toque = navigator.userActivation && navigator.userActivation.isActive === true;
    const link = corpo && corpo.querySelector('a[data-acao="ligar"]');
    if (e.discarSozinho && toque && link) {
      link.click(); // mesmo caminho do toque: o clique marca o inicio, o link abre o discador
    } else {
      e.fase = 'pronto';
      render();
    }
  }

  function aoTique() {
    if (!e.aberto || e.tela !== 'sessao') return;
    if (e.fase === 'contagem' && !e.pausado) {
      const falta = e.contagemFim - Date.now();
      e.restante = Math.max(Math.ceil(falta / 1000), 0);
      const vivo = corpo.querySelector('[data-vivo="restante"]');
      if (vivo) vivo.textContent = String(e.restante);
      if (falta <= 0) fimDaContagem();
    }
    if (e.fase === 'ligando' && e.iniciadaEm) {
      const vivo = corpo.querySelector('[data-vivo="duracao"]');
      const fim = e.voltouEm ? Date.parse(e.voltouEm) : Date.now();
      if (vivo) vivo.textContent = (e.voltouEm ? 'voce voltou · ' : '') + duracao((fim - Date.parse(e.iniciadaEm)) / 1000);
    }
  }

  // ---- telas ------------------------------------------------------------------
  function htmlAviso() {
    return '<div class="disc-aviso-grande"><p>' + esc(e.aviso) + '</p>'
      + (e.podeTentarDeNovo ? '<button type="button" class="btn btn-secundario btn-pequeno" data-acao="recarregar">Tentar de novo</button>' : '')
      + '</div>';
  }

  function opcoes(lista, atual, primeira) {
    return '<option value="">' + esc(primeira) + '</option>'
      + lista.map((v) => '<option value="' + esc(v) + '"' + (v === atual ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
  }

  function htmlMontar() {
    const d = e.dados;
    const f = e.filtros;
    const temp = [['', 'Todas'], ['Quente', 'Quente'], ['Morno', 'Morno'], ['Frio', 'Frio'], ['sem', 'Sem temperatura']];
    const ult = [['', 'Qualquer'], ['nunca', 'Nunca recebeu ligacao'], ['7', 'Sem ligacao ha 7 dias'], ['15', 'Sem ligacao ha 15 dias'], ['30', 'Sem ligacao ha 30 dias'], ['60', 'Sem ligacao ha 60 dias']];
    const sel = (pares, atual) => pares.map((p) => '<option value="' + p[0] + '"' + (p[0] === atual ? ' selected' : '') + '>' + p[1] + '</option>').join('');
    const fila = d.fila;
    return ''
      + '<p class="disc-sub">Uma ligacao atras da outra, pelo seu celular. Hoje voce ja fez <b>' + d.jaHoje + '</b> ' + (d.jaHoje === 1 ? 'ligacao' : 'ligacoes') + '.</p>'
      + '<section class="disc-bloco"><h3>Quem entra na fila</h3><div class="disc-grade">'
      + '<label>Segmento<select data-filtro="segmento">' + opcoes(d.opcoes.segmentos, f.segmento, 'Todos') + '</select></label>'
      + '<label>Cidade<select data-filtro="cidade">' + opcoes(d.opcoes.cidades, f.cidade, 'Todas') + '</select></label>'
      + '<label>Temperatura<select data-filtro="temperatura">' + sel(temp, f.temperatura) + '</select></label>'
      + '<label>Ultimo contato<select data-filtro="ultimo">' + sel(ult, f.ultimo) + '</select></label>'
      + '</div><p class="disc-nota">Etapa do funil e responsavel: o padrao do CRM (quem ainda nao virou oportunidade andando). Pra montar uma fila mais fina, a tela Discador do CRM.</p></section>'
      + '<section class="disc-bloco"><h3>A sessao</h3><div class="disc-grade">'
      + '<label>Meta de ligacoes<input type="number" min="1" max="200" value="' + e.meta + '" data-campo="meta"></label>'
      + '<label>Espera ate a proxima<select data-campo="intervalo">' + sel([['3', '3 segundos'], ['4', '4 segundos']], String(e.intervalo)) + '</select></label>'
      + '</div><label class="disc-check"><input type="checkbox" data-campo="discarSozinho"' + (e.discarSozinho ? ' checked' : '') + '>'
      + '<span><b>Discar sozinho depois de marcar o resultado</b><br>O discador abre com o numero digitado; falta so o seu toque em ligar.</span></label></section>'
      + '<section class="disc-bloco">'
      + '<p class="disc-total"><b>' + d.total + '</b> ' + (d.total === 1 ? 'empresa na fila' : 'empresas na fila')
      + (d.total > fila.length ? ' <span>(as ' + fila.length + ' primeiras vem pra ca)</span>' : '') + (e.buscando ? ' <span>atualizando...</span>' : '') + '</p>'
      + (fila.length ? '<ol class="disc-previa">' + fila.slice(0, 5).map((i) => '<li><span>' + esc(i.nome) + '</span><em>'
        + (i.retornoCombinado ? 'retorno combinado' : i.tentativa === 1 ? 'primeira' : i.tentativa + 'a tentativa') + '</em></li>').join('') + '</ol>' : '')
      + (d.fora.length ? '<div class="disc-fora"><b>Ficaram de fora:</b><ul>' + d.fora.map((m) => '<li>' + m.n + ' ' + esc(m.rotulo) + '</li>').join('') + '</ul></div>' : '')
      + '<button type="button" class="btn btn-primario disc-comecar" data-acao="comecar"' + (fila.length ? '' : ' disabled') + '>Comecar a ligar</button>'
      + '<p class="disc-nota">No celular: cada ligacao sai do seu chip, e no iPhone o sistema sempre pergunta "Ligar?". No computador: com o celular pareado pelo "Vincular ao Celular" do Windows. Enquanto voce liga, a sede te mostra "Em ligacao" e desliga o seu microfone e o som dos outros.</p>'
      + dicaDoComputador()
      + '</section>';
  }

  // O mesmo passo a passo da tela Discador do CRM. O CSS esconde em quem toca a
  // tela (celular), onde nao serve pra nada - mas a sede, na pratica, e quase
  // sempre computador, e sem isto o "Ligar" daqui nao abre nada.
  function dicaDoComputador() {
    return '<details class="disc-pc"><summary>Ligando pelo computador? Vincule o celular uma vez (~5 min)</summary>'
      + '<ol>'
      + '<li>No celular: abrir o app <b>Vincular ao Windows</b> e entrar com a mesma conta Microsoft do computador.</li>'
      + '<li>No computador: abrir o <b>Vincular ao Celular</b>, aba <b>Chamadas</b>, e aceitar no celular o que ele pedir (usa Bluetooth).</li>'
      + '<li>Configuracoes do Windows, Aplicativos, Aplicativos padrao, "Vincular ao Celular": apontar o tipo de link <b>TEL</b> pra ele.</li>'
      + '<li>Na primeira ligacao o navegador pergunta "Abrir Vincular ao Celular?" - marque <b>Sempre permitir</b>.</li>'
      + '</ol>'
      + '<p>Ai o botao Ligar disca pelo seu numero e voce fala pelo fone do computador. E, com o "sempre permitir" marcado, a proxima ligacao sai sozinha depois da contagem.</p>'
      + '</details>';
  }

  function htmlResultados() {
    if (e.escolhido) {
      const reuniao = e.escolhido.pedeData === 'reuniao';
      return '<div class="disc-data"><b>' + (reuniao ? 'Quando e a reuniao?' : 'Quando ligar de novo?') + '</b><div>'
        + '<input type="date" data-campo="data" min="' + esc(e.dados.hoje) + '" value="' + esc(e.data) + '" aria-label="Dia">'
        + (reuniao ? '<input type="time" data-campo="hora" value="' + esc(e.hora) + '" aria-label="Hora (opcional)">' : '')
        + '</div><div class="disc-data-botoes"><button type="button" class="btn btn-primario btn-pequeno" data-acao="confirmar"' + (e.data ? '' : ' disabled') + '>Confirmar ' + esc(e.escolhido.rotulo.toLowerCase()) + '</button>'
        + '<button type="button" class="btn btn-secundario btn-pequeno" data-acao="voltar-resultado">Voltar</button></div></div>';
    }
    return '<div class="disc-resultados">' + e.dados.resultados.map((r) => '<button type="button" class="disc-res disc-tom-' + esc(r.tom) + '" data-acao="resultado" data-valor="' + esc(r.valor) + '">'
      + '<span class="disc-res-nome">' + esc(r.rotulo) + '<kbd>' + esc(r.tecla) + '</kbd></span><span class="disc-res-efeito">' + esc(r.efeito) + '</span></button>').join('') + '</div>';
  }

  function htmlRoteiro(item) {
    const s = servicoAtual(item);
    if (!s) return '';
    const abertura = item.abertura.split(MARCA_DOR).join(s.dor);
    return '<section class="disc-bloco disc-roteiro"><h3>O que oferecer</h3><div class="disc-chips">'
      + e.dados.servicos.map((x) => '<button type="button" class="disc-chip' + (x.id === s.id ? ' ativo' : '') + '" aria-pressed="' + (x.id === s.id) + '" data-acao="servico" data-id="' + esc(x.id) + '">' + esc(x.area) + '</button>').join('')
      + '</div><h3>Abertura</h3><p class="disc-abertura">' + esc(abertura) + '</p>'
      + '<h3>Perguntas (SPIN)</h3><ol class="disc-spin">' + s.perguntas.map((p) => '<li><span class="disc-letra' + (p.letra === 'I' ? ' forte' : '') + '">' + esc(p.letra) + '</span><div><b>' + esc(p.rotulo) + ':</b> ' + esc(p.texto)
        + (p.letra === 'I' ? '<small>A que mais se pula, e a que faz o cliente sentir o problema.</small>' : '') + '</div></li>').join('') + '</ol>'
      + '<h3>Mostrando valor</h3><dl class="disc-valor">' + s.valor.map((v) => '<dt>' + esc(v.rotulo) + '</dt><dd>' + esc(v.texto) + '</dd>').join('') + '</dl>'
      + (s.prova ? '<p class="disc-prova">' + esc(s.prova) + '</p>' : '')
      + '<h3>Proximo passo</h3><p>' + esc(s.proximoPasso) + '</p><p class="disc-nota">' + esc(e.dados.lembrete) + '</p>'
      + '<details class="disc-objecoes"><summary>Objecoes comuns (' + e.dados.objecoes.length + ')</summary><ul>'
      + e.dados.objecoes.map((o) => '<li><b>"' + esc(o.fala) + '"</b><span>' + esc(o.resposta) + '</span></li>').join('') + '</ul></details></section>';
  }

  function htmlSessao() {
    const item = itemAtual();
    const feitas = e.registros.length;
    let h = '';

    if (e.naoSalvas.length) {
      h += '<div class="disc-alerta" role="alert"><b>' + e.naoSalvas.length + ' ligacao(oes) nao foram salvas</b>'
        + e.naoSalvas.map((n, i) => '<div class="disc-alerta-linha"><span>' + esc(n.registro.empresa) + ' - ' + esc(n.erro) + '</span><button type="button" class="btn btn-secundario btn-pequeno" data-acao="salvar-de-novo" data-i="' + i + '">Salvar de novo</button></div>').join('')
        + '</div>';
    }
    if (e.avisos.length) {
      h += '<div class="disc-atencao"><ul>' + e.avisos.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul><button type="button" data-acao="fechar-avisos">Fechar</button></div>';
    }
    if (e.pausado && item) h += '<p class="disc-pausa">Sessao pausada. Nada liga sozinho, e voce voltou a ouvir e ser ouvido na sede.</p>';
    if (feitas === e.meta && e.meta > 0) h += '<p class="disc-meta">Meta da sessao batida: ' + e.meta + ' ligacoes. Pode encerrar, ou seguir ligando.</p>';

    if (!item) {
      h += '<section class="disc-bloco disc-fim"><h3>A fila acabou</h3><p>Todo mundo desta fila ja foi chamado.</p><button type="button" class="btn btn-primario" data-acao="encerrar">Ver resumo</button></section>';
    } else {
      if (e.fase === 'ligando') {
        h += '<section class="disc-bloco disc-ligando" aria-label="Resultado da ligacao"><div class="disc-ligando-topo"><h3>Como foi a ligacao?</h3><span data-vivo="duracao"></span></div>'
          + '<label class="disc-rotulo">Nota (opcional)<textarea rows="2" maxlength="2000" data-campo="nota" placeholder="O que a pessoa disse, a dor que apareceu, com quem falar...">' + esc(e.nota) + '</textarea></label>'
          + htmlResultados() + '</section>';
      }
      const contato = primeiroNome(item.contato);
      h += '<section class="disc-bloco disc-lead" aria-label="Lead atual">'
        + '<p class="disc-sobre">' + (item.retornoCombinado ? '<span>Retorno combinado · </span>' : '') + (item.tentativa === 1 ? 'Primeira ligacao' : item.tentativa + 'a tentativa') + ' · ' + esc(item.etapa) + '</p>'
        + '<h2>' + esc(item.nome) + (item.temperatura ? ' <i class="disc-temp disc-temp-' + esc(item.temperatura.toLowerCase()) + '">' + esc(item.temperatura) + '</i>' : '') + '</h2>'
        + '<p class="disc-onde">' + esc([item.segmento, item.cidadeUf].filter(Boolean).join(' · ') || 'Sem segmento nem cidade') + '</p>'
        + '<dl class="disc-dados"><div><dt>Contato</dt><dd>' + esc(item.contato || 'Sem nome no cadastro') + (item.cargo ? ' <span>· ' + esc(item.cargo) + '</span>' : '') + '</dd></div>'
        + '<div><dt>Telefone</dt><dd>' + esc(item.telefoneFormatado) + '</dd></div>'
        + '<div class="largo"><dt>Ultima ligacao</dt><dd>' + (item.ultima ? esc(item.ultima.rotulo) + ' em ' + esc(item.ultima.data) + (item.ultima.nota ? '<span class="disc-citacao">"' + esc(item.ultima.nota) + '"</span>' : '') : 'Nunca recebeu ligacao pelo discador') + '</dd></div></dl>';
      if (e.fase !== 'ligando') {
        h += (e.fase === 'contagem' && !e.pausado ? '<p class="disc-contagem" aria-live="polite">Ligando sozinho em <span data-vivo="restante">' + e.restante + '</span>...</p>' : '')
          + '<a class="disc-ligar' + (e.pausado ? ' desligado' : '') + '" data-acao="ligar" href="tel:' + esc(item.telefone) + '"' + (e.pausado ? ' aria-disabled="true"' : '') + '>'
          + (e.fase === 'contagem' ? 'Ligar agora' : 'Ligar' + (contato ? ' pra ' + esc(contato) : '')) + '</a>';
      }
      h += '</section>' + htmlRoteiro(item);
    }

    const naFila = Math.max(e.fila.length - e.indice, 0);
    h += '<div class="disc-rodape"><div class="disc-rodape-linha"><span><b>' + feitas + '</b> de ' + e.meta + ' nesta sessao · ' + naFila + ' na fila</span><span>Hoje: ' + (e.dados.jaHoje + feitas) + '</span></div>'
      + '<div class="disc-barra" role="progressbar" aria-valuemin="0" aria-valuemax="' + e.meta + '" aria-valuenow="' + feitas + '" aria-label="Meta da sessao"><div style="width:' + Math.min(feitas / Math.max(e.meta, 1), 1) * 100 + '%"></div></div>'
      + '<div class="disc-rodape-botoes">'
      + '<button type="button" class="btn btn-secundario btn-pequeno" data-acao="pausar"' + (e.fase === 'ligando' || !item ? ' disabled' : '') + '>' + (e.pausado ? 'Retomar' : 'Pausar') + '</button>'
      + '<button type="button" class="btn btn-secundario btn-pequeno" data-acao="pular"' + (e.fase === 'ligando' || !item ? ' disabled' : '') + '>Pular</button>'
      + '<button type="button" class="btn btn-secundario btn-pequeno" data-acao="encerrar">Encerrar</button></div></div>';
    return h;
  }

  function htmlResumo() {
    const reg = e.registros;
    const conversas = reg.filter((r) => { const o = resultado(r.resultado); return o && o.conversou; }).length;
    const conta = (v) => reg.filter((r) => r.resultado === v).length;
    const segundos = reg.reduce((s, r) => s + (r.segundos || 0), 0);
    const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
    const marcados = reg.filter((r) => r.resultado === 'reuniao_marcada' || r.resultado === 'pediu_retorno');
    const naoSalvas = e.naoSalvas.length;
    return '<p class="disc-sub">' + duracao(segundos) + ' em ligacao' + (e.dados ? ' · hoje, somando tudo: ' + plural(e.dados.jaHoje, 'ligacao', 'ligacoes') : '') + '</p>'
      + (naoSalvas ? '<div class="disc-alerta" role="alert">' + naoSalvas + ' ligacao(oes) desta sessao nao foram salvas e nao entram na meta.</div>' : '')
      + '<div class="disc-numeros">'
      + [[reg.length, 'ligacao', 'ligacoes'], [conversas, 'conversa', 'conversas'], [conta('reuniao_marcada'), 'reuniao marcada', 'reunioes marcadas'], [conta('pediu_retorno'), 'retorno combinado', 'retornos combinados']]
        .map((n) => '<div><b>' + n[0] + '</b><span>' + (n[0] === 1 ? n[1] : n[2]) + '</span></div>').join('')
      + '</div>'
      + (marcados.length ? '<section class="disc-bloco"><h3>Proximos passos (ja estao nas Atividades do CRM)</h3><ul class="disc-lista">'
        + marcados.map((m) => '<li><span>' + esc(m.empresa) + '</span><em>' + (m.resultado === 'reuniao_marcada' ? 'Reuniao' : 'Retorno') + ' · ' + formatarData(m.data) + (m.hora ? ' as ' + esc(m.hora) : '') + '</em></li>').join('') + '</ul></section>' : '')
      + (reg.length ? '<section class="disc-bloco"><h3>Por resultado</h3><ul class="disc-lista">'
        + e.dados.resultados.filter((o) => conta(o.valor)).map((o) => '<li><span>' + esc(o.rotulo) + '</span><b>' + conta(o.valor) + '</b></li>').join('') + '</ul></section>' : '')
      + '<button type="button" class="btn btn-primario" data-acao="nova-sessao"' + (e.dados ? '' : ' disabled') + '>Nova sessao</button>';
  }

  function render() {
    if (!corpo) return;
    let h;
    if (e.tela === 'carregando') h = '<p class="disc-sub">Carregando o discador...</p>';
    else if (e.tela === 'aviso') h = htmlAviso();
    else if (e.tela === 'montar') h = htmlMontar();
    else if (e.tela === 'sessao') h = htmlSessao();
    else h = htmlResumo();
    corpo.innerHTML = h;
    painel.classList.toggle('em-sessao', e.tela === 'sessao');
    aoTique(); // ja preenche a duracao/contagem sem esperar o proximo tique
  }

  // ---- eventos ----------------------------------------------------------------
  let esperaFiltro = null;

  function aoClicar(ev) {
    const alvo = ev.target.closest('[data-acao]');
    if (!alvo || !corpo.contains(alvo)) return;
    const acao = alvo.dataset.acao;
    if (acao === 'ligar') {
      if (e.pausado) { ev.preventDefault(); return; }
      // SEM preventDefault: e o proprio link que abre o discador do celular.
      // O redesenho fica pro proximo ciclo, com o link ainda na pagina.
      comecarLigacao();
      setTimeout(render, 0);
      return;
    }
    if (acao === 'resultado') escolher(alvo.dataset.valor);
    else if (acao === 'confirmar' && e.escolhido) confirmar(e.escolhido);
    else if (acao === 'voltar-resultado') { e.escolhido = null; render(); }
    else if (acao === 'servico') { e.servicoId = alvo.dataset.id; render(); }
    else if (acao === 'pausar') alternarPausa();
    else if (acao === 'pular') pular();
    else if (acao === 'encerrar') encerrar();
    else if (acao === 'comecar') comecarSessao();
    else if (acao === 'nova-sessao') { e.tela = 'montar'; render(); }
    else if (acao === 'salvar-de-novo') tentarDeNovo(Number(alvo.dataset.i));
    else if (acao === 'fechar-avisos') { e.avisos = []; render(); }
    else if (acao === 'recarregar') abrirECarregar(true);
  }

  function aoDigitar(ev) {
    const campo = ev.target.dataset.campo;
    const filtro = ev.target.dataset.filtro;
    if (filtro) {
      e.filtros[filtro] = ev.target.value;
      clearTimeout(esperaFiltro);
      esperaFiltro = setTimeout(carregarFila, 250); // o filtro roda no CRM
      return;
    }
    if (!campo) return;
    if (campo === 'nota') e.nota = ev.target.value;
    else if (campo === 'data') {
      // Sem redesenhar: cada digito da data redesenharia o painel e o campo
      // perderia o foco no meio. So o botao Confirmar depende disto.
      e.data = ev.target.value;
      const confirmarBtn = corpo.querySelector('[data-acao="confirmar"]');
      if (confirmarBtn) confirmarBtn.disabled = !e.data;
    }
    else if (campo === 'hora') e.hora = ev.target.value;
    else if (campo === 'meta') e.meta = Math.max(1, Math.min(200, Number(ev.target.value) || 1));
    else if (campo === 'intervalo') { e.intervalo = Number(ev.target.value) === 4 ? 4 : 3; e.restante = e.intervalo; }
    else if (campo === 'discarSozinho') e.discarSozinho = ev.target.checked;
  }

  // So os numeros 1-8, e so com a ligacao em andamento: letra, aqui, anda com
  // o boneco (WASD).
  function aoTeclar(ev) {
    if (!e.aberto || e.tela !== 'sessao' || e.fase !== 'ligando' || e.escolhido) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const a = document.activeElement;
    const t = a ? (a.tagName || '').toLowerCase() : '';
    if (t === 'input' || t === 'textarea' || t === 'select' || (a && a.isContentEditable)) return;
    const opcao = ((e.dados && e.dados.resultados) || []).find((r) => r.tecla === ev.key);
    if (!opcao) return;
    ev.preventDefault();
    escolher(opcao.valor);
  }

  // No celular, abrir o discador esconde a aba; voltar mostra de novo. E a
  // unica pista que o navegador da de que a ligacao acabou.
  function aoMudarVisibilidade() {
    if (e.tela !== 'sessao' || e.fase !== 'ligando') return;
    if (document.visibilityState === 'hidden') {
      e.saiu = true;
    } else if (e.saiu && !e.voltouEm) {
      e.voltouEm = new Date().toISOString();
      aoTique();
    }
  }

  // ---- abrir / fechar -----------------------------------------------------------
  async function abrirECarregar(forcar) {
    if (e.tela === 'sessao' && !forcar) return; // sessao em andamento: so mostra
    e.tela = 'carregando';
    e.podeTentarDeNovo = false;
    render();
    const estado = await pedir('GET', '/api/discador/estado');
    if (!estado.ok) { e.tela = 'aviso'; e.aviso = estado.erro; e.podeTentarDeNovo = true; render(); return; }
    if (!estado.json.pode) { e.tela = 'aviso'; e.aviso = estado.json.motivo; render(); return; }
    await carregarFila();
  }

  function abrir() {
    e.aberto = true;
    painel.classList.remove('oculto');
    botao.classList.add('ativo');
    if (window.Paineis) Paineis.abriu('discador');
    if (e.tela !== 'sessao' && e.tela !== 'resumo') abrirECarregar(false);
    else render();
  }

  function fechar() {
    e.aberto = false;
    painel.classList.add('oculto');
    botao.classList.remove('ativo');
    // Fechou no meio da sessao, entre uma ligacao e outra: vira pausa, e a
    // pessoa volta a ouvir a sede. Com a ligacao em andamento, fica como esta -
    // ela esta no telefone, e o resultado espera o painel abrir de novo.
    if (e.tela === 'sessao' && e.fase !== 'ligando' && itemAtual() && !e.pausado) alternarPausa();
    if (window.Paineis) Paineis.fechou('discador');
  }
  if (window.Paineis) Paineis.registrar('discador', { fechar, botao: 'btn-discador', esc: false });

  async function init() {
    painel = document.getElementById('painel-discador');
    corpo = document.getElementById('discador-corpo');
    botao = document.getElementById('btn-discador');
    if (!painel || !corpo || !botao) return;

    botao.addEventListener('click', () => (e.aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-discador').addEventListener('click', fechar);
    corpo.addEventListener('click', aoClicar);
    corpo.addEventListener('input', aoDigitar);
    corpo.addEventListener('change', aoDigitar);
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    tique = setInterval(aoTique, 250);

    // O botao so aparece onde o discador esta ligado (a sede que tem CRM). Nas
    // sedes de cliente ele nem existe pra quem olha.
    const estado = await pedir('GET', '/api/discador/estado');
    if (estado.ok && estado.json.ligado) botao.classList.remove('oculto');
  }

  window.Discador = { init, abrir, fechar, _estado: e };
})();
