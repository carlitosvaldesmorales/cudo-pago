(()=>{
const API='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev',FALLBACK='../data/championship-fixture.json',SERIES_DATA='../data/anfa-chepica-2026-series-results.json',V='20260909-resultados01';
const ROMAN={1:'I',2:'II',3:'III',4:'IV',5:'V'},LABEL={TERCERA:'Tercera Serie',SEGUNDA:'Segunda Serie',SENIOR:'Senior',PRIMERA:'Primera Serie'};
const ASSETS={
'JUVENTUD DE CHEPICA':'../media/clubes/juventud-chepica.png',
'SANTA ELENA LA RUDA':'../media/clubes/santa-elena-la-ruda.png',
'INDEPENDIENTE':'../media/clubes/independiente.png',
'UNION ORILLA':'../media/clubes/union-orilla-web.png',
'CUDO':'../media/clubes/union-orilla-web.png',
'SAN JUAN':'../media/clubes/san-juan.png',
'PENAROL LA MINA':'../media/clubes/penarol-la-mina.png',
'HURACAN':'../media/clubes/huracan.png',
'SAN AGUSTIN':'../media/clubes/san-agustin.png',
'SAN RAMON':'../media/clubes/san-ramon.png',
'LAS PALMERAS':'../media/clubes/las-palmeras.png',
'LAS CRUCES':'../media/clubes/las-cruces.png'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));
const rn=m=>Number(m.round_no)||({I:1,II:2,III:3,IV:4,V:5}[(m.round_label||'').replace('Fecha ','').trim()]||99);
const grp=m=>String(m.group_id||((m.match_id||'').startsWith('B-')?'B':'A')).toUpperCase();
function crest(n){const src=ASSETS[norm(n)];return src?`<img class="champ-crest" src="${src}" alt="Escudo ${esc(n)}" decoding="async">`:'<span class="champ-crest champ-crest-fallback" aria-hidden="true">⚽</span>'}
function card(m,map){const r=map.get(m.match_id),series=r?.series?.length?`<div class="champ-series">${r.series.map(s=>`<div class="champ-series-row"><span>${LABEL[s.series]||s.series}</span><strong>${s.home_score}<em>–</em>${s.away_score}</strong></div>`).join('')}</div><div class="champ-verified">✓ Resultado verificado</div>`:'<div class="champ-series-empty">⚪ Resultados aún no publicados</div>';return `<article class="champ-match-card ${r?'has-results':''}"><div class="champ-match-head"><div class="champ-team">${crest(m.home_name)}<span class="champ-team-name">${esc(m.home_name)}</span></div><div class="champ-vs">VS</div><div class="champ-team away"><span class="champ-team-name">${esc(m.away_name)}</span>${crest(m.away_name)}</div></div>${series}</article>`}
async function loadSeries(){try{const r=await fetch(`${API}/api/v1/series-results?ts=${Date.now()}`,{cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok||!Array.isArray(j.results))throw Error('series_api');return {results:j.results,mode:'live'}}catch(e){const r=await fetch(`${SERIES_DATA}?v=${V}`,{cache:'no-store'}),j=r.ok?await r.json():{results:[]};return {results:j.results||[],mode:'snapshot'}}}
async function data(){let f;try{const r=await fetch(`${API}/api/v1/matches`,{cache:'no-store'}),j=await r.json(),m=(j.matches||[]).filter(x=>x.competition_id==='ANFA-CHEPICA-2026');if(m.length!==25)throw Error('fixture');f={matches:m,byes:[],mode:'live'}}catch(e){const r=await fetch(`${FALLBACK}?v=${V}`,{cache:'no-store'}),j=await r.json();f={matches:j.matches||[],byes:j.byes||[],mode:'snapshot'}}const s=await loadSeries();f.results=s.results;f.seriesMode=s.mode;return f}
function render(d){
 let round=1,group='A';
 const map=new Map(d.results.map(x=>[x.match_id,x]));
 const available=[...new Set(d.matches.map(rn).filter(x=>x<90))].sort((a,b)=>a-b);
 const draw=()=>{
   document.getElementById('champRoundTitle').textContent=`FECHA ${ROMAN[round]}`;
   document.querySelectorAll('.champ-date-btn').forEach(x=>x.classList.toggle('active',+x.dataset.round===round));
   document.querySelectorAll('.champ-group-btn').forEach(x=>x.classList.toggle('active',x.dataset.group===group));
   const rows=d.matches.filter(x=>rn(x)===round&&grp(x)===group);
   document.getElementById('champMatchList').innerHTML=rows.map(x=>card(x,map)).join('')||'<div class="champ-status">Sin partidos.</div>';
   const withResults=rows.filter(x=>map.has(x.match_id)).length;
   document.getElementById('champPublished').textContent=withResults?`${withResults} partido${withResults===1?'':'s'} con resultados verificados por serie`:'Fixture programado · resultados pendientes';
 };
 document.getElementById('champDateTabs').innerHTML=available.map(n=>`<button class="champ-date-btn ${n===1?'active':''}" data-round="${n}" type="button">Fecha ${ROMAN[n]}</button>`).join('');
 document.getElementById('champDateTabs').onclick=e=>{const b=e.target.closest('[data-round]');if(b){round=+b.dataset.round;draw()}};
 document.getElementById('champGroupSwitch').onclick=e=>{const b=e.target.closest('[data-group]');if(b){group=b.dataset.group;draw()}};
 document.querySelector('[data-action="current"]')?.addEventListener('click',()=>{round=1;draw();document.getElementById('champFixture').scrollIntoView({behavior:'smooth'})});
 document.querySelector('[data-action="all"]')?.addEventListener('click',()=>document.getElementById('champFixture').scrollIntoView({behavior:'smooth'}));
 document.getElementById('champCount').textContent=`${d.matches.length} partidos · ${d.results.length} con resultados por serie`;
 document.getElementById('champLive').textContent=d.mode==='live'&&d.seriesMode==='live'?'Fixture y resultados conectados al Sports Event Bus':d.mode==='live'?'Fixture conectado · resultados en respaldo seguro':'Datos oficiales publicados · sincronización segura';
 draw();
}
async function boot(){if(!document.getElementById('championshipApp'))return;try{render(await data())}catch(e){console.error('championship_data',e);document.getElementById('champMatchList').innerHTML='<div class="champ-status">No pudimos cargar el campeonato.</div>'}}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();