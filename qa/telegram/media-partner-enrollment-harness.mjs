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
const MEDIA={id:9940002,first_name:'Chepica',last_name:'Play QA'};
const OTHER={id:9940003,first_name:'Otro',last_name:'Usuario'};
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
async function seed(actor,role='REPORTER',trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,role,trust,now,now).run();}

try{
  applyMigrations();
  await seed(OP,'PLATFORM_OPERATOR','VERIFIED');
  await seed(MEDIA);
  await seed(OTHER);

  const match=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  const missing=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0]||match;
  assert.ok(match&&missing);

  let r=await msg(OP,'/medios');
  assert.equal(r.handled,'media_partner_management');
  assert.match(last(OP.id).text,/Consumir resultados/i);
  assert.match(last(OP.id).text,/Registrar resultados/i);
  assert.doesNotMatch(last(OP.id).text,/coberturas|corresponsales|eventos en vivo/i);
  assert.ok(callbacks(last(OP.id)).includes('mp:collab:invite'));
  console.log('PASS management surface declares exactly the two current product capabilities');

  r=await cb(OP,'mp:collab:invite');
  assert.equal(r.handled,'media_partner_collaboration_invite_created');
  assert.deepEqual(r.capabilities,['READ_COMPETITION','OBSERVE_RESULT']);
  assert.match(last(OP.id).text,/Consultar resultados/i);
  assert.match(last(OP.id).text,/Registrar resultados/i);
  assert.match(last(OP.id).text,/No asigna partidos, coberturas, corresponsales ni eventos en vivo/i);
  const token=last(OP.id).text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];
  assert.ok(token);

  r=await msg(MEDIA,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_collaboration_claimed');
  const membership=await getActivePartnerMembership(env.DB,String(MEDIA.id),'ANFA-CHEPICA-2026');
  assert.ok(membership);
  assert.equal(membership.partner_code,'CHEPICA_PLAY');
  assert.deepEqual(JSON.parse(membership.capabilities_json),['READ_COMPETITION','OBSERVE_RESULT']);
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(MEDIA.id))).role,'REPORTER');
  r=await msg(OTHER,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_claim_invalid');
  console.log('PASS enrollment is additive, single-use and grants only read + register-result capabilities');

  const reporter=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(MEDIA.id));
  assert.equal(await hasScopedCapability(env.DB,reporter,CAPABILITY.READ_COMPETITION,match),true);
  assert.equal(await hasScopedCapability(env.DB,reporter,CAPABILITY.OBSERVE_RESULT,match),true);
  assert.equal(await hasScopedCapability(env.DB,reporter,CAPABILITY.PUBLISH_MATCH_EVENT,match),false);
  console.log('PASS authorization contract: consume=true, register-result=true, publish-live-event=false');

  r=await msg(MEDIA,'/partner');
  assert.equal(r.handled,'media_partner_home');
  const home=last(MEDIA.id);
  assert.match(home.text,/CONSUMIDOR DE RESULTADOS/i);
  assert.match(home.text,/REGISTRADOR DE RESULTADOS/i);
  const homeCallbacks=callbacks(home);
  assert.ok(homeCallbacks.includes('tp:public-results'));
  assert.ok(homeCallbacks.includes('obs:dates'));
  assert.equal(homeCallbacks.some(x=>x.startsWith('mp:coverage')||x.startsWith('mplive:')||x==='mp:hub'||x==='mp:mycoverages'),false);
  console.log('PASS actor-fidelity gate: Chépica Play UI exposes only consume + register result');

  r=await cb(MEDIA,'tp:public-results');
  assert.equal(r.handled,'portal_public_results');
  console.log('PASS consumer vertical reaches the verified-results projection');

  const before=await one('SELECT result_id,home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA');
  await cb(MEDIA,`obs:match:${missing.match_id}`);
  await cb(MEDIA,`obs:series:${missing.match_id}:TERCERA`);
  await cb(MEDIA,'obs:h:2');
  await cb(MEDIA,'obs:a:1');
  r=await cb(MEDIA,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  assert.equal(r.source_type,'MEDIA_PARTNER');
  const observation=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id);
  assert.equal(observation.source_type,'MEDIA_PARTNER');
  assert.equal(observation.source_label,'Chépica Play');
  assert.equal(observation.trust_level,'VERIFIED');
  assert.equal(observation.status,'SUBMITTED');
  const after=await one('SELECT result_id,home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA');
  assert.deepEqual(after,before);
  console.log('PASS registrar vertical stores a Chépica Play observation without mutating canonical result');

  const activeCoverages=Number((await one("SELECT COUNT(*) n FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND status IN ('ASSIGNED','LIVE','CLOSED')")).n);
  const activeAssignments=Number((await one("SELECT COUNT(*) n FROM partner_coverage_assignments WHERE partner_code='CHEPICA_PLAY' AND status='ACTIVE'")).n);
  assert.equal(activeCoverages,0);
  assert.equal(activeAssignments,0);
  console.log('PASS root cleanup leaves no active coverage/correspondent operational scope');

  r=await cb(MEDIA,`mp:coverage-open:${match.match_id}`);
  assert.equal(r.handled,'media_partner_legacy_flow_retired');
  r=await cb(MEDIA,`mplive:event:${match.match_id}`,'legacy-live-event');
  assert.equal(r.handled,'media_partner_legacy_flow_retired');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM events WHERE event_id='mp-live-legacy-live-event'")).n),0);
  console.log('PASS stale coverage/live buttons are fail-closed and cannot mutate state');

  const policyAudits=await one("SELECT COUNT(*) n FROM permission_audit WHERE actor_id=? AND action IN ('MANAGE_POLICY','GRANT_SUPER_ADMIN')",String(MEDIA.id));
  assert.equal(Number(policyAudits.n),0);
  console.log('PASS no governance or policy authority is introduced');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
