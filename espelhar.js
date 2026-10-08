// Atualiza o espelho de deploy no GitHub - e dele que o Render faz o deploy.
//
//   npm run espelhar
//
// Por que existe: o Render nao le do seu PC, le do GitHub. E o repositorio do
// GitHub nao e este monorepo: e um espelho **so da pasta escritorio-virtual/**,
// sem `referencias/` (sao prints de um produto de terceiro) e com uma secao a
// mais no README explicando isso. Reproduzir isso na mao toda vez da errado -
// foi assim que o escritorio ficou 10 commits atrasado no ar.
//
// Como funciona: clona o espelho num diretorio de trabalho, joga a pasta atual
// por cima (apagando o que sumiu daqui), commita e empurra. Como o commit novo
// nasce em cima do que ja esta no GitHub, o push e sempre fast-forward - por
// isso nao da o conflito de historico que o `git subtree push` dava.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REMOTO = 'https://github.com/adm-solucoes/escritorio-virtual.git';
const BRANCH = 'main';
const AQUI = __dirname;
const TRABALHO = path.join(os.tmpdir(), 'espelho-escritorio-virtual');

// O que nunca vai pro espelho.
//
// Os `CONTINUAR-*.md` sao anotacao interna de handoff entre sessoes, e nao
// documentacao do produto. Eles nomeiam a conta de servico da biblioteca, o
// projeto no Google Cloud, os ids dos drives (inclusive o da CONTABILIDADE) e
// em que pasta do PC do Caio esta o arquivo da chave. Nada disso e senha, mas e
// exatamente o mapa que alguem usaria pra procurar uma - e o espelho e um
// repositorio PUBLICO. Ficam so aqui no monorepo.
const DE_FORA = new Set([
  '.git', 'node_modules', 'referencias', 'data',
  'CONTINUAR-AQUI.md', 'CONTINUAR-BIBLIOTECA.md',
  // O `.env` nunca foi pro espelho, mas ate aqui isso dependia de UMA coisa dar
  // certo: o `.gitignore` e copiado junto, e o `git add -A` la embaixo obedece a
  // ele. Funciona - e e frageis demais pro que esta em jogo. Um `.gitignore`
  // editado, um merge infeliz, e as credenciais do Google, do Trello e a chave
  // da conta de servico vao pra um repositorio PUBLICO de uma vez so.
  //
  // Agora ele nem e copiado: nao chega nem na pasta temporaria. O `.gitignore`
  // continua sendo a segunda tranca, e nao a unica.
  '.env',
]);

const APENDICE_README = `
---

## Sobre este repositorio

Espelho de deploy da pasta \`escritorio-virtual/\` de um monorepo interno da ADM
Solucoes. E dele que o Render faz o deploy. A pasta \`referencias/\` fica so no
repositorio interno: sao prints de um produto de terceiro.
`;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function passo(texto) {
  console.log('  ' + texto);
}

// Copia recursiva pulando o que nao vai pro espelho. `data` so e pulada dentro
// de server/ - uma pasta chamada data em outro lugar nao teria motivo pra sumir.
// Pastas cujo NOME COMECA assim tambem ficam de fora. Existe por causa dos
// `server/data-backup-<data>/`, que o restaurar.js cria antes de sobrescrever:
// eles sao copias de server/data, ou seja, tem hash de senha e o segredo das
// sessoes dentro. Nome com data no fim nao cabe numa lista de nomes exatos.
//
// `CONTINUAR-` esta aqui pelo mesmo motivo: os dois handoffs de hoje estao
// nomeados um a um la em cima, mas o proximo ainda nao existe - e quem escreve
// um handoff no fim de uma sessao longa e justamente quem nao vai lembrar de
// vir editar esta lista. Com o prefixo, ele nasce de fora do espelho.
const PREFIXOS_DE_FORA = ['data-backup-', 'CONTINUAR-'];

function copiar(origem, destino, relativo) {
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const rel = relativo ? relativo + '/' + item.name : item.name;
    if (DE_FORA.has(item.name) && (item.name !== 'data' || rel === 'server/data')) continue;
    if (PREFIXOS_DE_FORA.some((p) => item.name.startsWith(p))) continue;

    const de = path.join(origem, item.name);
    const para = path.join(destino, item.name);
    if (item.isDirectory()) copiar(de, para, rel);
    else fs.copyFileSync(de, para);
  }
}

// Esvazia o espelho (menos o .git) pra que arquivo apagado aqui suma la tambem.
function limpar(dir) {
  for (const item of fs.readdirSync(dir)) {
    if (item === '.git') continue;
    fs.rmSync(path.join(dir, item), { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(path.join(AQUI, 'server', 'index.js'))) {
    console.error('Rode de dentro de escritorio-virtual/ (nao achei server/index.js).');
    process.exit(1);
  }

  let sha = 'sem git';
  let sujo = false;
  try {
    sha = git(['rev-parse', '--short', 'HEAD'], AQUI).trim();
    sujo = git(['status', '--porcelain', '--', AQUI], AQUI).trim().length > 0;
  } catch (e) { /* sem git aqui: segue, o espelho nao depende disso */ }

  if (sujo) {
    console.log('');
    console.log('  Aviso: voce tem mudanca nao commitada em escritorio-virtual/.');
    console.log('  O espelho leva o que esta no disco AGORA, commitado ou nao.');
  }

  console.log('');
  passo('1/5  preparando ' + TRABALHO);
  if (fs.existsSync(path.join(TRABALHO, '.git'))) {
    git(['fetch', 'origin', BRANCH], TRABALHO);
    git(['checkout', '-B', BRANCH, 'origin/' + BRANCH], TRABALHO);
  } else {
    fs.rmSync(TRABALHO, { recursive: true, force: true });
    git(['clone', '--branch', BRANCH, REMOTO, TRABALHO]);
  }

  // O clone nao herda a sua identidade quando o git global nao esta configurado,
  // e ai o commit morre com "Author identity unknown". Copiar daqui resolve e de
  // quebra faz o commit do espelho sair com o mesmo autor dos daqui.
  for (const chave of ['user.name', 'user.email']) {
    try {
      const valor = git(['config', '--get', chave], AQUI).trim();
      if (valor) git(['config', chave, valor], TRABALHO);
    } catch (e) { /* sem valor aqui tambem: deixa o git reclamar na hora certa */ }
  }

  passo('2/5  copiando a pasta (sem referencias/, node_modules/ e server/data/)');
  limpar(TRABALHO);
  copiar(AQUI, TRABALHO, '');

  passo('3/5  acrescentando a secao "Sobre este repositorio" no README');
  const readme = path.join(TRABALHO, 'README.md');
  const texto = fs.readFileSync(readme, 'utf8').replace(/\s+$/, '');
  fs.writeFileSync(readme, texto + '\n' + APENDICE_README);

  passo('4/5  commitando');
  git(['add', '-A'], TRABALHO);
  if (!git(['status', '--porcelain'], TRABALHO).trim()) {
    console.log('');
    console.log('  Nada mudou: o que esta no ar ja e igual ao seu PC.');
    console.log('');
    return;
  }
  const mudou = git(['diff', '--cached', '--stat'], TRABALHO).trim().split('\n');
  mudou.slice(0, 12).forEach((l) => console.log('       ' + l));
  if (mudou.length > 12) console.log('       ... e mais ' + (mudou.length - 12) + ' linhas');
  // A data entra junto porque o espelho pode ser refeito varias vezes com o
  // mesmo HEAD (com mudanca ainda nao commitada aqui), e ai so o sha nao
  // distingue um espelho do outro.
  const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  git(['commit', '-m', 'Espelho de ' + sha + ' (' + quando + ')'], TRABALHO);

  passo('5/5  empurrando pro GitHub');
  git(['push', 'origin', BRANCH], TRABALHO);

  console.log('');
  console.log('  Pronto. O Render vai perceber sozinho e refazer o deploy.');
  console.log('  Leva uns minutos; acompanhe em https://dashboard.render.com');
  console.log('');
}

try {
  main();
} catch (e) {
  console.error('');
  console.error('  Falhou: ' + (e.stderr || e.message || e));
  console.error('');
  console.error('  Se foi no push, e quase sempre login: o GitHub pede um token,');
  console.error('  nao a senha da conta. Faca `git push` uma vez na mao em');
  console.error('  ' + TRABALHO + ' pra ele guardar a credencial.');
  console.error('');
  process.exit(1);
}
