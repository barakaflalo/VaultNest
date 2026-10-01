/* app-features.js — VaultNest · 2FA, scanner, files, secure share, inbox, kit, calendar, Wi-Fi QR, history, templates
   Loaded by app-boot.js in a fixed order with ?v=<version>. Last line registers the module. */
'use strict';
/* ================= TOTP (RFC 6238) ================= */
function b32dec(s){const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';s=String(s).toUpperCase().replace(/[\s=-]/g,'');let bits=0,val=0;const out=[];
 for(const c of s){const i=A.indexOf(c);if(i<0)throw new Error('b32');val=((val<<5)|i)&0xffffff;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8;}}return new Uint8Array(out);}
function parseOtp(str){str=String(str||'').trim();if(!str)return null;
 try{if(/^otpauth-migration:/i.test(str))return {err:'migration'};
  if(/^otpauth:\/\//i.test(str)){const u=new URL(str);if(u.host.toLowerCase()!=='totp')return {err:'hotp'};const q=u.searchParams;const label=decodeURIComponent(u.pathname.replace(/^\//,''));
   const o={secret:(q.get('secret')||'').replace(/\s/g,''),digits:Number(q.get('digits')||6),period:Number(q.get('period')||30),algo:(q.get('algorithm')||'SHA1').toUpperCase().replace('-',''),issuer:q.get('issuer')||(label.includes(':')?label.split(':')[0]:''),label};
   if(!o.secret||b32dec(o.secret).length<5||![6,7,8].includes(o.digits)||!Number.isInteger(o.period)||o.period<10||o.period>300||!['SHA1','SHA256','SHA512'].includes(o.algo))return {err:'bad'};return o;}
  const o={secret:str.replace(/\s/g,''),digits:6,period:30,algo:'SHA1',issuer:'',label:''};if(b32dec(o.secret).length<5)return {err:'bad'};return o;}
 catch(e){return {err:'bad'};}}
async function totpCode(o,now=Date.now()){const alg={SHA1:'SHA-1',SHA256:'SHA-256',SHA512:'SHA-512'}[o.algo];if(!alg)throw new Error('algo');
 const key=await crypto.subtle.importKey('raw',b32dec(o.secret),{name:'HMAC',hash:alg},false,['sign']);let c=Math.floor(now/1000/o.period);
 const buf=new Uint8Array(8);for(let i=7;i>=0;i--){buf[i]=c&255;c=Math.floor(c/256);}const h=new Uint8Array(await crypto.subtle.sign('HMAC',key,buf));
 const off=h[h.length-1]&15;const bin=((h[off]&127)<<24)|(h[off+1]<<16)|(h[off+2]<<8)|h[off+3];return String(bin%(10**o.digits)).padStart(o.digits,'0');}
async function decodeQR(file){if(!('BarcodeDetector' in window))throw Object.assign(new Error('nodetector'),{code:'nodetector'});
 try{const fm=await BarcodeDetector.getSupportedFormats();if(!fm.includes('qr_code'))throw 0;}catch(e){throw Object.assign(new Error('nodetector'),{code:'nodetector'});}
 const bmp=await createImageBitmap(file);const r=await new BarcodeDetector({formats:['qr_code']}).detect(bmp);if(bmp.close)bmp.close();return r.length?r[0].rawValue:null;}

/* ================= document scanner: 4 corners → perspective → enhance ================= */
function homography(srcPts,dstPts){const A=[],b=[];for(let i=0;i<4;i++){const [x,y]=dstPts[i],[u,v]=srcPts[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);}
 for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];[b[c],b[p]]=[b[p],b[c]];
  for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<8;k++)A[r][k]-=f*A[c][k];b[r]-=f*b[c];}}return b.map((v,i)=>v/A[i][i]);}
function quadOk(q,W,H){const P=q.map(([x,y])=>[x*W,y*H]);let sign=0;
 for(let i=0;i<4;i++){const a=P[i],b=P[(i+1)%4],c=P[(i+2)%4];const cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);if(Math.abs(cr)<1e-6)return false;const sg=Math.sign(cr);if(sign&&sg!==sign)return false;sign=sg;}
 let area=0;for(let i=0;i<4;i++){const a=P[i],b=P[(i+1)%4];area+=a[0]*b[1]-b[0]*a[1];}return Math.abs(area)/2>W*H*0.02;}
function warpQuad(src,q){if(!quadOk(q,src.width,src.height))throw Object.assign(new Error('quad'),{code:'quad'});const W=src.width,H=src.height;const P=q.map(([x,y])=>[x*W,y*H]);const d=(a,c)=>Math.hypot(a[0]-c[0],a[1]-c[1]);
 let ow=Math.max(d(P[0],P[1]),d(P[3],P[2])),oh=Math.max(d(P[0],P[3]),d(P[1],P[2]));const k=Math.min(1,2000/Math.max(ow,oh));ow=Math.max(8,Math.round(ow*k));oh=Math.max(8,Math.round(oh*k));
 const h=homography(P,[[0,0],[ow,0],[ow,oh],[0,oh]]);if(!h.every(Number.isFinite))throw Object.assign(new Error('quad'),{code:'quad'});const sd=src.getContext('2d').getImageData(0,0,W,H).data;
 const out=document.createElement('canvas');out.width=ow;out.height=oh;const oc=out.getContext('2d');const od=oc.createImageData(ow,oh);const o=od.data;
 for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const den=h[6]*x+h[7]*y+1;let u=(h[0]*x+h[1]*y+h[2])/den,v=(h[3]*x+h[4]*y+h[5])/den;
  u=Math.min(W-1.001,Math.max(0,u));v=Math.min(H-1.001,Math.max(0,v));const x0=u|0,y0=v|0,fx=u-x0,fy=v-y0;const i00=(y0*W+x0)*4,i10=i00+4,i01=i00+W*4,i11=i01+4,di=(y*ow+x)*4;
  for(let ch=0;ch<3;ch++)o[di+ch]=(sd[i00+ch]*(1-fx)+sd[i10+ch]*fx)*(1-fy)+(sd[i01+ch]*(1-fx)+sd[i11+ch]*fx)*fy;o[di+3]=255;}
 oc.putImageData(od,0,0);return out;}
function enhance(cv,mode){const out=document.createElement('canvas');out.width=cv.width;out.height=cv.height;const c=out.getContext('2d');c.drawImage(cv,0,0);if(mode==='orig')return out;
 const id=c.getImageData(0,0,out.width,out.height),d=id.data;const hist=new Uint32Array(256);
 for(let i=0;i<d.length;i+=4){const g=(d[i]*299+d[i+1]*587+d[i+2]*114)/1000|0;d[i]=g;hist[g]++;}
 const tot=d.length/4;let lo=0,hi=255,acc=0;for(let i=0;i<256;i++){acc+=hist[i];if(acc>tot*.02){lo=i;break;}}acc=0;for(let i=255;i>=0;i--){acc+=hist[i];if(acc>tot*.08){hi=i;break;}}
 const span=Math.max(16,hi-lo);for(let i=0;i<d.length;i+=4){let v=(d[i]-lo)*255/span;if(mode==='doc')v=v>205?255:v<55?0:(v-55)*255/150;v=v<0?0:v>255?255:v;d[i]=d[i+1]=d[i+2]=v;}
 c.putImageData(id,0,0);return out;}
async function scanDoc(file){let bmp;try{bmp=await createImageBitmap(file);}catch(e){toast(T('file_fail'),'bad');return null;}
 let src=document.createElement('canvas');const sc=Math.min(1,2400/Math.max(bmp.width,bmp.height));src.width=Math.round(bmp.width*sc);src.height=Math.round(bmp.height*sc);
 src.getContext('2d').drawImage(bmp,0,0,src.width,src.height);if(bmp.close)bmp.close();
 let q=[[.06,.06],[.94,.06],[.94,.94],[.06,.94]],mode='doc',result=null;
 return modal(`<h3 class="mh">📄 ${T('scan_t')}</h3><div id="sc1"><p class="mlbl">${T('scan_hint')}</p><div class="scanbox"><canvas id="scv"></canvas><svg id="scs"></svg></div>
 <div class="mact"><button class="btn" data-a="rot" aria-label="${T('scan_rotate')}">↻ ${T('scan_rotate')}</button><button class="btn" data-a="full">${T('scan_full')}</button></div>
 <div class="mact"><button class="btn" data-a="x">${T('cancel')}</button><button class="btn pri" data-a="ok">${T('scan_crop')}</button></div></div>
 <div id="sc2" class="hide"><div class="seg" style="justify-content:center;margin-bottom:8px">${['doc','gray','orig'].map(m=>`<button data-m="${m}" aria-pressed="${m===mode}">${T('scan_'+m)}</button>`).join('')}</div>
 <div class="scanbox"><canvas id="scr"></canvas></div><div class="mact"><button class="btn" data-a="back">${T('back')}</button><button class="btn pri" data-a="save">${T('save')}</button></div></div>`,
 {sticky:true,onOpen:(s,close)=>{const cv=$('#scv',s),svg=$('#scs',s);let dw=0,dh=0,drag=-1;
  const draw=()=>{const box=cv.parentElement.clientWidth||320;const k=Math.min(box/src.width,(innerHeight*.55)/src.height);dw=Math.round(src.width*k);dh=Math.round(src.height*k);
   cv.width=dw;cv.height=dh;cv.style.width=dw+'px';cv.style.height=dh+'px';cv.getContext('2d').drawImage(src,0,0,dw,dh);
   svg.setAttribute('viewBox',`0 0 ${dw} ${dh}`);svg.style.width=dw+'px';svg.style.height=dh+'px';const pts=q.map(([x,y])=>[x*dw,y*dh]);
   svg.innerHTML=`<polygon points="${pts.map(p=>p.join(',')).join(' ')}"/>`+pts.map((p,i)=>`<circle class="h" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="13"/>`).join('');};
  const pt=e=>{const r=svg.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
  svg.addEventListener('pointerdown',e=>{const p=pt(e);let best=-1,bd=1e9;q.forEach(([x,y],i)=>{const dd=Math.hypot((x-p[0])*dw,(y-p[1])*dh);if(dd<bd){bd=dd;best=i;}});if(bd<60){drag=best;try{svg.setPointerCapture(e.pointerId);}catch(x){}e.preventDefault();}});
  svg.addEventListener('pointermove',e=>{if(drag<0)return;const p=pt(e);q[drag]=[Math.min(1,Math.max(0,p[0])),Math.min(1,Math.max(0,p[1]))];draw();});
  const up=()=>{drag=-1;};svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
  const showResult=()=>{const warped=warpQuad(src,q);result=enhance(warped,mode);const r=$('#scr',s);const box=r.parentElement.clientWidth||320;const k=Math.min(1,box/result.width,(innerHeight*.55)/result.height);
   r.width=result.width;r.height=result.height;r.style.width=Math.round(result.width*k)+'px';r.style.height=Math.round(result.height*k)+'px';r.getContext('2d').drawImage(result,0,0);s._warped=warped;};
  $('[data-a=rot]',s).onclick=()=>{const n=document.createElement('canvas');n.width=src.height;n.height=src.width;const c=n.getContext('2d');c.translate(n.width,0);c.rotate(Math.PI/2);c.drawImage(src,0,0);src=n;q=[[.06,.06],[.94,.06],[.94,.94],[.06,.94]];draw();};
  $('[data-a=full]',s).onclick=()=>{q=[[0,0],[1,0],[1,1],[0,1]];draw();};
  $('[data-a=x]',s).onclick=()=>close(null);
  const sv=$('[data-a=save]',s);
  const modes=()=>$$('[data-m]',s);
  $('[data-a=ok]',s).onclick=()=>{if(!quadOk(q,src.width,src.height)){toast(T('scan_badquad'),'bad');return;}sv.disabled=true;result=null;modes().forEach(b=>b.disabled=true);$('#sc1',s).classList.add('hide');$('#sc2',s).classList.remove('hide');
   setTimeout(()=>{try{showResult();sv.disabled=false;modes().forEach(b=>b.disabled=false);}catch(e){toast(T('scan_badquad'),'bad');$('#sc2',s).classList.add('hide');$('#sc1',s).classList.remove('hide');}},30);};
  $('[data-a=back]',s).onclick=()=>{$('#sc2',s).classList.add('hide');$('#sc1',s).classList.remove('hide');draw();};
  $$('[data-m]',s).forEach(b=>b.onclick=()=>{if(!s._warped)return;mode=b.dataset.m;$$('[data-m]',s).forEach(x=>x.setAttribute('aria-pressed',x===b));result=enhance(s._warped,mode);const r=$('#scr',s);r.getContext('2d').drawImage(result,0,0);});
  $('[data-a=save]',s).onclick=async()=>{if(!result)return;sv.disabled=true;const b=await new Promise(r=>result.toBlob(r,'image/jpeg',.86));if(!b||!b.size){toast(T('file_fail'),'bad');sv.disabled=false;return;}close(new File([b],'scan-'+ymd()+'-'+Date.now().toString(36).slice(-4)+'.jpg',{type:'image/jpeg'}));};
  requestAnimationFrame(draw);}});}

/* ================= adding files (shared by Files screen and item attachments) ================= */
const catFor=t=>({card:'money',bank:'money',identity:'id',wifi:'home'}[t]||'other');
async function addFilesFlow(inp,cat,itemId){const fl=await pickFile(inp);if(!fl.length)return 0;let n=0;const sid=S.sid;
 for(let i=0;i<fl.length;i++){if(sid!==S.sid||!S.unlocked)return n;const f=fl[i];const pr=$('#fprog');if(pr)pr.textContent=T('encrypting',{i:i+1,n:fl.length});
  if(f.size>100*1048576){toast(T('file_big',{n:f.name}),'bad');continue;}try{await addOneFile(f,cat,itemId);n++;}catch(e){toast(T('err_generic',{e:e.message}),'bad');}}
 const pr=$('#fprog');if(pr)pr.textContent='';if(n)toast(T('files_added',{n}));return n;}
async function scanFlow(cat,itemId){const [f]=await pickFile($('#fcam'));if(!f)return 0;const out=await scanDoc(f);if(!out)return 0;await addOneFile(out,cat,itemId);toast(T('scan_saved'));return 1;}
async function origNoteOnce(){if(!LS.get('origNote',false)){LS.set('origNote',true);await confirmDlg(T('orig_note'),{ok:T('confirm'),no:T('close')});}}

/* ================= secure single-item sharing ================= */
const SHARE_ITER=200000;
function isShareFile(txt){try{const d=JSON.parse(txt);return !!d&&d.app==='VaultNest'&&d.kind==='share';}catch(e){return false;}}
function genShareCode(){const b=rand(12);let s='';for(let i=0;i<12;i++){s+=REC_ABC[b[i]&31];if(i%4===3&&i<11)s+='-';}return s;}
async function shareItem(it){const def=TYPES[it.type]||TYPES.note;
 // choose exactly what leaves the vault (2FA key off by default)
 const opts=[];def.f.forEach(([k])=>{if(it.f[k])opts.push({id:'f:'+k,label:T('f_'+k),on:k!=='totp'});});
 (it.cf||[]).forEach((c,i)=>{if(c.v)opts.push({id:'c:'+i,label:c.n||'—',on:true});});
 attachments(it.id).forEach(f=>opts.push({id:'a:'+f.id,label:'📎 '+f.name+' · '+fmtSize(f.size),on:f.size<=25*1048576}));
 const pick=await modal(`<h3 class="mh">↗ ${T('sh_t')}</h3><p class="mtext">${T('sh_intro')}</p><label class="lbl">${T('sh_pick')}</label>
 ${opts.map(o=>`<label class="chk"><input type="checkbox" value="${esc(o.id)}" ${o.on?'checked':''}> ${esc(o.label)}</label>`).join('')}${opts.length?'':`<p class="mlbl">—</p>`}
 <div class="mact"><button class="btn" data-v="0">${T('cancel')}</button><button class="btn pri" data-v="1">${T('continue')}</button></div>`,
 {sticky:true,onOpen:(s,close)=>{$('[data-v="0"]',s).onclick=()=>close(null);$('[data-v="1"]',s).onclick=()=>close(new Set($$('input:checked',s).map(x=>x.value)));}});
 if(!pick)return;const f={};Object.keys(it.f||{}).forEach(k=>{if(pick.has('f:'+k))f[k]=it.f[k];});const cf=(it.cf||[]).filter((c,i)=>pick.has('c:'+i));
 const files=[];let total=0;for(const a of attachments(it.id)){if(!pick.has('a:'+a.id))continue;if(total+a.size>25*1048576)continue;const bl=await fileBlob(a);total+=a.size;files.push({name:a.name,type:a.type,cat:a.cat,data:b64(await bl.arrayBuffer())});}
 const payload={item:{type:it.type,title:it.title,f,cf,ic:it.ic||'',tplName:it.tplName||''},files,from:LS.get('user',''),t:Date.now()};
 const code=genShareCode(),salt=rand(16);const e=await enc(await kdf(normRec(code),salt,SHARE_ITER),te.encode(JSON.stringify(payload)));
 const file=new File([JSON.stringify({app:'VaultNest',kind:'share',format:1,salt:b64(salt),iter:SHARE_ITER,iv:b64(e.iv),ct:b64(e.ct)})],`vaultnest-share-${ymd()}-${Date.now().toString(36).slice(-4)}.json`,{type:'application/json'});
 await modal(`<h3 class="mh">↗ ${T('sh_t')}</h3><p class="mtext">${T('sh_code_is')}</p><div class="reccode">${esc(code)}</div>
 <p class="mlbl">${T('sh_how')}</p><div class="stack" style="margin-top:10px"><button class="btn pri" data-v="f">↗ ${T('sh_send_file')}</button><button class="btn" data-v="c">⧉ ${T('sh_copy_code')}</button><button class="btn" data-v="x">${T('done')}</button></div>`,
 {sticky:true,onOpen:(s,close)=>{$('[data-v=f]',s).onclick=()=>shareOrSave(file);$('[data-v=c]',s).onclick=()=>copyText(code);$('[data-v=x]',s).onclick=()=>close();}});}
async function importShare(txt){let d;try{d=JSON.parse(txt);ub(d.salt,16);ub(d.iv,12);ub(d.ct);ckIter(d.iter);}catch(e){toast(T('sh_bad'),'bad');return false;}let payload=null;
 for(;;){const c=await promptDlg(T('sh_code_prompt'),{text:T('sh_code_text'),mono:true,ltr:true,ph:'XXXX-XXXX-XXXX'});if(c==null)return false;
  try{payload=JSON.parse(td.decode(await dec(await kdf(normRec(c),unb64(d.salt),d.iter),unb64(d.iv),unb64(d.ct))));break;}catch(e){toast(T('sh_wrong'),'bad');}}
 // validate the decrypted content (a valid code does not make the content trustworthy)
 const p=payload&&payload.item;const files=Array.isArray(payload&&payload.files)?payload.files:null;
 const okF=isObj(p&&p.f)&&Object.values(p.f).every(isStr);const okCf=p&&(p.cf==null||(Array.isArray(p.cf)&&p.cf.every(c=>isObj(c)&&isStr(c.n)&&isStr(c.v))));
 if(!isObj(p)||!isStr(p.title)||!isStr(p.type)||!okF||!okCf||!files||files.length>30){toast(T('sh_bad'),'bad');return false;}
 let total=0;for(const f of files){if(!isObj(f)||!isStr(f.name)||!isStr(f.data)||!B64RE.test(f.data)||(f.type!=null&&!isStr(f.type))){toast(T('sh_bad'),'bad');return false;}total+=f.data.length*.75;}
 if(total>30*1048576){toast(T('sh_bad'),'bad');return false;}
 const known=TYPES[p.type]&&p.type[0]!=='_';const fields={};Object.entries(p.f).forEach(([k,v])=>{fields[String(k).slice(0,40)]=v.slice(0,20000);});
 if(!(await confirmDlg(T('sh_confirm',{n:p.title,f:files.length}),{title:T('sh_recv_t'),ok:T('save')})))return false;
 const s=sess();
 const it={id:uid(),type:known?p.type:'note',title:p.title.slice(0,200),fav:false,created:Date.now(),updated:Date.now(),pwChanged:Date.now(),f:fields,cf:(p.cf||[]).map(c=>({n:c.n.slice(0,100),v:c.v.slice(0,20000),s:!!c.s})),ic:isStr(p.ic)?p.ic.slice(0,8):'',tplName:isStr(p.tplName)?p.tplName.slice(0,100):''};
 // encrypt everything with ONE captured key, then write the item + all files in ONE transaction
 const recs=[];for(const f of files){recs.push(await encFileRec(s.k,new File([unb64(f.data)],f.name.slice(0,200),{type:f.type||'application/octet-stream'}),FCATS.includes(f.cat)?f.cat:'other',it.id));s.check();}
 const ie=await encWith(s.k,it);
 try{s.check();await DB.run(['items','files','blobs'],'readwrite',t=>{t.objectStore('items').put({id:it.id,iv:ie.iv,ct:ie.ct},it.id);recs.forEach(x=>{t.objectStore('blobs').put(x.blob,x.id);t.objectStore('files').put(x.rec,x.id);});});}
 catch(e){toast(e.code==='stale'?T('op_stale'):T('save_fail',{e:e.message}),'bad');return false;}
 S.items.push(it);recs.forEach(x=>S.files.push(x.meta));bcast('data');toast(T('sh_saved'));go('item',{id:it.id});return true;}
async function receiveShareFlow(){const [f]=await pickFile($('#fbak'));if(!f)return;const txt=await f.text();if(isShareFile(txt))await importShare(txt);else toast(T('sh_bad'),'bad');}

/* ================= "Share to VaultNest" — encrypted inbox (1.2.0) =================
   sw.js encrypts each share on arrival with the vault's public key. Here (vault unlocked) we decrypt, let the user
   decide, save it encrypted in the vault, and only THEN delete the inbox entry. "Later" keeps it. */
async function handleInbox(auto){if(!S.unlocked||!S.inboxPriv||S.inboxBusy)return;S.inboxBusy=true;
 try{let list;try{list=await inboxEntries();}catch(e){return;}const sid=S.sid;const stuck=[];
  for(const url of list){if(sid!==S.sid||!S.unlocked)return;let sh;
   try{sh=await inboxRead(url);}catch(e){stuck.push({url,code:e.code||'bad'});continue;}
   const r=await inboxOne(sh);if(sid!==S.sid||!S.unlocked)return;if(r==='done')await inboxDelete(url);else if(r==='stop')break;}
  // shares that cannot be opened are KEPT unless the user explicitly deletes them
  if(stuck.length&&!auto){const nk=stuck.filter(x=>x.code==='nokey').length,br=stuck.length-nk;
   const r=await modal(`<h3 class="mh">📥 ${T('in_t')}</h3><p class="mtext">${[nk?T('in_stuck_nokey',{n:nk}):'',br?T('in_stuck_bad',{n:br}):''].filter(Boolean).join('\n\n')}</p>
    <div class="stack"><button class="btn pri" data-v="keep">${T('in_keep')}</button><button class="btn danger" data-v="del">${T('in_delete_stuck',{n:stuck.length})}</button></div>`,{sticky:true,onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v))});
   if(r==='del'&&await confirmDlg(T('in_delete_stuck_c'),{danger:true,ok:T('delete')}))for(const x of stuck)await inboxDelete(x.url);}
  await refreshInboxCounts();}
 finally{S.inboxBusy=false;if(S.unlocked)rerender();}}
async function refreshInboxCounts(){let ok=0,st=0;try{for(const u of await inboxEntries()){try{await inboxRead(u);ok++;}catch(e){st++;}}}catch(e){}S.inboxCount=ok;S.inboxStuck=st;}
async function inboxOne({meta,files}){
 if(files.length===1&&/json/i.test(files[0].type+files[0].name)){const txt=await files[0].text();if(isShareFile(txt))return (await importShare(txt))?'done':'later';}
 if(files.length){const items=sortItems(live().slice());
  const r=await modal(`<h3 class="mh">📥 ${T('in_files_t',{n:files.length})}</h3><p class="mtext">${files.map(f=>esc(f.name)+' · '+fmtSize(f.size)).join('\n')}</p>${meta.skipped?`<p class="mlbl" style="color:var(--warn)">${T('in_skipped',{n:meta.skipped})}</p>`:''}
   <label class="lbl" for="inc">${T('file_cat')}</label><select id="inc" class="inp">${FCATS.map(c=>`<option value="${c}">${T('fc_'+c)}</option>`).join('')}</select>
   <label class="lbl" for="ini">${T('in_attach')}</label><select id="ini" class="inp"><option value="">${T('in_attach_none')}</option>${items.map(it=>`<option value="${esc(it.id)}">${esc(icOf(it)+' '+it.title)}</option>`).join('')}</select>
   <div class="stack" style="margin-top:14px"><button class="btn pri" data-v="save">🔒 ${T('in_save')}</button><button class="btn" data-v="later">${T('in_later')}</button><button class="btn danger" data-v="del">${T('in_discard')}</button></div>`,
   {sticky:true,onOpen:(s,close)=>{$$('[data-v]',s).forEach(b=>b.onclick=()=>close({v:b.dataset.v,cat:$('#inc',s).value,item:$('#ini',s).value}));}});
  if(!r||r.v==='later')return 'stop';
  if(r.v==='del')return (await confirmDlg(T('in_discard_c'),{danger:true,ok:T('in_discard')}))?'done':'later';
  try{const n=(await addFilesAtomic(files.filter(f=>f.size<=100*1048576),r.cat,r.item)).length;toast(T('files_added',{n}));toast(T('in_orig'));}catch(e){toast(T('save_fail',{e:e.message}),'bad');return 'later';}
  return 'done';}
 const txt=[meta.url,meta.text,meta.title].filter(Boolean).join(' ');const um=/(https?:\/\/[^\s]+)/i.exec(txt)||/\b([a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})\b/i.exec(txt);
 const url=um?um[1]:'';const host=hostOf(url);const same=h=>h&&host&&(h===host||h.endsWith('.'+host)||host.endsWith('.'+h));
 const matches=host?sortItems(live().filter(it=>it.f&&same(hostOf(it.f.url)))):[];
 const r=await modal(`<h3 class="mh">🔎 ${esc(host||T('in_text_t'))}</h3>${host?`<p class="mlbl">${matches.length?T('in_found',{n:matches.length}):T('in_no_match')}</p><div id="stm">${itemRows(matches)}</div>`:`<p class="mtext">${esc(txt.slice(0,300))}</p>`}
  <div class="stack" style="margin-top:10px">${host?`<button class="btn pri" data-v="new">＋ ${T('in_new_login')}</button>`:''}<button class="btn" data-v="note">📝 ${T('in_as_note')}</button><button class="btn" data-v="done">${T('done')}</button><button class="link" data-v="later">${T('in_later')}</button></div>`,
  {sticky:true,onOpen:(s,close)=>{$$('.row[data-id]',s).forEach(b=>b.onclick=()=>close('id:'+b.dataset.id));$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v));}});
 if(!r||r==='later')return 'stop';
 if(r.startsWith('id:')){go('item',{id:r.slice(3)});return 'done';}
 if(r==='new'){const it=await editItem({type:'login',pre:{title:host,f:{url}}});if(!it||!it.id)return 'later';go('item',{id:it.id});return 'done';}
 if(r==='note'){const it=await editItem({type:'note',pre:{title:meta.title||host||T('in_text_t'),f:{notes:txt}}});if(!it||!it.id)return 'later';go('item',{id:it.id});return 'done';}
 return 'done';}

/* ================= emergency kit (print) ================= */
function kitHTML(code,recId){const addr=location.origin+location.pathname.replace(/index\.html$/,'');const user=LS.get('user','');
 const box=code?`<div class="k-code">${esc(code)}</div>${recId?`<p>${esc(T('kit_recid',{id:recId}))}</p>`:''}`:`<div class="k-code k-blank">____-____-____-____-____-____</div>`;
 return `<div class="k-wrap" dir="${document.documentElement.dir}"><h1>VaultNest — ${T('kit_t')}</h1><p>${user?esc(user)+' · ':''}${fmtDate(Date.now())}</p>
 <h2>${T('kit_addr')}</h2><p class="k-mono">${esc(addr)}</p><h2>${T('rec_t')}</h2>${box}<p>${T('kit_code_note')}</p>
 <p>${code&&recId?T('kit_match',{id:recId}):''}</p><h2>${T('kit_backup_where')}</h2><div class="k-line"></div><h2>${T('kit_steps_t')}</h2><ol>${[1,2,3,4].map(i=>`<li>${T('kit_s'+i)}</li>`).join('')}</ol>
 <p class="k-warn">${T('kit_warn')}</p><p class="k-foot">AppNest · VaultNest ${APP_VERSION}</p></div>`;}
async function emergencyKit(){const r=await modal(`<h3 class="mh">🧰 ${T('kit_t')}</h3><p class="mtext">${T('kit_d')}</p><div class="stack"><button class="btn pri" data-v="new">${T('kit_new')}</button><button class="btn" data-v="blank">${T('kit_blank')}</button><button class="link" data-v="0">${T('cancel')}</button></div><p class="mlbl">${T('kit_new_note')}</p>`,
 {onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v))});if(!r||r==='0')return;
 let code='';if(r==='new'){if(!(await confirmDlg(T('new_rec_c'))))return;code=await newRecovery();}
 const vm=await DB.get('meta','vault');const k=$('#printkit');k.innerHTML=kitHTML(code,code&&vm&&vm.rec?vm.rec.id:'');await hold(async()=>{window.print();await sleep(500);});
 if(code)await modal(`<h3 class="mh">${T('rec_t')}</h3><p class="mtext">${T('kit_after')}</p><div class="reccode">${esc(code)}</div><label class="chk"><input type="checkbox" id="kk"> ${T('rec_check')}</label><div class="mact"><button class="btn pri" id="kd" disabled>${T('done')}</button></div>`,
  {sticky:true,onOpen:(s,close)=>{$('#kk',s).onchange=e=>{$('#kd',s).disabled=!e.target.checked;};$('#kd',s).onclick=()=>close();}});
 k.innerHTML='';if(code)await mustBackupAfterKeys();}
// After a new recovery code or master password, old backups still open only with the OLD code/password.
async function mustBackupAfterKeys(){await confirmDlg(T('keys_backup_now'),{title:T('b_export'),ok:T('b_export'),no:T('later')})&&await backupDlg();}
window.addEventListener('afterprint',()=>{setTimeout(()=>{const k=$('#printkit');if(k&&!$('#modals').children.length)k.innerHTML='';},800);});

/* ================= calendar reminder for expiry ================= */
function expDate(it){let d=null;if(it.type==='card'&&it.f.expiry){const m=/^(\d{1,2})\s*\/\s*(\d{2,4})$/.exec(it.f.expiry.trim());if(m&&+m[1]>=1&&+m[1]<=12){let y=+m[2];if(y<100)y+=2000;d=new Date(y,+m[1],0);}}
 if(it.type==='identity'&&it.f.docExpiry)d=new Date(it.f.docExpiry+'T00:00');return d&&!isNaN(d)?d:null;}
const ymdc=d=>ymd(d).replace(/-/g,'');
async function calendarDlg(it){const exp=expDate(it);if(!exp)return;let ev=new Date(exp.getTime()-30*864e5);const tm=new Date();tm.setDate(tm.getDate()+1);tm.setHours(0,0,0,0);if(ev<tm)ev=tm;
 const ev2=new Date(ev.getTime()+864e5);const details=T('cal_details');const soon=ev.getTime()===tm.getTime();
 const defTitle=T(it.type==='card'?'cal_title_card':'cal_title_doc',{d:fmtDate(exp)});let title=defTitle;
 const gURL=()=>'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(title)+'&dates='+ymdc(ev)+'/'+ymdc(ev2)+'&details='+encodeURIComponent(details);
 const icsTxt=s=>String(s).replace(/([\\;,])/g,'\\$1').replace(/\n/g,'\\n');
 const icsOf=()=>['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AppNest//VaultNest//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+uid()+'@vaultnest','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,''),
  'DTSTART;VALUE=DATE:'+ymdc(ev),'DTEND;VALUE=DATE:'+ymdc(ev2),'SUMMARY:'+icsTxt(title),'DESCRIPTION:'+icsTxt(details),'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsTxt(title),'TRIGGER:PT9H','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
 await modal(`<h3 class="mh">📅 ${T('cal_t')}</h3><label class="lbl" for="calt">${T('cal_title_lbl')}</label><input id="calt" class="inp" value="${esc(defTitle)}" autocomplete="off"><p class="mlbl">${soon?T('cal_when_soon',{d:fmtDate(ev)}):T('cal_when',{d:fmtDate(ev)})}</p><p class="mlbl" style="color:var(--warn)">${T('cal_privacy')}</p>
 <div class="stack" style="margin-top:10px"><button class="btn pri" data-v="g">${T('cal_google')}</button><button class="btn" data-v="i">${T('cal_ics')}</button><button class="btn" data-v="x">${T('close')}</button></div>`,
 {onOpen:(s,close)=>{const rd=()=>{title=$('#calt',s).value.trim()||defTitle;};$('[data-v=g]',s).onclick=()=>{rd();const g=gURL();hold(async()=>{window.open(g,'_blank','noopener,noreferrer');});close();};
  $('[data-v=i]',s).onclick=async()=>{rd();await shareOrSave(new File([icsOf()],'vaultnest-reminder.ics',{type:'text/calendar'}));close();};$('[data-v=x]',s).onclick=()=>close();}});}

/* ================= Wi-Fi QR ================= */
function qrSVG(text){qrcode.stringToBytes=qrcode.stringToBytesFuncs['UTF-8'];const qr=qrcode(0,'M');qr.addData(text,'Byte');qr.make();const n=qr.getModuleCount();let p='';
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))p+=`M${c+4} ${r+4}h1v1h-1z`;
 return `<svg class="qr" viewBox="0 0 ${n+8} ${n+8}" role="img" aria-label="QR" shape-rendering="crispEdges"><rect width="${n+8}" height="${n+8}" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;}
function wifiQR(it){const e=s=>String(s||'').replace(/([\\;,:"])/g,'\\$1');const sec=it.f.security||'WPA2/WPA3';const t=sec==='none'?'nopass':sec==='WEP'?'WEP':'WPA';
 const str=`WIFI:T:${t};S:${e(it.f.ssid||it.title)};${t==='nopass'?'':'P:'+e(it.f.password)+';'};`;
 return modal(`<h3 class="mh">📱 ${esc(it.f.ssid||it.title)}</h3><p class="mlbl">${T('wifi_qr_d')}</p><div style="max-width:300px;margin:12px auto">${qrSVG(str)}</div><div class="mact"><button class="btn pri" data-v>${T('close')}</button></div>`,
 {onOpen:(s,close)=>{$('[data-v]',s).onclick=()=>close();}});}

/* ================= password history ================= */
const HIST_KEYS=['password','code','cardPin','totp'];
function pushHistory(oldIt,newF){const h=(oldIt.hist||[]).slice();const now=Date.now();
 HIST_KEYS.forEach(k=>{const o=oldIt.f&&oldIt.f[k];if(o&&o!==newF[k])h.unshift({k,v:o,t:now});});return h.slice(0,15);}
function histDlg(it){const h=it.hist||[];
 return modal(`<h3 class="mh">🕘 ${T('hist_t')}</h3><p class="mlbl">${T('hist_d')}</p>${h.map((x,i)=>`<div class="fld"><label>${T('f_'+x.k)} · ${fmtDate(x.t)}</label><div class="fline"><div class="fv mono" dir="ltr" data-h="${i}">••••••••</div><button class="fa" data-hs="${i}" aria-label="${T('show')}">👁</button><button class="fa" data-hc="${i}" aria-label="${T('copy')}">⧉</button></div></div>`).join('')}
 <div class="mact"><button class="btn" data-a="clr">${T('hist_clear')}</button><button class="btn pri" data-a="x">${T('close')}</button></div>`,
 {onOpen:(s,close)=>{$$('[data-hs]',s).forEach(b=>b.onclick=()=>{const el=$(`[data-h="${b.dataset.hs}"]`,s);const on=el.textContent==='••••••••';el.textContent=on?h[+b.dataset.hs].v:'••••••••';b.textContent=on?'🙈':'👁';});
  $$('[data-hc]',s).forEach(b=>b.onclick=()=>copyText(h[+b.dataset.hc].v));$('[data-a=x]',s).onclick=()=>close();
  $('[data-a=clr]',s).onclick=async()=>{if(!(await confirmDlg(T('hist_clear_c'),{danger:true,ok:T('delete')})))return;it.hist=[];await saveItem(it);close('cleared');};}});}

/* ================= custom field rows (items and templates) ================= */
function cfEditor(host,list,withValue){const sync=()=>{list.splice(0,list.length,...$$('.cfrow',host).map(r=>({n:$('.cfn',r).value,v:withValue?$('.cfv',r).value:'',s:$('.cfs',r).checked})));};
 const draw=()=>{host.innerHTML=list.map((c,i)=>`<div class="cfrow"><input class="inp cfn" placeholder="${T('cf_label')}" value="${esc(c.n)}" autocomplete="off" aria-label="${T('cf_label')}">
  ${withValue?`<input class="inp cfv ${c.s?'mono':''}" type="${c.s?'password':'text'}" placeholder="${T('cf_value')}" value="${esc(c.v)}" autocomplete="off" spellcheck="false" aria-label="${T('cf_value')}" ${c.s?'dir="ltr"':''}>`:''}
  <div class="cfbar"><label class="chk" style="padding:4px 0"><input type="checkbox" class="cfs" ${c.s?'checked':''}> 🔒 ${T('cf_secret')}</label><button type="button" class="fa" data-rm="${i}" aria-label="${T('delete')}">✕</button></div></div>`).join('')+
  `<button type="button" class="btn sm" data-add>＋ ${T('cf_add')}</button>`;
  $$('[data-rm]',host).forEach(b=>b.onclick=()=>{sync();list.splice(+b.dataset.rm,1);draw();});$('[data-add]',host).onclick=()=>{sync();list.push({n:'',v:'',s:false});draw();$$('.cfn',host).pop().focus();};
  $$('.cfs',host).forEach(c=>c.onchange=()=>{sync();draw();});};draw();return sync;}
async function tplEditor(tpl){const isNew=!tpl;const t=tpl?JSON.parse(JSON.stringify(tpl)):{id:uid(),type:'_tpl',title:'',ic:'🧩',fav:false,created:Date.now(),f:{},fields:[{n:'',v:'',s:false}]};
 const ICONS=['🧩','🚗','🏠','🛡️','📺','🏥','🎓','💼','🔐','📱','🎟️','🐾','✈️','⚡','🏋️','🎮'];let sync;
 const r=await modal(`<h3 class="mh">${isNew?T('tpl_new'):T('tpl_edit')}</h3><label class="lbl" for="tn">${T('tpl_name')}</label><input id="tn" class="inp" value="${esc(t.title)}" placeholder="${T('tpl_name_ph')}" autocomplete="off" ${isNew?'autofocus':''}>
 <label class="lbl">${T('tpl_icon')}</label><div class="seg">${ICONS.map(ic=>`<button type="button" data-ic="${ic}" aria-pressed="${ic===t.ic}">${ic}</button>`).join('')}</div>
 <label class="lbl">${T('tpl_fields')}</label><div id="tf"></div><div class="err" id="terr"></div>
 <div class="mact"><button class="btn" data-a="x">${T('cancel')}</button><button class="btn pri" data-a="s">${T('save')}</button></div>${isNew?'':`<button class="btn danger wide" data-a="d" style="margin-top:14px">🗑️ ${T('delete')}</button>`}`,
 {sticky:true,onOpen:(s,close)=>{sync=cfEditor($('#tf',s),t.fields,false);$$('[data-ic]',s).forEach(b=>b.onclick=()=>{t.ic=b.dataset.ic;$$('[data-ic]',s).forEach(x=>x.setAttribute('aria-pressed',x===b));});
  $('[data-a=x]',s).onclick=()=>close(null);
  $('[data-a=s]',s).onclick=async()=>{sync();t.title=$('#tn',s).value.trim();t.fields=t.fields.filter(f=>f.n.trim()).map(f=>({n:f.n.trim(),s:!!f.s}));
   if(!t.title){$('#terr',s).textContent=T('need_title');return;}await saveItem(t);toast(T('saved'));close('saved');};
  const d=$('[data-a=d]',s);if(d)d.onclick=async()=>{if(!(await confirmDlg(T('tpl_del_c',{n:t.title}),{danger:true,ok:T('delete')})))return;await killItem(t.id);close('deleted');};}});return r;}
async function templatesDlg(){for(;;){const L=templates();const r=await modal(`<h3 class="mh">🧩 ${T('tpl_t')}</h3><p class="mlbl">${T('tpl_d')}</p><div class="stack" style="margin-top:10px">
 ${L.map(t=>`<button class="row" data-v="${esc(t.id)}"><span class="ic">${esc(t.ic)}</span><span class="rt"><b>${esc(t.title)}</b><small>${esc((t.fields||[]).map(f=>f.n).join(', '))}</small></span></button>`).join('')}
 <button class="btn pri" data-v="new">＋ ${T('tpl_new')}</button><button class="btn" data-v="0">${T('close')}</button></div>`,{onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v))});
 if(!r||r==='0')return;await tplEditor(r==='new'?null:S.items.find(x=>x.id===r));}}

/* ================= legacy decoy (feature removed in 1.1.1) ================= */
async function legacyDecoyDlg(){const ch=await menuDlg(T('dcl_t'),[['move','📦',T('dcl_move')],['del','🗑️',T('dcl_del')]]);if(!ch)return;
 const pw=await promptDlg(T('dcl_pw'),{type:'password',text:ch==='move'?T('dcl_move_d'):T('dcl_d')});if(pw==null)return;
 if(ch==='del'&&!(await confirmDlg(T('dcl_del_c'),{danger:true,ok:T('delete')})))return;
 let r;try{r=ch==='move'?await migrateDecoyWith(pw):await removeDecoyWith(pw);}catch(e){toast(e.code==='stale'?T('op_stale'):T('wrong_pw'),'bad');return;}
 toast(T(ch==='move'?'dcl_moved':'dcl_done',{i:r.items,f:r.files}));await loadAll();rerender();}

/* ================= small menus / attach an existing file ================= */
function menuDlg(title,opts){return modal(`<h3 class="mh">${esc(title)}</h3><div class="stack">${opts.map(([v,ic,l])=>`<button class="row" data-v="${v}"><span class="ic">${ic}</span><span class="rt"><b>${esc(l)}</b></span></button>`).join('')}<button class="btn" data-v="">${T('cancel')}</button></div>`,
 {onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v||null))});}
async function attachExisting(it){const free=liveFiles().filter(f=>f.itemId!==it.id).sort((a,b)=>b.created-a.created);
 if(!free.length){toast(T('att_none_free'));return false;}
 const r=await modal(`<h3 class="mh">🔗 ${T('att_existing')}</h3><p class="mlbl">${T('att_existing_d')}</p><div class="stack" style="margin-top:8px">${free.map(f=>`<label class="chk"><input type="checkbox" value="${esc(f.id)}"> ${ficon(f.type)} ${esc(f.name)}${f.itemId?' 🔗':''}</label>`).join('')}</div>
 <div class="mact"><button class="btn" data-v="0">${T('cancel')}</button><button class="btn pri" data-v="1">${T('att_do')}</button></div>`,
 {sticky:true,onOpen:(s,close)=>{$('[data-v="0"]',s).onclick=()=>close(null);$('[data-v="1"]',s).onclick=()=>close($$('input:checked',s).map(x=>x.value));}});
 if(!r||!r.length)return false;let n=0;for(const id of r){const f=S.files.find(x=>x.id===id);if(!f)continue;const old=f.itemId;f.itemId=it.id;try{await saveFileMeta(f);n++;}catch(e){f.itemId=old;}}
 toast(T('att_done',{n}));return n>0;}

window.__MODS['app-features']='1.2.1';
