const CACHE="lukos-revision-v3";
const CDN="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const SHELL=["./","./index.html","./manifest.json","./lk192.png","./lk512.png","./lkapple.png"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(async c=>{
    await c.addAll(SHELL);
    try{await c.add(new Request(CDN,{mode:"cors"}));}catch(_){}
  }).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const r=e.request;
  if(r.method!=="GET")return;
  const u=new URL(r.url);
  // Les données Supabase (connexion, questions, paiements) ne sont jamais mises en cache.
  if(u.hostname.endsWith("supabase.co"))return;
  if(r.mode==="navigate"){
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put("./index.html",cp));return res;}).catch(()=>caches.match("./index.html")));
    return;
  }
  if(u.origin===location.origin||r.url===CDN){
    e.respondWith(caches.match(r).then(hit=>{
      const net=fetch(r).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));}return res;}).catch(()=>hit);
      return hit||net;
    }));
  }
});
