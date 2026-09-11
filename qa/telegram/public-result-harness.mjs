import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'sports-bus', 'migrations');

const QA = {
  SUPER: {id:'9910001',first_name:'QA',last_name:'Global',username:'qa_g2_global'},
  HOME_ADMIN: {id:'9910002',first_name:'QA',last_name:'Local',username:'qa_g2_home'},
  AWAY_ADMIN: {id:'9910003',first_name:'QA',last_name:'Visita',username:'qa_g2_away'},
  OUTSIDER_ADMIN: {id:'9910004',first_name:'QA',last_name:'Fuera',username:'qa_g2_outside'},
  PUBLIC1: {id:'9910010',first_name:'QA',last_name:'Publico Uno',username:'qa_public_1'},
  PUBLIC2: {id:'9910011',first_name:'QA',last_name:'Publico Dos',username:'qa_public_2'},
  PUBLIC3: {id:'9910012',first_name:'QA',last_name:'Publico Tres',username:'qa_public_3'}
};

const env = {
  DB: new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-g2-token-never-sent',
  TELEGRAM_WEBHOOK_SECRET:'qa-g2-webhook-secret'
};

const outbound=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-g2-token-never-sent/')) throw new Error(`G2 QA blocked unexpected network call: ${target}`);
  const method=target.split('/').pop();
  const body=init?.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  const files=fs.readdirSync(migrationsDir).filter(x=>x.endsWith('.sql')).sort();
  assert.ok(files.some(x=>x==='0008_public_result_submissions.sql'));
  for(const f of files) env.DB.exec(fs.readFileSync(path.join(migrationsDir,f),'utf8'));
}
async function sha256Hex(v){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
let updateId=810000;
async function dispatch(update){
  const safe=await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET);
  const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':safe},body:JSON.stringify({update_id:++updateId,...update})});
  const res=await worker.fetch(req,env,{});
  assert.equal(res.status,200);
  return res.json();
}
async function message(actor,text){return dispatch({message:{message_id:updateId,from:actor,chat:{id:Number(actor.id),type:'private'},text}});}
async function callback(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:updateId,chat:{id:Number(actor.id),type:'private'}}}});}
function sent(chatId=null){return outbound.filter(x=>x.method==='sendMessage'&&(chatId===null||String(x.body.chat_id)===String(chatId)));}
function last(chatId){const a=sent(chatId);assert.ok(a.length);return a.at(-1).body;}
function reset(){outbound.length=0;}
function buttons(m){return (m.reply_markup?.inline_keyboard||[]).flat();}
function callbacks(m){return buttons(m).map(x=>x.callback_data).filter(Boolean);}
async function one(sql,...p){return env.DB.prepare(sql).bind(...p).first();}
async function all(sql,...p){return (await env.DB.prepare(sql).bind(...p).all()).results;}

async function seedReporter(actor,role,clubId=null,trust='VERIFIED',active=1){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(actor.id,`${actor.first_name} ${actor.last_name||''}`.trim(),actor.username||null,clubId,role,trust,active,now,now).run();
}

async function apiSeries(){
  const res=await worker.fetch(new Request('https://qa.invalid/api/v1/series-results'),env,{});
  assert.equal(res.status,200);
  return res.json();
}
function apiHasSeries(api,matchId,seriesCode){
  const m=(api.results||[]).find(x=>x.match_id===matchId);
  return !!m?.series?.some(x=>x.series===seriesCode);
}

async function submit(actor,match,seriesCode,score){
  reset();
  let r=await callback(actor,'tp:public');
  assert.equal(r.handled,'public_result_public_home');
  assert.ok(callbacks(last(actor.id)).includes('tp:public-report'));
  r=await callback(actor,'tp:public-report');
  assert.equal(r.handled,'public_result_dates');
  r=await callback(actor,`pr:date:${match.round_no}`);
  assert.equal(r.handled,'public_result_round');
  r=await callback(actor,`pr:match:${match.match_id}`);
  assert.equal(r.handled,'public_result_series_menu');
  r=await callback(actor,`pr:series:${match.match_id}:${seriesCode}`);
  assert.equal(r.handled,'public_result_wait_score');
  r=await message(actor,score);
  assert.equal(r.handled,'public_result_submitted');
  return r.submission_id;
}

async function run(){
  console.log('PUBLIC-RESULT-SUBMISSION-01 QA');
  console.log('Mode: simulated Telegram + real Worker routing + ephemeral SQLite D1');
  applyMigrations();

  const teams=await all('SELECT team_id,canonical_name FROM teams ORDER BY team_id');
  assert.ok(teams.length>=11);
  const candidates=await all(`SELECT m.* FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' AND NOT EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=m.match_id AND r.series_code='TERCERA') ORDER BY m.round_no,m.match_id`);
  assert.ok(candidates.length>=2,'Need at least two unregistered series for G2 QA');
  const match1=candidates[0];
  const match2=candidates.find(x=>x.match_id!==match1.match_id) || candidates[1];
  const outsiderTeam=teams.find(t=>t.team_id!==match1.home_id&&t.team_id!==match1.away_id&&t.team_id!==match2.home_id&&t.team_id!==match2.away_id) || teams.find(t=>t.team_id!==match1.home_id&&t.team_id!==match1.away_id);
  assert.ok(outsiderTeam);

  await seedReporter(QA.SUPER,'SUPER_ADMIN','UNION-ORILLA');
  await seedReporter(QA.HOME_ADMIN,'CLUB_ADMIN',match1.home_id);
  await seedReporter(QA.AWAY_ADMIN,'CLUB_ADMIN',match1.away_id);
  await seedReporter(QA.OUTSIDER_ADMIN,'CLUB_ADMIN',outsiderTeam.team_id);
  console.log(`PASS fixture + reviewers: ${match1.home_id} / ${match1.away_id} / outsider ${outsiderTeam.team_id}`);

  reset();
  let r=await callback(QA.PUBLIC1,'tp:public');
  assert.equal(r.handled,'public_result_public_home');
  let m=last(QA.PUBLIC1.id);
  assert.ok(callbacks(m).includes('tp:public-report'));
  assert.ok(callbacks(m).includes('pr:my'));
  console.log('PASS public menu exposes contribution flow');

  const beforeApi=await apiSeries();
  assert.equal(apiHasSeries(beforeApi,match1.match_id,'TERCERA'),false);

  const s1=await submit(QA.PUBLIC1,match1,'TERCERA','2-1');
  let sub1=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s1);
  assert.equal(sub1.status,'SUBMITTED');
  assert.equal(Number(sub1.home_score),2);
  assert.equal(Number(sub1.away_score),1);
  assert.equal(await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',match1.match_id,'TERCERA'),null,'SUBMITTED must not enter public SSOT');
  const afterSubmitApi=await apiSeries();
  assert.equal(apiHasSeries(afterSubmitApi,match1.match_id,'TERCERA'),false,'SUBMITTED must not appear in public API');
  assert.ok(sent(QA.SUPER.id).some(x=>/NUEVO RESULTADO PARA REVISAR/.test(x.body.text)));
  assert.ok(sent(QA.HOME_ADMIN.id).some(x=>/NUEVO RESULTADO PARA REVISAR/.test(x.body.text)));
  assert.ok(sent(QA.AWAY_ADMIN.id).some(x=>/NUEVO RESULTADO PARA REVISAR/.test(x.body.text)));
  assert.equal(sent(QA.OUTSIDER_ADMIN.id).some(x=>/NUEVO RESULTADO PARA REVISAR/.test(x.body.text)),false);
  console.log('PASS SUBMITTED isolation + reviewer notifications');

  reset();
  r=await callback(QA.PUBLIC1,`pr:series:${match1.match_id}:TERCERA`);
  assert.equal(r.handled,'public_result_duplicate_pending');
  const countOwn=await one("SELECT COUNT(*) AS n FROM public_result_submissions WHERE submitter_id=? AND match_id=? AND series_code='TERCERA' AND status='SUBMITTED'",QA.PUBLIC1.id,match1.match_id);
  assert.equal(Number(countOwn.n),1);
  console.log('PASS submitter idempotence');

  const s2=await submit(QA.PUBLIC2,match1,'TERCERA','2-1');
  assert.equal((await one('SELECT status FROM public_result_submissions WHERE submission_id=?',s2)).status,'SUBMITTED');
  console.log('PASS independent public corroboration allowed');

  reset();
  r=await callback(QA.OUTSIDER_ADMIN,`pr:review:${s1}`);
  assert.equal(r.handled,'public_result_review_denied');
  assert.equal((await one('SELECT status FROM public_result_submissions WHERE submission_id=?',s1)).status,'SUBMITTED');
  const deniedAudit=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='REVIEW_PUBLIC_RESULT' AND resource_id=? AND allowed=0",s1);
  assert.equal(Number(deniedAudit.n),1);
  console.log('PASS non-participating club cannot review');

  reset();
  r=await callback(QA.HOME_ADMIN,'tp:leaders');
  assert.equal(r.handled,'public_result_admin_dashboard');
  assert.ok(callbacks(last(QA.HOME_ADMIN.id)).includes('pr:pending'));
  r=await callback(QA.HOME_ADMIN,'pr:pending');
  assert.equal(r.handled,'public_result_pending_queue');
  assert.ok(callbacks(last(QA.HOME_ADMIN.id)).includes(`pr:review:${s1}`));
  r=await callback(QA.HOME_ADMIN,`pr:review:${s1}`);
  assert.equal(r.handled,'public_result_review');
  assert.ok(callbacks(last(QA.HOME_ADMIN.id)).includes(`pr:approve:${s1}`));
  console.log('PASS participating CLUB_ADMIN sees scoped review queue');

  reset();
  r=await callback(QA.HOME_ADMIN,`pr:approve:${s1}`);
  assert.equal(r.handled,'public_result_approved');
  sub1=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s1);
  assert.equal(sub1.status,'APPROVED');
  assert.equal(sub1.reviewed_by,QA.HOME_ADMIN.id);
  const official=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',match1.match_id,'TERCERA');
  assert.equal(official.validation_status,'VERIFIED');
  assert.equal(official.source_type,'TELEGRAM_PUBLIC_APPROVED');
  assert.equal(official.source_ref,s1);
  assert.equal(Number(official.home_score),2);
  assert.equal(Number(official.away_score),1);
  const superseded=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s2);
  assert.equal(superseded.status,'SUPERSEDED');
  const approvalAudit=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='APPROVE_PUBLIC_RESULT' AND resource_id=? AND allowed=1",s1);
  assert.equal(Number(approvalAudit.n),1);
  const afterApproveApi=await apiSeries();
  assert.equal(apiHasSeries(afterApproveApi,match1.match_id,'TERCERA'),true);
  assert.ok(sent(QA.PUBLIC1.id).some(x=>/aporte fue aprobado/.test(x.body.text)));
  assert.ok(sent(QA.PUBLIC2.id).some(x=>/SUPERADO/.test(x.body.text)));
  console.log('PASS authorized approval -> VERIFIED -> public API + supersede peers');

  reset();
  r=await callback(QA.HOME_ADMIN,`pr:approve:${s1}`);
  assert.equal(r.handled,'public_result_already_processed');
  const approvalAuditRetry=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='APPROVE_PUBLIC_RESULT' AND resource_id=? AND allowed=1",s1);
  assert.equal(Number(approvalAuditRetry.n),1);
  console.log('PASS approval idempotence');

  reset();
  r=await callback(QA.PUBLIC3,`pr:series:${match1.match_id}:TERCERA`);
  assert.ok(['public_result_existing_result','public_result_already_verified'].includes(r.handled));
  assert.equal(await one("SELECT COUNT(*) AS n FROM public_result_submissions WHERE submitter_id=? AND match_id=? AND series_code='TERCERA' AND status='SUBMITTED'",QA.PUBLIC3.id,match1.match_id).then(x=>Number(x.n)),0);
  console.log('PASS public flow cannot overwrite an official result');

  // Seed the participating admins for match2 if its clubs differ from match1.
  await seedReporter(QA.HOME_ADMIN,'CLUB_ADMIN',match2.home_id);
  await seedReporter(QA.AWAY_ADMIN,'CLUB_ADMIN',match2.away_id);
  const s3=await submit(QA.PUBLIC3,match2,'TERCERA','0-0');
  const pendingBeforeReject=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s3);
  assert.equal(pendingBeforeReject.status,'SUBMITTED');

  reset();
  r=await callback(QA.AWAY_ADMIN,`pr:reject:${s3}`);
  assert.equal(r.handled,'public_result_rejected');
  const rejected=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s3);
  assert.equal(rejected.status,'REJECTED');
  assert.equal(rejected.reviewed_by,QA.AWAY_ADMIN.id);
  assert.equal(await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',match2.match_id,'TERCERA'),null);
  const rejectAudit=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='REJECT_PUBLIC_RESULT' AND resource_id=? AND allowed=1",s3);
  assert.equal(Number(rejectAudit.n),1);
  console.log('PASS participating away CLUB_ADMIN can reject without touching public SSOT');

  reset();
  r=await callback(QA.SUPER,'tp:leaders');
  assert.equal(r.handled,'public_result_admin_dashboard');
  assert.ok(callbacks(last(QA.SUPER.id)).includes('pr:pending'));
  console.log('PASS SUPER_ADMIN dashboard includes global pending queue');

  reset();
  r=await callback(QA.HOME_ADMIN,'tp:public-report');
  assert.equal(r.handled,'public_result_dates');
  assert.equal(r.observation_contract,'contributor-observation-plane-v1');
  assert.ok(callbacks(last(QA.HOME_ADMIN.id)).some(x=>x.startsWith('obs:date:')));
  const preservedRole=await one('SELECT role,club_id,trust_level,active FROM reporters WHERE telegram_user_id=?',QA.HOME_ADMIN.id);
  assert.equal(preservedRole.role,'CLUB_ADMIN');
  assert.equal(preservedRole.club_id,match2.home_id);
  assert.equal(preservedRole.trust_level,'VERIFIED');
  assert.equal(Number(preservedRole.active),1);
  console.log('PASS verified admins may also contribute observations without changing role authority');

  const tables=await all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('public_result_submissions','telegram_public_result_sessions') ORDER BY name");
  assert.equal(tables.length,2);
  console.log('RESULT: PASS');
  console.log('Human-only residual gate: real Telegram rendering/delivery for public submitter + participating CLUB_ADMIN approval/rejection.');
}

try{await run();}finally{globalThis.fetch=originalFetch;}