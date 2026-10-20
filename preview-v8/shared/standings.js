(()=>{
const API='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const WS=API.replace(/^http/,'ws');
const MAX_ROUND=5;
const V='20261020-canonical03';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const slugMap={
  'JUVENTUD DE CHEPICA':'juventud-chepica.png','SANTA ELENA LA RUDA':'santa-elena-la-ruda.png','INDEPENDIENTE':'independiente.png',
  'UNION ORILLA':'union-orilla-web.png','CUDO':'union-orilla-web.png','SAN JUAN':'san-juan.png','PENAROL LA MINA':'penarol-la-mina.png',
  'HURACAN':'huracan.png','SAN AGUSTIN':'san-agustin.png','SAN RAMON':'san-ramon.png','LAS PALMERAS':'las-palmeras.png','LAS CRUCES':'las-cruces.png'
};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c));
function crest(name){const f=slugMap[norm(name)];return f?`<img class="stand-crest" src="../media/clubes/${f}" alt="Escudo ${esc(name)}">`:''}
function pointValue(rule,home,away,isHome){
  if(!rule)return 0;
  const mine=isHome?Number(home):Number(away),other=isHome?Number(away):Number(home);
  return mine>other?Number(rule.win||0):mine===other?Number(rule.draw||0):Number(rule.loss||0);
}
function detailIndex(standings,results){
  const details=new Map();
  for(const group of standings.groups||[]){
    for(const championship of group.championships||[]){
      for(const row of championship.rows||[]){
        const key=norm(row.team_name);
        if(!details.has(key))details.set(key,{breakdown:{TERCERA:0,SEGUNDA:0,PRIMERA:0},senior:{w:0,d:0,l:0}});
      }
    }
  }
  const pointRules=standings.rules?.points_by_series||{};
  for(const match of results||[]){
    const home=details.get(norm(match.home_name)),away=details.get(norm(match.away_name));
    if(!home&&!away)continue;
    for(const series of match.series||[]){
      if(series.validation_status&&series.validation_status!=='VERIFIED')continue;
      const code=series.series;
      if(['TERCERA','SEGUNDA','PRIMERA'].includes(code)){
        if(home)home.breakdown[code]+=pointValue(pointRules[code],series.home_score,series.away_score,true);
        if(away)away.breakdown[code]+=pointValue(pointRules[code],series.home_score,series.away_score,false);
      }else if(code==='SENIOR'){
        const hs=Number(series.home_score),as=Number(series.away_score);
        if(home){if(hs>as)home.senior.w++;else if(hs<as)home.senior.l++;else home.senior.d++}
        if(away){if(as>hs)away.senior.w++;else if(as<hs)away.senior.l++;else away.senior.d++}
      }
    }
  }
  return details;
}
const fmtAdj=n=>{const v=Number(n||0);return v>0?`+${v}`:String(v)};
function generalTable(rows,details){
  return `<div class="stand-card"><div class="stand-card-head"><div><span class="stand-kicker">Tercera + Segunda + Primera</span><h3>Tabla General</h3></div><strong>9 pts máx. por jornada</strong></div><div class="stand-scroll"><table class="stand-table"><thead><tr><th>Pos.</th><th>Club</th><th>PJ</th><th>PTS</th><th>AJ</th><th>3ª</th><th>2ª</th><th>1ª</th></tr></thead><tbody>${rows.map(r=>{const d=details.get(norm(r.team_name))||{breakdown:{TERCERA:0,SEGUNDA:0,PRIMERA:0}};return `<tr><td class="stand-rank">${r.position}</td><td><div class="stand-club">${crest(r.team_name)}<span>${esc(r.team_name)}</span></div></td><td>${r.played_matchdays}</td><td class="stand-points">${r.points}</td><td>${fmtAdj(r.adjustment_points)}</td><td>${d.breakdown.TERCERA}</td><td>${d.breakdown.SEGUNDA}</td><td>${d.breakdown.PRIMERA}</td></tr>`}).join('')}</tbody></table></div><div class="stand-rule">Tercera: 2/1/0 · Segunda: 3/1/0 · Primera: 4/2/0 · AJ = ajuste administrativo aplicado por la autoridad.</div></div>`;
}
function seniorTable(rows,details){
  return `<div class="stand-card"><div class="stand-card-head"><div><span class="stand-kicker">Competencia independiente</span><h3>Tabla Senior</h3></div><strong>3 pts por triunfo</strong></div><div class="stand-scroll"><table class="stand-table"><thead><tr><th>Pos.</th><th>Club</th><th>PJ</th><th>PTS</th><th>AJ</th><th>G</th><th>E</th><th>P</th></tr></thead><tbody>${rows.map(r=>{const s=(details.get(norm(r.team_name))||{senior:{w:0,d:0,l:0}}).senior;return `<tr><td class="stand-rank">${r.position}</td><td><div class="stand-club">${crest(r.team_name)}<span>${esc(r.team_name)}</span></div></td><td>${r.played_matchdays}</td><td class="stand-points">${r.points}</td><td>${fmtAdj(r.adjustment_points)}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td></tr>`}).join('')}</tbody></table></div><div class="stand-rule">Senior: triunfo 3 pts · empate 1 pt · derrota 0 pts · AJ = ajuste administrativo.</div></div>`;
}
async function loadJson(path){
  const r=await fetch(`${API}${path}${path.includes('?')?'&':'?'}ts=${Date.now()}`,{cache:'no-store'});
  const j=await r.json();
  if(!r.ok||!j.ok)throw Error(`${path}:${r.status}`);
  return j;
}
async function boot(){
  const root=document.getElementById('champStandings');if(!root)return;
  let group='A',standings=null,details=new Map(),loaded=false,refreshing=false,queued=false,refreshTimer=null;
  const sockets=new Map();
  const draw=()=>{
    if(!standings)return;
    const current=(standings.groups||[]).find(g=>String(g.group_id).toUpperCase()===group);
    if(!current)throw Error(`missing_group_${group}`);
    const general=(current.championships||[]).find(c=>c.championship_code==='PRINCIPAL')?.rows||[];
    const senior=(current.championships||[]).find(c=>c.championship_code==='SENIOR')?.rows||[];
    root.querySelector('#standTables').innerHTML=generalTable(general,details)+seniorTable(senior,details);
    root.querySelectorAll('[data-stand-group]').forEach(b=>b.classList.toggle('active',b.dataset.standGroup===group));
    root.querySelector('#standGroupLabel').textContent=`Grupo ${group}`;
  };
  const refresh=async()=>{
    if(refreshing){queued=true;return;}
    refreshing=true;
    try{
      const [nextStandings,resultDoc]=await Promise.all([loadJson('/api/v1/public-standings'),loadJson('/api/v1/series-results')]);
      if(nextStandings.contract!=='public-standings-v2'||!Array.isArray(nextStandings.groups)||!Array.isArray(resultDoc.results))throw Error('canonical_contract');
      standings=nextStandings;
      details=detailIndex(nextStandings,resultDoc.results);
      root.dataset.resultSource='public-standings-v2';
      root.dataset.rendererVersion=V;
      root.dataset.lastRefresh=new Date().toISOString();
      loaded=true;
      draw();
    }catch(e){
      if(!loaded){
        console.error('standings_canonical',e);
        root.dataset.resultSource='error';
        root.querySelector('#standTables').innerHTML='<div class="champ-status">Tabla temporalmente no disponible. La autoridad canónica no respondió.</div>';
      }else{
        console.warn('standings_refresh_transient',e);
      }
    }finally{
      refreshing=false;
      if(queued){queued=false;queueMicrotask(refresh);}
    }
  };
  const scheduleRefresh=()=>{
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(refresh,120);
  };
  const connectRound=round=>{
    if(document.visibilityState==='hidden')return;
    const current=sockets.get(round);
    if(current&&current.readyState<=1)return;
    const ws=new WebSocket(`${WS}/stream/ws/${round}`);
    sockets.set(round,ws);
    ws.onmessage=event=>{
      try{
        const payload=JSON.parse(event.data);
        if(payload.type==='results.snapshot'&&Number(payload.round_no)===round)scheduleRefresh();
      }catch{}
    };
    ws.onerror=()=>ws.close();
    ws.onclose=()=>{
      if(sockets.get(round)===ws)sockets.delete(round);
      if(document.visibilityState==='visible')setTimeout(()=>connectRound(round),2000);
    };
  };
  const reconcileVisible=()=>{
    if(document.visibilityState!=='visible')return;
    refresh();
    if('WebSocket'in window)for(let round=1;round<=MAX_ROUND;round++)connectRound(round);
  };
  root.addEventListener('click',e=>{const b=e.target.closest('[data-stand-group]');if(b){group=b.dataset.standGroup;draw()}});
  document.addEventListener('visibilitychange',reconcileVisible);
  window.addEventListener('focus',reconcileVisible);
  window.addEventListener('pageshow',reconcileVisible);
  await refresh();
  if('WebSocket'in window)for(let round=1;round<=MAX_ROUND;round++)connectRound(round);
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
