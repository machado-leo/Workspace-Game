// Testes de importação e sincronização de mapas customizados.
// Garante que o mapa da empresa possa ser carregado de local privado (gitignored)
// ou com fallback transparente para o mapa padrão.

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

console.log('\nTESTES DE IMPORTAÇÃO DE MAPA CUSTOMIZADO');

// 1. Mapa padrão inicial (restaura para garantir estado limpo independente do disco)
servidor.restaurarMapaPadrao();
conferir('servidor inicia com mapa padrão (COLS=38, ROWS=28)', [servidor.COLS, servidor.ROWS], [38, 28]);
conferir('cliente inicia com mapa padrão (COLS=38, ROWS=28)', [cliente.COLS, cliente.ROWS], [38, 28]);

// 2. Carregar o mapa de exemplo (maps/mapa-exemplo.json)
const caminhoExemplo = path.join(RAIZ, 'maps', 'mapa-exemplo.json');
const carregou = servidor.carregarArquivoCustomizado(caminhoExemplo);
conferir('carregou arquivo de exemplo com sucesso', carregou, true);
conferir('dimensões do servidor atualizadas para 28x20', [servidor.COLS, servidor.ROWS], [28, 20]);
conferir('versão da planta customizada definida para 10', servidor.VERSAO_PLANTA, 10);

// Conferir salas customizadas
const salasIds = servidor.ROOMS.map((s) => s.id);
conferir('salas customizadas carregadas',
  ['reuniao', 'foco', 'copa', 'recepcao', 'trabalho'].every((id) => salasIds.includes(id)), true);

// Conferir acústica das salas
const salaReuniao = servidor.ROOMS.find((s) => s.id === 'reuniao');
conferir('sala de reunião com acústica privativa (modo "sala")',
  servidor.somDaArea(salaReuniao.som).modo, 'sala');

const salaCopa = servidor.ROOMS.find((s) => s.id === 'copa');
conferir('copa com acústica de proximidade alcance 4',
  servidor.somDaArea(salaCopa.som), { modo: 'perto', alcance: 4 });

// Conferir spawn points calculados a partir de col e row
const spawns = servidor.SPAWN_POINTS;
conferir('spawn points convertidos para pixels',
  spawns.map((p) => [p.x, p.y]),
  [[6 * 32, 17.5 * 32], [7 * 32, 17.5 * 32]]);

// Conferir colisões no servidor
conferir('parede externa bloqueia passagem', servidor.isWalkableTile(1, 1), false);
conferir('corredor livre permite passagem', servidor.isWalkableTile(5, 8), true);
conferir('porta permite passagem', servidor.isWalkableTile(6, 7), true);

// 3. Suporte a nomes amigáveis de tiles (strings no JSON)
const mapaComNomes = {
  cols: 8,
  rows: 8,
  tiles: [
    ['PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE'],
    ['PAREDE', 'LIVRE', 'MESA_MONITOR', 'CADEIRA', 'LIVRE', 'PORTA', 'LIVRE', 'PAREDE'],
    ['PAREDE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'PAREDE'],
    ['PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE'],
    ['PAREDE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'PAREDE'],
    ['PAREDE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'PAREDE'],
    ['PAREDE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'LIVRE', 'PAREDE'],
    ['PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE', 'PAREDE'],
  ],
};

servidor.aplicarMapaCustomizado(mapaComNomes, 'teste-strings');
conferir('mapa com nomes de tiles converteu PAREDE para 1', servidor.tiles[0][0], 1);
conferir('mapa com nomes de tiles converteu MESA_MONITOR para 3', servidor.tiles[1][2], 3);
conferir('mapa com nomes de tiles converteu CADEIRA para 15', servidor.tiles[1][3], 15);
conferir('mapa com nomes de tiles converteu PORTA para 54', servidor.tiles[1][5], 54);

// 4. Sincronização com o cliente (OfficeMap.carregarMapa)
const payloadEnvioCliente = {
  cols: servidor.COLS,
  rows: servidor.ROWS,
  tile: servidor.TILE,
  tiles: servidor.tiles,
  rooms: servidor.ROOMS,
  zonasPiso: servidor.ZONAS_PISO,
};

cliente.carregarMapa(payloadEnvioCliente);
conferir('cliente atualizou dimensões (COLS=8, ROWS=8)', [cliente.COLS, cliente.ROWS], [8, 8]);
conferir('cliente atualizou grid de tiles', cliente.tiles[1][2], 3);
conferir('cliente respeita colisao do mapa customizado', cliente.isTileWalkable(0, 0), false);
conferir('cliente permite andar em celula livre customizada', cliente.isTileWalkable(1, 1), true);

// 5. Restauração do mapa padrão
servidor.restaurarMapaPadrao();
conferir('servidor restaurou mapa padrão (COLS=38, ROWS=28)', [servidor.COLS, servidor.ROWS], [38, 28]);
conferir('versão da planta padrão restaurada (3)', servidor.VERSAO_PLANTA, 3);

cliente.carregarMapa({
  cols: servidor.COLS,
  rows: servidor.ROWS,
  tile: servidor.TILE,
  tiles: servidor.tiles,
  rooms: servidor.ROOMS,
  zonasPiso: servidor.ZONAS_PISO,
});
conferir('cliente restaurou mapa padrão (COLS=38, ROWS=28)', [cliente.COLS, cliente.ROWS], [38, 28]);

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
