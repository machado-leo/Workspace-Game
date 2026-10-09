(function () {
  const TILE_DEFS = [
    { id: 1, name: 'Parede', icon: '🧱', cor: '#334155' },
    { id: 54, name: 'Porta', icon: '🚪', cor: '#15803d' },
    { id: 3, name: 'Posto PC', icon: '🖥️', cor: '#b91c1c' },
    { id: 2, name: 'Mesa', icon: '🟫', cor: '#92400e' },
    { id: 15, name: 'Cadeira ↑', icon: '🪑', cor: '#7c3aed' },
    { id: 37, name: 'Cadeira ↓', icon: '🪑', cor: '#7c3aed' },
    { id: 38, name: 'Cadeira ←', icon: '🪑', cor: '#7c3aed' },
    { id: 39, name: 'Cadeira →', icon: '🪑', cor: '#7c3aed' },
    { id: 13, name: 'Balcão', icon: '🟧', cor: '#ea580c' },
    { id: 32, name: 'Cadeira Verm.', icon: '🪑', cor: '#dc2626' },
    { id: 40, name: 'Cad. Verm. ↓', icon: '🪑', cor: '#dc2626' },
    { id: 17, name: 'Mesa Reunião', icon: '🪵', cor: '#78350f' },
    { id: 50, name: 'Mesa Redonda', icon: '⭕', cor: '#854d0e' },
    { id: 4, name: 'Sofá Cima', icon: '🛋️', cor: '#1e40af' },
    { id: 5, name: 'Sofá Assento', icon: '🛋️', cor: '#2563eb' },
    { id: 31, name: 'Poltrona', icon: '🛋️', cor: '#4338ca' },
    { id: 8, name: 'Planta', icon: '🪴', cor: '#166534' },
    { id: 28, name: 'Planta Grande', icon: '🌿', cor: '#15803d' },
    { id: 18, name: 'Janela (Vidro)', icon: '🪟', cor: '#38bdf8' },
    { id: 34, name: 'TV Parede', icon: '📺', cor: '#0284c7' },
    { id: 11, name: 'Lousa', icon: '📋', cor: '#e2e8f0' },
    { id: 33, name: 'Bebedouro', icon: '🚰', cor: '#0ea5e9' },
    { id: 51, name: 'Geladeira', icon: '❄️', cor: '#cbd5e1' },
    { id: 7, name: 'Estante', icon: '📚', cor: '#b45309' },
    { id: 24, name: 'Impressora', icon: '🖨️', cor: '#475569' },
    { id: 0, name: 'Borracha (Chão)', icon: '🧽', cor: '#181b22' },
  ];

  let currentTool = 'paint'; // 'paint', 'rect', 'room', 'spawn'
  let selectedTileId = 1;
  let selectedRoomIdx = -1;
  let demarcatingRoom = false;
  let rectStart = null;

  let mapData = {
    cols: 30,
    rows: 40,
    versaoPlanta: 17,
    spawnPoints: [{ col: 13, row: 12 }],
    rooms: [],
    tiles: []
  };

  const canvas = document.getElementById('editorCanvas');
  const ctx = canvas.getContext('2d');
  const CELL_SIZE = 24;

  let isMouseDown = false;
  let mouseButton = 0; // 0: left, 2: right
  let lastHoverCell = { c: 0, r: 0 };

  const PISO_CORES = {
    ladrilho: '#2a3242',
    madeira: '#3d2b1f',
    madeira_clara: '#453523',
    carpete_azul: '#172554',
    carpete_roxo: '#3b0764',
    espinha_fria: '#262f3d',
    tijolo: '#2b2320',
    cinza: '#262a33',
    grama: '#14381e'
  };

  function notificar(msg, cor) {
    const el = document.getElementById('status-bar');
    if (!el) return;
    el.textContent = msg;
    el.style.color = cor || '#4ade80';
  }

  function buildPalette() {
    const container = document.getElementById('tiles-palette');
    if (!container) return;
    container.innerHTML = '';
    TILE_DEFS.forEach((t) => {
      const btn = document.createElement('div');
      btn.className = 'palette-btn' + (t.id === selectedTileId ? ' active' : '');
      btn.id = 'tile-btn-' + t.id;
      btn.innerHTML = `<span class="icon">${t.icon}</span><span>${t.name}</span>`;
      btn.addEventListener('click', () => selectTile(t.id));
      container.appendChild(btn);
    });
  }

  function selectTile(id) {
    selectedTileId = id;
    document.querySelectorAll('#tiles-palette .palette-btn').forEach((b) => b.classList.remove('active'));
    const activeBtn = document.getElementById('tile-btn-' + id);
    if (activeBtn) activeBtn.classList.add('active');
    if (currentTool !== 'paint' && currentTool !== 'rect') setTool('paint');
  }

  function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.sidebar .palette-grid:first-of-type .palette-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.getElementById('tool-' + tool);
    if (btn) btn.classList.add('active');
    demarcatingRoom = (tool === 'room');
    rectStart = null;
    render();
  }

  function resizeCanvas() {
    canvas.width = mapData.cols * CELL_SIZE;
    canvas.height = mapData.rows * CELL_SIZE;
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Chão das salas
    for (let r = 0; r < mapData.rows; r++) {
      for (let c = 0; c < mapData.cols; c++) {
        let sala = mapData.rooms.find((s) => r >= s.r0 && r <= s.r1 && c >= s.c0 && c <= s.c1);
        let piso = sala ? sala.piso : 'tijolo';
        ctx.fillStyle = PISO_CORES[piso] || '#181b22';
        ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    // 2. Linhas de grade sutis
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= mapData.cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL_SIZE, 0);
      ctx.lineTo(c * CELL_SIZE, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= mapData.rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL_SIZE);
      ctx.lineTo(canvas.width, r * CELL_SIZE);
      ctx.stroke();
    }

    // 3. Tiles / Móveis
    for (let r = 0; r < mapData.rows; r++) {
      for (let c = 0; c < mapData.cols; c++) {
        const t = mapData.tiles[r] ? mapData.tiles[r][c] : 0;
        if (t > 0) {
          const def = TILE_DEFS.find((d) => d.id === t);
          if (def) {
            ctx.fillStyle = def.cor;
            ctx.fillRect(c * CELL_SIZE + 1, r * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            if (CELL_SIZE >= 20) {
              ctx.font = '12px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(def.icon, (c + 0.5) * CELL_SIZE, (r + 0.5) * CELL_SIZE);
            }
          }
        }
      }
    }

    // 4. Retângulos das salas
    mapData.rooms.forEach((s, idx) => {
      const x = s.c0 * CELL_SIZE;
      const y = s.r0 * CELL_SIZE;
      const w = (s.c1 - s.c0 + 1) * CELL_SIZE;
      const h = (s.r1 - s.r0 + 1) * CELL_SIZE;

      ctx.strokeStyle = idx === selectedRoomIdx ? '#3b82f6' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = idx === selectedRoomIdx ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      // Nome da sala
      ctx.fillStyle = idx === selectedRoomIdx ? '#93c5fd' : 'rgba(255, 255, 255, 0.7)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.nome, x + 4, y + 12);
    });

    // 5. Spawn points
    (mapData.spawnPoints || []).forEach((sp) => {
      const c = Math.floor(sp.col);
      const r = Math.floor(sp.row);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc((c + 0.5) * CELL_SIZE, (r + 0.5) * CELL_SIZE, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 6. Retângulo de prévia de arrasto
    if (rectStart && (currentTool === 'rect' || currentTool === 'room')) {
      const c0 = Math.min(rectStart.c, lastHoverCell.c);
      const r0 = Math.min(rectStart.r, lastHoverCell.r);
      const c1 = Math.max(rectStart.c, lastHoverCell.c);
      const r1 = Math.max(rectStart.r, lastHoverCell.r);
      ctx.strokeStyle = currentTool === 'room' ? '#10b981' : '#60a5fa';
      ctx.lineWidth = 2;
      ctx.strokeRect(c0 * CELL_SIZE, r0 * CELL_SIZE, (c1 - c0 + 1) * CELL_SIZE, (r1 - r0 + 1) * CELL_SIZE);
    }
  }

  function getCellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);
    return {
      c: Math.max(0, Math.min(mapData.cols - 1, c)),
      r: Math.max(0, Math.min(mapData.rows - 1, r))
    };
  }

  function aplicarPintura(c, r, tileId) {
    if (mapData.tiles[r] && mapData.tiles[r][c] !== tileId) {
      mapData.tiles[r][c] = tileId;
      render();
    }
  }

  function renderRoomsList() {
    const list = document.getElementById('rooms-list');
    if (!list) return;
    list.innerHTML = '';
    mapData.rooms.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'room-item' + (idx === selectedRoomIdx ? ' active' : '');
      item.addEventListener('click', () => selecionarSala(idx));
      item.innerHTML = `
        <div class="room-header">
          <span class="room-name">${s.nome}</span>
          <div class="room-color-badge" style="background: ${PISO_CORES[s.piso] || '#888'};"></div>
        </div>
        <div class="room-desc">Piso: ${s.piso} | Som: ${s.som ? s.som.modo : 'perto'}</div>
      `;
      list.appendChild(item);
    });
  }

  function selecionarSala(idx) {
    selectedRoomIdx = idx;
    renderRoomsList();
    const editor = document.getElementById('room-editor');
    if (!editor) return;
    if (idx >= 0 && mapData.rooms[idx]) {
      editor.style.display = 'flex';
      const s = mapData.rooms[idx];
      document.getElementById('inp-room-name').value = s.nome;
      document.getElementById('inp-room-floor').value = s.piso || 'ladrilho';
      document.getElementById('inp-room-sound').value = s.som ? s.som.modo : 'perto';
    } else {
      editor.style.display = 'none';
    }
    render();
  }

  function atualizarSalaSelecionada() {
    if (selectedRoomIdx >= 0 && mapData.rooms[selectedRoomIdx]) {
      const s = mapData.rooms[selectedRoomIdx];
      s.nome = document.getElementById('inp-room-name').value;
      s.piso = document.getElementById('inp-room-floor').value;
      const modo = document.getElementById('inp-room-sound').value;
      s.som = { modo, alcance: modo === 'sala' ? 3 : 4 };
      renderRoomsList();
      render();
    }
  }

  function iniciarDemarcacaoSala() {
    setTool('room');
    notificar('Clique e arraste no mapa para definir os cantos da sala.', '#38bdf8');
  }

  function novaSala() {
    const id = 'sala_' + Date.now().toString(36);
    mapData.rooms.push({
      id,
      nome: 'Nova Sala',
      r0: 5, c0: 5, r1: 10, c1: 10,
      piso: 'ladrilho',
      som: { modo: 'sala', alcance: 3 }
    });
    selecionarSala(mapData.rooms.length - 1);
  }

  async function carregarDoServidor() {
    try {
      const res = await fetch('/api/mapa-custom');
      const data = await res.json();
      if (data.ok && data.mapa) {
        mapData = data.mapa;
        const dimsBadge = document.getElementById('map-dims-badge');
        if (dimsBadge) dimsBadge.textContent = `${mapData.cols} x ${mapData.rows}`;
        renderRoomsList();
        resizeCanvas();
        render();
        notificar('✅ Mapa carregado com sucesso!');
      } else {
        notificar('Aviso: Nenhum mapa customizado ativo ainda.', '#fbbf24');
      }
    } catch (err) {
      console.error(err);
      notificar('Erro ao carregar mapa do servidor', '#f87171');
    }
  }

  async function salvarMapa() {
    const btn = document.getElementById('btn-salvar');
    if (btn) btn.textContent = 'Salvando...';
    try {
      const res = await fetch('/api/mapa-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapData)
      });
      const data = await res.json();
      if (data.ok) {
        notificar('✅ Mapa salvo com sucesso! O jogo já atualizou em tempo real!');
        if (btn) {
          btn.innerHTML = '<span>💾</span> Salvo!';
          setTimeout(() => { btn.innerHTML = '<span>💾</span> Salvar no Jogo'; }, 2000);
        }
      } else {
        notificar('Erro ao salvar: ' + (data.erro || 'Falha'), '#f87171');
        if (btn) btn.innerHTML = '<span>💾</span> Salvar no Jogo';
      }
    } catch (err) {
      console.error(err);
      notificar('Erro de conexão ao salvar.', '#f87171');
      if (btn) btn.innerHTML = '<span>💾</span> Salvar no Jogo';
    }
  }

  function exportarJSON() {
    const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mapa-custom.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Bind de eventos do Canvas ---
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    mouseButton = e.button;
    const cell = getCellFromEvent(e);

    if (currentTool === 'spawn') {
      mapData.spawnPoints = [{ col: cell.c, row: cell.r }];
      render();
      notificar(`Ponto de spawn definido em (${cell.c}, ${cell.r})`);
      return;
    }

    if (currentTool === 'rect' || currentTool === 'room') {
      rectStart = cell;
      return;
    }

    aplicarPintura(cell.c, cell.r, mouseButton === 2 ? 0 : selectedTileId);
  });

  window.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;

    if (rectStart) {
      const cell = lastHoverCell;
      const c0 = Math.min(rectStart.c, cell.c);
      const r0 = Math.min(rectStart.r, cell.r);
      const c1 = Math.max(rectStart.c, cell.c);
      const r1 = Math.max(rectStart.r, cell.r);

      if (currentTool === 'rect') {
        const t = mouseButton === 2 ? 0 : selectedTileId;
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            if (mapData.tiles[r]) mapData.tiles[r][c] = t;
          }
        }
        notificar(`Área preenchida de (${c0},${r0}) a (${c1},${r1})`);
      } else if (currentTool === 'room' && selectedRoomIdx >= 0) {
        const s = mapData.rooms[selectedRoomIdx];
        s.c0 = c0; s.r0 = r0; s.c1 = c1; s.r1 = r1;
        renderRoomsList();
        notificar(`Sala "${s.nome}" demarcada!`);
        setTool('paint');
      }

      rectStart = null;
      render();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const cell = getCellFromEvent(e);
    lastHoverCell = cell;
    const coordInfo = document.getElementById('coord-info');
    if (coordInfo) coordInfo.textContent = `Linha: ${cell.r}, Coluna: ${cell.c}`;

    if (isMouseDown && currentTool === 'paint') {
      aplicarPintura(cell.c, cell.r, mouseButton === 2 ? 0 : selectedTileId);
    } else if (rectStart) {
      render();
    }
  });

  // --- Bind de botões e ferramentas da UI ---
  function ligarControlesUI() {
    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarMapa);

    const btnAbrirSede = document.getElementById('btn-abrir-sede');
    if (btnAbrirSede) btnAbrirSede.addEventListener('click', () => window.open('/', '_blank'));

    const btnExportar = document.getElementById('btn-exportar');
    if (btnExportar) btnExportar.addEventListener('click', exportarJSON);

    const btnNovaSala = document.getElementById('btn-nova-sala');
    if (btnNovaSala) btnNovaSala.addEventListener('click', novaSala);

    const btnDemarcar = document.getElementById('btn-demarcar-sala');
    if (btnDemarcar) btnDemarcar.addEventListener('click', iniciarDemarcacaoSala);

    ['paint', 'rect', 'room', 'spawn'].forEach((t) => {
      const btn = document.getElementById('tool-' + t);
      if (btn) btn.addEventListener('click', () => setTool(t));
    });

    const inpNome = document.getElementById('inp-room-name');
    if (inpNome) inpNome.addEventListener('input', atualizarSalaSelecionada);

    const inpPiso = document.getElementById('inp-room-floor');
    if (inpPiso) inpPiso.addEventListener('change', atualizarSalaSelecionada);

    const inpSom = document.getElementById('inp-room-sound');
    if (inpSom) inpSom.addEventListener('change', atualizarSalaSelecionada);
  }

  // Inicialização
  function iniciar() {
    buildPalette();
    ligarControlesUI();
    carregarDoServidor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
