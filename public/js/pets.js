// Sistema de Pets e Mascotes do Escritorio (Google Antigravity Workspace)
// Suporta:
// 1. Pets Companheiros que seguem o jogador (Caramelo, Gatinho, Capivara, Pato)
// 2. Mascotes da Sede NPCs (Mingau na Cafeteria, Pipoca na Recepção, Chico no Jardim)
// 3. Interacao de carinho com coracoes, pulinhos e baloes de fala
(function () {
  const TILE = 32;

  // Lista de Mascotes Oficiais da Sede
  const MASCOTES_SEDE = [
    {
      id: 'mascote_mingau',
      nome: 'Mingau',
      tipo: 'gato',
      subtipo: 'branco',
      descricao: 'O gato da Cafeteria',
      x: 30.5 * TILE,
      y: 6.5 * TILE,
      displayX: 30.5 * TILE,
      displayY: 6.5 * TILE,
      dir: 'down',
      state: 'sleep',
      animTime: 0,
      area: { minX: 28 * TILE, maxX: 33 * TILE, minY: 4 * TILE, maxY: 8 * TILE },
      proximaAcao: 3,
      falaPadrao: ['Miau! 🐟', 'Purrr... ❤️', 'Zzz... 🥛'],
    },
    {
      id: 'mascote_pipoca',
      nome: 'Pipoca',
      tipo: 'caramelo',
      subtipo: 'dourado',
      descricao: 'O cãozinho da Recepção',
      x: 5.5 * TILE,
      y: 16.5 * TILE,
      displayX: 5.5 * TILE,
      displayY: 16.5 * TILE,
      dir: 'right',
      state: 'idle',
      animTime: 0,
      area: { minX: 4 * TILE, maxX: 8 * TILE, minY: 14 * TILE, maxY: 21 * TILE },
      proximaAcao: 4,
      falaPadrao: ['Au au! 🐾', 'Abanando o rabo! ❤️', 'Bem-vindo! 🎾'],
    },
    {
      id: 'mascote_chico',
      nome: 'Chico',
      tipo: 'capivara',
      subtipo: 'zen',
      descricao: 'A capivara zen do Jardim',
      x: 18.5 * TILE,
      y: 2.5 * TILE,
      displayX: 18.5 * TILE,
      displayY: 2.5 * TILE,
      dir: 'down',
      state: 'idle',
      animTime: 0,
      area: { minX: 13 * TILE, maxX: 24 * TILE, minY: 1.5 * TILE, maxY: 3.5 * TILE },
      proximaAcao: 5,
      falaPadrao: ['Muito zen... 🌿', 'Mastigando capim... 🦫', 'Paz de espírito... ✨'],
    }
  ];

  // Map de Companheiros: playerId -> PetState
  const companheiros = new Map();

  // Partículas globais de carinho (corações, Zzz)
  const particulas = [];

  // Feedback flutuante de fala
  const baloesFala = [];

  // ========================================================
  // RENDERIZAÇÃO PIXEL ART DOS PETS
  // ========================================================

  function drawPixel(ctx, x, y, w, h, cor) {
    ctx.fillStyle = cor;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // 1. CARAMELO (Cachorro)
  function desenharCaramelo(ctx, x, y, dir, state, animTime, scale, subtipo) {
    const s = scale || 1.8;
    const corBase = subtipo === 'preto' ? '#2b2d42' : '#d9822b';
    const corSombra = subtipo === 'preto' ? '#1a1b26' : '#b86518';
    const corClaro = subtipo === 'preto' ? '#4a4d68' : '#f6dbb2';
    const corColeira = '#e63946';

    const andando = state === 'walk';
    const dormindo = state === 'sleep';
    const sentado = state === 'sit';

    // Salto de caminhada
    const salto = andando ? Math.abs(Math.sin(animTime * 10)) * 2 * s : 0;
    const by = y - salto;

    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, (dormindo ? 11 : 9) * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, by);

    if (dormindo) {
      // Corpo encolhido deitado
      const respiracao = Math.sin(animTime * 3) * 0.8 * s;
      drawPixel(ctx, -9 * s, -6 * s + respiracao, 18 * s, 6 * s, corBase);
      drawPixel(ctx, -7 * s, -7 * s + respiracao, 12 * s, 2 * s, corSombra);
      drawPixel(ctx, -4 * s, -4 * s, 8 * s, 3 * s, corClaro);
      // Focinho no chão
      drawPixel(ctx, 6 * s, -4 * s, 4 * s, 3 * s, corSombra);
      drawPixel(ctx, 9 * s, -4 * s, 2 * s, 2 * s, '#2b1b0c');
      // Olho fechado (tracinho)
      drawPixel(ctx, 5 * s, -5 * s, 3 * s, 1 * s, '#2b1b0c');
      // Orelha caída
      drawPixel(ctx, 2 * s, -6 * s, 3 * s, 4 * s, corSombra);
      ctx.restore();
      return;
    }

    const passo = andando ? Math.sin(animTime * 12) : 0;
    const raboWiggle = Math.sin(animTime * 14) * 0.4;

    if (dir === 'left' || dir === 'right') {
      const flip = dir === 'left' ? -1 : 1;
      ctx.scale(flip, 1);

      // Rabinho abanando
      ctx.save();
      ctx.translate(-7 * s, -7 * s);
      ctx.rotate(raboWiggle - 0.4);
      drawPixel(ctx, -4 * s, -2 * s, 4 * s, 2.5 * s, corBase);
      ctx.restore();

      // Pernas traseiras
      const pT = sentado ? 0 : passo * 2 * s;
      drawPixel(ctx, -6 * s + pT, -3 * s, 2.5 * s, 3 * s, corSombra);
      drawPixel(ctx, -4 * s - pT, -3 * s, 2.5 * s, 3 * s, corBase);

      // Corpo
      drawPixel(ctx, -7 * s, -8 * s, 11 * s, 6 * s, corBase);
      drawPixel(ctx, -4 * s, -5 * s, 5 * s, 3 * s, corClaro);

      // Pernas dianteiras
      const pD = sentado ? 0 : -passo * 2 * s;
      drawPixel(ctx, 1 * s + pD, -3 * s, 2.5 * s, 3 * s, corSombra);
      drawPixel(ctx, 3 * s - pD, -3 * s, 2.5 * s, 3 * s, corBase);

      // Coleira
      drawPixel(ctx, 3 * s, -8 * s, 2 * s, 5 * s, corColeira);
      drawPixel(ctx, 4 * s, -5 * s, 1.5 * s, 1.5 * s, '#f1c40f'); // pingente

      // Cabeça
      drawPixel(ctx, 3 * s, -12 * s, 7 * s, 6 * s, corBase);
      drawPixel(ctx, 7 * s, -10 * s, 4 * s, 4 * s, corClaro);
      drawPixel(ctx, 10 * s, -10 * s, 1.5 * s, 2 * s, '#2b1b0c'); // nariz

      // Olho
      drawPixel(ctx, 6 * s, -11 * s, 2 * s, 2 * s, '#1a1005');
      drawPixel(ctx, 6.5 * s, -11.5 * s, 1 * s, 1 * s, '#ffffff');

      // Orelha caída
      drawPixel(ctx, 2 * s, -12 * s, 3 * s, 5 * s, corSombra);
    } else if (dir === 'down') {
      // Olhando para frente
      // Patas
      const pE = andando ? passo * 2 * s : 0;
      drawPixel(ctx, -5 * s, -3 * s + pE, 3 * s, 3 * s, corBase);
      drawPixel(ctx, 2 * s, -3 * s - pE, 3 * s, 3 * s, corBase);

      // Corpo
      drawPixel(ctx, -5 * s, -8 * s, 10 * s, 6 * s, corBase);
      drawPixel(ctx, -2 * s, -6 * s, 4 * s, 4 * s, corClaro);

      // Coleira
      drawPixel(ctx, -4 * s, -7 * s, 8 * s, 1.5 * s, corColeira);

      // Cabeça
      drawPixel(ctx, -5 * s, -13 * s, 10 * s, 7 * s, corBase);
      // Focinho
      drawPixel(ctx, -2.5 * s, -9 * s, 5 * s, 3 * s, corClaro);
      drawPixel(ctx, -1 * s, -9.5 * s, 2 * s, 1.5 * s, '#2b1b0c');

      // Olhos
      drawPixel(ctx, -4 * s, -11 * s, 2 * s, 2 * s, '#1a1005');
      drawPixel(ctx, 2 * s, -11 * s, 2 * s, 2 * s, '#1a1005');

      // Orelhas dos lados
      drawPixel(ctx, -7 * s, -13 * s, 2.5 * s, 5 * s, corSombra);
      drawPixel(ctx, 4.5 * s, -13 * s, 2.5 * s, 5 * s, corSombra);
    } else { // 'up'
      // Costas
      const pE = andando ? passo * 2 * s : 0;
      drawPixel(ctx, -5 * s, -3 * s + pE, 3 * s, 3 * s, corBase);
      drawPixel(ctx, 2 * s, -3 * s - pE, 3 * s, 3 * s, corBase);

      drawPixel(ctx, -5 * s, -8 * s, 10 * s, 6 * s, corBase);
      // Rabinho
      drawPixel(ctx, -1 * s + raboWiggle * 3, -11 * s, 2 * s, 4 * s, corBase);

      // Cabeça de costas
      drawPixel(ctx, -5 * s, -13 * s, 10 * s, 6 * s, corSombra);
      drawPixel(ctx, -6.5 * s, -13 * s, 2.5 * s, 4 * s, corSombra);
      drawPixel(ctx, 4 * s, -13 * s, 2.5 * s, 4 * s, corSombra);
    }

    ctx.restore();
  }

  // 2. GATO (Mingau / Gatinho)
  function desenharGato(ctx, x, y, dir, state, animTime, scale, subtipo) {
    const s = scale || 1.8;
    const ehBranco = subtipo === 'branco';
    const corBase = ehBranco ? '#f5f5f7' : (subtipo === 'laranja' ? '#e67e22' : '#2f3542');
    const corSombra = ehBranco ? '#dcdde1' : (subtipo === 'laranja' ? '#d35400' : '#1e272e');
    const corOlhos = ehBranco ? '#3498db' : '#2ecc71';

    const andando = state === 'walk';
    const dormindo = state === 'sleep';
    const sentado = state === 'sit';

    const salto = andando ? Math.abs(Math.sin(animTime * 10)) * 1.5 * s : 0;
    const by = y - salto;

    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y, (dormindo ? 10 : 8) * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, by);

    if (dormindo) {
      // Gato enrolado como uma bolinha
      const resp = Math.sin(animTime * 2.5) * 0.7 * s;
      drawPixel(ctx, -8 * s, -6 * s + resp, 16 * s, 6 * s, corBase);
      drawPixel(ctx, -6 * s, -7 * s + resp, 12 * s, 2 * s, corSombra);
      // Rabo enrolado por cima
      drawPixel(ctx, -9 * s, -4 * s, 4 * s, 3 * s, corSombra);
      // Orelha pontuda visivel
      drawPixel(ctx, 3 * s, -8 * s, 3 * s, 3 * s, corBase);
      drawPixel(ctx, 4 * s, -7 * s, 1.5 * s, 1.5 * s, '#f8a5c2');
      // Olho fechado
      drawPixel(ctx, 4 * s, -4 * s, 2.5 * s, 1 * s, '#57606f');
      ctx.restore();
      return;
    }

    const passo = andando ? Math.sin(animTime * 12) : 0;
    const raboCurva = Math.sin(animTime * 6) * 0.3;

    if (dir === 'left' || dir === 'right') {
      const flip = dir === 'left' ? -1 : 1;
      ctx.scale(flip, 1);

      // Rabo erguido elegante
      ctx.save();
      ctx.translate(-6 * s, -6 * s);
      ctx.rotate(raboCurva - 0.6);
      drawPixel(ctx, -2 * s, -6 * s, 2 * s, 7 * s, corSombra);
      ctx.restore();

      // Pernas
      const pT = sentado ? 0 : passo * 2 * s;
      drawPixel(ctx, -5 * s + pT, -3 * s, 2 * s, 3 * s, corSombra);
      drawPixel(ctx, -3 * s - pT, -3 * s, 2 * s, 3 * s, corBase);

      // Corpo elegante
      drawPixel(ctx, -6 * s, -7 * s, 10 * s, 5 * s, corBase);

      const pD = sentado ? 0 : -passo * 2 * s;
      drawPixel(ctx, 1 * s + pD, -3 * s, 2 * s, 3 * s, corSombra);
      drawPixel(ctx, 3 * s - pD, -3 * s, 2 * s, 3 * s, corBase);

      // Cabeça
      drawPixel(ctx, 2 * s, -11 * s, 6 * s, 5.5 * s, corBase);
      // Orelhas triangulares
      drawPixel(ctx, 2 * s, -14 * s, 2.5 * s, 3 * s, corBase);
      drawPixel(ctx, 2.5 * s, -13 * s, 1.5 * s, 2 * s, '#f8a5c2');
      drawPixel(ctx, 5 * s, -14 * s, 2.5 * s, 3 * s, corBase);
      drawPixel(ctx, 5.5 * s, -13 * s, 1.5 * s, 2 * s, '#f8a5c2');

      // Focinho e bigodes
      drawPixel(ctx, 6.5 * s, -8.5 * s, 2 * s, 2 * s, '#ffffff');
      drawPixel(ctx, 7.5 * s, -9 * s, 1 * s, 1 * s, '#f8a5c2'); // nariz rosa
      drawPixel(ctx, 7 * s, -7.5 * s, 2 * s, 0.8 * s, '#ffffff'); // bigode

      // Olho amendoados
      drawPixel(ctx, 4.5 * s, -10 * s, 2 * s, 2 * s, corOlhos);
      drawPixel(ctx, 5.5 * s, -10 * s, 1 * s, 2 * s, '#111111');
    } else if (dir === 'down') {
      const pE = andando ? passo * 2 * s : 0;
      drawPixel(ctx, -4 * s, -3 * s + pE, 2.5 * s, 3 * s, corBase);
      drawPixel(ctx, 1.5 * s, -3 * s - pE, 2.5 * s, 3 * s, corBase);

      drawPixel(ctx, -4.5 * s, -7 * s, 9 * s, 5 * s, corBase);
      drawPixel(ctx, -1.5 * s, -5 * s, 3 * s, 3 * s, '#ffffff'); // peitinho branco

      // Cabeça
      drawPixel(ctx, -4.5 * s, -12 * s, 9 * s, 6 * s, corBase);
      // Orelhas pontudas
      drawPixel(ctx, -4.5 * s, -15 * s, 2.5 * s, 3 * s, corBase);
      drawPixel(ctx, -4 * s, -14 * s, 1.5 * s, 2 * s, '#f8a5c2');
      drawPixel(ctx, 2 * s, -15 * s, 2.5 * s, 3 * s, corBase);
      drawPixel(ctx, 2.5 * s, -14 * s, 1.5 * s, 2 * s, '#f8a5c2');

      // Olhos
      drawPixel(ctx, -3.5 * s, -10 * s, 2 * s, 2 * s, corOlhos);
      drawPixel(ctx, 1.5 * s, -10 * s, 2 * s, 2 * s, corOlhos);

      // Focinho
      drawPixel(ctx, -1 * s, -8.5 * s, 2 * s, 1.5 * s, '#ffffff');
      drawPixel(ctx, -0.5 * s, -9 * s, 1 * s, 1 * s, '#f8a5c2');
    } else { // 'up'
      const pE = andando ? passo * 2 * s : 0;
      drawPixel(ctx, -4 * s, -3 * s + pE, 2.5 * s, 3 * s, corBase);
      drawPixel(ctx, 1.5 * s, -3 * s - pE, 2.5 * s, 3 * s, corBase);

      drawPixel(ctx, -4.5 * s, -7 * s, 9 * s, 5 * s, corBase);
      // Rabinho curvado
      drawPixel(ctx, 1 * s + raboCurva * 3, -11 * s, 2 * s, 5 * s, corSombra);

      // Cabeça costas
      drawPixel(ctx, -4.5 * s, -12 * s, 9 * s, 6 * s, corSombra);
      drawPixel(ctx, -4.5 * s, -15 * s, 2.5 * s, 3 * s, corSombra);
      drawPixel(ctx, 2 * s, -15 * s, 2.5 * s, 3 * s, corSombra);
    }

    ctx.restore();
  }

  // 3. CAPIVARA (Chico & Capivara)
  function desenharCapivara(ctx, x, y, dir, state, animTime, scale) {
    const s = scale || 1.9;
    const corBase = '#8a5c36';
    const corSombra = '#613e20';
    const corFocinho = '#4e3119';

    const andando = state === 'walk';
    const dormindo = state === 'sleep';

    const passo = andando ? Math.sin(animTime * 8) : 0;
    const respiracao = Math.sin(animTime * 2.5) * 0.6 * s;

    // Sombra oval ampla
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, 11 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y - (andando ? Math.abs(passo) * 1 * s : 0));

    if (dormindo) {
      drawPixel(ctx, -10 * s, -7 * s + respiracao, 20 * s, 7 * s, corBase);
      drawPixel(ctx, -8 * s, -8 * s + respiracao, 16 * s, 2 * s, corSombra);
      // Focinho quadrado descansando
      drawPixel(ctx, 7 * s, -6 * s, 6 * s, 5 * s, corFocinho);
      drawPixel(ctx, 6 * s, -6 * s, 3 * s, 1 * s, '#2b1b0c'); // olho sereno fechado
      // Orelhinha
      drawPixel(ctx, 4 * s, -8 * s, 2 * s, 2 * s, corSombra);
      // Florzinha zen na cabeça!
      drawPixel(ctx, 2 * s, -9 * s, 2.5 * s, 2.5 * s, '#e91e63');
      drawPixel(ctx, 2.8 * s, -8.2 * s, 1 * s, 1 * s, '#ffeb3b');
      ctx.restore();
      return;
    }

    if (dir === 'left' || dir === 'right') {
      const flip = dir === 'left' ? -1 : 1;
      ctx.scale(flip, 1);

      // Pernas curtas
      const pT = passo * 1.5 * s;
      drawPixel(ctx, -7 * s + pT, -3 * s, 3 * s, 3 * s, corSombra);
      drawPixel(ctx, -4 * s - pT, -3 * s, 3 * s, 3 * s, corBase);
      drawPixel(ctx, 2 * s - pT, -3 * s, 3 * s, 3 * s, corSombra);
      drawPixel(ctx, 5 * s + pT, -3 * s, 3 * s, 3 * s, corBase);

      // Corpo robusto de capivara
      drawPixel(ctx, -9 * s, -9 * s, 16 * s, 7 * s, corBase);
      drawPixel(ctx, -7 * s, -10 * s, 12 * s, 2 * s, corSombra);

      // Cabeça com focinho característico reto
      drawPixel(ctx, 3 * s, -12 * s, 9 * s, 7 * s, corBase);
      drawPixel(ctx, 8 * s, -11 * s, 5 * s, 6 * s, corFocinho);
      drawPixel(ctx, 11 * s, -10 * s, 2 * s, 2 * s, '#261608'); // narina

      // Olho calmo (tracinho/pontinho sereno)
      drawPixel(ctx, 6 * s, -11 * s, 2 * s, 1.5 * s, '#1a0d03');

      // Orelha pequena arredondada
      drawPixel(ctx, 2.5 * s, -13 * s, 2.5 * s, 2.5 * s, corSombra);

      // Florzinha na cabeça
      drawPixel(ctx, 1 * s, -14 * s, 2.5 * s, 2.5 * s, '#e91e63');
      drawPixel(ctx, 1.8 * s, -13.2 * s, 1 * s, 1 * s, '#ffeb3b');
    } else {
      // Frente / Trás
      const pE = passo * 2 * s;
      drawPixel(ctx, -6 * s, -3 * s + pE, 3.5 * s, 3 * s, corBase);
      drawPixel(ctx, 2.5 * s, -3 * s - pE, 3.5 * s, 3 * s, corBase);

      drawPixel(ctx, -7 * s, -9 * s, 14 * s, 7 * s, corBase);

      if (dir === 'down') {
        // Cabeça frontal
        drawPixel(ctx, -5 * s, -13 * s, 10 * s, 8 * s, corBase);
        drawPixel(ctx, -4 * s, -9 * s, 8 * s, 4 * s, corFocinho);
        drawPixel(ctx, -1.5 * s, -9 * s, 3 * s, 2 * s, '#261608');

        // Olhos serenos
        drawPixel(ctx, -4 * s, -11 * s, 2 * s, 1.5 * s, '#1a0d03');
        drawPixel(ctx, 2 * s, -11 * s, 2 * s, 1.5 * s, '#1a0d03');

        // Orelhas
        drawPixel(ctx, -6.5 * s, -13.5 * s, 2.5 * s, 2.5 * s, corSombra);
        drawPixel(ctx, 4 * s, -13.5 * s, 2.5 * s, 2.5 * s, corSombra);

        // Flor
        drawPixel(ctx, -1 * s, -15 * s, 2.5 * s, 2.5 * s, '#e91e63');
      } else {
        drawPixel(ctx, -6 * s, -13 * s, 12 * s, 7 * s, corSombra);
      }
    }

    ctx.restore();
  }

  // 4. PATO (Patinho fofo)
  function desenharPato(ctx, x, y, dir, state, animTime, scale) {
    const s = scale || 1.8;
    const corBase = '#fffae0';
    const corSombra = '#eedd99';
    const corBico = '#ff7b00';

    const andando = state === 'walk';
    const dormindo = state === 'sleep';

    // Gingado rebolando
    const waddle = andando ? Math.sin(animTime * 14) * 0.15 : 0;
    const salto = andando ? Math.abs(Math.sin(animTime * 14)) * 1.5 * s : 0;

    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y, 7 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y - salto);
    ctx.rotate(waddle);

    if (dormindo) {
      drawPixel(ctx, -6 * s, -5 * s, 12 * s, 5 * s, corBase);
      drawPixel(ctx, -4 * s, -6 * s, 8 * s, 2 * s, corSombra);
      // Bico enfiado na asa
      drawPixel(ctx, 4 * s, -4 * s, 4 * s, 2.5 * s, corBico);
      drawPixel(ctx, 3 * s, -5 * s, 2 * s, 1 * s, '#2b1b0c'); // olho fechado
      ctx.restore();
      return;
    }

    const passo = andando ? Math.sin(animTime * 14) : 0;

    if (dir === 'left' || dir === 'right') {
      const flip = dir === 'left' ? -1 : 1;
      ctx.scale(flip, 1);

      // Pés laranjas palmados
      const pT = passo * 2 * s;
      drawPixel(ctx, -4 * s + pT, -2 * s, 3 * s, 2 * s, corBico);
      drawPixel(ctx, 0 * s - pT, -2 * s, 3 * s, 2 * s, corBico);

      // Corpo rechonchudo
      drawPixel(ctx, -6 * s, -7 * s, 10 * s, 5.5 * s, corBase);
      // Asinha dobrada
      drawPixel(ctx, -4 * s, -6.5 * s, 6 * s, 3.5 * s, corSombra);
      // Rabinho empinado
      drawPixel(ctx, -8 * s, -8 * s, 3 * s, 3 * s, corBase);

      // Cabeça redonda
      drawPixel(ctx, 1 * s, -11 * s, 5.5 * s, 5.5 * s, corBase);
      // Bico largo
      drawPixel(ctx, 5 * s, -9 * s, 4 * s, 2.5 * s, corBico);

      // Olho redondinho
      drawPixel(ctx, 3.5 * s, -10 * s, 1.8 * s, 1.8 * s, '#111111');
      drawPixel(ctx, 4 * s, -10.3 * s, 0.8 * s, 0.8 * s, '#ffffff');
    } else if (dir === 'down') {
      const pE = andando ? passo * 2 * s : 0;
      drawPixel(ctx, -4 * s, -2 * s + pE, 3 * s, 2 * s, corBico);
      drawPixel(ctx, 1 * s, -2 * s - pE, 3 * s, 2 * s, corBico);

      drawPixel(ctx, -5 * s, -7 * s, 10 * s, 5.5 * s, corBase);

      // Cabeça
      drawPixel(ctx, -3.5 * s, -11 * s, 7 * s, 5.5 * s, corBase);
      // Bico
      drawPixel(ctx, -2 * s, -8.5 * s, 4 * s, 2.5 * s, corBico);

      // Olhos
      drawPixel(ctx, -3 * s, -10 * s, 1.8 * s, 1.8 * s, '#111111');
      drawPixel(ctx, 1.5 * s, -10 * s, 1.8 * s, 1.8 * s, '#111111');
    } else { // 'up'
      const pE = andando ? passo * 2 * s : 0;
      drawPixel(ctx, -4 * s, -2 * s + pE, 3 * s, 2 * s, corBico);
      drawPixel(ctx, 1 * s, -2 * s - pE, 3 * s, 2 * s, corBico);

      drawPixel(ctx, -5 * s, -7 * s, 10 * s, 5.5 * s, corBase);
      drawPixel(ctx, -1.5 * s, -9 * s, 3 * s, 3 * s, corBase); // rabinho erguido
      drawPixel(ctx, -3.5 * s, -11 * s, 7 * s, 5 * s, corSombra);
    }

    ctx.restore();
  }

  // Desenhador polimórfico
  function desenharPet(ctx, x, y, tipo, opts) {
    const o = opts || {};
    const dir = o.dir || 'down';
    const state = o.state || 'idle';
    const animTime = o.animTime || 0;
    const scale = o.scale || 1.8;
    const subtipo = o.subtipo || '';

    if (tipo === 'caramelo') desenharCaramelo(ctx, x, y, dir, state, animTime, scale, subtipo);
    else if (tipo === 'gato') desenharGato(ctx, x, y, dir, state, animTime, scale, subtipo);
    else if (tipo === 'capivara') desenharCapivara(ctx, x, y, dir, state, animTime, scale);
    else if (tipo === 'pato') desenharPato(ctx, x, y, dir, state, animTime, scale);
  }

  // ========================================================
  // COMPORTAMENTO E ATUALIZAÇÃO
  // ========================================================

  function criarPetCompanheiro(tipo, donoX, donoY) {
    return {
      tipo,
      x: donoX + (Math.random() * 20 - 10),
      y: donoY + 15,
      displayX: donoX,
      displayY: donoY + 15,
      dir: 'down',
      state: 'idle',
      animTime: Math.random() * 5,
      tempoParado: 0,
      puloCarinho: 0,
      reacaoTempo: 0,
    };
  }

  function atualizarCompanheiros(dt, playersMap) {
    // 1. Sincronizar com players conectados
    playersMap.forEach((player, id) => {
      const petTipo = player.appearance && player.appearance.pet;
      if (petTipo && petTipo !== 'nenhum') {
        let pet = companheiros.get(id);
        if (!pet || pet.tipo !== petTipo) {
          pet = criarPetCompanheiro(petTipo, player.displayX, player.displayY);
          companheiros.set(id, pet);
        }

        // Ponto alvo (atrás do dono)
        let offsetX = 0, offsetY = 0;
        if (player.dir === 'down') { offsetX = -18; offsetY = -16; }
        else if (player.dir === 'up') { offsetX = 18; offsetY = 16; }
        else if (player.dir === 'left') { offsetX = 22; offsetY = 2; }
        else if (player.dir === 'right') { offsetX = -22; offsetY = 2; }

        const alvoX = player.displayX + offsetX;
        const alvoY = player.displayY + offsetY;

        const dx = alvoX - pet.displayX;
        const dy = alvoY - pet.displayY;
        const dist = Math.hypot(dx, dy);

        // Movimento suave
        if (dist > 80) {
          // Muito longe (teleporte / acabou de conectar)
          pet.displayX = alvoX;
          pet.displayY = alvoY;
          pet.x = alvoX;
          pet.y = alvoY;
        } else if (dist > 14) {
          // Anda atrás
          const vel = Math.min(dist * 6, player.moving ? 140 : 100);
          pet.displayX += (dx / dist) * vel * dt;
          pet.displayY += (dy / dist) * vel * dt;
          pet.state = 'walk';
          pet.animTime += dt;
          pet.tempoParado = 0;

          // Direção do pet
          if (Math.abs(dx) > Math.abs(dy)) pet.dir = dx > 0 ? 'right' : 'left';
          else pet.dir = dy > 0 ? 'down' : 'up';
        } else {
          // Chegou no lugar
          pet.displayX = alvoX;
          pet.displayY = alvoY;
          pet.tempoParado += dt;
          pet.animTime += dt;

          if (player.sentado || pet.tempoParado > 2) {
            pet.state = pet.tempoParado > 12 ? 'sleep' : 'sit';
            // Se dormindo, solta Zzz a cada 2.5s
            if (pet.state === 'sleep' && Math.floor(pet.tempoParado) % 3 === 0 && Math.random() < 0.04) {
              adicionarParticula(pet.displayX + 6, pet.displayY - 14, 'Zzz');
            }
          } else {
            pet.state = 'idle';
          }
        }

        // Pulo de carinho
        if (pet.puloCarinho > 0) {
          pet.puloCarinho -= dt * 4;
          if (pet.puloCarinho < 0) pet.puloCarinho = 0;
        }
      } else {
        companheiros.delete(id);
      }
    });

    // Remover órfãos
    companheiros.forEach((_, id) => {
      if (!playersMap.has(id)) companheiros.delete(id);
    });
  }

  function atualizarMascotesSede(dt) {
    MASCOTES_SEDE.forEach((m) => {
      m.animTime += dt;
      m.proximaAcao -= dt;

      if (m.puloCarinho > 0) {
        m.puloCarinho -= dt * 4;
        if (m.puloCarinho < 0) m.puloCarinho = 0;
      }

      // Inteligência artificial simples de perambulação
      if (m.proximaAcao <= 0) {
        m.proximaAcao = 4 + Math.random() * 6; // nova ação a cada 4 a 10s
        const sorteio = Math.random();

        if (sorteio < 0.45) {
          // Escolhe um ponto aleatório dentro da sua área
          m.alvoX = m.area.minX + Math.random() * (m.area.maxX - m.area.minX);
          m.alvoY = m.area.minY + Math.random() * (m.area.maxY - m.area.minY);
          m.state = 'walk';
        } else if (sorteio < 0.8) {
          m.state = 'sit';
          m.alvoX = null;
        } else {
          m.state = 'sleep';
          m.alvoX = null;
        }
      }

      // Se estiver caminhando para um alvo
      if (m.state === 'walk' && m.alvoX !== null) {
        const dx = m.alvoX - m.displayX;
        const dy = m.alvoY - m.displayY;
        const dist = Math.hypot(dx, dy);

        if (dist > 4) {
          const vel = 35; // passo tranquilo de pet
          m.displayX += (dx / dist) * vel * dt;
          m.displayY += (dy / dist) * vel * dt;
          if (Math.abs(dx) > Math.abs(dy)) m.dir = dx > 0 ? 'right' : 'left';
          else m.dir = dy > 0 ? 'down' : 'up';
        } else {
          m.state = Math.random() < 0.5 ? 'sit' : 'idle';
          m.alvoX = null;
        }
      }

      // Zzz se dormindo
      if (m.state === 'sleep' && Math.random() < 0.02) {
        adicionarParticula(m.displayX + 6, m.displayY - 14, 'Zzz');
      }
    });
  }

  function adicionarParticula(x, y, tipo) {
    particulas.push({
      x,
      y,
      tipo,
      vy: -18 - Math.random() * 10,
      alpha: 1,
      escala: 1,
      vida: 1.4,
    });
  }

  function adicionarBalaoFala(x, y, texto) {
    baloesFala.push({
      x,
      y,
      texto,
      vida: 2.5,
    });
  }

  function atualizarParticulas(dt) {
    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i];
      p.y += p.vy * dt;
      p.vida -= dt;
      p.alpha = Math.max(0, p.vida / 1.4);
      if (p.vida <= 0) particulas.splice(i, 1);
    }

    for (let i = baloesFala.length - 1; i >= 0; i--) {
      const b = baloesFala[i];
      b.vida -= dt;
      if (b.vida <= 0) baloesFala.splice(i, 1);
    }
  }

  // ========================================================
  // INTERAÇÃO / CARINHO
  // ========================================================

  function fazerCarinho(pet, nomePet) {
    pet.puloCarinho = 1;
    pet.state = 'idle';

    // Subir vários coraçõezinhos!
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        adicionarParticula(
          pet.displayX + (Math.random() * 16 - 8),
          pet.displayY - 12 - (Math.random() * 6),
          'coracao'
        );
      }, i * 160);
    }

    // Balão de resposta
    const falas = pet.falaPadrao || [
      '❤️ Purrr...', '❤️ Au au!', '❤️ *feliz*', '❤️ Nhac!'
    ];
    const fala = falas[Math.floor(Math.random() * falas.length)];
    adicionarBalaoFala(pet.displayX, pet.displayY - 26, fala);
  }

  function cliqueEm(clickX, clickY) {
    // 1. Checar Mascotes da Sede
    for (const m of MASCOTES_SEDE) {
      if (Math.hypot(clickX - m.displayX, clickY - m.displayY) < 22) {
        fazerCarinho(m, m.nome);
        return true;
      }
    }

    // 2. Checar Pets Companheiros
    for (const [id, c] of companheiros.entries()) {
      if (Math.hypot(clickX - c.displayX, clickY - c.displayY) < 22) {
        fazerCarinho(c, 'Pet');
        return true;
      }
    }

    return false;
  }

  // ========================================================
  // DESENHO NO CANVAS
  // ========================================================

  function getTodosParaDesenho() {
    const lista = [];

    // Mascotes da sede
    MASCOTES_SEDE.forEach((m) => {
      lista.push({
        displayY: m.displayY,
        desenhar: (ctx) => {
          const pulo = m.puloCarinho ? Math.sin(m.puloCarinho * Math.PI) * 7 : 0;
          desenharPet(ctx, m.displayX, m.displayY - pulo, m.tipo, {
            dir: m.dir, state: m.state, animTime: m.animTime, subtipo: m.subtipo,
          });

          // Nome do mascote sutil em cima
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(m.displayX - 22, m.displayY - 30, 44, 13, 4); else ctx.rect(m.displayX - 22, m.displayY - 30, 44, 13);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(m.nome, m.displayX, m.displayY - 20);
        }
      });
    });

    // Companheiros
    companheiros.forEach((c) => {
      lista.push({
        displayY: c.displayY,
        desenhar: (ctx) => {
          const pulo = c.puloCarinho ? Math.sin(c.puloCarinho * Math.PI) * 7 : 0;
          desenharPet(ctx, c.displayX, c.displayY - pulo, c.tipo, {
            dir: c.dir, state: c.state, animTime: c.animTime,
          });
        }
      });
    });

    return lista;
  }

  function desenharParticulas(ctx) {
    // 1. Partículas
    particulas.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.tipo === 'coracao') {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❤️', p.x, p.y);
      } else if (p.tipo === 'Zzz') {
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#64b5f6';
        ctx.textAlign = 'center';
        ctx.fillText('Zzz', p.x, p.y);
      }
      ctx.restore();
    });

    // 2. Balões de fala
    baloesFala.forEach((b) => {
      ctx.save();
      ctx.font = '11px sans-serif';
      const w = ctx.measureText(b.texto).width + 12;
      const h = 18;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = '#2b2f38';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x - w / 2, b.y - h, w, h, 6); else ctx.rect(b.x - w / 2, b.y - h, w, h);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#2b2f38';
      ctx.textAlign = 'center';
      ctx.fillText(b.texto, b.x, b.y - 5);
      ctx.restore();
    });
  }

  function update(dt, playersMap) {
    atualizarCompanheiros(dt, playersMap);
    atualizarMascotesSede(dt);
    atualizarParticulas(dt);
  }

  window.Pets = {
    update,
    getTodosParaDesenho,
    desenharParticulas,
    desenharIndividual: desenharPet,
    cliqueEm,
    MASCOTES_SEDE,
  };
})();
