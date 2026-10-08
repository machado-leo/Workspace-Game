// Nenhuma pagina de public/ roda script escrito dentro do HTML.
//
// A CSP da sede (server/index.js) tem `script-src` SEM 'unsafe-inline', de
// proposito: e isso que faz ela proteger contra XSS. O preco e que o navegador
// recusa, calado, todo <script> sem src, todo onclick="..." e todo
// href="javascript:...". A pagina abre, o HTML aparece, e o codigo nao roda.
//
// Aconteceu: quando a CSP entrou (commit 7fd97a6), as cinco paginas de medicao
// (auditoria, pecas, mapa, pacote, sprites) pararam de funcionar e ninguem viu
// por dois dias. A auditoria do muro ficava pra sempre em "medindo..." - e ela e
// justamente o jeito de conferir arte sem depender de print.
//
// O conserto e mover o script pra um arquivo em public/js/. O conserto ERRADO e
// afrouxar a CSP - por isso a ultima conferencia daqui guarda a propria CSP.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const PUBLICO = path.join(raiz, 'public');

let ok = 0;
let falhou = 0;
function conferir(texto, cond) {
  if (cond) { ok++; console.log('  ok   ' + texto); return; }
  falhou++;
  console.log('  FALHOU ' + texto);
}

function paginas(pasta) {
  const achadas = [];
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) achadas.push(...paginas(caminho));
    else if (item.name.endsWith('.html')) achadas.push(caminho);
  }
  return achadas;
}

// Comentario de HTML pode citar "<script>" (o index.html cita, explicando por
// que o dele virou arquivo) - isso nao e script e nao pode acusar.
function semComentarios(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

// Bloco de dados (<script type="application/json">) nao executa, e a CSP nao
// recusa. So conta o que o navegador RODARIA.
const TIPOS_QUE_NAO_RODAM = /type\s*=\s*["']?application\/(ld\+)?json/i;

function problemasDe(html) {
  const limpo = semComentarios(html);
  const achados = [];

  const tags = limpo.match(/<script\b[^>]*>/gi) || [];
  tags.forEach((tag) => {
    if (/\bsrc\s*=/i.test(tag)) return;
    if (TIPOS_QUE_NAO_RODAM.test(tag)) return;
    achados.push('script inline: ' + tag);
  });

  // onclick=, onload=... dentro de uma tag (e nao no texto da pagina)
  (limpo.match(/<[a-z][^>]*\son[a-z]+\s*=/gi) || []).forEach((trecho) => {
    achados.push('evento inline: ' + trecho.slice(0, 80));
  });

  (limpo.match(/href\s*=\s*["']\s*javascript:/gi) || []).forEach((trecho) => {
    achados.push('link javascript: ' + trecho);
  });

  return achados;
}

console.log('\nNENHUM SCRIPT INLINE NAS PAGINAS (a CSP recusaria)');

const lista = paginas(PUBLICO);
conferir('achei as paginas de public/ (' + lista.length + ')', lista.length >= 5);

lista.forEach((arquivo) => {
  const nome = path.relative(raiz, arquivo).split(path.sep).join('/');
  const achados = problemasDe(fs.readFileSync(arquivo, 'utf8'));
  achados.forEach((a) => console.log('       ' + nome + ': ' + a));
  conferir(nome + ' sem script inline', achados.length === 0);
});

// Todo <script src> local tem que apontar pra um arquivo que existe. Tirar o
// inline pra um arquivo e errar o caminho da no mesmo: pagina que nao roda.
lista.forEach((arquivo) => {
  const nome = path.relative(raiz, arquivo).split(path.sep).join('/');
  const html = semComentarios(fs.readFileSync(arquivo, 'utf8'));
  const faltando = [];
  (html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["']/gi) || []).forEach((tag) => {
    const src = tag.match(/src\s*=\s*["']([^"']+)["']/i)[1];
    if (/^(https?:)?\/\//i.test(src)) return; // CDN - fora do alcance daqui
    // quem serve este e o proprio socket.io, na hora; nao existe em public/
    if (src.startsWith('/socket.io/')) return;
    const alvo = src.startsWith('/')
      ? path.join(PUBLICO, src)
      : path.join(path.dirname(arquivo), src);
    if (!fs.existsSync(alvo.split('?')[0])) faltando.push(src);
  });
  faltando.forEach((f) => console.log('       ' + nome + ': nao existe ' + f));
  conferir(nome + ': todo script local existe', faltando.length === 0);
});

// E a CSP continua sem 'unsafe-inline' no script-src. Sem esta conferencia, o
// jeito mais curto de "consertar" este teste seria desligar a protecao.
const servidor = fs.readFileSync(path.join(raiz, 'server', 'index.js'), 'utf8');
const scriptSrc = (servidor.match(/"script-src[^"]*"/) || [''])[0];
conferir('a CSP tem script-src', scriptSrc.length > 0);
conferir('script-src continua sem unsafe-inline', scriptSrc.length > 0 && !/unsafe-inline/.test(scriptSrc));

console.log('\n  ' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
