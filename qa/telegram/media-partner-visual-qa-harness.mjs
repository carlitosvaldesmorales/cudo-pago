import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-visual-token',TELEGRAM_WEBHOOK_SECRET:'qa-visual-secret'};
const outbound=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-visual-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  outbound.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:outbound.length}}),{status:200,headers:{'content-type':'application/json'}});
};

const OP={id:9962001,first_name:'Operador',last_name:'QA'};
const MEDIA_A={id:9962002,first_name:'Integrante',last_name:'A'};
const MEDIA_B={id:9962003,first_name:'Integrante',last_name:'B'};
const VISITOR={id:9962004,first_name:'Visitante',last_name:'QA'};
let updateId=962000;

function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function safeSecret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await safeSecret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function cb(actor,data,id=null){return dispatch({callback_query:{id:id||`cb-${updateId+1}`,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
async function seed(actor,role='REPORTER',trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,role,trust,now,now).run();}
function last(chatId){return outbound.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(chatId)).at(-1)?.body;}
function buttons(body){return (body?.reply_markup?.inline_keyboard||[]).flat();}
function callbacks(body){return buttons(body).map(x=>x.callback_data).filter(Boolean);}
function firstCb(body,prefix){const found=callbacks(body).find(x=>x.startsWith(prefix));assert.ok(found,`missing callback ${prefix}`);return found;}
function buttonText(body){return buttons(body).map(x=>x.text);}
function visualAudit(body,label,{allowInternal=false}={}){
  assert.ok(body&&typeof body.text==='string'&&body.text.trim(),`${label}: missing text`);
  assert.ok(body.text.length<=4096,`${label}: text too long`);
  const seen=new Set();
  for(const b of buttons(body)){
    assert.ok(typeof b.text==='string'&&b.text.trim(),`${label}: blank button`);
    if(b.callback_data){
      assert.ok(Buffer.byteLength(b.callback_data,'utf8')<=64,`${label}: callback exceeds Telegram 64-byte limit`);
      assert.equal(seen.has(b.callback_data),false,`${label}: duplicate callback ${b.callback_data}`);
      seen.add(b.callback_data);
    }
  }
  if(!allowInternal){
    for(const token of ['MEDIA_PARTNER','READ_COMPETITION','OBSERVE_RESULT','PUBLISH_MATCH_EVENT','telegram_user_id','partner_code','VERIFIED','PROVISIONAL','v1']){
      assert.equal(body.text.includes(token),false,`${label}: internal token leaked: ${token}`);
      assert.equal(buttonText(body).some(t=>String(t).includes(token)),false,`${label}: internal token leaked in button: ${token}`);
    }
  }
}
function noRetiredScope(body,label){
  assert.equal(/coberturas|corresponsales|eventos en vivo|goles\/eventos/i.test(body.text),false,`${label}: retired scope leaked into active UX`);
  assert.equal(callbacks(body).some(x=>x.startsWith('mp:coverage')||x.startsWith('mplive:')||x==='mp:hub'||x==='mp:mycoverages'),false,`${label}: retired action exposed`);
}
function printScreen(label,body){const rows=(body?.reply_markup?.inline_keyboard||[]).map(r=>r.map(b=>`[${b.text}]`).join(' '));console.log(`SCREEN ${label}\n${body.text}\n${rows.join('\n')}\n---`);}
async function createInvite(){
  const r=await cb(OP,'mp:collab:invite');assert.equal(r.handled,'media_partner_collaboration_invite_created');
  const screen=last(OP.id);visualAudit(screen,'invite');noRetiredScope(screen,'invite');
  assert.match(screen.text,/INVITAR A CHÉPICA PLAY/i);
  assert.match(screen.text,/individual y de un solo uso/i);
  assert.match(screen.text,/Consultar resultados/i);
  assert.match(screen.text,/Registrar resultados/i);
  const token=screen.text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];assert.ok(token);
  printScreen('invite',screen);
  return token;
}
async function claim(actor,token){
  const r=await msg(actor,`/start partner_${token}`);assert.equal(r.handled,'media_partner_collaboration_claimed');
  const screen=last(actor.id);visualAudit(screen,'claim');noRetiredScope(screen,'claim');
  assert.match(screen.text,/ACCESO ACTIVADO · Chépica Play/i);
  assert.match(screen.text,/Consultar resultados/i);
  assert.match(screen.text,/Registrar resultados/i);
  assert.match(screen.text,/validación antes de convertirse en oficiales/i);
  assert.ok(callbacks(screen).includes('tp:public-results'));
  assert.ok(callbacks(screen).includes('obs:dates'));
  printScreen(`claim_${actor.id}`,screen);
}

async function runRegistration(actor,homeScore,awayScore){
  let r=await cb(actor,'obs:dates');
  assert.equal(r.handled,'observation_dates');
  let screen=last(actor.id);visualAudit(screen,'register_dates');noRetiredScope(screen,'register_dates');
  assert.match(screen.text,/CHÉPICA PLAY · REGISTRAR RESULTADO/i);
  assert.match(screen.text,/no modifica automáticamente el resultado oficial/i);
  assert.ok(callbacks(screen).includes('mp:home'));
  assert.equal(/Cualquier persona/i.test(screen.text),false);
  printScreen('register_dates',screen);

  const date=firstCb(screen,'obs:date:');
  r=await cb(actor,date);assert.equal(r.handled,'observation_round');
  screen=last(actor.id);visualAudit(screen,'register_round');
  assert.match(screen.text,/Selecciona el partido/i);
  printScreen('register_round',screen);

  const match=firstCb(screen,'obs:match:');
  r=await cb(actor,match);assert.equal(r.handled,'observation_series');
  screen=last(actor.id);visualAudit(screen,'register_series');
  assert.match(screen.text,/Selecciona la serie/i);
  assert.match(screen.text,/nunca lo sobrescribe/i);
  assert.equal(/lo que viste/i.test(screen.text),false);
  printScreen('register_series',screen);

  const series=firstCb(screen,'obs:series:');
  r=await cb(actor,series);assert.equal(r.handled,'observation_home_score');
  screen=last(actor.id);visualAudit(screen,'home_score');
  assert.match(screen.text,/¿Cuántos goles hizo/i);
  assert.ok(callbacks(screen).includes(`obs:h:${homeScore}`));
  printScreen('home_score',screen);

  r=await cb(actor,`obs:h:${homeScore}`);assert.equal(r.handled,'observation_away_score');
  screen=last(actor.id);visualAudit(screen,'away_score');
  assert.match(screen.text,/Marcador parcial/i);
  assert.ok(callbacks(screen).includes(`obs:a:${awayScore}`));
  printScreen('away_score',screen);

  r=await cb(actor,`obs:a:${awayScore}`);assert.equal(r.handled,'observation_confirm');
  screen=last(actor.id);visualAudit(screen,'confirm_result');
  assert.match(screen.text,/CONFIRMAR RESULTADO/i);
  assert.match(screen.text,/Origen: Chépica Play/i);
  assert.match(screen.text,/¿Confirmas que el marcador ingresado es correcto\?/i);
  assert.equal(/lo que viste/i.test(screen.text),false);
  assert.ok(callbacks(screen).includes('obs:confirm'));
  assert.ok(callbacks(screen).includes('obs:change'));
  assert.ok(callbacks(screen).includes('obs:cancel'));
  printScreen('confirm_result',screen);

  r=await cb(actor,'obs:confirm');assert.equal(r.handled,'observation_submitted');
  screen=last(actor.id);visualAudit(screen,'result_received');
  assert.match(screen.text,/INFORMACIÓN RECIBIDA/i);
  assert.match(screen.text,/Origen registrado: Chépica Play/i);
  assert.match(screen.text,/Estado del aporte: PENDIENTE/i);
  assert.ok(callbacks(screen).includes('mp:home'));
  assert.ok(callbacks(screen).includes('obs:dates'));
  printScreen('result_received',screen);
  return r.submission_id;
}

try{
  applyMigrations();
  await seed(OP,'PLATFORM_OPERATOR','VERIFIED');
  await seed(MEDIA_A);
  await seed(MEDIA_B);
  await seed(VISITOR);

  const tokenA=await createInvite();
  const tokenB=await createInvite();
  await claim(MEDIA_A,tokenA);
  await claim(MEDIA_B,tokenB);

  let r=await msg(OP,'/medios');assert.equal(r.handled,'media_partner_management');
  let screen=last(OP.id);visualAudit(screen,'admin_partner_management');noRetiredScope(screen,'admin_partner_management');
  assert.match(screen.text,/Personas vinculadas: 2/i);
  assert.match(screen.text,/Consultar resultados/i);
  assert.match(screen.text,/Registrar resultados/i);
  assert.ok(callbacks(screen).includes('mp:collab:invite'));
  assert.ok(callbacks(screen).includes('mp:members'));
  printScreen('admin_partner_management',screen);

  r=await cb(OP,'mp:members');assert.equal(r.handled,'media_partner_members');
  screen=last(OP.id);visualAudit(screen,'members');noRetiredScope(screen,'members');
  assert.match(screen.text,/PERSONAS VINCULADAS · Chépica Play/i);
  assert.match(screen.text,/Integrante A/i);
  assert.match(screen.text,/Integrante B/i);
  assert.match(screen.text,/Revocar a una no afecta a las demás/i);
  printScreen('members',screen);

  r=await cb(OP,'mp:invites');assert.equal(r.handled,'media_partner_invites');
  screen=last(OP.id);visualAudit(screen,'invites');noRetiredScope(screen,'invites');
  assert.match(screen.text,/INVITACIONES · Chépica Play/i);
  assert.match(screen.text,/propio enlace individual y de un solo uso/i);
  printScreen('invites',screen);
  console.log('PASS visual agent: admin surfaces are concise, multi-person and limited to current capabilities');

  for(const actor of [MEDIA_A,MEDIA_B]){
    r=await msg(actor,'/partner');assert.equal(r.handled,'media_partner_home');
    screen=last(actor.id);visualAudit(screen,'partner_home');noRetiredScope(screen,'partner_home');
    assert.match(screen.text,/ACCESOS HABILITADOS/i);
    assert.match(screen.text,/Consultar resultados/i);
    assert.match(screen.text,/Registrar resultado/i);
    assert.match(screen.text,/validación antes de convertirse en oficial/i);
    assert.deepEqual(callbacks(screen).filter(x=>x!=='tp:home').sort(),['obs:dates','tp:public-results'].sort());
    printScreen(`partner_home_${actor.id}`,screen);
  }
  console.log('PASS visual agent: both synthetic members receive the same two-action home contract');

  r=await msg(VISITOR,'/partner');assert.equal(r.handled,'media_partner_home');
  screen=last(VISITOR.id);visualAudit(screen,'unlinked_home');
  assert.match(screen.text,/no tiene acceso/i);
  assert.equal(callbacks(screen).includes('obs:dates'),false);
  printScreen('unlinked_home',screen);
  console.log('PASS visual agent: unlinked identity cannot see the register-result action');

  const subA=await runRegistration(MEDIA_A,2,1);
  const subB=await runRegistration(MEDIA_B,1,0);
  assert.notEqual(subA,subB);
  const rowA=await one('SELECT submitter_id,source_type,source_label,status FROM public_result_submissions WHERE submission_id=?',subA);
  const rowB=await one('SELECT submitter_id,source_type,source_label,status FROM public_result_submissions WHERE submission_id=?',subB);
  assert.equal(rowA.submitter_id,String(MEDIA_A.id));assert.equal(rowB.submitter_id,String(MEDIA_B.id));
  assert.equal(rowA.source_type,'MEDIA_PARTNER');assert.equal(rowB.source_type,'MEDIA_PARTNER');
  assert.equal(rowA.source_label,'Chépica Play');assert.equal(rowB.source_label,'Chépica Play');
  assert.equal(rowA.status,'SUBMITTED');assert.equal(rowB.status,'SUBMITTED');
  console.log('PASS visual agent: two identities complete independent registration paths with person + organization provenance');

  r=await cb(MEDIA_A,'obs:dates');assert.equal(r.handled,'observation_dates');
  r=await cb(MEDIA_A,'obs:cancel');assert.equal(r.handled,'observation_cancel');
  screen=last(MEDIA_A.id);visualAudit(screen,'partner_cancel');
  assert.ok(callbacks(screen).includes('mp:home'));
  assert.equal(callbacks(screen).includes('tp:public'),false);
  console.log('PASS visual agent: cancel returns a Chépica Play member to the partner space');

  r=await cb(MEDIA_A,'tp:public-results');assert.equal(r.handled,'portal_public_results');
  screen=last(MEDIA_A.id);visualAudit(screen,'consume_results',{allowInternal:false});
  console.log('PASS visual agent: consumer path reaches the published-results projection without exposing technical role names');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
