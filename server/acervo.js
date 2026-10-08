// O acervo da biblioteca: de onde vem cada livro, a capa dele e o arquivo.
// Ver docs/estante.md.
//
// DUAS ORIGENS, A MESMA CARA
//
//   Drive - a pasta da biblioteca no Google Drive da empresa, lida por uma CONTA
//           DE SERVICO (um "robo" do Google Cloud) com quem a pasta foi
//           compartilhada so pra leitura. Liga quando existem as duas variaveis:
//             GOOGLE_DRIVE_PASTA    id da pasta (o pedaco final do link dela)
//             GOOGLE_CONTA_SERVICO  o JSON da chave da conta de servico
//
//   Local - a pasta `livros/` dentro da pasta de dados (DATA_DIR). Serve pra
//           desenvolvimento e pra estante funcionar antes do Drive estar
//           ligado: poe o PDF la e ele aparece.
//
// POR QUE CONTA DE SERVICO, E NAO O LOGIN GOOGLE DE CADA PESSOA
// A pasta e da EMPRESA, nao de quem esta logado. Com o login de cada um, toda
// pessoa precisaria ter a pasta compartilhada com ela, conectar a conta Google
// e aceitar o escopo de Drive - e visitante sem conta Google nao leria nada.
// Com a conta de servico o servidor le a pasta uma vez por todos, a pasta
// continua PRIVADA no Drive, e o livro chega no navegador pelo nosso servidor.
//
// SEGURANCA
// O id que o navegador manda nunca vira caminho nem vai direto pro Drive: ele so
// e aceito se estiver na ULTIMA LISTAGEM da pasta. Sem isso, qualquer id de
// arquivo que a conta de servico enxergue poderia ser baixado pela sede.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const pastaDados = require('./dados');

const PASTA_LOCAL = pastaDados.arquivo('livros');

// ----------------------------------------------------------- capa guardada
//
// A capa de um livro e a PRIMEIRA PAGINA dele - conferido olhando: nos livros
// do acervo (ENAP, SRAP, OpenStax) a pagina 1 e a capa publicada mesmo, com
// arte, titulo e editora.
//
// O problema nunca foi QUAL imagem, foi QUANTAS VEZES. Sem isto aqui, a pagina
// 1 e desenhada no navegador de CADA pessoa, TODA vez que ela abre a estante -
// e pra desenhar a pagina 1 o navegador precisa baixar o comeco do PDF, que nos
// livros da OpenStax da uns 30 MB. Por isso a capa simplesmente nao aparecia:
// nao era erro, era o download nao terminando antes de a pessoa fechar.
//
// Agora a primeira pessoa que abre a estante depois de o livro entrar desenha a
// capa uma vez e MANDA pro servidor. Dali em diante ela vem pronta, pra todo
// mundo, e sobrevive a reiniciar o servidor. Do ponto de vista de quem usa, a
// capa aparece sozinha quando o livro e adicionado.
//
// Por que nao desenhar no servidor: renderizar PDF em Node pede biblioteca
// nativa (canvas), e este projeto nao tem etapa de build de proposito. O
// navegador ja tem o PDF.js carregado e ja sabe desenhar a pagina - o que
// faltava era so nao jogar fora o resultado.
const PASTA_CAPAS = pastaDados.arquivo('capas');
const CAPA_MAX = 400 * 1024;   // a capa de 150px que o leitor faz da ~7 KB

// O tipo e decidido pelos BYTES, nao pelo Content-Type que o cliente mandou:
// cabecalho quem escreve e quem envia, e a partir daqui o arquivo vira imagem
// servida pra sede inteira. JPEG e PNG porque sao o que o canvas produz - e o
// leitor exporta JPEG, que numa capa de 150px fica em 7 KB.
const TIPOS_CAPA = [
  { ext: 'jpg', mime: 'image/jpeg', magico: Buffer.from([0xff, 0xd8, 0xff]) },
  { ext: 'png', mime: 'image/png', magico: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
];

function idDeCapaValido(id) {
  return /^[A-Za-z0-9_-]{6,128}$/.test(String(id || ''));
}

function tipoDaImagem(buf) {
  return TIPOS_CAPA.find((t) => buf.subarray(0, t.magico.length).equals(t.magico)) || null;
}

// Devolve { caminho, mime } da capa ja guardada, ou null.
function capaGuardada(id) {
  if (!idDeCapaValido(id)) return null;
  for (const t of TIPOS_CAPA) {
    const p = path.join(PASTA_CAPAS, id + '.' + t.ext);
    if (fs.existsSync(p)) return { caminho: p, mime: t.mime };
  }
  return null;
}

function temCapaGuardada(id) {
  return !!capaGuardada(id);
}

// Guarda a capa que o navegador desenhou. Devolve o motivo quando recusa, pra
// rota poder responder direito.
//
// A PRIMEIRA vence: capa que ja existe nao e substituida. Sem essa regra,
// qualquer pessoa da sede poderia trocar a capa de um livro por outra imagem
// depois - e a estante inteira e feita de capa, entao isso valeria uma pichacao
// no acervo. Trocar de proposito continua possivel: e so apagar o arquivo em
// DATA_DIR/capas.
function guardarCapa(id, buf) {
  if (!idDeCapaValido(id)) return 'id invalido';
  if (!Buffer.isBuffer(buf) || !buf.length) return 'vazio';
  if (buf.length > CAPA_MAX) return 'grande demais';
  const tipo = tipoDaImagem(buf);
  if (!tipo) return 'nao e imagem';
  if (capaGuardada(id)) return 'ja tem';
  fs.mkdirSync(PASTA_CAPAS, { recursive: true });
  fs.writeFileSync(path.join(PASTA_CAPAS, id + '.' + tipo.ext), buf);
  // A lista tem cache. Sem mexer nela aqui, a estante continuaria dizendo
  // "ainda nao tem capa" ate o cache virar, e quem recarregasse nesse meio
  // tempo desenharia a capa de novo pra nada.
  if (listaCache) {
    const l = listaCache.livros.find((x) => x.id === id);
    if (l) l.capaGuardada = true;
  }
  return null;
}
const CACHE_MS = 60 * 1000;          // a pasta do Drive muda pouco; a estante abre muito
const LIVROS_MAX = 500;

// So PDF por enquanto: e o que o leitor da sede abre. EPUB entra quando o
// leitor souber ler EPUB - listar sem conseguir abrir seria prometer e nao
// cumprir.
const TIPO_PDF = 'application/pdf';

// --------------------------------------------------------------- utilidades

// "Gestao_de_Processos - 2a edicao.pdf" -> "Gestao de Processos - 2a edicao"
// Hifen fica como esta: em titulo de livro ele quase sempre e parte do nome.
function tituloDoArquivo(nome) {
  return nome
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

// SETORES: cada subpasta da pasta da biblioteca e um setor (Marketing,
// Projetos...). So um nivel: estante com arvore de pastas vira gaveta de
// arquivo, e ninguem acha livro. PDF solto na raiz fica sem setor.
//
// "01. Marketing" -> "Marketing": o numero serve pra ordenar a pasta no Drive,
// mas na estante e ruido. A ordem continua vindo do nome inteiro da pasta.
function nomeDoSetor(pasta) {
  return String(pasta).replace(/^\s*\d+\s*[.)\-]\s*/, '').trim() || String(pasta);
}

// Setor na ordem das pastas, livro sem setor por ultimo, e titulo dentro de cada.
function ordenar(livros) {
  return livros.sort((a, b) => {
    if (a.ordem !== b.ordem) {
      if (a.ordem === null) return 1;
      if (b.ordem === null) return -1;
      return a.ordem.localeCompare(b.ordem, 'pt-BR', { numeric: true });
    }
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });
}

// ----------------------------------------------------------- origem: Drive

// A chave da conta de servico vem, nesta ordem:
//   1. de GOOGLE_CONTA_SERVICO (o JSON, puro ou em base64);
//   2. de um ARQUIVO: o de GOOGLE_CONTA_SERVICO_ARQUIVO ou, sem ela, o "Secret File" do Render
//      chamado conta-servico.json (o Render poe em /etc/secrets/). A chave tem mais de 3 mil
//      caracteres em base64, e em 24/09 nao coube no campo de variavel do painel do Render:
//      arquivo secreto e o lugar que o Render tem pra credencial desse tamanho.
// Vale a primeira que for uma chave de verdade: uma variavel colada pela metade nao esconde
// o arquivo.
const ARQUIVO_CONTA_PADRAO = '/etc/secrets/conta-servico.json';
const fontesAvisadas = new Set();

function lerChave(texto) {
  try {
    // Aceita o JSON puro ou em base64 - painel de hospedagem as vezes estraga
    // quebra de linha, e a chave privada tem varias.
    const puro = texto.startsWith('{') ? texto : Buffer.from(texto, 'base64').toString('utf8');
    const conta = JSON.parse(puro);
    return conta && conta.client_email && conta.private_key ? conta : null;
  } catch (e) {
    return null;
  }
}

function contaDeServico() {
  const arquivo = String(process.env.GOOGLE_CONTA_SERVICO_ARQUIVO || '').trim() || ARQUIVO_CONTA_PADRAO;
  const fontes = [
    { de: 'GOOGLE_CONTA_SERVICO', ler: () => String(process.env.GOOGLE_CONTA_SERVICO || '').trim() },
    // Arquivo que nao existe e o normal fora do Render: nao e erro, so nao ha chave ali.
    { de: arquivo, ler: () => { try { return fs.readFileSync(arquivo, 'utf8').trim(); } catch (e) { return ''; } } },
  ];
  for (const fonte of fontes) {
    const texto = fonte.ler();
    if (!texto) continue;
    const conta = lerChave(texto);
    if (conta) return conta;
    // Uma vez por fonte: isto roda a cada listagem da estante, e o log nao pode virar ruido.
    if (!fontesAvisadas.has(fonte.de)) {
      fontesAvisadas.add(fonte.de);
      console.error('[acervo] ' + fonte.de + ' invalido: nao e um JSON de conta de servico');
    }
  }
  return null;
}

function pastaDoDrive() {
  // aceita o id puro ou o link inteiro da pasta
  const v = String(process.env.GOOGLE_DRIVE_PASTA || '').trim();
  const m = v.match(/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{10,}$/.test(v) ? v : '');
}

// JWT assinado com a chave da conta de servico, trocado por um token de acesso.
// E o fluxo "service account" do Google, feito a mao com o crypto do Node pra
// nao trazer a biblioteca inteira do Google so por causa de uma assinatura.
// O escopo padrao e so leitura - e o que a estante usa. O backup (server/backup.js)
// pede escrita, e mesmo assim so escreve onde a conta de servico foi convidada
// como editora: o escopo e o teto, o compartilhamento no Drive e o limite real.
function montarJwt(conta, agora = Math.floor(Date.now() / 1000), escopo = 'https://www.googleapis.com/auth/drive.readonly') {
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: conta.client_email,
    scope: escopo,
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));
  const assinatura = crypto.createSign('RSA-SHA256')
    .update(cabecalho + '.' + corpo)
    .sign(conta.private_key, 'base64url');
  return cabecalho + '.' + corpo + '.' + assinatura;
}

let tokenCache = null;   // { valor, expira }

async function tokenDoDrive() {
  if (tokenCache && tokenCache.expira > Date.now() + 60 * 1000) return tokenCache.valor;
  const conta = contaDeServico();
  if (!conta) throw new Error('conta de servico nao configurada');
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: montarJwt(conta),
    }),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || !dados.access_token) {
    throw new Error('o Google recusou a conta de servico: ' + (dados.error_description || dados.error || resp.status));
  }
  tokenCache = { valor: dados.access_token, expira: Date.now() + (dados.expires_in || 3600) * 1000 };
  return tokenCache.valor;
}

// O alvo e a RAIZ de um drive compartilhado, ou uma pasta dentro de um?
//
// A diferenca importa e o sintoma de errar e traicoeiro: a API responde 200 com
// ZERO arquivos, igualzinho a um drive vazio. Ou seja, errar aqui nao da erro -
// da uma estante vazia sem explicacao.
//
// Num drive compartilhado a pasta raiz tem o MESMO id do drive. Entao basta
// perguntar `drives/<id>`: se responder, o id e de um drive, e ai a consulta
// precisa dizer em qual drive procurar (`corpora` + `driveId`). Se nao, e uma
// pasta comum e a busca padrao serve. A resposta e guardada - nao muda em
// tempo de execucao.
let ehDriveCompartilhado = null;
async function alvoEhDrive(token) {
  if (ehDriveCompartilhado !== null) return ehDriveCompartilhado;
  const id = pastaDoDrive();
  if (!id) { ehDriveCompartilhado = false; return false; }
  try {
    const r = await fetch(
      'https://www.googleapis.com/drive/v3/drives/' + encodeURIComponent(id) + '?fields=id',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    ehDriveCompartilhado = r.ok;
  } catch (e) {
    // sem rede agora: nao decide nada, tenta de novo na proxima
    return false;
  }
  return ehDriveCompartilhado;
}

// Uma consulta ao Drive, seguindo as paginas ate acabar (ou ate o teto).
async function consultarDrive(token, q, campos) {
  const itens = [];
  let pagina = '';
  const noDrive = await alvoEhDrive(token);
  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(' + campos + ')',
      orderBy: 'name',
      pageSize: '1000',
      // pasta num Drive COMPARTILHADO (de equipe) so aparece com estes dois
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (noDrive) {
      // procura DENTRO daquele drive, e nao no "meu drive" da conta de servico
      params.set('corpora', 'drive');
      params.set('driveId', pastaDoDrive());
    }
    if (pagina) params.set('pageToken', pagina);
    const resp = await fetch('https://www.googleapis.com/drive/v3/files?' + params, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const motivo = (dados.error && dados.error.message) || resp.status;
      throw new Error('o Drive recusou a listagem: ' + motivo);
    }
    itens.push(...(dados.files || []));
    pagina = dados.nextPageToken || '';
  } while (pagina && itens.length < LIVROS_MAX);
  return itens;
}

// "Algum destes e o pai" - os ids vem do proprio Drive (ou do pastaDoDrive,
// que ja filtrou), entao nao tem aspas pra escapar.
function consultaDeLivros(pastas) {
  const pais = pastas.map((id) => `'${id}' in parents`).join(' or ');
  return `(${pais}) and trashed = false and mimeType = '${TIPO_PDF}'`;
}

async function listarDrive() {
  const token = await tokenDoDrive();
  const pasta = pastaDoDrive();
  const subpastas = await consultarDrive(token,
    `'${pasta}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    'id,name');
  const nomeDaPasta = new Map(subpastas.map((p) => [p.id, p.name]));
  const pastas = [pasta, ...subpastas.map((p) => p.id)];

  const livros = [];
  // Em lotes: a consulta do Drive tem limite de tamanho, e cada pasta e um "or".
  for (let i = 0; i < pastas.length && livros.length < LIVROS_MAX; i += 25) {
    const arquivos = await consultarDrive(token, consultaDeLivros(pastas.slice(i, i + 25)),
      'id,name,size,modifiedTime,thumbnailLink,parents');
    for (const f of arquivos) {
      const pai = (f.parents || []).find((p) => nomeDaPasta.has(p));
      livros.push({
        id: f.id,
        titulo: tituloDoArquivo(f.name),
        nome: f.name,
        setor: pai ? nomeDoSetor(nomeDaPasta.get(pai)) : null,
        ordem: pai ? nomeDaPasta.get(pai) : null,
        tamanho: Number(f.size) || 0,
        atualizado: f.modifiedTime || null,
        // A miniatura do Drive e a primeira pagina do PDF: capa de graca.
        // O "=s220" do fim e o tamanho; pedimos maior pra nao sair borrada.
        miniatura: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s640') : null,
      });
    }
  }
  return ordenar(livros).slice(0, LIVROS_MAX);
}

async function abrirDrive(livro, range) {
  const token = await tokenDoDrive();
  const headers = { Authorization: 'Bearer ' + token };
  // Repassar o Range e o que deixa o leitor abrir um livro de 300 paginas sem
  // baixar ele inteiro antes de mostrar a primeira.
  if (range) headers.Range = range;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(livro.id)}?alt=media&supportsAllDrives=true`,
    { headers }
  );
  if (!resp.ok && resp.status !== 206) throw new Error('o Drive recusou o arquivo: ' + resp.status);
  const saida = { status: resp.status, headers: { 'Content-Type': TIPO_PDF, 'Accept-Ranges': 'bytes' } };
  ['content-length', 'content-range'].forEach((h) => {
    const v = resp.headers.get(h);
    if (v) saida.headers[h.replace(/(^|-)\w/g, (s) => s.toUpperCase())] = v;
  });
  saida.stream = Readable.fromWeb(resp.body);
  return saida;
}

async function abrirCapaDrive(livro) {
  if (!livro.miniatura) return null;
  const token = await tokenDoDrive();
  const resp = await fetch(livro.miniatura, { headers: { Authorization: 'Bearer ' + token } });
  if (!resp.ok) return null;
  return {
    headers: { 'Content-Type': resp.headers.get('content-type') || 'image/jpeg' },
    stream: Readable.fromWeb(resp.body),
  };
}

// ----------------------------------------------------------- origem: local

function idLocal(nome) {
  return crypto.createHash('sha1').update(nome).digest('hex').slice(0, 16);
}

const ehPdf = (d) => d.isFile() && /\.pdf$/i.test(d.name);

// `relativo` e "arquivo.pdf" (raiz) ou "Setor/arquivo.pdf". O id sai do caminho
// relativo: o mesmo nome de arquivo em dois setores sao dois livros.
function livroLocal(relativo, pasta) {
  const st = fs.statSync(path.join(PASTA_LOCAL, relativo));
  return {
    id: idLocal(relativo),
    titulo: tituloDoArquivo(path.basename(relativo)),
    nome: relativo,
    setor: pasta ? nomeDoSetor(pasta) : null,
    ordem: pasta || null,
    tamanho: st.size,
    atualizado: st.mtime.toISOString(),
    miniatura: null,     // sem miniatura: o navegador desenha a 1a pagina
  };
}

function listarLocal() {
  if (!fs.existsSync(PASTA_LOCAL)) fs.mkdirSync(PASTA_LOCAL, { recursive: true });
  const livros = [];
  for (const d of fs.readdirSync(PASTA_LOCAL, { withFileTypes: true })) {
    if (ehPdf(d)) {
      livros.push(livroLocal(d.name, null));
    } else if (d.isDirectory() && !d.name.startsWith('.')) {
      for (const f of fs.readdirSync(path.join(PASTA_LOCAL, d.name), { withFileTypes: true })) {
        if (ehPdf(f)) livros.push(livroLocal(d.name + '/' + f.name, d.name));
      }
    }
  }
  return ordenar(livros).slice(0, LIVROS_MAX);
}

// ------------------------------------------------------------------ publico

function origem() {
  return contaDeServico() && pastaDoDrive() ? 'drive' : 'local';
}

let listaCache = null;   // { origem, livros, em }

async function listar({ forcar = false } = {}) {
  const agora = Date.now();
  const org = origem();
  if (!forcar && listaCache && listaCache.origem === org && agora - listaCache.em < CACHE_MS) {
    return listaCache;
  }
  const livros = org === 'drive' ? await listarDrive() : listarLocal();
  // Uma olhada no disco por livro, so aqui (a lista tem cache): e o que faz a
  // estante saber que a capa ja existe sem ninguem desenhar de novo.
  livros.forEach((l) => { l.capaGuardada = temCapaGuardada(l.id); });
  listaCache = { origem: org, livros, em: agora };
  return listaCache;
}

// So devolve livro que esta na listagem - ver SEGURANCA no topo.
async function acharLivro(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(id)) return null;
  let { livros } = await listar();
  let livro = livros.find((l) => l.id === id);
  if (!livro) {
    // pode ser livro que acabou de entrar na pasta: uma segunda olhada, sem cache
    ({ livros } = await listar({ forcar: true }));
    livro = livros.find((l) => l.id === id);
  }
  return livro || null;
}

// Pra rota: devolve o caminho no disco (local) ou o fluxo do Drive.
async function abrirArquivo(livro, range) {
  if (origem() === 'drive') return abrirDrive(livro, range);
  return { caminho: path.join(PASTA_LOCAL, livro.nome) };
}

// A capa guardada ganha da miniatura do Drive: ela ja esta no disco, sai sem
// uma volta na rede, e e a mesma pagina 1. E ela e a UNICA fonte no modo local.
async function abrirCapa(livro) {
  const guardada = capaGuardada(livro.id);
  if (guardada) {
    return {
      headers: { 'Content-Type': guardada.mime },
      stream: fs.createReadStream(guardada.caminho),
    };
  }
  if (origem() === 'drive') return abrirCapaDrive(livro);
  return null;
}

// O que vai pro navegador: sem nome de arquivo nem link do Drive.
function publico(livro) {
  return {
    id: livro.id,
    titulo: livro.titulo,
    setor: livro.setor || null,
    tamanho: livro.tamanho,
    atualizado: livro.atualizado,
    temCapa: !!(livro.capaGuardada || livro.miniatura),
    // Diz pro navegador se vale a pena desenhar a pagina 1 e mandar pra ca.
    // Sem isto ele nao teria como saber a diferenca entre "a capa ja existe" e
    // "ninguem fez ainda", e ou desenharia sempre ou nunca.
    precisaCapa: !livro.capaGuardada,
  };
}

module.exports = {
  origem,
  listar,
  acharLivro,
  abrirArquivo,
  abrirCapa,
  guardarCapa,
  publico,
  PASTA_LOCAL,
  PASTA_CAPAS,
  contaDeServico,
  ARQUIVO_CONTA_PADRAO,
  montarJwt,
  // expostos pro testes/acervo.js
  _temCapaGuardada: temCapaGuardada,
  _montarJwt: montarJwt,
  _tituloDoArquivo: tituloDoArquivo,
  _pastaDoDrive: pastaDoDrive,
  _nomeDoSetor: nomeDoSetor,
  _consultaDeLivros: consultaDeLivros,
};
