import assert from 'node:assert/strict';
import { handlePublicCompetitionHubRequest } from '../../sports-bus/worker/public-competition-hub-entry.js';

const env={
  TELEGRAM_WEBHOOK_SECRET:'qa-hub-secret',
  TELEGRAM_BOT_TOKEN:'qa-primary-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-next-token'
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

  const hubCall=calls.findLast(x=>x.method==='sendMessage');
  assert.ok(hubCall);
  assert.match(hubCall.body.text,/FÚTBOL CHÉPICA · PÚBLICO/);
  assert.match(hubCall.body.text,/Información oficial del campeonato/);
  const hubButtons=hubCall.body.reply_markup.inline_keyboard.flat();
  assert.deepEqual(
    hubButtons.map(x=>x.callback_data),
    ['tp:public-results','tp:public-standings','tp:public-report','pr:my','tp:home']
  );
  assert.deepEqual(
    hubButtons.map(x=>x.text),
    ['⚽ Resultados','🏆 Tabla de posiciones','📝 Informar resultado','🔎 Mis aportes','🏠 Volver']
  );
  console.log('PASS public hub orders read projections before contribution actions');

  response=await dispatch('tp:public-standings');
  assert.ok(response);
  body=await response.json();
  assert.equal(body.handled,'public_standings_source_gap');
  assert.equal(body.blocker,'STANDINGS_RULES_SOURCE');
  const standingsCall=calls.findLast(x=>x.method==='sendMessage');
  assert.match(standingsCall.body.text,/Aún no se publica/);
  assert.match(standingsCall.body.text,/No calcularemos una tabla usando supuestos/);
  assert.match(standingsCall.body.text,/resultados verificados/);
  assert.doesNotMatch(standingsCall.body.text,/\b3 puntos\b|\b1 punto\b|diferencia de gol/i);
  console.log('PASS standings route fails closed while official rules source is missing');

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
  const nextCall=calls.findLast(x=>x.method==='sendMessage');
  assert.match(nextCall.target,/botqa-next-token\/sendMessage$/);
  console.log('PASS same hub semantics on destination Telegram slot');

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
