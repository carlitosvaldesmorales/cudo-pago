import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../../sports-bus/canonical-entry.js';
import {sportingPointsForTeam} from '../../sports-bus/worker/secretariat-standings-entry.js';
import {D1SqliteAdapter} from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_WEBHOOK_SECRET:'qa-secretaria-secret',
  TELEGRAM_BOT_TOKEN:'qa-secretaria-token'
};
const SUPER={id:9962001,first_name:'Admin',last_name:'Global'};
const CLUB={id:9962002,first_name:'Dirigente',last_name:'San Juan'};
const calls=[];
const originalFetch=globalThis.fetch;

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}
async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function lastScreen(){
  return [...calls].reverse().find(x=>['editMessageText','sendMessage'].includes(x.method))?.body||{};
}
function callbacks(body=lastScreen()){
  return (body.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);
}
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-secretaria-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200,headers:{'content-type':'application/json'}});
};
let updateId=99620000;
async function dispatch(update){
  calls.length=0;
  const req=new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET)},
    body:JSON.stringify({update_id:++updateId,...update})
  });
  const res=await worker.fetch(req,env,{});
  assert.equal(res.status,200);
  return res.json();
}
async function callback(actor,data){
  return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:77,chat:{id:Number(actor.id),type:'private'}}}});
}
async function message(actor,text){
  return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:Number(actor.id),type:'private'},text}});
}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first()}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results}
async function seedReporter(actor,club,role){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,?,?,'VERIFIED',1,?,?)`)
    .bind(String(actor.id),`${actor.first_name} ${actor.last_name||''}`.trim(),null,club,role,now,now).run();
}
function championship(data,groupId,code){
  return data.groups.find(g=>g.group_id===groupId).championships.find(c=>c.championship_code===code);
}

try{
  applyMigrations();
  await seedReporter(SUPER,'UNION-ORILLA','SUPER_ADMIN');
  await seedReporter(CLUB,'SAN-JUAN','CLUB_ADMIN');

  assert.equal(sportingPointsForTeam({series_code:'SEGUNDA',home_id:'SAN-JUAN',away_id:'JUV-CHEPICA',home_score:0,away_score:3},'JUV-CHEPICA'),3);
  assert.equal(sportingPointsForTeam({series_code:'TERCERA',home_id:'JUV-CHEPICA',away_id:'INDEPENDIENTE',home_score:1,away_score:0},'JUV-CHEPICA'),2);
  assert.equal(sportingPointsForTeam({series_code:'SEGUNDA',home_id:'SANTA-ELENA',away_id:'JUV-CHEPICA',home_score:1,away_score:1},'JUV-CHEPICA'),1);
  console.log('PASS transfer amount follows actual sporting points, including draw=1');

  let out=await callback(SUPER,'rg:r:A-F1-M3:SEGUNDA');
  assert.equal(out.handled,'result_governance_ux_detail');
  assert.ok(callbacks().includes('sec:start:A-F1-M3:SEGUNDA'));
  console.log('PASS SUPER_ADMIN result detail exposes Secretaría');

  out=await callback(CLUB,'rg:r:A-F1-M3:SEGUNDA');
  assert.equal(out.handled,'result_governance_ux_detail');
  assert.ok(!callbacks().some(x=>x.startsWith('sec:')));
  console.log('PASS CLUB_ADMIN does not receive Secretaría mutation entrypoint');

  out=await callback(CLUB,'sec:start:A-F1-M3:SEGUNDA');
  assert.equal(out.handled,'secretariat_adjustment_denied');
  assert.ok(await one("SELECT * FROM permission_audit WHERE actor_id=? AND action='APPLY_SECRETARIAT_STANDINGS_ADJUSTMENT' AND allowed=0",String(CLUB.id)));
  console.log('PASS direct unauthorized Secretaría callback denied + audited');

  out=await callback(SUPER,'sec:start:A-F1-M3:SEGUNDA');
  assert.equal(out.handled,'secretariat_adjustment_start');
  const startCallbacks=callbacks();
  assert.ok(startCallbacks.includes('sec:pick:A-F1-M3:SEGUNDA:AWAY'));
  assert.match(String(lastScreen().text),/Juventud de Chépica: <b>3<\/b> pts deportivos/);
  console.log('PASS Secretaría previews sporting points without changing score');

  out=await callback(SUPER,'sec:pick:A-F1-M3:SEGUNDA:AWAY');
  assert.equal(out.handled,'secretariat_adjustment_wait_reason');
  let session=await one('SELECT * FROM telegram_secretariat_sessions WHERE telegram_user_id=?',String(SUPER.id));
  assert.equal(session.sanctioned_team_id,'JUV-CHEPICA');
  assert.equal(session.beneficiary_team_id,'SAN-JUAN');
  assert.equal(session.points_amount,3);
  assert.equal(session.phase,'AWAIT_REASON');
  console.log('PASS transfer direction + amount materialized in bounded session');

  out=await message(SUPER,'Carnet vencido');
  assert.equal(out.handled,'secretariat_adjustment_confirmation');
  session=await one('SELECT * FROM telegram_secretariat_sessions WHERE telegram_user_id=?',String(SUPER.id));
  assert.equal(session.phase,'CONFIRM');
  assert.equal(session.reason,'Carnet vencido');
  assert.ok(callbacks().includes('sec:apply'));
  console.log('PASS reason captured and explicit confirmation required');

  const scoreBefore=await one("SELECT home_score,away_score,governance_version FROM match_series_results WHERE match_id='A-F1-M3' AND series_code='SEGUNDA'");
  out=await callback(SUPER,'sec:apply');
  assert.equal(out.handled,'secretariat_adjustment_applied');
  const scoreAfter=await one("SELECT home_score,away_score,governance_version FROM match_series_results WHERE match_id='A-F1-M3' AND series_code='SEGUNDA'");
  assert.deepEqual(scoreAfter,scoreBefore);
  const resolution=await one("SELECT * FROM secretariat_standings_resolutions WHERE match_id='A-F1-M3' AND series_code='SEGUNDA' AND status='ACTIVE'");
  assert.ok(resolution);
  assert.equal(resolution.points_amount,3);
  assert.equal(resolution.sanctioned_team_id,'JUV-CHEPICA');
  assert.equal(resolution.beneficiary_team_id,'SAN-JUAN');
  const adjustments=await all("SELECT team_id,points_delta FROM standings_adjustments WHERE adjustment_id LIKE ? ORDER BY team_id",`${resolution.resolution_id}%`);
  assert.deepEqual(adjustments.map(x=>[x.team_id,x.points_delta]),[['JUV-CHEPICA',-3],['SAN-JUAN',3]]);
  assert.ok(await one("SELECT * FROM events WHERE event_type='standings.secretariat.points_transferred' AND match_id='A-F1-M3'"));
  assert.ok(await one("SELECT * FROM permission_audit WHERE action='APPLY_SECRETARIAT_STANDINGS_ADJUSTMENT' AND resource_id=?",resolution.resolution_id));
  console.log('PASS atomic -3/+3 resolution preserves historical score + audit');

  const standingsRes=await worker.fetch(new Request('https://qa.invalid/api/v1/public-standings'),env,{});
  assert.equal(standingsRes.status,200);
  const standings=await standingsRes.json();
  const principal=championship(standings,'A','PRINCIPAL');
  const sj=principal.rows.find(x=>x.team_id==='SAN-JUAN');
  const juv=principal.rows.find(x=>x.team_id==='JUV-CHEPICA');
  assert.equal(sj.adjustment_points,3);
  assert.equal(juv.adjustment_points,-3);
  console.log('PASS public-standings-v2 consumes Secretaría transfer automatically');

  await callback(SUPER,'sec:start:A-F1-M3:SEGUNDA');
  out=await callback(SUPER,'sec:pick:A-F1-M3:SEGUNDA:AWAY');
  assert.equal(out.handled,'secretariat_adjustment_duplicate_guard');
  assert.equal((await all("SELECT * FROM secretariat_standings_resolutions WHERE match_id='A-F1-M3' AND series_code='SEGUNDA'")).length,1);
  assert.equal((await all("SELECT * FROM standings_adjustments WHERE adjustment_id LIKE ?",`${resolution.resolution_id}%`)).length,2);
  console.log('PASS duplicate transfer blocked');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
