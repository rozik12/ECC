// Service worker Tartib.
// Что делает: (1) показывает страницу «нет сети», когда интернета нет; (2) хранит неизменяемые файлы сайта (скрипты, стили, иконки),
// чтобы приложение открывалось быстрее. Чего НЕ делает: не сохраняет страницы кабинета, ответы API и данные трейдера, они всегда берутся с сервера.
const VERSION = "v3";
const STATIC_CACHE = `tartib-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/pwa/icon-192", "/pwa/icon-512", "/logo/tartib-mark-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tartib-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Файлы с хешем в имени не меняются: можно отдавать из кэша. Остальное безопасное (иконки, логотипы) обновляется в фоне.
const isImmutable = (url) => url.pathname.startsWith("/_next/static/");
const isSafeStatic = (url) => url.pathname.startsWith("/logo/") || url.pathname.startsWith("/pwa/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Переход на страницу: всегда сеть; если сети нет, показываем страницу «нет сети»
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (isSafeStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    );
  }
  // всё остальное (API, данные, серверные действия) идёт напрямую в сеть
});
