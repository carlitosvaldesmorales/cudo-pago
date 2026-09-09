(()=>{
const API='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const FIXTURE='../data/championship-fixture.json';
const RESULTS='../data/anfa-chepica-2026-series-results.json';
const RULES='../data/anfa-chepica-2026-standings-rules.json';
const V='20260909-resultados01';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const slugMap={
  'JUVENTUD DE CHEPICA':'juventud-chepica.png','SANTA ELENA LA RUDA':'santa-elena-la-ruda.png','INDEPENDIENTE':'independiente.png',
  'UNION ORILLA':'union-orilla-web.png','CUDO':'union-orilla-web.png','SAN JUAN':'san-juan.png','PENAROL LA MINA':'penarol-la-mina.png',
  'HURACAN':'huracan.png','SAN AGUSTIN':'san-agustin.png','SAN RAMON':'san-ramon.png','LAS PALMERAS':'las-palmeras.png','LAS CRUCES':'las-cruces.png'
};
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));
const groupOfMatch=id=>String(id||'').startsWith('B-')?'B':'A';
function crest(name){const f=slugMap[norm(name)];return f?`<img class="stand-crest" src="../media/clubes/${f}" alt="Escudo ${esc(name)}">`:''}
function addPoints(row,series,home,away,isHome,rules){
  const cfg=rules.general.points[series]; if(!cfg)return;
  const mine=isHome?home:away, other=isHome?away:home;
  const pts=mine>other?cfg.win:mine===other?cfg.draw:cfg.loss;
  row.breakdown[series]=(row.breakdown[series]||0)+pts; row.points+=pts;
}
function rankRows(rows){
  const sorted=[...rows].sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'es'));
  let last=null,lastRank=0;
  sorted.forEach((r,i)=>{if(r.points!==last){lastRank=i+1;last=r.points}r.rank=lastRank});
  return sorted;
}
function build(fixture,resultDoc,rules,group){
  const names=new Set();
  fixture.matches.filter(m=>groupOfMatch(m.match_id)===group).forEach(m=>{names.add(m.home_name);names.add(m.away_name)});
  (fixture.byes||[]).filter(b=>String(b.group_id).toUpperCase()===group).forEach(b=>names.add(b.team_name));
  const general=new Map([...names].map(name=>[norm(name),{name,points:0,played:0,breakdown:{TERCERA:0,SEGUNDA:0,PRIMERA:0}}]));
  const senior=new Map([...names].map(name=>[norm(name),{name,points:0,played:0,w:0,d:0,l:0}]));
  for(const match of resultDoc.results||[]){
    if(groupOfMatch(match.match_id)!==group||match.validation_status!=='VERIFIED')continue;
    const homeG=general.get(norm(match.home_name)),awayG=general.get(norm(match.away_name));
    const homeS=senior.get(norm(match.home_name)),awayS=senior.get(norm(match.away_name));
    const seriesMap=new Map((match.series||[]).filter(s=>!s.validation_status||s.validation_status==='VERIFIED').map(s=>[s.series,s]));
    const generalComplete=rules.general.included_series.every(s=>seriesMap.has(s));
    if(generalComplete&&homeG&&awayG){
      homeG.played++; awayG.played++;
      for(const code of rules.general.included_series){const s=seriesMap.get(code);addPoints(homeG,code,s.home_score,s.away_score,true,rules);addPoints(awayG,code,s.home_score,s.away_score,false,rules)}
    }
    const ss=seriesMap.get('SENIOR');
    if(ss&&homeS&&awayS){
      homeS.played++;awayS.played++;
      const hp=ss.home_score>ss.away_score?rules.senior.points.win:ss.home_score===ss.away_score?rules.senior.points.draw:rules.senior.points.loss;
      const ap=ss.away_score>ss.home_score?rules.senior.points.win:ss.home_score===ss.away_score?rules.senior.points.draw:rules.senior.points.loss;
      homeS.points+=hp;awayS.points+=ap;
      if(ss.home_score>ss.away_score){homeS.w++;awayS.l++}else if(ss.home_score<ss.away_score){awayS.w++;homeS.l++}else{homeS.d++;awayS.d++}
    }
  }
  return {general:rankRows([...general.values()]),senior:rankRows([...senior.values()])};
}
function generalTable(rows){return `<div class="stand-card"><div class="stand-card-head"><div><span class="stand-kicker">Tercera + Segunda + Primera</span><h3>Tabla General</h3></div><strong>9 pts máx. por jornada</strong></div><div class="stand-scroll"><table class="stand-table"><thead><tr><th>Pos.</th><th>Club</th><th>PJ</th><th>PTS</th><th>3ª</th><th>2ª</th><th>1ª</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="stand-rank">${r.rank}</td><td><div class="stand-club">${crest(r.name)}<span>${esc(r.name)}</span></div></td><td>${r.played}</td><td class="stand-points">${r.points}</td><td>${r.breakdown.TERCERA}</td><td>${r.breakdown.SEGUNDA}</td><td>${r.breakdown.PRIMERA}</td></tr>`).join('')}</tbody></table></div><div class="stand-rule">Tercera: 2/1/0 · Segunda: 3/1/0 · Primera: 4/2/0</div></div>`}
function seniorTable(rows){return `<div class="stand-card"><div class="stand-card-head"><div><span class="stand-kicker">Competencia independiente</span><h3>Tabla Senior</h3></div><strong>3 pts por triunfo</strong></div><div class="stand-scroll"><table class="stand-table"><thead><tr><th>Pos.</th><th>Club</th><th>PJ</th><th>PTS</th><th>G</th><th>E</th><th>P</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="stand-rank">${r.rank}</td><td><div class="stand-club">${crest(r.name)}<span>${esc(r.name)}</span></div></td><td>${r.played}</td><td class="stand-points">${r.points}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td></tr>`).join('')}</tbody></table></div><div class="stand-rule">Senior: triunfo 3 pts · empate 1 pt · derrota 0 pts</div></div>`}
async function loadResults(){try{const r=await fetch(`${API}/api/v1/series-results?ts=${Date.now()}`,{cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok||!Array.isArray(j.results))throw Error('series_api');return {results:j.results,mode:'live'}}catch(e){const r=await fetch(`${RESULTS}?v=${V}`,{cache:'no-store'}),j=await r.json();return {results:j.results||[],mode:'snapshot'}}}
async function boot(){
  const root=document.getElementById('champStandings'); if(!root)return;
  try{
    const [f,ru,resultDoc]=await Promise.all([fetch(`${FIXTURE}?v=${V}`,{cache:'no-store'}),fetch(`${RULES}?v=${V}`,{cache:'no-store'}),loadResults()]);
    const fixture=await f.json(),rules=await ru.json(),results={results:resultDoc.results};
    root.dataset.resultSource=resultDoc.mode;
    let group='A';
    const draw=()=>{const d=build(fixture,results,rules,group);root.querySelector('#standTables').innerHTML=generalTable(d.general)+seniorTable(d.senior);root.querySelectorAll('[data-stand-group]').forEach(b=>b.classList.toggle('active',b.dataset.standGroup===group));root.querySelector('#standGroupLabel').textContent=`Grupo ${group}`};
    root.addEventListener('click',e=>{const b=e.target.closest('[data-stand-group]');if(b){group=b.dataset.standGroup;draw()}});
    draw();
  }catch(e){console.error('standings_data',e);root.querySelector('#standTables').innerHTML='<div class="champ-status">No pudimos calcular las tablas.</div>'}
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();