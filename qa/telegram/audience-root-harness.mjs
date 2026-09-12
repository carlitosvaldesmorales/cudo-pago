import assert from 'node:assert/strict';
import { handleTelegramAudienceRootRequest } from '../../sports-bus/worker/telegram-audience-root-entry.js';
import {
  AUDIENCE_ROOT_CONTRACT,
  TELEGRAM_ROOT_AUDIENCES,
  renderTelegramAudienceRoot
} from '../../sports-bus/worker/telegram-audience-root.js';

const env={
  TELEGRAM_WEBHOOK_SECRET:'qa-root-secret',
  TELEGRAM_BOT_TOKEN:'qa-legacy-token',
  TELEGRAM_BOT_TOKEN_NEXT:'qa-canonical-token'
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

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function message(text,{canonical=true}={}){
  const path=canonical?'/webhook/telegram-next':'/webhook/telegram';
  const secret=canonical?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  return new Request(`https://qa.invalid${path}`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(secret)
    },
    body:JSON.stringify({
      update_id:1,
      message:{
        message_id:10,
        from:{id:901,first_name:'QA'},
        chat:{id:901,type:'private'},
        text
      }
    })
  });
}

async function callback(data,{canonical=true}={}){
  const path=canonical?'/webhook/telegram-next':'/webhook/telegram';
  const secret=canonical?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  return new Request(`https://qa.invalid${path}`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(secret)
    },
    body:JSON.stringify({
      update_id:2,
      callback_query:{
        id:'root-callback',
        from:{id:901,first_name:'QA'},
        data,
        message:{message_id:44,chat:{id:901,type:'private'}}
      }
    })
  });
}

function last(method){return calls.findLast(call=>call.method===method);}
function callbacksFrom(call){
  return call.body.reply_markup.inline_keyboard.flat().map(button=>button.callback_data);
}
function labelsFrom(call){
  return call.body.reply_markup.inline_keyboard.flat().map(button=>button.text);
}

try{
  assert.equal(AUDIENCE_ROOT_CONTRACT.root_represents_audiences,true);
  assert.equal(AUDIENCE_ROOT_CONTRACT.audience_selection_precedes_capabilities,true);
  assert.equal(AUDIENCE_ROOT_CONTRACT.audience_selection_grants_permissions,false);
  assert.equal(AUDIENCE_ROOT_CONTRACT.canonical_bot,'@FutbolChepicaBot');
  assert.deepEqual(AUDIENCE_ROOT_CONTRACT.audience_ids,['PUBLIC_GENERAL','DIRIGENTES','CHEPICA_PLAY']);
  assert.equal(TELEGRAM_ROOT_AUDIENCES.length,3);
  console.log('PASS audience-first ADN contract');

  const rendered=renderTelegramAudienceRoot();
  assert.match(rendered.text,/FÚTBOL CHÉPICA/);
  assert.match(rendered.text,/Selecciona tu tipo de acceso/);
  assert.deepEqual(
    rendered.reply_markup.inline_keyboard.flat().map(button=>button.text),
    ['🌐 Público general','🔐 Dirigentes','🎥 Chépica Play']
  );
  assert.deepEqual(
    rendered.reply_markup.inline_keyboard.flat().map(button=>button.callback_data),
    ['tp:public','tp:leaders','mp:home']
  );
  console.log('PASS root exposes exactly three human access contexts');

  calls.length=0;
  let response=await handleTelegramAudienceRootRequest(await message('/inicio'),env);
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'telegram_audience_root');
  assert.equal(body.channel_role,'CANONICAL');
  assert.equal(body.permission_change,false);
  const canonicalSend=last('sendMessage');
  assert.match(canonicalSend.target,/botqa-canonical-token\/sendMessage$/);
  assert.deepEqual(labelsFrom(canonicalSend),['🌐 Público general','🔐 Dirigentes','🎥 Chépica Play']);
  assert.deepEqual(callbacksFrom(canonicalSend),['tp:public','tp:leaders','mp:home']);
  console.log('PASS /inicio on canonical bot renders audience root without authorization changes');

  calls.length=0;
  response=await handleTelegramAudienceRootRequest(await message('/start'),env);
  assert.equal(response.status,200);
  assert.equal((await response.json()).handled,'telegram_audience_root');
  console.log('PASS exact /start shares the same canonical root');

  calls.length=0;
  response=await handleTelegramAudienceRootRequest(await callback('tp:home'),env);
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.presentation_mode,'EDITED');
  assert.ok(last('answerCallbackQuery'));
  const edited=last('editMessageText');
  assert.ok(edited);
  assert.deepEqual(callbacksFrom(edited),['tp:public','tp:leaders','mp:home']);
  assert.equal(calls.filter(call=>call.method==='sendMessage').length,0);
  console.log('PASS Home edits the live surface back to the same audience root');

  calls.length=0;
  response=await handleTelegramAudienceRootRequest(await message('/menu',{canonical:false}),env);
  assert.equal(response.status,200);
  body=await response.json();
  assert.equal(body.channel_role,'LEGACY_COMPATIBILITY');
  assert.match(last('sendMessage').target,/botqa-legacy-token\/sendMessage$/);
  console.log('PASS legacy slot reuses root semantics without becoming canonical');

  response=await handleTelegramAudienceRootRequest(await message('/start partner_123456789012'),env);
  assert.equal(response,null,'partner invitation deep links must remain owned by media-partner enrollment');
  response=await handleTelegramAudienceRootRequest(await callback('mp:home'),env);
  assert.equal(response,null,'Chépica Play audience callback must pass through to existing media-partner capability');
  response=await handleTelegramAudienceRootRequest(await message('/dirigentes'),env);
  assert.equal(response,null,'Dirigentes command must remain owned by its established flow');
  console.log('PASS audience root routes to existing capabilities instead of duplicating their logic');

  const bad=await message('/inicio');
  const badHeaders=new Headers(bad.headers);
  badHeaders.set('x-telegram-bot-api-secret-token','wrong');
  response=await handleTelegramAudienceRootRequest(new Request(bad,{headers:badHeaders}),env);
  assert.equal(response.status,401);
  console.log('PASS invalid webhook secret fails closed');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
}
