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
    'rr:cancel-menu'
  ].includes(data)||/^\/informar(?:@\w+)?$/i.test(text);
  if(!relevant) return {request,response:null};

  const runtime=await runtimeContext(request,env);
  if(runtime?.error==='unauthorized') return {request,response:json({ok:false,error:'unauthorized'},401)};
  if(runtime?.error) return {request,response:json({ok:false,error:runtime.error},503)};
  if(!runtime) return {request,response:null};

  const actorId=String(actor.id);

  if(data==='tp:home'){
    await clearContext(env.DB,actorId);
    return {request,response:null};
  }

  if(data==='tp:public'){
    await setContext(env.DB,actorId,AUDIENCE_CONTEXT.PUBLIC_GENERAL);
    return {request,response:null};
  }

  if(data==='tp:leaders'){
    await setContext(env.DB,actorId,AUDIENCE_CONTEXT.DIRIGENTES);
    return {request,response:null};
  }

  if(data==='mp:home'){
    // Entry context is navigation state only; authorization is still enforced
    // by the Chépica Play capability handler.
    await setContext(env.DB,actorId,AUDIENCE_CONTEXT.CHEPICA_PLAY);
    return {request,response:null};
  }

  if(data==='nav:back'||data==='rr:cancel-menu'){
    const contextCode=await activeContext(env.DB,actorId);
    const parent=audienceHomeCallback(contextCode);
    if(parent==='tp:home') await clearContext(env.DB,actorId);
    return {request:rewriteCallback(request,update,parent),response:null};
  }

  if(data==='tp:public-report'||/^\/informar(?:@\w+)?$/i.test(text)){
    await setContext(env.DB,actorId,AUDIENCE_CONTEXT.PUBLIC_GENERAL);
    return {request,response:null};
  }

  if(data==='cp:observe'){
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

    await setContext(env.DB,actorId,AUDIENCE_CONTEXT.CHEPICA_PLAY);
    return {
      request:rewriteCallback(request,update,'obs:dates'),
      response:null
    };
  }

  return {request,response:null};
}

export async function getTelegramEntryContext(db,actorId){
  if(!db||!actorId) return AUDIENCE_CONTEXT.PUBLIC_GENERAL;
  return (await activeContext(db,actorId))||AUDIENCE_CONTEXT.PUBLIC_GENERAL;
}
