# Planta da referencia, tile a tile

Levantamento do escritorio do Gather que serve de referencia, medido celula por
celula em `referencias/Captura de tela 2026-09-07 172652.png` e nos closeups da
mesma sessao (172704, 172719, 172725, 172742, 172749, 172804, 172815, 172825,
172839).

**Escala.** O print esta a 1,16x: o tile mede **37,2 px** nele, nao 32. Todas as
coordenadas abaixo ja estao em tiles. Origem (0,0) = canto superior esquerdo do
print. Area levantada: **37 x 23 tiles**.

Versao navegavel, com as plantas desenhadas:
<https://claude.ai/code/artifact/f0de6657-b994-4580-bcb9-73152a446051>

---

## 1. O andar em blocos

| Bloco | Colunas | Linhas | Piso |
|---|---|---|---|
| Sala privativa 1 | 5-8 | 0-3 | carpete roxo |
| Sala privativa 2 | 10-13 | 0-3 | carpete roxo |
| Patio (Koi Pond) | 16-20 | 0-3 | grama |
| Sala privativa 3 | 22-25 | 0-3 | carpete roxo |
| Sala privativa 4 | 27-30 | 0-3 | carpete roxo |
| Parede norte (faixa de mobilia) | 4-30 | 4-5 | - |
| Copa | 1-5 | 3-9 | ladrilho lilas |
| Reuniao Mondrian | 1-5 | 10-16 | carpete cinza |
| Reuniao Quadro Branco | 31-35 | 3-9 | ladrilho lilas |
| Data Huddle | 31-35 | 10-16 | carpete cinza listrado |
| Hall | 6-30 | 6-16 | tijolinho creme |
| Lounge (ilha) | 9-16 | 8-13 | carpete listrado |
| Baias do Time (ilha) | 20-28 | 8-13 | carpete roxo |
| Parede sul | 6-30 | 17-18 | - |
| Sala de TI | 22-25 | 17-19 | parede roxa |
| Lobby | 6-18 | 19-23 | tijolinho |
| Conferencia | 25-29 | 20-23 | tijolinho |

O predio **nao** e uma grade de salas: e um hall grande de tijolinho com salas
fechadas so nas duas laterais, quatro pods na faixa de cima e duas ilhas de
carpete soltas no meio, sem parede nenhuma.

---

## 2. As regras que valem no andar todo

1. **Piso base.** Tijolinho creme em fiada alternada no hall inteiro (duas fiadas
   por tile, junta deslocada meio tijolo por fileira). Nao muda de sala pra sala.
2. **Ilha de carpete.** Area de trabalho e de convivio sao retangulos de carpete
   por cima do tijolinho, sem parede e sem porta. A etiqueta flutua acima em
   pilula branca.
3. **Mesa = 3 x 1.** Sempre. Tampo lilas quase branco ocupando ~85% da altura,
   faixa azul-acinzentada embaixo com **uma** gaveta larga a esquerda. A cadeira
   fica na linha imediatamente abaixo, no tile do meio.
4. **Parede.** Cinza-azulada escura e quase nunca nua: 15 pecas em 24 tiles so na
   faixa norte. A mobilia fica embutida na linha da parede.
5. **Reuniao em duas escalas.** Huddle = mesa redonda de 1 tile com 4 assentos
   (um por lado). Conferencia = mesa 3 x 2 com 10 poltronas vermelhas (3 em cima,
   3 embaixo, 2 de cada lado).

---

## 3. Sala por sala

Coordenadas **locais** da sala: (0,0) = canto superior esquerdo da area descrita.

### Sala privativa (as quatro sao iguais) - 5 x 5 uteis

```
      col 0   1   2   3   4
row 0  #############  janelao nas colunas 1-3
row 1              [arvore]
row 2  .  [== MESA 3x1 ==]  .
row 3  .   .  [cad]  .   .
row 4  .   .   .   .   .
row 5  .   .   .   .   .
row 6  ####[ porta ]####     vao de 2 tiles
```

| Item | Tile | Detalhe |
|---|---|---|
| Janelao | (1,0) 3x1 | vidro verde-agua, embutido na parede norte |
| Arvore em vaso escuro | (4,1) | canto nordeste, sempre |
| Mesa | (1,2) 3x1 | gaveta larga na ponta esquerda |
| Cadeira | (2,3) | tile do meio, uma linha abaixo da mesa |
| Porta | (2,6) 2x1 | o carpete escorre pro hall pelo vao |

### Patio - Koi Pond - 8 x 8, sem parede

| Item | Tile | Detalhe |
|---|---|---|
| Lago | (3,3) 2x2 | agua no centro |
| Anel de pedra | (2,2) 4x4 menos o miolo | fecha os quatro lados, sem falha |
| Espreguicadeira azul | (2,0) e (6,7) | uma no topo a esquerda, outra na base a direita |
| Cadeira de madeira | (4,0) (6,0) (2,7) (4,7) | duas em cima, duas embaixo |
| Arbusto | (0,1) (0,3) (0,5) (7,1) (7,3) (7,5) (6,6) | sete, so na borda |

Os assentos ficam **em cima e embaixo**, nunca nas laterais.

### Copa - 5 x 6, ladrilho lilas

| Item | Tile | Detalhe |
|---|---|---|
| Armario alto duplo | (0,0) 1x2 | azul-escuro, do chao ao teto |
| Cooktop + janelao | (1,0) 2x1 | vidro verde-agua de 3 tiles atras |
| Bancada com armarios | (1,1) 2x1 | cafeteira roxa e duas canecas em cima |
| Planta em vaso terracota | (3,1) | |
| Mesa redonda | (2,3) | cinza, 1 tile |
| Cadeiras de madeira | (2,2) (1,3) (3,3) (2,4) | uma por lado |

### Reuniao Mondrian - 5 x 6, carpete cinza

| Item | Tile | Detalhe |
|---|---|---|
| Estante de livros | (0,0) 2x1 | |
| Quadro Mondrian | (2,0) 2x1 | vermelho, azul e amarelo - o unico ponto de cor |
| Planta em vaso terracota | (4,0) | |
| Gaveteiro de 3 gavetas | (4,1) | |
| Mesa redonda | (2,3) | documento e pasta verde em cima |
| Cadeiras assento azul | (2,2) (1,3) (3,3) (2,4) | |

### Reuniao Quadro Branco - 5 x 6, ladrilho lilas

| Item | Tile | Detalhe |
|---|---|---|
| Quadro branco | (0,0) 2x1 | com anotacoes e post-it amarelo |
| Janelao | (2,0) | |
| Cavalete com grafico | (3,0) | |
| Gaveteiro escuro | (4,1) | livro aberto em cima |
| Mesa redonda | (2,3) | |
| Cadeiras assento azul | (2,2) (1,3) (3,3) (2,4) | |

### Data Huddle - 5 x 6, carpete listrado

| Item | Tile | Detalhe |
|---|---|---|
| Estante baixa de livros | (2,0) 2x1 | |
| Luminaria de pe com globos | (4,0) | seis globos brancos |
| Aquario sobre movel escuro | (0,1) | monitor pendurado logo acima |
| Suculenta em vaso | (1,1) | |
| Mesa redonda | (2,3) | |
| Poltronas teal | (2,2) (1,3) (3,3) (2,4) | |

### Lounge - 8 x 6, ilha de carpete listrado

| Item | Tile | Detalhe |
|---|---|---|
| Estante cheia | (1,0) 2x1 e (6,0) 2x1 | par simetrico |
| Mesa lateral com planta grande | (1,1) | |
| Sofa de 2 lugares | (3,1) 2x1 | marrom, duas almofadas brancas e uma caneca laranja |
| Planta grande em vaso branco | (6,1) e (1,4) | |
| Mesa de centro redonda | (3,2) 2x1 | madeira clara, com uma xicara |
| Pufe azul | (1,2) e (6,3) | |
| Pufe roxo | (6,2) | |
| Pufe rosa | (1,3) | |
| Banco de madeira | (2,4) 2x1 e (4,4) 2x1 | os dois ficam colados |
| Banquinho amarelo | (6,4) | |

A linha 5 fica vazia. A composicao e **simetrica** no eixo vertical.

### Baias do Time - 9 x 6, ilha de carpete roxo

```
row 0  [== MESA ==][== MESA ==][== MESA ==]
row 1     [cad]       [cad]       [cad]
row 2   (corredor)
row 3   (corredor)
row 4  [== MESA ==][== MESA ==][== MESA ==]
row 5     [cad]       [cad]       [cad]
```

Seis postos. As tres mesas de cada fileira ficam **coladas**, so uma costura
entre elas - nao ha vao de piso. A mesa (0,4) leva o setup de tres monitores em
V ocupando os 3 tiles, com teclado e mouse na frente.

### Conferencia - mesa 3 x 2 + 10 poltronas, solta no hall

```
row 0   .  [v] [v] [v]  .
row 1  [v] [==       ==] [v]
row 2  [v] [== MESA  ==] [v]
row 3   .  [v] [v] [v]  .
```

No tampo: notebook, monitor, teclado, impressora pequena, celular, caderno e
papelada - sete objetos espalhados.

### Lobby - canto sudoeste do hall

| Item | Tile | Detalhe |
|---|---|---|
| Parede sul | linha 0 | aqui a parede e **clara**, nao cinza-escura |
| Planta grande em vaso branco | (0,0) | |
| TV de parede | (2,0) 2x1 | |
| Painel de arte abstrata azul | (4,0) 3x1 | o maior item de parede do andar |
| Quadro colorido | (9,0) | |
| Tapete claro de losangos | (2,2) 5x3 | por baixo de tudo |
| Sofa em L azul | (3,2) 2x1 + (2,3) | |
| Mesa redonda de centro | (3,3) 2x1 | globo cinza em cima |
| Poltrona escura | (6,3) e (4,4) | |
| Banquinho amarelo | (6,4) | |
| Balcao de recepcao | (8,2) 3x1 | branco arredondado, monitor e papelada; capacho na frente |

### Sala de TI - 4 tiles de parede roxa

| Item | Tile |
|---|---|
| Mixer / painel | (0,0) |
| TV grande de parede | (2,0) 2x1 |
| Mesa roxa com equipamento | (0,1) 2x1 |
| Bancada com monitores e teclado | (2,1) 2x1 |

### Parede norte - 24 tiles de mobilia (colunas 4 a 30)

| Coluna | Item |
|---|---|
| 5 | Planta em vaso terracota |
| 6 | Bambu em vaso branco |
| 9 | Maquina de fliperama |
| 10-11 | Estante branca de livros |
| 11 | Plantinha em cima da estante |
| 14-15 | Armarios superiores de cozinha |
| 14-15 | Bancada com cafeteira roxa e duas canecas |
| 16 | Geladeira de bebidas |
| 17 | Arvore em vaso escuro |
| 20 | Arbusto em vaso |
| 21 | Cavalete com grafico de barras |
| 22 | Relogio de parede |
| 23 | Luminaria de globos |
| 26-27 | Estante branca de livros |
| 26 | Planta em cima da estante |

---

## 4. O que muda no nosso mapa

| # | Hoje em `public/js/map.js` | Vira |
|---|---|---|
| 01 | Mesa = bloco 3x**2** (`rect(r, c, r+1, c+2)`), cadeira duas linhas abaixo | Mesa 3x**1**, cadeira na linha de baixo |
| 02 | Quatro mesas por fileira nas colunas 15, 20, 25, 30, com vao | **Tres** mesas coladas por fileira, ilha de 9x6 |
| 03 | Sala privativa = caixa 8x8, porta de 1 tile | Pod 5x5, porta de 2 tiles, janelao de 3, arvore no canto NE |
| 04 | Lounge espalhado em 11x14, com sofa cima e sofa baixo | Ilha 8x6 em composicao simetrica |
| 05 | Mesa de reuniao 5x2 dentro de sala fechada | Mesa 3x2 com 10 poltronas, **solta no hall** |
| 06 | Um huddle, no canto da Sala de Reuniao | **Quatro** huddles, um por canto, mesa redonda + 4 assentos |
| 07 | Lago retangular, pedra em cruz, poltrona nas laterais | Lago redondo com anel de pedra fechado, assentos em cima e embaixo |
| 08 | Copa = bancada + geladeira soltas no corredor | Sala fechada 5x6 |
| 09 | Recepcao = balcao no meio do corredor | Balcao no lobby, com tapete, sofa em L e poltronas |
| 10 | Corredor de 4 linhas entre as salas | Hall aberto de ~11 linhas; as areas de trabalho sao ilhas dentro dele |
| 11 | Mobilia alternada com trechos de parede nua | Parede coberta de ponta a ponta |

## Limite do levantamento

O print pega 37 x 23 tiles e o andar continua pra baixo e pra direita. O que
houver depois da coluna 30 e da linha 23 nao foi medido. As quatro salas
privativas sao identicas entre si na referencia.
