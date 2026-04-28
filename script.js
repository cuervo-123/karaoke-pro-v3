/* ========= Estado global ========= */
let canales = [];                // { name, url, logo, group }
let listas = {};                 // { nombreLista: [canales...] }
let listasExpandState = {};      // estado de acordeones

// Karaoke
let ytPlayer;                    // IFrame API
let participantes = {};          // { nombre: { artistas:"", canciones:[{id,title,channel,artist,thumb}] } }
let colaTurnos = [];             // [{nombre, song}]
let turnoIndex = -1;
let userGesture = false;
let karaokeJsonTemas = []; // [{query,title,checked,videoId}]

// Neon/visualizer
let neonActive = false;
let rafId = null;
const neonColors = ["#1f8bff","#b84cff","#5eff5e","#ff33a6","#ff914d"];

/* ========= Tabs ========= */
const tabBuilder = document.getElementById('tabBuilder');
const tabKaraoke = document.getElementById('tabKaraoke');
const btnTabBuilder = document.getElementById('btnTabBuilder');
const btnTabKaraoke = document.getElementById('btnTabKaraoke');
btnTabBuilder.onclick = ()=>{
  btnTabBuilder.classList.add('active'); btnTabKaraoke.classList.remove('active');
  tabBuilder.classList.add('active'); tabKaraoke.classList.remove('active');
};
btnTabKaraoke.onclick = ()=>{
  btnTabKaraoke.classList.add('active'); btnTabBuilder.classList.remove('active');
  tabKaraoke.classList.add('active'); tabBuilder.classList.remove('active');
};

/* ========= Utiles ========= */
function normalizar(str){ return (str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function descargarBlob(contenido, tipo, nombreArchivo){
  const blob = new Blob([contenido], {type:tipo});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = nombreArchivo; link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}

/* ========= Categorías base ========= */
const categories = {
  "Cine / Movies":["movie","film","cinema","pelicula","cine"],
  "Series / Shows":["series","tvshow","novela","show"],
  "Música":["music","musica","radio","concert","salsa","rock","pop","bachata"],
  "Deportes":["sports","deporte","futbol","soccer","nba","mlb"],
  "Noticias":["news","noticia","cnn","bbc","dw","sky"],
  "Infantil / Kids":["kids","cartoon","disney","anime","infantil"],
  "Tecnología":["tech","ai","robot","software","hardware"],
  "Varios":["varios","other"]
};
function getCategoryFromText(text){
  const lower = normalizar(text);
  for(const [cat,keys] of Object.entries(categories)){
    if(keys.some(k=>lower.includes(normalizar(k)))) return cat;
  }
  return "Varios";
}

/* ========= Parser M3U ========= */
function parseM3U(content){
  const lines = (content||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const out = [];
  for(let i=0;i<lines.length;i++){
    const line = lines[i].trim();
    if(!line || line.startsWith('#EXTM3U')) continue;
    if(line.startsWith('#EXTINF')){
      const nameMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo=\"([^\"]+)\"/i);
      const groupMatch = line.match(/group-title=\"([^\"]+)\"/i);
      const name = nameMatch ? nameMatch[1].trim() : 'Sin nombre';
      const url = (lines[i+1]||'').trim();
      const logo = logoMatch ? logoMatch[1].trim() : '';
      const group = groupMatch ? groupMatch[1].trim() : getCategoryFromText(name + ' ' + url);
      if(/^https?:\/\//i.test(url)) out.push({name,url,logo,group});
      i++;
      continue;
    }
    if(/^https?:\/\//i.test(line)){
      out.push({name: line.split('/').slice(-1)[0] || 'Canal', url: line, logo:'', group:getCategoryFromText(line)});
    }
  }
  return out;
}

/* ========= UI Builder ========= */
const fileInput = document.getElementById('fileInput');
const filtroCategoria = document.getElementById('filtroCategoria');
const buscador = document.getElementById('buscador');
const canalDropdown = document.getElementById('canalDropdown');
const player = document.getElementById('player');
const playerListSelect = document.getElementById('playerListSelect');
const categoriaPlayerSelect = document.getElementById('categoriaPlayerSelect');

document.getElementById('exportAll').onclick = ()=>{
  const json = JSON.stringify(listas, null, 2);
  descargarBlob(json, 'application/json', 'listas_personalizadas.json');
};
document.getElementById('btnCrearLista').onclick = ()=>{
  const nombre = document.getElementById('nombreLista').value.trim();
  if(!nombre) return alert('Escribe un nombre.');
  if(listas[nombre]) return alert('Ya existe una lista con ese nombre.');
  listas[nombre] = []; guardarLocal(); renderListas(); poblarSelectorListasPlayer();
};
document.getElementById('btnAgregarALista').onclick = agregarCanalActualALista;
document.getElementById('btnGuardarCategoria').onclick = asignarCategoriaAlCanal;
document.getElementById('btnColapsarTodo').onclick = colapsarTodo;
document.getElementById('btnExpandirTodo').onclick = expandirTodo;
document.getElementById('btnVerificar').onclick = verificarCanal;

fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const text = await file.text();
  if(file.name.toLowerCase().endsWith('.json')){
    try{ listas = JSON.parse(text)||{}; }catch{ listas = {}; }
    renderListas(); poblarSelectorListasPlayer(); alert('✅ JSON cargado');
  }else{
    const nuevos = parseM3U(text);
    canales = canales.concat(nuevos);
    poblarFiltroCategorias();
    alert('✅ Lista cargada: ' + nuevos.length + ' canales');
  }
  e.target.value = '';
});
filtroCategoria.addEventListener('change', filtrarPorCategoria);
buscador.addEventListener('input', filtrarPorCategoria);

function poblarFiltroCategorias(){
  const set = new Set(canales.map(c=>c.group||'Varios'));
  Object.keys(categories).forEach(k=>set.add(k));
  filtroCategoria.innerHTML = '';
  const all = document.createElement('option'); all.value='__TODOS__'; all.textContent='Todos'; filtroCategoria.appendChild(all);
  [...set].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).forEach(cat=>{
    const opt = document.createElement('option'); opt.value=cat; opt.textContent=cat; filtroCategoria.appendChild(opt);
  });
  filtroCategoria.value='__TODOS__';
  poblarSelectorCategoriasPlayer([...set]);
  filtrarPorCategoria();
}

function poblarSelectorCategoriasPlayer(lista){
  const sel = categoriaPlayerSelect;
  const prev = sel.value; sel.innerHTML='';
  ['Deportes','Noticias','Cine / Movies','Series / Shows','Música'].forEach(cat=>{
    const opt = document.createElement('option'); opt.value=cat; opt.textContent='★ '+cat; sel.appendChild(opt);
  });
  const sep = document.createElement('option'); sep.disabled=true; sep.textContent='──────────'; sel.appendChild(sep);
  lista.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).forEach(cat=>{
    const opt = document.createElement('option'); opt.value=cat; opt.textContent=cat; sel.appendChild(opt);
  });
  if(prev){ const found=[...sel.options].find(o=>o.value===prev); sel.value = found?prev:sel.options[0]?.value; }
}

function filtrarPorCategoria(){
  const cat = filtroCategoria.value;
  const txt = normalizar(buscador.value);
  canalDropdown.innerHTML='';
  canales.forEach((c,i)=>{
    const matchCat = (cat==='__TODOS__')?true:(c.group===cat);
    const matchTxt = normalizar(c.name).includes(txt);
    if(matchCat && matchTxt){
      const opt = document.createElement('option'); opt.value=i; opt.textContent=c.name; canalDropdown.appendChild(opt);
    }
  });
  if(!canalDropdown.options.length){
    const opt = document.createElement('option'); opt.textContent='— Sin resultados —'; canalDropdown.appendChild(opt);
  }
}

function verificarCanal(){
  const i = parseInt(canalDropdown.value,10);
  const canal = canales[i];
  if(!canal || !canal.url) return alert('Selecciona un canal válido');
  player.innerHTML='';
  const video = document.createElement('video');
  video.setAttribute('controls',''); video.setAttribute('playsinline',''); video.setAttribute('autoplay','');
  video.style.width='100%'; video.style.height='100%';
  player.appendChild(video);
  if(video.canPlayType('application/vnd.apple.mpegurl')){
    video.src = canal.url; video.play().catch(()=>{});
  }else if(window.Hls && window.Hls.isSupported()){
    const hls = new Hls({maxBufferLength:30}); hls.loadSource(canal.url); hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, ()=>video.play().catch(()=>{}));
  }else{
    video.innerHTML = '<source src="'+canal.url+'" type="application/x-mpegURL">';
  }
  // set categoría visible
  const found = [...categoriaPlayerSelect.options].find(o => o.value=== (canal.group||'Varios') || o.textContent.replace('★ ','')===canal.group);
  if(found) categoriaPlayerSelect.value = found.value;
}

function poblarSelectorListasPlayer(){
  const sel = playerListSelect; const prev = sel.value;
  sel.innerHTML='';
  const names = Object.keys(listas);
  if(!names.length){ const opt=document.createElement('option'); opt.disabled=true; opt.textContent='— No hay listas —'; sel.appendChild(opt); return; }
  names.forEach(n=>{ const opt=document.createElement('option'); opt.value=n; opt.textContent=n; sel.appendChild(opt); });
  if(prev && names.includes(prev)) sel.value=prev;
}

function agregarCanalActualALista(){
  const nombre = playerListSelect.value; if(!nombre) return alert('Crea o selecciona una lista');
  const idx = parseInt(canalDropdown.value,10); const canal = canales[idx];
  if(!canal) return alert('Selecciona un canal válido');
  if(!listas[nombre].some(c=>c.url===canal.url)) listas[nombre].push(canal);
  guardarLocal(); renderListas(); poblarSelectorListasPlayer();
  alert('✅ Agregado a '+nombre);
}
function asignarCategoriaAlCanal(){
  const idx = parseInt(canalDropdown.value,10); const canal = canales[idx]; if(!canal) return alert('Selecciona un canal.');
  const nueva = categoriaPlayerSelect.value || 'Varios'; canal.group = nueva;
  poblarFiltroCategorias(); filtrarPorCategoria(); alert('✅ Canal asignado a '+nueva);
}

function renderListas(){
  const cont = document.getElementById('listas'); cont.innerHTML='';
  Object.keys(listas).sort().forEach(nombre=>{
    const box = document.createElement('div'); box.className='listado'; box.dataset.lista = nombre;
    if(listasExpandState[nombre]) box.classList.add('expanded');
    const head = document.createElement('div'); head.className='listado-header';
    head.innerHTML = '<strong>📦 '+nombre+'</strong><div><span class="hint">'+(listas[nombre]?.length||0)+' canales</span> <span class="chevron">▶</span></div>';
    head.onclick = ()=>{ listasExpandState[nombre]=!listasExpandState[nombre]; guardarLocal(); box.classList.toggle('expanded'); };
    const body = document.createElement('div'); body.className='listado-body';
    body.innerHTML = '<div class="row wrap">'+
      '<button onclick="agregarACanal(\''+nombre+'\')">➕ Agregar actual</button>'+
      '<button onclick="exportarM3U(\''+nombre+'\')">💾 Exportar .m3u</button>'+
      '</div>'+
      '<pre style="white-space:pre-wrap;max-height:260px;overflow:auto;border:1px solid #1b2d4f;border-radius:10px;padding:8px;background:#081426">'+
      ((listas[nombre]&&listas[nombre].length)? listas[nombre].map(c=>'• '+c.name+' ('+(c.group||'Varios')+')').join('\n'):'— Vacía —')+
      '</pre>';
    box.appendChild(head); box.appendChild(body); cont.appendChild(box);
  });
}
function agregarACanal(nombreLista){ const idx=parseInt(canalDropdown.value,10); const c=canales[idx]; if(!c)return; if(!listas[nombreLista].some(x=>x.url===c.url)) listas[nombreLista].push(c); guardarLocal(); renderListas(); }
function exportarM3U(nombreLista){
  const lista = listas[nombreLista]; if(!lista?.length) return alert('Lista vacía');
  let out = '#EXTM3U\n';
  lista.forEach(c=>{ out += '#EXTINF:-1'+(c.logo? ' tvg-logo="'+c.logo+'"':'')+(c.group? ' group-title="'+c.group+'"':'')+','+c.name+'\n'+c.url+'\n'; });
  descargarBlob(out,'text/plain', nombreLista+'.m3u');
}

function colapsarTodo(){ Object.keys(listas).forEach(n=>listasExpandState[n]=false); guardarLocal(); renderListas(); }
function expandirTodo(){ Object.keys(listas).forEach(n=>listasExpandState[n]=true); guardarLocal(); renderListas(); }

/* ========= Persistencia ========= */
function guardarLocal(){
  localStorage.setItem('TB_listas', JSON.stringify(listas));
  localStorage.setItem('TB_expand', JSON.stringify(listasExpandState));
  localStorage.setItem('TB_participantes', JSON.stringify(participantes));
}
function cargarLocal(){
  try{ listas = JSON.parse(localStorage.getItem('TB_listas'))||{}; }catch{ listas = {}; }
  try{ listasExpandState = JSON.parse(localStorage.getItem('TB_expand'))||{}; }catch{ listasExpandState = {}; }
  try{ participantes = JSON.parse(localStorage.getItem('TB_participantes'))||{}; }catch{ participantes = {}; }
}

/* ========= Karaoke: YouTube IFrame ========= */
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player('ytPlayer', {
    height:'405', width:'720',
    playerVars:{ rel:0, modestbranding:1, playsinline:1 },
    events:{ 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
  });
};
function onPlayerReady(){
  // Requerir gesto de usuario para habilitar reproducción
  document.getElementById('btnPlay').onclick = ()=>{ userGesture = true; try{ ytPlayer.playVideo(); }catch{} };
  document.getElementById('btnPause').onclick = ()=>{ try{ ytPlayer.pauseVideo(); }catch{} };
  document.getElementById('btnNext').onclick = nextTurno;
  document.getElementById('btnNext2').onclick = nextTurno;
  document.getElementById('btnPrev').onclick = prevTurno;

  initColorPicker();
  renderParticipantes();
}
function onPlayerStateChange(e){
  if(e.data === YT.PlayerState.PLAYING){
    startNeon();
  }else if(e.data === YT.PlayerState.ENDED || e.data === YT.PlayerState.PAUSED){
    stopNeon();
    if(e.data === YT.PlayerState.ENDED){ nextTurno(); }
  }
}

/* ========= Karaoke: Búsqueda y resultados + JSON seleccionado ========= */
const YT_KEY_STORAGE = 'TB_YOUTUBE_API_KEY';
const DEFAULT_YOUTUBE_API_KEY = 'AIzaSyA4NpwgJmEzBGGTzFFjShyrtWICgSSml-I';

const ytQueryInput = document.getElementById('ytQuery');
const ytStatus = document.getElementById('ytStatus');
const ytApiKeyInput = document.getElementById('ytApiKeyInput');
const btnGuardarYTKey = document.getElementById('btnGuardarYTKey');

function setYTStatus(msg, good=true){
  if(!ytStatus) return;
  ytStatus.textContent = msg;
  ytStatus.style.borderColor = good ? '#1f6b5b' : '#6f2832';
  ytStatus.style.color = good ? '#bdf7e7' : '#ffb8c0';
}

function getYoutubeApiKey(){
  return (localStorage.getItem(YT_KEY_STORAGE) || DEFAULT_YOUTUBE_API_KEY || '').trim();
}

if(ytApiKeyInput){
  ytApiKeyInput.value = localStorage.getItem(YT_KEY_STORAGE) || '';
  if(btnGuardarYTKey){
    btnGuardarYTKey.onclick = ()=>{
      const key = ytApiKeyInput.value.trim();
      if(key){
        localStorage.setItem(YT_KEY_STORAGE, key);
        setYTStatus('Key guardada ✔', true);
      }else{
        localStorage.removeItem(YT_KEY_STORAGE);
        setYTStatus('Usando key interna', true);
      }
    };
  }
}

document.getElementById('buscarYT').onclick = buscarYouTube;

function escapeHTML(s){
  return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function escapeJS(s){
  return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');
}

function extraerYouTubeId(url){
  const s = String(url||'').trim();
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /music\.youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{6,})/
  ];
  for(const re of patterns){
    const m = s.match(re);
    if(m) return m[1];
  }
  return '';
}

function safePlayVideo(videoId){
  if(!videoId) return alert('No hay video ID.');
  userGesture = true;
  try{
    if(ytPlayer && typeof ytPlayer.loadVideoById === 'function'){
      ytPlayer.loadVideoById(videoId);
      document.getElementById('btnTabKaraoke')?.click?.();
      setYTStatus('Reproduciendo: '+videoId, true);
      return;
    }
  }catch(err){ console.warn(err); }
  window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(videoId), '_blank');
}

async function youtubeSearch(query, maxResults=24){
  const key = getYoutubeApiKey();
  if(!key) throw new Error('Falta YouTube API Key para buscar por nombres.');

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  let data = {};
  try{ data = await res.json(); }catch(_){}
  if(!res.ok || data.error){
    const detail = data.error?.message || ('HTTP ' + res.status);
    throw new Error(detail);
  }
  return data.items || [];
}

async function buscarYouTube(){
  const q = ytQueryInput.value.trim();
  if(!q) return alert('Escribe algo para buscar.');

  const directId = extraerYouTubeId(q);
  if(directId){
    renderYTResults([itemFromVideoId({videoId:directId, title:q, query:q})]);
    setYTStatus('Link directo detectado ✔', true);
    return;
  }

  try{
    setYTStatus('Buscando en YouTube...', true);
    const items = await youtubeSearch(q, 24);
    renderYTResults(items);
    setYTStatus('Resultados: ' + items.length, true);
  }catch(err){
    console.error('YOUTUBE SEARCH ERROR:', err);
    setYTStatus('Error YouTube', false);
    alert('❌ No se pudo buscar en YouTube.\n\nRevisa la API Key o la consola.\n\nDetalle: ' + (err.message || err));
  }
}

function renderYTResults(items){
  const cont = document.getElementById('ytResults');
  if(!cont) return;
  cont.innerHTML='';

  if(!items || !items.length){
    cont.innerHTML = '<div class="hint">No hay resultados para mostrar.</div>';
    return;
  }

  const nombres = Object.keys(participantes);
  items.forEach(it=>{
    const id = it.id?.videoId || it.videoId || it.id;
    if(!id) return;
    const sn = it.snippet || {
      title: it.title || ('Video '+id),
      channelTitle: it.channel || 'YouTube',
      thumbnails:{ medium:{ url: it.thumb || `https://img.youtube.com/vi/${id}/mqdefault.jpg` } }
    };
    const title = sn.title || ('Video '+id);
    const channel = sn.channelTitle || 'YouTube';
    const thumb = sn.thumbnails?.medium?.url || sn.thumbnails?.high?.url || `https://img.youtube.com/vi/${id}/mqdefault.jpg`;

    const card = document.createElement('div');
    card.className='ytCard';
    card.innerHTML = `
      <img class="ytThumb" src="${escapeHTML(thumb)}" alt="">
      <div class="ytBody">
        <div class="ytTitle">${escapeHTML(title)}</div>
        <div class="ytMeta">${escapeHTML(channel)}</div>
        <div class="row wrap">
          <button type="button" onclick="safePlayVideo('${escapeJS(id)}')">▶️ Reproducir</button>
          <a class="btn" href="https://www.youtube.com/watch?v=${escapeHTML(id)}" target="_blank" rel="noopener">↗ Abrir</a>
          ${nombres.length?`
            <select id="addSel_${escapeHTML(id)}">
              ${nombres.map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('')}
            </select>
            <button type="button" onclick="addSongToParticipant('${escapeJS(id)}','${encodeURIComponent(title)}','${encodeURIComponent(channel)}','${encodeURIComponent(thumb)}')">➕ Añadir</button>
          `:`<span class="hint">Crea un participante para añadir.</span>`}
        </div>
      </div>`;
    cont.appendChild(card);
  });
}

/* ========= Karaoke: JSON de temas favoritos ========= */
const karaokeJsonInput = document.getElementById('karaokeJsonInput');
const karaokeJsonList = document.getElementById('karaokeJsonList');
const karaokeJsonCount = document.getElementById('karaokeJsonCount');

if(karaokeJsonInput){
  karaokeJsonInput.addEventListener('change', cargarKaraokeJson);
  document.getElementById('btnMarcarTemas').onclick = ()=> marcarTemasJSON(true);
  document.getElementById('btnDesmarcarTemas').onclick = ()=> marcarTemasJSON(false);
  document.getElementById('btnGenerarTemasYT').onclick = generarTarjetasDesdeTemasSeleccionados;
}

function temaFromAny(x, idx){
  if(typeof x === 'string'){
    const videoId = extraerYouTubeId(x);
    return { query:x.trim(), title:x.trim(), checked:true, videoId };
  }
  if(x && typeof x === 'object'){
    const rawUrl = x.url || x.link || x.youtube || x.video || '';
    const videoId = x.videoId || x.video_id || extraerYouTubeId(rawUrl) || (String(x.id||'').match(/^[a-zA-Z0-9_-]{6,}$/) ? String(x.id) : '');
    const title = x.title || x.name || x.tema || x.cancion || x.song || '';
    const artist = x.artist || x.artista || x.channel || '';
    const query = (x.query || [artist,title].filter(Boolean).join(' ') || rawUrl || ('Tema '+(idx+1))).trim();
    return {
      query,
      title: title || query,
      checked:x.checked !== false,
      videoId,
      thumb:x.thumb || x.thumbnail || x.image || '',
      channel:x.channel || x.channelTitle || ''
    };
  }
  return { query:'Tema '+(idx+1), title:'Tema '+(idx+1), checked:true, videoId:'' };
}

async function cargarKaraokeJson(e){
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    let arr = [];
    if(Array.isArray(parsed)) arr = parsed;
    else if(Array.isArray(parsed.temas)) arr = parsed.temas;
    else if(Array.isArray(parsed.songs)) arr = parsed.songs;
    else if(Array.isArray(parsed.canciones)) arr = parsed.canciones;
    else arr = Object.values(parsed || {});
    karaokeJsonTemas = arr.map(temaFromAny).filter(t=>t.query || t.videoId);
    renderKaraokeJsonList();
    setYTStatus('JSON cargado: '+karaokeJsonTemas.length+' temas', true);
    alert('✅ JSON de karaoke cargado: '+karaokeJsonTemas.length+' temas');
  }catch(err){
    console.error(err);
    alert('❌ JSON inválido. Revisa el formato.');
  }finally{
    e.target.value = '';
  }
}

function renderKaraokeJsonList(){
  if(!karaokeJsonList) return;
  karaokeJsonCount.textContent = karaokeJsonTemas.length + ' temas';
  if(!karaokeJsonTemas.length){
    karaokeJsonList.innerHTML = '<div class="hint">Carga un JSON para ver los temas aquí.</div>';
    return;
  }
  karaokeJsonList.innerHTML = karaokeJsonTemas.map((t,i)=>`
    <label class="temaCheck">
      <input type="checkbox" ${t.checked?'checked':''} onchange="toggleTemaJSON(${i}, this.checked)">
      <span>${i+1}. ${escapeHTML(t.title || t.query)}</span>
      ${t.videoId ? '<small>🎯 directo</small>' : '<small>🔎 buscar</small>'}
    </label>
  `).join('');
}
function toggleTemaJSON(i, checked){ if(karaokeJsonTemas[i]) karaokeJsonTemas[i].checked = checked; }
function marcarTemasJSON(val){ karaokeJsonTemas.forEach(t=>t.checked=val); renderKaraokeJsonList(); }

function itemFromVideoId(t){
  return {
    id:{ videoId:t.videoId },
    snippet:{
      title:t.title || t.query || ('Video '+t.videoId),
      channelTitle:t.channel || 'YouTube',
      thumbnails:{ medium:{ url:t.thumb || `https://img.youtube.com/vi/${t.videoId}/mqdefault.jpg` } }
    }
  };
}

async function generarTarjetasDesdeTemasSeleccionados(){
  const selected = karaokeJsonTemas.filter(t=>t.checked);
  if(!selected.length) return alert('Marca al menos un tema.');

  const btn = document.getElementById('btnGenerarTemasYT');
  const old = btn.textContent;
  btn.textContent = '⏳ Buscando...';
  btn.disabled = true;

  const items = [];
  const errors = [];
  try{
    for(let i=0; i<selected.length; i++){
      const t = selected[i];
      setYTStatus(`Procesando ${i+1}/${selected.length}`, true);
      if(t.videoId){
        items.push(itemFromVideoId(t));
        continue;
      }
      try{
        const found = await youtubeSearch(t.query, 1);
        if(found && found[0]) items.push(found[0]);
        else errors.push(t.query);
      }catch(err){
        errors.push(`${t.query}: ${err.message || err}`);
      }
    }

    renderYTResults(items);
    setYTStatus(`Tarjetas: ${items.length}/${selected.length}`, items.length>0);
    if(errors.length){
      alert(`✅ Tarjetas creadas: ${items.length} de ${selected.length}\n\n⚠️ No se pudieron buscar ${errors.length}. Revisa la API Key o usa links directos de YouTube en el JSON.`);
    }else{
      alert('✅ Tarjetas creadas: '+items.length+' de '+selected.length);
    }
  }finally{
    btn.textContent = old;
    btn.disabled = false;
  }
}

/* ========= Karaoke: Participantes y cola ========= */
document.getElementById('btnAgregarParticipante').onclick = agregarParticipante;
document.getElementById('btnExportSesionJSON').onclick = exportarSesionKaraokeJSON;
document.getElementById('btnExportSesionM3U').onclick = exportarSesionKaraokeM3U;
document.getElementById('btnGenerarCola').onclick = generarColaTurnos;

function agregarParticipante(){
  const nombre = document.getElementById('nuevoParticipante').value.trim();
  if(!nombre) return alert('Escribe un nombre.');
  if(participantes[nombre]) return alert('Ese nombre ya existe.');
  participantes[nombre] = { artistas:'', canciones:[] };
  document.getElementById('nuevoParticipante').value = '';
  guardarLocal(); renderParticipantes();
}
function renderParticipantes(){
  const cont = document.getElementById('participantes'); cont.innerHTML='';
  const nombres = Object.keys(participantes);
  if(!nombres.length){ cont.innerHTML = '<div class="hint">Crea participantes para empezar.</div>'; return; }
  nombres.forEach(nombre=>{
    const p = participantes[nombre];
    const filtros = (p.artistas||'').split(',').map(s=>normalizar(s.trim())).filter(Boolean);
    const filtradas = !filtros.length ? p.canciones : p.canciones.filter(s=>{
      const a = normalizar(s.artist||''); const t = normalizar(s.title||'');
      return filtros.some(f=>a.includes(f)||t.includes(f));
    });
    const box = document.createElement('div'); box.className='listado expanded';
    const head = document.createElement('div'); head.className='listado-header';
    head.innerHTML = `<h4>👤 ${nombre}</h4><div><span class="hint">${p.canciones.length} temas</span><span class="chevron">▶</span></div>`;
    head.onclick = ()=> box.classList.toggle('expanded');
    const body = document.createElement('div'); body.className='listado-body';
    body.innerHTML = `
      <div class="row wrap">
        <input type="text" placeholder="Filtrar por artista(s), coma separada" value="${p.artistas||''}" oninput="actualizarArtistas('${nombre}', this.value)" style="min-width:260px">
        <button onclick="exportarParticipanteJSON('${nombre}')">📤 Exportar JSON</button>
        <button onclick="exportarParticipanteM3U('${nombre}')">📤 Exportar M3U</button>
        <button onclick="eliminarParticipante('${nombre}')" style="background:#2a1020;border-color:#4a1a36">🗑️ Eliminar</button>
      </div>
      <div class="row wrap" style="gap:12px;align-items:stretch">
        ${filtradas.map(s=>`
          <div class="ytCard" style="width:260px">
            <img class="ytThumb" src="${s.thumb}" alt="${s.title}">
            <div class="ytBody">
              <div class="ytTitle">${s.title}</div>
              <div class="ytMeta">${s.channel}</div>
              <div class="row wrap">
                <button onclick="ytPlayer.loadVideoById('${s.id}')">▶️</button>
                <button onclick="quitarCancion('${nombre}','${s.id}')">✖️</button>
              </div>
            </div>
          </div>
        `).join('') || "<div class='hint'>No hay canciones que coincidan con el filtro.</div>"}
      </div>`;
    box.appendChild(head); box.appendChild(body); cont.appendChild(box);
  });
}

function addSongToParticipant(videoId, encTitle, encChannel, encThumb){
  const sel = document.getElementById('addSel_'+videoId); if(!sel) return alert('Crea un participante');
  const nombre = sel.value; if(!participantes[nombre]) return;
  const title = decodeURIComponent(encTitle); const channel = decodeURIComponent(encChannel); const thumb = decodeURIComponent(encThumb);
  const artistGuess = title.split(' - ')[0] || channel;
  const song = { id:videoId, title, channel, artist:artistGuess, thumb };
  if(!participantes[nombre].canciones.some(s=>s.id===videoId)){
    participantes[nombre].canciones.push(song); guardarLocal(); renderParticipantes(); alert('✅ Añadido a '+nombre);
  }else{ alert('Ya estaba en la lista de '+nombre); }
}
function eliminarParticipante(nombre){
  if(!confirm('¿Eliminar a '+nombre+' y sus canciones?')) return;
  delete participantes[nombre]; guardarLocal(); renderParticipantes();
}
function actualizarArtistas(nombre, val){ if(!participantes[nombre]) return; participantes[nombre].artistas = val; guardarLocal(); }
function quitarCancion(nombre, id){ if(!participantes[nombre]) return; participantes[nombre].canciones = participantes[nombre].canciones.filter(s=>s.id!==id); guardarLocal(); renderParticipantes(); }

function exportarParticipanteJSON(nombre){
  const data = participantes[nombre]; if(!data) return;
  descargarBlob(JSON.stringify({[nombre]:data},null,2),'application/json','karaoke_'+nombre+'.json');
}
function exportarParticipanteM3U(nombre){
  const data = participantes[nombre]; if(!data?.canciones?.length) return alert('No hay canciones.');
  let m3u = '#EXTM3U\n';
  data.canciones.forEach(s=>{ const url='https://www.youtube.com/watch?v='+s.id; m3u += `#EXTINF:-1 group-title="${nombre}",${s.title}\n${url}\n`; });
  descargarBlob(m3u,'text/plain','karaoke_'+nombre+'.m3u');
}
function exportarSesionKaraokeJSON(){ descargarBlob(JSON.stringify(participantes,null,2),'application/json','karaoke_sesion.json'); }
function exportarSesionKaraokeM3U(){
  const nombres = Object.keys(participantes); if(!nombres.length) return alert('No hay participantes.');
  let m3u = '#EXTM3U\n';
  nombres.forEach(n=>{ (participantes[n].canciones||[]).forEach(s=>{ const url='https://www.youtube.com/watch?v='+s.id; m3u += `#EXTINF:-1 group-title="${n}",${s.title}\n${url}\n`; }); });
  descargarBlob(m3u,'text/plain','karaoke_sesion.m3u');
}

function generarColaTurnos(){
  const nombres = Object.keys(participantes);
  colaTurnos = []; turnoIndex = -1;
  if(!nombres.length) { actualizarUICola(); return alert('No hay participantes.'); }
  const maxLen = Math.max(...nombres.map(n => participantes[n].canciones.length));
  if(maxLen===0){ actualizarUICola(); return alert('No hay canciones.'); }
  for(let i=0;i<maxLen;i++){
    for(const n of nombres){
      const song = participantes[n].canciones[i];
      if(song) colaTurnos.push({nombre:n, song});
    }
  }
  if(colaTurnos.length){ turnoIndex = 0; reproducirTurnoActual(); }
  actualizarUICola();
}
function reproducirTurnoActual(){
  if(turnoIndex<0 || turnoIndex>=colaTurnos.length) return;
  const {nombre, song} = colaTurnos[turnoIndex];
  try{ ytPlayer.loadVideoById(song.id); }catch{}
  document.getElementById('nowPlaying').textContent = `Ahora canta: ${nombre} — ${song.title}`;
  const sig = colaTurnos[(turnoIndex+1) % colaTurnos.length];
  document.getElementById('nextUp').textContent = sig ? `Siguiente: ${sig.nombre} — ${sig.song.title}` : 'Siguiente: —';
}
function nextTurno(){ if(!colaTurnos.length) return; turnoIndex = (turnoIndex+1) % colaTurnos.length; reproducirTurnoActual(); actualizarUICola(); }
function prevTurno(){ if(!colaTurnos.length) return; turnoIndex = (turnoIndex-1+colaTurnos.length)%colaTurnos.length; reproducirTurnoActual(); actualizarUICola(); }
function actualizarUICola(){ document.getElementById('turnosLen').textContent = (colaTurnos.length||0)+' en cola'; }

/* ========= Neon Stage (simulado por estado del player) ========= */
const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
function resizeCanvas(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }
window.addEventListener('resize', resizeCanvas); resizeCanvas();

function startNeon(){
  if(neonActive) return;
  neonActive = true;
  document.body.classList.add('neon-active');
  animateVisualizer();
  document.getElementById('neonLabel').style.opacity = '1';
}
function stopNeon(){
  neonActive = false;
  document.body.classList.remove('neon-active');
  cancelAnimationFrame(rafId);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  document.getElementById('neonLabel').style.opacity = '0';
}
function animateVisualizer(){
  const bars = 64;
  function frame(){
    rafId = requestAnimationFrame(frame);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if(canvas.width!==w||canvas.height!==h){ resizeCanvas(); }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const t = (ytPlayer && ytPlayer.getCurrentTime)? ytPlayer.getCurrentTime() : performance.now()/1000;
    for(let i=0;i<bars;i++){
      const beat = (Math.sin(t*2 + i*0.4)+1)/2; // 0..1
      const jitter = Math.random()*0.15;
      const amp = Math.min(1, beat*0.8 + jitter);
      const barW = canvas.width/bars;
      const barH = amp * canvas.height;
      const x = i*barW;
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#1f8bff';
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.6 + 0.4*amp;
      ctx.fillRect(x, canvas.height - barH, barW-2, barH);
      ctx.globalAlpha = 1;
    }
  }
  frame();
}

/* ========= Color Picker ========= */
function initColorPicker(){
  const box = document.getElementById('colorPicker'); box.innerHTML='';
  const saved = localStorage.getItem('TB_color') || neonColors[0];
  document.documentElement.style.setProperty('--accent', saved);
  neonColors.forEach(c=>{
    const sw = document.createElement('div'); sw.className='color-swatch'; sw.style.background=c;
    if(c===saved) sw.classList.add('active');
    sw.onclick = ()=>{
      document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
      sw.classList.add('active');
      document.documentElement.style.setProperty('--accent', c);
      localStorage.setItem('TB_color', c);
    };
    box.appendChild(sw);
  });
}

/* ========= INIT ========= */
function poblarBaseCategorias(){
  filtroCategoria.innerHTML = '';
  const all = document.createElement('option'); all.value='__TODOS__'; all.textContent='Todos'; filtroCategoria.appendChild(all);
  const baseCats = Object.keys(categories).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  baseCats.concat(['Varios']).forEach(cat=>{ const opt=document.createElement('option'); opt.value=cat; opt.textContent=cat; filtroCategoria.appendChild(opt); });
  filtroCategoria.value='__TODOS__';
  poblarSelectorCategoriasPlayer(baseCats);
  filtrarPorCategoria();
}
function init(){
  cargarLocal();
  renderListas();
  poblarSelectorListasPlayer();
  poblarBaseCategorias();

  // Atajos
  document.addEventListener('keydown',(e)=>{
    const tag=(e.target.tagName||'').toLowerCase();
    const editable=e.target.isContentEditable || tag==='input' || tag==='textarea' || tag==='select';
    if(editable) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); if(canalDropdown.selectedIndex < canalDropdown.options.length-1) canalDropdown.selectedIndex++; }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(canalDropdown.selectedIndex>0) canalDropdown.selectedIndex--; }
    else if(e.key==='Enter'){ e.preventDefault(); verificarCanal(); }
  });
}
init();
