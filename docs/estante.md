# A estante: o acervo de livros da sede

Clicar numa estante do mapa abre o acervo da ADM num painel lateral. Clicar numa
capa abre o livro no **leitor da sede**, em tela cheia, sem sair do escritorio.
A ideia e tirar o atrito: a pasta de livros existe, mas mora num link que
ninguem lembra. Na estante, ela fica onde uma pessoa procuraria por um livro.

## Como abre e como fecha

**Abre no clique, e so no clique.** A primeira versao abria por proximidade e
era irritante do jeito mais bobo: voce fechava o painel, dava um passo, e ele
voltava - o mapa tem estante em quase toda parede.

**Fecha quando voce vai embora**: clicar no chao pra andar, `Esc`, ou o X. Sair
dali e sair dali.

O clique vale tambem na celula **acima** da estante. A estante tem 2 tiles de
arte e so 1 de chao, entao a metade que a pessoa mais ve - as prateleiras - cai
na celula de cima. Amarrado so ao tile do chao, clicar no meio da estante nao
abria nada.

O painel e lateral, e nao de tela cheia como o do Trello: o mapa continua
visivel atras, e clicar no chao ja fecha a estante e leva a pessoa embora.

## O que aparece

**So a capa.** Nao e economia de tela, e o jeito que a gente procura livro: bate
o olho e reconhece. O titulo entra no passar do mouse.

A capa e a **primeira pagina do PDF** - e ela e a capa de verdade: nos livros do
acervo (ENAP, SRAP, OpenStax) a pagina 1 e a capa publicada, com arte, titulo e
editora. Conferido olhando, nao suposto.

### A capa e feita UMA vez, e fica guardada

O problema nunca foi qual imagem, foi **quantas vezes**. Antes, a pagina 1 era
desenhada no navegador de cada pessoa, toda vez que ela abria a estante - e pra
desenhar a pagina 1 o navegador baixa o comeco do PDF, que nos livros da OpenStax
da uns 30 MB. Por isso a capa quase nunca aparecia: nao era erro, era o download
nao terminando antes de a pessoa fechar o painel.

Agora a primeira pessoa que abre a estante depois de o livro entrar desenha a
capa **uma vez** e manda pro servidor (`POST /api/estante/:id/capa`), que guarda
em `DATA_DIR/capas/`. Dali em diante ela vem pronta, pra todo mundo, e sobrevive
a reiniciar o servidor. Na pratica: **a capa aparece sozinha quando o livro e
adicionado**.

Do Drive continua vindo a miniatura que o proprio Drive gera (que e a mesma
pagina 1), sem gastar nada. A capa guardada serve de rede quando o Drive nao
gera miniatura - acontece em PDF muito grande.

Por que nao desenhar no servidor: renderizar PDF em Node pede biblioteca nativa
(canvas), e este projeto nao tem etapa de build de proposito. O navegador ja tem
o PDF.js carregado e ja sabe desenhar a pagina - o que faltava era so nao jogar
fora o resultado.

**O que protege a rota**, ja que a imagem vem de fora e passa a ser servida pra
sede inteira:

- so quem esta logado manda;
- o id tem que estar **no acervo**;
- teto de **400 KB** (a capa de 150px da uns 7 KB);
- o tipo e decidido pelos **bytes**, nao pelo cabecalho: um HTML com
  `Content-Type: image/png` e recusado;
- a **primeira vence**. Capa que ja existe nao e substituida - senao qualquer
  pessoa da sede poderia trocar a capa de um livro por outra imagem depois, e a
  estante inteira e feita de capa. Trocar de proposito continua possivel: e so
  apagar o arquivo em `DATA_DIR/capas`.

Medido com o acervo local de 12 livros: 12 de 12 capas guardadas na primeira
abertura, 148 KB no total (de 7 a 22 KB cada), e na abertura seguinte as 12
chegam prontas.

### A celula e 3:4, e nao 2:3

2:3 e a proporcao de um livro de bolso impresso - mas a nossa capa **nao e um
livro, e a pagina 1 de um PDF**, e pagina e A4 ou Letter.

Medindo as 12 capas do acervo: de **0,704** (A4) a **0,783** (Letter), nenhuma
perto de 0,667. Com a celula em 2:3 e `object-fit: cover`, sumia de **5% a 15%
da largura** - nos livros da OpenStax quase um sexto da capa, cortado nos dois
lados.

3:4 (0,75) fica no meio das duas familias: o corte cai pra no maximo **6%**, que
e margem de pagina. Escolhido em vez de `object-fit: contain` porque `contain`
deixaria tarja, e a tarja quebra duas coisas de proposito no desenho da capa: o
vinco da lombada (que cairia no vazio em vez de na capa) e a leitura de "pilha
de livros" que a grade tem.

Enquanto a capa nao chega - ou se ela nao carregar - a tela desenha uma, com o
titulo e a cor tirada do proprio titulo. O mesmo livro tem sempre a mesma capa,
senao a estante deixaria de ser reconhecivel de relance, que e o ponto dela.

Aqui **nao** se cadastra livro nem se mexe na pasta. Estante e pra pegar e ler.

## O leitor

`public/js/leitor.js`. Abre por cima de tudo, em fundo escuro, com a pagina
inteira cabendo na tela.

| Gesto | O que faz |
|---|---|
| clicar na metade direita/esquerda da folha | vira pra frente/pra tras |
| setas do lado, `→` `←`, `PageDown` `PageUp`, espaco | idem |
| `Home` / `End` | primeira / ultima pagina |
| `+` / `-` (ou os botoes) | zoom de 50% a 300%; acima de 100% a folha rola |
| **Baixar** | baixa o PDF - pelo nosso servidor, com o nome do livro |
| `Esc` ou a seta do topo | fecha o leitor (a estante continua aberta atras) |

**Lembra a pagina.** Fechou na 47, reabre na 47 (por navegador, em
`localStorage`).

**Quem desenha o PDF** e o PDF.js, o leitor da Mozilla (o do Firefox), versao
**4.10.38 fixa**, carregado do cdnjs so quando alguem abre o primeiro livro.
Nao e a 3.x dos tutoriais: a 3.x tem a CVE-2024-4367 (PDF preparado roda codigo
na pagina). E mesmo na 4.x vai `isEvalSupported: false`, porque a pasta e de
muita gente.

**Livro grande abre rapido.** O leitor pede ao servidor so os pedacos das
paginas que mostra (`Range`), e o servidor repassa o `Range` pro Drive.

Medido no maior livro do acervo (Introduction to Business, 663 paginas, 142 MB):
a pagina 1 custa ~30 MB (a capa desse PDF e uma imagem pesada), a pagina seguinte
**0 MB**, pular pra 663 **0,25 MB**. Isso depende de `disableStream: true` junto
com `disableAutoFetch: true` - sem o primeiro, o PDF.js continuava baixando o
pedido inicial ate o fim, e o livro de 142 MB saia inteiro (166 MB contando os
pedacos) so pra mostrar a capa.

## Quem ve e quem le

- **Da sede** (conta normal): ve as capas, le e baixa.
- **Quem e de fora** (link de reuniao): **nao ve a estante**. O acervo e material
  interno, e parte dele pode ter direito autoral que nao permite mostrar pra fora.
  Quem entra pelo link de uma reuniao nao tem conta nem cookie, entao nenhuma rota
  da estante o reconhece (`docs/plano-reuniao-por-link.md`). Ate 20/09/2026 havia
  um "visitante" que via as capas com um cadeado - saiu junto com a conta de
  visitante.

## Setores

Cada **subpasta** da pasta da biblioteca e um setor. A estante agrupa os livros
por setor e poe um filtro no topo (Todos · Comercial · Gente e Gestao ·
Marketing · Projetos).

```
pasta da biblioteca/
  Comercial/        Negociacao e Arbitragem (PNAP).pdf ...
  Gente e Gestao/   ...
  Marketing/        ...
  Projetos/         ...
  solto.pdf         <- sem setor: aparece em "Outros", no fim
```

- **So um nivel.** Pasta dentro de setor e ignorada: estante com arvore de pastas
  vira gaveta de arquivo.
- O numero da frente sai do nome: `01. Marketing` aparece como "Marketing", mas
  continua ordenando os setores.
- Acervo sem nenhuma subpasta mostra a grade simples, sem filtro.
- O mesmo nome de arquivo em dois setores sao dois livros.

## O acervo inicial

Doze livros de acesso aberto, baixados de fonte oficial em 13/09/2026 - nada de
site de "PDF gratis" com livro comercial. Estao em `server/data/livros/<setor>/`
(fora do git). **Quando o Drive for ligado, eles precisam ir pra pasta do Drive
com as mesmas subpastas** - com o Drive ligado, a estante le so o Drive.

| Setor | Livro | Fonte | Licenca |
|---|---|---|---|
| Marketing | Principles of Marketing | [OpenStax](https://openstax.org/details/books/principles-marketing) (Rice University) | CC BY-NC-SA 4.0 |
| Marketing | Administracao de Marketing | [Editora Cientifica Digital](https://downloads.editoracientifica.org/books/978-65-87196-54-1.pdf) | acesso aberto |
| Marketing | Comunicacao e Marketing: Tendencias e Desafios | [eduCAPES](https://educapes.capes.gov.br/) | recurso educacional aberto |
| Projetos | Elaboracao e Gestao de Projetos (Claudine J. de Carvalho) | eduCAPES - PNAP/UFSC/CAPES | recurso educacional aberto |
| Projetos | Metodologia de Gerenciamento de Projetos do SISP | [gov.br - Governo Digital](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/sisp/documentos/metodologia-de-gerenciamento-de-projetos-do-sisp-mgp-sisp) | publicacao do governo federal, uso livre |
| Projetos | Introducao a Gestao de Projetos | [Repositorio Enap](https://repositorio.enap.gov.br/) | publicacao da Enap |
| Comercial | Negociacao e Arbitragem | eduCAPES - PNAP/UFSC/CAPES | recurso educacional aberto |
| Comercial | Entrepreneurship | [OpenStax](https://openstax.org/details/books/entrepreneurship) | CC BY-NC-SA 4.0 |
| Comercial | Introduction to Business 2e | [OpenStax](https://openstax.org/details/books/introduction-business-2e) | CC BY-NC-SA 4.0 |
| Gente e Gestao | Gestao de Pessoas: Lideranca e Competencias para o Setor Publico (Bergue) | [Repositorio Enap](https://repositorio.enap.gov.br/handle/1/4283) - Enap/SBAP | publicacao da Enap |
| Gente e Gestao | Gestao de Pessoas: Bases Teoricas e Experiencias no Setor Publico | [Repositorio Enap](https://repositorio.enap.gov.br/handle/1/514) | publicacao da Enap |
| Gente e Gestao | Organizational Behavior | [OpenStax](https://openstax.org/details/books/organizational-behavior) | CC BY-NC-SA 4.0 |

**CC BY-NC-SA** permite copiar e distribuir **sem fim comercial**, citando a
fonte: ler e estudar dentro da ADM pode; vender ou cobrar pelo acesso, nao.

### Consultoria: os 12 que entraram em 24/09/2026

O Caio pediu "os melhores livros de consultoria". Os classicos (Block, Minto, *The
McKinsey Way*, Maister, Weiss, Djalma de Oliveira) sao comerciais e nao tem versao
legal gratuita: ficaram de fora. Estes 12 sao de fonte oficial, e cada PDF foi
conferido (e o documento inteiro, nao folheto). Entraram nos setores pelo que cada
diretoria faz numa empresa junior: quem executa consultoria e Projetos; estrategia e
cultura ficam com Gente e Gestao; a visao de quem contrata consultor ajuda o Comercial.

| Setor | Livro | Fonte | Licenca |
|---|---|---|---|
| Projetos | Management Consulting: A Guide to the Profession (Kubr, ed. 1980, 353 p.) | [acervo digital da OIT](https://webapps.ilo.org/public/libdoc/ilo/1980/80B09_73_engl.pdf) | publicacao da OIT, distribuida pela propria OIT |
| Comercial | How to Select and Use Consultants: A Client's Guide (Kubr, 192 p.) | [acervo digital da OIT](https://webapps.ilo.org/public/libdoc/ilo/1992/92B09_22_engl.pdf) | publicacao da OIT, distribuida pela propria OIT |
| Projetos | Referenciais de Consultoria do SEBRAE (96 p.) | [biblioteca do SEBRAE](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/C08A566FFBE7EE29832579CF0049C370/$File/NT000474F2.pdf) | publicacao gratuita do SEBRAE |
| Projetos | Manual de Consultoria Estruturada (28 p.) | [SEBRAE](https://sebrae.com.br/content/dam/portal-sebrae/ms/midias/documentos/pdfs/Credenciamento%20SGF/06_Manual_Consultoria_Estruturada_Sebrae.pdf) | publicacao gratuita do SEBRAE |
| Projetos | Como Elaborar um Plano de Negocios (2021, 164 p.) | [biblioteca do SEBRAE](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/5f6dba19baaf17a98b4763d4327bfb6c/$File/2021.pdf) | publicacao gratuita do SEBRAE |
| Projetos | Guia Metodologico de Gestao de Processos (25 p.) | [gov.br - Planejamento](https://www.gov.br/planejamento/pt-br/acesso-a-informacao/governanca/gestao-estrategica/documentos/caderno-1-processos.pdf) | publicacao do governo federal, uso livre |
| Projetos | Analise e Melhoria de Processos (MASP, 2016, 114 p.) | [Repositorio Enap](https://repositorio.enap.gov.br/handle/1/2457) | publicacao da Enap |
| Projetos | Organizacao, Processos e Tomada de Decisao (158 p.) | eduCAPES - PNAP/UFSC/CAPES | recurso educacional aberto |
| Gente e Gestao | Administracao Estrategica (3a ed., 172 p.) | eduCAPES - PNAP/UFSC/CAPES | recurso educacional aberto |
| Gente e Gestao | Cultura e Mudanca Organizacional (106 p.) | eduCAPES - PNAP/UFSC/CAPES | recurso educacional aberto |
| Gente e Gestao | Principles of Management (605 p.) | [OpenStax](https://openstax.org/details/books/principles-management) | CC BY-NC-SA 4.0 |
| Gente e Gestao | Mastering Strategic Management (492 p., 217 MB) | [BCcampus](https://opentextbc.ca/strategicmanagement/) | CC BY-NC-SA |

Ficaram de fora de proposito: a 4a edicao do Kubr (o PDF do site da OIT tem 2 paginas -
o livro e vendido; a copia completa que circula e de terceiro) e *Design Thinking:
inovacao em negocios* (MJV, so vendido).

## De onde vem os livros

`server/acervo.js`. Duas origens, a mesma cara pro navegador:

### 1. A pasta do Drive (o jeito de producao)

O servidor le a pasta da biblioteca com uma **conta de servico** do Google
Cloud - um "robo" com quem a pasta e compartilhada **so pra leitura**.

Por que nao o login Google de cada pessoa: a pasta e da EMPRESA. Com o login de
cada um, toda pessoa precisaria ter a pasta compartilhada com ela, conectar a
conta e aceitar escopo de Drive - e quem de fora nao leria nada. Com a conta de
servico, a pasta continua **privada** no Drive, e o livro chega no navegador
pelo nosso servidor: ninguem ve link do Drive, ninguem sai da sede.

**Pra ligar (uma vez so):**

1. **Google Cloud Console** (pode ser o mesmo projeto do Calendario):
   - *APIs e servicos > Biblioteca* > ative a **Google Drive API**.
   - *IAM e administrador > Contas de servico* > **Criar conta de servico**
     (nome tipo `biblioteca-sede`; nao precisa de papel nenhum).
   - Na conta criada: *Chaves > Adicionar chave > JSON*. Baixa um arquivo
     `.json`. **Esse arquivo e uma senha**: nao vai pro git, nao vai pro chat,
     nao vai por e-mail.
2. **No Drive**: abra a pasta dos livros > *Compartilhar* > cole o e-mail da
   conta de servico (o `...@...iam.gserviceaccount.com` que aparece no JSON) >
   **Leitor**. Se a pasta estiver num Drive compartilhado (de equipe), adicione
   a conta como membro com papel de Leitor.
3. **No Render** (ou no `.env` local), duas variaveis:
   - `GOOGLE_DRIVE_PASTA` - o link da pasta ou so o id dela (o pedaco depois de
     `folders/`).
   - `GOOGLE_CONTA_SERVICO` - o conteudo do JSON. Se o painel estragar as
     quebras de linha da chave, cole em base64
     (`base64 -w0 chave.json` no Git Bash) - o servidor aceita os dois.

   **No Render, a chave vai como arquivo, e nao como variavel.** Ela tem mais de
   3 mil caracteres em base64, e em 24/09/2026 nao coube no campo de variavel do
   painel. O Render tem lugar proprio pra isso: *Environment > Secret Files >
   Add Secret File*, com o nome **`conta-servico.json`** e o JSON colado inteiro
   como conteudo. O Render poe o arquivo em `/etc/secrets/conta-servico.json`, e
   o servidor le dali sozinho (outro caminho: `GOOGLE_CONTA_SERVICO_ARQUIVO`).
   Vale a primeira chave de verdade, nesta ordem: a variavel, depois o arquivo -
   uma variavel colada pela metade nao esconde o arquivo. O `GOOGLE_DRIVE_PASTA`,
   curto, continua sendo variavel.

Pronto: todo PDF dessa pasta vira livro na estante. Pra por livro, poe o PDF na
pasta; pra tirar, tira. O nome do arquivo vira o titulo
(`Gestao_de_Processos.pdf` -> "Gestao de Processos"). A lista fica 1 minuto em
cache - livro novo aparece em ate 1 minuto, e abre na hora se alguem ja tiver o
id.

A conta de servico pede so `drive.readonly`: mesmo que a chave vaze, ela nao
apaga nem altera nada. Mas enxerga tudo que for compartilhado com ela - entao
compartilhe **so a pasta da biblioteca**.

### 2. A pasta local (desenvolvimento, ou antes do Drive)

Sem as duas variaveis, o acervo e a pasta `livros/` dentro da pasta de dados
(`server/data/livros/`, ou `DATA_DIR/livros`). Poe o PDF la e ele aparece. Fora
do git, como todo o `server/data/`.

## Seguranca

- O id que o navegador manda **nunca vira caminho** nem vai direto pro Drive: so
  e aceito se estiver na ultima listagem da pasta. Sem isso, a sede serviria
  qualquer arquivo que a conta de servico enxerga (ou `../../usuarios.json`, na
  pasta local). `testes/acervo.js` confere as recusas.
- Pro navegador vai so `id, titulo, setor, tamanho, atualizado, temCapa` - nem
  nome de arquivo, nem link do Drive.
- A chave da conta de servico vive **so** em variavel de ambiente.

## O acervo e um so

Qualquer estante do mapa abre a mesma lista - a da Biblioteca e as das salas.
Estante por sala seria mais bonito e mais inutil: ninguem ia lembrar em qual
sala esta qual livro.

Todo abrir busca a lista de novo, pra livro novo aparecer sem recarregar.

## Busca

No topo do painel, antes de tudo. Veio da referencia: no painel lateral do
Gather (`referencias/20-chat-canais-e-dms.png`) a busca e o **primeiro**
elemento, antes dos grupos - nao um extra escondido no fim.

Filtra por **titulo ou setor**. Por setor tambem porque "marketing" e as duas
coisas ao mesmo tempo aqui, e explicar a diferenca pra quem digitou seria pior
do que mostrar os dois.

**Sem acento e sem caixa**: "gestao" acha "Gente e Gestao" e "Gestao de
Pessoas". Ter que acertar o acento pra encontrar um livro e exatamente o atrito
que a estante existe pra tirar. Medido com o acervo de 12: `gestao` -> 4.

Detalhes que evitam confusao:

- digitar **apaga o filtro de setor**, senao os dois brigam e a estante
  "esvazia" sem a pessoa entender por que;
- **Esc com texto limpa a busca**; Esc de novo fecha o painel. Fechar tudo so
  porque a pessoa quis desfazer a busca seria passar do ponto;
- **fechar a estante zera a busca**: reabrir tem que ser reabrir, e nao cair no
  meio de uma busca de dez minutos atras;
- a contagem do topo vira **"4 de 12"** enquanto ha busca, e a grade diz
  **"Nenhum livro com X"** quando nao acha.

## Quem esta lendo o que

A capa mostra quem esta com aquele livro aberto agora, e a placa da pessoa no
mapa passa a dizer **"lendo"**. E o que faltava pra estante ser a biblioteca da
SEDE e nao uma lista de arquivo: da pra ver que alguem ja esta no livro, e puxar
assunto por causa disso.

Como funciona: o leitor avisa (`Network.estouLendo(id)`) **depois** que o livro
abriu de verdade - avisar no clique marcaria como "lendo" quem tentou abrir e
levou erro de rede. O servidor guarda no player, como o `dividindoTela`, e
manda pra todo mundo; vai junto no `init`, entao quem chega depois ja ve.

**O titulo vem do servidor, nunca do cliente.** O cliente manda so o id; o
servidor procura no acervo e usa o titulo que ele mesmo tem. Aceitar o titulo do
cliente deixaria qualquer pessoa transmitir o texto que quisesse pra tela de
todo mundo - e esse texto aparece na capa e em cima da cabeca do boneco. Id que
nao esta no acervo e ignorado.

Na placa do mapa, "lendo" **ganha do status**: quem esta com o leitor na cara
nao esta vendo o escritorio, e isso e mais util saber do que se a pessoa se
marcou como Livre.

### Resultado dos testes (13/09/2026)

Ponta a ponta, no navegador, contra o acervo local de 12 livros:

| O que | Resultado |
|---|---|
| mandar so o id | volta `{id, titulo}` com o titulo do servidor |
| mandar id que nao existe | ignorado, estado anterior intacto |
| mandar `null` | limpa |
| a capa | selo "Voce" na capa certa, so nela |
| a placa no mapa | "Dev · lendo" |

## O que falta

- **EPUB.** Hoje so PDF, porque e o que o leitor abre. Listar EPUB sem conseguir
  abrir seria prometer e nao cumprir.
- ~~**Capa pronta na pasta local.**~~ **FEITO**: a capa e desenhada uma vez e
  guardada no servidor. Ver "A capa e feita UMA vez, e fica guardada".
- ~~**Marcar quem esta lendo o que.**~~ **FEITO**: ver "Quem esta lendo o que".

## Acervo fisico da sala (14/09/2026)

A estante ganhou duas abas: **Digitais** (os PDFs) e **Na sala da ADM** (os
livros de papel). Mesma busca (agora tambem por autor) e mesmo filtro por setor.

- Catalogo: `server/acervo-fisico.json` (morava em `public/dados/`; saiu de la em 18/09 pra nao ficar aberto no endereco de outro cliente - ver docs/varias-sedes.md), **96 livros transcritos das 12
  fotos** das estantes. `codigo` e a etiqueta da lombada quando da pra ler;
  `conferir: true` marca os 17 com titulo ou autor lido pela metade (a foto 9
  saiu tremida e ficou de fora). Pra corrigir ou acrescentar livro, e editar o
  JSON.
- Setores: os quatro da EJ (Marketing, Comercial, Projetos, Gente e Gestao) e
  **Financas**, porque a sala tem uma prateleira inteira de contabilidade e
  mercado de capitais. A classificacao e um primeiro chute - mude no JSON.
- **Emprestimo** (`server/emprestimos.js`, `DATA_DIR/emprestimos.json`, entra
  no backup): quem e da sede clica "Peguei este livro"; o livro passa a mostrar
  "Com Fulano" pra todo mundo, na hora. Outra pessoa nao consegue pegar o mesmo
  livro. Devolve quem pegou - ou a diretoria, pro livro de quem saiu da EJ nao
  ficar preso. `testes/emprestimos.js`.
- Livro de papel que tem PDF legal mostra a marca **PDF** e o botao "Ler o PDF".

### PDFs dos livros da sala: o que foi procurado

Procurado em fontes legais (gov.br, CFC, eduCAPES, repositorios de
universidade, SciELO, Domínio Publico). Encontrados e baixados, conferidos pela
primeira pagina:

| Livro da sala | Fonte |
|---|---|
| Cadernos CVM: Fundos de Investimento | [CVM / gov.br](https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/cadernos) |
| Cadernos CVM: Principais Direitos dos Acionistas Minoritarios | CVM / gov.br |
| Cadernos CVM: Mercado de Derivativos (BM&F) | CVM / gov.br |
| Contabilidade para Pequenas e Medias Empresas (NBC, 2012) | [Conselho Federal de Contabilidade](https://cfc.org.br/) |
| Informacao e Globalizacao na Era do Conhecimento (Lastres e Albagli) | [RedeSist / IE-UFRJ](https://www.redesist.ie.ufrj.br/livros/informacao-e-globalizacao-na-era-do-conhecimento), grupo das proprias organizadoras (14 partes juntadas num PDF) |
| A Menina do Vale (Bel Pesce) | [FazINOVA](https://www.fazinova.com.br/ameninadovale), site da autora: e-book gratuito desde 2012, condicao dela pra lancar o impresso (82 p.) |
| Economia, Desenvolvimento Regional e Mercado de Trabalho do Brasil (IDT/BNB/Cesit, 2010) | [IDT](https://www.idt.org.br/content/arquivos/publicacoes/004_Economia_Desenvolvimento_Regional_e_Mercado_de_Trabalho_do_Brasil.pdf), coeditor - o link antigo do sineidt.org.br morreu, o IDT republicou no site novo (364 p.) |

**Alternativa aberta, nao e o mesmo livro:** os dois *Mercado de Capitais* da
sala (sem autor legivel na foto) nao tem PDF. No lugar, a estante digital tem
*Mercado de Valores Mobiliarios Brasileiro* (CVM, 5a ed., 2024, 411 p.,
[gov.br](https://www.gov.br/investidor/pt-br/educacional/publicacoes-educacionais/livros-cvm/)),
licenca CC BY-NC-ND - por isso ele **nao** tem `digital` no catalogo.

### Varredura dos 96 (14/09/2026)

Os 91 sem PDF foram procurados um por um, excluindo da busca os sites de copia
pirata (Z-Library, "livraria publica", pdfcoffee, docplayer, scribd e afins).
Resultado: **7 dos 96 tem PDF legal** (a tabela acima).

- **Nao tem versao legal gratuita**: todos os de editora comercial (Kotler,
  Solomon, Hair, Malhotra, Zeithaml, Falconi, Porter, Bossidy, Gitman,
  Garrison, Taleb, Frankl, Dolabela, Cobra, Paladini etc.). So aparecem em loja,
  em amostra de capitulo ou em site pirata. O Internet Archive tem alguns, mas
  como **emprestimo digital** de livro com direito autoral - nao e copia livre e
  nao entra na sede. Idem o S3 da Kroton com o livro KLS: esta aberto na
  internet, mas sem licenca nenhuma pra redistribuir.
- **Pode existir, nao deu pra confirmar**: *Empresa Junior: espaco de
  aprendizagem* (Moretto Neto e outros, Pallotti, 2004) tem texto completo no
  ResearchGate, que bloqueia robo. Se quem subiu foi um dos autores, e legal:
  abrir com conta no ResearchGate e conferir.
- **Nao achado em lugar nenhum**: *Observatorio de RH em Saude - Estacao
  CETREDE/UFC/UECE* (EdUECE, 2006) - vale pedir a EdUECE ou ao CETREDE.
- **Parente, conferir a capa**: se o *Tecnologia da Informacao para
  Administradores* da sala for do Helio Lemes Costa Jr., o mesmo autor tem
  *Informatica para Administradores* aberto no
  [eduCAPES](https://educapes.capes.gov.br/bitstream/capes/401199/1/PNAP%20-%20GS%20-%20Informatica%20para%20Administradores%20-%20GRAFICA%20atualizado.pdf)
  (PNAP/UFSC, CC BY-NC-SA). Nao foi posto na estante por nao ser o mesmo titulo.
- **Onde os comerciais existem em e-book legal**: Minha Biblioteca (Grupo A,
  GEN/Atlas, Saraiva - Solomon, Hair, Malhotra, Zeithaml, Fitzsimmons,
  Garrison, Hawkins, Paladini, Daft) e Biblioteca Virtual Pearson (Kotler
  *Marketing Essencial*, Gitman, Hong Yuh Ching, *Economia Brasileira*). Sao
  pagas por instituicao; a UECE assina so a EBSCO (1.007 titulos, login com
  e-mail institucional, lista de titulos nao publica).
