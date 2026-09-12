import assert from 'node:assert/strict';
import { handlePublicCompetitionHubRequest } from '../../sports-bus/worker/public-competition-hub-entry.js';

const teamRows=[
  {team_id:'ORILLA',canonical_name:'Unión Orilla',group_id:'A'},
  {team_id:'SANJUAN',canonical_name:'San Juan',group_id:'A'},
  {team_id:'HURACAN',canonical_name:'Huracán',group_id:'B'}
];
const resultRows=[
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'TERCERA',home_score:2,away_score:3,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'SEGUNDA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'SENIOR',home_score:0,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'PRIMERA',home_score:3,away_score:0,validation_status:'VERIFIED'}
];

const DB={
  prepare(sql){
    const text=String(sql);
    const statement={
      bind(){return statement;},
      async all(){
        if(text.includes('FROM teams')) return {results:teamRows};
        if(text.includes('FROM match_series_results r')) return {results:resultRows};
        if(text.includes('FROM standings_adjustments')) return {results:[]};
        return {results:[]};
      }
    };
    return statement;
  }
};

const env={
  TELEGRAM_WEBHOOK_SECRET:'qa-hub-secret',
  TELEGRAM_BOT_TOKEN:'qa-primary-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-next-token',
  DB
};
const calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init={})=>{
  const target=String(url);
  const method=target.split('/').at(-1);
  const body=init.body?JSON.parse(String(init.body)):{};
  calls.push({target,method,body});
  return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

async function hash(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function dispatch(data,{next=false}={}){
  const path=next?'/webhook/telegram-next':'/webhook/telegram';
  const secret=next?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const request=new Request(`https://qa.invalid${path}`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await hash(secret)
    },
    body:JSON.stringify({
      update_id:101,
      callback_query:{
        id:'hub-cb-1',
        from:{id:99001,first_name:'QA'},
        data,
        message:{message_id:44,chat:{id:99001,type:'private'}}
      }
    })
  });
  return handlePublicCompetitionHubRequest(request,env);
}

try{
  let response=await dispatch('tp:public');
  assert.ok(response);
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'public_competition_hub');
  assert.equal(body.channel_role,'LEGACY_COMPATIBILITY');

  const hubCall=calls.findLast(x=>x.method==='sendMessage');
  assert.ok(hubCall);
  assert.match(hubCall.body.text,/FÚTBOL CHÉPICA · PÚBLICO/);
  assert.match(hubCall.body.text,/Campeonato Principal y del Campeonato Senior/);
  const hubButtons=hubCall.body.reply_markup.inline_keyboard.flat();
  assert.deepEqual(
    hubButtons.map(x=>x.callback_data),
    ['tp:public-results','tp:public-standings','tp:public-report','pr:my','tp:home']
  );
  assert.deepEqual(
    hubButtons.map(x=>x.text),
    ['⚽ Resultados','🏆 Tablas de posiciones','📝 Informar resultado','🔎 Mis aportes','🏠 Volver']
  );
  console.log('PASS public hub exposes results and championship standings before contribution actions');

  response=await dispatch('tp:public-standings');
  assert.ok(response);
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.handled,'public_standings');
  assert.equal(body.contract,'public-standings-v2');
  const standingsCall=calls.findLast(x=>x.method==='sendMessage');
  assert.match(standingsCall.body.text,/CAMPEONATO PRINCIPAL/);
  assert.match(standingsCall.body.text,/3ª \+ 2ª \+ 1ª · máximo 9 puntos por jornada/);
  assert.match(standingsCall.body.text,/CAMPEONATO SENIOR · INDEPENDIENTE/);
  assert.match(standingsCall.body.text,/no suma a los 9 puntos del Campeonato Principal/);
  assert.match(standingsCall.body.text,/Unión Orilla — 7 pts/);
  assert.match(standingsCall.body.text,/Sólo resultados verificados modifican las clasificaciones/);
  assert.doesNotMatch(standingsCall.body.text,/diferencia de gol/i);
  console.log('PASS standings UX separates principal championship from independent Senior championship');

  const before=calls.length;
  response=await dispatch('tp:public-results');
  assert.equal(response,null);
  response=await dispatch('tp:public-report');
  assert.equal(response,null);
  response=await dispatch('pr:my');
  assert.equal(response,null);
  assert.equal(calls.length,before);
  console.log('PASS hub does not steal canonical RESULTS-READ or contribution callbacks');

  response=await dispatch('tp:public',{next:true});
  assert.ok(response);
  body=await response.json();
  assert.equal(body.channel_role,'CANONICAL');
  const nextCall=calls.findLast(x=>x.method==='sendMessage');
  assert.match(nextCall.target,/botqa-next-token\/sendMessage$/);
  console.log('PASS canonical Telegram adapter reuses the same hub capability semantics');

  response=await dispatch('p3:public',{next:true});
  assert.ok(response);
  body=await response.json();
  assert.equal(body.handled,'public_competition_hub');
  assert.equal(body.entry,'p3:public');
  assert.equal(body.channel_role,'CANONICAL');
  const resultsPublicEntry=calls.findLast(x=>x.method==='sendMessage');
  const resultsPublicButtons=resultsPublicEntry.body.reply_markup.inline_keyboard.flat();
  assert.ok(resultsPublicButtons.some(x=>x.callback_data==='tp:public-results'));
  assert.ok(resultsPublicButtons.some(x=>x.callback_data==='tp:public-standings'));
  console.log('PASS results-screen Público button lands on canonical hub with Results + Standings');

  const bad=new Request('https://qa.invalid/webhook/telegram',{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'wrong'},
    body:JSON.stringify({callback_query:{id:'bad',from:{id:1},data:'tp:public',message:{chat:{id:1}}}})
  });
  response=await handlePublicCompetitionHubRequest(bad,env);
  assert.equal(response.status,401);
  console.log('PASS invalid Telegram webhook secret fails closed');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
}
