# Subir a sede na Hostinger (a mesma do site)

O site `admsolucoes.com.br` ja mora na Hostinger. Este documento e o caminho pra
a sede morar junto - e o que isso resolve e o que isso passa a custar.

## Antes de tudo: o plano de hoje NAO serve

Conferido de fora, em 17/09/2026:

```
Server: LiteSpeed        platform: hostinger        X-Powered-By: PHP/7.4.33
```

Isso e hospedagem **compartilhada**: ela serve PHP. A sede e **Node com
WebSocket** - precisa de um processo de pe o tempo todo e de uma conexao que nao
morre. Compartilhada nao faz isso.

| Plano | Serve? |
|---|---|
| Compartilhado (onde o site esta) | **nao** - so PHP |
| Business / Cloud | tem Node.js, mas WebSocket atras do proxy gerenciado e caso a caso. **Teste antes** (secao 6) |
| **VPS** | **sim** - processo proprio, porta propria, disco proprio |

## Por que mudar, se o Render ja funciona

Nao e economia. E o **disco**.

No plano free do Render o disco e apagado a cada publicacao: somem as contas, o
chat, a decoracao e as mesas. E o motivo de, hoje, ninguem conseguir entrar
depois de um deploy. Num VPS o disco e seu:

- as contas param de sumir;
- os **20 livros (429 MB)** ficam no servidor, e a biblioteca deixa de depender
  de o Drive estar configurado;
- o backup automatico (`server/backup.js`) continua valendo, agora como copia de
  seguranca de verdade e nao como unica esperanca.

**O que passa a custar:** alguem cuida do servidor. Atualizar o sistema, renovar
o certificado, reiniciar se cair. O Render faz isso sozinho. Numa empresa junior,
com diretoria trocando todo ano, isso pesa mais do que parece - vale decidir
sabendo.

## 0b. Quantas pessoas o KVM 1 aguenta

> **18/09/2026 - o repasse de movimento foi refeito, e o limite mudou de ordem
> de grandeza.** Os numeros de 17/09 (logo abaixo) sao o ANTES, e ficam como
> registro. O que vale agora e esta tabela.
>
> Cada pessoa passou a receber **um pacote a cada 50 ms** com quem mudou, em vez
> de uma mensagem por passo de cada pessoa. Quem esta na tela dela chega no
> ritmo cheio; quem esta fora, 2 vezes por segundo (o minimapa e a lista de
> pessoas continuam certos). Ver o bloco "repasse de movimento" em
> `server/index.js` e `testes/repasse.js`.
>
> Medido nos dois cenarios, na mesma sessao (`medir-carga.js` e
> `medir-carga.js --espalhados`):
>
> | Pessoas | Antes: amontoados | Depois: amontoados | Depois: espalhados |
> |---|---|---|---|
> | 30 | 0,21 nucleo | 0,05 nucleo | 0,07 nucleo |
> | 60 | 0,76 nucleo, 32.800 msg/s | **0,13 nucleo, 872 msg/s** | 0,11 nucleo |
> | 100 | (nao aguentava) | 0,19 nucleo | 0,18 nucleo |
> | 200 | - | 0,32 nucleo | - |
> | 300 | - | 0,56 nucleo | - |
>
> "Amontoados" e o pior caso: todo mundo na mesma sala, vendo todo mundo. Mesmo
> assim, **300 pessoas usam pouco mais de meio nucleo**, e nesse nivel quem
> engasga e o proprio gerador de carga (roda na mesma maquina), nao a sede.
>
> **O custo novo:** ate 50 ms a mais de atraso (o intervalo do ciclo). O atraso
> tipico foi de 5 a 32 ms e o ruim (95%) ficou em ~63 ms em TODOS os niveis -
> antes ele era 2 a 3 ms com pouca gente e explodia pra 237-882 ms com 60. Abaixo
> de 100 ms ninguem percebe; e agora ele nao cresce com a lotacao.
>
> **O limite novo e trafego, nao processador:** 100 pessoas amontoadas gastam
> ~380 MB/min (espalhadas, ~220). Pra reuniao geral de vez em quando, os 4 TB/mes
> do KVM 1 sobram; pra 100 pessoas amontoadas o dia inteiro, nao.
>
> **Pra planejar no KVM 1: mais de 100 pessoas ao mesmo tempo.** A EJ inteira
> cabe com folga.

### Antes (17/09/2026)

Medido com [`scripts/medir-carga.js`](../scripts/medir-carga.js): N conexoes de
verdade, cada uma andando 10 vezes por segundo, 15 segundos por nivel. Numa
maquina de 8 nucleos (i5-11300H, 3.1 GHz) - **o VPS e mais fraco, entao trate
como teto otimista**:

| Pessoas juntas | Nucleos usados | Mensagens/s | MB/min | Atraso tipico | Atraso ruim (95%) |
|---|---|---|---|---|---|
| 10 | 0,07 | 821 | 4 | 1 ms | 2 ms |
| 30 | 0,42 | 7.947 | 41 | 2 ms | 7 ms |
| 45 | 0,65 | 17.820 | 93 | 3 ms | 76 ms |
| **60** | **0,98** | 34.148 | 178 | **237 ms** | 882 ms |
| 80 | 1,01 | 39.167 | 204 | 378 ms | 1.306 ms |

**O joelho da curva esta entre 45 e 60.** Ate 45 o atraso e de milissegundos -
ninguem percebe. Em 60 o servidor encosta em um nucleo inteiro e o atraso pula
pra 237 ms: e ai que o boneco do colega para de andar e passa a **teleportar**.
Em 80 nao piora muito mais porque nao tem como: o Node usa **um** nucleo, e ele
ja estava cheio - o que cresce dali pra frente e a fila.

Como o nucleo do VPS e mais lento que o desta maquina, o numero pra planejar e:
**confortavel ate ~30 pessoas ao mesmo tempo, apertado perto de 45**. Para a ADM
isso e folgado - o limite nao e quantos membros a EJ tem, e quantos ficam na
sede **ao mesmo tempo**.

**Quando apertar, o servidor maior e o remendo errado.** O gasto e o repasse da
posicao de todo mundo pra todo mundo (`socket.broadcast.emit('player-moved')` em
`server/index.js`): ele cresce ao quadrado. Mandar a posicao so pra quem esta
**perto** derruba essa conta de uma vez - e custa uma tarde de codigo, nao R$ 14
por mes a mais.

Trafego nao e problema em nenhum dos casos: 60 pessoas gastam ~178 MB/min, e o
KVM 1 vem com 4 TB/mes. E a **chamada de video nao entra nessa conta** - ela vai
direto de um navegador pro outro.

## 1. Onde a sede vai atender

Um subdominio, pra nao encostar no site:

```
escritorio.admsolucoes.com.br
```

No hPanel: **Dominios > Zona DNS**, registro **A** apontando pro IP do VPS.

## 1b. O jeito rapido: um comando

As secoes 2 a 6 estao automatizadas em
[`scripts/subir-no-vps.sh`](../scripts/subir-no-vps.sh). No VPS recem-criado,
como root:

```bash
curl -fsSL https://raw.githubusercontent.com/adm-solucoes/escritorio-virtual/main/scripts/subir-no-vps.sh -o subir.sh
bash subir.sh --dominio escritorio.admsolucoes.com.br --email voce@admsolucoes.com.br
```

Ele instala Node (conferindo a versao, nao supondo), nginx e firewall, cria o
usuario e as pastas, clona o codigo, escreve o servico e o nginx com as linhas
de WebSocket, e pede o certificado **se** o DNS ja estiver apontando pra ca - se
nao estiver, ele diz o IP e o que fazer no hPanel, e segue.

**Rodar de novo e a forma normal de atualizar**: cada passo confere antes de
fazer, e ele nunca sobrescreve o `.env` nem o nginx que ja tem HTTPS.

Ele **nao** escreve chave nenhuma: cria o `.env` com as linhas em branco e manda
voce preencher. No fim, ele aponta pra `/diagnostico.html` - que e onde se ve se
deu certo de verdade.

As secoes abaixo continuam valendo como explicacao do que o script faz (e pra
quando algo quebrar e precisar mexer na mao).

## 2. O servidor, uma vez so

Node **20.12 ou mais novo** - o codigo usa `process.loadEnvFile`, que nao existe
antes disso. Em Node 18 ele degrada CALADO: o `.env` nao carrega e as integracoes
somem sem erro nenhum. (O `engines` do package.json ja exige a versao certa.)

```bash
# como root, no VPS (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx
adduser --system --group --home /opt/sede sede
```

## 3. O codigo

```bash
git clone https://github.com/adm-solucoes/escritorio-virtual.git /opt/sede/app
cd /opt/sede/app && npm ci --omit=dev
mkdir -p /opt/sede/dados && chown -R sede:sede /opt/sede
```

`/opt/sede/dados` fica **fora** da pasta do codigo de proposito: `git pull` nunca
encosta nele. E o mesmo motivo do `DATA_DIR` existir (ver `server/dados.js`).

## 4. As variaveis

Em `/opt/sede/app/.env`, dono `sede`, permissao `600` (so ele le):

```
NODE_ENV=production
PORT=3500
DATA_DIR=/opt/sede/dados
DIRETORIA_EMAILS=quem-manda@admsolucoes.com.br
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

O resto (Trello, Drive, TURN, backup) esta em `.env.example`. **Nenhum valor
entra neste documento** - ele vai pro espelho publico.

```bash
chmod 600 /opt/sede/app/.env && chown sede:sede /opt/sede/app/.env
```

## 5. O servico

`/etc/systemd/system/sede.service`:

```ini
[Unit]
Description=Escritorio Virtual ADM
After=network.target

[Service]
Type=simple
User=sede
WorkingDirectory=/opt/sede/app
# iniciar.js, NAO index.js: ele restaura o backup ANTES de a sede ler as contas
# do disco. Com index.js, um servidor novo (pasta vazia) subiria zerado - e o
# backup ficaria la, sem ninguem pra ler.
ExecStart=/usr/bin/node server/iniciar.js
Restart=always
RestartSec=5
# A sede nao precisa enxergar o resto do servidor:
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/sede/dados

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now sede && systemctl status sede
```

`Restart=always` e o que substitui o "o Render reinicia sozinho".

## 6. O nginx - e a linha que faz ou quebra tudo

```nginx
server {
  server_name escritorio.admsolucoes.com.br;

  location / {
    proxy_pass http://127.0.0.1:3500;
    proxy_http_version 1.1;

    # ESTAS DUAS LINHAS SAO O PONTO INTEIRO.
    # Sem elas o site abre, a tela carrega, e o mapa fica MORTO: ninguem
    # aparece, ninguem conversa, a chamada nao abre. O socket.io precisa que a
    # conexao HTTP vire WebSocket, e quem autoriza essa troca e o proxy. E o
    # erro classico de por Node atras de nginx - e o sintoma nao parece rede,
    # parece bug do app.
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    # o freio de forca bruta do login depende do IP de verdade (trust proxy)
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # chamada longa nao pode ser cortada por ociosidade
    proxy_read_timeout 3600s;
  }
}
```

```bash
certbot --nginx -d escritorio.admsolucoes.com.br
```

O certbot renova sozinho. **Conferir isso em dezembro** - certificado vencido foi
o que aconteceu com o site principal.

## 6b. Business/Cloud: o caminho e outro (e o WebSocket decide tudo)

No Business e no Cloud **nao existe systemd nem nginx na mao**: quem sobe o
processo e o **Node.js app** do hPanel (hPanel > Avancado > Node.js). O que voce
configura la e: versao do Node **20.12 ou mais nova**, pasta do projeto, arquivo
de entrada `server/iniciar.js`, comando de instalacao `npm ci --omit=dev` e as
variaveis de ambiente (as mesmas da secao 4). O HTTPS e o dominio ja vem do
painel.

Duas coisas voce **nao** controla ai, e sao as que decidem se vale a pena:

1. **o WebSocket passa pelo proxy gerenciado?** (teste abaixo);
2. **o disco sobrevive a um restart do app?** Se a hospedagem recriar o
   ambiente a cada deploy, voltamos ao problema do Render. Ponha a pasta de
   dados fora da pasta do projeto (`DATA_DIR=/home/USUARIO/dados-sede`) e
   confira depois de um restart.

### Como testar de verdade: a pagina de diagnostico

Abra **`https://SEU-ENDERECO/diagnostico.html`** assim que a sede subir, antes
de chamar o pessoal. Ela responde, numa tela so: versao do Node, se a pasta de
dados aceita escrita, se o WebSocket passou, se os cabecalhos de seguranca
chegaram e se o servidor enxerga o IP de cada pessoa. Cada item diz **o que
quebra** se estiver vermelho. Ela e publica de proposito: precisa responder
antes de existir a primeira conta, que e justo quando voce mais precisa dela.

> ### NAO use o teste das "duas abas"
>
> Este guia ja mandou "abre duas abas e anda com uma; se a outra nao ver, o
> WebSocket nao esta passando". **Esta errado, e erra pro lado pior**: o
> socket.io cai sozinho pra *long-polling* quando o WebSocket e bloqueado. As
> duas abas continuam funcionando - so que lento e pesado, com a presenca
> piscando e a chamada caindo - e voce conclui que esta tudo bem. O teste passa
> com o problema de pe.
>
> A pagina de diagnostico abre um WebSocket **cru**, sem a biblioteca do
> socket.io no meio: ou o upgrade passa e a sede responde o handshake, ou ela
> diz que nao passou. Ela tambem tem prazo de 5 segundos, porque upgrade
> bloqueado as vezes nao da erro nenhum - so nunca abre.

## 7. Depois de subir

1. **Abrir `https://escritorio.admsolucoes.com.br/diagnostico.html`** e olhar a
   tela inteira antes de qualquer outra coisa (vale pro VPS tambem, nao so pro
   Business/Cloud). Vermelho ali e coisa que so aparece fora do localhost.
2. No Google Cloud, no cliente OAuth, acrescentar o redirect:
   `https://escritorio.admsolucoes.com.br/api/google/callback`
3. Copiar os livros pra `/opt/sede/dados/livros/<setor>/` (`scp` ou rsync). Com
   eles no disco, a estante funciona sem o Drive.
4. Criar a sua conta. Com `DIRETORIA_EMAILS` preenchido, ja entra como diretoria.

## 8. Atualizar dali em diante

```bash
cd /opt/sede/app && git pull && npm ci --omit=dev && systemctl restart sede
```

O `npm run espelhar` continua sendo o jeito de mandar o codigo pro GitHub; muda
so quem puxa de la. **E o `server/data` nao e mais apagado** - que era o ponto.

## 9. O que continua igual

- Chamada de video continua P2P entre os navegadores. O VPS nao vira servidor de
  video: quem resolve rede fechada e o TURN (`server/turn.js`), e ele nao muda.
- Os cabecalhos de seguranca saem do proprio app (`server/index.js`), nao do
  nginx - entao valem aqui igual.
