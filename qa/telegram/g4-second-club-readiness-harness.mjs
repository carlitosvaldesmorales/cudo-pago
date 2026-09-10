import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import route from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrationsDir=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-g4-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-g4-next-token',
  TELEGRAM_WEBHOOK_SECRET:'qa-g4-secret'
};
const outbound=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init?.body?JSON.parse(String(init.body)):{};
  outbound.push({method:target.split('/').at(-1),body,target});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrationsDir).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrationsDir,file),'utf8'));
  }
}
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
let updateId=72000;
async function dispatch(update){
  const secret=await safeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const response=await route.fetch(new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},
    body:JSON.stringify({update_id:++updateId,...update})
  }),env,{});
  assert.equal(response.status,200);
  return response.json();
}
async function message(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:Number(actor.id),type:'private'},text}})}
async function callback(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:updateId+1,chat:{id:Number(actor.id),type:'private'}}}})}
function sent(chatId){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId));}
function last(chatId){const rows=sent(chatId);assert.ok(rows.length,`expected message for ${chatId}`);return rows.at(-1).body;}
function buttons(body){return (body.reply_markup?.inline_keyboard||[]).flat();}
function reset(){outbound.length=0;}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results||[];}

const SUPER={id:882000,first_name:'Admin',last_name:'Global',username:'qa_g4_global'};
const CLUB_A_USER={id:882001,first_name:'Dirigente',last_name:'A',username:'qa_g4_a'};
const CLUB_B_USER={id:882002,first_name:'Dirigente',last_name:'B',username:'qa_g4_b'};

async function seedSuper(){
  const now='2026-09-10T20:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(SUPER.id),'Admin Global','qa_g4_global',now,now).run();
}

async function enroll(actor,clubId){
  let r=await message(actor,'/start');
  assert.equal(r.handled,'portal_home');
  r=await callback(actor,'tp:leaders');
  assert.equal(r.handled,'portal_leaders');
  r=await callback(actor,'tp:req');
  assert.equal(r.handled,'portal_request_choose_club');
  assert.ok(buttons(last(actor.id)).some(x=>x.callback_data===`tp:reqclub:${clubId}`));
  r=await callback(actor,`tp:reqclub:${clubId}`);
  assert.equal(r.handled,'portal_request_created');
  const pending=await one("SELECT * FROM access_requests WHERE telegram_user_id=? AND status='PENDING'",String(actor.id));
  assert.ok(pending);

  r=await callback(SUPER,'tp:requests');
  assert.equal(r.handled,'portal_pending_requests');
  assert.ok(buttons(last(SUPER.id)).some(x=>x.callback_data===`tp:review:${pending.request_id}`));
  r=await callback(SUPER,`tp:approve:${pending.request_id}`);
  assert.equal(r.handled,'portal_request_approved');
  const reporter=await one('SELECT * FROM reporters WHERE telegram_user_id=?',String(actor.id));
  assert.equal(reporter.role,'CLUB_ADMIN');
  assert.equal(reporter.trust_level,'VERIFIED');
  assert.equal(Number(reporter.active),1);
  assert.equal(reporter.club_id,clubId);
  return reporter;
}

try{
  applyMigrations();
  await seedSuper();

  // Select one real fixture match for club B and a third-party club A that is not in that match.
  const targetMatch=await one(`SELECT match_id,home_id,away_id,home_name,away_name,round_no,round_label
    FROM matches
    WHERE competition_id='ANFA-CHEPICA-2026' AND home_id IS NOT NULL AND away_id IS NOT NULL
    ORDER BY round_no,match_id LIMIT 1`);
  assert.ok(targetMatch,'ANFA fixture required');
  const clubB=targetMatch.away_id;
  const clubArow=await one(`SELECT team_id,canonical_name FROM teams
    WHERE active=1 AND team_id<>? AND team_id<>? ORDER BY canonical_name LIMIT 1`,targetMatch.home_id,targetMatch.away_id);
  assert.ok(clubArow,'third-party club required');
  const clubA=clubArow.team_id;

  await enroll(CLUB_A_USER,clubA);
  await enroll(CLUB_B_USER,clubB);
  console.log(`PASS two independent Telegram identities enrolled to distinct clubs: ${clubA} / ${clubB}`);

  // Both associations coexist and do not bleed across identities.
  const associations=await all("SELECT telegram_user_id,club_id,role,trust_level,active FROM reporters WHERE telegram_user_id IN (?,?) ORDER BY telegram_user_id",String(CLUB_A_USER.id),String(CLUB_B_USER.id));
  assert.equal(associations.length,2);
  assert.equal(associations[0].club_id,clubA);
  assert.equal(associations[1].club_id,clubB);
  assert.ok(associations.every(x=>x.role==='CLUB_ADMIN'&&x.trust_level==='VERIFIED'&&Number(x.active)===1));
  console.log('PASS club associations remain isolated by Telegram identity');

  // Club B sees its own administrative match surface.
  reset();
  let r=await callback(CLUB_B_USER,'tp:mymatches');
  assert.equal(r.handled,'portal_my_matches');
  let panel=last(CLUB_B_USER.id);
  assert.match(panel.text,/MIS PARTIDOS/);
  const clubBName=(await one('SELECT canonical_name FROM teams WHERE team_id=?',clubB)).canonical_name;
  assert.match(panel.text,new RegExp(clubBName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(buttons(panel).some(x=>x.callback_data===`rs:date:${targetMatch.round_no}`));
  console.log('PASS second club reaches its scoped match surface without technical provisioning');

  // A crafted callback cannot let club A open club B's target match.
  reset();
  r=await callback(CLUB_A_USER,`rs:match:${targetMatch.match_id}`);
  assert.equal(r.handled,'scope_match_denied');
  assert.match(last(CLUB_A_USER.id).text,/no corresponde al club/i);
  console.log('PASS cross-club crafted match callback is denied by backend scope');

  // Isolate one series in the in-memory fixture and let club B create a legitimate first official result.
  const series='TERCERA';
  await env.DB.prepare('DELETE FROM match_series_result_versions WHERE match_id=? AND series_code=?').bind(targetMatch.match_id,series).run();
  await env.DB.prepare('DELETE FROM series_reports WHERE match_id=? AND series_code=?').bind(targetMatch.match_id,series).run();
  await env.DB.prepare('DELETE FROM match_series_results WHERE match_id=? AND series_code=?').bind(targetMatch.match_id,series).run();

  reset();
  r=await callback(CLUB_B_USER,`rs:match:${targetMatch.match_id}`);
  assert.equal(r.handled,'series_menu');
  panel=last(CLUB_B_USER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`rs:series:${targetMatch.match_id}:${series}`));
  r=await callback(CLUB_B_USER,`rs:series:${targetMatch.match_id}:${series}`);
  assert.equal(r.handled,'series_wait_score');
  r=await message(CLUB_B_USER,'2-1');
  assert.equal(r.handled,'club_admin_series_verified');
  assert.equal(r.outcome,'FIRST_OFFICIAL');
  const official=await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?',targetMatch.match_id,series);
  assert.equal(official.validation_status,'VERIFIED');
  assert.equal(Number(official.home_score),2);
  assert.equal(Number(official.away_score),1);
  assert.equal(official.source_type,'TELEGRAM_CLUB_ADMIN');
  const audit=await one("SELECT * FROM permission_audit WHERE actor_id=? AND action='REPORT_SERIES_RESULT' AND resource_id=?",String(CLUB_B_USER.id),`${targetMatch.match_id}:${series}`);
  assert.ok(audit);
  assert.equal(Number(audit.allowed),1);
  console.log('PASS second club can create an official result for its own match with audit evidence');

  // Club A cannot mutate the same series even with a crafted direct callback.
  reset();
  r=await callback(CLUB_A_USER,`rs:series:${targetMatch.match_id}:${series}`);
  assert.equal(r.handled,'scope_series_denied');
  const afterDenied=await one('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?',targetMatch.match_id,series);
  assert.equal(Number(afterDenied.home_score),2);
  assert.equal(Number(afterDenied.away_score),1);
  assert.equal(afterDenied.validation_status,'VERIFIED');
  console.log('PASS out-of-scope club cannot mutate another club result');

  // Result visibility is scoped in the dirigente registry too.
  reset();
  r=await callback(CLUB_B_USER,'tp:registered');
  assert.equal(r.handled,'portal_registered_results');
  assert.match(last(CLUB_B_USER.id).text,new RegExp(targetMatch.home_name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

  reset();
  r=await callback(CLUB_A_USER,'tp:registered');
  assert.equal(r.handled,'portal_registered_results');
  const clubAView=last(CLUB_A_USER.id).text;
  assert.ok(!clubAView.includes(`${targetMatch.home_name} 2-1 ${targetMatch.away_name}`),'unrelated club must not see target result in dirigente-scoped registry');
  console.log('PASS registered-results view remains club-scoped');

  console.log('G4 TECHNICAL READINESS: PASS');
  console.log('BLOCKER REMAINING: one real second-club Telegram identity must execute enrollment and normal operation in production');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
