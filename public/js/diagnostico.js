// Diagnostico de mudanca de hospedagem. Ver public/diagnostico.html e
// docs/hospedar-na-hostinger.md.
//
// A regra desta pagina: cada linha diz O QUE QUEBRA, nao so "ok" ou "falhou".
// Quem abre isto esta com a sede num endereco novo, sem saber por que nada
// funciona - "WebSocket: nao" nao ajuda; "o chat e a chamada vao cair" ajuda.
//
// Arquivo separado porque a CSP recusa <script> inline, de proposito.
(function () {
  const ESPERA_WS_MS = 5000;

  function linha(lista, { estado, titulo, detalhe }) {
    const li = document.createElement('li');
    li.className = 'diag-item diag-' + estado;
    const marca = document.createElement('span');
    marca.className = 'diag-marca';
    marca.textContent = estado === 'ok' ? '✓' : (estado === 'ruim' ? '✗' : '!');
    marca.setAttribute('aria-hidden', 'true');
    const texto = document.createElement('div');
    const forte = document.createElement('strong');
    forte.textContent = titulo;
    texto.appendChild(forte);
    if (detalhe) {
      const p = document.createElement('p');
      p.textContent = detalhe;
      texto.appendChild(p);
    }
    li.append(marca, texto);
    lista.appendChild(li);
    return li;
  }

  function limpar(id) {
    const lista = document.getElementById(id);
    lista.innerHTML = '';
    return lista;
  }

  // ------------------------------------------------------------- 1. servidor

  async function verServidor() {
    const lista = limpar('lista-servidor');
    let d;
    try {
      const r = await fetch('/api/diagnostico', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('resposta ' + r.status);
      d = await r.json();
    } catch (e) {
      linha(lista, {
        estado: 'ruim',
        titulo: 'O servidor da sede nao respondeu',
        detalhe: 'A pagina abriu, entao tem alguem servindo os arquivos - mas /api/diagnostico '
          + 'nao respondeu. Em hospedagem compartilhada isso costuma ser o servidor de PHP '
          + 'entregando a pasta, sem o Node rodando por tras. Erro: ' + e.message,
      });
      return;
    }

    linha(lista, {
      estado: d.nodeSuficiente ? 'ok' : 'ruim',
      titulo: 'Node ' + d.node + (d.nodeSuficiente ? '' : ' - velho demais (precisa 20.12 ou mais novo)'),
      detalhe: d.nodeSuficiente
        ? 'Versao suficiente pra ler o arquivo .env sozinho.'
        : 'ESTA E A FALHA MAIS SILENCIOSA DO PROJETO: em Node antigo o .env nao carrega, '
          + 'e Google, Trello, Drive e backup somem sem nenhum erro na tela. Suba a versao do Node.',
    });

    linha(lista, {
      estado: d.producao ? 'ok' : 'atencao',
      titulo: d.producao ? 'Rodando como producao' : 'NAO esta como producao (NODE_ENV)',
      detalhe: d.producao
        ? 'Cookie de sessao vai como Secure e o modo sem login fica desligado.'
        : 'Defina NODE_ENV=production no servidor. Sem isso o cookie de sessao nao exige HTTPS.',
    });

    linha(lista, {
      estado: d.dadosGravavel ? 'ok' : 'ruim',
      titulo: d.dadosGravavel ? 'A pasta de dados aceita escrita' : 'A pasta de dados NAO aceita escrita',
      detalhe: d.dadosGravavel
        ? 'Contas, chat, mesas e decoracao conseguem ser salvos.'
        : 'Ninguem consegue criar conta, e nada do que acontecer na sede sobrevive. '
          + 'Confira a permissao da pasta (ou a variavel DATA_DIR).',
    });

    linha(lista, {
      estado: d.ipPorPessoa ? 'ok' : 'ruim',
      titulo: d.ipPorPessoa
        ? 'O servidor enxerga o IP de cada pessoa'
        : 'O servidor ve todo mundo com o MESMO IP (proxy sem X-Forwarded-For)',
      detalhe: d.ipPorPessoa
        ? (d.atrasDeProxy ? 'Atras de proxy, e o endereco real esta chegando.' : 'Conexao direta, sem proxy no meio.')
        : 'O freio de forca bruta conta erro por IP: assim, dez tentativas erradas de pessoas '
          + 'DIFERENTES trancam o login pra sede inteira. Ajuste o proxy pra mandar X-Forwarded-For.',
    });

    linha(lista, {
      estado: d.contas > 0 ? 'ok' : 'atencao',
      titulo: d.contas + (d.contas === 1 ? ' conta' : ' contas') + ', ' + d.diretoria + ' na diretoria',
      detalhe: d.contas === 0
        ? 'Sede zerada: a primeira pessoa que entrar com o Google vira diretoria (ou quem estiver em DIRETORIA_EMAILS).'
        : (d.diretoria === 0 ? 'NINGUEM e diretoria: ninguem consegue convidar, decorar nem gerenciar contas.' : ''),
    });

    // "Quadros das diretorias" esta ligado se o Kanban do CRM OU o Trello estiver
    const ligadas = Object.assign({}, d.integracoes, { quadros: !!((d.integracoes || {}).kanban || (d.integracoes || {}).trello) });
    const integracoes = [
      ['google', 'Entrar com o Google e a Agenda', 'sem isso, e-mail da empresa entra com senha - conferido so se o e-mail (abaixo) estiver ligado'],
      ['email', 'E-mail (confirmar cadastro e senha nova)', 'cadastro com senha entra sem conferir o e-mail, e quem esquece a senha depende da diretoria (em producao, precisa tambem de SITE_URL)'],
      ['drive', 'Biblioteca no Drive', 'sem isso a estante mostra so os PDFs que estiverem na pasta local'],
      ['quadros', 'Quadros das diretorias (Kanban do CRM ou Trello)', 'a aba de quadros abre com aviso de "nao configurado"'],
      ['turn', 'TURN da Cloudflare', 'chamada de video pode nao conectar em rede de empresa/faculdade'],
      ['backup', 'Backup automatico no Drive', 'se o disco sumir, nao ha de onde restaurar'],
    ];
    integracoes.forEach(([chave, nome, consequencia]) => {
      const ligada = !!ligadas[chave];
      linha(lista, {
        estado: ligada ? 'ok' : 'atencao',
        titulo: nome + (ligada ? ': configurado' : ': nao configurado'),
        detalhe: ligada ? '' : 'Falta variavel de ambiente - ' + consequencia + '.',
      });
    });
  }

  // ------------------------------------------------------------- 2. WebSocket
  //
  // Exportada (window.Diagnostico) pra dar pra provar que ela SABE FALHAR:
  // aponta num endereco onde nao ha sede e ela tem que dizer que nao conectou.
  // Teste que so sabe passar nao e teste - foi o erro do "abre duas abas".
  function testarWebSocket(url, prazoMs) {
    return new Promise((resolve) => {
      let ws;
      let pronto = false;
      const t0 = Date.now();
      const acabar = (r) => {
        if (pronto) return;
        pronto = true;
        clearTimeout(relogio);
        try { if (ws) ws.close(); } catch (e) { /* ja fechou */ }
        resolve(Object.assign({ ms: Date.now() - t0 }, r));
      };
      // Upgrade bloqueado as vezes nao da erro: so nunca abre. Sem prazo, esta
      // pagina ficaria "testando..." pra sempre e pareceria travada.
      const relogio = setTimeout(() => acabar({ ok: false, motivo: 'prazo' }), prazoMs || ESPERA_WS_MS);

      try {
        ws = new WebSocket(url);
      } catch (e) {
        return acabar({ ok: false, motivo: 'recusado' });
      }
      ws.onmessage = (ev) => {
        // O socket.io responde o handshake com um pacote que comeca em "0".
        // Receber isso prova as DUAS coisas: o proxy deixou o upgrade passar E
        // quem respondeu e a sede, nao um proxy qualquer.
        acabar(String(ev.data).startsWith('0')
          ? { ok: true }
          : { ok: false, motivo: 'resposta-estranha' });
      };
      ws.onerror = () => acabar({ ok: false, motivo: 'recusado' });
      ws.onclose = () => acabar({ ok: false, motivo: 'fechou' });
    });
  }

  function enderecoDoSocket() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://')
      + location.host + '/socket.io/?EIO=4&transport=websocket';
  }

  async function verConexao() {
    const lista = limpar('lista-conexao');
    const r = await testarWebSocket(enderecoDoSocket());
    if (r.ok) {
      linha(lista, {
        estado: 'ok',
        titulo: 'WebSocket passou (' + r.ms + ' ms)',
        detalhe: 'O proxy deixou a conexao subir e quem respondeu foi a sede. Chat, presenca e chamada funcionam.',
      });
      return;
    }
    const porque = {
      prazo: 'abriu o pedido e ficou no vazio - upgrade bloqueado costuma ser assim, sem erro nenhum',
      recusado: 'o navegador recusou na hora',
      fechou: 'a conexao caiu antes da primeira resposta',
      'resposta-estranha': 'alguem respondeu, mas nao foi a sede (tem proxy respondendo no lugar dela)',
    }[r.motivo] || r.motivo;
    linha(lista, {
      estado: 'ruim',
      titulo: 'WebSocket NAO passou (' + r.ms + ' ms)',
      detalhe: 'O que aconteceu: ' + porque + '. Nesta hospedagem o chat vai ficar lento, a presenca '
        + 'vai piscar e a chamada pode nao conectar. E o motivo de hospedagem compartilhada '
        + 'nao servir pra sede. Num servidor proprio, e a configuracao do nginx (as linhas de '
        + 'Upgrade e Connection).',
    });
  }

  // ---------------------------------------------------------- 3. cabecalhos

  async function verCabecalhos() {
    const lista = limpar('lista-cabecalhos');
    let r;
    try {
      // Mesma origem: da pra ler todos os cabecalhos da resposta.
      r = await fetch('/api/saude', { credentials: 'same-origin', cache: 'no-store' });
    } catch (e) {
      linha(lista, { estado: 'ruim', titulo: 'Nao consegui conferir', detalhe: e.message });
      return;
    }

    const esperados = [
      ['content-security-policy', 'Content-Security-Policy', 'e o que impede um script estranho de rodar dentro da sede'],
      ['x-content-type-options', 'X-Content-Type-Options', 'impede o navegador de "adivinhar" o tipo de um arquivo'],
      ['x-frame-options', 'X-Frame-Options', 'impede por a sede dentro de um iframe de outro site (camera e microfone na tela)'],
      ['referrer-policy', 'Referrer-Policy', 'o endereco da sede nao viaja junto pro site que a pessoa clicar'],
    ];
    esperados.forEach(([chave, nome, pra]) => {
      const veio = r.headers.get(chave);
      linha(lista, {
        estado: veio ? 'ok' : 'ruim',
        titulo: nome + (veio ? ': chegou' : ': SUMIU no caminho'),
        detalhe: veio ? '' : 'O servidor manda este cabecalho - se ele nao chegou, quem tirou foi a '
          + 'hospedagem. Sem ele, ' + pra + '.',
      });
    });

    const hsts = r.headers.get('strict-transport-security');
    const https = location.protocol === 'https:';
    linha(lista, {
      estado: hsts ? 'ok' : (https ? 'ruim' : 'atencao'),
      titulo: 'Strict-Transport-Security: ' + (hsts ? 'chegou' : 'nao veio'),
      detalhe: hsts
        ? 'O navegador passa a exigir HTTPS neste endereco.'
        : (https
          ? 'Em HTTPS ele deveria vir. Confira se NODE_ENV=production esta definido no servidor.'
          : 'Esperado: a pagina esta em HTTP (desenvolvimento). Em producao, com HTTPS, ele aparece.'),
    });
  }

  async function rodarTudo() {
    document.getElementById('diag-endereco').textContent = location.origin;
    const botao = document.getElementById('diag-refazer');
    botao.disabled = true;
    limpar('lista-servidor').innerHTML = '<li class="diag-carregando">Perguntando pro servidor...</li>';
    limpar('lista-conexao').innerHTML = '<li class="diag-carregando">Testando...</li>';
    limpar('lista-cabecalhos').innerHTML = '<li class="diag-carregando">Conferindo...</li>';
    await Promise.all([verServidor(), verConexao(), verCabecalhos()]);
    botao.disabled = false;
  }

  document.getElementById('diag-refazer').addEventListener('click', rodarTudo);
  rodarTudo();

  window.Diagnostico = { testarWebSocket, enderecoDoSocket, rodarTudo };
})();
