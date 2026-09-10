import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/telegram-migration-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { PUBLIC_NATIVE_COMMANDS } from '../../sports-bus/worker/telegram-native-menu-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,'../..');
const migrationsDir=path.join(repoRoot,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-old-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-new-token',
  TELEGRAM_WEBHOOK_SECRET:'qa-shared-secret'
};

const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  const oldPrefix='https://api.telegram.org/botqa-old-token/';
  const newPrefix='https://api.telegram.org/botqa-new-token/';
  const slot=target.startsWith(oldPrefix)?'primary':target.startsWith(newPrefix)?'next':null;
  if(!slot) throw new Error(`QA public UX harness blocked unexpected network call: ${target}`);
  const prefix=slot==='primary'?oldPrefix:newPrefix;
  const method=target.slice(prefix.length);
  const body=init?.body?JSON.parse(String(init.body)):{};
  calls.push({slot,method,body});
  let result=true;
  if(method==='getMe') result=slot==='primary'
    ?{id:111111,is_bot:true,first_name:'Fútbol Chépica',username:'CUDODeportesBot'}
    :{id:222222,is_bot:true,first_name:'Fútbol Chépica',username:'FutbolChepicaBot'};
  if(method==='getMyName') result={name:'Fútbol Chépica'};
  if(method==='getWebhookInfo') result={url:slot==='primary'?'https://qa.invalid/webhook/telegram':'https://qa.invalid/webhook/telegram-next',pending_update_count:0};
  if(method==='getChatMenuButton') result={type:'commands'};
  if(method==='getMyCommands') result=PUBLIC_NATIVE_COMMANDS;
  if(method==='sendMessage') result={message_id:calls.length};
  return new Response(JSON.stringify({ok:true,result}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrationsDir).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrationsDir,file),'utf8'));
  }
}

async function seedDateTwo(){
  const now='2026-09-10T03:30:00Z';
  const values=[
    ['TERCERA',2,3],['SEGUNDA',1,0],['SENIOR',0,0],['PRIMERA',3,0]
  ];
  for(const [series,home,away] of values){
    await env.DB.prepare(`INSERT OR REPLACE INTO match_series_results
      (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,created_at,updated_at)
      VALUES (?,?,?, ?,?,'VERIFIED','QA','Public UX V2',?,?)`)
      .bind(`QA-A-F2-M2-${series}`,'A-F2-M2',series,home,away,now,now).run();
  }
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

let updateId=770000;
const actor={id:9933001,first_name:'QA',last_name:'Público',username:'qa_public_ux'};
async function callback(pathname,secretSource,data){
  const safe=await sha256Hex(secretSource);
  return worker.fetch(new Request(`https://qa.invalid${pathname}`,{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':safe},
    body:JSON.stringify({
      update_id:++updateId,
      callback_query:{
        id:`cb-${updateId}`,
        from:actor,
        data,
        message:{message_id:updateId,date:1789000000,chat:{id:actor.id,type:'private'}}
      }
    })
  }),env,{});
}

function reset(){calls.length=0;}
function slotCalls(slot,method){return calls.filter(x=>x.slot===slot&&(!method||x.method===method));}
function lastSend(slot){return slotCalls(slot,'sendMessage').at(-1)?.body;}
function buttonData(message){return (message?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}

async function run(){
  console.log('TELEGRAM-PUBLIC-RESULTS-UX-V2-COMPAT');
  applyMigrations();
  await seedDateTwo();

  reset();
  let response=await callback('/webhook/telegram-next',`${env.TELEGRAM_WEBHOOK_SECRET}:next`,'px:home');
  assert.equal(response.status,200);
  let payload=await response.json();
  assert.equal(payload.handled,'public_results_ux_home');
  let sent=lastSend('next');
  assert.match(sent.text,/RESULTADOS OFICIALES/);
  assert.doesNotMatch(sent.text,/Santa Elena La Ruda 1-0/);
  const homeButtons=buttonData(sent);
  assert.ok(homeButtons.includes('px:latest'));
  assert.ok(homeButtons.includes('px:dates'));
  assert.ok(homeButtons.includes('px:clubs'));
  assert.ok(homeButtons.includes('px:series'));
  assert.equal(slotCalls('primary','sendMessage').length,0);
  console.log('PASS historical V2 home callback remains available on destination bot');

  reset();
  response=await callback('/webhook/telegram-next',`${env.TELEGRAM_WEBHOOK_SECRET}:next`,'px:latest');
  assert.equal(response.status,200);
  payload=await response.json();
  assert.equal(payload.round_no,2);
  sent=lastSend('next');
  assert.match(sent.text,/FECHA II/);
  const latestButtons=(sent.reply_markup?.inline_keyboard||[]).flat();
  assert.ok(latestButtons.some(x=>/Unión Orilla vs San Juan/.test(x.text)&&/4\/4/.test(x.text)));
  console.log('PASS historical V2 latest callback remains compatible');

  reset();
  response=await callback('/webhook/telegram-next',`${env.TELEGRAM_WEBHOOK_SECRET}:next`,'px:m:2:UNION-ORILLA');
  assert.equal(response.status,200);
  sent=lastSend('next');
  assert.match(sent.text,/Unión Orilla vs San Juan/);
  assert.match(sent.text,/3ª\s+2 — 3/);
  assert.match(sent.text,/2ª\s+1 — 0/);
  assert.match(sent.text,/Senior\s+0 — 0/);
  assert.match(sent.text,/1ª\s+3 — 0/);
  assert.match(sent.text,/Resultados verificados/);
  console.log('PASS historical V2 match callback remains compatible');

  reset();
  response=await callback('/webhook/telegram-next',`${env.TELEGRAM_WEBHOOK_SECRET}:next`,'px:c:UNION-ORILLA');
  assert.equal(response.status,200);
  sent=lastSend('next');
  const clubButtons=(sent.reply_markup?.inline_keyboard||[]).flat().map(x=>x.text);
  assert.ok(clubButtons.some(x=>/Fecha II · vs San Juan/.test(x)));
  assert.ok(clubButtons.some(x=>/Fecha I · vs Santa Elena La Ruda/.test(x)));
  console.log('PASS historical V2 club callback remains compatible');

  reset();
  response=await callback('/webhook/telegram-next',`${env.TELEGRAM_WEBHOOK_SECRET}:next`,'px:s:PRIMERA');
  assert.equal(response.status,200);
  sent=lastSend('next');
  const seriesButtons=buttonData(sent);
  assert.ok(seriesButtons.includes('px:sd:PRIMERA:2'));
  assert.ok(seriesButtons.includes('px:sd:PRIMERA:1'));
  console.log('PASS historical V2 series callback remains compatible');

  reset();
  response=await callback('/webhook/telegram-next',`${env.TELEGRAM_WEBHOOK_SECRET}:next`,'px:sd:PRIMERA:2');
  assert.equal(response.status,200);
  sent=lastSend('next');
  assert.match(sent.text,/PRIMERA · FECHA II/);
  assert.match(sent.text,/Unión Orilla 3 — 0 San Juan/);
  console.log('PASS historical V2 series/date callback remains compatible');

  reset();
  response=await callback('/webhook/telegram',env.TELEGRAM_WEBHOOK_SECRET,'tp:public-results');
  assert.equal(response.status,200);
  payload=await response.json();
  assert.equal(payload.handled,'portal_public_results');
  sent=lastSend('primary');
  assert.match(sent.text,/RESULTADOS REGISTRADOS/);
  assert.equal(slotCalls('next','sendMessage').length,0);
  console.log('PASS primary rollback bot keeps legacy public-results presentation');

  const badSecret=await sha256Hex('wrong-secret');
  reset();
  response=await worker.fetch(new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':badSecret},
    body:JSON.stringify({update_id:++updateId,callback_query:{id:`cb-${updateId}`,from:actor,data:'px:home',message:{message_id:updateId,chat:{id:actor.id,type:'private'}}}})
  }),env,{});
  assert.equal(response.status,401);
  assert.equal(calls.length,0);
  console.log('PASS historical V2 callbacks reject invalid webhook secret before side effects');

  console.log('RESULT: PASS');
}

try{await run();}
finally{globalThis.fetch=originalFetch;env.DB.close();}
