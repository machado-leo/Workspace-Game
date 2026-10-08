# Plano — Chat da ADM Solucoes (baseado nas referencias do Gather)

Documento de planejamento escrito **antes** da implementacao, a pedido do Caio.
Referencias usadas: `referencias/Captura de tela 2026-09-06 111640.png` (chat real
dentro do espaco dele) e `referencias/Captura de tela 2026-09-06 091055.png`
(chat da pagina de marketing, com thread e card de reuniao).

---

## 1. O que existe hoje

`public/js/chat.js` + os handlers de `chat-mensagem` no `server/index.js`:

- **Uma sala unica** ("Chat da sede") pra todo mundo, sem canais e sem conversa privada.
- Painel simples encostado na direita: titulo, lista de mensagens, campo de texto.
- Cada mensagem mostra nome colorido + hora + texto. Sem avatar, sem agrupamento.
- Historico de 200 mensagens em memoria no servidor, mandado inteiro no `init`.
- Badge de nao lidas no icone do chat (contador simples, zera ao abrir).

## 2. O que a referencia mostra

**Coluna da esquerda (~360px)**
- Titulo "Chat" + botao de nova conversa + botao de info.
- Campo "Search or navigate..." com atalho `Ctrl F`.
- Secao **Channels** (colapsavel): `# general`, `# social`. O canal aberto fica com
  fundo cinza claro arredondado.
- Secao **Direct messages** (colapsavel): avatar redondo com bolinha de presenca +
  nome ("caiolucas1551 (you)").

**Area da conversa**
- Cabecalho: `# general` em negrito; a direita, chips claros com contagem de gente
  e um menu `⋮`.
- **Estado vazio**: titulo "Gather round in #general" + linha de descricao do canal.
- **Mensagem**: avatar redondo (inicial sobre cor de fundo), nome em negrito, hora
  ao lado, texto embaixo. Mensagens seguidas da mesma pessoa nao repetem o cabecalho.
- **Reacoes**: ao passar o mouse aparece uma barrinha flutuante no canto da mensagem
  (👍 😂 ❤️ + botao de mais). As reacoes ja usadas aparecem como pilulas com contagem
  embaixo da mensagem (visivel no print de marketing: `4`, `4`).
- **Composer**: caixa arredondada com placeholder "Message general", barra de
  ferramentas (anexo, @, emoji, negrito, italico, riscado, link, listas, codigo) e
  botao de enviar azul.
- Mensagem de sistema quando alguem entra ("caiolucas1551 joined").

## 3. Escopo desta entrega

### Entra
1. **Canais** fixos: `# geral`, `# social`, `# projetos` (definidos no servidor, com
   descricao usada no estado vazio).
2. **Mensagens diretas** entre duas pessoas online.
3. **Lista lateral** com busca, secao de canais e secao de DMs (com bolinha de
   presenca e status).
4. **Mensagens com avatar** (inicial sobre a cor de pele do boneco, igual aos chips
   do painel de salas), nome, hora e **agrupamento** de mensagens seguidas da mesma
   pessoa dentro de 5 minutos.
5. **Reacoes por mensagem**: barrinha no hover (👍 😂 ❤️ 🎉 👏) e pilulas com contagem;
   clicar de novo tira a sua reacao.
6. **Nao lidas por conversa**: bolinha/contador na linha da conversa + total no icone
   do trilho. Zera ao abrir a conversa.
7. **Formatacao basica** de texto: `**negrito**`, `_italico_`, `~~riscado~~`,
   `` `codigo` `` e link automatico — com os botoes correspondentes no composer.
8. **Estado vazio** por canal, com a descricao do canal.
9. **Mensagem de sistema** quando alguem entra/sai da sede (no `# geral`).

### Fica de fora (e por que)
- **Threads/respostas**: exige modelo de conversa aninhada e uma segunda coluna;
  vale como entrega propria depois.
- **Anexos e upload de arquivo**: precisa de armazenamento, que o projeto nao tem
  (tudo em memoria, sem banco).
- **Listas, indentacao e bloco de codigo** no composer: pouco uso interno perto do
  custo de um editor rich text de verdade.
- **Cards de reuniao / resumo com IA**: dependem de integracao com agenda.
- **Busca dentro do historico**: a busca lateral filtra conversas, nao mensagens.

## 4. Modelo de dados (servidor, em memoria)

```js
CANAIS = [
  { id: 'geral',    nome: 'geral',    descricao: 'Avisos e assuntos gerais da ADM Solucoes' },
  { id: 'social',   nome: 'social',   descricao: 'Conversa fiada, memes e combinados' },
  { id: 'projetos', nome: 'projetos', descricao: 'Andamento dos projetos e clientes' },
]

conversas: Map<conversaId, Mensagem[]>   // teto de 200 mensagens por conversa
Mensagem = { id, conversa, autorId, autorNome, autorIsAdmin, texto, ts,
             sistema?: true, reacoes: { emoji: [uid, ...] } }
```

**Duas identidades diferentes** (nao confundir):
- `socket.id` — a **conexao**. Muda a cada recarregar. Serve pra posicao no mapa,
  chamadas WebRTC e mesas.
- `uid` — a **pessoa**. Gerado com `crypto.randomUUID()` na primeira visita e
  guardado no `localStorage` junto com o perfil; vai no `join` e o servidor valida
  (`/^[A-Za-z0-9_-]{6,64}$/`, sem `|` nem `:` porque entra na chave da conversa).
  Navegador sem `localStorage` entra com um uid `anon-...` de sessao.

**Id de conversa**
- Canal: `canal:geral`
- DM: `dm:<uidA>|<uidB>` com os dois uids **ordenados**, pra dar sempre a mesma
  chave dos dois lados — e a mesma antes e depois do F5.

Como a DM e nomeada pelo uid, o historico dela sobrevive a recarregar a pagina e a
pessoa reaparece na lista mesmo offline (o `init` manda `dms`, as conversas que
aquele uid ja tem, com o ultimo nome visto de cada um). O que ainda some e o
**restart do servidor**, porque nada disso vai pra disco.

Uma pessoa pode estar em mais de uma aba com o mesmo uid: a DM e entregue a todas.

## 5. Protocolo (Socket.io)

| Evento | Direcao | Payload | Observacao |
|---|---|---|---|
| `join` | cliente → servidor | ganha `uid` (do `localStorage`) | servidor valida o formato; invalido vira `anon-...` |
| `init` | servidor → cliente | ganha `canais`, `mensagens` do `# geral`, `selfUid` e `dms` | evita mandar todo o historico de tudo |
| `chat-historico` | cliente → servidor | `{ conversa }` | servidor valida se a pessoa pode ler (DM so pros dois) |
| `chat-historico` | servidor → cliente | `{ conversa, mensagens }` | resposta so pra quem pediu |
| `chat-mensagem` | cliente → servidor | `{ conversa, texto }` | valida conversa, tamanho (500) e participacao |
| `chat-mensagem` | servidor → clientes | `Mensagem` | canal: todos; DM: so os dois sockets |
| `chat-reagir` | cliente → servidor | `{ conversa, mensagemId, emoji }` | alterna a reacao de quem enviou |
| `chat-reacao` | servidor → clientes | `{ conversa, mensagemId, reacoes }` | mesma regra de destino do envio |

Validacoes no servidor (mesma linha do que ja existe): conversa tem que existir,
emoji tem que estar na lista permitida, texto e cortado em 500 caracteres, DM so
aceita/entrega para os dois participantes.

## 6. Interface

O Gather usa o chat como uma **secao inteira** (o mapa some). Aqui o mapa e o
coracao do produto, entao a adaptacao e: painel **encostado no trilho da esquerda**,
com as duas colunas da referencia lado a lado, e o escritorio continua visivel a
direita.

```
┌──┬──────────────┬───────────────────────────┐
│  │ Chat         │  # geral            [2]⋮ │
│t │ [busca]      ├───────────────────────────┤
│r │ CANAIS       │  (mensagens, agrupadas,   │
│i │ # geral      │   com avatar/hora e       │
│l │ # social     │   reacoes no hover)       │
│h │ # projetos   │                           │
│o │ DIRETAS      ├───────────────────────────┤
│  │ • Bruna      │  [composer + toolbar]     │
└──┴──────────────┴───────────────────────────┘
      230px                ~430px
```

- Largura total ~680px, altura cheia; some no mobile (vira so a conversa).
- Cores/tipografia: o tema claro que ja esta no `style.css` (branco, borda
  `--borda`, primario `--indigo`).

## 7. Passos de implementacao

1. **Servidor** (`server/index.js`): canais, mapa de conversas, os quatro eventos e
   as validacoes. Mensagem de sistema no join/disconnect.
2. **Rede** (`public/js/network.js`): `sendChatMessage(conversa, texto)`,
   `pedirHistorico(conversa)`, `reagirMensagem(...)` e os listeners novos.
3. **HTML** (`index.html`): estrutura das duas colunas dentro de `#painel-chat`.
4. **CSS** (`css/style.css`): lista de conversas, mensagens agrupadas, pilulas de
   reacao, composer com toolbar.
5. **Cliente** (`public/js/chat.js`): estado (conversa atual, cache por conversa,
   nao lidas), render, agrupamento, reacoes, formatacao, badge.
6. **Integracao** (`game.js`/`pessoas.js`): abrir DM a partir do cartao da pessoa
   ("Mandar mensagem").

## 8. Como validar

- [x] Duas abas: mandar mensagem em `# geral` e ver chegar nas duas.
- [x] Trocar de canal e conferir que o historico certo aparece.
- [x] Abrir DM pelo cartao da pessoa; conferir que **so** os dois recebem (a terceira aba
      nao pode receber).
- [x] Reagir numa mensagem e ver a contagem nas duas abas; clicar de novo e ver sumir.
- [x] Fechar o painel, receber mensagem e conferir o badge de nao lidas.
- [x] Mensagem com `<script>` e com `**negrito**` — a primeira aparece como texto puro,
      a segunda formatada (sem `innerHTML` com dado de usuario).
- [x] Console sem erros.

### Resultado (rodado com 3 abas: Caio, Maria e Joao)

| Item | Como foi testado | Resultado |
|---|---|---|
| Difusao no canal | Maria mandou em `# geral` | apareceu nas 3 abas |
| Historico por canal | mensagem so no `# social`, depois trocar de canal e voltar | `# social` guarda a dela, `# projetos` vazio, `# geral` so as dele |
| DM privada | Caio → Maria, com um espiao de `chat-mensagem` na aba do Joao | Maria recebeu; o espiao do Joao voltou **vazio** |
| Nao lidas | badge no item da conversa e no icone do trilho | `1` na DM da Maria; com o painel **fechado** o Joao tambem viu o badge |
| Reacoes | Caio reage, Maria reage o mesmo emoji, Caio desfaz | `👍 1` → `👍 2` nas duas → `👍 1`; o estado "minha" e por pessoa |
| XSS / formatacao | `<script>alert(1)</script>`, `**negrito**`, `_italico_`, `~~riscado~~`, `` `codigo` `` e link | script sai como texto puro; o resto formata e o link vira `<a>` |
| Console | 3 abas | zero erros |

Bug achado e corrigido no caminho: o `_italico_` nao fechava quando vinha seguido de
virgula/ponto — a regex agora aceita pontuacao logo depois do `_` final.

### Correcao seguinte: DM que sobrevive ao recarregar

A primeira versao nomeava a DM pelo `socket.id` e a conversa sumia no F5. Trocado
pelo `uid` (secao 4). Testado com Caio e Maria em abas separadas:

- Caio manda, Maria responde, Caio da F5 → a conversa continua na lista **com as
  duas mensagens**.
- Maria fecha a aba e Caio da F5 de novo → "Maria" continua na lista, apagada e com
  o pontinho cinza de offline, e o historico abre normal.
- Reacao tambem passou a ser por uid, entao a marca de "reagi nessa" nao se perde.

## Ritmo e tamanho da mensagem (20/09/2026)

Achados no comparativo com o Gather (`docs/comparativo-gather.md`, parte 1), os dois
ja corrigidos:

**Freio de ritmo** (`server/freio.js`, `testes/freio.js` e `testes/chat-ritmo.js`).
Uma conta mandava ~990 mensagens por segundo e o servidor aceitava todas: o canal guarda
200, entao a enchente apagava o historico de todo mundo e ainda entregava cada mensagem
a cada pessoa online. Agora:

- no maximo **5 mensagens em 3 segundos por CONTA** (o uid, nao o socket: abrir outra aba
  nao dobra o limite, e recarregar a pagina nao o zera). DM conta igual ao canal;
- reacao (no chat e no mapa) e clique, mas cada uma vira um `io.emit` pra sede inteira:
  teto de **10 em 3 s**;
- mensagem invalida (vazia, canal que nao existe, texto que nao e texto) **nao gasta a
  cota** de ninguem: o freio vem depois da validacao;
- o servidor **responde** ao cliente (`socket.emit('chat-mensagem', dados, aoResponder)`):
  `{ ok: true }` ou `{ erro: 'ritmo', esperarMs }`. Barrada, a mensagem **volta pra caixa**
  (a menos que a pessoa ja tenha comecado outra) e aparece "Muitas mensagens seguidas.
  Espere N segundos e envie de novo." Cliente que manda sem callback continua funcionando
  e e freado do mesmo jeito;
- sem conexao, a caixa **nao apaga** o texto (antes ele sumia calado).

**Limite de 500 caracteres.** O campo ja cortava no 500 (`maxlength`), mas sem dizer nada -
quem colava um texto grande via a mensagem sair pela metade. Agora aparece o contador
`430/500` nos ultimos 100 caracteres (vermelho no limite) e, ao colar algo que nao cabe,
um aviso com o tamanho do texto. O limite em si nao mudou.

