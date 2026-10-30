(function(){
'use strict';
const M=window.__map, load=M.load; const state=new Proxy({},{get:(_,k)=>M.state[k],set:(_,k,v)=>{M.state[k]=v;return true}});
const SB='https://icaobhgzpkvdcarttwwe.supabase.co', KEY='sb_publishable_MZTFXHTGwB_jeaekeh-cEQ_akSammLu';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>{const d=new Date(s);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`};
async function api(path,opt={}){
  const r=await fetch(SB+'/rest/v1/'+path,{...opt,headers:{apikey:KEY,'Content-Type':'application/json'}});
  const t=await r.text(); let d=null; try{d=t?JSON.parse(t):null}catch(_){}
  if(!r.ok) throw new Error((d&&d.message)||r.status); return d;
}

/* ---------- 지금 지도를 올릴 수 있는 크기로 줄이기 ---------- */
function currentUse(){
  let use=state.includeYT?state.all:state.all.filter(p=>p.src!=='yt');
  if(state.scope==='track') use=use.filter(p=>p.src!=='yt'||p.topic);
  if(state.months){ const ts=state.all.map(p=>p.t).filter(isFinite);
    if(ts.length){const end=new Date(Math.max(...ts)), from=new Date(end); from.setMonth(from.getMonth()-state.months); use=use.filter(p=>p.t>=from.getTime())} }
  return use.filter(p=>!p.dup);
}
function snapshot(){
  const use=currentUse(), N=Math.min(150,+$('artistCount').value||100), m=new Map();
  for(const p of use){ if(!p.artist||!p.track) continue; let a=m.get(p.artist); if(!a){a={n:0,t:new Map()};m.set(p.artist,a)} a.n++; a.t.set(p.track,(a.t.get(p.track)||0)+1) }
  const ts=use.map(p=>p.t).filter(isFinite);
  const artists=[...m].sort((x,y)=>y[1].n-x[1].n).slice(0,N).map(([name,a])=>{
    const tr=[...a.t].sort((x,y)=>y[1]-x[1]), keep=tr.slice(0,12).map(([t,n])=>[t.slice(0,100),n]);
    // 나머지 곡은 이름 없이 개수와 재생 수만
    const rest=tr.slice(12); return rest.length?[name.slice(0,60),keep,[rest.length,rest.reduce((s,x)=>s+x[1],0)]]:[name.slice(0,60),keep] });
  return {v:1,from:ts.length?Math.min(...ts):null,to:ts.length?Math.max(...ts):null,months:state.months,scope:state.scope,artists};
}
function toPlays(d){
  const out=[], total=d.artists.reduce((s,[,tr,r])=>s+tr.reduce((x,[,n])=>x+n,0)+(Array.isArray(r)?r[1]:0),0), from=d.from||Date.now(), span=(d.to||from)-from; let i=0;
  const push=(artist,track)=>out.push({artist,track,t:from+span*(i++)/Math.max(1,total-1),src:'music'});
  for(const [artist,tr,rest] of d.artists){
    for(const [track,n] of tr) for(let k=0;k<n;k++) push(artist,track);
    if(Array.isArray(rest)){ const [cnt,plays]=rest; for(let k=0;k<plays;k++) push(artist,'그 외 곡 '+(k%Math.max(1,cnt)+1)) } }
  return out;
}

/* ---------- 다른 사람 지도 보기 ---------- */
let saved=null;
function view(p){
  if(!saved) saved={all:state.all,source:state.source,months:state.months,scope:state.scope};
  state.months=0; state.scope='all';
  load(toPlays(p.data),'upload');
  document.body.classList.add('viewing-shared');
  $('viewBanner').hidden=false; $('viewWho').textContent=`${p.nickname}님의 「${p.title}」을 보고 있어요`;
  $('addBtn').hidden=true; $('aiBtn').hidden=true; $('mapPost').hidden=true;
  $('viewDel').onclick=()=>del(p);
  try{history.replaceState(null,'','#m='+p.id)}catch(_){}
  window.scrollTo({top:0,behavior:'smooth'});
}
function back(){
  if(!saved) return; const s=saved; saved=null;
  state.months=s.months; state.scope=s.scope;
  document.querySelectorAll('#period button').forEach(x=>x.setAttribute('aria-pressed',+x.dataset.m===s.months));
  document.querySelectorAll('#scope button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.s===s.scope));
  load(s.all,s.source);
  document.body.classList.remove('viewing-shared'); $('viewBanner').hidden=true; syncPost();
  try{history.replaceState(null,'',location.pathname)}catch(_){}
}
$('viewBack').addEventListener('click',back);
async function del(p){
  const pw=prompt('올릴 때 정한 비밀번호를 입력해 주세요'); if(!pw) return;
  try{ const ok=await api('rpc/delete_map',{method:'POST',body:JSON.stringify({p_id:p.id,p_password:pw})});
    if(!ok){alert('비밀번호가 맞지 않아요.');return}
    items=items.filter(x=>x.id!==p.id); renderFeed(); back();
  }catch(_){alert('지우지 못했어요. 잠시 후 다시 시도해 주세요.')}
}

/* ---------- 게시판 목록 ---------- */
let items=[], more=true, loading=false;
async function loadMore(){
  if(loading||!more) return; loading=true;
  try{ const last=items[items.length-1];
    const d=await api(`maps?select=id,created_at,nickname,title,data&order=created_at.desc&limit=24${last?'&created_at=lt.'+encodeURIComponent(last.created_at):''}`);
    items=items.concat(d); more=d.length===24;
  }catch(_){ $('mapFeedEmpty').textContent='게시판을 불러오지 못했어요.'; $('mapFeedEmpty').hidden=false; loading=false; return }
  loading=false; renderFeed();
}
// 카드 미리보기: 많이 들은 아티스트를 장르 색 원으로 모아 그려요
function preview(a){
  try{
    const top=a.slice(0,30).map(([n,tr,r])=>({n,v:(Array.isArray(tr)?tr.reduce((x,y)=>x+(y[1]|0),0):0)+(Array.isArray(r)?r[1]|0:0)})).filter(x=>x.v>0);
    if(!top.length||!window.d3) return '';
    const max=top[0].v, circles=top.map(x=>({n:x.n,r:4+22*Math.sqrt(x.v/max)}));
    d3.packSiblings(circles); const enc=d3.packEnclose(circles), s=56/enc.r;
    return `<svg class="mprev" viewBox="-60 -60 120 120" aria-hidden="true">${circles.map((c,k)=>`<circle cx="${((c.x-enc.x)*s).toFixed(1)}" cy="${((c.y-enc.y)*s).toFixed(1)}" r="${(c.r*s*0.94).toFixed(1)}" fill="${M.gcol(M.genreOf(c.n))}" fill-opacity="${k<3?0.95:0.75}"/>`).join('')}</svg>`;
  }catch(_){ return '' }
}
function renderFeed(){
  $('mapFeedEmpty').hidden=items.length>0; if(!items.length) $('mapFeedEmpty').textContent='아직 올라온 생태계가 없어요.';
  $('mapFeed').innerHTML=items.map((p,i)=>{ const a=(p.data&&Array.isArray(p.data.artists)?p.data.artists:[]);
    const plays=a.reduce((s,[,tr,r])=>s+(Array.isArray(tr)?tr.reduce((x,y)=>x+(y[1]|0),0):0)+(Array.isArray(r)?r[1]|0:0),0);
    return `<button type="button" class="mcard" data-i="${i}">${preview(a)}<span class="mcard-t">${esc(p.title)}</span>
      <span class="mcard-a">${a.slice(0,6).map(x=>esc(x[0])).join(' · ')}</span>
      <span class="mcard-m">${esc(p.nickname)} · ${a.length}팀 · ${plays.toLocaleString()}회 · ${fmtDate(p.created_at)}</span></button>` }).join('');
  $('mapFeedMore').hidden=!more;
}
$('mapFeed').addEventListener('click',e=>{const b=e.target.closest('.mcard'); if(b) view(items[+b.dataset.i])});
$('mapFeedMore').addEventListener('click',loadMore);

/* ---------- 올리기 ---------- */
function syncPost(){ $('mapPost').hidden=state.source!=='upload'||!!saved }
setInterval(syncPost,1000);
$('mapPost').addEventListener('click',()=>{ try{$('mpNick').value=localStorage.getItem('topster-nick')||''}catch(_){}; $('mpErr').hidden=true; $('mapPostDlg').showModal() });
$('mpCancel').addEventListener('click',()=>$('mapPostDlg').close());
$('mapPostForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const nick=$('mpNick').value.trim(), title=$('mpTitle').value.trim(), pw=$('mpPw').value, err=m=>{$('mpErr').textContent=m;$('mpErr').hidden=false};
  if(!nick||!title) return err('닉네임과 제목을 적어 주세요.');
  if(pw.length<4) return err('비밀번호는 4자 이상으로 정해 주세요.');
  const data=snapshot(); if(!data.artists.length) return err('올릴 아티스트가 없어요.');
  $('mpSubmit').disabled=true;
  try{ const id=await api('rpc/create_map',{method:'POST',body:JSON.stringify({p_nickname:nick,p_title:title,p_data:data,p_password:pw})});
    try{localStorage.setItem('topster-nick',nick)}catch(_){}
    items.unshift({id,created_at:new Date().toISOString(),nickname:nick,title,data}); renderFeed();
    $('mapPostDlg').close(); $('mpPw').value=''; $('mapBoard').scrollIntoView({behavior:'smooth'});
  }catch(e){ err(/rate/.test(e.message)?'짧은 시간에 너무 많이 올렸어요. 조금 뒤에 다시 올려 주세요.':'올리지 못했어요. 잠시 후 다시 시도해 주세요.') }
  $('mpSubmit').disabled=false;
});
['mapPostDlg'].forEach(id=>{ const d=$(id); let o=false; const out=e=>{const r=d.getBoundingClientRect(); return e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)};
  d.addEventListener('pointerdown',e=>{o=out(e)}); d.addEventListener('click',e=>{ if(o&&out(e)) d.close(); o=false }) });

loadMore().then(async()=>{
  const m=location.hash.match(/^#m=([0-9a-f-]{36})$/i); if(!m) return;
  let p=items.find(x=>x.id===m[1]); if(!p) try{ p=(await api(`maps?select=id,created_at,nickname,title,data&id=eq.${m[1]}`))[0] }catch(_){}
  if(p) view(p);
});
})();
