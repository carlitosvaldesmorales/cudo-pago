import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import route from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-public-token',TELEGRAM_BOT_TOKEN_NEXT:'qa-next-token',TELEGRAM_WEBHOOK_SECRET:'qa-public-secret'};
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
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
let uid=50000;
async function dispatch(update){
  const secret=await safeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const response=await route.fetch(new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:++uid,...update})}),env,{});
  assert.equal(response.status,200);
  return response.json();
}
async function callback(data){return dispatch({callback_query:{id:`cb-${uid+1}`,from:{id:880001,first_name:'QA Public'},data,message:{message_id:77,chat:{id:880001,type:'private'}}}})}
async function message(text){return dispatch({message:{message_id:uid+1,from:{id:880001,first_name:'QA Public'},chat:{id:880001,type:'private'},text}})}
function reset(){calls.length=0}
function lastSend(){const rows=calls.filter(x=>x.method==='sendMessage');assert.ok(rows.length,'expected sendMessage');return rows.at(-1).body}
function buttons(body){return (body.reply_markup?.inline_keyboard||[]).flat()}

try{
  applyMigrations();
  const row=await env.DB.prepare(`SELECT r.result_id,r.match_id,r.series_code,r.home_score,r.away_score,m.round_no
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no,r.match_id LIMIT 1`).first();
  assert.ok(row,'ANFA result required');

  // VERIFIED is the only state allowed to expose an official score publicly.
  await env.DB.prepare("UPDATE match_series_results SET validation_status='VERIFIED' WHERE result_id=?").bind(row.result_id).run();
  reset();
  let result=await callback(`pr:match:${row.match_id}`);
  assert.equal(result.handled,'public_result_series_menu');
  let panel=lastSend();
  let button=buttons(panel).find(x=>x.callback_data===`pr:official:${row.match_id}:${row.series_code}`);
  assert.ok(button,'verified series must expose official callback');
  assert.match(button.text,/✅/);
  assert.match(button.text,new RegExp(`${row.home_score}-${row.away_score}`));
  assert.match(button.text,/oficial/i);

  // DISPUTED must never leak the retained score as an official public result.
  await env.DB.prepare("UPDATE match_series_results SET validation_status='DISPUTED' WHERE result_id=?").bind(row.result_id).run();
  reset();
  result=await callback(`pr:match:${row.match_id}`);
  assert.equal(result.handled,'public_result_series_menu');
  panel=lastSend();
  button=buttons(panel).find(x=>x.callback_data===`pr:status:${row.match_id}:${row.series_code}`);
  assert.ok(button,'disputed series must use status callback');
  assert.match(button.text,/⚠️/);
  assert.match(button.text,/en revisión/i);
  assert.doesNotMatch(button.text,new RegExp(`${row.home_score}-${row.away_score}`),'disputed score must not be displayed as public official score');
  assert.doesNotMatch(button.text,/oficial/i);

  reset();
  result=await callback(`pr:status:${row.match_id}:${row.series_code}`);
  assert.equal(result.handled,'public_result_governance_locked');
  assert.equal(result.validation_status,'DISPUTED');
  assert.match(lastSend().text,/EN REVISIÓN/);
  assert.doesNotMatch(lastSend().text,new RegExp(`${row.home_score}-${row.away_score}`));

  // A stale contribution button is also blocked by the current governance state.
  reset();
  result=await callback(`pr:series:${row.match_id}:${row.series_code}`);
  assert.equal(result.handled,'public_result_governance_locked');
  assert.equal(await env.DB.prepare('SELECT * FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind('880001').first(),null);

  // Race: if governance changes while a public user is typing, no submission is stored.
  const now='2026-09-10T19:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO telegram_public_result_sessions
    (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
    VALUES ('880001','880001',?,?,'AWAIT_SCORE',?,?)`).bind(row.match_id,row.series_code,now,now).run();
  reset();
  result=await message('9-9');
  assert.equal(result.handled,'public_result_governance_race_locked');
  assert.equal(result.validation_status,'DISPUTED');
  assert.equal(await env.DB.prepare('SELECT * FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind('880001').first(),null);
  const submitted=await env.DB.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE submitter_id='880001' AND match_id=? AND series_code=? AND status='SUBMITTED'").bind(row.match_id,row.series_code).first();
  assert.equal(Number(submitted.n),0);

  // ANNULLED is visible as status only; retained database score is not presented as official.
  await env.DB.prepare("UPDATE match_series_results SET validation_status='ANNULLED' WHERE result_id=?").bind(row.result_id).run();
  reset();
  result=await callback(`pr:match:${row.match_id}`);
  panel=lastSend();
  button=buttons(panel).find(x=>x.callback_data===`pr:status:${row.match_id}:${row.series_code}`);
  assert.ok(button);
  assert.match(button.text,/🚫/);
  assert.match(button.text,/anulado/i);
  assert.doesNotMatch(button.text,new RegExp(`${row.home_score}-${row.away_score}`));
  assert.doesNotMatch(button.text,/oficial/i);

  // The isolated QA fixture cannot be reached through the public contribution callback contract.
  reset();
  result=await callback('pr:match:QA-RG-MUTATION-01');
  assert.equal(result.handled,'public_result_governance_invalid_match');
  assert.equal(calls.filter(x=>x.method==='sendMessage').length,0,'non-public fixture must not be rendered');

  console.log('PASS VERIFIED is the only public state that exposes an official score');
  console.log('PASS DISPUTED renders status without leaking retained score as official');
  console.log('PASS stale public contribution callbacks cannot bypass a dispute');
  console.log('PASS in-flight public submission is cancelled if governance becomes non-publicable');
  console.log('PASS ANNULLED renders status without an official score');
  console.log('PASS QA fixture remains unreachable through public match callbacks');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
