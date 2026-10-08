# Plano: calendario da sede

Referencia: `referencias/Captura de tela 2026-09-06 111656.png` (o Calendar do
Gather).

## 1. Decisao: a sede fala direto com o Google

Passou por tres versoes. Vale registrar, porque o caminho explica a escolha:

1. **Calendario interno** (agenda propria em JSON). Descartado: o Caio lembrou
   que o CRM ja tinha calendario.
2. **Ler a agenda pelo CRM** (rota nova la, segredo compartilhado). Chegou a ser
   implementado e testado.
3. **A sede falando direto com o Google** - decisao final do Caio.

Entao a sede tem **OAuth proprio e cofre de token proprio**. Cada pessoa conecta
a propria conta Google aqui dentro, uma vez.

### Por que nao lemos os tokens do Supabase do CRM

Era o atalho obvio (os tokens ja estao la), e foi recusado de proposito:

- Exigiria a **chave de servico do Supabase** dentro da sede. Essa chave ignora
  RLS: abriria o banco inteiro do CRM a partir de um app menor, que ainda tem
  modo `SEM_LOGIN` e guarda coisas em JSON.
- Os dois apps renovando o **mesmo refresh token** disputariam a mesma linha, e
  uma renovacao pode invalidar a outra.

Com OAuth proprio, a sede so tem token de calendario, so de leitura, e o CRM
continua dono do dele. O preco: cada pessoa conecta o Google duas vezes (uma no
CRM, outra aqui) e o redirect URI da sede precisa ser registrado no mesmo
projeto do Google Cloud.

### O que a sede pede ao Google

Escopo **`calendar.readonly`** e mais nada. A sede mostra a agenda; nunca
escreve nela.

## 2. Variaveis

| Variavel | Pra que |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | mesmas credenciais do projeto do Google Cloud que o CRM ja usa |
| `SITE_URL` | endereco publico da sede, pra montar o redirect URI |

Sem as duas primeiras o painel abre e avisa que nao esta configurado, em vez de
quebrar. O servidor imprime o redirect URI no arranque, pra registrar no Google
Cloud sem adivinhar.

## 3. Como funciona

```
navegador -> servidor da sede -> Google Calendar API
              (cache 60s)        (token da propria pessoa)
```

- `/api/google/conectar` manda pro consentimento do Google, com `state`
  aleatorio contra CSRF. Quem esta conectando **sai da sessao**, nunca de um uid
  na URL.
- `/api/google/callback` troca o codigo por token e guarda em
  `server/data/google.json` (fora do git).
- `agenda.js` junta os eventos de todo mundo que conectou, com cache de 60s -
  senao cada pessoa abrindo o painel viraria uma chamada ao Google por pessoa
  conectada.
- Renovacao de token e serializada por pessoa: duas chamadas simultaneas nao
  gastam dois refresh.

## 4. O que entra

1. **Painel lateral + grade da semana**, no visual da referencia: navegacao
   `<` `>` `Hoje`, mes por extenso, sete colunas, linhas de hora e a **linha
   vermelha do horario atual**.
2. **Eventos do time na grade**, cor por pessoa (a mesma ideia do CRM: cor e
   identidade da pessoa, nao status).
3. **Aviso de "comeca em 5 minutos"** pros seus proprios eventos.

## 5. O que NAO entra agora

- **Criar evento pela sede.** O CRM ja tem `criarEventoReuniao`, entao da pra
  fazer depois pelo mesmo caminho - mas escrever na agenda de alguem e um passo
  maior que ler, e merece a sua confirmacao antes.
- Ligar evento a uma sala do mapa. Evento do Google nao tem `salaId`, entao o
  "Entrar" que caminha ate a sala nao se aplica direto. Ideia pra depois: a
  sede deixar fixar um evento numa sala.
- "Meeting Notes" (a segunda aba da referencia).
- Reuniao recorrente aparece como evento normal, ja expandido pelo Google
  (`singleEvents: true`).

## 6. Arquivos

| Arquivo | Papel |
|---|---|
| `server/google.js` | OAuth, cofre de token, renovacao e leitura de eventos |
| `server/agenda.js` | junta a agenda de quem conectou, com cache |
| `server/index.js` | rotas `/api/google/*` e o evento `agenda-pedir` |
| `public/js/calendario.js` | painel, grade da semana, aviso, botao de conectar |
| `public/index.html` / `style.css` | botao no trilho e estilos |

`server/reunioes.js` fica escrito porem desligado (era a versao 1). A rota
`crm-adm/.../calendario/sede/route.ts` e o `server/agenda-crm.js` (versao 2)
**foram removidos** - deixar um endpoint com segredo compartilhado sem ninguem
usando e risco a toa.

## 7. Resultado dos testes

Testado em 06/09/2026, no navegador.

| O que | Resultado |
|---|---|
| Grade da semana desenha | ok - 7 colunas, regua 7h-21h, mes por extenso |
| Evento posicionado na hora certa | ok - testado na versao 2 com 5 eventos |
| Cor por pessoa | ok |
| Circulo vermelho no dia de hoje | ok |
| Linha vermelha do horario atual | ok, com etiqueta da hora |
| `/api/google/status` | ok nos tres estados (nao configurado, configurado sem conectar, e o painel reagindo a cada um) |
| URL de consentimento | ok - escopo `calendar.readonly`, `access_type=offline`, `state` aleatorio |
| `state` invalido no callback | ok - recusa e volta pra `/?agenda=erro` |
| Sem `GOOGLE_CLIENT_ID` | ok - painel avisa, sem quebrar |
| Console | limpo |

### Dois bugs achados no teste, os dois ja corrigidos

1. **Nome do dia por extenso transbordava.** A coluna aqui tem ~57px (o painel
   divide espaco com o trilho e a barra lateral), e "domingo" invadia "segunda".
   Passou a usar abreviacao na grade; a lista lateral segue com o nome inteiro.
2. **Metade do calendario estava invisivel.** Eu escrevi o CSS usando `--erro` e
   `--teal`, que **nao existem mais** - o tema virou claro e a paleta mudou pra
   `--vermelho`, `--verde`, `--indigo`. O circulo do dia de hoje e a linha do
   horario atual ficavam sem cor de fundo, e as linhas da grade eram brancas
   sobre painel branco. **Licao: conferir as variaveis do `:root` antes de
   escrever CSS novo** - o tema mudou no meio do projeto.

### Ainda nao testado de verdade

O fluxo completo de OAuth (consentir no Google, voltar com o codigo, listar
evento real) **nao foi exercitado** - eu nao faco login em conta Google. Falta:
registrar o redirect URI no Google Cloud, por `GOOGLE_CLIENT_ID`/`SECRET`, e
conectar uma conta pra ver evento de verdade na grade.
