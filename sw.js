/* VaultNest service worker — AppNest SW rules (requirements doc v13.1, parts 10 + 12):
   - per-file caching with Promise.allSettled (never atomic addAll); every app file is versioned (?v=)
   - navigation: network-first with ~4s timeout → cache → friendly offline page (never Response.error);
     a 404/5xx from the host also falls back to the cached app
   - versioned app files (?v=) are immutable: exact cached copy first; the page itself stays network-first
   - redirected responses (Cloudflare 308 for .html) are re-wrapped clean before serving/caching
   - skipWaiting + clients.claim so a fixing version takes over immediately
   - cross-origin requests (Have I Been Pwned) are never touched or cached
   - SHARE TO VAULT (1.2.0): an incoming share is encrypted HERE, on arrival, with the vault's public key
     (ephemeral ECDH P-256 → HKDF-SHA256 → AES-256-GCM). Nothing readable is ever stored. Only the vault,
     when unlocked, holds the private key. The encrypted inbox ('vaultnest-inbox') survives app updates.
   - SAFE UPDATE (1.2.1): the page + every JS module are REQUIRED and must report this exact version. If any is
     missing or from another release, install fails → the previous working version stays active and cached.
     Icons / manifest / privacy page are optional and never block an update.
   BUMP V ON EVERY UPDATE — and the ?v= in index.html, and the version marker in each module (they must all match). */
const V = '1.2.2';
const VERSION = 'vaultnest-v' + V;
const INBOX = 'vaultnest-inbox';
const MODS = ['app-boot', 'vendor-qrcode', 'app-lang', 'app-core', 'app-ui', 'app-features', 'app-views'];
const REQUIRED = ['./', './index.html', ...MODS.map(m => './' + m + '.js?v=' + V)];
const OPTIONAL = ['./manifest.json', './icon-192.png', './icon-512.png', './privacy_policy.html'];
// what a correct file of THIS release must contain
function marker(u) {
  if (u === './' || u === './index.html') return 'app-boot.js?v=' + V;
  const m = /^\.\/([a-z-]+)\.js/.exec(u); if (!m) return null;
  return m[1] === 'app-boot' ? "__BOOTV='" + V + "'" : "__MODS['" + m[1] + "']='" + V + "'";
}

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
h1{color:#C9A24A;font-family:Georgia,serif;font-weight:600}a{display:inline-block;margin-top:18px;min-height:48px;line-height:48px;padding:0 22px;border-radius:12px;background:#C9A24A;color:#000;font-weight:700;text-decoration:none}</style></head>
<body><div><h1>VaultNest</h1><p>אין חיבור לאינטרנט והאפליקציה עוד לא נשמרה במכשיר.</p><p>No connection, and the app is not saved on this device yet.</p>
<a href="./">נסה שוב · Try again</a></div></body></html>`;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    for (const u of REQUIRED) {
      let ok = false;
      for (let a = 0; a < 3 && !ok; a++) {
        try {
          const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) continue;
          const cr = await clean(r); const mk = marker(u);
          if (mk && !(await cr.clone().text()).includes(mk)) continue;   // a file from another release
          await c.put(u, cr); ok = true;
        } catch (err) { /* retry */ }
      }
      if (!ok) { await caches.delete(VERSION); throw new Error('required file missing or wrong version: ' + u); }
    }
    await Promise.allSettled(OPTIONAL.map(async u => {
      try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await c.put(u, await clean(r)); } catch (err) { /* optional */ }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // only old APP-SHELL caches; the encrypted inbox is kept across updates
    await Promise.all(keys.filter(k => k.startsWith('vaultnest-v') && k !== VERSION).map(k => caches.delete(k)));
    await caches.delete('vaultnest-share'); // unencrypted leftovers from 1.1.0
    await self.clients.claim();
  })());
});

async function navigate(req) {
  const c = await caches.open(VERSION);
  // "open the saved version" (offered by the loader when the site has a half-finished upload)
  if (new URL(req.url).searchParams.get('fallback') === '1') { const hit = await c.match('./index.html'); if (hit) return clean(hit); }
  try {
    const r = await withTimeout(fetch(req, { cache: 'no-cache' }), 4000);
    const cr = await clean(r);
    if (!cr.ok && (cr.status >= 500 || cr.status === 404)) {
      const hit = (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html'));
      if (hit) return clean(hit);
    }
    if (cr.ok) {
      const path = new URL(req.url).pathname;
      const isIndex = /\/(index\.html)?$/.test(path) || /\/index$/.test(path);
      // never let a page from ANOTHER release overwrite the saved page of this one (half-finished upload → offline stays working)
      if (!isIndex) c.put(req.url.split('?')[0], cr.clone());
      else if ((await cr.clone().text()).includes('app-boot.js?v=' + V)) c.put('./index.html', cr.clone());
    }
    return cr;
  } catch (err) {
    const hit = (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || (await c.match('./'));
    if (hit) return clean(hit);
    return new Response(OFFLINE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/* ---- encrypted share inbox ---- */
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
// shares are parked ONE AT A TIME, so the queue quota can't be overrun by parallel requests
let parkQueue = Promise.resolve();
function parkShareQueued(req) { const p = parkQueue.then(() => parkShare(req)); parkQueue = p.catch(() => {}); return p; }
async function parkShare(req) {
  const scope = self.registration.scope;
  const go = q => Response.redirect(new URL('./?share=' + q, scope).href, 303);
  let c, base, ok = false;
  try {
    c = await caches.open(INBOX);
    const pr = await c.match(new URL('__inbox/pub', scope).href);
    if (!pr) return go('nokey');                       // vault never unlocked since the update: store NOTHING
    const len = Number(req.headers.get('content-length') || 0);
    if (len > 100 * 1048576 + 256 * 1024) return go('big'); // refuse before reading the body (when the browser sends a length)
    const waiting = (await c.keys()).filter(k => /\/__inbox\/s-[a-z0-9]+$/.test(k.url)).length;
    if (waiting >= 30) return go('full');               // queue quota
    const { jwk, kid } = await pr.json();
    const pub = await crypto.subtle.importKey('jwk', jwk, ECDH, false, []);
    const fd = await req.formData();
    const eph = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
    const epk = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
    const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: epk, info: new TextEncoder().encode('vaultnest-inbox-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const enc = async data => { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data) }; };
    const id = 's-' + Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(36)).join('');
    base = new URL('__inbox/' + id, scope).href;
    const files = [], fmeta = []; let total = 0, n = 0, skipped = 0;
    for (const f of fd.getAll('files')) {
      if (!f || typeof f === 'string' || !f.size) continue;
      if (n >= 20 || total + f.size > 100 * 1048576) { skipped++; continue; }
      total += f.size; const k = 'f' + (n++);
      const e = await enc(await f.arrayBuffer());
      await c.put(base + '/' + k, new Response(e.ct));
      files.push({ key: k, iv: b64(e.iv) }); fmeta.push({ key: k, name: f.name || k, type: f.type || '', size: f.size });
    }
    const meta = { t: Date.now(), title: String(fd.get('title') || ''), text: String(fd.get('text') || ''), url: String(fd.get('url') || ''), files: fmeta, skipped };
    const e = await enc(new TextEncoder().encode(JSON.stringify(meta)));
    // the envelope is written LAST: a share without an envelope never finished and is cleaned up by the app
    await c.put(base, new Response(JSON.stringify({ v: 2, kid: kid || '', epk: b64(epk), iv: b64(e.iv), ct: b64(new Uint8Array(e.ct)), files }), { headers: { 'Content-Type': 'application/json' } }));
    ok = true;
  } catch (err) {
    try { if (c && base) for (const k of await c.keys()) if (k.url === base || k.url.startsWith(base + '/')) await c.delete(k); } catch (e2) {}
  }
  return go(ok ? '1' : 'err');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) { e.respondWith(parkShareQueued(req)); return; }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // pass-through: HIBP and anything external, never cached
  if (url.pathname.includes('/__inbox/')) return;  // inbox entries are read through the Cache API only
  if (req.cache === 'no-store' || url.searchParams.has('probe')) return; // update checks always go straight to the site
  if (req.mode === 'navigate') { e.respondWith(navigate(req)); return; }
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    // versioned app files (?v=) never change once released → serve the exact saved copy first
    if (url.searchParams.has('v')) { const exact = await c.match(req); if (exact) return clean(exact); }
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
