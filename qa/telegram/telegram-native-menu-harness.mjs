import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { PUBLIC_NATIVE_COMMANDS } from '../../sports-bus/worker/telegram-native-menu-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,'../..');
const migrationsDir=path.join(repoRoot,'sports-bus','migrations');

const QA={
  USER:{id:9911001,first_name:'QA',last_name:'Usuario',username:'qa_public'},
  SUPER:{id:9911002,first_name:'QA',last_name:'Global',username:'qa_super'}
};

const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-menu-token',TELEGRAM_WEBHOOK_SECRET:'qa-menu-secret'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  const prefix='https://api.telegram.org/botqa-menu-token/';
  if(!target.startsWith(prefix)) throw new Error(`QA menu harness blocked unexpected network call: ${target}`);
  const method=target.slice(prefix.length);
  const body=init?.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  let result=true;
  if(method==='getMe') result={id:123456,is_bot:true,first_name:'QA',username:'qa_menu_bot'};
  if(method==='getWebhookInfo') result={url:'https://qa.invalid/webhook/telegram',pending_update_count:0};
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

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

let updateId=880000;
async function message(actor,text){
  const safe=await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET);
  const request=new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':safe},
    body:JSON.stringify({update_id:++updateId,message:{message_id:updateId,from:actor,chat:{id:actor.id,type:'private'},text}})
  });
  const response=await worker.fetch(request,env,{});
  assert.equal(response.status,200);
  return response.json();
}

function resetCalls(){calls.length=0;}
function apiCalls(method){return calls.filter(x=>x.method===method);}
function lastSend(){return apiCalls('sendMessage').at(-1)?.body;}
function commandNames(call){return (call?.body?.commands||[]).map(x=>x.command);}

async function row(sql,...params){return env.DB.prepare(sql).bind(...params).first();}

async function seedSuper(){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,'UNION-ORILLA','SUPER_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(QA.SUPER.id),'QA Global',QA.SUPER.username,now,now).run();
}

async function run(){
  console.log('TELEGRAM-NATIVE-MENU-01');
  applyMigrations();
  assert.ok(await row("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_menu_state'"));
  await seedSuper();

  resetCalls();
  let result=await message(QA.USER,'/inicio');
  assert.equal(result.handled,'telegram_native_menu_home');
  assert.equal(result.profile,'PUBLIC');
  let state=await row('SELECT * FROM telegram_menu_state WHERE telegram_user_id=?',String(QA.USER.id));
  assert.equal(state.menu_profile,'PUBLIC');
  assert.equal(apiCalls('setChatMenuButton').length,1);
  assert.equal(apiCalls('setMyCommands').length,1);
  assert.deepEqual(commandNames(apiCalls('setMyCommands')[0]),['inicio','publico','dirigentes']);
  assert.match(lastSend().text,/FÚTBOL CHÉPICA/);
  console.log('PASS public native menu profile');

  resetCalls();
  result=await message(QA.USER,'/inicio');
  assert.equal(result.profile,'PUBLIC');
  assert.equal(apiCalls('setChatMenuButton').length,0,'same profile must not resync menu');
  assert.equal(apiCalls('setMyCommands').length,0,'same profile must not resync commands');
  console.log('PASS menu sync idempotence');

  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE reporters SET club_id='UNION-ORILLA',role='CLUB_ADMIN',trust_level='VERIFIED',active=1,updated_at=? WHERE telegram_user_id=?").bind(now,String(QA.USER.id)).run();
  resetCalls();
  result=await message(QA.USER,'/inicio');
  assert.equal(result.profile,'CLUB_ADMIN');
  state=await row('SELECT * FROM telegram_menu_state WHERE telegram_user_id=?',String(QA.USER.id));
  assert.equal(state.menu_profile,'CLUB_ADMIN');
  let names=commandNames(apiCalls('setMyCommands')[0]);
  assert.ok(names.includes('mispartidos'));
  assert.ok(names.includes('pendientes'));
  assert.ok(names.includes('correcciones'));
  assert.ok(!names.includes('solicitudes'));
  assert.match(lastSend().text,/Administrador del club/);
  console.log('PASS CLUB_ADMIN role-aware commands');

  resetCalls();
  result=await message(QA.USER,'/mispartidos');
  assert.equal(result.handled,'telegram_native_menu_my_matches');
  assert.match(lastSend().text,/MIS PARTIDOS/);
  assert.equal(apiCalls('setMyCommands').length,0);
  console.log('PASS direct native command navigation');

  await env.DB.prepare("UPDATE reporters SET active=0,updated_at=? WHERE telegram_user_id=?").bind(new Date().toISOString(),String(QA.USER.id)).run();
  resetCalls();
  result=await message(QA.USER,'/inicio');
  assert.equal(result.profile,'PUBLIC');
  names=commandNames(apiCalls('setMyCommands')[0]);
  assert.deepEqual(names,['inicio','publico','dirigentes']);
  state=await row('SELECT * FROM telegram_menu_state WHERE telegram_user_id=?',String(QA.USER.id));
  assert.equal(state.menu_profile,'PUBLIC');
  console.log('PASS suspended admin automatically loses admin menu');

  resetCalls();
  result=await message(QA.SUPER,'/inicio');
  assert.equal(result.profile,'SUPER_ADMIN');
  names=commandNames(apiCalls('setMyCommands')[0]);
  assert.ok(names.includes('solicitudes'));
  assert.ok(names.includes('dirigentes'));
  assert.ok(names.includes('correcciones'));
  assert.ok(!names.includes('mispartidos'));
  assert.match(lastSend().text,/ADMIN GLOBAL/);
  console.log('PASS SUPER_ADMIN role-aware commands');

  resetCalls();
  result=await message(QA.SUPER,'/solicitudes');
  assert.equal(result.handled,'telegram_native_menu_access_requests');
  assert.match(lastSend().text,/No hay solicitudes|SOLICITUDES PENDIENTES/);
  console.log('PASS SUPER_ADMIN direct command');

  resetCalls();
  const reconcile=await worker.fetch(new Request('https://qa.invalid/ops/telegram/reconcile',{method:'POST',headers:{'X-CUDO-Repair':'reconcile-webhook'}}),env,{});
  assert.equal(reconcile.status,200);
  const reconcileJson=await reconcile.json();
  assert.equal(reconcileJson.ok,true);
  assert.equal(apiCalls('setWebhook').length,1);
  assert.equal(apiCalls('setChatMenuButton').length,1);
  assert.equal(apiCalls('setMyCommands').length,1);
  assert.deepEqual(commandNames(apiCalls('setMyCommands')[0]),['inicio','publico','dirigentes']);
  console.log('PASS deploy reconcile configures default native menu');

  resetCalls();
  const health=await worker.fetch(new Request('https://qa.invalid/health/telegram'),env,{});
  assert.equal(health.status,200);
  const healthJson=await health.json();
  assert.equal(healthJson.native_menu_configured,true);
  assert.equal(healthJson.default_commands_configured,true);
  console.log('PASS native menu runtime health contract');

  console.log('RESULT: PASS');
  console.log('Human-only residual gate: visual confirmation that Telegram iOS renders the Menu button and the role-specific command list.');
}

try{await run();}
finally{globalThis.fetch=originalFetch;env.DB.close();}
