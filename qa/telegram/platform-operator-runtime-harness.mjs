import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { CAPABILITY, hasCapability } from '../../sports-bus/worker/access-control.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-operator-token',TELEGRAM_WEBHOOK_SECRET:'qa-operator-secret'};
const outbound=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-operator-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

const OP={id:9930001,first_name:'Operador',last_name:'Campeonato'};
const PUBLIC={id:9930002,first_name:'Dirigente',last_name:'Solicitante'};
const INFORMANT={id:9930003,first_name:'Informador',last_name:'QA'};
let updateId=930000;

function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
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
async function seedReporter(actor,role,clubId=null,trust='VERIFIED'){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,clubId,role,trust,now,now).run();
}

try{
  applyMigrations();
  await seedReporter(OP,'PLATFORM_OPERATOR',null,'VERIFIED');
  const operator=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(OP.id));
  assert.equal(operator.club_id,null);
  assert.equal(hasCapability(operator,CAPABILITY.GOVERN_RESULTS),true);
  assert.equal(hasCapability(operator,CAPABILITY.MANAGE_ACCESS),true);
  assert.equal(hasCapability(operator,CAPABILITY.MANAGE_POLICY),false);
  assert.equal(hasCapability(operator,CAPABILITY.GRANT_SUPER_ADMIN),false);

  let r=await msg(OP,'/dirigentes');
  assert.equal(r.handled,'platform_operator_dashboard');
  assert.match(last(OP.id).text,/ADMINISTRADOR DEL CAMPEONATO/);
  assert.ok(callbacks(last(OP.id)).includes('po:results'));
  assert.ok(callbacks(last(OP.id)).includes('po:requests'));
  console.log('PASS PLATFORM_OPERATOR receives platform operational dashboard with policy boundary');

  const missing=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results x WHERE x.match_id=m.match_id AND x.series_code='TERCERA') ORDER BY m.round_no,m.match_id LIMIT 1`))[0];
  assert.ok(missing);
  r=await cb(OP,'tp:mymatches');
  assert.equal(r.handled,'platform_operator_result_dates');
  r=await cb(OP,`po:date:${missing.round_no}`);
  assert.equal(r.handled,'platform_operator_result_round');
  r=await cb(OP,`po:match:${missing.match_id}`);
  assert.equal(r.handled,'platform_operator_match');
  assert.ok(callbacks(last(OP.id)).includes(`po:series:${missing.match_id}:TERCERA`));
  r=await cb(OP,`po:series:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_register_home_score');
  assert.match(last(OP.id).text,/GOLES LOCAL/);
  r=await cb(OP,'po:score:h:2');
  assert.equal(r.handled,'platform_operator_away_score');
  r=await cb(OP,'po:score:a:1');
  assert.equal(r.handled,'platform_operator_result_confirm');
  assert.match(last(OP.id).text,/CONFIRMAR/);
  r=await cb(OP,'po:session:confirm');
  assert.equal(r.handled,'platform_operator_result_registered');
  let official=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA');
  assert.equal(official.validation_status,'VERIFIED');
  assert.equal(official.source_type,'TELEGRAM_PLATFORM_OPERATOR');
  assert.equal(Number(official.home_score),2);
  assert.equal(Number(official.away_score),1);
  let baseline=await one("SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=? AND version_no=1",missing.match_id,'TERCERA');
  assert.equal(baseline.actor_role,'PLATFORM_OPERATOR');
  console.log('PASS PLATFORM_OPERATOR registers first official result globally with role-accurate audit provenance');

  r=await cb(OP,`po:correct:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_correct_home_score');
  r=await cb(OP,'po:score:h:3');
  r=await cb(OP,'po:score:a:1');
  assert.equal(r.handled,'platform_operator_correction_reason');
  assert.ok(callbacks(last(OP.id)).includes('po:reason:EVIDENCE'));
  r=await cb(OP,'po:reason:EVIDENCE');
  assert.equal(r.handled,'platform_operator_correction_confirm');
  r=await cb(OP,'po:session:confirm');
  assert.equal(r.handled,'platform_operator_result_corrected');
  official=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA');
  assert.equal(Number(official.home_score),3);
  assert.equal(Number(official.governance_version),2);
  const correction=await one('SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=? AND version_no=2',missing.match_id,'TERCERA');
  assert.equal(correction.actor_role,'PLATFORM_OPERATOR');
  assert.equal(correction.action,'CORRECT');
  assert.equal(correction.reason,'Acta o evidencia oficial');
  console.log('PASS PLATFORM_OPERATOR correction is button-first, versioned and auditable');

  r=await cb(OP,`po:ask:DISPUTE:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_transition_confirmation');
  r=await cb(OP,`po:do:DISPUTE:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_transition_applied');
  assert.equal((await one('SELECT validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA')).validation_status,'DISPUTED');
  r=await cb(OP,`po:do:CONFIRM:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_transition_applied');
  assert.equal((await one('SELECT validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA')).validation_status,'VERIFIED');
  r=await cb(OP,`po:do:ANNUL:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_transition_applied');
  assert.equal((await one('SELECT validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA')).validation_status,'ANNULLED');
  r=await cb(OP,`po:do:RESTORE:${missing.match_id}:TERCERA`);
  assert.equal(r.handled,'platform_operator_transition_applied');
  assert.equal((await one('SELECT validation_status FROM match_series_results WHERE match_id=? AND series_code=?',missing.match_id,'TERCERA')).validation_status,'VERIFIED');
  console.log('PASS PLATFORM_OPERATOR governs dispute, resolve, annul and restore transitions');

  const otherMissing=(await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND m.match_id<>? AND NOT EXISTS (SELECT 1 FROM match_series_results x WHERE x.match_id=m.match_id AND x.series_code='SEGUNDA') ORDER BY m.round_no,m.match_id LIMIT 1`,missing.match_id))[0];
  assert.ok(otherMissing);
  r=await cb(INFORMANT,'obs:dates');
  assert.equal(r.handled,'observation_dates');
  await cb(INFORMANT,`obs:date:${otherMissing.round_no}`);
  await cb(INFORMANT,`obs:match:${otherMissing.match_id}`);
  await cb(INFORMANT,`obs:series:${otherMissing.match_id}:SEGUNDA`);
  await cb(INFORMANT,'obs:h:1');
  await cb(INFORMANT,'obs:a:0');
  r=await cb(INFORMANT,'obs:confirm');
  assert.equal(r.handled,'observation_submitted');
  const submission=r.submission_id;
  r=await cb(OP,`pr:review:${submission}`);
  assert.equal(r.handled,'platform_operator_observation_review');
  r=await cb(OP,`pr:approve:${submission}`);
  assert.equal(r.handled,'platform_operator_observation_approved');
  assert.equal((await one('SELECT status FROM public_result_submissions WHERE submission_id=?',submission)).status,'APPROVED');
  assert.equal((await one('SELECT validation_status FROM match_series_results WHERE match_id=? AND series_code=?',otherMissing.match_id,'SEGUNDA')).validation_status,'VERIFIED');
  console.log('PASS PLATFORM_OPERATOR reconciles a public observation into first canonical result without self-approval');

  await seedReporter(PUBLIC,'REPORTER',null,'PROVISIONAL');
  const team=(await all('SELECT team_id FROM teams ORDER BY team_id LIMIT 1'))[0];
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO access_requests (request_id,telegram_user_id,display_name,username,requested_club_id,requested_role,status,created_at) VALUES ('ar-qa-operator',?,?,?,?,?,'PENDING',?)`).bind(String(PUBLIC.id),'Dirigente Solicitante',null,team.team_id,'CLUB_ADMIN',now).run();
  r=await cb(OP,'tp:requests');
  assert.equal(r.handled,'platform_operator_access_requests');
  r=await cb(OP,'tp:approve:ar-qa-operator');
  assert.equal(r.handled,'platform_operator_access_approved');
  const promoted=await one('SELECT role,club_id,trust_level,active FROM reporters WHERE telegram_user_id=?',String(PUBLIC.id));
  assert.equal(promoted.role,'CLUB_ADMIN');
  assert.equal(promoted.club_id,team.team_id);
  assert.equal(promoted.trust_level,'VERIFIED');
  assert.equal(Number(promoted.active),1);
  console.log('PASS PLATFORM_OPERATOR approves CLUB_ADMIN enrollment as an operational access task');

  r=await cb(OP,`tp:admin-suspend:${PUBLIC.id}`);
  assert.equal(r.handled,'platform_operator_admin_suspend');
  assert.equal(Number((await one('SELECT active FROM reporters WHERE telegram_user_id=?',String(PUBLIC.id))).active),0);
  r=await cb(OP,`tp:admin-reactivate:${PUBLIC.id}`);
  assert.equal(r.handled,'platform_operator_admin_reactivate');
  assert.equal(Number((await one('SELECT active FROM reporters WHERE telegram_user_id=?',String(PUBLIC.id))).active),1);
  r=await cb(OP,`tp:admin-revoke:${PUBLIC.id}`);
  assert.equal(r.handled,'platform_operator_admin_revoke');
  assert.equal((await one('SELECT role FROM reporters WHERE telegram_user_id=?',String(PUBLIC.id))).role,'REPORTER');
  console.log('PASS PLATFORM_OPERATOR manages CLUB_ADMIN lifecycle without touching privileged roles');

  const finalOperator=await one('SELECT role,club_id,trust_level,active FROM reporters WHERE telegram_user_id=?',String(OP.id));
  assert.equal(finalOperator.role,'PLATFORM_OPERATOR');
  assert.equal(finalOperator.club_id,null);
  assert.equal(finalOperator.trust_level,'VERIFIED');
  assert.equal(Number(finalOperator.active),1);
  const superCount=await one("SELECT COUNT(*) AS n FROM reporters WHERE role='SUPER_ADMIN'");
  assert.equal(Number(superCount.n),0,'operator QA must not create or grant SUPER_ADMIN');
  const policyAudit=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE actor_id=? AND action IN ('MANAGE_POLICY','GRANT_SUPER_ADMIN')",String(OP.id));
  assert.equal(Number(policyAudit.n),0);
  console.log('PASS Separation of Duties: operator remains club_id NULL and cannot create SUPER_ADMIN or policy mutations');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
