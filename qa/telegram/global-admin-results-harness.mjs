import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import route from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-global-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-global-next-token',
  TELEGRAM_WEBHOOK_SECRET:'qa-global-secret'
};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method:target.split('/').at(-1),body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
let updateId=73000;
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

const SUPER={id:991001,first_name:'Dirigente',last_name:'Global',username:'dirigente_global_qa'};
const CLUB={id:991002,first_name:'Dirigente',last_name:'Club',username:'dirigente_club_qa'};
async function message(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:Number(actor.id),type:'private'},text}})}
async function callback(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:updateId+1,chat:{id:Number(actor.id),type:'private'}}}})}
function reset(){calls.length=0}
function sent(chatId){return calls.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId))}
function last(chatId){const rows=sent(chatId);assert.ok(rows.length,`expected Telegram message to ${chatId}`);return rows.at(-1).body}
function buttons(body){return (body.reply_markup?.inline_keyboard||[]).flat()}

try{
  applyMigrations();
  const now='2026-09-10T22:00:00Z';
  const clubRow=await env.DB.prepare("SELECT team_id FROM teams WHERE active=1 ORDER BY team_id LIMIT 1").first();
  assert.ok(clubRow?.team_id,'fixture must contain at least one club');
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(SUPER.id),'Dirigente Global','dirigente_global_qa',now,now).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,?, 'CLUB_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(CLUB.id),'Dirigente Club','dirigente_club_qa',clubRow.team_id,now,now).run();

  const candidates=(await env.DB.prepare(`
    SELECT m.match_id,m.round_no,m.round_label,m.group_id,m.home_name,m.away_name,s.series_code
    FROM matches m
    CROSS JOIN (SELECT 'TERCERA' series_code UNION ALL SELECT 'SEGUNDA' UNION ALL SELECT 'SENIOR' UNION ALL SELECT 'PRIMERA') s
    LEFT JOIN match_series_results r ON r.match_id=m.match_id AND r.series_code=s.series_code
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.result_id IS NULL
    ORDER BY m.round_no,m.match_id,CASE s.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END
  `).all()).results||[];
  assert.ok(candidates.length,'fixture must contain at least one series without governed result');
  const target=candidates[0];

  reset();
  let result=await message(SUPER,'/dirigentes');
  assert.equal(result.handled,'global_admin_dashboard');
  let panel=last(SUPER.id);
  assert.match(panel.text,/DIRIGENTE GLOBAL/);
  assert.ok(buttons(panel).some(x=>x.callback_data==='ga:dates'&&/Registrar resultados/.test(x.text)));

  reset();
  result=await callback(SUPER,'ga:dates');
  assert.equal(result.handled,'global_admin_result_dates');
  panel=last(SUPER.id);
  assert.match(panel.text,/ADMIN GLOBAL/);
  assert.ok(buttons(panel).some(x=>x.callback_data===`ga:date:${target.round_no}`));

  reset();
  result=await callback(SUPER,`ga:date:${target.round_no}`);
  assert.equal(result.handled,'global_admin_result_round');
  panel=last(SUPER.id);
  const matchButtons=buttons(panel).filter(x=>String(x.callback_data||'').startsWith('ga:match:'));
  assert.ok(matchButtons.length>=2,'global round must expose multiple matches, not one club scope');
  assert.ok(matchButtons.some(x=>x.callback_data===`ga:match:${target.match_id}`));

  reset();
  result=await callback(SUPER,`ga:match:${target.match_id}`);
  assert.equal(result.handled,'global_admin_result_series_menu');
  panel=last(SUPER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`ga:series:${target.match_id}:${target.series_code}`));

  reset();
  result=await callback(SUPER,`ga:series:${target.match_id}:${target.series_code}`);
  assert.equal(result.handled,'global_admin_result_wait_score');
  panel=last(SUPER.id);
  assert.match(panel.text,/REGISTRAR RESULTADO OFICIAL/);
  let session=await env.DB.prepare("SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?").bind(String(SUPER.id)).first();
  assert.equal(session?.state,'AWAIT_GLOBAL_SCORE');
  assert.equal(session?.match_id,target.match_id);
  assert.equal(session?.series_code,target.series_code);

  const before=await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first();
  assert.equal(before,null,'choosing a series must not create an official result before score submission');

  reset();
  result=await message(SUPER,'1-0');
  assert.equal(result.handled,'global_admin_result_saved');
  assert.equal(result.status,'VERIFIED');
  const official=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first();
  assert.equal(Number(official.home_score),1);
  assert.equal(Number(official.away_score),0);
  assert.equal(official.validation_status,'VERIFIED');
  assert.equal(official.source_type,'TELEGRAM_SUPER_ADMIN');
  assert.equal(Number(official.governance_version),1);
  const version=await env.DB.prepare('SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=? AND version_no=1').bind(target.match_id,target.series_code).first();
  assert.equal(version.action,'BASELINE');
  assert.equal(String(version.actor_id),String(SUPER.id));
  assert.equal(version.actor_role,'SUPER_ADMIN');
  assert.equal(version.actor_club_id,null);
  const report=await env.DB.prepare('SELECT * FROM series_reports WHERE match_id=? AND series_code=? AND reporter_id=?').bind(target.match_id,target.series_code,String(SUPER.id)).first();
  assert.equal(report.report_status,'VERIFIED');
  assert.equal(report.reporter_club_id,null);
  const audit=await env.DB.prepare("SELECT * FROM permission_audit WHERE actor_id=? AND action='REPORT_SERIES_RESULT' AND resource_id=? AND allowed=1").bind(String(SUPER.id),`${target.match_id}:${target.series_code}`).first();
  assert.ok(audit,'global first official result must leave a permission audit');
  assert.equal(audit.role,'SUPER_ADMIN');
  assert.equal(audit.club_id,null);
  session=await env.DB.prepare('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?').bind(String(SUPER.id)).first();
  assert.equal(session,null);

  reset();
  result=await callback(SUPER,`ga:series:${target.match_id}:${target.series_code}`);
  assert.equal(result.handled,'global_admin_result_existing_guard');
  panel=last(SUPER.id);
  assert.match(panel.text,/no.*captura nueva|no se abrió una captura nueva/i);
  assert.ok(buttons(panel).some(x=>x.callback_data==='rg:list'));
  const unchanged=await env.DB.prepare('SELECT home_score,away_score,governance_version FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first();
  assert.deepEqual([Number(unchanged.home_score),Number(unchanged.away_score),Number(unchanged.governance_version)],[1,0,1]);
  session=await env.DB.prepare('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?').bind(String(SUPER.id)).first();
  assert.equal(session,null,'existing governed result must not open a score session');

  reset();
  result=await message(SUPER,'/mispartidos');
  assert.equal(result.handled,'global_admin_result_dates','legacy global /mispartidos must bridge to global registration instead of requiring a fake club');

  reset();
  result=await message(CLUB,'/dirigentes');
  assert.notEqual(result.handled,'global_admin_dashboard','CLUB_ADMIN must not be intercepted by the platform-wide handler');
  assert.equal(result.handled,'public_result_admin_dashboard');
  panel=last(CLUB.id);
  assert.doesNotMatch(panel.text,/DIRIGENTE GLOBAL/);

  console.log('PASS SUPER_ADMIN without club_id reaches Dirigente Global and Registrar resultados');
  console.log('PASS global date view exposes all matches instead of one club scope');
  console.log('PASS choosing a missing series stages capture without premature mutation');
  console.log('PASS first global official result is VERIFIED with actor, audit and null club scope');
  console.log('PASS existing governed result cannot be silently overwritten and redirects to governance');
  console.log('PASS legacy /mispartidos bridges SUPER_ADMIN to global registration');
  console.log('PASS CLUB_ADMIN remains on its existing club-scoped surface');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
