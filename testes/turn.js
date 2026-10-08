// Servidores da chamada (server/turn.js), SEM rede: a Cloudflare e simulada
// trocando o fetch global.
//
// O que mais importa aqui e o pior caso: sem variavel, ou com a Cloudflare fora
// do ar, a chamada tem que continuar exatamente como era - com STUN. TURN que
// falha nao pode derrubar a chamada que ja funcionava.
let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const bate = JSON.stringify(veio) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio)));
  bate ? ok++ : falhou++;
}

function carregar(env) {
  delete require.cache[require.resolve('../server/turn')];
  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  delete process.env.CLOUDFLARE_TURN_TOKEN;
  Object.assign(process.env, env);
  return require('../server/turn');
}

const RESPOSTA = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'usuario-temporario',
      credential: 'senha-temporaria',
    },
  ],
};

const fetchOriginal = global.fetch;
const erroOriginal = console.error;

console.log('\nCHAMADA: STUN E TURN');

(async function () {
  try {
    // ------------------------------------------------------- sem variaveis
    let turn = carregar({});
    conferir('sem as variaveis, TURN desligado', turn.configurado(), false);
    let pedidos = 0;
    global.fetch = async () => { pedidos++; throw new Error('nao devia chamar a rede'); };
    let r = await turn.obter();
    conferir('  e devolve so o STUN de sempre', r, { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], turn: false });
    conferir('  sem chamar a Cloudflare', pedidos, 0);

    // ------------------------------------------------------ com variaveis
    turn = carregar({ CLOUDFLARE_TURN_KEY_ID: 'chave123', CLOUDFLARE_TURN_TOKEN: 'token-secreto' });
    conferir('com as duas variaveis, TURN ligado', turn.configurado(), true);

    let ultimo = null;
    pedidos = 0;
    global.fetch = async (url, opcoes) => {
      pedidos++;
      ultimo = { url, opcoes };
      await new Promise((ok) => setTimeout(ok, 20));
      return { ok: true, status: 201, json: async () => RESPOSTA };
    };

    const juntos = await Promise.all([turn.obter(), turn.obter(), turn.obter()]);
    conferir('tres pessoas entrando juntas geram UMA credencial', pedidos, 1);
    conferir('  e as tres recebem a mesma', juntos.every((x) => x.turn && x.iceServers === juntos[0].iceServers), true);
    conferir('pede na rota certa da Cloudflare', ultimo.url,
      'https://rtc.live.cloudflare.com/v1/turn/keys/chave123/credentials/generate-ice-servers');
    conferir('  com o token no cabecalho', ultimo.opcoes.headers.Authorization, 'Bearer token-secreto');
    conferir('  e validade de um dia', JSON.parse(ultimo.opcoes.body).ttl, 86400);

    r = juntos[0];
    const urls = r.iceServers.flatMap((s) => s.urls);
    conferir('porta 53 sai da lista (navegador bloqueia e so atrasa)', urls.some((u) => /:53\b/.test(u)), false);
    conferir('  e o resto fica', urls, [
      'stun:stun.cloudflare.com:3478',
      'turn:turn.cloudflare.com:3478?transport=udp',
      'turns:turn.cloudflare.com:443?transport=tcp',
    ]);
    conferir('vai usuario e senha temporarios, e nada alem disso',
      Object.keys(r.iceServers[1]).sort(), ['credential', 'urls', 'username']);
    conferir('o token da conta nunca vai pro navegador', JSON.stringify(r).includes('token-secreto'), false);

    await turn.obter();
    conferir('a credencial fica guardada (sem nova chamada)', pedidos, 1);

    // -------------------------------------------------- Cloudflare fora do ar
    console.error = () => {};   // o modulo loga a falha; aqui ela e esperada
    turn._zerar();
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ erro: 'token-secreto' }) });
    r = await turn.obter();
    conferir('Cloudflare fora do ar: cai pro STUN, sem erro', r.turn, false);
    conferir('  e a chamada continua com STUN', r.iceServers[0].urls, ['stun:stun.l.google.com:19302']);

    turn._zerar();
    global.fetch = async () => ({ ok: true, status: 201, json: async () => ({ iceServers: [{ urls: ['stun:x:3478'] }] }) });
    r = await turn.obter();
    conferir('resposta sem TURN nao conta como TURN ligado', r.turn, false);

    turn._zerar();
    global.fetch = async () => { throw new Error('timeout'); };
    r = await turn.obter();
    conferir('rede caiu: cai pro STUN', r.turn, false);
    console.error = erroOriginal;

    // -------------------------------------------------------- id estranho
    turn = carregar({ CLOUDFLARE_TURN_KEY_ID: '../../contas', CLOUDFLARE_TURN_TOKEN: 'x' });
    conferir('id com barra nao vira pedaco de URL', turn.configurado(), false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU com erro: ' + e.stack);
  } finally {
    global.fetch = fetchOriginal;
    console.error = erroOriginal;
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();
