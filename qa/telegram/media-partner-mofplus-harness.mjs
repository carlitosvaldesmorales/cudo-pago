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
  const method=target.split('/').at(-1),body=init.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

const OP={id:9951001,first_name:'Operador',last_name:'Sintetico'};
const MEDIA={id:9951002,first_name:'Chepica',last_name:'Play Sintetico'};
let updateId=951000;
function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function secret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const r=await worker.fetch(new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await secret()},body:JSON.stringify({update_id:++updateId,...update})}),env,{});assert.equal(r.status,200);return r.json();}
async function cb(actor,data,id=null){return dispatch({callback_query:{id:id||`cb-${updateId+1}`,from:actor,data,message:{message_id:1,chat:{id:actor.id,type:'private'}}}});}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
function last(id){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(id)).at(-1)?.body;}
function callbacks(b){return (b?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}
async function seed(a,role='REPORTER',trust='PROVISIONAL'){const n=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(a.id),`${a.first_name} ${a.last_name}`,null,role,trust,n,n).run();}

try{
  applyMigrations();
  await seed(OP,'PLATFORM_OPERATOR','VERIFIED');
  await seed(MEDIA);
  const match=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  assert.ok(match,'representative fixture with empty canonical TERCERA slot required');
  assert.notEqual(match.home_name,'Team A');
  assert.notEqual(match.away_name,'Team B');
  console.log(`FIXTURE: ${match.round_label} · ${match.home_name} — ${match.away_name}`);

  await msg(OP,'/medios');
  let r=await cb(OP,'mp:collab:invite');
  const token=last(OP.id).text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];
  assert.ok(token);
  r=await msg(MEDIA,`/start partner_${token}`);
  assert.equal(r.handled,'media_partner_collaboration_claimed');
  console.log('PASS golden path enrollment reaches persistent Chépica Play identity');

  r=await msg(MEDIA,'/partner');
  assert.equal(r.handled,'media_partner_home');
  const surface=last(MEDIA.id);
  assert.match(surface.text,/CONSUMIDOR DE RESULTADOS/i);
  assert.match(surface.text,/REGISTRADOR DE RESULTADOS/i);
  const buttons=callbacks(surface);
  assert.deepEqual(buttons.filter(x=>x!=='tp:home'),['tp:public-results','obs:dates']);
  console.log('PASS actor fidelity: current product surface contains only consume + register result');

  r=await cb(MEDIA,'tp:public-results');
  assert.equal(r.handled,'portal_public_results');
  console.log('PASS consumer golden path reads the canonical/public result projection');

  r=await cb(MEDIA,'obs:dates');
  assert.equal(r.handled,'observation_dates');
  await cb(MEDIA,`obs:date:${match.round_no}`);
  await cb(MEDIA,`obs:match:${match.match_id}`);
  await cb(MEDIA,`obs:series:${match.match_id}:TERCERA`);
  await cb(MEDIA,'obs:h:2');
  await cb(MEDIA,'obs:a:1');
  r=await cb(MEDIA,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  const obs=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',r.submission_id);
  assert.equal(obs.source_type,'MEDIA_PARTNER');
  assert.equal(obs.source_label,'Chépica Play');
  assert.equal(obs.home_score,2);
  assert.equal(obs.away_score,1);
  assert.equal(obs.status,'SUBMITTED');
  assert.equal(await one('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?',match.match_id,'TERCERA'),null);
  console.log('PASS registrar golden path stores 2–1 as Chépica Play observation and keeps canonical result empty');

  // Negative 1: repeat registration for the same identity/match/series is idempotent at pending-submission level.
  await cb(MEDIA,`obs:match:${match.match_id}`);
  r=await cb(MEDIA,`obs:series:${match.match_id}:TERCERA`);
  assert.equal(r.handled,'observation_duplicate_pending');
  assert.equal(Number((await one("SELECT COUNT(*) n FROM public_result_submissions WHERE submitter_id=? AND match_id=? AND series_code='TERCERA' AND status='SUBMITTED'",String(MEDIA.id),match.match_id)).n),1);
  console.log('PASS negative/idempotency: same pending result is not duplicated');

  // Negative 2: historical coverage/correspondent/live callbacks fail closed.
  const legacy=['mp:coverage','mp:mycoverages','mp:hub',`mp:coverage-open:${match.match_id}`,`mplive:event:${match.match_id}`];
  for(const action of legacy){
    r=await cb(MEDIA,action);
    assert.equal(r.handled,'media_partner_legacy_flow_retired');
  }
  assert.equal(Number((await one("SELECT COUNT(*) n FROM partner_match_coverages WHERE partner_code='CHEPICA_PLAY' AND status IN ('ASSIGNED','LIVE','CLOSED')")).n),0);
  assert.equal(Number((await one("SELECT COUNT(*) n FROM partner_coverage_assignments WHERE partner_code='CHEPICA_PLAY' AND status='ACTIVE'")).n),0);
  console.log('PASS negative/scope: retired coverage, correspondent and live-event flows cannot reactivate');

  // Negative 3: no hidden capability expansion in the active grant.
  const grant=await one("SELECT * FROM actor_scope_grants WHERE telegram_user_id=? AND role='MEDIA_PARTNER' AND active=1",String(MEDIA.id));
  const caps=JSON.parse(grant.capabilities_json);
  assert.deepEqual(caps,['READ_COMPETITION','OBSERVE_RESULT']);
  assert.equal(caps.includes('PUBLISH_MATCH_EVENT'),false);
  assert.equal(caps.includes('GOVERN_RESULTS'),false);
  assert.equal(caps.includes('MANAGE_POLICY'),false);
  console.log('PASS negative/authority: no live-event, governance or policy capability leaks into Chépica Play');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
