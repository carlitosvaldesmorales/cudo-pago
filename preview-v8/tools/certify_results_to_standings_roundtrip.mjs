import fs from 'node:fs';
import { chromium } from 'playwright';

const RESULTS='preview-v8/data/anfa-chepica-2026-series-results.json';
const RULES='preview-v8/data/anfa-chepica-2026-standings-rules.json';
const FIXTURE='preview-v8/data/championship-fixture.json';
const OUT='evidence/tabla-correlated-roundtrip/latest.json';
const MARKER='ANFA-CHEPICA-2026:A-F1-M1';

const results=JSON.parse(fs.readFileSync(RESULTS,'utf8'));
const rules=JSON.parse(fs.readFileSync(RULES,'utf8'));
const fixture=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));
const match=results.results.find(x=>x.match_id==='A-F1-M1');
if(!match||match.validation_status!=='VERIFIED') throw new Error('A-F1-M1 is not VERIFIED');

const series=Object.fromEntries(match.series.map(s=>[s.series,s]));
const points=(cfg,home,away,isHome)=>{
  const mine=isHome?home:away, other=isHome?away:home;
  return mine>other?cfg.win:mine===other?cfg.draw:cfg.loss;
};
const cudoGeneralContribution=
  points(rules.general.points.TERCERA,series.TERCERA.home_score,series.TERCERA.away_score,false)+
  points(rules.general.points.SEGUNDA,series.SEGUNDA.home_score,series.SEGUNDA.away_score,false)+
  points(rules.general.points.PRIMERA,series.PRIMERA.home_score,series.PRIMERA.away_score,false);
const cudoSeniorContribution=
  points(rules.senior.points,series.SENIOR.home_score,series.SENIOR.away_score,false);

if(cudoGeneralContribution!==4) throw new Error('Unexpected General contribution '+cudoGeneralContribution);
if(cudoSeniorContribution!==3) throw new Error('Unexpected Senior contribution '+cudoSeniorContribution);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
await page.route('**/api/v1/series-results*',async route=>{
  await route.fulfill({
    status:200,
    contentType:'application/json',
    headers:{'Access-Control-Allow-Origin':'*'},
    body:JSON.stringify({ok:true,results:results.results})
  });
});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8000/preview-v8/partidos/?qa=tabla-correlated',{waitUntil:'networkidle',timeout:90000});
await page.locator('#champStandings .stand-card').first().waitFor({state:'visible',timeout:30000});
await page.locator('[data-stand-group="A"]').click();
await page.waitForFunction(()=>document.querySelector('#standGroupLabel')?.textContent.trim()==='Grupo A');

const cards=page.locator('#standTables .stand-card');
const generalRow=cards.nth(0).locator('tbody tr',{hasText:'Unión Orilla'}).first();
const seniorRow=cards.nth(1).locator('tbody tr',{hasText:'Unión Orilla'}).first();
const generalCells=await generalRow.locator('td').evaluateAll(xs=>xs.map(x=>x.textContent.trim()));
const seniorCells=await seniorRow.locator('td').evaluateAll(xs=>xs.map(x=>x.textContent.trim()));
if(generalCells[3]!=='4') throw new Error('Mobile General CUDO points not 4: '+JSON.stringify(generalCells));
if(seniorCells[3]!=='3') throw new Error('Mobile Senior CUDO points not 3: '+JSON.stringify(seniorCells));

const sourceMode=await page.locator('#champStandings').getAttribute('data-result-source');
const pts=await cards.nth(0).locator('thead th').nth(3).boundingBox();
const pj=await cards.nth(0).locator('thead th').nth(2).boundingBox();
const box=await cards.nth(0).boundingBox();
const mobilePriority=!!pts&&!!pj&&!!box&&pts.x>pj.x&&(pts.x+pts.width<=box.x+box.width+1);
if(!mobilePriority) throw new Error('PJ/PTS mobile priority failed');
if(errors.length) throw new Error('Page errors: '+errors.join(' | '));

fs.mkdirSync('evidence/tabla-correlated-roundtrip',{recursive:true});
const evidence={
  schema_version:'CUDO_RESULTS_TO_STANDINGS_CORRELATED_ROUNDTRIP_V1',
  generated_at:new Date().toISOString(),
  classification:'PASS_CORRELATED_RESULTS_TO_STANDINGS_ROUNDTRIP',
  marker:MARKER,
  production_write:false,
  real_club_data_source:'existing_verified_versioned_result',
  source_match:{
    match_id:match.match_id,
    validation_status:match.validation_status,
    home_name:match.home_name,
    away_name:match.away_name,
    series:match.series
  },
  correlation:{
    cudo_general_contribution:cudoGeneralContribution,
    cudo_senior_contribution:cudoSeniorContribution,
    visible_general_points:Number(generalCells[3]),
    visible_senior_points:Number(seniorCells[3]),
    mobile_visible:true,
    mobile_pj_pts_priority:mobilePriority,
    renderer_result_source:sourceMode
  },
  source_files:{results:RESULTS,rules:RULES,fixture:FIXTURE,renderer:'preview-v8/shared/standings.js'},
  current_sha:process.env.GITHUB_SHA||null
};
fs.writeFileSync(OUT,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
await browser.close();
