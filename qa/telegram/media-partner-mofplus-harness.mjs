import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-mofplus-token',TELEGRAM_WEBHOOK_SECRET:'qa-mofplus-secret'};
const outbound=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-mofplus-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length,username:'FutbolChepicaBot',type:'commands',name:'Fútbol Chépica'}}),{status:200,headers:{'content-type':'application/json'}});
};

const OP={id:9951001,first_name:'Operador',last_name:'Sintetico'};
const MEDIA={id:9951002,first_name:'Chepica',last_name:'Play QA'};
const OUTSIDER={id:9951003,first_name:'Usuario',last_name:'Fuera Scope'};
let updateId=951000;

function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function cb(actor,data,id=null){return dispatch({callback_query:{id:id||`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
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
  await seedReporter(OUTSIDER,'REPORTER',null,'PROVISIONAL');

  let assigned=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND (m.home_id='UNION-ORILLA' OR m.away_id='UNION-ORILLA') AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  if(!assigned) assigned=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  const outside=(await all(`SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND match_id<>? ORDER BY round_no,match_id LIMIT 1`,assigned?.match_id))[0];
  assert.ok(assigned&&outside,'representative fixture pair required');
  assert.notEqual(assigned.home_name,'Team A');
  assert.notEqual(assigned.away_name,'Team B');
  console.log(`FIXTURE: ${assigned.round_label} · ${assigned.home_name} — ${assigned.away_name}`);

  // GOLDEN PATH: persistent enrollment -> operational coverage -> LIVE -> event -> score observation -> close.
  let r=await msg(OP,'/medios');
  assert.equal(r.handled,'media_partner_management');
  assert.match(last(OP.id).text,/colaborador permanente/i);
  assert.ok(callbacks(last(OP.id)).includes('mp:collab:invite'));

  r=await cb(OP,'mp:collab:invite');
  assert.equal(r.handled,'media_partner_collaboration_invite_created');
  const token=last(OP.id).text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];
  assert.ok(token);
  r=await msg(MEDIA,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_collaboration_claimed');
  assert.match(last(MEDIA.id).text,/campeonato, no a un partido/i);

  r=await cb(OP,'mp:coverage:add');
  assert.equal(r.handled,'media_partner_coverage_dates');
  assert.ok(callbacks(last(OP.id)).some(x=>x===`mp:coverage:date:${assigned.round_no}`));
  r=await cb(OP,`mp:coverage:date:${assigned.round_no}`);
  assert.equal(r.handled,'media_partner_coverage_matches');
  assert.ok(callbacks(last(OP.id)).includes(`mp:coverage:make:${assigned.match_id}`));
  r=await cb(OP,`mp:coverage:make:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_coverage_assigned');

  r=await msg(MEDIA,'/partner');
  assert.equal(r.handled,'media_partner_home');
  assert.match(last(MEDIA.id).text,/CONSUM/i);
  assert.ok(callbacks(last(MEDIA.id)).includes('mp:mycoverages'));
  await cb(MEDIA,'mp:mycoverages');
  r=await cb(MEDIA,`mp:coverage-open:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_live_workspace');
  assert.ok(callbacks(last(MEDIA.id)).includes(`mp:coverage-live:${assigned.match_id}`));

  r=await cb(MEDIA,`mp:coverage-live:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_live_started');
  assert.equal((await one("SELECT status FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id)).status,'LIVE');
  assert.ok(callbacks(last(MEDIA.id)).includes(`mplive:event:${assigned.match_id}`));
  assert.match(last(MEDIA.id).text,/CONSUME:/);
  assert.match(last(MEDIA.id).text,/CONTRIBUYE:/);
  console.log('PASS golden path reaches high-fidelity LIVE workspace with consumer + contributor contract');

  r=await cb(MEDIA,`mplive:event:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_live_series');
  assert.ok(callbacks(last(MEDIA.id)).includes(`mplive:series:${assigned.match_id}:TERCERA`));
  r=await cb(MEDIA,`mplive:series:${assigned.match_id}:TERCERA`);
  assert.equal(r.handled,'media_partner_live_event_types');
  assert.ok(callbacks(last(MEDIA.id)).includes(`mplive:evt:${assigned.match_id}:TERCERA:GOAL:HOME`));

  const duplicateId='synthetic-same-callback-001';
  r=await cb(MEDIA,`mplive:evt:${assigned.match_id}:TERCERA:GOAL:HOME`,duplicateId);
  assert.equal(r.handled,'media_partner_live_event_recorded');
  const stored=await one("SELECT * FROM events WHERE event_id=?",`mp-live-${duplicateId}`);
  assert.ok(stored);
  const payload=JSON.parse(stored.payload_json);
  assert.equal(payload.source_type,'MEDIA_PARTNER');
  assert.equal(payload.source_label,'Chépica Play · transmisión');
  assert.equal(payload.series_code,'TERCERA');
  assert.equal(payload.event_kind,'GOAL');
  assert.equal(payload.canonical,false);
  assert.equal(stored.validation_status,'PROVISIONAL');
  console.log('PASS live event is stored as traced Chépica Play observation, not canonical truth');

  // NEGATIVE 1: duplicate delivery is idempotent.
  const beforeDup=Number((await one("SELECT COUNT(*) n FROM events WHERE event_id=?",`mp-live-${duplicateId}`)).n);
  r=await cb(MEDIA,`mplive:evt:${assigned.match_id}:TERCERA:GOAL:HOME`,duplicateId);
  assert.equal(r.handled,'media_partner_live_event_duplicate');
  const afterDup=Number((await one("SELECT COUNT(*) n FROM events WHERE event_id=?",`mp-live-${duplicateId}`)).n);
  assert.equal(beforeDup,1);
  assert.equal(afterDup,1);
  console.log('PASS negative/idempotency: duplicate callback creates exactly one event');

  // Complete result observation through the same Telegram surface.
  await cb(MEDIA,`obs:match:${assigned.match_id}`);
  await cb(MEDIA,`obs:series:${assigned.match_id}:TERCERA`);
  await cb(MEDIA,'obs:h:2');
  await cb(MEDIA,'obs:a:1');
  r=await cb(MEDIA,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  const observation=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id);
  assert.equal(observation.source_type,'MEDIA_PARTNER');
  assert.equal(observation.source_label,'Chépica Play · transmisión');
  assert.equal(observation.status,'SUBMITTED');
  assert.equal(await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',assigned.match_id,'TERCERA'),null);
  console.log('PASS golden path records score observation without canonical overwrite');

  // NEGATIVE 2: same partner identity outside assigned coverage cannot publish a live event.
  r=await cb(MEDIA,`mplive:event:${outside.match_id}`);
  assert.equal(r.handled,'media_partner_live_stale_callback');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM events WHERE event_type='match.event.observed' AND match_id=?",outside.match_id)).n),0);
  console.log('PASS negative/scope: partner cannot publish live events outside active coverage');

  r=await cb(MEDIA,`mp:coverage-close:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_live_closed');
  assert.equal((await one("SELECT status FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id)).status,'CLOSED');

  // NEGATIVE 3: stale callback after close is rejected and final state is unchanged.
  const eventCount=Number((await one("SELECT COUNT(*) n FROM events WHERE event_type='match.event.observed' AND match_id=?",assigned.match_id)).n);
  r=await cb(MEDIA,`mplive:evt:${assigned.match_id}:TERCERA:YELLOW:HOME`,'stale-after-close-001');
  assert.equal(r.handled,'media_partner_live_stale_callback');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM events WHERE event_type='match.event.observed' AND match_id=?",assigned.match_id)).n),eventCount);
  assert.equal((await one("SELECT status FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND match_id=?",assigned.match_id)).status,'CLOSED');
  console.log('PASS negative/stale: old callback cannot mutate a closed coverage');

  // Explicit outsider authorization check.
  r=await cb(OUTSIDER,`mplive:event:${assigned.match_id}`);
  assert.equal(r.handled,'media_partner_live_denied');
  console.log('PASS authorization: non-partner synthetic actor is rejected');

  const member=await one("SELECT * FROM actor_scope_grants WHERE telegram_user_id=? AND role='MEDIA_PARTNER' AND active=1",String(MEDIA.id));
  assert.ok(member);
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(MEDIA.id))).role,'REPORTER');
  console.log('PASS final state: permanent membership survives coverage close and base role remains REPORTER');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
