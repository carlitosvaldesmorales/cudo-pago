import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleResultsRegisterRequest } from '../../sports-bus/worker/results-register-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const env={
  DB:new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN:'qa-role-parity-token',
  TELEGRAM_WEBHOOK_SECRET:'qa-role-parity-secret',
  RESULTS_STREAM:{idFromName:name=>name,get:()=>({fetch:async()=>new Response(null,{status:204})})}
};
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  if(!target.startsWith('https://api.telegram.org/botqa-role-parity-token/')) throw new Error(`Unexpected network call: ${target}`);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:body.message_id||77}}),{status:200,headers:{'content-type':'application/json'}});
};

const ACTOR={
  PUBLIC:{id:9942001,first_name:'Público'},
  CLUB:{id:9942002,first_name:'Club'},
  PLATFORM:{id:9942003,first_name:'Operador'},
  SUPER:{id:9942004,first_name:'Global'}
};
let updateId=942000;
function applyMigrations(){for(const f of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()) env.DB.exec(fs.readFileSync(path.join(migrations,f),'utf8'));}
async function seed(actor,role,clubId=null){const now=new Date().toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,?,?,'VERIFIED',1,?,?)`).bind(String(actor.id),actor.first_name,null,clubId,role,now,now).run();}
async function cb(actor,data){
  const request=new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',
    headers:{'content-type':'application/json','X-Telegram-Bot-Api-Secret-Token':env.TELEGRAM_WEBHOOK_SECRET},
    body:JSON.stringify({update_id:++updateId,callback_query:{id:`cb-${updateId}`,from:actor,data,message:{message_id:77,chat:{id:actor.id,type:'private'}}}})
  });
  const response=await handleResultsRegisterRequest(request,env,{});
  assert.ok(response,'shared results register must own this callback');
  assert.equal(response.status,200);
  return response.json();
}
function lastScreen(){return [...calls].reverse().find(x=>['editMessageText','sendMessage'].includes(x.method))?.body||{};}
function callbacks(body=lastScreen()){return (body.reply_markup?.inline_keyboard||[]).flat().map(x=>x.callback_data).filter(Boolean);}
async function one(sql,...args){return env.DB.prepare(sql).bind(...args).first();}

try{
  applyMigrations();
  const club=await one('SELECT team_id FROM teams WHERE active=1 ORDER BY team_id LIMIT 1');
  assert.ok(club?.team_id);
  await seed(ACTOR.CLUB,'CLUB_ADMIN',club.team_id);
  await seed(ACTOR.PLATFORM,'PLATFORM_OPERATOR');
  await seed(ACTOR.SUPER,'SUPER_ADMIN');

  for(const actor of [ACTOR.PUBLIC,ACTOR.CLUB,ACTOR.PLATFORM,ACTOR.SUPER]){
    calls.length=0;
    const r=await cb(actor,'rr:dates');
    assert.equal(r.handled,'results_register_dates');
    assert.ok(callbacks().some(x=>x.startsWith('rr:date:')));
    assert.doesNotMatch(String(lastScreen().text||''),/Escribe el marcador|LOCAL-VISITA/i);
  }
  console.log('PASS public, CLUB_ADMIN, PLATFORM_OPERATOR and SUPER_ADMIN enter one result-capture UX');

  calls.length=0;
  let r=await cb(ACTOR.SUPER,'tp:mymatches');
  assert.equal(r.handled,'results_register_dates','historical Dirigentes buttons must be normalized into the canonical register');
  assert.ok(callbacks().some(x=>x.startsWith('rr:date:')));
  console.log('PASS stale tp:mymatches is a compatibility alias, not a second capture implementation');

  const target=await one(`SELECT m.match_id,m.round_no,m.home_name,m.away_name,s.series_code
    FROM matches m
    CROSS JOIN (SELECT 'TERCERA' series_code UNION ALL SELECT 'SEGUNDA' UNION ALL SELECT 'SENIOR' UNION ALL SELECT 'PRIMERA') s
    LEFT JOIN match_series_results r ON r.match_id=m.match_id AND r.series_code=s.series_code
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.result_id IS NULL
    ORDER BY m.round_no,m.match_id,CASE s.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END LIMIT 1`);
  assert.ok(target,'fixture needs one unregistered series');

  calls.length=0;
  await cb(ACTOR.SUPER,`rr:date:${target.round_no}`);
  assert.ok(callbacks().includes(`rr:match:${target.match_id}`),'SUPER_ADMIN must see the competition-wide match scope');
  await cb(ACTOR.SUPER,`rr:match:${target.match_id}`);
  await cb(ACTOR.SUPER,`rr:series:${target.match_id}:${target.series_code}`);
  let session=await one('SELECT nonce,state FROM telegram_result_register_sessions WHERE telegram_user_id=?',String(ACTOR.SUPER.id));
  assert.equal(session?.state,'HOME_SCORE');
  assert.match(String(lastScreen().text||''),/MARCADOR LOCAL/);
  assert.ok(callbacks().some(x=>x.startsWith(`rr:h:${session.nonce}:`)));
  await cb(ACTOR.SUPER,`rr:h:${session.nonce}:2`);
  await cb(ACTOR.SUPER,`rr:a:${session.nonce}:1`);
  r=await cb(ACTOR.SUPER,`rr:confirm:${session.nonce}`);
  assert.equal(r.handled,'results_register_applied');
  assert.equal(r.outcome,'FIRST_OFFICIAL');
  const official=await one('SELECT home_score,away_score,validation_status,source_type FROM match_series_results WHERE match_id=? AND series_code=?',target.match_id,target.series_code);
  assert.deepEqual([Number(official.home_score),Number(official.away_score),official.validation_status,official.source_type],[2,1,'VERIFIED','TELEGRAM_SUPER_ADMIN']);
  assert.doesNotMatch(calls.map(x=>String(x.body?.text||'')).join('\n'),/Escribe el marcador|LOCAL-VISITA/i);
  console.log('PASS SUPER_ADMIN uses the same button score picker and canonical policy, with global scope');

  const foreign=await one(`SELECT match_id FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND home_id<>? AND away_id<>? ORDER BY round_no,match_id LIMIT 1`,club.team_id,club.team_id);
  assert.ok(foreign?.match_id);
  r=await cb(ACTOR.CLUB,`rr:match:${foreign.match_id}`);
  assert.equal(r.handled,'results_register_scope_denied');
  console.log('PASS role changes scope/authority only; it does not fork the capture UX');

  const facade=fs.readFileSync(path.join(root,'sports-bus','worker','results-register-entry.js'),'utf8');
  const home=fs.readFileSync(path.join(root,'sports-bus','worker','telegram-dirigentes-home-entry.js'),'utf8');
  assert.match(facade,/tp:mymatches/);
  assert.match(facade,/data:'rr:dates'/);
  assert.match(home,/CANONICAL_RESULTS_ENTRY='rr:dates'/);
  assert.doesNotMatch(home,/callback_data:'tp:mymatches'/);
  console.log('PASS new Dirigentes surfaces emit only the canonical result entrypoint');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
  env.DB.close();
}
