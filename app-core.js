/* app-core.js — VaultNest · storage, crypto, vault keys, data, backup/restore, CSV, generator
   Loaded by app-boot.js in a fixed order with ?v=<version>. Last line registers the module. */
'use strict';
/* ================= constants ================= */
const APP_VERSION=window.__APPV||'1.2.1';
const DB_NAME='appnest_vault';
const LSP='vaultnest_';
const KDF_ITER=600000, QUICK_ITER=310000, REC_ITER=150000;
const STORE_URL='https://appnest-store.pages.dev';
const FEEDBACK='appnest55@gmail.com';
const SHARED_HOST='barakaflalo.github.io';

/* error log + window error listeners live in app-boot.js (logErr is global) */

/* ================= small utils ================= */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const te=new TextEncoder(), td=new TextDecoder();
const rand=n=>crypto.getRandomValues(new Uint8Array(n));
function b64(buf){const u=buf instanceof Uint8Array?buf:new Uint8Array(buf);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
function unb64(s){const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}
const uid=()=>Date.now().toString(36)+Array.from(rand(6),b=>b.toString(16).padStart(2,'0')).join('');
function randInt(n){const lim=Math.floor(0x100000000/n)*n;const a=new Uint32Array(1);for(;;){crypto.getRandomValues(a);if(a[0]<lim)return a[0]%n;}}
const ymd=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function fmtDate(x){if(!x)return '';const d=typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)?new Date(x+'T00:00'):new Date(x);if(isNaN(d))return String(x);return d.toLocaleDateString(CUR==='he'?'he-IL':'en-GB',{day:'numeric',month:'short',year:'numeric'});}
function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return (b/1024).toFixed(0)+' KB';if(b<1073741824)return (b/1048576).toFixed(1)+' MB';return (b/1073741824).toFixed(2)+' GB';}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const norm=s=>String(s||'').normalize('NFKC');
function hostOf(u){if(!u)return '';try{return new URL(/^[a-z]+:\/\//i.test(u)?u:'https://'+u).hostname.replace(/^www\./,'');}catch(e){return '';}}

/* ================= localStorage shim (prefs only — never secrets) ================= */
const LS={mem:{},
get(k,d){try{const v=localStorage.getItem(LSP+k);return v===null?(k in this.mem?this.mem[k]:d):JSON.parse(v);}catch(e){return k in this.mem?this.mem[k]:d;}},
set(k,v){this.mem[k]=v;try{localStorage.setItem(LSP+k,JSON.stringify(v));}catch(e){}},
del(k){delete this.mem[k];try{localStorage.removeItem(LSP+k);}catch(e){}},
clearAll(){this.mem={};try{Object.keys(localStorage).filter(k=>k.startsWith(LSP)).forEach(k=>localStorage.removeItem(k));}catch(e){}}};

/* ================= IndexedDB ================= */
// stores: meta (vault/quick/bio/devkey), items {id,iv,ct}, files {id,miv,mct,tiv,tct}, blobs {iv,ct}
const STORES=['meta','items','files','blobs'];
const DB={db:null,
open(){if(this.db)return Promise.resolve(this.db);return new Promise((res,rej)=>{let r;try{r=indexedDB.open(DB_NAME,1);}catch(e){rej(e);return;}
 r.onupgradeneeded=()=>{const d=r.result;STORES.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s);});};
 r.onsuccess=()=>{this.db=r.result;this.db.onversionchange=()=>{this.db.close();this.db=null;};res(this.db);};
 r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('blocked'));});},
// fn must only queue requests; any exception aborts the whole transaction explicitly (nothing half-written)
async run(stores,mode,fn){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction(stores,mode);let out,r;try{r=fn(t);}catch(e){try{t.abort();}catch(_){}rej(e);return;}if(r&&'onsuccess' in r)r.onsuccess=()=>{out=r.result;};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('abort'));});},
get(s,k){return this.run(s,'readonly',t=>t.objectStore(s).get(k));},
put(s,k,v){return this.run(s,'readwrite',t=>{t.objectStore(s).put(v,k);});},
del(s,k){return this.run(s,'readwrite',t=>{t.objectStore(s).delete(k);});},
all(s){return this.run(s,'readonly',t=>t.objectStore(s).getAll());},
count(s){return this.run(s,'readonly',t=>t.objectStore(s).count());},
async wipe(){if(this.db){this.db.close();this.db=null;}return new Promise(r=>{const q=indexedDB.deleteDatabase(DB_NAME);q.onsuccess=()=>r('ok');q.onerror=()=>r('error');q.onblocked=()=>setTimeout(()=>r('blocked'),4000);});}};

/* ================= crypto primitives ================= */
async function kdf(secret,salt,iter){const base=await crypto.subtle.importKey('raw',te.encode(norm(secret)),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function enc(key,data){const iv=rand(12);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);return {iv,ct};}
function dec(key,iv,ct){return crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);}
const importDEK=raw=>crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
async function encJ(obj){return enc(S.dek,te.encode(JSON.stringify(obj)));}
async function decJ(iv,ct){return JSON.parse(td.decode(await dec(S.dek,iv,ct)));}
const REC_ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols → 5 bits each, 24 chars = 120 bits
function genRecovery(){const b=rand(24);let s='';for(let i=0;i<24;i++){s+=REC_ABC[b[i]&31];if(i%4===3&&i<23)s+='-';}return s;}
const normRec=c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

/* ================= state ================= */
const S={dek:null,dekRaw:null,items:[],files:[],unlocked:false,stack:[],urls:[],thumbs:{},hold:0,decoy:false,decoyExists:false,tick:0,unreadable:0,sid:0,inboxPriv:null,inboxKeys:{},inboxCount:0,inboxStuck:0,inboxBusy:false};

/* ================= vault / keys ================= */
async function createVault(pw){
 const raw=rand(32),salt=rand(16),rsalt=rand(16),code=genRecovery();
 const w=await enc(await kdf(pw,salt,KDF_ITER),raw);
 const rw=await enc(await kdf(normRec(code),rsalt,REC_ITER),raw);
 await DB.put('meta','vault',{v:1,created:Date.now(),kdf:{iter:KDF_ITER,salt},pw:{iv:w.iv,ct:w.ct},rec:{iter:REC_ITER,salt:rsalt,iv:rw.iv,ct:rw.ct,id:recIdGen()}});
 return {raw,code};}
async function unwrapPw(pw){const m=await DB.get('meta','vault');const k=await kdf(pw,m.kdf.salt,m.kdf.iter);return new Uint8Array(await dec(k,m.pw.iv,m.pw.ct));}
async function unwrapRec(code){const m=await DB.get('meta','vault');const k=await kdf(normRec(code),m.rec.salt,m.rec.iter);return new Uint8Array(await dec(k,m.rec.iv,m.rec.ct));}
async function setMasterPw(raw,pw){const m=await DB.get('meta','vault');const salt=rand(16);const w=await enc(await kdf(pw,salt,KDF_ITER),raw);
 m.kdf={iter:KDF_ITER,salt};m.pw={iv:w.iv,ct:w.ct};await DB.put('meta','vault',m);LS.set('keysAt',Date.now());}
async function unwrapDecoy(pw){const d=await DB.get('meta','decoy');if(!d)throw Object.assign(new Error('nodecoy'),{name:'OperationError'});const k=await kdf(pw,d.kdf.salt,d.kdf.iter);return new Uint8Array(await dec(k,d.pw.iv,d.pw.ct));}
async function setDecoyPw(raw,pw){const salt=rand(16);const w=await enc(await kdf(pw,salt,KDF_ITER),raw);await DB.put('meta','decoy',{kdf:{iter:KDF_ITER,salt},pw:{iv:w.iv,ct:w.ct}});}
// v1.1.1: the decoy vault was removed. Legacy decoy data is removed ONLY by positive identification:
// a record is deleted only if it actually decrypts with the decoy key. A record that fails to decrypt is never deleted.
async function removeDecoyWith(pw){const raw=await unwrapDecoy(pw);const k=await importDEK(raw);raw.fill(0);const di=[],df=[];
 for(const r of await DB.all('items')){try{await dec(k,r.iv,r.ct);di.push(r.id);}catch(e){}}
 for(const r of await DB.all('files')){try{await dec(k,r.miv,r.mct);df.push(r.id);}catch(e){}}
 await DB.run(['meta','items','files','blobs'],'readwrite',t=>{di.forEach(id=>t.objectStore('items').delete(id));df.forEach(id=>{t.objectStore('files').delete(id);t.objectStore('blobs').delete(id);});t.objectStore('meta').delete('decoy');});
 S.decoyExists=false;return {items:di.length,files:df.length};}
async function newRecovery(){const m=await DB.get('meta','vault');const code=genRecovery(),rsalt=rand(16);
 const rw=await enc(await kdf(normRec(code),rsalt,REC_ITER),S.dekRaw);m.rec={iter:REC_ITER,salt:rsalt,iv:rw.iv,ct:rw.ct,id:recIdGen()};await DB.put('meta','vault',m);LS.set('keysAt',Date.now());return code;}
// device key: non-extractable, stored in IndexedDB; wraps quick-unlock blob so PIN/pattern alone is useless off-device
async function devKey(){let k=await DB.get('meta','devkey');if(!k){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await DB.put('meta','devkey',k);}return k;}
async function setQuick(kind,secret){const salt=rand(16);const inner=await enc(await kdf(kind+':'+secret,salt,QUICK_ITER),S.dekRaw);
 const packed=new Uint8Array(12+inner.ct.byteLength);packed.set(inner.iv,0);packed.set(new Uint8Array(inner.ct),12);
 const outer=await enc(await devKey(),packed);await DB.put('meta','quick',{kind,salt,iter:QUICK_ITER,iv:outer.iv,ct:outer.ct,fails:0});}
async function unlockQuick(secret){const q=await DB.get('meta','quick');if(!q)throw Object.assign(new Error('noquick'),{code:'noquick'});
 const packed=new Uint8Array(await dec(await devKey(),q.iv,q.ct));const k=await kdf(q.kind+':'+secret,q.salt,q.iter);
 try{const raw=new Uint8Array(await dec(k,packed.slice(0,12),packed.slice(12)));if(q.fails){q.fails=0;await DB.put('meta','quick',q);}return raw;}
 catch(e){q.fails=(q.fails||0)+1;if(q.fails>=5){await DB.del('meta','quick');throw Object.assign(new Error('wiped'),{code:'wiped'});}
  await DB.put('meta','quick',q);throw Object.assign(new Error('wrong'),{code:'wrong',left:5-q.fails});}}
// fingerprint = WebAuthn passkey + PRF extension → real key material (not just a yes/no gate)
async function bioAvailable(){try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch(e){return false;}}
async function prfKey(out){const base=await crypto.subtle.importKey('raw',out,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode('VaultNest-bio-v1'),info:te.encode('dek-wrap')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function bioEval(credId,psalt){const a=await navigator.credentials.get({publicKey:{challenge:rand(32),rpId:location.hostname,allowCredentials:[{type:'public-key',id:credId}],userVerification:'required',timeout:60000,extensions:{prf:{eval:{first:psalt}}}}});
 const r=a.getClientExtensionResults();if(!r.prf||!r.prf.results||!r.prf.results.first)throw Object.assign(new Error('noprf'),{code:'noprf'});return r.prf.results.first;}
async function setupBio(){const cred=await navigator.credentials.create({publicKey:{rp:{name:'VaultNest',id:location.hostname},user:{id:rand(16),name:'vaultnest',displayName:'VaultNest'},challenge:rand(32),
 pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',requireResidentKey:true,userVerification:'required'},timeout:60000,extensions:{prf:{}}}});
 const ext=cred.getClientExtensionResults();if(ext.prf&&ext.prf.enabled===false)throw Object.assign(new Error('noprf'),{code:'noprf'});
 const credId=new Uint8Array(cred.rawId),psalt=rand(32);const w=await enc(await prfKey(await bioEval(credId,psalt)),S.dekRaw);
 await DB.put('meta','bio',{credId,psalt,iv:w.iv,ct:w.ct});}
async function unlockBio(){const b=await DB.get('meta','bio');return new Uint8Array(await dec(await prfKey(await bioEval(b.credId,b.psalt)),b.iv,b.ct));}

/* ================= session guard =================
   Every multi-step write captures the vault key + session once, uses ONLY that key for all its parts,
   and checks the session again right before committing. Locked or switched meanwhile → the write is dropped. */
function sess(){const k=S.dek,id=S.sid;return {k,ok:()=>S.unlocked&&S.sid===id&&S.dek===k,check(){if(!this.ok())throw Object.assign(new Error('stale'),{code:'stale'});}};}
const encWith=(k,obj)=>enc(k,te.encode(JSON.stringify(obj)));
const BC=('BroadcastChannel' in window)?new BroadcastChannel('vaultnest'):null;
function bcast(type){try{if(BC)BC.postMessage({type,t:Date.now()});}catch(e){}}

/* ================= data ================= */
function normItem(o){if(!o.f||typeof o.f!=='object'||Array.isArray(o.f))o.f={};if(o.cf!=null&&!Array.isArray(o.cf))o.cf=[];if(o.hist!=null&&!Array.isArray(o.hist))o.hist=[];return o;}
async function loadAll(){const s=sess();const items=[],files=[];let unreadable=0;const decoyExists=!!(await DB.get('meta','decoy'));
 // a record that does not decrypt is counted and LEFT UNTOUCHED — never deleted, never overwritten
 for(const r of await DB.all('items')){try{items.push(normItem(JSON.parse(td.decode(await dec(s.k,r.iv,r.ct)))));}catch(e){unreadable++;}}
 for(const r of await DB.all('files')){try{const m=JSON.parse(td.decode(await dec(s.k,r.miv,r.mct)));m.id=r.id;m.hasThumb=!!r.tct;files.push(m);}catch(e){unreadable++;}}
 if(S.dek!==s.k)return false;S.items=items;S.files=files;S.unreadable=unreadable;S.decoyExists=decoyExists;
 if(unreadable&&!decoyExists)logErr('unreadable records: '+unreadable);
 await purgeTrash();return true;}
async function saveItem(it){const s=sess();const rec=Object.assign({},it,{updated:Date.now()});const e=await encWith(s.k,rec);s.check();
 await DB.put('items',rec.id,{id:rec.id,iv:e.iv,ct:e.ct});it.updated=rec.updated;
 const i=S.items.findIndex(x=>x.id===it.id);if(i>=0)S.items[i]=it;else S.items.push(it);bcast('data');}
// change an item and save it; on failure the in-memory item goes back to how it was
async function updateItem(it,mutate){const before=JSON.stringify(it);mutate(it);try{await saveItem(it);return true;}catch(e){Object.assign(it,JSON.parse(before));toast(T('save_fail',{e:e.message}),'bad');return false;}}
async function saveFileMeta(m){const s=sess();const clean={name:m.name,type:m.type,size:m.size,cat:m.cat,created:m.created,deletedAt:m.deletedAt||0,itemId:m.itemId||''};
 const rec=await DB.get('files',m.id);if(!rec)throw new Error('missing');const e=await encWith(s.k,clean);s.check();rec.miv=e.iv;rec.mct=e.ct;await DB.put('files',m.id,rec);bcast('data');}
async function updateFile(m,mutate){const before=JSON.stringify(m);mutate(m);try{await saveFileMeta(m);return true;}catch(e){Object.assign(m,JSON.parse(before));toast(T('save_fail',{e:e.message}),'bad');return false;}}
async function killItem(id){const att=S.files.filter(x=>x.itemId===id).map(x=>x.id);
 await DB.run(['items','files','blobs'],'readwrite',t=>{t.objectStore('items').delete(id);att.forEach(f=>{t.objectStore('files').delete(f);t.objectStore('blobs').delete(f);});});
 S.items=S.items.filter(x=>x.id!==id);att.forEach(f=>{S.files=S.files.filter(x=>x.id!==f);if(S.thumbs[f]){URL.revokeObjectURL(S.thumbs[f]);delete S.thumbs[f];}});bcast('data');}
async function killFile(id){await DB.run(['files','blobs'],'readwrite',t=>{t.objectStore('files').delete(id);t.objectStore('blobs').delete(id);});S.files=S.files.filter(x=>x.id!==id);if(S.thumbs[id]){URL.revokeObjectURL(S.thumbs[id]);delete S.thumbs[id];}bcast('data');}
async function purgeTrash(){const lim=Date.now()-30*864e5;
 for(const it of S.items.filter(x=>x.deletedAt&&x.deletedAt<lim))await killItem(it.id);
 for(const f of S.files.filter(x=>x.deletedAt&&x.deletedAt<lim))await killFile(f.id);}
const live=()=>S.items.filter(x=>!x.deletedAt&&x.type[0]!=='_');
const templates=()=>S.items.filter(x=>x.type==='_tpl').sort((a,b)=>String(a.title).localeCompare(String(b.title),CUR));
const attachOk=f=>{if(!f.itemId)return true;const it=S.items.find(x=>x.id===f.itemId);return !!it&&!it.deletedAt;};
const liveFiles=()=>S.files.filter(x=>!x.deletedAt&&attachOk(x));
const attachments=id=>S.files.filter(x=>x.itemId===id&&!x.deletedAt).sort((a,b)=>a.created-b.created);
async function makeThumb(file){try{const bmp=await createImageBitmap(file);const sc=Math.min(1,300/Math.max(bmp.width,bmp.height));
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*sc));c.height=Math.max(1,Math.round(bmp.height*sc));
 c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();
 const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.72));return b?await b.arrayBuffer():null;}catch(e){return null;}}
// encrypt one file completely with ONE key (content, thumbnail, metadata)
async function encFileRec(k,f,cat,itemId){const buf=await f.arrayBuffer();const e=await enc(k,buf);const th=/^image\//.test(f.type)?await makeThumb(f):null;const te2=th?await enc(k,th):null;const id=uid();
 const meta={name:f.name||('file-'+ymd()),type:f.type||'application/octet-stream',size:f.size,cat,created:Date.now(),deletedAt:0,itemId:itemId||''};const m=await encWith(k,meta);
 meta.id=id;meta.hasThumb=!!te2;return {id,blob:{iv:e.iv,ct:e.ct},rec:{id,miv:m.iv,mct:m.ct,tiv:te2?te2.iv:null,tct:te2?te2.ct:null},meta};}
async function addOneFile(f,cat,itemId){return (await addFilesAtomic([f],cat,itemId))[0];}
// several files in ONE transaction (all or nothing), all encrypted with the same captured key
async function addFilesAtomic(files,cat,itemId){const s=sess();const out=[];for(const f of files){out.push(await encFileRec(s.k,f,cat,itemId));s.check();}
 s.check();await DB.run(['files','blobs'],'readwrite',t=>{out.forEach(x=>{t.objectStore('blobs').put(x.blob,x.id);t.objectStore('files').put(x.rec,x.id);});});
 out.forEach(x=>S.files.push(x.meta));bcast('data');return out.map(x=>x.meta);}
async function thumbURL(id){if(S.thumbs[id])return S.thumbs[id];const r=await DB.get('files',id);if(!r||!r.tct)return null;
 const u=URL.createObjectURL(new Blob([await dec(S.dek,r.tiv,r.tct)],{type:'image/jpeg'}));S.thumbs[id]=u;return u;}
async function fileBlob(m){const r=await DB.get('blobs',m.id);return new Blob([await dec(S.dek,r.iv,r.ct)],{type:m.type});}
// read all four stores in ONE read transaction → one consistent point in time
async function snapshotAll(){const d=await DB.open();return new Promise((res,rej)=>{const t=d.transaction(STORES,'readonly');const o={};
 STORES.forEach(st=>{const os=t.objectStore(st);o[st]={};const rk=os.getAllKeys(),rv=os.getAll();rk.onsuccess=()=>{o[st].k=rk.result;};rv.onsuccess=()=>{o[st].v=rv.result;};});
 t.oncomplete=()=>{const r={};STORES.forEach(st=>{r[st]=o[st].k.map((k,i)=>[k,o[st].v[i]]);});res(r);};t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('abort'));});}
async function restoreSnapshot(sn){await DB.run(STORES,'readwrite',t=>{STORES.forEach(st=>{const os=t.objectStore(st);os.clear();sn[st].forEach(([k,v])=>os.put(v,k));});});}

/* ================= encrypted share inbox (share-to-vault) =================
   The vault keeps an ECDH P-256 key pair. The PUBLIC key is published to Cache Storage so sw.js encrypts every
   incoming share the moment it arrives (ephemeral ECDH → HKDF → AES-256-GCM). The PRIVATE key exists only encrypted
   with the vault key. Keys are kept as a KEYRING: a key that this vault cannot open (e.g. after restoring another
   vault) is kept, never overwritten, so its shares open again if that vault comes back. Shares that cannot be opened
   are NEVER deleted automatically — only by an explicit choice. */
const INBOX='vaultnest-inbox';
const ECDH={name:'ECDH',namedCurve:'P-256'};
async function kidOf(jwk){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(jwk.x+'.'+jwk.y)));return b64(h.slice(0,9)).replace(/\+/g,'-').replace(/\//g,'_');}
async function ensureInboxKey(){if(!window.caches)return;const s=sess();const keys={};
 const open=async m=>{try{return await crypto.subtle.importKey('pkcs8',await dec(s.k,m.iv,m.ct),ECDH,false,['deriveBits']);}catch(e){return null;}};
 let cur=await DB.get('meta','inbox');const old=(await DB.get('meta','inboxOld'))||[];
 for(const m of old){const p=await open(m);if(p)keys[m.kid]=p;}
 let curPriv=null;if(cur){if(!cur.kid)cur.kid=await kidOf(cur.pub);curPriv=await open(cur);
  if(!curPriv){if(!old.some(x=>x.kid===cur.kid)){old.push(cur);s.check();await DB.put('meta','inboxOld',old.slice(-12));}cur=null;}}
 if(!cur){const kp=await crypto.subtle.generateKey(ECDH,true,['deriveBits']);const pk8=await crypto.subtle.exportKey('pkcs8',kp.privateKey);const jwk=await crypto.subtle.exportKey('jwk',kp.publicKey);
  const pub={kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y};const e=await enc(s.k,pk8);cur={kid:await kidOf(pub),pub,iv:e.iv,ct:e.ct,created:Date.now()};
  curPriv=await crypto.subtle.importKey('pkcs8',pk8,ECDH,false,['deriveBits']);new Uint8Array(pk8).fill(0);}
 s.check();await DB.put('meta','inbox',cur);keys[cur.kid]=curPriv;S.inboxKeys=keys;S.inboxPriv=curPriv;
 const c=await caches.open(INBOX);await c.put('./__inbox/pub',new Response(JSON.stringify({v:2,kid:cur.kid,jwk:cur.pub}),{headers:{'Content-Type':'application/json'}}));}
async function inboxKey(epkRaw,priv){const epk=await crypto.subtle.importKey('raw',epkRaw,ECDH,false,[]);const bits=await crypto.subtle.deriveBits({name:'ECDH',public:epk},priv,256);
 const hk=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:epkRaw,info:te.encode('vaultnest-inbox-v1')},hk,{name:'AES-GCM',length:256},false,['decrypt']);}
const ENV_RE=/\/__inbox\/s-[a-z0-9]+$/;
async function inboxEntries(){if(!window.caches||!(await caches.has(INBOX)))return [];const c=await caches.open(INBOX);const urls=(await c.keys()).map(r=>r.url);
 const env=urls.filter(u=>ENV_RE.test(u));
 // pieces without an envelope = a share that never finished arriving (the envelope is written last); drop after an hour
 for(const u of urls){const m=/(\/__inbox\/s-[a-z0-9]+)\/f\d+$/.exec(u);if(m&&!env.some(e=>e.endsWith(m[1]))){const t=parseInt(m[1].split('-')[1],36);if(!t||Date.now()-t>3600e3)await c.delete(u);}}
 return env.sort();}
const inErr=code=>Object.assign(new Error(code),{code});
async function inboxRead(url){const c=await caches.open(INBOX);const r0=await c.match(url);if(!r0)throw inErr('missing');let env;try{env=await r0.json();}catch(e){throw inErr('bad');}
 if(!env||typeof env.epk!=='string'||typeof env.iv!=='string'||typeof env.ct!=='string'||(env.files!=null&&!Array.isArray(env.files)))throw inErr('bad');
 const keys=env.kid&&S.inboxKeys[env.kid]?[S.inboxKeys[env.kid]]:Object.values(S.inboxKeys||{});let meta=null,key=null;
 for(const p of keys){try{const k=await inboxKey(unb64(env.epk),p);meta=JSON.parse(td.decode(await dec(k,unb64(env.iv),unb64(env.ct))));key=k;break;}catch(e){}}
 if(!meta)throw inErr('nokey');
 // the ENCRYPTED file list is the source of truth; the outer list must match it exactly
 const mf=Array.isArray(meta.files)?meta.files:[],ef=env.files||[];
 if(mf.map(f=>f.key).sort().join(',')!==ef.map(f=>f.key).sort().join(','))throw inErr('bad');
 const files=[];for(const m of mf){const f=ef.find(x=>x.key===m.key);const r=await c.match(url+'/'+m.key);if(!r)throw inErr('missing');
  let pt;try{pt=await dec(key,unb64(f.iv),await r.arrayBuffer());}catch(e){throw inErr('bad');}if(pt.byteLength!==m.size)throw inErr('bad');
  files.push(new File([pt],String(m.name||m.key),{type:String(m.type||'application/octet-stream')}));}
 return {meta,files};}
async function inboxDelete(url){const c=await caches.open(INBOX);for(const k of await c.keys())if(k.url===url||k.url.startsWith(url+'/'))await c.delete(k);}

/* ================= backup (fully encrypted, portable) ================= */
const MAX_BACKUP=700*1048576;
const recIdGen=()=>{const b=rand(4);let s='';for(let i=0;i<4;i++)s+=REC_ABC[b[i]&31];return s;};
async function buildBackup(){const sn=await snapshotAll();const meta=new Map(sn.meta);const m=meta.get('vault');if(!m)throw new Error('novault');
 const blobs=new Map(sn.blobs);const files=[];
 for(const [id,r] of sn.files){const bl=blobs.get(id);if(!bl)throw Object.assign(new Error('missingblob'),{code:'missingblob'});
  files.push({id,miv:b64(r.miv),mct:b64(r.mct),tiv:r.tiv?b64(r.tiv):null,tct:r.tct?b64(r.tct):null,iv:b64(bl.iv),ct:b64(bl.ct)});}
 const out={app:'VaultNest',format:1,version:APP_VERSION,created:new Date().toISOString(),user:LS.get('user',''),
  vault:{kdf:{iter:m.kdf.iter,salt:b64(m.kdf.salt)},pw:{iv:b64(m.pw.iv),ct:b64(m.pw.ct)},rec:{iter:m.rec.iter,salt:b64(m.rec.salt),iv:b64(m.rec.iv),ct:b64(m.rec.ct),id:m.rec.id||''}},
  items:sn.items.map(([id,r])=>({id,iv:b64(r.iv),ct:b64(r.ct)})),files};
 const dm=meta.get('decoy');if(dm)out.decoy={kdf:{iter:dm.kdf.iter,salt:b64(dm.kdf.salt)},pw:{iv:b64(dm.pw.iv),ct:b64(dm.pw.ct)}};
 const who=(LS.get('user','')||'').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,20);
 const f=new File([JSON.stringify(out)],`vaultnest-backup-${who?who+'-':''}${ymd()}.json`,{type:'application/json'});f.recId=m.rec.id||'';return f;}
// ---- validation helpers
const B64RE=/^[A-Za-z0-9+/]*={0,2}$/;
function ub(v,len){if(typeof v!=='string'||!B64RE.test(v))throw Object.assign(new Error('format'),{code:'format'});const u=unb64(v);if(len&&u.length!==len)throw Object.assign(new Error('format'),{code:'format'});return u;}
function ckIter(n){if(!Number.isInteger(n)||n<100000||n>5000000)throw Object.assign(new Error('format'),{code:'format'});return n;}
const isStr=v=>typeof v==='string',isNum=v=>typeof v==='number'&&isFinite(v),isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function validItem(o,id){if(!isObj(o)||o.id!==id||!isStr(o.type)||!(Object.prototype.hasOwnProperty.call(TYPES,o.type)||o.type==='_tpl')||!isStr(o.title))return false;
 if(!isObj(o.f)||Object.values(o.f).some(v=>!isStr(v)))return false;
 if(o.cf!=null&&(!Array.isArray(o.cf)||o.cf.some(c=>!isObj(c)||!isStr(c.n)||!isStr(c.v))))return false;
 if(o.hist!=null&&(!Array.isArray(o.hist)||o.hist.some(h=>!isObj(h)||!isStr(h.k)||!isStr(h.v))))return false;
 if(o.fields!=null&&(!Array.isArray(o.fields)||o.fields.some(x=>!isObj(x)||!isStr(x.n))))return false;
 for(const k of ['created','updated','deletedAt','pwChanged','breachAt','breach'])if(o[k]!=null&&!isNum(o[k]))return false;return true;}
function validFileMeta(m){return isObj(m)&&isStr(m.name)&&isStr(m.type)&&isNum(m.size)&&m.size>=0&&FCATS.includes(m.cat)&&(m.itemId==null||isStr(m.itemId))&&(m.created==null||isNum(m.created))&&(m.deletedAt==null||isNum(m.deletedAt));}
// envelope + bounds are checked BEFORE any password is asked and before any key derivation runs
function parseBackup(text){let d;try{d=JSON.parse(text);}catch(e){return null;}
 if(!isObj(d)||d.app!=='VaultNest'||!isObj(d.vault)||!isObj(d.vault.pw)||!Array.isArray(d.items))return null;
 if(d.format!==1)throw Object.assign(new Error('version'),{code:'version'});
 if(d.files!=null&&!Array.isArray(d.files))return null;if(d.items.length>50000||(d.files||[]).length>20000)return null;
 try{const V=d.vault;ckIter(V.kdf.iter);ub(V.kdf.salt,16);ub(V.pw.iv,12);ub(V.pw.ct);ckIter(V.rec.iter);ub(V.rec.salt,16);ub(V.rec.iv,12);ub(V.rec.ct);
  if(d.decoy){ckIter(d.decoy.kdf.iter);ub(d.decoy.kdf.salt,16);ub(d.decoy.pw.iv,12);ub(d.decoy.pw.ct);}}catch(e){return null;}
 return d;}
async function unwrapBackup(d,secret,useRec){const v=useRec?d.vault.rec:d.vault.pw;const kd=useRec?{salt:d.vault.rec.salt,iter:d.vault.rec.iter}:d.vault.kdf;
 const k=await kdf(useRec?normRec(secret):secret,unb64(kd.salt),kd.iter);return new Uint8Array(await dec(k,unb64(v.iv),unb64(v.ct)));}
async function unwrapBackupDecoy(d,pw){const k=await kdf(pw,unb64(d.decoy.kdf.salt),d.decoy.kdf.iter);return new Uint8Array(await dec(k,unb64(d.decoy.pw.iv),unb64(d.decoy.pw.ct)));}
// ---- safe restore: 1) decode, decrypt and schema-check EVERYTHING, 2) replace in one transaction, 3) read back + decrypt
//      opt.decoyRaw: legacy decoy key — records that fail the main key must POSITIVELY open with it to be kept
//      opt.dropUnknown: leave records that open with neither key out of the restore (the backup file itself is untouched)
async function prepareRestore(d,raw,opt={}){const key=await importDEK(raw);const dkey=opt.decoyRaw?await importDEK(opt.decoyRaw):null;const V=d.vault;
 const meta={v:1,created:Date.now(),kdf:{iter:ckIter(V.kdf.iter),salt:ub(V.kdf.salt,16)},pw:{iv:ub(V.pw.iv,12),ct:ub(V.pw.ct)},rec:{iter:ckIter(V.rec.iter),salt:ub(V.rec.salt,16),iv:ub(V.rec.iv,12),ct:ub(V.rec.ct),id:isStr(V.rec.id)?V.rec.id.slice(0,8):''}};
 let decoy=d.decoy?{kdf:{iter:ckIter(d.decoy.kdf.iter),salt:ub(d.decoy.kdf.salt,16)},pw:{iv:ub(d.decoy.pw.iv,12),ct:ub(d.decoy.pw.ct)}}:null;
 const files=d.files||[];const ids=new Set(),items=[],fl=[],mainIds=[],mainFileIds=[];let bad=0,unknown=0,legacy=0,dropped=0,nI=0,nF=0;
 const tryJ=async(k,iv,ct)=>JSON.parse(td.decode(await dec(k,iv,ct)));
 const classify=async(mainOk,legacyOk)=>{if(mainOk)return 'main';if(!decoy)return 'bad';if(dkey)return (await legacyOk())?'legacy':'bad';return 'unknown';};
 for(const r of d.items){if(!isObj(r)||!isStr(r.id)||!r.id||ids.has('i'+r.id))throw Object.assign(new Error('format'),{code:'format'});ids.add('i'+r.id);
  const rec={id:r.id,iv:ub(r.iv,12),ct:ub(r.ct)};let o=null;try{o=await tryJ(key,rec.iv,rec.ct);}catch(e){}
  const v=await classify(o!==null&&validItem(o,r.id),async()=>{try{await dec(dkey,rec.iv,rec.ct);return true;}catch(e){return false;}});
  if(o!==null&&!validItem(o,r.id)){bad++;continue;}
  if(v==='bad'){bad++;continue;}if(v==='unknown'){unknown++;if(opt.dropUnknown){dropped++;continue;}}if(v==='legacy')legacy++;
  if(v==='main'){mainIds.push(r.id);if(o.type[0]!=='_')nI++;}items.push(rec);}
 for(const r of files){if(!isObj(r)||!isStr(r.id)||!r.id||ids.has('f'+r.id))throw Object.assign(new Error('format'),{code:'format'});ids.add('f'+r.id);
  const rec={id:r.id,miv:ub(r.miv,12),mct:ub(r.mct),tiv:r.tiv?ub(r.tiv,12):null,tct:r.tct?ub(r.tct):null};const blob={iv:ub(r.iv,12),ct:ub(r.ct)};
  let mainOk=false,metaBad=false;try{const m=await tryJ(key,rec.miv,rec.mct);if(!validFileMeta(m))metaBad=true;else{if(rec.tct)await dec(key,rec.tiv,rec.tct);await dec(key,blob.iv,blob.ct);mainOk=true;}}catch(e){}
  if(metaBad){bad++;continue;}
  const v=await classify(mainOk,async()=>{try{await dec(dkey,rec.miv,rec.mct);await dec(dkey,blob.iv,blob.ct);return true;}catch(e){return false;}});
  if(v==='bad'){bad++;continue;}if(v==='unknown'){unknown++;if(opt.dropUnknown){dropped++;continue;}}if(v==='legacy')legacy++;
  if(v==='main'){nF++;mainFileIds.push(r.id);}fl.push([rec,blob]);}
 if(bad)throw Object.assign(new Error('corrupt'),{code:'corrupt',bad});
 if(unknown&&!opt.dropUnknown)throw Object.assign(new Error('needdecoy'),{code:'needdecoy',n:unknown});
 if(!legacy)decoy=null; // nothing of the old decoy is kept → its wrap is not kept either
 return {meta,decoy,items,files:fl,mainIds,mainFileIds,stats:{items:nI,files:nF,legacy,dropped,created:d.created||'',recId:meta.rec.id}};}
async function commitRestore(P){await DB.run(STORES,'readwrite',t=>{const M=t.objectStore('meta'),I=t.objectStore('items'),F=t.objectStore('files'),B=t.objectStore('blobs');
  M.put(P.meta,'vault');M.delete('quick');M.delete('bio');if(P.decoy)M.put(P.decoy,'decoy');else M.delete('decoy');I.clear();F.clear();B.clear();
  P.items.forEach(r=>I.put(r,r.id));P.files.forEach(([r,b])=>{F.put(r,r.id);B.put(b,r.id);});});}
// read everything back from the database and decrypt it with the restored key
async function verifyRestore(P,raw){try{const key=await importDEK(raw);const sn=await snapshotAll();const I=new Map(sn.items),F=new Map(sn.files),B=new Map(sn.blobs);
 if(I.size!==P.items.length||F.size!==P.files.length||B.size!==P.files.length)return false;
 for(const id of P.mainIds){const r=I.get(id);if(!r)return false;const o=JSON.parse(td.decode(await dec(key,r.iv,r.ct)));if(o.id!==id)return false;}
 for(const id of P.mainFileIds){const r=F.get(id),b=B.get(id);if(!r||!b)return false;await dec(key,r.miv,r.mct);}
 return true;}catch(e){return false;}}
// ---- legacy decoy: move its content into the main vault (re-encrypted), then forget the decoy
async function migrateDecoyWith(pw){const raw=await unwrapDecoy(pw);const dk=await importDEK(raw);raw.fill(0);const s=sess();const sn=await snapshotAll();const blobs=new Map(sn.blobs);const items=[],files=[];
 for(const [k,r] of sn.items){let o;try{o=JSON.parse(td.decode(await dec(dk,r.iv,r.ct)));}catch(e){continue;}const e=await encWith(s.k,normItem(o));items.push([k,{id:k,iv:e.iv,ct:e.ct}]);}
 for(const [k,r] of sn.files){let m;try{m=JSON.parse(td.decode(await dec(dk,r.miv,r.mct)));}catch(e){continue;}const b=blobs.get(k);if(!b)continue;
  const em=await encWith(s.k,m);const eb=await enc(s.k,await dec(dk,b.iv,b.ct));const tt=r.tct?await enc(s.k,await dec(dk,r.tiv,r.tct)):null;
  files.push([k,{id:k,miv:em.iv,mct:em.ct,tiv:tt?tt.iv:null,tct:tt?tt.ct:null},{iv:eb.iv,ct:eb.ct}]);}
 s.check();await DB.run(['meta','items','files','blobs'],'readwrite',t=>{items.forEach(([k,v])=>t.objectStore('items').put(v,k));files.forEach(([k,fr,b])=>{t.objectStore('files').put(fr,k);t.objectStore('blobs').put(b,k);});t.objectStore('meta').delete('decoy');});
 bcast('data');return {items:items.length,files:files.length};}

/* ================= CSV import / export ================= */
function parseCSV(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],f='',q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}
 if(f!==''||row.length){row.push(f);rows.push(row);}return rows.filter(r=>r.some(x=>x.trim()!==''));}
function csvToLogins(text){const rows=parseCSV(text);if(rows.length<2)return [];const h=rows[0].map(x=>x.trim().toLowerCase());
 const col=(...names)=>{for(const n of names){const i=h.indexOf(n);if(i>=0)return i;}return -1;};
 const cT=col('name','title'),cU=col('url','login_uri','uri','website'),cN=col('username','login_username','login','email'),cP=col('password','login_password'),cX=col('note','notes','extra','comments');
 if(cP<0&&cN<0)return [];const out=[];
 for(const r of rows.slice(1)){const g=i=>i>=0&&r[i]!=null?r[i].trim():'';const pw=cP>=0&&r[cP]!=null?r[cP]:'';/* passwords are kept exactly — never trimmed */const un=g(cN),url=g(cU);if(!pw&&!un)continue;
  out.push({title:g(cT)||hostOf(url)||un||'—',url,username:un,password:pw,notes:g(cX)});}
 return out;}
async function importLogins(list){let n=0,s=0;const key=(u,n2,p)=>[hostOf(u),n2,p].join('\u0001');
 const have=new Set(live().filter(x=>x.type==='login').map(x=>key(x.f.url,x.f.username,x.f.password)));
 for(const l of list){const k=key(l.url,l.username,l.password);if(have.has(k)){s++;continue;}have.add(k);
  await saveItem({id:uid(),type:'login',title:l.title,fav:false,created:Date.now(),pwChanged:Date.now(),f:{username:l.username,password:l.password,url:l.url,notes:l.notes}});n++;}
 return {n,s};}
function loginsCSV(){const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';const L=live().filter(x=>x.type==='login');
 return {n:L.length,text:'name,url,username,password,note\n'+L.map(x=>[x.title,x.f.url,x.f.username,x.f.password,x.f.notes].map(q).join(',')).join('\n')};}

/* ================= passwords: generator, strength, leaks ================= */
function genPw(o){let L='abcdefghijklmnopqrstuvwxyz',U='ABCDEFGHIJKLMNOPQRSTUVWXYZ',D='0123456789',Y='!@#$%^&*()-_=+[]{};:,.?/~';
 if(o.ambig){L=L.replace(/[lo]/g,'');U=U.replace(/[IO]/g,'');D=D.replace(/[01]/g,'');}
 const sets=[];if(o.lower)sets.push(L);if(o.upper)sets.push(U);if(o.digits)sets.push(D);if(o.symbols)sets.push(Y);if(!sets.length)sets.push(L);
 const all=sets.join('');const out=sets.map(s=>s[randInt(s.length)]);while(out.length<o.len)out.push(all[randInt(all.length)]);
 for(let i=out.length-1;i>0;i--){const j=randInt(i+1);[out[i],out[j]]=[out[j],out[i]];}return out.slice(0,o.len).join('');}
const genOpts=()=>Object.assign({mode:'chars',len:20,lower:true,upper:true,digits:true,symbols:true,ambig:false,words:6,wlang:'en',sep:'-',cap:true,num:true},LS.get('genopt',{}));
function genPass(o){const L=WORDS[o.wlang]||WORDS.en;const w=[];for(let i=0;i<o.words;i++){let x=L[randInt(L.length)];if(o.cap&&o.wlang==='en')x=x[0].toUpperCase()+x.slice(1);w.push(x);}
 if(o.num){const i=randInt(w.length);w[i]=w[i]+randInt(10);}return w.join(o.sep===' '?' ':o.sep);}
function passBits(o){const L=WORDS[o.wlang]||WORDS.en;return Math.round(o.words*Math.log2(L.length)+(o.num?Math.log2(10*o.words):0));}
const genAny=(o=genOpts())=>o.mode==='words'?genPass(o):genPw(o);
const COMMON=['password','passw0rd','123456','12345','qwerty','abc123','111111','iloveyou','admin','welcome','monkey','dragon','letmein','football','000000','1q2w3e','zxcvbn','asdfgh','superman','sunshine','princess','shalom','israel','qazwsx','654321','123123','master','login'];
function strength(pw){if(!pw)return {s:0,bits:0};let pool=0;
 if(/[a-z]/.test(pw))pool+=26;if(/[A-Z]/.test(pw))pool+=26;if(/[0-9]/.test(pw))pool+=10;if(/[^a-zA-Z0-9\u0590-\u05FF]/.test(pw))pool+=33;if(/[\u0590-\u05FF]/.test(pw))pool+=27;
 let bits=[...pw].length*Math.log2(Math.max(pool,2));const low=pw.toLowerCase();
 const hit=COMMON.filter(c=>low.includes(c)).reduce((a,c)=>Math.max(a,c.length),0);if(hit)bits*=Math.max(.25,1-hit/pw.length);
 if(/(.)\1{2,}/.test(pw))bits*=.8;if(/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf)/i.test(pw))bits*=.8;
 if(new Set(pw).size<pw.length/2)bits*=.75;bits=Math.round(bits);
 return {bits,s:bits<28?0:bits<40?1:bits<60?2:bits<80?3:4};}
const STR_COL=['var(--bad)','var(--bad)','var(--warn)','var(--ok)','var(--ok)'];
async function pwnedCount(pw){const h=await crypto.subtle.digest('SHA-1',te.encode(pw));
 const hex=Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
 const ac=new AbortController();const to=setTimeout(()=>ac.abort(),12000);let r;
 let body;try{r=await fetch('https://api.pwnedpasswords.com/range/'+hex.slice(0,5),{referrerPolicy:'no-referrer',cache:'no-store',credentials:'omit',signal:ac.signal});
  if(!r.ok)throw new Error('http '+r.status);body=await r.text();}finally{clearTimeout(to);}const suf=hex.slice(5);
 for(const line of body.split('\n')){const [s,c]=line.trim().split(':');if(s===suf)return parseInt(c,10)||0;}return 0;}
async function hibpConsent(){if(LS.get('hibpOk',false))return true;const ok=await confirmDlg(T('breach_consent'),{title:T('breach_t')});if(ok)LS.set('hibpOk',true);return ok;}

/* ================= clipboard ================= */
let clipT=0,clipPending=false;
async function clipClear(){try{await navigator.clipboard.writeText('');clipPending=false;}catch(e){clipPending=true;}}
async function copyText(v){try{await navigator.clipboard.writeText(v);}catch(e){const ta=document.createElement('textarea');ta.value=v;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e2){}ta.remove();}
 toast(T('copied'));const s=LS.get('clip',30);clearTimeout(clipT);clipPending=false;
 if(s>0)clipT=setTimeout(()=>{if(document.hasFocus())clipClear();else clipPending=true;},s*1000);}

/* ================= storage persistence ================= */
async function persistStorage(){try{if(navigator.storage&&navigator.storage.persist){if(!(await navigator.storage.persisted()))await navigator.storage.persist();}}catch(e){}}

window.__MODS['app-core']='1.2.1';
