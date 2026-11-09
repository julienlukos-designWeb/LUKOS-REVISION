/* LUKOS RÉVISION — Service worker : met en cache uniquement les fichiers de l'application.
   Les données (Supabase) ne sont jamais mises en cache. */
const CACHE = "lukos-v5";
const SHELL = ["./", "index.html", "app.css", "app.js", "config.js", "manifest.json", "lk192.png", "lkapple.png", "logo512.png", "logo-header.png", "lk512-maskable.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
