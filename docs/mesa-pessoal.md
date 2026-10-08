# A mesa pessoal: como funciona e como mexer

Este e o documento de referencia da mesa. O `plano-mesa-pessoal.md` conta a
**historia** (o que foi decidido e por que, na ordem em que aconteceu); aqui esta
o **estado final**, pra quem so precisa mexer.

---

## 1. As duas coisas que voce pode ter numa mesa

**Reivindicar** e **decorar** sao independentes:

| | Quem | Onde fica guardado |
|---|---|---|
| A mesa e sua | qualquer pessoa logada | `server/data/mesas.json` |
| As coisas em cima dela | so o dono da mesa | idem, junto da mesa |
| A mobilia do escritorio | so a diretoria | `server/data/mapa.json` |

As duas ultimas linhas sao **camadas diferentes de proposito**. O que voce poe na
sua mesa some junto quando voce larga a mesa; se fosse na camada da casa, o
proximo dono herdaria a tralha do anterior, e o desfazer do decorador apagaria
suas coisas.

## 2. O que acontece quando voce clica

```
clique numa mesa
├─ em cima de uma coisa da SUA mesa  → seleciona: barrinha "Mover" / "Excluir"
├─ numa mesa livre                    → ela vira sua + o boneco vai sentar + cartao
├─ na sua mesa (fora de uma coisa)    → anda ate ela + cartao
└─ na mesa de outra pessoa            → cartao so com o nome, sem botao
```

Clicar na propria mesa **nao larga** mais. Com o cartao abrindo no clique, isso
seria uma armadilha: voce clicaria pra ver a mesa e perderia ela. Largar mudou
pro "..." do cartao.

A camera **aproxima e centraliza** na mesa quando o cartao abre, e volta ao
fechar. Abrir o decorador pela plantinha mantem a aproximacao - quem solta o foco
ali e o decorador, ao fechar.

## 3. O cartao da mesa

Formato do print `referencias/13-menu-largar-mesa.png`:

| Botao | O que faz |
|---|---|
| **Editar perfil** | abre o criador de avatar |
| 🌱 | abre o decorador na aba de coisas de mesa |
| **⋮** | "Largar minha mesa" |

Na mesa de outra pessoa a fileira de botoes some inteira - nao ha nada que voce
possa fazer com a mesa dela.

## 4. Posicao livre

As coisas **nao ficam presas na celula**. Cada uma guarda `{ id, o, x, y }`, com
`x`/`y` em tiles **com fracao** (`16.07, 18.90`). Voce poe onde clicar, e podem
conviver varias na mesma celula.

**Onde da pra pousar:** o TAMPO da mesa, de ponta a ponta. A metade de baixo da
fileira da frente e a face vertical do movel - pousar ali faria a coisa flutuar
na frente da gaveteira. `map.noTampo(x, y)` e a regra, e vale nos dois lados: a
malha verde acende exatamente o que o servidor aceita.

**A coisa e pendurada pelo MEIO da arte**, nao pela base (`ANCORA = 60`, nao
`APOIO = 90`). Pendurando pela base, a arte subia ~0.7 tile a partir do clique e
os cantos de tras da mesa ficavam inutilizaveis - voce clicava na mesa e a coisa
aparecia acima dela.

**Mesa nao aceita decoracao da casa.** Em cima de mesa so entra pelo `mesa-item`,
do dono. A diretoria pintando ali criava uma armadilha: parecia igual, mas
encaixava no centro da celula e nao dava pra mover nem excluir clicando.

- Sao desenhadas ordenadas por `y`, pra quem esta na frente tapar quem esta atras.
- **Selecionar e no pixel, nao num raio.** `acertaNoDesenho` redesenha o item num
  buffer e olha se tem tinta no ponto. Um circulo em volta da ancora errava dos
  dois lados: perdia o alto da tela de um monitor (onde a pessoa clica) e pegava
  o vazio embaixo dele.
- A selecao e testada **antes** de olhar que tile foi clicado. Um monitor sobe
  quase um tile acima da ancora, entao o alto dele cai na celula de cima, que nao
  e mesa - amarrado ao tile, clicar ali nao selecionava nada.
- **Teto de 14 por mesa** (`ITENS_MAX` em `server/mesas.js`).
- **Arrastar nao pinta** na propria mesa - despejaria uma trilha de canecas. Ali
  so vale o clique; na mobilia da casa o arrasto continua valendo.
- Enquanto voce move uma coisa, ela sai do pre-render e e desenhada ao vivo. Sem
  isso ficaria estampada no lugar antigo ate soltar.

## 5. Adicionar um item novo: os CINCO lugares

**Esta e a parte que da errado.** Esquecer qualquer um falha **em silencio**.

| # | Onde | Se esquecer |
|---|---|---|
| 1 | `OBJETOS` em `public/js/map.js` | o cliente nao conhece o id |
| 2 | `OBJETOS` em `server/map.js` | os dois lados discordam do que cada numero significa |
| 3 | **`OBJETO_MAX` em `server/map.js`** | **o servidor descarta calado** - nem erro no console |
| 4 | um ramo em `drawObjectTile` (`public/js/game.js`) | fica colocado e **invisivel** |
| 5 | uma entrada no catalogo (`public/js/decorador.js`) | ninguem consegue escolher |

`npm run teste` checa os cinco (`testes/itens.js`). Nao confie na memoria: rode.

### Como desenhar

A arte mora numa caixa de **128 unidades** por tile, apoiando por volta de
`y = 90` (a constante `APOIO`). Ajudantes prontos: `q` (retangulo), `qArred`
(canto arredondado), `qContorno` (so a casca), `blob` (elipse em degraus),
`caixa`, `monitor`, `monitorDeLado`, `monitorDeCostas`, `teclado`, `mouse`,
`caneca`.

Regras que o resto da arte segue:

- sombra no chao com `rgba(45,50,64,0.18)` a `0.20`, logo abaixo da coisa;
- traco escuro por fora (`qContorno`) antes do preenchimento;
- uma faixa clara em cima e uma escura embaixo dao volume;
- coisas altas (monitor) podem passar do topo da caixa - a camada de cima e
  desenhada depois de tudo.

**A malha e de 4 unidades** (`PX`), que sao os 32 pixels por tile da
referencia. Desenhe em multiplos de 4: passo menor que isso nao vira detalhe,
vira borrao - o `q` encaixa tudo na malha, entao quatro passos de 1 caem no
mesmo pixel e a arte se empilha sobre si mesma. Laco que anda de 1 em 1 e o
sintoma; foi o que estragou a trama da cadeira, o cone do copo de cafe e a
grade do calendario.

**Como conferir sem entrar no mapa:** `Game.desenharApoiado(ctx, x, y, id, TILE,
tiles, true)` desenha qualquer item num canvas solto. Da pra montar uma folha de
contato dos 37 de uma vez.

## 5b. O volume (o "3D")

As coisas nao sao retocadas uma a uma pra parecerem 3D. Cada item e desenhado
**uma vez num buffer** e a silhueta dele vira tres camadas, em `comVolume()`:

1. **sombra no chao** - a silhueta achatada, deitada na linha da base;
2. **espessura** - tres copias escuras descendo pra direita, atras da arte, que
   aparecem como a lateral da coisa;
3. **luz** - uma copia clara subindo pra esquerda.

A luz vem de cima e da esquerda, como no resto do escritorio.

Dois detalhes que so aparecem quando se mexe nisso:

- **A sombra sai so da faixa de baixo da silhueta.** Usando a silhueta inteira, o
  monitor virava uma barra cinza do tamanho da tela: o que faz sombra e o que
  toca a superficie, nao o que esta no ar.
- **`source-in` guarda a transparencia.** E o que faz a sombrinha fraca que
  alguns itens ja desenhavam continuar fraca na silhueta, em vez de virar um
  retangulo solido.

Custo medido: **0,22ms por item**, 1,3ms dos ~159ms de um redesenho do mapa
(0,8%). O que pesa no redesenho sao os 1536 tiles, e isso e anterior a este
trabalho. O redesenho so acontece quando a decoracao muda, nao a cada quadro.

Desenhar um item novo **nao exige pensar em sombra nem em relevo** - o
`comVolume` cuida disso. Desenhe a coisa chapada na caixa de 128.

## 6. O catalogo hoje (37)

| Aba | Itens |
|---|---|
| **Computador** | monitor, dois monitores, ultrawide, PC com gabinete, setup gamer, notebook, tablet, monitor de perfil, monitor de costas, teclado e mouse, teclado colorido, headset, caixas de som, webcam |
| **Cafe e comida** | caneca, copo de cafe, cafeteira, garrafa, donut, tigela, pote de biscoito |
| **Papelada** | papelada, livros, caderno, porta-lapis, calendario, post-its, telefone |
| **Coisas suas** | plantinha, cactinho, flores, porta-retrato, trofeu, bonequinho, bola, vela, luminaria |

As quatro abas sao marcadas `deMesa: true`: e o que faz **quem tem mesa ver
todas elas sem ser da diretoria**. A borracha ("Tirar da decoracao da casa") tem
`soAdmin: true` e nao aparece pra elas - pra tirar da sua mesa voce clica na
coisa e usa "Excluir", que acerta qual e em vez de chutar a mais proxima.

## 7. Arquivos

| Arquivo | Papel |
|---|---|
| `server/mesas.js` | dono do assunto: quem tem qual mesa, o que tem em cima, disco |
| `server/map.js` / `public/js/map.js` | enum dos objetos, `OBJETO_MAX`, `celulasDaMesa` |
| `public/js/cartaomesa.js` | o cartao que abre ao clicar |
| `public/js/itemmesa.js` | selecao de uma coisa: mover / excluir |
| `public/js/decorador.js` | catalogo e a regra de quem pode onde |
| `public/js/game.js` | desenho dos itens, camera, clique no mapa |
| `testes/mesas.js` | 41 regras de posse e itens |
| `testes/itens.js` | os cinco lugares do item novo |

## 8. Eventos de socket

| Evento | Quem pode |
|---|---|
| `mesa-reivindicar` | qualquer um; pega/larga o movel inteiro |
| `mesa-largar` | qualquer um, na propria |
| `mesa-item` | so o dono, e so na propria mesa |
| `mesa-item-mover` | so o dono, e so **dentro da mesma mesa** |
| `mesa-item-tirar` | so o dono |
| `mapa-editar` / `mapa-objeto` | so `isAdmin` |

A checagem que vale e sempre a do servidor. O botao escondido no cliente e so
conforto.

## 9. Pegadinha do deploy

`server/data/mesas.json` some a cada deploy no **plano free do Render** - junto
com as contas e a decoracao. Quem tinha mesa perde a mesa e o que estava em cima.
Ver `docs/deploy.md`, secao 3.
