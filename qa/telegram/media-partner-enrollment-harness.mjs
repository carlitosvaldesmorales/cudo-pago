import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { CAPABILITY, hasScopedCapability, getActivePartnerMembership } from '../../sports-bus/worker/access-control.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-media-token',TELEGRAM_WEBHOOK_SECRET:'qa-media-secret'};
const outbound=[]; const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{const target=String(url);if(!target.startsWith('https://api.telegram.org/botqa-media-token/'))throw new Error(`Unexpected network call: ${target}`);const method=target.split('/').at(-1),body=init.body?JSON.parse(String(init.body)):{};outbound.push({method,body});return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});};
const OP={id:9940001,first_name:'Operador',last_name:'Campeonato'},MEDIA={id:9940002,first_name:'Corresponsal',last_name:'Uno'},OTHER={id:9940003,first_name:'Otro',last_name:'Usuario'};let updateId=940000;
function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function cb(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
function last(chatId){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId)).at(-1)?.body;}
function callbacks(body){return (body?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}
async function seed(actor,role='REPORTER',trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,role,trust,now,now).run();}

try{
  applyMigrations(); await seed(OP,'PLATFORM_OPERATOR','VERIFIED'); await seed(MEDIA); await seed(OTHER);
  const assigned=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  const outside=(await all(`SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND match_id<>? ORDER BY round_no,match_id LIMIT 1`,assigned.match_id))[0]; assert.ok(assigned&&outside);

  let r=await msg(OP,'/medios'); assert.equal(r.handled,'media_partner_management'); assert.match(last(OP.id).text,/colaborador permanente/i);
  r=await cb(OP,'mp:collab:invite'); assert.equal(r.handled,'media_partner_collaboration_invite_created');
  const token=last(OP.id).text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1]; assert.ok(token);
  r=await msg(MEDIA,`/start partner_${token}`); assert.equal(r.handled,'media_partner_collaboration_claimed');
  const membership=await getActivePartnerMembership(env.DB,String(MEDIA.id),'ANFA-CHEPICA-2026'); assert.ok(membership); assert.equal(membership.partner_code,'CHEPICA_PLAY');
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(MEDIA.id))).role,'REPORTER');
  r=await msg(OTHER,`/start partner_${token}`); assert.equal(r.handled,'media_partner_claim_invalid');
  console.log('PASS persistent collaboration is additive and invitation is single-use');

  const mediaReporter=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.READ_COMPETITION,assigned),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),false);
  console.log('PASS membership grants competition read but no write without human assignment');

  r=await cb(OP,`mp:coverage:make:${assigned.match_id}`); assert.equal(r.handled,'media_partner_organization_coverage_created');
  const coverage=await one("SELECT * FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id); assert.equal(coverage.status,'ASSIGNED');
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),false);
  assert.ok(callbacks(last(OP.id)).includes(`mp:coverage:assign-member:${assigned.match_id}:${MEDIA.id}`));
  r=await cb(OP,`mp:coverage:assign-member:${assigned.match_id}:${MEDIA.id}`); assert.equal(r.handled,'media_partner_correspondent_assigned');
  const assignment=await one("SELECT * FROM partner_coverage_assignments WHERE coverage_id=? AND telegram_user_id=? AND status='ACTIVE'",coverage.coverage_id,String(MEDIA.id)); assert.ok(assignment);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,outside),false);
  console.log('PASS organization coverage and correspondent assignment are separate scopes');

  r=await msg(MEDIA,'/partner'); assert.equal(r.handled,'media_partner_correspondent_home'); assert.match(last(MEDIA.id).text,/CONCENTRADOR/); assert.ok(callbacks(last(MEDIA.id)).includes('mp:hub'));
  r=await cb(MEDIA,'mp:mycoverages'); assert.equal(r.handled,'media_partner_correspondent_my_coverages'); assert.ok(callbacks(last(MEDIA.id)).includes(`mp:coverage-open:${assigned.match_id}`));
  r=await cb(MEDIA,`mp:coverage-open:${assigned.match_id}`); assert.equal(r.handled,'media_partner_correspondent_workspace');
  r=await cb(MEDIA,`mp:coverage-live:${assigned.match_id}`); assert.equal(r.handled,'media_partner_correspondent_live');
  assert.equal((await one('SELECT status FROM partner_match_coverages WHERE coverage_id=?',coverage.coverage_id)).status,'LIVE');
  console.log('PASS assigned correspondent can operate only its coverage');

  await cb(MEDIA,`obs:match:${assigned.match_id}`); await cb(MEDIA,`obs:series:${assigned.match_id}:TERCERA`); await cb(MEDIA,'obs:h:2'); await cb(MEDIA,'obs:a:1'); r=await cb(MEDIA,'obs:confirm');
  assert.equal(r.handled,'observation_submitted'); const obs=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id); assert.equal(obs.source_type,'MEDIA_PARTNER'); assert.equal(obs.source_label,'Chépica Play · transmisión');
  console.log('PASS assigned correspondent contribution carries organization provenance');

  await cb(MEDIA,`obs:match:${outside.match_id}`); await cb(MEDIA,`obs:series:${outside.match_id}:SEGUNDA`); await cb(MEDIA,'obs:h:1'); await cb(MEDIA,'obs:a:0'); r=await cb(MEDIA,'obs:confirm');
  const outsideObs=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id); assert.equal(outsideObs.source_type,'PUBLIC_USER');
  console.log('PASS same member outside assignment falls back to public provenance');

  r=await cb(OP,`mp:coverage:release-member:${assigned.match_id}:${MEDIA.id}`); assert.equal(r.handled,'media_partner_correspondent_released');
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),false);
  assert.ok(await getActivePartnerMembership(env.DB,String(MEDIA.id),'ANFA-CHEPICA-2026'));
  console.log('PASS releasing work assignment preserves persistent membership');

  const policyAudits=await one("SELECT COUNT(*) n FROM permission_audit WHERE actor_id=? AND action IN ('MANAGE_POLICY','GRANT_SUPER_ADMIN')",String(MEDIA.id)); assert.equal(Number(policyAudits.n),0);
  console.log('PASS no policy authority is introduced'); console.log('RESULT: PASS');
}finally{globalThis.fetch=originalFetch;env.DB.close();}
