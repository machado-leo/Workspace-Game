# E-mail: confirmar o cadastro e trocar a senha

Duas coisas, e so elas:

1. **Confirmar o e-mail de quem se cadastra com senha.** Sem isso, o cadastro
   nao confere nada: qualquer um digita `fulano@empresa.com.br` e entra como
   fulano. Com o Google ligado a sede ja fica fechada (o Google prova o e-mail);
   o e-mail fecha tambem as sedes sem Google (`--sem-google`, cliente de fora).
2. **"Esqueci minha senha" por link.** Antes, dependia de alguem da diretoria
   gerar uma senha provisoria e passar pro dono na mao.

**Sem configurar, tudo funciona como antes**: cadastro entra na hora, e quem
esquece a senha pede pra diretoria. Codigo: `server/email.js` (envio e textos),
`server/links.js` (os links), rotas em `server/auth.js`. Teste de ponta a ponta:
`testes/email.js`.

## Como fica pra quem usa

- **Cadastro:** nome, e-mail e senha, como sempre. A tela responde "Quase la!
  Mandamos um link pra ..." e **nao entra ainda**.
- **O link do e-mail** abre a tela de login com "Falta so um passo". A pessoa
  entra com o e-mail e a senha do cadastro, e o e-mail fica confirmado. Dai em
  diante, entra so com a senha.
- **Tentou entrar sem confirmar:** nao entra, e o link vai de novo (no maximo um
  por minuto). O link vale 24 horas; vencido, e so tentar entrar que vem outro.
- **Esqueci minha senha** (na tela de login, embaixo): a pessoa digita o e-mail
  no campo de cima e clica em "Mandar link de senha nova". O link vale **1
  hora e uma vez so**. Senha nova salva: ela ja entra, e qualquer outro aparelho
  logado naquela conta sai na hora.
- **A diretoria** ve na lista de membros quem esta com "e-mail nao confirmado".
  "Redefinir senha" numa conta assim vale como confirmacao: a diretoria entrega
  a provisoria pra pessoa que ela conhece (e o caminho de quem nunca recebeu o
  e-mail).

## Por que o link, sozinho, nao entra

O comum e "clicou no link, entrou". Aqui nao, de proposito - a conta so e
confirmada com o link **e** a senha do cadastro. Dois motivos:

- **Filtro de e-mail de empresa abre os links sozinho.** O Safe Links da
  Microsoft (e parecidos) visita todo link que chega, pra ver se e perigoso. Se
  abrir o link bastasse, alguem cadastraria `fulano@cliente.com.br` com uma
  senha **dele**, o filtro do cliente "clicaria" no link, e a conta estaria
  confirmada - com a senha do outro.
- **Mesmo sem filtro:** quem cadastra o e-mail de outra pessoa so precisaria
  que ela clicasse ("confirme seu e-mail", ela confirma). A conta dela teria uma
  senha que ele sabe.

Com o link + a senha, confirmar exige as duas metades: a caixa de entrada e a
senha escolhida no cadastro. Quem achar o proprio e-mail cadastrado por outra
pessoa usa "Esqueci minha senha" - o link vai pra ele, e a senha do outro deixa
de valer. (Ou entra com o Google, que apaga a senha antiga.)

## As regras, e onde estao provadas (`testes/email.js`)

| Regra | Por que |
|---|---|
| Links assinados (HMAC com o `SESSION_SECRET`), com validade e finalidade | ninguem inventa nem edita; nada guardado no servidor, reiniciar nao invalida link |
| O link de senha leva a impressao da senha atual | trocou a senha, todo link antigo morre - inclusive ele mesmo: uso unico |
| O link de confirmar nao troca senha, e vice-versa | a finalidade vai assinada |
| "Esqueci minha senha" responde IGUAL pra e-mail com e sem conta, e envia depois de responder | nem a resposta nem o tempo dela entregam quem tem conta aqui |
| Um e-mail de cada tipo por conta por minuto; 5 pedidos de senha nova por IP a cada 15 min; link invalido conta no freio de forca bruta | ninguem enche a caixa de entrada de alguem nem gasta a cota do provedor |
| O nome digitado no cadastro nao vai no e-mail | quem cadastrou pode nao ser o dono do e-mail: seria um jeito de mandar texto qualquer, com a nossa assinatura, pra caixa de outra pessoa |
| Provedor fora do ar no cadastro: a conta e desfeita (erro 502) | senao ficaria uma conta que nunca entra, com o e-mail preso |
| Conta criada antes do e-mail existir (ou com ele desligado) continua entrando | ligar o e-mail nao tranca ninguem fora |
| E-mail desligado depois: quem ficou pendente entra | sem como confirmar, prender a pessoa nao protege ninguem |
| Em producao sem `SITE_URL`: e-mail desligado (o arranque avisa) | o link iria pra `localhost`, que nao abre em lugar nenhum, e todo cadastro ficaria esperando |
| `EMAIL_API_TESTE` so vale fora de producao | e o que manda os e-mails pro provedor falso do teste; em producao ninguem desvia os e-mails mexendo numa variavel |
| O remetente sai com o nome da sede (`NOME_SEDE`) | cliente recebe e-mail "da Acme Consultoria", e nao da ADM |

## Configurar

### 1. Escolher o provedor

Os dois funcionam do mesmo jeito (API HTTP, sem instalar nada) e tem plano
gratis que cobre com folga so confirmacao e senha nova - confira os limites
atuais no site de cada um:

- **Resend** - resend.com. `EMAIL_PROVEDOR=resend`, `EMAIL_CHAVE` = a API key
  (comeca com `re_`).
- **Brevo** - brevo.com. `EMAIL_PROVEDOR=brevo`, `EMAIL_CHAVE` = a API key v3
  (SMTP & API > API Keys).

### 2. Verificar o dominio que envia

O provedor so manda (e o e-mail so escapa do spam) de um dominio que voce provou
que e seu: ele mostra 2 ou 3 registros de DNS (SPF, DKIM) pra acrescentar.

- Use um **subdominio** so pra isso, por exemplo `sedes.admsolucoes.com.br` - o
  mesmo dominio-base das sedes. Assim os e-mails do Google Workspace da ADM
  (`@admsolucoes.com.br`) nao sao tocados, e a reputacao de um nao afeta a do
  outro.
- Os registros vao onde o DNS do dominio e gerenciado (na Hostinger: hPanel >
  Dominios > DNS). Depois de acrescentar, o provedor confere sozinho (pode levar
  de minutos a algumas horas).
- `EMAIL_REMETENTE` = um endereco nesse subdominio, por exemplo
  `avisos@sedes.admsolucoes.com.br`. Ele nao precisa existir como caixa de
  entrada.
- Quem recebe ve o **nome da sede** como remetente, mas o endereco mostra o
  dominio. Se nem isso pode aparecer pro cliente, use um dominio neutro (o do
  produto) - o mesmo que ja aparece no endereco das sedes.

**Nunca** `@gmail.com` como remetente: o provedor nao deixa, e se deixasse, cairia
no spam.

### 3. Por as tres variaveis

| Onde a sede roda | Onde por |
|---|---|
| No computador | `escritorio-virtual/.env` (modelo no `.env.example`) |
| Render | painel > Environment (ja estao no `render.yaml`, com `sync: false`). O `SITE_URL` o Render preenche sozinho |
| VPS, varias sedes | `/etc/sedes/padrao.env` - vale pra todas. Um cliente com remetente proprio ganha um `EMAIL_REMETENTE=` no arquivo **dele** (`/etc/sedes/<cliente>.env`), que ganha do padrao |

No VPS, o `padrao.env` de servidores configurados antes desta versao nao tem as
tres linhas: acrescente na mao. Depois, reinicie as sedes - `sedes.sh atualizar`
reinicia uma de cada vez (e puxa o codigo novo junto):

```bash
bash /opt/sede/app/scripts/sedes.sh atualizar
```

### 4. Conferir

- No arranque, o log diz uma linha so:
  `E-mail: ligado (resend), links para https://acme.sedes.admsolucoes.com.br`.
  No VPS: `journalctl -u sede@acme -n 30 --no-pager`. Se disser
  `DESLIGADO - falta SITE_URL`, o endereco publico da sede nao esta configurado.
- A pagina `/diagnostico.html` da sede mostra o e-mail como "configurado".
- Teste de verdade: crie uma conta com um e-mail seu na sede, abra o link,
  entre com a senha. Caiu no spam? Confira no painel do provedor se o dominio
  esta verificado (SPF e DKIM). O painel tambem mostra cada e-mail que saiu.

## O que ainda nao faz

- Convite e aviso por e-mail (so confirmacao e senha nova, por enquanto).
- Conta que nunca confirma fica na lista da diretoria como "e-mail nao
  confirmado" ate alguem remover.
- Os freios (por minuto, por IP) ficam na memoria e zeram quando a sede
  reinicia - como os outros freios da sede.
