# Reuniao por link: visitante so na chamada, como no Meet

Decidido com o Caio em 20/09/2026: **quem e de fora nao entra na sede - entra na
reuniao, pelo link dela, e so nela.** Substitui o "link de visitante" antigo
(`docs/plano-convidado.md`, que dava acesso a sede inteira).

## Por que trocou

O modelo antigo criava uma **conta de visitante** e deixava a pessoa andar pela
sede. Testado na pratica (comparativo com o Gather, parte 1), o visitante:

- lia o historico dos **tres canais** do chat, inclusive "contrato do cliente Y
  atrasou, valor R$ 12.000", e escrevia neles;
- entrava na chamada de uma reuniao **confidencial** so sabendo o numero dela
  (`reuniao:4`).

O que dava errado nao era uma checagem esquecida - era o desenho. Uma conta dentro
da sede so fica segura se **cada** rota, **cada** evento do socket e **cada**
`io.emit` lembrar de perguntar "e visitante?", e o servidor tem dezenas. Quem
visita uma sede so precisa de uma coisa: **a reuniao a que foi convidado**.

## Como funciona

```
membro marca a reuniao na agenda --> "Copiar link" --> manda pro cliente (WhatsApp, e-mail)
                                                              |
cliente abre  https://sede/r/<token>  <-----------------------+
   |  ve o titulo e o horario; diz o nome; liga (ou nao) camera e microfone
   |  "Pedir para entrar"
   v
SALA DE ESPERA -- um membro que ESTA NA CHAMADA da reuniao clica "Admitir" --> chamada
   (sem ninguem da sede na chamada, o pedido espera; quem marcou a reuniao e avisado)
```

**O visitante nao tem conta, nao tem cookie e nao ve o mapa nem o chat.** Ele
conecta num **canal separado do socket.io** (`/reuniao`), so com o token. Tudo o
que a sede transmite (posicoes, chat, agenda, mapa, presenca) sai por `io.emit`
no canal principal e **nunca chega la** - nao e "barrado", e que nem passa por
ele. Como ele nao tem cookie de sessao, nenhuma rota nem evento da sede o
reconhece. A lista do que ele pode fazer e a de `server/visitantes.js`, e e curta:

| Evento | O que faz |
|---|---|
| `pedir-entrada` | diz o nome e pede pra entrar |
| `cancelar` | desiste do pedido |
| `rtc-signal` | sinalizacao da chamada, **so** com quem esta na mesma reuniao |
| `tela` | avisa que comecou/parou de dividir a tela |
| `sair` | sai da reuniao |

A chamada em si e a **mesma da sede**: o `calls.js` (WebRTC em malha) e o
`callgrid.js` (a grade) rodam tambem na pagina do visitante, com um `Network` e um
`Game` fininhos (`public/js/paginas/reuniao.js`). Nao ha um segundo motor de
video pra manter.

## O link

- `/r/<token>`, e o token e **assinado** (HMAC-SHA256 do segredo da sede, 128 bits,
  com prefixo de contexto - uma assinatura do cookie de sessao nao serve aqui).
  Nao ha lista de links no servidor: o token carrega **o id da reuniao, o
  `criadaEm` dela e a versao do link**.
  - `criadaEm`: no Render gratis o disco e apagado e os ids voltam a 1; sem isso, o
    link de uma reuniao antiga abriria a **nova** que herdou o numero.
  - versao: e o botao **Novo link**.
- O link e **calculado**, nunca guardado: o `reunioes.json` so tem `linkVersao`.
- **Qualquer membro copia** o link (botao "Copiar link" na agenda). **So quem
  marcou a reuniao, ou a diretoria, troca** ("Novo link"): o link velho para de
  abrir, quem ainda esperava com ele e barrado, e quem ja foi admitido continua
  (foi decisao de um membro; para tirar, "Remover").
- **Quando vale:** abre **meia hora antes** do horario e fecha **duas horas depois
  do fim marcado** (`LINK_ABRE_ANTES_MS` / `LINK_FECHA_DEPOIS_MS` em
  `server/reunioes.js`). Fora disso o link mostra o horario, nao "invalido". Ao
  fechar a janela, quem estava dentro e encerrado.
- Desmarcar a reuniao mata o link e tira quem estava nela.
- A pagina `/r/<token>` sai **sem cache**, sem `Referer` e com `noindex`: o
  endereco e uma credencial.

## Sala de espera (o "pedir para entrar" do Meet)

Um link solto num grupo de WhatsApp nao pode ser porta aberta. Por isso:

1. o visitante chega e **pede**; nao entra sozinho;
2. o pedido aparece pra **quem esta na chamada da reuniao** (painel embaixo da barra
   "no ar": **Admitir** / **Recusar**) e, mesmo fora dela, pra **quem marcou** a
   reuniao ("Fulano esta esperando - Entrar na reuniao");
3. so membro **que esta na chamada dessa reuniao** decide (a Bia, na chamada de
   outra reuniao, nao pode; a diretoria fora da chamada tambem nao);
4. dentro, qualquer membro da chamada pode **Remover**;
5. quem foi recusado/removido espera 30 s pra pedir de novo (do mesmo IP);
6. quando o **ultimo membro sai**, os visitantes nao ficam la sozinhos (viraria
   sala de reuniao gratis de gente de fora): depois de um minuto voltam pra espera
   e **entram sozinhos quando um membro volta** - quem ja foi admitido nao pede de
   novo;
7. **passe**: cada admissao entrega um passe (10 min, vive so na aba - `sessionStorage`).
   Cair a rede ou apertar F5 nao obriga a pedir de novo. Passe vale so pra mesma
   reuniao e e trocado a cada admissao. Os passes ficam **na memoria do servidor**: se o
   servidor reiniciar (deploy, o Render dormindo) o visitante pede de novo - visto de
   verdade. E o preco de nao guardar nada em disco; um passe assinado (como o token) nao
   teria isso, mas poderia ser reusado ate vencer.

## O que o servidor confere

Tudo em `server/visitantes.js`; cada linha abaixo tem teste (e uma prova de
mutacao - ver "Testes").

- token de outra assinatura, adulterado, de reuniao que nao existe, de `criadaEm`
  ou versao diferentes: **recusado** no handshake;
- mais de 20 links errados por IP em 15 min: barrado ate com o link certo;
- **nome**: tira caracteres de controle e de inversao de texto (U+202E faria
  "Diana" ler de outro jeito), junta espacos, corta em 18 (o mesmo do membro);
  na tela do membro e da grade aparece **"(visitante)"** depois do nome, entao
  ninguem se passa por membro so digitando o nome dele;
- `rtc-signal`: so entre gente da **mesma reuniao** (visitante->membro,
  membro->visitante, visitante->visitante); sinal de mais de 64 KB e descartado;
  mais de 400 sinais em 10 s e cortado;
- o que cada participante ve dos outros: **so** `id`, `nome`, cor do quadro e se
  divide a tela. Nada de e-mail, uid, se e da diretoria;
- no maximo **10 pedidos parados** e **10 visitantes dentro** por reuniao (a
  chamada e malha P2P e pesa) e 12 conexoes por IP;
- os servidores ICE (STUN e o TURN da Cloudflare, quando ligado) vao **junto com a
  admissao**: o visitante nao tem cookie e nao pode buscar em `/api/ice`.

## O que mudou na sede por causa disto

- **Saiu**: conta de visitante (`criarConvidado`), `/api/convite*`, o botao
  "Convidar visitante" e o modal, o modo `?convite=` da tela de login,
  `server/convites.js`, `public/js/convite.js`, a flag `convidado` do `player` e
  todas as checagens `if (convidado)` (que so existiam pra fechar, uma a uma, o que
  este desenho fecha por construcao), `exigirMembro` (virou `exigirLogin`), o
  cadeado da estante e o `podePegar`/`podeLer`.
- **Migracao**: no arranque o servidor apaga as contas `convidado: true` que ficaram
  no `usuarios.json`. Links `?convite=` antigos deixam de abrir (a tela de login
  aparece normal).
- **Entrou**: `server/link-reuniao.js`, `server/visitantes.js`,
  `public/reuniao.html` + `public/css/reuniao.css` + `public/js/paginas/reuniao.js`,
  `public/js/visitantes.js` (o painel do membro), "Copiar link" / "Novo link" na
  agenda.
- `calls.js`: `init` ficou **idempotente**. O `init` do jogo chega de novo a cada
  reconexao e, no codigo antigo, cada volta empilhava um ouvinte de sinalizacao e um clique
  em cada botao (conferido rodando o `calls.js` do commit anterior: 3 chamadas de `init`
  deixavam 3 ouvintes e 3 cliques). Depois de UMA reconexao o clique no microfone virava
  "desliga e liga" - nenhum efeito - e cada sinal da chamada era tratado em dobro. Novos:
  `definirVisitantes`, `jogadorDe` e `fecharConexoes`; o ICE vem de `Network.pedirIce`
  quando a pagina nao tem cookie.
- `chamada.js`: a barra "voce esta no ar" **zera na reconexao** (o servidor nao guarda a
  chamada de quem desconecta). Visto de verdade: depois de reiniciar o servidor a barra
  ficava no ar dizendo "voce e mais 1" de uma chamada que ja nao existia.

## Testes

- `testes/reuniao-link.js` (servidor de verdade, 117 checagens): token, janela de
  horario, sala de espera, admissao, isolamento, passe (inclusive vencido), recusa e
  remocao, novo link, desmarcar, limites (pedidos parados, gente dentro, links errados). O
  ponto central e o registro de **tudo** que chega ao visitante, comparado com o que a
  sede fez enquanto ele estava la (chat, DM, mapa, agenda): so eventos do canal dele, e
  nenhum da sede. O servidor de teste sobe com `VISITANTES_SEM_MEMBRO_MS` e
  `VISITANTES_PASSE_MS` curtos (um minuto e dez minutos em producao); fora do teste
  ninguem precisa dessas variaveis.
- `testes/reunioes.js`: as regras do link em si (janela, versao, `criadaEm`).
- `testes/calls-visitantes.js`: o motor de chamada com visitante e com reconexao
  (`init` idempotente, so o visitante da MINHA chamada entra na conta, ICE sem cookie).
- `testes/marca.js`: a pagina do link sai com a marca da sede (nada de "ADM" numa sede de
  cliente).
- **Prova de mutacao** (rodada numa copia, nunca no projeto): estragar cada regra acima,
  uma de cada vez, e conferir que o teste reclama. 34 no servidor da reuniao, 16 no motor
  de chamada. Todas caem, menos duas: o passe de OUTRA reuniao (equivalente: ja e barrado
  pelo `criadaEm`, e o teste nao consegue criar duas reunioes no mesmo milissegundo - a
  checagem do id e cinto e suspensorio) e a guarda do `informar()` pra reuniao que some
  entre duas mensagens (defesa que o teste nao consegue provocar). Achou tres esperas
  fracas na primeira rodada ("a lista ficou sem o visitante" era satisfeita por uma lista
  ANTIGA, de antes de ele entrar) e um caso sem teste (visitante->visitante de outra
  reuniao); todos corrigidos.

## O que nao esta feito

- **Sem chat na reuniao** (nem pro membro, nem pro visitante) - e um item do
  comparativo com o Gather.
- **TURN**: sem ele, visitante em rede de faculdade/empresa/parte do 4G nao fecha
  a chamada. E configuracao: `docs/deploy.md`, secao 4 (a conta da Cloudflare e do
  Caio). Vale ainda mais aqui do que na sede, porque o visitante quase nunca esta na
  rede da ADM.
- Visitante **nao ve o que o membro apresenta na TV do mapa** (nem o contrario): a
  tela dividida aparece na grade da chamada, como na de qualquer reuniao.
- Sem gravacao e sem "silenciar todos".
- A "admissao" e simples: um membro decide. Nao ha "lista de convidados" por
  e-mail nem senha da reuniao.

## Como conferir na mao

1. `npm run dev`, entra na sede, abre a **Agenda** e marca uma reuniao pra daqui a alguns
   minutos (o link abre meia hora antes do horario).
2. Clica em **Entrar na chamada** (o painel de visitantes so aparece pra quem esta nela) e
   depois em **Copiar link**.
3. Abre o link numa janela anonima (ou noutro navegador - o visitante nao precisa de conta nem
   de segunda conta), diz um nome e pede pra entrar. Na sede aparece o pedido: **Admitir**.
4. Sem camera de verdade, da pra testar so com o microfone, ou entrando so pra assistir. Camera e
   microfone exigem HTTPS ou `localhost`: pelo IP da rede local (`http://192.168...`) o navegador
   nao libera - o visitante ainda entra e ve/ouve, mas nao aparece.
