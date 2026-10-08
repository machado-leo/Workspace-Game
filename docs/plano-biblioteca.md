# Biblioteca: o estudo e a planta

Escrito em 13/09/2026. Pedido do Caio: criar uma biblioteca ao lado da copa,
estudando arquitetura de ambientes e o projeto da fachada. Complementa o
[plano-redesenho.md](plano-redesenho.md) - a escala (1 tile = 0,5 m) e o metodo
de planejar no modulo do movel vem de la.

---

## 1. O que a pesquisa diz

### 1.1 Zoneamento: a biblioteca e a ponta silenciosa

Guias de projeto de biblioteca separam atividade por **necessidade acustica**:
estudo silencioso longe da zona social. Em escritorio corporativo o mesmo
conceito aparece como **"library zone"**: area compartilhada com regra explicita
de nao conversar e nao receber notificacao, igual sala de leitura de
universidade - o silencio coletivo e o que faz todo mundo concentrar.

**O conflito de programa, dito de cara:** o pedido e ao lado da copa, e a copa e
a ponta BARULHENTA do gradiente acustico da sede. Biblioteca colada em copa e o
erro exato que os guias mandam evitar. A planta resolve com tres camadas:

1. **Parede cheia** entre as duas, sem porta. A entrada da biblioteca e pelo
   eixo de circulacao, no canto oposto ao da copa.
2. **O acervo no meio**, entre a porta e a zona de leitura. Estante cheia de
   livro e absorvedor de som citado nominalmente nos guias de acustica de
   biblioteca, junto com estofado e piso macio.
3. **Regra de silencio no jogo**: dentro da biblioteca a chamada por
   proximidade nao abre, e quem entra nela em chamada sai da chamada. A copa
   pode fazer o barulho que quiser.

### 1.2 Luz: norte, lateral e em camadas

- Sala de leitura prefere **luz do norte**: difusa, sem sol direto, sem
  ofuscamento. Janela a sul e a oeste precisa de brise ou persiana.
- A mesa de leitura fica **perto da janela, com a luz vindo de lado** - nao no
  caminho do sol, e nao de frente pro olho.
- Iluminacao em **tres camadas**: geral, de tarefa (luminaria de leitura) e de
  destaque na lombada.
- Referencia de intensidade: **300-500 lux** no tampo da mesa de leitura,
  150-200 lux no corredor de estante.

### 1.3 Estante e circulacao

- Estante na **perimetro**, baixa no meio: estante alta no meio da sala corta a
  linha de visao e vira parede.
- Corredor entre estante e movel: **no minimo 36" (0,91 m), recomendado 42"
  (1,07 m)** - o padrao de acessibilidade para corredor de acervo.
- Area de acervo: **1,2 a 1,5 m² por 1.000 volumes**.

### 1.4 Variedade de assento e material

- **Mais de um tipo de lugar**: mesa pra quem estuda com caderno aberto,
  poltrona pra quem so le. Um guia resume como "diferentes humores, tarefas e
  jeitos de colaborar".
- **Menos e mais**: pouca cor, pouco padrao, nada acumulado - editar o ambiente
  continuamente em vez de somar coisa.
- **Biofilia**: planta, madeira e luz natural. Estudo com 7.600 pessoas em 16
  paises: ambiente com elemento natural rendeu 15% mais bem-estar e 6% mais
  produtividade.

---

## 2. Onde ela cabe

No lugar do **jardim interno**, ao lado da copa (colunas 29-35). Primeiro ela
ficou so com a metade norte e o jardim virou antessala; depois o Caio pediu pra
tirar o verde e fazer tudo biblioteca. Ficou com os 7x11 tiles inteiros.

A copa **nao foi redesenhada**. Perdeu so as tres pecas que moravam na coluna
36, que virou a parede entre as duas: a geladeira da ponta oeste (sobrou a da
leste), um vaso e o vaso alto do canto de baixo.

---

## 3. A planta

Interior de 7 x 11 tiles = **3,5 m x 5,5 m ≈ 19 m²**.

O zoneamento de dentro segue a regra de biblioteca: **do barulho pro silencio,
da porta pro fundo**. E o fundo e a fachada norte envidracada, que e onde a
leitura quer estar.

```
        col  29   30   31   32   33   34   35   36
   linha 2   ##   [J]  [J]  [J]  [J]  ##   ##   ##     fachada norte
         3   pl   .    .    .    ~~   ~~   ~~   ##     faixa de luz / tapete      LEITURA
         4   .    MM   MM   MM   ~~   lu   po   ##     mesa / canto de poltrona
         5   cd   MM   MM   MM   ce   ~~   ~~   ##
         6   .    c    c    c    .    .    .    ##     tres lugares pra janela
         7   .    .    .    .    .    .    .    ##     corredor
         8   .    .    .    .    .    .    .    ##
         9   .    EE   EE   EE   EE   EE   .    ##     fileira de estante         ACERVO
        10   .    .    .    .    .    .    .    ##     corredor
        11   .    .    .    .    .    .    .    ##
        12   .    EE   EE   EE   EE   EE   .    ##     fileira de estante
        13   .    .    .    .    .    .    pl   ##     entrada                    ENTRADA
        14   []   ##   ##   ##   ##   ##   ##   ##     [] porta pro eixo

   ## parede    ~~ tapete verde    MM mesa    c/cd/ce cadeira de madeira
   po poltrona de couro verde    lu luminaria de pe    EE estante    pl planta
```

| Zona | O que tem | Principio aplicado |
|---|---|---|
| Faixa de luz (linha 3) | so uma planta no canto | a mesa nao encosta na janela: a luz chega de cima e de lado |
| Mesa de leitura | mesa de madeira 3x2 sob a janela, 5 cadeiras de madeira | lugar de estudo, com luz natural |
| Canto de leitura | poltrona de couro verde, luminaria de pe, tapete | segundo tipo de assento; luz de tarefa |
| Acervo | duas fileiras de 5 estantes, soltas das paredes | as colunas 29 e 35 livres dao a volta nas duas |
| Corredores | linhas 7-8 e 10-11 livres | **2 tiles = 1,0 m**, acima dos 0,91 m minimos |
| Entrada | porta no canto oeste da parede sul | da porta, a vista corre pela coluna 29 ate a janela |
| Silencio | `silenciosa: true` no mapa | a chamada por proximidade nao abre la dentro |

**Estante no meio da sala e a unica concessao ao tileset.** Os guias pedem
estante na perimetro e baixa no meio, pra nao cortar a linha de visao. Aqui a
estante do pacote so existe alta, e so fica em fileira no sentido leste-oeste -
de pe no sentido norte-sul, a arte de uma sobe por cima da outra. A resposta foi
deixar as fileiras curtas e soltas dos dois lados, e por a porta alinhada com o
corredor lateral: a estante tapa o acervo, nao o caminho.

**A regra de silencio**, que e o que faz a sala ser biblioteca de verdade e nao
so desenho: dentro dela a chamada nao abre, nem com duas pessoas coladas, e quem
entra nela em chamada sai da chamada. E o contrario da sala de reuniao, onde
todo mundo la dentro conversa. Coberto pelo `testes/proximidade.js`.

Materiais: **madeira escura** no piso, madeira nas cadeiras, couro verde na
poltrona, tapete verde. Nenhuma cor forte fora dos livros.

**Clicar numa estante abre o acervo.** E a estante voltando pro unico lugar da
sede onde ela tem motivo de existir.

---

## Fontes

- [10 Steps to a Better Library Interior — MSR Design](https://msrdesign.com/resources/10-steps-to-a-better-library-interior/)
- [How to Design a Library: A Complete Guide to Zoning, Lighting & Acoustics — Kaarwan](https://www.kaarwan.com/blog/architecture/architects-guide-how-to-design-libraries?id=103)
- [Interior Design Factors in Library Facilities — ERIC ED174207](https://eric.ed.gov/?id=ED174207)
- [Aisle Width in Libraries — UpCodes](https://up.codes/s/aisle-width-in-libraries)
- [1991 ADA Standards for Accessible Design, cap. 8: Libraries](https://www.corada.com/documents/1991ADAStandards/chapter_8)
- [Good Reading Light: Visual Comfort Perception and Daylight Integration in Library Spaces](https://www.researchgate.net/publication/321719388_Good_Reading_Light_Visual_Comfort_Perception_and_Daylight_Integration_in_Library_Spaces)
- [Libraries and reading rooms — Fagerhult](https://www.fagerhult.com/knowledge/light-guides/schools-and-learning-environments/libraries-and-reading-rooms/)
- [6 Office Design Trends Reshaping the Workplace in 2026 — Gable](https://www.gable.to/blog/post/office-design-trends)
- [Design Trends for the Private Office in 2026 — TechBullion](https://techbullion.com/design-trends-for-the-private-office-in-2026/)
