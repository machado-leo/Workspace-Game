# Entrar por link, sem conta

> **SUBSTITUIDO em 20/09/2026** por `docs/plano-reuniao-por-link.md`. Este modelo
> (uma conta de visitante que anda pela sede inteira) foi retirado: na pratica o
> visitante lia os tres canais do chat e entrava na chamada de qualquer reuniao, e
> fechar isso checagem por checagem nao se sustenta. Hoje quem e de fora entra so
> na chamada de UMA reuniao, pelo link dela, sem conta e sem cookie. O texto abaixo
> fica como historia - nao descreve mais o que o codigo faz.

Escrito em 11/09/2026.

## 1. O problema

Hoje a sede exige conta: e-mail, senha e o codigo da sede. Pra mostrar o
escritorio pra um cliente, pra um calouro ou pra banca, **cada pessoa da plateia
teria que criar conta** - e receber o codigo da sede, que e justamente o que
controla quem entra na empresa. Na pratica isso mata a demonstracao.

O Gather resolve com link de convidado: voce manda a URL, a pessoa digita um
nome e ja esta dentro.

## 2. O que NAO vamos abrir mao

O login existe porque fechou um furo real: antes, o cliente dizia quem era no
`join` e dava pra ler DM dos outros (ver `docs/plano-login.md`). Convidado nao
pode reabrir isso.

Entao:

- O convidado continua tendo **conta de verdade no servidor**, com `uid` proprio.
  O cliente segue sem poder dizer quem e.
- O convite e **assinado pelo servidor** (HMAC com o mesmo segredo da sessao).
  Nao da pra forjar um link.
- Convidado **nunca** e diretoria, **nao decora** o escritorio, **nao pega mesa**
  e **nao mexe na estante**. Ele visita.

## 3. O convite

`server/convites.js`. Token sem estado, no mesmo espirito do cookie de sessao: o
proprio valor carrega o que precisa e a assinatura garante que ninguem editou.

```
corpo    = base64url( geracao . expiraEm . quemCriou )
token    = corpo + "." + HMAC-SHA256(corpo, segredoSessao)
```

- **`expiraEm`**: 24 horas por padrao. Link velho para de funcionar sozinho.
- **`geracao`**: um numero guardado em `config.json`. "Invalidar os links"
  incrementa ele, e **todo link ja distribuido morre de uma vez**. E o unico
  jeito de revogar sem guardar a lista de tokens emitidos - e vale a pena
  porque link de convite vaza em grupo de WhatsApp.
- **`quemCriou`**: o uid de quem gerou, pra dar pra saber de quem veio o link.

## 4. A conta de convidado

Criada no momento em que a pessoa abre o link e diz o nome.

| Campo | Valor | Por que |
|---|---|---|
| `convidado` | `true` | e o que as checagens olham |
| `senhaHash` / `salt` | `null` | conta sem senha: ninguem loga nela pelo formulario |
| `isAdmin` | `false` | sempre, nao ha como pedir outra coisa |
| `email` | `convidado-<id>@local` | preenche o campo sem colidir com e-mail de verdade |

`senhaConfere()` recusa de saida quando nao ha hash. Sem esse cuidado, uma conta
sem senha e uma conta que qualquer um entra.

**A sessao do convidado dura 12 horas**, nao 30 dias como a de membro. Fechou a
apresentacao, acabou o acesso.

**Limpeza:** no arranque, conta de convidado com mais de 7 dias e descartada.
Sem isso o `usuarios.json` cresceria pra sempre - uma conta por visitante.

## 5. O caminho da pessoa

1. Diretoria abre o menu da conta > **Convidar visitante** > copia o link.
2. Visitante abre `https://sede/?convite=TOKEN`.
3. A tela de login entra em **modo convidado**: some a senha, some o codigo da
   sede, fica so **Nome** e o botao "Entrar como visitante".
4. `POST /api/convite/entrar` valida o token, cria a conta, poe o cookie.
5. **A URL e limpa** (`history.replaceState`). Sem isso, um F5 gastaria o link de
   novo e criaria uma segunda conta de convidado pra mesma pessoa.
6. Dai em diante e o fluxo normal: monta o boneco, confere camera, entra.

## 6. Resultado dos testes

### Automatico - `testes/convidado.js`, 25 checagens, 0 falhas

Sobe o servidor de verdade numa pasta de dados descartavel (`DATA_DIR`) e
conversa com ele por HTTP. Nao e teste de funcao solta de proposito: o que pode
dar errado aqui e a costura - um token que o servidor aceita mas cuja conta
nasce com poder demais, ou uma rota que esqueceu de checar.

| Grupo | O que ficou provado |
|---|---|
| Gerar | sem sessao da 401; so diretoria gera; o link ja vem montado e com validade no futuro |
| Forjar | token com a assinatura mexida: 403. Token inventado: 403 |
| Entrar | entra com o nome que digitou, marcado `convidado`, **nunca** `isAdmin`, e com cookie |
| Senha | a conta do visitante **nao** loga pelo formulario, nem com senha vazia nem chutando |
| Poder | visitante nao gera convite (403) e nao escreve na estante (403), mas **le** a estante (200) |
| Revogar | depois de invalidar, o link antigo da 403, **quem ja entrou continua dentro**, e o link novo ja funciona |

### No navegador

| O que | Resultado |
|---|---|
| Menu da conta da diretoria | "Convidar visitante" aparece; o painel gera o link e mostra "Vale ate 12/09/2026 as 07:11" |
| Abrir `/?convite=TOKEN` | a tela entra em modo visita: some aba, e-mail, senha e codigo da sede; fica Nome + "Entrar como visitante" |
| Depois de entrar | a URL volta pra `/` sozinha - o F5 nao gasta o link de novo |
| Fluxo | avatar (com o nome ja preenchido) -> entrada -> andando na sede |
| Menu do visitante | mostra "Visitante" no lugar da data; **sem** "Convidar visitante" e **sem** "Largar minha mesa" |
| Pegar mesa | `Network.reivindicarMesa(10,4)` nao pega: o servidor recusa e o botao de largar continua escondido |

### O que este teste NAO cobre

O freio de forca bruta por IP e compartilhado com o login (`server/auth.js`) e ja
existia; nao refiz teste dele aqui.
