/* app-boot.js — VaultNest · loader (first file). AppNest doc part 10: version on every file, self-registration,
   a visible "update not fully loaded" bar instead of dead buttons, error log for the diagnostic report.
   The version comes from this script's own ?v= in index.html; every module must report the SAME version. */
'use strict';
window.__BOOTV='1.2.2';
(function(){
 const LSP='vaultnest_';
 const bf=document.getElementById('bootfail');if(bf)bf.remove();
 // ---- error log: technical messages only, long digit runs masked; last 10, shown in About → diagnostic report
 function logErr(m,src,line){try{const a=JSON.parse(localStorage.getItem(LSP+'errlog')||'[]');a.unshift({m:String(m).replace(/\d{4,}/g,'#').slice(0,160),s:String(src||'').split('/').pop().split('?')[0],l:line||0,t:Date.now()});localStorage.setItem(LSP+'errlog',JSON.stringify(a.slice(0,10)));}catch(e){}}
 window.logErr=logErr;
 window.addEventListener('error',e=>logErr(e.message,e.filename,e.lineno));
 window.addEventListener('unhandledrejection',e=>logErr(e.reason&&(e.reason.message||e.reason)));
 const me=document.currentScript;let v='0';try{v=new URL(me.src).searchParams.get('v')||'0';}catch(e){}
 window.__APPV=v;window.__MODS={};
 const MODS=['vendor-qrcode','app-lang','app-core','app-ui','app-features','app-views'];
 window.__MODLIST=MODS;
 const load=n=>new Promise(res=>{const s=document.createElement('script');s.src='./'+n+'.js?v='+encodeURIComponent(v);s.async=false;s.onload=()=>res(true);s.onerror=()=>res(false);document.head.appendChild(s);});
 function bar(miss){let he=true;try{he=JSON.parse(localStorage.getItem(LSP+'lang')||'"he"')==='he';}catch(e){}
  const d=document.createElement('div');d.className='modbar';d.setAttribute('role','alert');
  const p=document.createElement('p');p.textContent=he?'העדכון לא נטען במלואו (חסר או מגרסה אחרת: '+miss.join(', ')+'). המידע שלך לא נפגע.':'The update did not fully load (missing or from another version: '+miss.join(', ')+'). Your data is safe.';
  const b=document.createElement('button');b.className='btn pri';b.textContent=he?'רענן את האפליקציה':'Reload the app';
  const note=document.createElement('p');note.className='mlbl';
  b.onclick=async()=>{b.disabled=true;
   // never throw away the saved copy unless a complete new copy is actually reachable right now
   // is a COMPLETE, matching set of files on the site right now? only then is clearing the local copy useful
   let state='offline';if(navigator.onLine!==false){try{state='ok';
     for(const n of ['app-boot',...MODS]){const r=await fetch('./'+n+'.js?v='+encodeURIComponent(v)+'&probe='+Date.now(),{cache:'no-store'});
      const mk=n==='app-boot'?"__BOOTV='"+v+"'":"__MODS['"+n+"']='"+v+"'";if(!r.ok||!(await r.text()).includes(mk)){state='partial';break;}}}catch(e){state='offline';}}
   if(state!=='ok'){note.textContent=state==='offline'?(he?'אין חיבור כרגע. נסה שוב כשתחזור הרשת — הגרסה השמורה לא נמחקה.':'No connection right now. Try again when you are online — the saved copy was not removed.')
     :(he?'העדכון באתר עוד לא הושלם (חסר קובץ או שהועלה רק חלק). נסה שוב בעוד כמה דקות — הגרסה השמורה לא נמחקה.':'The update on the site is not complete yet (a file is missing or only part was uploaded). Try again in a few minutes — the saved copy was not removed.');b.disabled=false;return;}
   try{const scope=new URL('./',location.href).href;
    // only THIS app's service worker and app-shell caches — never other apps on a shared address, never the encrypted inbox
    if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())if(r.scope===scope)await r.unregister();}
    if(window.caches){for(const k of await caches.keys())if(k.startsWith('vaultnest-v'))await caches.delete(k);}}catch(e){}location.reload();};
  d.appendChild(p);d.appendChild(b);
  // the saved (previous) version is still complete on this device → let the user keep working with it
  if(navigator.serviceWorker&&navigator.serviceWorker.controller&&!/[?&]fallback=1/.test(location.search)){const o=document.createElement('button');o.className='btn';
   o.textContent=he?'פתח את הגרסה השמורה במכשיר':'Open the version saved on this device';o.onclick=()=>location.replace('./?fallback=1');d.appendChild(o);}
  d.appendChild(note);document.body.appendChild(d);}
 Promise.all(MODS.map(load)).then(()=>{const miss=MODS.filter(n=>window.__MODS[n]!==v);
  if(window.__BOOTV!==v)miss.unshift('app-boot');
  if(miss.length||typeof window.vaultBoot!=='function'){logErr('modules not matching '+v+': '+miss.join(','));bar(miss.length?miss:['boot']);return;}
  if(/[?&]fallback=1/.test(location.search)){try{history.replaceState(null,'',location.pathname);}catch(e){}}
  Promise.resolve().then(()=>window.vaultBoot()).catch(e=>{logErr('boot '+(e&&e.message));bar(['boot']);});});
})();
