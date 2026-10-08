# Objeto que abre conteudo

Escrito em 11/09/2026.

## 1. O problema

O escritorio tem movel bonito e nenhum movel serve pra nada. No Gather, a graca
e que o quadro da sala abre o Miro, a estante abre a pasta do Drive e o mural
abre o formulario - o mapa vira ferramenta em vez de cenario.

Aqui isso ja existia, mas **programado um a um**: a estante abre o acervo porque
alguem escreveu codigo pra estante. Nao dava pra diretoria pendurar nada em nada.

## 2. O desenho

Terceira camada em cima do mapa, ao lado das duas que ja existiam:

| Camada | O que guarda | Onde |
|---|---|---|
| `mudancas` | o tile de cada celula | `mapa.json` |
| `objetos` | o que esta apoiado em cima | `mapa.json` |
| **`conteudos`** | **o link que a celula abre** | **`mapa.json`** |

Chave `"c,r"` -> `{ titulo, url, porUid, em }`.

## 3. As tres regras que importam

### 3.1 So http e https

O link e aberto pelo navegador de **toda** visita. Um `javascript:` guardado no
mapa seria codigo rodando na sessao dos outros; `data:` e `file:` seriam paginas
forjadas com a cara da sede. `urlValida()` usa `new URL()` e aceita **so** esses
dois protocolos.

A validacao roda **na escrita e na leitura**. `mapa.json` e um arquivo de texto
editavel a mao: se so a escrita filtrasse, bastava colar um `javascript:` no
arquivo pra a armadilha entrar no ar no proximo restart.

### 3.2 Link mora em movel, nunca no chao

Celula `LIVRE` nao aceita conteudo. Um pedaco de piso clicavel que ninguem
adivinha que existe nao e recurso, e bug. Pelo mesmo motivo, **apagar o movel
leva o link junto** - mesma regra que ja valia pro objeto apoiado em cima.

### 3.3 Abre em aba nova, nunca embutido

O Gather embute o site num quadro. Aqui nao, por duas razoes:

- a maioria dos sites recusa ser embutido (`X-Frame-Options`) e o que aparece e
  um retangulo branco sem explicacao nenhuma;
- site embutido dentro da sede pode **se passar pela sede** - uma tela de login
  falsa dentro do escritorio da empresa e exatamente o golpe que a gente nao
  quer ajudar a montar.

Antes de abrir, o painel mostra **o endereco inteiro**. Quem clica ve pra onde
vai.

## 4. Como se usa

**Pendurar** (so diretoria): abre o decorador > botao **Link** no rodape > clica
no movel > nome + link > Salvar. O mesmo caminho, num movel que ja tem link,
mostra "Tirar o link".

**Abrir** (qualquer um): clica no movel. O clique tambem vale na celula de cima,
porque a arte alta (estante, geladeira, quadro) aparece acima da celula onde
mora - foi esse exato detalhe que ja tinha quebrado o clique da estante.

**A marca:** um selo indigo com um elo de corrente no canto do movel, pulsando
devagar. Ele e desenhado a cada quadro, **fora do pre-render**: pendurar um link
nao pode custar redesenhar o mapa inteiro. Sem a marca o recurso nao existiria -
movel com link e visualmente identico a movel sem link, e ninguem clica no que
nao parece clicavel.

## 5. Resultado dos testes

### Automatico - `testes/conteudo.js`, 24 checagens, 0 falhas

| Grupo | O que ficou provado |
|---|---|
| Endereco | `https` e `http` passam; `javascript:`, `JaVaScRiPt:`, `data:`, `file:`, texto solto, vazio e url de 600 caracteres **nao** passam |
| Onde | movel aceita; chao vazio nao; fora do mapa nao |
| Guardar | nome sai limpo de espaco duplo, url sai normalizada, fica marcado quem pendurou |
| Recusa | link ruim, nome vazio e chao vazio sao recusados **e o link bom que ja estava la continua intacto** |
| Apagar | trocar o movel por chao derruba o link junto e nao deixa orfao |
| Arquivo adulterado | com um `javascript:` colado na mao dentro do `mapa.json`, o servidor recarrega com **zero** links |

### No navegador

| O que | Resultado |
|---|---|
| Botao **Link** no decorador | aparece so pra diretoria; acende quando ligado e desliga o pincel |
| Link ruim | o servidor recusa e o formulario **continua aberto** mostrando "O link precisa comecar com http:// ou https://" |
| Link bom | salva, o formulario fecha sozinho e a marca aparece no mapa |
| A marca | selo indigo no canto de cima do movel, um tile acima quando o movel e alto |
| Clique de verdade no movel | abre o painel com o nome e o endereco inteiro |
| Clique na celula **de cima** do movel alto | abre igual - a regra do `row + 1` funciona |
| Tirar | some do mapa na hora, nos dois clientes |

### O que ainda nao tem

- **Nao ha lista** dos links pendurados. Pra achar um, e preciso andar ate ele.
  Com meia duzia isso e tranquilo; com trinta, nao.
- O conteudo e sempre um link. Texto solto, imagem e video embutidos ficam pra
  depois - e, no caso do video, esbarram na mesma questao de embutir da secao 3.3.
