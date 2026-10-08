# Backup automatico

A sede guarda tudo em JSON no disco: contas, chat, reunioes, mesas, mapa. Tres
coisas apagam isso de vez, e o backup existe pras tres:

1. **O disco da hospedagem.** No Render gratis ele some quando o site dorme
   (15 min sem ninguem) ou atualiza.
2. **Arquivo corrompido.**
3. **Erro humano** - a diretoria removendo a pessoa errada, por exemplo.

Codigo: `server/backup.js`, `server/iniciar.js`, `server/restaurar.js`. Teste:
`testes/backup.js` (31 conferencias, com um Google Drive falso).

## Duas copias, porque sao dois perigos

| Onde | Quando | Guarda | Protege de |
|---|---|---|---|
| `DATA_DIR/backups/` | 1 por hora, se algo mudou | as ultimas 48 | arquivo corrompido, erro humano |
| Drive compartilhado da ADM | 5 min depois de mudar, e **na saida do servidor** | 30 mais novos + 1 por dia por 30 dias | **tudo**, inclusive o disco sumir |

A copia local mora no mesmo disco dos dados: nao salva de perder o disco. Por
isso a do Drive e a que importa em hospedagem.

Backup velho no Drive vai pra **lixeira** (fica 30 dias recuperavel), nunca e
apagado de vez.

## O que entra e o que nao

Entra: `usuarios.json`, `config.json`, `chat.json`, `mesas.json`,
`reunioes.json`, `mapa.json`, `codigo-sede.txt`, `codigo-admin.txt`.

**Fica de fora de proposito:**
- `google.json` - tokens do Google Agenda de cada pessoa. Vazar e caro (acesso
  a agenda dela); perder e barato (a pessoa clica "Conectar" de novo).
- `capas/` (o navegador refaz), `livros/` (moram no Drive da biblioteca).

## Criptografado no Drive, sempre

O pacote tem as **mensagens diretas** e o hash das senhas. Quem tiver acesso ao
drive de backup nao pode ler a DM de ninguem. Por isso:

- tudo vai cifrado (AES-256-GCM, chave derivada da `BACKUP_CHAVE`)
- **sem `BACKUP_CHAVE`, nada sobe pro Drive** - a copia local continua
- arquivo adulterado ou cortado e recusado na restauracao, em vez de restaurar lixo

> **Guarde a `BACKUP_CHAVE` num lugar seguro (gerenciador de senhas).** Sem ela,
> nenhum backup abre - nem por nos, nem pelo Google.

## Volta sozinho

`npm start` agora e `server/iniciar.js`. Se a pasta de dados estiver **vazia**
(sem `usuarios.json`) e o backup no Drive estiver configurado, ele baixa o mais
recente e restaura **antes** de carregar as contas. E isso que faz o Render
gratis parar de apagar as contas: dormiu, acordou vazio, restaurou.

Com dado no disco, o disco e a verdade: nada e restaurado por cima.

**Se a restauracao falhar** (chave trocada no painel, Drive fora do ar), o log
avisa bem alto, a sede sobe vazia e **o envio pro Drive fica travado** ate
reiniciar. Sem essa trava, o proximo backup seria de uma sede vazia, viraria o
"mais recente", e o arranque seguinte restauraria o vazio.

## So em producao

O Drive so e usado com `NODE_ENV=production`. O PC de desenvolvimento subindo
com a mesma `.env` mandaria as contas de teste pro backup de verdade - e, pior,
com a pasta vazia **restauraria as DMs da sede no computador de quem esta
programando**. `BACKUP_EM_DEV=1` libera de proposito.

## Restaurar na mao

Com o servidor **desligado**:

```bash
npm run restaurar
```

lista os backups do Drive e os locais.

```bash
npm run restaurar -- ultimo
```

restaura o mais novo (ou `-- sede-backup-2026-09-14T03-14-00Z.bin` pra um
especifico). O que estava na pasta vai antes pra
`DATA_DIR/antes-da-restauracao-<data>/`.

## Configurar (uma vez)

1. **No Drive:** criar um drive compartilhado **so de backup** (ex.: "Backup da
   Sede") e adicionar a **mesma conta de servico da biblioteca** (o endereco
   `...@....iam.gserviceaccount.com` que esta no `GOOGLE_CONTA_SERVICO` do
   `.env`) como **Administrador de conteudo** - precisa poder mandar backup
   velho pra lixeira.

   > O endereco de verdade nao entra neste documento: este repositorio e o
   > espelho PUBLICO de deploy. Endereco de conta de servico nao e senha, mas e
   > o alvo que alguem usaria pra procurar uma - junto com o nome do projeto no
   > Google Cloud, que ele entrega de brinde. Ele esta no handoff interno
   > (`docs/CONTINUAR-BIBLIOTECA.md`), que fica so no repositorio da ADM.
   So a diretoria como membro humano.
   - Separado da biblioteca de proposito: na biblioteca a conta e so Leitor. Se
     a chave vazar, ninguem apaga livro.
2. **Variaveis** (no `.env` local e no painel da hospedagem):
   - `BACKUP_DRIVE_PASTA` - id do drive de backup (o pedaco depois de `folders/`)
   - `BACKUP_CHAVE` - a senha do backup (32+ caracteres aleatorios)
   - `GOOGLE_CONTA_SERVICO` - a mesma da biblioteca
3. Subir. O log diz `[backup] local + Drive criptografado ligados.`

## Railway

O Railway tem backup do volume por conta propria. Os dois convivem: o do
Railway salva o disco inteiro; este salva os dados da sede fora da hospedagem,
cifrados, e restaura sozinho - vale mesmo se um dia a sede mudar de lugar.

## Verificado de verdade (14/09/2026)

Contra o Google Drive real, com dados FALSOS numa pasta temporaria:

1. o backup subiu cifrado (331 bytes) e apareceu na listagem do drive
2. baixado de volta, a mensagem do chat nao aparece nos bytes
3. pasta de dados apagada -> `restaurarSeVazio` trouxe tudo identico
4. a mesma conta de servico, com escopo de escrita, tentou criar arquivo na
   Biblioteca da Sede: **403** - la ela continua so Leitor
5. o backup de teste foi pra lixeira; a listagem voltou a zero

## Cuidado: `npm run publicar` tambem faz backup

O `publicar` (tunel a partir do PC) roda com `NODE_ENV=production`, entao ele
tambem manda backup pro Drive - com os dados do PC. Se a sede de verdade estiver
no Render/Railway, **nao use o `publicar` com a mesma `.env`**: o backup do PC
viraria o "mais recente", e o proximo arranque vazio da hospedagem restauraria os
dados do PC. Pra um tunel de demonstracao, tire `BACKUP_DRIVE_PASTA` da `.env`.
