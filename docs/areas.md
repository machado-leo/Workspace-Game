# Areas: mover, redimensionar, criar e apagar

Como a "area" do Gather: cada sala da sede e um retangulo com nome, e a
diretoria arrasta esse retangulo pra mudar de lugar e puxa a borda ou a quina
pra mudar o tamanho, como se fosse uma foto. Tambem cria area nova, renomeia,
troca o piso e apaga a que criou. Muda na hora pra todo mundo que esta na sede,
e fica salvo.

Codigo: `public/js/areas.js` (o editor), `public/js/map.js` (regra e aplicacao
no cliente), `server/mapa-editado.js` (regra que vale e gravacao), evento
`mapa-area`, `mapa-area-nova` e `mapa-area-apagar` no `server/index.js`. Teste de
ponta a ponta: `testes/areas.js`.

## O que a area decide (e por isso anda junto)

- **Como se ouve ali dentro** - a regra de som, que agora e de CADA area e a
  diretoria muda no proprio editor. Ver a secao abaixo.
- **Piso**: o carpete dos bairros, o ladrilho das salas de reuniao, a madeira da
  recepcao. Diminuiu a area, o carpete diminui junto; o que sobra vira corredor.
- **Etiqueta** com o nome, **Visao de salas** e **minimapa**.
- **Modelo de cadeira** (cadeira comum na copa, de escritorio nos bairros).
  Cadeira de frente pra mesa de trabalho e sempre a de escritorio, em qualquer
  area - senao as mesas que ficam fora de uma area diminuida ganhariam cadeira
  de copa.

## A regra de som de cada area

O pedido que deu origem a isto: *"a distancia que a pessoa tem que estar uma da
outra... na sala de reuniao tem que ser o tamanho dela, na cabine o tamanho
dela"*. Entao a distancia deixou de ser um numero so pro escritorio inteiro:
cada area tem a sua, e quem escolhe e a diretoria, na mesma aba onde move e
redimensiona.

| Regra | O que acontece | Onde vale hoje |
|---|---|---|
| **A sala toda** | Quem esta dentro conversa com quem esta dentro, em qualquer canto - e ninguem de fora entra, nem colado na porta. O alcance E o tamanho da area. | Reuniao (7x7), Huddle (6x7), Cabines (5x3) |
| **So quem esta perto** | O de sempre: conversa quem chega a ate N tiles, sem parede no meio. O N e da area. | Copa 6 tiles, Foco 2, Projetos e Recepcao 3, corredor 3 |
| **Ninguem (silencio)** | A chamada por proximidade nao abre ali. | Biblioteca |

Detalhes que valem a pena saber:

- **Entre duas areas, vale o alcance MENOR.** Quem esta no Foco leva o silencio
  do Foco pra conversa; senao alguem parado no corredor puxaria pra chamada
  justamente quem foi pro Foco pra nao ser puxado.
- **O volume acompanha**: numa area de alcance curto o som some mais cedo, em
  vez de cair de uma vez quando a pessoa passa do limite.
- **Chamada marcada ganha de tudo** (menos de nada): quem entrou numa reuniao
  pelo calendario continua nela em qualquer canto do mapa, ate na biblioteca.
- **Marcar reuniao** so acontece em area de som "a sala toda" que tenha mesa de
  sentar em volta (`server/reunioes.js`) - transformar uma area em sala fechada
  ja a habilita pro calendario.
- O alcance vai de **1 a 12 tiles**. Numero fora disso e recusado, e nao
  arredondado calado.

Quem quiser conferir sem duas pessoas e duas cameras: `testes/proximidade.js`
exercita as regras de verdade contra o mapa de verdade.

## Criar, renomear e apagar area

O botao **+ Area nova**, embaixo da lista, cria um quadrado livre (4x4, ou 3x3 e
2x2 se nao couber) **o mais perto de quem clicou**, e a camera vai ate ele. Dali
e o gesto de sempre: arrasta o meio, puxa a borda.

Com a area escolhida, o painel mostra tambem:

- **Nome** - vai pra etiqueta do mapa, pra Visao de salas e pro minimapa. Quebra
  de linha e espaco em fila somem (o canvas nao "colapsa" espaco como o HTML), e
  o que vai pra todo mundo ja e o nome limpo. Ate **24 letras**.
- **Piso** - os nove que o desenho conhece: corredor, ladrilho, carpete roxo e
  azul, madeira, madeira clara, espinha de peixe, cimento e grama. Piso de nome
  desconhecido cairia no tijolo calado, entao a lista e fechada.
- **Apagar** - so aparece na area que a diretoria criou.

Decisoes que mudam o comportamento:

- **So apaga area criada.** As de fabrica tem piso e movel desenhados pra elas;
  pra "sumir" com uma, a diretoria diminui. O nome e o piso de uma de fabrica
  podem mudar, e **Voltar ao original** devolve tudo (retangulo, som, nome e
  piso).
- **O id nasce no servidor** (`area-<hora>-<n>`). Dois navegadores criando ao
  mesmo tempo mandariam o mesmo id, e a segunda area viraria edicao da primeira.
- **No maximo 24 areas** (as de fabrica contam - sao 11). Nao e limite de
  memoria: com muito mais a Visao de salas e o minimapa viram sopa de etiqueta.
- **Reuniao marcada barra o apagar.** Uma area "sala fechada" com mesa de reuniao
  recebe reuniao pelo calendario; apagar com reuniao futura la deixaria ela
  apontando pra uma sala que nao existe. A diretoria e avisada
  (*"Tem 1 reuniao marcada nessa area. Desmarque antes de apagar."*), desmarca, e
  ai apaga.
- **A area nova nasce vazia**, com a regra de som "so quem esta perto" (3 tiles),
  piso corredor e nome "Area nova". Movel e parede sao das outras abas. Cadeira
  colocada la e a de escritorio, o padrao: o modelo de cadeira por sala
  (`sprites.js`) so existe pras de fabrica.

## O que NAO anda junto

**Parede e movel.** Igual ao Gather: a area e uma camada por cima da planta. Pra
mudar a parede ou tirar mesa, sao as outras abas do decorador (Estrutura,
Borracha...). Tambem ficam onde estao os **tapetes** (sala de reuniao,
biblioteca) e a **soleira** da porta - sao como movel.

## Como usar

1. **Decorar** (so aparece pra diretoria) > aba **📐 Areas**.
2. Escolha a area na lista (a camera vai ate ela) ou clique nela no mapa.
3. **Arraste o meio** pra mudar de lugar; **puxe a borda ou a quina** pra mudar
   o tamanho. Tudo encaixa nos tiles. Com a area escolhida, o painel mostra
   tambem **como se ouve ali dentro** - e so trocar.
4. Soltou, salvou. Se nao pode (em cima de outra area, por exemplo), o
   retangulo fica vermelho durante o arraste, a area volta pro lugar e o motivo
   aparece no painel.
5. **Esc** desfaz o arraste em andamento (ou solta a selecao). **Voltar ao
   tamanho original** poe a area de volta na planta de fabrica.

Enquanto o editor esta aberto, clicar no mapa nao anda com o boneco.

## As regras (as mesmas no cliente e no servidor; quem decide e o servidor)

| Regra | Por que |
|---|---|
| So a diretoria | como o resto do decorador; o botao escondido e so conforto, a checagem que vale e a do servidor |
| Area nao fica em cima de outra | a pessoa estaria em duas salas ao mesmo tempo, e a chamada fechada de uma vazaria pra outra |
| Dentro do mapa, no minimo 2x2 | area de 1 tile nao cabe gente |
| `hall` e `jardim` nao se editam | sao o fundo, que pega o que nenhuma area cobre |
| Voltar ao original tambem passa pela regra | outra area pode ter ido pro lugar dela; ai recusa com o nome de quem esta la |
| Nome: 1 a 24 letras, sem quebra de linha | vai pra etiqueta e pro minimapa; o servidor limpa e devolve o nome ja limpo |
| Piso so da lista fechada | um nome que o desenho nao conhece cairia no tijolo, calado |
| No maximo 24 areas | a Visao de salas e o minimapa deixam de se ler |
| So apaga area criada, e sem reuniao marcada | as de fabrica tem piso e movel; a reuniao ficaria orfa |

## Onde fica salvo

`DATA_DIR/mapa.json`, chave `areas` - as de fabrica so quando sairam do lugar (ou
mudaram de regra, nome ou piso), e as **criadas pela diretoria por inteiro**,
marcadas com `criada: true` (nao ha "de fabrica" pra onde voltar). Fica ao lado
da decoracao (`mudancas`, `objetos`, `conteudos`). Cada sede tem a sua pasta de
dados, entao **cada cliente ajusta a planta da propria sede** sem mexer na dos
outros (docs/varias-sedes.md).

No arranque o arquivo e conferido **inteiro**, e nao area por area: uma area
pode ter ido pro lugar que outra deixou livre, e lendo uma de cada vez a
primeira bateria na posicao velha da outra. Se o conjunto nao fecha (arquivo
editado a mao com uma area em cima da outra), fica a planta de fabrica e o log
diz por que.

As areas **criadas entram no mapa antes dessa conferencia** (as de fabrica podem
ter saido do lugar justamente pra caber ao lado delas). Por isso, se o arquivo
nao fecha, elas **saem junto**: ficar seria subir a sede com uma sala fantasma
que ninguem pode apagar. `testes/areas.js` guarda isso, e guarda tambem que um id
fora do formato que o servidor gera (o arquivo pode ter sido editado a mao, e o
id viaja pra todos os navegadores) nao entra.

## O que ainda nao faz

- Apagar uma area **de fabrica** (ver acima: piso e movel desenhados pra ela).
- Escolher a **cor** da etiqueta: a area nova sai com uma de uma lista, e a de
  fabrica mantem a sua.
- Desfazer varias vezes (so existe o "voltar ao tamanho original").
- Arrastar pelo celular (o gesto e de mouse; no celular a diretoria usa o
  computador pra isso).
