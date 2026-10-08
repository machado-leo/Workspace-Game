// Reunioes internas da sede: quem pode marcar o que, e onde.
//
// O que este teste guarda de verdade sao duas regras que quebram a reuniao DE
// VERDADE quando falham:
//
//   1. duas reunioes na mesma sala no mesmo horario. A sala e fisica: as duas
//      turmas chegam e uma tem que sair. Nao da pra "entrar nas duas".
//   2. cabine de chamada nao e sala de reuniao. As cabines tambem sao
//      privativas, mas sao pra uma pessoa - marcar "Alinhamento do Comercial"
//      numa cabine e marcar reuniao onde nao cabe reuniao.
//
// Roda contra o MAPA DE VERDADE: se alguem mexer na planta e tirar a mesa de
// reuniao de uma sala, este teste avisa.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Pasta descartavel: o modulo grava reunioes.json, e nao pode encostar no
// server/data de verdade.
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-reunioes-'));
process.env.DATA_DIR = PASTA;

// Uma reuniao ja gravada numa sala que SAIU da planta: o segundo huddle, que a
// planta compacta nao tem. Gravada antes de o modulo carregar, que e quando ele
// le o arquivo.
const DAQUI_A_UM_DIA = Date.now() + 24 * 60 * 60 * 1000;
fs.writeFileSync(path.join(PASTA, 'reunioes.json'), JSON.stringify({
  reunioes: [{
    id: 1, titulo: 'No huddle que saiu', sala: 'huddle2',
    inicio: DAQUI_A_UM_DIA, fim: DAQUI_A_UM_DIA + 30 * 60000, porUid: 'u-caio', porNome: 'Caio',
  }],
  proximoId: 2,
}));

const reunioes = require('../server/reunioes.js');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

console.log('\nREUNIOES DA SEDE');

const CAIO = { uid: 'u-caio', nome: 'Caio', isAdmin: true };
const ZE = { uid: 'u-ze', nome: 'Ze', isAdmin: false };
const DAQUI_A_UMA_HORA = Date.now() + 60 * 60 * 1000;

try {
  conferir('reuniao gravada numa sala que saiu da planta fica de fora', reunioes.listar(), []);

  // ------------------------------------------------------- onde cabe marcar
  const salas = reunioes.salasDisponiveis();
  const ids = salas.map((s) => s.id).sort();
  conferir('as salas de reuniao saem da planta', ids, ['huddle1', 'reuniao']);
  conferir('cabine de chamada NAO entra', ids.some((i) => i.startsWith('cabine')), false);
  conferir('e cada sala diz quantos lugares tem',
    salas.every((s) => s.lugares > 0), true);

  // --------------------------------------------------------------- o basico
  const r1 = reunioes.criar(
    { titulo: 'Alinhamento do Comercial', inicio: DAQUI_A_UMA_HORA, minutos: 60, sala: 'reuniao' }, CAIO);
  conferir('marca uma reuniao', !!r1.reuniao, true);
  conferir('  com a sala pelo nome', r1.reuniao.salaNome, 'Sala de Reuniao');
  conferir('  e o fim calculado da duracao', r1.reuniao.fim - r1.reuniao.inicio, 60 * 60 * 1000);

  // ------------------------------------------- duas na mesma sala e no mesmo horario
  const chocando = reunioes.criar(
    { titulo: 'Outra', inicio: DAQUI_A_UMA_HORA + 30 * 60000, minutos: 30, sala: 'reuniao' }, ZE);
  conferir('sala ocupada recusa, e diz com o que chocou',
    chocando.erro, 'Essa sala ja tem "Alinhamento do Comercial" nesse horario.');

  const outraSala = reunioes.criar(
    { titulo: 'Huddle de Projetos', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'huddle1' }, ZE);
  conferir('mesma hora em OUTRA sala pode', !!outraSala.reuniao, true);

  const depois = reunioes.criar(
    { titulo: 'Retro', inicio: DAQUI_A_UMA_HORA + 2 * 60 * 60000, minutos: 30, sala: 'reuniao' }, ZE);
  conferir('mesma sala depois que a outra acaba, pode', !!depois.reuniao, true);

  // ------------------------------------------------------------- o que nao vale
  conferir('sem titulo nao marca',
    reunioes.criar({ titulo: '   ', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'huddle1' }, CAIO).erro,
    'Poe um titulo na reuniao.');
  conferir('em cabine nao marca',
    reunioes.criar({ titulo: 'X', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'cabine1' }, CAIO).erro,
    'Escolhe uma sala da sede.');
  conferir('em sala inventada nao marca',
    reunioes.criar({ titulo: 'X', inicio: DAQUI_A_UMA_HORA, minutos: 30, sala: 'sala-secreta' }, CAIO).erro,
    'Escolhe uma sala da sede.');
  conferir('de 5 minutos nao marca',
    reunioes.criar({ titulo: 'X', inicio: DAQUI_A_UMA_HORA, minutos: 5, sala: 'huddle1' }, CAIO).erro,
    'A duracao tem que ficar entre 15 minutos e 8 horas.');
  conferir('sem data nao marca',
    reunioes.criar({ titulo: 'X', inicio: 'ontem', minutos: 30, sala: 'huddle1' }, CAIO).erro,
    'Escolhe a data e a hora.');
  conferir('semana passada nao marca',
    reunioes.criar({ titulo: 'X', inicio: Date.now() - 7 * 24 * 3600e3, minutos: 30, sala: 'huddle1' }, CAIO).erro,
    'Essa data ja passou faz tempo.');
  // Marcar as 14h faltando cinco minutos e caso de verdade, entao um dia pra
  // tras e aceito de proposito.
  conferir('hoje mais cedo AINDA marca',
    !!reunioes.criar({ titulo: 'A que acabou', inicio: Date.now() - 2 * 3600e3, minutos: 30, sala: 'huddle1' }, CAIO).reuniao,
    true);

  // ----------------------------------------------------------- quem desmarca
  conferir('quem nao marcou nao desmarca',
    reunioes.remover(r1.reuniao.id, ZE).erro, 'So quem marcou (ou a diretoria) desmarca.');
  conferir('a diretoria desmarca a dos outros',
    !!reunioes.remover(outraSala.reuniao.id, CAIO).reuniao, true);
  conferir('quem marcou desmarca a sua',
    !!reunioes.remover(r1.reuniao.id, { uid: CAIO.uid, isAdmin: false }).reuniao, true);
  conferir('desmarcar o que nao existe avisa',
    reunioes.remover(99999, CAIO).erro, 'Essa reuniao nao existe mais.');

  // ------------------------------------------------------- o link da reuniao
  // Quem e de fora entra pelo link (ver docs/plano-reuniao-por-link.md). Aqui, as
  // regras do link em si; o caminho inteiro - visitante, sala de espera, membro
  // que admite - esta em testes/reuniao-link.js.
  const linkReuniao = require('../server/link-reuniao.js');
  const tokenDe = (r) => r.link.slice('/r/'.length);
  const rL = reunioes.criar(
    { titulo: 'Com link', inicio: DAQUI_A_UMA_HORA + 5 * 3600e3, minutos: 60, sala: 'huddle1' }, CAIO).reuniao;

  conferir('toda reuniao nasce com um link /r/<token>', /^\/r\/[\w.-]+$/.test(rL.link), true);
  conferir('  e a lista traz o link de cada uma', reunioes.listar().every((r) => /^\/r\//.test(r.link)), true);
  conferir('  o token diz qual e a reuniao', linkReuniao.ler(tokenDe(rL)).id, rL.id);
  conferir('  e o link acha a reuniao', (reunioes.porLink(linkReuniao.ler(tokenDe(rL))) || {}).id, rL.id);
  conferir('  link de outra reuniao nao acha esta',
    (reunioes.porLink(linkReuniao.ler(tokenDe(reunioes.listar().find((r) => r.id !== rL.id)))) || {}).id === rL.id, false);
  conferir('  id igual mas criada em outro momento (disco apagado, id reaproveitado): nao acha',
    reunioes.porLink({ id: rL.id, criadaEm: rL.criadaEm + 1, versao: 1 }), null);
  conferir('  lixo no lugar do token nao acha nada',
    [linkReuniao.ler(''), linkReuniao.ler('a.b'), linkReuniao.ler(null), linkReuniao.ler('x'.repeat(500))], [null, null, null, null]);

  // Quando o link vale: meia hora antes ate duas horas depois do fim
  const ini = rL.inicio;
  const fimR = rL.fim;
  conferir('horario: um milissegundo antes da abertura ainda esta fechado',
    reunioes.estadoDoLink(rL, ini - reunioes.LINK_ABRE_ANTES_MS - 1), 'antes');
  conferir('  na abertura (meia hora antes) abre', reunioes.estadoDoLink(rL, ini - reunioes.LINK_ABRE_ANTES_MS), 'aberta');
  conferir('  durante a reuniao esta aberta', reunioes.estadoDoLink(rL, ini + 10 * 60000), 'aberta');
  conferir('  passou do fim marcado, ainda abre (reuniao estoura)', reunioes.estadoDoLink(rL, fimR + 60 * 60000), 'aberta');
  conferir('  no limite (duas horas depois do fim) ainda abre', reunioes.estadoDoLink(rL, fimR + reunioes.LINK_FECHA_DEPOIS_MS), 'aberta');
  conferir('  um milissegundo depois, encerrou', reunioes.estadoDoLink(rL, fimR + reunioes.LINK_FECHA_DEPOIS_MS + 1), 'encerrada');

  // "Novo link"
  const tokenAntigo = tokenDe(rL);
  conferir('novo link: quem nao marcou nao troca', reunioes.novoLink(rL.id, ZE).erro, 'So quem marcou (ou a diretoria) troca o link.');
  conferir('  o link continua o mesmo', tokenDe(reunioes.listar().find((r) => r.id === rL.id)), tokenAntigo);
  const trocado = reunioes.novoLink(rL.id, { uid: CAIO.uid, isAdmin: false });
  conferir('  quem marcou troca', !!trocado.reuniao && tokenDe(trocado.reuniao) !== tokenAntigo, true);
  conferir('  o link velho para de achar a reuniao', reunioes.porLink(linkReuniao.ler(tokenAntigo)), null);
  conferir('  o novo acha', (reunioes.porLink(linkReuniao.ler(tokenDe(trocado.reuniao))) || {}).id, rL.id);
  conferir('  a diretoria troca a de outra pessoa', !!reunioes.novoLink(rL.id, { uid: 'u-outra', isAdmin: true }).reuniao, true);
  conferir('  reuniao que nao existe avisa', reunioes.novoLink(99999, CAIO).erro, 'Essa reuniao nao existe mais.');
  conferir('  desmarcada, o link some',
    (reunioes.remover(rL.id, CAIO), reunioes.porLink(linkReuniao.ler(tokenDe(trocado.reuniao)))), null);

  // --------------------------------------------------------------- no disco
  conferir('a lista sai em ordem de horario',
    reunioes.listar().map((r) => r.titulo),
    ['A que acabou', 'Retro']);
  // O gravador junta as escritas (400ms), entao o arquivo aparece depois.
  setTimeout(() => {
    const arq = path.join(PASTA, 'reunioes.json');
    conferir('e fica gravada no disco', fs.existsSync(arq), true);
    if (fs.existsSync(arq)) {
      const doDisco = JSON.parse(fs.readFileSync(arq, 'utf8'));
      conferir('  com as reunioes que sobraram', doDisco.reunioes.length, 2);
    }
    fs.rmSync(PASTA, { recursive: true, force: true });
    console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
    process.exit(falhou ? 1 : 0);
  }, 700);
} catch (e) {
  falhou++;
  console.log('  FALHOU com erro: ' + e.stack);
  fs.rmSync(PASTA, { recursive: true, force: true });
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(1);
}
