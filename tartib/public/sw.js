// Минимальный service worker: нужен браузеру, чтобы предложить установку на экран.
// Ничего не кэширует — данные трейдера всегда берутся с сервера.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
