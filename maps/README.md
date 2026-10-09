# Guia de Mapas Customizados

Este guia explica como criar e importar mapas customizados para o escritório virtual (por exemplo, reproduzindo a planta real do andar da sua empresa), mantendo o arquivo privado e protegido pelo `.gitignore`.

---

## 1. Onde colocar o mapa (Privacidade e Gitignore)

Para garantir que o mapa da sua empresa **nunca seja enviado para o repositório público no GitHub**, o sistema carrega mapas do seguinte caminho padrão:

```
server/data/mapa-custom.json
```

Como o diretório `server/data/` já está registrado no `.gitignore`, qualquer arquivo criado lá dentro é **100% privado** e ignorado pelo Git.

### Usando outra pasta ou arquivo
Você também pode definir a variável de ambiente `MAPA_ARQUIVO` no seu arquivo `.env`:
```bash
MAPA_ARQUIVO=/caminho/para/meu-mapa.json
```

### Fallback automático
Se `server/data/mapa-custom.json` (ou `MAPA_ARQUIVO`) não existir, o servidor carrega automaticamente a planta padrão sem nenhum erro.

---

## 2. Como começar (Passo a Passo)

1. Copie o mapa de exemplo para a pasta de dados:
   ```bash
   cp maps/mapa-exemplo.json server/data/mapa-custom.json
   ```
2. Reinicie o servidor:
   ```bash
   npm run dev
   ```
3. O servidor exibirá no terminal:
   ```
   [mapa] Mapa customizado carregado (...): 28x20, 7 salas, 2 spawn(s).
   ```

---

## 3. Estrutura do Arquivo JSON

```json
{
  "versao": 1,
  "versaoPlanta": 10,
  "cols": 28,
  "rows": 20,
  "spawnPoints": [
    { "col": 5.5, "row": 17 },
    { "col": 6.5, "row": 17 }
  ],
  "rooms": [
    {
      "id": "reuniao",
      "nome": "Sala de Reunião Principal",
      "r0": 2, "c0": 2, "r1": 7, "c1": 9,
      "piso": "ladrilho",
      "som": { "modo": "sala", "alcance": 3 }
    }
  ],
  "zonasPiso": [
    { "r0": 18, "c0": 4, "r1": 18, "c1": 7, "piso": "tijolo" }
  ],
  "tiles": [
    [0, 0, 1, 1, 1, 0, 0],
    ...
  ]
}
```

### Campos:
- **`cols`**: Número de colunas do mapa (largura em tiles de 32px).
- **`rows`**: Número de linhas do mapa (altura em tiles de 32px).
- **`versaoPlanta`**: Número inteiro de versão (ex: 10). Se você alterar a planta e quiser limpar móveis e áreas personalizadas antigas, basta incrementar este número.
- **`spawnPoints`**: Lista de pontos onde os jogadores nascem ao entrar na sede. Pode usar coordenadas em tiles (`col` e `row`) ou em pixels (`x` e `y`).
- **`rooms`**: Lista de áreas e salas do mapa:
  - `id`: Identificador único (ex: `"reuniao"`, `"copa"`, `"recepcao"`).
  - `nome`: Nome exibido na interface e no radar de salas.
  - `r0`, `c0`: Linha e coluna inicial (canto superior esquerdo).
  - `r1`, `c1`: Linha e coluna final (canto inferior direito).
  - `piso`: Textura do chão da sala (veja opções abaixo).
  - `som`: Regra acústica da sala (veja opções abaixo).
- **`zonasPiso`** *(opcional)*: Retângulos de sobreposição de piso (ex: tapetes, soleiras).
- **`tiles`**: Matriz 2D (`rows` linhas por `cols` colunas) contendo os IDs dos tiles. Você pode utilizar números (`0`, `1`, `3`) ou os nomes dos tiles em texto (`"LIVRE"`, `"PAREDE"`, `"MESA_MONITOR"`).

---

## 4. Tipos de Piso (`piso`)

| Identificador | Descrição |
| :--- | :--- |
| `tijolo` | Corredor e passagem (tijolinho) |
| `ladrilho` | Cerâmica clara (ideal para copa e sala de reunião) |
| `madeira` | Madeira nobre escura |
| `madeira_clara` | Madeira clara (ideal para recepção) |
| `carpete_azul` | Carpete corporativo azul (ideal para open space) |
| `carpete_roxo` | Carpete corporativo roxo |
| `espinha_fria` | Madeira espinha de peixe (ideal para cabines) |
| `cinza` | Cimento queimado |
| `grama` | Grama externa (jardim) |

---

## 5. Regras Acústicas (`som`)

| Modo | Comportamento |
| :--- | :--- |
| `"sala"` | Chamada privativa: quem está dentro só conversa com quem está dentro da sala inteira, sem vazar para o corredor. |
| `"perto"` | Proximidade: conversa com quem estiver a até `alcance` tiles de distância (sem paredes no meio). |
| `"silencio"` | Sala silenciosa / foco: não abre chamadas de áudio ou vídeo. |

---

## 6. Catálogo de Tiles

Você pode preencher a matriz `tiles` tanto com o **número** quanto com o **nome** do tile:

| ID | Nome | Descrição | Bloqueia Passagem? |
| :---: | :--- | :--- | :---: |
| 0 | `LIVRE` | Espaço aberto / caminhável | Não |
| 1 | `PAREDE` | Muro / parede sólida | **Sim** |
| 2 | `MESA` | Mesa de trabalho básica | **Sim** |
| 3 | `MESA_MONITOR` | Mesa de trabalho com computador | **Sim** |
| 4 | `SOFA_CIMA` | Encosto do sofá | **Sim** |
| 5 | `SOFA_BAIXO` | Assento do sofá (onde o boneco senta) | Não |
| 6 | `MESA_CENTRO` | Mesinha de centro | **Sim** |
| 7 | `ESTANTE` | Estante de livros / documentos | **Sim** |
| 8 | `PLANTA` | Vaso de planta | **Sim** |
| 9 | `ARVORE` | Árvore de jardim (lateral) | **Sim** |
| 10 | `QUADRO` | Quadro decorativo | **Sim** |
| 11 | `LOUSA` | Lousa branca de anotações | **Sim** |
| 12 | `ARMARIO` | Armário de escritório | **Sim** |
| 13 | `BALCAO` | Balcão de atendimento / copa | **Sim** |
| 14 | `CERCA` | Cerca externa | **Sim** |
| 15 | `CADEIRA` | Cadeira virada para cima (senta) | Não |
| 16 | `TAPETE` | Tapete no chão | Não |
| 17 | `MESA_REUNIAO` | Mesa grande de reunião | **Sim** |
| 18 | `JANELA` | Janela de vidro (parede norte) | **Sim** |
| 19 | `AGUA` | Espelho d'água / lago | **Sim** |
| 20 | `PEDRA` | Pedra ornamental | **Sim** |
| 21 | `ARBUSTO` | Arbusto decorativo de jardim | **Sim** |
| 22 | `BANCO` | Banco de praça | **Sim** |
| 23 | `CABIDE` | Cabideiro / espelho de pé | **Sim** |
| 24 | `IMPRESSORA` | Impressora corporativa | **Sim** |
| 25 | `CAVALETE` | Cavalete de apresentação | **Sim** |
| 26 | `MESA_DUPLA` | Bancada com dois monitores | **Sim** |
| 27 | `MESA_NOTEBOOK`| Mesa com notebook | **Sim** |
| 28 | `PLANTA_GRANDE`| Vaso grande de planta | **Sim** |
| 29 | `VASO_FLORES` | Vaso com flores | **Sim** |
| 30 | `CACTO` | Cacto decorativo | **Sim** |
| 31 | `POLTRONA` | Poltrona confortável (senta) | Não |
| 32 | `CADEIRA_VERMELHA` | Cadeira vermelha virada para cima | Não |
| 33 | `BEBEDOURO` | Bebedouro de água | **Sim** |
| 34 | `TV` | Monitor de TV de parede | **Sim** |
| 35 | `RELOGIO` | Relógio de parede | **Sim** |
| 36 | `TAPETE_REDONDO`| Tapete circular | Não |
| 37 | `CADEIRA_BAIXO`| Cadeira virada para baixo (senta) | Não |
| 38 | `CADEIRA_ESQ` | Cadeira virada para a esquerda | Não |
| 39 | `CADEIRA_DIR` | Cadeira virada para a direita | Não |
| 40 | `CADEIRA_VERMELHA_BAIXO` | Cadeira vermelha virada para baixo | Não |
| 41 | `CADEIRA_VERMELHA_ESQ` | Cadeira vermelha para a esquerda | Não |
| 42 | `CADEIRA_VERMELHA_DIR` | Cadeira vermelha para a direita | Não |
| 43 | `MESA_BAIXO` | Mesa virada para baixo | **Sim** |
| 44 | `MESA_ESQ` | Mesa virada para a esquerda | **Sim** |
| 45 | `MESA_DIR` | Mesa virada para a direita | **Sim** |
| 46 | `MESA_MONITOR_BAIXO` | Mesa monitor para baixo | **Sim** |
| 47 | `MESA_MONITOR_ESQ` | Mesa monitor para a esquerda | **Sim** |
| 48 | `MESA_MONITOR_DIR` | Mesa monitor para a direita | **Sim** |
| 49 | `PUFE` | Pufe acolchoado (senta) | Não |
| 50 | `MESA_REDONDA` | Mesa redonda de reunião/copa | **Sim** |
| 51 | `GELADEIRA` | Geladeira da copa | **Sim** |
| 52 | `AQUARIO` | Aquário ornamental | **Sim** |
| 53 | `LUMINARIA_PE` | Luminária de pé | **Sim** |
| 54 | `PORTA` | Porta de passagem (anima ao aproximar) | Não |
