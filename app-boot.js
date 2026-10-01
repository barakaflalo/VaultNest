/* app-boot.js — VaultNest · loader (first file). AppNest doc part 10: version on every file, self-registration,
   a visible "update not fully loaded" bar instead of dead buttons, error log for the diagnostic report.
   The version comes from this script's own ?v= in index.html, so the modules always match the page. */
'use strict';
(function(){
 const LSP='vaultnest_';
 // ---- error log (no vault content; last 10, shown in About → diagnostic report)
 function logErr(m,src,line){try{const a=JSON.parse(localStorage.getItem(LSP+'errlog')||'[]');a.unshift({m:String(m).slice(0,180),s:String(src||'').split('/').pop().split('?')[0],l:line||0,t:Date.now()});localStorage.setItem(LSP+'errlog',JSON.stringify(a.slice(0,10)));}catch(e){}}
 window.logErr=logErr;
 window.addEventListener('error',e=>logErr(e.message,e.filename,e.lineno));
 window.addEventListener('unhandledrejection',e=>logErr(e.reason&&(e.reason.message||e.reason)));
 // ---- version + module list (fixed order)
 const me=document.currentScript;let v='0';try{v=new URL(me.src).searchParams.get('v')||'0';}catch(e){}
 window.__APPV=v;window.__MODS={};
 const MODS=['vendor-qrcode','app-lang','app-core','app-ui','app-features','app-views'];
 window.__MODLIST=MODS;
 const load=n=>new Promise(res=>{const s=document.createElement('script');s.src='./'+n+'.js?v='+encodeURIComponent(v);s.async=false;s.onload=()=>res(true);s.onerror=()=>res(false);document.head.appendChild(s);});
 function bar(miss){let he=true;try{he=JSON.parse(localStorage.getItem(LSP+'lang')||'"he"')==='he';}catch(e){}
  const d=document.createElement('div');d.className='modbar';d.setAttribute('role','alert');
  const p=document.createElement('p');p.textContent=he?'העדכון לא נטען במלואו (חסר: '+miss.join(', ')+'). המידע שלך לא נפגע.':'The update did not fully load (missing: '+miss.join(', ')+'). Your data is safe.';
  const b=document.createElement('button');b.className='btn pri';b.textContent=he?'רענן את האפליקציה':'Reload the app';
  b.onclick=async()=>{b.disabled=true;try{const scope=new URL('./',location.href).href;
    // only THIS app's service worker and app-shell caches — never other apps on a shared address, never the encrypted inbox
    if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())if(r.scope===scope)await r.unregister();}
    if(window.caches){for(const k of await caches.keys())if(k.startsWith('vaultnest-v'))await caches.delete(k);}}catch(e){}location.reload();};
  d.appendChild(p);d.appendChild(b);document.body.appendChild(d);}
 Promise.all(MODS.map(load)).then(()=>{const miss=MODS.filter(n=>!window.__MODS[n]);
  if(miss.length||typeof window.vaultBoot!=='function'){logErr('missing modules: '+miss.join(','));bar(miss.length?miss:['boot']);return;}
  try{window.vaultBoot();}catch(e){logErr('boot '+e.message);bar(['boot']);}});
})();
