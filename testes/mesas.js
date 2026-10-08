// Testa as regras de server/mesas.js direto, sem navegador - as que precisam de
// duas pessoas nao dao pra testar numa aba so (o SEM_LOGIN poe todo mundo na
// mesma conta).
//
//   npm run teste
//
// Ele mexe em server/data/mesas.json e devolve o conteudo no fim. Com o
// servidor rodando, feche a sede antes: o processo dele tem a lista em memoria
// e vai regravar por cima na proxima mudanca.
const path = require('path');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');
const ARQUIVO = path.join(RAIZ, 'server', 'data', 'mesas.json');

// guarda o arquivo de verdade pra devolver no fim
const original = fs.existsSync(ARQUIVO) ? fs.readFileSync(ARQUIVO, 'utf8') : null;
fs.writeFileSync(ARQUIVO, JSON.stringify({ mesas: [] }));

const mesas = require(path.join(RAIZ, 'server', 'mesas.js'));

const ANA = 'uid-ana';
const BRUNO = 'uid-bruno';
let ok = 0;
let falhou = 0;

function conferir(nome, real, esperado) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(real)));
  bate ? ok++ : falhou++;
}

// A Ana pega a mesa clicando na celula da direita dela
conferir('Ana pega a mesa clicando em 14,13', mesas.alternar(14, 13, ANA), true);
conferir('  a mesa dela e a 12,13 (celula da esquerda)', mesas.mesaDaPessoa(ANA), '12,13');
conferir('  e a mesa tem as 3 celulas', mesas.paraEnvio()[0].celulas.length, 3);

// O Bruno tenta pegar a mesma mesa, por outra celula
conferir('Bruno nao rouba a mesa da Ana (clicando em 12,13)', mesas.alternar(12, 13, BRUNO), false);
conferir('  e a mesa continua da Ana', mesas.mesaDaPessoa(ANA), '12,13');
conferir('  Bruno segue sem mesa', mesas.mesaDaPessoa(BRUNO), null);

// O Bruno pega a mesa do lado
conferir('Bruno pega a mesa vizinha', mesas.alternar(16, 13, BRUNO), true);
conferir('  sao duas mesas ocupadas', mesas.paraEnvio().length, 2);

// A Ana troca de mesa: a antiga tem que ficar livre
conferir('Ana troca pra uma terceira mesa', mesas.alternar(26, 16, ANA), true);
conferir('  a mesa nova e dela', mesas.mesaDaPessoa(ANA), '24,16');
conferir('  continua com 2 ocupadas (nao acumulou)', mesas.paraEnvio().length, 2);

// Largar pelo perfil
conferir('Ana larga pelo perfil', mesas.largarDe(ANA), true);
conferir('  ficou so a do Bruno', mesas.paraEnvio().length, 1);
conferir('  largar de novo nao faz nada', mesas.largarDe(ANA), false);

// Nao e mesa
conferir('clicar no chao nao pega nada', mesas.alternar(12, 11, ANA), false);   // o eixo, na planta compacta

// ---- itens em cima da mesa (posicao livre) ----
const CANECA = 5;
const LIVROS = 10;
mesas.alternar(14, 13, ANA); // Ana volta pra mesa 12,13
const itensDa = (chave) => mesas.paraEnvio().find((m) => m.chave === chave).itens;

conferir('Ana poe caneca na propria mesa', mesas.porItem(12.3, 13.2, CANECA, ANA), true);
conferir('  e outra na MESMA celula, noutro ponto', mesas.porItem(12.8, 13.35, CANECA, ANA), true);
conferir('  as duas ficam (nao e uma por celula)', itensDa('12,13').length, 2);
const primeiro = itensDa('12,13')[0];
conferir('  e guardam a posicao com fracao', [primeiro.o, primeiro.x, primeiro.y], [CANECA, 12.3, 13.2]);
conferir('Ana poe livros noutra celula da mesma mesa', mesas.porItem(14.2, 13.1, LIVROS, ANA), true);

conferir('Bruno NAO poe nada na mesa da Ana', mesas.porItem(13.5, 13.3, CANECA, BRUNO), false);
conferir('Ana NAO poe nada na mesa do Bruno', mesas.porItem(16.5, 13.3, CANECA, ANA), false);
conferir('ninguem poe item no chao', mesas.porItem(14.5, 22.5, CANECA, ANA), false);

// o id que ainda nao existe - a armadilha do OBJETO_MAX
const map = require(path.join(RAIZ, 'server', 'map.js'));
conferir('item acima do OBJETO_MAX (' + map.OBJETO_MAX + ') e recusado',
  mesas.porItem(13.5, 13.4, map.OBJETO_MAX + 1, ANA), false);

// tirar e mover apontam pelo ID, nao por "o mais perto" - com duas canecas
// encostadas, chute nao serve
conferir('objeto 0 nao serve mais de borracha', mesas.porItem(12.85, 13.4, 0, ANA), false);
const alvoId = itensDa('12,13')[1].id;
conferir('cada coisa tem id proprio', typeof alvoId === 'string' && alvoId.length > 3, true);
conferir('mover leva a coisa certa pro ponto novo', mesas.moverItem(alvoId, 13.9, 13.25, ANA), true);
conferir('  e ela foi mesmo', itensDa('12,13').find((i) => i.id === alvoId).x, 13.9);
conferir('  a outra nao saiu do lugar', itensDa('12,13')[0].x, 12.3);
conferir('Bruno nao move coisa da mesa da Ana', mesas.moverItem(alvoId, 13, 13, BRUNO), false);
conferir('nao da pra mover pra fora da mesa', mesas.moverItem(alvoId, 16.5, 13.3, ANA), false);
conferir('Bruno nao tira coisa da mesa da Ana', mesas.tirarItem(alvoId, BRUNO), false);
conferir('tirar pelo id funciona', mesas.tirarItem(alvoId, ANA), true);
conferir('  e tirou a certa (sobrou a de 12.3)', itensDa('12,13')[0].x, 12.3);
conferir('tirar id que nao existe nao faz nada', mesas.tirarItem('naoexiste', ANA), false);

// teto por mesa
let postos = 0;
for (let i = 0; i < 30; i++) if (mesas.porItem(12.1 + (i % 5) * 0.1, 13.1, CANECA, ANA)) postos++;
conferir('a mesa nao aceita item infinito', itensDa('12,13').length <= 14, true);

conferir('largar a mesa leva as coisas junto', mesas.largarDe(ANA), true);
mesas.alternar(14, 13, ANA);
conferir('  e a mesa volta vazia', itensDa('12,13').length, 0);

mesas.porItem(12.5, 13.3, CANECA, ANA);
conferir('trocar de mesa tambem larga as coisas', mesas.alternar(26, 16, ANA), true);
conferir('  a mesa antiga nao esta mais na lista',
  mesas.paraEnvio().some((m) => m.chave === '12,13'), false);
mesas.largarDe(ANA);

// Sobrevive ao restart: le o arquivo de novo num processo limpo
const salvo = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
conferir('o disco guardou a mesa do Bruno', salvo.mesas, [{ chave: '16,13', uid: BRUNO, itens: [] }]);

fs.writeFileSync(ARQUIVO, original === null ? JSON.stringify({ mesas: [] }, null, 2) : original);
console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam');
process.exit(falhou ? 1 : 0);
