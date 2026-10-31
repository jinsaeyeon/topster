(function(){
'use strict';
// 16:9 썸네일도 찌그러지지 않게 가운데를 정사각형으로 잘라 그려요
const drawSq=(x,im,dx,dy,s)=>{ const w=im.naturalWidth||im.width, hh=im.naturalHeight||im.height, m=Math.min(w,hh); x.drawImage(im,(w-m)/2,(hh-m)/2,m,m,dx,dy,s,s) };
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TIERS=[['SS','#ff7f7f'],['S','#ffbf7f'],['A+','#ffdf7f'],['A','#ffff7f'],['B','#bfff7f'],['C','#7fff7f']];
const safeColor=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#9a97a3';
const safeCover=u=>typeof u==='string'&&/^https:\/\/([a-z0-9-]+\.mzstatic\.com|[a-z0-9-]+\.dzcdn\.net)\/|^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(?:mqdefault|hqdefault|sddefault|maxresdefault|hq720)\.jpg$/i.test(u)?u:null;

function itemHTML(a,i){
  const c=safeCover(a.c);
  const inner=c?`<img src="${esc(c)}" alt="" crossorigin="anonymous">`:`<div class="ph"><b>${esc(a.al)}</b>${esc(a.ar)}</div>`;
  return `<div class="titem" data-id="${i}" aria-label="${esc(a.al)} — ${esc(a.ar)}">${inner}<span class="info"><b>${esc(a.al)}</b>${esc(a.ar)}${a.p>0?`<em>${(a.p|0).toLocaleString()}회</em>`:''}</span></div>`;
}

/* ---------- 만들기 (끌어서 놓기) ---------- */
const KIND={music:'곡 기준',cover:'앨범 아트 기준'};
function create(root,albums,{title='앨범 티어표'}={}){
  root.classList.add('tmk'); let kind='music';
  function reset(){
    root.innerHTML=`<div class="tier"><h2 class="tier-title" contenteditable="true" spellcheck="false">${esc(title)}</h2>
      ${TIERS.map(([t,c],r)=>`<div class="tier-row"><div class="tier-label" contenteditable="true" spellcheck="false" style="background:${c}" data-c="${c}">${t}</div><div class="tier-drop" data-row="${r}"></div></div>`).join('')}</div>
      <div class="tier-pool">${albums.map(itemHTML).join('')}</div>`;
  }
  reset();
  return {albums,reset,
    data(){ return {kind,title:root.querySelector('.tier-title').textContent.trim().slice(0,40)||'앨범 티어표',
      tiers:[...root.querySelectorAll('.tier-row')].map(r=>({l:r.querySelector('.tier-label').textContent.trim().slice(0,20),c:r.querySelector('.tier-label').dataset.c,i:[...r.querySelectorAll('.titem')].map(x=>+x.dataset.id)}))} },
    placed(){ return root.querySelectorAll('.tier-drop .titem').length },
    saveImage(){ return saveImage(this.data(),albums) }};
}

/* ---------- 보기 전용 ---------- */
function renderStatic(t,{small}={}){
  const albums=Array.isArray(t.albums)?t.albums:[], tiers=Array.isArray(t.tiers)?t.tiers:[];
  return `<div class="tier tier-static${small?' small':''}">${small||!t.title?'':`<h3 class="tier-title">${esc(t.title)}</h3>`}`+
    tiers.map(r=>`<div class="tier-row"><div class="tier-label" style="background:${safeColor(r.c)}">${esc(String(r.l||'').slice(0,20))}</div><div class="tier-drop">${
      (Array.isArray(r.i)?r.i:[]).filter(i=>Number.isInteger(i)&&albums[i]).map(i=>itemHTML(albums[i],i)).join('')}</div></div>`).join('')+'</div>';
}

/* ---------- 끌어서 놓기 (마우스·터치) ---------- */
let drag=null;
function zoneAt(x,y,root){ const el=document.elementFromPoint(x,y); const z=el&&el.closest('.tier-drop,.tier-pool'); return z&&root.contains(z)?z:null }
function caretPos(zone,x,y){
  for(const k of zone.querySelectorAll('.titem:not(.dragging)')){ const r=k.getBoundingClientRect(); if(y<r.top) return k; if(y<=r.bottom&&x<r.left+r.width/2) return k }
  return null;
}
document.addEventListener('pointerdown',e=>{
  const it=e.target.closest('.tmk .titem'); if(!it||e.button>0) return;
  e.preventDefault(); const r=it.getBoundingClientRect();
  drag={it,root:it.closest('.tmk'),dx:e.clientX-r.left,dy:e.clientY-r.top,sx:e.clientX,sy:e.clientY,moved:false,ghost:null,caret:Object.assign(document.createElement('div'),{className:'caret'})};
});
document.addEventListener('pointermove',e=>{
  if(!drag) return;
  if(!drag.moved){ if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<4) return;
    drag.moved=true; drag.ghost=drag.it.cloneNode(true); drag.ghost.classList.add('ghost');
    const r=drag.it.getBoundingClientRect(); drag.ghost.style.width=r.width+'px'; drag.ghost.style.height=r.height+'px';
    (drag.root.closest('dialog')||document.body).appendChild(drag.ghost); drag.it.classList.add('dragging') }
  drag.ghost.style.left=(e.clientX-drag.dx)+'px'; drag.ghost.style.top=(e.clientY-drag.dy)+'px';
  // 화면 위·아래 끝으로 끌면 스크롤해요
  const sc=drag.root.closest('dialog'), top=sc?sc.getBoundingClientRect().top:0, bot=sc?sc.getBoundingClientRect().bottom:innerHeight;
  const dy=e.clientY<top+60?-14:e.clientY>bot-60?14:0; if(dy) (sc||window).scrollBy(0,dy);
  drag.root.querySelectorAll('.over').forEach(z=>z.classList.remove('over'));
  const z=zoneAt(e.clientX,e.clientY,drag.root);
  if(z){ z.classList.add('over'); z.insertBefore(drag.caret,caretPos(z,e.clientX,e.clientY)) } else drag.caret.remove();
});
function endDrag(e){
  if(!drag) return;
  if(drag.moved){ const z=e&&zoneAt(e.clientX,e.clientY,drag.root);
    if(z&&drag.caret.parentNode===z){ z.insertBefore(drag.it,drag.caret); drag.root.dispatchEvent(new Event('tierchange')) }
    drag.caret.remove(); drag.ghost.remove(); drag.it.classList.remove('dragging');
    drag.root.querySelectorAll('.over').forEach(z=>z.classList.remove('over')) }
  drag=null;
}
document.addEventListener('pointerup',endDrag);
document.addEventListener('pointercancel',()=>endDrag(null));

/* ---------- 이미지 저장 ---------- */
function loadImg(src){return new Promise(r=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>r(im);im.onerror=()=>r(null);im.src=src})}
async function saveImage(d,albums){
  const S=2, cell=100, lab=120, pad=24, titleH=56, rows=d.tiers;
  const perRow=Math.max(8,...rows.map(r=>r.i.length)), W=pad*2+lab+perRow*cell, H=pad*2+titleH+rows.length*cell;
  const cv=document.createElement('canvas'); cv.width=W*S; cv.height=H*S; const x=cv.getContext('2d'); x.scale(S,S);
  x.fillStyle='#111014'; x.fillRect(0,0,W,H);
  x.fillStyle='#f4f2ee'; x.font='900 28px "Noto Sans KR",sans-serif'; x.textBaseline='top'; x.fillText(d.title,pad,pad+4);

  const imgs=await Promise.all(albums.map(a=>safeCover(a.c)?loadImg(a.c):null));
  rows.forEach((r,ri)=>{ const y=pad+titleH+ri*cell;
    x.fillStyle='#1c1b20'; x.fillRect(pad,y,lab+perRow*cell,cell-2);
    x.fillStyle=safeColor(r.c); x.fillRect(pad,y,lab,cell-2);
    x.fillStyle='#17161a'; x.textAlign='center'; x.textBaseline='middle';
    let fs=30; x.font=`900 ${fs}px "Noto Sans KR",sans-serif`; while(x.measureText(r.l).width>lab-12&&fs>12){fs-=2;x.font=`900 ${fs}px "Noto Sans KR",sans-serif`}
    x.fillText(r.l,pad+lab/2,y+(cell-2)/2); x.textAlign='left'; x.textBaseline='top';
    r.i.forEach((id,k)=>{ const cx=pad+lab+k*cell, a=albums[id]; if(!a) return;
      if(imgs[id]) drawSq(x,imgs[id],cx,y,cell-2);
      else{ x.fillStyle='#2b2930'; x.fillRect(cx,y,cell-2,cell-2); x.fillStyle='#f4f2ee'; x.font='700 11px "Noto Sans KR",sans-serif';
        let t=a.al; while(x.measureText(t).width>cell-12&&t.length>2) t=t.slice(0,-2)+'…'; x.fillText(t,cx+6,y+cell-34);
        x.fillStyle='#9a97a3'; x.font='400 10px "Noto Sans KR",sans-serif'; let s=a.ar; while(x.measureText(s).width>cell-12&&s.length>2) s=s.slice(0,-2)+'…'; x.fillText(s,cx+6,y+cell-18) } });
  });
  let url; try{ url=cv.toDataURL('image/png') }catch(_){ alert('일부 앨범 커버를 이미지로 저장할 수 없었어요. 화면을 캡처해 주세요.'); return }
  const a=document.createElement('a'); a.href=url; a.download='album-tier.png'; a.click();
}

window.TierMaker={create,renderStatic,safeColor,KIND};

/* ---------- 내 티어표 탭 ---------- */
let mine=null;
function buildMine(){ mine=create($('tierMount'),Topster.top(25)); $('tierPost').classList.remove('hl') }
$('tierMount').addEventListener('tierchange',()=>{ $('tierPost').classList.toggle('hl',!!mine&&mine.placed()>0) });
document.addEventListener('topster:done',()=>{ mine=null });
function show(tier){
  $('tierView').hidden=!tier; $('topsterView').hidden=tier;
  if(tier&&!mine) buildMine();
  $('board').scrollIntoView({behavior:'smooth',block:'start'});
}
$('tierBtn').addEventListener('click',()=>{ if(window.Topster&&Topster.ready()) show(true) });
$('tierBack').addEventListener('click',()=>show(false));
document.addEventListener('topster:start',()=>{ $('tierBtn').hidden=true; $('postBtn').disabled=true; $('postBtn').classList.remove('hl'); if(!$('tierView').hidden){$('tierView').hidden=true;$('topsterView').hidden=false} });
document.addEventListener('topster:done',()=>{ $('tierBtn').hidden=false; $('postBtn').disabled=false; $('postBtn').classList.add('hl') });
$('tierReset').addEventListener('click',()=>{ if(mine){ mine.reset(); $('tierPost').classList.remove('hl') } });
$('tierSave').addEventListener('click',()=>{ if(mine) mine.saveImage() });
$('tierPost').addEventListener('click',()=>{ if(!mine) return; if(!mine.placed()){alert('앨범을 한 개 이상 줄에 놓아 주세요.');return}
  window.Board&&Board.postTier(mine,null) });
})();
