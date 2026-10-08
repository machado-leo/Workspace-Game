# Plano — Decorador do escritorio

Igual ao "Decorator" do Gather que o Caio mandou: um painel lateral com busca,
abas de categoria e uma grade de objetos pra colocar no mapa.

## 1. A ideia central

O escritorio ja e uma **grade de tiles** (38x28 desde a planta compacta), e cada tipo de tile ja sabe se
bloqueia passagem (`SOLID_TILES`) e como se desenha (`drawObstacleTile`). Entao
decorar = **escrever um tile numa celula**. Nao precisa de sistema de objetos novo,
de camada nova nem de assets novos: colisao, pathfinding e render vem de graca.

Consequencia boa: o que a pessoa coloca ja bloqueia o boneco na hora, e a
miniatura no catalogo e desenhada pela **mesma funcao** que desenha no mapa — o
que voce ve na grade e exatamente o que vai aparecer.

Consequencia aceita: e uma celula por objeto, entao nao da pra girar nem colocar
"meio tile pra direita". Objetos maiores (mesa comprida, sofa) se montam
encostando varias celulas, que e como o mapa ja e feito hoje.

## 2. Quem pode decorar

So quem tem `isAdmin` (a conta criada com o codigo da diretoria). O botao nem
aparece pros outros, **e** o servidor recusa o evento de quem nao e admin — a
checagem que vale e a do servidor.

## 3. Onde guarda

`server/data/mapa.json`, do lado das contas:

```json
{
  "mudancas": [ { "c": 12, "r": 8, "t": 8 } ],
  "objetos":  [ { "c": 12, "r": 8, "o": 1 } ]
}
```

E uma **lista de diferencas** em cima do mapa base do `server/map.js`, nao o mapa
inteiro. Assim o mapa base continua sendo a fonte da planta da sede e o arquivo
fica pequeno. No boot o servidor aplica as mudancas por cima; uma celula editada
duas vezes guarda so a ultima.

Gravacao atomica (`.tmp` + rename), igual ao `usuarios.js`.

## 4. Protocolo

| Evento | Direcao | Payload | Observacao |
|---|---|---|---|
| `init` | servidor → cliente | ganha `mudancasMapa` e `objetosMapa` | o cliente aplica no `OfficeMap` e redesenha |
| `mapa-editar` | cliente → servidor | `{ c, r, t }` | so admin; valida coordenada e se `t` e um tile do catalogo |
| `mapa-atualizado` | servidor → todos | `{ c, r, t }` | todo mundo redesenha na hora |
| `mapa-objeto` | cliente → servidor | `{ c, r, o }` | so admin; camada de cima (0 = tirar) |
| `mapa-objeto-atualizado` | servidor → todos | `{ c, r, o }` | tambem sai sozinho quando o movel de baixo some |

Validacoes: `c`/`r` inteiros dentro do mapa, `t` na lista de tiles permitidos, e a
celula **nao pode ser a que alguem esta pisando** (senao da pra prender a pessoa
dentro de um armario).

## 5. Catalogo

Agrupado como no Decorator da referencia, com **variacoes** dentro de cada aba (o
Gather tem varias versoes do mesmo movel, nao uma so):

| Aba | Itens |
|---|---|
| Trabalho | **mesa 2 monitores**, mesa com monitor, mesa com notebook, bancada, mesa de reuniao, mesa de centro, cadeira, cadeira vermelha, impressora, lousa |
| Decoracao | planta, planta grande, vaso de flores, cacto, quadro, relogio, televisao, cavalete, cabide, tapete, tapete redondo |
| Estar | sofa (encosto), sofa (assento), poltrona, banco, estante, armario, balcao, bebedouro |
| Estrutura | parede, janela, cerca |
| Area externa | arvore, arbusto, pedra, agua |

Mais a **borracha**, que escreve `LIVRE` e devolve o chao, e a aba **📐 Areas**, que
nao e objeto: e o editor que move e redimensiona o retangulo de cada sala
(chamada fechada, piso, etiqueta). Ver [areas.md](areas.md).

Cada item tem nome em pt-BR (a busca filtra por ele) e a miniatura e um
`<canvas>` 32x32 desenhado com `drawObstacleTile`.

### Qualidade do desenho

A primeira versao usava forma vetorial lisa (`roundRect`, `arc`) e ficou longe da
referencia. Os moveis foram refeitos em **pixel art**: retangulos inteiros, com
contorno escuro de 1px (`TRACO`) e tres tons por material (claro em cima, base,
sombra embaixo). Os helpers ficam em `game.js`: `p()` (pixel), `caixa()`,
`monitor()`, `teclado()`, `caneca()`, `tampoDeMesa()` e `cadeiraDeEscritorio()` —
reaproveitados entre os itens pra tudo ficar da mesma familia.

## 5b. Sentar na cadeira

As cadeiras sao **caminhaveis** e cada tipo tem uma **direcao**, no mapa
`DIRECAO_ASSENTO` (nas duas copias do mapa):

| Tile | Direcao | Como aparece |
|---|---|---|
| `CADEIRA` / `CADEIRA_VERMELHA` | `up` | de costas pra gente, como na foto da referencia |
| `CADEIRA_BAIXO` / `..._VERMELHA_BAIXO` | `down` | de frente: da pra ver o rosto de quem senta |
| `CADEIRA_ESQ` / `..._VERMELHA_ESQ` | `left` | de perfil, encosto do lado direito |
| `CADEIRA_DIR` / `..._VERMELHA_DIR` | `right` | de perfil, encosto do lado esquerdo |
| `POLTRONA` | `up` | — |

`ASSENTOS` sai desse mapa, entao adicionar uma cadeira nova e so por uma linha la.

Quando o boneco para em cima de uma delas:

- encaixa no centro da celula e **vira pro lado que a cadeira aponta**;
- para a animacao de caminhada e desce 6px, pra sentar no assento em vez de subir
  em cima da mesa da celula de tras;
- o **encosto e redesenhado por cima** do corpo (`desenharEncostoPorCima`), senao o
  boneco parece em pe sobre a cadeira em vez de sentado nela. O recorte segue a
  direcao: `up` cobre o corpo todo (a cabeca fica acima do tile e continua
  visivel), `left`/`right` cobrem so a metade de tras, e `down` **nao cobre nada**
  porque nessa direcao o encosto fica atras da pessoa;
- `sentado` viaja no evento `move` e o servidor **confere** que a celula e mesmo um
  assento antes de repassar — nao da pra "sentar" no meio do corredor.

## 6. Interface

Painel encostado na direita, no formato da referencia:

```
┌──────────────────────────┐
│ Decorador             ✕  │
│ [ Buscar objeto...     ] │
│ [🖥][🪴][🛋][🧱][🌳][⌫]  │  <- abas
│  ┌────┐ ┌────┐ ┌────┐    │
│  │ 🖥 │ │ 🪴 │ │ 🛋 │    │  <- grade de miniaturas
│  └────┘ └────┘ └────┘    │
│ ...                      │
│ [↶] [↷]                  │  <- desfazer / refazer
└──────────────────────────┘
```

- Com um item selecionado, o cursor no mapa mostra um quadrado fantasma na celula
  sob o mouse (verde se pode, vermelho se nao pode) e **clicar coloca**.
- Arrastar com o botao pressionado pinta varias celulas seguidas.
- `Esc` larga o item selecionado.
- Desfazer/refazer sao locais (pilha do que **eu** coloquei nesta sessao) e
  reenviam a operacao inversa — nao e um historico global.

Enquanto o decorador esta aberto, o clique no mapa **decora** em vez de andar.

## 7. Como validar

- [x] Nao-admin: botao nao aparece e o evento na mao pelo console e recusado.
- [x] Colocar uma planta e ver aparecer na outra aba na hora.
- [x] Recarregar e a planta continua la.
- [x] Reiniciar o servidor e a planta continua la (veio do `mapa.json`).
- [x] Colocar uma parede em cima de alguem: a celula onde a pessoa esta e recusada.
- [x] Colocar mesa/armario e conferir que o boneco nao atravessa (colisao).
- [x] Borracha devolve o chao da zona certa.
- [x] Desfazer/refazer.

### Resultado

| Teste | O que aconteceu |
|---|---|
| Painel | abriu com busca, 6 abas e a grade; cada miniatura desenhada pela mesma funcao do mapa |
| Fantasma no cursor | previa translucida da planta com contorno verde na celula livre |
| Colocar | planta apareceu no mapa e `mapa.json` ficou com `{c:20, r:15, t:8}` |
| Colisao | `isTileWalkable(20,15)` virou `false` na hora |
| Desfazer / refazer | tile voltou pra `0` e depois pra `8` |
| Em cima de gente | forcado pelo console na propria celula: servidor **recusou**, tile ficou `0` |
| Nao-admin | botao escondido **e** `mapa-editar` forcado pelo console ignorado |
| Ao vivo | admin apagou numa aba e a aba do nao-admin atualizou sozinha |
| Restart do servidor | a planta voltou do `mapa.json` |
| Borracha | celula voltou ao original e **saiu** do arquivo de diferencas (ficou `[]`) |

Console limpo numa aba nova.

### Depois: variacoes, arte e sentar

| Teste | O que aconteceu |
|---|---|
| Catalogo | 10 itens em Trabalho, 11 em Decoracao, 8 em Estar (antes eram 6, 6 e 6) |
| Mapa cliente x servidor | script de comparacao: **0 tiles diferentes** depois de adicionar os 11 tipos novos |
| Mesa da referencia | duas `MESA_DUPLA` lado a lado viram uma bancada com 4 monitores, teclados e canecas |
| Sentar | andou ate a cadeira, encaixou no centro, virou pra mesa e a animacao parou |
| Sentar (outra pessoa) | a segunda aba recebeu `sentado: true` e desenhou sentado tambem |
| Arte | moveis refeitos em pixel art com contorno e tres tons — mesa, cadeira, sofa, banco, armario, balcao, plantas, TV, relogio, bebedouro |

### Depois: mesa grande e camada de cima

Comparando com as fotos do Gather que o Caio mandou, faltavam tres coisas:

1. **A mesa e branca**, com um gaveteiro cinza fino na frente e dois puxadores —
   nao de madeira. O `tampoDeMesa` foi refeito nesse padrao.
2. **A mesa tem duas fileiras.** O gaveteiro sai **uma vez so**, na fileira da
   frente; a fileira do fundo e so tampo. Por isso as pecas do catalogo agora sao
   2 de altura por padrao (2x2, 3x2, 4x2, 6x2) — com uma fileira so fica aquela
   mesinha estreita que nao parecia a referencia.
3. **Os monitores sobem por cima da mesa.** Sao desenhados maiores que a celula e
   estouram o tile pra cima; da certo porque a camada de objetos e desenhada
   depois de todo o resto do mapa.

E a cadeira sobe 5px dentro da celula, pra encostar na mesa como na foto em vez de
ficar solta embaixo. Quem senta aparece so com a cabeca acima do encosto.

| Teste | O que aconteceu |
|---|---|
| Mesa 3x2 | saiu como uma placa branca unica, com o gaveteiro so na frente |
| Objetos em cima | monitor, teclado, papelada e luminaria pousados no tampo, monitores passando pra cima da mesa |
| Apagar a mesa | o que estava em cima sumiu junto (`objetoCaiu`) |
| Desfazer peca grande | um clique desfez as 4 celulas de uma 2x2 |
| Restart do servidor | mesa e objetos voltaram do `mapa.json` |
| Tres postos lado a lado | ficou igual a foto de longe: placa, gaveteiro, cadeira encostada e uma pessoa sentada |

### Depois: quatro direcoes de cadeira e as gavetas certas

Duas correcoes vindo das fotos:

- **A pessoa so sentava numa posicao.** Agora existem quatro cadeiras (↑ ↓ ← →),
  nas duas cores, e o boneco senta virado pro lado que a cadeira aponta. O desenho
  muda por direcao: de costas mostra o encosto de tela inteiro, de frente mostra o
  assento e os bracos, de perfil mostra o encosto de lado.
- **As gavetas.** Antes saia um puxador por celula, entao uma bancada de 3 celulas
  tinha 6 gavetas. Agora o puxador so sai nas **pontas** da mesa (celula sem
  vizinha do lado), entao qualquer mesa fica com **dois** puxadores, como na foto.

| Teste | O que aconteceu |
|---|---|
| Sentar nas 4 cadeiras | `dir` voltou `up`, `down`, `left` e `right`, `sentado: true` nas quatro |
| Encosto por cima | de costas cobre o corpo; de frente aparece o rosto; de perfil cobre so as costas |
| Mapa cliente x servidor | 0 tiles diferentes e `DIRECAO_ASSENTO` identico nos dois lados |


---

## Anexo — a mesa em tres faixas (07/09)

O Caio descreveu a mesa da referencia assim: *"ocupa 2 blocos, sendo um uma
gaveteira e o outro os pes, que da ilusao de ser 3D, e em cima tipo uma malha
que conseguimos personalizar com itens em cima"*. Foi isso que passou a ser
desenhado, medido em `referencias/10-MESA-closeup-gavetas-e-pe.png`.

A mesa ocupa **duas celulas na vertical**, e cada uma faz um papel:

| Fileira | O que e |
|---|---|
| de tras | so o tampo — e a **malha** onde os itens sao apoiados |
| da frente | o tampo mais a mesa vista de frente, em tres faixas |

As tres faixas da fileira da frente (em unidades de 1/128 do tile):

| Faixa | Unidades | O que e |
|---|---|---|
| tampo | 0–60 | a superficie |
| espessura | 60–73 | a placa vista de canto, bem clara |
| vao | 73–108 | escuro, e **onde mora o 3D** |
| chao | 108–128 | o piso aparecendo debaixo da mesa |

**O erro que era facil cometer:** deixar o vao escuro ir ate o fim do tile. Sem
a faixa de chao embaixo, a mesa fica chapada — o olho nao entende que existe
espaco vazio sob o tampo. O degrau *tampo claro → vao escuro → chao* e o que
cria a profundidade.

Dentro do vao, e **so nas pontas do bloco** (`b.esq` / `b.dir`):

- **gaveteira** na ponta esquerda, com tres frentes de gaveta e puxador;
- **pe** na ponta direita, com sapata larga.

Uma bancada de quatro celulas fica com **uma** gaveteira e **um** pe, nao quatro
de cada. E o mesmo raciocinio que ja valia pros puxadores.

> **Traco fino some.** Os pes comecaram com 10 unidades de largura (2,5 px no
> mapa) e sumiam no zoom normal do jogo. Foram pra 26. Vale a regra que ja
> estava no handoff: detalhe abaixo de ~2 unidades evapora, e no caso de peca
> estrutural o piso e bem mais alto que isso.

### A malha

Com um item da aba "Em cima da mesa" na mao, toda superficie livre acende um
contorno **verde** e as ja ocupadas um contorno **ambar**. Sai de
`Decorador.pintandoEmCima()`, e so aparece nesse modo — fora dele o escritorio
continua limpo.

### Como conferir sem caçar a camera

A camera segue o boneco e atrapalha inspecionar movel. O jeito rapido e
desenhar num canvas por cima, com escala propria:

```js
const M = OfficeMap, TILE = M.TILE, ESC = 5, W = 5, H = 3;
const cv = document.createElement('canvas');
cv.width = W*TILE*ESC; cv.height = H*TILE*ESC;
cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;image-rendering:pixelated';
document.body.appendChild(cv);
const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.scale(ESC, ESC);
const g = Array.from({length:H}, () => new Array(W).fill(0));
for (let r=0;r<2;r++) for (let col=0;col<4;col++) g[r][col] = M.MESA;   // mesa 4x2
for (let r=0;r<H;r++) for (let col=0;col<W;col++) Game.desenharPiso(c, col, r, TILE, 'carpete_roxo');
for (let r=0;r<H;r++) for (let col=0;col<W;col++) if (g[r][col]) Game.desenharObjeto(c, col, r, g[r][col], TILE, g);
Game.desenharApoiado(c, 1, 0, M.OBJETOS.MONITOR_DUPLO, TILE);
```

Pra apagar depois: `document.querySelectorAll('canvas').forEach(c => { if (c.id !== 'canvas-jogo' && c.id !== 'canvas-preview' && !c.closest('#decor-grade')) c.remove(); })`.

> **Nao tente conferir cor lendo pixel de um canvas 1:1.** O desenho usa a grade
> fina (`U = 0.25`), que so fecha em pixel inteiro com o contexto escalado em 4x.
> Sem escalar, o detalhe colapsa e a leitura engana — perdi tempo com isso.
