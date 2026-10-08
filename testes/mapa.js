// Guarda o mapa: as duas copias iguais e nada inalcancavel.
//
//   npm run teste
//
// Existe porque decorar o mapa ja selou salas duas vezes. As portas das salas da
// frente sao um vao de UMA celula no meio da parede - por o vaso ali fecha a
// sala, e nada avisa: o servidor sobe, o mapa desenha bonito, e a pessoa
// simplesmente nao consegue entrar.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const servidor = require(path.join(RAIZ, 'server', 'map.js'));

global.window = {};
new Function(fs.readFileSync(path.join(RAIZ, 'public', 'js', 'map.js'), 'utf8'))();
const cliente = global.window.OfficeMap;

let ok = 0;
let falhou = 0;

function conferir(nome, real, esperado) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(real)));
  bate ? ok++ : falhou++;
}

// ---- as duas copias contam a mesma historia ----
let diferentes = 0;
for (let r = 0; r < servidor.ROWS; r++) {
  for (let c = 0; c < servidor.COLS; c++) {
    if (cliente.tiles[r][c] !== servidor.tiles[r][c]) diferentes++;
  }
}
conferir('cliente e servidor tem o mesmo mapa', diferentes, 0);
conferir('  e o mesmo enum de objetos',
  JSON.stringify(cliente.OBJETOS), JSON.stringify(servidor.OBJETOS));

// ---- a regra de som de cada area (docs/areas.md) ----
// Cada area diz de que jeito se ouve dentro dela: 'sala' (a area inteira, e
// ninguem de fora), 'perto' (ate N tiles) ou 'silencio'. A regra fica nas DUAS
// copias do mapa, e as duas tem que concordar - se o cliente achar que a sala
// e fechada e o servidor nao, ninguem quebra: a reuniao so passa a vazar pro
// corredor, calada, e a sala some da lista de marcar reuniao.
const somPorId = (m) => JSON.stringify(m.ROOMS.map((s) => [s.id, m.somDaArea(s.som)]).sort());
conferir('  e a MESMA regra de som em cada area', somPorId(cliente), somPorId(servidor));

const modoDe = (id) => cliente.somDaArea((cliente.ROOMS.find((s) => s.id === id) || {}).som).modo;
conferir('  com as salas de reuniao e as cabines fechadas',
  ['reuniao', 'huddle1', 'cabine1', 'cabine2'].filter((id) => modoDe(id) !== 'sala'), []);
conferir('  a biblioteca em silencio', modoDe('biblioteca'), 'silencio');
conferir('  e as areas abertas com alcance proprio (copa maior, Foco menor)',
  [cliente.somDaArea(cliente.ROOMS.find((s) => s.id === 'copa').som).alcance
    > cliente.somDaArea(cliente.ROOMS.find((s) => s.id === 'bairro_a').som).alcance], [true]);

// ---- criar e renomear area (docs/areas.md) ----
// Piso, nome e o teto de areas sao conferidos nas duas copias: o cliente avisa
// antes de mandar, o servidor decide. Se as listas divergirem, a tela deixaria
// escolher um piso que o servidor recusa - ou o servidor aceitaria um que o
// cliente nao sabe desenhar, e ele cairia no tijolo, calado.
conferir('  os pisos que uma area pode ter sao os mesmos nas duas copias',
  cliente.PISOS_DE_AREA.map((p) => p.id), servidor.PISOS_DE_AREA);
conferir('  o mesmo tamanho maximo de nome e o mesmo teto de areas',
  [cliente.NOME_MAX, cliente.AREAS_MAX], [servidor.NOME_MAX, servidor.AREAS_MAX]);
const nomeEPiso = (m) => JSON.stringify(m.ROOMS.map((s) => [s.id, s.nome, s.piso]).sort());
conferir('  e o mesmo nome e piso de fabrica em cada area', nomeEPiso(cliente), nomeEPiso(servidor));
conferir('  todo piso de fabrica esta entre os que a diretoria pode escolher',
  servidor.ROOMS.filter((s) => !servidor.PISOS_DE_AREA.includes(s.piso)).map((s) => s.id), []);

// ---- da pra chegar em tudo? ----
const m = servidor;
const T = m.TILE;
const anda = (c, r) => c >= 0 && r >= 0 && c < m.COLS && r < m.ROWS
  && m.isWalkable(c * T + T / 2, r * T + T / 2);

const sp = m.getSpawnPoint();
const visto = Array.from({ length: m.ROWS }, () => new Array(m.COLS).fill(false));
const fila = [[Math.floor(sp.x / T), Math.floor(sp.y / T)]];
visto[fila[0][1]][fila[0][0]] = true;
while (fila.length) {
  const [c, r] = fila.shift();
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= m.COLS || nr >= m.ROWS) return;
    if (visto[nr][nc] || !anda(nc, nr)) return;
    visto[nr][nc] = true;
    fila.push([nc, nr]);
  });
}

// Cada sala precisa ter chao alcancavel. E a checagem que pega porta entupida.
const semAcesso = m.ROOMS.filter((sala) => {
  for (let r = sala.r0; r <= sala.r1; r++) {
    for (let c = sala.c0; c <= sala.c1; c++) if (visto[r][c]) return false;
  }
  return true;
}).map((s) => s.nome);
conferir('toda sala tem chao alcancavel', semAcesso, []);

// A mesa so serve se der pra sentar nela: cada bloco precisa de um vizinho
// caminhavel alcancavel.
const vistas = new Set();
const mesasSemAssento = [];
for (let r = 0; r < m.ROWS; r++) {
  for (let c = 0; c < m.COLS; c++) {
    if (vistas.has(c + ',' + r)) continue;
    const bloco = m.celulasDaMesa(c, r);
    if (!bloco) continue;
    bloco.forEach(([x, y]) => vistas.add(x + ',' + y));
    const daMesa = new Set(bloco.map(([x, y]) => x + ',' + y));
    const temLugar = bloco.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dc, dr]) => !daMesa.has((x + dc) + ',' + (y + dr))
        && visto[y + dr] && visto[y + dr][x + dc]));
    if (!temLugar) mesasSemAssento.push(bloco[0].join(','));
  }
}
conferir('toda mesa tem onde sentar', mesasSemAssento, []);

// Ilhas de chao: um cantinho solto nao quebra nada, mas uma area grande e
// sintoma de passagem entupida.
let caminhaveis = 0;
let alcancados = 0;
for (let r = 0; r < m.ROWS; r++) {
  for (let c = 0; c < m.COLS; c++) if (anda(c, r)) { caminhaveis++; if (visto[r][c]) alcancados++; }
}
const ilhados = caminhaveis - alcancados;
console.log('\n  chao caminhavel: ' + caminhaveis + ', alcancavel: ' + alcancados
  + ' (ilhados: ' + ilhados + ')');
// A faixa de grama atras da parede sul nunca teve acesso e nao incomoda -
// 40 e folga pra ela, e pouco pra uma sala selada.
conferir('nao ha area grande ilhada', ilhados <= 40, true);

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
