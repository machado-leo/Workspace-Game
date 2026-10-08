// Acervo FISICO da sala da ADM e quem esta com cada livro. Ver docs/estante.md.
//
// O catalogo (server/acervo-fisico.json) foi transcrito das fotos das estantes
// da ADM. O que o servidor guarda e so o EMPRESTIMO: quem pegou e desde quando
// (DATA_DIR/emprestimos.json, que entra no backup).
//
// VARIAS SEDES (docs/varias-sedes.md): o catalogo da ADM e da ADM. Ele morava em
// public/ - e ai ficava aberto em /dados/acervo-fisico.json em TODO endereco,
// inclusive no de outra empresa. Agora fica fora do que o navegador alcanca, e
// cada sede escolhe o dela em ACERVO_FISICO:
//   - ausente    -> o da ADM (esta pasta), como sempre foi;
//   - um caminho -> o catalogo daquele cliente;
//   - nenhum     -> sede sem acervo fisico: a aba "Na sala" nem aparece.
//
// A REGRA
// Pega quem e da sede (visitante nao leva livro da sala). Livro com alguem nao
// pode ser pego por outra pessoa - o sistema existe justamente pra ninguem ir
// ate a estante e descobrir que o livro sumiu. Devolve quem pegou, ou a
// diretoria: sem a segunda parte, o livro de quem saiu da EJ ficaria "com
// Fulano" pra sempre.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pastaDados = require('./dados');

const ESCOLHA = String(process.env.ACERVO_FISICO || '').trim();
const CATALOGO = ESCOLHA === 'nenhum' ? null
  : (ESCOLHA ? path.resolve(ESCOLHA) : path.join(__dirname, 'acervo-fisico.json'));
const ARQUIVO = pastaDados.arquivo('emprestimos.json');

// Id estavel sem depender da etiqueta (metade dos livros nao tem codigo legivel):
// titulo + autor + setor. Dois "Comportamento do Consumidor" de autores
// diferentes sao dois livros.
function idDe(l) {
  return crypto.createHash('sha1').update([l.titulo, l.autor, l.setor].join('|')).digest('hex').slice(0, 12);
}

let catalogo = [];
function carregarCatalogo() {
  if (!CATALOGO) { catalogo = []; return; }
  try {
    const bruto = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
    catalogo = (bruto.livros || []).map((l) => Object.assign({ id: idDe(l) }, l));
  } catch (e) {
    console.error('[emprestimos] nao consegui ler o catalogo: ' + e.message);
    catalogo = [];
  }
}

let emprestimos = {};   // id -> { uid, nome, desde }
function carregar() {
  try {
    if (fs.existsSync(ARQUIVO)) emprestimos = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')).emprestimos || {};
  } catch (e) {
    console.error('[emprestimos] arquivo ilegivel, comecando vazio: ' + e.message);
    emprestimos = {};
  }
}

function salvar() {
  pastaDados.gravarSeguro(ARQUIVO, JSON.stringify({ emprestimos }, null, 2));
}

function listar() {
  return catalogo.map((l) => Object.assign({}, l, { emprestimo: emprestimos[l.id] || null }));
}

function pegar(id, usuario) {
  const livro = catalogo.find((l) => l.id === id);
  if (!livro) return { erro: 'Esse livro nao esta no catalogo.', status: 404 };
  const atual = emprestimos[id];
  if (atual && atual.uid !== usuario.id) {
    return { erro: 'Esse livro esta com ' + atual.nome + '.', status: 409 };
  }
  if (!atual) {
    emprestimos[id] = { uid: usuario.id, nome: usuario.nome, desde: Date.now() };
    salvar();
  }
  return { ok: true };
}

function devolver(id, usuario) {
  const livro = catalogo.find((l) => l.id === id);
  if (!livro) return { erro: 'Esse livro nao esta no catalogo.', status: 404 };
  const atual = emprestimos[id];
  if (!atual) return { ok: true };
  if (atual.uid !== usuario.id && !usuario.isAdmin) {
    return { erro: 'Quem devolve e ' + atual.nome + ' (ou a diretoria).', status: 403 };
  }
  delete emprestimos[id];
  salvar();
  return { ok: true };
}

carregarCatalogo();
carregar();

// Sede com acervo fisico? (a tela esconde a aba quando nao tem)
function ativo() {
  return !!CATALOGO;
}

module.exports = { listar, pegar, devolver, ativo, _idDe: idDe, _recarregar: () => { carregarCatalogo(); carregar(); } };
