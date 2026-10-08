// Aba de quadros: os quadros das diretorias, um botao por quadro no topo.
// Ver docs/plano-kanban-crm.md e docs/plano-trello.md.
//
// Somente leitura: o quadro continua sendo editado onde ele mora (o Kanban do CRM ou o
// Trello). Aqui e pra bater o olho sem sair da sede.
//
// Cada diretoria tem o SEU quadro (Comercial, Gente e Gestao, Marketing...). O servidor
// manda a lista de quadros que ESTA pessoa pode ver (`setores`) e o quadro pedido; a
// escolha fica lembrada neste navegador. Os arquivos e o evento do socket ainda se
// chamam "trello" (nome de quando so havia o Trello).
(function () {
  // Cores das etiquetas do Trello -> cor de tela. Sao os nomes que a API manda.
  const COR_ETIQUETA = {
    green: '#1f9c58', yellow: '#d9a800', orange: '#e07b20', red: '#d64541',
    purple: '#8b5cd6', blue: '#2f74d0', sky: '#33a3c4', lime: '#61bd4f',
    pink: '#e56ba8', black: '#4a5162',
  };
  const CHAVE_SETOR = 'sede:trello-setor';

  let painel, colunasEl, tituloEl, linkEl, avisoEl, setoresEl, notaEl;
  let aberto = false;
  let carregado = false;
  let setores = [];        // os que o servidor deixou esta pessoa ver
  let atual = null;        // a chave do setor na tela
  let pedido = null;       // a chave do setor que a pessoa acabou de escolher

  function setorLembrado() {
    try { return localStorage.getItem(CHAVE_SETOR) || undefined; } catch (e) { return undefined; }
  }

  function lembrarSetor(chave) {
    try { localStorage.setItem(CHAVE_SETOR, chave); } catch (e) { /* sem storage: escolhe de novo */ }
  }

  // Prazo que ja foi cumprido (o "concluido" do cartao) nao fica "atrasado": a tarefa esta feita.
  function rotuloDoPrazo(dias, data, concluido) {
    if (dias < 0) return concluido ? { texto: data, atrasado: false } : { texto: data + ' (atrasado)', atrasado: true };
    if (dias === 0) return { texto: 'hoje', atrasado: false };
    if (dias === 1) return { texto: 'amanha', atrasado: false };
    return { texto: data, atrasado: false };
  }

  function textoPrazo(valor, concluido) {
    const doisDigitos = (n) => String(n).padStart(2, '0');

    // Prazo do CRM: um DIA ("2026-09-25"), e nao um instante. O dia 25 e o dia 25 em
    // qualquer fuso - lido como instante, no Brasil viraria o dia 24 as 21h. Conta-se
    // por dia de calendario, e so fica atrasado depois que o dia do prazo termina.
    const soDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
    if (soDia) {
      const dia = new Date(Number(soDia[1]), Number(soDia[2]) - 1, Number(soDia[3]));
      if (!Number.isFinite(dia.getTime())) return null;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return rotuloDoPrazo(Math.round((dia - hoje) / 86400000), soDia[3] + '/' + soDia[2], concluido);
    }

    // Prazo do Trello: um instante, com hora.
    const d = new Date(valor);
    if (!Number.isFinite(d.getTime())) return null;
    return rotuloDoPrazo(Math.round((d - new Date()) / 86400000), doisDigitos(d.getDate()) + '/' + doisDigitos(d.getMonth() + 1), concluido);
  }

  // Um selinho do rodape do cartao (checklist, comentarios, anexos...)
  function selo(texto, dica, extra) {
    const s = document.createElement('span');
    s.className = 'trello-selo' + (extra ? ' ' + extra : '');
    s.textContent = texto;
    s.title = dica;
    return s;
  }

  function montarCartao(c) {
    const el = document.createElement('a');
    el.className = 'trello-cartao';
    el.href = c.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';

    if (c.etiquetas.length) {
      const faixa = document.createElement('div');
      faixa.className = 'trello-etiquetas';
      c.etiquetas.forEach((e) => {
        const t = document.createElement('span');
        t.className = 'trello-etiqueta';
        t.style.background = COR_ETIQUETA[e.cor] || '#8b98a8';
        t.textContent = e.nome;
        faixa.appendChild(t);
      });
      el.appendChild(faixa);
    }

    const nome = document.createElement('div');
    nome.className = 'trello-cartao-nome';
    nome.textContent = c.nome;
    el.appendChild(nome);

    const rodape = document.createElement('div');
    rodape.className = 'trello-cartao-rodape';

    if (c.prazo) {
      const p = textoPrazo(c.prazo, c.prazoConcluido);
      if (p) {
        const badge = document.createElement('span');
        badge.className = 'trello-prazo'
          + (c.prazoConcluido ? ' concluido' : (p.atrasado ? ' atrasado' : ''));
        badge.textContent = p.texto;
        rodape.appendChild(badge);
      }
    }

    // So o Kanban do CRM manda estes campos (o Trello nao). Mesma ordem da tela do CRM.
    if (c.temDescricao) rodape.appendChild(selo('≡', 'Tem descricao'));
    if (c.checklist && c.checklist.total > 0) {
      rodape.appendChild(selo(
        '✓ ' + c.checklist.feitos + '/' + c.checklist.total,
        'Checklist: ' + c.checklist.feitos + ' de ' + c.checklist.total + ' itens',
        c.checklist.feitos === c.checklist.total ? 'completo' : ''
      ));
    }
    if (c.comentarios > 0) rodape.appendChild(selo('💬 ' + c.comentarios, c.comentarios + (c.comentarios === 1 ? ' comentario' : ' comentarios')));
    if (c.anexos > 0) rodape.appendChild(selo('📎 ' + c.anexos, c.anexos + (c.anexos === 1 ? ' anexo' : ' anexos')));

    if ((c.membros || []).length) {
      const m = document.createElement('span');
      m.className = 'trello-membros';
      // so as iniciais: o cartao e estreito
      m.textContent = c.membros
        .map((n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase())
        .join(' ');
      m.title = c.membros.join(', ');
      rodape.appendChild(m);
    }

    if (rodape.childNodes.length) el.appendChild(rodape);
    return el;
  }

  // Os botoes dos setores. Com um so, nao ha o que escolher: some.
  function pintarSetores() {
    setoresEl.innerHTML = '';
    setoresEl.classList.toggle('oculto', setores.length < 2);
    setores.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'trello-setor' + (s.chave === atual ? ' ativo' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', s.chave === atual ? 'true' : 'false');
      b.textContent = s.nome;
      b.title = s.origem === 'crm' ? 'Kanban do CRM' : 'Quadro do Trello';
      if (s.restrito) {
        b.title += ' - so a diretoria ve este quadro';
        b.classList.add('restrito');
      }
      b.addEventListener('click', () => escolher(s.chave));
      setoresEl.appendChild(b);
    });
  }

  function horaDe(ms) {
    return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function receber(dados) {
    // A resposta de um setor que a pessoa ja largou (clicou em outro antes de ela
    // chegar) nao pode ir por cima do que ela escolheu depois. Mas se o servidor nem
    // lista mais o setor pedido (a diretoria trocou os quadros, ou a pessoa perdeu o
    // acesso a ele), a resposta que veio e a que vale: senao a aba ficava presa em
    // "Carregando..." ate recarregar a pagina.
    const pedidoAindaExiste = (dados.setores || []).some((s) => s.chave === pedido);
    if (pedido && pedidoAindaExiste && dados.atual && dados.atual !== pedido) return;

    carregado = true;
    setores = dados.setores || [];
    atual = dados.atual || null;
    pedido = atual;
    if (atual) lembrarSetor(atual);

    avisoEl.classList.add('oculto');
    colunasEl.innerHTML = '';
    pintarSetores();

    if (dados.indisponivel) {
      avisoEl.textContent = dados.indisponivel;
      avisoEl.classList.remove('oculto');
    }

    tituloEl.textContent = dados.nome || 'Quadros';
    if (dados.url) {
      linkEl.href = dados.url;
      linkEl.textContent = dados.origem === 'crm' ? 'Abrir no CRM' : 'Abrir no Trello';
      linkEl.classList.remove('oculto');
    } else {
      linkEl.classList.add('oculto');
    }

    // "atualizado as 14:32" (o quadro nao muda sozinho na tela) e, quando o setor
    // divide o quadro com outro, o que esta valendo
    const partes = [];
    if (dados.origem === 'crm') partes.push('Kanban do CRM');
    else if (dados.origem === 'trello') partes.push('Trello');
    if (dados.atualizadoEm) partes.push('atualizado as ' + horaDe(dados.atualizadoEm));
    if (dados.filtro && dados.filtro.length) partes.push('so cartoes com a etiqueta ' + dados.filtro.join(', '));
    notaEl.textContent = partes.join(' · ');
    notaEl.classList.toggle('oculto', !partes.length);

    if (!(dados.listas || []).length && !dados.indisponivel) {
      const vazio = document.createElement('div');
      vazio.className = 'trello-vazio trello-vazio-geral';
      vazio.textContent = 'Esse quadro nao tem listas abertas.';
      colunasEl.appendChild(vazio);
    }

    (dados.listas || []).forEach((lista) => {
      const col = document.createElement('div');
      col.className = 'trello-coluna';

      const topo = document.createElement('div');
      topo.className = 'trello-coluna-topo';
      const nome = document.createElement('span');
      nome.textContent = lista.nome;
      const conta = document.createElement('b');
      // `total` e o da lista inteira (a tela recebe no maximo uns 100 cartoes por coluna)
      const total = Number.isInteger(lista.total) ? lista.total : lista.cartoes.length;
      conta.textContent = total;
      topo.appendChild(nome);
      topo.appendChild(conta);
      col.appendChild(topo);

      const corpo = document.createElement('div');
      corpo.className = 'trello-coluna-corpo';
      if (lista.cartoes.length === 0) {
        const vazio = document.createElement('div');
        vazio.className = 'trello-vazio';
        vazio.textContent = 'Nada aqui';
        corpo.appendChild(vazio);
      } else {
        lista.cartoes.forEach((c) => corpo.appendChild(montarCartao(c)));
        if (total > lista.cartoes.length) {
          const mais = document.createElement('a');
          mais.className = 'trello-mais';
          mais.href = dados.url || '#';
          mais.target = '_blank';
          mais.rel = 'noopener noreferrer';
          mais.textContent = '+ ' + (total - lista.cartoes.length) + ' cartoes no quadro';
          corpo.appendChild(mais);
        }
      }
      col.appendChild(corpo);

      colunasEl.appendChild(col);
    });
  }

  function pedir(extra) {
    Network.pedirTrello(Object.assign({ quadro: pedido || setorLembrado() }, extra || {}));
  }

  // A pessoa clicou em outro setor
  function escolher(chave) {
    if (chave === atual && carregado) return;
    pedido = chave;
    atual = chave;
    colunasEl.innerHTML = '';
    const s = setores.find((x) => x.chave === chave);
    avisoEl.textContent = 'Carregando o quadro' + (s ? ' de ' + s.nome : '') + '...';
    avisoEl.classList.remove('oculto');
    pintarSetores();
    pedir();
  }

  function abrir() {
    aberto = true;
    painel.classList.remove('oculto');
    if (window.Paineis) Paineis.abriu('quadros');
    if (!carregado) {
      avisoEl.textContent = 'Carregando o quadro...';
      avisoEl.classList.remove('oculto');
    }
    pedir();
  }

  function fechar() {
    aberto = false;
    painel.classList.add('oculto');
    if (window.Paineis) Paineis.fechou('quadros');
  }
  if (window.Paineis) Paineis.registrar('quadros', { fechar, botao: 'btn-trello', esc: true });

  function init() {
    painel = document.getElementById('painel-trello');
    colunasEl = document.getElementById('trello-colunas');
    tituloEl = document.getElementById('trello-titulo');
    linkEl = document.getElementById('trello-link');
    avisoEl = document.getElementById('trello-aviso');
    setoresEl = document.getElementById('trello-setores');
    notaEl = document.getElementById('trello-nota');

    document.getElementById('btn-trello').addEventListener('click', () => (aberto ? fechar() : abrir()));
    document.getElementById('btn-fechar-trello').addEventListener('click', fechar);
    // "Atualizar" de verdade: passa por cima do cache de 2 minutos do servidor (que
    // limita a uma vez a cada 10 s por quadro). Antes o botao so refazia o pedido, e
    // dentro da janela do cache devolvia o mesmo quadro - parecia quebrado.
    document.getElementById('btn-atualizar-trello').addEventListener('click', () => {
      avisoEl.textContent = 'Atualizando...';
      avisoEl.classList.remove('oculto');
      pedir({ forcar: true });
    });

    Network.on('trello', receber);
  }

  window.Trello = { init, abrir };
})();
