// Service worker minimo, so pra deixar o app instalavel no computador.
//
// De proposito ele **nao guarda cache** do HTML/JS/CSS: o escritorio depende de
// Socket.io ao vivo e um cache velho serviria a versao antiga do jogo depois de
// um deploy - o bug classico de PWA. Aqui a rede sempre manda; o cache existe
// so pra mostrar um aviso decente quando a pessoa esta sem internet.
// Trocar o numero quando o offline.html mudar: o navegador so reinstala o
// service worker (e so ai pega a pagina nova) quando ESTE arquivo muda. Sem
// isso, quem ja tem o app instalado ficaria com a pagina velha pra sempre.
const CACHE = 'sede-offline-v2';
const PAGINA_OFFLINE = '/offline.html';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.add(PAGINA_OFFLINE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Clique numa notificacao da sede (Android e app instalado mostram por aqui):
// traz a aba pra frente e avisa a pagina qual conversa abrir.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const dados = evento.notification.data || {};
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      const aba = abas.find((c) => new URL(c.url).origin === self.location.origin);
      if (aba) {
        aba.postMessage({ tipo: 'notificacao-clicada', dados });
        return aba.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  // so navegacao: o resto (js, css, socket.io) vai direto pra rede
  if (req.mode !== 'navigate') return;
  evento.respondWith(
    fetch(req).catch(() => caches.match(PAGINA_OFFLINE))
  );
});
