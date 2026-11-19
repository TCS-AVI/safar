// Safar service worker: lets the app open and work with no signal (deserts, trains, flights).
const V = 'safar-v20', TILES = 'safar-tiles';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'firebase-config.js', 'trip.enc', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Our own files: try the network (so updates arrive) but fall back to the saved copy after 3 seconds or when offline.
function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const store = r => { if (r && r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } };
    const timer = setTimeout(async () => { const c = await caches.match(req, { ignoreSearch: true }); if (c && !done) { done = true; resolve(c); } }, 3000);
    fetch(req).then(r => { clearTimeout(timer); store(r); if (!done) { done = true; resolve(r); } })
      .catch(async () => { clearTimeout(timer); if (done) return; done = true; resolve((await caches.match(req, { ignoreSearch: true })) || Response.error()); });
  });
}
async function cacheFirst(req, name, max) {
  const c = await caches.open(name), hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === 'opaque')) { c.put(req, r.clone()); if (max) c.keys().then(k => { if (k.length > max) c.delete(k[0]); }); }
    return r;
  } catch { return Response.error(); }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) e.respondWith(networkFirst(req));
  else if (u.hostname.endsWith('tile.openstreetmap.org') || u.hostname.endsWith('basemaps.cartocdn.com')) e.respondWith(cacheFirst(req, TILES, 500));
  else if (u.hostname === 'unpkg.com' || u.hostname === 'www.gstatic.com') e.respondWith(cacheFirst(req, V));
  // everything else (Firestore, weather, geocoding) goes straight to the network
});
