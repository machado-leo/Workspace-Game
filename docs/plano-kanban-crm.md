# Plano: os quadros das diretorias na sede (Kanban do CRM)

O Caio disse que "cada diretoria tem seu quadro" e que o de Gente e Gestao estava
"cheio de coisas". So que a aba lia o **Trello**, e o time trabalha no **Kanban do
proprio CRM** desde agosto (o CRM trocou o Trello por um quadro nativo, com um
quadro por diretoria - `sql/042` a `sql/044`). No dia 21/09/2026 o banco tinha 5
quadros e 54 cartoes; o de Gente e Gestao sozinho tinha 36, o ultimo mexido 3 dias
antes. O Trello e que estava parado. Agora a aba mostra os quadros do CRM.

## 1. Decisao

- **A fonte e o Kanban do CRM**: um botao por quadro, cada pessoa com os quadros que
  o cargo dela libera la (secao 3).
- **Somente leitura.** O quadro continua sendo editado no CRM; a aba e pra bater o
  olho sem sair da sede, e "Abrir no CRM" leva ao quadro (e ao cartao).
- **O Trello continua possivel**, so pro que for listado em `TRELLO_QUADROS` (ver
  [plano-trello.md](plano-trello.md)). Com o Kanban do CRM ligado, o `TRELLO_BOARD_ID`
  de antes - o quadro unico e parado - deixa de aparecer ao lado dos quadros de
  verdade.

## 2. Como funciona

```
navegador --(socket)--> servidor da sede --(chave combinada)--> CRM --> banco
                        server/quadros.js       /api/kanban/externo/quadros
                        server/kanban-crm.js    (crm-adm)
```

A sede **nao le o banco do CRM** e nao recebe a chave de servico do Supabase (que
abre o banco inteiro): mesma linha do discador e da agenda. Ela bate numa **porta
que o CRM abriu so pra isso** e diz **em nome de quem**. O CRM decide o que aquela
pessoa ve e devolve os quadros prontos, de uma vez so (quadros, listas e cartoes) -
trocar de quadro na aba nao pede nada de novo.

## 3. Quem ve o que: a regra e a do CRM

A tela do CRM nao filtra nada: quem filtra e a RLS do banco (`sql/044`). A porta
le com a chave de servico, que ignora a RLS, entao refaz a mesma decisao - copia
fiel de `area_do_gc_atual()`, `gc_atual_e_gestor()` e `pode_ver_quadro()`:

| Cargo no CRM | Ve |
|---|---|
| Gestor (`Gestor ...`) ou Presidente | **todos** os quadros |
| Colaborador de uma area | o quadro **da propria area** |
| Sem cargo que o CRM reconheca | nenhum (a aba diz pra falar com um gestor) |

O quadro da area da pessoa vem **primeiro** (quem abre a aba cai no dele); o resto,
em ordem alfabetica. Ser "diretoria" na sede **nao muda nada** aqui: quem decide e o
cargo no CRM. O teste do CRM (`scripts/testar-kanban-externo.mjs`) confere as duas
regras contra a tabela de cargos do app, e se uma mudar a outra tem que mudar junto.

## 4. Seguranca

- **O e-mail que vai pro CRM e sempre o da conta logada**, e so de conta com **e-mail
  provado** (entrou com o Google da ADM, ou confirmou pelo link) - a mesma regra do
  discador. Conta criada so com senha nao prova nada (qualquer um digita
  `fulano@admsolucoes.com.br`): nem chega a gerar pedido ao CRM, e a aba manda a
  pessoa entrar uma vez com o Google. O e-mail **nunca** vem de dentro do pedido do
  navegador, e nao mora no `player` (que vai pra todo mundo no `init`).
- **A chave desta porta so abre a leitura do Kanban.** Nao e a do discador: vazar uma
  nao entrega a outra. Sem a chave configurada no CRM, ou com menos de 32 caracteres,
  a porta fica **fechada** (nunca "aberta pra qualquer um").
- **O que sai pela porta**: titulo, etiquetas (nome e cor), nomes dos membros, prazo
  (o dia), e contadores (checklist, comentarios, anexos) mais um "tem descricao". **Nao
  sai** descricao, texto de comentario, link de anexo, e-mail de ninguem.
- **Uma pessoa nunca ve o quadro de outra.** O cache da sede e por pessoa, e uma chave
  de quadro forjada (de um quadro que a pessoa nao tem) cai no primeiro que ela tem.
- **Perdeu o acesso, perdeu o quadro**: se o CRM passa a responder 403 (mudou de cargo,
  saiu da ADM), o que estava guardado pra ela e apagado - o "ultimo quadro bom" nunca
  aparece pra quem o CRM acabou de recusar. Quem esta **inativo** no CRM tambem e
  recusado (a conta do Google dele pode continuar abrindo).
- O que o CRM manda e **conferido campo a campo** antes de ir pra tela, e os enderecos
  dos cartoes sao montados aqui a partir do `CRM_URL` - nunca um endereco que veio na
  resposta.
- A chave nunca aparece em mensagem de erro, log nem no `/api/diagnostico`.

## 5. O que a aba mostra

Em cada cartao, na ordem da tela do CRM: etiquetas, titulo, o prazo, um `≡` (tem
descricao), o checklist (`✓ 2/5`, verde quando completo), comentarios, anexos e as
iniciais dos membros. Coluna com mais de 100 cartoes mostra os 100 primeiros, o
numero do topo continua sendo o total, e um link diz quantos ficaram de fora.

O **prazo do CRM e um dia**, e nao um instante: `2026-09-25` e dia 25 em qualquer
fuso. Lido como instante, no Brasil viraria dia 24 as 21h - o mesmo erro que a tela
do CRM ja tinha corrigido. Cartao com prazo cumprido nao aparece como "atrasado".

## 6. Como ligar

1. **Publicar o CRM com a porta nova.** O codigo esta em `crm-adm`
   (`src/app/api/kanban/externo/`, `src/lib/kanban-externo*.ts`, e a politica de
   limite em `src/lib/rate-limit.ts`). Sem isso a aba diz "o CRM ainda nao tem a
   porta do Kanban".
2. **Gerar a chave** (32 caracteres ou mais). **Quem digita e o Caio:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **No CRM (Vercel)**: `KANBAN_CHAVE_ESCRITORIO` = a chave, e publicar de novo.
4. **Na sede** (`escritorio-virtual/.env` local, e o painel do Render): `CRM_URL` = o
   endereco do CRM, sem barra no fim (o mesmo do discador), e `CRM_CHAVE_KANBAN` = a
   MESMA chave. A sede aceita tambem o nome do CRM, `KANBAN_CHAVE_ESCRITORIO` (e a mesma
   chave, e o nome e facil de trocar no painel); se os dois existirem, vale o `CRM_CHAVE_KANBAN`. No Render, junte com as outras variaveis numa vez so: cada "salvar"
   reinicia o site, e no plano free isso zera `server/data/` (ver [deploy.md](deploy.md)).
5. **Conferir**: o arranque diz `Kanban do CRM: ligado`; o `/api/diagnostico` diz
   `integracoes.kanban: true`; e a aba abre com os quadros.
6. **Cada pessoa** precisa entrar na sede com o Google da ADM, e o e-mail dela tem de
   ser o mesmo cadastrado no CRM (`gcs.email`).

**Ver na propria maquina, sem publicar nada**: rode o CRM (`crm-adm/dev.cmd`: ele sobe na
3000, ou na 3001 se a 3000 estiver ocupada) e a sede com `npm start` - o `npm run dev` nao
tem login, e a conta dele nao tem e-mail provado, entao a aba pediria pra entrar com o
Google. O `CRM_URL` do `.env` da sede tem que ter a porta em que o CRM subiu, e a
`KANBAN_CHAVE_ESCRITORIO` (no `.env.local` do CRM) e a `CRM_CHAVE_KANBAN` (no `.env` da
sede) tem que ter o mesmo valor.

Sem as duas variaveis a aba segue como era: so o Trello listado, ou o aviso de "nao
foram ligados". Numa sede de cliente nada disso existe.

## 7. Quando falha

A aba diz o que houve **e o que fazer**, sem a chave nem o endereco na frase:

| Situacao | O que a aba diz |
|---|---|
| Conta sem e-mail provado | "Entre uma vez com o Google da ADM ... e isso que prova ao CRM quem esta olhando" |
| Chave da sede diferente da do CRM (401) | "A sede e o CRM nao estao com a mesma chave do Kanban. Avise a diretoria." |
| O CRM ainda nao foi publicado (404) | "O CRM ainda nao tem a porta do Kanban: falta publicar a versao nova do CRM." |
| O CRM sem `KANBAN_CHAVE_ESCRITORIO` (503) | a frase do CRM: "nao esta ligado neste CRM" |
| E-mail que o CRM nao conhece, ou inativo (403) | a frase do CRM ("Seu e-mail nao tem acesso ao CRM. Peca a um gestor pra liberar o ...") |
| `CRM_URL` que redireciona (http no lugar de https, ou um "www") | "O endereco do CRM (CRM_URL) redireciona pra outro lugar" |
| Limite de consultas (429), demora, sem rede, resposta estranha | uma frase pra cada um |
| Cargo sem quadro nenhum | "Nenhum quadro do Kanban foi liberado pra voce no CRM (o seu cargo la define quais)" |

Se o CRM cair **depois** de a pessoa ja ter visto os quadros, a aba mostra o ultimo
quadro que deu certo dizendo que e velho - por no maximo 6 horas. Se o Trello
listado estiver ligado, ele segue funcionando e o aviso do CRM aparece junto.

## 8. Cache e "Atualizar"

Cache de **1 minuto por pessoa**. O botao **Atualizar** passa por cima dele, mas no
maximo uma vez a cada 10 s por pessoa: a sede inteira chega no CRM pelo mesmo IP, e o
CRM limita o que passa por ele. O CRM tem uma politica **propria** pra esta porta
(`kanban-escritorio`, 900 a cada 15 min): no padrao de escrita (20 a cada 15 min) o
quadro travaria pro time com meia duzia de cliques. Cliques juntos viram um pedido so.

## 9. Arquivos

| Arquivo | Papel |
|---|---|
| `server/kanban-crm.js` | a ponte: pede ao CRM, confere a resposta, cache por pessoa, mensagens de falha |
| `server/quadros.js` | junta o Kanban do CRM e o Trello numa lista so e entrega o quadro escolhido |
| `server/index.js` | o evento `trello-pedir` (o nome e de quando so havia o Trello): decide `email` e `diretoria` pela conta |
| `server/auth.js` | `/api/diagnostico`: `kanban` e `trello` |
| `public/js/trello.js` | a aba: botoes de quadro, colunas, selinhos, "Atualizar" |
| `testes/quadros-crm.js` | a ponte e a sede de verdade (socket), com um CRM de mentira |
| `testes/trello-aba.js` | a tela, com um DOM de mentira |
| `crm-adm/src/app/api/kanban/externo/` | a porta (no CRM) |
| `crm-adm/src/lib/kanban-externo-regras.ts` | as regras de cargo e a montagem, sem banco |
| `crm-adm/src/lib/kanban-externo.ts` | a leitura do banco |
| `crm-adm/scripts/testar-kanban-externo.mjs` | o teste das regras do CRM |

## 10. Testado (21/09/2026)

| O que | Resultado |
|---|---|
| `testes/quadros-crm.js` | 82 conferencias: a ponte, o cache, as falhas, o "velho", o isolamento entre pessoas, a sede de verdade pelo socket (e-mail so da conta e so provado, nada de e-mail no `init`) |
| `testes/trello-aba.js` | 49 conferencias (a tela: origem, selinhos, coluna grande, prazo em dia no fuso do Brasil) |
| `node scripts/testar-kanban-externo.mjs` (CRM) | 49 conferencias das regras |
| Prova de mutacao | 55 mutantes (43 na sede, servidor e tela, e 12 no CRM), todos derrubados - um sobreviveu na primeira rodada (o aviso de "quadro velho" nao chegava na aba) e ganhou o teste que faltava |
| Bateria completa da sede | 37 arquivos, 0 falhas |
| `tsc --noEmit` e `eslint` no CRM | limpos |
| **Contra o CRM de verdade** (Next local + banco de verdade) | os 54 cartoes conferidos um a um contra o banco (titulo, ordem, prazo, etiquetas, membros, checklist, comentarios, anexos); gestor ve 5 quadros com o da propria area primeiro; colaborador de Gente e Gestao so o dele (36 cartoes) e nenhum cartao de outro quadro; colaborador de Marketing so o dele; descricao e e-mail nunca saem; sem chave, chave errada ou curta, corpo torto e e-mail desconhecido recusados; 30 pedidos seguidos passam pelo teto proprio da porta |
| No navegador, sede -> CRM local -> banco | o quadro de Gente e Gestao com as 36 cartas em 7 colunas; gestor com os 5 botoes; "Atualizar" busca de verdade |

**Nao testado**: producao (depende de publicar o CRM e das duas chaves) e o caso de
uma pessoa **inativa** ou sem acesso no CRM contra dados de verdade (nao ha nenhuma
no banco hoje; a regra esta no teste do CRM e na porta).

## 11. Fora de escopo

- Criar, mover ou editar cartao pela sede. Continua so leitura.
- Comentarios e descricao dos cartoes (so o aviso de que existem).
- O calendario de cada diretoria "lincado" ao quadro dela - a agenda continua por
  pessoa (ver `docs/CONTINUAR-HOSPEDAGEM.md`, secao 8).
