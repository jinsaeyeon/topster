(function(){
'use strict';
const $=id=>document.getElementById(id);
const C=window.Core;
const state={all:null,months:6,n:5,showList:true,albums:[],run:0};

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
    // 한글 이름 ↔ 영문 이름처럼 표기만 다를 때는 제목이 정확히 같으면 받아요
    if(!am&&!(t===2&&scriptOf(artist)!==scriptOf(r.artist||''))) return;
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
async function itunes(q,cc){
  const wait=Math.max(0,itLast+3200-Date.now()); itLast=Date.now()+wait; if(wait) await new Promise(r=>setTimeout(r,wait));
  const d=await jsonp('https://itunes.apple.com/search?entity=song&limit=8&country='+cc+'&term='+encodeURIComponent(q));
  return (d&&d.results||[]).map(x=>({title:x.trackName,artist:x.artistName,album:x.collectionName,albumArtist:x.collectionArtistName||x.artistName,cover:x.artworkUrl100&&x.artworkUrl100.replace(/\/\d+x\d+bb\./,'/600x600bb.'),src:'itunes'}));
}
const CACHE_KEY='topster-cache-v6'; try{['v1','v2','v3','v4','v5'].forEach(v=>localStorage.removeItem('topster-cache-'+v))}catch(_){}
let cache={}; try{cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')}catch(_){cache={}}
let saveT=null; function saveCache(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch(_){}},800)}
async function lookup(artist,track){
  const key=K(artist)+'|'+K(track);
  if(key in cache) return cache[key];
  const t=cleanTrack(track); let hit=null;
  // 일본 곡은 Deezer에 로마자로만 있는 경우가 많아 iTunes 일본 스토어를 먼저 봐요
  const jp=/[\u3040-\u30ff]/.test(artist+t), ko=/[\uac00-\ud7a3]/.test(artist+t);
  const steps=[
    ...(jp?[()=>itunes(artist+' '+t,'JP')]:[]),
    ()=>deezer(`artist:"${artist}" track:"${t}"`),
    ()=>deezer(artist+' '+t),
    ()=>deezer(t),
    ...(jp?[]:[()=>itunes(artist+' '+t,ko?'KR':'US')]),
    ()=>itunes(artist+' '+t,jp?'US':ko?'JP':'KR'),
  ];
  for(const s of steps){ if(hit) break; try{ hit=pick(await s(),artist,t) }catch(_){} }
  const val=hit?{album:hit.album,artist:hit.albumArtist||hit.artist,cover:hit.cover}:null;
  cache[key]=val; saveCache(); return val;
}

window.__topsterLookup=lookup;
/* ---------- 집계 ---------- */
function periodPlays(){
  let use=state.all.filter(p=>!p.dup);
  if(state.months){ const ts=use.map(p=>p.t).filter(isFinite); if(ts.length){ const end=new Date(Math.max(...ts)), from=new Date(end); from.setMonth(from.getMonth()-state.months); use=use.filter(p=>p.t>=from.getTime()) } }
  return use;
}
function trackTable(plays){
  const m=new Map();
  for(const p of plays){ const k=K(p.artist)+'|'+K(p.track); if(!K(p.track)) continue;
    let e=m.get(k); if(!e){e={artist:p.artist,track:p.track,plays:0,spAlbum:null,names:new Map()};m.set(k,e)}
    e.plays++; e.names.set(p.track,(e.names.get(p.track)||0)+1); if(p.album&&!e.spAlbum) e.spAlbum=p.album; }
  // 같은 곡으로 묶인 제목 중 노래방·반주 표시가 없고 가장 많이 나온 제목으로 검색해요
  for(const e of m.values()){ const names=[...e.names].sort((a,b)=>(ALT.test(a[0])-ALT.test(b[0]))||(b[1]-a[1])); e.track=names[0][0]; delete e.names }
  return [...m.values()].sort((a,b)=>b.plays-a.plays);
}
function aggregate(tracks){
  const m=new Map();
  for(const t of tracks){ const a=t.res; if(!a) continue;
    const k=K(a.artist)+'|'+K(albumBase(a.album)); let e=m.get(k);
    if(!e){e={album:albumBase(a.album),artist:a.artist,cover:a.cover,plays:0,tracks:[]};m.set(k,e)}
    if(!e.cover&&a.cover) e.cover=a.cover;
    e.plays+=t.plays; e.tracks.push(t); }
  return [...m.values()].sort((a,b)=>b.plays-a.plays);
}

/* ---------- 실행 ---------- */
async function build(){
  const run=++state.run;
  const plays=periodPlays(), tracks=trackTable(plays);
  const total=tracks.reduce((s,t)=>s+t.plays,0);
  const ts=plays.map(p=>p.t).filter(isFinite);
  const f=t=>{const d=new Date(t);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`};
  $('posterMeta').textContent=ts.length?`${f(Math.min(...ts))} – ${f(Math.max(...ts))} · ${total.toLocaleString()}회 재생`:'';
  // 많이 들은 곡부터 찾아서, 전체 재생의 85%를 덮거나 400곡까지
  const queue=[]; let cov=0;
  for(const t of tracks){ if(queue.length>=400||(cov>=total*.85&&queue.length>=60)) break; queue.push(t); cov+=t.plays }
  tracks.forEach(t=>{const key=K(t.artist)+'|'+K(t.track); t.res=key in cache?cache[key]:undefined});
  state.albums=aggregate(tracks); render(true);
  let done=0; const todo=queue.filter(t=>t.res===undefined);
  const status=$('status'); $('saveBtn').disabled=true;
  let i=0; const N=todo.length;
  async function worker(){ while(i<todo.length){ const t=todo[i++]; if(run!==state.run) return;
      t.res=await lookup(t.artist,t.track); done++;
      if(run===state.run){ status.textContent=`앨범 찾는 중 ${done}/${N}`; if(done%4===0||done===N){state.albums=aggregate(tracks);render(true)} } } }
  await Promise.all([worker(),worker(),worker()]);
  if(run!==state.run) return;
  state.albums=aggregate(tracks); render(false);
  const found=queue.filter(t=>t.res).length;
  status.textContent=`곡 ${queue.length}개 중 ${found}개의 앨범을 찾았어요`;
  $('saveBtn').disabled=false;
}

/* ---------- 그리기 ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(loading){
  const n=state.n, top=state.albums.slice(0,n*n), grid=$('grid'), list=$('list');
  grid.style.setProperty('--n',n);
  grid.innerHTML=Array.from({length:n*n},(_,i)=>{const a=top[i];
    if(!a) return `<div class="tile ${loading?'loading':'empty'}"></div>`;
    const inner=a.cover?`<img src="${esc(a.cover)}" alt="${esc(a.album)} — ${esc(a.artist)}" crossorigin="anonymous" loading="lazy">`:`<div class="ph"><b>${esc(a.album)}</b>${esc(a.artist)}</div>`;
    return `<button type="button" class="tile" data-i="${i}" title="${esc(a.album)} — ${esc(a.artist)} · ${a.plays}회">${inner}<span class="rank">${i+1}</span></button>`}).join('');
  list.innerHTML=top.map((a,i)=>`<li class="${i>0&&i%n===0?'row-break':''}"><span><span class="al">${esc(a.album)}</span> <span class="ar">— ${esc(a.artist)}</span></span></li>`).join('');
  $('poster').classList.toggle('nolist',!state.showList);
}
$('grid').addEventListener('click',e=>{
  const b=e.target.closest('.tile[data-i]'); if(!b) return;
  const a=state.albums[+b.dataset.i], d=$('detail'); if(!a) return;
  d.hidden=false;
  d.innerHTML=`<h3>${esc(a.album)}</h3><div class="m">${esc(a.artist)} · ${a.plays.toLocaleString()}회 재생</div><ul>${a.tracks.sort((x,y)=>y.plays-x.plays).map(t=>`<li>${esc(t.track)} <span class="hint">${t.plays}회</span></li>`).join('')}</ul>`;
  d.scrollIntoView({behavior:'smooth',block:'nearest'});
});

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
      while(x.measureText(t).width>listW-30&&t.length>4) t=t.slice(0,-2)+'…';
      x.fillStyle='#f4f2ee'; x.fillText(t,lx+28,ly); ly+=lh; }) }
  let url;
  try{ url=cv.toDataURL('image/png') }catch(e){ alert('일부 앨범 커버를 이미지로 저장할 수 없었어요. 화면을 캡처해 주세요.'); return }
  const a=document.createElement('a'); a.href=url; a.download='topster.png'; a.click();
}
$('saveBtn').addEventListener('click',saveImage);

/* ---------- 조작 ---------- */
document.querySelectorAll('#period button').forEach(b=>b.addEventListener('click',()=>{
  state.months=+b.dataset.m; document.querySelectorAll('#period button').forEach(x=>x.setAttribute('aria-pressed',x===b)); $('detail').hidden=true; if(state.all) build(); }));
document.querySelectorAll('#size button').forEach(b=>b.addEventListener('click',()=>{
  state.n=+b.dataset.n; document.querySelectorAll('#size button').forEach(x=>x.setAttribute('aria-pressed',x===b)); render(false); }));
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
