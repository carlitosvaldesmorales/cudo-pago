import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleResultCorrectionFlow } from '../../sports-bus/worker/result-correction-flow-entry.js';
import { handleResultGovernanceUxRequest } from '../../sports-bus/worker/result-governance-ux-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'primary-token',TELEGRAM_BOT_TOKEN_NEXT:'next-token',TELEGRAM_WEBHOOK_SECRET:'root-secret'};
const calls=[];
const rendered=new Map();
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  const method=target.split('/').at(-1);
  calls.push({target,method,body});
  if(method==='editMessageText'){
    const key=`${target}:${body.chat_id}:${body.message_id}`;
    if(rendered.get(key)===body.text){
      return new Response(JSON.stringify({ok:false,error_code:400,description:'Bad Request: message is not modified'}),{status:400,headers:{'content-type':'application/json'}});
    }
    rendered.set(key,body.text);
  }
  return new Response(JSON.stringify({ok:true,result:true}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function msg(text,id=900001){return{update_id:Date.now(),message:{message_id:10,from:{id,first_name:'Admin'},chat:{id,type:'private'},text}}}
function cb(data,messageId=55,id='cb1'){return{update_id:Date.now(),callback_query:{id,from:{id:900001,first_name:'Admin'},data,message:{message_id:messageId,chat:{id:900001,type:'private'}}}}}
async function invokeCorrection(update){
  const secret=await safeSecret(`${env.TELEGRAM_WEBHOOK_SECRET}:next`);
  return handleResultCorrectionFlow(new Request('https://qa.invalid/webhook/telegram-next',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(update)}),env);
}
async function invokeUx(update){
  const secret=await safeSecret(`${env.TELEGRAM_WEBHOOK_SECRET}:next`);
  return handleResultGovernanceUxRequest(new Request('https://qa.invalid/webhook/telegram-next',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(update)}),env);
}
function last(method){return calls.filter(x=>x.method===method).at(-1)?.body}
function count(method){return calls.filter(x=>x.method===method).length}

try{
  applyMigrations();
  const now='2026-09-10T16:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('900001','Admin Global QA','globalqa',NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(now,now).run();

  const seed=await env.DB.prepare(`SELECT r.result_id,r.match_id,r.series_code,r.home_score,r.away_score,r.governance_version,m.home_name,m.away_name
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE r.validation_status='VERIFIED' ORDER BY m.round_no DESC,r.match_id,r.series_code LIMIT 1`).first();
  assert.ok(seed,'a verified seed result is required');
  const baseVersion=Number(seed.governance_version||1);
  const nextHome=Number(seed.home_score)+1;
  const nextAway=Number(seed.away_score);
  const correctData=`rg:correct:${seed.match_id}:${seed.series_code}`;

  calls.length=0;
  let response=await invokeCorrection(cb(correctData,55,'correct-1'));
  assert.equal(response.status,200);
  let payload=await response.json();
  assert.equal(payload.handled,'result_correction_wait_score');
  const prompt=last('editMessageText');
  assert.ok(prompt,'correction callback must edit the existing Telegram panel');
  assert.match(prompt.text,/CORREGIR RESULTADO/);
  assert.match(prompt.text,/nuevo marcador/i);
  assert.doesNotMatch(prompt.text,/\bv\d+\b|VERIFIED|DISPUTED|ANNULLED/);
  assert.equal(count('sendMessage'),0,'first correction prompt must not create a second panel');

  calls.length=0;
  response=await invokeCorrection(cb(correctData,55,'correct-retry'));
  payload=await response.json();
  assert.equal(payload.handled,'result_correction_wait_score');
  assert.equal(count('sendMessage'),0,'Telegram retry/message-not-modified must not fall back to duplicate sendMessage');

  calls.length=0;
  response=await invokeCorrection(msg(`${nextHome}-${nextAway}`));
  payload=await response.json();
  assert.equal(payload.handled,'result_correction_wait_reason');
  assert.match(last('sendMessage').text,/MOTIVO DE LA CORRECCIÓN/);
  let current=await env.DB.prepare('SELECT home_score,away_score,governance_version FROM match_series_results WHERE result_id=?').bind(seed.result_id).first();
  assert.equal(Number(current.home_score),Number(seed.home_score),'score must not mutate before reason/confirmation');
  assert.equal(Number(current.governance_version),baseVersion);

  const reason='Error de digitación en la planilla oficial';
  calls.length=0;
  response=await invokeCorrection(msg(reason));
  payload=await response.json();
  assert.equal(payload.handled,'result_correction_wait_confirm');
  const confirm=last('sendMessage');
  assert.match(confirm.text,/CONFIRMAR CORRECCIÓN/);
  assert.match(confirm.text,new RegExp(reason));
  assert.ok(confirm.reply_markup.inline_keyboard.flat().some(x=>x.callback_data===`rg:apply:${seed.match_id}:${seed.series_code}`));
  current=await env.DB.prepare('SELECT home_score,away_score,governance_version FROM match_series_results WHERE result_id=?').bind(seed.result_id).first();
  assert.equal(Number(current.home_score),Number(seed.home_score),'score must remain unchanged until explicit confirm');
  assert.equal(Number(current.governance_version),baseVersion);

  calls.length=0;
  response=await invokeCorrection(cb(`rg:apply:${seed.match_id}:${seed.series_code}`,77,'apply-1'));
  payload=await response.json();
  assert.equal(payload.handled,'result_correction_applied');
  const applied=last('editMessageText');
  assert.match(applied.text,/RESULTADO CORREGIDO/);
  assert.match(applied.text,new RegExp(reason));
  assert.doesNotMatch(applied.text,/\bv\d+\b|VERIFIED|DISPUTED|ANNULLED/);
  current=await env.DB.prepare('SELECT home_score,away_score,governance_version,validation_status FROM match_series_results WHERE result_id=?').bind(seed.result_id).first();
  assert.equal(Number(current.home_score),nextHome);
  assert.equal(Number(current.away_score),nextAway);
  assert.equal(Number(current.governance_version),baseVersion+1);
  assert.equal(current.validation_status,'VERIFIED');
  const version=await env.DB.prepare(`SELECT actor_id,actor_role,reason,action FROM match_series_result_versions
    WHERE match_id=? AND series_code=? AND version_no=?`).bind(seed.match_id,seed.series_code,baseVersion+1).first();
  assert.equal(String(version.actor_id),'900001');
  assert.equal(version.actor_role,'SUPER_ADMIN');
  assert.equal(version.reason,reason);
  assert.equal(version.action,'CORRECT');

  calls.length=0;
  response=await invokeCorrection(cb(`rg:apply:${seed.match_id}:${seed.series_code}`,77,'apply-retry'));
  payload=await response.json();
  assert.equal(payload.handled,'result_correction_apply_idempotent');
  assert.equal(count('sendMessage'),0);
  assert.equal(count('editMessageText'),0,'duplicate apply must not overwrite the success panel');

  calls.length=0;
  response=await invokeUx(cb(`rg:h:${seed.match_id}:${seed.series_code}`,88,'hist-1'));
  payload=await response.json();
  assert.equal(payload.handled,'result_governance_ux_history');
  const history=last('editMessageText');
  assert.match(history.text,/HISTORIAL DEL RESULTADO/);
  assert.match(history.text,/Admin Global QA/);
  assert.match(history.text,/@globalqa/);
  assert.match(history.text,new RegExp(reason));
  assert.match(history.text,/\d{2}-\d{2}-\d{4} · \d{2}:\d{2}/);
  assert.doesNotMatch(history.text,/VERIFIED|DISPUTED|ANNULLED|\bv\d+\b/);

  console.log('PASS correction prompt edits one Telegram panel without technical version jargon');
  console.log('PASS repeated correction callback does not duplicate the prompt');
  console.log('PASS score and reason do not mutate before explicit confirmation');
  console.log('PASS confirmed correction writes one immutable version with actor and human reason');
  console.log('PASS repeated apply is idempotent');
  console.log('PASS history exposes actor, event time and reason without technical status jargon');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
