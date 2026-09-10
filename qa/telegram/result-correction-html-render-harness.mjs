import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleResultCorrectionFlow } from '../../sports-bus/worker/result-correction-flow-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'primary-token',TELEGRAM_BOT_TOKEN_NEXT:'next-token',TELEGRAM_WEBHOOK_SECRET:'root-secret'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method:target.split('/').at(-1),body});
  return new Response(JSON.stringify({ok:true,result:true}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function callback(data){return{callback_query:{id:'cb',from:{id:900001,first_name:'Admin'},data,message:{message_id:55,chat:{id:900001,type:'private'}}}}}
function message(text){return{message:{message_id:56,from:{id:900001,first_name:'Admin'},chat:{id:900001,type:'private'},text}}}
async function invoke(update){
  const secret=await safeSecret(`${env.TELEGRAM_WEBHOOK_SECRET}:next`);
  return handleResultCorrectionFlow(new Request('https://qa.invalid/webhook/telegram-next',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(update)}),env);
}
function lastSend(){return calls.filter(x=>x.method==='sendMessage').at(-1)?.body}

try{
  applyMigrations();
  const now='2026-09-10T17:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('900001','Admin Global QA','globalqa',NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(now,now).run();
  const seed=await env.DB.prepare(`SELECT match_id,series_code,home_score,away_score FROM match_series_results WHERE validation_status='VERIFIED' LIMIT 1`).first();
  assert.ok(seed,'verified result required');

  await invoke(callback(`rg:correct:${seed.match_id}:${seed.series_code}`));
  calls.length=0;
  const home=Number(seed.home_score)+1;
  const away=Number(seed.away_score);
  let response=await invoke(message(`${home}-${away}`));
  let payload=await response.json();
  assert.equal(payload.handled,'result_correction_wait_reason');
  const reasonPrompt=lastSend();
  assert.equal(reasonPrompt.parse_mode,'HTML','reason prompt must request Telegram HTML parsing');
  assert.match(reasonPrompt.text,/<b>MOTIVO DE LA CORRECCIÓN<\/b>/);
  assert.match(reasonPrompt.text,new RegExp(`<b>${home}–${away}<\\/b>`));

  calls.length=0;
  response=await invoke(message('Error <manual> & planilla'));
  payload=await response.json();
  assert.equal(payload.handled,'result_correction_wait_confirm');
  const confirmPrompt=lastSend();
  assert.equal(confirmPrompt.parse_mode,'HTML','confirmation prompt must request Telegram HTML parsing');
  assert.match(confirmPrompt.text,/<b>CONFIRMAR CORRECCIÓN<\/b>/);
  assert.match(confirmPrompt.text,/Error &lt;manual&gt; &amp; planilla/,'user reason must be escaped before HTML rendering');

  console.log('PASS reason prompt renders with Telegram HTML parse mode');
  console.log('PASS confirmation prompt renders with Telegram HTML parse mode');
  console.log('PASS user-provided reason is escaped before HTML rendering');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
