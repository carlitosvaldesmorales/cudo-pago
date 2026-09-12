import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleTelegramChepicaPlayHomeRequest } from '../../sports-bus/worker/telegram-chepica-play-home-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');

const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_WEBHOOK_SECRET:'qa-chepica-play-secret',
  TELEGRAM_BOT_TOKEN:'qa-legacy-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-canonical-token'
};

const ADMIN={id:9962001,first_name:'Admin',last_name:'Global'};
const MEDIA={id:9962002,first_name:'Persona',last_name:'Chépica Play'};
const PUBLIC={id:9962003,first_name:'Persona',last_name:'Pública'};

const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:77}}),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function callback(actor,data='mp:home'){
  const secret=`${env.TELEGRAM_WEBHOOK_SECRET}:next`;
  return new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(secret)
    },
    body:JSON.stringify({
      update_id:1,
      callback_query:{
        id:`cb-${actor.id}`,
        from:actor,
        data,
        message:{message_id:77,chat:{id:actor.id,type:'private'}}
      }
    })
  });
}

async function seedReporter(actor,role='REPORTER',trust='PROVISIONAL'){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,NULL,NULL,?,?,1,?,?)`)
    .bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,role,trust,now,now).run();
}

async function grantChepicaPlay(actor){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO actor_scope_grants
    (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
    VALUES (?,?,'MEDIA_PARTNER','COMPETITION','ANFA-CHEPICA-2026',?,'VERIFIED','Chépica Play','qa',1,?,?, 'CHEPICA_PLAY')`)
    .bind(`grant-${actor.id}`,String(actor.id),JSON.stringify(['READ_COMPETITION','OBSERVE_RESULT']),now,now).run();
}

function last(method){return calls.findLast(call=>call.method===method);}
function callbacks(call){
  return (call?.body?.reply_markup?.inline_keyboard||[]).flat().map(button=>button.callback_data).filter(Boolean);
}

try{
  applyMigrations();
  await seedReporter(ADMIN,'SUPER_ADMIN','VERIFIED');
  await seedReporter(MEDIA);
  await seedReporter(PUBLIC);
  await grantChepicaPlay(MEDIA);

  calls.length=0;
  let response=await handleTelegramChepicaPlayHomeRequest(await callback(ADMIN),env);
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'chepica_play_access_gate');
  assert.equal(body.linked,false);
  assert.equal(body.can_manage_access,true);
  assert.equal(body.permission_change,false);
  let screen=last('editMessageText');
  assert.match(screen.body.text,/ACCESO CHÉPICA PLAY/);
  assert.match(screen.body.text,/Ingresar resultados/);
  assert.match(screen.body.text,/Consultar resultados/);
  assert.ok(callbacks(screen).includes('mp:manage'));
  assert.ok(!callbacks(screen).includes('obs:dates'),'unlinked admin must not act as Chépica Play');
  console.log('PASS unlinked SUPER_ADMIN sees the two-capability contract but cannot impersonate Chépica Play');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(PUBLIC),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_access_gate');
  assert.equal(body.can_manage_access,false);
  screen=last('editMessageText');
  assert.ok(!callbacks(screen).includes('mp:manage'));
  assert.ok(!callbacks(screen).includes('obs:dates'));
  console.log('PASS unlinked public identity cannot obtain partner authority from audience selection');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(MEDIA),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_home');
  assert.equal(body.linked,true);
  assert.deepEqual(body.capabilities,['OBSERVE_RESULT','READ_COMPETITION']);
  assert.equal(body.permission_change,false);
  screen=last('editMessageText');
  assert.match(screen.body.text,/CHÉPICA PLAY/);
  assert.deepEqual(callbacks(screen),['obs:dates','tp:public-results','tp:home']);
  const labels=screen.body.reply_markup.inline_keyboard.flat().map(button=>button.text);
  assert.deepEqual(labels,['📝 Ingresar resultados','⚽ Consultar resultados','🏠 Inicio']);
  console.log('PASS linked Chépica Play identity gets exactly ingresar + consultar resultados');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
