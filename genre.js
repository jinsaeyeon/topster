(function(){
'use strict';
// 미분류(또는 이웃으로 추정한) 아티스트를 음악 검색(Deezer·iTunes)으로 찾아 장르를 칠해요.
// 찾은 결과는 모두가 함께 쓰도록 Supabase(artist_genres)에 저장해요.
const M=window.__map; if(!M) return;
const SB='https://icaobhgzpkvdcarttwwe.supabase.co/rest/v1/', KEY='sb_publishable_MZTFXHTGwB_jeaekeh-cEQ_akSammLu';
const H={apikey:KEY,'Content-Type':'application/json'};
const $=id=>document.getElementById(id);
const st=()=>$('aiStatus');
const TRIED='map-genre-tried-v1';
let tried={}; try{tried=JSON.parse(localStorage.getItem(TRIED)||'{}')||{}}catch(_){tried={}}
const saveTried=()=>{try{localStorage.setItem(TRIED,JSON.stringify(tried))}catch(_){}};

let cbN=0;
function jsonp(url,timeout=9000){
  return new Promise((res,rej)=>{ const name='__gj'+(cbN++), s=document.createElement('script'); let done=false;
    const fin=()=>{done=true;delete window[name];s.remove()};
    window[name]=d=>{if(done)return;fin();res(d)}; s.onerror=()=>{if(done)return;fin();rej(new Error('net'))};
    setTimeout(()=>{if(done)return;fin();rej(new Error('timeout'))},timeout);
    s.src=url+(url.includes('?')?'&':'?')+'callback='+name; document.head.appendChild(s) });
}
let dzNext=0, itNext=0;
async function dz(path){ const now=Date.now(), at=Math.max(now,dzNext); dzNext=at+150; if(at>now) await new Promise(r=>setTimeout(r,at-now)); return jsonp('https://api.deezer.com/'+path+(path.includes('?')?'&':'?')+'output=jsonp') }
async function it(path){ const now=Date.now(), at=Math.max(now,itNext); itNext=at+3300; if(at>now) await new Promise(r=>setTimeout(r,at-now)); return jsonp('https://itunes.apple.com/'+path) }

const key=n=>M.nz(n);
const same=(ours,theirs)=>{ const a=[ours,...M.nameVariants(ours)].map(M.nz).filter(Boolean), b=[theirs,...M.nameVariants(theirs)].map(M.nz).filter(Boolean);
  return a.some(x=>b.includes(x)) };
const hangul=s=>/[가-힣]/.test(s), kana=s=>/[぀-ヿ]/.test(s);

// Deezer 장르 번호 → 지도 장르 (애매한 Pop·Asian Music은 null)
const DZ={116:'힙합·R&B',165:'힙합·R&B',152:'인디·록',85:'인디·록',106:'EDM',113:'EDM',464:'메탈·코어',173:'OST',169:'그루브·펑크',129:'기타',98:'기타',466:'기타',144:'기타',153:'기타',84:'기타'};
function fromITunes(g,name){
  g=String(g||'').toLowerCase();
  if(/hip-?hop|rap|r&b|soul/.test(g)) return '힙합·R&B';
  if(/metal/.test(g)) return '메탈·코어';
  if(/rock|alternative|indie|punk|singer\/songwriter/.test(g)) return '인디·록';
  if(/electronic|dance|house|techno|edm|electronica|dubstep|trance/.test(g)) return 'EDM';
  if(/soundtrack|score/.test(g)) return 'OST';
  if(/funk|disco/.test(g)) return '그루브·펑크';
  if(/k-?pop|korean/.test(g)) return 'K-pop';
  if(/j-?pop|anime|japan|vocaloid|j-?rock/.test(g)) return 'J-pop·J-rock';
  if(/pop/.test(g)) return kana(name)?'J-pop·J-rock':hangul(name)?'K-pop':'팝';
  if(g) return '기타';
  return null;
}
async function viaDeezer(name){
  const d=await dz('search/artist?limit=3&q='+encodeURIComponent(name)).catch(()=>null);
  const a=(d&&d.data||[]).find(x=>same(name,x.name)); if(!a) return null;
  const al=await dz(`artist/${a.id}/albums?limit=25`).catch(()=>null), cnt={}; let n=0;
  (al&&al.data||[]).forEach(x=>{ if(x.genre_id>0){ cnt[x.genre_id]=(cnt[x.genre_id]||0)+1; n++ } });
  const top=Object.entries(cnt).sort((x,y)=>y[1]-x[1])[0]; if(!top||top[1]/n<0.55) return null;
  return DZ[top[0]]||null;
}
async function viaITunes(name){
  const cc=kana(name)?'JP':'US';
  const d=await it(`search?entity=musicArtist&limit=3&country=${cc}&term=`+encodeURIComponent(name)).catch(()=>null);
  const a=(d&&d.results||[]).find(x=>same(name,x.artistName)); if(!a) return null;
  return fromITunes(a.primaryGenreName,name);
}

async function shared(names){
  if(!names.length) return {};
  const keys=[...new Set(names.map(key))].filter(Boolean), out={};
  for(let i=0;i<keys.length;i+=60){
    const q=keys.slice(i,i+60).map(k=>'"'+k.replace(/"/g,'')+'"').join(',');
    try{ const r=await fetch(SB+'artist_genres?select=key,genre&key=in.('+encodeURIComponent(q)+')',{headers:H}); if(r.ok) (await r.json()).forEach(x=>out[x.key]=x.genre) }catch(_){}
  }
  return out;
}
let pending=[];
async function flush(){
  if(!pending.length) return; const items=pending.splice(0,60);
  try{ await fetch(SB+'rpc/save_genres',{method:'POST',headers:H,body:JSON.stringify({p_items:items})}) }catch(_){}
}

let running=false, again=false;
async function run(){
  if(running){ again=true; return } running=true;
  try{
    const list=M.unknownArtists().slice(0,150).map(a=>a.name).filter(n=>!tried[key(n)]);
    if(!list.length) return;
    // 1) 다른 사람이 이미 찾아 둔 장르
    const got=await shared(list), apply={};
    list.forEach(n=>{ const g=got[key(n)]; if(g){ apply[M.norm(n)]=g; tried[key(n)]=1 } });
    if(Object.keys(apply).length){ M.setGenres(apply); saveTried() }
    // 2) 나머지는 직접 검색 (많이 들은 순)
    const todo=list.filter(n=>!tried[key(n)]); let done=0, batch={};
    const show=()=>{ const s=st(); if(s) s.innerHTML=done<todo.length?`장르 찾는 중<span class="dots" aria-hidden="true"></span> ${done}/${todo.length}`:'' };
    show();
    for(const n of todo){
      let g=null, src='';
      try{ g=await viaDeezer(n); src='deezer' }catch(_){}
      if(!g){ try{ g=await viaITunes(n); src='itunes' }catch(_){} }
      tried[key(n)]=1; done++;
      if(g){ batch[M.norm(n)]=g; pending.push({k:key(n),n:n.slice(0,80),g,s:src}) }
      if(done%8===0||done===todo.length){ if(Object.keys(batch).length){ M.setGenres(batch); batch={} } saveTried(); flush() }
      show();
    }
    flush();
  } finally { running=false; if(again){ again=false; setTimeout(run,500) } }
}
// 지도를 새로 그릴 때마다(기록을 넣거나 기간을 바꿀 때) 새 미분류가 있으면 찾아요
let t=null;
const kick=()=>{ clearTimeout(t); t=setTimeout(()=>{ const s=M.state; if(s&&s.source==='upload') run() },1200) };
new MutationObserver(kick).observe($('stats'),{childList:true,subtree:true,characterData:true});
})();
