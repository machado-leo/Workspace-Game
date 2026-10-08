# Escritorio Virtual - ADM Solucoes

Escritorio 2D multiplayer (estilo Gather.town) para a ADM Solucoes, empresa junior de
administracao da UECE. Cada pessoa monta seu boneco, entra no escritorio e anda pelo
espaco em tempo real junto com o resto do time — quem chega perto de alguem entra
automaticamente numa chamada de video/audio com essa pessoa, como no Gather de verdade.

## Stack

- **Backend:** Node.js + Express + Socket.io (WebSocket para posicao em tempo real e
  sinalizacao das chamadas)
- **Frontend:** HTML5 Canvas + JavaScript puro (sem framework, sem build step)
- **Chamadas:** WebRTC peer-to-peer nativo do navegador (o servidor so entrega o
  "bilhete" de conexao entre dois navegadores; o video/audio nunca passa por ele)
- **Sem banco de dados externo:** as contas (nome, e-mail, senha com hash e a
  aparencia do boneco) ficam num JSON no disco do servidor; a presenca (quem esta
  online e onde) vive so em memoria enquanto o servidor estiver rodando
- **App de computador:** o site e instalavel como PWA (janela propria, icone na
  area de trabalho) — ver `docs/app-computador.md`

## Estrutura de pastas

```
escritorio-virtual/
├── server/
│   ├── index.js        # servidor Express + Socket.io
│   ├── auth.js         # rotas de conta (criar, entrar, sair, perfil)
│   ├── mapa-editado.js # decoracao: diferencas gravadas em cima do mapa base
│   ├── usuarios.js     # contas em JSON no disco + hash de senha (scrypt)
│   ├── sessao.js       # cookie de sessao assinado (HTTP e Socket.io)
│   ├── data/           # gerado em runtime: contas e segredo (fora do git)
│   └── map.js          # mapa (grid de tiles) e colisao, usado pelo servidor
├── public/
│   ├── index.html      # telas de login, avatar e escritorio
│   ├── manifest.webmanifest # deixa a sede instalavel como app
│   ├── sw.js               # service worker (so pra instalar, sem cache de codigo)
│   ├── offline.html        # tela de "sem conexao" do app instalado
│   ├── icones/             # icones do app (192, 512 e favicon)
│   ├── css/style.css   # visual claro no estilo Gather
│   ├── assets/lpc/      # sprites do boneco (LPC, ver CREDITS.md dentro da pasta)
│   └── js/
│       ├── map.js         # copia do mapa/colisao para uso no navegador
│       ├── pathfinding.js # BFS em grid p/ o clique contornar mesas/paredes
│       ├── character.js   # composicao/recolorizacao dos sprites do boneco
│       ├── network.js     # cliente Socket.io
│       ├── calls.js       # chamada de video/audio por proximidade (WebRTC)
│       ├── auth.js        # tela de login e chamadas /api
│       ├── entrada.js     # tela de entrada (checagem de camera/microfone)
│       ├── decorador.js   # painel de decoracao do escritorio
│       ├── chat.js        # canais e mensagens diretas
│       ├── creator.js     # logica da tela "montar boneco"
│       ├── game.js        # loop do jogo, render, movimento, mapa
│       └── main.js        # liga as telas (login -> avatar -> escritorio)
├── docs/
│   ├── CONTINUAR-AQUI.md   # handoff: estado atual, o que falta, armadilhas
│   ├── app-computador.md   # como instalar a sede como app (PWA)
│   ├── plano-chat.md       # como o chat foi pensado e validado
│   ├── plano-login.md      # como o login foi pensado e validado
│   └── plano-decorador.md  # como a decoracao foi pensada e validada
├── package.json
└── README.md
```

## Como rodar localmente

Pre-requisito: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
cd escritorio-virtual
npm install
npm start
```

O servidor sobe em **http://localhost:3500** (porta configuravel pela variavel de
ambiente `PORT`).

Na primeira vez, clique em **Criar conta**: nome, e-mail, senha e o **codigo da
sede** (`CODIGO_SEDE`, padrao `adm-solucoes` — troque no deploy). Depois disso o
login fica salvo por 30 dias, entao abrir o link ja cai direto no escritorio.

Para testar o multiplayer sozinho use **navegadores diferentes** (ou uma janela
anonima): duas abas do mesmo navegador dividem o cookie, ou seja, sao a mesma pessoa.

### Variaveis de ambiente

| Variavel | Padrao | Pra que serve |
|---|---|---|
| `PORT` | `3500` | porta do servidor |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | liga o **Entrar com o Google da ADM** (e a Agenda). Ligado, e-mail da ADM so entra por ele |
| `DIRETORIA_EMAILS` | — | e-mails que entram com o Google ja como diretoria, separados por virgula |
| `CODIGO_SEDE` | — (fechado) | codigo pra quem tem e-mail DE FORA criar conta |
| `ADMIN_CODE` | — (fechado) | codigo opcional no cadastro com senha que marca a conta como diretoria |
| `NODE_ENV` | — | com `production` o cookie de sessao vai como `Secure` (exige HTTPS) |

As contas ficam em `server/data/usuarios.json` (senhas com hash scrypt + salt) e o
segredo que assina as sessoes em `server/data/config.json`. A pasta esta no
`.gitignore`. Apagar `usuarios.json` zera todas as contas.

## Funcionalidades

- **Login com conta propria:** e-mail e senha, cadastro liberado pelo codigo da sede.
  A sessao dura 30 dias num cookie `HttpOnly`, entao normalmente ninguem precisa
  digitar senha de novo. O menu no rodape do trilho mostra a conta, deixa trocar o
  avatar e sair. Sem sessao valida o Socket.io recusa a conexao — ou seja, ninguem
  entra no escritorio (nem le mensagem de ninguem) sem estar logado.
- Tela de criacao de avatar: nome, tom de pele, cor da camisa, estilo/cor de cabelo e
  oculos, com preview animado e botao "aleatorio". Nome e aparencia ficam salvos na
  **conta**, no servidor, entao o boneco te acompanha em qualquer computador.
- **Chat da sede:** canais `#geral`, `#social` e `#projetos` mais mensagens diretas,
  com nao lidas, reacoes e formatacao (`**negrito**`, `_italico_`, `` `codigo` ``).
  As DMs sao identificadas pela conta, entao sobrevivem a recarregar a pagina e
  continuam na lista mesmo com a outra pessoa offline. Tem freio de ritmo (5 mensagens em
  3 segundos por conta) e contador perto do limite de 500 caracteres (`docs/plano-chat.md`).
- **Reunioes da sede:** marcadas na Agenda (sala, dia, hora, duracao), com chamada que
  funciona de qualquer canto do mapa e **lembrete** 5 minutos antes (`docs/plano-reunioes.md`).
  Quem e de fora (cliente, candidato) entra pelo **link da reuniao**: so na chamada dela,
  sem conta, numa sala de espera ate um membro deixar entrar
  (`docs/plano-reuniao-por-link.md`).
- Boneco com sprites reais estilo RPG (banco de assets aberto LPC - Liberated Pixel
  Cup), compostos em camadas (corpo, roupa, cabelo) e recoloridos no navegador conforme
  as escolhas da criacao de avatar — ver creditos em `public/assets/lpc/CREDITS.md`.
- Mapa baseado na planta real da sede da ADM Solucoes: Entrada, Sala principal e uma
  salinha (cada uma com porta e armario embutido) na frente, e uma area aberta com 5
  mesas de trabalho atras. Colisao impede atravessar mesas/armarios/paredes.
- Movimento por clique (point-and-click) com pathfinding: clique em qualquer ponto do
  escritorio e o boneco calcula um caminho contornando mesas/paredes/sofa para chegar la.
- Multiplayer real via Socket.io: posicao, aparencia e nome de todo mundo sao
  sincronizados, com interpolacao suave para os bonecos dos outros jogadores.
- **Chamada por proximidade:** clique no botao de camera (canto superior direito) pra
  ligar sua camera/microfone. Quando seu boneco chega perto do de outra pessoa (que
  tambem tenha a camera ligada), os navegadores se conectam direto via WebRTC e aparece
  uma bolha com o video dela acima do boneco — se afastar encerra a chamada sozinho.
  Sem TURN server configurado, em redes corporativas muito restritivas a conexao pode
  falhar (funciona bem em internet doméstica/4G normal).
- **Status de disponibilidade:** botao ao lado do indicador de conexao que alterna entre
  Livre (teal), Focado (ambar) e Em reuniao (vermelho) — vira um aneizinho colorido em
  volta do boneco, visivel pra todo mundo.
- **Aceno + reacoes rapidas:** barra de emojis na parte de baixo da tela (👋 👍 🎉 😂 ❤️ 👏)
  — clique e o emoji flutua acima do seu boneco por alguns segundos, pra todo mundo ver.
- **Minimapa:** no canto inferior direito, mostra o contorno do escritorio e um pontinho
  colorido pra cada pessoa (o seu em ambar).
- **Papel de administrador (diretoria):** quem esta em `DIRETORIA_EMAILS` e entra com o
  Google ja chega como diretoria. No cadastro com senha, o campo opcional "Sou da
  diretoria" aceita o `ADMIN_CODE` - sem valor padrao: sem a variavel, esse caminho fica
  fechado. Diretoria decora a sede e gerencia as contas. Quem e de fora (cliente, candidato) entra
  so na chamada de UMA reuniao, pelo link dela, sem conta - ver `docs/plano-reuniao-por-link.md`.
- Tela cheia com vinheta e iluminacao quente ("escritorio ao entardecer"), indicador de
  conexao e menu da conta flutuando como overlay discreto nos cantos.
- Interface e todo o texto em portugues (pt-BR).

## Deploy (para o time acessar por um link)

Como o backend precisa manter WebSocket (Socket.io) ativo, escolha um servico que rode
um processo Node persistente (não é um site estatico). As opcoes mais simples:

### Render (gratuito, mais simples)

1. Suba esta pasta para um repositorio no GitHub.
2. Em [render.com](https://render.com), crie um **New Web Service** apontando para o repo.
3. Configure:
   - **Root Directory:** `escritorio-virtual` (se o repo tiver outras pastas)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. O Render define a variavel `PORT` automaticamente — o servidor ja respeita isso.
   Adicione tambem `NODE_ENV=production` (cookie de sessao `Secure`), `CODIGO_SEDE`
   e `ADMIN_CODE` com os valores que a diretoria escolher.
   **Atencao:** no plano gratuito o disco do Render e efemero, entao
   `server/data/usuarios.json` some a cada novo deploy e todo mundo precisa se
   cadastrar de novo. Pra evitar isso, monte um **disco persistente** apontando pra
   `server/data`.
5. Ao final, o Render gera um link tipo `https://escritorio-adm.onrender.com` para
   compartilhar com o time.

No plano gratuito o servico "dorme" depois de um tempo sem uso e demora alguns segundos
para acordar no primeiro acesso do dia — normal, nao é bug.

### Railway

1. Suba o codigo para o GitHub.
2. Em [railway.app](https://railway.app), crie um projeto **Deploy from GitHub repo**.
3. Se o repo tiver mais coisas alem deste projeto, configure o **Root Directory** como
   `escritorio-virtual` nas settings do servico.
4. Railway detecta o `package.json` e roda `npm install` + `npm start` sozinho.
5. Gere um dominio publico em Settings → Networking → Generate Domain.

### Fly.io

Mais trabalhoso (usa Docker), mas funciona bem se voce ja tiver `flyctl` instalado:

```bash
cd escritorio-virtual
fly launch    # cria o app e um Dockerfile basico de Node quando perguntado
fly deploy
```

Garanta que a porta exposta no `fly.toml` bata com a que o servidor usa (`PORT`, padrao
3500) ou defina `PORT=8080` (padrao do Fly) nas variaveis de ambiente do app.

## Limitacoes atuais (por ser um MVP sem banco de dados)

- Se o servidor reiniciar, todo mundo cai e reconecta (as **contas** continuam, mas o
  estado de quem esta online e o **historico do chat** vivem so em memoria e somem).
- Nao ha "esqueci minha senha": sem servico de e-mail, a recuperacao teria que ser
  manual. Se alguem perder a senha, hoje a saida e a diretoria apagar a conta no
  `server/data/usuarios.json` e a pessoa se cadastrar de novo.
- O freio de forca bruta bloqueia o **IP** por 15 minutos depois de 10 senhas erradas.
  Numa rede compartilhada, isso pode pegar quem estiver do lado.
- **Camera/microfone exigem HTTPS** (ou `localhost`): navegadores bloqueiam
  `getUserMedia` fora de um contexto seguro. Rodando local em `http://localhost` funciona
  normalmente; qualquer um dos deploys sugeridos abaixo (Render/Railway/Fly) ja serve com
  HTTPS por padrao, entao nao precisa configurar nada extra.
- **Chamadas sem TURN server:** as chamadas usam so um STUN publico do Google para
  achar o caminho direto entre os dois navegadores. Funciona bem na grande maioria das
  redes, mas em redes corporativas com firewall/NAT bem restritivo a conexao pode nao
  fechar. Se isso acontecer com frequencia no dia a dia da ADM Solucoes, da pra
  adicionar um TURN server (ex: [Twilio STUN/TURN](https://www.twilio.com/docs/stun-turn)
  ou um [coturn](https://github.com/coturn/coturn) proprio) depois, sem mudar o resto do app.
- O acesso e por conta (e-mail + senha) e o cadastro pede o codigo da sede, mas o
  codigo e **compartilhado**: se ele vazar, qualquer pessoa cria conta. Trocar o
  `CODIGO_SEDE` invalida os cadastros novos, nao as contas ja criadas.

---

## Sobre este repositorio

Espelho de deploy da pasta `escritorio-virtual/` de um monorepo interno da ADM
Solucoes. E dele que o Render faz o deploy. A pasta `referencias/` fica so no
repositorio interno: sao prints de um produto de terceiro.
