// Restaurar um backup na mao.
//
//   npm run restaurar                  lista os backups (Drive e locais)
//   npm run restaurar -- ultimo        restaura o mais novo (Drive, ou local se nao houver Drive)
//   npm run restaurar -- <nome>        restaura esse (ex.: sede-backup-2026-09-14T03-14-00Z.bin)
//
// Com o servidor DESLIGADO: ele tem os dados em memoria e gravaria por cima.
// O que estava na pasta vai antes pra DATA_DIR/antes-da-restauracao-<data>/.
// Ver docs/backup.md.
process.env.BACKUP_EM_DEV = '1';   // comando deliberado: vale fora de producao
require('./ambiente');
const fs = require('fs');
const path = require('path');
const backup = require('./backup');

(async () => {
  const pedido = process.argv[2];
  const locais = fs.existsSync(backup.PASTA_LOCAL)
    ? fs.readdirSync(backup.PASTA_LOCAL).filter((n) => !Number.isNaN(backup._quandoDoNome(n))).sort().reverse()
    : [];
  let noDrive = [];
  if (backup.driveConfigurado()) {
    try {
      noDrive = (await backup.listarNoDrive()).sort((a, b) => (a.name < b.name ? 1 : -1));
    } catch (e) {
      console.error('Nao consegui listar o Drive: ' + e.message);
    }
  } else {
    console.log('(Drive de backup nao configurado: BACKUP_DRIVE_PASTA, BACKUP_CHAVE e GOOGLE_CONTA_SERVICO)');
  }

  if (!pedido) {
    console.log('\nNo Drive (' + noDrive.length + '):');
    noDrive.slice(0, 20).forEach((f) => console.log('  ' + f.name + '  ' + Math.round(f.size / 1024) + ' KB'));
    console.log('\nLocais em ' + backup.PASTA_LOCAL + ' (' + locais.length + '):');
    locais.slice(0, 20).forEach((n) => console.log('  ' + n));
    console.log('\nPra restaurar: npm run restaurar -- ultimo   (ou o nome de um deles)\n');
    return;
  }

  let buf;
  let nome;
  const doDrive = pedido === 'ultimo' ? noDrive[0] : noDrive.find((f) => f.name === pedido);
  if (doDrive) {
    nome = doDrive.name + ' (Drive)';
    buf = await backup.baixarDoDrive(doDrive.id);
  } else {
    const local = pedido === 'ultimo' ? locais[0] : locais.find((n) => n === pedido);
    if (!local) {
      console.error('Nao achei "' + pedido + '". Rode sem argumento pra ver a lista.');
      process.exit(1);
    }
    nome = local + ' (local)';
    buf = fs.readFileSync(path.join(backup.PASTA_LOCAL, local));
  }

  const pacote = backup.desempacotar(buf, backup.chave());
  const r = backup.aplicar(pacote);
  console.log('\nRestaurado: ' + nome);
  console.log('Arquivos: ' + r.arquivos.join(', '));
  if (r.guardadoEm) console.log('O que estava antes foi guardado em: ' + r.guardadoEm);
  console.log('Backup feito em: ' + new Date(pacote.criadoEm).toLocaleString('pt-BR') + '\n');
})().catch((e) => {
  console.error('Falhou: ' + e.message);
  process.exit(1);
});
