# Sair do local: colocar o escritorio no ar

> ## A sede no ar
>
> **https://escritorio-virtual-adm.onrender.com**
>
> Plano **free**: ela DORME depois de ~15 min sem ninguem, e a primeira visita
> depois disso leva ate um minuto pra acordar. Avise quem for testar - senao
> parece que caiu.
>
> Publicar: `npm run espelhar` (empurra pro espelho; o Render percebe sozinho).
>
> ### Depois de CADA deploy, no plano free
>
> O disco e efemero: `server/data/` some, e **todas as contas somem junto**.
>
> Voltar e so clicar **Entrar com o Google da ADM** - a conta e criada de novo
> na hora, sem senha e sem codigo. Quem esta em `DIRETORIA_EMAILS` (painel do
> Render, **Environment**) volta como diretoria; sem essa variavel, vira
> diretoria **a primeira pessoa que entrar com o Google** numa sede sem
> diretoria. Configure a lista pra nao depender de quem chega primeiro.
>
> **Por que o Google e nao mais "e-mail da ADM com senha":** o cadastro com
> senha nao confere o e-mail - qualquer um digita fulano@admsolucoes.com.br. Em
> 15/09/2026 a sede no ar estava com 0 contas e "a primeira conta nasce
> diretoria": o primeiro estranho a digitar um @admsolucoes mandaria na sede.
> Com o Google ligado, e-mail da ADM **so** entra pelo Google, e cadastro com
> senha nunca da diretoria. Ver docs/plano-login.md, secao 10.
>
> **Pro login com o Google funcionar no ar**, o endereco de volta tem que estar
> cadastrado no cliente OAuth (Google Cloud > APIs e servicos > Credenciais >
> o ID do cliente > URIs de redirecionamento autorizados):
> `https://escritorio-virtual-adm.onrender.com/api/google/callback` - o mesmo
> que a Agenda usa. Sem ele, o Google mostra `redirect_uri_mismatch`.
>
> O codigo da sede continua existindo so pra quem NAO tem e-mail da empresa
> (`CODIGO_SEDE` no painel). Sem essa variavel, e-mail de fora nao cria conta.
>
> Pra parar de perder conta a cada deploy, ver a secao 3 (disco persistente).

O projeto ja esta pronto pra rodar fora da sua maquina: o servidor usa
`process.env.PORT`, o cookie de sessao vira `Secure` sozinho quando
`NODE_ENV=production`, e a flag `SEM_LOGIN` e ignorada em producao.

Falta escolher **onde** hospedar e resolver **duas coisas que so aparecem
quando sai do localhost** (disco e chamada de video). Estao nas secoes 3 e 4 -
vale ler antes de subir.

---

## 0. Link rapido com tunel (pra hoje, sem hospedar nada)

Se a ideia e so **mandar um link pro pessoal entrar agora**, da pra abrir a sua
propria maquina pra internet por um tunel, sem Render nem deploy.

```
npm run publicar          # so isso: sobe a sede E abre o tunel
```

**Um comando so.** Ele imprime um quadro com o **link https** e os dois codigos:

```
  +---------------------------------------------------------------+
  |  Link pra mandar pra pessoa testar:                           |
  |                                                               |
  |    https://algo.ngrok-free.dev                                |
  |                                                               |
  |  Codigo da sede (todo mundo precisa, pra criar conta):        |
  |    adm-coco-2525                                              |
  |  Codigo de diretoria (so pra quem vai decorar o escritorio):  |
  |    chefe-vento-8987                                           |
  +---------------------------------------------------------------+
```

Por baixo ele e o `npm start` com as tres variaveis ja no lugar:
`NODE_ENV=production` (cookie `Secure`, e a flag `SEM_LOGIN` passa a ser
ignorada), mais um `CODIGO_SEDE` e um `ADMIN_CODE` sorteados. Os codigos ficam
salvos em `server/data/` - **nao mudam** no proximo restart, entao quem ja tem o
codigo continua entrando.

Manda o link **junto com o codigo da sede** - sem ele ninguem cria conta.
`Ctrl+C` derruba o servidor e o tunel juntos.

Precisa do **ngrok instalado e logado** uma vez (`ngrok config add-authtoken
...`, conta gratuita em ngrok.com). Se ele nao estiver no PATH, o `publicar`
avisa e o servidor local continua de pe - da pra abrir o tunel na mao com
`ngrok http 3600`.

**O que esse caminho nao resolve:**

- **So funciona com o seu PC ligado e o terminal aberto.** Fechou, o link morre.
- **O endereco muda** toda vez que voce reinicia o ngrok (no plano gratuito).
- Quem abre vai ver uma tela do ngrok antes ("Visit Site"), tambem do plano
  gratuito.
- Continua valendo a secao 4: sem servidor TURN, parte do time nao consegue
  fechar a chamada de video.

Pra um link que fica de pe sozinho, e a secao 2 (Render).

> **Nunca use `npm run dev` pra isso.** Com `SEM_LOGIN=1` **todo mundo que
> abrisse o link entraria na mesma conta** - mesmo nome, mesmo boneco, e lendo
> as DMs uns dos outros. O `publicar` recusa rodar se essa variavel estiver
> ligada, justamente por isso.

## 1. O que subir

Tudo que esta no git. `server/data/` **nao** vai junto (esta no `.gitignore`) -
e isso e o certo: sao as contas e a decoracao, que pertencem ao servidor de
producao, nao ao repositorio.

## 2. Passo a passo no Render

O `render.yaml` na raiz do projeto ja descreve o servico.

1. Suba o repositorio no GitHub (o Render le de la). **Deixe privado**: a pasta
   `referencias/` tem prints do Gather, que nao sao nossos pra republicar. O
   plano free do Render funciona com repo privado normalmente.
   Se o codigo estiver num monorepo junto com outros projetos, mande so esta
   pasta:

   ```bash
   npm --prefix escritorio-virtual run espelhar
   ```

   Assim o CRM e os outros projetos **nao vao junto**.

   > **Nao use `git subtree push` aqui.** Era o que estava escrito antes, e foi
   > por isso que o escritorio ficou 10 commits atrasado no ar sem ninguem
   > perceber: o repositorio do GitHub nao e uma fatia do historico deste
   > monorepo, e um **espelho montado a mao** (sem `referencias/`, com uma secao
   > a mais no README). Os dois historicos nao se encontram, entao o subtree
   > push e recusado por nao ser fast-forward.

2. No Render: **New > Blueprint**, aponte pro repositorio. Ele le o
   `render.yaml` sozinho.
3. Confirme as variaveis. `CODIGO_SEDE`, `ADMIN_CODE` e `SESSION_SECRET` estao
   como `generateValue: true`, entao o Render sorteia um valor forte pra cada
   uma - **anote os dois primeiros**, sao eles que o time vai usar pra criar
   conta e pra virar diretoria. O `SESSION_SECRET` voce nunca precisa ver.
4. Deploy. O primeiro leva uns minutos; depois o link e fixo.

O `render.yaml` esta no **plano free**: nao pede cartao. Em troca, o servico
dorme depois de ~15 min sem ninguem (a visita seguinte demora ~1 min pra
acordar) e nao tem disco - veja a secao 3.

Se preferir subir na mao (sem Blueprint): runtime Node, build `npm ci`, start
`npm start`, e as variaveis `NODE_ENV=production`, `CODIGO_SEDE` e
`ADMIN_CODE` definidas por voce.

> **Nao defina `SEM_LOGIN` em producao.** O codigo ja ignora, mas nao custa.

### Atualizar o que esta no ar

Toda vez que quiser levar o que esta no seu PC pro link, e o mesmo comando:

```bash
npm --prefix escritorio-virtual run espelhar
```

O `espelhar.js` clona o repositorio do GitHub num diretorio de trabalho, joga a
pasta atual por cima, commita em cima do que ja estava la e empurra. Como o
commit novo nasce do commit que ja estava no GitHub, o push e sempre
fast-forward - e por isso que ele funciona onde o `git subtree push` nao
funciona.

O que ele **nao** manda: `referencias/` (prints de um produto de terceiro),
`node_modules/` e `server/data/` (contas e decoracao - sao do servidor, nao do
repositorio). Arquivo que voce apagou aqui some la tambem. Rodar duas vezes
seguidas sem mexer em nada nao cria commit vazio: ele avisa que nada mudou.

Ele leva o que esta **no disco**, commitado ou nao - se tiver mudanca solta em
`escritorio-virtual/`, ele avisa antes de continuar.

Depois do push o Render percebe sozinho e refaz o deploy, o que leva alguns
minutos. **Atencao:** no plano free isso apaga `server/data/`, entao **todo
mundo perde a conta e precisa se cadastrar de novo**. Veja a secao 3.

### Calendario e Trello: precisam de credenciais

As duas abas **nao funcionam so com o deploy**. Elas dependem de chaves que o
Blueprint pede na hora de criar (ficam como `sync: false`, entao nenhum segredo
entra no repositorio). Deixar em branco nao quebra nada: a aba abre com um aviso
de "nao configurado".

**Rodando local**, as mesmas variaveis vao em `escritorio-virtual/.env` (copie
de `.env.example`). O servidor le esse arquivo sozinho ao subir; ele esta no
`.gitignore` e nunca vai pro repositorio. Variavel definida no ambiente ganha do
arquivo.

| Variavel | Onde pegar |
|---|---|
| `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` | Google Cloud > APIs e servicos > Credenciais > **Criar credenciais > ID do cliente OAuth**, tipo "Aplicativo da Web". Sao as mesmas credenciais que o CRM ja usa. |
| `TRELLO_API_KEY` e `TRELLO_TOKEN` | https://trello.com/power-ups/admin - a chave aparece na pagina e o token sai do link "Token" ao lado dela |
| `CRM_URL` e `CRM_CHAVE_KANBAN` | os **quadros das diretorias** vem do Kanban do CRM, que e onde o time trabalha hoje. `CRM_URL` e o endereco do CRM (sem barra no fim) e `CRM_CHAVE_KANBAN` e uma chave de 32+ caracteres, a MESMA que o CRM guarda como `KANBAN_CHAVE_ESCRITORIO`. Passo a passo em [plano-kanban-crm.md](plano-kanban-crm.md#6-como-ligar) |
| `TRELLO_QUADROS` | os quadros, **um por setor**: `Comercial=AbCdEfGh; Direx=QrStUvWx\|diretoria`. O codigo de cada quadro esta na URL dele (`trello.com/b/`**`AbCdEfGh`**`/nome`). Formato completo, etiquetas e quadro so da diretoria em [plano-trello.md](plano-trello.md#3-variaveis). O antigo `TRELLO_BOARD_ID` (um quadro so, de todos) continua valendo se este ficar vazio |
| `GOOGLE_DRIVE_PASTA` e `GOOGLE_CONTA_SERVICO` (no Render, a chave vai como **Secret File** `conta-servico.json`: nao cabe no campo de variavel) | a pasta de livros da biblioteca e a chave JSON de uma conta de servico com acesso de Leitor a ela. Passo a passo em [estante.md](estante.md#1-a-pasta-do-drive-o-jeito-de-producao). Em branco, a estante le `DATA_DIR/livros` |

**Trello: a conta dona do token precisa estar em cada quadro.** O token e de
uma conta so (a que criou a chave), e a API so mostra o que essa conta enxerga. Quadro
de setor que ela nao integra aparece na aba com o aviso "a conta dona do token nao
enxerga o quadro X" - a saida e convidar essa conta pro quadro no Trello, nao mexer na
sede.

No Google Cloud, em **URIs de redirecionamento autorizados**, cadastre:

```
https://escritorio-virtual-adm.onrender.com/api/google/callback
```

Sem isso o Google recusa a conexao com `redirect_uri_mismatch`. Nao precisa
definir `SITE_URL`: o codigo usa o `RENDER_EXTERNAL_URL` que a hospedagem
preenche sozinha. So faz falta se um dia a sede ganhar dominio proprio.

> **Atencao no plano free:** a conexao com o Google fica guardada em
> `server/data/google.json`, e sem disco persistente ela **some a cada deploy ou
> restart** - cada pessoa teria que reconectar a agenda. O Trello nao sofre
> disso, porque le com o token do servidor e nao guarda nada por pessoa.

## 3. Disco: a pegadinha do plano free

`server/data/` guarda **contas, senhas e a decoracao do mapa** em JSON no disco.

- No **plano free do Render o disco e efemero**: some a cada deploy e a cada
  restart automatico. Na pratica todo mundo perde a conta e o escritorio volta
  pra planta original de tempos em tempos.
- O `render.yaml` ja tem o bloco do disco pronto, **comentado**, porque disco
  exige plano pago (o Starter, o mais barato). Com `plan: free` o bloco `disk`
  e recusado pela hospedagem.

### Como ligar o disco (3 linhas no `render.yaml`)

1. `plan: free` -> `plan: starter`
2. Descomente as duas linhas de `DATA_DIR` em `envVars`
3. Descomente o bloco `disk` no fim do arquivo

O servidor le a pasta de dados de **`DATA_DIR`** (`server/dados.js`), entao o
volume e montado num caminho proprio (`/var/dados`) em vez de por cima de
`server/data`. Isso e de proposito: montar um volume em cima de um diretorio que
vive dentro do checkout do codigo depende de a hospedagem nao tocar naquele
caminho durante o deploy, e e justamente o tipo de coisa que funciona ate o dia
que para. Sem `DATA_DIR` definido nada muda - continua `server/data`, como local.

Pra conferir que pegou: o log de arranque imprime `[dados] usando DATA_DIR: ...`.
Se essa linha nao aparecer no Render, o disco **nao** esta em uso e os dados
continuam efemeros.

Escolha uma:

| Caminho | O que da | Custo |
|---|---|---|
| **Render Starter + disco** | funciona como esta escrito, mexendo em 3 linhas do `render.yaml` | pago (mensal) |
| **Plano free, aceitando perder** | serve pra mostrar/testar; conta e decoracao somem sozinhas | gratis |
| **Trocar o JSON por um banco** | resolve de vez, e o certo se virar ferramenta do dia a dia | Postgres free do Render/Neon, mas **exige reescrever `usuarios.js` e `mapa-editado.js`** |

Isso e decisao sua - nao da pra fugir dela so com codigo.

## 4. Chamada de video: vai falhar pra parte do time

> **Resolvido com o TURN da Cloudflare** (`server/turn.js`), quando as duas
> variaveis estao definidas:
>
> 1. https://dash.cloudflare.com > **Realtime** > **TURN Server** > criar uma
>    chave. Aparecem dois valores: **Turn Token ID** e **API Token**.
> 2. `CLOUDFLARE_TURN_KEY_ID` = o Token ID; `CLOUDFLARE_TURN_TOKEN` = o API
>    Token. No Render (painel) e/ou no `.env` local.
>
> O token fica so no servidor; o navegador recebe de `/api/ice` uma credencial
> temporaria de 24h. Cota gratis da Cloudflare: 1.000 GB/mes. Sem as variaveis,
> ou com a Cloudflare fora do ar, a chamada volta pro STUN - o comportamento de
> antes. O log de arranque diz qual dos dois esta valendo ("Chamada: TURN da
> Cloudflare ligado").
>
> O texto abaixo explica o problema.

Antes do TURN, o WebRTC usava **so STUN** (`stun:stun.l.google.com:19302`), em
`public/js/calls.js`.

STUN sozinho resolve a maioria das redes domesticas, mas **nao** resolve NAT
simetrico - tipico de rede corporativa, faculdade e alguns 4G. Nessas, os dois
lados se veem no mapa e a chamada simplesmente nao conecta. No localhost isso
nunca aparece, porque nao ha NAT no meio.

Pra fechar isso precisa de um **servidor TURN**, que retransmite o audio/video
quando a conexao direta falha. Opcoes: um TURN gerenciado (Twilio, Metered,
Cloudflare Calls) ou subir um `coturn`. Em qualquer caso e so acrescentar o
servidor na lista `ICE_SERVERS`, com usuario e senha vindos de variavel de
ambiente.

Enquanto nao tiver TURN, vale avisar o time: "se a chamada nao abrir, e a rede".

## 5. Antes do primeiro deploy

- [ ] Apagar `server/data/usuarios.json` local, ou pelo menos saber que as
      contas de teste (`dev@local` e `bot@local`) **nao** vao
      junto - elas nao estao no git, entao o servidor novo comeca vazio.
      `dev@local` e `bot@local` so nascem com `npm run dev`; em producao
      (`NODE_ENV=production`) o `SEM_LOGIN` e ignorado e elas nao sao criadas.
- [ ] Anotar `CODIGO_SEDE` e `ADMIN_CODE` gerados.
- [ ] Criar a sua conta de diretoria logo no primeiro acesso.
- [ ] Conferir que a URL abre em **https** (o cookie de sessao so vai com
      `Secure` em producao; em http ele e descartado e ninguem consegue logar).

### Chamada grande (mais de 6 pessoas)

A chamada e direta entre as pessoas (malha P2P): cada participante manda o
proprio video pra cada um dos outros. Com 6 pessoas sao 5 videos subindo da
internet de cada um; com 15, catorze - a conexao de casa e o processador nao dao
conta, e a chamada trava pra todo mundo.

Por isso, **passou de 6 pessoas, as cameras saem do ar e fica so a voz**, com
aviso na tela (`public/js/calls.js`, `testes/chamada-grande.js`). Audio e leve,
entao uma reuniao de 20 pessoas so de voz aguenta. **Compartilhar tela continua**
- so quem apresenta manda. As cameras voltam quando a chamada cai pra 5.

Reuniao geral **com video** de 15-30 pessoas pede um servidor de video no meio
(SFU - por exemplo o da propria Cloudflare, ou LiveKit). Ate la, reuniao geral
com camera fica no Meet.
