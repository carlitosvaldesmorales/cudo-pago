import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/canonical-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const streamPublishes=[];
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-canonical-token',
  TELEGRAM_WEBHOOK_SECRET:'qa-canonical-secret',
  RESULTS_STREAM:{
    idFromName:name=>name,
    get:id=>({fetch:async(_url,init={})=>{streamPublishes.push({id,payload:JSON.parse(String(init.body||'{}'))});return new Response(null,{status:204});}})
  }
};
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-canonical-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1),body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200,headers:{'content-type':'application/json'}});
};

const ACTOR={PUBLIC:{id:9931001,first_name:'Publico'},CLUB:{id:9931002,first_name:'Dirigente'}};
let updateId=930000;
function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function cb(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
async function seed(actor,role,clubId=null,trust='VERIFIED'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(String(actor.id),actor.first_name,null,clubId,role,trust,now,now).run();}
async function nonce(actor){const s=await one('SELECT nonce FROM telegram_result_register_sessions WHERE telegram_user_id=?',String(actor.id));assert.ok(s?.nonce);return s.nonce;}
async function guided(actor,match,series,home,away){
  let r=await cb(actor,'rr:dates');assert.equal(r.handled,'results_register_dates');
  await cb(actor,`rr:date:${match.round_no}`);await cb(actor,`rr:match:${match.match_id}`);await cb(actor,`rr:series:${match.match_id}:${series}`);
  const n=await nonce(actor);await cb(actor,`rr:h:${n}:${home}`);await cb(actor,`rr:a:${n}:${away}`);r=await cb(actor,`rr:confirm:${n}`);assert.equal(r.handled,'results_register_applied');return r;
}
function assertTelegramContract(){
  for(const call of calls.filter(x=>x.method==='sendMessage')){
    const buttons=(call.body.reply_markup?.inline_keyboard||[]).flat();
    const seen=new Set();
    for(const b of buttons){if(!b.callback_data)continue;assert.ok(Buffer.byteLength(b.callback_data,'utf8')<=64,`callback too long: ${b.callback_data}`);assert.ok(!seen.has(b.callback_data),`duplicate callback in screen: ${b.callback_data}`);seen.add(b.callback_data);}
  }
  const text=calls.filter(x=>x.method==='sendMessage').map(x=>String(x.body.text||'')).join('\n');
  assert.doesNotMatch(text,/Escribe el marcador|LOCAL-VISITA/i);
  assert.match(text,/CONFIRMAR RESULTADO/);
}

try{
  applyMigrations();
  const round3=await all(`SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=3 ORDER BY group_id,match_id`);assert.ok(round3.length>1);
  const publicMatch=round3[0];
  let r=await guided(ACTOR.PUBLIC,publicMatch,'TERCERA',2,1);
  assert.equal(r.outcome,'SUBMITTED');
  assert.equal(await one('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?',publicMatch.match_id,'TERCERA'),null);
  const pending=await one("SELECT * FROM public_result_submissions WHERE match_id=? AND series_code='TERCERA' AND submitter_id=? AND status='SUBMITTED'",publicMatch.match_id,String(ACTOR.PUBLIC.id));assert.equal(Number(pending.home_score),2);assert.equal(Number(pending.away_score),1);
  assert.ok(streamPublishes.length>=1);const last=streamPublishes.at(-1).payload;assert.equal(last.type,'results.snapshot');const streamed=last.modes.reported.matches.find(x=>x.match_id===publicMatch.match_id).series.find(x=>x.series_code==='TERCERA');assert.equal(streamed.home_score,2);assert.equal(streamed.status,'PENDIENTE');
  console.log('PASS public canonical capture -> SUBMITTED -> event-driven reported snapshot');

  r=await guided(ACTOR.PUBLIC,publicMatch,'TERCERA',3,0);assert.equal(r.outcome,'DUPLICATE_PENDING');
  const count=await one("SELECT COUNT(*) n FROM public_result_submissions WHERE match_id=? AND series_code='TERCERA' AND submitter_id=? AND status='SUBMITTED'",publicMatch.match_id,String(ACTOR.PUBLIC.id));assert.equal(Number(count.n),1);
  console.log('PASS duplicate confirmation is idempotent at business state');

  await cb(ACTOR.PUBLIC,`rr:series:${publicMatch.match_id}:SEGUNDA`);const staleNonce=await nonce(ACTOR.PUBLIC);await cb(ACTOR.PUBLIC,`rr:cancel:${staleNonce}`);r=await cb(ACTOR.PUBLIC,`rr:h:${staleNonce}:2`);assert.equal(r.handled,'results_register_stale');assert.equal(await one('SELECT nonce FROM telegram_result_register_sessions WHERE telegram_user_id=?',String(ACTOR.PUBLIC.id)),null);
  console.log('PASS stale callback fails closed after cancel');

  await seed(ACTOR.CLUB,'CLUB_ADMIN','UNION-ORILLA');
  const own=round3.find(m=>m.home_id==='UNION-ORILLA'||m.away_id==='UNION-ORILLA');assert.ok(own);
  const foreign=round3.find(m=>m.match_id!==own.match_id&&m.home_id!=='UNION-ORILLA'&&m.away_id!=='UNION-ORILLA');assert.ok(foreign);
  r=await cb(ACTOR.CLUB,`rr:match:${foreign.match_id}`);assert.equal(r.handled,'results_register_scope_denied');
  console.log('PASS forged out-of-scope match callback is rejected');

  r=await guided(ACTOR.CLUB,own,'PRIMERA',1,0);assert.equal(r.outcome,'FIRST_OFFICIAL');
  const official=await one("SELECT * FROM match_series_results WHERE match_id=? AND series_code='PRIMERA'",own.match_id);assert.equal(Number(official.home_score),1);assert.equal(Number(official.away_score),0);assert.equal(official.validation_status,'VERIFIED');
  const version=await one("SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code='PRIMERA' AND version_no=1",own.match_id);assert.ok(version);
  const pub=streamPublishes.at(-1).payload.modes.official.matches.find(x=>x.match_id===own.match_id).series.find(x=>x.series_code==='PRIMERA');assert.equal(pub.home_score,1);assert.equal(pub.status,'VERIFIED');
  console.log('PASS club admin canonical capture -> official result + immutable baseline + push snapshot');

  const api=await worker.fetch(new Request('https://qa.invalid/api/v1/rounds/3/results?mode=reported'),env,{});assert.equal(api.status,200);const body=await api.json();assert.equal(body.round_no,3);assert.equal(body.mode,'reported');
  const htmlRes=await worker.fetch(new Request('https://qa.invalid/stream/fecha/3?mode=reported'),env,{});assert.equal(htmlRes.status,200);const html=await htmlRes.text();assert.match(html,/new WebSocket/);assert.doesNotMatch(html,/setInterval|setTimeout\s*\(\s*.*fetch/i);assert.match(html,/FECHA 3/);
  console.log('PASS API + HTML overlay bootstrap once and then use WebSocket push (no polling loop)');

  assertTelegramContract();
  console.log('PASS approved button-first visual contract and Telegram callback constraints');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
