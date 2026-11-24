// Guarda la app para que abra sin internet. La radio y el remoto sí necesitan conexión.
// Red primero: si hay internet siempre se ve la versión nueva; si no, la última guardada.
const CACHE = 'radio-fortaleza-v4';
const LISTA = [
  './', 'index.html', 'style.css?v=6', 'reproductor.css?v=4', 'remoto.css?v=6', 'app.js?v=34', 'fuentes.js?v=3', 'ui-remoto.js?v=7', 'ui-pestanas.js?v=3',
  'id3.js?v=1', 'biblioteca.js?v=2', 'ui-reproductor.js?v=2', 'local.js?v=1', 'ui-comun.js?v=1', 'ui-ahora.js?v=1', 'maqueta.js?v=1',
  'visualizers.js?v=8', 'visualizers2.js?v=14', 'vendor/three.module.min.js', 'manifest.webmanifest', 'nativa.js', 'vendor/capacitor.js',
  'icon.svg', 'icon-192.png', 'icon-512.png',
  'vendor/fonts/lora-latin-500-normal.woff2', 'vendor/fonts/lora-latin-500-italic.woff2',
  'vendor/fonts/lato-latin-400-normal.woff2', 'vendor/fonts/lato-latin-700-normal.woff2'
];
// La clave ignora el ?v=: sin conexión sirve lo último que se guardó y el almacén no crece con cada versión.
const clave = u => { const x = new URL(u, self.location.href); return x.origin + x.pathname; };

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(LISTA.map(async u => {
      try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r.ok) await c.put(clave(u), r); } catch { /* se guarda al usarla */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const k = clave(r.url);
    const guardado = await c.match(k);
    try {
      const ctl = new AbortController();
      const t = guardado ? setTimeout(() => ctl.abort(), 6000) : 0;
      const resp = await fetch(r, { signal: ctl.signal });
      clearTimeout(t);
      if (resp && resp.ok && resp.type === 'basic') c.put(k, resp.clone());
      return resp;
    } catch (err) {
      if (guardado) return guardado;
      throw err;
    }
  })());
});
