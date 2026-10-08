# Discador dentro da sede

O discador é do CRM (`crm-adm/docs/plano-discador.md`): uma ligação atrás da
outra, pelo celular de cada um, com o roteiro da trilha comercial da ADM. A sede
mostra o mesmo discador num painel do trilho lateral - o botão do telefone, logo
abaixo do WhatsApp.

## Quem decide o quê

A sede **não decide nada** do discador. A fila, as regras (quem entra, quem fica
de fora e por quê), o texto do roteiro e o registro de cada ligação são do CRM.
A sede é só a ponte:

```
navegador --(cookie da sede)--> servidor da sede --(chave combinada)--> CRM
                                 server/discador.js                       /api/discador/externo/*
```

Por isso não existe uma segunda cópia de nenhuma regra aqui: a lista dos
resultados, os motivos de "ficou de fora" e o roteiro chegam prontos do CRM.

## A regra de segurança

O CRM confia no "em nome de quem" que a sede manda. Então a sede só manda:

- o e-mail da **conta logada** - nunca um e-mail que veio no pedido (nem por
  fora, nem escondido dentro da ligação);
- e só de conta com **e-mail provado** (`emailVerificado === true`: entrou com o
  Google da ADM, ou confirmou pelo link). Conta criada só com senha não prova
  nada - qualquer um digita `fulano@admsolucoes.com.br` - e aqui ela leria os
  leads do CRM e ligaria em nome de outra pessoa. Conta antiga, de antes do
  e-mail na sede, entra uma vez com o Google e pronto.

A chave desta porta **só abre o discador**. A sede continua sem a chave de
serviço do Supabase do CRM (que abriria o banco inteiro) - mesma linha do
`server/google.js`.

`testes/discador.js` guarda as duas regras, com um CRM de mentira que anota
cada pedido: conta só com senha não gera pedido nenhum, e o e-mail que chega no
CRM é sempre o da conta logada. Provado falhando: tirando as duas proteções, 6
conferências quebram.

## "Em ligação": a sede não ouve nem é ouvida

Quem liga pelo computador com o "Vincular ao Celular" fala pelo MESMO microfone
e ouve pelo MESMO alto-falante que a sede usa. O status "ocupado" já barra
conversa de corredor NOVA, mas de propósito não derruba a que já está
acontecendo (`deveContinuarCom`, em `js/calls.js`) - e é essa que vazaria: o
colega ouvindo a ligação com o cliente, e a voz dele entrando nela.

Então, do primeiro "Ligar" até a sessão pausar ou acabar:

- o status vira **Em ligacao** (roxo) pra sede inteira - e ele não entra no
  ciclo do botão de status; quem marca e desmarca é o discador;
- o microfone da sede fica desligado, e o som dos outros, mudo
  (`Calls.abafarParaLigacao`). O botão do microfone não religa no meio da
  ligação;
- ao pausar ou encerrar, volta tudo como estava - inclusive o microfone, se a
  pessoa já estava muda antes.

Fica ligado a sessão inteira, e não ligação a ligação: nos 3 s entre uma e
outra o status piscaria pra "Livre" no mapa, e dava tempo de uma conversa de
corredor abrir.

## Vincular o celular ao computador

Na sede quase todo mundo está no computador, e lá o botão "Ligar" (um link
`tel:`) não abre nada até o Windows ter um aplicativo pra esse tipo de link. O
painel mostra, na tela de montar a fila, o passo a passo de vincular o celular
pelo **Vincular ao Celular** do Windows - de graça, sem instalar nada como
administrador, e a ligação continua saindo do chip da pessoa.

O passo a passo é o mesmo da tela Discador do CRM
(`crm-adm/docs/discador-no-computador.md`, que tem também as alternativas pra
computador sem Bluetooth). Aqui ele some em quem toca a tela (`pointer: coarse`),
onde não serviria pra nada.

Com o "sempre permitir" marcado no navegador, a cadência de 3 s passa a discar
sozinha de verdade no computador - o que no celular quase nunca emenda, porque
o navegador exige um toque recente a cada ligação.

## Atalhos

Só os números de **1 a 8** (o resultado), e só com a ligação em andamento.
Letra, aqui, anda com o boneco: o "S" que pula lead na tela do CRM levaria a
pessoa pra baixo no mapa.

## Pra ligar

1. No CRM, rodar o SQL (`sql/045_prospeccao_metas.sql` e depois
   `sql/050_discador.sql`) e publicar.
2. Gerar uma chave de 32 caracteres ou mais:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. No CRM (Vercel): `DISCADOR_CHAVE_ESCRITORIO` = a chave.
4. Na sede (Render, ou o `.env` do servidor): `CRM_URL` = o endereço do CRM, sem
   barra no fim, e `CRM_CHAVE_DISCADOR` = a MESMA chave.

Sem as duas variáveis na sede, o botão nem aparece - é o que acontece nas sedes
de cliente. `/api/diagnostico` diz `discador: true/false`.

## Testado (19/09/2026)

- `testes/discador.js`: 25 conferências (a ponte, as regras de segurança, CRM
  fora do ar, chave diferente dos dois lados).
- `testes/proximidade.js`: "Em ligacao" barra conversa nova nos dois sentidos.
- `testes/diagnostico.js`: o endereço e a chave do CRM não vazam no diagnóstico.
- No navegador, com um CRM de mentira que usa as funções DE VERDADE do discador
  do CRM (o formato da resposta é o real): abrir o painel, a fila, Ligar
  (status "Em ligacao" + áudio abafado), nota, "Não atendeu", a contagem de 3 s
  que disca sozinha, a pausa (status e áudio de volta), encerrar e o resumo com
  o total do dia relido do CRM. E no celular de 360 px: a barra de baixo com 9
  botões cabe (39 px cada), e o painel não vaza.

**Não testado:** contra o CRM de verdade (depende do SQL) e num celular de
verdade discando pelo `tel:`.
