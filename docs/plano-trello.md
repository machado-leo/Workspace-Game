# Plano: aba do Trello na sede

O Caio pediu "uma aba de trello como o crm usando a mesma api". A aba nasceu
lendo **um** quadro. Depois veio o que faltava: "cada diretoria tem seu trello,
ai so tem como se fosse 1". Agora ela le **um quadro por setor**, com um botao
por setor no topo.

> **Atualizacao (21/09/2026):** o time trabalha no **Kanban do proprio CRM** (o CRM
> trocou o Trello por um quadro nativo em agosto), e a aba passou a mostrar esses
> quadros - ver [plano-kanban-crm.md](plano-kanban-crm.md). Este documento vale agora
> pro Trello **listado** em `TRELLO_QUADROS` (os quadros de antes). Com o Kanban do
> CRM ligado, o `TRELLO_BOARD_ID` de antes - o quadro unico e parado - deixa de aparecer.

## 1. Decisao

Diferente do calendario, aqui **nao ha OAuth por pessoa**: o Trello do CRM usa
um **token unico da conta** (a que criou a chave da API). A sede reaproveita a
mesma chave e o mesmo token. Quem diz **quais quadros** aparecem, e com que nome,
e a variavel `TRELLO_QUADROS` (secao 3).

**Somente leitura.** O quadro continua sendo editado no Trello; a sede e pra
bater o olho sem sair da sede. Criar cartao (o CRM tem
`criarCartaoDeSolicitacao`) fica pra depois, se o Caio quiser - escrever e um
passo maior que ler.

## 2. O token nunca vai pro navegador

O proprio `crm-adm/src/lib/trello.ts` avisa: **quem tem o `TRELLO_TOKEN` acessa
a conta inteira do Trello**. Por isso as variaveis nao tem prefixo
`NEXT_PUBLIC_` la, e por isso aqui:

- `server/trello.js` e **so servidor**;
- o cliente pede pelo socket (`trello-pedir`) e recebe **o quadro ja montado**,
  nunca a credencial;
- erro do Trello nao repassa o corpo cru da resposta, so o status - resposta de
  erro as vezes ecoa a query, e a query leva `key` e `token`. A mensagem que a
  aba mostra e escrita pela sede (secao 6), e o `testes/trello.js` confere que
  nenhuma resposta carrega a chave nem o token.

## 3. Variaveis

| Variavel | Pra que |
|---|---|
| `TRELLO_API_KEY` | chave da API (a mesma do CRM) |
| `TRELLO_TOKEN` | token da conta dona da chave |
| `TRELLO_QUADROS` | os setores e o quadro de cada um (formato abaixo) |
| `TRELLO_BOARD_ID` | **antigo**: UM quadro, de todos. So vale se `TRELLO_QUADROS` estiver vazio **e o Kanban do CRM estiver desligado** |

Sem chave, token e ao menos um quadro, a aba abre e avisa "Trello nao
configurado", em vez de quebrar. (`TRELLO_TIMEOUT_MS` e `TRELLO_API_URL` existem
so pros testes.)

### O formato do `TRELLO_QUADROS`

```
TRELLO_QUADROS="Comercial=AbCdEfGh; Marketing=IjKlMnOp|etiqueta=Marketing; Gente e Gestao=IjKlMnOp|etiqueta=Gente,Gestao; Direx=QrStUvWx|diretoria"
```

Os setores ficam separados por `;` (ou por linha). Cada um e `Nome=quadro`, mais
opcoes depois de `|`:

| Pedaco | O que faz |
|---|---|
| `Nome` | o nome do setor: o que aparece no botao da aba |
| `quadro` | o codigo curto da URL do quadro (`trello.com/b/`**`AbCdEfGh`**`/nome`), o id de 24 caracteres, ou o proprio link |
| `\|etiqueta=A,B` | so os cartoes que tem alguma dessas etiquetas (sem diferenciar maiuscula nem acento). E assim que **dois setores dividem um quadro so**: o Marketing e o Gente e Gestao usavam o mesmo |
| `\|diretoria` | so a diretoria (conta admin) ve esse quadro |

O que nao da pra entender **nao derruba nada**: vira um aviso no log do
arranque (`Trello: 4 quadros - Comercial, Marketing, ... (atencao: ...)`) e o
resto continua valendo. O codigo do quadro so aceita letras, numeros, `_` e `-`,
porque ele entra no caminho da URL da API.

## 4. Quem ve o que

- Um quadro `|diretoria` **nem aparece** pra quem nao e da diretoria: nem o
  botao, nem o nome. A decisao e do **servidor**, pela conta (`isAdmin`); o
  navegador nao manda "eu sou da diretoria" e, se mandar, e ignorado.
- Se alguem pedir a chave do quadro restrito mesmo assim, recebe o primeiro
  setor que pode ver - nunca um erro que confirme que o quadro existe.
- Sem nenhum quadro liberado pra pessoa: "Nenhum quadro do Trello foi liberado
  pra voce."
- O setor escolhido fica lembrado **neste navegador** (`localStorage`).
- Quadro restrito aparece com um cadeado no botao, pra diretoria saber que o
  resto da sede nao o ve.

## 5. Cache e "Atualizar"

Cache de **2 minutos por quadro**: o quadro muda devagar (e alguem arrastando
cartao) e nao vale bater na API a cada abertura de painel.

O botao **Atualizar** passa por cima do cache, mas **no maximo uma vez a cada
10 s por quadro**: a API do Trello limita a 100 pedidos por 10 s por token, e
cada quadro custa 3 (quadro, listas, cartoes). Cliques juntos viram um pedido
so. Antes o botao apenas refazia o pedido, e dentro da janela do cache
devolvia o mesmo quadro - parecia quebrado.

## 6. Quando o Trello falha

A aba diz o que houve **e o que fazer**:

| Situacao | O que a aba diz |
|---|---|
| Falta chave, token ou quadro | "Trello nao configurado (falta TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_QUADROS)" |
| Chave ou token recusado | "O Trello recusou a chave ou o token (venceu ou foi revogado). Gere outro..." |
| Token bom, mas a conta nao enxerga **aquele** quadro | "A conta dona do token nao enxerga o quadro X: ou o codigo esta errado, ou falta convidar essa conta pra ele no Trello." |
| 429 | pede pra esperar um pouco |
| Timeout ou sem rede | "demorou demais pra responder" / "nao conseguiu falar com o Trello" |
| Falhou, mas ja tinha dado certo | mostra o **ultimo quadro bom**, dizendo que e velho |

O Trello responde 401 ou 404 tanto pra "token ruim" quanto pra "quadro que essa
conta nao ve". Pra separar os dois, a sede faz **um pedido a mais**
(`/members/me`), so na falha, e lembra a resposta por 1 minuto. Um quadro sem
acesso **nao derruba os outros**: cada setor e lido sozinho.

## 7. O que o Trello de verdade ensinou (21/09/2026)

O primeiro teste usava um stub que devolvia tudo, e passou. Com as credenciais
de verdade apareceram:

- **A API so devolve os campos que se pede.** O pedido dos cartoes nao incluia
  `labels` no `fields`, entao as etiquetas **nunca** chegavam (o stub mandava
  sempre, por isso ninguem viu). Agora `labels` e pedido, e o stub do teste
  passou a respeitar `fields` como a API real - o teste pega a regressao. O
  `crm-adm/src/lib/trello.ts` tem o mesmo defeito (nao foi mexido).
- `desc` (a descricao do cartao) saiu do pedido: a tela nao usa, e e texto a
  mais pra mandar a todo mundo.
- O quadro unico que estava configurado era o "Marketing - Gente - Gestao",
  parado desde 04/08/2026, quando o CRM ganhou o Kanban proprio. E o site
  publicado nem tinha as variaveis do Trello (o diagnostico dizia `trello:
  false`). Foram as tres coisas juntas que fizeram "nao funciona".
- Pra saber os quadros que a conta do token enxerga:
  `GET https://api.trello.com/1/members/me/boards?fields=name,shortLink,closed`
  (com `key` e `token` na query - nunca imprima nem commite isso).

## 8. Como ligar

1. **Chave e token** - uma vez, em https://trello.com/power-ups/admin (a chave
   aparece na pagina e o token sai do link "Token" ao lado dela). Sao os mesmos
   do CRM. **Quem digita e o Caio.**
2. **A conta dona do token tem que ser membro de cada quadro.** A API so mostra o
   que essa conta enxerga. Quadro de setor que ela nao integra cai no aviso
   "a conta dona do token nao enxerga o quadro X": a saida e convidar a conta pro
   quadro no Trello.
3. **`TRELLO_QUADROS`** no `escritorio-virtual/.env` (local) e no painel do
   Render (producao). No Render, junte com as outras variaveis numa vez so:
   cada "salvar" reinicia o site, e no plano free isso zera `server/data/`
   (ver [deploy.md](deploy.md)).
4. Suba a sede e leia a linha do arranque: `Trello: N quadros - ...`.

## 9. Arquivos

| Arquivo | Papel |
|---|---|
| `server/trello.js` | le `TRELLO_QUADROS`, le cada quadro (quadro + listas + cartoes), cache, mensagens de falha |
| `server/quadros.js` | junta o Kanban do CRM e o Trello numa lista so (ver [plano-kanban-crm.md](plano-kanban-crm.md)) |
| `server/index.js` | evento `trello-pedir` (decide `diretoria` e o e-mail pela conta) e a linha do arranque |
| `server/auth.js` | `/api/diagnostico` diz `trello: true` quando ha chave, token e algum quadro |
| `public/js/trello.js` | painel: botoes de setor, colunas, "Atualizar" |
| `public/index.html` / `style.css` | botao no trilho, botoes de setor, estilos |
| `testes/trello.js` | servidor: formato, etiquetas, so-diretoria (inclusive num servidor de verdade), cache, falhas |
| `testes/trello-aba.js` | navegador (DOM de mentira): setor pedido e lembrado, resposta fora de hora, "Atualizar" |

## 10. Resultado dos testes

| O que | Resultado |
|---|---|
| `testes/trello.js` | 61 checagens ok. Prova de mutacao: 26 de 28 mutantes derrubados; os 2 que sobrevivem nao mudam nada que a tela veja (a mensagem interna de um erro HTTP, que vai pro log so como "HTTP 404", e o corte da chave do pedido em 60 caracteres - chave que nao existe ja cai no primeiro setor) |
| `testes/trello-aba.js` | 33 checagens ok. Mutacao: 18 de 18 derrubados |
| Bateria completa (`node testes/todos.js`) | 36 arquivos, 0 falhas |
| Trello de verdade, no navegador | 4 setores lidos (Comercial, Marketing e Gente e Gestao dividindo um quadro por etiqueta, Direx restrito). Etiquetas aparecem (o defeito da secao 7 esta corrigido) e o filtro por etiqueta separa os setores do quadro dividido |
| "Atualizar" e cache, com o relogio de verdade | abrir de novo dentro de 2 min e "Atualizar" antes de 10 s devolvem o mesmo quadro; "Atualizar" depois de 10 s busca de novo |
| Conta que nao e da diretoria (navegador) | ve 3 botoes, sem o restrito; pedir o quadro restrito pelo socket, ate mandando `diretoria: true`, devolve o primeiro setor e nenhum dado dele |
| Falhas reais | quadro inexistente, token ruim e chave ruim dao a mensagem certa; um quadro ruim nao derruba o bom; nenhuma resposta carrega a chave nem o token |
| Celular (375 px) | o painel cabe, e as colunas rolam na horizontal (os botoes de setor tambem, quando sao mais que a tela: `overflow-x: auto`) |

## 11. Fora de escopo (por enquanto)

- **Criar cartao pela sede.** Continua so leitura.
- ~~Ler o Kanban do CRM.~~ Feito em 21/09/2026, e e agora a fonte principal da aba:
  ver [plano-kanban-crm.md](plano-kanban-crm.md).
- **Calendario por diretoria, "lincado" ao Trello do setor.** A agenda continua
  por pessoa (Google). Ver `docs/CONTINUAR-HOSPEDAGEM.md`, secao 8.
