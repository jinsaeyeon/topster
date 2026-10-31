(function(){
'use strict';
// 비밀번호 입력창: 브라우저 기본 prompt는 글자가 그대로 보여서, 가려지는 입력칸으로 직접 띄워요
function askPassword(cls){
  return new Promise(res=>{
    const d=document.createElement('dialog'); d.className=cls;
    d.innerHTML='<form method="dialog" class="pw-form"><h3>삭제</h3><label>올릴 때 정한 비밀번호<input type="password" name="pw" autocomplete="current-password" required minlength="1"></label><div class="pw-btns"><button type="button" class="btn ghost pw-cancel">취소</button><button class="btn pw-ok" value="ok">삭제</button></div></form>';
    document.body.appendChild(d);
    const inp=d.querySelector('input'); let out=null;
    d.querySelector('.pw-cancel').onclick=()=>d.close();
    d.querySelector('form').addEventListener('submit',()=>{ out=inp.value });
    d.addEventListener('click',e=>{ if(e.target===d){ const r=d.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) d.close() } });
    d.addEventListener('close',()=>{ d.remove(); res(out||null) });
    d.showModal(); inp.focus();
  });
}
const SB='https://icaobhgzpkvdcarttwwe.supabase.co', KEY='sb_publishable_MZTFXHTGwB_jeaekeh-cEQ_akSammLu';
const H={apikey:KEY,'Content-Type':'application/json'};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 다른 사람이 올린 값은 믿지 않고, 알려진 커버·YouTube 주소만 써요
const safeCover=u=>typeof u==='string'&&/^https:\/\/([a-z0-9-]+\.mzstatic\.com|[a-z0-9-]+\.dzcdn\.net)\/|^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(?:mqdefault|hqdefault|sddefault|maxresdefault|hq720)\.jpg$/i.test(u)?u:null;
const safeLink=u=>{ if(typeof u!=='string'||!/^https:\/\/((www|m|music)\.youtube\.com|youtu\.be)\//i.test(u)) return null;
  const m=u.match(/(?:[?&]v=|youtu\.be\/)([\w-]{11})/); return m?'https://www.youtube.com/watch?v='+m[1]:u.replace('://music.youtube.com','://www.youtube.com') };
const PERIOD={'6':'최근 6개월','12':'1년','0':'전체'};
const fmtDate=s=>{const d=new Date(s);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`};
const TM=()=>window.TierMaker;
const kindBadge=k=>k==='cover'?'<span class="kind kind-cover">앨범 아트 기준</span>':k==='music'?'<span class="kind">곡 기준</span>':'';

async function api(path,opt={}){
  const r=await fetch(SB+'/rest/v1/'+path,{...opt,headers:{...H,...(opt.headers||{})}});
  const text=await r.text(); let d=null; try{d=text?JSON.parse(text):null}catch(_){}
  if(!r.ok) throw Object.assign(new Error((d&&d.message)||r.status),{data:d});
  return d;
}
const PCOLS='id,created_at,nickname,title,period,size,albums', TCOLS='id,created_at,post_id,nickname,title,kind,tiers,albums';

/* ---------- 게시판 목록 (탑스터 / 티어표) ---------- */
const feeds={
  posts:{items:[],more:true,loading:false,path:b=>`posts?select=${PCOLS}&order=created_at.desc&limit=24${b}`,empty:'아직 올라온 탑스터가 없어요.'},
  tiers:{items:[],more:true,loading:false,path:b=>`tierlists?select=${TCOLS}&order=created_at.desc&limit=24${b}`,empty:'아직 올라온 티어표가 없어요.'},
};
let tab='posts';
async function loadMore(kind=tab){
  const f=feeds[kind]; if(f.loading||!f.more) return; f.loading=true; $('feedMore').disabled=true;
  try{ const last=f.items[f.items.length-1];
    const d=await api(f.path(last?'&created_at=lt.'+encodeURIComponent(last.created_at):''));
    f.items=f.items.concat(d); f.more=d.length===24;
  }catch(e){ f.error=true }
  f.loading=false; f.loaded=true; if(kind===tab) renderFeed();
}
function gridHTML(p,{links}){
  const n=Math.min(5,Math.max(3,p.size|0)), al=(Array.isArray(p.albums)?p.albums:[]).slice(0,n*n);
  return `<div class="grid" style="--n:${n}">`+Array.from({length:n*n},(_,i)=>{const a=al[i]; if(!a) return '<div class="tile empty"></div>';
    const c=safeCover(a.c), u=safeLink(a.u);
    const inner=c?`<img src="${esc(c)}" alt="${esc(a.al)} — ${esc(a.ar)}" loading="lazy">`:`<div class="ph"><b>${esc(a.al)}</b>${esc(a.ar)}</div>`;
    if(!links) return `<div class="tile">${inner}</div>`;
    const info=`<span class="info"><b>${esc(a.al)}</b><span>${esc(a.ar)}</span>${a.p>0?`<em>${(a.p|0).toLocaleString()}회 재생</em>`:''}</span>`;
    return u?`<a class="tile" href="${esc(u)}" target="_blank" rel="noopener" aria-label="${esc(a.al)} — ${esc(a.ar)}">${inner}<span class="rank">${i+1}</span>${info}</a>`:`<div class="tile" tabindex="0">${inner}${info}</div>`}).join('')+'</div>';
}
// 검색: 제목·닉네임·앨범·아티스트 이름에서 찾아요 (검색할 땐 전체 글을 한 번 불러와요)
let query='', shown=[];
const hay=p=>[p.title,p.nickname,...(Array.isArray(p.albums)?p.albums.flatMap(a=>[a.al,a.ar]):[])].join(' ').toLowerCase();
async function ensureAll(kind){ const f=feeds[kind]; if(f.all) return; try{ f.all=await api(f.path('').replace('limit=24','limit=1000')) }catch(_){ f.all=f.items } }
function renderFeed(){
  const f=feeds[tab];
  const words=query.toLowerCase().split(/\s+/).filter(Boolean);
  shown=words.length?(f.all||f.items).filter(p=>{const h=hay(p); return words.every(w=>h.includes(w))}):f.items;
  $('feedEmpty').hidden=shown.length>0||!f.loaded; $('feedEmpty').textContent=f.error?'게시판을 불러오지 못했어요.':words.length?'검색 결과가 없어요.':f.empty;
  $('feed').className='feed'+(tab==='tiers'?' feed-tiers':'');
  $('feed').innerHTML=shown.map((p,i)=>`<button type="button" class="card" data-i="${i}">${tab==='posts'?gridHTML(p,{links:false}):TM().renderStatic(p,{small:true})}
    <span class="card-t">${tab==='tiers'?kindBadge(p.kind):''}${esc(p.title)}</span><span class="card-m">${esc(p.nickname)} · ${fmtDate(p.created_at)}${tab==='tiers'&&p.post_id?' · 탑스터 댓글':''}</span></button>`).join('');
  $('feedMore').hidden=!f.more||!f.loaded||!!words.length;
}
let qT=null;
$('feedSearch').addEventListener('input',e=>{ clearTimeout(qT); qT=setTimeout(async()=>{ query=e.target.value.trim(); if(query) await ensureAll(tab); renderFeed() },250) });
document.querySelectorAll('#feedTabs button').forEach(b=>b.addEventListener('click',()=>{
  tab=b.dataset.f; document.querySelectorAll('#feedTabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  (async()=>{ if(query) await ensureAll(tab); renderFeed(); if(!feeds[tab].loaded) loadMore() })();
}));
$('feed').addEventListener('click',e=>{const b=e.target.closest('.card'); if(!b) return; const it=shown[+b.dataset.i]; tab==='posts'?openPost(it):openTier(it)});
$('feedMore').addEventListener('click',()=>loadMore());

/* ---------- 탑스터 보기 + 티어표 댓글 ---------- */
let cur=null, maker=null;
function openPost(p){
  cur=p; maker=null;
  const n=Math.min(5,Math.max(3,p.size|0)), al=(Array.isArray(p.albums)?p.albums:[]).slice(0,n*n);
  $('viewBody').innerHTML=`<div class="poster"><div class="poster-head"><h2>${esc(p.title)}</h2><span class="poster-meta">${esc(p.nickname)} · ${al.every(a=>!(a.p>0))?'직접 만든 탑스터':(PERIOD[p.period]||'')+(al[0]&&al[0].ed?' · 자동 · 편집됨':'')} · ${fmtDate(p.created_at)}</span></div>
    <div class="poster-body">${gridHTML(p,{links:true})}<ol class="list">${al.map((a,i)=>`<li class="${i>0&&i%n===0?'row-break':''}"><span><span class="al">${esc(a.al)}</span> <span class="ar">— ${esc(a.ar)}</span></span>${a.p>0?`<span class="cnt">${(a.p|0).toLocaleString()}</span>`:''}</li>`).join('')}</ol></div></div>
    <section class="comments">
      <div class="comments-h"><h3>티어표 <span class="hint" id="cCount"></span></h3><button type="button" class="btn primary" id="cMake">이 탑스터로 티어표 만들기</button></div>
      <div id="cMaker" hidden></div>
      <div class="dlg-btns" id="cMakerBtns" hidden><button type="button" class="btn" id="cCancel">취소</button><button type="button" class="btn" id="cReset">처음으로</button><button type="button" class="btn primary" id="cPost">댓글 달기</button></div>
      <div id="cList"><p class="hint">불러오는 중…</p></div>
    </section>`;
  $('viewDel').onclick=()=>delItem('post',p);
  $('cMake').onclick=()=>{ maker=TM().create($('cMaker'),al,{title:p.title+' 티어표'}); $('cMaker').hidden=false; $('cMakerBtns').hidden=false; $('cMake').hidden=true; $('cMaker').scrollIntoView({behavior:'smooth',block:'start'}) };
  $('cCancel').onclick=()=>{ maker=null; $('cMaker').hidden=true; $('cMaker').innerHTML=''; $('cMakerBtns').hidden=true; $('cMake').hidden=false };
  $('cReset').onclick=()=>{ if(maker){ maker.reset(); $('cPost').classList.remove('hl') } };
  $('cMaker').addEventListener('tierchange',()=>$('cPost').classList.toggle('hl',!!maker&&maker.placed()>0));
  $('cPost').onclick=()=>{ if(!maker) return; if(!maker.placed()){alert('앨범을 한 개 이상 줄에 놓아 주세요.');return} postTier(maker,p.id) };
  if(!$('viewDlg').open) $('viewDlg').showModal();
  $('viewDlg').scrollTop=0;
  try{history.replaceState(null,'','#p='+p.id)}catch(_){}
  loadComments(p);
}
async function loadComments(p){
  let list=[]; try{ list=await api(`tierlists?select=${TCOLS}&post_id=eq.${p.id}&order=created_at.desc&limit=50`) }catch(_){ if(cur===p) $('cList').innerHTML='<p class="hint">티어표를 불러오지 못했어요.</p>'; return }
  if(cur!==p) return;
  $('cCount').textContent=list.length?list.length+'개':'';
  $('cList').innerHTML=list.length?list.map((t,i)=>`<article class="comment"><div class="comment-h">${kindBadge(t.kind)}<b>${esc(t.nickname)}</b><span class="hint">${esc(t.title)} · ${fmtDate(t.created_at)}</span><button type="button" class="link-btn" data-del="${i}">삭제</button></div>${TM().renderStatic({...t,title:'',albums:p.albums})}</article>`).join(''):'<p class="hint">아직 달린 티어표가 없어요.</p>';
  $('cList').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>delItem('tier',list[+b.dataset.del]));
}
function openTier(t){
  cur=null; maker=null;
  $('viewBody').innerHTML=`<div class="poster-head"><h2>${kindBadge(t.kind)}${esc(t.title)}</h2><span class="poster-meta">${esc(t.nickname)} · ${fmtDate(t.created_at)}</span></div>${TM().renderStatic({...t,title:''})}${t.post_id?'<div class="origin"><button type="button" class="btn" id="tOrigin">이 티어표를 단 탑스터 보기</button></div>':''}`;
  $('viewDel').onclick=()=>delItem('tier',t);
  if(t.post_id) $('tOrigin').onclick=async()=>{ try{ const p=feeds.posts.items.find(x=>x.id===t.post_id)||(await api(`posts?select=${PCOLS}&id=eq.${t.post_id}`))[0]; if(p) openPost(p); else alert('원래 탑스터가 지워졌어요.') }catch(_){ alert('불러오지 못했어요.') } };
  $('viewDlg').showModal();
  try{history.replaceState(null,'','#t='+t.id)}catch(_){}
}
$('viewDlg').addEventListener('close',()=>{cur=null;maker=null;try{history.replaceState(null,'',location.pathname)}catch(_){}});
$('viewClose').addEventListener('click',()=>$('viewDlg').close());

async function delItem(kind,it){
  const pw=await askPassword('dlg'); if(!pw) return;
  try{ const ok=await api(kind==='post'?'rpc/delete_post':'rpc/delete_tier',{method:'POST',body:JSON.stringify({p_id:it.id,p_password:pw})});
    if(!ok){alert('비밀번호가 맞지 않아요.');return}
    if(kind==='post'){ feeds.posts.items=feeds.posts.items.filter(x=>x.id!==it.id); $('viewDlg').close() }
    else if(it.post_id&&cur){ feeds.tiers.items=feeds.tiers.items.filter(x=>x.id!==it.id); loadComments(cur) }
    else { feeds.tiers.items=feeds.tiers.items.filter(x=>x.id!==it.id); $('viewDlg').close() }
    renderFeed();
  }catch(e){alert('지우지 못했어요. 잠시 후 다시 시도해 주세요.')}
}

/* ---------- 올리기 (탑스터 / 티어표 / 티어표 댓글) ---------- */
let pending=null;
function openForm(kind,{title,heading,submit}){
  pending=kind; $('postHead').textContent=heading; $('postSubmit').textContent=submit;
  $('pTitle').value=String(title||'').slice(0,40);
  try{$('pNick').value=localStorage.getItem('topster-nick')||''}catch(_){}
  $('pErr').hidden=true; $('postDlg').showModal();
}
$('postBtn').addEventListener('click',()=>{
  if(!window.Topster||!Topster.ready()){alert('앨범을 다 찾은 뒤에 올릴 수 있어요.');return}
  openForm({type:'post'},{title:Topster.snapshot().title,heading:'게시판에 올리기',submit:'올리기'});
});
function postTier(m,postId){
  const d=m.data();
  openForm({type:'tier',maker:m,postId},{title:d.title,heading:postId?'티어표 댓글 달기':'티어표 게시판에 올리기',submit:postId?'댓글 달기':'올리기'});
}
$('postCancel').addEventListener('click',()=>$('postDlg').close());
const cleanAlbums=list=>list.map(a=>{const o={al:String(a.al||'').slice(0,120),ar:String(a.ar||'').slice(0,80),c:safeCover(a.c),u:safeLink(a.u),t:a.t?String(a.t).slice(0,120):null,p:a.p|0}; if(a.ed) o.ed=1; return o});
$('postForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!pending) return;
  const nick=$('pNick').value.trim(), title=$('pTitle').value.trim(), pw=$('pPw').value;
  const err=m=>{$('pErr').textContent=m;$('pErr').hidden=false};
  if(!nick||!title) return err('닉네임과 제목을 적어 주세요.');
  if(pw.length<4) return err('비밀번호는 4자 이상으로 정해 주세요.');
  $('postSubmit').disabled=true;
  try{
    if(pending.type==='post'){
      const s=Topster.snapshot(), albums=cleanAlbums(s.albums);
      const id=await api('rpc/create_post',{method:'POST',body:JSON.stringify({p_nickname:nick,p_title:title,p_period:s.period,p_size:s.size,p_albums:albums,p_password:pw})});
      feeds.posts.all=null; feeds.posts.items.unshift({id,created_at:new Date().toISOString(),nickname:nick,title,period:s.period,size:s.size,albums});
      showTab('posts');
    } else {
      const {maker:m,postId}=pending, d=m.data(), albums=cleanAlbums(m.albums);
      const tiers=d.tiers.map(r=>({l:r.l||'?',c:TM().safeColor(r.c),i:r.i}));
      const id=await api('rpc/create_tier',{method:'POST',body:JSON.stringify({p_post_id:postId,p_kind:d.kind,p_nickname:nick,p_title:title,p_tiers:tiers,p_albums:albums,p_password:pw})});
      feeds.tiers.all=null; feeds.tiers.items.unshift({id,created_at:new Date().toISOString(),post_id:postId,kind:d.kind,nickname:nick,title,tiers,albums});
      if(postId){ if(cur&&cur.id===postId){ $('cCancel').click(); loadComments(cur) } if(tab==='tiers') renderFeed() }
      else showTab('tiers');
    }
    try{localStorage.setItem('topster-nick',nick)}catch(_){}
    $('postDlg').close(); $('pPw').value='';
  }catch(e){ err(/rate/.test(e.message)?'짧은 시간에 너무 많이 올렸어요. 조금 뒤에 다시 올려 주세요.':'올리지 못했어요. 잠시 후 다시 시도해 주세요.') }
  $('postSubmit').disabled=false;
});
function showTab(k){ const b=document.querySelector(`#feedTabs button[data-f="${k}"]`); if(b) b.click(); if(!$('viewDlg').open) $('feedSec').scrollIntoView({behavior:'smooth'}) }

// 창 바깥(어두운 부분)을 누르면 닫혀요
['viewDlg','postDlg'].forEach(id=>{ const d=$(id); let downOut=false;
  const outside=e=>{const r=d.getBoundingClientRect(); return e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)};
  d.addEventListener('pointerdown',e=>{downOut=outside(e)});
  d.addEventListener('click',e=>{ if(downOut&&outside(e)) d.close(); downOut=false }); });
window.Board={postTier};

loadMore('posts').then(async()=>{
  const m=location.hash.match(/^#([pt])=([0-9a-f-]{36})$/i); if(!m) return;
  try{
    if(m[1]==='p'){ const p=feeds.posts.items.find(x=>x.id===m[2])||(await api(`posts?select=${PCOLS}&id=eq.${m[2]}`))[0]; if(p) openPost(p) }
    else { const t=(await api(`tierlists?select=${TCOLS}&id=eq.${m[2]}`))[0]; if(t) openTier(t) }
  }catch(_){}
});
})();
