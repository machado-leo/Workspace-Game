// Contas do escritorio, guardadas num JSON no disco (o projeto nao usa banco
// externo). Ver docs/plano-login.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pastaDados = require('./dados');

const PASTA = pastaDados.PASTA;
const ARQUIVO = path.join(PASTA, 'usuarios.json');
const ARQUIVO_CONFIG = path.join(PASTA, 'config.json');

const SCRYPT_KEYLEN = 64;
// Custo do scrypt. N=2^15 e o minimo que a OWASP recomenda hoje - o dobro do
// padrao do Node (2^14) -, e continua barato pra um login, que e raro (a sessao
// dura 30 dias). `maxmem` precisa acompanhar: o scrypt usa ~128*N*r bytes, acima
// do teto padrao de 32 MB do Node, senao ele estoura. `scryptSync` bloqueia,
// entao so um hash roda por vez - nao ha risco de varios logins somarem memoria.
const SCRYPT = { N: 32768, r: 8, p: 1 };
// Hash criado antes deste custo nao guardava parametro nenhum: era o padrao do
// Node. Conta antiga continua conferindo com ele e so migra pro custo novo
// quando a pessoa trocar (ou redefinir) a senha - ninguem fica trancado fora.
const SCRYPT_LEGADO = { N: 16384, r: 8, p: 1 };

let usuarios = []; // carregado uma vez e mantido em memoria
let segredoSessao = null;

function garantirPasta() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
}

// Grava num temporario e renomeia: se cair energia no meio, o arquivo bom continua
// inteiro em vez de virar um JSON pela metade.
function gravarJson(arquivo, dados) {
  garantirPasta();
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function lerJson(arquivo, padrao) {
  try {
    if (!fs.existsSync(arquivo)) return padrao;
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    console.error('[usuarios] nao consegui ler ' + arquivo + ':', e.message);
    return padrao;
  }
}

function carregar() {
  usuarios = lerJson(ARQUIVO, { usuarios: [] }).usuarios || [];

  // Em hospedagem sem disco persistente (Render free), server/data/ some a cada
  // restart. Se o segredo fosse sorteado de novo, todo cookie de sessao virava
  // invalido e todo mundo era deslogado. Por isso SESSION_SECRET vem primeiro.
  const doAmbiente = (process.env.SESSION_SECRET || '').trim();
  if (doAmbiente.length >= 16) {
    segredoSessao = doAmbiente;
    return;
  }

  const config = lerJson(ARQUIVO_CONFIG, null);
  if (config && typeof config.segredoSessao === 'string') {
    segredoSessao = config.segredoSessao;
  } else {
    // Primeira execucao: gera e guarda, pra reiniciar o servidor nao deslogar todo mundo.
    segredoSessao = crypto.randomBytes(32).toString('hex');
    gravarJson(ARQUIVO_CONFIG, { segredoSessao });
  }
}

function salvar() {
  gravarJson(ARQUIVO, { usuarios });
}

function getSegredoSessao() {
  return segredoSessao;
}

// ---------- senha ----------

function hashSenha(senha, salt, params) {
  const p = params || SCRYPT;
  return crypto.scryptSync(senha, salt, SCRYPT_KEYLEN, {
    cost: p.N, blockSize: p.r, parallelization: p.p,
    maxmem: 128 * p.N * p.r * 2, // folga sobre o necessario (128*N*r)
  }).toString('hex');
}

function senhaConfere(senha, usuario) {
  // Conta do Google nasce SEM senha (senhaHash null). Sem esta linha, uma conta
  // sem hash seria uma conta em que qualquer um entra pelo formulario.
  if (!usuario || !usuario.senhaHash || !usuario.salt) return false;
  // Confere com o custo que ESTE hash usou: conta antiga nao guarda `scrypt` e
  // cai no legado; conta nova (ou que trocou de senha) traz o custo novo.
  const tentativa = Buffer.from(hashSenha(senha, usuario.salt, usuario.scrypt || SCRYPT_LEGADO), 'hex');
  const guardado = Buffer.from(usuario.senhaHash, 'hex');
  if (tentativa.length !== guardado.length) return false;
  return crypto.timingSafeEqual(tentativa, guardado);
}

// ---------- consultas ----------

function chaveEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function porEmail(email) {
  const chave = chaveEmail(email);
  // Conta sem e-mail (cadastro so com usuario e senha) tem emailChave vazia:
  // sem esta guarda, procurar por "" acharia a primeira conta dessas.
  if (!chave) return null;
  return usuarios.find((u) => u.emailChave === chave) || null;
}

function porId(id) {
  return usuarios.find((u) => u.id === id) || null;
}

// ---------- usuario (o nome de login) ----------
//
// `usuario` e o que a pessoa digita pra entrar: unico, sem acento, minusculo.
// `nome` e o do personagem (o que aparece em cima da cabeca) e tambem e unico,
// mas livre pra ter acento e espaco. Os dois sao conferidos sem diferenciar
// maiuscula de minuscula.

const USUARIO_RE = /^[a-z0-9._-]{3,20}$/;

function chaveUsuario(usuario) {
  return String(usuario || '').trim().toLowerCase();
}

function usuarioValido(usuario) {
  return USUARIO_RE.test(chaveUsuario(usuario));
}

function porUsuario(usuario) {
  const chave = chaveUsuario(usuario);
  if (!chave) return null;
  return usuarios.find((u) => u.usuarioChave === chave) || null;
}

function chaveNome(nome) {
  return String(nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// `ignorarId`: a propria conta, pra quem salva o perfil sem trocar o nome.
function nomeEmUso(nome, ignorarId) {
  const chave = chaveNome(nome);
  if (!chave) return false;
  return usuarios.some((u) => u.id !== ignorarId && chaveNome(u.nome) === chave);
}

// Sugere um usuario livre a partir de um texto (a parte do e-mail antes do @,
// ou o nome). Se ja existir, ganha um numero no fim.
function usuarioLivre(base) {
  let raiz = String(base || '').split('@')[0].toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');
  if (raiz.length < 3) raiz = (raiz + 'membro').slice(0, 20);
  raiz = raiz.slice(0, 20);
  let candidato = raiz;
  for (let n = 2; porUsuario(candidato); n++) {
    const sufixo = String(n);
    candidato = raiz.slice(0, 20 - sufixo.length) + sufixo;
  }
  return candidato;
}

// Contas criadas antes do login por usuario nao tem `usuario`: ganham um, a
// partir do e-mail, na primeira subida. Roda uma vez e depois nao acha nada.
function migrarUsuarios() {
  let mudou = false;
  usuarios.forEach((u) => {
    if (u.usuarioChave) return;
    u.usuario = usuarioLivre(u.email || u.nome);
    u.usuarioChave = u.usuario;
    mudou = true;
  });
  if (mudou) {
    console.log('[usuarios] contas antigas ganharam um nome de usuario (a parte do e-mail antes do @)');
    salvar();
  }
}

// O que pode sair do servidor: nunca o hash nem o salt.
function publico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nome: usuario.nome,
    usuario: usuario.usuario || null,
    email: usuario.email,
    isAdmin: !!usuario.isAdmin,
    appearance: usuario.appearance || null,
    criadoEm: usuario.criadoEm || null,
    senhaTemporaria: !!usuario.senhaTemporaria,
    // conta que entra pelo Google pode nao ter senha: a tela esconde "Trocar senha"
    temSenha: !!usuario.senhaHash,
    google: !!usuario.googleSub,
    // so sai em resposta pra PROPRIA pessoa (/api/eu, login): publico() nao vai
    // na lista de gente do socket
    whatsapp: usuario.whatsapp || null,
  };
}

// ---------- escrita ----------

// emailVerificado (ver docs/email.md):
//   true      - o dono provou o e-mail (link por e-mail, ou o Google);
//   false     - criada com o e-mail ligado e o link ainda nao foi clicado: NAO entra;
//   ausente   - criada antes de existir e-mail na sede (ou com ele desligado):
//               entra como sempre entrou. Ligar o e-mail nao tranca ninguem fora.
function criar({ usuario: usuarioDigitado, nome, email, senha, isAdmin, emailVerificado }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const login = usuarioDigitado ? chaveUsuario(usuarioDigitado) : usuarioLivre(email || nome);
  const usuario = {
    id: crypto.randomUUID(),
    nome,
    usuario: login,
    usuarioChave: login,
    email: String(email || '').trim(),
    emailChave: chaveEmail(email),
    salt,
    senhaHash: hashSenha(senha, salt),
    scrypt: SCRYPT,     // custo usado neste hash, pra senhaConfere saber conferir
    isAdmin: !!isAdmin,
    appearance: null,
    criadoEm: Date.now(),
    ultimoAcesso: Date.now(),
  };
  if (emailVerificado !== undefined) usuario.emailVerificado = !!emailVerificado;
  usuarios.push(usuario);
  salvar();
  return usuario;
}

// Conta de quem entrou com o Google da ADM. Nasce SEM senha: quem prova quem ela
// e e o Google, e uma senha a mais seria so mais uma coisa pra vazar. `googleSub`
// e o id fixo da pessoa no Google (o e-mail pode ser renomeado; o sub, nao).
function criarPeloGoogle({ nome, email, sub, isAdmin }) {
  const login = usuarioLivre(email || nome);
  const usuario = {
    id: crypto.randomUUID(),
    nome,
    usuario: login,
    usuarioChave: login,
    email: String(email).trim(),
    emailChave: chaveEmail(email),
    salt: null,
    senhaHash: null,
    googleSub: String(sub),
    emailVerificado: true,     // o Google ja provou
    isAdmin: !!isAdmin,
    appearance: null,
    criadoEm: Date.now(),
    ultimoAcesso: Date.now(),
  };
  usuarios.push(usuario);
  salvar();
  return usuario;
}

// O Google acabou de provar que a pessoa e dona deste e-mail, numa conta que ate
// agora NAO tinha essa prova (criada com senha antes do login com o Google, ou
// ligada a outra conta Google). Ninguem garante que foi ELA quem criou a conta
// com senha: qualquer um podia ter digitado o e-mail dela no cadastro. Entao a
// prova apaga a senha e derruba toda sessao aberta - se era um intruso, ele sai.
// A pessoa continua com tudo que era da conta (avatar, mesa, conversas).
function vincularGoogle(id, sub) {
  const u = porId(id);
  if (!u) return null;
  if (u.googleSub === String(sub)) return u;
  u.googleSub = String(sub);
  u.emailVerificado = true;
  u.salt = null;
  u.senhaHash = null;
  u.senhaTemporaria = false;
  u.versaoSessao = versaoSessao(u) + 1;
  salvar();
  return u;
}

// Contas de VISITANTE do fluxo antigo (um link de convite que dava acesso a sede
// inteira) nao existem mais: quem e de fora entra so numa reuniao, pelo link dela,
// e sem conta (server/visitantes.js). Sobra o que ficou gravado em disco - e conta
// sem senha e sem dono nao pode ficar la, entao sai no arranque. Roda uma vez e
// depois nao acha nada.
function removerContasDeConvidado() {
  const antes = usuarios.length;
  usuarios = usuarios.filter((u) => !u.convidado);
  if (usuarios.length !== antes) {
    console.log('[usuarios] ' + (antes - usuarios.length) + ' conta(s) de visitante do modelo antigo removida(s)');
    salvar();
  }
}

function marcarAcesso(id) {
  const u = porId(id);
  if (!u) return;
  u.ultimoAcesso = Date.now();
  salvar();
}

// ---------- gestao de conta ----------
//
// A EJ troca de gente todo semestre. Sem isto, quem saiu continuava com a chave
// da sede (chat, biblioteca, Trello) e quem esqueceu a senha ficava trancado
// pra fora - a unica saida era editar este JSON na mao.
//
// VERSAO DA SESSAO: a sessao e um cookie assinado, sem estado no servidor. Pra
// "derrubar" um cookie que ja saiu, o token carrega a versao da conta, e trocar
// ou redefinir a senha sobe a versao. Todo cookie antigo (o celular esquecido
// logado, o PC da faculdade) para de valer na hora.

function versaoSessao(usuario) {
  return (usuario && Number(usuario.versaoSessao)) || 0;
}

function definirSenha(usuario, senha) {
  usuario.salt = crypto.randomBytes(16).toString('hex');
  usuario.senhaHash = hashSenha(senha, usuario.salt);
  usuario.scrypt = SCRYPT;   // troca de senha ja migra pro custo novo
  usuario.versaoSessao = versaoSessao(usuario) + 1;
}

// O link do e-mail foi clicado: o dono provou que o e-mail e dele.
function confirmarEmail(id) {
  const u = porId(id);
  if (!u) return null;
  if (u.emailVerificado !== true) {
    u.emailVerificado = true;
    salvar();
  }
  return u;
}

// Senha nova pelo link do e-mail. Quem chegou aqui abriu a caixa de entrada da
// conta - entao isso tambem confirma o e-mail. Sobe a versao da sessao (dentro
// de definirSenha): quem estava logado em outro lugar, sai.
function redefinirPeloEmail(id, novaSenha) {
  const u = porId(id);
  if (!u) return null;
  definirSenha(u, novaSenha);
  u.senhaTemporaria = false;
  u.emailVerificado = true;
  salvar();
  return u;
}

function trocarSenha(id, novaSenha) {
  const u = porId(id);
  if (!u) return null;
  definirSenha(u, novaSenha);
  u.senhaTemporaria = false;
  salvar();
  return u;
}

// Senha provisoria que a diretoria passa pra pessoa. Palavras + numero: da pra
// ditar por telefone sem soletrar. Tres palavras de 34 e 4 digitos dao ~28 bits
// de acaso - pouco pra senha de verdade, suficiente pra provisoria: o login ja
// barra 10 erros por IP a cada 15 minutos, e a tela pede a troca no 1o acesso.
const PALAVRAS = [
  'sede', 'mesa', 'livro', 'cafe', 'porta', 'janela', 'agenda', 'quadro', 'planta',
  'lousa', 'relogio', 'caneca', 'estante', 'sofa', 'copa', 'jardim', 'painel',
  'cadeira', 'tapete', 'lampada', 'caderno', 'mochila', 'chave', 'vento', 'sol',
  'lua', 'rio', 'serra', 'praia', 'coco', 'caju', 'manga', 'acerola', 'jangada',
];
function gerarSenhaTemporaria() {
  const p = () => PALAVRAS[crypto.randomInt(PALAVRAS.length)];
  return p() + '-' + p() + '-' + p() + '-' + crypto.randomInt(1000, 10000);
}

function redefinirSenha(id) {
  const u = porId(id);
  if (!u) return null;
  const senha = gerarSenhaTemporaria();
  definirSenha(u, senha);
  // a tela pede pra pessoa trocar logo depois de entrar: a provisoria passou
  // pela mao (ou pelo WhatsApp) de outra pessoa
  u.senhaTemporaria = true;
  // Conta esperando a confirmacao do e-mail: a diretoria entregou a provisoria
  // pra pessoa que ela conhece - e isso vale a confirmacao. Sem isto, a
  // provisoria de quem nao recebeu o e-mail (spam, provedor fora) nao entraria.
  if (u.emailVerificado === false) u.emailVerificado = true;
  salvar();
  return senha;
}

function remover(id) {
  const i = usuarios.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [removido] = usuarios.splice(i, 1);
  salvar();
  return removido;
}

function definirDiretoria(id, isAdmin) {
  const u = porId(id);
  if (!u) return null;
  u.isAdmin = !!isAdmin;
  salvar();
  return u;
}

function totalDeDiretoria() {
  return usuarios.filter((u) => u.isAdmin).length;
}

// Lista pra tela de membros da diretoria.
function membros() {
  return usuarios
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      usuario: u.usuario || null,
      email: u.email,
      isAdmin: !!u.isAdmin,
      criadoEm: u.criadoEm || null,
      ultimoAcesso: u.ultimoAcesso || null,
      senhaTemporaria: !!u.senhaTemporaria,
      emailPendente: u.emailVerificado === false,
      google: !!u.googleSub,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---------- WhatsApp (opcional) ----------
// A pessoa escolhe mostrar o proprio numero pros membros da sede: e o que liga o
// botao "Chamar no WhatsApp" no cartao dela. So digitos, com o 55 do Brasil
// quando vier so DDD + numero. Vazio apaga.
function normalizarWhatsapp(bruto) {
  const texto = String(bruto || '').trim();
  let d = texto.replace(/[^0-9]/g, '');
  if (!d) return '';
  // sem "+" na frente e com 10/11 digitos e numero do Brasil sem o 55:
  // (85) 9 9999-9999. Com "+", a pessoa ja disse o pais.
  if (!texto.startsWith('+') && (d.length === 10 || d.length === 11)) d = '55' + d;
  // com "+" vale o tamanho internacional (EUA tem 11 com o 1); sem "+" tem que
  // ter virado um numero brasileiro completo (12 ou 13 com o 55)
  const minimo = texto.startsWith('+') ? 8 : 12;
  if (d.length < minimo || d.length > 15) return null;      // invalido
  return d;
}

function definirWhatsapp(id, bruto) {
  const u = porId(id);
  if (!u) return { erro: 'Essa conta nao existe mais.' };
  const numero = normalizarWhatsapp(bruto);
  if (numero === null) return { erro: 'Numero invalido. Use DDD + numero, ex.: (85) 99999-9999.' };
  u.whatsapp = numero || null;
  salvar();
  return { whatsapp: u.whatsapp };
}

function atualizarPerfil(id, { nome, appearance }) {
  const u = porId(id);
  if (!u) return null;
  if (typeof nome === 'string' && nome) u.nome = nome;
  if (appearance) u.appearance = appearance;
  salvar();
  return u;
}

carregar();
removerContasDeConvidado();
migrarUsuarios();

module.exports = {
  porEmail,
  porId,
  porUsuario,
  usuarioValido,
  usuarioLivre,
  nomeEmUso,
  publico,
  criar,
  criarPeloGoogle,
  vincularGoogle,
  senhaConfere,
  marcarAcesso,
  atualizarPerfil,
  trocarSenha,
  confirmarEmail,
  redefinirPeloEmail,
  definirWhatsapp,
  _normalizarWhatsapp: normalizarWhatsapp,
  redefinirSenha,
  remover,
  definirDiretoria,
  totalDeDiretoria,
  membros,
  versaoSessao,
  getSegredoSessao,
  totalDeContas: () => usuarios.length,
  // copia rasa: quem le a lista nao mexe no estado interno
  todos: () => usuarios.map((u) => ({ id: u.id, nome: u.nome, usuario: u.usuario, email: u.email })),
};
