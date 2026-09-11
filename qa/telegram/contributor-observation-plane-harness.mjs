import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { CAPABILITY, hasCapability } from '../../sports-bus/worker/access-control.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-observation-token',TELEGRAM_WEBHOOK_SECRET:'qa-observation-secret'};
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-observation-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200,headers:{'content-type':'application/json'}});
};

const ACTOR={
  PUBLIC:{id:9921001,first_name:'Informador',last_name:'Publico'},
  MEDIA:{id:9921002,first_name:'Chepica',last_name:'Play'},
  OPERATOR:{id:9921003,first_name:'Operador',last_name:'Campeonato'}
};
let updateId=920000;

function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){
  const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});
  const res=await worker.fetch(req,env,{});
  assert.equal(res.status,200);
  return res.json();
}
async function cb(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
async function seed(actor,role,clubId=null,trust='VERIFIED'){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`)
    .bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,clubId,role,trust,now,now).run();
}
async function guided(actor,match,series,home,away){
  let r=await cb(actor,'obs:dates');
  assert.equal(r.handled,'observation_dates');
  r=await cb(actor,`obs:date:${match.round_no}`);
  assert.equal(r.handled,'observation_round');
  r=await cb(actor,`obs:match:${match.match_id}`);
  assert.equal(r.handled,'observation_series');
  r=await cb(actor,`obs:series:${match.match_id}:${series}`);
  assert.equal(r.handled,'observation_home_score');
  assert.ok(home<=7&&away<=7,'QA uses direct button range');
  r=await cb(actor,`obs:h:${home}`);
  assert.equal(r.handled,'observation_away_score');
  r=await cb(actor,`obs:a:${away}`);
  assert.equal(r.handled,'observation_confirm');
  r=await cb(actor,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  return r;
}

try{
  applyMigrations();
  const missing=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  assert.ok(missing);
  const official=await one(`SELECT m.*,r.result_id,r.series_code,r.home_score AS official_home,r.away_score AS official_away,r.validation_status AS official_status
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no,m.match_id,r.series_code LIMIT 1`);
  assert.ok(official);

  const publicResult=await guided(ACTOR.PUBLIC,missing,'TERCERA',2,1);
  assert.equal(publicResult.observation_kind,'INITIAL');
  assert.equal(publicResult.source_type,'PUBLIC_USER');
  const publicObs=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',publicResult.submission_id);
  assert.equal(publicObs.status,'SUBMITTED');
  assert.equal(publicObs.source_type,'PUBLIC_USER');
  assert.equal(publicObs.observation_kind,'INITIAL');
  assert.equal(await one('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA'),null);
  console.log('PASS any Telegram user can contribute through buttons without mutating canonical state');

  // Media relationship is persistent at competition scope; coverage is a separate match assignment.
  await seed(ACTOR.MEDIA,'REPORTER',null,'PROVISIONAL');
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO actor_scope_grants (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`).bind('qa-media-competition',String(ACTOR.MEDIA.id),'MEDIA_PARTNER','COMPETITION','ANFA-CHEPICA-2026',JSON.stringify(['READ_COMPETITION','OBSERVE_RESULT','PUBLISH_MATCH_EVENT']),'VERIFIED','Chépica Play','qa-super',now,now,'CHEPICA_PLAY').run();
  await env.DB.prepare(`INSERT INTO partner_match_coverages (coverage_id,partner_code,competition_id,match_id,status,assigned_by,assigned_at,started_at,updated_at)
    VALUES (?,?,?,?, 'LIVE','qa-super',?,?,?)`).bind(`qa-coverage-${official.match_id}`,'CHEPICA_PLAY','ANFA-CHEPICA-2026',official.match_id,now,now,now).run();

  let h=Number(official.official_home),a=Number(official.official_away);
  if(h<7) h+=1; else if(a<7) a+=1; else h=0;
  const mediaResult=await guided(ACTOR.MEDIA,official,official.series_code,h,a);
  assert.equal(mediaResult.observation_kind,'DISCREPANCY');
  assert.equal(mediaResult.source_type,'MEDIA_PARTNER');
  const mediaObs=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',mediaResult.submission_id);
  assert.equal(mediaObs.source_label,'Chépica Play · transmisión');
  assert.equal(mediaObs.trust_level,'VERIFIED');
  assert.equal(mediaObs.observed_result_id,official.result_id);
  const stillOfficial=await one('SELECT home_score,away_score,validation_status FROM match_series_results WHERE result_id=?',official.result_id);
  assert.equal(Number(stillOfficial.home_score),Number(official.official_home));
  assert.equal(Number(stillOfficial.away_score),Number(official.official_away));
  assert.equal(stillOfficial.validation_status,official.official_status);
  console.log('PASS scoped MEDIA_PARTNER contributes trusted evidence without overwriting official result');

  const operator={role:'PLATFORM_OPERATOR',trust_level:'VERIFIED',active:1};
  const superAdmin={role:'SUPER_ADMIN',trust_level:'VERIFIED',active:1};
  assert.equal(hasCapability(operator,CAPABILITY.GOVERN_RESULTS),true);
  assert.equal(hasCapability(operator,CAPABILITY.MANAGE_ACCESS),true);
  assert.equal(hasCapability(operator,CAPABILITY.MANAGE_POLICY),false);
  assert.equal(hasCapability(operator,CAPABILITY.GRANT_SUPER_ADMIN),false);
  assert.equal(hasCapability(superAdmin,CAPABILITY.MANAGE_POLICY),true);
  assert.equal(hasCapability(superAdmin,CAPABILITY.GRANT_SUPER_ADMIN),true);
  console.log('PASS PLATFORM_OPERATOR has operational authority but cannot change policy or grant SUPER_ADMIN');

  await seed(ACTOR.OPERATOR,'PLATFORM_OPERATOR',null,'VERIFIED');
  const secondMissing=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND m.match_id<>? AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='SEGUNDA') ORDER BY m.round_no,m.match_id LIMIT 1`,missing.match_id))[0];
  assert.ok(secondMissing);
  const operatorObs=await guided(ACTOR.OPERATOR,secondMissing,'SEGUNDA',1,0);
  assert.equal(operatorObs.source_type,'PLATFORM_OPERATOR');
  console.log('PASS PLATFORM_OPERATOR can also act as an informant; contribution and authority remain separate');

  const sentText=calls.filter(x=>x.method==='sendMessage').map(x=>String(x.body.text||'')).join('\n');
  assert.doesNotMatch(sentText,/Escribe el marcador/i);
  assert.match(sentText,/¿Cuántos goles hizo/);
  assert.match(sentText,/CONFIRMAR INFORMACIÓN/);
  console.log('PASS normal score capture is button-first with explicit confirmation');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
