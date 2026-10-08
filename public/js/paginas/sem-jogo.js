// As paginas de medicao carregam o game.js sem o jogo inteiro. Este arquivo
// roda ANTES do game.js e precisa continuar antes dele.
//
// Era um <script> inline repetido em auditoria.html e pecas.html; virou
// arquivo porque a CSP recusa script inline (ver testes/sem-inline.js).

// O pre-render pergunta ao ItemMesa se tem coisa sendo arrastada. Esta
// pagina nao carrega o jogo inteiro (nao precisa: so quer o mapa pronto),
// entao responde por ele que nao ha nada em movimento.
window.ItemMesa = { estaMovendo: function () { return false; }, selecaoAtual: function () { return null; } };
