(function(){
'use strict';
const $=id=>document.getElementById(id);
const A=window.__app, state=A.state;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='topster-manual';
const ytSearch=(a,t)=>'https://www.youtube.com/results?search_query='+encodeURIComponent(a+' '+t);
const mk=(album,artist,cover)=>({album,artist,cover,plays:0,tracks:[{artist,track:album,plays:0,url:ytSearch(artist,album)}]});
document.addEventListener('topster:cover',()=>{ if(state.mode==='manual') persist() });
function persist(){ try{localStorage.setItem(KEY,JSON.stringify(state.albums.map(a=>({al:a.album,ar:a.artist,c:a.cover||null}))))}catch(_){} }
function changed(){ A.render(false); persist();
  document.dispatchEvent(new Event(state.albums.length?'topster:done':'topster:start')) }

/* ---------- 들어가기 / 나가기 ---------- */
function enter(){
  state.run++; state.mode='manual';
  let saved=[]; try{saved=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){}
  state.albums=Array.isArray(saved)?saved.filter(x=>x&&x.al).map(x=>mk(String(x.al),String(x.ar||''),x.c||null)):[];
  $('howto').hidden=true; $('err').hidden=true; $('board').hidden=false; $('detail').hidden=true;
  $('vidBtn').hidden=true; $('undoEdit').hidden=true; $('addRec').hidden=true; $('period').hidden=true; $('autoNote').hidden=true; $('mPanel').hidden=false;
  $('status').textContent=''; $('posterMeta').textContent='직접 만든 탑스터'; $('saveBtn').disabled=false;
  if($('posterTitle').textContent.trim()==='') $('posterTitle').textContent='나의 탑스터';
  changed(); $('mQuery').focus();
}
$('manualBtn').addEventListener('click',enter);
document.addEventListener('topster:auto',()=>{ $('period').hidden=false; $('autoNote').hidden=false; $('mPanel').hidden=true });

/* ---------- 앨범 검색 (Deezer 우선, 일본어·결과 없음이면 iTunes) ---------- */
let seq=0, tmr=null, results=[];
const hasKana=s=>/[぀-ヿ]/.test(s), hasHangul=s=>/[가-힣]/.test(s);
// 앨범 이름이 로마자로만 올라간 경우(킁 → Keung)가 많아서, 앨범·곡·아티스트 검색을 함께 해요
const dz=(path,q,extra='')=>A.jsonp(`https://api.deezer.com/${path}?output=jsonp${extra}&q=`+encodeURIComponent(q)).then(d=>d&&d.data||[]).catch(()=>[]);
const dzAlbum=x=>{const c=x.cover_big||x.cover_medium; return {id:'dz'+x.id,al:x.title,ar:x.artist&&x.artist.name,c:c&&!/\/cover\/\//.test(c)?c:null}};
const itCache=new Map();
const itunes=path=>{ if(!itCache.has(path)) itCache.set(path,A.jsonp('https://itunes.apple.com/'+path).then(d=>d&&d.results||[]).catch(()=>{itCache.delete(path);return []})); return itCache.get(path) };
// 한글 앨범 이름을 로마자로도 맞춰 봐요 (킁 → keung)
const RI='g kk n d tt r m b pp s ss  j jj ch k t p h'.split(' '), RM='a ae ya yae eo e yeo ye o wa wae oe yo u wo we wi yu eu ui i'.split(' '), RF=' k k ks n nj nh t l lk lm lb ls lt lp lh m p ps t t ng t t k t p t'.split(' ');
const roman=s=>String(s).replace(/[\uac00-\ud7a3]/g,ch=>{const c=ch.charCodeAt(0)-0xac00; return RI[Math.floor(c/588)]+RM[Math.floor(c%588/28)]+RF[c%28]});
const norm=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
async function search(q){
  const my=++seq; $('mResults').innerHTML='<p class="hint">찾는 중<span class="dots" aria-hidden="true"></span></p>';
  const words=q.split(/\s+/).filter(Boolean);
  // "씨잼 킁"처럼 아티스트 + 앨범으로 쓴 경우: 앞부분을 아티스트로도 찾아봐요
  const artistQs=[...new Set([q,...(words.length>1?[words.slice(0,-1).join(' '),words[0]]:[])])];
  let out=[];
  if(!hasKana(q)){
    const [albums,tracks,...artistLists]=await Promise.all([dz('search/album',q,'&limit=24'),dz('search',q,'&limit=40'),...artistQs.map(a=>dz('search/artist',a,'&limit=4'))]);
    if(my!==seq) return;
    out=albums.map(dzAlbum).concat(tracks.filter(t=>t.album).map(t=>dzAlbum({...t.album,artist:t.artist})));
    // 같은 이름 아티스트가 여러 명으로 나뉘어 있어서(C Jamm / C JAMM) 위쪽 몇 명의 앨범을 모두 가져와요
    const seenA=new Set(), arts=[];
    artistLists.forEach((list,k)=>list.forEach(a=>{ if(seenA.has(a.id)) return; const qn=norm(artistQs[k]);
      const alias=(window.Core&&Core.nameVariants?[artistQs[k],...Core.nameVariants(artistQs[k])]:[artistQs[k]]).map(norm);
      if(a.nb_fan>50||alias.some(x=>x&&norm(a.name).includes(x))||norm(a.name)===qn){ seenA.add(a.id); arts.push(a) } }));
    const albumLists=await Promise.all(arts.slice(0,4).map(a=>A.jsonp(`https://api.deezer.com/artist/${a.id}/albums?limit=60&output=jsonp`).then(d=>(d&&d.data||[]).map(x=>dzAlbum({...x,artist:a}))).catch(()=>[])));
    if(my!==seq) return;
    const rest=words.length>1?norm(words[words.length-1]):'';
    let byArtist=albumLists.flat();
    if(rest){ const hit=byArtist.filter(x=>norm(x.al).includes(rest)); byArtist=hit.concat(byArtist.filter(x=>!hit.includes(x))) }
    out=out.concat(byArtist);
  }
  // iTunes: 아티스트를 찾아 그 아티스트의 앨범 전체를 가져와요 (Deezer에 없는 한국 앨범이 여기 있는 경우가 많아요: 킁, 12 …)
  const itA=x=>({al:x.collectionName,ar:x.artistName,c:x.artworkUrl100&&x.artworkUrl100.replace(/\/\d+x\d+bb\./,'/600x600bb.')});
  const cc=hasKana(q)?'JP':'US';
  try{
    const [albums,...arts]=await Promise.all([itunes(`search?entity=album&limit=24&country=${cc}&term=`+encodeURIComponent(q)),
      ...artistQs.slice(0,3).map(a=>itunes(`search?entity=musicArtist&limit=2&country=${cc}&term=`+encodeURIComponent(a)))]);
    if(my!==seq) return;
    const ids=[...new Set([...arts.map(l=>l[0]),...arts.flat()].filter(Boolean).map(a=>a.artistId).filter(Boolean))].slice(0,3);
    // 한국 스토어는 검색은 안 되지만 아티스트 앨범 목록은 나와서, 한국에만 있는 앨범도 같이 가져와요
    const lists=await Promise.all(ids.flatMap((id,k)=>[itunes(`lookup?id=${id}&entity=album&limit=200&country=${cc}`),...(k===0&&cc!=='JP'?[itunes(`lookup?id=${id}&entity=album&limit=200&country=KR`)]:[])]));
    if(my!==seq) return;
    const rest=words.length>1?norm(words[words.length-1]):'', restR=norm(roman(words[words.length-1]||''));
    const hasRest=x=>rest&&(norm(x.al).includes(rest)||norm(x.al).includes(restR));
    let byArtist=lists.flat().filter(x=>x.wrapperType==='collection').map(itA);
    // 피처링 싱글보다 본인 앨범을 먼저, 검색어(앨범 이름)와 맞는 걸 맨 앞에
    const score=x=>(hasRest(x)?4:0)+(/feat\.|\(with /i.test(x.al)?0:2)+(/ - Single$/.test(x.al)?0:1);
    byArtist.sort((a,b)=>score(b)-score(a));
    const itAlbums=albums.map(itA);
    out=rest?byArtist.filter(hasRest).concat(out,itAlbums,byArtist):out.concat(itAlbums,byArtist);
  }catch(_){}
  if(my!==seq) return;
  const seen=new Set(); results=out.filter(r=>{const k=r.id||(r.al+'|'+r.ar).toLowerCase(); const k2=(r.al+'|'+r.ar).toLowerCase(); if(!r.al||seen.has(k)||seen.has(k2)) return false; seen.add(k); seen.add(k2); return true}).slice(0,60);
  $('mResults').innerHTML=results.length?results.map((r,i)=>`<button type="button" class="mres" data-r="${i}" title="${esc(r.al)} — ${esc(r.ar)}">${r.c?`<img src="${esc(r.c)}" alt="${esc(r.al)} — ${esc(r.ar)}" loading="lazy">`:`<div class="ph"><b>${esc(r.al)}</b>${esc(r.ar)}</div>`}<b>${esc(r.al)}</b><span>${esc(r.ar)}</span></button>`).join(''):'<p class="hint">검색 결과가 없어요.</p>';
}
$('mQuery').addEventListener('input',e=>{ clearTimeout(tmr); const q=e.target.value.trim(); if(!q){$('mResults').innerHTML='';seq++;return} tmr=setTimeout(()=>search(q),650) });
$('mQuery').addEventListener('keydown',e=>{ if(e.key==='Enter'){ clearTimeout(tmr); const q=e.target.value.trim(); if(q) search(q) } });
$('mResults').addEventListener('click',e=>{
  const b=e.target.closest('.mres'); if(!b) return; const r=results[+b.dataset.r]; if(b.dataset.broken) r.c=null;
  const n=state.n*state.n;
  if(state.albums.length>=n){ alert('25칸이 가득 찼어요. 앨범을 하나 빼고 넣어 주세요.'); return }
  if(state.albums.some(a=>a.album===r.al&&a.artist===r.ar)) return;
  const added=mk(r.al,r.ar,r.c||null); state.albums.push(added); changed();
  if(!added.cover) A.fixCover(added).then(()=>persist());
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
