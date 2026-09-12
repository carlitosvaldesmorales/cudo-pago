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

const ADMIN={id:9962001,first_name:'Admin',last_name:'Global',username:'admin_global'};
const MEDIA={id:9962002,first_name:'Persona',last_name:'Chépica Play',username:'media_cp'};
const PUBLIC={id:9962003,first_name:'Persona',last_name:'Pública',username:'public_cp'};

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
      update_id:Math.floor(Math.random()*100000),
      callback_query:{
        id:`cb-${actor.id}-${Date.now()}`,
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
    VALUES (?,?,?,NULL,?,?,1,?,?)`)
    .bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,actor.username||null,role,trust,now,now).run();
}

async function grantChepicaPlay(actor){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO actor_scope_grants
    (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
    VALUES (?,?,'MEDIA_PARTNER','COMPETITION','ANFA-CHEPICA-2026',?,'VERIFIED','Chépica Play','qa',1,?,?, 'CHEPICA_PLAY')`)
    .bind(`grant-${actor.id}`,String(actor.id),JSON.stringify(['READ_COMPETITION','OBSERVE_RESULT']),now,now).run();
}

function last(method){return calls.findLast(call=>call.method===method);}
function all(method){return calls.filter(call=>call.method===method);}
function callbacks(call){
  return (call?.body?.reply_markup?.inline_keyboard||[]).flat().map(button=>button.callback_data).filter(Boolean);
}
function labels(call){
  return (call?.body?.reply_markup?.inline_keyboard||[]).flat().map(button=>button.text);
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
  assert.equal(body.handled,'chepica_play_home');
  assert.equal(body.linked,false);
  assert.equal(body.access_mode,'PRIVILEGED_CONTEXT');
  assert.equal(body.entry_context,'CHEPICA_PLAY');
  assert.equal(body.actor_role,'SUPER_ADMIN');
  assert.equal(body.permission_change,false);
  assert.equal(body.identity_change,false);
  let screen=last('editMessageText');
  assert.match(screen.body.text,/CHÉPICA PLAY/);
  assert.match(screen.body.text,/identidad administrativa real se conserva/i);
  assert.deepEqual(callbacks(screen),['cp:observe','tp:public-results','tp:home']);
  assert.deepEqual(labels(screen),['📝 Ingresar resultados','⚽ Consultar resultados','🏠 Inicio']);
  console.log('PASS SUPER_ADMIN enters the Chépica Play UX while preserving real identity');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(PUBLIC),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_access_gate');
  assert.equal(body.linked,false);
  assert.equal(body.authorization_path,'REQUEST_OR_INVITE');
  assert.equal(body.permission_change,false);
  assert.equal(body.identity_change,false);
  screen=last('editMessageText');
  assert.ok(!callbacks(screen).includes('cp:observe'));
  assert.ok(callbacks(screen).includes('cp:access-request'));
  assert.ok(labels(screen).includes('📝 Solicitar autorización'));
  assert.match(screen.body.text,/debes vincular esta identidad/i);
  assert.match(screen.body.text,/invitación personal/i);
  console.log('PASS unlinked public identity receives an actionable authorization/linking gate');

  let publicGrant=await env.DB.prepare("SELECT COUNT(*) AS n FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND active=1").bind(String(PUBLIC.id)).first();
  assert.equal(Number(publicGrant.n),0);

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(PUBLIC,'cp:access-request'),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_access_requested');
  assert.equal(body.request_status,'PENDING');
  assert.ok(body.request_id.startsWith(`cpar-${PUBLIC.id}-`));
  assert.ok(body.approvers_notified>=1);
  screen=last('editMessageText');
  assert.match(screen.body.text,/Estado: PENDIENTE/);
  assert.ok(callbacks(screen).includes('cp:access-status'));
  assert.ok(callbacks(screen).includes('cp:access-cancel'));
  const requestRow=await env.DB.prepare("SELECT * FROM partner_access_requests WHERE telegram_user_id=? AND status='PENDING'").bind(String(PUBLIC.id)).first();
  assert.ok(requestRow);
  publicGrant=await env.DB.prepare("SELECT COUNT(*) AS n FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND active=1").bind(String(PUBLIC.id)).first();
  assert.equal(Number(publicGrant.n),0,'requesting access must not grant access');
  const adminNotifications=all('sendMessage').filter(call=>String(call.body.chat_id)===String(ADMIN.id));
  assert.ok(adminNotifications.some(call=>callbacks(call).includes(`cp:access-review:${requestRow.request_id}`)));
  console.log('PASS access request is pending, grants nothing, and notifies an authorized reviewer');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(ADMIN,`cp:access-review:${requestRow.request_id}`),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_access_review');
  screen=last('editMessageText');
  assert.match(screen.body.text,/REVISAR ACCESO CHÉPICA PLAY/);
  assert.ok(callbacks(screen).includes(`cp:access-approve:${requestRow.request_id}`));
  assert.ok(callbacks(screen).includes(`cp:access-reject:${requestRow.request_id}`));
  console.log('PASS authorized admin can review the request');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(ADMIN,`cp:access-approve:${requestRow.request_id}`),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_access_approved');
  assert.equal(body.permission_change,true);
  assert.equal(body.identity_change,false);
  const approved=await env.DB.prepare('SELECT * FROM partner_access_requests WHERE request_id=?').bind(requestRow.request_id).first();
  assert.equal(approved.status,'APPROVED');
  publicGrant=await env.DB.prepare("SELECT * FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND active=1").bind(String(PUBLIC.id)).first();
  assert.ok(publicGrant);
  assert.equal(publicGrant.role,'MEDIA_PARTNER');
  assert.deepEqual(JSON.parse(publicGrant.capabilities_json),['READ_COMPETITION','OBSERVE_RESULT']);
  const publicReporter=await env.DB.prepare('SELECT role,trust_level FROM reporters WHERE telegram_user_id=?').bind(String(PUBLIC.id)).first();
  assert.equal(publicReporter.role,'REPORTER','partner grant must not overwrite the real base identity');
  assert.equal(publicReporter.trust_level,'PROVISIONAL');
  assert.ok(all('sendMessage').some(call=>String(call.body.chat_id)===String(PUBLIC.id)&&/ACCESO CHÉPICA PLAY APROBADO/.test(call.body.text)));
  console.log('PASS approval creates scoped partner membership without changing base identity');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(PUBLIC),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_home');
  assert.equal(body.linked,true);
  assert.equal(body.access_mode,'PARTNER_IDENTITY');
  screen=last('editMessageText');
  assert.deepEqual(callbacks(screen),['cp:observe','tp:public-results','tp:home']);
  console.log('PASS approved public identity now enters the real Chépica Play two-function home');

  calls.length=0;
  response=await handleTelegramChepicaPlayHomeRequest(await callback(MEDIA),env);
  body=await response.json();
  assert.equal(body.handled,'chepica_play_home');
  assert.equal(body.linked,true);
  assert.equal(body.access_mode,'PARTNER_IDENTITY');
  assert.equal(body.entry_context,'CHEPICA_PLAY');
  assert.deepEqual(body.capabilities,['OBSERVE_RESULT','READ_COMPETITION']);
  assert.equal(body.permission_change,false);
  assert.equal(body.identity_change,false);
  screen=last('editMessageText');
  assert.match(screen.body.text,/CHÉPICA PLAY/);
  assert.deepEqual(callbacks(screen),['cp:observe','tp:public-results','tp:home']);
  assert.deepEqual(labels(screen),['📝 Ingresar resultados','⚽ Consultar resultados','🏠 Inicio']);
  console.log('PASS linked Chépica Play identity and privileged admin share the same two-function UX');

  const adminGrant=await env.DB.prepare("SELECT COUNT(*) AS n FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY'").bind(String(ADMIN.id)).first();
  assert.equal(Number(adminGrant.n),0,'entering Chépica Play UX must not create partner identity/grant');
  console.log('PASS audience/context switch never mutates admin authorization');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
