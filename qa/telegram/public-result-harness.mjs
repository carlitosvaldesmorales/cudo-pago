import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const db=new D1SqliteAdapter();
const env={DB:db,TELEGRAM_BOT_TOKEN:'qa-public-token',TELEGRAM_BOT_TOKEN_NEXT:'qa-public-next-token',TELEGRAM_WEBHOOK_SECRET:'qa-public-secret'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method:target.split('/').at(-1),body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(migrations,file),'utf8'))}
async function safeSecret(source){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
let updateId=52000;
async function dispatch(update){
  const secret=await safeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const response=await worker.fetch(new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:++updateId,...update})}),env,{});
  assert.equal(response.status,200);
  return response.json();
}
async function message(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:Number(actor.id),type:'private'},text}})}
async function callback(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:updateId+1,chat:{id:Number(actor.id),type:'private'}}}})}
function reset(){calls.length=0}
function sent(chatId){return calls.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId))}
function last(chatId){const rows=sent(chatId);assert.ok(rows.length,`expected message to ${chatId}`);return rows.at(-1).body}
function callbacks(body){return (body.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean)}
const QA={
  PUBLIC:{id:'520001',first_name:'Publico',last_name:'Uno',username:'publico_uno'},
  PUBLIC2:{id:'520002',first_name:'Publico',last_name:'Dos',username:'publico_dos'},
  PUBLIC3:{id:'520003',first_name:'Publico',last_name:'Tres',username:'publico_tres'},
  HOME_ADMIN:{id:'520101',first_name:'Admin',last_name:'Local',username:'admin_local'},
  AWAY_ADMIN:{id:'520102',first_name:'Admin',last_name:'Visita',username:'admin_visita'},
  OUTSIDER:{id:'520103',first_name:'Admin',last_name:'Tercero',username:'admin_tercero'},
  SUPER:{id:'520199',first_name:'Admin',last_name:'Global',username:'admin_global'}
};
async function one(sql,...args){return db.prepare(sql).bind(...args).first()}
async function all(sql,...args){return (await db.prepare(sql).bind(...args).all()).results||[]}
async function seedReporter(actor,role,clubId){
  const now='2026-09-10T12:00:00Z';
  await db.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,'VERIFIED',1,?,?)`)
    .bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,actor.username,clubId||null,role,now,now).run();
}
async function submit(actor,match,series,score){
  await callback(actor,'tp:public');
  await callback(actor,'tp:public-report');
  await callback(actor,`pr:date:${match.round_no}`);
  await callback(actor,`pr:match:${match.match_id}`);
  const r=await callback(actor,`pr:series:${match.match_id}:${series}`);
  assert.equal(r.handled,'public_result_wait_score');
  const final=await message(actor,score);
  assert.equal(final.handled,'public_result_submitted');
  return final.submission_id;
}

async function run(){
  applyMigrations();
  const matches=await all("SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' ORDER BY round_no,match_id");
  const match1=matches.find(async()=>true)||matches[0];
  assert.ok(match1,'fixture match required');
  let match2=matches.find(m=>m.match_id!==match1.match_id&&m.home_id!==match1.home_id&&m.away_id!==match1.away_id) || matches.find(m=>m.match_id!==match1.match_id);
  assert.ok(match2,'second fixture match required');

  // Find an actually empty series on the first fixture so this harness never overwrites seed truth.
  let targetMatch=null,targetSeries=null;
  outer: for(const m of matches){
    for(const s of ['TERCERA','SEGUNDA','SENIOR','PRIMERA']){
      if(!await one('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?',m.match_id,s)){
        targetMatch=m;targetSeries=s;break outer;
      }
    }
  }
  assert.ok(targetMatch&&targetSeries,'an empty series is required for public submission QA');
  match2=targetMatch;

  await seedReporter(QA.HOME_ADMIN,'CLUB_ADMIN',match1.home_id);
  await seedReporter(QA.AWAY_ADMIN,'CLUB_ADMIN',match1.away_id);
  const outsiderClub=(await all('SELECT team_id FROM teams WHERE team_id NOT IN (?,?) ORDER BY team_id LIMIT 1',match1.home_id,match1.away_id))[0]?.team_id;
  assert.ok(outsiderClub);
  await seedReporter(QA.OUTSIDER,'CLUB_ADMIN',outsiderClub);
  await seedReporter(QA.SUPER,'SUPER_ADMIN',null);
  console.log(`PASS fixture + reviewers: ${match1.home_id} / ${match1.away_id} / outsider ${outsiderClub}`);

  reset();
  let r=await callback(QA.PUBLIC,'tp:public');
  assert.equal(r.handled,'public_result_public_home');
  assert.ok(callbacks(last(QA.PUBLIC.id)).includes('tp:public-report'));
  console.log('PASS public menu exposes contribution flow');

  reset();
  const s1=await submit(QA.PUBLIC,match2,targetSeries,'2-1');
  const pending=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s1);
  assert.equal(pending.status,'SUBMITTED');
  assert.equal(await one('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?',match2.match_id,targetSeries),null);
  assert.ok(sent(QA.SUPER.id).some(x=>/NUEVO RESULTADO PARA REVISAR/.test(x.body.text)));
  console.log('PASS SUBMITTED isolation + reviewer notifications');

  reset();
  await callback(QA.PUBLIC,`pr:series:${match2.match_id}:${targetSeries}`);
  assert.match(last(QA.PUBLIC.id).text,/Ya tienes un aporte pendiente/);
  assert.equal(Number((await one("SELECT COUNT(*) AS n FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED'",match2.match_id,targetSeries,QA.PUBLIC.id)).n),1);
  console.log('PASS submitter idempotence');

  reset();
  const s2=await submit(QA.PUBLIC2,match2,targetSeries,'2-1');
  assert.notEqual(s2,s1);
  assert.equal(Number((await one("SELECT COUNT(*) AS n FROM public_result_submissions WHERE match_id=? AND series_code=? AND status='SUBMITTED'",match2.match_id,targetSeries)).n),2);
  console.log('PASS independent public corroboration allowed');

  reset();
  r=await callback(QA.OUTSIDER,`pr:review:${s1}`);
  assert.equal(r.handled,'public_result_review_denied');
  assert.equal((await one('SELECT status FROM public_result_submissions WHERE submission_id=?',s1)).status,'SUBMITTED');
  console.log('PASS non-participating club cannot review');

  // Ensure one participating club admin is bound to targetMatch, not just match1.
  await seedReporter(QA.HOME_ADMIN,'CLUB_ADMIN',match2.home_id);
  reset();
  r=await message(QA.HOME_ADMIN,'/aportes');
  assert.equal(r.handled,'public_result_pending_queue');
  assert.ok(callbacks(last(QA.HOME_ADMIN.id)).includes(`pr:review:${s1}`));
  console.log('PASS participating CLUB_ADMIN sees scoped review queue');

  reset();
  r=await callback(QA.HOME_ADMIN,`pr:approve:${s1}`);
  assert.equal(r.handled,'public_result_approved');
  const approved=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s1);
  assert.equal(approved.status,'APPROVED');
  const official=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',match2.match_id,targetSeries);
  assert.ok(official);
  assert.equal(official.validation_status,'VERIFIED');
  assert.equal(official.source_type,'TELEGRAM_PUBLIC_APPROVED');
  assert.equal(official.source_ref,s1);
  assert.equal((await one('SELECT status FROM public_result_submissions WHERE submission_id=?',s2)).status,'SUPERSEDED');
  const publicApi=await worker.fetch(new Request('https://qa.invalid/api/v1/series-results'),env,{});
  assert.equal(publicApi.status,200);
  const publicBody=await publicApi.json();
  assert.ok((publicBody.results||[]).some(m=>m.match_id===match2.match_id&&(m.series||[]).some(s=>s.series===targetSeries&&s.home_score===2&&s.away_score===1)));
  console.log('PASS authorized approval -> VERIFIED -> public API + supersede peers');

  reset();
  r=await callback(QA.HOME_ADMIN,`pr:approve:${s1}`);
  assert.equal(r.handled,'public_result_already_processed');
  assert.equal((await one('SELECT status FROM public_result_submissions WHERE submission_id=?',s1)).status,'APPROVED');
  console.log('PASS approval idempotence');

  reset();
  r=await callback(QA.PUBLIC3,`pr:series:${match2.match_id}:${targetSeries}`);
  assert.equal(r.handled,'public_result_existing_result');
  const stillOfficial=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',match2.match_id,targetSeries);
  assert.equal(stillOfficial.source_ref,s1);
  console.log('PASS public flow cannot overwrite an official result');

  // Find a second empty fixture+series for reject path after target was made official.
  let rejectMatch=null,rejectSeries=null;
  outer2: for(const m of matches){
    for(const s of ['TERCERA','SEGUNDA','SENIOR','PRIMERA']){
      if(!await one('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?',m.match_id,s)){
        rejectMatch=m;rejectSeries=s;break outer2;
      }
    }
  }
  assert.ok(rejectMatch&&rejectSeries,'a second empty series is required for reject QA');
  match2=rejectMatch;
  await seedReporter(QA.HOME_ADMIN,'CLUB_ADMIN',match2.home_id);
  await seedReporter(QA.AWAY_ADMIN,'CLUB_ADMIN',match2.away_id);
  const s3=await submit(QA.PUBLIC3,match2,rejectSeries,'0-0');
  const pendingBeforeReject=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s3);
  assert.equal(pendingBeforeReject.status,'SUBMITTED');

  reset();
  r=await callback(QA.AWAY_ADMIN,`pr:reject:${s3}`);
  assert.equal(r.handled,'public_result_rejected');
  const rejected=await one('SELECT * FROM public_result_submissions WHERE submission_id=?',s3);
  assert.equal(rejected.status,'REJECTED');
  assert.equal(rejected.reviewed_by,QA.AWAY_ADMIN.id);
  assert.equal(await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',match2.match_id,rejectSeries),null);
  const rejectAudit=await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='REJECT_PUBLIC_RESULT' AND resource_id=? AND allowed=1",s3);
  assert.equal(Number(rejectAudit.n),1);
  console.log('PASS participating away CLUB_ADMIN can reject without touching public SSOT');

  reset();
  r=await callback(QA.SUPER,'tp:leaders');
  assert.equal(r.handled,'global_admin_dashboard');
  assert.ok(callbacks(last(QA.SUPER.id)).includes('pr:pending'));
  assert.ok(callbacks(last(QA.SUPER.id)).includes('ga:dates'));
  console.log('PASS SUPER_ADMIN dashboard includes global pending queue and global result registration');

  reset();
  r=await callback(QA.HOME_ADMIN,'tp:public-report');
  assert.equal(r.handled,'public_result_admin_redirect');
  console.log('PASS verified admins are redirected to official club flow');

  const tables=await all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('public_result_submissions','telegram_public_result_sessions') ORDER BY name");
  assert.equal(tables.length,2);
  console.log('RESULT: PASS');
  console.log('Human-only residual gate: real Telegram rendering/delivery for public submitter + participating CLUB_ADMIN approval/rejection.');
}

try{await run()}finally{globalThis.fetch=originalFetch;db.close()}
