/* LUKOS RÉVISION — Service worker : garde l'application (fichiers, bibliothèque Supabase, polices) sur le téléphone
   pour qu'elle s'ouvre même sans Internet. Les données Supabase ne passent jamais par ce cache :
   le contenu hors connexion est géré par l'application (parcours activés uniquement). */
const CACHE = "lukos-v11";
const SHELL = ["./", "index.html", "app.css", "app.js", "config.js", "manifest.json", "lk192.png", "lkapple.png", "logo512.png", "logo-header.png", "lk512-maskable.png", "julien-ia.jpg"];
const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(SHELL).catch(() => {});
    try { const r = await fetch(CDN, { mode: "cors" }); if (r.ok) await c.put(CDN, r); } catch (err) { /* hors ligne */ }
  }));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  // Bibliothèque Supabase et polices : d'abord le cache (fichiers versionnés), sinon le réseau
  if (u.hostname === "cdn.jsdelivr.net" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })));
    return;
  }
  if (u.origin !== location.origin) return;  // Supabase : jamais mis en cache ici
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
});
