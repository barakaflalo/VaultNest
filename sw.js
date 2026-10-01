/* VaultNest service worker — AppNest SW rules (requirements doc v13.1, part 12):
   - per-file caching with Promise.allSettled (never atomic addAll)
   - navigation: network-first with ~4s timeout → cache → friendly offline page (never Response.error)
   - redirected responses (Cloudflare 308 for .html) are re-wrapped clean before serving/caching
   - skipWaiting + clients.claim so a fixing version takes over immediately
   - cross-origin requests (Have I Been Pwned) are never touched or cached
   - v1.1: Android share target — POST ./share-target is parked in cache 'vaultnest-share' until the vault is unlocked,
     then imported (encrypted) and deleted by the page (handleShare in index.html)
   BUMP VERSION ON EVERY UPDATE. */
const VERSION = 'vaultnest-v1.1.0';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './privacy_policy.html'];

async function clean(r) {
  if (!r || !r.redirected) return r;
  const body = await r.blob();
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
}
function withTimeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
}
const OFFLINE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VaultNest</title><style>body{background:#000;color:#EFE7D6;font-family:system-ui,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:20px}
h1{color:#C9A24A;font-family:Georgia,serif;font-weight:600}button{margin-top:18px;min-height:48px;padding:10px 22px;border-radius:12px;border:1px solid #C9A24A;background:#C9A24A;color:#000;font-weight:700;font-size:1rem}</style></head>
<body><div><h1>VaultNest</h1><p>אין חיבור לאינטרנט והאפליקציה עוד לא נשמרה במכשיר.</p><p>No connection, and the app is not saved on this device yet.</p>
<button onclick="location.reload()">נסה שוב · Try again</button></div></body></html>`;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(SHELL.map(async u => {
      try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, await clean(r)); } catch (err) { /* keep going */ }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('vaultnest-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function navigate(req) {
  const c = await caches.open(VERSION);
  try {
    const r = await withTimeout(fetch(req, { cache: 'no-cache' }), 4000);
    const cr = await clean(r);
    if (cr.ok) {
      const path = new URL(req.url).pathname;
      const key = /\/(index\.html)?$/.test(path) || /\/index$/.test(path) ? './index.html' : req.url.split('?')[0];
      c.put(key, cr.clone());
    }
    return cr;
  } catch (err) {
    const hit = (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || (await c.match('./'));
    if (hit) return clean(hit);
    return new Response(OFFLINE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function parkShare(req) {
  try {
    const fd = await req.formData();
    const c = await caches.open('vaultnest-share');
    for (const k of await c.keys()) await c.delete(k);
    const meta = { t: Date.now(), title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', files: [] };
    let i = 0;
    for (const f of fd.getAll('files')) {
      if (!f || typeof f === 'string' || !f.size) continue;
      const key = 'f' + (i++);
      await c.put(new URL('__share/' + key, self.registration.scope).href, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
      meta.files.push({ key, name: f.name || key, type: f.type || '' });
    }
    await c.put(new URL('__share/meta', self.registration.scope).href, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch (err) { /* fall through to the app anyway */ }
  return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) { e.respondWith(parkShare(req)); return; }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // pass-through: HIBP and anything external, never cached
  if (req.mode === 'navigate') { e.respondWith(navigate(req)); return; }
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const r = await withTimeout(fetch(req, { cache: 'no-cache' }), 6000);
      const cr = await clean(r);
      if (cr.ok) c.put(req, cr.clone());
      return cr;
    } catch (err) {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return clean(hit);
      return new Response('', { status: 504 });
    }
  })());
});
