const CACHE_NAME = "mama-sita-dashboard-v2";
const APP_SHELL = [
  new URL("./index.html", self.location).href,
  new URL("./styles.css?v=pwa-v1", self.location).href,
  new URL("./app.js?v=pwa-v1", self.location).href,
  new URL("./manifest.webmanifest", self.location).href,
  new URL("./privacy.html", self.location).href,
  new URL("./icons/mama-sita-192.png", self.location).href,
  new URL("./icons/mama-sita-512.png", self.location).href
];
const APP_SHELL_URLS = new Set(APP_SHELL);
const INDEX_URL = new URL("./index.html", self.location).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("mama-sita-dashboard-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(async () => (await caches.match(request)) || (await caches.match(INDEX_URL)) || Response.error())
    );
    return;
  }

  if (!APP_SHELL_URLS.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: "no-store" });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;
      throw error;
    }
  })());
});
