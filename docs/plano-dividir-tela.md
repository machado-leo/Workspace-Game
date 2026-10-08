# Dividir a tela

O buraco numero 1 do comparativo com o Gather. Quem usa Gather pra reuniao pede
isso antes de qualquer outra coisa, e o navegador ja entrega a captura pronta -
o trabalho aqui e de encaixe, nao de video.

## A decisao que define tudo: trocar a track, nao somar

Duas formas de mandar a tela pelo WebRTC:

1. **Somar** uma segunda track de video na conexao. E o que o Gather faz: a
   camera continua indo junto com a tela. Custa renegociacao, e obriga o outro
   lado a saber qual das duas tracks e a tela pra desenhar cada uma no lugar
   certo - o `ontrack` de hoje so guarda `ev.streams[0]` num `<video>`.
2. **Trocar** a track de video que ja esta indo (`sender.replaceTrack`). O outro
   lado nao muda **nada**: o quadro que mostrava seu rosto passa a mostrar sua
   tela, e volta pro rosto quando voce para.

Escolhido o **2**. O motivo nao e so ser mais simples: `replaceTrack` nao
renegocia, entao a troca e instantanea e nao tem risco de colisao de oferta - e
colisao de oferta e justamente a parte fragil de uma malha P2P como esta, onde
cada par de pessoas tem a sua conexao.

**O preco, dito na cara:** enquanto voce divide a tela, sua camera para de ir. O
outro lado ve a tela no lugar do rosto. Pra uma empresa junior de 15 pessoas
isso e aceitavel; se um dia incomodar, o caminho e a opcao 1.

## Por onde passa

- `public/js/calls.js` - a troca em si.
- `public/index.html` - o botao na barra de baixo.
- `public/css/style.css` - o estado "dividindo" do botao.

## Casos que precisam funcionar

| Caso | O que tem que acontecer |
|---|---|
| Divide com camera ligada | O rosto some do quadro do outro, entra a tela. Ao parar, o rosto volta. |
| Divide so com microfone | Nao ha track de video pra trocar: adiciona uma e renegocia. |
| Para pelo botao do navegador | O navegador tem o proprio "parar de compartilhar". O evento `ended` da track tem que desfazer tudo igual ao nosso botao. |
| Cancela a janela de escolha | `getDisplayMedia` recusa. Nao pode sobrar estado pela metade. |
| Alguem chega perto durante a divisao | A conexao nova tem que nascer ja com a tela, nao com a camera. |
| Desliga a camera enquanto divide | Para a divisao junto - senao ficaria mandando tela sem microfone e sem jeito de parar. |

## Armadilha conhecida: dois transmissores de video

Se a gente parar a divisao com `replaceTrack(null)` e depois a pessoa ligar a
camera, o `sincronizarTracks` nao reconhece o transmissor vazio e cria **outro**.
Dois transmissores de video na mesma conexao fazem o outro lado receber dois
quadros e a chamada duplicar.

Por isso o transmissor de video passa a ser guardado no proprio par
(`p.videoSender`), e toda troca vai por ele.

## Espelhamento: a pegadinha que quase passou

A previa do proprio video e espelhada (`transform: scaleX(-1)`), porque e o seu
rosto e gente espera se ver como no espelho. **Tela dividida espelhada fica
ilegivel** - o texto sai ao contrario e voce nao consegue conferir o que esta
mostrando.

A classe que desfaz o espelho vai no proprio `<video>`, e nao no quadro em volta.
Motivo: a grade de chamada **move esse mesmo elemento** pra dentro do tile
(`callgrid.js`), entao uma regra presa ao container pararia de valer no instante
em que a chamada abre - justamente quando alguem esta olhando.

## Resultado dos testes

Rodado no navegador, no jogo de pe, trocando a captura de tela por um video
sintetico de canvas: o seletor de tela do navegador precisa de gesto humano, mas
todo o caminho de codigo depois dele e exercitado igual.

| Caso | Resultado |
|---|---|
| Divide com camera ligada | ok - botao acende, previa passa a mostrar a tela, sem espelho |
| Para pelo nosso botao | ok - previa volta pra camera e o espelhamento volta junto |
| Para pelo botao do navegador (`ended`) | ok - desliga sozinho, botao apaga |
| Desliga a camera enquanto divide | ok - a divisao para junto e a track da tela e encerrada |
| Cancela a janela de escolha | ok - nao sobra estado: botao apagado, previa na camera |

Nao testado por maquina, porque depende de duas pessoas de verdade: o outro lado
ver a tela no lugar do rosto. O caminho e o mesmo `replaceTrack` que os testes
acima exercitam, mas a confirmacao final e humana.
