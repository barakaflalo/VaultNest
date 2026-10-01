/* app-ui.js — VaultNest · dialogs, PIN/pattern, lock screen, unlock flows, restore flow
   Loaded by app-boot.js in a fixed order with ?v=<version>. Last line registers the module. */
'use strict';
/* ================= UI primitives ================= */
function toast(msg,kind){const t=document.createElement('div');t.className='toast '+(kind||'');t.textContent=msg;$('#toasts').appendChild(t);
 const life=Math.min(6000,2400+msg.length*35);setTimeout(()=>t.classList.add('out'),life);setTimeout(()=>t.remove(),life+400);}
function modal(html,o={}){return new Promise(res=>{const w=document.createElement('div');w.className='mwrap';
 w.innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;$('#modals').appendChild(w);const prev=document.activeElement;let done=false;
 const close=v=>{if(done)return;done=true;w.classList.add('out');document.removeEventListener('keydown',onKey);setTimeout(()=>w.remove(),180);if(o.onClose)o.onClose();try{prev&&prev.focus&&prev.focus();}catch(e){}res(v===undefined?null:v);};
 const onKey=e=>{if(e.key==='Escape'&&w===$('#modals').lastElementChild)close(null);
  if(e.key==='Tab'){const f=$$('button,input,select,textarea,a[href],video,audio',w).filter(x=>!x.disabled&&x.offsetParent!==null);if(!f.length)return;
   if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus();}}};
 document.addEventListener('keydown',onKey);w.addEventListener('click',e=>{if(e.target===w&&!o.sticky)close(null);});w._close=close;
 const sh=w.firstElementChild;bindEyes(sh);if(o.onOpen)o.onOpen(sh,close);
 const af=sh.querySelector('[autofocus]')||sh.querySelector('button');if(af)setTimeout(()=>{try{af.focus({preventScroll:true});}catch(e){}},60);});}
function confirmDlg(text,o={}){return modal(`${o.title?`<h3 class="mh">${esc(o.title)}</h3>`:''}<p class="mtext">${esc(text)}</p><div class="mact"><button class="btn" data-v="0">${esc(o.no||T('cancel'))}</button><button class="btn pri ${o.danger?'danger':''}" data-v="1">${esc(o.ok||T('confirm'))}</button></div>`,
 {onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v==='1'))});}
function alertDlg(text,title){return modal(`${title?`<h3 class="mh">${esc(title)}</h3>`:''}<p class="mtext">${esc(text)}</p><div class="mact"><button class="btn pri" data-v>${T('close')}</button></div>`,{onOpen:(s,close)=>{$('[data-v]',s).onclick=()=>close(true);}});}
function promptDlg(title,o={}){const isPw=o.type==='password';
 return modal(`<h3 class="mh">${esc(title)}</h3>${o.text?`<p class="mtext">${esc(o.text)}</p>`:''}
 <div class="${isPw?'pwbox':''}"><input class="inp ${o.mono?'mono':''}" id="pd" type="${o.type||'text'}" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus placeholder="${esc(o.ph||'')}" value="${esc(o.value||'')}" ${o.ltr||isPw?'dir="ltr"':''}>${isPw?`<button type="button" class="eye" data-eye="pd" aria-label="${T('show')}">👁</button>`:''}</div>
 <div class="mact"><button class="btn" data-v="0">${T('cancel')}</button><button class="btn pri ${o.danger?'danger':''}" data-v="1">${esc(o.ok||T('confirm'))}</button></div>`,
 {onOpen:(s,close)=>{const i=$('#pd',s);const ok=()=>close(i.value);$('[data-v="1"]',s).onclick=ok;$('[data-v="0"]',s).onclick=()=>close(null);i.onkeydown=e=>{if(e.key==='Enter')ok();};}});}
function bindEyes(root){$$('[data-eye]',root).forEach(b=>{b.onclick=()=>{const i=document.getElementById(b.dataset.eye);if(!i)return;const sh=i.type==='password';i.type=sh?'text':'password';b.textContent=sh?'🙈':'👁';b.setAttribute('aria-label',sh?T('hide'):T('show'));};});}
function bindMeter(input,bar,lbl){const up=()=>{const r=strength(input.value);bar.style.width=(input.value?(r.s+1)*20:0)+'%';bar.style.background=STR_COL[r.s];lbl.textContent=input.value?T('str_'+r.s)+' · '+T('bits',{b:r.bits}):'';};input.addEventListener('input',up);up();}
function longPress(el,fn){let t=0,fired=false,x=0,y=0;
 el.addEventListener('pointerdown',e=>{fired=false;x=e.clientX;y=e.clientY;t=setTimeout(()=>{fired=true;if(navigator.vibrate)navigator.vibrate(15);fn();},550);});
 const cancel=()=>clearTimeout(t);el.addEventListener('pointerup',cancel);el.addEventListener('pointercancel',cancel);el.addEventListener('pointerleave',cancel);
 el.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-x)>10||Math.abs(e.clientY-y)>10)cancel();});
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('click',e=>{if(fired){e.stopImmediatePropagation();e.preventDefault();fired=false;}},true);}
// While a system sheet is open (file picker, camera, share, fingerprint) the page goes "hidden" — don't auto-lock for that.
async function hold(fn){S.hold++;try{return await fn();}finally{setTimeout(()=>{S.hold=Math.max(0,S.hold-1);},1500);}}
function pickFile(inp){return hold(()=>new Promise(res=>{inp.value='';let got=false;
 inp.onchange=()=>{got=true;res(Array.from(inp.files||[]));};inp.oncancel=()=>{got=true;res([]);};
 const onFocus=()=>{setTimeout(()=>{if(!got)res([]);},1200);window.removeEventListener('focus',onFocus);};window.addEventListener('focus',onFocus);inp.click();}));}
async function shareOrSave(file){if(navigator.canShare&&navigator.canShare({files:[file]})){try{await hold(()=>navigator.share({files:[file],title:file.name}));return 'shared';}catch(e){if(e.name==='AbortError')return null;}}
 saveFile(file);return 'saved';}
function saveFile(file){const u=URL.createObjectURL(file);const a=document.createElement('a');a.href=u;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);}

/* ================= PIN pad & pattern ================= */
function pinPad(title,sub){let v='';
 return modal(`<h3 class="mh" style="text-align:center">${esc(title)}</h3><p class="mtext" id="pmsg" style="text-align:center;min-height:1.6em">${esc(sub||'')}</p>
 <div class="pdots">${'<i></i>'.repeat(6)}</div><div class="pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-n="${n}">${n}</button>`).join('')}<button data-a="x" aria-label="${T('cancel')}">✕</button><button data-n="0">0</button><button data-a="del" aria-label="${T('delete')}">⌫</button></div>`,
 {sticky:true,onOpen:(s,close)=>{const dots=$$('.pdots i',s);const draw=()=>dots.forEach((d,i)=>d.classList.toggle('on',i<v.length));
  const press=n=>{if(v.length<6){v+=n;draw();if(v.length===6)setTimeout(()=>close(v),120);}};
  $$('[data-n]',s).forEach(b=>b.onclick=()=>press(b.dataset.n));$('[data-a=del]',s).onclick=()=>{v=v.slice(0,-1);draw();};$('[data-a=x]',s).onclick=()=>close(null);
  s.addEventListener('keydown',e=>{if(/^\d$/.test(e.key))press(e.key);else if(e.key==='Backspace'){v=v.slice(0,-1);draw();}});}});}
function patternPad(title,sub){const P=[50,150,250];let dots='';for(let i=0;i<9;i++){const x=P[i%3],y=P[(i/3)|0];dots+=`<circle class="pr" cx="${x}" cy="${y}" r="30"/><circle class="pd" data-i="${i}" cx="${x}" cy="${y}" r="10"/>`;}
 return modal(`<h3 class="mh" style="text-align:center">${esc(title)}</h3><p class="mtext" id="pmsg" style="text-align:center;min-height:1.6em">${esc(sub||'')}</p>
 <svg class="pat" viewBox="0 0 300 300" role="img" aria-label="${esc(title)}"><polyline points=""/>${dots}</svg><div class="mact"><button class="btn" data-a="x">${T('cancel')}</button></div>`,
 {sticky:true,onOpen:(s,close)=>{const svg=$('svg',s),pl=$('polyline',s),msg=$('#pmsg',s);let seq=[],down=false,cur=null;
  const pt=e=>{const r=svg.getBoundingClientRect();return {x:(e.clientX-r.left)*300/r.width,y:(e.clientY-r.top)*300/r.height};};
  const redraw=()=>{pl.setAttribute('points',seq.map(i=>P[i%3]+','+P[(i/3)|0]).concat(cur?[cur.x+','+cur.y]:[]).join(' '));$$('.pd',s).forEach(c=>c.classList.toggle('on',seq.includes(+c.dataset.i)));};
  const add=i=>{if(seq.includes(i))return;const last=seq[seq.length-1];
   if(last!=null){const ra=(last/3)|0,ca=last%3,rb=(i/3)|0,cb=i%3;if((ra+rb)%2===0&&(ca+cb)%2===0){const mid=((ra+rb)/2)*3+(ca+cb)/2;if(!seq.includes(mid))seq.push(mid);}}
   seq.push(i);if(navigator.vibrate)navigator.vibrate(8);};
  const hit=p=>{for(let i=0;i<9;i++){const dx=p.x-P[i%3],dy=p.y-P[(i/3)|0];if(dx*dx+dy*dy<34*34)return i;}return -1;};
  svg.addEventListener('pointerdown',e=>{down=true;seq=[];try{svg.setPointerCapture(e.pointerId);}catch(x){}const p=pt(e),h=hit(p);if(h>=0)add(h);cur=p;redraw();});
  svg.addEventListener('pointermove',e=>{if(!down)return;const p=pt(e),h=hit(p);if(h>=0)add(h);cur=p;redraw();});
  const up=()=>{if(!down)return;down=false;cur=null;redraw();
   if(seq.length<4){msg.textContent=T('pat_short');setTimeout(()=>{seq=[];redraw();},500);return;}const out=seq.join('');setTimeout(()=>close(out),150);};
  svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);$('[data-a=x]',s).onclick=()=>close(null);}});}
async function askNewSecret(kind){const pad=kind==='pin'?pinPad:patternPad;
 const a=await pad(kind==='pin'?T('pin_new'):T('pat_draw'));if(!a)return null;
 const b=await pad(kind==='pin'?T('pin_again'):T('pat_again'));if(!b)return null;
 if(a!==b){toast(kind==='pin'?T('pin_mismatch'):T('pat_mismatch'),'bad');return null;}return a;}

/* ================= lock screen ================= */
function dialSVG(){let t='';for(let i=0;i<60;i++){const a=i*Math.PI/30,r1=i%5?91:84;
 t+=`<line x1="${(110+r1*Math.sin(a)).toFixed(1)}" y1="${(110-r1*Math.cos(a)).toFixed(1)}" x2="${(110+98*Math.sin(a)).toFixed(1)}" y2="${(110-98*Math.cos(a)).toFixed(1)}"/>`;}
 return `<svg class="dial" viewBox="0 0 220 220" aria-hidden="true"><circle class="d-o" cx="110" cy="110" r="106"/><g class="d-t">${t}</g><g class="d-w"><circle class="d-i" cx="110" cy="110" r="74"/><g class="d-s"><line x1="110" y1="42" x2="110" y2="178"/><line x1="51.1" y1="76" x2="168.9" y2="144"/><line x1="51.1" y1="144" x2="168.9" y2="76"/></g><circle class="d-h" cx="110" cy="110" r="27"/><path class="d-k" d="M110 97a7 7 0 0 1 3.5 13.1V123h-7v-12.9A7 7 0 0 1 110 97z"/></g></svg>`;}
function lockShell(inner,withLang){const L=$('#lock');L.hidden=false;L.classList.remove('gone');$('#view').setAttribute('aria-hidden','true');
 L.innerHTML=`<div class="lockin">${withLang?`<div class="langbar"><div class="seg">${LANGS.map(l=>`<button data-lang="${l.c}" aria-pressed="${l.c===CUR}">${l.n}</button>`).join('')}</div></div>`:''}
 <div class="dialwrap">${dialSVG()}</div><div class="brand"><h1>VaultNest</h1><p>${T('app_sub')}</p></div><div class="lockbody">${inner}</div></div>`;
 bindEyes(L);$$('[data-lang]',L).forEach(b=>b.onclick=()=>{setLang(b.dataset.lang);L._redraw&&L._redraw();});}
function shakeDial(){const d=$('#lock .dial');if(!d)return;d.classList.remove('shake');void d.offsetWidth;d.classList.add('shake');}
function fatal(msg){lockShell(`<div class="card"><p>${esc(msg)}</p></div>`,true);}
function showOnboard(){const L=$('#lock');L._redraw=showOnboard;lockShell('<div id="obh"></div>',true);obSlides($('#obh'),()=>{LS.set('onboarded',1);showCreate();},true);}
function obSlides(host,onDone,first){let i=0;const N=5;const draw=()=>{host.innerHTML=`<div class="ob"><h2>${T('ob'+(i+1)+'_t')}</h2><p>${T('ob'+(i+1)+'_d')}</p>
 <div class="dots">${Array.from({length:N},(_,j)=>`<i class="${j===i?'on':''}"></i>`).join('')}</div>
 <div class="mact"><button class="btn" data-a="skip">${T('skip')}</button><button class="btn pri" data-a="next">${i<N-1?T('next'):(first?T('ob_start'):T('done'))}</button></div></div>`;
 $('[data-a=skip]',host).onclick=onDone;$('[data-a=next]',host).onclick=()=>{if(i<N-1){i++;draw();}else onDone();};};draw();}
function pwFields(id){return `<label class="lbl" for="${id}1">${T('new_pw')}</label><div class="pwbox"><input id="${id}1" class="inp" type="password" autocomplete="new-password" dir="ltr" spellcheck="false"><button type="button" class="eye" data-eye="${id}1" aria-label="${T('show')}">👁</button></div>
 <div class="meter"><i id="${id}m"></i></div><div class="mlbl" id="${id}ml"></div>
 <label class="lbl" for="${id}2">${T('pw_confirm')}</label><div class="pwbox"><input id="${id}2" class="inp" type="password" autocomplete="new-password" dir="ltr" spellcheck="false"><button type="button" class="eye" data-eye="${id}2" aria-label="${T('show')}">👁</button></div>`;}
async function readPwFields(root,id,errEl){const a=$('#'+id+'1',root).value,b=$('#'+id+'2',root).value;errEl.textContent='';
 if([...norm(a)].length<10){errEl.textContent=T('pw_short');return null;}if(a!==b){errEl.textContent=T('pw_mismatch');return null;}
 if(strength(a).s<2&&!(await confirmDlg(T('pw_weak_warn'),{danger:true,ok:T('continue')})))return null;return a;}
function showCreate(){const L=$('#lock');L._redraw=showCreate;
 lockShell(`<div class="stack"><h2 class="ctitle">${T('create_t')}</h2><p class="mlbl" style="text-align:center">${T('create_d')}</p>${pwFields('cp')}
 <div class="err" id="cerr"></div><button class="btn pri big" id="cbtn">${T('create_btn')}</button><button class="link" id="crest">${T('restore_existing')}</button></div>`,true);
 bindMeter($('#cp1'),$('#cpm'),$('#cpml'));
 $('#cbtn').onclick=async()=>{const pw=await readPwFields(L,'cp',$('#cerr'));if(!pw)return;const b=$('#cbtn');b.disabled=true;b.textContent=T('creating');
  try{const {raw,code}=await createVault(pw);LS.set('onboarded',1);persistStorage();showRecoveryCode(code,()=>afterUnlock(raw,true));}
  catch(e){b.disabled=false;b.textContent=T('create_btn');$('#cerr').textContent=T('err_generic',{e:e.message});}};
 $('#crest').onclick=restoreFlow;}
function showRecoveryCode(code,cont){lockShell(`<div class="stack"><h2 class="ctitle">${T('rec_t')}</h2><p class="mtext">${T('rec_d')}</p><div class="reccode" id="rcode">${esc(code)}</div>
 <button class="btn" id="rcopy">⧉ ${T('rec_copy')}</button><label class="chk"><input type="checkbox" id="rchk"> ${T('rec_check')}</label><button class="btn pri big" id="rgo" disabled>${T('continue')}</button></div>`);
 $('#rcopy').onclick=()=>copyText(code);$('#rchk').onchange=e=>{$('#rgo').disabled=!e.target.checked;};$('#rgo').onclick=cont;}
async function showUnlock(msg){const L=$('#lock');L._redraw=()=>showUnlock();const quick=await DB.get('meta','quick'),bio=await DB.get('meta','bio');
 lockShell(`<form id="uf" class="stack" autocomplete="off"><label class="lbl" for="upw">${T('master_pw')}</label>
 <div class="pwbox"><input id="upw" class="inp" type="password" autocomplete="current-password" dir="ltr" spellcheck="false"><button type="button" class="eye" data-eye="upw" aria-label="${T('show')}">👁</button></div>
 <div class="err" id="uerr" role="alert">${esc(msg||'')}</div><button class="btn pri big" id="ubtn" type="submit">${T('unlock')}</button></form>
 <div class="quickrow">${bio?`<button class="btn" id="ubio">👆 ${T('use_bio')}</button>`:''}${quick?`<button class="btn" id="uq">${quick.kind==='pin'?'🔢 '+T('use_pin'):'⠿ '+T('use_pattern')}</button>`:''}</div>
 <button class="link" id="uforgot">${T('forgot')}</button>`,true);
 const err=$('#uerr'),btn=$('#ubtn');
 $('#uf').onsubmit=async e=>{e.preventDefault();const pw=$('#upw').value;if(!pw)return;const until=LS.get('pwuntil',0);
  if(Date.now()<until){err.textContent=T('wait_s',{s:Math.ceil((until-Date.now())/1000)});return;}
  btn.disabled=true;btn.textContent=T('unlocking');
  try{const raw=await unwrapPw(pw);LS.set('pwfails',0);LS.set('pwuntil',0);await afterUnlock(raw);}
  catch(x){btn.disabled=false;btn.textContent=T('unlock');if(x&&x.name!=='OperationError'){err.textContent=T('err_generic',{e:x.message});logErr(x.message);return;}
   const n=LS.get('pwfails',0)+1;LS.set('pwfails',n);if(n>=5)LS.set('pwuntil',Date.now()+Math.min(30000*2**(n-5),900000));
   err.textContent=T('wrong_pw');shakeDial();$('#upw').select();}};
 if(bio)$('#ubio').onclick=async()=>{try{const raw=await hold(unlockBio);await afterUnlock(raw);}catch(x){err.textContent=x.code==='noprf'?T('bio_unsupported'):T('bio_fail');}};
 if(quick){$('#uq').onclick=()=>quickUnlockFlow(quick.kind);}
 $('#uforgot').onclick=showRecover;
 if(quick&&!bio&&!msg)setTimeout(()=>{if(!S.unlocked&&!$('#modals').children.length)quickUnlockFlow(quick.kind);},250);}
async function quickUnlockFlow(kind){let sub='';for(;;){const pad=kind==='pin'?pinPad:patternPad;
 const s=await pad(kind==='pin'?T('pin_enter'):T('pat_enter'),sub);if(s==null)return;
 try{const raw=await unlockQuick(s);await afterUnlock(raw);return;}
 catch(x){if(x.code==='wrong'){sub=T('quick_wrong',{n:x.left});shakeDial();continue;}if(x.code==='wiped'){showUnlock(T('quick_wiped'));return;}
  toast(T('err_generic',{e:x.message}),'bad');return;}}}
function showRecover(){const L=$('#lock');L._redraw=showRecover;
 lockShell(`<div class="stack"><label class="lbl" for="rc">${T('rec_enter')}</label><input id="rc" class="inp mono" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX">
 <div class="err" id="rerr"></div><button class="btn pri big" id="rbtn">${T('unlock')}</button><button class="link" id="rback">${T('back')}</button></div>`,true);
 $('#rback').onclick=()=>showUnlock();
 $('#rbtn').onclick=async()=>{const b=$('#rbtn');b.disabled=true;try{const raw=await unwrapRec($('#rc').value);showNewPw(raw);}catch(e){b.disabled=false;$('#rerr').textContent=T('rec_wrong');shakeDial();}};}
function showNewPw(raw){const L=$('#lock');L._redraw=null;
 lockShell(`<div class="stack"><h2 class="ctitle">${T('rec_ok_set_new')}</h2>${pwFields('np')}<div class="err" id="nerr"></div><button class="btn pri big" id="nbtn">${T('save')}</button></div>`);
 bindMeter($('#np1'),$('#npm'),$('#npml'));
 $('#nbtn').onclick=async()=>{const pw=await readPwFields(L,'np',$('#nerr'));if(!pw)return;$('#nbtn').disabled=true;
  await setMasterPw(raw,pw);LS.set('pwfails',0);LS.set('pwuntil',0);toast(T('pw_changed'));await afterUnlock(raw);};}
async function afterUnlock(raw,fresh){S.dekRaw=raw;S.dek=await importDEK(raw);S.decoy=false;S.sid++;await loadAll();S.unlocked=true;S.stack=[];
 const d=$('#lock .dial');if(d)d.classList.add('open');const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 $('#view').removeAttribute('aria-hidden');go('home',{},true);armIdle();persistStorage();
 setTimeout(()=>{const L=$('#lock');L.classList.add('gone');setTimeout(()=>{if(S.unlocked){L.hidden=true;L.innerHTML='';}},reduce?0:350);},reduce?0:600);
 try{await ensureInboxKey();}catch(e){logErr('inbox key '+e.message);}
 if(fresh)setTimeout(offerQuick,reduce?50:900);else setTimeout(()=>handleInbox(true),reduce?50:900);}
// one place that ends a session: every pending operation sees a new sid and drops its write
function teardown(){S.sid++;S.inboxPriv=null;S.inboxKeys={};S.inboxBusy=false;clearInterval(S.tick);S.tick=0;if(S.dekRaw)S.dekRaw.fill(0);S.dekRaw=null;S.dek=null;S.items=[];S.files=[];S.unlocked=false;S.decoy=false;
 S.urls.forEach(u=>URL.revokeObjectURL(u));S.urls=[];Object.values(S.thumbs).forEach(u=>URL.revokeObjectURL(u));S.thumbs={};
 $$('#modals .mwrap').forEach(w=>w._close&&w._close(null));$('#modals').innerHTML='';$('#view').innerHTML='';clearTimeout(idleT);}
function lock(silent){if(!S.unlocked)return;teardown();
 if(clipPending||clipT){clearTimeout(clipT);clipT=0;clipClear();}showUnlock();if(!silent)toast(T('locked'));}
let idleT=0,hiddenAt=0;
function armIdle(){clearTimeout(idleT);if(S.unlocked)idleT=setTimeout(()=>{if(!S.hold)lock();else armIdle();},10*60000);}
['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(S.unlocked)armIdle();},{passive:true}));
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){if(S.hold)return;document.body.classList.add('veil');hiddenAt=Date.now();if(S.unlocked&&LS.get('autolock',1)===0)lock(true);}
 else{document.body.classList.remove('veil');const m=LS.get('autolock',1);if(S.unlocked&&!S.hold&&hiddenAt&&Date.now()-hiddenAt>=m*60000)lock(true);hiddenAt=0;
  if(clipPending)setTimeout(clipClear,300);}});
window.addEventListener('focus',()=>{if(clipPending)clipClear();});
async function offerQuick(){if(!S.unlocked)return;const bioOk=await bioAvailable();
 const r=await modal(`<h3 class="mh">${T('quick_offer_t')}</h3><p class="mtext">${T('quick_offer_d')}</p><div class="stack">
 ${bioOk?`<button class="btn big" data-v="bio">👆 ${T('use_bio')}</button>`:''}<button class="btn big" data-v="pin">🔢 ${T('q_set_pin')}</button><button class="btn big" data-v="pattern">⠿ ${T('q_set_pattern')}</button>
 <button class="link" data-v="0">${T('later')}</button></div>`,{onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v))});
 if(r==='bio')await doSetupBio();else if(r==='pin'||r==='pattern')await doSetupQuick(r);}
async function doSetupQuick(kind){const s=await askNewSecret(kind);if(!s)return;await setQuick(kind,s);toast(T('quick_set_ok'));rerender();}
async function doSetupBio(){try{await hold(setupBio);toast(T('bio_ok'));}catch(e){toast(e.code==='noprf'?T('bio_unsupported'):T('bio_fail'),'bad');logErr('bio '+(e.name||'')+' '+e.message);}rerender();}
async function restoreFlow(){const [f]=await pickFile($('#fbak'));if(!f)return;
 if(f.size>MAX_BACKUP){await alertDlg(T('b_too_big'),T('b_import'));return;}
 const txt=await f.text();
 if(isShareFile(txt)){if(S.unlocked)await importShare(txt);else toast(T('sh_need_unlock'),'bad');return;}
 // 1) envelope + bounds BEFORE asking for a password (no key derivation on unchecked numbers)
 let d;try{d=parseBackup(txt);}catch(e){await alertDlg(e.code==='version'?T('b_version'):T('b_bad'),T('b_import'));return;}
 if(!d){await alertDlg(T('b_bad'),T('b_import'));return;}
 // shares waiting in the inbox belong to THIS vault's key; restoring another vault would leave them closed (they are kept, not deleted)
 if(S.unlocked){let n=0;try{n=(await inboxEntries()).length;}catch(e){}
  if(n){const c=await menuDlg(T('b_inbox_pending',{n}),[['handle','📥',T('in_handle')],['go','↩',T('b_continue_anyway')]]);if(!c)return;if(c==='handle'){await handleInbox(false);return;}}}
 let raw=null;for(;;){const pw=await promptDlg(T('b_pw_prompt'),{type:'password',text:T('b_pw_text')});if(pw==null)return;
  try{raw=await unwrapBackup(d,pw,false);break;}catch(e){try{raw=await unwrapBackup(d,pw,true);break;}catch(e2){toast(T('wrong_pw'),'bad');}}}
 // 2) decrypt + schema-check everything; legacy decoy records must be POSITIVELY identified or left out
 toast(T('b_checking'));let P;const opt={};
 for(;;){try{P=await prepareRestore(d,raw,opt);break;}catch(e){
  if(e.code==='needdecoy'){const c=await menuDlg(T('b_needdecoy',{n:e.n}),[['pw','🔑',T('b_decoy_pw')],['drop','➖',T('b_drop_unknown',{n:e.n})]]);
   if(c==='pw'){const dp=await promptDlg(T('dcl_pw'),{type:'password'});if(dp==null)continue;try{opt.decoyRaw=await unwrapBackupDecoy(d,dp);}catch(x){toast(T('wrong_pw'),'bad');}continue;}
   if(c==='drop'){opt.dropUnknown=true;continue;}raw.fill(0);return;}
  raw.fill(0);logErr('restore check '+(e.code||e.message));await alertDlg(e.code==='corrupt'?T('b_corrupt',{n:e.bad}):T('b_bad'),T('b_import'));return;}}
 // 3) ask with the real numbers
 const hasVault=!!(await DB.get('meta','vault'));const st=P.stats;
 let msg=T('b_summary',{i:st.items,f:st.files,d:st.created?fmtDate(st.created):'?'});if(st.recId)msg+='\n'+T('b_recid',{id:st.recId});
 if(st.legacy)msg+='\n'+T('b_legacy',{n:st.legacy});if(st.dropped)msg+='\n'+T('b_dropped',{n:st.dropped});
 if(hasVault)msg+='\n\n'+(S.unlocked?T('b_replace_cur',{i:live().length,f:liveFiles().length}):T('b_replace'));
 const ch=await modal(`<h3 class="mh">↩ ${T('b_import')}</h3><p class="mtext">${esc(msg)}</p><div class="stack">${hasVault&&S.unlocked?`<button class="btn" data-v="bk">🛡️ ${T('b_backup_first')}</button>`:''}
  <button class="btn pri ${hasVault?'danger':''}" data-v="go">${T('restore')}</button><button class="btn" data-v="0">${T('cancel')}</button></div>`,{onOpen:(s2,close)=>$$('[data-v]',s2).forEach(b=>b.onclick=()=>close(b.dataset.v))});
 if(!ch||ch==='0'){raw.fill(0);return;}if(ch==='bk'){const ok=await backupDlg();if(!ok){raw.fill(0);return;}}
 // 4) other tabs lock first; a snapshot of the current vault is kept in memory until the restore is verified
 const run=async()=>{bcast('vault-changed');toast(T('b_restoring'));let snap=null;if(hasVault){try{snap=await snapshotAll();}catch(e){}}
  try{await commitRestore(P);}catch(e){logErr('restore commit '+(e.code||e.message));return 'unchanged';}
  if(await verifyRestore(P,raw))return 'ok';
  logErr('restore verify failed');if(!snap)return 'unverified';
  const c=await menuDlg(T('b_verify_fail_rb'),[['rb','↩',T('b_rollback')],['keep','✔',T('b_keep_new')]]);
  if(c==='rb'){try{await restoreSnapshot(snap);return 'rolled';}catch(e){return 'rbfail';}}return 'unverified';};
 const res=navigator.locks?await navigator.locks.request('vaultnest-exclusive',run):await run();
 if(res==='unchanged'){raw.fill(0);toast(T('b_restore_fail'),'bad');return;}
 if(res==='rolled'){raw.fill(0);toast(T('b_rolled_back'));if(S.unlocked){await loadAll();rerender();}else showUnlock();return;}
 if(res==='rbfail')await alertDlg(T('b_rollback_fail'),T('b_import'));
 if(res==='unverified')await alertDlg(T('b_verify_fail'),T('b_import'));
 if(S.unlocked)teardown();
 LS.set('onboarded',1);LS.set('lastBackup',Date.now());LS.set('keysAt',0);if(res==='ok'){toast(T('b_restored'));toast(T('b_quick_note'));}await afterUnlock(raw);}

/* ---- other tabs: a restore / reset elsewhere locks this tab; data changes elsewhere are reloaded */
if(BC)BC.onmessage=e=>{const m=e.data||{};
 if(m.type==='vault-changed'){if(S.unlocked){lock(true);toast(T('tab_locked'));}else if(DB.db){DB.db.close();DB.db=null;}}
 else if(m.type==='data'&&S.unlocked){clearTimeout(S.reloadT);S.reloadT=setTimeout(async()=>{if(!S.unlocked)return;await loadAll();if(!$('#modals').children.length)rerender();},350);}};

window.__MODS['app-ui']='1.2.1';
