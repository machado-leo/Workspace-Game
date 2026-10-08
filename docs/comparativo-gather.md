# Comparativo com o Gather, por partes

Cada parte diz três coisas: o que o Gather faz (com a fonte), o que a sede faz (lido no código **e
testado de verdade**), e o veredito. As partes vão sendo acrescentadas aqui.

| Parte | Estado |
|---|---|
| 1. Chat e reuniões | **feita em 20/09/2026** (abaixo) |
| 2. Mapa, salas e áreas | a fazer |
| 3. Avatar e presença | a fazer |
| 4. Calendário e integrações | a fazer (o Google entra na parte 1, no que toca a reuniões) |

## Como a parte 1 foi feita

- **Gather**: a central de ajuda oficial do Gather 2.0 (chat, agendamento de reuniões), a página de
  recursos, o roadmap, e os prints da pasta `referencias/` (tirados em 06/09/2026, do Gather de verdade).
- **A sede**: código lido e uma rodada de testes com um servidor separado (porta 3520, pasta de dados
  temporária, sem nenhuma chave de verdade): duas abas do navegador como pessoas diferentes, com câmera e
  microfone **sintéticos** (WebRTC real entre as duas abas) e três usuários simulados por socket, mais um
  visitante entrando por link de convite.
- **Não deu para testar**: câmera e microfone de verdade, redes de empresa ou faculdade (NAT), Safari e iPhone,
  mais de duas pessoas em chamada real, o som dos avisos, o Google Agenda (sem credenciais no teste) e o
  escritório publicado com gente dentro.

## Em uma tela

**Igual ao Gather, e funcionando** (testado): mensagem direta privada que sobrevive ao F5; reação em tempo real;
formatação segura (nada de HTML vira código); histórico gravado que sobrevive ao reinício; marcar reunião com
regras; entrar na chamada de reunião **de qualquer canto do mapa**; "Ligar" num canal com convite e botão Entrar;
dividir a tela; chamada por proximidade. **Feitos depois deste comparativo (20 e 21/09/2026)**: convidado por
**link da reunião** (só na chamada, com sala de espera, como no Meet) e **lembrete de reunião**.

**Falta em relação ao Gather**: respostas em fio (threads), menções (`@`) com lista de nomes, painel de atividade,
canais privados e criação de canais, conversa em grupo, anexos, busca dentro das mensagens, chat dentro da reunião,
reunião que se repete, gravação e resumo por IA.

**Problemas achados** (mais sérios que "falta um recurso"), e como estão hoje — o detalhe está em "Situação depois das
correções", mais abaixo:

| # | Problema | Situação |
|---|---|---|
| 1 e 2 | visitante lia e escrevia no chat interno e entrava em chamada de reunião interna | **resolvido** (o visitante nem recebe o que a sede transmite) |
| 3 | sem TURN no escritório publicado | **falta configurar** (a conta da Cloudflare é do Caio); o código está pronto |
| 4 | sem freio de spam | **resolvido** |
| 5 | barra "você está no ar" com dado velho depois de reconectar | **resolvido** (e um bug maior, achado no caminho) |
| 6 | Render grátis: chat e reuniões sem onde sobreviver ao reinício | **falta decidir onde hospedar** (a mudança para a Hostinger parou no meio: `docs/CONTINUAR-HOSPEDAGEM.md`); enquanto isso, backup no Drive ou plano com disco |
| 7 | sem lembrete das reuniões da sede | **resolvido** |
| 8 | mensagem de mais de 500 caracteres cortada sem aviso | **resolvido** (contador e aviso; o limite não mudou) |
| 9 | conexões refeitas sem parar com quem não atende | **resolvido** |

---

## 1A. Chat

| Recurso | Gather 2.0 | A sede | Veredito |
|---|---|---|---|
| Canais públicos | sim, qualquer um cria | 3 fixos (`geral`, `social`, `projetos`), definidos no servidor | **parcial**: ninguém cria canal |
| Canais privados (cadeado) | sim | não | **falta** |
| Mensagem direta 1 a 1 | sim | sim; chave pelo uid da pessoa, então sobrevive ao F5; só os dois recebem (**testado**: o terceiro não recebeu nada) | **igual** |
| Conversa em grupo (DM de vários) | sim | não | **falta** |
| Respostas em fio (threads) | sim, com aba "Threads" e "13 respostas" | não | **falta** |
| Menções (`@pessoa`, `#canal`) | sim | não | **falta** |
| Atividade e não lidas | painel "Activity" com sino, "Unreads" e menções | bolinha por conversa e no ícone do chat, número no título da aba, som e notificação do navegador (`avisos.js`) | **parcial** (**testado**: "# geral 2", "9+", "(1)" no título) |
| Reações com emoji | sim | 5 emojis fixos, um clique liga e desliga, chega ao vivo para todos (**testado**: 1, depois 2, com a marca "minha") | **quase igual** |
| Formatação | markdown: código, citação, listas | negrito, itálico, riscado, código e link automático. Sem `[texto](url)`, listas, citação nem bloco de código | **parcial**. **Testado** com `<img onerror>`, `<script>` e `javascript:`: saem como texto, nada executa |
| Anexos | sim | não (o projeto não tem onde guardar arquivo) | **falta** |
| Busca | em todas as mensagens, filtra por canal e pessoa | só filtra a lista de conversas | **falta** |
| Rascunhos | sim | não | falta (menor) |
| Editar e apagar mensagem | não documentado | não | falta (menor) |
| Chat de quem está perto (`/`) | últimas 5 mensagens, some sozinho | não (há "acenar" e reações no mapa) | falta (menor) |
| Chat dentro da reunião | sim, dura só a reunião | não: a chamada não tem chat | **falta** |
| Tamanho da mensagem | não informado | **500 caracteres**. Agora mostra o contador (`430/500`) perto do limite e avisa quando um texto colado foi cortado | limite baixo, mas **avisa** |
| Retenção | indefinida no chat principal | 200 por conversa, gravadas em disco (**testado**: voltaram depois de reiniciar o servidor) | ok, menor |
| Botão de chamada no canal | sim | "Ligar" no topo do canal, e o convite vira mensagem com botão "Entrar" (**testado**) | **igual** |

## 1B. Reuniões e chamadas

| Recurso | Gather 2.0 | A sede | Veredito |
|---|---|---|---|
| Marcar reunião no app | sim | sim: título, dia, hora, duração e sala (**testado**) | **igual** |
| Escolha da sala | automática: acha uma sala privada livre com capacidade; ou a sua mesa; ou um lugar que "não reserva de verdade" | você escolhe entre as salas com mesa de reunião (Sala de Reunião, 6 lugares; Huddle, 4) e o servidor **recusa dobrar a mesma sala no mesmo horário** | **parcial**: não escolhe sozinho, mas a regra é mais firme que a do Gather |
| Regras de marcar | não documentadas | **testado**: recusou sala ocupada, título vazio, sala inventada, data de dias atrás e duração fora de 15 min a 8 h; aceitou a outra sala no mesmo horário | **bom** |
| Ligação com o Google Agenda | cria o evento com o link ("Make it a Gather meeting"); Outlook chegando | a sede só **lê** o Google, de propósito (`calendar.readonly`); não cria evento nem link | **parcial, por decisão** |
| Convidados e link da reunião | sim | **sim (20/09/2026)**: cada reunião tem um link `/r/<token>` que abre **só** aquela chamada, sem conta e sem ver mapa nem chat. Fica numa sala de espera até um membro que está na chamada clicar em Admitir. "Novo link" mata o que vazou. Ver `docs/plano-reuniao-por-link.md` | **igual, e mais firme** (o Gather deixa entrar direto) |
| Reunião que se repete | só na migração | não | falta |
| Lembrete | pelo calendário e pelo app | **sim (21/09/2026)**: aviso por cima do escritório, 5 minutos antes e na hora, com botão "Entrar na chamada", som e notificação com a aba escondida. Quem marcou é lembrado sozinho; os outros ligam o sino no cartão (**testado** no navegador). Antes: nenhum aviso para reunião da sede | **igual** |
| Entrar de qualquer lugar | visão própria da reunião | **igual, testado**: uma pessoa na recepção e outra dentro da biblioteca silenciosa, a 25 tiles, conectaram com áudio e vídeo nos dois sentidos | **igual** |
| Chamada por proximidade | sim | **testado**: duas pessoas lado a lado conectaram sozinhas (áudio e vídeo trocados; 100 quadros decodificados) | **igual** |
| Grade de vídeo | grade, destaque e mapa | grade; **acima de 6 pessoas cai só a voz** (cada um manda vídeo para cada um) | **parcial** |
| Dividir a tela | sim, várias telas | sim (**testado**: chegou 640x360 ao outro lado e voltou a 320x240 ao parar); troca a câmera pela tela, uma coisa de cada vez | **parcial** |
| Gravação | sim (Premium) | não | **falta** |
| Notas e resumo por IA | sim | não | **falta** |
| Música na reunião | sim | não | irrelevante |
| Funciona em rede de empresa ou faculdade | infraestrutura própria | **só STUN**. Sem servidor de retransmissão (TURN), a chamada não conecta em NAT simétrico, que é rede de faculdade, de empresa e parte do 4G | **risco principal** (abaixo) |
| Celular | app 2.0 em desenvolvimento | site instalável; o chat tem tela própria de celular (**visto**: lista de conversas em tela cheia e barra de ícones embaixo) | ok |

---

## O que aconteceu nos testes, e o que os números dizem

| Teste | Resultado |
|---|---|
| Mensagem no `#geral`, com o campo do jeito que a pessoa usa | entregue **uma vez** a cada pessoa |
| Mensagem em canal que a pessoa não está olhando | "# geral 2" na lista e "2" no ícone; o título da aba mostra "(1)" |
| Mensagem direta | só quem devia recebeu; uma conversa de duas outras pessoas não chegou à tela da terceira |
| Chamada por proximidade | conectada, áudio e vídeo nos dois sentidos |
| Chamada de reunião a 25 tiles, com um dos dois na biblioteca silenciosa | conectada; ~38 KB de áudio e ~200 KB de vídeo trocados em meio minuto |
| Dividir a tela e parar | chegou 640x360; ao parar voltou a câmera (320x240) |
| Reunião desmarcada com gente dentro da chamada | some da agenda; a chamada continua e ninguém cai (bom) |
| **Servidor fora do ar** | a chamada **continuou** (vídeo ainda chegando): a mídia não passa pelo servidor |
| **Servidor reiniciado** | o cliente reconectou e voltou ao mapa sozinho; a chamada caiu (a outra aba recarregou); a barra "no ar" **ficou na tela com dado velho** |
| Reunião e chat depois do reinício | os dois voltaram do disco |
| **300 mensagens em 0,3 s** de uma conta | **todas aceitas** (~990 por segundo); o `#projetos` guarda 200, então o spam apagou o resto |
| **Visitante por link de convite** | leu o histórico dos **três** canais (inclusive "contrato do cliente Y atrasou, valor R$ 12.000") e **escreveu no `#projetos`** |
| **Visitante e a reunião interna** | entrou na chamada de uma reunião "CONFIDENCIAL" só sabendo o número (`reuniao:4`); a lista de reuniões ele não consegue pedir |
| Conexões de chamada com quem nunca atende | ~30 tentativas fechadas em ~7 min, para dois bots que nunca respondem: o app fica recriando a conexão com quem está perto e não responde |

*(A tabela acima é o registro da rodada de 20/09/2026, **antes** das correções. As linhas em negrito foram os
problemas; a situação de hoje está em "Situação depois das correções".)*

## Problemas achados, do mais grave ao menos

1. **Visitante lê e escreve em todo o chat interno.** `podeAcessar` devolve `true` para qualquer `canal:`; o
   convidado só é barrado em ligar para o grupo, marcar reunião e ver a agenda. O `plano-convidado.md` não trata o
   chat. Visitante é cliente, candidato, entrevistado: são as pessoas que não deviam ler "contrato atrasou".
   Correção: decidir o que o visitante vê (nenhum canal? só um `#visitantes`?) e barrar no servidor.
2. **Visitante entra em chamada de reunião interna.** `chamada-entrar` só confere se o id existe, e o id é um
   número em sequência. Correção: barrar convidado ali (a linha do `chamar-grupo` já faz).
3. **Sem TURN no escritório publicado** (`/api/diagnostico` mostra `turn=false`). O próprio comentário do
   `server/turn.js` diz que só com STUN a chamada não fecha em rede de faculdade, de empresa e parte do 4G. Como a
   time é da UECE e parte usa rede de faculdade ou de empresa, este é o problema que mais dói na prática. Correção: configurar a
   chave da Cloudflare (`docs/deploy.md`, seção 4). É configuração, e a conta é do Caio.

   (Onde isso aparece: como o time é da UECE e parte usa rede de faculdade ou de empresa, é o caso típico. Em
   casa, na mesma rede, a chamada conecta, como nos testes.)
4. **Sem freio de spam no chat.** Uma conta (ou um Enter preso) aceita ~990 mensagens por segundo e apaga o
   histórico do canal (200 por conversa). Correção: limite por pessoa (por exemplo 5 mensagens em 3 segundos).
5. **A barra "você está no ar" fica com dado velho depois de reconectar.** `chamada.js` só atualiza a chamada
   "minha" pelo evento `chamada-mudou`; ao reconectar não chega evento nenhum, e a pessoa acha que está numa reunião
   que já não existe. Correção: zerar no `init` (é uma linha).
6. **No plano grátis do Render, chat e reuniões não têm onde sobreviver ao reinício.** O disco é apagado a cada
   reinício, e o escritório publicado está com `backup=false`. Foi o que o `plano-chat-no-disco.md` quis resolver,
   mas só resolve com disco persistente ou o backup no Drive ligado. (Também: a primeira resposta do escritório
   publicado levou 12,6 s, porque o plano grátis dorme quando ninguém acessa.)
7. **Sem lembrete das reuniões da sede.** A grade avisa só os compromissos do Google.
8. **Mensagem de mais de 500 caracteres é cortada sem aviso.**
9. **Conexões recriadas sem parar** para quem não atende: dá ruído e tráfego de sinalização; vale um teto de
   tentativas.

## Situação depois das correções (21/09/2026)

| # | O que foi feito | Onde está | Guardado por |
|---|---|---|---|
| 1 e 2 | O visitante deixou de ser uma conta dentro da sede. Ele entra por um **canal separado do socket**, só com o token da reunião: nada do que a sede transmite (chat, mapa, agenda) chega a ele, e nenhuma rota reconhece um visitante sem cookie. Sala de espera, admissão por um membro, "Novo link", janela de horário. O modelo antigo (conta de visitante, `/api/convite*`, botão "Convidar visitante") foi retirado. | `docs/plano-reuniao-por-link.md`, `server/visitantes.js`, `server/link-reuniao.js`, `public/reuniao.html` | `testes/reuniao-link.js` (117), `testes/reunioes.js`, `testes/calls-visitantes.js`, `testes/marca.js`. Prova de mutação: 34 regras estragadas uma a uma, todas caem menos duas defensivas |
| 4 | Freio de ritmo: 5 mensagens por 3 s **por conta** (não por aba); reação 10 por 3 s. A mensagem barrada volta para a caixa e a pessoa é avisada. Mensagem inválida não gasta a cota | `server/freio.js`, `server/index.js`, `public/js/chat.js` | `testes/freio.js` (14), `testes/chat-ritmo.js` (15). Prova de mutação: 14 de 14 |
| 5 | A barra "você está no ar" zera na reconexão. **Achado no caminho, mais grave:** o `init` do jogo chega de novo a cada reconexão e o `Calls.init` empilhava um ouvinte de sinalização e um clique por botão (o microfone virava "desliga e liga"). Confirmado rodando o código antigo | `public/js/chamada.js`, `public/js/calls.js` | `testes/calls-visitantes.js` |
| 7 | Lembrete das reuniões da sede: aviso 5 min antes e na hora, com "Entrar na chamada". Quem marcou é lembrado; os outros ligam o sino no cartão | `public/js/lembretes.js`, `public/js/calendario.js` | `testes/lembretes.js` (22). Prova de mutação: 11 de 11 |
| 8 | Contador `430/500` nos últimos 100 caracteres e aviso quando um texto colado passa do limite. Sem conexão, a caixa não apaga o texto | `public/js/chat.js` | conferido no navegador |
| 9 | Espera crescente com quem nunca atende: 15 s, 30 s, 60 s... teto de 5 min; zera ao conectar. Um evento tardio de uma conexão já trocada não derruba a nova | `public/js/calls.js` | `testes/calls-tentativas.js` (24). Prova de mutação: 9 de 9 |

**O que depende do Caio** (configuração, não código):

- **TURN (item 3).** O código, o teste e o `render.yaml` já estão prontos; falta a chave. Passo a passo em
  `docs/deploy.md`, seção 4: criar o TURN na Cloudflare (Realtime → TURN Server), pôr `CLOUDFLARE_TURN_KEY_ID` e
  `CLOUDFLARE_TURN_TOKEN` no Render e reiniciar. Conferir em `/api/diagnostico` que `turn` virou `true`, e testar de
  verdade com um celular no 4G (Wi-Fi desligado) entrando numa reunião. Pesa mais ainda para o **visitante**, que quase
  nunca está na rede da ADM: os servidores de retransmissão vão junto com a admissão dele.
- **Onde guardar o chat e as reuniões (item 6).** No plano grátis do Render o disco some a cada reinício - e é o mesmo
  motivo da mudança de hospedagem que está parada em `docs/CONTINUAR-HOSPEDAGEM.md` (o Premium da Hostinger não roda
  Node; VPS roda). Decidido o lugar, o link da reunião não pede nada a mais: passa pelo mesmo `/socket.io/` que a sede já
  usa (o canal `/reuniao` é só mais um caminho dentro dele; o proxy precisa deixar WebSocket passar, como já precisa
  hoje). Enquanto isso: ou liga o backup no Drive (`BACKUP_DRIVE_PASTA`, `BACKUP_CHAVE`, `GOOGLE_CONTA_SERVICO`;
  `docs/backup.md`), ou usa um plano com disco (`render.yaml`, bloco `disk`).

## Sugestão de ordem

*Estado em 21/09/2026: o passo 1 está feito; o 2 aguarda a configuração da Cloudflare (é do Caio); o 3 está feito (e ainda o
lembrete e a espera crescente); o 4 e o 5 estão em aberto.*

1. **Antes de trazer visitantes de verdade** (entrevistas, clientes): itens 1 e 2. São um punhado de linhas no servidor
   e um teste.
2. **Antes da próxima reunião com rede de faculdade ou de empresa**: item 3 (configurar o TURN).
3. **Rápidos e sem discussão**: itens 4, 5 e 8. **Feitos**, junto com o 7 e o 9.
4. **Onde está o ganho de "parece Gather"**: threads e menções com o painel de atividade (é o trio que mais aparece nos
   prints), depois canais privados e criação de canal. (Convidados e lembrete de reunião **já foram feitos**.) Estes
   dependem de decisão de produto: cada um mexe no coração do chat.
5. **Fica para depois**: anexos (precisam de armazenamento), busca em mensagens, gravação e resumo por IA.
