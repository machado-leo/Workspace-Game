// Acervo fisico e emprestimo (server/emprestimos.js).
//
// O sistema existe pra ninguem ir ate a estante e descobrir que o livro sumiu.
// Entao o que importa: um livro com uma pessoa nao pode ser "pego" por outra,
// quem devolve e quem pegou (ou a diretoria), e o estado sobrevive ao servidor
// reiniciar.
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

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'adm-emprestimos-'));
process.env.DATA_DIR = PASTA;
const emprestimos = require('../server/emprestimos');

const ana = { id: 'u-ana', nome: 'Ana Clara', isAdmin: false };
const bia = { id: 'u-bia', nome: 'Bia', isAdmin: false };
const chefe = { id: 'u-chefe', nome: 'Chefe', isAdmin: true };

console.log('\nACERVO FISICO E EMPRESTIMO');

try {
  const lista = emprestimos.listar();
  conferir('catalogo carregado das fotos', lista.length > 90, true);
  conferir('  cada livro com id unico', new Set(lista.map((l) => l.id)).size, lista.length);
  conferir('  todos com titulo e setor', lista.every((l) => l.titulo && l.setor), true);
  conferir('  livro que tem PDF legal aponta pro digital', lista.filter((l) => l.digital).length >= 5, true);

  const livro = lista.find((l) => /Fundos de Investimento/.test(l.titulo));
  conferir('comeca na sala', livro.emprestimo, null);

  conferir('Ana pega', emprestimos.pegar(livro.id, ana), { ok: true });
  const agora = emprestimos.listar().find((l) => l.id === livro.id).emprestimo;
  conferir('  e o livro fica com ela', [agora.uid, agora.nome], ['u-ana', 'Ana Clara']);
  conferir('Bia NAO pega o livro que esta com a Ana', emprestimos.pegar(livro.id, bia), { erro: 'Esse livro esta com Ana Clara.', status: 409 });
  conferir('Ana pegar de novo nao muda nada', emprestimos.pegar(livro.id, ana), { ok: true });
  conferir('Bia NAO devolve o livro da Ana', emprestimos.devolver(livro.id, bia).status, 403);

  // sobrevive ao servidor reiniciar (e a restauracao do backup, que le o mesmo arquivo)
  emprestimos._recarregar();
  conferir('reiniciou: continua com a Ana', emprestimos.listar().find((l) => l.id === livro.id).emprestimo.uid, 'u-ana');

  conferir('diretoria marca como devolvido (ex-membro que levou o livro)', emprestimos.devolver(livro.id, chefe), { ok: true });
  conferir('  e o livro volta pra sala', emprestimos.listar().find((l) => l.id === livro.id).emprestimo, null);
  conferir('Ana pega e ela mesma devolve', [emprestimos.pegar(livro.id, ana).ok, emprestimos.devolver(livro.id, ana).ok], [true, true]);

  conferir('id que nao esta no catalogo: 404', emprestimos.pegar('nao-existe', ana).status, 404);
  conferir('o arquivo de emprestimo entra no backup', require('../server/backup').ARQUIVOS.includes('emprestimos.json'), true);
} catch (e) {
  falhou++;
  console.log('  FALHOU com erro: ' + e.stack);
} finally {
  fs.rmSync(PASTA, { recursive: true, force: true });
}

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
