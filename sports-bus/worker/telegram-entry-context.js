import { getActivePartnerMembership } from './access-control.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';
import {
  AUDIENCE_CONTEXT,
  audienceHomeCallback
} from './telegram-navigation-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const CONTEXT_TTL_MS=2*60*60*1000;

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
  return {token};
}

async function telegram(token,method,body){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  return response.json().catch(()=>({ok:false}));
}

async function setContext(db,actorId,contextCode){
  const now=new Date();
  const expires=new Date(now.getTime()+CONTEXT_TTL_MS);
  await db.prepare(`INSERT INTO telegram_entry_contexts
    (telegram_user_id,context_code,activated_at,expires_at)
    VALUES (?,?,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      context_code=excluded.context_code,
      activated_at=excluded.activated_at,
      expires_at=excluded.expires_at`)
    .bind(String(actorId),contextCode,now.toISOString(),expires.toISOString()).run();
}

async function clearContext(db,actorId){
  await db.prepare('DELETE FROM telegram_entry_contexts WHERE telegram_user_id=?').bind(String(actorId)).run();
}

async function activeContext(db,actorId){
  const row=await db.prepare(`SELECT context_code FROM telegram_entry_contexts
    WHERE telegram_user_id=? AND datetime(expires_at)>datetime('now') LIMIT 1`)
    .bind(String(actorId)).first();
  return row?.context_code||null;
}

function navigationContextFailure(operation,actorId,error,contextCode=null){
  console.error('telegram_navigation_context_failure',{
    operation,
    actor_id:String(actorId),
    context_code:contextCode,
    message:String(error?.message||error)
  });
}

async function bestEffortSetContext(db,actorId,contextCode){
  try{
    await setContext(db,actorId,contextCode);
    return true;
  }catch(error){
    navigationContextFailure('SET',actorId,error,contextCode);
    return false;
  }
}

async function bestEffortClearContext(db,actorId){
  try{
    await clearContext(db,actorId);
    return true;
  }catch(error){
    navigationContextFailure('CLEAR',actorId,error);
    return false;
  }
}

async function bestEffortActiveContext(db,actorId){
  try{
    return {ok:true,context_code:await activeContext(db,actorId)};
  }catch(error){
    navigationContextFailure('READ',actorId,error);
    return {ok:false,context_code:null};
  }
}

async function canUseChepicaPlayContext(db,actorId){
  const membership=await getActivePartnerMembership(db,String(actorId),COMPETITION_ID);
  return membership?.partner_code==='CHEPICA_PLAY';
}

function rewriteCallback(request,update,newData){
  const rewritten={
    ...update,
    callback_query:{...update.callback_query,data:newData}
  };
  return new Request(request.url,{
    method:request.method,
    headers:new Headers(request.headers),
    body:JSON.stringify(rewritten)
  });
}

export async function prepareTelegramEntryContext(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST'||!env?.DB){
    return {request,response:null};
  }

  let update;
  try{update=await request.clone().json();}catch{return {request,response:null};}
  const actor=update?.message?.from||update?.callback_query?.from;
  if(!actor?.id) return {request,response:null};

  const data=String(update?.callback_query?.data||'');
  const text=String(update?.message?.text||'').trim();
  const relevant=[
    'cp:observe',
    'tp:public-report',
    'tp:home',
    'tp:public',
    'tp:leaders',
    'mp:home',
    'nav:back',
    'rr:cancel-menu',
    'p3:public'
  ].includes(data)||/^\/informar(?:@\w+)?$/i.test(text);
  if(!relevant) return {request,response:null};

  const runtime=await runtimeContext(request,env);
  if(runtime?.error==='unauthorized') return {request,response:json({ok:false,error:'unauthorized'},401)};
  if(runtime?.error) return {request,response:json({ok:false,error:runtime.error},503)};
  if(!runtime) return {request,response:null};

  const actorId=String(actor.id);

  // Audience context is navigation/audit metadata, not authorization. A metadata
  // persistence failure must never make an otherwise valid audience callback die.
  if(data==='tp:home'){
    await bestEffortClearContext(env.DB,actorId);
    return {request,response:null};
  }

  if(data==='tp:public'){
    await bestEffortSetContext(env.DB,actorId,AUDIENCE_CONTEXT.PUBLIC_GENERAL);
    return {request,response:null};
  }

  if(data==='tp:leaders'){
    await bestEffortSetContext(env.DB,actorId,AUDIENCE_CONTEXT.DIRIGENTES);
    return {request,response:null};
  }

  if(data==='mp:home'){
    await bestEffortSetContext(env.DB,actorId,AUDIENCE_CONTEXT.CHEPICA_PLAY);
    return {request,response:null};
  }

  if(data==='nav:back'||data==='rr:cancel-menu'||data==='p3:public'){
    const context=await bestEffortActiveContext(env.DB,actorId);
    const parent=audienceHomeCallback(context.context_code);
    if(parent==='tp:home') await bestEffortClearContext(env.DB,actorId);
    return {request:rewriteCallback(request,update,parent),response:null};
  }

  if(data==='tp:public-report'||/^\/informar(?:@\w+)?$/i.test(text)){
    await bestEffortSetContext(env.DB,actorId,AUDIENCE_CONTEXT.PUBLIC_GENERAL);
    return {request,response:null};
  }

  if(data==='cp:observe'){
    // This lookup is authorization, not navigation metadata. It remains strict:
    // a failure here must never be converted into an allow decision.
    const allowed=await canUseChepicaPlayContext(env.DB,actorId);
    if(!allowed){
      const callbackId=update?.callback_query?.id;
      const chatId=update?.callback_query?.message?.chat?.id;
      if(callbackId) await telegram(runtime.token,'answerCallbackQuery',{callback_query_id:callbackId,text:'Acceso Chépica Play no habilitado'});
      if(chatId) await telegram(runtime.token,'sendMessage',{
        chat_id:chatId,
        text:'🔐 Esta identidad no puede ingresar resultados desde el contexto Chépica Play.',
        reply_markup:{inline_keyboard:[[{text:'⬅️ Volver',callback_data:'nav:back'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]}
      });
      return {request,response:json({ok:true,handled:'chepica_play_context_denied',permission_change:false})};
    }

    await bestEffortSetContext(env.DB,actorId,AUDIENCE_CONTEXT.CHEPICA_PLAY);
    return {
      request:rewriteCallback(request,update,'obs:dates'),
      response:null
    };
  }

  return {request,response:null};
}

export async function getTelegramEntryContext(db,actorId){
  if(!db||!actorId) return AUDIENCE_CONTEXT.PUBLIC_GENERAL;
  const context=await bestEffortActiveContext(db,actorId);
  return context.context_code||AUDIENCE_CONTEXT.PUBLIC_GENERAL;
}
