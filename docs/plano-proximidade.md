# Como a chamada por proximidade decide abrir

Tres problemas, achados testando com o bot (`/?bot=1`), e todos com a mesma
raiz: a proximidade era **so uma conta de distancia em linha reta**.

## 1. Abria de longe demais

Era `130px` pra entrar. Numa grade de 32px isso da **4,1 tiles** - e com o zoom
em 2x, meia tela de distancia. A chamada abria com gente que voce mal via.

Agora o alcance e medido em TILES, que e a unidade do mapa e da pra conferir
olhando: **3 tiles pra entrar, 4,5 pra sair**. A folga entre os dois continua
existindo pelo mesmo motivo de antes - sem ela a chamada pisca quando voce anda
em cima da borda.

## 2. Atravessava parede

O pior dos tres. Duas pessoas em salas diferentes, cada uma do seu lado do muro,
entravam em chamada - porque em linha reta estavam a dois tiles.

Agora a reta entre os dois e percorrida de quarto em quarto de tile, e se
encontrar **PAREDE ou JANELA** a chamada nao abre (e fecha, se ja estava aberta).

**So parede e janela cortam, movel nao.** Conversar por cima de uma mesa e a
coisa mais normal de um escritorio, e mesa e tile solido igual a parede: barrar
por "solido" calaria a sede inteira.

## 3. So um dos dois lados propunha

`updateProximity` roda no laco de desenho, e o navegador **congela esse laco em
aba de segundo plano**. A regra antiga dizia que so o lado de id menor propunha a
chamada. Entao, se justamente essa pessoa estivesse com a aba atras - alt-tab, o
tempo todo -, a chamada **nunca abria**, e nao havia como desconfiar do porque:
as duas ficavam lado a lado, camera ligada, e nada acontecia.

Agora qualquer um dos dois propoe. Os dois propondo junto nao e problema: o
`tratarSinal` ja resolvia colisao de ofertas desde antes (o de id maior desfaz a
propria e aceita a do outro). Essa regra continua sendo a que decide quem cede -
ela so deixou de ser tambem a que decide quem convida.

## De quebra: o volume cai com a distancia

Antes era liga/desliga. Agora e volume cheio ate 1,5 tile e vai sumindo ate zero
no raio de saida, como no Gather - a conversa aparece e some aos poucos em vez de
estourar de uma vez.

## E a conexao presa

Uma conexao que nasce e nunca conecta virava lixo que **bloqueava**: como
`peers.has(id)` continuava verdadeiro, a proximidade nunca tentava de novo. As
duas pessoas ficavam lado a lado sem chamada, pra sempre - so curava se alguem
se afastasse.

Acontece de verdade quando o outro lado recarrega a pagina no meio da
negociacao. Agora, depois de 12s sem conectar, o par e derrubado e a proximidade
refaz a chamada sozinha no quadro seguinte.

### ...mas nao pra sempre (20/09/2026)

Refazer no quadro seguinte curou o caso do recarregar - e criou outro: quem **nunca
atende** (aba parada, sem camera, atras de uma rede que nao passa) era recontactado a
cada 12 s, indefinidamente. Medido: ~30 conexoes fechadas em ~7 minutos pra dois
bonecos que nunca respondiam, cada uma com oferta, candidatos ICE e conexao nova.
Agora cada falha seguida com a **mesma pessoa dobra a espera**: 15 s, 30 s, 60 s, 120 s,
240 s, teto de 5 minutos. Zera quando a conexao **conecta**, ou quando a pessoa sai do
mapa (ou troca de id). Quem conectou e depois caiu (rede) reconecta na hora - nao e "quem
nunca atende". So a proposta e adiada: se a outra pessoa chamar, a oferta e respondida
como sempre. Um evento tardio de uma conexao ja trocada (o id e o mesmo) tambem nao
derruba mais a conexao nova. `testes/calls-tentativas.js`.

O `init` do jogo chega de novo a cada reconexao (servidor reiniciado, rede que volta), e
o `Calls.init` empilhava um ouvinte de sinalizacao e um clique por botao a cada volta - o
botao de microfone passava a "desligar e ligar". Agora ele so troca o id na volta.
`testes/calls-visitantes.js`.

## 4. Sala fechada manda mais que distancia

Depois dos tres acima, o que faltava do Gather: **area privativa**. A regra vale
nos dois sentidos, e o segundo e o que importa de verdade.

- **Os dois na mesma sala fechada** → conversam, e nao importa a distancia.
  Reuniao nao e proximidade: quem senta na outra ponta da mesa de conferencia
  participa igual a quem esta do lado.
- **Um dentro, outro fora** → **nao** conversam, e nao importa se estao a um
  passo um do outro. Sem isso da pra encostar do lado de fora da porta e cair na
  reuniao - e a Conferencia nem tem parede em volta.

Marcadas com `privativa: true` no mapa, nas duas copias. Sao oito: as quatro de
reuniao (Reuniao, Conferencia, Huddle, Treinamento) e as quatro privativas de uma
pessoa so (Diretoria, Financeiro, Projetos, Marketing).

Copa, lounge, recepcao, patio e o salao ficam de fora de proposito: sao lugares
de esbarrar em alguem, e ali proximidade e o comportamento certo.

Dentro de sala fechada o volume e cheio ponta a ponta - numa reuniao ninguem fala
mais baixo por estar na outra cabeceira.

## Resultado dos testes

Medido no jogo de pe, com o bot como segunda pessoa.

| O que | Resultado |
|---|---|
| Bot dentro da sala, Dev do outro lado da parede, **2 tiles** | chamada **nao** abre |
| Dev da a volta e entra na sala, 1,2 tiles | chamada abre, video chega |
| Dev com id MAIOR que o do bot, bot em aba de fundo | chamada abre (antes nao abria) |

E o volume, medindo enquanto se afasta:

| Distancia | Volume |
|---|---|
| 1,2 tiles | 1,00 |
| 1,9 tiles | 0,86 |
| 3,0 tiles | 0,51 |
| 5,1 tiles (com parede no meio) | chamada fechada |

A ultima linha merece nota: a chamada fechou antes dos 4,5 tiles porque havia
uma parede no caminho (tile 20,6). Conferido, nao e o raio errado - e a regra 2
funcionando.

E a sala fechada, com o bot parado no meio da Conferencia:

| Onde o Dev estava | Distancia | Chamada | Volume |
|---|---|---|---|
| Hall, colado na borda da sala | 2,0 tiles | **nao** | - |
| Dentro, do lado do bot | 2,0 tiles | sim | 1,00 |
| Dentro, canto oposto da sala | **10,8 tiles** | sim | 1,00 |

A primeira e a terceira linha juntas sao a regra inteira: dois tiles de distancia
nao bastam se voce esta do lado de fora, e dez tiles nao atrapalham se voce esta
dentro.

O `testes/mapa.js` guarda o dado: as duas copias do mapa tem que marcar as mesmas
salas como fechadas. Se so uma marcar, nada quebra - a reuniao simplesmente passa
a vazar pro corredor, calada.

---

## Terceira regra: o status da pessoa (12/09/2026)

### O bug

O botao de status (**Livre / Focado / Em reuniao**) existia desde cedo: pintava o
anel do avatar, aparecia no topo da tela, ia e voltava do servidor. E **nao era
consultado em lugar nenhum**. `grep -i status public/js/calls.js` dava zero
ocorrencias fora de comentarios sobre salas.

Na pratica, marcar "Em reuniao" nao impedia nada. Alguem passava perto e a
chamada abria no meio da reuniao. Botao que promete e nao cumpre e pior que botao
que nao existe: a pessoa confia nele e baixa a guarda.

### A regra

`deveFalarCom` agora recusa quando **qualquer um dos dois** nao esta `livre` -
nem interrompo quem esta focado, nem sou puxado pra conversa quando eu e que
estou.

Duas decisoes dentro disso:

**1. A sala fechada continua mandando mais.** A checagem de status vem DEPOIS da
sala. Entrar numa sala de reuniao e ato deliberado - quem cruza a porta quis
participar. Se o status travasse ali, a sala de reuniao ficaria muda justamente
quando todo mundo esta "em reuniao".

**2. `deveContinuarCom` NAO olha status.** Mudar o proprio status no meio de uma
conversa derrubaria a chamada na cara do outro, sem ele ter feito nada. O status
barra chamada **nova**; nao desliga a que ja esta acontecendo. Quem quer sair,
sai andando.

E a placa em cima da cabeca passa a mostrar o status quando ele nao e "Livre"
(`Bot · Em reuniao`). Sem isso, quem chegasse perto e nao caisse em chamada
concluiria que o app quebrou - o motivo precisa estar visivel antes de a pessoa
tentar.

### Resultado dos testes

`testes/proximidade.js` - 10 checagens, 0 falhas. Carrega o `calls.js` de verdade
num vm com o **mapa de verdade**, e nao um mapa de mentira: as paredes e as salas
fechadas sao as do escritorio. As duas regras saem expostas em `window.Calls` so
pra isso.

| O que | Resultado |
|---|---|
| dois livres coladinhos | conversam |
| o outro focado / em reuniao | nao abre |
| eu focado | nao abre |
| os dois ocupados | nao abre |
| **sem status nenhum** (bot, cliente antigo) | vale como livre - senao ficaria gente muda sem motivo |
| ja em chamada e mudo pra focado | **continua** |
| longe, os dois livres | nao abre |
| parede no meio | nao abre |
| mesma sala fechada, os dois "Em reuniao" | **conversam** (a sala manda) |

### No navegador, com o bot

O teste que fecha a questao, porque exercita os dois navegadores de verdade:

| Passo | Distancia | Status do bot | Chamada |
|---|---|---|---|
| bot entra perto, os dois livres | ~1 tile | Livre | abre (peers 1) |
| marco o bot como "Em reuniao" | ~1 tile | Em reuniao | **continua** - regra 2 |
| ando pra longe | 30 tiles | Em reuniao | cai (peers 0) |
| volto e fico colado 5s | **0,95 tile** | Em reuniao | **nao abre** (peers 0) |
| volto o bot pra "Livre", sem sair do lugar | 0,95 tile | Livre | **abre** (peers 1) |

As duas ultimas linhas sao o teste inteiro. A penultima sozinha nao provaria nada
- "nao abriu" tambem e o que se ve quando a chamada esta quebrada. E a ultima,
com o boneco parado no mesmo pixel e so o status mudando, que separa "barrou" de
"quebrou".
