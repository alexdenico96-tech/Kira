// KIRA_ANDROID_APP_V1 — service worker da Kira (app instalável / APK).
// - Páginas: rede primeiro; sem internet, a última versão salva (ou a página offline).
// - Arquivos do próprio site (JS/CSS/ícones): rede primeiro, com cópia para uso offline.
// - API, outros sites (CDNs, pré-visualização de projetos) e uploads: nunca passam pelo cache.
const CACHE_NAME = "kira-shell-v4";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = ["/", "/index.html", OFFLINE_URL, "/logo.png", "/favicon-192.png", "/favicon-512.png", "/manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("/index.html", copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
