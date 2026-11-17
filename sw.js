// Service worker de FACTURAS FB: permite instalar la app y abrirla sin internet.
// Los datos de Google Sheets NUNCA se guardan aquí (siempre se piden en vivo).
const VERSION = 'ffb-v3.0.1';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/app.js', 'js/api.js', 'js/ui.js', 'js/util.js', 'js/factura-form.js',
  'js/registro.js', 'js/historial.js', 'js/dashboard.js', 'js/pagos.js', 'js/consulta.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'img/logo-oscuro.svg', 'img/logo-icono.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Red primero (así siempre llega la última versión publicada); si no hay
// internet, se usa la copia guardada. Solo archivos de esta misma página.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // revisa siempre si hay versión nueva en GitHub
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
