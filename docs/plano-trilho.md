# Trilho e painéis da sede: as 7 mudanças de 24/09/2026

O pedido: "vamos mexer na parte lateral e os design do escritório, tem funções que precisa" —
"não na parte do jogo em si, mas sim nas funcionalidades". Levantamento feito, sete itens
aprovados ("pode começar pelo 1 e seguir até o 7"), um commit por item, cada um com teste.

| # | O que mudou | Commit | Teste |
|---|---|---|---|
| 1 | Um painel do trilho por vez; o botão marcado é o do painel da frente; Esc fecha | `bca6564` | `testes/paineis.js` |
| 2 | Nome embaixo de cada ícone; no celular, botão "Mais" (WhatsApp, Discador, Estante, Diretoria, Decorar) | `366acff` | `testes/paineis.js` |
| 3 | **Pessoas** no lugar de Buscar + Salas: lista por sala, status, Acenar/Mensagem/Ir até; o aceno chega NA pessoa | `e4cef77` | `testes/pessoas.js` |
| 4 | Um canal de chat por diretoria (seção "Diretorias") | `1617a8e` | `testes/canais.js` |
| 5 | Prazos dos cartões do Kanban do CRM na Agenda (faixa na grade + lista, "Só os meus") | `ad9a598` | `testes/prazos.js` |
| 6 | Painel **Diretoria**: decorar a sede, membros, situação das integrações | `34cb851` | `testes/diretoria.js` |
| 7 | **Central de avisos**: menção, DM, convite, lembrete, aceno e visitante ficam guardados | `11f9acf` | `testes/central.js` |

## Como cada um se comporta (o que não é óbvio)

- **Coordenador de painéis** (`public/js/paineis.js`): todo painel se registra com nome e
  botão. Abrir um fecha o outro. Dois painéis podem dividir um botão (o decorador da
  diretoria acende o "Diretoria").
- **Aceno** (`acenar` no socket): só a pessoa recebe, com o nome que o servidor sabe. Freio:
  1 por par a cada 10 s e 5 por conta a cada 30 s.
- **Canais das diretorias** (`server/canais.js`): abertos pra sede toda. Na sede da ADM
  vêm Comercial, Marketing, Gente e Gestão, Finanças e Presidência; sede de cliente só com
  `CANAIS_DIRETORIAS`. Trocar o nome começa um canal novo (o histórico é por id).
- **Prazos** (`server/prazos.js`): os mesmos quadros da aba Quadros, mesma porta do CRM, só
  com e-mail provado, mesmo cache de 1 min. "Meu" é **pelo nome** (o CRM manda os membros
  do cartão pelo nome, não pelo e-mail): "Caio" bate com "Caio Lucas"; "Caio Lucas" não
  bate com "Caio Silva".
- **Diretoria**: só a diretoria vê o botão. Pra ela, o "Decorar" saiu do trilho (fica no
  painel); quem só personaliza a mesa continua com "Minha mesa". "Membros da sede" saiu de
  Conta > Mais opções. A situação lê o `/api/diagnostico` (só sim/não).
- **Central de avisos**: fica **no navegador**, por conta, os últimos 50. O que chegou com
  a sede fechada não aparece (a tela diz isso). Guardar no servidor seria o próximo passo,
  se fizer falta.

## Decidido em 25/09

- **Spotify**: "cada um tivesse o seu e logasse na sua conta e escutasse suas músicas" e
  "dá pra ficar um pop-up no escritório?". O botão **Spotify** abre um mini-player
  flutuando no canto de baixo do escritório: o player incorporado oficial do Spotify
  (open.spotify.com/embed, o único iframe que a CSP deixa abrir). Cada um cola o link das
  próprias playlists, álbuns ou podcasts (Compartilhar > Copiar link); a sede guarda até 8
  por conta, neste navegador, com nome e capa (o servidor pede ao oEmbed do Spotify, sem chave:
  `server/spotify.js`). O botão **Abrir meu Spotify completo** fica em destaque no
  mini-player (biblioteca, curtidas e busca de cada um, numa janela ao lado). Minimizar vira
  uma pílula e não para a música; o ✕ fecha e para. Visual escuro, como os controles que
  flutuam no mapa (refeito em 25/09 depois de "tá feio esse pop-up").
  **Arrastável** ("dá pra mexer o pop-up e colocar em lugares que a pessoa quiser"): pelo
  topo ou pela alça de pontinhos; o lugar fica guardado no navegador como fração do espaço
  livre (não sai da tela, não cobre o trilho, continua no mesmo canto se a janela muda).
  Dois cliques na alça ou "Voltar pro canto" no menu. No celular fica fixo acima da barra.
  Quem está logado no Spotify no mesmo navegador ouve inteiro (com Premium é certo; na conta
  grátis o Spotify pode tocar só 30 s); sem login, 30 s. O login é NA PÁGINA do Spotify, pelo
  link "entre na sua conta" (janela ao lado, `public/js/janela.js`). Não dá: Músicas Curtidas
  e a biblioteca inteira (só pela API, limitada a 5 pessoas). `public/js/spotify.js`,
  `testes/spotify.js`.
- **Canais das diretorias**: ficam como estão (abertos pra sede toda).

## Ficou pra decidir (do Caio)

- **Chat, etapa 4**: respostas em fio (threads). Menção com `@nome` já avisa (e fica na central).
- **Publicar**: nada disto está no ar. `npm --prefix escritorio-virtual run espelhar` sobe
  o espelho e o Render publica.

## Spotify: como vincular (pesquisa de 24/09/2026)

| Caminho | O que dá | Precisa | Veredito |
|---|---|---|---|
| **Player embutido** (open.spotify.com/embed) | Uma "Rádio da sede": a playlist da ADM tocando num painel ou num objeto do mapa. Cada um ouve no próprio fone | Nada no Spotify. Na sede: liberar `frame-src https://open.spotify.com` na CSP. Quem não está logado no Spotify ouve só 30 s | **Recomendado** |
| **Player + iFrame API** | O mesmo, com um "DJ": quando ele troca a música, a dos outros troca junto (sincronia aproximada, pelo socket) | O de cima + liberar o script da iFrame API. O play automático é bloqueado sem clique no Safari | Viável, se quiserem ouvir junto |
| **Jam do Spotify** | Todo mundo ouvindo a mesma fila, de verdade | Nada: é do app do Spotify. Na sede, no máximo um botão "abrir Jam" com o link colado no #social | Zero código |
| **Web API / Web Playback SDK** ("o que estou ouvindo", tocar dentro da sede) | Status de música no boneco, player completo | App no painel de desenvolvedor do Spotify, dono com Premium e **no máximo 5 usuários** em modo de desenvolvimento (desde 11/02/2026). Liberar mais exige empresa com 250 mil usuários ativos | **Inviável** pra um time de ~30 |

Fontes: [guia de migração de fev/2026](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide),
[TechCrunch, 06/02/2026](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/),
[iFrame API](https://developer.spotify.com/documentation/embeds/references/iframe-api),
[prévia de 30 s no embed](https://community.spotify.com/t5/Other-Partners-Web-Player-etc/Spotify-Play-Button-30-second-limit/td-p/4552931).
