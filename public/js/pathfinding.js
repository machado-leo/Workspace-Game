// Pathfinding simples (BFS em grid) para o movimento por clique contornar obstaculos.
(function () {
  function key(c, r) {
    return c + ',' + r;
  }

  // Retorna a lista de celulas {col,row} do inicio ao fim (inclusive), ou null se
  // nao houver caminho.
  function findPath(startCol, startRow, endCol, endRow) {
    const { COLS, ROWS, isTileWalkable } = OfficeMap;
    if (!isTileWalkable(endCol, endRow)) return null;
    if (startCol === endCol && startRow === endRow) return [{ col: startCol, row: startRow }];

    const visited = new Set([key(startCol, startRow)]);
    const cameFrom = new Map();
    const queue = [{ col: startCol, row: startRow }];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let head = 0;

    while (head < queue.length) {
      const cur = queue[head++];
      if (cur.col === endCol && cur.row === endRow) {
        const caminho = [cur];
        let k = key(cur.col, cur.row);
        while (cameFrom.has(k)) {
          const anterior = cameFrom.get(k);
          caminho.push(anterior);
          k = key(anterior.col, anterior.row);
        }
        return caminho.reverse();
      }
      for (const [dc, dr] of dirs) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        const nk = key(nc, nr);
        if (visited.has(nk)) continue;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (!isTileWalkable(nc, nr)) continue;
        visited.add(nk);
        cameFrom.set(nk, cur);
        queue.push({ col: nc, row: nr });
      }
    }
    return null;
  }

  // Acha a celula caminhavel mais proxima de (col,row), buscando em aneis crescentes.
  function nearestWalkable(col, row, raioMax) {
    const { COLS, ROWS, isTileWalkable } = OfficeMap;
    if (isTileWalkable(col, row)) return { col, row };
    for (let raio = 1; raio <= raioMax; raio++) {
      for (let dc = -raio; dc <= raio; dc++) {
        for (let dr = -raio; dr <= raio; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== raio) continue;
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          if (isTileWalkable(nc, nr)) return { col: nc, row: nr };
        }
      }
    }
    return null;
  }

  window.Pathfinding = { findPath, nearestWalkable };
})();
