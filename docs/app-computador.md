# App para computador

A sede **ja e um app instalavel** no Windows, Mac e Linux. Nao precisa baixar
executavel nem instalar nada por fora: o proprio navegador instala.

E um **PWA** (Progressive Web App), que e como o Gather e a maioria dos apps
desse tipo fazem hoje.

---

## Como instalar

1. Abra o link da sede no **Chrome** ou no **Edge**.
2. Na barra de endereco, do lado direito, aparece um icone de **instalar**
   (um monitor com uma seta pra baixo). Clique nele.
   - Se nao aparecer: menu `⋮` > **Instalar Sede ADM...** (Chrome) ou
     `...` > **Aplicativos** > **Instalar este site como um aplicativo** (Edge).
3. Pronto. Fica um icone na area de trabalho e no menu iniciar, e a sede abre
   em **janela propria**, sem barra de endereco nem abas.

No Mac o caminho e o mesmo pelo Chrome; no Safari e
**Arquivo > Adicionar ao Dock**.

---

## Por que PWA e nao um .exe (Electron)

Foi uma escolha, nao uma limitacao:

| | PWA (o que fizemos) | Electron (.exe) |
|---|---|---|
| Tamanho | 0 - usa o navegador que ja existe | ~150 MB por pessoa |
| Instalar | um clique no navegador | baixar e rodar instalador |
| Atualizar | automatico no proximo deploy | precisa reempacotar e todo mundo rebaixar |
| Camera/microfone | permissao normal do navegador | igual |
| Antivirus / SmartScreen | nao passa por isso | reclama de .exe sem assinatura digital |
| Mac e Linux | mesmo caminho | um build pra cada sistema |

Pra um escritorio virtual, que **so funciona online mesmo**, o .exe nao compra
nada: ele seria uma janela de navegador embrulhada. O unico caso em que valeria
e se precisassemos de algo que so o sistema da (ler arquivo local, iniciar junto
com o Windows). Se isso aparecer, da pra fazer o wrapper depois - o app web
continua o mesmo.

---

## O que foi preciso pra deixar instalavel

- `public/manifest.webmanifest` - nome, icones, `display: standalone` (janela
  propria) e a cor da barra de titulo.
- `public/icones/` - 192px, 512px e o favicon de 32px, desenhados com a marca
  da ADM (os quatro pontos).
- `public/sw.js` - o service worker, que o navegador **exige** pra oferecer a
  instalacao.

### Um cuidado no service worker

Ele **nao guarda cache** do HTML, JS e CSS de proposito. O padrao seria cachear
tudo pra ficar rapido, mas ai depois de um deploy as pessoas continuariam
rodando a versao velha do jogo ate limpar o cache na mao - o bug classico de
PWA, e chato de descobrir.

Aqui a rede sempre manda. O cache guarda **so** a pagina `offline.html`, que
aparece quando a pessoa esta sem internet. Como a sede depende de Socket.io ao
vivo, nao faria sentido fingir que funciona offline.

---

## Requisitos

- **HTTPS.** O navegador so instala PWA em site seguro. O Render e o ngrok ja
  dao HTTPS. Em `http://localhost` tambem funciona (o navegador trata como
  seguro), mas em `http://` de rede local, nao.
- Chrome, Edge ou outro navegador baseado em Chromium. Firefox nao instala PWA
  no desktop, mas o site funciona igual por la.
