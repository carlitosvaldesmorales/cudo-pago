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

function applyMigrations(){for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'))}
async function safeSecret(source){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
let updateId=73000;
async function dispatch(update){
  const secret=await safeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const response=await route.fetch(new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:++updateId,...update})}),env,{});
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
  assert.ok(clubRow?.team_id);
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(String(SUPER.id),'Dirigente Global','dirigente_global_qa',now,now).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?, 'CLUB_ADMIN','VERIFIED',1,?,?)`).bind(String(CLUB.id),'Dirigente Club','dirigente_club_qa',clubRow.team_id,now,now).run();

  const candidates=(await env.DB.prepare(`SELECT m.match_id,m.round_no,m.round_label,m.group_id,m.home_name,m.away_name,s.series_code FROM matches m CROSS JOIN (SELECT 'TERCERA' series_code UNION ALL SELECT 'SEGUNDA' UNION ALL SELECT 'SENIOR' UNION ALL SELECT 'PRIMERA') s LEFT JOIN match_series_results r ON r.match_id=m.match_id AND r.series_code=s.series_code WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.result_id IS NULL ORDER BY m.round_no,m.match_id,CASE s.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END`).all()).results||[];
  assert.ok(candidates.length,'fixture must contain at least one series without governed result');
  const target=candidates[0];

  reset();
  let result=await callback(SUPER,'tp:leaders');
  assert.equal(result.handled,'public_result_admin_dashboard');
  let panel=last(SUPER.id);
  assert.match(panel.text,/ADMIN GLOBAL/);
  assert.ok(buttons(panel).some(x=>x.callback_data==='ga:dates'&&/Administrar todos los resultados/.test(x.text)));
  assert.ok(!buttons(panel).some(x=>/Mis partidos de club/.test(x.text)),'SUPER_ADMIN dashboard must not present club-scoped wording');
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:requests'));
  assert.ok(buttons(panel).some(x=>x.callback_data==='pr:pending'));
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:admins'));
  console.log('PASS SUPER_ADMIN dashboard exposes Administrar todos los resultados and no club-scoped wording');

  reset();
  result=await callback(SUPER,'ga:dates');
  assert.equal(result.handled,'global_admin_result_dates');
  panel=last(SUPER.id);
  assert.match(panel.text,/ADMINISTRAR TODOS LOS RESULTADOS/);
  assert.ok(buttons(panel).some(x=>x.callback_data===`ga:date:${target.round_no}`));

  reset();
  result=await callback(SUPER,`ga:date:${target.round_no}`);
  assert.equal(result.handled,'global_admin_result_round');
  panel=last(SUPER.id);
  const matchButtons=buttons(panel).filter(x=>String(x.callback_data||'').startsWith('ga:match:'));
  assert.ok(matchButtons.length>=2,'global round must expose multiple matches, not one club scope');
  assert.ok(matchButtons.some(x=>x.callback_data===`ga:match:${target.match_id}`));
  console.log('PASS global result administration spans every match in the selected date');

  reset();
  result=await callback(SUPER,`ga:match:${target.match_id}`);
  assert.equal(result.handled,'global_admin_result_series_menu');
  panel=last(SUPER.id);
  assert.match(panel.text,/ADMINISTRAR RESULTADOS DEL PARTIDO/);
  assert.ok(buttons(panel).some(x=>x.callback_data===`ga:series:${target.match_id}:${target.series_code}`));

  reset();
  result=await callback(SUPER,`ga:series:${target.match_id}:${target.series_code}`);
  assert.equal(result.handled,'global_admin_result_wait_score');
  let session=await env.DB.prepare("SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?").bind(String(SUPER.id)).first();
  assert.equal(session?.state,'AWAIT_GLOBAL_SCORE');
  assert.equal(session?.match_id,target.match_id);
  assert.equal(session?.series_code,target.series_code);
  assert.equal(await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first(),null);
  console.log('PASS missing series can be registered without premature mutation');

  reset();
  result=await message(SUPER,'/dirigentes');
  assert.equal(result.handled,'public_result_admin_dashboard');
  session=await env.DB.prepare('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?').bind(String(SUPER.id)).first();
  assert.equal(session,null);
  assert.equal(await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first(),null);
  console.log('PASS leaving staged capture clears it without mutation');

  await callback(SUPER,'ga:dates');
  await callback(SUPER,`ga:date:${target.round_no}`);
  await callback(SUPER,`ga:match:${target.match_id}`);
  await callback(SUPER,`ga:series:${target.match_id}:${target.series_code}`);
  reset();
  result=await message(SUPER,'1-0');
  assert.equal(result.handled,'global_admin_result_saved');
  const official=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first();
  assert.deepEqual([Number(official.home_score),Number(official.away_score),official.validation_status,official.source_type],[1,0,'VERIFIED','TELEGRAM_SUPER_ADMIN']);
  const version=await env.DB.prepare('SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=? AND version_no=1').bind(target.match_id,target.series_code).first();
  assert.equal(String(version.actor_id),String(SUPER.id));
  assert.equal(version.actor_role,'SUPER_ADMIN');
  assert.equal(version.actor_club_id,null);
  const audit=await env.DB.prepare("SELECT * FROM permission_audit WHERE actor_id=? AND action='REPORT_SERIES_RESULT' AND resource_id=? AND allowed=1").bind(String(SUPER.id),`${target.match_id}:${target.series_code}`).first();
  assert.ok(audit);
  console.log('PASS first official result is VERIFIED with SUPER_ADMIN actor and audit');

  reset();
  result=await callback(SUPER,`ga:match:${target.match_id}`);
  panel=last(SUPER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`ga:official:${target.match_id}:${target.series_code}`));

  reset();
  result=await callback(SUPER,`ga:official:${target.match_id}:${target.series_code}`);
  assert.equal(result.handled,'global_admin_result_manage_existing');
  panel=last(SUPER.id);
  assert.match(panel.text,/ADMINISTRAR RESULTADO/);
  const managed=buttons(panel).map(x=>x.callback_data);
  assert.ok(managed.includes(`rg:correct:${target.match_id}:${target.series_code}`));
  assert.ok(managed.includes(`rg:dispute:${target.match_id}:${target.series_code}`));
  assert.ok(managed.includes(`rg:annul:${target.match_id}:${target.series_code}`));
  assert.ok(managed.includes(`rg:h:${target.match_id}:${target.series_code}`));
  console.log('PASS existing official result exposes correct/dispute/annul/history from the same global surface');

  reset();
  result=await callback(SUPER,`ga:series:${target.match_id}:${target.series_code}`);
  assert.equal(result.handled,'global_admin_result_existing_guard');
  panel=last(SUPER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`ga:official:${target.match_id}:${target.series_code}`));
  const unchanged=await env.DB.prepare('SELECT home_score,away_score,governance_version FROM match_series_results WHERE match_id=? AND series_code=?').bind(target.match_id,target.series_code).first();
  assert.deepEqual([Number(unchanged.home_score),Number(unchanged.away_score),Number(unchanged.governance_version)],[1,0,1]);
  console.log('PASS existing governed result cannot be silently overwritten');

  reset();
  result=await message(SUPER,'/mispartidos');
  assert.equal(result.handled,'global_admin_result_dates');
  console.log('PASS legacy /mispartidos remains a compatibility bridge to global administration');

  reset();
  result=await message(CLUB,'/dirigentes');
  assert.equal(result.handled,'public_result_admin_dashboard');
  panel=last(CLUB.id);
  assert.doesNotMatch(panel.text,/ADMIN GLOBAL/);
  console.log('PASS CLUB_ADMIN remains on its club-scoped surface');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
