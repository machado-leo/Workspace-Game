# De onde veio cada peca da arte

Este documento responde uma pergunta so: **de onde saiu cada imagem que o jogo
desenha?** Serve pra auditoria de licenca, pra achar a peca original quando a gente
quiser trocar de celula, e pra saber o que ja esta baixado antes de sair procurando
de novo.

Complementa, nao substitui, o [`public/assets/lpc-moveis/CREDITS.md`](../public/assets/lpc-moveis/CREDITS.md),
que e o arquivo de credito propriamente dito e precisa ficar do lado dos PNGs.

---

## 1. O que foi procurado, e o que foi descartado

A pergunta original era se dava pra **copiar a arte do Gather e dar os creditos**.
Nao da: sao assets de um produto comercial de terceiro, e credito nao e licenca.
O projeto ja tinha tomado essa decisao antes — o README do espelho registra que a
pasta `referencias/` (prints do Gather) fica fora do repositorio publico.

Entao a busca foi por **banco de arte aberta** que servisse pra um escritorio 2D
visto de cima. O que apareceu e o que aconteceu com cada um:

| Candidato | Licenca | Decisao |
|---|---|---|
| Arte do proprio Gather | proprietaria | **Descartado.** Nao ha atribuicao que autorize copiar. |
| [ElizaWy/LPC](https://github.com/ElizaWy/LPC) (LPC Revised) | CC-BY 3.0 / OGA-BY 3.0 | **Adotado.** Ver secao 2. |
| [Tiddybub/2d-assets](https://github.com/Tiddybub/2d-assets) → `modern-urban/oga-crimelike-furniture` | CC0 | Descartado. E CC0 e tem movel moderno 32x32, mas o conjunto e tematico de cena de crime (`bath_bloody_*`) e nao casa com o boneco que ja usamos. |
| [Kenney](https://kenney.nl) (via o mesmo repo) | CC0 | Descartado. Estilo mais chapado/vetorial, destoa do pixel do boneco. |
| [\[LPC\] Floors](https://opengameart.org/content/lpc-floors) e [\[LPC\] Walls](https://opengameart.org/content/lpc-walls) (bluecarrot16) | CC-BY-SA 3.0 | Nao foi preciso: o ElizaWy/LPC ja traz `Structure/Floor` e `Structure/Walls`. Ficam anotados como plano B. |
| [LimeZu — Modern Interiors / Modern Office](https://limezu.itch.io/moderninteriors) | paga | Descartado. E o que mais parece com o Gather, mas nao e aberta. |

O desempate a favor do LPC foi um detalhe que ja estava no projeto: **o boneco ja e
LPC** (`public/assets/lpc/`). Adotar o mesmo banco pro cenario faz personagem e
ambiente serem a mesma arte, e isso aparece na tela.

---

## 2. A fonte adotada

- **Repositorio:** https://github.com/ElizaWy/LPC
- **Ramo:** `main`
- **Commit baixado:** `f07f7f5892e67c932c68f70bb04472f2c64e46bc` (2023-12-01)
- **Pastas trazidas:** `Objects/`, `Structure/`, `Terrain/`, `FX/`
- **Total local:** 320 PNGs + 28 `credits.txt`, 5,0 MB
- **Licenca declarada pelo repositorio:**

  > All of our assets are licensed under the Creative Commons Attribution 3.0
  > (CC-BY-3.0) or OGA-by 3.0 License, allowing you to freely use, modify, and
  > distribute these assets in your own projects, provided you give appropriate
  > attribution.

O repositorio **nao tem arquivo `LICENSE` na raiz**. O que vale como concessao de
licenca sao o texto do README acima e os `credits.txt` de cada pasta, que dizem a
licenca peca por peca. Por isso esses `credits.txt` foram copiados junto, **sem
edicao**, e ficam ao lado dos PNGs.

### Como foi baixado

Dois caminhos, por um motivo pratico:

1. **`Objects/`** — pela API de conteudo do GitHub (`/repos/ElizaWy/LPC/contents/...`),
   percorrendo pasta por pasta. 200 arquivos.
2. **`Structure/`, `Terrain/`, `FX/`** — a API respondeu **403** no meio do caminho
   (limite de 60 requisicoes/hora sem autenticacao). Troquei por clone esparso, que
   nao usa API nenhuma:

   ```bash
   git clone --filter=blob:none --sparse --depth 1 https://github.com/ElizaWy/LPC.git
   git -C LPC sparse-checkout set "Structure" "Terrain" "FX"
   ```

   O `--filter=blob:none` e o que evita puxar os 47.446 PNGs de personagem do repo.

### Regra de renome

Os nomes originais tem espaco e virgula (`Chair, Office.png`), o que atrapalha em URL.
Na copia local viraram slug, e a pasta virou prefixo:

```
Objects/Furniture/Seating/Chair, Office.png  ->  furniture-seating/chair-office.png
Structure/Floor/Wood Floor A.png             ->  structure-floor/wood-floor-a.png
Terrain/trees_summer.png                     ->  terrain/trees-summer.png
```

O mapeamento completo, arquivo por arquivo, esta em
`public/assets/lpc-moveis/lista.json` (Objects) e `lista-ambiente.json`
(Structure/Terrain/FX), gerados no proprio download.

---

## 3. Tile do mapa -> celula da folha -> arquivo original

Esta e a tabela que responde "de onde saiu essa cadeira". A coluna **Celula** e a
coordenada dentro da folha, em tiles de 32px, no formato `coluna,linha (largura x
altura)` — os mesmos numeros que estao em [`public/js/sprites.js`](../public/js/sprites.js).

| Onde aparece no mapa | Celula | Arquivo local | Caminho original no pacote |
|---|---|---|---|
| `TAPETE` | 9,3 (3×3) | `furniture-rugs/diamond-rug-tiling.png` | `Objects/Furniture/Rugs/Diamond Rug, tiling.png` |
| `CADEIRA`, `CADEIRA_BAIXO`, `CADEIRA_DIR`, `CADEIRA_ESQ` | 0,0 (1×1) / 0,2 (1×1) / 1,0 (1×1) / 1,1 (1×1) | `furniture-seating/chair-office.png` | `Objects/Furniture/Seating/Chair, Office.png` |
| `CADEIRA_VERMELHA`, `CADEIRA_VERMELHA_BAIXO`, `CADEIRA_VERMELHA_DIR`, `CADEIRA_VERMELHA_ESQ`, `POLTRONA` | 3,1 (1×1) / 0,1 (1×1) / 1,1 (1×1) / 2,1 (1×1) / 3,2 (1×1) | `furniture-seating/chair-sofa-a.png` | `Objects/Furniture/Seating/Chair, Sofa A.png` |
| `PUFE` | 2,0 (1×1) | `furniture-seating/ottoman-small-a.png` | `Objects/Furniture/Seating/Ottoman, Small A.png` |
| `SOFA_BAIXO` | 0,0 (3×2) | `furniture-seating/sofa-casual-a.png` | `Objects/Furniture/Seating/Sofa, Casual A.png` |
| `IMPRESSORA` | 0,0 (1×2) | `furniture/copy-machine.png` | `Objects/Furniture/Copy Machine.png` |
| `MESA_CENTRO` | 0,0 (1×2) | `furniture/end-table.png` | `Objects/Furniture/End Table.png` |
| `GELADEIRA` | 0,0 (1×2) | `furniture/fridge.png` | `Objects/Furniture/Fridge.png` |
| `LUMINARIA_PE` | 0,0 (1×2) | `furniture/lighting-floor.png` | `Objects/Furniture/Lighting, Floor.png` |
| `PLANTA`, `PLANTA_GRANDE` | 4,1 (1×2) / 2,0 (1×3) | `furniture/planter.png` | `Objects/Furniture/Planter.png` |
| `BEBEDOURO` | 0,0 (1×2) | `furniture/water-cooler.png` | `Objects/Furniture/Water Cooler.png` |
| `VASO_FLORES` | 0,0 (1×1) | `small-items/flowers.png` | `Objects/Small Items/Flowers.png` |
| `ARBUSTO` | 2,0 (1×1) | `terrain/plants-summer.png` | `Terrain/plants_summer.png` |
| `PEDRA` | 3,2 (1×1) | `terrain/rocks-grasslands.png` | `Terrain/Rocks, Grasslands.png` |
| `ARVORE` | 4,0 (3×4) | `terrain/trees-summer.png` | `Terrain/trees_summer.png` |
| `QUADRO` | 4,1 (1×1) | `wall-items/paintings-abstract.png` | `Objects/Wall Items/Paintings, Abstract.png` |
| `CADEIRA` (+3 direcoes), **so em copa, hall, patio, reuniao, treinamento e huddle** | 0/1/4/5+6 x linha da sala | `furniture-seating/chair-dining-a.png` | `Objects/Furniture/Seating/Chair, Dining A.png` |

---

## 4. Autoria e licenca de cada folha em uso

Copiado dos `credits.txt` do proprio pacote. A ultima coluna e o conjunto LPC **mais
antigo** de onde a peca veio, quando o pacote informa — varias sao redesenhos ou
recolorizacoes de arte de 2012.

| Arquivo local | Autores | Licenca | Conjunto LPC de origem |
|---|---|---|---|
| `furniture-rugs/diamond-rug-tiling.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `furniture-seating/chair-office.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `furniture-seating/chair-sofa-a.png` | Lanea Zimmerman (Sharm), BlueCarrot16, Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | [lpc-upholstery](https://opengameart.org/content/lpc-upholstery) |
| `furniture-seating/ottoman-small-a.png` | Lanea Zimmerman (Sharm), BlueCarrot16, Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | [lpc-upholstery](https://opengameart.org/content/lpc-upholstery) |
| `furniture-seating/sofa-casual-a.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `furniture/copy-machine.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `furniture/end-table.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `furniture/fridge.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `furniture/lighting-floor.png` | Lanea Zimmerman (Sharm), Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | [lpc-modified-base-tiles](https://opengameart.org/content/lpc-modified-base-tiles)<br>[lpc-interior-castle-tiles](https://opengameart.org/content/lpc-interior-castle-tiles) |
| `furniture/planter.png` | Lanea Zimmerman (Sharm) | OGA-BY 3.0 | [lpc-interior-castle-tiles](https://opengameart.org/content/lpc-interior-castle-tiles) |
| `furniture/water-cooler.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `small-items/flowers.png` | Lanea Zimmerman (Sharm), Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | [lpc-interior-castle-tiles](https://opengameart.org/content/lpc-interior-castle-tiles) |
| `terrain/plants-summer.png` | Lanea Zimmerman (Sharm), Eliza Wyatt (DeathsDarling), Hyptosis | OGA-BY 3.0 | [lots-of-free-2d-tiles-and-sprites-by-hyptosis](https://opengameart.org/content/lots-of-free-2d-tiles-and-sprites-by-hyptosis) |
| `terrain/rocks-grasslands.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |
| `terrain/trees-summer.png` | Lanea Zimmerman (Sharm), Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | [liberated-pixel-cup-lpc-base-assets-sprites-map-tiles](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles) |
| `wall-items/paintings-abstract.png` | Eliza Wyatt (DeathsDarling) | OGA-BY 3.0 | (original do proprio LPC Revised) |

### Uma peca, varios modelos

A cadeira e a unica peca que **muda de modelo conforme a sala**. O mapa tem um tile
de cadeira por direcao, e criar um tile novo pra cada modelo custaria caro (sao cinco
lugares pra registrar cada um, ver `testes/itens.js`). Entao o modelo e escolhido na
hora de desenhar, pelo `cadeiraDaSala()` do `sprites.js`: salao e salas privativas
usam a cadeira de escritorio, e copa, hall, patio, reuniao, treinamento e huddle usam
a de refeitorio, cada uma numa cor.

De costas, a cadeira de refeitorio vem **partida em duas camadas** na folha (coluna 5
= assento, coluna 6 = encosto e pes), pra caber gente sentada no meio. Desenhar so a
coluna 6 dava um esqueleto sem assento, que na tela parecia uma mesinha.

---

## 5. O que esta baixado e ainda nao entrou

O download foi do pacote inteiro, de proposito — sai mais barato baixar tudo uma vez
que voltar na API a cada peca nova. Contagem por pasta local (so PNG):

| Pasta local | PNGs | Serve pra |
|---|---|---|
| `furniture` | 43 | mesa, geladeira, TV, estante, balcao, impressora, maquina de vender, relogio de pe, biombo, espelho |
| `furniture-seating` | 30 | 7 modelos de sofa, 6 de cadeira de jantar, banquetas, otomanas, namoradeiras |
| `furniture-beds` | 15 | camas e cabeceiras |
| `furniture-rugs` | 4 | tapetes |
| `small-items` | 26 | notebook, cafeteira, papel, telefone, louca, almofada, luminaria de mesa |
| `small-items-food` | 25 | comida |
| `small-items-fabric`, `small-items-ores-e-ingots` | 13 | tecido, minerio |
| `wall-items` | 13 | quadros (4 estilos), posteres, cortinas, luminaria de parede, espelhos |
| `structure-walls` | 20 | parede (**ver ressalva**) |
| `structure-wall-borders` | 7 | rodateto |
| `structure-floor` | 16 | madeira, ladrilho, carpete geometrico e floral, subpiso |
| `structure-windows` | 7 | janela, com versao iluminada (`-emission`) |
| `structure-doors-*` | 13 | porta e batente, em 3 alturas |
| `structure-roofing`, `-stairs`, `-bridges`, `-fences`, `-pillars`, `-platforms`, `-signs`, `-structures`, `-misc` | 35 | telhado, escada, ponte, cerca, pilar, placa |
| `terrain` | 29 | grama, arvore, planta, pedra, penhasco, cachoeira — nas 4 estacoes |
| `furniture-smithing`, `furniture-sewing-e-weaving`, `moveable`, `fx` | 24 | ferraria, costura, cadeira de rodas, ondulacao de agua |

**Total: 320 PNGs.**

---

## 6. O que continua desenhado a mao (e por que)

O `sprites.js` pergunta ao pacote primeiro e **cai no desenho antigo** quando nao
acha. Estes ainda caem:

| Peca | Motivo |
|---|---|
| **Mesa de trabalho** | Ja foi trocada pela do pacote, e voltou (commit `2b3f4fe`). Toda arte de mesa do pacote e 3x2 e a mesa do mapa e 3x1: em modo `alto` o tampo subia pra linha DE CIMA, que nao e celula de mesa. O que a pessoa via como mesa nao era clicavel, reivindicar mesa so pegava na tirinha do pe, e o `tampoAte` mandava o item pousar em cima da perna. |
| **Carpete** | O `geometric-carpet` do pacote e tapete de medalhao, tipo persa. Cobrindo o salao inteiro, escritorio virava salao de castelo. O desenhado e carpete em PLACAS, em dois tons proximos — que e o que escritorio tem. |
| **Estante e armario** | As 63 celulas do `cabinet.png` sao a MESMA madeira escura de taverna, e o `shelf.png` e guarda-roupa fechado. Escritorio pede estante clara com pasta e livro colorido. |
| **Balcao** | O `countertop` do pacote e balcao de taverna, com painel almofadado. |
| **TV** | Todas as telas da folha estao DESLIGADAS, pretas — na parede vira um vao escuro. A desenhada tem tela acesa com conteudo, que le como tela de apresentacao. (A coordenada tambem estava errada: apontava pra `12,0`, celula vazia, e a TV saia como dois retangulos partidos.) |
| **Cacto** | No pacote a planta espinhosa vem num vaso de porcelana azul-e-branca, cara de antiquario. |
| **Parede** | No pacote a parede e **elevacao**: face de 3 tiles de altura vista de frente, mais rodateto. Nosso mapa trata parede como bloco de 1 tile visto de cima. Nao e trocar a imagem, e mudar como o mapa desenha parede. |
| **Janela** | Mesma coisa: as de `structure-windows` sao janelao ornamental de fachada, pra parede em elevacao. |
| **Grama** | Vem como autotile (borda, quina, transicao pra terra). Precisa de logica de vizinhanca que ainda nao existe. |
| **Agua do lago** | Mesmo caso da grama, mais animacao. O contorno arredondado da poca e recorte no desenho a mao (`roundRect` + `clip`). |
| **Lousa, cavalete, aquario, cabide, relogio, banco, cerca** | Ou o pacote nao tem equivalente, ou falta so escolher a celula. |
| **Mesa de reuniao, mesa redonda** | Falta escolher a celula. |

### Peca alta nao pode comer a parede

Peca em modo `alto` desenha pra fora da propria celula, pra cima. Como o pre-render
vai linha por linha de cima pra baixo, ela e desenhada DEPOIS da parede e passava por
cima — na tela a parede sumia atras do movel. Agora o `alto` recorta as celulas de
parede e janela antes de desenhar.

A excecao e a flag `atravessa`, pra duas familias: o que pendura na parede, e o que e
organico e alto (arvore, planta grande), onde a copa cobrindo a parede le como
profundidade e nao como buraco. Movel de silhueta quadrada continua cortado, porque
ali o corte aparece como falha.

**A licao da primeira linha:** peca do pacote com altura diferente da do mapa nao e
so questao de ficar bonito — ela **quebra a interacao**, porque o que a pessoa ve
deixa de bater com a celula que responde ao clique. Antes de trocar uma peca,
conferir se a arte cabe na celula que o mapa reserva pra ela.

---

## 7. Como conferir ou refazer

O primeiro conferidor e automatico. `npm run teste` roda o `testes/cenario.js`,
que quebra se:

- uma folha citada no `sprites.js` **nao existe** no disco;
- uma folha em uso **nao esta creditada** no `CREDITS.md` (isto e quebra de licenca,
  nao descuido de organizacao);
- sobrou credito de folha que **saiu de uso**, e a tabela passou a mentir;
- a celula pedida **cai fora da folha** — o `drawImage` sai vazio e a peca some sem
  erro nenhum no console.

Esse teste existe porque a coisa ja aconteceu: a TV, o quadro, o tapete do lobby e o
`tile-a` entraram no `sprites.js` e ninguem lembrou do `CREDITS.md`.

As paginas de apoio nao entram no jogo, so desenham:

- **`/pacote.html`** — as 320 folhas cruas em 3x, com a grade de 32px e o numero de
  cada celula por cima, mais o caminho original de cada arquivo. Tem campo de busca
  (`chair`, `wall`, `floor`...). E daqui que saem as coordenadas da secao 3.
- **`/sprites.html`** — todas as pecas ja trocadas, desenhadas pelo mesmo caminho que
  o mapa usa (`Game.desenharObjeto` numa grade falsa), pra conferir emenda de peca
  larga sem andar pelo mapa.
- **`/mapa.html`** — o andar inteiro numa tela, em 2x ou 4x.

Pra tracar um arquivo local ate a origem sem abrir nada:

```bash
grep -B1 '"local": "furniture/planter.png"' public/assets/lpc-moveis/lista.json
```

---

## 8. Se o pacote for descartado

Apagar `public/assets/lpc-moveis/` inteiro (junto com o `CREDITS.md` e este
documento) e tirar `<script src="js/sprites.js">` do `index.html` e do `mapa.html`.
O desenho a mao continua inteiro no `game.js` e volta sozinho — a camada de sprites
foi feita com reserva justamente pra isso.
