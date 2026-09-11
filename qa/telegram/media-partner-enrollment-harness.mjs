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

function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function cb(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
function last(chatId){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId)).at(-1)?.body;}
function callbacks(body){return (body?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}
async function seedReporter(actor,role='REPORTER',clubId=null,trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,clubId,role,trust,now,now).run();}

try{
  applyMigrations();
  await seedReporter(OP,'PLATFORM_OPERATOR',null,'VERIFIED');
  await seedReporter(MEDIA,'REPORTER',null,'PROVISIONAL');
  await seedReporter(OTHER,'REPORTER',null,'PROVISIONAL');

  const assigned=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  const outside=(await all(`SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND match_id<>? ORDER BY round_no,match_id LIMIT 1`,assigned.match_id))[0];
  assert.ok(assigned&&outside);

  let r=await msg(OP,'/medios');
  assert.equal(r.handled,'media_partner_management');
  assert.match(last(OP.id).text,/COLABORADORES · Chépica Play/);
  assert.match(last(OP.id).text,/colaborador permanente/i);
  assert.ok(callbacks(last(OP.id)).includes('mp:collab:invite'));
  assert.ok(!last(OP.id).text.includes('El acceso se asigna por partido'));
  console.log('PASS management models Chépica Play as persistent collaborator, not per-match access');

  r=await cb(OP,'mp:collab:invite');
  assert.equal(r.handled,'media_partner_collaboration_invite_created');
  const invite=await one('SELECT * FROM partner_scope_invites WHERE invite_id=?',r.invite_id);
  assert.equal(invite.partner_code,'CHEPICA_PLAY');
  assert.equal(invite.scope_type,'COMPETITION');
  assert.equal(invite.scope_id,'ANFA-CHEPICA-2026');
  assert.equal(invite.status,'PENDING');
  const link=last(OP.id).text.match(/https:\/\/t\.me\/FutbolChepicaBot\?start=partner_([A-Za-z0-9_-]{12,80})/);
  assert.ok(link);
  const token=link[1];
  assert.match(last(OP.id).text,/no está asociada a un partido/i);
  console.log('PASS enrollment invitation creates one persistent competition-scoped relationship');

  r=await msg(MEDIA,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_collaboration_claimed');
  const membership=await getActivePartnerMembership(env.DB,String(MEDIA.id),'ANFA-CHEPICA-2026');
  assert.ok(membership);
  assert.equal(membership.partner_code,'CHEPICA_PLAY');
  assert.equal(membership.scope_type,'COMPETITION');
  assert.equal(membership.source_label,'Chépica Play');
  const base=await one('SELECT role,club_id,trust_level FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.equal(base.role,'REPORTER');
  assert.equal(base.club_id,null);
  assert.match(last(MEDIA.id).text,/relación quedó vinculada al campeonato, no a un partido/i);
  console.log('PASS partner relationship is additive and preserves the person base role');

  r=await msg(OTHER,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_claim_invalid');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM actor_scope_grants WHERE role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND active=1")).n),1);
  console.log('PASS collaboration invitation remains single-use');

  const mediaReporter=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.READ_COMPETITION,assigned),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.READ_COMPETITION,outside),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),false);
  console.log('PASS consume scope is championship-wide while write context is absent before coverage');

  r=await cb(OP,`mp:coverage:make:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_coverage_assigned');
  const coverage=await one("SELECT * FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id);
  assert.equal(coverage.status,'ASSIGNED');
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,assigned),true);
  assert.equal(await hasScopedCapability(env.DB,mediaReporter,CAPABILITY.PUBLISH_MATCH_EVENT,outside),false);
  assert.equal((await getActivePartnerMembership(env.DB,String(MEDIA.id),'ANFA-CHEPICA-2026')).grant_id,membership.grant_id);
  console.log('PASS coverage is a separate work assignment and does not recreate partner identity');

  r=await msg(MEDIA,'/partner');
  assert.equal(r.handled,'media_partner_home');
  assert.match(last(MEDIA.id).text,/COLABORADOR/);
  assert.ok(callbacks(last(MEDIA.id)).includes('tp:public'));
  assert.ok(callbacks(last(MEDIA.id)).includes('tp:public-results'));
  assert.ok(callbacks(last(MEDIA.id)).includes('mp:mycoverages'));
  assert.ok(callbacks(last(MEDIA.id)).includes('obs:dates'));
  console.log('PASS partner workspace exposes consumer and contributor capabilities together');

  r=await cb(MEDIA,`mp:coverage-open:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_coverage_workspace');
  assert.ok(callbacks(last(MEDIA.id)).includes(`obs:match:${assigned.match_id}`));
  r=await cb(MEDIA,`mp:coverage-live:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_coverage_live');
  assert.equal((await one("SELECT status FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id)).status,'LIVE');
  console.log('PASS partner can operate its assigned coverage without gaining championship governance');

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
  assert.equal(await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',assigned.match_id,'TERCERA'),null);
  console.log('PASS coverage contribution carries Chépica Play provenance but does not auto-publish canonical truth');

  await cb(MEDIA,`obs:date:${outside.round_no}`);
  await cb(MEDIA,`obs:match:${outside.match_id}`);
  await cb(MEDIA,`obs:series:${outside.match_id}:SEGUNDA`);
  await cb(MEDIA,'obs:h:1');
  await cb(MEDIA,'obs:a:0');
  r=await cb(MEDIA,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  const outsideObs=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id);
  assert.equal(outsideObs.source_type,'PUBLIC_USER');
  assert.equal(outsideObs.trust_level,'PROVISIONAL');
  console.log('PASS partner trust is contextual: outside coverage the same person contributes as public informant');

  r=await cb(MEDIA,`mp:coverage-close:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_coverage_closed');
  assert.equal((await one("SELECT status FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id)).status,'CLOSED');
  assert.ok(await getActivePartnerMembership(env.DB,String(MEDIA.id),'ANFA-CHEPICA-2026'));
  console.log('PASS closing coverage does not terminate the permanent collaboration');

  r=await cb(OP,`mp:member-revoke:${membership.grant_id}`);
  assert.equal(r.handled,'media_partner_member_revoked');
  assert.equal(Number((await one('SELECT active FROM actor_scope_grants WHERE grant_id=?',membership.grant_id)).active),0);
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(MEDIA.id))).role,'REPORTER');
  console.log('PASS revoking partner relationship preserves identity and history');

  const policyAudits=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE actor_id IN (?,?) AND action IN ('MANAGE_POLICY','GRANT_SUPER_ADMIN')",String(OP.id),String(MEDIA.id));
  assert.equal(Number(policyAudits.n),0);
  console.log('PASS Separation of Duties: partner collaboration never grants policy authority');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
