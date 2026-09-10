import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleClubAdminSeriesScore } from '../../sports-bus/worker/club-admin-series-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const db=new D1SqliteAdapter();
const env={DB:db,TELEGRAM_BOT_TOKEN:'qa-token',TELEGRAM_WEBHOOK_SECRET:'qa-secret'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method:target.split('/').at(-1),body});
  return new Response(JSON.stringify({ok:true,result:true}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}

async function invoke(actorId,text,updateId){
  const update={update_id:updateId,message:{message_id:updateId,from:{id:Number(actorId),first_name:`User ${actorId}`},chat:{id:Number(actorId),type:'private'},text}};
  return handleClubAdminSeriesScore(new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify(update)}),env);
}

async function session(actorId,matchId,seriesCode){
  const now='2026-09-10T18:00:00Z';
  await db.prepare(`INSERT OR REPLACE INTO telegram_series_sessions
    (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
    VALUES (?,?,?,?, 'AWAIT_SCORE',?,?)`).bind(String(actorId),String(actorId),matchId,seriesCode,now,now).run();
}

try{
  applyMigrations();
  const match=await db.prepare(`SELECT match_id,home_id,away_id,home_name,away_name FROM matches
    WHERE competition_id='ANFA-CHEPICA-2026' AND home_id IS NOT NULL AND away_id IS NOT NULL ORDER BY round_no,match_id LIMIT 1`).first();
  assert.ok(match,'ANFA fixture required');
  const series='TERCERA';

  // Isolate one in-memory series so the harness controls the full lifecycle.
  await db.prepare('DELETE FROM match_series_result_versions WHERE match_id=? AND series_code=?').bind(match.match_id,series).run();
  await db.prepare('DELETE FROM series_reports WHERE match_id=? AND series_code=?').bind(match.match_id,series).run();
  await db.prepare('DELETE FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,series).run();

  const now='2026-09-10T18:00:00Z';
  await db.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('700001','Admin Local','adminlocal',?,'CLUB_ADMIN','VERIFIED',1,?,?)`).bind(match.home_id,now,now).run();
  await db.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('700002','Admin Visita','adminvisita',?,'CLUB_ADMIN','VERIFIED',1,?,?)`).bind(match.away_id,now,now).run();
  await db.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('700099','Admin Global','globalqa',NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(now,now).run();

  // 1) First verified club admin establishes the official result directly.
  await session('700001',match.match_id,series);
  let response=await invoke('700001','1-0',1001);
  let payload=await response.json();
  assert.equal(payload.outcome,'FIRST_OFFICIAL');
  let current=await db.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,series).first();
  assert.equal(current.validation_status,'VERIFIED');
  assert.equal(Number(current.home_score),1);
  assert.equal(Number(current.away_score),0);
  assert.equal(Number(current.governance_version),1);
  let versions=await db.prepare('SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=? ORDER BY version_no').bind(match.match_id,series).all();
  assert.equal((versions.results||[]).length,1,'first official result must have immutable baseline v1');

  // 2) Opposing club admin reports the same score: corroboration, no new version.
  await session('700002',match.match_id,series);
  response=await invoke('700002','1-0',1002);
  payload=await response.json();
  assert.equal(payload.outcome,'CORROBORATED');
  current=await db.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,series).first();
  assert.equal(current.validation_status,'VERIFIED');
  assert.equal(Number(current.home_score),1);
  assert.equal(Number(current.away_score),0);
  assert.equal(Number(current.governance_version),1,'corroboration must not create a new official version');
  versions=await db.prepare('SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=?').bind(match.match_id,series).all();
  assert.equal((versions.results||[]).length,1);

  // 3) Opposing club admin reports a different score: never last-write-wins.
  await session('700002',match.match_id,series);
  response=await invoke('700002','2-0',1003);
  payload=await response.json();
  assert.equal(payload.outcome,'CONFLICT');
  current=await db.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,series).first();
  assert.equal(current.validation_status,'DISPUTED');
  assert.equal(Number(current.home_score),1,'conflicting report must not overwrite official home score');
  assert.equal(Number(current.away_score),0,'conflicting report must not overwrite official away score');
  assert.equal(Number(current.governance_version),2);

  const conflictVersion=await db.prepare(`SELECT * FROM match_series_result_versions
    WHERE match_id=? AND series_code=? AND version_no=2`).bind(match.match_id,series).first();
  assert.ok(conflictVersion,'conflict must create an immutable governance version');
  assert.equal(conflictVersion.validation_status,'DISPUTED');
  assert.equal(conflictVersion.action,'DISPUTE');
  assert.equal(String(conflictVersion.actor_id),'700002');
  assert.equal(conflictVersion.actor_role,'CLUB_ADMIN');
  assert.equal(conflictVersion.actor_club_id,match.away_id);

  const conflictingReport=await db.prepare(`SELECT * FROM series_reports
    WHERE match_id=? AND series_code=? AND reporter_id='700002'`).bind(match.match_id,series).first();
  assert.equal(Number(conflictingReport.home_score),2);
  assert.equal(Number(conflictingReport.away_score),0,'conflicting evidence must be retained separately');

  const conflictEvent=await db.prepare("SELECT * FROM events WHERE event_id='tg-1003-series'").first();
  assert.equal(conflictEvent.validation_status,'DISPUTED');
  const eventPayload=JSON.parse(conflictEvent.payload_json);
  assert.deepEqual(eventPayload.official_score,[1,0]);
  assert.deepEqual(eventPayload.reported_score,[2,0]);

  const globalNotice=calls.find(x=>x.method==='sendMessage'&&String(x.body.chat_id)==='700099'&&/CONFLICTO DE RESULTADO/.test(String(x.body.text)));
  assert.ok(globalNotice,'global admin must be notified of the conflict');

  console.log('PASS first CLUB_ADMIN report can publish a first official result');
  console.log('PASS matching opposing CLUB_ADMIN report corroborates without rewriting');
  console.log('PASS conflicting CLUB_ADMIN report preserves the official score and marks DISPUTED');
  console.log('PASS conflicting evidence, actor and immutable governance version are retained');
  console.log('PASS SUPER_ADMIN receives a conflict notification');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  db.close();
}
