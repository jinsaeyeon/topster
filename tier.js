(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TIERS=[['SS','#ff7f7f'],['S','#ffbf7f'],['A+','#ffdf7f'],['A','#ffff7f'],['B','#bfff7f'],['C','#7fff7f']];
let items=[], built=false;

function itemHTML(a,i){
  const inner=a.c?`<img src="${esc(a.c)}" alt="" crossorigin="anonymous">`:`<div class="ph"><b>${esc(a.al)}</b>${esc(a.ar)}</div>`;
  return `<div class="titem" data-id="${i}" aria-label="${esc(a.al)} — ${esc(a.ar)}">${inner}<span class="info"><b>${esc(a.al)}</b>${esc(a.ar)}<em>${a.p.toLocaleString()}회</em></span></div>`;
}
function build(){
  items=Topster.top(25); built=true;
  $('tierRows').innerHTML=TIERS.map(([t,c],r)=>`<div class="tier-row"><div class="tier-label" contenteditable="true" spellcheck="false" style="background:${c}">${t}</div><div class="tier-drop" data-row="${r}"></div></div>`).join('');
  $('tierPool').innerHTML=items.map(itemHTML).join('');
}
document.addEventListener('topster:done',()=>{ built=false; if(!$('tierView').hidden) build() });

/* 보기 전환 */
document.querySelectorAll('#viewTabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#viewTabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  const tier=b.dataset.v==='tier'; $('tierView').hidden=!tier; $('topsterView').hidden=tier;
  if(tier){ if(!window.Topster||!Topster.ready()){ $('tierPool').innerHTML=''; $('tierRows').innerHTML='<p class="hint" style="padding:12px;color:#9a97a3">앨범을 다 찾으면 티어표를 만들 수 있어요.</p>'; built=false; return }
    if(!built) build() }
}));
$('tierReset').addEventListener('click',()=>{ if(Topster.ready()) build() });

/* 끌어서 놓기 (마우스·터치 모두) */
let drag=null;
const zones=()=>[...document.querySelectorAll('#tierView .tier-drop,#tierView .tier-pool')];
function zoneAt(x,y){ const el=document.elementFromPoint(x,y); return el&&el.closest('.tier-drop,.tier-pool') }
function caretPos(zone,x,y){
  const kids=[...zone.querySelectorAll('.titem:not(.dragging)')];
  for(const k of kids){ const r=k.getBoundingClientRect(); if(y<r.top) return k; if(y<=r.bottom&&x<r.left+r.width/2) return k }
  return null;
}
document.addEventListener('pointerdown',e=>{
  const it=e.target.closest('#tierView .titem'); if(!it||e.button>0) return;
  e.preventDefault();
  const r=it.getBoundingClientRect();
  drag={it,dx:e.clientX-r.left,dy:e.clientY-r.top,sx:e.clientX,sy:e.clientY,moved:false,ghost:null,caret:document.createElement('div')};
  drag.caret.className='caret';
});
document.addEventListener('pointermove',e=>{
  if(!drag) return;
  if(!drag.moved){ if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<4) return;
    drag.moved=true; drag.ghost=drag.it.cloneNode(true); drag.ghost.classList.add('ghost');
    const r=drag.it.getBoundingClientRect(); drag.ghost.style.width=r.width+'px'; drag.ghost.style.height=r.height+'px';
    document.body.appendChild(drag.ghost); drag.it.classList.add('dragging') }
  drag.ghost.style.left=(e.clientX-drag.dx)+'px'; drag.ghost.style.top=(e.clientY-drag.dy)+'px';
  zones().forEach(z=>z.classList.remove('over'));
  const z=zoneAt(e.clientX,e.clientY);
  if(z){ z.classList.add('over'); const before=caretPos(z,e.clientX,e.clientY); z.insertBefore(drag.caret,before) } else drag.caret.remove();
});
function endDrag(e){
  if(!drag) return;
  if(drag.moved){
    const z=e&&zoneAt(e.clientX,e.clientY);
    if(z&&drag.caret.parentNode===z) z.insertBefore(drag.it,drag.caret);
    drag.caret.remove(); drag.ghost.remove(); drag.it.classList.remove('dragging');
    zones().forEach(z=>z.classList.remove('over'));
  }
  drag=null;
}
document.addEventListener('pointerup',endDrag);
document.addEventListener('pointercancel',()=>endDrag(null));

/* 이미지 저장 */
function loadImg(src){return new Promise(r=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>r(im);im.onerror=()=>r(null);im.src=src})}
$('tierSave').addEventListener('click',async()=>{
  if(!built) return;
  const S=2, cell=100, lab=120, pad=24, titleH=56;
  const rows=[...document.querySelectorAll('#tierRows .tier-row')].map(r=>({label:r.querySelector('.tier-label').textContent.trim(),color:r.querySelector('.tier-label').style.background,ids:[...r.querySelectorAll('.titem')].map(x=>+x.dataset.id)}));
  const perRow=Math.max(8,...rows.map(r=>r.ids.length)), W=pad*2+lab+perRow*cell, H=pad*2+titleH+rows.length*cell;
  const cv=document.createElement('canvas'); cv.width=W*S; cv.height=H*S; const x=cv.getContext('2d'); x.scale(S,S);
  x.fillStyle='#111014'; x.fillRect(0,0,W,H);
  x.fillStyle='#f4f2ee'; x.font='900 28px "Noto Sans KR",sans-serif'; x.textBaseline='top'; x.fillText($('tierTitle').textContent.trim()||'앨범 티어표',pad,pad+4);
  const imgs=await Promise.all(items.map(a=>a.c?loadImg(a.c):null));
  rows.forEach((r,ri)=>{ const y=pad+titleH+ri*cell;
    x.fillStyle='#1c1b20'; x.fillRect(pad,y,lab+perRow*cell,cell-2);
    x.fillStyle=r.color; x.fillRect(pad,y,lab,cell-2);
    x.fillStyle='#17161a'; x.textAlign='center'; x.textBaseline='middle';
    let fs=30; x.font=`900 ${fs}px "Noto Sans KR",sans-serif`; while(x.measureText(r.label).width>lab-12&&fs>12){fs-=2;x.font=`900 ${fs}px "Noto Sans KR",sans-serif`}
    x.fillText(r.label,pad+lab/2,y+(cell-2)/2); x.textAlign='left'; x.textBaseline='top';
    r.ids.forEach((id,k)=>{ const cx=pad+lab+k*cell, a=items[id];
      if(imgs[id]) x.drawImage(imgs[id],cx,y,cell-2,cell-2);
      else{ x.fillStyle='#2b2930'; x.fillRect(cx,y,cell-2,cell-2); x.fillStyle='#f4f2ee'; x.font='700 11px "Noto Sans KR",sans-serif';
        let t=a.al; while(x.measureText(t).width>cell-12&&t.length>2) t=t.slice(0,-2)+'…'; x.fillText(t,cx+6,y+cell-34);
        x.fillStyle='#9a97a3'; x.font='400 10px "Noto Sans KR",sans-serif'; let s=a.ar; while(x.measureText(s).width>cell-12&&s.length>2) s=s.slice(0,-2)+'…'; x.fillText(s,cx+6,y+cell-18) } });
  });
  let url; try{ url=cv.toDataURL('image/png') }catch(_){ alert('일부 앨범 커버를 이미지로 저장할 수 없었어요. 화면을 캡처해 주세요.'); return }
  const a=document.createElement('a'); a.href=url; a.download='album-tier.png'; a.click();
});
})();
