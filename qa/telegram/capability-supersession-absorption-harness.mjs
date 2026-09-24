import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleTelegramDirigentesHomeRequest } from '../../sports-bus/worker/telegram-dirigentes-home-entry.js';
import { handleResultsRegisterRequest } from '../../sports-bus/worker/results-register-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_WEBHOOK_SECRET:'qa-capability-absorption-secret',
  TELEGRAM_BOT_TOKEN:'qa-capability-absorption-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-capability-absorption-next-token'
};
const SUPER={id:9952301,first_name:'Admin',last_name:'Global'};
const calls=[];
const originalFetch=globalThis.fetch;

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}
async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function callbacks(body){
  return (body?.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);
}
function lastScreen(){
  return [...calls].reverse().find(x=>['editMessageText','sendMessage'].includes(x.method))?.body||{};
}
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:77}}),{status:200,headers:{'content-type':'application/json'}});
};

try{
  applyMigrations();
  const now='2026-09-23T22:00:00-03:00';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(SUPER.id),'Admin Global','admin_global_absorption',now,now).run();

  const match=await env.DB.prepare("SELECT match_id FROM matches WHERE competition_id='ANFA-CHEPICA-2026' ORDER BY round_no,match_id LIMIT 1").first();
  assert.ok(match?.match_id,'fixture match required');
  await env.DB.prepare(`INSERT OR REPLACE INTO public_result_submissions
    (submission_id,match_id,series_code,submitter_id,home_score,away_score,status,source_event_id,created_at,updated_at)
    VALUES ('qa-absorption-pending',?,'TERCERA','qa-public',1,0,'SUBMITTED','qa-absorption-event',?,?)`)
    .bind(match.match_id,now,now).run();

  calls.length=0;
  const homeRequest=new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(`${env.TELEGRAM_WEBHOOK_SECRET}:next`)
    },
    body:JSON.stringify({
      update_id:99523001,
      callback_query:{
        id:'cb-home',
        from:SUPER,
        data:'tp:leaders',
        message:{message_id:77,chat:{id:SUPER.id,type:'private'}}
      }
    })
  });
  let response=await handleTelegramDirigentesHomeRequest(homeRequest,env);
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.access_state,'AUTHORIZED_GLOBAL');
  let screen=lastScreen();
  const homeCallbacks=callbacks(screen);
  for(const expected of ['tp:requests','pr:pending','tp:admins','rr:dates','rg:list','tp:registered','tp:home']){
    assert.ok(homeCallbacks.includes(expected),`SUPER_ADMIN canonical home must expose ${expected}`);
  }
  assert.match(String(screen.text||''),/Resultados por revisar: 1/);
  console.log('PASS canonical SUPER_ADMIN home absorbs access, review, result capture, governance and registered-result capabilities');

  let governed=await env.DB.prepare(`SELECT r.match_id,r.series_code,m.round_no
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026'
    ORDER BY m.round_no,r.match_id LIMIT 1`).first();

  if(!governed){
    governed=await env.DB.prepare(`SELECT m.match_id,m.round_no,'TERCERA' AS series_code
      FROM matches m WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no,m.match_id LIMIT 1`).first();
    const ts=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO match_series_results
      (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version)
      VALUES (?,?,?,?,?,'VERIFIED','QA','QA absorption gate','qa-absorption',NULL,?,?,1)`)
      .bind(`${governed.match_id}-${governed.series_code}`,governed.match_id,governed.series_code,1,0,ts,ts).run();
  }

  async function rr(data){
    calls.length=0;
    const request=new Request('https://qa.invalid/webhook/telegram',{
      method:'POST',
      headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET},
      body:JSON.stringify({
        update_id:99523002,
        callback_query:{id:`cb-${data}`,from:SUPER,data,message:{message_id:77,chat:{id:SUPER.id,type:'private'}}}
      })
    });
    const res=await handleResultsRegisterRequest(request,env,{});
    assert.ok(res,`results register must own ${data}`);
    assert.equal(res.status,200);
    return res.json();
  }

  await rr(`rr:date:${governed.round_no}`);
  await rr(`rr:match:${governed.match_id}`);
  screen=lastScreen();
  assert.ok(
    callbacks(screen).includes(`rg:r:${governed.match_id}:${governed.series_code}`),
    'existing governed result must hand SUPER_ADMIN directly to result governance'
  );
  assert.match(String(screen.text||''),/completar o administrar/i);
  console.log('PASS canonical result capture hands existing governed facts to governance for SUPER_ADMIN');

  const canonical=fs.readFileSync(path.join(root,'sports-bus','canonical-entry.js'),'utf8');
  const homeIndex=canonical.indexOf('handleTelegramDirigentesHomeRequest(request.clone(),env)');
  const fallbackIndex=canonical.indexOf('return coreWorker.fetch(request,env,ctx)');
  assert.ok(homeIndex>=0&&fallbackIndex>homeIndex,'canonical Dirigentes home supersedes legacy fallback');
  console.log('PASS superseding router precedence is explicitly covered by the capability-absorption gate');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
