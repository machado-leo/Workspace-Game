// O acervo da biblioteca (server/acervo.js): a pasta local, o que ele recusa, e
// a assinatura da conta de servico do Drive - conferida SEM rede, com uma chave
// gerada aqui mesmo.
//
// A parte que mais importa e a recusa: o id que chega do navegador nunca pode
// virar caminho no disco nem pedido direto pro Drive. Se virasse, a sede
// serviria qualquer arquivo que a conta de servico enxerga.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let ok = 0;
let falhou = 0;
function conferir(nome, veio, esperado) {
  const bate = JSON.stringify(veio) === JSON.stringify(esperado);
  console.log((bate ? '  ok   ' : '  FALHOU ') + nome
    + (bate ? '' : '\n         esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio)));
  bate ? ok++ : falhou++;
}

// Pasta de dados descartavel ANTES de carregar o modulo: dados.js le DATA_DIR
// na hora do require.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acervo-'));
process.env.DATA_DIR = tmp;
delete process.env.GOOGLE_DRIVE_PASTA;
delete process.env.GOOGLE_CONTA_SERVICO;
const acervo = require('../server/acervo');

const livros = path.join(tmp, 'livros');
fs.mkdirSync(livros, { recursive: true });
fs.writeFileSync(path.join(livros, 'Gestao_de_Processos - 2a edicao.pdf'), '%PDF-1.4\n%%EOF\n');
fs.writeFileSync(path.join(livros, 'Analise de Viabilidade.PDF'), '%PDF-1.4\n%%EOF\n');
fs.writeFileSync(path.join(livros, 'anotacoes.txt'), 'nao e livro');

console.log('\nACERVO');

(async function () {
  try {
    // --------------------------------------------------------- pasta local
    conferir('sem as variaveis do Drive, a origem e a pasta local', acervo.origem(), 'local');

    const { livros: lista } = await acervo.listar({ forcar: true });
    conferir('lista so os PDFs (o .txt fica de fora)', lista.length, 2);
    conferir('em ordem de titulo',
      lista.map((l) => l.titulo), ['Analise de Viabilidade', 'Gestao de Processos - 2a edicao']);
    conferir('o id e um hash curto, nao o nome do arquivo',
      lista.every((l) => /^[0-9a-f]{16}$/.test(l.id)), true);

    const publico = acervo.publico(lista[1]);
    // Lista fechada de proposito: o que NAO esta aqui (o nome do arquivo no
    // disco, o link do Drive) e justamente o que nao pode vazar pro navegador.
    // Campo novo so entra nesta linha depois de alguem olhar e decidir que pode
    // sair da sede - `precisaCapa` e um booleano de "ja tem capa guardada?".
    conferir('pro navegador nao vai nome de arquivo nem link',
      Object.keys(publico).sort(),
      ['atualizado', 'id', 'precisaCapa', 'setor', 'tamanho', 'temCapa', 'titulo']);
    conferir('PDF solto na raiz fica sem setor', publico.setor, null);

    const achado = await acervo.acharLivro(lista[0].id);
    conferir('acha o livro pelo id da listagem', achado && achado.titulo, 'Analise de Viabilidade');

    const aberto = await acervo.abrirArquivo(achado);
    conferir('e abre o arquivo certo, dentro da pasta',
      aberto.caminho && path.dirname(aberto.caminho), livros);

    // ------------------------------------------------------------- recusas
    conferir('id que tenta sair da pasta e recusado', await acervo.acharLivro('../../usuarios.json'), null);
    conferir('id com barra e recusado', await acervo.acharLivro('livros/x.pdf'), null);
    conferir('id que nao esta na listagem e recusado', await acervo.acharLivro('abcdef0123456789'), null);
    conferir('id vazio e recusado', await acervo.acharLivro(''), null);

    // livro novo entra sem esperar o cache vencer
    fs.writeFileSync(path.join(livros, 'Zeta.pdf'), '%PDF-1.4\n%%EOF\n');
    const idZeta = crypto.createHash('sha1').update('Zeta.pdf').digest('hex').slice(0, 16);
    conferir('livro que acabou de chegar abre na hora (sem esperar o cache)',
      (await acervo.acharLivro(idZeta) || {}).titulo, 'Zeta');

    // ------------------------------------------------------------- setores
    fs.mkdirSync(path.join(livros, '02. Marketing'));
    fs.mkdirSync(path.join(livros, 'Projetos', 'Antigos'), { recursive: true });
    fs.writeFileSync(path.join(livros, '02. Marketing', 'Posicionamento.pdf'), '%PDF-1.4\n%%EOF\n');
    fs.writeFileSync(path.join(livros, 'Projetos', 'Guia de Projetos.pdf'), '%PDF-1.4\n%%EOF\n');
    // mesmo nome de arquivo que um da raiz, em outro setor
    fs.writeFileSync(path.join(livros, 'Projetos', 'Zeta.pdf'), '%PDF-1.4\n%%EOF\n');
    fs.writeFileSync(path.join(livros, 'Projetos', 'Antigos', 'Fundo.pdf'), '%PDF-1.4\n%%EOF\n');

    const { livros: comSetor } = await acervo.listar({ forcar: true });
    conferir('subpasta vira setor, e o numero da frente sai do nome',
      comSetor.filter((l) => l.setor).map((l) => l.setor + ' / ' + l.titulo),
      ['Marketing / Posicionamento', 'Projetos / Guia de Projetos', 'Projetos / Zeta']);
    conferir('livro sem setor vem depois dos setores',
      comSetor.slice(-1)[0].setor, null);
    conferir('pasta dentro de setor e ignorada (so um nivel)',
      comSetor.some((l) => l.titulo === 'Fundo'), false);
    const zetas = comSetor.filter((l) => l.titulo === 'Zeta');
    conferir('o mesmo nome em dois lugares sao dois livros, com ids diferentes',
      zetas.length === 2 && zetas[0].id !== zetas[1].id, true);
    const guia = await acervo.acharLivro(comSetor.find((l) => l.titulo === 'Guia de Projetos').id);
    conferir('livro de setor abre de dentro da pasta do setor',
      path.dirname((await acervo.abrirArquivo(guia)).caminho), path.join(livros, 'Projetos'));
    conferir('e o setor vai pro navegador', acervo.publico(guia).setor, 'Projetos');

    conferir('"01. Marketing" vira "Marketing"', acervo._nomeDoSetor('01. Marketing'), 'Marketing');
    conferir('"3) Comercial" vira "Comercial"', acervo._nomeDoSetor('3) Comercial'), 'Comercial');
    conferir('nome sem numero fica igual', acervo._nomeDoSetor('Gente e Gestao'), 'Gente e Gestao');
    conferir('consulta do Drive pede PDF de qualquer uma das pastas',
      acervo._consultaDeLivros(['pastaA', 'pastaB']),
      "('pastaA' in parents or 'pastaB' in parents) and trashed = false and mimeType = 'application/pdf'");

    // ------------------------------------------------------------ o Drive
    conferir('aceita o link inteiro da pasta',
      (process.env.GOOGLE_DRIVE_PASTA = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing',
      acervo._pastaDoDrive()), '1AbCdEfGhIjKlMnOp');
    conferir('ou so o id', (process.env.GOOGLE_DRIVE_PASTA = '1AbCdEfGhIjKlMnOp', acervo._pastaDoDrive()), '1AbCdEfGhIjKlMnOp');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const conta = { client_email: 'robo@adm.iam.gserviceaccount.com', private_key: privateKey };
    process.env.GOOGLE_CONTA_SERVICO = JSON.stringify(conta);
    conferir('com as duas variaveis, a origem vira o Drive', acervo.origem(), 'drive');
    process.env.GOOGLE_CONTA_SERVICO = Buffer.from(JSON.stringify(conta)).toString('base64');
    conferir('  e a chave tambem vale em base64', acervo.origem(), 'drive');

    const jwt = acervo._montarJwt(conta, 1700000000);
    const [cab, corpo, assinatura] = jwt.split('.');
    const valida = crypto.createVerify('RSA-SHA256').update(cab + '.' + corpo)
      .verify(publicKey, Buffer.from(assinatura, 'base64url'));
    conferir('o JWT da conta de servico tem assinatura valida', valida, true);
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    conferir('pede so LEITURA do Drive', dados.scope, 'https://www.googleapis.com/auth/drive.readonly');
    conferir('  pro endpoint de token do Google', dados.aud, 'https://oauth2.googleapis.com/token');
    conferir('  e vale uma hora', dados.exp - dados.iat, 3600);

    process.env.GOOGLE_CONTA_SERVICO = '{nao e json';
    conferir('chave invalida nao derruba nada: volta pra pasta local', acervo.origem(), 'local');

    // A chave num ARQUIVO: o "Secret File" do Render, pra quando o painel nao comporta os mais
    // de 3 mil caracteres da variavel (foi o que aconteceu em 24/09).
    conferir('o arquivo secreto padrao e o do Render: /etc/secrets/conta-servico.json',
      acervo.ARQUIVO_CONTA_PADRAO, '/etc/secrets/conta-servico.json');
    const arqConta = path.join(tmp, 'conta-servico.json');
    fs.writeFileSync(arqConta, JSON.stringify(conta, null, 2));
    process.env.GOOGLE_CONTA_SERVICO_ARQUIVO = arqConta;
    delete process.env.GOOGLE_CONTA_SERVICO;
    conferir('so com a chave num arquivo (Secret File do Render), a origem vira o Drive', acervo.origem(), 'drive');
    fs.writeFileSync(arqConta, Buffer.from(JSON.stringify(conta)).toString('base64'));
    conferir('  e o arquivo tambem vale em base64', acervo.origem(), 'drive');
    process.env.GOOGLE_CONTA_SERVICO = JSON.stringify(conta).slice(0, 900);
    conferir('variavel colada pela metade nao esconde o arquivo: vale o arquivo',
      (acervo.contaDeServico() || {}).client_email, 'robo@adm.iam.gserviceaccount.com');
    process.env.GOOGLE_CONTA_SERVICO = JSON.stringify({ client_email: 'outro@adm.iam.gserviceaccount.com', private_key: privateKey });
    conferir('com as duas validas, vale a variavel', (acervo.contaDeServico() || {}).client_email, 'outro@adm.iam.gserviceaccount.com');
    delete process.env.GOOGLE_CONTA_SERVICO;
    fs.writeFileSync(arqConta, '{nao e json');
    conferir('arquivo invalido nao derruba nada: volta pra pasta local', acervo.origem(), 'local');
    process.env.GOOGLE_CONTA_SERVICO_ARQUIVO = path.join(tmp, 'nao-existe.json');
    conferir('arquivo que nao existe: pasta local, sem erro', acervo.origem(), 'local');
    delete process.env.GOOGLE_CONTA_SERVICO_ARQUIVO;

    // ------------------------------------------------------- capa guardada
    // A capa vem do navegador de uma pessoa e passa a ser servida pra sede
    // inteira. Entao ela e entrada de fora, e o que decide o tipo sao os BYTES,
    // nao o cabecalho que o cliente mandou.
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200, 7)]);
    const PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);

    conferir('capa: id fora do formato e recusado',
      acervo.guardarCapa('../../etc/passwd', JPEG), 'id invalido');
    conferir('capa: vazia e recusada', acervo.guardarCapa('livro001', Buffer.alloc(0)), 'vazio');
    conferir('capa: acima de 400 KB e recusada',
      acervo.guardarCapa('livro001', Buffer.concat([JPEG, Buffer.alloc(400 * 1024)])), 'grande demais');
    // Um HTML com Content-Type de imagem nao vira capa: quem decide e o byte.
    conferir('capa: arquivo que nao e imagem e recusado',
      acervo.guardarCapa('livro001', Buffer.from('<html>nao sou imagem</html>')), 'nao e imagem');

    conferir('capa: JPEG entra', acervo.guardarCapa('livro001', JPEG), null);
    conferir('  e o acervo passa a saber que existe', acervo._temCapaGuardada('livro001'), true);
    // A primeira vence: senao qualquer pessoa da sede trocaria a capa de um
    // livro por outra imagem depois, e a estante inteira e feita de capa.
    conferir('  a segunda tentativa nao substitui', acervo.guardarCapa('livro001', PNG), 'ja tem');
    conferir('capa: PNG tambem entra (em outro livro)',
      acervo.guardarCapa('livro002', PNG), null);
    conferir('livro sem capa guardada continua sem',
      acervo._temCapaGuardada('livro003'), false);
  } catch (e) {
    falhou++;
    console.log('  FALHOU com erro: ' + e.stack);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
  process.exit(falhou ? 1 : 0);
})();

assert.ok(true);
