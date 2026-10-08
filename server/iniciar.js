// Arranque de producao (npm start): restaura o backup, se precisar, e sobe a sede.
//
// Por que um arquivo so pra isso: as contas, o chat e as mesas sao lidos do
// disco na hora em que os modulos carregam. A restauracao tem que acontecer
// ANTES do primeiro require que le dado - senao o servidor sobe com a pasta
// vazia, e o backup volta pro disco sem ninguem ler.
//
// Restaura so com a pasta VAZIA e backup no Drive configurado (server/backup.js).
// Falhou (sem rede, chave errada)? Avisa bem alto e sobe assim mesmo: sede fora
// do ar por causa do backup seria pior que sede sem os dados de ontem.
require('./ambiente');
const backup = require('./backup');

(async () => {
  try {
    const r = await backup.restaurarSeVazio();
    if (r.restaurado) {
      console.log('[backup] RESTAURADO do Drive: ' + r.restaurado + ' (' + r.arquivos.join(', ') + ')');
    } else if (r.motivo !== 'ja tem dados') {
      console.log('[backup] nada restaurado: ' + r.motivo);
    }
  } catch (e) {
    console.error('');
    console.error('[backup] ATENCAO: a pasta de dados esta vazia e NAO consegui restaurar o backup do Drive:');
    console.error('[backup]   ' + e.message);
    console.error('[backup] A sede vai subir vazia e o envio pro Drive fica TRAVADO ate reiniciar, pra');
    console.error('[backup] nao subir uma sede vazia por cima dos backups bons. Ver docs/backup.md.');
    backup.travarEnvio();
    console.error('');
  }
  require('./index.js');
})();
