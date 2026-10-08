# WhatsApp na sede

O pedido: usar o WhatsApp **pessoal** de cada um dentro do escritorio virtual.

## O limite, e por que o caminho e este

O WhatsApp Web **recusa abrir dentro de outro site** - o proprio WhatsApp
bloqueia iframe. As ferramentas que "colam" o WhatsApp numa pagina (whatsapp-web.js,
Baileys e afins) nao sao oficiais: violam as regras do WhatsApp e podem **banir o
numero** da pessoa. Numero pessoal banido e prejuizo que nao se desfaz, entao a
sede nao usa isso.

O que existe de oficial, e o que a sede faz (`public/js/whatsapp.js`):

| Onde | O que faz |
|---|---|
| Botao na barra (icone de balao) | abre o **seu** WhatsApp Web numa janela colada do lado direito da sede. E sempre a mesma janela: clicar de novo so traz ela pra frente. No celular, abre o app. |
| Sua conta > Meu WhatsApp | numero **opcional**. Com ele, aparece **WhatsApp** no seu cartao. Apagar o campo tira. |
| Cartao de um colega | se ele cadastrou o numero, o botao **WhatsApp** abre a conversa com ele na janela ao lado (`web.whatsapp.com/send?phone=`). No celular, `wa.me`. |

Se o navegador bloquear pop-up, a sede avisa pra liberar pro site.

## Privacidade

- O numero **nao vai na lista de pessoas** que o servidor manda pra todo mundo
  pelo socket. O cartao pede um por vez (`GET /api/pessoas/:uid/whatsapp`).
- So quem esta logado consulta e cadastra.
- Guardado so em digitos, com o 55 do Brasil quando vier DDD + numero
  (`(85) 99999-9999` -> `5585999999999`); com `+` na frente vale o pais digitado.
- `testes/contas.js` confere tudo isso contra o servidor, inclusive que o numero
  nao aparece no `init` do socket.
