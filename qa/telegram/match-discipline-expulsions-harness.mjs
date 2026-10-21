import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {D1SqliteAdapter} from './d1-sqlite-adapter.mjs';
import {handleMatchDisciplineRequest} from '../../sports-bus/worker/match-discipline-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-discipline-token',
  TELEGRAM_WEBHOOK_SECRET:'qa-discipline-secret'
};
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  const prefix=`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/`;
  if(!target.startsWith(prefix)) throw new Error(`Unexpected network call: ${target}`);
  const method=target.slice(prefix.length);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:body.message_id||77}}),{status:200,headers:{'content-type':'application/json'}});
};

const SUPER={id:9941001,first_name:'Admin',last_name:'Global'};
const CLUB={id:9941002,first_name:'Dirigente',last_name:'Club'};
let updateId=994000;

function applyMigrations(){
  for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));
  }
}

async function seedReporter(actor,role,clubId=null,trust='VERIFIED'){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,1,?,?)`)
    .bind(String(actor.id),[actor.first_name,actor.last_name].filter(Boolean).join(' '),null,clubId,role,trust,now,now).run();
}

function request(update){
  return new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',
    headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET},
    body:JSON.stringify({update_id:++updateId,...update})
  });
}

async function cb(actor,data,messageId=77){
  const res=await handleMatchDisciplineRequest(request({callback_query:{
    id:`cb-${updateId+1}`,
    from:actor,
    data,
    message:{message_id:messageId,chat:{id:actor.id,type:'private'}}
  }}),env);
  assert.ok(res,`handler should claim ${data}`);
  assert.equal(res.status,200);
  return res.json();
}

async function msg(actor,text){
  const res=await handleMatchDisciplineRequest(request({message:{
    message_id:88,
    from:actor,
    text,
    chat:{id:actor.id,type:'private'}
  }}),env);
  assert.ok(res,'handler should claim discipline text input');
  assert.equal(res.status,200);
  return res.json();
}

async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function all(sql,...args){return (await env.DB.prepare(sql).bind(...args).all()).results;}
function lastScreen(){return [...calls].reverse().find(x=>x.method==='editMessageText'||x.method==='sendMessage')?.body;}
function buttons(){return (lastScreen()?.reply_markup?.inline_keyboard||[]).flat();}
function callbackValues(){return buttons().map(x=>x.callback_data).filter(Boolean);}
function assertCallbackLengths(){
  for(const call of calls.filter(x=>x.method==='editMessageText'||x.method==='sendMessage')){
    for(const button of (call.body.reply_markup?.inline_keyboard||[]).flat()){
      if(button.callback_data) assert.ok(Buffer.byteLength(button.callback_data,'utf8')<=64,`callback too long: ${button.callback_data}`);
    }
  }
}

try{
  applyMigrations();
  const match=await one(`SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=3 ORDER BY group_id,match_id LIMIT 1`);
  assert.ok(match);
  await seedReporter(SUPER,'SUPER_ADMIN',null,'VERIFIED');
  await seedReporter(CLUB,'CLUB_ADMIN',match.home_id,'VERIFIED');

  let r=await cb(SUPER,`disc:match:${match.match_id}`);
  assert.equal(r.handled,'match_discipline_match');
  assert.match(lastScreen().text,/EXPULSADOS DEL PARTIDO/);
  assert.match(lastScreen().text,/Sin expulsiones registradas/);
  assert.ok(callbackValues().includes(`disc:add:${match.match_id}`));
  console.log('PASS match discipline surface starts from the selected match');

  r=await cb(SUPER,`disc:add:${match.match_id}`);
  assert.equal(r.handled,'match_discipline_series_picker');
  assert.ok(callbackValues().includes(`disc:series:${match.match_id}:SEGUNDA`));

  r=await cb(SUPER,`disc:series:${match.match_id}:SEGUNDA`);
  assert.equal(r.handled,'match_discipline_team_picker');
  assert.ok(callbackValues().includes(`disc:team:${match.match_id}:SEGUNDA:H`));

  r=await cb(SUPER,`disc:team:${match.match_id}:SEGUNDA:H`);
  assert.equal(r.handled,'match_discipline_wait_name');
  let session=await one('SELECT * FROM telegram_discipline_sessions WHERE telegram_user_id=?',String(SUPER.id));
  assert.equal(session.state,'AWAIT_NAME');
  assert.equal(session.team_id,match.home_id);

  r=await msg(SUPER,'  José   Pérez  ');
  assert.equal(r.handled,'match_discipline_card_picker');
  session=await one('SELECT * FROM telegram_discipline_sessions WHERE telegram_user_id=?',String(SUPER.id));
  assert.equal(session.participant_name,'José Pérez');
  assert.equal(session.participant_name_key,'jose perez');
  assert.equal(session.state,'AWAIT_CARD');

  r=await cb(SUPER,`disc:card:${session.nonce}:DR`);
  assert.equal(r.handled,'match_discipline_confirm');
  session=await one('SELECT * FROM telegram_discipline_sessions WHERE telegram_user_id=?',String(SUPER.id));
  assert.equal(session.card_type,'DIRECT_RED');
  assert.equal(session.state,'CONFIRM');
  assert.match(lastScreen().text,/No se aplicará automáticamente una suspensión, multa ni cambio de tabla/);

  r=await cb(SUPER,`disc:confirm:${session.nonce}`);
  assert.equal(r.handled,'match_discipline_applied');
  const incident=await one('SELECT * FROM match_disciplinary_incidents WHERE incident_id=?',r.incident_id);
  assert.ok(incident);
  assert.equal(incident.match_id,match.match_id);
  assert.equal(incident.series_code,'SEGUNDA');
  assert.equal(incident.team_id,match.home_id);
  assert.equal(incident.participant_name,'José Pérez');
  assert.equal(incident.participant_name_key,'jose perez');
  assert.equal(incident.card_type,'DIRECT_RED');
  assert.equal(incident.incident_status,'ACTIVE');
  assert.equal(incident.sanction_state,'RECORDED_PENDING_RULE_DECISION');
  assert.equal(await one('SELECT COUNT(*) n FROM telegram_discipline_sessions WHERE telegram_user_id=?',String(SUPER.id)).then(x=>Number(x.n)),0);
  const event=await one(`SELECT * FROM events WHERE event_type='match.player.expelled' AND match_id=? ORDER BY occurred_at DESC LIMIT 1`,match.match_id);
  assert.ok(event);
  const payload=JSON.parse(event.payload_json);
  assert.equal(payload.participant_name,'José Pérez');
  assert.equal(payload.automatic_consequence_applied,false);
  const audit=await one(`SELECT * FROM permission_audit WHERE action='REGISTER_MATCH_EXPULSION' AND resource_id=?`,incident.incident_id);
  assert.ok(audit);
  console.log('PASS confirmed expulsion persists factual incident + event + audit without automatic sanction');

  // Same human name with case/spacing/accent normalization cannot duplicate the active record.
  await cb(SUPER,`disc:add:${match.match_id}`);
  await cb(SUPER,`disc:series:${match.match_id}:SEGUNDA`);
  await cb(SUPER,`disc:team:${match.match_id}:SEGUNDA:H`);
  r=await msg(SUPER,'JOSE PEREZ');
  assert.equal(r.handled,'match_discipline_duplicate_guard');
  const activeCount=await one(`SELECT COUNT(*) n FROM match_disciplinary_incidents WHERE match_id=? AND series_code='SEGUNDA' AND team_id=? AND participant_name_key='jose perez' AND incident_status='ACTIVE'`,match.match_id,match.home_id);
  assert.equal(Number(activeCount.n),1);
  console.log('PASS normalized duplicate expulsion fails closed');

  r=await cb(SUPER,'disc:list');
  assert.equal(r.handled,'match_discipline_list');
  assert.match(lastScreen().text,/REGISTRO DISCIPLINARIO/);
  assert.match(lastScreen().text,/José Pérez/);
  assert.ok(callbackValues().includes(`disc:item:${incident.incident_id}`));

  r=await cb(SUPER,`disc:item:${incident.incident_id}`);
  assert.equal(r.handled,'match_discipline_incident_detail');
  assert.match(lastScreen().text,/PENDIENTE DE REGLA\/DECISIÓN/);

  r=await cb(SUPER,`disc:void-confirm:${incident.incident_id}`);
  assert.equal(r.handled,'match_discipline_void_confirmation');
  const beforeVoid=await one('SELECT incident_status FROM match_disciplinary_incidents WHERE incident_id=?',incident.incident_id);
  assert.equal(beforeVoid.incident_status,'ACTIVE');

  r=await cb(SUPER,`disc:void:${incident.incident_id}`);
  assert.equal(r.handled,'match_discipline_voided');
  const afterVoid=await one('SELECT incident_status,voided_by,void_reason FROM match_disciplinary_incidents WHERE incident_id=?',incident.incident_id);
  assert.equal(afterVoid.incident_status,'VOID');
  assert.equal(afterVoid.voided_by,String(SUPER.id));
  assert.equal(afterVoid.void_reason,'super_admin_voided_incorrect_record');
  assert.ok(await one(`SELECT * FROM events WHERE event_type='match.player.expulsion.voided' AND match_id=? ORDER BY occurred_at DESC LIMIT 1`,match.match_id));
  assert.ok(await one(`SELECT * FROM permission_audit WHERE action='VOID_MATCH_EXPULSION' AND resource_id=?`,incident.incident_id));
  console.log('PASS mistaken expulsion can be voided without deleting history');

  const beforeDenied=await one('SELECT COUNT(*) n FROM match_disciplinary_incidents');
  r=await cb(CLUB,`disc:add:${match.match_id}`);
  assert.equal(r.handled,'match_discipline_denied');
  const afterDenied=await one('SELECT COUNT(*) n FROM match_disciplinary_incidents');
  assert.equal(Number(afterDenied.n),Number(beforeDenied.n));
  console.log('PASS current PUBLISH_MATCH_EVENT boundary keeps canonical discipline writes SUPER_ADMIN-only');

  assertCallbackLengths();
  console.log('PASS Telegram callbacks remain within platform limit');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
