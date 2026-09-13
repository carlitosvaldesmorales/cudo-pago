const WORKER='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const POLL_MS=3000;
const MAX_ROUND=5;
const SERIES_ORDER=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];

const els={
  round:document.getElementById('round'),
  feedUrl:document.getElementById('feedUrl'),
  copyUrl:document.getElementById('copyUrl'),
  connection:document.getElementById('connection'),
  connectionDot:document.getElementById('connectionDot'),
  updated:document.getElementById('updated'),
  matchesCount:document.getElementById('matchesCount'),
  seriesCount:document.getElementById('seriesCount'),
  reportedCount:document.getElementById('reportedCount'),
  officialCount:document.getElementById('officialCount'),
  content:document.getElementById('content')
};

let currentRound=readRound();
let pollTimer=null;
let loading=false;

function readRound(){
  const value=Number(new URL(location.href).searchParams.get('fecha'));
  return Number.isInteger(value)&&value>=1&&value<=MAX_ROUND?value:3;
}

function feedUrl(round){
  return `${WORKER}/vmix/fecha/${round}.json`;
}

function esc(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function setConnection(text,kind){
  els.connection.textContent=text;
  els.connectionDot.className=`dot dot-${kind}`;
}

function statusMeta(row){
  const status=String(row?.status_label||'SIN RESULTADO');
  if(status==='OFICIAL') return {label:'OFICIAL',className:'chip-official'};
  if(status==='INFORMADO') return {label:'INFORMADO',className:'chip-reported'};
  return {label:status,className:'chip-other'};
}

function score(row){
  return row?.has_result==='1'?`${esc(row.home_score)} — ${esc(row.away_score)}`:'—';
}

function validateRows(rows,round){
  if(!Array.isArray(rows)) throw new Error('payload_not_array');
  for(const row of rows){
    if(Number(row.round_no)!==Number(round)) throw new Error('round_mismatch');
    if(!row.match_id||!SERIES_ORDER.includes(row.series_code)) throw new Error('invalid_row_contract');
    if(!row.home_name||!row.away_name||!row.home_crest_url||!row.away_crest_url) throw new Error('missing_club_identity');
  }
  return rows;
}

function groupMatches(rows){
  const map=new Map();
  for(const row of rows){
    if(!map.has(row.match_id)) map.set(row.match_id,{
      match_id:row.match_id,
      group_id:row.group_id,
      round_label:row.round_label,
      home_id:row.home_id,
      home_name:row.home_name,
      home_crest_url:row.home_crest_url,
      away_id:row.away_id,
      away_name:row.away_name,
      away_crest_url:row.away_crest_url,
      series:[]
    });
    map.get(row.match_id).series.push(row);
  }
  return [...map.values()].sort((a,b)=>String(a.group_id).localeCompare(String(b.group_id))||String(a.match_id).localeCompare(String(b.match_id)));
}

function renderSeries(row){
  const meta=statusMeta(row);
  return `<div class="series-row">
    <span class="series-name">${esc(row.series_label||row.series_code)}</span>
    <span class="score">${score(row)}</span>
    <span class="state"><span class="chip ${meta.className}">${esc(meta.label)}</span></span>
  </div>`;
}

function renderMatch(match){
  const bySeries=new Map(match.series.map(row=>[row.series_code,row]));
  const rows=SERIES_ORDER.map(code=>bySeries.get(code)).filter(Boolean);
  return `<article class="match" data-match-id="${esc(match.match_id)}">
    <div class="teams">
      <div class="team">
        <img class="crest" src="${esc(match.home_crest_url)}" alt="Escudo ${esc(match.home_name)}">
        <span class="team-name">${esc(match.home_name)}</span>
      </div>
      <span class="versus">VS</span>
      <div class="team away">
        <span class="team-name">${esc(match.away_name)}</span>
        <img class="crest" src="${esc(match.away_crest_url)}" alt="Escudo ${esc(match.away_name)}">
      </div>
    </div>
    <div class="series">${rows.map(renderSeries).join('')}</div>
  </article>`;
}

function render(rows){
  const matches=groupMatches(rows);
  els.matchesCount.textContent=String(matches.length);
  els.seriesCount.textContent=String(rows.length);
  els.reportedCount.textContent=String(rows.filter(r=>r.status_label==='INFORMADO').length);
  els.officialCount.textContent=String(rows.filter(r=>r.status_label==='OFICIAL').length);

  const generated=rows.find(r=>r.generated_at)?.generated_at;
  if(generated){
    try{
      els.updated.textContent=`Actualizado ${new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(generated))}`;
    }catch{ els.updated.textContent='Actualizado'; }
  }else{
    els.updated.textContent='Sin resultados cargados todavía';
  }

  const groups=[...new Set(matches.map(m=>m.group_id).filter(Boolean))].sort();
  els.content.innerHTML=groups.length?groups.map(group=>{
    const groupMatches=matches.filter(m=>m.group_id===group);
    return `<section class="group-block"><h2 class="group-title">Grupo ${esc(group)}</h2><div class="matches">${groupMatches.map(renderMatch).join('')}</div></section>`;
  }).join(''):'<div class="empty">No hay partidos cargados para esta fecha.</div>';
}

async function refresh(){
  if(loading) return;
  loading=true;
  try{
    const response=await fetch(feedUrl(currentRound),{cache:'no-store'});
    if(!response.ok) throw new Error(`feed_http_${response.status}`);
    const rows=validateRows(await response.json(),currentRound);
    render(rows);
    setConnection('DATOS EN LÍNEA','live');
  }catch(error){
    console.error(error);
    setConnection('SIN CONEXIÓN','error');
    if(!els.content.querySelector('.match')) els.content.innerHTML='<div class="error">No pudimos leer la fuente vMix en este momento.</div>';
  }finally{
    loading=false;
  }
}

function setRound(round){
  currentRound=round;
  const url=new URL(location.href);
  url.searchParams.set('fecha',String(round));
  history.replaceState(null,'',url);
  els.feedUrl.textContent=feedUrl(round);
  els.content.innerHTML=`<div class="empty">Cargando Fecha ${round}…</div>`;
  refresh();
}

async function copyFeedUrl(){
  const value=feedUrl(currentRound);
  try{
    await navigator.clipboard.writeText(value);
    els.copyUrl.textContent='Copiada ✓';
  }catch{
    const area=document.createElement('textarea');
    area.value=value;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    els.copyUrl.textContent='Copiada ✓';
  }
  setTimeout(()=>{els.copyUrl.textContent='Copiar URL';},1600);
}

function boot(){
  els.round.innerHTML=Array.from({length:MAX_ROUND},(_,i)=>i+1).map(n=>`<option value="${n}">Fecha ${n}</option>`).join('');
  els.round.value=String(currentRound);
  els.feedUrl.textContent=feedUrl(currentRound);
  els.round.addEventListener('change',()=>setRound(Number(els.round.value)));
  els.copyUrl.addEventListener('click',copyFeedUrl);
  refresh();
  pollTimer=setInterval(refresh,POLL_MS);
  addEventListener('beforeunload',()=>clearInterval(pollTimer),{once:true});
}

boot();
