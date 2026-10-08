// Mesas reivindicadas. Ver docs/plano-mesa-pessoal.md.
//
// Duas coisas mudaram em relacao a primeira versao:
//
//   1. A mesa e da CONTA, nao da sessao. Antes o dono era o `socket.id` e o
//      `disconnect` largava a mesa - voce fechava a aba e a mesa deixava de ser
//      sua. Agora o dono e o `uid` e a lista vai pro disco.
//   2. Pegar uma mesa pega o **movel inteiro**, nao uma celula. Uma mesa da
//      sala Time tem 6 celulas (3 de largura por 2 de fundo); reivindicar uma
//      delas e ficar com 1/6 de mesa nao quer dizer nada.
const fs = require('fs');
const path = require('path');
const map = require('./map');
const usuarios = require('./usuarios');
const pastaDados = require('./dados');

const ARQUIVO = pastaDados.arquivo('mesas.json');

// chave canonica da mesa -> uid da conta dona
let donos = new Map();
// chave canonica da mesa -> [{ o, x, y }]. Fica separado da decoracao da
// diretoria (mapa-editado.js) de proposito: o que voce poe na SUA mesa e seu, e
// vai embora junto quando voce larga a mesa.
//
// `x` e `y` sao coordenadas de tile COM FRACAO (15.4, 18.6). Nao e uma coisa
// por celula: na referencia a pessoa poe onde quiser em cima da mesa, entao a
// posicao precisa ser mais fina que o tile.
let itens = new Map();

const ITENS_MAX = 14; // uma mesa cheia, sem virar bagunca

function chave(col, row) {
  return col + ',' + row;
}

// A varredura do movel mora no mapa, que e o arquivo espelhado entre cliente e
// servidor - assim os dois concordam sobre onde uma mesa comeca e termina.
function blocoEm(col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return map.celulasDaMesa(col, row);
}

function chaveDoBloco(celulas) {
  return chave(celulas[0][0], celulas[0][1]);
}

function mesaDaPessoa(uid) {
  for (const [k, dono] of donos) if (dono === uid) return k;
  return null;
}

// Reivindica ou larga. Devolve `true` se algo mudou (pra so avisar todo mundo
// quando valeu a pena).
function alternar(col, row, uid) {
  const celulas = blocoEm(col, row);
  if (!celulas || !uid) return false;

  const k = chaveDoBloco(celulas);
  const donoAtual = donos.get(k);
  if (donoAtual && donoAtual !== uid) return false; // mesa de outra pessoa

  // Cada pessoa fica com no maximo uma: pegar outra larga a anterior.
  const anterior = mesaDaPessoa(uid);
  if (anterior) {
    donos.delete(anterior);
    itens.delete(anterior);
  }

  // Clicou na propria mesa: era pra largar, e a linha de cima ja largou.
  if (donoAtual !== uid) donos.set(k, uid);

  salvar();
  return true;
}

function largarDe(uid) {
  const k = mesaDaPessoa(uid);
  if (!k) return false;
  donos.delete(k);
  itens.delete(k); // suas coisas saem com voce
  salvar();
  return true;
}

// Cada coisa em cima da mesa tem um id proprio. Antes a borracha achava "a mais
// perto do clique", o que e um chute: duas canecas encostadas e voce nunca sabia
// qual ia sair. Com id, o cliente aponta exatamente qual.
function novoId() {
  return Math.random().toString(36).slice(2, 10);
}

// Devolve a lista de itens da mesa que contem esse ponto, se ela for do `uid`.
// Todas as operacoes passam por aqui - e a checagem que faz a mesa ser sua.
function listaMinhaEm(x, y, uid) {
  if (!uid || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Tem que cair no TAMPO. A metade de baixo da fileira da frente e a face
  // vertical do movel: pousar ali faria a coisa flutuar na frente da gaveteira,
  // parecendo largada no chao.
  if (!map.noTampo(x, y)) return null;
  const celulas = blocoEm(Math.floor(x), Math.floor(y));
  if (!celulas) return null;
  const k = chaveDoBloco(celulas);
  if (donos.get(k) !== uid) return null;
  return { k, lista: itens.get(k) || [] };
}

function guardar(k, lista) {
  if (lista.length) itens.set(k, lista);
  else itens.delete(k);
  salvar();
}

// duas casas: o cliente manda float do mouse, e sem cortar o arquivo encheria
// de 15.400000000000002
const arred = (v) => Math.round(v * 100) / 100;

function porItem(x, y, objeto, uid) {
  if (!Number.isInteger(objeto) || objeto < 1 || objeto > map.OBJETO_MAX) return false;
  const alvo = listaMinhaEm(x, y, uid);
  if (!alvo || alvo.lista.length >= ITENS_MAX) return false;

  alvo.lista.push({ id: novoId(), o: objeto, x: arred(x), y: arred(y) });
  guardar(alvo.k, alvo.lista);
  return true;
}

// Mover e tirar trabalham por id, e so dentro da MESMA mesa: arrastar uma
// caneca pra mesa do vizinho seria decorar a mesa dele.
function moverItem(id, x, y, uid) {
  const alvo = listaMinhaEm(x, y, uid);
  if (!alvo) return false;
  const it = alvo.lista.find((i) => i.id === id);
  if (!it) return false;
  it.x = arred(x);
  it.y = arred(y);
  guardar(alvo.k, alvo.lista);
  return true;
}

function tirarItem(id, uid) {
  for (const [k, lista] of itens) {
    if (donos.get(k) !== uid) continue;
    const i = lista.findIndex((it) => it.id === id);
    if (i < 0) continue;
    lista.splice(i, 1);
    guardar(k, lista);
    return true;
  }
  return false;
}

// O que o cliente precisa pra desenhar: as celulas (pro contorno cobrir a mesa
// inteira) e o nome do dono, que sai da conta - senao a plaquinha ficaria em
// branco toda vez que o dono estivesse offline.
function paraEnvio() {
  const lista = [];
  for (const [k, uid] of donos) {
    const partes = k.split(',');
    const celulas = blocoEm(Number(partes[0]), Number(partes[1]));
    // A diretoria pode ter apagado a mesa pelo decorador. Sem movel, sem dono.
    if (!celulas) {
      donos.delete(k);
      continue;
    }
    const conta = usuarios.porId(uid);
    lista.push({
      chave: k,
      celulas,
      donoUid: uid,
      donoNome: conta ? conta.nome : '',
      itens: (itens.get(k) || []).slice(),
    });
  }
  return lista;
}

// Aceita o formato antigo ({"c,r": objeto}, uma coisa por celula) e o converte
// pro novo. Sem isso, quem ja tinha decorado a mesa perderia tudo.
function normalizarItens(bruto) {
  if (Array.isArray(bruto)) {
    return bruto
      .filter((it) => it && Number.isFinite(it.x) && Number.isFinite(it.y) && Number.isInteger(it.o))
      .map((it) => ({ id: it.id || novoId(), o: it.o, x: it.x, y: it.y }))
      .slice(0, ITENS_MAX);
  }
  if (!bruto || typeof bruto !== 'object') return [];
  return Object.keys(bruto).map((cel) => {
    const p = cel.split(',');
    // no formato antigo a coisa ficava no meio da celula
    return { id: novoId(), o: bruto[cel], x: Number(p[0]) + 0.5, y: Number(p[1]) + 0.5 };
  }).filter((it) => Number.isInteger(it.o) && Number.isFinite(it.x)).slice(0, ITENS_MAX);
}

function salvar() {
  try {
    const dados = Array.from(donos.entries())
      .map(([k, uid]) => ({ chave: k, uid, itens: itens.get(k) || [] }));
    pastaDados.gravarSeguro(ARQUIVO, JSON.stringify({ planta: map.VERSAO_PLANTA, mesas: dados }, null, 2));
  } catch (e) {
    console.error('Nao consegui salvar as mesas:', e.message);
  }
}

function carregar() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    // A mesa e guardada pela celula do canto dela: de outra planta, a chave
    // cairia em outra mesa (ou em lugar nenhum). Recomeca e cada um pega de novo.
    const versao = Number(dados.planta) || 1;
    if (versao !== map.VERSAO_PLANTA) {
      pastaDados.guardarDePlantaAntiga(ARQUIVO, versao);
      return;
    }
    (dados.mesas || []).forEach((m) => {
      if (typeof m.chave !== 'string' || typeof m.uid !== 'string') return;
      donos.set(m.chave, m.uid);
      const lidos = normalizarItens(m.itens);
      if (lidos.length) itens.set(m.chave, lidos);
    });
  } catch (e) {
    donos = new Map(); // primeira vez, ou arquivo corrompido: comeca vazio
    itens = new Map();
  }
}

carregar();

module.exports = { blocoEm, alternar, largarDe, porItem, moverItem, tirarItem, mesaDaPessoa, paraEnvio };
