# Varias sedes no mesmo servidor (vender sala pra cliente)

O modelo: **cada cliente compra a sala dele, e nada liga uma a outra - so o
servidor.** Um cliente nunca ve, encontra ou acessa nada de outro.

## Como o isolamento e feito

Cada cliente e um **programa separado**, e nao uma "sala" dentro de uma sede
grande. A diferenca importa: numa sede unica com varias salas, um erro de codigo
pode mostrar o chat de uma empresa pra outra. Aqui isso nao depende do codigo
estar certo - depende do sistema operacional:

| O que | Como fica separado |
|---|---|
| Programa | um servico por cliente (`sede@acme`, `sede@beta`), porta propria. Um cair nao derruba os outros |
| Dados | pasta propria (`/var/lib/sedes/<cliente>`), permissao 700, dona do usuario do cliente (`sede-<cliente>`). O programa de um nao consegue nem LER a pasta do outro |
| Configuracao | `/etc/sedes/<cliente>.env`, arquivo so do root. O systemd entrega as variaveis ao programa, que nem consegue abrir o proprio arquivo |
| Segredos | segredo de sessao e chave de backup sorteados por cliente |
| Endereco | `<cliente>.<dominio-base>`, certificado proprio |
| Maquina | teto de memoria (400 MB) e de processador (60%) por cliente: um com problema nao toma a maquina dos outros |

Dois vazamentos que existiam e foram fechados pra isso funcionar:

- **O `.env` da pasta do codigo.** Todas as sedes rodam o MESMO codigo, entao
  todas liam o MESMO `.env` - e o que estivesse nele (Google, quem e diretoria)
  valia pra todos os clientes. Agora cada sede roda com `ARQUIVO_ENV=nenhum`
  (ver `server/ambiente.js`). Rodando o teste com o carregador antigo, a
  configuracao do Google vazou pras sedes dos clientes e bloqueou o cadastro
  deles.
- **Dominio vazio caia no padrao da ADM.** Um cliente criado sem dominio de
  e-mail aceitaria cadastro de qualquer @admsolucoes. Agora `DOMINIOS_SEDE`
  vazio quer dizer "ninguem entra por e-mail" (ver `server/dominios.js`), e o
  `sedes.sh` exige `--email-dominio`.

**Provas:** `testes/isolamento.js` sobe duas sedes de verdade lado a lado e tenta
o que um cliente tentaria contra o outro - entrar com a conta, usar o cookie,
ver quem esta la, ler o chat, criar conta com o e-mail da outra empresa. E a
configuracao errada mais provavel: mesmo segredo de sessao nas duas (o cookie
continua nao valendo - a conta nao existe la). `testes/sedes-script.js` roda o
`sedes.sh` em modo simulado e sobe uma sede com o arquivo que ele gerou.

## Os comandos

Na maquina nova, uma vez so:

```bash
bash subir-no-vps.sh --varias
```

Instala Node, nginx, firewall, certbot e o codigo - **sem criar sede nenhuma**.
Depois, no DNS, **um registro so pra todos os clientes**:

```
*.sedes.admsolucoes.com.br   A   <IP do servidor>
```

E entao:

```bash
bash /opt/sede/app/scripts/sedes.sh configurar --dominio-base sedes.admsolucoes.com.br --email voce@admsolucoes.com.br
bash /opt/sede/app/scripts/sedes.sh criar acme --nome "Acme Consultoria" --email-dominio acme.com.br --diretoria ana@acme.com.br
bash /opt/sede/app/scripts/sedes.sh listar
bash /opt/sede/app/scripts/sedes.sh atualizar        # codigo novo pra TODOS, um de cada vez
bash /opt/sede/app/scripts/sedes.sh remover acme     # pede o nome de novo pra confirmar
```

- `criar` mostra **uma vez** o codigo de diretoria do cliente - guarde e entregue
  ao responsavel dele.
- `--email-dominio` e obrigatorio. Quem nao quer cadastro por e-mail passa
  `--email-dominio ""` (entra so por convite).
- `--sem-google` desliga o "Entrar com o Google" so pra aquele cliente.
- `remover` faz uma **copia final** em `/var/backups/sedes/` antes de apagar.
  LGPD: guarde so pelo tempo que o contrato disser, e depois apague.
- `/etc/sedes/padrao.env` guarda o que vale pra todos (Google, TURN). **Nunca**
  ponha nele nada que identifique cliente - o `sedes.sh` escreve esses campos no
  arquivo de cada um, mesmo vazios, justamente pra nada daqui vazar.

## Quantos clientes cabem

Medido: uma sede ocupa **60 MB parada e 64 MB com 30 pessoas andando**, e 30
pessoas gastam ~5% de um nucleo (depois do repasse de movimento - ver
`docs/hospedar-na-hostinger.md`, secao 0b).

| | KVM 1 (1 nucleo, 4 GB) | KVM 2 (2 nucleos, 8 GB) |
|---|---|---|
| Pela memoria | ~50 sedes | ~110 sedes |
| Pelo processador, todas cheias ao mesmo tempo | ~14 sedes de 30 pessoas | o dobro |

O limite real e o processador em horario comercial: as empresas trabalham ao
mesmo tempo. Sede parada nao gasta processador. Numeros da maquina de
desenvolvimento - o VPS e mais lento.

## A marca de cada cliente (18/09/2026)

Cada sede mostra o nome da empresa dela, e **nenhum "ADM"** aparece pro cliente
(`server/marca.js`). Tres variaveis, que o `sedes.sh criar` escreve:

| Variavel | Onde aparece | Padrao (sede da ADM) |
|---|---|---|
| `NOME_SEDE` | titulo da aba, login, boas-vindas, app instalado, canal geral do chat | ADM Solucoes |
| `SIGLA_SEDE` (`--sigla`) | "Entrar com o Google da <sigla>", "e-mail da <sigla>", "Sede <sigla>" no icone do app | ADM |
| `SUBTITULO_SEDE` | a linha embaixo do nome no login | Escritorio virtual da empresa junior |

A pagina (`/`) e o manifesto do app saem do servidor com a marca aplicada - o
`index.html` tem marcadores (`{{NOME_SEDE}}` etc.) e o nome entra **escapado**
(um nome com `<` e `>` nao vira HTML). **A sede da ADM, sem nenhuma dessas
variaveis, fica exatamente como era** - o `testes/marca.js` confere os dois lados.

**O acervo fisico e da sala da ADM.** O catalogo (96 livros) morava em `public/` -
aberto em `/dados/acervo-fisico.json` no endereco de qualquer cliente. Saiu pra
`server/acervo-fisico.json` (so o servidor le), e cada sede escolhe o dela em
`ACERVO_FISICO` (ausente = o da ADM; `nenhum` = sem acervo fisico, e a aba "Na
sala" some da estante). O `sedes.sh` escreve `ACERVO_FISICO=nenhum` pros clientes.

Conferido no navegador com um cliente de exemplo ("Acme Consultoria"): login,
tela de entrada e estante sem nenhum "ADM", e a estante so com a aba digital.

Ainda da ADM, pra quem quiser personalizar depois: o **logo** (os quatro pontos),
a **cor** (indigo) e o **mapa** - as salas "Projetos" e "Marketing" vem dos setores
da ADM (sao nomes comuns o bastante pra qualquer empresa, mas nao sao do cliente).

## O que ainda falta pra vender

1. ~~**Nome e marca por cliente.**~~ **FEITO** (secao acima). A planta tambem ja
   e de cada um: a diretoria do cliente move e redimensiona as areas
   ([areas.md](areas.md)) e decora, e fica salvo so na sede dele. Falta so logo
   e cor proprios, se o cliente pedir.
2. **"Entrar com o Google" pra empresa de fora.** Hoje o cliente OAuth e da ADM.
   Pra contas de outras empresas entrarem, a tela de consentimento tem que ser
   **Externa** (e o Google pode pedir verificacao da marca). E cada endereco de
   volta (`https://<cliente>.<dominio-base>/api/google/callback`) tem que ser
   cadastrado no cliente OAuth. Enquanto isso, `--sem-google`.
3. ~~**E-mail transacional.**~~ **FEITO** ([email.md](email.md)). Com
   `EMAIL_PROVEDOR`, `EMAIL_CHAVE` e `EMAIL_REMETENTE` no `padrao.env`,
   cadastro com senha so entra voltando pelo link que chega no e-mail (e com a
   senha), e "esqueci minha senha" vira link. Vale tambem pras sedes
   `--sem-google`. O remetente aparece com o nome de cada cliente.
4. **Cobranca, monitoramento com alerta, contrato de dados (LGPD).**
5. **Custo da chamada de video.** Ela vai direto entre navegadores e nao pesa no
   servidor - mas quando a rede do cliente bloqueia, passa pelo TURN da
   Cloudflare, que cobra por volume. Medir antes de fixar preco.
