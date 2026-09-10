import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleResultGovernanceUxRequest } from '../../sports-bus/worker/result-governance-ux-entry.js';

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
function msg(text){return{update_id:1,message:{message_id:10,from:{id:900001,first_name:'Admin'},chat:{id:900001,type:'private'},text}}}
function cb(data){return{update_id:2,callback_query:{id:'cb1',from:{id:900001,first_name:'Admin'},data,message:{message_id:55,chat:{id:900001,type:'private'}}}}}
async function invoke(update){
  const secret=await safeSecret(`${env.TELEGRAM_WEBHOOK_SECRET}:next`);
  return handleResultGovernanceUxRequest(new Request('https://qa.invalid/webhook/telegram-next',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(update)}),env);
}
function last(method){return calls.filter(x=>x.method===method).at(-1)?.body}

try{
  applyMigrations();
  const now='2026-09-10T16:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('900001','Admin Global QA','globalqa',NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(now,now).run();

  let response=await invoke(msg('/correcciones'));
  assert.equal(response.status,200);
  let payload=await response.json();
  assert.equal(payload.handled,'result_governance_ux_list');
  const list=last('sendMessage');
  assert.match(list.text,/GOBIERNO DE RESULTADOS/);
  assert.doesNotMatch(list.text,/VERIFIED|v\d+/);
  const matchButtons=list.reply_markup.inline_keyboard.flat().filter(x=>String(x.callback_data||'').startsWith('rgux:m:'));
  assert.ok(matchButtons.length>0,'must expose match buttons');
  assert.ok(matchButtons.length<=10,'must group series under matches instead of dumping all series');
  assert.ok(matchButtons.some(x=>/—/.test(x.text)),'match button must identify both clubs');

  calls.length=0;
  const matchData=matchButtons[0].callback_data;
  response=await invoke(cb(matchData));
  payload=await response.json();
  assert.equal(payload.handled,'result_governance_ux_match');
  const matchView=last('editMessageText');
  assert.ok(matchView,'callback navigation must edit the same Telegram message');
  assert.match(matchView.text,/RESULTADOS DEL PARTIDO/);
  const seriesButtons=matchView.reply_markup.inline_keyboard.flat().filter(x=>String(x.callback_data||'').startsWith('rg:r:'));
  assert.ok(seriesButtons.length>=1&&seriesButtons.length<=4);
  assert.ok(seriesButtons.some(x=>/[123]ª|Senior/.test(x.text)));

  calls.length=0;
  response=await invoke(cb(seriesButtons[0].callback_data));
  payload=await response.json();
  assert.equal(payload.handled,'result_governance_ux_detail');
  const detail=last('editMessageText');
  assert.ok(detail);
  assert.match(detail.text,/RESULTADO OFICIAL/);
  assert.match(detail.text,/Oficial|En disputa|Anulado/);
  assert.doesNotMatch(detail.text,/VERIFIED|DISPUTED|ANNULLED|v\d+/);
  const actions=detail.reply_markup.inline_keyboard.flat();
  const correct=actions.find(x=>/Corregir/.test(x.text));
  const annul=actions.find(x=>/Anular/.test(x.text));
  assert.equal(correct?.style,'primary');
  assert.equal(annul?.style,'danger');
  assert.ok(actions.some(x=>/Volver al partido/.test(x.text)));

  calls.length=0;
  const hist=actions.find(x=>/historial/i.test(x.text));
  response=await invoke(cb(hist.callback_data));
  payload=await response.json();
  assert.equal(payload.handled,'result_governance_ux_history');
  const history=last('editMessageText');
  assert.match(history.text,/HISTORIAL DEL RESULTADO/);
  assert.doesNotMatch(history.text,/VERIFIED|DISPUTED|ANNULLED/);

  console.log('PASS governance list groups by match and identifies clubs');
  console.log('PASS callback navigation reuses one Telegram message');
  console.log('PASS detail hides technical state/version jargon');
  console.log('PASS destructive action is visually distinguished');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
