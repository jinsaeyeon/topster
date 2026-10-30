(function(){
'use strict';
const $=id=>document.getElementById(id);
const C=window.Core;
const state={all:null,months:6,n:5,showList:true,albums:[],run:0,mode:'auto'};

/* ---------- 기록 파일 읽기 (음악 지도와 같은 규칙) ---------- */
const SPOTIFY_FILE=/(StreamingHistory|Streaming_History_Audio|endsong)[^/]*\.json$/i;
const YT_WATCH=/(시청 기록|watch-history|視聴履歴)\.(json|html)$/i;
const YT_ACT=/(?:내\s?활동|my\s?activity|マイ\s?アクティビティ)\/youtube[^\/]*\/[^\/]+\.(json|html)$/i;
const isYTFile=n=>YT_WATCH.test(n)||YT_ACT.test(n);
function isSpotifyArr(arr){const e=Array.isArray(arr)&&arr.find(x=>x&&typeof x==='object'); return !!e&&('master_metadata_track_name' in e||'trackName' in e||'msPlayed' in e||'ms_played' in e)}
function parseSpotify(arr){
  const out=[];
  for(const e of arr){ if(!e) continue; let artist,track,t,ms,album;
    if('ms_played' in e){artist=e.master_metadata_album_artist_name;track=e.master_metadata_track_name;album=e.master_metadata_album_album_name;t=Date.parse(e.ts);ms=e.ms_played}
    else{artist=e.artistName;track=e.trackName;t=Date.parse(String(e.endTime||'').replace(' ','T')+(/Z$/.test(e.endTime||'')?'':':00Z'));ms=e.msPlayed}
    if(!artist||!track||!(ms>=30000)) continue;
    out.push({artist:String(artist),track:String(track),t,src:'spotify',album:album||null});
  }
  return out;
}
async function readEntries(files){
  const out=[];
  for(const f of files){
    if(/\.zip$/i.test(f.name)){
      const zip=await JSZip.loadAsync(f);
      for(const z of Object.values(zip.files)){ if(z.dir) continue; const n=z.name.normalize('NFC');
        if(SPOTIFY_FILE.test(n)||isYTFile(n)) out.push([n,await z.async('string'),f.name]); }
    } else out.push([f.name,await f.text(),f.name]);
  }
  return out;
}
async function loadFiles(files){
  const err=$('err'); err.hidden=true; if(!files||!files.length) return;
  try{
    const entries=await readEntries([...files]);
    let plays=[];
    const ytAll=entries.filter(([n])=>isYTFile(n)), groups=new Map();
    ytAll.forEach(e=>{const k=e[2]+'|'+(YT_ACT.test(e[0])?'act':'watch'); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(e)});
    const yt=[...groups.values()].map(g=>g.sort((x,y)=>(/\.json$/i.test(y[0])?1:0)-(/\.json$/i.test(x[0])?1:0))[0]);
    for(const [n,text] of yt) plays=plays.concat(/\.json$/i.test(n)?C.parseJSON(JSON.parse(text)):C.parseHTML(text));
    for(const e of entries){ const [n,text]=e; if(ytAll.includes(e)) continue;
      if(!/\.json$/i.test(n)&&!/^\s*\[/.test(text)){ if(!yt.length&&/<html|outer-cell/i.test(text)) plays=plays.concat(C.parseHTML(text)); continue }
      let arr; try{arr=JSON.parse(text)}catch(_){continue}
      if(isSpotifyArr(arr)) plays=plays.concat(parseSpotify(arr)); else if(!yt.length&&Array.isArray(arr)) plays=plays.concat(C.parseJSON(arr));
    }
    { const seen=new Set(); plays=plays.filter(p=>{const k=p.t+'|'+p.artist+'|'+p.track; if(isFinite(p.t)&&seen.has(k)) return false; seen.add(k); return true}); }
    if(plays.length<10){err.textContent='이 파일에서 음악 재생 기록을 찾지 못했어요. Google 테이크아웃의 YouTube 기록 zip이나 Spotify 데이터 zip을 압축 풀지 말고 그대로 넣어 주세요.';err.hidden=false;return}
    state.all=C.mergeAliases(C.cleanArtists(plays));
    state.mode='auto'; document.dispatchEvent(new Event('topster:auto'));
    $('howto').hidden=true; $('board').hidden=false;
    build();
  }catch(e){console.error(e);err.textContent='파일을 읽지 못했어요. 받은 zip 파일을 그대로 넣어 주세요.';err.hidden=false}
}

/* ---------- 곡 → 앨범 찾기 (Deezer·iTunes 검색, JSONP) ---------- */
let cbN=0;
function jsonp(url,timeout=9000){
  return new Promise((res,rej)=>{
    const name='__tp'+(cbN++), s=document.createElement('script'); let done=false;
    const fin=()=>{done=true;delete window[name];s.remove()};
    window[name]=d=>{if(done) return; fin(); res(d)};
    s.onerror=()=>{if(done) return; fin(); rej(new Error('net'))};
    setTimeout(()=>{if(done) return; fin(); rej(new Error('timeout'))},timeout);
    s.src=url+(url.includes('?')?'&':'?')+'callback='+name; document.head.appendChild(s);
  });
}
const K=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\(.*?\)|\[.*?\]|（.*?）/g,' ').replace(/\s[-–]\s.*$/,' ').replace(/[^\p{L}\p{N}]+/gu,'');
const cleanTrack=s=>String(s||'').replace(/\s*[\(\[（](?:feat|ft|prod|with|official|mv|m\/v|audio|lyric|live|visualizer|remaster|sped|slowed)[^\)\]）]*[\)\]）]/gi,'').replace(/\s+-\s*(?:music\s+)?(?:live\s+)?(?:video|ver\.?|version)\b.*$/i,'').replace(/\s+/g,' ').trim();
const albumBase=s=>String(s||'').replace(/\s*-\s*(single|ep)\s*$/i,'').replace(/\s*[\(\[](?:deluxe|remaster(?:ed)?|expanded|special|anniversary)[^\)\]]*[\)\]]/gi,'').trim();
const KO_REV=(()=>{const m={};for(const [k,v] of Object.entries(C.KO||{})){(m[K(v)]=m[K(v)]||[]).push(k)}return m})();
const alias=n=>[n,...(C.nameVariants(n)||[]),...(C.KO&&C.KO[n]?[C.KO[n]]:[]),...(KO_REV[K(n)]||[])];
const scriptOf=s=>/[\uac00-\ud7a3]/.test(s)?'ko':/[\u3040-\u30ff\u4e00-\u9fff]/.test(s)?'ja':'la';
function artistMatch(ours,theirs){
  const a=alias(ours).map(K).filter(Boolean), b=alias(theirs).map(K).filter(Boolean);
  return a.some(x=>b.some(y=>x===y||(x.length>3&&y.length>3&&(x.includes(y)||y.includes(x)))));
}
function titleMatch(ours,theirs){
  const a=K(ours), b=K(theirs); if(!a||!b) return 0;
  if(a===b) return 2;
  if((a.includes(b)||b.includes(a))&&Math.min(a.length,b.length)/Math.max(a.length,b.length)>=.6) return 1;
  return 0;
}
// 노래방·커버·반주 버전이나 모음집이 원곡 앨범 대신 잡히지 않게 걸러요
const ALT=/karaoke|カラオケ|ガイド|노래방|반주|\binst(?:rumental)?\b|off\s?vocal|[(\[]mr[)\]]|\bmr\s?ver|cover(?:ed)?\s?(?:by|ver)|tribute|原曲|オルゴール|music\s?box|lullaby|8.?bit|piano\s?ver|in\s?the\s?style\s?of|made\s?famous/i;
const LIVE=/\blive\b|라이브|concert|콘서트|unplugged|ライブ|tour\b/i;
const COMP=/various|compilation|best\s?of|hits|모음|ヒット|オムニバス|now\s?that/i;
function pick(list,artist,track){
  const ourLive=LIVE.test(track);
  let best=null,bs=-1;
  list.forEach((r,idx)=>{
    let t=titleMatch(track,r.title);
    // 한글 제목 ↔ 로마자 제목(위잉위잉 ↔ Wi Ing Wi Ing): 검색 1순위이고 아티스트가 같으면 받아요
    if(!t&&idx===0&&scriptOf(track)!==scriptOf(r.title||'')&&artistMatch(artist,r.artist)) t=1;
    if(!t) return;
    const am=artistMatch(artist,r.artist);
    if(!am) return;
    if((ALT.test(r.title)||ALT.test(r.album||'')||ALT.test(r.artist||''))) return;
    let s=t*3+(am?2:0);
    if(!ourLive&&LIVE.test(r.album||'')) s-=4;
    if(r.albumArtist&&artistMatch(artist,r.albumArtist)) s+=2;
    if(COMP.test(r.album||'')||COMP.test(r.albumArtist||'')) s-=3;
    if(K(r.title)===K(track)) s+=1;
    if(s>bs){bs=s;best=r}
  });
  return best;
}
async function deezer(q){
  const d=await jsonp('https://api.deezer.com/search?limit=8&output=jsonp&q='+encodeURIComponent(q));
  return (d&&d.data||[]).map(x=>({title:x.title,artist:x.artist&&x.artist.name,album:x.album&&x.album.title,albumArtist:x.artist&&x.artist.name,cover:x.album&&(x.album.cover_big||x.album.cover_medium),src:'deezer'}));
}
let itLast=0;
async function itunes(q,cc,limit=8){
  const wait=Math.max(0,itLast+3200-Date.now()); itLast=Date.now()+wait; if(wait) await new Promise(r=>setTimeout(r,wait));
  const d=await jsonp('https://itunes.apple.com/search?entity=song&limit='+limit+'&country='+cc+'&term='+encodeURIComponent(q));
  return (d&&d.results||[]).map(x=>({title:x.trackName,artist:x.artistName,album:x.collectionName,albumArtist:x.collectionArtistName||x.artistName,cover:x.artworkUrl100&&x.artworkUrl100.replace(/\/\d+x\d+bb\./,'/600x600bb.'),src:'itunes'}));
}
const CACHE_KEY='topster-cache-v9'; try{['v1','v2','v3','v4','v5','v6','v7','v8'].forEach(v=>localStorage.removeItem('topster-cache-'+v))}catch(_){}
let cache={}; try{cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')}catch(_){cache={}}
let saveT=null; function saveCache(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch(_){}},800)}
// Deezer는 빠르니(5초에 50번) 넓게 먼저, iTunes(1분에 20번)는 Deezer에 없는 곡만 아티스트 단위로
let dzNext=0;
async function dz(q){ const now=Date.now(), at=Math.max(now,dzNext); dzNext=at+110; if(at>now) await new Promise(r=>setTimeout(r,at-now)); return deezer(q) }
const keyOf=(a,t)=>K(a)+'|'+K(t);
const toVal=hit=>hit?{album:hit.album,artist:hit.albumArtist||hit.artist,cover:hit.cover}:null;
async function deezerFind(artist,track){
  const t=cleanTrack(track);
  const steps=[()=>dz(`artist:"${artist}" track:"${t}"`),()=>dz(artist+' '+t),
    ...alias(artist).filter(n=>n!==artist&&scriptOf(n)!==scriptOf(artist)).slice(0,1).map(n=>()=>dz(n+' '+t))];
  for(const s of steps){ try{ const hit=pick(await s(),artist,t); if(hit) return hit }catch(_){} }
  return null;
}
async function itunesArtist(artist,tracks,minPlays=0){
  const jp=/[぀-ヿ]/.test(artist+tracks.map(t=>t.track).join('')), ko=/[가-힣]/.test(artist);
  const latin=alias(artist).find(n=>scriptOf(n)==='la'&&n!==artist);
  const tries=jp?[[artist,'JP']]:ko?[[artist,'KR'],[latin||artist,'US']]:[[artist,'US'],[artist,'KR']];
  for(const [term,cc] of tries){
    let list=[]; try{ list=await itunes(term,cc,200) }catch(_){ continue }
    let any=false;
    for(const t of tracks){ if(t.res) continue; const hit=pick(list,artist,cleanTrack(t.track)); if(hit){t.res=toVal(hit);any=true} }
    if(any||tracks.every(t=>t.res)) break;
  }
  // 아티스트 목록에 안 나온 곡 중 많이 들은 곡은 곡 단위로 한 번 더
  const cc=jp?'JP':ko?'KR':'US';
  for(const t of tracks.filter(t=>!t.res).sort((a,b)=>b.plays-a.plays).slice(0,4)){
    if(t.plays<Math.max(3,minPlays)) break;
    try{ const hit=pick(await itunes(artist+' '+cleanTrack(t.track),cc),artist,cleanTrack(t.track)); if(hit) t.res=toVal(hit) }catch(_){}
  }
}

window.__topsterTest={deezerFind,itunesArtist};
/* ---------- 집계 ---------- */
function periodPlays(){
  let use=state.all.filter(p=>!p.dup);
  if(state.months){ const ts=use.map(p=>p.t).filter(isFinite); if(ts.length){ const end=new Date(Math.max(...ts)), from=new Date(end); from.setMonth(from.getMonth()-state.months); use=use.filter(p=>p.t>=from.getTime()) } }
  return use;
}
function trackTable(plays){
  const m=new Map();
  for(const p of plays){ const k=K(p.artist)+'|'+K(p.track); if(!K(p.track)) continue;
    let e=m.get(k); if(!e){e={artist:p.artist,track:p.track,plays:0,spAlbum:null,names:new Map(),urls:new Map()};m.set(k,e)}
    e.plays++; e.names.set(p.track,(e.names.get(p.track)||0)+1); if(p.url) e.urls.set(p.url,(e.urls.get(p.url)||0)+1); if(p.album&&!e.spAlbum) e.spAlbum=p.album; }
  // 같은 곡으로 묶인 제목 중 노래방·반주 표시가 없고 가장 많이 나온 제목으로 검색해요
  for(const e of m.values()){ const names=[...e.names].sort((a,b)=>(ALT.test(a[0])-ALT.test(b[0]))||(b[1]-a[1])); e.track=names[0][0]; delete e.names;
    // 이 곡을 가장 많이 본 영상 링크
    const u=[...e.urls].sort((a,b)=>b[1]-a[1])[0]; e.url=u?u[0]:null; delete e.urls }
  return [...m.values()].sort((a,b)=>b.plays-a.plays);
}
const ytId=u=>{const m=String(u||'').match(/(?:[?&]v=|youtu\.be\/)([\w-]{11})/); return m?m[1]:null};
function aggregate(tracks){
  const m=new Map();
  for(const t of tracks){
    // Deezer·iTunes 둘 다 없는 곡은 내가 본 YouTube 영상 썸네일로 한 칸을 만들어요
    if(t.res===null){ const id=ytId(t.url); if(!id) continue;
      const k='yt|'+K(t.artist)+'|'+K(t.track); if(!m.has(k)) m.set(k,{album:t.track,artist:t.artist,cover:`https://i.ytimg.com/vi/${id}/mqdefault.jpg`,plays:0,tracks:[],yt:true});
      const e=m.get(k); e.plays+=t.plays; e.tracks.push(t); continue }
    const a=t.res; if(!a) continue;
    // 같은 아티스트라도 검색처마다 표기가 달라서(サカナクション / Sakanaction) 내 기록의 아티스트 이름으로 묶어요
    const k=K(t.artist)+'|'+K(albumBase(a.album)); let e=m.get(k);
    if(!e){e={album:albumBase(a.album),artist:t.artist,cover:a.cover,plays:0,tracks:[]};m.set(k,e)}
    if(!e.cover&&a.cover) e.cover=a.cover;
    e.plays+=t.plays; e.tracks.push(t); }
  return [...m.values()].sort((a,b)=>b.plays-a.plays);
}

/* ---------- 실행 ---------- */
async function build(){
  const run=++state.run, alive=()=>run===state.run;
  document.dispatchEvent(new Event('topster:start'));
  const plays=periodPlays(), tracks=trackTable(plays);
  const total=tracks.reduce((s,t)=>s+t.plays,0);
  const ts=plays.map(p=>p.t).filter(isFinite);
  const f=t=>{const d=new Date(t);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`};
  $('posterMeta').textContent=ts.length?`${f(Math.min(...ts))} – ${f(Math.max(...ts))} · ${total.toLocaleString()}회 재생`:'';
  const queue=[]; let cov=0;
  for(const t of tracks){ if(queue.length>=400||(cov>=total*.85&&queue.length>=60)) break; queue.push(t); cov+=t.plays }
  tracks.forEach(t=>{const c=cache[keyOf(t.artist,t.track)]; t.res=c===undefined||c==='dz'?undefined:c; t.dzMiss=c==='dz'});
  const status=$('status'); $('saveBtn').disabled=true;
  const refresh=()=>{state.albums=aggregate(tracks);render(true)};
  refresh();
  // 25위 안의 앨범이 더 바뀔 수 없으면 멈춰요
  const settled=rest=>{const a=state.albums=aggregate(tracks); return a.length>25&&a[24].plays>=a[25].plays+rest};

  // 1단계: Deezer
  // 일본어 이름 아티스트는 Deezer에 로마자로 올라가 있어 앨범 이름이 달라지니 iTunes 일본 스토어로만 찾아요
  queue.forEach(t=>{ if(t.res===undefined&&/[\u3040-\u30ff]/.test(t.artist)) t.dzMiss=true });
  const todo=queue.filter(t=>t.res===undefined&&!t.dzMiss);
  let i=0,done=0,stop=false; const remain=()=>todo.slice(i).reduce((s,t)=>s+t.plays,0);
  async function worker(){ while(i<todo.length&&!stop&&alive()){ const t=todo[i++];
      const hit=await deezerFind(t.artist,t.track); if(!alive()) return;
      if(hit){t.res=toVal(hit);cache[keyOf(t.artist,t.track)]=t.res} else {t.dzMiss=true;cache[keyOf(t.artist,t.track)]='dz'}
      saveCache(); done++; status.textContent=`앨범 찾는 중 ${done}/${todo.length}`;
      if(done%6===0){ refresh(); if(settled(remain())) stop=true } } }
  await Promise.all(Array.from({length:6},worker));
  if(!alive()) return; refresh();

  // 2단계: Deezer에 없는 곡을 아티스트별로 iTunes에서 (순위에 들 수 있는 아티스트만)
  const miss=queue.filter(t=>t.res===undefined&&t.dzMiss), byArtist=new Map();
  miss.forEach(t=>{const k=K(t.artist); if(!byArtist.has(k)) byArtist.set(k,{artist:t.artist,tracks:[],sum:0}); const g=byArtist.get(k); g.tracks.push(t); g.sum+=t.plays});
  const groups=[...byArtist.values()].sort((a,b)=>b.sum-a.sum);
  const cut=()=>{const a=state.albums; return a.length>=25?a[24].plays:0};
  let gi=0;
  for(const g of groups){ if(!alive()) return; if(g.sum<cut()) break; gi++;
    status.textContent=`앨범 찾는 중 · ${g.artist} (${gi})`;
    await itunesArtist(g.artist,g.tracks,Math.floor(cut()/3)); if(!alive()) return;
    g.tracks.forEach(t=>{cache[keyOf(t.artist,t.track)]=t.res||null; if(!t.res) t.res=null}); saveCache(); refresh(); }
  if(!alive()) return;
  state.albums=aggregate(tracks); render(false);
  status.textContent=`앨범 ${state.albums.length}개를 찾았어요`;
  $('saveBtn').disabled=false;
  document.dispatchEvent(new Event('topster:done'));
}

/* ---------- 그리기 ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ytSearch=(a,t)=>'https://www.youtube.com/results?search_query='+encodeURIComponent(a+' '+t);
const trackUrl=t=>t.url||ytSearch(t.artist,t.track);
const topTrack=a=>[...a.tracks].sort((x,y)=>y.plays-x.plays)[0];
function render(loading){
  const n=state.n, top=state.albums.slice(0,n*n), grid=$('grid'), list=$('list'), manual=state.mode==='manual';
  grid.style.setProperty('--n',n); grid.classList.toggle('manual',manual);
  grid.innerHTML=Array.from({length:n*n},(_,i)=>{const a=top[i];
    if(!a) return manual?`<div class="tile slot"><span class="plus">+</span></div>`:`<div class="tile ${loading?'loading':'empty'}"></div>`;
    const inner=a.cover?`<img src="${esc(a.cover)}" alt="${esc(a.album)} — ${esc(a.artist)}" crossorigin="anonymous" loading="lazy">`:`<div class="ph"><b>${esc(a.album)}</b>${esc(a.artist)}</div>`;
    if(manual) return `<div class="tile mtile" data-i="${i}">${inner}<span class="rank">${i+1}</span><span class="info"><b>${esc(a.album)}</b><span>${esc(a.artist)}</span></span><button type="button" class="rm" data-rm="${i}" aria-label="빼기">×</button></div>`;
    const tt=topTrack(a);
    return `<a class="tile" href="${esc(trackUrl(tt))}" target="_blank" rel="noopener" aria-label="${esc(a.album)} — ${esc(a.artist)}">${inner}<span class="rank">${i+1}</span><span class="info"><b>${esc(a.album)}</b><span>${esc(a.artist)}</span><em>${a.plays.toLocaleString()}회 재생</em></span></a>`}).join('');
  list.innerHTML=top.map((a,i)=>`<li class="${i>0&&i%n===0?'row-break':''}"><button type="button" class="li-btn" data-i="${i}"><span class="al">${esc(a.album)}</span> <span class="ar">— ${esc(a.artist)}</span></button>${manual?'':`<span class="cnt">${a.plays.toLocaleString()}</span>`}</li>`).join('');
  $('poster').classList.toggle('nolist',!state.showList);
}
$('list').addEventListener('click',e=>{
  const b=e.target.closest('.li-btn'); if(!b||state.mode==='manual') return;
  const a=state.albums[+b.dataset.i], d=$('detail'); if(!a) return;
  d.hidden=false;
  d.innerHTML=`<h3>${esc(a.album)}</h3><div class="m">${esc(a.artist)} · ${a.plays.toLocaleString()}회 재생</div><ul>${a.tracks.sort((x,y)=>y.plays-x.plays).map(t=>`<li><a href="${esc(trackUrl(t))}" target="_blank" rel="noopener">${esc(t.track)}</a> <span class="hint">${t.plays}회</span></li>`).join('')}</ul>`;
  d.scrollIntoView({behavior:'smooth',block:'nearest'});
});

window.__app={state,render,jsonp};
// 게시판(board.js)에 넘길 지금 탑스터
window.Topster={ready:()=>!!state.albums.length&&(state.mode==='manual'||!$('saveBtn').disabled),
  top:k=>state.albums.slice(0,k).map(a=>{const t=topTrack(a);return {al:a.album,ar:a.artist,c:a.cover||null,u:t?trackUrl(t):null,p:a.plays}}),
  snapshot:()=>({title:$('posterTitle').textContent.trim()||'나의 탑스터',period:state.mode==='manual'?'0':String(state.months),size:state.n,
    albums:state.albums.slice(0,state.n*state.n).map(a=>{const t=topTrack(a);return {al:a.album,ar:a.artist,c:a.cover||null,u:t?trackUrl(t):null,t:t?t.track:null,p:a.plays}})})};
/* ---------- 이미지 저장 ---------- */
function loadImg(src){return new Promise(r=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>r(im);im.onerror=()=>r(null);im.src=src})}
function wrap(ctx,text,max){const out=[];let line='';for(const ch of String(text)){if(ctx.measureText(line+ch).width>max&&line){out.push(line);line=ch}else line+=ch}if(line)out.push(line);return out}
async function saveImage(){
  const n=state.n, top=state.albums.slice(0,n*n), S=2, cell=180, gap=6, pad=40, listW=state.showList?420:0;
  const gridW=n*cell+(n-1)*gap, W=pad*2+gridW+(listW?36+listW:0), headH=86, H=pad+headH+gridW+pad;
  const cv=document.createElement('canvas'); cv.width=W*S; cv.height=H*S; const x=cv.getContext('2d'); x.scale(S,S);
  x.fillStyle='#111014'; x.fillRect(0,0,W,H);
  x.fillStyle='#f4f2ee'; x.font='900 34px "Noto Sans KR",sans-serif'; x.textBaseline='top';
  x.fillText($('posterTitle').textContent.trim()||'나의 탑스터',pad,pad);
  x.fillStyle='#9a97a3'; x.font='500 15px "JetBrains Mono",monospace'; x.fillText($('posterMeta').textContent,pad,pad+48);
  const imgs=await Promise.all(top.map(a=>a.cover?loadImg(a.cover):null));
  top.forEach((a,i)=>{const cx=pad+(i%n)*(cell+gap), cy=pad+headH+Math.floor(i/n)*(cell+gap);
    x.fillStyle='#26242c'; x.fillRect(cx,cy,cell,cell);
    if(imgs[i]) x.drawImage(imgs[i],cx,cy,cell,cell);
    else{ x.fillStyle='#f4f2ee'; x.font='700 15px "Noto Sans KR",sans-serif'; wrap(x,a.album,cell-20).slice(0,4).forEach((l,j)=>x.fillText(l,cx+10,cy+cell-90+j*19));
      x.fillStyle='#9a97a3'; x.font='400 13px "Noto Sans KR",sans-serif'; x.fillText(wrap(x,a.artist,cell-20)[0]||'',cx+10,cy+cell-22) } });
  if(listW){ const lx=pad+gridW+36; let ly=pad+headH; const lh=Math.min(22,(gridW-(n-1)*8)/(n*n));
    top.forEach((a,i)=>{ if(i>0&&i%n===0) ly+=8;
      x.fillStyle='#77737f'; x.font='600 12px "JetBrains Mono",monospace'; x.fillText(String(i+1),lx,ly+2);
      x.font='500 14px "Noto Sans KR",sans-serif'; let t=a.album+'  — '+a.artist;
      const cnt=state.mode==='manual'?'':a.plays.toLocaleString(); x.font='500 12px "JetBrains Mono",monospace'; const cw=x.measureText(cnt).width;
      x.fillStyle='#9a97a3'; x.textAlign='right'; x.fillText(cnt,lx+listW,ly+2); x.textAlign='left';
      x.font='500 14px "Noto Sans KR",sans-serif';
      while(x.measureText(t).width>listW-40-cw&&t.length>4) t=t.slice(0,-2)+'…';
      x.fillStyle='#f4f2ee'; x.fillText(t,lx+28,ly); ly+=lh; }) }
  let url;
  try{ url=cv.toDataURL('image/png') }catch(e){ alert('일부 앨범 커버를 이미지로 저장할 수 없었어요. 화면을 캡처해 주세요.'); return }
  const a=document.createElement('a'); a.href=url; a.download='topster.png'; a.click();
}
$('saveBtn').addEventListener('click',saveImage);

/* ---------- 조작 ---------- */
document.querySelectorAll('#period button').forEach(b=>b.addEventListener('click',()=>{
  state.months=+b.dataset.m; document.querySelectorAll('#period button').forEach(x=>x.setAttribute('aria-pressed',x===b)); $('detail').hidden=true; if(state.all) build(); }));
$('showList').addEventListener('change',e=>{state.showList=e.target.checked;render(false)});
document.querySelectorAll('.howto-tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.howto-tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  document.querySelectorAll('.steps[data-h]').forEach(o=>o.hidden=o.dataset.h!==b.dataset.h); }));
$('file').addEventListener('change',e=>{loadFiles(e.target.files);e.target.value=''});
document.querySelectorAll('label[for=file]').forEach(l=>l.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click()}}));
const app=$('app');
['dragenter','dragover'].forEach(t=>app.addEventListener(t,e=>{e.preventDefault();app.classList.add('drop')}));
['dragleave','drop'].forEach(t=>app.addEventListener(t,e=>{e.preventDefault();app.classList.remove('drop')}));
app.addEventListener('drop',e=>loadFiles(e.dataTransfer.files));
})();
