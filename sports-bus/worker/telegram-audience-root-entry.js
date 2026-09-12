import { renderTelegramAudienceRoot } from './telegram-audience-root.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{'content-type':'application/json; charset=utf-8'}
});

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function telegramContext(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST') return null;
  if(!env.TELEGRAM_WEBHOOK_SECRET) return null;

  const isCanonical=url.pathname===CANONICAL;
  const secretSource=isCanonical?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await sha256Hex(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return {error:'unauthorized'};

  const token=isCanonical?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return {error:'telegram_bot_not_configured'};
  return {token,channel_role:isCanonical?'CANONICAL':'LEGACY_COMPATIBILITY'};
}

async function callTelegram(token,method,body){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({ok:false}));
  if(!response.ok||!payload?.ok){
    const error=new Error(payload?.description||`telegram_${method}_failed`);
    error.telegram_description=String(payload?.description||'');
    throw error;
  }
  return payload;
}

async function answer(token,callbackId){
  if(!callbackId) return;
  await callTelegram(token,'answerCallbackQuery',{
    callback_query_id:callbackId,
    text:'Inicio'
  });
}

async function presentRoot(token,update){
  const message=update?.message;
  const callback=update?.callback_query;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!chatId) throw new Error('telegram_chat_missing');

  const rendered=renderTelegramAudienceRoot();
  const common={
    text:rendered.text,
    reply_markup:rendered.reply_markup,
    disable_web_page_preview:true
  };

  const messageId=callback?.message?.message_id;
  if(messageId){
    try{
      await callTelegram(token,'editMessageText',{
        chat_id:chatId,
        message_id:messageId,
        ...common
      });
      return 'EDITED';
    }catch(error){
      if(String(error.telegram_description||'').toLowerCase().includes('message is not modified')) return 'UNCHANGED';
    }
  }

  await callTelegram(token,'sendMessage',{chat_id:chatId,...common});
  return 'SENT';
}

function isRootIntent(update){
  const text=String(update?.message?.text||'').trim();
  const data=String(update?.callback_query?.data||'');
  const command=/^\/(start|portal|inicio|menu)(?:@\w+)?$/i.test(text);
  return command||data==='tp:home';
}

export async function handleTelegramAudienceRootRequest(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  if(!isRootIntent(update)) return null;

  const actor=update?.message?.from||update?.callback_query?.from;
  const chatId=update?.message?.chat?.id||update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const context=await telegramContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  if(update?.callback_query) await answer(context.token,update.callback_query.id);
  const presentation_mode=await presentRoot(context.token,update);

  return json({
    ok:true,
    handled:'telegram_audience_root',
    screen_id:'AUDIENCE_ROOT',
    channel_role:context.channel_role,
    presentation_mode,
    permission_change:false
  });
}
