import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { prepareTelegramEntryContext, getTelegramEntryContext } from '../../sports-bus/worker/telegram-entry-context.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const DB=new D1SqliteAdapter();

const env={
  DB,
  TELEGRAM_WEBHOOK_SECRET:'qa-context-secret',
  TELEGRAM_BOT_TOKEN:'qa-legacy-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-canonical-token'
};

const ADMIN={id:9973001,first_name:'Admin',last_name:'Global'};
const PUBLIC={id:9973002,first_name:'Persona',last_name:'Pública'};
const MEDIA={id:9973003,first_name:'Persona',last_name:'Chépica Play'};

const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function seedReporter(actor,role,trust){
  const now=new Date().toISOString();
  await DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,NULL,NULL,?,?,1,?,?)`)
    .bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,role,trust,now,now).run();
}

async function grantChepicaPlay(actor){
  const now=new Date().toISOString();
  await DB.prepare(`INSERT INTO actor_scope_grants
    (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
    VALUES (?,?,'MEDIA_PARTNER','COMPETITION','ANFA-CHEPICA-2026',?,'VERIFIED','Chépica Play','qa',1,?,?, 'CHEPICA_PLAY')`)
    .bind(`grant-${actor.id}`,String(actor.id),JSON.stringify(['READ_COMPETITION','OBSERVE_RESULT']),now,now).run();
}

async function canonicalCallback(actor,data){
  const secret=`${env.TELEGRAM_WEBHOOK_SECRET}:next`;
  return new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(secret)
    },
    body:JSON.stringify({
      update_id:51,
      callback_query:{
        id:`cb-${actor.id}-${data}`,
        from:actor,
        data,
        message:{message_id:9,chat:{id:actor.id,type:'private'}}
      }
    })
  });
}

try{
  applyMigrations();
  await seedReporter(ADMIN,'SUPER_ADMIN','VERIFIED');
  await seedReporter(PUBLIC,'REPORTER','PROVISIONAL');
  await seedReporter(MEDIA,'REPORTER','PROVISIONAL');
  await grantChepicaPlay(MEDIA);

  let prepared=await prepareTelegramEntryContext(await canonicalCallback(ADMIN,'cp:observe'),env);
  assert.ok(prepared.response);
  assert.equal((await prepared.response.json()).handled,'chepica_play_context_denied');
  assert.equal(await getTelegramEntryContext(DB,ADMIN.id),'PUBLIC_GENERAL');
  const adminGrant=await DB.prepare("SELECT COUNT(*) AS n FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY'")
    .bind(String(ADMIN.id)).first();
  assert.equal(Number(adminGrant.n),0);
  const reporter=await DB.prepare('SELECT role,trust_level FROM reporters WHERE telegram_user_id=?').bind(String(ADMIN.id)).first();
  assert.equal(reporter.role,'SUPER_ADMIN');
  assert.equal(reporter.trust_level,'VERIFIED');
  console.log('PASS SUPER_ADMIN control-plane authority does not bypass Chépica Play membership');

  prepared=await prepareTelegramEntryContext(await canonicalCallback(PUBLIC,'cp:observe'),env);
  assert.ok(prepared.response);
  assert.equal((await prepared.response.json()).handled,'chepica_play_context_denied');
  assert.equal(await getTelegramEntryContext(DB,PUBLIC.id),'PUBLIC_GENERAL');
  console.log('PASS ordinary unlinked user cannot gain Chépica Play write context by callback');

  prepared=await prepareTelegramEntryContext(await canonicalCallback(MEDIA,'cp:observe'),env);
  assert.equal(prepared.response,null);
  const rewritten=await prepared.request.json();
  assert.equal(rewritten.callback_query.data,'obs:dates');
  assert.equal(await getTelegramEntryContext(DB,MEDIA.id),'CHEPICA_PLAY');
  console.log('PASS explicitly linked Chépica Play identity enters the existing observation capability');

  const now=new Date().toISOString();
  await DB.prepare(`INSERT INTO public_result_submissions
    (submission_id,match_id,series_code,submitter_id,submitter_name,home_score,away_score,status,source_channel,source_event_id,created_at,updated_at)
    VALUES ('qa-media-context','A-F3-M1','TERCERA',?,?,1,0,'SUBMITTED','telegram','qa-event',?,?)`)
    .bind(String(MEDIA.id),'Persona Chépica Play',now,now).run();

  const submission=await DB.prepare(`SELECT submitter_id,submitter_name,source_channel,entry_context
    FROM public_result_submissions WHERE submission_id='qa-media-context'`).first();
  assert.equal(submission.submitter_id,String(MEDIA.id));
  assert.equal(submission.submitter_name,'Persona Chépica Play');
  assert.equal(submission.entry_context,'CHEPICA_PLAY');
  assert.equal(submission.source_channel,'telegram:chepica_play');
  console.log('PASS result audit stores real linked actor + Chépica Play entry context separately');

  prepared=await prepareTelegramEntryContext(await canonicalCallback(MEDIA,'tp:public-report'),env);
  assert.equal(prepared.response,null);
  assert.equal(await getTelegramEntryContext(DB,MEDIA.id),'PUBLIC_GENERAL');
  console.log('PASS entering public contribution explicitly resets context to Público general');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  DB.close();
}
