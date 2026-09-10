import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from '../telegram/d1-sqlite-adapter.mjs';
import { handlePublicChampionshipRequest } from '../../sports-bus/worker/public-championship-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const db=new D1SqliteAdapter();
const env={DB:db};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}

async function read(origin=null){
  const headers={};
  if(origin) headers.Origin=origin;
  const response=await handlePublicChampionshipRequest(new Request('https://qa.invalid/api/v1/public-championship',{headers}),env);
  assert.ok(response,'public championship route must be handled');
  return {response,body:await response.json()};
}

function findSeries(body,matchId,seriesCode){
  const match=body.matches.find(m=>m.match_id===matchId);
  assert.ok(match,`match ${matchId} must exist in public projection`);
  const serie=match.series.find(s=>s.series_code===seriesCode);
  assert.ok(serie,`series ${seriesCode} must exist in public projection`);
  return serie;
}

try{
  applyMigrations();

  const baseline=await read('https://cudo.cl');
  assert.equal(baseline.response.status,200);
  assert.equal(baseline.response.headers.get('access-control-allow-origin'),'https://cudo.cl');
  assert.equal(baseline.body.ok,true);
  assert.equal(baseline.body.contract,'public-championship-v1');
  assert.equal(baseline.body.competition.competition_id,'ANFA-CHEPICA-2026');
  assert.equal(baseline.body.matches.length,25,'public fixture must contain exactly the 25 ANFA Chépica matches');
  assert.equal(baseline.body.byes.length,5,'public fixture must contain the five official byes');
  assert.ok(baseline.body.matches.every(m=>m.competition_id==='ANFA-CHEPICA-2026'),'QA or foreign competitions must never enter public projection');
  assert.ok(baseline.body.matches.every(m=>Array.isArray(m.series)&&m.series.length===4),'every fixture match must expose the four series');

  const seeded=(await db.prepare("SELECT match_id,series_code,home_score,away_score FROM match_series_results r WHERE validation_status='VERIFIED' AND EXISTS (SELECT 1 FROM matches m WHERE m.match_id=r.match_id AND m.competition_id='ANFA-CHEPICA-2026') ORDER BY match_id,series_code LIMIT 3").all()).results;
  assert.equal(seeded.length,3,'three seeded official series are required');

  const official=findSeries(baseline.body,seeded[0].match_id,seeded[0].series_code);
  assert.equal(official.public_status,'OFFICIAL');
  assert.equal(official.home_score,Number(seeded[0].home_score));
  assert.equal(official.away_score,Number(seeded[0].away_score));

  await db.prepare("UPDATE match_series_results SET validation_status='DISPUTED' WHERE match_id=? AND series_code=?").bind(seeded[0].match_id,seeded[0].series_code).run();
  await db.prepare("UPDATE match_series_results SET validation_status='ANNULLED' WHERE match_id=? AND series_code=?").bind(seeded[1].match_id,seeded[1].series_code).run();
  await db.prepare('DELETE FROM match_series_results WHERE match_id=? AND series_code=?').bind(seeded[2].match_id,seeded[2].series_code).run();

  const governed=(await read()).body;
  const disputed=findSeries(governed,seeded[0].match_id,seeded[0].series_code);
  assert.equal(disputed.public_status,'IN_REVIEW');
  assert.equal(disputed.home_score,null,'disputed internal score must not leak publicly');
  assert.equal(disputed.away_score,null,'disputed internal score must not leak publicly');

  const annulled=findSeries(governed,seeded[1].match_id,seeded[1].series_code);
  assert.equal(annulled.public_status,'ANNULLED');
  assert.equal(annulled.home_score,null,'annulled internal score must not leak publicly');
  assert.equal(annulled.away_score,null,'annulled internal score must not leak publicly');

  const pending=findSeries(governed,seeded[2].match_id,seeded[2].series_code);
  assert.equal(pending.public_status,'PENDING');
  assert.equal(pending.home_score,null);
  assert.equal(pending.away_score,null);

  const serialized=JSON.stringify(governed);
  for(const privateKey of ['actor_id','actor_role','telegram_user_id','source_ref','source_type','source_label','validation_status','reason','permission_audit']){
    assert.ok(!serialized.includes(`\"${privateKey}\"`),`public response must not expose ${privateKey}`);
  }

  const badOrigin=await read('https://example.invalid');
  assert.equal(badOrigin.response.headers.get('access-control-allow-origin'),null,'unknown web origins must not receive CORS permission');

  const frontend=fs.readFileSync(path.join(root,'preview-v8','shared','championship.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'preview-v8','partidos','index.html'),'utf8');
  assert.match(frontend,/\/api\/v1\/public-championship/,'V8 championship must consume governed public projection');
  assert.doesNotMatch(frontend,/\/api\/v1\/matches(?:['"`?])/,'V8 championship must not consume legacy aggregate matches endpoint');
  assert.match(frontend,/public_status==='IN_REVIEW'/);
  assert.match(frontend,/public_status==='ANNULLED'/);
  assert.match(frontend,/public_status==='OFFICIAL'/);
  assert.match(html,/championship-results\.css/,'V8 championship must load per-series result styles');

  console.log('PASS public read model contains only ANFA Chépica fixture and official byes');
  console.log('PASS every match exposes four governed series');
  console.log('PASS VERIFIED publishes score while DISPUTED/ANNULLED/PENDING hide it');
  console.log('PASS public contract does not expose internal governance, source or identity fields');
  console.log('PASS CORS permits CUDO origin and withholds permission from unknown origins');
  console.log('PASS V8 championship consumes the governed read model instead of legacy aggregate match scores');
  console.log('RESULT: PASS');
}finally{
  db.close();
}
