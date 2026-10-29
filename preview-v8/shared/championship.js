(()=>{
const API='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev',FALLBACK='../data/championship-fixture.json',SERIES_DATA='../data/anfa-chepica-2026-series-results.json',V='20261029-segunda-rueda01';
const ROMAN={1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X'},LABEL={TERCERA:'Tercera Serie',SEGUNDA:'Segunda Serie',SENIOR:'Senior',PRIMERA:'Primera Serie'};
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
const rn=m=>Number(m.round_no)||({I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10}[(m.round_label||'').replace('Fecha ','').trim()]||99);
const grp=m=>String(m.group_id||((m.match_id||'').startsWith('B-')?'B':'A')).toUpperCase();
function crest(n){const src=ASSETS[norm(n)];return src?`<img class="champ-crest" src="${src}" alt="Escudo ${esc(n)}" decoding="async">`:'<span class="champ-crest champ-crest-fallback" aria-hidden="true">⚽</span>'}
function card(m,map){const r=map.get(m.match_id),series=r?.series?.length?`<div class="champ-series">${r.series.map(s=>`<div class="champ-series-row"><span>${LABEL[s.series]||s.series}</span><strong>${s.home_score}<em>–</em>${s.away_score}</strong></div>`).join('')}</div><div class="champ-verified">✓ Resultado verificado</div>`:'<div class="champ-series-empty">⚪ Resultados aún no publicados</div>';return `<article class="champ-match-card ${r?'has-results':''}"><div class="champ-match-head"><div class="champ-team">${crest(m.home_name)}<span class="champ-team-name">${esc(m.home_name)}</span></div><div class="champ-vs">VS</div><div class="champ-team away"><span class="champ-team-name">${esc(m.away_name)}</span>${crest(m.away_name)}</div></div>${series}</article>`}
async function loadSeries(){try{const r=await fetch(`${API}/api/v1/series-results?ts=${Date.now()}`,{cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok||!Array.isArray(j.results))throw Error('series_api');return {results:j.results,mode:'live'}}catch(e){const r=await fetch(`${SERIES_DATA}?v=${V}`,{cache:'no-store'}),j=r.ok?await r.json():{results:[]};return {results:j.results||[],mode:'snapshot'}}}
function deriveByes(matches){const groups=new Map(),rounds=new Map();for(const m of matches){const g=grp(m),n=rn(m);if(!groups.has(g))groups.set(g,new Map());if(!rounds.has(g))rounds.set(g,new Set());rounds.get(g).add(n);groups.get(g).set(m.home_id,m.home_name);groups.get(g).set(m.away_id,m.away_name)}const byes=[];for(const [g,teams] of groups)for(const n of rounds.get(g)){const playing=new Set(matches.filter(m=>grp(m)===g&&rn(m)===n).flatMap(m=>[m.home_id,m.away_id]));for(const [team_id,team_name] of teams)if(!playing.has(team_id))byes.push({group_id:g,round_no:n,team_id,team_name})}return byes}
async function data(){let f;try{const r=await fetch(`${API}/api/v1/matches`,{cache:'no-store'}),j=await r.json(),m=(j.matches||[]).filter(x=>x.competition_id==='ANFA-CHEPICA-2026');if(![25,50].includes(m.length))throw Error('fixture_count');f={matches:m,byes:deriveByes(m),mode:'live'}}catch(e){const r=await fetch(`${FALLBACK}?v=${V}`,{cache:'no-store'}),j=await r.json();f={matches:j.matches||[],byes:deriveByes(j.matches||[]),mode:'snapshot'}}const s=await loadSeries();f.results=s.results;f.seriesMode=s.mode;return f}
function render(d){
 const map=new Map(d.results.map(x=>[x.match_id,x]));
 const available=[...new Set(d.matches.map(rn).filter(x=>x>=1&&x<=10))].sort((a,b)=>a-b);
 let round=available.includes(6)?6:1,group='A';
 const dateLabel=m=>{
   const iso=String(m?.kickoff_at||'').slice(0,10);
   if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso))return '';
   const d=new Date(iso+'T12:00:00');
   return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('es-CL',{weekday:'short',day:'numeric',month:'short'}).format(d);
 };
 const draw=()=>{
   document.getElementById('champRoundTitle').textContent=`FECHA ${ROMAN[round]}`;
   document.querySelectorAll('.champ-date-btn').forEach(x=>x.classList.toggle('active',+x.dataset.round===round));
   document.querySelectorAll('.champ-group-btn').forEach(x=>x.classList.toggle('active',x.dataset.group===group));
   const rows=d.matches.filter(x=>rn(x)===round&&grp(x)===group);
   document.getElementById('champMatchList').innerHTML=(rows.map(x=>card(x,map)).join('')||'<div class="champ-status">Sin partidos.</div>')+(d.byes||[]).filter(x=>Number(x.round_no)===round&&String(x.group_id).toUpperCase()===group).map(x=>`<div class="champ-status">Fecha libre: ${esc(x.team_name||x.team_id)}</div>`).join('');
   const withResults=rows.filter(x=>map.has(x.match_id)).length;
   const scheduled=dateLabel(rows[0]);
   document.getElementById('champPublished').textContent=withResults?`${withResults} partido${withResults===1?'':'s'} con resultados verificados por serie`:`${scheduled?scheduled+' · ':''}Fixture programado · resultados pendientes`;
 };
 document.getElementById('champDateTabs').innerHTML=available.map(n=>{const sample=d.matches.find(m=>rn(m)===n);const date=dateLabel(sample);return `<button class="champ-date-btn ${n===round?'active':''}" data-round="${n}" type="button">Fecha ${ROMAN[n]}${date?' · '+esc(date):''}</button>`}).join('');
 document.getElementById('champDateTabs').onclick=e=>{const b=e.target.closest('[data-round]');if(b){round=+b.dataset.round;draw()}};
 document.getElementById('champGroupSwitch').onclick=e=>{const b=e.target.closest('[data-group]');if(b){group=b.dataset.group;draw()}};
 document.querySelector('[data-action="current"]')?.addEventListener('click',()=>{round=available.includes(6)?6:1;draw();document.getElementById('champFixture').scrollIntoView({behavior:'smooth'})});
 document.querySelector('[data-action="all"]')?.addEventListener('click',()=>document.getElementById('champFixture').scrollIntoView({behavior:'smooth'}));
 const nextAction=document.querySelector('[data-action="current"] strong');if(nextAction)nextAction.textContent=available.includes(6)?'Segunda rueda':'Resultados primera rueda';
 const allHint=document.querySelector('[data-action="all"] small');if(allHint)allHint.textContent=`Fecha I a Fecha ${ROMAN[available.at(-1)]}`;
 document.getElementById('champCount').textContent=`${d.matches.length} partidos · ${d.results.length} con resultados por serie`;
 document.getElementById('champLive').textContent=d.mode==='live'&&d.seriesMode==='live'?'Fixture y resultados conectados al Sports Event Bus':d.mode==='live'?'Fixture conectado · resultados en respaldo seguro':'Datos oficiales publicados · sincronización segura';
 draw();
}
async function boot(){if(!document.getElementById('championshipApp'))return;try{render(await data())}catch(e){console.error('championship_data',e);document.getElementById('champMatchList').innerHTML='<div class="champ-status">No pudimos cargar el campeonato.</div>'}}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();