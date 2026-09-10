import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,'../..');
const migrationsDir=path.join(repoRoot,'sports-bus','migrations');
const QA={
  SUPER:{id:'9910001',first_name:'QA',last_name:'Global'},
  HOME:{id:'9910002',first_name:'QA',last_name:'Santa Elena'},
  AWAY:{id:'9910003',first_name:'QA',last_name:'Union Orilla'},
  OUT:{id:'9910004',first_name:'QA',last_name:'Tercer Club'}
};
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-token-never-sent',TELEGRAM_WEBHOOK_SECRET:'qa-webhook-secret'};
const outbound=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-token-never-sent/')) throw new Error(`QA blocked network call: ${target}`);
  const method=target.split('/').pop();
  const body=init?.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  const files=fs.readdirSync(migrationsDir).filter(x=>x.endsWith('.sql')).sort();
  for(const file of files) env.DB.exec(fs.readFileSync(path.join(migrationsDir,file),'utf8'));
}
async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
let updateId=810000;
async function dispatch(update){
  const safe=await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET);
  const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':safe},body:JSON.stringify({update_id:++updateId,...update})});
  const res=await worker.fetch(req,env,{});
  assert.equal(res.status,200);
  return res.json();
}
async function message(actor,text){return dispatch({message:{message_id:updateId,from:actor,chat:{id:Number(actor.id),type:'private'},text}});}
async function callback(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:updateId,chat:{id:Number(actor.id),type:'private'}}}});}
async function one(sql,...params){return env.DB.prepare(sql).bind(...params).first();}
async function all(sql,...params){return (await env.DB.prepare(sql).bind(...params).all()).results;}

async function seedReporter(actor,club,role){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,?,?,'VERIFIED',1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name||''}`.trim(),null,club,role,now,now).run();
}
async function apiSeries(){
  const res=await worker.fetch(new Request('https://qa.invalid/api/v1/series-results'),env,{});
  assert.equal(res.status,200);
  return res.json();
}
function apiFind(data,matchId,series){
  return data.results?.find(x=>x.match_id===matchId)?.series?.find(x=>x.series===series)||null;
}
async function current(){return one("SELECT * FROM match_series_results WHERE match_id='A-F1-M1' AND series_code='TERCERA'");}

try{
  applyMigrations();
  await seedReporter(QA.SUPER,'UNION-ORILLA','SUPER_ADMIN');
  await seedReporter(QA.HOME,'SANTA-ELENA','CLUB_ADMIN');
  await seedReporter(QA.AWAY,'UNION-ORILLA','CLUB_ADMIN');
  await seedReporter(QA.OUT,'SAN-JUAN','CLUB_ADMIN');

  const baseline=await current();
  assert.equal(baseline.home_score,1);
  assert.equal(baseline.away_score,0);
  assert.equal(baseline.validation_status,'VERIFIED');
  assert.equal(baseline.governance_version,1);
  assert.equal((await all("SELECT * FROM match_series_result_versions WHERE match_id='A-F1-M1' AND series_code='TERCERA'")).length,1);
  console.log('PASS baseline snapshot v1');

  // Existing official result cannot be overwritten by the legacy/direct score path.
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO telegram_series_sessions
    (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
    VALUES (?,?, 'A-F1-M1','TERCERA','AWAIT_SCORE',?,?)`).bind(String(QA.AWAY.id),String(QA.AWAY.id),now,now).run();
  const guard=await message(QA.AWAY,'9-9');
  assert.equal(guard.handled,'result_governance_overwrite_guard');
  assert.equal((await current()).home_score,1);
  assert.equal(await one('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?',String(QA.AWAY.id)),null);
  assert.ok(await one("SELECT * FROM permission_audit WHERE actor_id=? AND action='OVERWRITE_SERIES_RESULT' AND allowed=0",String(QA.AWAY.id)));
  console.log('PASS silent overwrite guard');

  // Participating club may dispute, but does not get to rewrite the score.
  const disputed=await callback(QA.AWAY,'rg:dispute:A-F1-M1:TERCERA');
  assert.equal(disputed.handled,'result_governance_disputed');
  let row=await current();
  assert.equal(row.validation_status,'DISPUTED');
  assert.equal(row.governance_version,2);
  assert.equal(apiFind(await apiSeries(),'A-F1-M1','TERCERA'),null);
  assert.equal((await one("SELECT action FROM match_series_result_versions WHERE match_id='A-F1-M1' AND series_code='TERCERA' AND version_no=2")).action,'DISPUTE');
  console.log('PASS participating club dispute removes result from public SSOT');

  // Third club has no scope over another match.
  const denied=await callback(QA.OUT,'rg:dispute:A-F1-M2:TERCERA');
  assert.equal(denied.handled,'result_governance_denied');
  assert.equal(denied.reason,'club_not_in_match');
  assert.ok(await one("SELECT * FROM permission_audit WHERE actor_id=? AND action='DISPUTE_OFFICIAL_RESULT' AND allowed=0",String(QA.OUT.id)));
  console.log('PASS third-club dispute denied + audited');

  // Only global admin resolves a dispute.
  const clubResolve=await callback(QA.AWAY,'rg:confirm:A-F1-M1:TERCERA');
  assert.equal(clubResolve.handled,'result_governance_denied');
  assert.equal(clubResolve.reason,'super_admin_required');
  const resolved=await callback(QA.SUPER,'rg:confirm:A-F1-M1:TERCERA');
  assert.equal(resolved.handled,'result_governance_resolved');
  row=await current();
  assert.equal(row.validation_status,'VERIFIED');
  assert.equal(row.governance_version,3);
  assert.equal(apiFind(await apiSeries(),'A-F1-M1','TERCERA').home_score,1);
  console.log('PASS dispute resolution -> VERIFIED');

  // Correction is a new immutable version, not an UPSERT overwrite.
  const startCorrection=await callback(QA.SUPER,'rg:correct:A-F1-M1:TERCERA');
  assert.equal(startCorrection.handled,'result_governance_wait_correction');
  assert.ok(await one('SELECT * FROM telegram_result_governance_sessions WHERE telegram_user_id=?',String(QA.SUPER.id)));
  const corrected=await message(QA.SUPER,'2-1');
  assert.equal(corrected.handled,'result_governance_corrected');
  row=await current();
  assert.equal(row.home_score,2);
  assert.equal(row.away_score,1);
  assert.equal(row.validation_status,'VERIFIED');
  assert.equal(row.governance_version,4);
  const versions=await all("SELECT version_no,home_score,away_score,validation_status,action FROM match_series_result_versions WHERE match_id='A-F1-M1' AND series_code='TERCERA' ORDER BY version_no");
  assert.deepEqual(versions.map(v=>v.version_no),[1,2,3,4]);
  assert.equal(versions[0].home_score,1);
  assert.equal(versions[0].away_score,0);
  assert.equal(versions[3].action,'CORRECT');
  assert.equal(apiFind(await apiSeries(),'A-F1-M1','TERCERA').home_score,2);
  console.log('PASS correction creates v4 and preserves old score');

  // Even SUPER_ADMIN cannot bypass governance using the old result-entry session.
  await env.DB.prepare(`INSERT OR REPLACE INTO telegram_series_sessions
    (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
    VALUES (?,?, 'A-F1-M1','TERCERA','AWAIT_SCORE',?,?)`).bind(String(QA.SUPER.id),String(QA.SUPER.id),now,now).run();
  const superGuard=await message(QA.SUPER,'7-7');
  assert.equal(superGuard.handled,'result_governance_overwrite_guard');
  assert.equal((await current()).governance_version,4);
  assert.equal((await current()).home_score,2);
  console.log('PASS SUPER_ADMIN also blocked from silent overwrite');

  // Annulment preserves score/history but removes current projection from public/table API.
  const annulled=await callback(QA.SUPER,'rg:annul:A-F1-M1:TERCERA');
  assert.equal(annulled.handled,'result_governance_annulled');
  row=await current();
  assert.equal(row.validation_status,'ANNULLED');
  assert.equal(row.governance_version,5);
  assert.equal(apiFind(await apiSeries(),'A-F1-M1','TERCERA'),null);
  const clubRestore=await callback(QA.AWAY,'rg:restore:A-F1-M1:TERCERA');
  assert.equal(clubRestore.handled,'result_governance_denied');
  const restored=await callback(QA.SUPER,'rg:restore:A-F1-M1:TERCERA');
  assert.equal(restored.handled,'result_governance_restored');
  row=await current();
  assert.equal(row.validation_status,'VERIFIED');
  assert.equal(row.governance_version,6);
  assert.equal(row.home_score,2);
  assert.equal(row.away_score,1);
  assert.equal(apiFind(await apiSeries(),'A-F1-M1','TERCERA').away_score,1);
  console.log('PASS annul -> hidden -> restore -> VERIFIED with history');

  const history=await callback(QA.SUPER,'rg:h:A-F1-M1:TERCERA');
  assert.equal(history.handled,'result_governance_history');
  assert.equal((await all("SELECT * FROM match_series_result_versions WHERE match_id='A-F1-M1' AND series_code='TERCERA'")).length,6);
  assert.ok(await one("SELECT * FROM events WHERE event_type='match.series.result.corrected' AND match_id='A-F1-M1'"));
  assert.ok(await one("SELECT * FROM events WHERE event_type='match.series.result.annulled' AND match_id='A-F1-M1'"));
  console.log('PASS immutable history + events');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
}
