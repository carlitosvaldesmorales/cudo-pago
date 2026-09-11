import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-visual-token',TELEGRAM_WEBHOOK_SECRET:'qa-visual-secret'};
const sent=[];
const originalFetch=globalThis.fetch;
const OP={id:9962001,first_name:'Operador',last_name:'QA'};
const A={id:9962002,first_name:'Integrante',last_name:'A'};
const B={id:9962003,first_name:'Integrante',last_name:'B'};
const VISITOR={id:9962004,first_name:'Visitante',last_name:'QA'};
let updateId=962000;

globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-visual-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  sent.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:sent.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function migrate(){const dir=path.join(root,'sports-bus','migrations');for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())env.DB.exec(fs.readFileSync(path.join(dir,f),'utf8'));}
async function secret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await secret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function cb(actor,data,id=`cb-${updateId+1}`){return dispatch({callback_query:{id,from:actor,data,message:{message_id:55,chat:{id:actor.id,type:'private'}}}});}
async function seed(actor,role='REPORTER',trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,role,trust,now,now).run();}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
function last(id){return sent.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(id)).at(-1)?.body;}
function btns(screen){return (screen?.reply_markup?.inline_keyboard||[]).flat();}
function cbs(screen){return btns(screen).map(x=>x.callback_data).filter(Boolean);}
function first(screen,prefix){const x=cbs(screen).find(v=>v.startsWith(prefix));assert.ok(x,`Missing ${prefix}`);return x;}
function audit(screen,label){
  assert.ok(screen?.text?.trim(),`${label}: empty screen`);
  assert.ok(screen.text.length<=4096,`${label}: Telegram text overflow`);
  const internal=['MEDIA_PARTNER','READ_COMPETITION','OBSERVE_RESULT','PUBLISH_MATCH_EVENT','telegram_user_id','partner_code','VERIFIED','PROVISIONAL'];
  for(const t of internal){assert.equal(screen.text.includes(t),false,`${label}: leaked ${t}`);assert.equal(btns(screen).some(b=>String(b.text).includes(t)),false,`${label}: leaked button ${t}`);}
  const seen=new Set();
  for(const b of btns(screen)){assert.ok(String(b.text||'').trim(),`${label}: blank button`);if(b.callback_data){assert.ok(Buffer.byteLength(b.callback_data)<=64,`${label}: callback too long`);assert.equal(seen.has(b.callback_data),false,`${label}: duplicate callback`);seen.add(b.callback_data);}}
}
function activeOnly(screen,label){assert.equal(/coberturas|corresponsales|eventos en vivo|goles\/eventos/i.test(screen.text),false,`${label}: retired scope in active UI`);assert.equal(cbs(screen).some(x=>x.startsWith('mp:coverage')||x.startsWith('mplive:')||x==='mp:hub'||x==='mp:mycoverages'),false,`${label}: retired action exposed`);}
function snapshot(label,screen){console.log(`SCREEN ${label}\n${screen.text}\n${(screen.reply_markup?.inline_keyboard||[]).map(r=>r.map(b=>`[${b.text}]`).join(' ')).join('\n')}\n---`);}
async function invite(){const r=await cb(OP,'mp:collab:invite');assert.equal(r.handled,'media_partner_collaboration_invite_created');const s=last(OP.id);audit(s,'invite');activeOnly(s,'invite');assert.match(s.text,/INVITAR A CHÉPICA PLAY/i);assert.match(s.text,/individual y de un solo uso/i);assert.match(s.text,/Consultar resultados/i);assert.match(s.text,/Registrar resultados/i);const token=s.text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];assert.ok(token);snapshot('invite',s);return token;}
async function claim(actor,token){const r=await msg(actor,`/start partner_${token}`);assert.equal(r.handled,'media_partner_collaboration_claimed');const s=last(actor.id);audit(s,'claim');activeOnly(s,'claim');assert.match(s.text,/ACCESO ACTIVADO · Chépica Play/i);assert.match(s.text,/Consultar resultados/i);assert.match(s.text,/Registrar resultados/i);assert.ok(cbs(s).includes('tp:public-results'));assert.ok(cbs(s).includes('obs:dates'));snapshot(`claim_${actor.id}`,s);}

async function register(actor,homeScore,awayScore){
  let r=await cb(actor,'obs:dates');assert.equal(r.handled,'observation_dates');let s=last(actor.id);audit(s,'dates');activeOnly(s,'dates');assert.match(s.text,/CHÉPICA PLAY · REGISTRAR RESULTADO/i);assert.equal(/Cualquier persona/i.test(s.text),false);assert.ok(cbs(s).includes('mp:home'));snapshot('dates',s);
  r=await cb(actor,first(s,'obs:date:'));assert.equal(r.handled,'observation_round');s=last(actor.id);audit(s,'round');assert.match(s.text,/Selecciona el partido/i);snapshot('round',s);
  r=await cb(actor,first(s,'obs:match:'));assert.equal(r.handled,'observation_series');s=last(actor.id);audit(s,'series');assert.match(s.text,/Selecciona la serie/i);assert.equal(/lo que viste/i.test(s.text),false);snapshot('series',s);
  r=await cb(actor,first(s,'obs:series:'));assert.equal(r.handled,'observation_home_score');s=last(actor.id);audit(s,'home');assert.ok(cbs(s).includes(`obs:h:${homeScore}`));snapshot('home',s);
  r=await cb(actor,`obs:h:${homeScore}`);assert.equal(r.handled,'observation_away_score');s=last(actor.id);audit(s,'away');assert.match(s.text,/Marcador parcial/i);assert.ok(cbs(s).includes(`obs:a:${awayScore}`));snapshot('away',s);
  r=await cb(actor,`obs:a:${awayScore}`);assert.equal(r.handled,'observation_confirm');s=last(actor.id);audit(s,'confirm');assert.match(s.text,/CONFIRMAR RESULTADO/i);assert.match(s.text,/Origen: Chépica Play/i);assert.match(s.text,/marcador ingresado es correcto/i);assert.ok(cbs(s).includes('obs:confirm'));assert.ok(cbs(s).includes('obs:change'));assert.ok(cbs(s).includes('obs:cancel'));snapshot('confirm',s);
  r=await cb(actor,'obs:confirm');assert.equal(r.handled,'observation_submitted');s=last(actor.id);audit(s,'received');assert.match(s.text,/INFORMACIÓN RECIBIDA/i);assert.match(s.text,/Origen registrado: Chépica Play/i);assert.match(s.text,/Estado del aporte: PENDIENTE/i);assert.ok(cbs(s).includes('mp:home'));snapshot('received',s);return r.submission_id;
}

try{
  migrate();await seed(OP,'PLATFORM_OPERATOR','VERIFIED');await seed(A);await seed(B);await seed(VISITOR);
  const ta=await invite(),tb=await invite();await claim(A,ta);await claim(B,tb);

  let r=await msg(OP,'/medios');assert.equal(r.handled,'media_partner_management');let s=last(OP.id);audit(s,'manage');activeOnly(s,'manage');assert.match(s.text,/Personas vinculadas: 2/i);assert.match(s.text,/Consultar resultados/i);assert.match(s.text,/Registrar resultados/i);snapshot('manage',s);
  r=await cb(OP,'mp:members');assert.equal(r.handled,'media_partner_members');s=last(OP.id);audit(s,'members');activeOnly(s,'members');assert.match(s.text,/PERSONAS VINCULADAS · Chépica Play/i);assert.match(s.text,/Integrante A/i);assert.match(s.text,/Integrante B/i);snapshot('members',s);
  r=await cb(OP,'mp:invites');assert.equal(r.handled,'media_partner_invites');s=last(OP.id);audit(s,'invites');activeOnly(s,'invites');assert.match(s.text,/INVITACIONES · Chépica Play/i);assert.match(s.text,/enlace individual y de un solo uso/i);snapshot('invites',s);
  console.log('PASS visual agent: admin surfaces are concise, multi-person and limited to current capabilities');

  for(const actor of [A,B]){r=await msg(actor,'/partner');assert.equal(r.handled,'media_partner_home');s=last(actor.id);audit(s,'home');activeOnly(s,'home');assert.match(s.text,/ACCESOS HABILITADOS/i);assert.match(s.text,/Consultar resultados/i);assert.match(s.text,/Registrar resultado/i);assert.deepEqual(cbs(s).filter(x=>x!=='tp:home').sort(),['obs:dates','tp:public-results'].sort());snapshot(`home_${actor.id}`,s);}
  console.log('PASS visual agent: both synthetic members receive the same two-action home contract');

  r=await msg(VISITOR,'/partner');assert.equal(r.handled,'media_partner_home');s=last(VISITOR.id);audit(s,'visitor');assert.match(s.text,/no tiene acceso/i);assert.equal(cbs(s).includes('obs:dates'),false);snapshot('visitor',s);
  console.log('PASS visual agent: unlinked identity cannot see the register-result action');

  const sa=await register(A,2,1),sb=await register(B,1,0);assert.notEqual(sa,sb);
  const ra=await one('SELECT submitter_id,source_type,source_label,status FROM public_result_submissions WHERE submission_id=?',sa);const rb=await one('SELECT submitter_id,source_type,source_label,status FROM public_result_submissions WHERE submission_id=?',sb);
  assert.equal(ra.submitter_id,String(A.id));assert.equal(rb.submitter_id,String(B.id));assert.equal(ra.source_type,'MEDIA_PARTNER');assert.equal(rb.source_type,'MEDIA_PARTNER');assert.equal(ra.source_label,'Chépica Play');assert.equal(rb.source_label,'Chépica Play');assert.equal(ra.status,'SUBMITTED');assert.equal(rb.status,'SUBMITTED');
  console.log('PASS visual agent: two identities complete independent registration paths with person + organization provenance');

  r=await cb(A,'obs:dates');assert.equal(r.handled,'observation_dates');r=await cb(A,'obs:cancel');assert.equal(r.handled,'observation_cancel');s=last(A.id);audit(s,'cancel');assert.ok(cbs(s).includes('mp:home'));assert.equal(cbs(s).includes('tp:public'),false);
  console.log('PASS visual agent: cancel returns a Chépica Play member to the partner space');

  r=await cb(A,'tp:public-results');assert.equal(r.handled,'portal_public_results');s=last(A.id);audit(s,'consume');
  console.log('PASS visual agent: consumer path reaches the published-results projection without exposing technical role names');
  console.log('RESULT: PASS');
}finally{globalThis.fetch=originalFetch;env.DB.close();}
