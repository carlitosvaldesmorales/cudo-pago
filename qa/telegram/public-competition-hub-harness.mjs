import assert from 'node:assert/strict';
import { handlePublicCompetitionHubRequest } from '../../sports-bus/worker/public-competition-hub-entry.js';
import { buildStandingsPresentation, PRESENTATION_MODEL_CONTRACT } from '../../sports-bus/worker/public-presentation-model.js';
import { renderStandingsTelegram, TELEGRAM_PRESENTATION_CONTRACT } from '../../sports-bus/worker/telegram-presentation-renderer.js';

const teamRows=[
  {team_id:'ORILLA',canonical_name:'Unión Orilla',group_id:'A'},
  {team_id:'SANJUAN',canonical_name:'San Juan',group_id:'A'},
  {team_id:'JUVENTUD',canonical_name:'Juventud de Chépica',group_id:'A'},
  {team_id:'HURACAN',canonical_name:'Huracán',group_id:'B'},
  {team_id:'CRUCES',canonical_name:'Las Cruces',group_id:'B'},
  {team_id:'RAMON',canonical_name:'San Ramón',group_id:'B'}
];

const resultRows=[
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'TERCERA',home_score:2,away_score:3,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'SEGUNDA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'SENIOR',home_score:0,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',home_name:'Unión Orilla',away_id:'SANJUAN',away_name:'San Juan',series_code:'PRIMERA',home_score:3,away_score:0,validation_status:'VERIFIED'},
  {match_id:'B-F2-M1',group_id:'B',home_id:'HURACAN',home_name:'Huracán',away_id:'CRUCES',away_name:'Las Cruces',series_code:'TERCERA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'B-F2-M1',group_id:'B',home_id:'HURACAN',home_name:'Huracán',away_id:'CRUCES',away_name:'Las Cruces',series_code:'SEGUNDA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'B-F2-M1',group_id:'B',home_id:'HURACAN',home_name:'Huracán',away_id:'CRUCES',away_name:'Las Cruces',series_code:'PRIMERA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'B-F2-M1',group_id:'B',home_id:'HURACAN',home_name:'Huracán',away_id:'CRUCES',away_name:'Las Cruces',series_code:'SENIOR',home_score:0,away_score:1,validation_status:'VERIFIED'}
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
  return new Response(JSON.stringify({ok:true,result:{message_id:44}}),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

async function hash(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function dispatch(data,{next=true}={}){
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
        id:`hub-${data}`,
        from:{id:99001,first_name:'QA'},
        data,
        message:{message_id:44,chat:{id:99001,type:'private'}}
      }
    })
  });
  return handlePublicCompetitionHubRequest(request,env);
}

function last(method){
  return calls.findLast(call=>call.method===method);
}

function count(text,needle){
  return String(text).split(needle).length-1;
}

try{
  assert.deepEqual(PRESENTATION_MODEL_CONTRACT.human_output_pipeline,
    ['CAPABILITY','PROJECTION','PRESENTATION_MODEL','CHANNEL_RENDERER']);
  assert.equal(PRESENTATION_MODEL_CONTRACT.telegram.standings_one_championship_per_screen,true);
  assert.equal(PRESENTATION_MODEL_CONTRACT.telegram.standings_one_group_per_screen,true);
  assert.equal(TELEGRAM_PRESENTATION_CONTRACT.standings.update_existing_message_when_possible,true);
  console.log('PASS presentation-model ADN contract is explicit');

  let response=await dispatch('p3:public');
  assert.ok(response);
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'public_competition_hub');
  assert.equal(body.screen_id,'PUBLIC_HUB');
  assert.equal(body.channel_role,'CANONICAL');
  assert.equal(body.presentation_mode,'EDITED');

  const hub=last('editMessageText');
  assert.ok(hub);
  assert.equal(hub.body.parse_mode,'HTML');
  assert.match(hub.body.text,/FÚTBOL CHÉPICA · PÚBLICO/);
  const hubCallbacks=hub.body.reply_markup.inline_keyboard.flat().map(button=>button.callback_data);
  assert.deepEqual(hubCallbacks,
    ['tp:public-results','tp:public-standings','tp:public-report','pr:my','tp:home']);
  assert.equal(calls.filter(call=>call.method==='sendMessage').length,0);
  console.log('PASS historical Público entry lands on canonical hub and edits the live surface');

  response=await dispatch('tp:public-standings');
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.handled,'public_standings');
  assert.equal(body.screen_id,'STANDINGS_GROUP');
  assert.equal(body.championship_code,'PRINCIPAL');
  assert.equal(body.group_id,'A');
  assert.equal(body.presentation_mode,'EDITED');

  const principalA=last('editMessageText');
  assert.equal(principalA.body.parse_mode,'HTML');
  assert.match(principalA.body.text,/CAMPEONATO PRINCIPAL/);
  assert.match(principalA.body.text,/Grupo A/);
  assert.match(principalA.body.text,/3ª \+ 2ª \+ 1ª · Máx\. 9 pts por jornada/);
  assert.match(principalA.body.text,/<pre>POS  CLUB/);
  assert.doesNotMatch(principalA.body.text,/CAMPEONATO SENIOR/);
  assert.doesNotMatch(principalA.body.text,/Grupo B/);
  assert.equal(count(principalA.body.text,'⚖️')<=1,true);
  console.log('PASS one Telegram screen contains exactly one championship + one group');

  const principalCallbacks=principalA.body.reply_markup.inline_keyboard.flat().map(button=>button.callback_data);
  assert.ok(principalCallbacks.includes('tp:standings:PRINCIPAL:A'));
  assert.ok(principalCallbacks.includes('tp:standings:SENIOR:A'));
  assert.ok(principalCallbacks.includes('tp:standings:PRINCIPAL:B'));
  assert.ok(principalCallbacks.includes('tp:public-results'));
  assert.ok(principalCallbacks.includes('tp:public'));
  console.log('PASS persistent inline navigation preserves context');

  response=await dispatch('tp:standings:SENIOR:B');
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.championship_code,'SENIOR');
  assert.equal(body.group_id,'B');

  const seniorB=last('editMessageText');
  assert.match(seniorB.body.text,/CAMPEONATO SENIOR/);
  assert.match(seniorB.body.text,/Grupo B/);
  assert.match(seniorB.body.text,/Campeonato independiente/);
  assert.doesNotMatch(seniorB.body.text,/CAMPEONATO PRINCIPAL/);
  assert.doesNotMatch(seniorB.body.text,/Grupo A/);
  console.log('PASS Principal/Senior and Group A/B switch by editing the same message');

  const syntheticStandings={
    competition_id:'ANFA-CHEPICA-2026',
    groups:[{
      group_id:'A',
      championships:[{
        championship_code:'PRINCIPAL',
        rows:[
          {position:1,team_id:'A',team_name:'Club A',points:4,adjustment_points:0,tiebreak_status:'PLAYOFF_REQUIRED'},
          {position:1,team_id:'B',team_name:'Club B',points:4,adjustment_points:0,tiebreak_status:'PLAYOFF_REQUIRED'}
        ]
      },{
        championship_code:'SENIOR',
        rows:[]
      }]
    }]
  };
  const tieModel=buildStandingsPresentation(syntheticStandings,{championshipCode:'PRINCIPAL',groupId:'A'});
  const tieRendered=renderStandingsTelegram(tieModel);
  assert.equal(count(tieRendered.text,'⚖️'),1);
  assert.doesNotMatch(tieRendered.text,/Club A.*⚖️/);
  assert.doesNotMatch(tieRendered.text,/Club B.*⚖️/);
  console.log('PASS tie semantics are summarized once instead of repeated per row');

  const before=calls.length;
  response=await dispatch('tp:public-results');
  assert.equal(response,null);
  response=await dispatch('tp:public-report');
  assert.equal(response,null);
  response=await dispatch('pr:my');
  assert.equal(response,null);
  assert.equal(calls.length,before);
  console.log('PASS presentation layer does not steal other canonical capabilities');

  response=await dispatch('tp:public',{next:false});
  assert.ok(response);
  body=await response.json();
  assert.equal(body.channel_role,'LEGACY_COMPATIBILITY');
  console.log('PASS legacy bot reuses semantics without becoming canonical');

  const bad=new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'wrong'},
    body:JSON.stringify({callback_query:{id:'bad',from:{id:1},data:'tp:public',message:{message_id:1,chat:{id:1}}}})
  });
  response=await handlePublicCompetitionHubRequest(bad,env);
  assert.equal(response.status,401);
  console.log('PASS invalid Telegram webhook secret fails closed');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
}
