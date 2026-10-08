# Redesenho da sede: planta e mobilia

Escrito em 12/09/2026. Pedido do Caio: estudar arquitetura e design de interiores
de verdade, usar conceitos atuais, trocar a mobilia desenhada a mao pela do
pacote, e replanejar as paredes.

> **A mesa fica.** Decisao do Caio, e esta certa: `MESA` / `MESA_MONITOR` e as
> seis variantes de direcao nao sao so desenho, sao o sistema de mesa pessoal
> inteiro (`celulasDaMesa`, `tampoAte`, item apoiado, reivindicar/largar). Foi
> exatamente trocar isso que quebrou tudo da outra vez - a arte do pacote e 3x2
> e a nossa mesa e 3x1, entao o tampo subia uma linha e a mesa visivel deixava
> de ser clicavel.

---

## 1. O que a pesquisa diz (fontes no fim)

### 1.1 Trabalho por atividade (ABW)

O andar deixa de ser dividido por hierarquia e passa a ser dividido por
**tarefa**. O conjunto minimo que a literatura de 2026 repete e:

- postos de foco
- pontos pequenos de colaboracao
- salas de reuniao reservaveis
- **cabines de chamada / zona silenciosa**
- assentos de passagem (*touchdown*)
- espaco social

Nossa sede tem os tres primeiros e o social. **Nao tem cabine de chamada nem
assento de passagem** - e sao justamente os dois que um escritorio virtual mais
usa, porque todo mundo ali esta em chamada.

### 1.2 Bairros (*neighborhoods*)

Cada time ganha uma zona-casa, com **identidade visual propria** pra pessoa se
localizar, e as comodidades ficam compartilhadas por perto.

Aqui isso ja existe pela metade: as salas tem nome e cor, mas por dentro sao
todas iguais - mesmo piso, mesma mobilia, mesma parede. Identidade visual de
bairro e piso e parede diferentes, nao so uma etiqueta.

### 1.3 Zoneamento acustico

E o conceito que mais importa pra nos, porque **a gente ja implementou o
mecanismo sem ter desenhado o espaco pra ele**: `calls.js` tem proximidade,
parede que bloqueia som e sala fechada. Isso e zoneamento acustico literal.

A regra de adjacencia da literatura: **nao encoste duas zonas barulhentas uma na
outra**; alterne barulhenta com silenciosa. Hoje a nossa Copa (social, barulhenta)
fica colada na sala Time (foco). Isso e exatamente o erro que os guias mandam
evitar.

### 1.4 Proporcao de area

Os numeros que os guias de planejamento repetem:

| Medida | Referencia |
|---|---|
| Postos de trabalho | **40-50%** da area do andar |
| Circulacao livre | **no minimo 20%**, e nao muito mais |
| Escritorio em grupo | **10-12 m² por pessoa** |
| Open space | 12-15 m² por pessoa |
| Corredor (menos de 50 pessoas) | minimo **915 mm** |

---

## 2. Quanto mede um tile aqui

Nao da pra aplicar metro quadrado sem ancorar a escala, e nao vou chutar.

A ancora sai da **mobilia**, nao de suposicao: a cadeira de uma pessoa ocupa
1 tile, e uma cadeira de escritorio tem ~0,5 m de lado. A mesa de uma pessoa
ocupa 3 tiles de largura, e uma mesa de trabalho tem ~1,6 m.

```
0,5 m / 1 tile   e   1,6 m / 3 tiles = 0,53 m por tile
```

**1 tile ≈ 0,5 m.** Entao o andar de 48x32 tiles = **24 m x 16 m = 384 m²**.
(Historico: em 18/09/2026 a planta foi compactada pra 38x28, com 16 mesas - ver
[mapa.md](mapa.md). O partido de eixo e o gradiente acustico daqui continuam.)

---

## 3. O diagnostico, com numero

Medido em `server/map.js`, nao a olho:

| O que | Hoje | Referencia | Veredito |
|---|---|---|---|
| Andar | 1536 tiles² (384 m²) | - | - |
| Celulas de mesa | **48** (3% do andar) | 40-50% | **13x abaixo** |
| Celulas solidas (qualquer movel) | 386 (25%) | - | o resto e chao vazio |
| Chao caminhavel | **75%** | ~20% de circulacao | **3,5x acima** |
| Area por posto | **24 m²/pessoa** (16 mesas) | 10-12 m² | **2x acima** |
| "Hall" | **968 tiles² = 63% do andar** | - | e o cesto de tudo que nao virou sala |

### O que isso quer dizer

O interior nao esta ruim so por causa da arte. **As proporcoes estao erradas por
um fator de 2 a 3.** E um galpao com movel espalhado dentro, e nenhuma arte
conserta galpao - trocar a textura de um corredor vazio de 20 metros so entrega
um corredor vazio bonito.

A sala "Time" com 24x8 e o sintoma mais visivel, mas o problema de verdade e o
**Hall de 968 tiles²**: quase dois tercos do andar sao circulacao sem funcao.

### A conclusao de projeto

Com 384 m² e a referencia de 10-12 m² por pessoa, este andar comporta
**30 a 38 postos**. Tem 16.

Entao a correcao **nao e encolher o mapa** - e ocupa-lo. Mais postos, mais
zonas, e o Hall reduzido a um eixo de circulacao de verdade em vez de uma praca.

---

## 4. O metodo: planejar no modulo do movel

Descoberto medindo as folhas, e muda tudo: **a arte do pacote vem em modulos**,
nao em celulas soltas. O balcao e uma bancada de 2 tiles de frente por 4 de
altura. O armario e 2x2. A mesa de reuniao e um tampo de 3x1. A estante e 2x3.

Hoje o mapa poe `BALCAO` de um tile em um tile, e por isso nenhuma bancada do
pacote encaixa - a arte teria que ser esticada ou cortada no meio.

Entao a regra do redesenho e: **o mapa se ajusta ao modulo do movel, e nao o
contrario.** Isso nao e uma concessao ao pacote; e como se planeja espaco de
verdade - o arquiteto desenha em cima da malha do mobiliario que vai comprar,
nao inventa uma malha e depois manda serrar os moveis.

## 5. A direcao de interiores

A pesquisa de 2026 converge em **"resimercial" / minimalismo quente**:
funcionalidade de escritorio com a materialidade de casa. Paleta de neutros
quentes (taupe, bege, creme), madeira natural, textura, e forma arredondada no
lugar da quina dura.

O que a sede tem hoje - **carpete roxo com parede cinza-azulada** - e escritorio
de 2010. E o oposto exato da direcao atual.

### Paleta de chao escolhida (ja no `sprites.js`, ja conferida sem costura)

| Nome | Folha | Onde |
|---|---|---|
| `tijolo` | tile-a | eixo de circulacao (creme, o que ja havia) |
| `madeira` | wood-floor-a c4 | bairros de trabalho |
| `madeira_clara` | wood-floor-a c3 r3 | recepcao e zonas claras |
| `madeira_escura` | wood-floor-a c0 | salas de reuniao |
| `espinha` | herringbone-a c2 | lounge e social (carvalho) |
| `espinha_fria` | herringbone-a c0 | cabines de chamada |
| `tapete_verde` / `_terra` / `_azul` | geometric-carpet-c | **ilhas**, nunca parede a parede |

Carpete de medalhao cobrindo salao inteiro vira salao de castelo. Como **ilha**,
e o jeito que escritorio de verdade marca zona sem levantar parede.

## 6. O programa

Com 384 m², a referencia de 10-12 m²/pessoa e as razoes de sala:

| Zona | Quantidade | De onde sai o numero |
|---|---|---|
| Postos de trabalho | **~32** | 384 m² / 12 m² por pessoa |
| Salas de reuniao | **2 a 3** | 1 sala para cada 10-20 pessoas |
| ...das quais pequenas (2-6 lugares) | **60% ou mais** | 80% das reunioes tem 6 pessoas ou menos |
| Cabines de chamada | **2 a 3** | 1 para cada 10-15 pessoas, contadas a parte |
| Social / copa | 1 | - |
| Assentos de passagem | 1 nucleo | zona que falta hoje |

### Partido: eixo de circulacao, e nao praca central

O erro de hoje e ter um vazio central de 968 tiles² chamado "Hall". A literatura
trata circulacao como **espinha**: uma rota principal que costura entradas,
nucleo, reuniao e servico, e da qual o programa pendura dos dois lados.

Entao:

- **Eixo leste-oeste** atravessando o andar, com largura de 3 tiles (~1,5 m, bem
  acima do minimo de 915 mm) - duas pessoas se cruzam sem desviar.
- **Norte**: as salas fechadas, que precisam de parede de qualquer jeito, e o
  jardim visivel do eixo (luz e vista, principio biofilico).
- **Sul**: os bairros de trabalho, em ilhas de piso.
- **Gradiente acustico ao longo do eixo**: foco no extremo oeste, reuniao no
  meio, social e copa no extremo leste. A regra e nunca encostar zona barulhenta
  em zona de foco - e hoje a Copa esta colada na sala Time, que e o erro exato
  que os guias mandam evitar.

## 6. Resultado

(medicoes depois de pronto)

---

## Fontes

- [The complete office floor plan design guide for hybrid offices in 2026 — OfficeSpace](https://www.officespacesoftware.com/blog/modern-office-floor-plan/)
- [6 Types of Office Layouts: Engineer Them for Productivity — YAROOMS](https://www.yarooms.com/blog/6-types-of-office-layouts-engineer-them-for-productivity)
- [Office Design Trends 2026: Workplace, Furniture, & Space Planning — Skutchi Designs](https://www.skutchi.com/office-design-trends-modern-workplace/)
- [10 Space Planning Best Practices for 2026 — Cubicle by Design](https://cubiclebydesign.com/space-planning-best-practices/)
- [Office Space Layout: The Complete Guide to Optimal Office Planning 2026 — anny](https://anny.co/en/blog/office-layout-guide-complete-guide-for-optimal-office-planning-2026)
- [Open Office Layout Standards & Clearances 2025 — Arcedior](https://arcedior.com/blog/open-office-layout-standards-clearances-2025)
- [Acoustic Zoning — Vantage Space](https://www.vantagespace.com/en-cl/glossary/space-planning-layout-principles/acoustic-zoning)
- [Acoustic Zoning Office Refurbishment Guide 2026 — Soundbox Store](https://soundboxstore.com/en-us/blogs/articles/how-to-plan-acoustic-zoning-office-refurbishment)
