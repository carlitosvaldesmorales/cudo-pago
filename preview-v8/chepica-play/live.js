const API='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const WS='wss://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const MAX_ROUND=5;

const els={
  round:document.getElementById('round'),reload:document.getElementById('reload'),connection:document.getElementById('connection'),
  updated:document.getElementById('updated'),content:document.getElementById('content'),matches:document.getElementById('matchesCount'),
  official:document.getElementById('officialCount'),reported:document.getElementById('reportedCount'),empty:document.getElementById('emptyCount')
};

let socket=null,retryTimer=null,currentRound=readRound(),snapshot=null;

function readRound(){
  const value=Number(new URL(location.href).searchParams.get('fecha'));
  return Number.isInteger(value)&&value>=1&&value<=MAX_ROUND?value:3;
}

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export function classifySeries(series){
  if(series?.status==='PENDIENTE') return {label:'INFORMADO',className:'chip-reported',kind:'reported'};
  if(series?.status==='VERIFIED') return {label:'OFICIAL',className:'chip-official',kind:'official'};
  if(series?.status==='DISPUTED') return {label:'EN DISPUTA',className:'chip-disputed',kind:'other'};
  if(series?.status==='ANNULLED') return {label:'ANULADO',className:'chip-annulled',kind:'other'};
  return {label:'SIN RESULTADO',className:'',kind:'empty'};
}

export function validateReportedSnapshot(data,round){
  if(!data?.ok||data.mode!=='reported'||Number(data.round_no)!==Number(round)||!Array.isArray(data.matches)) throw new Error('invalid_reported_snapshot');
  for(const match of data.matches){
    if(!Array.isArray(match.series)||match.series.length!==4) throw new Error('invalid_series_contract');
    const codes=match.series.map(x=>x.series_code);
    if(SERIES.some(code=>!codes.includes(code))) throw new Error('missing_canonical_series');
  }
  return data;
}

function status(text,className){
  els.connection.textContent=text;
  els.connection.className=`status ${className}`;
}

function timeLabel(value){
  if(!value) return 'Sin datos todavía';
  try{return `Actualizado ${new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value))}`;}catch{return 'Actualizado';}
}

function renderSeries(series){
  const meta=classifySeries(series);
  const hasScore=series.home_score!==null&&series.away_score!==null;
  const source=series.source_label?`<span class="source">${esc(series.source_label)}</span>`:'';
  return `<div class="series-row">
    <span class="series-name">${esc(series.series_label||LABEL[series.series_code]||series.series_code)}</span>
    <span class="score">${hasScore?`${Number(series.home_score)} — ${Number(series.away_score)}`:'—'}</span>
    <span><span class="chip ${meta.className}">${meta.label}</span>${source}</span>
  </div>`;
}

function renderMatch(match){
  const series=SERIES.map(code=>match.series.find(x=>x.series_code===code)||{series_code:code,series_label:LABEL[code],status:'SIN_RESULTADO',home_score:null,away_score:null});
  return `<article class="match" data-match-id="${esc(match.match_id)}">
    <div class="teams"><span>${esc(match.home_name)}</span><span class="versus">VS</span><span class="away">${esc(match.away_name)}</span></div>
    <div class="series">${series.map(renderSeries).join('')}</div>
  </article>`;
}

function render(){
  if(!snapshot){els.content.innerHTML='<div class="empty-state">Sin snapshot disponible.</div>';return;}
  const counts={official:0,reported:0,empty:0};
  for(const match of snapshot.matches) for(const series of match.series){
    const kind=classifySeries(series).kind;
    if(kind==='official') counts.official+=1;
    else if(kind==='reported') counts.reported+=1;
    else if(kind==='empty') counts.empty+=1;
  }
  els.matches.textContent=String(snapshot.matches.length);
  els.official.textContent=String(counts.official);
  els.reported.textContent=String(counts.reported);
  els.empty.textContent=String(counts.empty);
  els.updated.textContent=timeLabel(snapshot.generated_at);

  const groups=[...new Set(snapshot.matches.map(m=>String(m.group_id||'').toUpperCase()).filter(Boolean))].sort();
  els.content.innerHTML=groups.length?groups.map(group=>{
    const rows=snapshot.matches.filter(m=>String(m.group_id||'').toUpperCase()===group);
    return `<section class="group-block"><h2 class="group-title">Grupo ${esc(group)}</h2><div class="matches">${rows.map(renderMatch).join('')}</div></section>`;
  }).join(''):'<div class="empty-state">No hay partidos cargados para esta fecha.</div>';
  els.content.classList.remove('flash');void els.content.offsetWidth;els.content.classList.add('flash');
}

async function loadSnapshot(round){
  status('CONECTANDO','status-connecting');
  const response=await fetch(`${API}/api/v1/rounds/${round}/results?mode=reported`,{cache:'no-store'});
  if(!response.ok) throw new Error(`snapshot_http_${response.status}`);
  snapshot=validateReportedSnapshot(await response.json(),round);
  render();
}

function closeSocket(){
  if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
  if(socket){socket.onclose=null;socket.close();socket=null;}
}

function connect(round){
  closeSocket();
  const ws=new WebSocket(`${WS}/stream/ws/${round}`);
  socket=ws;
  ws.onopen=()=>status('EN VIVO','status-live');
  ws.onmessage=event=>{
    try{
      const payload=JSON.parse(event.data);
      if(payload.type!=='results.snapshot'||Number(payload.round_no)!==round||!payload.modes?.reported) return;
      snapshot=validateReportedSnapshot(payload.modes.reported,round);
      render();
    }catch(error){console.warn('Evento de resultados inválido',error);}
  };
  ws.onerror=()=>ws.close();
  ws.onclose=()=>{
    if(currentRound!==round) return;
    status('RECONECTANDO','status-reconnecting');
    retryTimer=setTimeout(()=>connect(round),2000);
  };
}

async function switchRound(round){
  currentRound=round;
  const url=new URL(location.href);url.searchParams.set('fecha',String(round));history.replaceState(null,'',url);
  closeSocket();snapshot=null;els.content.innerHTML='<div class="empty-state">Cargando jornada…</div>';
  try{await loadSnapshot(round);connect(round);}catch(error){
    status('SIN CONEXIÓN','status-error');
    els.content.innerHTML='<div class="empty-state">No pudimos cargar los resultados en este momento.</div>';
    console.error(error);
  }
}

function boot(){
  els.round.innerHTML=Array.from({length:MAX_ROUND},(_,i)=>i+1).map(n=>`<option value="${n}">Fecha ${n}</option>`).join('');
  els.round.value=String(currentRound);
  els.round.addEventListener('change',()=>switchRound(Number(els.round.value)));
  els.reload.addEventListener('click',()=>switchRound(currentRound));
  switchRound(currentRound);
}

boot();
