// O historico do chat no disco.
//
// Antes o chat vivia so na memoria do servidor. Isso quer dizer que **reiniciar
// apagava tudo** - e no plano gratuito do Render, que derruba o processo quando
// ninguem acessa, a conversa do time sumia sozinha de madrugada. Nao e falta de
// recurso, e dado sendo perdido, que e pior.
//
// O que NAO e guardado: os avisos de "fulano entrou/saiu" (`autorId: null`).
// Eles fazem sentido enquanto a sessao esta viva; depois de um reinicio viram
// uma parede de entra-e-sai de gente que nao esta mais online, empurrando a
// conversa de verdade pra fora da tela.
const fs = require('fs');
const path = require('path');
const pastaDados = require('./dados');

const ARQUIVO = pastaDados.arquivo('chat.json');
const ESPERA_MS = 1500; // junta as mensagens de uma rajada num gravar so

let timer = null;
let pendente = null;

function carregar(mensagensMax) {
  const vazio = { conversas: new Map(), proximoMsgId: 1 };
  let cru;
  try {
    cru = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  } catch (e) {
    return vazio; // primeira execucao, ou arquivo corrompido: comeca limpo
  }
  if (!cru || typeof cru !== 'object' || !cru.conversas) return vazio;

  const conversas = new Map();
  let maiorId = 0;
  Object.keys(cru.conversas).forEach((conversaId) => {
    const lista = Array.isArray(cru.conversas[conversaId]) ? cru.conversas[conversaId] : [];
    // O corte tem que valer tambem na LEITURA: um chat.json escrito por uma
    // versao com limite maior encheria a memoria de volta sem ninguem notar.
    const limpa = lista
      .filter((m) => m && typeof m.texto === 'string' && m.autorId !== null)
      .slice(-mensagensMax);
    if (!limpa.length) return;
    limpa.forEach((m) => { if (typeof m.id === 'number' && m.id > maiorId) maiorId = m.id; });
    conversas.set(conversaId, limpa);
  });

  return { conversas, proximoMsgId: maiorId + 1 };
}

function escrever() {
  if (!pendente) return;
  const { conversas, proximoMsgId } = pendente;
  pendente = null;
  const saida = { proximoMsgId, conversas: {} };
  conversas.forEach((lista, conversaId) => {
    const guardaveis = lista.filter((m) => m.autorId !== null);
    if (guardaveis.length) saida.conversas[conversaId] = guardaveis;
  });
  try {
    pastaDados.gravarSeguro(ARQUIVO, JSON.stringify(saida));
  } catch (e) {
    console.error('[chat] nao consegui salvar o historico:', e.message);
  }
}

// Marca que ha coisa nova pra gravar. Grava depois da espera, e nao a cada
// mensagem: numa conversa animada seriam dezenas de escritas por minuto no
// disco pra guardar quase sempre o mesmo conteudo.
function agendar(conversas, proximoMsgId) {
  pendente = { conversas, proximoMsgId };
  if (timer) return;
  timer = setTimeout(() => { timer = null; escrever(); }, ESPERA_MS);
  if (timer.unref) timer.unref(); // um gravar pendente nao segura o processo de pe
}

// Grava agora, sem esperar. Chamado quando o processo esta indo embora: sem
// isto, as ultimas mensagens antes do desligamento cairiam no buraco da espera.
function agora() {
  if (timer) { clearTimeout(timer); timer = null; }
  escrever();
}

module.exports = { carregar, agendar, agora, ARQUIVO };
