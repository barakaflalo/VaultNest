/* app-views.js — VaultNest · item types, navigation, all screens, boot()
   Loaded by app-boot.js in a fixed order with ?v=<version>. Last line registers the module. */
'use strict';
/* ================= item types ================= */
const TYPES={
 login:{ic:'🔑',f:[['username','text'],['password','secret',{gen:1,pw:1}],['url','url'],['totp','totp'],['notes','area']]},
 card:{ic:'💳',f:[['cardholder','text'],['number','secret',{num:1,card:1}],['expiry','text',{ph:'MM/YY',exp:1}],['cvv','secret',{num:1}],['cardPin','secret',{num:1}],['issuer','text'],['notes','area']]},
 code:{ic:'🔢',f:[['code','secret'],['notes','area']]},
 wifi:{ic:'📶',f:[['ssid','text'],['password','secret',{gen:1,pw:1}],['security','select',{opts:['WPA2/WPA3','WPA','WEP','none']}],['notes','area']]},
 bank:{ic:'🏦',f:[['bankName','text'],['branch','text'],['account','secret'],['username','text'],['password','secret',{gen:1,pw:1}],['url','url'],['notes','area']]},
 identity:{ic:'🪪',f:[['docType','text'],['fullName','text'],['docNumber','secret'],['issued','date'],['docExpiry','date'],['notes','area']]},
 note:{ic:'📝',f:[['notes','area',{hidden:1}]]},
 custom:{ic:'🧩',f:[['notes','area']]}};
const icOf=it=>(it.type==='custom'&&it.ic)||(TYPES[it.type]||TYPES.note).ic;
const TYPE_ORDER=['login','card','code','wifi','bank','identity','note'];
const FCATS=['id','money','home','car','health','other'];
const THEMES=[['gold','#000','#C9A24A'],['silver','#000','#C3CAD3'],['copper','#0A1523','#D38C4F'],['jade','#071A12','#63C79C'],['ruby','#19060B','#E3B27C']];
const grp4=v=>String(v||'').replace(/\s+/g,'').replace(/(.{4})(?=.)/g,'$1 ');
const ficon=t=>/^image\//.test(t)?'🖼️':/pdf/.test(t)?'📄':/^video\//.test(t)?'🎞️':/^audio\//.test(t)?'🎵':'📎';
function subtitle(it){const f=it.f||{};switch(it.type){
 case 'login':return f.username||hostOf(f.url)||(f.totp?'2FA':'');case 'card':return (f.number?'•••• '+String(f.number).replace(/\s/g,'').slice(-4):'')+(f.expiry?'  '+f.expiry:'');
 case 'wifi':return f.ssid||'';case 'bank':return [f.bankName,f.branch].filter(Boolean).join(' · ');case 'identity':return [f.docType,f.docExpiry?fmtDate(f.docExpiry):''].filter(Boolean).join(' · ');
 case 'custom':return it.tplName||T('updated_at',{d:fmtDate(it.updated)});
 default:return T('updated_at',{d:fmtDate(it.updated)});}}
function expInfo(it){let d=null;if(it.type==='card'&&it.f.expiry){const m=/^(\d{1,2})\s*\/\s*(\d{2,4})$/.exec(it.f.expiry.trim());if(m){let y=+m[2];if(y<100)y+=2000;d=new Date(y,+m[1],0,23,59);}}
 if(it.type==='identity'&&it.f.docExpiry)d=new Date(it.f.docExpiry+'T23:59');if(!d||isNaN(d))return null;
 const days=Math.ceil((d-Date.now())/864e5);const lim=it.type==='card'?60:120;if(days<0)return {past:true,days};if(days<=lim)return {past:false,days};return null;}
const pwFieldsOf=it=>(TYPES[it.type]||{f:[]}).f.filter(x=>x[2]&&x[2].pw&&it.f[x[0]]).map(x=>it.f[x[0]]);
function reuseMap(){const m=new Map();live().forEach(it=>pwFieldsOf(it).forEach(p=>{m.set(p,(m.get(p)||0)+1);}));return m;}

/* ================= navigation ================= */
const VIEWS={};
function go(view,params={},reset){if(reset){S.stack=[{view,params}];try{history.replaceState({vn:1},'');}catch(e){}}
 else{S.stack.push({view,params});try{history.pushState({vn:S.stack.length},'');}catch(e){}}render();window.scrollTo(0,0);}
function back(){try{history.back();}catch(e){popView();}}
function popView(){if(S.stack.length>1){S.stack.pop();render();}}
window.addEventListener('popstate',()=>{const m=$('#modals').lastElementChild;if(m&&m._close){m._close(null);try{history.pushState({vn:S.stack.length},'');}catch(e){}return;}
 if(S.unlocked&&S.stack.length>1)popView();});
function render(){if(!S.unlocked)return;clearInterval(S.tick);S.tick=0;const cur=S.stack[S.stack.length-1];if(!cur)return;const V=$('#view');const y=window.scrollY;const keep=cur.keep;cur.keep=false;S.keepY=keep?y:null;
 V.innerHTML='';(VIEWS[cur.view]||VIEWS.home)(cur.params||{},V);if(keep)window.scrollTo(0,y);}
function rerender(){const cur=S.stack[S.stack.length-1];if(cur)cur.keep=true;render();}
function topbar(title,sub,right=''){return `<header class="top"><button class="backb" data-back>${CUR==='he'||CUR==='ar'?'→':'←'} ${T('back')}</button><div class="ttl"><b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>${right}</header>`;}
const foot=()=>`<footer class="foot"><b>AppNest</b> · VaultNest ${APP_VERSION}</footer>`;
function wire(V){$$('[data-back]',V).forEach(b=>b.onclick=back);$$('[data-go]',V).forEach(b=>b.onclick=()=>go(b.dataset.go,b.dataset.p?JSON.parse(b.dataset.p):{}));}

/* ================= home ================= */
function backupNag(){const n=live().length+liveFiles().length;if(!n)return '';const lb=LS.get('lastBackup',0);
 if(!lb)return `<div class="banner"><p>${T('backup_never')}</p><button class="btn sm" data-bk>${T('backup_now')}</button></div>`;
 if(LS.get('keysAt',0)>lb)return `<div class="banner"><p>${T('backup_keys')}</p><button class="btn sm" data-bk>${T('backup_now')}</button></div>`;
 const d=Math.floor((Date.now()-lb)/864e5);return d>=14?`<div class="banner"><p>${T('backup_nag',{d})}</p><button class="btn sm" data-bk>${T('backup_now')}</button></div>`:'';}
function itemRows(list){if(!list.length)return '';const att=new Set(S.files.filter(f=>f.itemId&&!f.deletedAt).map(f=>f.itemId));return list.map(it=>`<button class="row" data-id="${esc(it.id)}"><span class="ic">${esc(icOf(it))}</span><span class="rt"><b>${esc(it.title)}</b><small>${esc(subtitle(it))}</small></span>${it.fav?'<span class="star" aria-hidden="true">★</span>':''}${att.has(it.id)?'<span class="mlbl" aria-hidden="true">📎</span>':''}</button>`).join('');}
function wireRows(root){$$('.row[data-id]',root).forEach(r=>{const it=()=>S.items.find(x=>x.id===r.dataset.id);r.onclick=()=>go('item',{id:r.dataset.id});
 longPress(r,async()=>{const x=it();if(x&&!x.deletedAt){await editItem(x);rerender();}});});}
const sortItems=a=>a.sort((x,y)=>(y.fav?1:0)-(x.fav?1:0)||String(x.title).localeCompare(String(y.title),CUR));
function searchItems(q){q=q.trim().toLowerCase();if(!q)return [];
 return sortItems(live().filter(it=>[it.title,it.tplName,it.f.username,it.f.url,it.f.ssid,it.f.bankName,it.f.docType,it.f.issuer,it.f.cardholder,...(it.cf||[]).filter(c=>!c.s).map(c=>c.n+' '+c.v)].some(v=>v&&String(v).toLowerCase().includes(q))));}
VIEWS.home=(p,V)=>{const L=live();const cnt=t=>L.filter(x=>x.type===t).length;const user=LS.get('user','');
 V.innerHTML=`<header class="top"><button class="ib" id="hlock" aria-label="${T('lock_now')}" title="${T('lock_now')}">🔒</button><div class="ttl"><b>VaultNest</b><small>${esc(user||T('app_sub'))}</small></div>
 <button class="ib" id="htheme" aria-label="${T('s_theme')}" title="${T('s_theme')}">🎨</button><button class="ib" data-go="about" aria-label="${T('about')}" title="${T('about')}">ℹ️</button></header>
 <main class="wrap"><div class="search"><input id="hs" class="inp" type="search" placeholder="${T('search_ph')}" autocomplete="off" aria-label="${T('search_ph')}"></div><div id="hres"></div>
 <div id="hmain">${S.inboxCount||S.inboxStuck?`<div class="banner"><p>📥 ${S.inboxCount?T('in_pending',{n:S.inboxCount}):''}${S.inboxStuck?' '+T('in_stuck_short',{n:S.inboxStuck}):''}</p><button class="btn sm" id="hinbox">${T('in_handle')}</button></div>`:''}${backupNag()}<button class="btn pri big wide" id="hadd">＋ ${T('add_item')}</button>
 <div class="grid">
  <button class="tile" data-go="list" data-p='{"type":"all"}'><span class="ti">🗝️</span><b>${T('cat_all')}</b><small>${T('items_n',{n:L.length})}</small></button>
  <button class="tile" data-go="list" data-p='{"type":"fav"}'><span class="ti">★</span><b>${T('cat_fav')}</b><small>${T('items_n',{n:L.filter(x=>x.fav).length})}</small></button>
  ${TYPE_ORDER.map(t=>`<button class="tile" data-go="list" data-p='{"type":"${t}"}'><span class="ti">${TYPES[t].ic}</span><b>${T('t_'+t)}</b><small>${cnt(t)}</small></button>`).join('')}
  <button class="tile" data-go="list" data-p='{"type":"custom"}'><span class="ti">🧩</span><b>${T('t_custom')}</b><small>${cnt('custom')}</small></button>
  <button class="tile wide" data-go="files"><span class="ti">🗂️</span><span class="tx"><b>${T('files')}</b><br><small>${liveFiles().length}</small></span></button>
 </div>
 <div class="tools"><button class="btn" data-go="gen">🎲 ${T('gen_t')}</button><button class="btn" data-go="health">🩺 ${T('health_t')}</button>
 <button class="btn" data-go="list" data-p='{"type":"trash"}'>🗑️ ${T('trash')}</button><button class="btn" data-go="settings">⚙️ ${T('settings')}</button></div></div>${foot()}</main>`;
 wire(V);$('#hlock').onclick=()=>lock();$('#htheme').onclick=themeDlg;$('#hadd').onclick=addMenu;const bk=$('[data-bk]',V);if(bk)bk.onclick=backupDlg;const hi=$('#hinbox',V);if(hi)hi.onclick=()=>handleInbox(false);
 const hs=$('#hs');hs.oninput=()=>{const q=hs.value;$('#hmain').classList.toggle('hide',!!q.trim());const r=searchItems(q);
  $('#hres').innerHTML=q.trim()?(r.length?itemRows(r):`<p class="empty">${T('no_results')}</p>`):'';wireRows($('#hres'));};};
async function addMenu(){const tps=templates();
 const r=await modal(`<h3 class="mh">${T('add_what')}</h3><div class="stack">${TYPE_ORDER.map(t=>`<button class="row" data-v="${t}"><span class="ic">${TYPES[t].ic}</span><span class="rt"><b>${T('ts_'+t)}</b></span></button>`).join('')}
 ${tps.map(t=>`<button class="row" data-v="tpl:${esc(t.id)}"><span class="ic">${esc(t.ic)}</span><span class="rt"><b>${esc(t.title)}</b><small>${T('tpl_mine')}</small></span></button>`).join('')}
 <button class="row" data-v="custom"><span class="ic">🧩</span><span class="rt"><b>${T('ts_custom')}</b><small>${T('ts_custom_d')}</small></span></button>
 <button class="row" data-v="files"><span class="ic">🗂️</span><span class="rt"><b>${T('add_files')}</b></span></button>
 <button class="row" data-v="recv"><span class="ic">📩</span><span class="rt"><b>${T('sh_recv_t')}</b><small>${T('sh_recv_d')}</small></span></button>
 <button class="link" data-v="tpls">🧩 ${T('tpl_t')}</button></div>`,{onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v))});
 if(!r)return;if(r==='files'){go('files');return;}if(r==='recv'){await receiveShareFlow();return;}if(r==='tpls'){await templatesDlg();rerender();return;}
 let src={type:r};if(r.startsWith('tpl:')){const t=S.items.find(x=>x.id===r.slice(4));src={type:'custom',pre:{ic:t.ic,tplName:t.title,title:'',cf:(t.fields||[]).map(f=>({n:f.n,v:'',s:!!f.s}))}};}
 const saved=await editItem(src);if(saved&&saved.id)go('item',{id:saved.id});}
async function themeDlg(){await modal(`<h3 class="mh">${T('s_look')}</h3><div id="lookbox"></div><div class="mact"><button class="btn pri" data-v>${T('done')}</button></div>`,
 {onOpen:(s,close)=>{lookControls($('#lookbox',s));$('[data-v]',s).onclick=()=>close();}});rerender();}
function lookControls(box){const th=LS.get('theme','gold'),md=LS.get('mode','night');
 box.innerHTML=`<label class="lbl">${T('s_theme')}</label><div class="swatches">${THEMES.map(([k,bg,ac])=>`<button class="sw" data-th="${k}" aria-pressed="${k===th}" aria-label="${T('th_'+k)}" title="${T('th_'+k)}" style="background:${bg}"><i style="background:${ac}"></i></button>`).join('')}</div>
 <label class="lbl">${T('s_mode')}</label><div class="seg"><button data-md="night" aria-pressed="${md==='night'}">${T('mode_night')}</button><button data-md="day" aria-pressed="${md==='day'}">${T('mode_day')}</button></div>`;
 $$('[data-th]',box).forEach(b=>b.onclick=()=>{LS.set('theme',b.dataset.th);applyLook();lookControls(box);});
 $$('[data-md]',box).forEach(b=>b.onclick=()=>{LS.set('mode',b.dataset.md);applyLook();lookControls(box);});}

/* ================= list ================= */
VIEWS.list=(p,V)=>{const t=p.type;let list,title;
 if(t==='trash')return trashView(V);
 if(t==='all'){list=live();title=T('cat_all');}else if(t==='fav'){list=live().filter(x=>x.fav);title=T('cat_fav');}else{list=live().filter(x=>x.type===t);title=T('t_'+t);}
 sortItems(list);V.innerHTML=`${topbar(title,T('items_n',{n:list.length}),TYPES[t]?`<button class="ib" id="ladd" aria-label="${T('add_item')}">＋</button>`:'')}
 <main class="wrap">${list.length>6?`<div class="search"><input id="ls" class="inp" type="search" placeholder="${T('search_ph')}" autocomplete="off"></div>`:''}<div id="lrows">${itemRows(list)||`<p class="empty">${T('empty_list')}</p>`}</div></main>`;
 wire(V);wireRows(V);const la=$('#ladd',V);if(la)la.onclick=async()=>{const s=await editItem({type:t});if(s&&s.id)go('item',{id:s.id});};
 const ls=$('#ls',V);if(ls)ls.oninput=()=>{const q=ls.value.trim().toLowerCase();$$('#lrows .row',V).forEach(r=>{r.classList.toggle('hide',!!q&&!r.textContent.toLowerCase().includes(q));});};};
function trashView(V){const its=S.items.filter(x=>x.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt),fs=S.files.filter(x=>x.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt);
 const row=(ic,title,sub,kind,id)=>`<div class="row"><span class="ic">${ic}</span><span class="rt"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="ra"><button class="fa" data-rs="${kind}:${esc(id)}" aria-label="${T('restore')}" title="${T('restore')}">↩</button><button class="fa" data-rm="${kind}:${esc(id)}" aria-label="${T('delete_forever')}" title="${T('delete_forever')}">✕</button></span></div>`;
 V.innerHTML=`${topbar(T('trash'),T('trash_note'))}<main class="wrap">${its.length+fs.length?its.map(x=>row(icOf(x),x.title,fmtDate(x.deletedAt),'i',x.id)).join('')+fs.map(f=>row(ficon(f.type),f.name,fmtDate(f.deletedAt),'f',f.id)).join('')
  +`<button class="btn danger wide" id="tempty" style="margin-top:12px">${T('empty_trash')}</button>`:`<p class="empty">${T('trash_empty')}</p>`}</main>`;
 wire(V);
 $$('[data-rs]',V).forEach(b=>b.onclick=async()=>{const [k,id]=b.dataset.rs.split(':');const ok=k==='i'?await updateItem(S.items.find(x=>x.id===id),o=>{o.deletedAt=0;}):await updateFile(S.files.find(x=>x.id===id),o=>{o.deletedAt=0;});if(ok)toast(T('restored'));rerender();});
 $$('[data-rm]',V).forEach(b=>b.onclick=async()=>{if(!(await confirmDlg(T('del_forever_c'),{danger:true,ok:T('delete_forever')})))return;const [k,id]=b.dataset.rm.split(':');if(k==='i')await killItem(id);else await killFile(id);rerender();});
 const te_=$('#tempty',V);if(te_)te_.onclick=async()=>{if(!(await confirmDlg(T('empty_trash_c'),{danger:true,ok:T('empty_trash')})))return;for(const x of its)await killItem(x.id);for(const f of fs)await killFile(f.id);rerender();};}

/* ================= item view ================= */
VIEWS.item=(p,V)=>{const it=S.items.find(x=>x.id===p.id);if(!it||it.deletedAt){back();return;}const def=TYPES[it.type]||TYPES.note;const reuse=reuseMap();
 const MASK='••••••••';const row=(label,key,val,{secret,mono,ltr,pre,url,card,badges=''})=>`<div class="fld"><label>${esc(label)}</label><div class="fline"><div class="fv ${mono?'mono':''} ${pre?'pre':''}" data-k="${esc(key)}" ${ltr?'dir="ltr"':''}>${secret?(card?'•••• •••• •••• '+String(val).replace(/\s/g,'').slice(-4):MASK):esc(val)}</div>
  ${secret?`<button class="fa" data-show="${esc(key)}" aria-label="${T('show')}">👁</button>`:''}<button class="fa" data-copy="${esc(key)}" aria-label="${T('copy')}">⧉</button>${url?`<button class="fa" data-open="${esc(key)}" aria-label="${T('open_site')}">↗</button>`:''}</div>${badges}</div>`;
 const vals={};let rows='';
 def.f.forEach(([k,t,o={}])=>{let v=it.f[k];if(v==null||v==='')return;
  if(t==='totp'){rows+=`<div class="fld"><label>${T('f_totp')}</label><div class="fline"><div class="fv totp mono" dir="ltr" data-totp>··· ···</div><span class="tsec" data-tsec></span><button class="fa" data-tcopy aria-label="${T('copy')}">⧉</button></div><p class="mlbl">${esc(parseOtp(v)&&parseOtp(v).issuer||'')}</p></div>`;return;}
  const disp=t==='select'&&v==='none'?T('sec_none'):t==='date'?fmtDate(v):o.card?grp4(v):v;vals[k]={disp,copy:k==='number'?String(v).replace(/\s/g,''):String(v),card:o.card};let badges='';
  if(o.pw){const st=strength(v);const n=reuse.get(v)||0;badges=`<div class="badges">${/^\s|\s$/.test(v)?`<span class="badge b-warn">${T('pw_space')}</span>`:''}<span class="badge" style="color:${STR_COL[st.s]}">${T('str_'+st.s)}</span>${n>1?`<span class="badge b-warn">${T('reused_n',{n})}</span>`:''}${Date.now()-(it.pwChanged||it.created)>365*864e5?`<span class="badge b-mut">${T('old_pw')}</span>`:''}${it.breach>0?`<span class="badge b-bad">${T('breach_found',{n:it.breach.toLocaleString()})}</span>`:''}<button class="btn sm" data-breach="${k}">🔎 ${T('check_breach')}</button><span class="mlbl" data-bres="${k}"></span></div>`;}
  if((o.exp&&it.type==='card')||k==='docExpiry'){const e=expInfo(it);if(e)badges=`<div class="badges"><span class="badge ${e.past?'b-bad':'b-warn'}">${e.past?T('exp_past'):T('exp_soon',{d:e.days})}</span></div>`;}
  rows+=row(T('f_'+k),k,disp,{secret:t==='secret'||o.hidden,mono:t==='secret',ltr:t==='secret'||t==='url',pre:t==='area',url:t==='url',card:o.card,badges});});
 (it.cf||[]).forEach((c,i)=>{if(!c.v)return;const k='cf'+i;vals[k]={disp:c.v,copy:c.v};rows+=row(c.n||'—',k,c.v,{secret:c.s,mono:c.s,ltr:c.s});});
 const atts=attachments(it.id);const hasExp=!!expDate(it);const hist=(it.hist||[]).length;
 V.innerHTML=`${topbar(it.title,it.type==='custom'?(it.tplName||T('ts_custom')):T('ts_'+it.type),`<button class="ib" id="ifav" aria-label="${T('f_fav')}" aria-pressed="${!!it.fav}">${it.fav?'★':'☆'}</button><button class="ib" id="iedit" aria-label="${T('edit')}">✏️</button>`)}
 <main class="wrap"><div class="card">${rows||`<p class="empty">—</p>`}</div>
 <div class="two" style="margin-top:12px"><button class="btn" id="iedit2">✏️ ${T('edit')}</button><button class="btn" id="imore" aria-haspopup="dialog">⋯ ${T('more_t')}</button></div>
 <h3 class="sec">📎 ${T('att_t')} (${atts.length})</h3>${atts.length?`<div class="fgrid">${atts.map(f=>`<button class="ft" data-fid="${esc(f.id)}" aria-label="${esc(f.name)}">${f.hasThumb?'<img alt="">':''}<span>${ficon(f.type)}</span><small>${esc(f.name)}</small></button>`).join('')}</div>`:`<p class="mlbl">${T('att_empty')}</p>`}
 <div id="fprog" class="mlbl" style="text-align:center"></div><button class="btn wide" id="aadd" style="margin-top:10px">📎 ${T('att_add')}</button>
 <p class="mlbl" style="text-align:center;margin-top:16px">${T('created_at',{d:fmtDate(it.created)})} · ${T('updated_at',{d:fmtDate(it.updated)})}</p>${foot()}</main>`;
 wire(V);const shown={};
 $$('[data-show]',V).forEach(b=>b.onclick=()=>{const k=b.dataset.show,x=vals[k],el=$(`.fv[data-k="${k}"]`,V);shown[k]=!shown[k];
  el.textContent=shown[k]?x.disp:(x.card?'•••• •••• •••• '+x.copy.slice(-4):MASK);b.textContent=shown[k]?'🙈':'👁';b.setAttribute('aria-label',shown[k]?T('hide'):T('show'));});
 $$('[data-copy]',V).forEach(b=>b.onclick=()=>copyText(vals[b.dataset.copy].copy));
 $$('[data-open]',V).forEach(b=>b.onclick=()=>{let u=String(it.f[b.dataset.open]).trim();if(!/^https?:\/\//i.test(u))u='https://'+u;try{const x=new URL(u);if(/^https?:$/.test(x.protocol))window.open(x.href,'_blank','noopener,noreferrer');}catch(e){}});
 $$('[data-breach]',V).forEach(b=>b.onclick=async()=>{if(!(await hibpConsent()))return;const out=$(`[data-bres="${b.dataset.breach}"]`,V);b.disabled=true;out.textContent=T('checking');
  try{const n=await pwnedCount(it.f[b.dataset.breach]);out.textContent=n?T('breach_found',{n:n.toLocaleString()}):T('breach_clean');out.style.color=n?'var(--bad)':'var(--ok)';it.breach=n;it.breachAt=Date.now();await saveItem(it);}
  catch(e){out.textContent=T('breach_err');out.style.color='var(--bad)';}b.disabled=false;});
 const tEl=$('[data-totp]',V);if(tEl){const o=parseOtp(it.f.totp);let cur='';
  const upd=async()=>{if(!o||o.err){tEl.textContent=T('totp_bad');return;}const code=await totpCode(o);cur=code;const h=Math.ceil(code.length/2);tEl.textContent=code.slice(0,h)+' '+code.slice(h);
   const left=o.period-Math.floor(Date.now()/1000)%o.period;const sEl=$('[data-tsec]',V);if(sEl){sEl.textContent=left+'s';sEl.style.color=left<=5?'var(--bad)':'var(--mut)';}};
  upd();S.tick=setInterval(upd,1000);$('[data-tcopy]',V).onclick=()=>{if(cur)copyText(cur);};}
 const ed=async()=>{const r=await editItem(it);if(r==='deleted'){back();return;}rerender();};$('#iedit',V).onclick=ed;$('#iedit2',V).onclick=ed;
 $('#ifav',V).onclick=async()=>{it.fav=!it.fav;try{await saveItem(it);toast(it.fav?T('fav_on'):T('fav_off'));}catch(e){it.fav=!it.fav;toast(T('save_fail',{e:e.message}),'bad');}rerender();};
 $('#imore',V).onclick=async()=>{const opts=[it.type==='wifi'&&it.f.ssid?['qr','📱',T('wifi_qr')]:null,hasExp?['cal','📅',T('cal_t')]:null,hist?['hist','🕘',T('hist_t')+' ('+hist+')']:null,['share','↗',T('sh_t')]].filter(Boolean);
  const r=await menuDlg(T('more_t'),opts);if(r==='qr')wifiQR(it);else if(r==='cal')calendarDlg(it);else if(r==='hist'){await histDlg(it);rerender();}else if(r==='share')shareItem(it);};
 const cat=catFor(it.type);
 $('#aadd',V).onclick=async()=>{const r=await menuDlg(T('att_add'),[['cam','📷',T('files_camera')],['scan','📄',T('scan_btn')],['file','📎',T('files_add')],['have','🔗',T('att_existing')]]);
  if(r==='cam'){if(await addFilesFlow($('#fcam'),cat,it.id))rerender();}else if(r==='file'){if(await addFilesFlow($('#fpick'),cat,it.id)){rerender();origNoteOnce();}}
  else if(r==='scan'){if(await scanFlow(cat,it.id))rerender();}else if(r==='have'){if(await attachExisting(it))rerender();}};
 wireFileTiles(V);};
function wireFileTiles(V){$$('[data-fid]',V).forEach(async b=>{const m=S.files.find(x=>x.id===b.dataset.fid);if(!m)return;b.onclick=async()=>{await viewFile(m);};longPress(b,async()=>{await editFile(m);rerender();});
 if(m.hasThumb){try{const u=await thumbURL(m.id);const img=$('img',b);if(u&&img){img.src=u;$('span',b).classList.add('hide');$('small',b).classList.add('hide');}}catch(e){}}});}
/* ================= edit dialog ================= */
function inputFor([k,t,o={}],v){const id='e_'+k;const L=`<label class="lbl" for="${id}">${T('f_'+k)}</label>`;v=v==null?'':v;
 if(t==='area')return L+`<textarea id="${id}" class="inp" autocomplete="off" spellcheck="false">${esc(v)}</textarea>`;
 if(t==='select')return L+`<select id="${id}" class="inp">${o.opts.map(x=>`<option value="${x}" ${x===v?'selected':''}>${x==='none'?T('sec_none'):x}</option>`).join('')}</select>`;
 if(t==='date')return L+`<input id="${id}" class="inp" type="date" value="${esc(v)}">`;
 if(t==='totp')return L+`<div class="pwbox"><input id="${id}" class="inp mono" type="password" dir="ltr" value="${esc(v)}" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="otpauth://… / JBSW Y3DP…"><button type="button" class="eye" data-eye="${id}" aria-label="${T('show')}">👁</button></div>
  <div class="two" style="margin-top:8px"><button type="button" class="btn sm" data-qr="cam">📷 ${T('totp_scan')}</button><button type="button" class="btn sm" data-qr="img">🖼️ ${T('totp_scan_img')}</button></div><p class="mlbl">${T('totp_note')}</p>`;
 if(t==='secret')return L+`<div class="pwbox"><input id="${id}" class="inp mono" type="password" dir="ltr" value="${esc(o.card?grp4(v):v)}" autocomplete="new-password" spellcheck="false" autocapitalize="off" ${o.num?'inputmode="numeric"':''}><button type="button" class="eye" data-eye="${id}" aria-label="${T('show')}">👁</button></div>
  ${o.gen?`<div class="meter"><i id="${id}_m"></i></div><div class="mlbl" id="${id}_ml"></div><button type="button" class="btn sm" data-gen="${id}" style="margin-top:8px">🎲 ${T('gen_new')}</button>`:''}`;
 return L+`<input id="${id}" class="inp" type="${t==='url'?'url':'text'}" ${t==='url'||o.exp?'dir="ltr"':''} value="${esc(v)}" autocomplete="off" spellcheck="false" ${o.ph?`placeholder="${o.ph}"`:''} ${o.exp?'inputmode="numeric" maxlength="7"':''}>`;}
function editItem(src){const isNew=!src.id;const pre=src.pre||{};
 const it=isNew?{id:uid(),type:src.type,title:pre.title||'',fav:false,f:Object.assign({},pre.f||{}),cf:(pre.cf||[]).map(c=>Object.assign({},c)),ic:pre.ic||'',tplName:pre.tplName||'',created:Date.now()}:JSON.parse(JSON.stringify(src));
 if(!it.cf)it.cf=[];const def=TYPES[it.type]||TYPES.note;let syncCf;
 return modal(`<h3 class="mh">${esc(icOf(it))} ${esc(isNew?(it.tplName||T('ts_'+it.type)):T('edit_item'))}</h3>
 <label class="lbl" for="e_title">${T('f_title')}</label><input id="e_title" class="inp" value="${esc(it.title)}" placeholder="${esc(T('title_ph_'+it.type))}" autocomplete="off" ${isNew?'autofocus':''}>
 ${def.f.map(fd=>inputFor(fd,it.f[fd[0]])).join('')}
 <label class="lbl">${T('cf_t')}</label><div id="e_cf"></div>
 <label class="chk"><input type="checkbox" id="e_fav" ${it.fav?'checked':''}> ${T('f_fav')}</label><div class="err" id="e_err" role="alert"></div>
 <div class="mact"><button class="btn" data-a="cancel">${T('cancel')}</button><button class="btn pri" data-a="save">${T('save')}</button></div>
 ${isNew?'':`<button class="btn danger wide" data-a="del" style="margin-top:14px">🗑️ ${T('delete')}</button>`}`,
 {sticky:true,onOpen:(s,close)=>{syncCf=cfEditor($('#e_cf',s),it.cf,true);
  def.f.forEach(([k,t,o={}])=>{const i=$('#e_'+k,s);if(o.gen)bindMeter(i,$('#e_'+k+'_m',s),$('#e_'+k+'_ml',s));
   if(o.exp)i.addEventListener('input',()=>{let d=i.value.replace(/\D/g,'').slice(0,4);i.value=d.length>2?d.slice(0,2)+'/'+d.slice(2):d;});
   if(o.card)i.addEventListener('input',()=>{const c=i.selectionStart===i.value.length;i.value=grp4(i.value.replace(/\D/g,'').slice(0,19));if(c)i.selectionStart=i.selectionEnd=i.value.length;});});
  $$('[data-gen]',s).forEach(b=>b.onclick=()=>{const i=$('#'+b.dataset.gen,s);i.value=genAny();i.type='text';i.dispatchEvent(new Event('input'));const eye=s.querySelector(`[data-eye="${b.dataset.gen}"]`);if(eye)eye.textContent='🙈';});
  $$('[data-qr]',s).forEach(b=>b.onclick=async()=>{const [f]=await pickFile(b.dataset.qr==='cam'?$('#fcam'):$('#fpick'));if(!f)return;
   try{const v=await decodeQR(f);if(!v){toast(T('totp_noqr'),'bad');return;}const o=parseOtp(v);if(!o||o.err){toast(o&&o.err==='migration'?T('totp_migration'):T('totp_bad'),'bad');return;}
    const i=$('#e_totp',s);i.value=v;const tt=$('#e_title',s);if(!tt.value.trim()&&o.issuer)tt.value=o.issuer;const un=$('#e_username',s);if(un&&!un.value&&o.label.includes(':'))un.value=o.label.split(':').slice(1).join(':').trim();toast(T('totp_ok'));}
   catch(e){toast(e.code==='nodetector'?T('totp_nodetector'):T('totp_noqr'),'bad');}});
  $('[data-a=cancel]',s).onclick=()=>close(null);
  $('[data-a=save]',s).onclick=async()=>{const nf={};def.f.forEach(([k,t,o={}])=>{let v=$('#e_'+k,s).value;/* secrets are stored exactly as typed — never trimmed */v=t==='secret'||t==='totp'?v:t==='area'?v.replace(/\s+$/,''):v.trim();if(o.card)v=v.replace(/\s/g,'');if(v)nf[k]=v;});
   const err=$('#e_err',s);if(nf.expiry){const m=/^(\d{2})\/(\d{2})$/.exec(nf.expiry);if(!m||+m[1]<1||+m[1]>12){err.textContent=T('exp_bad');$('#e_expiry',s).focus();return;}}
   if(nf.totp){const o=parseOtp(nf.totp);if(!o||o.err){err.textContent=o&&o.err==='migration'?T('totp_migration'):T('totp_bad');return;}}
   syncCf();const cf=it.cf.filter(c=>c.n.trim()||c.v.trim()).map(c=>({n:c.n.trim(),v:c.v,s:!!c.s}));
   let title=$('#e_title',s).value.trim();if(!title)title=hostOf(nf.url)||nf.ssid||nf.bankName||nf.docType||it.tplName||'';
   if(!title){err.textContent=T('need_title');$('#e_title',s).focus();return;}
   const pwChanged=pwFieldsOf({type:it.type,f:nf}).join('\u0001')!==pwFieldsOf(it).join('\u0001');
   if(!isNew)it.hist=pushHistory(it,nf);it.title=title;it.f=nf;it.cf=cf;it.fav=$('#e_fav',s).checked;if(isNew||pwChanged){it.pwChanged=Date.now();delete it.breach;}
   try{await saveItem(it);toast(T('saved'));close(it);}catch(e){err.textContent=T('save_fail',{e:e.message});}};
  const del=$('[data-a=del]',s);if(del)del.onclick=async()=>{if(!(await confirmDlg(T('del_confirm',{n:it.title}),{danger:true,ok:T('delete')})))return;
   const orig=S.items.find(x=>x.id===it.id);if(!(await updateItem(orig,o=>{o.deletedAt=Date.now();})))return;toast(T('moved_trash'));close('deleted');};}});}
/* ================= files ================= */
VIEWS.files=(p,V)=>{const cat=p.cat||'all';const list=liveFiles().filter(f=>cat==='all'||f.cat===cat).sort((a,b)=>b.created-a.created);
 V.innerHTML=`${topbar(T('files'),T('items_n',{n:liveFiles().length}))}<main class="wrap">
 <div class="chips">${['all',...FCATS].map(c=>`<button data-cat="${c}" aria-pressed="${c===cat}">${T('fc_'+c)}</button>`).join('')}</div>
 <div class="three" style="margin-bottom:14px"><button class="btn" id="fcamb">📷 ${T('files_camera')}</button><button class="btn" id="fscan">📄 ${T('scan_btn')}</button><button class="btn pri" id="faddb">＋ ${T('files_add')}</button></div>
 <div id="fprog" class="mlbl" style="text-align:center"></div>
 ${list.length?`<div class="fgrid">${list.map(f=>`<button class="ft" data-fid="${esc(f.id)}" aria-label="${esc(f.name)}">${f.hasThumb?'<img alt="">':''}<span>${ficon(f.type)}</span><small>${esc(f.name)}</small>${f.itemId?'<i class="lk" aria-hidden="true">🔗</i>':''}</button>`).join('')}</div>`:`<p class="empty">${T('files_empty')}</p>`}${foot()}</main>`;
 wire(V);$$('[data-cat]',V).forEach(b=>b.onclick=()=>{S.stack[S.stack.length-1].params={cat:b.dataset.cat};render();});const c=cat==='all'?'other':cat;
 $('#faddb',V).onclick=async()=>{if(await addFilesFlow($('#fpick'),c)){rerender();origNoteOnce();}};
 $('#fcamb',V).onclick=async()=>{if(await addFilesFlow($('#fcam'),c))rerender();};
 $('#fscan',V).onclick=async()=>{if(await scanFlow(c))rerender();};wireFileTiles(V);};
async function viewFile(m){let blob,url;try{blob=await fileBlob(m);url=URL.createObjectURL(blob);S.urls.push(url);}catch(e){toast(T('file_fail'),'bad');return;}
 const t=m.type;const body=/^image\//.test(t)?`<img src="${url}" alt="${esc(m.name)}">`:/^video\//.test(t)?`<video src="${url}" controls playsinline></video>`:/^audio\//.test(t)?`<audio src="${url}" controls style="width:100%"></audio>`:`<p class="empty" style="font-size:3rem;padding:18px">${ficon(t)}</p>`;
 const owner=m.itemId?S.items.find(x=>x.id===m.itemId):null;
 const r=await modal(`<h3 class="mh">${esc(m.name)}</h3><p class="mlbl">${fmtSize(m.size)} · ${T('fc_'+m.cat)} · ${fmtDate(m.created)}</p>${owner?`<button class="btn sm" data-v="item" style="margin-top:6px">🔗 ${esc(owner.title)}</button>`:''}<div class="viewer">${body}</div>
 <p class="mlbl" style="margin-top:8px">${T('download_warn')}</p><div class="mact"><button class="btn" data-v="share">↗ ${T('file_share')}</button><button class="btn" data-v="dl">⬇ ${T('file_download')}</button>${/pdf|text/.test(t)?`<button class="btn" data-v="open">${T('file_open')}</button>`:''}</div>
 <div class="mact"><button class="btn" data-v="edit">✏️ ${T('edit')}</button><button class="btn pri" data-v="close">${T('close')}</button></div>`,
 {onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=async()=>{const v=b.dataset.v;const file=new File([blob],m.name,{type:m.type});
  if(v==='share'){if(navigator.canShare&&navigator.canShare({files:[file]})){try{await hold(()=>navigator.share({files:[file],title:m.name}));}catch(e){}}else saveFile(file);}
  else if(v==='dl')saveFile(file);else if(v==='open'){hold(async()=>{window.open(url,'_blank','noopener');});}else close(v);})});
 try{URL.revokeObjectURL(url);S.urls=S.urls.filter(x=>x!==url);}catch(e){}
 if(r==='edit'){await editFile(m);rerender();}else if(r==='item'&&owner){const cur=S.stack[S.stack.length-1];if(!(cur.view==='item'&&cur.params.id===owner.id))go('item',{id:owner.id});}}
function editFile(m){return modal(`<h3 class="mh">${ficon(m.type)} ${T('edit')}</h3><label class="lbl" for="ef_n">${T('file_name')}</label><input id="ef_n" class="inp" value="${esc(m.name)}" autocomplete="off">
 <label class="lbl" for="ef_c">${T('file_cat')}</label><select id="ef_c" class="inp">${FCATS.map(c=>`<option value="${c}" ${c===m.cat?'selected':''}>${T('fc_'+c)}</option>`).join('')}</select>
 <label class="lbl" for="ef_i">${T('in_attach')}</label><select id="ef_i" class="inp"><option value="">${T('in_attach_none')}</option>${sortItems(live().slice()).map(it=>`<option value="${esc(it.id)}" ${it.id===m.itemId?'selected':''}>${esc(icOf(it)+' '+it.title)}</option>`).join('')}</select>
 <div class="mact"><button class="btn" data-a="x">${T('cancel')}</button><button class="btn pri" data-a="s">${T('save')}</button></div><button class="btn danger wide" data-a="d" style="margin-top:14px">🗑️ ${T('delete')}</button>`,
 {sticky:true,onOpen:(s,close)=>{$('[data-a=x]',s).onclick=()=>close(null);
  $('[data-a=s]',s).onclick=async()=>{const old={name:m.name,cat:m.cat,itemId:m.itemId};m.name=$('#ef_n',s).value.trim()||m.name;m.cat=$('#ef_c',s).value;m.itemId=$('#ef_i',s).value;try{await saveFileMeta(m);}catch(e){Object.assign(m,old);toast(T('save_fail',{e:e.message}),'bad');return;}toast(T('saved'));close('saved');};
  $('[data-a=d]',s).onclick=async()=>{if(!(await confirmDlg(T('del_confirm',{n:m.name}),{danger:true,ok:T('delete')})))return;if(!(await updateFile(m,o=>{o.deletedAt=Date.now();})))return;toast(T('moved_trash'));close('deleted');};}});}

/* ================= generator ================= */
VIEWS.gen=(p,V)=>{const o=genOpts();const opt=(k)=>`<label class="chk"><input type="checkbox" data-o="${k}" ${o[k]?'checked':''}> ${T('gen_'+k)}</label>`;const W=o.mode==='words';
 V.innerHTML=`${topbar(T('gen_t'))}<main class="wrap"><div class="seg" style="justify-content:center;margin-bottom:12px"><button data-mode="chars" aria-pressed="${!W}">${T('gen_chars')}</button><button data-mode="words" aria-pressed="${W}">${T('gen_words')}</button></div>
 <div class="genout" id="gout" aria-live="polite"></div><div class="meter"><i id="gm"></i></div><div class="mlbl" id="gml" style="text-align:center"></div>
 <div class="two" style="margin:14px 0"><button class="btn pri" id="gnew">🎲 ${T('gen_new')}</button><button class="btn" id="gcopy">⧉ ${T('copy')}</button></div>
 ${W?`<div class="card"><label class="lbl" for="gwn" id="gwnl" style="margin-top:0">${T('gen_wcount',{n:o.words})}</label><input type="range" class="range" id="gwn" min="4" max="10" value="${o.words}">
  <label class="lbl">${T('gen_wlang')}</label><div class="seg"><button data-wl="en" aria-pressed="${o.wlang==='en'}">English</button><button data-wl="he" aria-pressed="${o.wlang==='he'}">עברית</button></div>
  <label class="lbl">${T('gen_sep')}</label><div class="seg">${['-','.','_',' '].map(x=>`<button data-sep="${x}" aria-pressed="${o.sep===x}">${x===' '?T('gen_space'):x}</button>`).join('')}</div>
  ${o.wlang==='en'?`<label class="chk"><input type="checkbox" data-o="cap" ${o.cap?'checked':''}> ${T('gen_cap')}</label>`:''}<label class="chk"><input type="checkbox" data-o="num" ${o.num?'checked':''}> ${T('gen_num')}</label>
  <p class="mlbl">${T('gen_words_note')}</p></div>`
 :`<div class="card"><label class="lbl" for="glen" id="glenl" style="margin-top:0">${T('gen_length',{n:o.len})}</label><input type="range" class="range" id="glen" min="8" max="64" value="${o.len}">
 ${opt('lower')}${opt('upper')}${opt('digits')}${opt('symbols')}${opt('ambig')}</div>`}<p class="mlbl">${T('gen_default_note')}</p>${foot()}</main>`;wire(V);
 const out=$('#gout',V);const set=(k,v)=>{const g=genOpts();g[k]=v;LS.set('genopt',g);};
 const make=()=>{const oo=genOpts();out.textContent=genAny(oo);let bits,s;if(oo.mode==='words'){bits=passBits(oo);s=bits<40?1:bits<55?2:bits<75?3:4;}else{const r=strength(out.textContent);bits=r.bits;s=r.s;}
  $('#gm',V).style.width=(s+1)*20+'%';$('#gm',V).style.background=STR_COL[s];$('#gml',V).textContent=T('str_'+s)+' · '+T('bits',{b:bits});};
 $$('[data-mode]',V).forEach(b=>b.onclick=()=>{set('mode',b.dataset.mode);rerender();});
 const gl=$('#glen',V);if(gl)gl.oninput=e=>{set('len',+e.target.value);$('#glenl',V).textContent=T('gen_length',{n:e.target.value});make();};
 const gw=$('#gwn',V);if(gw)gw.oninput=e=>{set('words',+e.target.value);$('#gwnl',V).textContent=T('gen_wcount',{n:e.target.value});make();};
 $$('[data-wl]',V).forEach(b=>b.onclick=()=>{set('wlang',b.dataset.wl);rerender();});$$('[data-sep]',V).forEach(b=>b.onclick=()=>{set('sep',b.dataset.sep);$$('[data-sep]',V).forEach(x=>x.setAttribute('aria-pressed',x===b));make();});
 $$('[data-o]',V).forEach(c=>c.onchange=()=>{set(c.dataset.o,c.checked);make();});
 $('#gnew',V).onclick=make;$('#gcopy',V).onclick=()=>copyText(out.textContent);make();};
/* ================= health ================= */
VIEWS.health=(p,V)=>{const L=live();const withPw=L.filter(it=>pwFieldsOf(it).length);const reuse=reuseMap();
 const weak=withPw.filter(it=>pwFieldsOf(it).some(pw=>strength(pw).s<2));const reused=withPw.filter(it=>pwFieldsOf(it).some(pw=>reuse.get(pw)>1));
 const old=withPw.filter(it=>Date.now()-(it.pwChanged||it.created)>365*864e5);const exp=L.filter(it=>expInfo(it));const breached=withPw.filter(it=>it.breach>0);
 const bad=new Set([...weak,...reused,...breached].map(x=>x.id)).size;const score=withPw.length?Math.max(0,Math.round(100-bad/withPw.length*100-old.length/withPw.length*10)):100;
 const sec=(title,list)=>`<h3 class="sec">${title} (${list.length})</h3>${list.length?itemRows(sortItems(list.slice())):`<p class="mlbl">${T('h_all_good')}</p>`}`;
 V.innerHTML=`${topbar(T('health_t'))}<main class="wrap">${withPw.length?`<div class="card" style="text-align:center"><div class="score">${score}</div><div class="mlbl">${T('h_score')}</div></div>
 <button class="btn wide" id="hcheck">🔎 ${T('h_checkall')}</button><p class="mlbl" id="hprog" style="text-align:center"></p>
 ${sec(T('h_breached'),breached)}${sec(T('h_weak'),weak)}${sec(T('h_reused'),reused)}${sec(T('h_old'),old)}`:`<p class="empty">${T('h_none')}</p>`}
 ${exp.length?sec(T('h_expiring'),exp):''}<p class="mlbl" style="margin-top:16px">${T('h_note')}</p>${foot()}</main>`;
 wire(V);wireRows(V);const hc=$('#hcheck',V);if(hc)hc.onclick=async()=>{if(!(await hibpConsent()))return;hc.disabled=true;const pr=$('#hprog',V);let i=0;
  const sid=S.sid;for(const it of withPw){if(sid!==S.sid||!S.unlocked)return;i++;pr.textContent=T('h_checking',{i,n:withPw.length});let mx=0;
   try{for(const pw of pwFieldsOf(it))mx=Math.max(mx,await pwnedCount(pw));it.breach=mx;it.breachAt=Date.now();await saveItem(it);}catch(e){pr.textContent=T('breach_err');hc.disabled=false;return;}await sleep(120);}
  rerender();};};

/* ================= settings ================= */
function backupDlg(){return (async()=>{let file,done=false;try{file=await buildBackup();}catch(e){logErr('backup '+(e.code||e.message));toast(e.code==='missingblob'?T('b_missingblob'):T('err_generic',{e:e.message}),'bad');return false;}
 const r=await modal(`<h3 class="mh">${T('b_ready')}</h3><p class="mtext">${esc(file.name)} · ${fmtSize(file.size)}${file.recId?'\n'+esc(T('b_recid',{id:file.recId})):''}</p><p class="mlbl">${T('b_hint')}</p>
 <div class="stack" style="margin-top:12px">${navigator.canShare&&navigator.canShare({files:[file]})?`<button class="btn pri big" data-v="share">↗ ${T('b_share')}</button>`:''}<button class="btn big" data-v="save">⬇ ${T('b_save')}</button><button class="link" data-v="0">${T('cancel')}</button></div>`,
 {onOpen:(s,close)=>$$('[data-v]',s).forEach(b=>b.onclick=()=>close(b.dataset.v))});
 if(r==='share'){try{await hold(()=>navigator.share({files:[file],title:file.name}));done=true;}catch(e){if(e.name!=='AbortError'){saveFile(file);done=true;}}}
 else if(r==='save'){saveFile(file);done=true;}if(done){LS.set('lastBackup',Date.now());toast(T('b_made'));}if(S.unlocked)rerender();return done;})();}
VIEWS.settings=async(p,V)=>{const q=await DB.get('meta','quick'),bio=await DB.get('meta','bio');const al=LS.get('autolock',1),cl=LS.get('clip',30),lb=LS.get('lastBackup',0);const D=S.decoy;
 let pers=null,est=null;try{pers=await navigator.storage.persisted();est=await navigator.storage.estimate();}catch(e){}
 if(!S.unlocked||S.stack[S.stack.length-1].view!=='settings')return;
 const seg=(name,vals,cur,lbl)=>`<div class="seg">${vals.map(v=>`<button data-${name}="${v}" aria-pressed="${v===cur}">${lbl(v)}</button>`).join('')}</div>`;
 V.innerHTML=`${topbar(T('settings'))}<main class="wrap">
 <h3 class="sec">${T('s_user')}</h3><input id="suser" class="inp" value="${esc(LS.get('user',''))}" placeholder="${T('s_user_ph')}" autocomplete="off">
 <h3 class="sec">${T('s_look')}</h3><label class="lbl">${T('s_lang')}</label>${seg('lang',LANGS.map(l=>l.c),CUR,c=>LANGS.find(l=>l.c===c).n)}<div id="slook"></div>
 <h3 class="sec">${T('s_security')}</h3>
 <div class="card"><label class="lbl" style="margin-top:0">${T('s_autolock')}</label>${seg('al',[0,1,5,15],al,v=>T('al_'+v))}<p class="mlbl">${T('idle_note')}</p>
 <label class="lbl">${T('s_clip')}</label>${seg('cl',[0,15,30,60],cl,v=>v?T('clip_s',{n:v}):T('clip_off'))}<p class="mlbl">${T('clip_note')}</p></div>
 ${D?'':`<div class="card"><div class="kv"><span>${T('s_bio')}</span><span>${bio?T('bio_on'):T('bio_off')}</span></div><div class="two" style="margin-top:8px">${bio?`<button class="btn" id="sbiox">${T('bio_remove')}</button>`:`<button class="btn" id="sbio">👆 ${T('bio_set')}</button>`}</div><p class="mlbl">${T('bio_note')}</p></div>
 <div class="card"><div class="kv"><span>${T('s_quick')}</span><span>${q?(q.kind==='pin'?T('q_is_pin'):T('q_is_pattern')):T('q_none')}</span></div>
 <div class="two" style="margin-top:8px"><button class="btn" id="sqpin">🔢 ${T('q_set_pin')}</button><button class="btn" id="sqpat">⠿ ${T('q_set_pattern')}</button></div>${q?`<button class="btn wide" id="sqx" style="margin-top:10px">${T('q_remove')}</button>`:''}<p class="mlbl">${T('q_note')}</p></div>`}
 <div class="two"><button class="btn" id="schpw">🔑 ${T('s_change_pw')}</button>${D?'':`<button class="btn" id="srec">🧾 ${T('s_new_rec')}</button>`}</div>
 ${D?'':`<button class="btn wide" id="skit" style="margin-top:10px">🧰 ${T('kit_t')}</button>
 ${S.decoyExists?`<div class="card" style="margin-top:10px"><p>${T('dcl_note')}</p><button class="btn wide" id="sdcx" style="margin-top:8px">${T('dcl_t')}</button></div>`:''}`}
 <h3 class="sec">${T('s_items')}</h3><button class="btn wide" id="stpl">🧩 ${T('tpl_t')} (${templates().length})</button>
 <h3 class="sec">${T('s_backup')}</h3><div class="card"><p class="mlbl" style="margin:0 0 10px">${lb?T('b_last',{d:fmtDate(lb)}):T('b_never')}</p><div class="stack"><button class="btn pri" id="sbk">🛡️ ${T('b_export')}</button>${D?'':`<button class="btn" id="srs">↩ ${T('b_import')}</button>`}</div><p class="mlbl">${T('b_hint')}</p></div>
 <div class="card"><div class="stack"><button class="btn" id="scsv">📥 ${T('csv_import')}</button><p class="mlbl">${T('csv_note')}</p><button class="btn danger" id="scsvx">📤 ${T('csv_export')}</button></div></div>
 <h3 class="sec">${T('s_storage')}</h3><div class="card"><p>${pers===true?T('st_persist_ok'):T('st_persist_no')}</p>${est&&est.usage!=null?`<p class="mlbl">${T('st_used',{u:fmtSize(est.usage)})}</p>`:''}
 ${S.unreadable&&!S.decoyExists?`<p class="mtext" style="color:var(--warn)">${T('unreadable',{n:S.unreadable})}</p>`:''}
 ${location.hostname===SHARED_HOST?`<p class="mtext" style="color:var(--warn);margin-bottom:0">${esc(T('shared_origin',{h:SHARED_HOST}))}</p>`:''}</div>
 <h3 class="sec">${T('s_help')}</h3><div class="two"><button class="btn" id="sguide">📖 ${T('s_guide')}</button><button class="btn" data-go="about">ℹ️ ${T('about')}</button></div>
 <a class="btn wide" style="margin-top:10px;text-decoration:none" href="privacy_policy.html" target="_blank" rel="noopener">🔒 ${T('s_privacy')}</a>
 ${D?'':`<h3 class="sec">${T('s_danger')}</h3><button class="btn danger wide" id="sreset">${T('reset_all')}</button>`}${foot()}</main>`;
 wire(V);lookControls($('#slook',V));const on=(id,fn)=>{const e=$('#'+id,V);if(e)e.onclick=fn;};
 $('#suser',V).oninput=e=>LS.set('user',e.target.value.slice(0,40));
 $$('[data-lang]',V).forEach(b=>b.onclick=()=>{setLang(b.dataset.lang);rerender();});
 $$('[data-al]',V).forEach(b=>b.onclick=()=>{LS.set('autolock',+b.dataset.al);rerender();});
 $$('[data-cl]',V).forEach(b=>b.onclick=()=>{LS.set('clip',+b.dataset.cl);rerender();});
 on('sbio',async()=>{if(!(await bioAvailable())){toast(T('bio_unsupported'),'bad');return;}doSetupBio();});
 on('sbiox',async()=>{await DB.del('meta','bio');toast(T('bio_removed'));rerender();});
 on('sqpin',()=>doSetupQuick('pin'));on('sqpat',()=>doSetupQuick('pattern'));
 on('sqx',async()=>{await DB.del('meta','quick');toast(T('q_removed'));rerender();});
 on('schpw',changePwDlg);on('skit',emergencyKit);on('sdcx',legacyDecoyDlg);on('stpl',async()=>{await templatesDlg();rerender();});
 on('srec',async()=>{if(!(await confirmDlg(T('new_rec_c'))))return;const code=await newRecovery();
  await modal(`<h3 class="mh">${T('rec_t')}</h3><p class="mtext">${T('rec_d')}</p><div class="reccode">${esc(code)}</div><button class="btn wide" id="nrc">⧉ ${T('rec_copy')}</button>
  <label class="chk"><input type="checkbox" id="nrk"> ${T('rec_check')}</label><div class="mact"><button class="btn pri" id="nrg" disabled>${T('done')}</button></div>`,
  {sticky:true,onOpen:(s,close)=>{$('#nrc',s).onclick=()=>copyText(code);$('#nrk',s).onchange=e=>{$('#nrg',s).disabled=!e.target.checked;};$('#nrg',s).onclick=()=>close();}});await mustBackupAfterKeys();});
 on('sbk',backupDlg);on('srs',restoreFlow);
 on('scsv',async()=>{const [f]=await pickFile($('#fcsv'));if(!f)return;const list=csvToLogins(await f.text());if(!list.length){toast(T('csv_none'),'bad');return;}
  const r=await importLogins(list);toast(T('csv_done',r));await confirmDlg(T('csv_delete_hint'),{ok:T('confirm'),no:T('close')});rerender();});
 on('scsvx',async()=>{const w=T('export_word');const a=await promptDlg(T('csv_export_t'),{text:T('csv_export_warn',{w}),danger:true,ok:T('csv_export')});
  if(a==null||a.trim()!==w)return;const {n,text}=loginsCSV();saveFile(new File(['\uFEFF'+text],`vaultnest-passwords-PLAINTEXT-${ymd()}.csv`,{type:'text/csv'}));toast(T('csv_exported',{n}));});
 on('sguide',()=>modal('<div id="gh"></div>',{onOpen:(s,close)=>obSlides($('#gh',s),()=>close(),false)}));
 on('sreset',async()=>{if(!(await confirmDlg(T('reset_c1'),{danger:true,ok:T('delete')})))return;const w=T('reset_word');
  const a=await promptDlg(T('reset_c2',{w}),{danger:true,ok:T('delete')});if(a==null||a.trim()!==w)return;
  bcast('vault-changed');teardown();const res=await DB.exclusiveDo(()=>DB.wipe());try{await caches.delete('vaultnest-share');await caches.delete(INBOX);}catch(e){}
  if(res!=='ok'){await alertDlg(T('reset_blocked'));location.reload();return;}LS.clearAll();toast(T('reset_done'));setTimeout(()=>location.reload(),700);});
 if(S.keepY!=null)window.scrollTo(0,S.keepY);};
function changePwDlg(){return modal(`<h3 class="mh">${T('s_change_pw')}</h3><label class="lbl" for="chc">${T('cur_pw')}</label><div class="pwbox"><input id="chc" class="inp" type="password" dir="ltr" autocomplete="current-password" autofocus><button type="button" class="eye" data-eye="chc">👁</button></div>
 ${pwFields('ch')}<div class="err" id="cherr" role="alert"></div><div class="mact"><button class="btn" data-a="x">${T('cancel')}</button><button class="btn pri" data-a="s">${T('save')}</button></div>`,
 {sticky:true,onOpen:(s,close)=>{bindMeter($('#ch1',s),$('#chm',s),$('#chml',s));$('[data-a=x]',s).onclick=()=>close();
  $('[data-a=s]',s).onclick=async()=>{const err=$('#cherr',s);try{const raw=await unwrapPw($('#chc',s).value);raw.fill(0);}catch(e){err.textContent=T('wrong_pw');return;}
   const pw=await readPwFields(s,'ch',err);if(!pw)return;await setMasterPw(S.dekRaw,pw,sess());toast(T('pw_changed'));close();await mustBackupAfterKeys();};}});}
/* ================= about ================= */
VIEWS.about=async(p,V)=>{const errs=JSON.parse(localStorage.getItem(LSP+'errlog')||'[]');
 V.innerHTML=`${topbar(T('about'))}<main class="wrap"><div style="text-align:center;margin:10px 0 18px"><div class="dialwrap" style="margin:0 auto 8px;width:110px">${dialSVG()}</div>
 <h2 style="font-family:var(--fd);color:var(--acc);font-size:1.6rem">VaultNest</h2><p class="mlbl">${T('app_sub')} · ${T('ab_version')} ${APP_VERSION}</p></div>
 <div class="card"><div class="kv"><span>${T('ab_version')}</span><span>${APP_VERSION}</span></div><div class="kv"><span>${T('ab_dev')}</span><span>Barak Aflalo</span></div>
 <div class="kv"><span>${T('ab_platform')}</span><span>PWA · HTML5</span></div><div class="kv"><span>${T('ab_storage')}</span><span>${T('ab_storage_v')}</span></div><div class="kv"><span>${T('ab_license')}</span><span>© AppNest 2026</span></div></div>
 <h3 class="sec">${T('ab_security')}</h3><div class="card"><p>${T('sec_text')}</p></div>
 <div class="stack" style="margin-top:14px"><a class="btn" href="${STORE_URL}" target="_blank" rel="noopener" style="text-decoration:none">🏪 ${T('ab_store')}</a>
 <button class="btn" id="ashare">↗ ${T('ab_share')}</button><a class="btn" href="mailto:${FEEDBACK}?subject=VaultNest%20${APP_VERSION}" style="text-decoration:none">✉️ ${T('ab_feedback')}</a>
 <button class="btn" id="aguide">📖 ${T('s_guide')}</button><a class="btn" href="privacy_policy.html" target="_blank" rel="noopener" style="text-decoration:none">🔒 ${T('s_privacy')}</a></div>
 <div class="card" style="margin-top:14px"><p class="mlbl" style="margin:0">${T('ab_disclaimer')}</p></div>
 <button class="btn wide" id="adiag" style="margin-top:6px">🧰 ${T('ab_diag')}</button><p class="mlbl" style="text-align:center">${T('ab_diag_note')}</p>${foot()}</main>`;
 wire(V);$('#ashare',V).onclick=async()=>{const u=location.origin+location.pathname;const txt='VaultNest — '+T('app_sub')+(LS.get('user','')?' ('+LS.get('user','')+')':'');
  if(navigator.share){try{await hold(()=>navigator.share({title:'VaultNest',text:txt,url:u}));}catch(e){}}else copyText(u);};
 $('#aguide',V).onclick=()=>modal('<div id="gh"></div>',{onOpen:(s,close)=>obSlides($('#gh',s),()=>close(),false)});
 $('#adiag',V).onclick=async()=>{let pers='?',sw='none';try{pers=await navigator.storage.persisted();}catch(e){}if(navigator.serviceWorker&&navigator.serviceWorker.controller)sw='active';
  const bio=!!(await DB.get('meta','bio')),q=await DB.get('meta','quick');
  const rep=['VaultNest '+APP_VERSION,'origin: '+location.origin,'ua: '+navigator.userAgent,'lang: '+CUR+' theme: '+LS.get('theme','gold')+'/'+LS.get('mode','night'),
   'standalone: '+matchMedia('(display-mode: standalone)').matches,'persisted: '+pers,'sw: '+sw,'caches: '+(window.caches?(await caches.keys()).join(','):'-'),'modules: '+(window.__MODLIST||[]).map(n=>n+(window.__MODS[n]?'✓':'✗')).join(' '),'items: '+S.items.length+' files: '+S.files.length,
   'quick: '+(q?q.kind:'none')+' bio: '+bio,'webauthn: '+!!window.PublicKeyCredential,'errors:',...errs.map(e=>new Date(e.t).toISOString()+' '+e.m+' @'+e.s+':'+e.l)].join('\n');
  await modal(`<h3 class="mh">${T('ab_diag')}</h3><pre class="card mono" style="white-space:pre-wrap;font-size:.78rem;direction:ltr;text-align:left">${esc(rep)}</pre><div class="mact"><button class="btn" data-v="c">⧉ ${T('copy')}</button><button class="btn pri" data-v="x">${T('close')}</button></div>`,
   {onOpen:(s,close)=>{$('[data-v=c]',s).onclick=()=>copyText(rep);$('[data-v=x]',s).onclick=()=>close();}});};};

/* ================= prefs & boot ================= */
function setLang(c){CUR=LANG[c]?c:'en';LS.set('lang',CUR);const h=document.documentElement;h.lang=CUR;h.dir=RTL.includes(CUR)?'rtl':'ltr';const sk=$('.skip');if(sk)sk.textContent=T('skip_link');}
function applyLook(){const h=document.documentElement;h.dataset.theme=LS.get('theme','gold');h.dataset.mode=LS.get('mode','night');
 const bg=getComputedStyle(h).getPropertyValue('--bg').trim()||'#000';const m=$('meta[name=theme-color]');if(m)m.content=bg;}
function detectLang(){const n=(navigator.language||'he').slice(0,2).toLowerCase();return LANG[n]?n:(n==='iw'?'he':'en');}
async function boot(){setLang(LS.get('lang',detectLang()));applyLook();
 const sq=/[?&]share=(\w+)/.exec(location.search);if(sq){try{history.replaceState(null,'',location.pathname);}catch(e){}
  setTimeout(()=>{if(sq[1]==='nokey')toast(T('in_nokey'),'bad');else if(sq[1]==='err')toast(T('in_err'),'bad');else if(sq[1]==='full')toast(T('in_full'),'bad');else if(sq[1]==='big')toast(T('in_big'),'bad');else if(!S.unlocked)toast(T('in_arrived'));},700);}
 try{if(window.caches)caches.delete('vaultnest-share');}catch(e){} // remove any unencrypted leftovers from 1.1.0 share-to-vault
 if(location.protocol==='file:'){fatal(T('fatal_file'));return;}
 if(!window.crypto||!crypto.subtle||!window.indexedDB){fatal(T('fatal_crypto'));return;}
 try{await DB.open();}catch(e){fatal(T('fatal_storage'));return;}
 const meta=await DB.get('meta','vault');if(meta)showUnlock();else if(LS.get('onboarded',false))showCreate();else showOnboard();
 if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(e=>logErr('sw '+e.message));}

window.vaultBoot=boot;

window.__MODS['app-views']='1.2.2';
