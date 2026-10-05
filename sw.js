/* Parts Bin service worker.
   Network first, so a reload always brings the newest page when there is a
   connection; the last good copy answers when there is none. Only this
   site's own files are kept. GitHub, LCSC and the relay are never touched:
   inventory data must come fresh or not at all, and the page already keeps
   its own copy of it in the browser.                                      */
const CACHE = "parts-bin-v1";
const SHELL = ["./", "./inventory.html", "./index.html", "./manifest.webmanifest",
               "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
               "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png", "./vendor/jsQR.js"];

self.addEventListener("install", ev=>{
  /* one missing file must not stop the rest being kept */
  ev.waitUntil(caches.open(CACHE)
    .then(c=>Promise.allSettled(SHELL.map(u=>c.add(new Request(u, {cache:"reload"})))))
    .then(()=>self.skipWaiting()));
});

self.addEventListener("activate", ev=>{
  ev.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith("parts-bin-") && k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

self.addEventListener("fetch", ev=>{
  const req = ev.request;
  if(req.method!=="GET") return;
  const url = new URL(req.url);
  if(url.origin!==self.location.origin) return;
  ev.respondWith((async ()=>{
    try{
      const res = await fetch(req);
      if(res.ok && res.type==="basic"){
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy)).catch(()=>{});
      }
      return res;
    }catch(e){
      const hit = await caches.match(req, {ignoreSearch:true});
      if(hit) return hit;
      if(req.mode==="navigate"){
        const page = await caches.match("./inventory.html");
        if(page) return page;
      }
      return Response.error();
    }
  })());
});
