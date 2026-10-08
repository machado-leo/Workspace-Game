// Link pendurado em movel: o que a diretoria pode pendurar, e o que nao pode.
//
// O teste que importa aqui e o da URL. O link e aberto pelo navegador de TODA
// visita, entao um `javascript:` guardado no mapa viraria codigo rodando na
// sessao dos outros. Por isso a validacao e testada dos dois lados: na escrita
// e na LEITURA do arquivo, que e editavel a mao.
//
// Usa DATA_DIR numa pasta temporaria: nao encosta em server/data.
const fs = require('fs');
const os = require('os');
const path = require('path');

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-conteudo-'));
process.env.DATA_DIR = PASTA;

const map = require('../server/map.js');
const mapaEditado = require('../server/mapa-editado.js');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  ok   ' + nome); return; }
  falhou++;
  console.log('  FALHOU ' + nome + '\n         esperava ' + b + ', veio ' + a);
}

console.log('\nLINK NO MOVEL');

// Acha uma celula com movel e uma de chao livre, no mapa de verdade.
let comMovel = null;
let vazia = null;
for (let r = 0; r < map.ROWS && (!comMovel || !vazia); r++) {
  for (let c = 0; c < map.COLS; c++) {
    if (!comMovel && map.tiles[r][c] === map.ESTANTE) comMovel = [c, r];
    if (!vazia && map.tiles[r][c] === map.LIVRE) vazia = [c, r];
  }
}

// ------------------------------------------------------------------ endereco
conferir('https passa', !!mapaEditado.urlValida('https://drive.google.com/x'), true);
conferir('http passa', !!mapaEditado.urlValida('http://exemplo.com'), true);
conferir('javascript: NAO passa', mapaEditado.urlValida('javascript:alert(1)'), null);
conferir('JaVaScRiPt: tambem nao', mapaEditado.urlValida('JaVaScRiPt:alert(1)'), null);
conferir('data: nao passa', mapaEditado.urlValida('data:text/html,<script>x</script>'), null);
conferir('file: nao passa', mapaEditado.urlValida('file:///C:/'), null);
conferir('texto solto nao passa', mapaEditado.urlValida('drive.google.com'), null);
conferir('vazio nao passa', mapaEditado.urlValida('   '), null);
conferir('url gigante nao passa', mapaEditado.urlValida('https://x.com/' + 'a'.repeat(600)), null);

// -------------------------------------------------------------------- onde
conferir('movel pode ter link', mapaEditado.podeTerConteudo(comMovel[0], comMovel[1]), true);
conferir('chao vazio NAO pode', mapaEditado.podeTerConteudo(vazia[0], vazia[1]), false);
conferir('fora do mapa nao pode', mapaEditado.podeTerConteudo(-1, 0), false);

// ------------------------------------------------------------------ guardar
const posto = mapaEditado.definirConteudo(
  comMovel[0], comMovel[1],
  { titulo: '  Planilha   de horas  ', url: 'https://exemplo.com/planilha' },
  'uid-do-chefe'
);
conferir('a diretoria pendura o link', posto, true);

const guardado = mapaEditado.conteudosParaEnvio()
  .find((x) => x.c === comMovel[0] && x.r === comMovel[1]);
conferir('o nome vem limpo de espaco duplo', guardado.titulo, 'Planilha de horas');
conferir('e o link vem normalizado', guardado.url, 'https://exemplo.com/planilha');
conferir('com a marca de quem pendurou', guardado.porUid, 'uid-do-chefe');

conferir('link ruim nao entra', mapaEditado.definirConteudo(
  comMovel[0], comMovel[1], { titulo: 'x', url: 'javascript:alert(1)' }, 'uid'
), null);
conferir('sem nome nao entra', mapaEditado.definirConteudo(
  comMovel[0], comMovel[1], { titulo: '   ', url: 'https://exemplo.com' }, 'uid'
), null);
conferir('no chao vazio nao entra', mapaEditado.definirConteudo(
  vazia[0], vazia[1], { titulo: 'x', url: 'https://exemplo.com' }, 'uid'
), null);
conferir('e o link bom continua la depois das recusas',
  mapaEditado.conteudosParaEnvio().length, 1);

// ------------------------------------------------- apagar o movel leva o link
const resultado = mapaEditado.editar(comMovel[0], comMovel[1], map.LIVRE);
conferir('apagar o movel mudou o mapa', resultado.mudou, true);
conferir('e derrubou o link junto', resultado.linkCaiu, true);
conferir('nao sobrou link orfao no chao', mapaEditado.conteudosParaEnvio().length, 0);

// ------------------------------------------ a leitura do arquivo tambem filtra
// Alguem edita mapa.json na mao e cola um javascript: la. Ao reabrir, o servidor
// tem que ignorar - senao a validacao da escrita nao vale de nada.
const arquivo = path.join(PASTA, 'mapa.json');
const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
dados.conteudos = [
  { c: comMovel[0], r: comMovel[1] + 0, titulo: 'Armadilha', url: 'javascript:alert(1)' },
  { c: 0, r: 0, titulo: 'Sem url' },
];
fs.writeFileSync(arquivo, JSON.stringify(dados));

delete require.cache[require.resolve('../server/mapa-editado.js')];
delete require.cache[require.resolve('../server/map.js')];
const recarregado = require('../server/mapa-editado.js');
conferir('arquivo adulterado volta sem nenhum link', recarregado.conteudosParaEnvio().length, 0);

try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ja foi */ }

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
