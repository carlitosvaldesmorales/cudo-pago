import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import route from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-enrollment-token',TELEGRAM_BOT_TOKEN_NEXT:'qa-enrollment-next-token',TELEGRAM_WEBHOOK_SECRET:'qa-enrollment-secret'};
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
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
let updateId=61000;
async function dispatch(update){
  const secret=await safeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const response=await route.fetch(new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:++updateId,...update})}),env,{});
  assert.equal(response.status,200);
  return response.json();
}
const USER={id:881001,first_name:'Ana',last_name:'Dirigente',username:'ana_dirigente'};
const SUPER={id:881099,first_name:'Admin',last_name:'Global',username:'admin_global'};
const OUTSIDER={id:881050,first_name:'Otro',last_name:'Dirigente',username:'otro_dirigente'};
async function message(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:Number(actor.id),type:'private'},text}})}
async function callback(actor,data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:actor,data,message:{message_id:updateId+1,chat:{id:Number(actor.id),type:'private'}}}})}
function reset(){calls.length=0}
function sent(chatId){return calls.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId))}
function last(chatId){const rows=sent(chatId);assert.ok(rows.length,`expected message to ${chatId}`);return rows.at(-1).body}
function buttons(body){return (body.reply_markup?.inline_keyboard||[]).flat()}

try{
  applyMigrations();
  const now='2026-09-10T19:10:00Z';
  const teams=(await env.DB.prepare("SELECT team_id,canonical_name FROM teams WHERE active=1 ORDER BY canonical_name LIMIT 3").all()).results||[];
  assert.ok(teams.length>=2,'at least two active clubs required');
  const club=teams[0],otherClub=teams[1];
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(String(SUPER.id),'Admin Global','admin_global',now,now).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,?, 'CLUB_ADMIN','VERIFIED',1,?,?)`).bind(String(OUTSIDER.id),'Otro Dirigente','otro_dirigente',otherClub.team_id,now,now).run();

  reset();
  let result=await message(USER,'/start');
  assert.equal(result.handled,'portal_home');
  let panel=last(USER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:public'));
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:leaders'));

  result=await callback(USER,'tp:leaders');
  assert.equal(result.handled,'portal_leaders');
  panel=last(USER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:req'));

  result=await callback(USER,'tp:req');
  assert.equal(result.handled,'portal_request_choose_club');
  panel=last(USER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`tp:reqclub:${club.team_id}`));

  reset();
  result=await callback(USER,`tp:reqclub:${club.team_id}`);
  assert.equal(result.handled,'portal_request_created');
  assert.equal(result.club_id,club.team_id);
  const pending=await env.DB.prepare("SELECT * FROM access_requests WHERE telegram_user_id=? AND status='PENDING'").bind(String(USER.id)).first();
  assert.ok(pending,'pending request must be persisted');
  assert.equal(pending.requested_club_id,club.team_id);
  assert.equal(pending.requested_role,'CLUB_ADMIN');
  assert.match(last(USER.id).text,/PENDIENTE/);

  await callback(USER,`tp:reqclub:${club.team_id}`);
  const pendingCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE telegram_user_id=? AND status='PENDING'").bind(String(USER.id)).first();
  assert.equal(Number(pendingCount.n),1);

  result=await callback({id:881002,first_name:'QA'},'tp:reqclub:NO-EXISTE');
  assert.equal(result.handled,'portal_request_invalid_club');

  reset();
  result=await callback(OUTSIDER,`tp:approve:${pending.request_id}`);
  assert.equal(result.handled,'portal_denied');
  assert.equal((await env.DB.prepare('SELECT status FROM access_requests WHERE request_id=?').bind(pending.request_id).first()).status,'PENDING');

  reset();
  result=await message(SUPER,'/dirigentes');
  assert.equal(result.handled,'public_result_admin_dashboard');
  panel=last(SUPER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:requests'),'global dashboard must expose enrollment queue');

  result=await callback(SUPER,'tp:requests');
  assert.equal(result.handled,'portal_pending_requests');
  panel=last(SUPER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`tp:review:${pending.request_id}`));

  result=await callback(SUPER,`tp:review:${pending.request_id}`);
  assert.equal(result.handled,'portal_request_review');
  panel=last(SUPER.id);
  assert.ok(buttons(panel).some(x=>x.callback_data===`tp:approve:${pending.request_id}`));
  assert.ok(buttons(panel).some(x=>x.callback_data===`tp:reject:${pending.request_id}`));

  reset();
  result=await callback(SUPER,`tp:approve:${pending.request_id}`);
  assert.equal(result.handled,'portal_request_approved');
  const approved=await env.DB.prepare('SELECT * FROM access_requests WHERE request_id=?').bind(pending.request_id).first();
  assert.equal(approved.status,'APPROVED');
  assert.equal(String(approved.reviewed_by),String(SUPER.id));
  assert.ok(approved.reviewed_at);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(String(USER.id)).first();
  assert.equal(reporter.role,'CLUB_ADMIN');
  assert.equal(reporter.trust_level,'VERIFIED');
  assert.equal(reporter.active,1);
  assert.equal(reporter.club_id,club.team_id);
  const audit=await env.DB.prepare("SELECT * FROM permission_audit WHERE action='APPROVE_CLUB_ADMIN' AND resource_id=? AND allowed=1").bind(pending.request_id).first();
  assert.ok(audit,'approval must be auditable');
  assert.ok(sent(USER.id).some(x=>/acceso de dirigente fue aprobado/i.test(x.body.text)),'approved user must be notified');

  reset();
  result=await callback(USER,'tp:leaders');
  assert.equal(result.handled,'public_result_admin_dashboard');
  panel=last(USER.id);
  assert.match(panel.text,new RegExp(club.canonical_name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(buttons(panel).some(x=>x.callback_data==='tp:mymatches'));
  const association=await env.DB.prepare('SELECT club_id,role,trust_level,active FROM reporters WHERE telegram_user_id=?').bind(String(USER.id)).first();
  assert.equal(association.club_id,club.team_id);
  assert.equal(association.role,'CLUB_ADMIN');
  assert.equal(association.trust_level,'VERIFIED');
  assert.equal(Number(association.active),1);

  reset();
  result=await callback(SUPER,`tp:approve:${pending.request_id}`);
  assert.equal(result.handled,'portal_request_not_pending');
  assert.equal(Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM permission_audit WHERE action='APPROVE_CLUB_ADMIN' AND resource_id=?").bind(pending.request_id).first()).n),1);

  console.log('PASS public identity discovers Público + Dirigentes entrypoints');
  console.log('PASS enrollment binds one pending request to one real club');
  console.log('PASS duplicate pending request is prevented');
  console.log('PASS CLUB_ADMIN cannot approve another enrollment');
  console.log('PASS SUPER_ADMIN reviews and approves enrollment');
  console.log('PASS approval materializes Telegram identity -> CLUB_ADMIN -> club association');
  console.log('PASS enrolled dirigente reaches its scoped admin surface');
  console.log('PASS approval replay is idempotent');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
