import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-visual-neg-token',TELEGRAM_WEBHOOK_SECRET:'qa-visual-neg-secret'};
const sent=[];
const originalFetch=globalThis.fetch;
const OP={id:9973001,first_name:'Operador',last_name:'Visual'};
const MEMBER={id:9973002,first_name:'Integrante',last_name:'Prueba'};
const MEMBER_B={id:9973003,first_name:'Integrante',last_name:'Respaldo'};
const OUTSIDER={id:9973004,first_name:'Visitante',last_name:'Prueba'};
let updateId=973000;

globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-visual-neg-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  sent.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:sent.length}}),{status:200,headers:{'content-type':'application/json'}});
};

function migrate(){const dir=path.join(root,'sports-bus','migrations');for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())env.DB.exec(fs.readFileSync(path.join(dir,f),'utf8'));}
async function secret(){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function dispatch(update){const req=new Request('https://qa.invalid/webhook/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await secret()},body:JSON.stringify({update_id:++updateId,...update})});const res=await worker.fetch(req,env,{});assert.equal(res.status,200);return res.json();}
async function msg(actor,text){return dispatch({message:{message_id:updateId+1,from:actor,chat:{id:actor.id,type:'private'},text}});}
async function cb(actor,data,id=`cb-${updateId+1}`){return dispatch({callback_query:{id,from:actor,data,message:{message_id:70,chat:{id:actor.id,type:'private'}}}});}
async function seed(actor,role='REPORTER',trust='PROVISIONAL'){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,?,?,1,?,?)`).bind(String(actor.id),`${actor.first_name} ${actor.last_name}`,null,role,trust,now,now).run();}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}
function last(id){return sent.filter(x=>x.method==='sendMessage'&&String(x.body.chat_id)===String(id)).at(-1)?.body;}
function buttons(s){return (s?.reply_markup?.inline_keyboard||[]).flat();}
function cbs(s){return buttons(s).map(b=>b.callback_data).filter(Boolean);}
function first(s,prefix){const x=cbs(s).find(v=>v.startsWith(prefix));assert.ok(x,`missing callback ${prefix}`);return x;}
function screenAudit(s,label){
  assert.ok(s?.text?.trim(),`${label}: blank screen`);
  assert.ok(s.text.length<=4096,`${label}: Telegram text overflow`);
  for(const token of ['MEDIA_PARTNER','READ_COMPETITION','OBSERVE_RESULT','PUBLISH_MATCH_EVENT','telegram_user_id','partner_code','VERIFIED','PROVISIONAL']) assert.equal(s.text.includes(token),false,`${label}: leaked technical token ${token}`);
  const seen=new Set();
  for(const b of buttons(s)){assert.ok(String(b.text||'').trim(),`${label}: blank button`);if(b.callback_data){assert.ok(Buffer.byteLength(b.callback_data)<=64,`${label}: callback too long`);assert.equal(seen.has(b.callback_data),false,`${label}: duplicated callback`);seen.add(b.callback_data);}}
}
function snap(label,s){console.log(`SCREEN ${label}\n${s.text}\n${(s.reply_markup?.inline_keyboard||[]).map(r=>r.map(b=>`[${b.text}]`).join(' ')).join('\n')}\n---`);}
async function invite(){const r=await cb(OP,'mp:collab:invite');assert.equal(r.handled,'media_partner_collaboration_invite_created');const s=last(OP.id);const token=s.text.match(/partner_([A-Za-z0-9_-]{12,80})/)?.[1];assert.ok(token);return {id:r.invite_id,token};}
async function claim(actor,token){const r=await msg(actor,`/start partner_${token}`);assert.equal(r.handled,'media_partner_collaboration_claimed');return r;}
async function selectSeries(actor,seriesIndex=0){
  let r=await cb(actor,'obs:dates');assert.equal(r.handled,'observation_dates');let s=last(actor.id);
  r=await cb(actor,first(s,'obs:date:'));assert.equal(r.handled,'observation_round');s=last(actor.id);
  r=await cb(actor,first(s,'obs:match:'));assert.equal(r.handled,'observation_series');s=last(actor.id);
  const seriesButtons=cbs(s).filter(x=>x.startsWith('obs:series:'));assert.ok(seriesButtons.length>=4);
  const chosen=seriesButtons[seriesIndex%seriesButtons.length];
  r=await cb(actor,chosen);assert.equal(r.handled,'observation_home_score');
  return {seriesCb:chosen,matchCb:chosen.replace(/^obs:series:([^:]+):.*$/,'obs:match:$1')};
}

try{
  migrate();
  await seed(OP,'PLATFORM_OPERATOR','VERIFIED');await seed(MEMBER);await seed(MEMBER_B);await seed(OUTSIDER);
  const invA=await invite(),invB=await invite(),spare=await invite(),revokable=await invite(),expiring=await invite();
  await claim(MEMBER,invA.token);await claim(MEMBER_B,invB.token);

  // Already-linked identity cannot consume a spare invite intended for another person.
  let r=await msg(MEMBER,`/start partner_${spare.token}`);assert.equal(r.handled,'media_partner_already_member');
  let s=last(MEMBER.id);screenAudit(s,'already_member');assert.match(s.text,/Ya tienes acceso a Chépica Play/i);assert.match(s.text,/sigue disponible para otra persona/i);assert.equal((await one('SELECT status FROM partner_scope_invites WHERE invite_id=?',spare.id)).status,'PENDING');snap('already_member',s);
  console.log('PASS visual negative: already-linked identity does not consume another person invitation');

  // Revoked invite gives a clear, closed response and creates no membership.
  r=await cb(OP,`mp:invite-revoke:${revokable.id}`);assert.equal(r.handled,'media_partner_invite_revoked');
  r=await msg(OUTSIDER,`/start partner_${revokable.token}`);assert.equal(r.handled,'media_partner_claim_invalid');s=last(OUTSIDER.id);screenAudit(s,'revoked_invite');assert.match(s.text,/no es válida|revocada|venció/i);assert.equal(await one("SELECT grant_id FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND active=1",String(OUTSIDER.id)),null);snap('revoked_invite',s);
  console.log('PASS visual negative: revoked invite fails closed without creating access');

  // Expired invite behaves the same way and cannot create access.
  await env.DB.prepare("UPDATE partner_scope_invites SET expires_at='2000-01-01T00:00:00.000Z' WHERE invite_id=?").bind(expiring.id).run();
  r=await msg(OUTSIDER,`/start partner_${expiring.token}`);assert.equal(r.handled,'media_partner_claim_invalid');s=last(OUTSIDER.id);screenAudit(s,'expired_invite');assert.match(s.text,/no es válida|venció/i);assert.equal((await one('SELECT status FROM partner_scope_invites WHERE invite_id=?',expiring.id)).status,'EXPIRED');snap('expired_invite',s);
  console.log('PASS visual negative: expired invite fails closed and visibly explains invalid access');

  // Cancel destroys the session; a stale score button after cancel cannot mutate state.
  await selectSeries(MEMBER,0);const staleButton='obs:h:2';
  r=await cb(MEMBER,'obs:cancel');assert.equal(r.handled,'observation_cancel');
  r=await cb(MEMBER,staleButton);assert.equal(r.handled,'observation_stale_session');s=last(MEMBER.id);screenAudit(s,'stale_after_cancel');assert.match(s.text,/selección ya no está activa|Sesión/i);assert.equal(await one('SELECT telegram_user_id FROM telegram_public_result_sessions WHERE telegram_user_id=?',String(MEMBER.id)),null);snap('stale_after_cancel',s);
  console.log('PASS visual negative: stale score callback after cancel cannot resurrect a session');

  // Change-marker path reopens score entry and only the corrected score is submitted.
  const chosen=await selectSeries(MEMBER,1);
  await cb(MEMBER,'obs:h:2');await cb(MEMBER,'obs:a:1');
  s=last(MEMBER.id);assert.match(s.text,/CONFIRMAR RESULTADO/i);
  r=await cb(MEMBER,'obs:change');assert.equal(r.handled,'observation_change');s=last(MEMBER.id);screenAudit(s,'change_marker');assert.match(s.text,/¿Cuántos goles hizo/i);assert.equal(cbs(s).includes('obs:h:1'),true);snap('change_marker',s);
  await cb(MEMBER,'obs:h:1');await cb(MEMBER,'obs:a:0');r=await cb(MEMBER,'obs:confirm');assert.equal(r.handled,'observation_submitted');
  let row=await one('SELECT home_score,away_score,status FROM public_result_submissions WHERE submission_id=?',r.submission_id);assert.equal(Number(row.home_score),1);assert.equal(Number(row.away_score),0);assert.equal(row.status,'SUBMITTED');
  console.log('PASS visual negative: change-marker replaces draft values before the single submitted observation');

  // Same person + same match/series remains idempotent while pending.
  const parts=chosen.seriesCb.match(/^obs:series:([^:]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);assert.ok(parts);const [,matchId,seriesCode]=parts;
  await cb(MEMBER,`obs:match:${matchId}`);r=await cb(MEMBER,`obs:series:${matchId}:${seriesCode}`);assert.equal(r.handled,'observation_duplicate_pending');s=last(MEMBER.id);screenAudit(s,'duplicate_pending');assert.match(s.text,/Ya tienes una observación pendiente/i);assert.equal(Number((await one("SELECT COUNT(*) n FROM public_result_submissions WHERE submitter_id=? AND match_id=? AND series_code=? AND status='SUBMITTED'",String(MEMBER.id),matchId,seriesCode)).n),1);snap('duplicate_pending',s);
  console.log('PASS visual negative: duplicate pending result is explained and not duplicated');

  // High-score branch remains button-first and bounded; 8+ can become 9 then submit.
  await selectSeries(MEMBER_B,2);r=await cb(MEMBER_B,'obs:h:more');assert.equal(r.handled,'observation_high_score');s=last(MEMBER_B.id);screenAudit(s,'high_score_8');assert.match(s.text,/Marcador alto: 8/i);assert.ok(cbs(s).includes('obs:step:h:inc'));snap('high_score_8',s);
  r=await cb(MEMBER_B,'obs:step:h:inc');assert.equal(r.handled,'observation_high_score_adjust');s=last(MEMBER_B.id);screenAudit(s,'high_score_9');assert.match(s.text,/Marcador alto: 9/i);snap('high_score_9',s);
  r=await cb(MEMBER_B,'obs:step:h:ok');assert.equal(r.handled,'observation_away_score');await cb(MEMBER_B,'obs:a:0');r=await cb(MEMBER_B,'obs:confirm');assert.equal(r.handled,'observation_submitted');row=await one('SELECT home_score,away_score FROM public_result_submissions WHERE submission_id=?',r.submission_id);assert.equal(Number(row.home_score),9);assert.equal(Number(row.away_score),0);
  console.log('PASS visual boundary: 8+ stepper remains usable and submits the selected high score');

  // Revoking one person must not alter the other person or the organization.
  const grant=await one("SELECT grant_id FROM actor_scope_grants WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND active=1",String(MEMBER.id));assert.ok(grant);
  r=await cb(OP,`mp:member-revoke:${grant.grant_id}`);assert.equal(r.handled,'media_partner_member_revoked');
  r=await msg(MEMBER,'/partner');assert.equal(r.handled,'media_partner_home');s=last(MEMBER.id);screenAudit(s,'revoked_member_home');assert.match(s.text,/no tiene acceso/i);assert.equal(cbs(s).includes('obs:dates'),false);snap('revoked_member_home',s);
  r=await msg(MEMBER_B,'/partner');assert.equal(r.handled,'media_partner_home');s=last(MEMBER_B.id);screenAudit(s,'remaining_member_home');assert.ok(cbs(s).includes('obs:dates'));assert.match(s.text,/Registrar resultado/i);snap('remaining_member_home',s);
  console.log('PASS visual negative: revoking one person removes only that access and leaves another member operational');

  console.log('RESULT: PASS');
}finally{globalThis.fetch=originalFetch;env.DB.close();}
