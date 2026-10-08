# Reunioes internas da sede

Marcar uma reuniao da ADM na propria sede: titulo, quando, e em qual sala. Ela
fica guardada, aparece na agenda de todo mundo e o aviso vai pro #geral.

## A decisao que define tudo: a chamada NAO depende de lugar

A primeira versao disto prendia a reuniao a uma sala: "entrar" levava a pessoa
ate a Sala de Reuniao e a chamada acontecia por proximidade. O Caio derrubou com
o caso obvio:

> "nao quero ir para uma sala, a ligacao tem que ser um sistema que possa
> funcionar em qualquer canto, pq vai que a sala de reuniao esta cheia"

E ele esta certo, por dois motivos que valem os dois: a sala pode estar ocupada,
e ninguem deveria ter que largar o lugar onde esta trabalhando por quinze
minutos de reuniao.

Entao a chamada virou uma **sessao**. Quem entra fala com quem tambem entrou,
esteja onde estiver no mapa - do outro lado do escritorio, com parede no meio,
dentro da biblioteca. A chamada por PROXIMIDADE continua existindo por baixo,
intacta, pra conversa de corredor. As duas convivem, e quem decide e o
`public/js/calls.js`.

A sala continua na reuniao, mas como **informacao** ("e na Sala de Reuniao") e
nao como requisito: quem quiser se juntar fisicamente vai; quem nao puder, entra
de onde esta.

### A regra, em uma linha

Na mesma chamada marcada -> conversa. E so. Essa e a unica regra do sistema que
ignora o mapa inteiro: distancia, parede, sala, status. Ela pode fazer isso
porque entrar numa chamada dessas e um ato DELIBERADO - a pessoa clicou em
"entrar". Por isso ela ganha ate da biblioteca silenciosa: quem entrou na
reuniao e foi buscar um livro continua na reuniao.

O id diz de onde a chamada veio, e e ele que faz duas pessoas caírem na mesma
sessao sem combinar nada:

    reuniao:12    a reuniao 12 da agenda
    canal:geral   o grupo #geral do chat

O TITULO e resolvido no servidor, contra a agenda e a lista de canais - nunca vem
do cliente. Ele aparece na tela de todo mundo que esta na chamada, e aceitar
texto de fora seria deixar qualquer um escrever ali. Mesma licao do titulo do
livro em docs/estante.md.

## Ligar pro grupo

No topo de cada canal do chat tem um botao **Ligar**. Ele comeca a chamada do
grupo e **convida** o canal - nao arrasta ninguem pra dentro. Chamada que comeca
sozinha no ouvido dos outros e o tipo de coisa que faz a pessoa desligar o app.

O convite vira uma mensagem no canal com um botao **Entrar** nela. Sem esse
botao a pessoa leria "tem chamada rolando" e nao teria pra onde clicar.

So aparece em CANAL, nao em DM: ligar pra uma pessoa so e chegar perto dela no
mapa, que e o que a sede ja faz. Chamada marcada existe pra juntar GRUPO.

## A barra de "voce esta no ar"

Fica em cima, no meio, por cima do mapa - porque a pessoa continua andando pela
sede durante a chamada e precisa saber que esta no ar sem abrir painel nenhum.
Diz o titulo, quantos MAIS estao ("voce e mais 2" - ela ja sabe que ela esta) e
tem o botao de sair.

## Por que nao e o Google Agenda

A aba Agenda mostra o Google de cada pessoa, e isso continua. Mas a sede so **le**
do Google, de proposito (`docs/plano-calendario.md`): ela nunca escreve na agenda
de ninguem. Entao nao havia como marcar uma reuniao DA SEDE - e reuniao interna e
justamente a que nao precisa de convite nem conta Google. (Quem e de FORA da sede -
cliente, candidato - entra pelo link da reuniao: `docs/plano-reuniao-por-link.md`.)

As duas convivem na mesma grade da semana, e nao em listas separadas: a pessoa
precisa ver o choque entre a reuniao da sede e o compromisso dela, e isso so
aparece lado a lado.

## Onde cabe marcar

Sai da PLANTA, nao de uma lista escrita a mao. Duas condicoes, as duas sobre a
sala de verdade:

1. **privativa** - e onde a chamada nao vaza pra fora;
2. tem **mesa de reuniao ou mesa redonda**, ou seja, uma mesa em volta da qual se
   senta.

A segunda separa sala de reuniao de **cabine de chamada**. As tres cabines
tambem sao privativas, mas sao pra uma pessoa so: o movel delas e uma poltrona e
uma mesinha de apoio. Marcar "Alinhamento do Comercial" numa cabine seria marcar
reuniao onde nao cabe reuniao.

Da pra separar por area (cabine tem 15 tiles, huddle 30), mas o numero seria
arbitrario e quebraria na primeira mexida na planta. **O movel diz o que a sala
e.** Hoje sobram: Sala de Reuniao (6 lugares), Huddle 1 e Huddle 2 (4 cada) - e
os lugares sao contados no mapa, tile de assento por tile de assento.

## As regras

| Regra | Por que |
|---|---|
| duas reunioes na mesma sala no mesmo horario, nao | a sala e FISICA: as duas turmas chegam e uma tem que sair |
| titulo obrigatorio | "reuniao" sem titulo na agenda de todo mundo nao ajuda ninguem |
| de 15 minutos a 8 horas | |
| ate um dia pra tras, aceito | marcar as 14h faltando cinco minutos, ou registrar a que acabou, sao casos de verdade |
| ate um ano pra frente | |
| desmarca quem marcou, ou a diretoria | prender a chave so em quem marcou deixaria a sede travada quando a pessoa sai da empresa |

Reuniao que acabou ha mais de 12 horas sai da lista sozinha: senao a agenda da
sede vira um arquivo morto que so cresce.

## O aviso no #geral FICA gravado

Ao contrario do "fulano entrou na sede", que e passageiro: quem nao estava online
na hora precisa ler que a reuniao foi marcada.

## Onde esta cada parte

| Arquivo | O que faz |
|---|---|
| `server/reunioes.js` | as regras, o disco (`DATA_DIR/reunioes.json`), e quais salas servem |
| `server/index.js` | `reuniao-marcar`/`desmarcar`, `chamada-entrar`/`sair`/`chamar-grupo`, e os avisos no #geral |
| `public/js/calls.js` | a regra: na mesma chamada marcada, conversa - venca o que vencer |
| `public/js/chamada.js` | a barra de "voce esta no ar" |
| `public/js/calendario.js` | o formulario, a lista lateral e o bloco na grade |
| `public/js/chat.js` | o botao Ligar e o Entrar do convite |
| `public/js/lembretes.js` | o aviso "comeca em 5 minutos" e o sino do cartao |
| `public/js/visitantes.js`, `server/visitantes.js` | quem entra pelo link: o pedido (Admitir/Recusar) e a sala de espera |
| `testes/reunioes.js` | 23 conferencias das regras de marcar |
| `testes/proximidade.js` | 7 conferencias da chamada marcada, contra o mapa de verdade |

## Resultado dos testes (13/09/2026)

219 conferencias na suite, 0 falhas.

As que guardam esta feature rodam contra o **mapa de verdade** - se alguem tirar
a mesa de reuniao de uma sala, ou mudar a planta, elas avisam. As sete da
chamada marcada sao o contrario de todas as outras do arquivo: o esperado e a
chamada acontecer JUSTAMENTE onde a proximidade diria que nao (longe, com parede
no meio, com a pessoa "Focada", dentro da biblioteca).

Ponta a ponta, no navegador, com duas contas:

| O que | Resultado |
|---|---|
| marcar pelo formulario | entra na lista lateral E no bloco da grade |
| o aviso | "Dev marcou ... na Sala de Reuniao, 13/09 as 14:00" no #geral |
| recarregar a pagina | a reuniao volta - veio do disco |
| Ligar no #geral | barra "no ar" + convite com botao Entrar na mensagem |
| quem entra DEPOIS | ja ve a chamada em andamento (vem no `init`) |
| **os dois em cantos opostos** | **44 tiles de distancia, e a regra diz que conversa** |
| os mesmos dois SEM a chamada | nao conversa - a proximidade continua valendo |

Dois erros meus no caminho, os dois achados medindo e nao chutando:

1. chamei `Game.irAte` com coordenadas, e `irAte` segue uma PESSOA (recebe o id
   dela). O boneco nao saia do lugar. Conferi antes que o tile de destino era
   caminhavel - como era, o problema so podia estar na chamada da funcao. Isso
   era da versao que levava pra sala, que depois caiu inteira.
2. a propria ideia de levar pra sala. Ela passava nos testes e funcionava - e
   estava errada assim mesmo, pelo caso que nenhum teste meu cobria: a sala
   ocupada.

## Lembrete (20/09/2026)

Marcar uma reuniao pra daqui a 3 minutos e ficar esperando o aviso nao dava em nada: o
"comeca em 5 minutos" so existia pros compromissos do Google, e dentro do painel da
Agenda - que fica fechado. Agora (`public/js/lembretes.js`, `testes/lembretes.js`):

- aviso **por cima do escritorio**, embaixo e no meio: "Entrevista X comeca em 5
  minutos - Entrar na chamada". Duas vezes: 5 minutos antes e na hora ("comecou
  agora"); o segundo toma o lugar do primeiro. Cada um aparece uma vez por aba
  (`sessionStorage`), entao recarregar a pagina no meio nao repete. Mais o som e a
  notificacao do sistema quando a aba esta escondida (a mesma via do `avisos.js`);
- **quem e lembrado**: reuniao da sede nao tem lista de convidados, e lembrar a sede
  inteira de toda reuniao viraria sirene. Entao quem **marcou** e lembrado sem fazer
  nada, e qualquer outro liga o sino **"Lembrar"** no cartao da reuniao. A escolha da
  pessoa vale nos dois sentidos (quem marcou pode desligar) e fica no navegador
  (`localStorage`), com a chave `id:criadaEm` - o id volta a 1 se o disco do servidor
  for apagado;
- quem ja esta na chamada da reuniao nao e lembrado dela.

## Pra quem e de fora: o link

Cliente, candidato e entrevistado entram pelo **link da reuniao**, so na chamada dela, sem
conta: `docs/plano-reuniao-por-link.md`. No cartao da agenda: **Copiar link** (qualquer
membro) e **Novo link** (so quem marcou, ou a diretoria: o link que vazou para de abrir).

## O que ainda nao tem

- **Convidar gente especifica da sede.** Hoje a reuniao e da sede inteira: quem quiser
  entra. Faz sentido enquanto a ADM couber numa sala.
- **Repetir toda semana.**
