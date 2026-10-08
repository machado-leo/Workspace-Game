# Handoff - sessao de 06/09/2026

Anotacoes para quem pegar o projeto depois (incluindo o outro Claude que estava
trabalhando nele em paralelo). Resume **o que mudou nesta sessao**, por que, e o
que ficou pendente.

O ponto de partida foi o escritorio virtual ja funcionando (mapa 2D, multiplayer
via Socket.io, chamada por proximidade WebRTC). O objetivo da sessao foi
**aproximar o produto do Gather**, usando prints do Gather 2.0 que o Caio mandou
(a leitura de design esta em [`referencias/README.md`](referencias/README.md)).

---

## 1. Visao de Salas (`public/js/rooms.js` - novo)

Painel (botao 🗺️) que agrupa quem esta em cada ambiente agora, com bolinha de
avatar, cor de status, contador e destaque na sala em que voce esta. Atualiza a
cada 500ms.

E o equivalente ao **"Simplified View"** do Gather.

> **Bug corrigido no caminho:** `game.js` so atualizava `displayX/displayY` dos
> jogadores remotos; `x/y` ficavam congelados na posicao de entrada. Qualquer
> codigo novo que dependa da posicao de **outra** pessoa tem que usar
> `displayX/displayY`.

## 2. Grid de chamada (`public/js/callgrid.js` - novo)

Quando a chamada por proximidade conecta com alguem, aparece um grid de tiles
estilo Meet no topo (video ou avatar colorido com iniciais, nome, contorno teal
no seu tile). **Substitui** as bolhas flutuantes acima dos bonecos - `game.js`
consulta `CallGrid.estaAtivo()` pra parar de desenha-las.

Os controles de mic/camera (`#preview-local-controles`) sao **movidos no DOM**
pra dentro do seu tile enquanto o grid esta aberto, e voltam depois.

## 3. Chat da sede (`public/js/chat.js` - novo)

Painel lateral estilo Slack (botao 💬): um canal unico pra toda a sede, com
historico em memoria no servidor (ultimas 200 mensagens), badge de nao lidas e
nomes coloridos por pessoa.

> Texto de outra pessoa e sempre inserido com `textContent`, nunca `innerHTML`.
> Manter assim.

## 4. Reestruturacao do mapa (`public/js/map.js` + `server/map.js`)

O mapa cresceu de 28x20 para **34x24** tiles e ganhou ambientes novos:

| Ambiente | Piso | Conteudo |
|---|---|---|
| Entrada | tijolinho | balcao, sofa azul, mesa de centro, estantes |
| Sala Principal | tijolinho quente | mesa de reuniao + 12 cadeiras, lousa |
| Salinha | cinza | 2 estacoes de trabalho |
| Area Aberta | tijolinho + ilhas de carpete roxo | 4 baias de 6 mesas, cantinho de conversa |
| Lounge (novo) | tijolinho + carpete listrado | 2 sofas, mesa de centro, estantes |
| Jardim (novo) | grama | arvores, cerca, mesinha |

**Como funciona o chao:** o tipo de piso **nao** vem do grid de tiles - vem do
ambiente (`ROOMS[].piso`), com `ZONAS_PISO` sobrescrevendo em cima pra criar as
ilhas de carpete. Isso deixa mobilia e piso independentes.

## 5. Arte no estilo Gather (`public/js/game.js`)

Renderizador reescrito seguindo os prints:

- Piso de **tijolinho em fiada alternada** (usa a linha global, senao a emenda
  entre tiles aparece).
- **Paredes cinza-azuladas escuras** (antes eram bege claro e as salas nao se
  liam).
- Mesas viraram **bancadas cinza-claras**; cadeiras viraram **poltronas escuras
  vistas de tras**; vasos de planta ficaram **coloridos**.
- Crachas de nome viraram **pilula roxa** com bolinha de status (ou icone de
  fone em chamada); etiquetas de sala viraram **pilula branca**.
- Moveis de varios tiles (mesa de reuniao, sofa) usam `bordasDoMovel()` pra so
  desenhar borda onde o vizinho e de outro tipo - senao viram peças partidas.

## 6. Editor de avatar (`public/js/creator.js` reescrito)

Refeito no formato do Gather: categorias na lateral, grade de opcoes com
miniaturas do **seu proprio boneco**, paleta de cores e preview ao vivo.

**Calca e sapato agora existem** - `legs.png` e `feet.png` estavam sendo
desenhados sem recolorir. Paletas passaram a 12 cores de cabelo e 16 de roupa.

> `Character.resolver()` preenche campos faltando com padroes, entao perfil
> antigo salvo no localStorage nao quebra.
>
> Barba, jaqueta, chapeu e acessorios **nao dao pra fazer** sem novos sprites -
> o pacote LPC baixado nao tem essas camadas.

## 7. Pessoas: cartao, busca e mesa propria (`public/js/pessoas.js` - novo)

- **Clique numa pessoa** -> cartao com nome, status, ambiente, "Acenar" e
  "Ir ate" (o *Walk over* do Gather).
- **Ctrl+K** -> busca por nome, mostrando onde a pessoa esta; Enter caminha ate
  ela.
- **Mesa propria**: clicar numa mesa reivindica ela (plaquinha com seu nome, em
  roxo se for sua). Uma mesa por pessoa; clicar de novo larga; some quando a
  pessoa desconecta. Estado em `mesas` no servidor, evento `mesa-reivindicar` /
  `mesas-atualizadas`.

## 9. Camera e mapa no layout do Gather

A partir de um print do escritorio real do Gather, o mapa foi refeito de novo
(48x32) e a camera mudou:

- **Camera segue a pessoa com zoom fixo** (`ZOOM = 2` em `game.js`), presa nas
  bordas do mapa. Antes o mapa inteiro era espremido pra caber na tela, o que
  deixava tudo minusculo - era isso que mais diferenciava do Gather.
  `coordsDoEvento()` converte clique -> mundo usando a camera.
- **Layout novo:** faixa de 4 salas privativas na frente (Diretoria,
  Financeiro, Projetos, Marketing), cada uma com **janelao** dando pro jardim;
  **patio com lago** de carpas entre elas; corredor com mobilia encostada na
  parede; e atras Lounge, Time e Sala de Reuniao. O predio fica cercado de
  **area verde com arvores grandes**.
- Tipos novos: `JANELA`, `AGUA`, `PEDRA`, `ARBUSTO`, `BANCO`, `CABIDE`,
  `IMPRESSORA`, `CAVALETE`.
- As arvores sao desenhadas **numa passada separada, por ultimo**, porque a copa
  passa do proprio tile e seria cortada pelos tiles desenhados depois.
- `ZONAS_PISO` aceita `contorno`, que desenha a moldura fina de area (usada no
  patio).

> Cuidado ao decorar area externa: na primeira versao as pedras e arbustos em
> volta do lago fecharam o anel e **o jardim inteiro ficou inalcancavel**. Vale
> rodar `Pathfinding.findPath` do spawn ate cada ambiente depois de mexer no
> mapa - foi assim que isso apareceu.

---

## Coisas que e bom saber antes de mexer

1. **O servidor Node nao recarrega sozinho** (nao tem nodemon). Mudou
   `server/*.js`? Reinicia. Mudou so `public/`? Recarregar a pagina basta.
   Isso ja me custou um debug de chat que "nao funcionava".

2. **`map.js` e duplicado de proposito** entre `public/js/` e `server/`. Nao ha
   bundler. Mudou o layout de um, tem que mudar o do outro **igual**, senao a
   colisao do servidor discorda do desenho do cliente.

3. **`sanitizeAppearance` no servidor filtra campos desconhecidos.** Campo novo
   de aparencia que nao for adicionado la e apagado silenciosamente pros outros
   jogadores.

4. **Posicao de jogador remoto = `displayX/displayY`.** Ver item 1 la em cima.

---

## 8. Correcao do bug de WebRTC (`public/js/calls.js`)

Bug antigo (nao veio desta sessao, mas foi corrigido nela): `garantirPeer()` so
adicionava as tracks locais **se `localStream` ja existisse naquele instante**, e
nunca renegociava depois. Entao quem recebia a oferta antes da propria camera
abrir ficava **mudo pro outro lado pelo resto da chamada** - o video so ia numa
direcao.

O que mudou:

- `sincronizarTracks(p)` adiciona qualquer track local que ainda nao esteja
  sendo enviada e diz se mudou algo.
- `ligarCamera()` percorre as conexoes que ja existiam, manda as tracks e
  **renegocia** (`renegociar()` cria uma nova oferta).
- A resposta a uma oferta tambem chama `sincronizarTracks` antes do
  `createAnswer`, cobrindo o caso da camera abrir no meio do aperto de mao.
- Tratamento de **glare** (os dois ofertando junto): quem tem o id maior desfaz
  a propria oferta (`rollback`) e aceita a do outro; o de id menor ignora. E o
  `answer` so e aplicado se o estado for `have-local-offer`.

Reproduzido e verificado com streams falsas (`canvas.captureStream()`): A com
camera ligada e B sem; conectavam e A **nao recebia nada** de B; ao ligar a
camera de B, A passou a receber `audio:live` + `video:live`.

---

## Pendente / ideias

- Status em texto livre ("Foco total", "Almoco ate 13:30") como no Gather.
- Crachas agrupados ("Ben, Sam") quando varias pessoas estao na mesma conversa.
- Salas de reuniao que podem ser **trancadas** (o Gather tem).
- Barba/jaqueta/chapeu no avatar - depende de adicionar sprites LPC novos.
- Nada foi commitado nesta sessao.
