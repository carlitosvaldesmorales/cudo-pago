import { buildPublicStandings } from './public-standings-entry.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';
import {
  buildPublicHubPresentation,
  buildStandingsPresentation
} from './public-presentation-model.js';
import {
  renderPublicHubTelegram,
  renderStandingsTelegram
} from './telegram-presentation-renderer.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const NEXT=TELEGRAM_CHANNEL.CANONICAL.webhook_path;

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{'content-type':'application/json; charset=utf-8'}
});

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function telegramContext(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,NEXT].includes(url.pathname)||request.method!=='POST') return null;
  if(!env.TELEGRAM_WEBHOOK_SECRET) return null;

  const isCanonical=url.pathname===NEXT;
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
    error.telegram_method=method;
    error.telegram_description=String(payload?.description||'');
    throw error;
  }
  return payload;
}

async function answer(token,callbackId,text){
  if(!callbackId) return;
  await callTelegram(token,'answerCallbackQuery',{callback_query_id:callbackId,text});
}

async function present(token,callback,rendered){
  const chatId=callback?.message?.chat?.id;
  const messageId=callback?.message?.message_id;
  if(!chatId) throw new Error('telegram_chat_missing');

  const common={
    text:rendered.text,
    parse_mode:rendered.parse_mode,
    reply_markup:rendered.reply_markup,
    disable_web_page_preview:true
  };

  if(messageId){
    try{
      await callTelegram(token,'editMessageText',{
        chat_id:chatId,
        message_id:messageId,
        ...common
      });
      return 'EDITED';
    }catch(error){
      if(String(error.telegram_description||'').toLowerCase().includes('message is not modified')){
        return 'UNCHANGED';
      }
    }
  }

  await callTelegram(token,'sendMessage',{
    chat_id:chatId,
    ...common
  });
  return 'SENT';
}

function standingsSelection(data){
  if(data==='tp:public-standings'){
    return {championshipCode:'PRINCIPAL'};
  }

  // v3 canonical callback: championship only.
  let match=data.match(/^tp:standings:(PRINCIPAL|SENIOR)$/);
  if(match) return {championshipCode:match[1]};

  // Backward compatibility: old v2 buttons may still exist in a user's chat.
  match=data.match(/^tp:standings:(PRINCIPAL|SENIOR):[A-Za-z0-9._-]+$/);
  if(match) return {championshipCode:match[1]};

  return null;
}

export async function handlePublicCompetitionHubRequest(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,NEXT].includes(url.pathname)||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const callback=update?.callback_query;
  const data=String(callback?.data||'');
  const selection=standingsSelection(data);
  if(!['tp:public','p3:public'].includes(data)&&!selection) return null;

  const chatId=callback?.message?.chat?.id;
  if(!callback?.from?.id||!chatId) return null;

  const context=await telegramContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  if(data==='tp:public'||data==='p3:public'){
    await answer(context.token,callback.id,'Público');
    const model=buildPublicHubPresentation();
    const rendered=renderPublicHubTelegram(model);
    const presentation_mode=await present(context.token,callback,rendered);
    return json({
      ok:true,
      handled:'public_competition_hub',
      screen_id:model.screen_id,
      channel_role:context.channel_role,
      entry:data,
      presentation_mode
    });
  }

  await answer(context.token,callback.id,'Tabla de posiciones');
  if(!env.DB){
    const fallback={
      text:'⚠️ <b>Tabla no disponible</b>\n\nPersistencia no configurada.',
      parse_mode:'HTML',
      reply_markup:{inline_keyboard:[[{text:'🌐 Público',callback_data:'tp:public'}]]}
    };
    await present(context.token,callback,fallback);
    return json({ok:false,error:'persistence_not_configured'},503);
  }

  try{
    const standings=await buildPublicStandings(env);
    const model=buildStandingsPresentation(standings,selection);
    if(!model) throw new Error('standings_presentation_unavailable');
    const rendered=renderStandingsTelegram(model);
    const presentation_mode=await present(context.token,callback,rendered);
    return json({
      ok:true,
      handled:'public_standings',
      screen_id:model.screen_id,
      contract:standings.contract,
      championship_code:model.championship_code,
      groups:model.groups.map(group=>group.group_id),
      channel_role:context.channel_role,
      presentation_mode
    });
  }catch(error){
    const fallback={
      text:'⚠️ <b>No fue posible calcular la tabla.</b>\n\nNo se publicaron posiciones parciales inventadas.',
      parse_mode:'HTML',
      reply_markup:{inline_keyboard:[[{text:'🌐 Público',callback_data:'tp:public'}]]}
    };
    await present(context.token,callback,fallback);
    return json({ok:false,error:'standings_build_failed'},500);
  }
}
