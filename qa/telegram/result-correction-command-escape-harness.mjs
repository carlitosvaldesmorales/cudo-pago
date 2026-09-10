import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import route from '../../sports-bus/telegram-route-clarity-entry.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={DB:new D1SqliteAdapter(),TELEGRAM_BOT_TOKEN:'primary-token',TELEGRAM_BOT_TOKEN_NEXT:'next-token',TELEGRAM_WEBHOOK_SECRET:'root-secret'};
const calls=[];
const originalFetch=globalThis.fetch;

globalThis.fetch=async (url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/bot')) throw new Error(`Unexpected network call: ${target}`);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method:target.split('/').at(-1),body});
  return new Response(JSON.stringify({ok:true,result:true}),{status:200,headers:{'content-type':'application/json'}});
};

function applyMigrations(){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}
async function safeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

try{
  applyMigrations();
  const now='2026-09-10T16:30:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES ('900001','Admin Global QA','globalqa',NULL,'SUPER_ADMIN','VERIFIED',1,?,?)`).bind(now,now).run();
  const seed=await env.DB.prepare(`SELECT match_id,series_code,governance_version FROM match_series_results WHERE validation_status='VERIFIED' LIMIT 1`).first();
  assert.ok(seed,'verified result required');
  await env.DB.prepare(`INSERT OR REPLACE INTO telegram_result_governance_sessions
    (telegram_user_id,chat_id,match_id,series_code,action,state,created_at,updated_at,phase,base_version)
    VALUES ('900001','900001',?,?,'CORRECT','AWAIT_SCORE',?,?,'SCORE',?)`)
    .bind(seed.match_id,seed.series_code,now,now,Number(seed.governance_version||1)).run();

  const secret=await safeSecret(`${env.TELEGRAM_WEBHOOK_SECRET}:next`);
  const update={update_id:123,message:{message_id:44,from:{id:900001,first_name:'Admin'},chat:{id:900001,type:'private'},text:'/correcciones'}};
  const response=await route.fetch(new Request('https://qa.invalid/webhook/telegram-next',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(update)}),env,{});
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.handled,'result_governance_ux_list','/correcciones must reach normal governance routing');
  const session=await env.DB.prepare('SELECT * FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind('900001').first();
  assert.equal(session,null,'navigation command must clear stale correction session');
  const outgoing=calls.filter(x=>x.method==='sendMessage');
  assert.equal(outgoing.length,1,'command should produce exactly one governance response');
  assert.match(outgoing[0].body.text,/GOBIERNO DE RESULTADOS/);
  assert.doesNotMatch(outgoing[0].body.text,/Escribe sólo el nuevo marcador|MOTIVO DE LA CORRECCIÓN/);

  console.log('PASS navigation command escapes stale correction session');
  console.log('PASS /correcciones reaches governance list exactly once');
  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
