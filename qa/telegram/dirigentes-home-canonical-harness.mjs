import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleTelegramDirigentesHomeRequest } from '../../sports-bus/worker/telegram-dirigentes-home-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_WEBHOOK_SECRET:'qa-dirigentes-home-secret',
  TELEGRAM_BOT_TOKEN:'qa-legacy-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-canonical-token'
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

function callbackRequest({actor,pathName='/webhook/telegram-next',messageId=88}){
  return async()=>new Request(`https://qa.invalid${pathName}`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(pathName.endsWith('telegram-next')?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET)
    },
    body:JSON.stringify({
      update_id:99001,
      callback_query:{
        id:`cb-${actor.id}`,
        from:actor,
        data:'tp:leaders',
        message:{message_id:messageId,chat:{id:actor.id,type:'private'}}
      }
    })
  });
}

const CLUB_ADMIN={id:991001,first_name:'Ana',last_name:'Dirigente',username:'ana_dirigente'};
const PUBLIC={id:991002,first_name:'Persona',last_name:'Pública',username:'persona_publica'};
const SUPER={id:991003,first_name:'Admin',last_name:'Global',username:'admin_global'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method,body});
  if(method==='answerCallbackQuery'){
    return new Response(JSON.stringify({ok:false,description:'Bad Request: query is too old'}),{
      status:400,
      headers:{'content-type':'application/json'}
    });
  }
  return new Response(JSON.stringify({ok:true,result:{message_id:77}}),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

function reset(){calls.length=0;}
function last(method){return calls.findLast(call=>call.method===method);}
function callbacks(call){
  return (call?.body?.reply_markup?.inline_keyboard||[]).flat().map(button=>button.callback_data).filter(Boolean);
}

try{
  applyMigrations();
  const now='2026-09-13T16:20:00Z';
  const club=await env.DB.prepare('SELECT team_id,canonical_name FROM teams ORDER BY canonical_name LIMIT 1').first();
  assert.ok(club,'one real club is required');

  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,?, 'CLUB_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(CLUB_ADMIN.id),'Ana Dirigente','ana_dirigente',club.team_id,now,now).run();

  reset();
  let request=await callbackRequest({actor:CLUB_ADMIN})();
  let response=await handleTelegramDirigentesHomeRequest(request,env);
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'dirigentes_home');
  assert.equal(body.access_state,'AUTHORIZED_CLUB');
  assert.equal(body.channel_role,'CANONICAL');
  assert.equal(body.callback_ack,'FAILED_NON_BLOCKING');
  assert.equal(body.presentation_mode,'EDITED');
  let screen=last('editMessageText');
  assert.ok(screen,'Dirigentes must render even when callback ACK fails');
  assert.match(screen.body.text,/PORTAL DIRIGENTES/);
  assert.match(screen.body.text,new RegExp(club.canonical_name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(callbacks(screen).includes('tp:mymatches'));
  assert.ok(callbacks(screen).includes('tp:registered'));
  console.log('PASS canonical approved CLUB_ADMIN enters Dirigentes even when Telegram callback ACK fails');

  reset();
  request=await callbackRequest({actor:PUBLIC,pathName:'/webhook/telegram'})();
  response=await handleTelegramDirigentesHomeRequest(request,env);
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.access_state,'REQUESTABLE');
  assert.equal(body.channel_role,'LEGACY_COMPATIBILITY');
  assert.equal(body.callback_ack,'FAILED_NON_BLOCKING');
  screen=last('editMessageText');
  assert.match(screen.body.text,/todavía no tiene permisos administrativos/i);
  assert.ok(callbacks(screen).includes('tp:req'));
  console.log('PASS unlinked identity keeps the governed enrollment entrypoint');

  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(SUPER.id),'Admin Global','admin_global',now,now).run();

  reset();
  request=await callbackRequest({actor:SUPER})();
  response=await handleTelegramDirigentesHomeRequest(request,env);
  body=await response.json();
  assert.equal(body.access_state,'AUTHORIZED_GLOBAL');
  screen=last('editMessageText');
  assert.match(screen.body.text,/ADMIN GLOBAL/);
  assert.ok(callbacks(screen).includes('tp:requests'));
  assert.ok(callbacks(screen).includes('tp:admins'));
  console.log('PASS SUPER_ADMIN keeps the existing global Dirigentes control surface');

  const canonical=fs.readFileSync(path.join(root,'sports-bus','canonical-entry.js'),'utf8');
  const homeIndex=canonical.indexOf('handleTelegramDirigentesHomeRequest(request.clone(),env)');
  const coreIndex=canonical.indexOf('return coreWorker.fetch(request,env,ctx)');
  assert.ok(homeIndex>0&&coreIndex>homeIndex,'Dirigentes home must be canonical before legacy fallback');
  console.log('PASS canonical router owns tp:leaders before the legacy fallback chain');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
