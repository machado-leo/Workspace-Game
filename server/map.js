// Mapa 2D da sede da ADM Solucoes (lado servidor: colisao e ponto de entrada).
// Mantido em sincronia manualmente com public/js/map.js (sem bundler no projeto).

const TILE = 32;
const COLS = 38;
const ROWS = 28;
// Muda quando a PLANTA muda de um jeito que invalida o que foi salvo por celula
// (decoracao, links, areas mexidas, mesas reivindicadas). O que foi salvo com
// outra versao sai do caminho no arranque e a sede comeca do zero nisso (ver
// guardarDePlantaAntiga em server/dados.js).
//   1 - planta de 48x32, 32 mesas (ate 18/09/2026)
//   2 - planta compacta de 38x28, 16 mesas
const VERSAO_PLANTA = 3;

const LIVRE = 0;
const PAREDE = 1;
const MESA = 2;
const MESA_MONITOR = 3;
const SOFA_CIMA = 4;
const SOFA_BAIXO = 5;
const MESA_CENTRO = 6;
const ESTANTE = 7;
const PLANTA = 8;
const ARVORE = 9;
const QUADRO = 10;
const LOUSA = 11;
const ARMARIO = 12;
const BALCAO = 13;
const CERCA = 14;
const CADEIRA = 15; // caminhavel
const TAPETE = 16; // caminhavel
const MESA_REUNIAO = 17;
const JANELA = 18;
const AGUA = 19;
const PEDRA = 20;
const ARBUSTO = 21;
const BANCO = 22;
const CABIDE = 23;
const IMPRESSORA = 24;
const CAVALETE = 25;
// Variacoes do catalogo do decorador (ver docs/plano-decorador.md)
const MESA_DUPLA = 26; // bancada com dois monitores, como a da referencia
const MESA_NOTEBOOK = 27;
const PLANTA_GRANDE = 28;
const VASO_FLORES = 29;
const CACTO = 30;
const POLTRONA = 31; // caminhavel: da pra sentar
const CADEIRA_VERMELHA = 32; // caminhavel: da pra sentar
const BEBEDOURO = 33;
const TV = 34;
const RELOGIO = 35;
const TAPETE_REDONDO = 36; // caminhavel
// Cadeiras nas outras direcoes (a pessoa senta virada pro lado que a cadeira
// aponta). Todas caminhaveis.
const CADEIRA_BAIXO = 37;
const CADEIRA_ESQ = 38;
const CADEIRA_DIR = 39;
const CADEIRA_VERMELHA_BAIXO = 40;
const CADEIRA_VERMELHA_ESQ = 41;
const CADEIRA_VERMELHA_DIR = 42;
const MESA_BAIXO = 43;
const MESA_ESQ = 44;
const MESA_DIR = 45;
const MESA_MONITOR_BAIXO = 46;
const MESA_MONITOR_ESQ = 47;
const MESA_MONITOR_DIR = 48;
// Da referencia do lounge (172725) e das salas de huddle (172815).
const PUFE = 49;         // caminhavel: da pra sentar
const MESA_REDONDA = 50;
// Da copa (172742) e da sala de huddle (172815).
const GELADEIRA = 51;
const AQUARIO = 52;
const LUMINARIA_PE = 53;
// Porta que abre quando alguem chega perto. CAMINHAVEL de proposito: ela nao
// fecha passagem, so mostra que ali e passagem. Ver o desenho em game.js
// (`desenharPortas`), que roda a cada quadro - porta animada nao cabe no
// pre-render, que e estatico.
const PORTA = 54;

const SOLID_TILES = new Set([
  // SOFA_BAIXO NAO entra aqui: e onde a pessoa senta. Ver DIRECAO_ASSENTO.
  // SOFA_CIMA continua solido - aquela celula e o ENCOSTO, nao o assento.
  PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, MESA_CENTRO, ESTANTE,
  PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, MESA_REUNIAO,
  JANELA, AGUA, PEDRA, ARBUSTO, BANCO, CABIDE, IMPRESSORA, CAVALETE,
  MESA_DUPLA, MESA_NOTEBOOK, PLANTA_GRANDE, VASO_FLORES, CACTO, BEBEDOURO,
  MESA_BAIXO, MESA_ESQ, MESA_DIR,
  MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
  TV, RELOGIO, MESA_REDONDA, GELADEIRA, AQUARIO, LUMINARIA_PE,
]);

// Onde o boneco senta ao parar em cima, e pra que lado ele fica virado.
const DIRECAO_ASSENTO = {
  [CADEIRA]: 'up',
  [CADEIRA_BAIXO]: 'down',
  [CADEIRA_ESQ]: 'left',
  [CADEIRA_DIR]: 'right',
  [CADEIRA_VERMELHA]: 'up',
  [CADEIRA_VERMELHA_BAIXO]: 'down',
  [CADEIRA_VERMELHA_ESQ]: 'left',
  [CADEIRA_VERMELHA_DIR]: 'right',
  [POLTRONA]: 'up',
  [PUFE]: 'up',
  // O sofa da copa e do lobby e UMA peca de 3x2 ancorada na linha de BAIXO:
  // a arte sobe e cobre a celula de cima. Entao a celula de baixo e o
  // ASSENTO (almofada e bracos) e a de cima e o ENCOSTO. Por isso so
  // SOFA_BAIXO senta, e senta virado pra 'down' - o sofa abre pro sul.
  [SOFA_BAIXO]: 'down',
};
const ASSENTOS = new Set(Object.keys(DIRECAO_ASSENTO).map(Number));

// Pra que lado a mesa esta virada = pra que lado olha quem senta nela. 'up' e
// a mesa canonica (monitor no fundo, quem senta fica embaixo); as outras sao a
// mesma arte girada.
const DIRECAO_MESA = {
  [MESA]: 'up',
  [MESA_MONITOR]: 'up',
  [MESA_BAIXO]: 'down',
  [MESA_ESQ]: 'left',
  [MESA_DIR]: 'right',
  [MESA_MONITOR_BAIXO]: 'down',
  [MESA_MONITOR_ESQ]: 'left',
  [MESA_MONITOR_DIR]: 'right',
};
const MESAS_DIRECIONAIS = new Set(Object.keys(DIRECAO_MESA).map(Number));
// Mesas com computador: sao essas que da pra reivindicar como lugar.
const MESAS_DE_TRABALHO = new Set([
  MESA_MONITOR, MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
]);

// Superficies onde faz sentido apoiar coisa (a camada de objetos por cima).
const SUPERFICIES = new Set([
  MESA, MESA_MONITOR, MESA_DUPLA, MESA_NOTEBOOK, MESA_REUNIAO, MESA_CENTRO,
  MESA_BAIXO, MESA_ESQ, MESA_DIR,
  MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
  BALCAO, ESTANTE, ARMARIO, MESA_REDONDA,
]);

// Camada de cima: coisinhas apoiadas na celula (monitor, caneca, papelada...).
// Nao bloqueiam passagem - quem bloqueia e o movel embaixo.
const OBJETOS = {
  NENHUM: 0,
  MONITOR: 1,
  MONITOR_DUPLO: 2,
  NOTEBOOK: 3,
  TECLADO: 4,
  CANECA: 5,
  PAPELADA: 6,
  TELEFONE: 7,
  LUMINARIA: 8,
  PLANTINHA: 9,
  LIVROS: 10,
  MONITOR_ULTRAWIDE: 11,
  TORRE_PC: 12,
  SETUP_GAMER: 13,
  MONITOR_LADO: 14,
  MONITOR_COSTAS: 15,
  TABLET: 16,
  CAIXAS_SOM: 17,
  TECLADO_GAMER: 18,
  HEADSET: 19,
  WEBCAM: 20,
  COPO_CAFE: 21,
  GARRAFA: 22,
  DONUT: 23,
  TIGELA: 24,
  POTE_BISCOITO: 25,
  CAFETEIRA: 26,
  PORTA_LAPIS: 27,
  CADERNO: 28,
  CALENDARIO: 29,
  POST_ITS: 30,
  CACTINHO: 31,
  PORTA_RETRATO: 32,
  TROFEU: 33,
  BONECO: 34,
  FLORES: 35,
  BOLA: 36,
  VELA: 37,
};
// O maior id valido. **Todo item novo precisa entrar aqui**: o servidor
// descarta calado o que passa disso, e o item some sem deixar pista.
// testes/mesas.js tem uma trava justamente pra isso.
const OBJETO_MAX = 37;

// ---------------------------------------------------------------- as salas
//
// PLANTA COMPACTA (18/09/2026). A primeira tinha 48x32 tiles, predio de 44x29 e
// 32 mesas: pra quantidade de gente que fica online ao mesmo tempo, a tela
// mostrava corredor e mesa vazia, e atravessar o predio levava ~9 s. Esta tem
// predio de 34x24 e 16 mesas (dois bairros de 8), com o mesmo programa em
// tamanho menor: 2 cabines, 1 sala de reuniao, 1 huddle, copa, recepcao e
// biblioteca.
//
// Continua o partido de EIXO DE CIRCULACAO (docs/plano-redesenho.md): uma
// espinha leste-oeste atravessa o andar, a banda de salas fechadas fica ao norte
// e os bairros ao sul. E a banda norte continua sendo um GRADIENTE ACUSTICO:
// oeste = cabines (silencio), leste = copa (barulho). A biblioteca, silenciosa,
// fica no canto sudeste, com parede cheia e porta.
//
// Faixas de linha, de cima pra baixo:
//    2       parede norte (janelas)
//    3..9    banda de salas (7 de profundidade)
//    10      parede sul da banda, com as portas (aberta embaixo da copa)
//    11..12  EIXO PRINCIPAL (2 tiles: duas pessoas se cruzam)
//    13..24  recepcao, os dois bairros e a biblioteca
//    25      parede sul, com a porta da rua
//
// Colunas da banda norte: cabines 3-7 | corredor 9-10 | reuniao 12-18 |
// huddle 20-25 | copa 27-34. Da faixa sul: recepcao 3-9 | corredor 10 |
// bairros 11-26 | corredor 27 | biblioteca 29-34.
// A regra de som de cada area. Igualzinha a do cliente (public/js/map.js), que
// e quem usa pra decidir a chamada - aqui ela existe pra guardar e conferir o
// que a diretoria muda no editor. Ver docs/areas.md.
//
//   sala      dentro conversa com dentro, e so; o tamanho da sala e o alcance
//   perto     ate `alcance` tiles, sem parede no meio
//   silencio  nao abre chamada
const SOM_MODOS = ['perto', 'sala', 'silencio'];
const ALCANCE_MIN = 1;
const ALCANCE_MAX = 12;
const ALCANCE_PADRAO = 3;

function somDaArea(som) {
  const modo = som && SOM_MODOS.includes(som.modo) ? som.modo : 'perto';
  const n = Math.round(Number(som && som.alcance));
  const alcance = Number.isFinite(n) ? Math.min(Math.max(n, ALCANCE_MIN), ALCANCE_MAX) : ALCANCE_PADRAO;
  return { modo, alcance };
}

function somIgual(a, b) {
  const x = somDaArea(a);
  const y = somDaArea(b);
  return x.modo === y.modo && x.alcance === y.alcance;
}

const salaToda = () => ({ modo: 'sala', alcance: ALCANCE_PADRAO });
const perto = (alcance) => ({ modo: 'perto', alcance });

// Area criada pela diretoria (docs/areas.md): nome, piso e quantas cabem.
// A lista de pisos e a mesma do cliente - piso de nome desconhecido sairia
// como tijolo, calado.
const NOME_MAX = 24;
const AREAS_MAX = 24;
const PISOS_DE_AREA = [
  'tijolo', 'ladrilho', 'carpete_roxo', 'carpete_azul',
  'madeira', 'madeira_clara', 'espinha_fria', 'cinza', 'grama',
];

const ROOMS = [
  // --- banda norte, de oeste (silencio) para leste (barulho) ---
  { id: 'cabine1', nome: 'Cabine 1', r0: 3, c0: 3, r1: 5, c1: 7, piso: 'espinha_fria', som: salaToda() },
  { id: 'cabine2', nome: 'Cabine 2', r0: 7, c0: 3, r1: 9, c1: 7, piso: 'espinha_fria', som: salaToda() },
  { id: 'reuniao', nome: 'Sala de Reunião', r0: 3, c0: 12, r1: 9, c1: 18, piso: 'ladrilho', som: salaToda() },
  { id: 'huddle1', nome: 'Recursos Humanos', r0: 3, c0: 20, r1: 9, c1: 25, piso: 'ladrilho', som: salaToda() },
  { id: 'copa', nome: 'Cafeteria', r0: 3, c0: 27, r1: 9, c1: 34, piso: 'ladrilho', som: perto(6) },

  // --- sul: recepcao, os dois bairros e a biblioteca ---
  { id: 'recepcao', nome: 'Recepção', r0: 13, c0: 3, r1: 24, c1: 9, piso: 'madeira_clara', som: perto(3) },
  { id: 'bairro_a', nome: 'Desenvolvimento', r0: 13, c0: 11, r1: 18, c1: 26, piso: 'carpete_azul', som: perto(2) },
  { id: 'bairro_b', nome: 'Suporte', r0: 19, c0: 11, r1: 24, c1: 26, piso: 'carpete_azul', som: perto(3) },
  { id: 'biblioteca', nome: 'Sala de Foco', r0: 14, c0: 29, r1: 24, c1: 34, piso: 'madeira', som: { modo: 'silencio', alcance: ALCANCE_PADRAO } },

  // Pega o RESTO do predio inteiro, nao so o eixo: os corredores da banda
  // norte nao cabem em nenhuma sala nomeada, e sem isto caem no piso padrao,
  // que e grama - chao de jardim brotando dentro do escritorio.
  { id: 'hall', nome: 'Corredor', r0: 3, c0: 3, r1: 24, c1: 34, piso: 'tijolo', som: perto(3) },
  { id: 'jardim', nome: 'Jardim', r0: 0, c0: 0, r1: 27, c1: 37, piso: 'grama', som: perto(3) },
];

function buildMap() {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) tiles.push(new Array(COLS).fill(LIVRE));

  const dentro = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const set = (r, c, t) => { if (dentro(r, c)) tiles[r][c] = t; };
  const rect = (r0, c0, r1, c1, t) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(r, c, t);
  };
  const linhaH = (r, c0, c1, t) => { for (let c = c0; c <= c1; c++) set(r, c, t); };
  const linhaV = (c, r0, r1, t) => { for (let r = r0; r <= r1; r++) set(r, c, t); };

  // ---------------------------------------------------------------- 1. casca
  // Janela nao e enfeite: e o principio biofilico mais barato que existe -
  // luz e vista pra fora. Por isso a fachada norte e quase toda envidracada.
  linhaH(2, 2, 35, PAREDE);
  linhaH(25, 2, 35, PAREDE);
  linhaV(2, 2, 25, PAREDE);
  linhaV(35, 2, 25, PAREDE);
  // JANELA so na parede NORTE, que e horizontal: da fileira horizontal a gente
  // ve a FACE do muro, e e nela que uma janela desenhada de frente faz sentido.
  [4, 5, 6, 13, 14, 15, 16, 21, 22, 23, 24, 29, 30, 31, 32]
    .forEach((c) => set(2, c, JANELA));
  // porta da rua, no sul, dando direto na recepcao (folha dupla, de vidro)
  set(25, 5, PORTA); set(25, 6, PORTA);

  // -------------------------------------------- 2. banda norte: as divisorias
  // Parede sul da banda SO ate o huddle: a copa (colunas 27-34) e zona aberta,
  // que da direto no eixo - cafe aberto pra circulacao e padrao reconhecido.
  linhaH(10, 2, 26, PAREDE);

  // cabines de chamada: dois modulos de 5x3, empilhados
  linhaH(6, 2, 8, PAREDE);
  linhaV(8, 3, 9, PAREDE);
  // Vao aberto, e nao porta: a arte da porta e vista de frente e so funciona
  // em muro deitado; na parede em pe ela vira uma tabua no corredor.
  [4, 8].forEach((r) => set(r, 8, LIVRE));

  // corredor oeste (colunas 9-10) desce das cabines ate o eixo
  set(10, 9, LIVRE); set(10, 10, LIVRE);

  // sala de reuniao e huddle, cada um com porta pro eixo
  linhaV(11, 3, 9, PAREDE);
  linhaV(19, 3, 9, PAREDE);
  set(10, 15, PORTA);
  linhaV(26, 3, 9, PAREDE);   // huddle | copa
  set(10, 22, PORTA);

  // ------------------------------------------------ 3. dentro das cabines
  // Cabine de chamada e o movel minimo: uma poltrona, um apoio e uma planta.
  [3, 7].forEach((r0) => {
    set(r0 + 1, 4, MESA_CENTRO);   // linha r0 livre pra arte subir
    set(r0 + 2, 4, POLTRONA);
    set(r0 + 2, 6, PLANTA);
    set(r0 + 2, 7, LUMINARIA_PE);
  });

  // --------------------------------------------- 4. dentro da sala de reuniao
  // Mesa de 3x2 com tres cadeiras de cada lado: 6 lugares. Lousa e TV na
  // parede do fundo; a linha 9 fica livre, e a da porta.
  set(3, 13, LOUSA);
  rect(3, 15, 3, 17, TV);
  rect(5, 14, 6, 16, MESA_REUNIAO);
  [14, 15, 16].forEach((c) => { set(4, c, CADEIRA_VERMELHA_BAIXO); set(7, c, CADEIRA_VERMELHA); });
  set(5, 12, PLANTA_GRANDE);
  set(9, 18, PLANTA);

  // ------------------------------------------------------ 5. dentro do huddle
  // Mesa redonda de quatro lugares: a maioria das reunioes e desse tamanho.
  set(6, 22, MESA_REDONDA);
  set(5, 22, CADEIRA_BAIXO);
  set(7, 22, CADEIRA);
  set(6, 21, CADEIRA_DIR);
  set(6, 23, CADEIRA_ESQ);
  set(3, 20, QUADRO);
  set(3, 25, PLANTA);

  // -------------------------------------------------------- 6. copa e lounge
  // Extremo LESTE do gradiente acustico, e aberta pro eixo. Dois grupos e nada
  // solto entre eles (movel de escritorio anda em grupo; o que sobra vira ruido):
  //   1. BANCADA colada na parede norte, com a geladeira na ponta - uma
  //      fileira continua, sem buraco entre o balcao e a geladeira;
  //   2. uma mesa de cafe de dois lugares e o LOUNGE: sofa, mesa de centro e um
  //      pufe de cada lado.
  linhaH(3, 27, 33, BALCAO);
  set(3, 34, GELADEIRA);
  set(6, 28, MESA_REDONDA);
  set(5, 28, CADEIRA_BAIXO);
  set(7, 28, CADEIRA);
  rect(6, 31, 6, 33, SOFA_CIMA);
  rect(7, 31, 7, 33, SOFA_BAIXO);
  set(8, 32, MESA_CENTRO);
  set(9, 31, PUFE); set(9, 33, PUFE);

  // ------------------------------------------------------------ 7. recepcao
  // Dois grupos: ATENDIMENTO colado na porta da rua (quem atende senta atras
  // do balcao, virado pra porta) e ESPERA do outro lado (sofa, mesinha, planta).
  // O resto do piso fica VAZIO de proposito - e por onde a visita entra.
  linhaH(23, 5, 7, BALCAO);
  set(22, 6, CADEIRA_BAIXO);
  rect(15, 4, 15, 6, SOFA_CIMA);
  rect(16, 4, 16, 6, SOFA_BAIXO);
  set(17, 5, MESA_CENTRO);
  set(14, 3, PLANTA_GRANDE);
  set(18, 3, PLANTA);
  set(13, 8, RELOGIO);
  rect(19, 8, 19, 9, CABIDE);   // espelho de pe; a linha de cima fica livre
  linhaV(10, 13, 24, LIVRE);    // corredor entre a recepcao e os bairros
  set(16, 10, BEBEDOURO);

  // ------------------------------------------------------------- 8. bairros
  // O modulo do posto: mesa de 3 tiles, vao de 1, cadeira centrada, e uma
  // linha livre antes da proxima fileira. Duas fileiras de 4 por bairro: 16
  // postos. (A versao de costas - duas fileiras de cadeira encostadas - foi
  // descartada na tela: nao dava pra ver onde terminava um posto.)
  function fileira(r, c0) {
    for (let i = 0; i < 4; i++) {
      const c = c0 + 1 + i * 4;
      rect(r, c, r, c + 2, MESA_MONITOR);
      set(r + 1, c + 1, CADEIRA);
    }
  }
  [13, 16, 19, 22].forEach((r) => fileira(r, 11));
  // Planta entre as bancadas: divisoria verde, que quebra a "fileira sem fim".
  [[15, 15], [15, 23], [18, 19], [21, 15], [21, 23]].forEach(([r, c]) => set(r, c, PLANTA));
  // Na linha 24, a livre do ultimo grupo: impressora e pufes.
  rect(24, 11, 24, 12, IMPRESSORA);
  set(24, 20, PUFE); set(24, 22, PUFE); set(24, 24, PUFE);

  // ---------------------------------------------------------- 9. biblioteca
  // Canto sudeste, com parede CHEIA e porta: e sala silenciosa
  // (`silenciosa: true` - dentro dela a chamada nao abre), e sala de silencio
  // com buraco na parede nao convence ninguem. Por dentro, do barulho pro
  // silencio, da porta pro fundo:
  //   linha 14      entrada, vinda do eixo pela porta do canto oeste
  //   linhas 15-18  acervo: duas fileiras de 4 estantes e o corredor entre elas
  //   linhas 19-24  leitura: mesa, cadeiras e o canto da poltrona, no fundo
  // A parede fica UMA coluna depois dos bairros: a 27 e corredor. Com a
  // parede colada na ultima mesa, a regra do "movel encostado no muro" (game.js,
  // movelNoMuro) lia a mesa da ponta como parte da parede da biblioteca.
  linhaH(13, 28, 35, PAREDE);   // parede com o eixo...
  linhaV(28, 13, 25, PAREDE);   // ...e com o corredor dos bairros
  set(13, 29, PORTA);
  // Estantes SOLTAS das paredes dos lados: as colunas 29 e 34 ficam livres de
  // ponta a ponta. Cada fileira tem a linha de CIMA livre, porque a arte da
  // estante sobe um tile.
  linhaH(15, 30, 33, ESTANTE);
  linhaH(18, 30, 33, ESTANTE);
  rect(22, 30, 23, 32, MESA_REUNIAO);
  [30, 31, 32].forEach((c) => set(21, c, CADEIRA_BAIXO));   // viradas pra mesa
  set(22, 29, CADEIRA_DIR); set(22, 33, CADEIRA_ESQ);       // uma em cada ponta
  // Canto de leitura: poltrona com a luminaria de pe ao lado.
  set(24, 34, POLTRONA);
  set(24, 33, LUMINARIA_PE);
  // Verde so no canto de cima: embaixo, qualquer vaso fecha a faixa atras da
  // mesa de leitura (entre ela, a poltrona e a parede).
  set(14, 34, PLANTA);

  // ------------------------------------------------------- 10. area externa
  // A VOLTA EM TORNO DO PREDIO tem que ficar inteira: 2 colunas no oeste e no
  // leste, 2 linhas no norte e no sul. Como nao existe passo na diagonal,
  // decoracao so na coluna/linha DE FORA (0, 37, a linha 0 e a 27), deixando a
  // de dentro sempre livre como corredor.
  // Arvore so nas LATERAIS: a arte dela tem 3x4 tiles e sobe a partir do tile
  // onde e plantada - na linha 0 a copa inteira ficaria FORA do mapa e so o
  // toco apareceria. Na linha 0 vai arbusto, que cabe no tile.
  [[5, 0], [12, 0], [19, 0], [5, 37], [12, 37], [19, 37]]
    .forEach(([r, c]) => set(r, c, ARVORE));
  [[0, 0], [0, 4], [0, 8], [0, 12], [0, 16], [0, 22], [0, 26], [0, 30], [0, 34], [0, 37],
    [2, 0], [8, 0], [15, 0], [22, 0], [2, 37], [8, 37], [15, 37], [22, 37],
    [27, 12], [27, 18], [27, 24]]
    .forEach(([r, c]) => set(r, c, ARBUSTO));
  [[0, 19], [0, 32]].forEach(([r, c]) => set(r, c, PEDRA));

  return tiles;
}

const tiles = buildMap();

// Todas as celulas do mesmo movel de mesa, a partir de qualquer uma delas.
// E o que faz "pegar a mesa" pegar a mesa inteira em vez de um bloco: uma mesa
// da sala Time tem 6 celulas (3 de largura por 2 de fundo).
//
// A ordem e estavel (de cima pra baixo, da esquerda pra direita), entao a
// primeira celula serve de chave da mesa: clicar em qualquer canto cai sempre
// na mesma chave. Le `tiles`, que o decorador altera em tempo de execucao.
function celulasDaMesa(col, row) {
  const ehMesa = (c, r) => (
    Number.isInteger(c) && Number.isInteger(r)
    && r >= 0 && r < ROWS && c >= 0 && c < COLS
    && MESAS_DE_TRABALHO.has(tiles[r][c])
  );
  if (!ehMesa(col, row)) return null;

  const vistos = new Set([col + ',' + row]);
  const fila = [[col, row]];
  const celulas = [];
  while (fila.length) {
    const [c, r] = fila.shift();
    celulas.push([c, r]);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      const nc = c + dc;
      const nr = r + dr;
      if (vistos.has(nc + ',' + nr) || !ehMesa(nc, nr)) return;
      vistos.add(nc + ',' + nr);
      fila.push([nc, nr]);
    });
  }
  celulas.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return celulas;
}

// Ate onde vai o TAMPO nesta celula, em unidades finas (0-128). Abaixo disso e
// a face vertical do movel, nao superficie: pousar ali faria a coisa flutuar na
// frente da gaveteira.
//
// Espelha exatamente o que `tampoDeMesa` desenha: numa mesa com face, o tampo
// acaba em 64 e os 64 de baixo sao a face; a fileira de TRAS de uma bancada de
// duas nao tem face nenhuma, entao vale a celula inteira.
function tampoAte(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return 0;
  const t = tiles[row][col];
  const temFace = MESAS_DIRECIONAIS.has(t) || t === MESA_DUPLA || t === MESA_NOTEBOOK;
  if (!temFace) return SUPERFICIES.has(t) ? 128 : 0;
  // tem mesa igual embaixo: esta e a fileira de tras, o tampo vai ate o fim
  if (tiles[row + 1] && tiles[row + 1][col] === t) return 128;
  return 64;
}

// O ponto (em tiles com fracao) cai no tampo de uma mesa?
function noTampo(x, y) {
  const col = Math.floor(x);
  const row = Math.floor(y);
  const limite = tampoAte(col, row);
  if (!limite) return false;
  return (y - row) * 128 <= limite;
}

function isWalkableTile(col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return !SOLID_TILES.has(tiles[row][col]);
}

// Verifica colisao usando a caixa do personagem (menor que o tile, para permitir
// passar por corredores estreitos e nao "grudar" nas quinas).
function isWalkable(x, y) {
  const half = 10;
  const points = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
  for (const [px, py] of points) {
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    if (!isWalkableTile(col, row)) return false;
  }
  return true;
}

// Na recepcao, logo dentro da porta da rua. Quem chega entra por onde uma
// visita entraria - e nao no meio de uma sala de reuniao, que e onde o spawn
// antigo caiu quando a planta mudou.
const SPAWN_POINTS = [
  { x: 5.5 * TILE, y: 20.5 * TILE },
  { x: 6.5 * TILE, y: 20.5 * TILE },
  { x: 7.5 * TILE, y: 20.5 * TILE },
];

function getSpawnPoint() {
  const p = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return { x: p.x, y: p.y };
}

// Copia da planta original. O decorador escreve em `tiles`; guardar o original
// deixa a gente saber quando uma celula voltou ao que era (e sai do arquivo de
// diferencas). Ver server/mapa-editado.js.
const baseTiles = tiles.map((linha) => linha.slice());

// Grade da camada de cima, comeca vazia (o que tiver e decoracao salva).
const objetos = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

module.exports = {
  TILE,
  SOM_MODOS,
  PISOS_DE_AREA,
  NOME_MAX,
  AREAS_MAX,
  ALCANCE_MIN,
  ALCANCE_MAX,
  somDaArea,
  somIgual,
  COLS,
  ROWS,
  VERSAO_PLANTA,
  tiles,
  baseTiles,
  objetos,
  ROOMS,
  ASSENTOS,
  DIRECAO_ASSENTO,
  SUPERFICIES,
  OBJETOS,
  OBJETO_MAX,
  isWalkable,
  celulasDaMesa,
  tampoAte,
  noTampo,
  getSpawnPoint,
  LIVRE, PAREDE, MESA, MESA_MONITOR, SOFA_CIMA, SOFA_BAIXO, MESA_CENTRO,
  ESTANTE, PLANTA, ARVORE, QUADRO, LOUSA, ARMARIO, BALCAO, CERCA, CADEIRA,
  TAPETE, MESA_REUNIAO, JANELA, AGUA, PEDRA, ARBUSTO, BANCO, CABIDE,
  IMPRESSORA, CAVALETE,
  MESA_DUPLA, MESA_NOTEBOOK, PLANTA_GRANDE, VASO_FLORES, CACTO, POLTRONA,
  CADEIRA_VERMELHA, BEBEDOURO, TV, RELOGIO, TAPETE_REDONDO,
  CADEIRA_BAIXO, CADEIRA_ESQ, CADEIRA_DIR,
  CADEIRA_VERMELHA_BAIXO, CADEIRA_VERMELHA_ESQ, CADEIRA_VERMELHA_DIR,
  MESA_BAIXO, MESA_ESQ, MESA_DIR,
  MESA_MONITOR_BAIXO, MESA_MONITOR_ESQ, MESA_MONITOR_DIR,
  PUFE, MESA_REDONDA, GELADEIRA, AQUARIO, LUMINARIA_PE, PORTA,
  DIRECAO_MESA,
  MESAS_DIRECIONAIS,
  MESAS_DE_TRABALHO,
};
