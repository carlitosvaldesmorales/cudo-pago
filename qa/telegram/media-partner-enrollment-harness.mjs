import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { CAPABILITY, hasScopedCapability, matchingScopedGrant } from '../../sports-bus/worker/access-control.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-media-token',TELEGRAM_WEBHOOK_SECRET:'qa-media-secret'};
const outbound=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-media-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

const OP={id:9940001,first_name:'Operador',last_name:'Campeonato'};
const MEDIA={id:9940002,first_name:'Chepica',last_name:'Play'};
const OTHER={id:9940003,first_name:'Otro',last_name:'Usuario'};
let updateId=940000;

function applyMigrations(){
  for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));
}
async function safeSecret(){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function dispatch(update){
  const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});
  const res=await worker.fetch(req,env,{});
  assert.equal(res.status,200);
  return res.json();
}
async function cb(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
function last(chatId){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId)).at(-1)?.body;}
function callbacks(body){return (body?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}
async function seedReporter(actor,role='REPORTER',clubId=null,trust='PROVISIONAL'){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,clubId,role,trust,now,now).run();
}

try{
  applyMigrations();
  await seedReporter(OP,'PLATFORM_OPERATOR',null,'VERIFIED');
  await seedReporter(MEDIA,'REPORTER',null,'PROVISIONAL');
  await seedReporter(OTHER,'REPORTER',null,'PROVISIONAL');

  const partnerDef=await one("SELECT * FROM partner_definitions WHERE partner_code='CHEPICA_PLAY'");
  assert.equal(partnerDef.display_name,'Chépica Play');
  assert.equal(Number(partnerDef.active),1);

  const assigned=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  assert.ok(assigned,'QA needs a match with a missing TERCERA slot');
  const outside=(await all(`SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND match_id<>? ORDER BY round_no,match_id LIMIT 1`,assigned.match_id))[0];
  assert.ok(outside);

  let r=await msg(OP,'/medios');
  assert.equal(r.handled,'media_partner_management');
  assert.match(last(OP.id).text,/MEDIOS COLABORADORES/);
  assert.ok(callbacks(last(OP.id)).includes('mp:create'));
  console.log('PASS PLATFORM_OPERATOR manages media partner enrollment without policy authority');

  r=await cb(OP,`mp:make:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_invite_created');
  const inviteId=r.invite_id;
  const invite=await one('SELECT * FROM partner_scope_invites WHERE invite_id=?',inviteId);
  assert.equal(invite.partner_code,'CHEPICA_PLAY');
  assert.equal(invite.role,'MEDIA_PARTNER');
  assert.equal(invite.scope_type,'MATCH');
  assert.equal(invite.scope_id,assigned.match_id);
  assert.equal(invite.status,'PENDING');
  assert.ok(!last(OP.id).text.includes(invite.token_hash),'token hash must never be exposed');
  const link=last(OP.id).text.match(/https:\/\/t\.me\/FutbolChepicaBot\?start=partner_([A-Za-z0-9_-]{12,80})/);
  assert.ok(link,'one-use Telegram deep link must be emitted');
  const token=link[1];
  console.log('PASS match-scoped one-use invitation is created for Chépica Play');

  r=await msg(MEDIA,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_claimed');
  const grantId=r.grant_id;
  const grant=await one('SELECT * FROM actor_scope_grants WHERE grant_id=?',grantId);
  assert.equal(grant.telegram_user_id,String(MEDIA.id));
  assert.equal(grant.role,'MEDIA_PARTNER');
  assert.equal(grant.scope_type,'MATCH');
  assert.equal(grant.scope_id,assigned.match_id);
  assert.equal(Number(grant.active),1);
  assert.equal(grant.source_label,'Chépica Play · transmisión');
  const mediaBase=await one('SELECT role,club_id,trust_level FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.equal(mediaBase.role,'REPORTER','partner grant must not replace base role');
  assert.equal(mediaBase.club_id,null);
  assert.equal((await one('SELECT status,claimed_by FROM partner_scope_invites WHERE invite_id=?',inviteId)).status,'CLAIMED');
  console.log('PASS partner claim is additive: base role stays REPORTER and MEDIA_PARTNER grant is scoped to one match');

  const mediaReporter=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.ok(await matchingScopedGrant(env.DB,mediaReporter,assigned,'MEDIA_PARTNER'));
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.OBSERVE_RESULT,assigned),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.GOVERN_RESULTS,assigned),false);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.MANAGE_POLICY,assigned),false);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,outside),false);
  console.log('PASS least privilege: Chépica Play can contribute in assigned match but cannot govern results or change policy');

  r=await msg(OTHER,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_claim_invalid');
  assert.equal(Number((await one("SELECT COUNT(*) AS n FROM actor_scope_grants WHERE role='MEDIA_PARTNER' AND active=1")).n),1);
  console.log('PASS invitation is single-use and cannot be claimed by a second identity');

  r=await cb(MEDIA,'obs:dates');
  assert.equal(r.handled,'observation_dates');
  await cb(MEDIA,`obs:date:${assigned.round_no}`);
  await cb(MEDIA,`obs:match:${assigned.match_id}`);
  await cb(MEDIA,`obs:series:${assigned.match_id}:TERCERA`);
  await cb(MEDIA,'obs:h:2');
  await cb(MEDIA,'obs:a:1');
  r=await cb(MEDIA,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  const observation=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id);
  assert.equal(observation.source_type,'MEDIA_PARTNER');
  assert.equal(observation.source_label,'Chépica Play · transmisión');
  assert.equal(observation.trust_level,'VERIFIED');
  assert.equal(observation.status,'SUBMITTED');
  const canonical=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',assigned.match_id,'TERCERA');
  assert.equal(canonical,null,'media observation must not silently become canonical');
  console.log('PASS Chépica Play observation carries trusted provenance but remains an observation until reconciliation');

  r=await cb(MEDIA,`mp:match:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_match');
  assert.match(last(MEDIA.id).text,/Chépica Play/);
  assert.ok(callbacks(last(MEDIA.id)).includes(`obs:match:${assigned.match_id}`));
  r=await cb(MEDIA,`mp:match:${outside.match_id}`);
  assert.equal(r.handled,'media_partner_scope_denied');
  console.log('PASS partner UX exposes only the assigned match scope');

  r=await cb(OP,`mp:grant-revoke:${grantId}`);
  assert.equal(r.handled,'media_partner_grant_revoked');
  assert.equal(Number((await one('SELECT active FROM actor_scope_grants WHERE grant_id=?',grantId)).active),0);
  const mediaAfter=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.equal(mediaAfter.role,'REPORTER');
  assert.equal(await hasScopedCapability(env.DB,mediaAfter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),false);
  console.log('PASS revoking media scope removes partner capability without deleting identity or changing base role');

  const policyAudits=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE actor_id IN (?,?) AND action IN ('MANAGE_POLICY','GRANT_SUPER_ADMIN')",String(OP.id),String(MEDIA.id));
  assert.equal(Number(policyAudits.n),0);
  console.log('PASS media integration preserves Separation of Duties and policy boundary');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
