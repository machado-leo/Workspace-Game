# O chat para de sumir quando o servidor reinicia

O buraco numero 2 do comparativo com o Gather - e o unico da lista que nao e
"falta um recurso", e sim **dado sendo perdido**.

## O problema

O historico vivia so na memoria do processo. Reiniciar apagava tudo. No plano
gratuito do Render, que derruba o processo quando ninguem acessa, isso
acontecia **sozinho de madrugada**: o time chegava de manha e a conversa da
vespera nao existia mais. Ninguem via erro nenhum - e o pior tipo de defeito.

## Onde fica

`server/chat-disco.js`, novo, no mesmo formato dos outros guardadores do projeto
(`mesas.js`, `estante.js`, `usuarios.js`): JSON num arquivo em `server/data/`,
que ja esta fora do git.

## Tres decisoes

**1. Aviso de "entrou/saiu" nao e guardado.** Enquanto a sessao esta viva ele faz
sentido. Depois de um reinicio vira uma parede de entra-e-sai de gente que nem
esta online, empurrando a conversa de verdade pra fora da tela. Sao as mensagens
com `autorId: null`.

**2. Grava com 1,5s de espera, nao a cada mensagem.** Numa conversa animada
seriam dezenas de escritas por minuto pra guardar quase sempre o mesmo conteudo.
A espera junta a rajada num gravar so.

O preco: uma queda dura (energia, `kill -9`) perde ate 1,5s de conversa. Por isso
`SIGINT` e `SIGTERM` forcam a gravacao antes de sair - e SIGTERM e justamente o
que o Render manda quando derruba o processo.

**3. O corte de 200 mensagens vale na LEITURA tambem.** Se um dia alguem subir o
limite, gravar 5.000 e depois voltar atras, o arquivo antigo encheria a memoria
de volta sem ninguem notar. O corte na leitura fecha isso.

## Um detalhe que faz diferenca na tela

O historico volta do disco, mas `nomesPorUid` so enche quando a pessoa **conecta**.
Sem cuidado, logo depois de reiniciar a lista de conversas mostrava "Alguem" no
lugar do nome - com a conversa dessa pessoa ali do lado, legivel. Os nomes agora
sao buscados na mesma lista de contas do login, na subida.

## Resultado dos testes

`testes/chat.js` (entra no `npm run teste`), 10 checagens no modulo de disco:

| Checagem | Resultado |
|---|---|
| Canal e DM voltam com as mensagens | ok |
| O proximo id continua de onde parou | ok |
| Reacoes voltam junto | ok |
| Aviso de entrou/saiu fica de fora | ok |
| A leitura corta no limite, e o que sobra sao as mais NOVAS | ok |
| Arquivo corrompido comeca limpo em vez de derrubar o servidor | ok |
| Canal sem mensagem nao ocupa espaco no arquivo | ok |

E a prova de ponta a ponta, no jogo de pe: mandar uma mensagem, **matar o
servidor**, subir de novo e pedir o historico.

- a mensagem voltou depois do reinicio - **ok**
- os avisos de "entrou" na lista eram da sessao NOVA, nao ressuscitados: o
  arquivo no disco tinha zero deles - **ok**

## Armadilha pra quem for mexer depois

Nao rode `npm run teste` com o servidor de pe. O teste escreve em
`server/data/chat.json` e devolve o arquivo no fim, mas o processo vivo tem o
historico em memoria e regrava por cima assim que alguem falar. E a mesma
armadilha que `testes/mesas.js` ja documenta.
