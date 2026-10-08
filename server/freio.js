// Freio de ritmo: no maximo `max` acoes de uma mesma pessoa em `janelaMs`.
//
// POR QUE EXISTE
// Uma conta (ou um Enter preso) mandava ~990 mensagens por segundo e o servidor
// aceitava todas - medido de verdade. O canal guarda 200 por conversa, entao a
// enchente apagava o historico inteiro de todo mundo e ainda entregava cada
// mensagem a cada pessoa online. Ninguem digita 5 mensagens em 3 segundos por
// engano; e quem cola varias linhas de uma vez manda uma mensagem so.
//
// A chave e a CONTA (o uid), nao o socket: abrir varias abas nao multiplica o
// limite, e recarregar a pagina nao o zera.
//
// Janela deslizante: guarda o horario das ultimas acoes. Em memoria, e some no
// restart - o que esta certo: e um freio de ritmo, nao um registro.
function criar({ max, janelaMs }) {
  const historico = new Map();   // chave -> [horario, ...] (do mais velho ao mais novo)

  // `agora` so existe pro teste dar o relogio.
  function tentar(chave, agora) {
    const t = agora === undefined ? Date.now() : agora;
    let lista = historico.get(chave);
    if (!lista) {
      lista = [];
      historico.set(chave, lista);
    }
    const corte = t - janelaMs;
    while (lista.length && lista[0] <= corte) lista.shift();
    if (lista.length >= max) {
      // quanto falta pra a acao mais velha sair da janela e abrir uma vaga
      return { ok: false, esperarMs: Math.max(1, lista[0] + janelaMs - t) };
    }
    lista.push(t);
    return { ok: true, esperarMs: 0 };
  }

  // Quem parou de mandar sai do mapa: sem isto ele cresceria com cada conta que
  // ja falou alguma vez.
  const faxina = setInterval(() => {
    const corte = Date.now() - janelaMs;
    historico.forEach((lista, chave) => {
      if (!lista.length || lista[lista.length - 1] <= corte) historico.delete(chave);
    });
  }, Math.max(janelaMs, 10 * 1000));
  if (faxina.unref) faxina.unref();

  return { tentar, _tamanho: () => historico.size, _limpar: () => historico.clear() };
}

module.exports = { criar };
