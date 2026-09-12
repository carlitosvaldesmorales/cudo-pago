import { CAPABILITY, hasCapability } from './access-control.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;

export const ACCESS_REVIEW_PRESENTATION_CONTRACT=Object.freeze({
  id:'ACCESS_REVIEW_PRESENTATION_V1',
  declared_name_visible:true,
  represented_entity_visible:true,
  technical_identity_visible:true,
  review_does_not_change_permissions:true,
  decision_callbacks_delegated:true
});

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
  const canonical=url.pathname===CANONICAL;
  const secretSource=canonical?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await sha256Hex(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return {error:'unauthorized'};
  const token=canonical?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return {error:'telegram_bot_not_configured'};
  return {token,channel_role:canonical?'CANONICAL':'LEGACY_COMPATIBILITY'};
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
  try{
    await telegram(token,'answerCallbackQuery',{callback_query_id:callbackId,text});
  }catch(error){
    console.warn('access_review_callback_ack_failed',{message:String(error?.message||error)});
  }
}

async function present(token,update,text,keyboard){
  const callback=update?.callback_query;
  const chatId=callback?.message?.chat?.id;
  const messageId=callback?.message?.message_id;
  if(!chatId) throw new Error('telegram_chat_missing');
  const payload={text,reply_markup:{inline_keyboard:keyboard},disable_web_page_preview:true};
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

function canManageAccess(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(reporter.role)
    && hasCapability(reporter,CAPABILITY.MANAGE_ACCESS);
}

function requesterName(row){
  return row.declared_name||row.display_name||row.telegram_user_id;
}

function representedEntity(row){
  return row.represented_entity||'No informado';
}

export async function handleAccessRequestReview(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST'||!env?.DB) return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const data=String(update?.callback_query?.data||'');
  const match=data.match(/^cp:access-review:(cpar-[A-Za-z0-9-]+)$/);
  if(!match) return null;

  const actor=update?.callback_query?.from;
  const chatId=update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!canManageAccess(reporter)){
    await answer(context.token,update.callback_query.id,'No autorizado');
    await telegram(context.token,'sendMessage',{chat_id:chatId,text:'🔒 No tienes permisos para revisar accesos de Chépica Play.'});
    return json({ok:true,handled:'chepica_play_access_review_denied',permission_change:false});
  }

  const row=await env.DB.prepare('SELECT * FROM partner_access_requests WHERE request_id=?').bind(match[1]).first();
  if(!row){
    await answer(context.token,update.callback_query.id,'Solicitud no disponible');
    await telegram(context.token,'sendMessage',{chat_id:chatId,text:'⚠️ La solicitud ya no existe.'});
    return json({ok:true,handled:'chepica_play_access_request_missing',permission_change:false});
  }
  if(row.status!=='PENDING'){
    await answer(context.token,update.callback_query.id,'Solicitud ya procesada');
    await telegram(context.token,'sendMessage',{chat_id:chatId,text:`ℹ️ Esta solicitud ya fue procesada. Estado: ${row.status}.`});
    return json({ok:true,handled:'chepica_play_access_request_processed',request_status:row.status,permission_change:false});
  }

  await answer(context.token,update.callback_query.id,'Revisar solicitud');
  const mode=await present(
    context.token,
    update,
    `🔐 REVISAR ACCESO CHÉPICA PLAY\n\n👤 Nombre declarado: ${requesterName(row)}\n🏟️ Representa: ${representedEntity(row)}\n📱 Telegram: ${row.username?'@'+row.username:row.telegram_user_id}\n🕒 Estado: ${row.status}\n\nRevisar esta solicitud no concede permisos. Sólo ✅ Aprobar puede vincular esta identidad a Chépica Play.\n\nAl aprobar obtiene exactamente:\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados`,
    [
      [{text:'✅ Aprobar',callback_data:`cp:access-approve:${row.request_id}`}],
      [{text:'❌ Rechazar',callback_data:`cp:access-reject:${row.request_id}`}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]
  );

  return json({
    ok:true,
    handled:'chepica_play_access_review',
    request_id:row.request_id,
    request_status:row.status,
    presentation_mode:mode,
    presentation_contract:ACCESS_REVIEW_PRESENTATION_CONTRACT.id,
    permission_change:false,
    identity_change:false
  });
}
