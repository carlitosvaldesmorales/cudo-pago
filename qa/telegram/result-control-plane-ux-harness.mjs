import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import route from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { loadResultControlPlane } from '../../sports-bus/worker/result-control-plane-model.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'qa-control-token',TELEGRAM_BOT_TOKEN_NEXT:'qa-control-next',TELEGRAM_WEBHOOK_SECRET:'qa-control-secret'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method:target.split('/').at(-1),body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200,headers:{'content-type':'application/json'}});
};

for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
  env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}

async function secret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
let updateId=88000;
const SUPER={id:880001,first_name:'Control',last_name:'Global',username:'control_global'};
async function dispatch(update){
  const response=await route.fetch(new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':await secret(env.TELEGRAM_WEBHOOK_SECRET)},
    body:JSON.stringify({update_id:++updateId,...update})
  }),env,{});
  assert.equal(response.status,200);
  return response.json();
}
async function message(text){return dispatch({message:{message_id:updateId+1,from:SUPER,chat:{id:SUPER.id,type:'private'},text}})}
async function callback(data){return dispatch({callback_query:{id:`cb-${updateId+1}`,from:SUPER,data,message:{message_id:updateId+1,chat:{id:SUPER.id,type:'private'}}}})}
function sent(){return calls.filter(x=>x.method==='sendMessage'||x.method==='editMessageText')}
function last(){const rows=sent();assert.ok(rows.length);return rows.at(-1).body}
function flatButtons(body){return (body.reply_markup?.inline_keyboard||[]).flat()}

try{
  const now='2026-09-11T17:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`)
    .bind(String(SUPER.id),'Control Global','control_global',now,now).run();

  // Force one deterministic mixed match: one OFFICIAL slot + three MISSING slots.
  const match=await env.DB.prepare("SELECT * FROM matches WHERE competition_id='ANFA-CHEPICA-2026' ORDER BY round_no,match_id LIMIT 1").first();
  assert.ok(match);
  await env.DB.prepare('DELETE FROM match_series_results WHERE match_id=?').bind(match.match_id).run();
  await env.DB.prepare(`INSERT INTO match_series_results
    (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version)
    VALUES (?,?,?,?,?,'VERIFIED','QA','QA desired actual','qa-control',NULL,?,?,1)`)
    .bind(`${match.match_id}-TERCERA`,match.match_id,'TERCERA',2,1,now,now).run();

  const model=await loadResultControlPlane(env.DB,{reporter:{role:'SUPER_ADMIN'}});
  const mixed=model.matches.find(x=>x.match_id===match.match_id);
  assert.equal(mixed.counts.OFFICIAL,1);
  assert.equal(mixed.counts.MISSING,3);
  assert.equal(mixed.slots.length,4);

  calls.length=0;
  let result=await message('/correcciones');
  assert.equal(result.handled,'result_governance_ux_list');
  let panel=last();
  assert.match(panel.text,/GOBIERNO DE RESULTADOS/);
  assert.match(panel.text,new RegExp(`Esperados: <b>${model.summary.expected_slots}<\\/b>`));
  assert.match(panel.text,new RegExp(`Sin resultado: <b>${model.summary.MISSING}<\\/b>`));
  const matchButtons=flatButtons(panel).filter(x=>String(x.callback_data||'').startsWith('rgux:m:'));
  assert.equal(matchButtons.length,model.matches.length,'control plane must list every fixture match, not only matches with stored results');
  assert.ok(matchButtons.some(x=>x.callback_data===`rgux:m:${match.match_id}`&&/1\/4/.test(x.text)));

  calls.length=0;
  result=await callback(`rgux:m:${match.match_id}`);
  assert.equal(result.handled,'result_governance_ux_match');
  panel=last();
  assert.match(panel.text,/1\/4 oficiales/);
  assert.match(panel.text,/3 sin resultado/);
  const seriesButtons=flatButtons(panel).filter(x=>/^(rg:r:|ga:series:)/.test(String(x.callback_data||'')));
  assert.equal(seriesButtons.length,4,'all four expected series must be visible');
  assert.ok(seriesButtons.some(x=>x.callback_data===`rg:r:${match.match_id}:TERCERA`&&/2–1/.test(x.text)));
  for(const code of ['SEGUNDA','SENIOR','PRIMERA']){
    assert.ok(seriesButtons.some(x=>x.callback_data===`ga:series:${match.match_id}:${code}`&&/Sin resultado/.test(x.text)),`${code} missing slot must be governable`);
  }

  console.log('PASS government list is built from fixture inventory, not result rows');
  console.log('PASS summary exposes expected vs actual result-slot counts');
  console.log('PASS every normal group-stage match exposes four expected series');
  console.log('PASS missing series remain visible and actionable for SUPER_ADMIN');
  console.log('PASS observed official series still routes to governance detail');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
