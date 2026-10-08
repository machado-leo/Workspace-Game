# O mapa: como e montado e o que o guarda

O mapa vive em **duas copias** (`public/js/map.js` e `server/map.js`), mantidas
iguais na mao - nao ha bundler. `npm run teste` compara as duas; se divergirem,
quebra.

## A planta

**Planta compacta, desde 18/09/2026.** Mapa de 38x28 tiles com predio de 34x24 e
**16 mesas** (dois bairros de 8). A anterior tinha 48x32, predio de 44x29 e 32
mesas: pra quantidade de gente que fica online ao mesmo tempo, a tela mostrava
corredor e mesa vazia, e atravessar o predio levava ~9 s. No zoom minimo, a
compacta cabe quase inteira na tela.

O desenho, de cima pra baixo:

- **Faixa norte (linhas 3-9):** 2 cabines de chamada empilhadas (com o
  corredor 9-10 descendo ate o eixo), Sala de Reuniao (6 lugares), Huddle (4
  lugares) e a Copa e Lounge, aberta pro eixo. E um gradiente acustico: oeste
  quieto, leste barulhento.
- **Eixo (linhas 11-12):** o corredor leste-oeste que liga tudo.
- **Faixa sul (linhas 13-24):** Recepcao (a porta da rua e de vidro, na parede
  sul), os bairros **Foco** e **Projetos** em carpete lavanda, e a Biblioteca
  no canto sudeste, com parede cheia e porta (e sala silenciosa). A coluna 27 e
  corredor entre os bairros e ela: com a parede colada na ultima mesa, a regra
  do "movel encostado no muro" lia a mesa como parte da parede.

As medidas que valem em tudo, porque sao da referencia:

- **Mesa e 3x1 e a cadeira fica na linha de baixo**, com uma linha livre antes
  da proxima fileira.
- **Reuniao tem duas escalas.** Huddle = mesa redonda de 1 tile com um assento
  por lado. Sala de reuniao = mesa 3x2 com poltronas vermelhas dos dois lados.

### Mudou a planta? Suba a versao

O que e salvo por CELULA - decoracao, links, areas mexidas (`mapa.json`) e mesas
reivindicadas (`mesas.json`) - so faz sentido na planta em que foi feito. Por
isso `server/map.js` tem `VERSAO_PLANTA`: quando a planta muda de um jeito que
tira as coisas do lugar, **suba o numero**. No arranque, arquivo salvo com outra
versao sai do caminho - renomeado pra `mapa.json.planta-N`, e nao apagado - e a
sede comeca do zero nele. Reuniao marcada numa sala que deixou de existir tambem
fica de fora.

## Como decorar sem quebrar

Tres armadilhas ja aconteceram aqui, e as tres eram invisiveis: o servidor sobe,
o mapa desenha bonito, e so quem tenta andar descobre.

1. **Porta e vao sao de UM tile.** Portas: linha 10, colunas 15 (reuniao) e
   22 (huddle); linha 13, coluna 29 (biblioteca). Vaos: linha 10, colunas 9-10
   (corredor das cabines), e coluna 8, linhas 4 e 8 (cada cabine). Um vaso na
   frente de qualquer um deles sela a sala - ja aconteceu, com tres de uma vez.
2. **A volta em torno do predio e estreita** (2 tiles). Decoracao so na coluna
   ou linha DE FORA (0, 37, a linha 0 e a 27): sem passo na diagonal, um solido
   na de fora mais outro na de dentro, na linha seguinte, tranca a faixa.
3. **A porta da rua e o unico elo com o jardim**: parede sul, colunas 5 e 6.
   Sem ela o verde de fora inteiro fica sem ligacao com o predio.

`testes/mapa.js` cobre os tres: sala sem chao alcancavel, mesa sem onde sentar e
area grande ilhada. Rode antes de dizer que esta pronto.

> Hoje o mapa fecha em **zero** celula ilhada. O teto de 40 do teste e folga
> pra quem mexer; se passar disso, tem passagem entupida.

## Densidade

A referencia (`referencias/Captura de tela 2026-09-07 172652.png`) mostra um
escritorio **cheio**: quase nao ha parede sem estante, quadro ou planta. Quinze
tipos de movel existiam no codigo e nunca tinham sido usados no mapa - foi de
onde veio a passada de densidade, sem desenhar nada novo.

Por sala, o que a referencia mostra e o que foi aplicado:

| Sala | Referencia | Aqui |
|---|---|---|
| Salas da frente (172719) | quadro, planta de porte, armario | idem, com a peca de parede variando por sala |
| Corredor (172652) | parede continua de estante/quadro/planta | idem, alternando pra nao virar paredao |
| Lounge (172725) | estante no fundo, sofa, mesa redonda, **pufes** | idem, com 4 pufes e tapete redondo |
| Conferencia (172825) | mesa 3x2 com dez **poltronas vermelhas**, solta no salao | idem - e o unico ponto de cor forte do andar |
| Huddle (172815, 172804) | **mesa redonda** com um assento por lado | idem, e agora sao quatro salas assim |
| Lago (172749) | poca com pedra em volta e assento olhando pra ela | idem, pedra nas quinas e assento em cima e embaixo |
| Lobby (172839) | tapete de losangos, sofa e balcao de recepcao | idem, na faixa sul |

## Tiles novos

| Tile | Por que |
|---|---|
| `PUFE` (49) | o pufe e o que da cara de lounge, mais que o sofa. Assento caminhavel; a cor varia pela posicao |
| `MESA_REDONDA` (50) | as duas salas de huddle da referencia usam mesa redonda, nao retangular |
| `GELADEIRA` (51) | a copa da referencia (172742) tem geladeira de porta de vidro; as latas coloridas sao o que a identifica de longe |
| `AQUARIO` (52) | esta na sala de huddle (172815) |
| `LUMINARIA_PE` (53) | idem - a de globos, que da a luz quente do canto |

O **balcao** (`BALCAO`) ja existia sem uso e serve pros dois: e o balcao da
recepcao e a bancada da copa.

## Lobby e copa

Antes eles nao cabiam: o corredor tinha 4 linhas e viraram duas ilhas espremidas
dentro dele. Com o salao aberto da referencia sobrou espaco, e os dois viraram o
que sao na referencia - a **copa** e sala fechada de 5x6 na coluna oeste, e o
**lobby** e a faixa sul, com tapete de losangos, sofa e balcao de recepcao.

**A largura da arte tem que bater com a largura do movel no mapa.** A mesa
passou a ser 3x1 e a arte era de 2 tiles: o ladrilho repetia a coluna do meio e
saia mesa emendada torto. Quando a arte e mais larga ou mais alta que a celula,
o modo e `'alto'` - uma celula so desenha, e a peca inteira sai dela.

**`SOFA_CIMA` nao tem desenho proprio.** Quem pinta o sofa inteiro e
`SOFA_BAIXO` (arte de 3x2, em `'alto'`). Posto sozinho, `SOFA_CIMA` nao
aparece - o lounge ficou com um vao no lugar do sofa ate isso cair a ficha.

**Assento com desenho proprio precisa sair do ramo generico.** `POLTRONA` e
`PUFE` estao em `ASSENTOS`, e o ramo que desenha cadeira de escritorio pega tudo
que esta la - sem a excecao, o pufe saia como cadeira de escritorio.

**Movel de pe unico desenha o tampo ALTO na celula.** Centrado, o tampo cobre o
proprio pe e a mesa vira um ovo flutuando.


## Piso e fonte, medidos na referencia

**O tijolo do corredor era quatro vezes mais fino que o do Gather.** Medindo o
print `172839` com a cadeira de regua (1 cadeira = 1 tile = ~45px naquele zoom),
o tijolo dele tem **1 tile de largura por meio de altura**: 2 fiadas por tile e
junta vertical a cada tile. O nosso era 1/2 x 1/4 - quatro vezes mais tijolo na
mesma area, e dai a textura miuda e ocupada.

E ele e **chapado**. A nossa versao tinha junta escura, luz na quina de cima e
sombra na de baixo: com as tres, o tijolo virava azulejo de banheiro biselado.
Ficou junta quase do tom da base e um fio de luz so.

**A fonte passou de Manrope pra Inter.** Manrope e geometrica e de cara propria;
a referencia usa uma sans neutra de interface. Vale pro CSS e pros textos
desenhados no canvas (nome de sala, plaquinha da mesa, balao de contexto).

**E o nome da sala saiu do pre-render.** Trocar a familia nao bastava: a
etiqueta era assada no canvas do mapa em `RENDER_SCALE` e depois reduzida na
hora de desenhar. Com o alisamento desligado - que e o que mantem a arte
pixelada - o texto vinha serrilhado, e nenhuma fonte ia salvar isso. Na
referencia o nome da sala e texto de INTERFACE, nitido. Agora ele e desenhado na
camada viva, onde o rasterizador da fonte trabalha no tamanho final da tela.

> A regra geral: arte vai pro pre-render, texto vai pra camada viva. A plaquinha
> da mesa e o balao de contexto ja estavam certos.


## Comparacao peca a peca com a referencia

Feita olhando cada movel ao lado do print correspondente. Sete estavam
diferentes de um jeito que da pra apontar:

| Peca | Estava | Referencia | Print |
|---|---|---|---|
| Sofa | sem braco - lia como balcao estofado | braco fechando cada ponta | 172725 |
| Banco | azul | ripa de MADEIRA | 172725, 172749 |
| Poltrona | bloco marrom chapado | encosto alto e um braco de cada lado | 172815 |
| Pufe | pequeno, cara de almofada | ocupa quase o tile, do porte de uma poltrona | 172725 |
| Cadeira vermelha | cadeira de escritorio pintada de vermelho | **poltrona** vermelha, sem pe de estrela | 172825 |
| Mesa de centro | disco chapado no chao | borda grossa e pe aparecendo | 172725 |
| Mesa de reuniao | madeira | branca | 172825, 172704 |

Cadeira de escritorio, estante e armario ja batiam.

**Poltrona virou uma arte so** (`poltronaEstofada`), com direcao, servindo pra
`POLTRONA` e pra familia `CADEIRA_VERMELHA`. Sao a mesma peca em cores
diferentes - manter duas artes seria manter dois lugares pra errar.

**Movel de pe unico desenha o tampo alto na celula** (mesa de centro e mesa
redonda). Centrado, o tampo cobre o proprio pe e a peca vira um disco no chao.
