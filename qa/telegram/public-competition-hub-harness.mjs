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
  assert.equal(PRESENTATION_MODEL_CONTRACT.telegram.standings_all_groups_in_championship_screen,true);
  assert.equal(PRESENTATION_MODEL_CONTRACT.telegram.standings_group_navigation,false);
  assert.equal(TELEGRAM_PRESENTATION_CONTRACT.standings.no_pre_or_code,true);
  assert.equal(TELEGRAM_PRESENTATION_CONTRACT.standings.horizontal_scroll_required,false);
  assert.equal(TELEGRAM_PRESENTATION_CONTRACT.standings.update_existing_message_when_possible,true);
  console.log('PASS presentation-model v3 ADN contract is explicit');

  let response=await dispatch('tp:public-standings');
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'public_standings');
  assert.equal(body.screen_id,'STANDINGS_CHAMPIONSHIP');
  assert.equal(body.championship_code,'PRINCIPAL');
  assert.deepEqual(body.groups,['A','B']);
  assert.equal(body.presentation_mode,'EDITED');

  const principal=last('editMessageText');
  assert.equal(principal.body.parse_mode,'HTML');
  assert.match(principal.body.text,/CAMPEONATO PRINCIPAL/);
  assert.match(principal.body.text,/GRUPO A/);
  assert.match(principal.body.text,/GRUPO B/);
  assert.match(principal.body.text,/Juventud de Chépica/);
  assert.match(principal.body.text,/Huracán/);
  assert.doesNotMatch(principal.body.text,/<pre>/i);
  assert.doesNotMatch(principal.body.text,/<code>/i);
  assert.equal(count(principal.body.text,'⚖️')<=1,true);
  console.log('PASS Principal shows both groups in one mobile-safe formatted screen');

  const callbacks=principal.body.reply_markup.inline_keyboard.flat().map(button=>button.callback_data);
  assert.deepEqual(callbacks,
    ['tp:standings:PRINCIPAL','tp:standings:SENIOR','tp:public-results','tp:public']);
  assert.equal(callbacks.some(value=>value.endsWith(':A')||value.endsWith(':B')),false);
  assert.equal(calls.filter(call=>call.method==='sendMessage').length,0);
  console.log('PASS no group buttons and no message accumulation');

  response=await dispatch('tp:standings:SENIOR');
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.screen_id,'STANDINGS_CHAMPIONSHIP');
  assert.equal(body.championship_code,'SENIOR');
  assert.deepEqual(body.groups,['A','B']);

  const senior=last('editMessageText');
  assert.match(senior.body.text,/CAMPEONATO SENIOR/);
  assert.match(senior.body.text,/GRUPO A/);
  assert.match(senior.body.text,/GRUPO B/);
  assert.match(senior.body.text,/Campeonato independiente/);
  assert.doesNotMatch(senior.body.text,/<pre>|<code>/i);
  console.log('PASS Senior is the only alternate championship button and includes both groups');

  // Old v2 callbacks still work so stale buttons already present in Telegram do not break.
  response=await dispatch('tp:standings:PRINCIPAL:B');
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.championship_code,'PRINCIPAL');
  assert.deepEqual(body.groups,['A','B']);
  console.log('PASS stale v2 group callback degrades safely to canonical v3 championship view');

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
      },{championship_code:'SENIOR',rows:[]}]
    },{
      group_id:'B',
      championships:[{
        championship_code:'PRINCIPAL',
        rows:[{position:1,team_id:'C',team_name:'Club C',points:5,adjustment_points:0,tiebreak_status:'NONE'}]
      },{championship_code:'SENIOR',rows:[]}]
    }]
  };
  const tieModel=buildStandingsPresentation(syntheticStandings,{championshipCode:'PRINCIPAL'});
  const tieRendered=renderStandingsTelegram(tieModel);
  assert.equal(count(tieRendered.text,'⚖️'),1);
  assert.doesNotMatch(tieRendered.text,/Club A.*⚖️/);
  assert.doesNotMatch(tieRendered.text,/Club B.*⚖️/);
  console.log('PASS tie semantics are summarized once per championship screen');

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

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
}
