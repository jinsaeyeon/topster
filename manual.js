(function(){
'use strict';
const $=id=>document.getElementById(id);
const A=window.__app, state=A.state;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='topster-manual';
const ytSearch=(a,t)=>'https://www.youtube.com/results?search_query='+encodeURIComponent(a+' '+t);
const mk=(album,artist,cover)=>({album,artist,cover,plays:0,tracks:[{artist,track:album,plays:0,url:ytSearch(artist,album)}]});
function persist(){ try{localStorage.setItem(KEY,JSON.stringify(state.albums.map(a=>({al:a.album,ar:a.artist,c:a.cover||null}))))}catch(_){} }
function changed(){ A.render(false); persist();
  document.dispatchEvent(new Event(state.albums.length?'topster:done':'topster:start')) }

/* ---------- 들어가기 / 나가기 ---------- */
function enter(){
  state.run++; state.mode='manual';
  let saved=[]; try{saved=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){}
  state.albums=Array.isArray(saved)?saved.filter(x=>x&&x.al).map(x=>mk(String(x.al),String(x.ar||''),x.c||null)):[];
  $('howto').hidden=true; $('err').hidden=true; $('board').hidden=false; $('detail').hidden=true;
  $('period').hidden=true; $('autoNote').hidden=true; $('mPanel').hidden=false;
  $('status').textContent=''; $('posterMeta').textContent='직접 만든 탑스터'; $('saveBtn').disabled=false;
  if($('posterTitle').textContent.trim()==='') $('posterTitle').textContent='나의 탑스터';
  changed(); $('mQuery').focus();
}
$('manualBtn').addEventListener('click',enter);
document.addEventListener('topster:auto',()=>{ $('period').hidden=false; $('autoNote').hidden=false; $('mPanel').hidden=true });

/* ---------- 앨범 검색 (Deezer 우선, 일본어·결과 없음이면 iTunes) ---------- */
let seq=0, tmr=null, results=[];
const hasKana=s=>/[぀-ヿ]/.test(s), hasHangul=s=>/[가-힣]/.test(s);
async function search(q){
  const my=++seq; $('mResults').innerHTML='<p class="hint">찾는 중…</p>';
  let out=[];
  if(!hasKana(q)) try{ const d=await A.jsonp('https://api.deezer.com/search/album?limit=24&output=jsonp&q='+encodeURIComponent(q));
    out=(d&&d.data||[]).map(x=>({al:x.title,ar:x.artist&&x.artist.name,c:x.cover_big||x.cover_medium})) }catch(_){}
  if(my!==seq) return;
  if(out.length<4) try{ const cc=hasKana(q)?'JP':hasHangul(q)?'KR':'US';
    const d=await A.jsonp(`https://itunes.apple.com/search?entity=album&limit=24&country=${cc}&term=`+encodeURIComponent(q));
    out=out.concat((d&&d.results||[]).map(x=>({al:x.collectionName,ar:x.artistName,c:x.artworkUrl100&&x.artworkUrl100.replace(/\/\d+x\d+bb\./,'/600x600bb.')}))) }catch(_){}
  if(my!==seq) return;
  const seen=new Set(); results=out.filter(r=>{const k=(r.al+'|'+r.ar).toLowerCase(); if(!r.al||seen.has(k)) return false; seen.add(k); return true});
  $('mResults').innerHTML=results.length?results.map((r,i)=>`<button type="button" class="mres" data-r="${i}" title="${esc(r.al)} — ${esc(r.ar)}">${r.c?`<img src="${esc(r.c)}" alt="" loading="lazy">`:'<span class="ph"></span>'}<b>${esc(r.al)}</b><span>${esc(r.ar)}</span></button>`).join(''):'<p class="hint">검색 결과가 없어요.</p>';
}
$('mQuery').addEventListener('input',e=>{ clearTimeout(tmr); const q=e.target.value.trim(); if(!q){$('mResults').innerHTML='';seq++;return} tmr=setTimeout(()=>search(q),350) });
$('mQuery').addEventListener('keydown',e=>{ if(e.key==='Enter'){ clearTimeout(tmr); const q=e.target.value.trim(); if(q) search(q) } });
$('mResults').addEventListener('click',e=>{
  const b=e.target.closest('.mres'); if(!b) return; const r=results[+b.dataset.r];
  const n=state.n*state.n;
  if(state.albums.length>=n){ alert(`${state.n}×${state.n} 칸이 가득 찼어요. 앨범을 빼거나 크기를 키워 주세요.`); return }
  if(state.albums.some(a=>a.album===r.al&&a.artist===r.ar)) return;
  state.albums.push(mk(r.al,r.ar,r.c||null)); changed();
  b.classList.add('added'); setTimeout(()=>b.classList.remove('added'),600);
});

/* ---------- 빼기 / 순서 바꾸기 ---------- */
$('grid').addEventListener('click',e=>{
  const rm=e.target.closest('.rm'); if(!rm||state.mode!=='manual') return;
  state.albums.splice(+rm.dataset.rm,1); changed();
});
let drag=null;
document.addEventListener('pointerdown',e=>{
  if(state.mode!=='manual') return;
  const t=e.target.closest('#grid .mtile'); if(!t||e.target.closest('.rm')||e.button>0) return;
  e.preventDefault(); const r=t.getBoundingClientRect();
  drag={t,from:+t.dataset.i,dx:e.clientX-r.left,dy:e.clientY-r.top,sx:e.clientX,sy:e.clientY,moved:false,ghost:null,over:null};
});
document.addEventListener('pointermove',e=>{
  if(!drag) return;
  if(!drag.moved){ if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<4) return;
    drag.moved=true; const r=drag.t.getBoundingClientRect(); drag.ghost=drag.t.cloneNode(true); drag.ghost.className='tile mtile mghost';
    drag.ghost.style.width=r.width+'px'; drag.ghost.style.height=r.height+'px'; document.body.appendChild(drag.ghost); drag.t.classList.add('dragging') }
  drag.ghost.style.left=(e.clientX-drag.dx)+'px'; drag.ghost.style.top=(e.clientY-drag.dy)+'px';
  const el=document.elementFromPoint(e.clientX,e.clientY), over=el&&el.closest('#grid .tile');
  if(drag.over&&drag.over!==over) drag.over.classList.remove('target');
  drag.over=over; if(over&&over!==drag.t) over.classList.add('target');
});
function end(e){
  if(!drag) return; const d=drag; drag=null;
  if(!d.moved) return;
  d.ghost.remove(); d.t.classList.remove('dragging'); if(d.over) d.over.classList.remove('target');
  if(!d.over||d.over===d.t) return;
  const tiles=[...$('grid').children]; let to=tiles.indexOf(d.over); to=Math.min(to,state.albums.length-1);
  const [x]=state.albums.splice(d.from,1); state.albums.splice(to,0,x); changed();
}
document.addEventListener('pointerup',end);
document.addEventListener('pointercancel',()=>{ if(drag&&drag.ghost){drag.ghost.remove();drag.t.classList.remove('dragging')} drag=null });
})();
