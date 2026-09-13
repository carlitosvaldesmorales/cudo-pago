import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAccessRequestStart, GOVERNED_ACCESS_START_CONTRACT } from '../../sports-bus/worker/access-request-start-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_WEBHOOK_SECRET:'qa-access-start-secret',
  TELEGRAM_BOT_TOKEN:'qa-legacy-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-canonical-token'
};

for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
  env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  if(method==='answerCallbackQuery'){
    return new Response(JSON.stringify({ok:false,description:'Bad Request: query is too old'}),{
      status:400,
      headers:{'content-type':'application/json'}
    });
  }
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

let updateId=92000;
async function request(actor,callbackData){
  const secret=`${env.TELEGRAM_WEBHOOK_SECRET}:next`;
  return new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(secret)
    },
    body:JSON.stringify({
      update_id:++updateId,
      callback_query:{
        id:`cb-${updateId}`,
        from:actor,
        data:callbackData,
        message:{message_id:updateId,chat:{id:actor.id,type:'private'}}
      }
    })
  });
}

async function exercise(actor,callbackData,audienceId){
  calls.length=0;
  const response=await handleAccessRequestStart(await request(actor,callbackData),env);
  assert.ok(response,`${audienceId} request callback must be handled`);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.handled,'access_intake_started');
  assert.equal(body.audience_id,audienceId);
  assert.equal(body.intake_state,'AWAITING_NAME');
  assert.equal(body.request_status,null);
  assert.equal(body.callback_ack,'FAILED_NON_BLOCKING');
  assert.equal(body.presentation,'SENT');
  assert.equal(body.permission_change,false);

  const draft=await env.DB.prepare(`SELECT * FROM access_request_intakes
    WHERE telegram_user_id=? AND audience_id=? ORDER BY updated_at DESC LIMIT 1`)
    .bind(String(actor.id),audienceId).first();
  assert.ok(draft,`${audienceId} durable draft must exist even if callback ACK fails`);
  assert.equal(draft.state,'AWAITING_NAME');
  assert.equal(draft.intake_id,body.intake_id);

  const accessPending=await env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE telegram_user_id=? AND status='PENDING'")
    .bind(String(actor.id)).first();
  const partnerPending=await env.DB.prepare("SELECT COUNT(*) AS n FROM partner_access_requests WHERE telegram_user_id=? AND status='PENDING'")
    .bind(String(actor.id)).first();
  assert.equal(Number(accessPending.n),0,'starting intake must not create Dirigentes PENDING');
  assert.equal(Number(partnerPending.n),0,'starting intake must not create Chépica Play PENDING');

  const prompt=calls.find(call=>call.method==='sendMessage');
  assert.ok(prompt,`${audienceId} must show step 1`);
  assert.equal(prompt.body.reply_markup?.force_reply,true);
  assert.match(prompt.body.text,/PASO 1/);
  assert.match(prompt.body.text,/nombre y apellido/i);
}

try{
  assert.equal(GOVERNED_ACCESS_START_CONTRACT.same_transition_for_all_requestable_audiences,true);
  assert.equal(GOVERNED_ACCESS_START_CONTRACT.durable_draft_precedes_channel_ack,true);
  assert.equal(GOVERNED_ACCESS_START_CONTRACT.callback_ack_is_best_effort,true);

  await exercise(
    {id:992001,first_name:'Ana',last_name:'Dirigente',username:'ana_dirigente'},
    'tp:req',
    'DIRIGENTES'
  );
  console.log('PASS DIRIGENTES tp:req uses governed structured intake start');

  await exercise(
    {id:992002,first_name:'Pedro',last_name:'Chépica Play',username:'pedro_cp'},
    'cp:access-request',
    'CHEPICA_PLAY'
  );
  console.log('PASS CHEPICA_PLAY uses the same governed structured intake start');

  const canonical=fs.readFileSync(path.join(root,'sports-bus','canonical-entry.js'),'utf8');
  const startIndex=canonical.indexOf('handleAccessRequestStart(request.clone(),env)');
  const intakeIndex=canonical.indexOf('handleAccessRequestIntake(request.clone(),env)');
  const coreIndex=canonical.indexOf('return coreWorker.fetch(request,env,ctx)');
  assert.ok(startIndex>0);
  assert.ok(intakeIndex>startIndex,'governed start must intercept request intent before continuation/legacy intake');
  assert.ok(coreIndex>startIndex,'governed start must intercept request intent before legacy portal');
  console.log('PASS canonical routing makes one governed request-start transition authoritative');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
