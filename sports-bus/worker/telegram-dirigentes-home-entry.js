import { getAudienceAccessPolicy } from './audience-access-policy.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const POLICY=getAudienceAccessPolicy('DIRIGENTES');

export const DIRIGENTES_HOME_CONTRACT=Object.freeze({
  id:'DIRIGENTES_HOME_V1',
  shared_entrypoint:'tp:leaders',
  callback_ack_is_best_effort:true,
  presentation_must_survive_ack_failure:true,
  entry_never_changes_permissions:true,
  authorization_comes_from_reporter_state:true
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
    error.telegram_method=method;
    throw error;
  }
  return payload;
}

async function bestEffortAnswer(token,callbackId,text){
  if(!callbackId) return {ok:false,reason:'missing_callback_id'};
  try{
    await telegram(token,'answerCallbackQuery',{callback_query_id:callbackId,text});
    return {ok:true};
  }catch(error){
    console.warn('dirigentes_home_callback_ack_failed',{message:String(error?.message||error)});
    return {ok:false,reason:'telegram_ack_failed'};
  }
}

async function present(token,update,text,inlineKeyboard){
  const callback=update?.callback_query;
  const message=update?.message;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  const messageId=callback?.message?.message_id;
  if(!chatId) throw new Error('telegram_chat_missing');
  const payload={text,reply_markup:{inline_keyboard:inlineKeyboard},disable_web_page_preview:true};
  if(messageId){
    try{
      await telegram(token,'editMessageText',{chat_id:chatId,message_id:messageId,...payload});
      return 'EDITED';
    }catch(error){
      if(String(error.telegram_description||'').toLowerCase().includes('message is not modified')) return 'UNCHANGED';
      console.warn('dirigentes_home_edit_failed',{message:String(error?.message||error)});
    }
  }
  await telegram(token,'sendMessage',{chat_id:chatId,...payload});
  return 'SENT';
}

async function upsertIdentity(db,actor){
  const actorId=String(actor.id);
  const now=new Date().toISOString();
  const displayName=[actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()
    || actor?.username
    || actorId;
  await db.prepare(`INSERT INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      display_name=excluded.display_name,
      username=excluded.username,
      updated_at=excluded.updated_at`)
    .bind(actorId,displayName,actor.username||null,now,now).run();
}

function isSuperAdmin(reporter){
  return !!reporter
    && reporter.role==='SUPER_ADMIN'
    && reporter.trust_level==='VERIFIED'
    && Number(reporter.active)===1;
}

function isVerifiedClubAdmin(reporter){
  return !!reporter
    && reporter.role==='CLUB_ADMIN'
    && reporter.trust_level==='VERIFIED'
    && Number(reporter.active)===1
    && !!reporter.club_id;
}

async function renderDirigentesHome(db,reporter,actorId){
  if(isSuperAdmin(reporter)){
    const [pending,active,total]=await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first(),
      db.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
      db.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
    ]);
    const pendingN=Number(pending?.n||0);
    const activeN=Number(active?.n||0);
    const totalN=Number(total?.n||0);
    return {
      state:'AUTHORIZED_GLOBAL',
      text:`🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes pendientes: ${pendingN}\nDirigentes activos: ${activeN}/${totalN}`,
      keyboard:[
        [{text:`🔔 Solicitudes (${pendingN})`,callback_data:'tp:requests'}],
        [{text:`👥 Dirigentes (${activeN}/${totalN})`,callback_data:'tp:admins'}],
        [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
        [{text:'⚽ Mis partidos de club',callback_data:'tp:mymatches'}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    };
  }

  if(isVerifiedClubAdmin(reporter)){
    const team=await db.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(reporter.club_id).first();
    return {
      state:'AUTHORIZED_CLUB',
      text:`🔐 PORTAL DIRIGENTES\n\n🏟 ${team?.canonical_name||reporter.club_id}\nRol: Administrador del club`,
      keyboard:[
        [{text:'⚽ Mis partidos',callback_data:'tp:mymatches'}],
        [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    };
  }

  if(reporter?.role==='CLUB_ADMIN'&&Number(reporter.active)!==1){
    const team=reporter.club_id
      ?await db.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(reporter.club_id).first()
      :null;
    return {
      state:'SUSPENDED',
      text:`⏸ ACCESO DE DIRIGENTE SUSPENDIDO\n\nClub: ${team?.canonical_name||reporter.club_id||'Sin club'}\n\nNo puedes usar funciones administrativas mientras tu acceso siga suspendido. Un administrador global debe reactivarlo o revocarlo.\n\nLas funciones públicas siguen disponibles.`,
      keyboard:[[{text:'🏠 Inicio',callback_data:'tp:home'}]]
    };
  }

  const pending=await db.prepare(`SELECT requested_club_id,represented_entity_label,created_at
    FROM access_requests WHERE telegram_user_id=? AND status='PENDING'
    ORDER BY created_at DESC LIMIT 1`).bind(String(actorId)).first();
  if(pending){
    const team=await db.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(pending.requested_club_id).first();
    return {
      state:'PENDING',
      text:`🔐 PORTAL DIRIGENTES\n\nTu solicitud está en revisión.\nClub solicitado: ${pending.represented_entity_label||team?.canonical_name||pending.requested_club_id}`,
      keyboard:[
        [{text:'🔎 Ver estado',callback_data:POLICY.status_callback}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    };
  }

  return {
    state:'REQUESTABLE',
    text:'🔐 PORTAL DIRIGENTES\n\nTu cuenta todavía no tiene permisos administrativos.',
    keyboard:[
      [{text:'📝 Solicitar acceso',callback_data:POLICY.request_callback}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]
  };
}

function isDirigentesIntent(update){
  const data=String(update?.callback_query?.data||'');
  const text=String(update?.message?.text||'').trim();
  return data===POLICY.entry_callback||/^\/dirigentes(?:@\w+)?$/i.test(text);
}

export async function handleTelegramDirigentesHomeRequest(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST'||!env?.DB) return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  if(!isDirigentesIntent(update)) return null;

  const actor=update?.message?.from||update?.callback_query?.from;
  const chatId=update?.message?.chat?.id||update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  await upsertIdentity(env.DB,actor);
  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  const rendered=await renderDirigentesHome(env.DB,reporter,actorId);

  const ack=update?.callback_query
    ?await bestEffortAnswer(context.token,update.callback_query.id,'Dirigentes')
    :{ok:true};

  let presentationMode='FAILED';
  try{
    presentationMode=await present(context.token,update,rendered.text,rendered.keyboard);
  }catch(error){
    console.error('dirigentes_home_presentation_failed',{message:String(error?.message||error)});
    return json({
      ok:false,
      handled:'dirigentes_home_presentation_failed',
      audience_id:'DIRIGENTES',
      access_state:rendered.state,
      callback_ack:ack.ok?'OK':'FAILED_NON_BLOCKING',
      permission_change:false,
      error:'telegram_presentation_failed'
    },502);
  }

  return json({
    ok:true,
    handled:'dirigentes_home',
    audience_id:'DIRIGENTES',
    access_state:rendered.state,
    channel_role:context.channel_role,
    callback_ack:ack.ok?'OK':'FAILED_NON_BLOCKING',
    presentation_mode:presentationMode,
    permission_change:false
  });
}
