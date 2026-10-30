(function(){
'use strict';
const SB='https://icaobhgzpkvdcarttwwe.supabase.co', KEY='sb_publishable_MZTFXHTGwB_jeaekeh-cEQ_akSammLu';
const H={apikey:KEY,'Content-Type':'application/json'};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 다른 사람이 올린 값은 믿지 않고, 알려진 커버·YouTube 주소만 써요
const safeCover=u=>typeof u==='string'&&/^https:\/\/([a-z0-9-]+\.mzstatic\.com|[a-z0-9-]+\.dzcdn\.net)\//i.test(u)?u:null;
const safeLink=u=>typeof u==='string'&&/^https:\/\/((www|m|music)\.youtube\.com|youtu\.be)\//i.test(u)?u:null;
const PERIOD={'6':'최근 6개월','12':'1년','0':'전체'};
const fmtDate=s=>{const d=new Date(s);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`};
let posts=[], more=true, loading=false;

async function api(path,opt={}){
  const r=await fetch(SB+'/rest/v1/'+path,{...opt,headers:{...H,...(opt.headers||{})}});
  const text=await r.text(); let d=null; try{d=text?JSON.parse(text):null}catch(_){}
  if(!r.ok) throw Object.assign(new Error((d&&d.message)||r.status),{data:d});
  return d;
}
const COLS='id,created_at,nickname,title,period,size,albums';
async function loadMore(){
  if(loading||!more) return; loading=true; $('feedMore').disabled=true;
  try{
    const before=posts.length?'&created_at=lt.'+encodeURIComponent(posts[posts.length-1].created_at):'';
    const d=await api(`posts?select=${COLS}&order=created_at.desc&limit=24${before}`);
    posts=posts.concat(d); more=d.length===24; renderFeed();
  }catch(e){ $('feedEmpty').hidden=false; $('feedEmpty').textContent='게시판을 불러오지 못했어요.' }
  loading=false; $('feedMore').disabled=false; $('feedMore').hidden=!more;
}
function gridHTML(p,{links}){
  const n=Math.min(5,Math.max(3,p.size|0)), al=(Array.isArray(p.albums)?p.albums:[]).slice(0,n*n);
  return `<div class="grid" style="--n:${n}">`+Array.from({length:n*n},(_,i)=>{const a=al[i]; if(!a) return '<div class="tile empty"></div>';
    const c=safeCover(a.c), u=safeLink(a.u);
    const inner=c?`<img src="${esc(c)}" alt="${esc(a.al)} — ${esc(a.ar)}" loading="lazy">`:`<div class="ph"><b>${esc(a.al)}</b>${esc(a.ar)}</div>`;
    const tip=`${esc(a.al)} — ${esc(a.ar)}${a.t?' · ▶ '+esc(a.t):''}`;
    return links&&u?`<a class="tile" href="${esc(u)}" target="_blank" rel="noopener" title="${tip}">${inner}<span class="rank">${i+1}</span></a>`:`<div class="tile" title="${tip}">${inner}</div>`}).join('')+'</div>';
}
function renderFeed(){
  $('feedEmpty').hidden=posts.length>0; if(!posts.length) $('feedEmpty').textContent='아직 올라온 탑스터가 없어요.';
  $('feed').innerHTML=posts.map((p,i)=>`<button type="button" class="card" data-i="${i}">${gridHTML(p,{links:false})}
    <span class="card-t">${esc(p.title)}</span><span class="card-m">${esc(p.nickname)} · ${fmtDate(p.created_at)}</span></button>`).join('');
}
function openPost(p){
  const n=Math.min(5,Math.max(3,p.size|0)), al=(Array.isArray(p.albums)?p.albums:[]).slice(0,n*n);
  $('viewBody').innerHTML=`<div class="poster"><div class="poster-head"><h2>${esc(p.title)}</h2><span class="poster-meta">${esc(p.nickname)} · ${PERIOD[p.period]||''} · ${fmtDate(p.created_at)}</span></div>
    <div class="poster-body">${gridHTML(p,{links:true})}<ol class="list">${al.map((a,i)=>`<li class="${i>0&&i%n===0?'row-break':''}"><span><span class="al">${esc(a.al)}</span> <span class="ar">— ${esc(a.ar)}</span></span></li>`).join('')}</ol></div></div>`;
  $('viewDel').onclick=()=>delPost(p);
  $('viewDlg').showModal();
  try{history.replaceState(null,'','#p='+p.id)}catch(_){}
}
$('feed').addEventListener('click',e=>{const b=e.target.closest('.card'); if(b) openPost(posts[+b.dataset.i])});
$('viewDlg').addEventListener('close',()=>{try{history.replaceState(null,'',location.pathname)}catch(_){}});
$('viewClose').addEventListener('click',()=>$('viewDlg').close());
async function delPost(p){
  const pw=prompt('올릴 때 정한 비밀번호를 입력해 주세요'); if(!pw) return;
  try{ const ok=await api('rpc/delete_post',{method:'POST',body:JSON.stringify({p_id:p.id,p_password:pw})});
    if(!ok){alert('비밀번호가 맞지 않아요.');return}
    posts=posts.filter(x=>x.id!==p.id); renderFeed(); $('viewDlg').close();
  }catch(e){alert('지우지 못했어요. 잠시 후 다시 시도해 주세요.')}
}

/* 게시하기 */
$('postBtn').addEventListener('click',()=>{
  if(!window.Topster||!Topster.ready()){alert('앨범을 다 찾은 뒤에 올릴 수 있어요.');return}
  const s=Topster.snapshot(); $('pTitle').value=s.title.slice(0,40);
  try{$('pNick').value=localStorage.getItem('topster-nick')||''}catch(_){}
  $('pErr').hidden=true; $('postDlg').showModal();
});
$('postCancel').addEventListener('click',()=>$('postDlg').close());
$('postForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const s=Topster.snapshot(), nick=$('pNick').value.trim(), title=$('pTitle').value.trim(), pw=$('pPw').value;
  const err=m=>{$('pErr').textContent=m;$('pErr').hidden=false};
  if(!nick||!title) return err('닉네임과 제목을 적어 주세요.');
  if(pw.length<4) return err('비밀번호는 4자 이상으로 정해 주세요.');
  const albums=s.albums.map(a=>({al:String(a.al||'').slice(0,120),ar:String(a.ar||'').slice(0,80),c:safeCover(a.c),u:safeLink(a.u),t:a.t?String(a.t).slice(0,120):null,p:a.p|0}));
  $('postSubmit').disabled=true;
  try{
    const id=await api('rpc/create_post',{method:'POST',body:JSON.stringify({p_nickname:nick,p_title:title,p_period:s.period,p_size:s.size,p_albums:albums,p_password:pw})});
    try{localStorage.setItem('topster-nick',nick)}catch(_){}
    $('postDlg').close(); $('pPw').value='';
    const p={id,created_at:new Date().toISOString(),nickname:nick,title,period:s.period,size:s.size,albums};
    posts.unshift(p); renderFeed(); $('feedSec').scrollIntoView({behavior:'smooth'});
  }catch(e){ err(/rate/.test(e.message)?'짧은 시간에 너무 많이 올렸어요. 조금 뒤에 다시 올려 주세요.':'올리지 못했어요. 잠시 후 다시 시도해 주세요.') }
  $('postSubmit').disabled=false;
});
$('feedMore').addEventListener('click',loadMore);

loadMore().then(async()=>{
  const m=location.hash.match(/^#p=([0-9a-f-]{36})$/i); if(!m) return;
  let p=posts.find(x=>x.id===m[1]);
  if(!p) try{ p=(await api(`posts?select=${COLS}&id=eq.${m[1]}`))[0] }catch(_){}
  if(p) openPost(p);
});
})();
