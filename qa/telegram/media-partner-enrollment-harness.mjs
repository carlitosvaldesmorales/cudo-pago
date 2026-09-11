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
const MEDIA_A={id:9940002,first_name:'Chepica',last_name:'Play A'};
const MEDIA_B={id:9940003,first_name:'Chepica',last_name:'Play B'};
const OTHER={id:9940004,first_name:'Otro',last_name:'Usuario'};
let updateId=940000;

function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function cb(actor,data,id=null){return dispatch({callback_query:{id:id||`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
function last(chatId){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId)).at(-1)?.body;}
function callbacks(body){return (body?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}
function tokenFromLast(chatId){return last(chatId)?.text?.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];}
async function seed(actor,role='REPORTER',trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,role,trust,now,now).run();}

async function registerScore(actor,matchId,seriesCode,home,away){
  await cb(actor,`obs:match:${matchId}`);
  await cb(actor,`obs:series:${matchId}:${seriesCode}`);
  await cb(actor,`obs:h:${home}`);
  await cb(actor,`obs:a:${away}`);
  return cb(actor,'obs:confirm');
}

try{
  applyMigrations();
  await seed(OP,'PLATFORM_OPERATOR','VERIFIED');
  await seed(MEDIA_A);
  await seed(MEDIA_B);
  await seed(OTHER);

  const match=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  const missing=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0]||match;
  assert.ok(match&&missing);

  let r=await msg(OP,'/medios');
  assert.equal(r.handled,'media_partner_management');
  assert.match(last(OP.id).text,/Personas vinculadas: 0/i);
  assert.match(last(OP.id).text,/Consultar resultados/i);
  assert.match(last(OP.id).text,/Registrar resultados/i);
  assert.equal(/coberturas|corresponsales|eventos en vivo/i.test(last(OP.id).text),false);
  const manageActions=callbacks(last(OP.id));
  assert.equal(manageActions.some(x=>x.startsWith('mp:coverage')||x.startsWith('mplive:')||x==='mp:hub'||x==='mp:mycoverages'),false);
  assert.ok(manageActions.includes('mp:collab:invite'));
  console.log('PASS management surface declares one partner organization with N independent identities and exactly two capabilities');

  r=await cb(OP,'mp:collab:invite');
  assert.equal(r.handled,'media_partner_collaboration_invite_created');
  assert.deepEqual(r.capabilities,['READ_COMPETITION','OBSERVE_RESULT']);
  const inviteA=r.invite_id,tokenA=tokenFromLast(OP.id);
  assert.ok(tokenA);
  assert.match(last(OP.id).text,/individual y de un solo uso/i);
  assert.match(last(OP.id).text,/Puedes crear uno distinto para cada persona/i);

  r=await cb(OP,'mp:collab:invite');
  assert.equal(r.handled,'media_partner_collaboration_invite_created');
  const inviteB=r.invite_id,tokenB=tokenFromLast(OP.id);
  assert.ok(tokenB);

  r=await cb(OP,'mp:collab:invite');
  assert.equal(r.handled,'media_partner_collaboration_invite_created');
  const spareInvite=r.invite_id,spareToken=tokenFromLast(OP.id);
  assert.ok(spareToken);
  assert.notEqual(inviteA,inviteB);
  assert.notEqual(inviteB,spareInvite);
  assert.equal(Number((await one("SELECT COUNT(*) n FROM partner_scope_invites WHERE partner_code='CHEPICA_PLAY' AND status='PENDING'")).n),3);
  console.log('PASS multiple independent partner invitations coexist in PENDING state');

  r=await msg(MEDIA_A,`/start partner_${tokenA}`);
  assert.equal(r.handled,'media_partner_collaboration_claimed');
  const membershipA=await getActivePartnerMembership(env.DB,String(MEDIA_A.id),'ANFA-CHEPICA-2026');
  assert.ok(membershipA);
  assert.equal(membershipA.partner_code,'CHEPICA_PLAY');

  r=await msg(MEDIA_B,`/start partner_${tokenB}`);
  assert.equal(r.handled,'media_partner_collaboration_claimed');
  const membershipB=await getActivePartnerMembership(env.DB,String(MEDIA_B.id),'ANFA-CHEPICA-2026');
  assert.ok(membershipB);
  assert.equal(membershipB.partner_code,'CHEPICA_PLAY');
  assert.notEqual(membershipA.telegram_user_id,membershipB.telegram_user_id);
  assert.deepEqual(JSON.parse(membershipA.capabilities_json),['READ_COMPETITION','OBSERVE_RESULT']);
  assert.deepEqual(JSON.parse(membershipB.capabilities_json),['READ_COMPETITION','OBSERVE_RESULT']);
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(MEDIA_A.id))).role,'REPORTER');
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(MEDIA_B.id))).role,'REPORTER');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM actor_scope_grants WHERE partner_code='CHEPICA_PLAY' AND role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND active=1")).n),2);
  console.log('PASS two different Telegram identities are independently linked to the same Chépica Play organization');

  r=await msg(OTHER,`/start partner_${tokenA}`);
  assert.equal(r.handled,'media_partner_claim_invalid');
  console.log('PASS each individual invitation remains single-use');

  r=await msg(MEDIA_A,`/start partner_${spareToken}`);
  assert.equal(r.handled,'media_partner_already_member');
  assert.equal((await one('SELECT status FROM partner_scope_invites WHERE invite_id=?',spareInvite)).status,'PENDING');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM actor_scope_grants WHERE partner_code='CHEPICA_PLAY' AND active=1")).n),2);
  console.log('PASS already-linked identity cannot consume another person invitation; spare invite stays available');

  const reporterA=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA_A.id));
  const reporterB=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA_B.id));
  for(const reporter of [reporterA,reporterB]){
    assert.equal(await hasScopedCapability(env.DB,reporter,CAPABILITY.READ_COMPETITION,match),true);
    assert.equal(await hasScopedCapability(env.DB,reporter,CAPABILITY.OBSERVE_RESULT,match),true);
    assert.equal(await hasScopedCapability(env.DB,reporter,CAPABILITY.PUBLISH_MATCH_EVENT,match),false);
  }
  console.log('PASS every active identity independently receives consume + register-result and no live-event capability');

  for(const actor of [MEDIA_A,MEDIA_B]){
    r=await msg(actor,'/partner');
    assert.equal(r.handled,'media_partner_home');
    const home=last(actor.id);
    assert.match(home.text,/ACCESOS HABILITADOS/i);
    assert.match(home.text,/Consultar resultados/i);
    assert.match(home.text,/Registrar resultado/i);
    const homeCallbacks=callbacks(home);
    assert.ok(homeCallbacks.includes('tp:public-results'));
    assert.ok(homeCallbacks.includes('obs:dates'));
    assert.equal(homeCallbacks.some(x=>x.startsWith('mp:coverage')||x.startsWith('mplive:')||x==='mp:hub'||x==='mp:mycoverages'),false);
    r=await cb(actor,'tp:public-results');
    assert.equal(r.handled,'portal_public_results');
  }
  console.log('PASS both identities can independently consume verified results through the same partner contract');

  const before=await one('SELECT result_id,home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA');
  const resultA=await registerScore(MEDIA_A,missing.match_id,'TERCERA',2,1);
  assert.equal(resultA.handled,'observation_submitted');
  assert.equal(resultA.source_type,'MEDIA_PARTNER');
  const resultB=await registerScore(MEDIA_B,missing.match_id,'TERCERA',1,1);
  assert.equal(resultB.handled,'observation_submitted');
  assert.equal(resultB.source_type,'MEDIA_PARTNER');

  const observationA=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',resultA.submission_id);
  const observationB=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',resultB.submission_id);
  assert.equal(observationA.source_label,'Chépica Play');
  assert.equal(observationB.source_label,'Chépica Play');
  assert.equal(observationA.submitter_id,String(MEDIA_A.id));
  assert.equal(observationB.submitter_id,String(MEDIA_B.id));
  assert.equal(observationA.status,'SUBMITTED');
  assert.equal(observationB.status,'SUBMITTED');
  assert.notEqual(observationA.submission_id,observationB.submission_id);
  const after=await one('SELECT result_id,home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA');
  assert.deepEqual(after,before);
  console.log('PASS multiple Chépica Play identities can register independent traced result observations without canonical overwrite');

  r=await cb(OP,`mp:member-revoke:${membershipA.grant_id}`);
  assert.equal(r.handled,'media_partner_member_revoked');
  assert.equal(Number((await one('SELECT active FROM actor_scope_grants WHERE grant_id=?',membershipA.grant_id)).active),0);
  assert.equal(Number((await one('SELECT active FROM actor_scope_grants WHERE grant_id=?',membershipB.grant_id)).active),1);
  assert.ok(await getActivePartnerMembership(env.DB,String(MEDIA_B.id),'ANFA-CHEPICA-2026'));
  assert.equal(await getActivePartnerMembership(env.DB,String(MEDIA_A.id),'ANFA-CHEPICA-2026'),null);
  r=await msg(MEDIA_B,'/partner');
  assert.equal(r.handled,'media_partner_home');
  assert.match(last(MEDIA_B.id).text,/Registrar resultado/i);
  console.log('PASS revoking one identity leaves other Chépica Play identities active and usable');

  r=await cb(OP,`mp:invite-revoke:${spareInvite}`);
  assert.equal(r.handled,'media_partner_invite_revoked');
  assert.equal((await one('SELECT status FROM partner_scope_invites WHERE invite_id=?',spareInvite)).status,'REVOKED');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM actor_scope_grants WHERE partner_code='CHEPICA_PLAY' AND active=1")).n),1);
  console.log('PASS invitation lifecycle is independent from active member lifecycle');

  const activeCoverages=Number((await one("SELECT COUNT(*) n FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND status IN ('ASSIGNED','LIVE','CLOSED')")).n);
  const activeAssignments=Number((await one("SELECT COUNT(*) n FROM partner_coverage_assignments WHERE partner_code='CHEPICA_PLAY' AND status='ACTIVE'")).n);
  assert.equal(activeCoverages,0);
  assert.equal(activeAssignments,0);
  console.log('PASS multi-identity support does not reintroduce coverage/correspondent operational scope');

  r=await cb(MEDIA_B,`mp:coverage-open:${match.match_id}`);
  assert.equal(r.handled,'media_partner_legacy_flow_retired');
  r=await cb(MEDIA_B,`mplive:event:${match.match_id}`,'legacy-live-event');
  assert.equal(r.handled,'media_partner_legacy_flow_retired');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM events WHERE event_id='mp-live-legacy-live-event'")).n),0);
  console.log('PASS stale coverage/live buttons remain fail-closed');

  const policyAudits=await one("SELECT COUNT(*) n FROM permission_audit WHERE actor_id IN (?,?) AND action IN ('MANAGE_POLICY','GRANT_SUPER_ADMIN')",String(MEDIA_A.id),String(MEDIA_B.id));
  assert.equal(Number(policyAudits.n),0);
  console.log('PASS no member receives governance or policy authority');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
