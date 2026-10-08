# Plano: mesa pessoal

O Caio pediu "personalizacao da mesa" seguindo as referencias, "fazer todos"
os itens. Sao duas coisas que so servem juntas:

1. **O catalogo de itens** - hoje sao 10; a referencia tem muito mais.
2. **Quem coloca** - hoje **so a diretoria**, pelo decorador. Enquanto for
   assim, nao e personalizacao da mesa: e decoracao do escritorio.

## 1. O que a referencia mostra

Os prints do decorador do Gather (`referencias/4x-decorator-*.png`) sao
divididos em abas. As que interessam pra cima da mesa:

| Aba | O que tem |
|---|---|
| Eletronicos (`153719`, `40-...`) | monitor + torre, setup retro, monitor com caixas de som, dois monitores, teclado gamer, tablet |
| Comida e bebida (`153801`) | cafeteira, copo de cafe, garrafa, donut, tigela, pote |
| Escritorio (`153746`) | plantinhas de vaso pequeno |
| Parede (`153815`) | porta-retrato, quadrinho |

E o print `13-menu-largar-mesa.png` mostra o outro lado da mecanica: **"Unclaim
my desk" fica no cartao do proprio perfil**, nao no mapa. Ou seja, no Gather a
mesa reivindicada **e da conta e sobrevive a sessao**.

## 2. O que esta quebrado pra isso funcionar

Duas coisas, achadas lendo o codigo:

**A mesa e do socket, nao da conta.** Em `server/index.js` o mapa `mesas`
guarda `chave -> socket.id`, e o `disconnect` apaga a entrada. Ou seja: voce
reivindica a mesa, fecha a aba, e a mesa deixa de ser sua. Personalizar uma
mesa que some quando voce fecha o navegador nao tem graca.

**Nada disso vai pro disco.** `mesas` e um `Map` em memoria. Reiniciou o
servidor, acabou.

## 3. Decisoes

### A mesa passa a ser da conta e vai pro disco

`mesas` guarda `chave -> uid` (o id da conta, o mesmo do cookie assinado) e e
salva em `server/data/mesas.json`, junto com os itens. O `disconnect` **nao**
larga mais a mesa.

Como largar entao: clicando na propria mesa (ja funciona) e pelo cartao do
perfil, como na referencia.

> No plano free do Render `server/data/` some a cada deploy - a mesa e a
> decoracao vao junto com as contas. Esta anotado em `docs/deploy.md`.

### Quem decora a propria mesa e o dono, sem ser diretoria

Evento novo `mesa-item`, separado do `mapa-objeto` do decorador. A checagem que
vale e a do servidor:

- a celula tem que ser de uma mesa **reivindicada por voce**;
- o item tem que estar no catalogo de itens de mesa.

O `mapa-objeto` do decorador continua exigindo `isAdmin` e continua existindo -
sao coisas diferentes: um decora o escritorio, o outro a sua mesa.

### Um item por celula

A camada de objetos ja e `objetos[r][c]` - um item por celula. Como a mesa
agora tem 3 celulas de largura, dao 3 itens por pessoa (6 nas de duas
fileiras). Nao vale inventar sub-grade agora: 3 itens ja da pra ter
personalidade e mantem o desenho legivel no zoom do jogo.

## 4. O catalogo

10 que ja existem, marcados com *. Os novos seguem o mesmo padrao de desenho:
grade fina de 128, apoiando por volta de `y=90` (o `drawObjectTile` levanta
sozinho quando o tampo acaba antes).

| Grupo | Itens |
|---|---|
| Computador | MONITOR*, MONITOR_DUPLO*, MONITOR_ULTRAWIDE, NOTEBOOK*, TORRE_PC, SETUP_GAMER |
| Perifericos | TECLADO*, HEADSET, TABLET, CAIXAS_SOM |
| Cafe e comida | CANECA*, COPO_CAFE, GARRAFA, DONUT, TIGELA |
| Papelada | PAPELADA*, LIVROS*, PORTA_LAPIS, CADERNO, CALENDARIO, POST_ITS |
| Pessoal | PLANTINHA*, LUMINARIA*, TELEFONE*, CACTINHO, PORTA_RETRATO, TROFEU, BONECO |

Total: 28 itens, 18 novos.

## 5. Ordem

O Caio pediu pra inverter: primeiro a posse da mesa, pra ele ja testar
personalizando de verdade, e os itens depois.

1. **Mesa da conta + a mesa inteira** - feito, secao 6.
2. **Painel de personalizar a propria mesa** - feito, secao 7.
3. Catalogo dos 18 itens novos.

## 6. Etapa 1: a mesa e da conta e vem inteira

`server/mesas.js` passa a ser o dono do assunto (o `index.js` so repassa). A
varredura do movel (`celulasDaMesa`) mora no `map.js`, que e o arquivo espelhado
entre cliente e servidor - assim os dois concordam sobre onde a mesa comeca e
termina, e o cliente consegue acender o movel inteiro no hover de uma mesa que
ainda nao e de ninguem.

**A chave da mesa e a celula de cima a esquerda do bloco.** Clicar em qualquer
canto cai na mesma chave; e isso que faz a mesa nao se dividir em pedacos.

O mapa tem **12 mesas**: 4 salas da frente com 2 celulas e 8 baias com 6. Somam
as 56 celulas de `MESA_MONITOR` que existem, ou seja, nenhuma mesa gruda na
vizinha por engano.

### Resultado dos testes (07/09/2026)

Regras, pelo `server/mesas.js` direto (duas pessoas nao dao pra testar numa aba
so - o `SEM_LOGIN` poe todo mundo na mesma conta): **16 de 16 passaram**.

| O que | Resultado |
|---|---|
| Pegar clicando no canto da mesa | ok - guarda a chave `15,18` e as 6 celulas |
| Outra pessoa nao rouba a mesa | ok - recusa e a mesa continua da primeira |
| Trocar de mesa larga a anterior | ok - continua 1 mesa por pessoa |
| Largar pelo perfil | ok - e largar duas vezes nao faz nada |
| Clicar no chao | ok - nao pega nada |
| Disco | ok - `server/data/mesas.json` guarda chave + uid |

No navegador:

| O que | Resultado |
|---|---|
| Contorno | ok - cobre o movel inteiro, nao uma celula |
| Plaquinha do dono | ok - uma so, centrada na frente da mesa |
| Hover numa mesa livre | ok - acende o movel todo e mostra "Mesa livre" |
| **Fechar e voltar** | **ok - a mesa continua sua** (era o furo: o dono era o socket) |
| Botao "Largar minha mesa" | ok - so aparece pra quem tem mesa, e some ao largar |
| Console | limpo |

> `server/data/mesas.json` e mais um arquivo que o plano free do Render apaga a
> cada deploy, junto com as contas. Ver `docs/deploy.md`, secao 3.


## 7. Etapa 2: o dono decora a propria mesa

### Duas camadas, nao uma

O que voce poe na SUA mesa fica em `server/mesas.js`, junto da mesa - **nao**
no `mapa-editado.js`, que e a decoracao da casa. Duas razoes:

- **suas coisas saem com voce.** Largou a mesa, a caneca vai junto. Se fosse na
  camada da casa, o proximo dono herdaria a tralha do anterior;
- **um nao apaga o outro.** O desfazer do decorador mexe so na camada da casa.

No desenho as duas viram uma so: o `prerenderMap` desenha a camada da casa e,
por cima, o que o dono pos.

### Quem pode e decidido pela CELULA, nao pelo cargo

Primeira versao era por cargo ("nao e diretoria -> so a propria mesa"), e ela
tinha um furo: **a diretoria tambem tem mesa**, e do jeito que estava tudo que
um diretor pusesse na propria mesa virava decoracao da casa - ficaria pra tras
quando ele trocasse de lugar.

A regra que ficou vale pros dois lados:

| Onde voce clica | Vai pra | Quem pode |
|---|---|---|
| celula da **sua** mesa | camada da mesa (`mesa-item`) | qualquer um |
| qualquer outra superficie | camada da casa (`mapa-objeto`) | so diretoria |

O painel e o mesmo decorador: quem nao e da diretoria ve so a aba "Em cima da
mesa" e o titulo vira "Minha mesa". A malha verde das superficies passou a
acender **so onde da pra pousar de verdade** - antes acendia o escritorio
inteiro, o que pra um membro comum seria mentira.

### Resultado dos testes (07/09/2026)

`npm run teste`: **30 de 30 passaram**. As novas:

| O que | Resultado |
|---|---|
| Dono poe item na propria mesa | ok - em qualquer celula dela |
| Outra pessoa poe na sua mesa | ok - recusado |
| Voce poe na mesa de outro | ok - recusado |
| Item no chao | ok - recusado |
| **Item acima do `OBJETO_MAX`** | **ok - recusado** (a armadilha dos itens novos) |
| Por o mesmo item de novo | ok - nao mexe em nada |
| Tirar item (`o = 0`) | ok |
| Largar a mesa | ok - leva as coisas junto |
| Trocar de mesa | ok - a antiga volta vazia |

No navegador:

| O que | Resultado |
|---|---|
| Caneca, plantinha e livros na propria mesa | ok - aparecem no movel |
| Pelo painel, clicando no mapa | ok - e caiu na camada da MESA, nao na da casa |
| Admin decorando mesa alheia | ok - caiu na camada da CASA, as duas nao se misturam |
| Largar a mesa pelo perfil | ok - os 3 itens sumiram junto |
| Painel da diretoria | ok - segue com as 8 abas e titulo "Decorador" |
| Console | limpo |


## 8. A mesa vem vazia, e clicar nela ja senta e pega

O Caio pediu pra **tirar os computadores antigos**: o monitor/teclado/mouse eram
desenhados dentro do tile da mesa, iguais pra todo mundo e impossiveis de tirar.
Com eles ali, personalizar a mesa era so acrescentar tralha em cima de uma
tralha que ninguem escolheu.

Agora `MESA_MONITOR` desenha **so a placa**. O tipo continua existindo porque e
ele que marca "isto e um posto de trabalho" (e o que da pra reivindicar,
`MESAS_DE_TRABALHO`) - o que sumiu foi a arte embutida. Quem senta poe o que
quiser pela camada de objetos.

Os nomes do catalogo do decorador foram atras: "Mesa pronta (monitor)" virou
"Posto de trabalho", e "Mesa c/ PC ↑" virou "Posto ↑ (da pra pegar)" - prometer
um PC que nao vem mais seria mentira.

`monitorDeCostas` e `monitorDeLado` ficaram sem uso na mesa. Nao foram apagadas:
sao a arte de monitor de perfil e de costas que o catalogo de itens (secao 4)
vai usar pra quem senta de lado.

**Clicar numa mesa livre faz as duas coisas de uma vez**: a mesa vira sua e o
boneco anda ate a cadeira dela. `lugarDaMesa` procura um assento colado no
movel; sem assento, a celula caminhavel mais perto.

### Resultado dos testes (07/09/2026)

| O que | Resultado |
|---|---|
| Mesas do mapa | ok - todas vazias, so a placa |
| Um clique numa mesa livre | ok - virou "15,18" e o boneco foi sentar em 16,20 |
| Clicar na propria mesa de novo | ok - larga, como antes |
| Clicar na mesa de outro | ok - nao faz nada |
| Console | limpo |

## 9. O menu e o do cartao de perfil, nao um na mesa

Eu tinha feito um dropdown abrindo **na mesa**, com "Personalizar" e "Largar". O
Caio disse que nao era isso e apontou a referencia: `13-menu-largar-mesa.png`.

Nela o menu **nao fica na mesa**: fica no **cartao do proprio perfil**, atras de
um botao "⋮". O cartao tem bolinha com a inicial, nome, "Joined on <data>", um
botao primario "Edit Profile", e e o "⋮" que abre o menuzinho **escuro** com
"Unclaim my desk".

Faz sentido: a mesa e uma coisa da sua conta, nao um movel que voce configura.
O dropdown na mesa foi removido inteiro - nada de codigo desligado no meio do
caminho.

O cartao da conta foi refeito nesse formato:

| Referencia | Aqui |
|---|---|
| bolinha com inicial | ok - usa a cor da camisa do boneco |
| "Joined on 6/09/2026" | "Entrou em 07/09/2026" (`criadoEm` passou a sair no `/api/eu`) |
| "Edit Profile" primario | "Editar perfil" |
| "⋮" -> menu escuro | "⋮" -> menu escuro com "Largar minha mesa" e "Sair da conta" |

### Um bug que so aparecia com os dois juntos

`aoMudarMinhaMesa` guardava **um** ouvinte (`avisarMinhaMesa = fn`). O menu da
conta registrava o dele, o decorador registrava depois e apagava o primeiro -
resultado: "Largar minha mesa" nunca aparecia, mesmo com mesa. Virou lista.

### Resultado dos testes (07/09/2026)

| O que | Resultado |
|---|---|
| Cartao no formato do print | ok - avatar, nome, "Entrou em", botao e "⋮" |
| Data numa linha so | ok (o cartao foi de 200px pra 236px) |
| "⋮" abre o menu escuro | ok |
| "Largar minha mesa" com mesa | ok - aparece |
| Sem mesa | ok - some, sobra "Sair da conta" |
| Clicar na mesa | ok - nao abre menu nenhum, so senta e pega |
| Console | limpo |


## 10. O cartao da mesa (o menu, no formato do print)

Terceira tentativa, e a que ficou. O caminho ate aqui:

1. dropdown "Personalizar / Largar" abrindo **na mesa** -> o Caio disse que nao;
2. mandei o largar pro menu da conta, no trilho -> nao era isso tambem;
3. **o cartao do print `13-menu-largar-mesa.png`, abrindo ao clicar na mesa.**

O que o print mostra e um cartao de perfil: bolinha com a inicial e a bolinha de
status, nome, uma linha de contexto, um botao primario largo e **dois botoes de
icone** - uma plantinha e um "...".

A plantinha e a peca que faltava: no Gather **e ela que decora**. Entao o mapa
saiu direto:

| No print | Aqui |
|---|---|
| bolinha + status | ok - cor da camisa do boneco; o status some se a pessoa esta offline |
| nome | nome do dono |
| "Joined on ..." | "Esta e a sua mesa" / "Esta na sede agora" / "Fora da sede agora" |
| "Edit Profile" | "Editar perfil" |
| 🌱 | **Personalizar a mesa** - abre o decorador ja na aba "Em cima da mesa" |
| "..." | "Largar minha mesa" |

Na mesa de outra pessoa o cartao vira so identificacao: a fileira de botoes some
inteira, porque nao ha nada que voce possa fazer com a mesa dela.

**Clicar na propria mesa nao larga mais.** Com o cartao abrindo no clique, largar
no clique seria uma armadilha - voce clicaria pra ver a mesa e perderia ela.
Largar mudou de lugar: e o "..." do cartao.

### Um bug de sobreposicao

O menuzinho do "..." saia **por cima da fileira de botoes** (`bottom: 8px`
dentro do cartao). Resultado: com ele aberto, clicar na plantinha batia no menu,
nao no botao - e parecia que a plantinha nao funcionava. Agora ele sai encostado
**fora** do cartao: pra baixo no cartao da mesa, pra cima no da conta (que vive
colado no rodape).

### Resultado dos testes (07/09/2026)

| O que | Resultado |
|---|---|
| Clicar em mesa livre | ok - pega a mesa, anda ate a cadeira e abre o cartao |
| Clicar na propria mesa | ok - abre o cartao, sem largar |
| Cartao no formato do print | ok - avatar, status, nome, primario e os dois icones |
| Plantinha | ok - abre o decorador na aba "Em cima da mesa" (11 itens) |
| "..." | ok - "Largar minha mesa", agora sem cobrir os botoes |
| Mesa de outra pessoa | ok - so identificacao, sem botao nenhum |
| Console | limpo |


## 11. Zoom na mesa, coisas onde voce quiser, cadeira encostada

Tres pedidos de uma vez. A ordem importou: **colocacao livre antes dos itens
novos**, senao os itens teriam que ser migrados de formato depois.

### Zoom

A camera nao pula mais pro valor novo: persegue um alvo, um pouco por quadro
(`perseguir()`, aproximacao exponencial - o movimento e o mesmo em 60Hz e em
144Hz). Abrir o cartao da mesa aproxima pra `ZOOM_MESA` e centraliza no movel;
fechar volta pro zoom que a pessoa tinha escolhido no +/-.

Abrir o decorador pela plantinha **mantem** o zoom: seria absurdo afastar bem na
hora de escolher onde pousar as coisas. Quem solta o foco ali e o decorador, ao
fechar.

### Colocacao livre

Era **uma coisa por celula** (`objetos[r][c]`). Na referencia a pessoa poe onde
quiser em cima da mesa, entao a posicao precisava ser mais fina que o tile.

Os itens de mesa viraram uma lista `[{ o, x, y }]` por mesa, com `x`/`y` em
tiles **com fracao** (15.3, 18.4). O servidor valida que o ponto cai numa mesa
que e sua; o cliente desenha ordenando por `y`, pra quem esta na frente tapar
quem esta atras.

- **Borracha:** tira a coisa mais perto do clique (raio de ~0.55 tile). Sem
  isso, algo posto meio torto nunca mais sairia dali.
- **Teto de 14 por mesa**, pra nao virar bagunca.
- **Arrastar nao pinta** na propria mesa - despejaria uma trilha de canecas. Ali
  so vale o clique; na mobilia da casa o arrasto continua valendo.
- O arquivo antigo (`{"c,r": objeto}`) e **convertido na leitura**, no centro da
  celula: quem ja tinha decorado nao perde nada.

### Cadeira

O recuo era de 5px e sobrava um vao - a cadeira parecia estacionada longe da
mesa. Passou pra ~3/8 de tile, encostando na faixa da frente, que e o que o
`referencias/README.md` ja descrevia ("ela e mais alta que 1 tile e encosta na
mesa").

### Resultado dos testes (07/09/2026)

`npm run teste`: **33 de 33**. As novas cobrem duas canecas na mesma celula em
pontos diferentes, a posicao guardada com fracao, a borracha pegando a mais
proxima (e nao fazendo nada quando esta longe) e o teto por mesa.

No navegador:

| O que | Resultado |
|---|---|
| Abrir o cartao | ok - a camera desliza e para centrada na mesa |
| Fechar | ok - volta pro zoom anterior |
| Plantinha | ok - continua perto enquanto decora |
| Duas canecas na mesma celula | ok - `16.07,18.90` e `16.66,19.44`, onde eu cliquei |
| Malha verde | ok - so acende a sua mesa |
| Borracha | ok - tirou a mais proxima, deixou a outra |
| Cadeira | ok - encostada na mesa |
| Console | limpo |


## 12. Clicar na coisa: mover ou excluir

A borracha ("Tirar o que esta em cima") era um chute: ela apagava **a coisa mais
perto do clique**. Com duas canecas encostadas voce nunca sabia qual ia sair - e
pra mudar algo de lugar so restava apagar e por de novo.

**Cada coisa em cima da mesa passou a ter id proprio.** Clicar nela seleciona
(anel tracejado) e abre uma barrinha escura com **Mover** e **Excluir**, no
estilo da barra de objeto selecionado do Gather
(`referencias/9x-ui-gather-111539.png`).

- **Mover** solta a coisa no cursor; o clique seguinte a deixa ali. So um evento
  vai pro servidor, no fim - nao um por pixel percorrido.
- **Excluir** tira aquela, apontada pelo id. `Delete`/`Backspace` fazem o mesmo,
  e `Esc` desfaz a selecao.

Duas coisas que o id resolveu de graca no servidor: **mover so vale dentro da
mesma mesa** (arrastar pra mesa do vizinho seria decorar a mesa dele) e **tirar
so vale nas suas** - as duas testadas.

O mapa e pre-renderizado, entao a coisa arrastada sai do pre-render e passa a ser
desenhada ao vivo enquanto segue o cursor; sem isso ela ficaria estampada no
lugar antigo ate soltar.

A borracha continua existindo **so pra diretoria**, e so pra decoracao da casa -
ela nao aparece mais pra quem esta decorando a propria mesa.

### Resultado dos testes (07/09/2026)

`npm run teste`: **41 de 41**. As novas cobrem id proprio, mover a coisa certa
(a outra fica onde estava), mover pra fora da mesa (recusado), mover/tirar coisa
de outra pessoa (recusado) e id inexistente.

No navegador:

| O que | Resultado |
|---|---|
| Clicar na coisa | ok - seleciona e abre a barrinha em cima dela |
| Mover | ok - de `16.07,18.90` pra `17.47,19.11`, onde eu cliquei |
| Excluir | ok - sai so ela, a barrinha fecha |
| Item antigo (sem id) | ok - ganhou id na leitura, nada se perdeu |
| Console | limpo |


## 13. O catalogo: 37 coisas

Eram 10. Foram pra **37**, seguindo as abas do decorador do Gather nos prints:
eletronicos (`4x-decorator-153719`, `153526`), comida e bebida (`153801`),
decoracao de sala (`153731`) e as plantas de `153746`.

| Aba | Itens |
|---|---|
| Computador | 14 |
| Cafe e comida | 7 |
| Papelada | 7 |
| Coisas suas | 9 |

As quatro sao marcadas `deMesa: true` - e o que faz quem tem mesa ver todas sem
ser da diretoria. Antes era so a aba "Em cima da mesa"; com 37 itens numa lista
so nao daria pra achar nada.

`monitorDeCostas` e `monitorDeLado`, que tinham ficado sem uso quando a mesa
esvaziou, viraram itens - sao exatamente o que serve pra quem senta de lado.

### O teste que existe por causa da armadilha

`testes/itens.js` checa **os cinco lugares** onde um item novo precisa entrar.
Ele existe porque esquecer qualquer um falha em silencio, e o pior deles - o
`OBJETO_MAX` - faz o servidor descartar o id sem escrever nada em lugar nenhum.

Hoje: **41 + 6 = 47 checagens**, todas passando.

### Documentacao

O estado final saiu do plano e virou `docs/mesa-pessoal.md`: quem pode o que, o
que cada clique faz, posicao livre, os cinco lugares, como desenhar e a lista dos
37. Este plano continua guardando a **historia** das decisoes.


## 14. Cara de 3D, sem redesenhar 37 itens

O pedido foi "cada item 2D com aspecto 3D". Retocar 37 desenhos na mao seria
lento e ficaria desigual - o decimo item nao teria a mesma luz do primeiro.

Em vez disso, `comVolume()` desenha cada item **uma vez num buffer** e usa a
silhueta dele pra montar sombra, espessura e luz. Vale pra todos de uma vez, e
pra todo item que vier depois: quem desenhar o 38o nao precisa pensar em relevo.

Duas coisas so apareceram testando:

- a primeira versao usava a **silhueta inteira** como sombra, e o monitor virou
  uma barra cinza do tamanho da tela. Sombra vem do que **toca** a superficie,
  entao passou a sair so da faixa de baixo;
- a luz usava `lighter` com a silhueta preta - que nao clareia nada. Precisava
  de uma silhueta branca.

Custo: 0,22ms por item; 1,3ms dos ~159ms de um redesenho de mapa. O peso esta
nos 1536 tiles, nao aqui.


## 15. Tres reclamacoes, quatro causas

O Caio testou e trouxe tres coisas. Investigando, os "cantos" e o "nao consigo
excluir" tinham **duas causas cada**.

### "Nao consigo colocar em todos os cantos"

Varri a regra do servidor ponto a ponto (probe de 0.2 tile) e ela **ja aceitava a
mesa inteira**. O problema era outro, e duplo:

1. **A coisa era pendurada pela BASE.** A arte sobe ~0.7 tile a partir da ancora,
   entao clicar perto da borda de tras desenhava a coisa **fora** da mesa. Passou
   a ser pendurada pelo meio visual (`ANCORA = 60`).
2. **A diretoria pintava a camada da CASA em cima de mesa.** Achei 7 objetos
   assim no `mapa.json` - encaixados no centro da celula, sem poder mover nem
   excluir, e visualmente identicos aos da mesa. Era essa a sensacao de "nao
   consigo colocar onde eu quero". Mesa agora so aceita `mesa-item`, do dono.

De quebra, `fimDoTampo` **discordava do desenho**: dizia 24 unidades de tampo na
fileira da frente enquanto `tampaDeMesa` desenhava 64. A malha verde mostrava uma
tirinha e a mesa parecia ter muito menos espaco do que tem. Virou `tampoAte` no
`map.js`, espelhado com o servidor.

### "Nao consigo excluir os itens"

1. **O toque era um circulo em volta da ancora.** Como a arte sobe a partir dela,
   clicar na tela do monitor caia fora. Agora o teste e no pixel do desenho.
2. **A selecao so era testada se a celula clicada fosse mesa.** O alto do monitor
   cai na celula de cima, que nao e mesa - entao clicar ali nao selecionava nada.
   A selecao passou pra antes desse gate.

### "Os monitores sao pequenos"

Eram menores que os livros. A referencia diz "~1 tile cada, subindo meio tile
acima da mesa". Todos os sete cresceram: o MONITOR foi de 108x80 pra 128x96.

### Resultado dos testes (07/09/2026)

| O que | Resultado |
|---|---|
| Area que aceita item | ok - o tampo inteiro, ponta a ponta (probe de 0.2 tile) |
| Fora do tampo | ok - recusado, e a malha nao acende |
| Quatro cantos do tampo | ok - as quatro coisas na mesa, nenhuma no chao |
| Clicar no alto da tela do monitor | ok - seleciona (antes nao) |
| Clicar no vazio abaixo dele | ok - nao seleciona mais (antes selecionava) |
| Excluir | ok - some, sobram as outras, barrinha fecha |
| Monitores | ok - maiores que os livros agora |
| `npm run teste` | 47 de 47 |
