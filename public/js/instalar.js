// Registra o service worker so em HTTPS (ou localhost): e o que faz o navegador
// oferecer "Instalar" e abrir o app em janela propria. Ver docs/app-computador.md.
//
// Isto era um <script> inline no index.html. Saiu de la pra a Content-Security-
// Policy poder recusar script inline sem excecao: era o UNICO inline da pagina,
// entao mante-lo custaria um 'unsafe-inline' em script-src - e 'unsafe-inline'
// em script e justamente o que faz a CSP parar de proteger contra XSS.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sem service worker o site continua funcionando normalmente */
    });
  });
}
