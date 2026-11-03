// Service worker: кэш оболочки «Приём нормативов».
// Открытие оболочки без сети не даёт доступ к работе: требуется проверка сеанса.
const CACHE_NAME = 'gto-cache-v5';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './judge-access.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Не трогаем запросы к вебхукам (POST в Google Apps Script) — их кэшировать нельзя и не нужно.
  if (req.method !== 'GET') return;
  // Ответы авторизации никогда не кэшируем.
  if (new URL(req.url).hostname.endsWith('google.com') || new URL(req.url).hostname.endsWith('googleusercontent.com')) return;

  // Сама страница: сначала сеть (чтобы судьи сразу видели новую версию),
  // при отсутствии сети — отдаём последнюю закэшированную копию.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Остальные GET-запросы (иконки, шрифты, xlsx с CDN): отдаём из кэша сразу,
  // если есть, и в фоне обновляем кэш свежей версией с сети.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
