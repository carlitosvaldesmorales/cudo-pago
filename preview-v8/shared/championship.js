(()=>{
  const API='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
  const FALLBACK='../data/championship-fixture.json';
  const COMPETITION='ANFA-CHEPICA-2026';
  const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
  const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
  const ROMAN={1:'I',2:'II',3:'III',4:'IV',5:'V'};

  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const clubShort=n=>{
    const clean=(n||'').replace(/de |del |la |las |los /gi,' ').trim().split(/\s+/);
    return clean.slice(0,2).map(x=>x[0]).join('').toUpperCase()||'FC';
  };
  const roundNo=m=>{
    if(Number.isFinite(Number(m.round_no))) return Number(m.round_no);
    const x=(m.round_label||'').match(/(I{1,3}|IV|V|\d+)/i);
    if(!x)return 99;
    const t=x[1].toUpperCase();
    return ({I:1,II:2,III:3,IV:4,V:5}[t]||Number(t)||99);
  };
  const groupOf=m=>String(m.group_id||(m.match_id||'').startsWith('B-')?'B':'A').toUpperCase();

  function pendingSeries(){
    return SERIES.map(code=>({series_code:code,label:SERIES_LABEL[code],public_status:'PENDING',home_score:null,away_score:null}));
  }

  function normalizeSnapshot(data){
    const matches=(data.matches||[])
      .filter(m=>!m.competition_id||m.competition_id===COMPETITION)
      .map(m=>({...m,series:pendingSeries(),public_status:'PENDING'}));
    return {matches,byes:data.byes||[],mode:'snapshot',summary:null};
  }

  function validateLiveContract(data){
    if(!data?.ok||data.contract!=='public-championship-v1'||!Array.isArray(data.matches)) throw new Error('invalid_public_championship_contract');
    if(data.matches.length!==25) throw new Error('incomplete_public_championship_fixture');
    for(const match of data.matches){
      if(match.competition_id!==COMPETITION||!Array.isArray(match.series)||match.series.length!==4) throw new Error('invalid_public_match');
      const codes=match.series.map(s=>s.series_code);
      if(SERIES.some(code=>!codes.includes(code))) throw new Error('incomplete_public_series');
      for(const serie of match.series){
        if(!['OFFICIAL','IN_REVIEW','ANNULLED','PENDING'].includes(serie.public_status)) throw new Error('invalid_public_series_status');
        if(serie.public_status!=='OFFICIAL'&&(serie.home_score!==null||serie.away_score!==null)) throw new Error('non_public_score_leak');
        if(serie.public_status==='OFFICIAL'&&(!Number.isInteger(serie.home_score)||!Number.isInteger(serie.away_score))) throw new Error('invalid_official_score');
      }
    }
  }

  function seriesPill(serie){
    const label=esc(serie.label||SERIES_LABEL[serie.series_code]||serie.series_code);
    if(serie.public_status==='OFFICIAL'){
      return `<span class="champ-series-pill official"><strong>${label}</strong><b>${serie.home_score}–${serie.away_score}</b><small>Oficial</small></span>`;
    }
    if(serie.public_status==='IN_REVIEW'){
      return `<span class="champ-series-pill review"><strong>${label}</strong><b>—</b><small>En revisión</small></span>`;
    }
    if(serie.public_status==='ANNULLED'){
      return `<span class="champ-series-pill annulled"><strong>${label}</strong><b>—</b><small>Anulado</small></span>`;
    }
    return `<span class="champ-series-pill pending"><strong>${label}</strong><b>—</b><small>Pendiente</small></span>`;
  }

  function matchStateLabel(match){
    const states=(match.series||[]).map(s=>s.public_status);
    if(states.includes('IN_REVIEW')) return ['review','⚠️ Hay una serie en revisión'];
    if(states.includes('ANNULLED')) return ['annulled','🚫 Hay una serie anulada'];
    if(states.length&&states.every(x=>x==='OFFICIAL')) return ['complete','✅ Cuatro series oficiales'];
    if(states.includes('OFFICIAL')) return ['partial','Resultados parciales'];
    return ['pending','Aún sin resultados oficiales'];
  }

  function matchCard(match){
    const state=matchStateLabel(match);
    const series=Array.isArray(match.series)?match.series:pendingSeries();
    return `<article class="champ-match governed">
      <div class="champ-match-main">
        <div class="champ-team"><span class="champ-crest">${esc(clubShort(match.home_name))}</span><span class="champ-team-name">${esc(match.home_name)}</span></div>
        <div class="champ-vs">VS</div>
        <div class="champ-team away"><span class="champ-team-name">${esc(match.away_name)}</span><span class="champ-crest">${esc(clubShort(match.away_name))}</span></div>
      </div>
      <div class="champ-series-grid" aria-label="Resultados por serie">${SERIES.map(code=>seriesPill(series.find(s=>s.series_code===code)||{series_code:code,label:SERIES_LABEL[code],public_status:'PENDING'})).join('')}</div>
      <div class="champ-governance-state ${state[0]}">${state[1]}</div>
    </article>`;
  }

  async function loadData(){
    try{
      const response=await fetch(`${API}/api/v1/public-championship`,{cache:'no-store'});
      if(!response.ok) throw new Error('public_championship_unavailable');
      const data=await response.json();
      validateLiveContract(data);
      return {matches:data.matches,byes:data.byes||[],mode:'live',summary:data.summary||null};
    }catch(error){
      const response=await fetch(FALLBACK,{cache:'no-store'});
      if(!response.ok) throw error;
      return normalizeSnapshot(await response.json());
    }
  }

  function render(app,matches,byes){
    let round=2,group='A';
    const available=[...new Set(matches.map(roundNo).filter(n=>n<90))].sort((a,b)=>a-b);
    const draw=()=>{
      document.querySelectorAll('.champ-date-btn').forEach(b=>b.classList.toggle('active',Number(b.dataset.round)===round));
      document.querySelectorAll('.champ-group-btn').forEach(b=>b.classList.toggle('active',b.dataset.group===group));
      const title=document.getElementById('champRoundTitle');
      if(title)title.textContent=`FECHA ${ROMAN[round]||round}`;
      const list=document.getElementById('champMatchList');
      const rows=matches.filter(m=>roundNo(m)===round&&groupOf(m)===group);
      list.innerHTML=rows.length?rows.map(matchCard).join(''):'<div class="champ-status">No hay partidos registrados para esta selección.</div>';
      const bye=byes.find(b=>Number(b.round_no)===round&&String(b.group_id||'').toUpperCase()===group);
      document.getElementById('champBye')?.remove();
      if(bye) list.insertAdjacentHTML('afterend',`<div class="champ-bye" id="champBye">🛋️ Descansa: <strong>${esc(bye.team_name||bye.team_id)}</strong></div>`);
    };

    const tabs=document.getElementById('champDateTabs');
    tabs.innerHTML=available.map(n=>`<button class="champ-date-btn ${n===round?'active':''}" data-round="${n}" type="button">Fecha ${ROMAN[n]||n}</button>`).join('');
    tabs.addEventListener('click',e=>{const b=e.target.closest('[data-round]');if(!b)return;round=Number(b.dataset.round);draw()});
    document.getElementById('champGroupSwitch').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(!b)return;group=b.dataset.group;draw()});
    document.querySelector('[data-action="current"]')?.addEventListener('click',()=>{round=2;draw();document.getElementById('champFixture')?.scrollIntoView({behavior:'smooth'})});
    document.querySelector('[data-action="all"]')?.addEventListener('click',()=>document.getElementById('champFixture')?.scrollIntoView({behavior:'smooth'}));
    draw();
  }

  async function boot(){
    const app=document.getElementById('championshipApp');
    if(!app)return;
    try{
      const data=await loadData();
      render(app,data.matches,data.byes);
      document.getElementById('champCount').textContent=`${data.matches.length} partidos cargados`;
      document.getElementById('champLive').textContent=data.mode==='live'?'Resultados por serie conectados al Sports Event Bus':'Fixture oficial publicado · resultados en modo seguro';
    }catch{
      document.getElementById('champMatchList').innerHTML='<div class="champ-status">No pudimos cargar el fixture en este momento. Intenta nuevamente.</div>';
      document.getElementById('champLive').textContent='Datos no disponibles';
    }
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
