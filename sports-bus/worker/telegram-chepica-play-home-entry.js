import { CAPABILITY, getActivePartnerMembership, hasCapability } from './access-control.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_NAME='Chépica Play';

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{'content-type':'application/json; charset=utf-8'}
});

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function runtimeContext(request,env){
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

async function telegram(token,method,body){
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

async function answer(token,callbackId,text){
  if(!callbackId) return;
  await telegram(token,'answerCallbackQuery',{
    callback_query_id:callbackId,
    text
  });
}

async function present(token,update,text,inlineKeyboard){
  const message=update?.message;
  const callback=update?.callback_query;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  const messageId=callback?.message?.message_id;
  const payload={
    text,
    reply_markup:{inline_keyboard:inlineKeyboard},
    disable_web_page_preview:true
  };

  if(messageId){
    try{
      await telegram(token,'editMessageText',{chat_id:chatId,message_id:messageId,...payload});
      return 'EDITED';
    }catch(error){
      if(String(error.telegram_description||'').toLowerCase().includes('message is not modified')) return 'UNCHANGED';
    }
  }

  await telegram(token,'sendMessage',{chat_id:chatId,...payload});
  return 'SENT';
}

function canUsePrivilegedContext(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(reporter.role)
    && hasCapability(reporter,CAPABILITY.OBSERVE_RESULT);
}

function isPartnerHomeIntent(update){
  const text=String(update?.message?.text||'').trim();
  const data=String(update?.callback_query?.data||'');
  return /^\/partner(?:@\w+)?$/i.test(text)||data==='mp:home';
}

export async function handleTelegramChepicaPlayHomeRequest(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  if(!isPartnerHomeIntent(update)) return null;

  const actor=update?.message?.from||update?.callback_query?.from;
  const chatId=update?.message?.chat?.id||update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId||!env.DB) return null;

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  const actorId=String(actor.id);
  const [membership,reporter]=await Promise.all([
    getActivePartnerMembership(env.DB,actorId,COMPETITION_ID),
    env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first()
  ]);

  if(update?.callback_query) await answer(context.token,update.callback_query.id,PARTNER_NAME);

  const linked=membership?.partner_code==='CHEPICA_PLAY';
  const privilegedContext=canUsePrivilegedContext(reporter);

  if(linked||privilegedContext){
    const identityNote=privilegedContext&&!linked
      ? '\n\nModo Chépica Play. Tu identidad administrativa real se conserva en la trazabilidad.'
      : '';
    const mode=await present(
      context.token,
      update,
      `🎥 CHÉPICA PLAY\n\nElige qué necesitas hacer:${identityNote}`,
      [
        [{text:'📝 Ingresar resultados',callback_data:'cp:observe'}],
        [{text:'⚽ Consultar resultados',callback_data:'tp:public-results'}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    );
    return json({
      ok:true,
      handled:'chepica_play_home',
      linked,
      entry_context:'CHEPICA_PLAY',
      actor_role:reporter?.role||null,
      access_mode:linked?'PARTNER_IDENTITY':'PRIVILEGED_CONTEXT',
      capabilities:['OBSERVE_RESULT','READ_COMPETITION'],
      presentation_mode:mode,
      channel_role:context.channel_role,
      permission_change:false,
      identity_change:false
    });
  }

  const mode=await present(
    context.token,
    update,
    `🔐 ACCESO CHÉPICA PLAY\n\nEsta cuenta no está vinculada a Chépica Play.\n\nUna identidad Chépica Play habilitada tiene exactamente dos funciones:\n\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados\n\nEl acceso al contexto Chépica Play no cambia la identidad ni concede permisos.`,
    [
      [{text:'🌐 Público general',callback_data:'tp:public'}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]
  );

  return json({
    ok:true,
    handled:'chepica_play_access_gate',
    linked:false,
    entry_context:null,
    expected_capabilities:['OBSERVE_RESULT','READ_COMPETITION'],
    presentation_mode:mode,
    channel_role:context.channel_role,
    permission_change:false,
    identity_change:false
  });
}
