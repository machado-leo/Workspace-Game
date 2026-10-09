# Workspace Game - Escritório Virtual 2D

Ambiente virtual 2D multiplayer interativo (estilo Gather.town), desenvolvido para colaboração e trabalho remoto. Cada participante cria e personaliza seu próprio avatar, anda pelo escritório em tempo real e interage de forma dinâmica com os colegas — aproximar-se de alguém ativa a conversa por voz e vídeo por proximidade de forma fluida e natural.

---

## 🚀 Principais Funcionalidades

- **Chamadas por Proximidade (WebRTC P2P):** Conexão direta entre navegadores via WebRTC quando dois avatares se aproximam.
  - **Ativação Mútua de Mídia:** A chamada só conecta se ambos os participantes estiverem com câmera/microfone ativos, evitando transmissão unilateral indesejada.
  - **Avisos Interativos:** Se um participante estiver inativo ao se aproximar, o usuário ativo recebe um aviso e vê um ícone `🔇` sobre o colega, enquanto o inativo recebe um botão em destaque para ativar câmera e microfone com 1 clique.
- **Visualização em Tela Grande (Grid Estilo Meet/Zoom):**
  - Alternância rápida entre o modo compacto (bolhas de vídeo flutuantes circulares acima dos avatares) e o modo de tela grande com todas as câmeras compartilhando um espaço amplo.
  - Atalho na barra de controles e no cartão de cada colega conectado.
- **Compartilhamento de Tela:**
  - Compartilhe abas ou janelas do computador diretamente na chamada.
  - Modo Picture-in-Picture (PiP): a bolha sobre o avatar ou o tile na grade exibe a tela compartilhada mantendo a câmera em miniatura.
  - Espelhamento de telas nas TVs das salas de reunião.
- **Criação e Personalização de Avatares:**
  - Personagens em pixel art modular baseados no Liberated Pixel Cup (LPC).
  - Customização de tom de pele, cabelo, roupas, sapatos e acessórios.
- **Acústica e Salas Temáticas:**
  - **Salas de Reunião Fechadas:** Volume uniforme para todos dentro da sala, isolando o som de quem está nos corredores.
  - **Salas de Foco / Biblioteca:** Áreas silenciosas com restrição de chamadas casuais para quem precisa de concentração.
  - **Corredores e Áreas Comuns:** Atenuação de volume suave conforme a distância dos passos.
- **Chat em Tempo Real:**
  - Canais de discussão (`#geral`, etc.) e mensagens diretas privadas (DMs).
  - Suporte a formatação Markdown (`**negrito**`, `_itálico_`, `` `código` ``) e reações com emojis.
- **Status de Disponibilidade e Interações:**
  - Status visíveis em anéis coloridos nos avatares: *Livre*, *Focado* ou *Em Reunião*.
  - Reações rápidas flutuantes sobre o avatar (👋, 👍, 🎉, 😂, ❤️, 👏).
  - Minimapa no canto da tela com localização em tempo real de todos os presentes.
- **PWA (Progressive Web App):**
  - O aplicativo pode ser instalado no computador ou dispositivo móvel como app nativo com janela própria e atalho na área de trabalho.

---

## 🛠️ Stack Tecnológica

- **Backend:** Node.js, Express, Socket.io (WebSocket para movimentação em tempo real, presença e sinalização WebRTC)
- **Frontend:** HTML5 Canvas, Vanilla JavaScript moderno (sem frameworks pesados ou etapa de build obrigatória), CSS3 responsivo
- **Mídia e Chamadas:** WebRTC nativo ponto a ponto (P2P), com STUN e suporte a TURN
- **Armazenamento:** Estrutura baseada em arquivos JSON no servidor para configurações e contas, com hashing seguro de senhas (`scrypt`), sem obrigatoriedade de banco de dados externo

---

## 📁 Estrutura do Projeto

```
Workspace-Game/
├── server/
│   ├── index.js          # Servidor Express, Socket.io e lógica principal
│   ├── auth.js           # Rotas de autenticação e contas
│   ├── usuarios.js       # Gerenciamento de contas e armazenamento JSON
│   ├── sessao.js         # Sessões com cookies seguros
│   ├── mapa-editado.js   # Edições e decoração customizada do mapa
│   └── map.js            # Lógica de grid de tiles e colisões no servidor
├── public/
│   ├── index.html        # Página principal da aplicação
│   ├── css/
│   │   └── style.css     # Estilos da interface, painéis e grade de vídeo
│   ├── js/
│   │   ├── game.js       # Loop do jogo, renderização no Canvas e movimentação
│   │   ├── calls.js      # Lógica de WebRTC, proximidade e controle de mídia
│   │   ├── callgrid.js   # Modo de tela grande (grid de vídeo compartilhado)
│   │   ├── network.js    # Conexão Socket.io cliente
│   │   ├── character.js  # Composição e renderização dos sprites do avatar
│   │   ├── chat.js       # Interface e lógica do chat em tempo real
│   │   ├── creator.js    # Personalização e criação do avatar
│   │   └── main.js       # Inicialização e orquestração das telas
│   └── assets/           # Sprites, texturas e ícones
├── testes/               # Bateria de testes automatizados
├── .env.example          # Modelo de configuração de variáveis de ambiente
└── package.json
```

---

## 💻 Como Rodar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org) (v18 ou v20+ recomendado)
- `npm`

### Instalação e Execução

1. Clone o repositório e acesse a pasta:
   ```bash
   git clone https://github.com/machado-leo/Workspace-Game.git
   cd Workspace-Game
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie o arquivo de configuração `.env` baseado no exemplo:
   ```bash
   cp .env.example .env
   ```

4. Inicie o servidor:
   - **Modo Desenvolvimento (com bypass de login para testes):**
     ```bash
     npm run dev
     ```
   - **Modo Padrão:**
     ```bash
     npm start
     ```

5. Abra o navegador em: **`http://localhost:3500`**

> **Dica para testes multiplayer locais:** Para testar com mais de um personagem na mesma máquina, abra abas em **janelas anônimas** ou utilize navegadores diferentes (ex: Chrome e Firefox), já que abas normais compartilham o mesmo cookie de sessão.

---

## ⚙️ Variáveis de Ambiente

As configurações principais podem ser definidas via arquivo `.env` ou nas variáveis do ambiente de deploy:

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3500` | Porta onde o servidor HTTP/WebSocket irá escutar. |
| `NODE_ENV` | `development` | Define o ambiente (`production` ativa flags seguras nos cookies). |
| `SEM_LOGIN` | `0` | Se definido como `1`, desativa o fluxo de login e entra como visitante de desenvolvimento. |
| `CODIGO_SEDE` | — | Código opcional exigido durante o cadastro de novos usuários. |
| `ADMIN_CODE` | — | Código opcional no cadastro que concede permissão de administrador. |
| `GOOGLE_CLIENT_ID` | — | ID de cliente do Google OAuth para login social (opcional). |
| `GOOGLE_CLIENT_SECRET` | — | Segredo do Google OAuth (opcional). |
| `CLOUDFLARE_TURN_KEY_ID` | — | ID de chave do Cloudflare TURN para chamadas em redes restritas (opcional). |
| `CLOUDFLARE_TURN_TOKEN` | — | Token do Cloudflare TURN (opcional). |

---

## 🧪 Testes

O projeto conta com testes unitários cobrindo regras de proximidade, áreas acústicas, sincronização e ativação mútua de chamada:

```bash
npm run teste
```

---

## 🌐 Deploy

Como o servidor depende de conexões WebSocket persistentes (Socket.io) para sincronizar posições e chamadas em tempo real, deve ser hospedado em plataformas que mantenham um processo Node.js em execução (como Render, Railway, Fly.io, Heroku ou VPS própria com Docker).

> **Atenção:** Navegadores modernos exigem conexão segura (**HTTPS**) ou `localhost` para autorizar acesso à câmera e microfone via `navigator.mediaDevices.getUserMedia`. Certifique-se de configurar certificados SSL/HTTPS no ambiente de produção.

---

## 📄 Licença

Este projeto é distribuído sob a licença [MIT](LICENSE).
Os assets gráficos de personagens seguem as licenças da comunidade Liberated Pixel Cup (LPC) detalhadas em `public/assets/lpc/CREDITS.md`.
