import { CAPABILITY, getActivePartnerMembership, hasCapability } from './access-control.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_CODE='CHEPICA_PLAY';
const PARTNER_NAME='Chépica Play';
const PARTNER_CAPABILITIES=['READ_COMPETITION','OBSERVE_RESULT'];

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

async function send(token,chatId,text,inlineKeyboard=null){
  const body={chat_id:chatId,text,disable_web_page_preview:true};
  if(inlineKeyboard) body.reply_markup={inline_keyboard:inlineKeyboard};
  await telegram(token,'sendMessage',body);
}

function canManageAccess(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(reporter.role)
    && hasCapability(reporter,CAPABILITY.MANAGE_ACCESS);
}

function isRelevantIntent(update){
  const text=String(update?.message?.text||'').trim();
  const data=String(update?.callback_query?.data||'');
  return /^\/partner(?:@\w+)?$/i.test(text)
    || data==='mp:home'
    || data==='cp:access-request'
    || data==='cp:access-status'
    || data==='cp:access-cancel'
    || /^cp:access-(review|approve|reject):/.test(data);
}

function displayName(actor){
  return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()
    || actor?.username
    || String(actor?.id||'Usuario Telegram');
}

async function upsertIdentity(db,actor){
  const actorId=String(actor.id);
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      display_name=excluded.display_name,
      username=excluded.username,
      updated_at=excluded.updated_at`)
    .bind(actorId,displayName(actor),actor.username||null,now,now).run();
}

async function pendingRequest(db,actorId){
  return db.prepare(`SELECT * FROM partner_access_requests
    WHERE telegram_user_id=? AND partner_code=? AND scope_id=? AND status='PENDING'
    ORDER BY created_at DESC LIMIT 1`)
    .bind(String(actorId),PARTNER_CODE,COMPETITION_ID).first();
}

async function latestRequest(db,actorId){
  return db.prepare(`SELECT * FROM partner_access_requests
    WHERE telegram_user_id=? AND partner_code=? AND scope_id=?
    ORDER BY created_at DESC LIMIT 1`)
    .bind(String(actorId),PARTNER_CODE,COMPETITION_ID).first();
}

async function showOperationalHome(token,update,{linked,reporter,channelRole}){
  const mode=await present(
    token,
    update,
    '🎥 CHÉPICA PLAY\n\nElige qué necesitas hacer:',
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
    access_mode:'PARTNER_IDENTITY',
    capabilities:['OBSERVE_RESULT','READ_COMPETITION'],
    presentation_mode:mode,
    channel_role:channelRole,
    permission_change:false,
    identity_change:false
  });
}

async function showAccessGate(token,update,requestRow,channelRole){
  if(requestRow){
    const mode=await present(
      token,
      update,
      `🕒 SOLICITUD CHÉPICA PLAY\n\nTu cuenta todavía no está vinculada a Chépica Play.\n\nEstado: PENDIENTE\n\nUn administrador debe aprobar la solicitud antes de habilitar:\n\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados como identidad Chépica Play`,
      [
        [{text:'🔎 Actualizar estado',callback_data:'cp:access-status'}],
        [{text:'❌ Cancelar solicitud',callback_data:'cp:access-cancel'}],
        [{text:'🌐 Público general',callback_data:'tp:public'}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    );
    return json({
      ok:true,
      handled:'chepica_play_access_pending',
      linked:false,
      request_id:requestRow.request_id,
      request_status:'PENDING',
      presentation_mode:mode,
      channel_role:channelRole,
      permission_change:false,
      identity_change:false
    });
  }

  const mode=await present(
    token,
    update,
    `🔐 ACCESO CHÉPICA PLAY\n\nEsta cuenta no está vinculada a Chépica Play.\n\nPara entrar debes vincular esta identidad. Puedes solicitar autorización a un administrador.\n\nUna identidad habilitada tiene exactamente dos funciones:\n\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados\n\nSi ya recibiste una invitación personal, abre ese enlace desde esta misma cuenta de Telegram.`,
    [
      [{text:'📝 Solicitar autorización',callback_data:'cp:access-request'}],
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
    channel_role:channelRole,
    permission_change:false,
    identity_change:false,
    authorization_path:'REQUEST_OR_INVITE'
  });
}

async function notifyApprovers(db,token,requestRow){
  const q=await db.prepare(`SELECT * FROM reporters
    WHERE active=1 AND trust_level='VERIFIED'
      AND role IN ('SUPER_ADMIN','PLATFORM_OPERATOR')`).all();
  const notified=new Set();
  for(const reviewer of q.results||[]){
    if(!canManageAccess(reviewer)) continue;
    const reviewerId=String(reviewer.telegram_user_id);
    if(notified.has(reviewerId)) continue;
    notified.add(reviewerId);
    await send(
      token,
      reviewerId,
      `🔔 SOLICITUD CHÉPICA PLAY\n\n${requestRow.display_name||requestRow.telegram_user_id}${requestRow.username?' · @'+requestRow.username:''}\nsolicita vincular su cuenta a Chépica Play.\n\nSi se aprueba obtendrá sólo:\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados`,
      [[{text:'🔎 Revisar solicitud',callback_data:`cp:access-review:${requestRow.request_id}`}]]
    );
  }
  return notified.size;
}

async function showReview(token,update,row){
  return present(
    token,
    update,
    `🔐 REVISAR ACCESO CHÉPICA PLAY\n\nPersona: ${row.display_name||row.telegram_user_id}\nTelegram: ${row.username?'@'+row.username:row.telegram_user_id}\nEstado: ${row.status}\n\nAl aprobar se vincula esta identidad a Chépica Play con sólo dos capacidades:\n\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados`,
    [
      [{text:'✅ Aprobar',callback_data:`cp:access-approve:${row.request_id}`}],
      [{text:'❌ Rechazar',callback_data:`cp:access-reject:${row.request_id}`}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]
  );
}

export async function handleTelegramChepicaPlayHomeRequest(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  if(!isRelevantIntent(update)) return null;

  const actor=update?.message?.from||update?.callback_query?.from;
  const chatId=update?.message?.chat?.id||update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId||!env.DB) return null;

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  await upsertIdentity(env.DB,actor);

  const actorId=String(actor.id);
  const data=String(update?.callback_query?.data||'');
  const [membership,reporter]=await Promise.all([
    getActivePartnerMembership(env.DB,actorId,COMPETITION_ID),
    env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first()
  ]);

  if(update?.callback_query) await answer(context.token,update.callback_query.id,PARTNER_NAME);

  const linked=membership?.partner_code===PARTNER_CODE;

  if(data==='cp:access-request'){
    if(linked){
      return showOperationalHome(context.token,update,{linked,reporter,channelRole:context.channel_role});
    }
    let pending=await pendingRequest(env.DB,actorId);
    if(!pending){
      const now=new Date().toISOString();
      const requestId=`cpar-${actorId}-${Date.now().toString(36)}`;
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO partner_access_requests
          (request_id,telegram_user_id,display_name,username,partner_code,requested_role,scope_type,scope_id,status,created_at)
          VALUES (?,?,?,?,?,'MEDIA_PARTNER','COMPETITION',?,'PENDING',?)`)
          .bind(requestId,actorId,displayName(actor),actor.username||null,PARTNER_CODE,COMPETITION_ID,now),
        env.DB.prepare(`INSERT OR REPLACE INTO events
          (event_id,event_type,occurred_at,received_at,competition_id,season_id,actor_id,actor_name,validation_status,payload_json)
          VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(`cp-access-${requestId}`,'telegram.partner_access.requested',now,now,COMPETITION_ID,'2026',actorId,displayName(actor),'PENDING',JSON.stringify({request_id:requestId,partner_code:PARTNER_CODE,role:'MEDIA_PARTNER',scope_type:'COMPETITION',scope_id:COMPETITION_ID}))
      ]);
      pending=await pendingRequest(env.DB,actorId);
      const approvers=await notifyApprovers(env.DB,context.token,pending);
      const response=await showAccessGate(context.token,update,pending,context.channel_role);
      const payload=await response.json();
      return json({...payload,handled:'chepica_play_access_requested',approvers_notified:approvers});
    }
    return showAccessGate(context.token,update,pending,context.channel_role);
  }

  if(data==='cp:access-status'){
    if(linked){
      return showOperationalHome(context.token,update,{linked,reporter,channelRole:context.channel_role});
    }
    const row=await latestRequest(env.DB,actorId);
    if(!row||row.status==='REJECTED'||row.status==='CANCELLED'){
      return showAccessGate(context.token,update,null,context.channel_role);
    }
    if(row.status==='APPROVED'){
      const refreshed=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
      if(refreshed?.partner_code===PARTNER_CODE){
        return showOperationalHome(context.token,update,{linked:true,reporter,channelRole:context.channel_role});
      }
    }
    return showAccessGate(context.token,update,row.status==='PENDING'?row:null,context.channel_role);
  }

  if(data==='cp:access-cancel'){
    const pending=await pendingRequest(env.DB,actorId);
    if(pending){
      const now=new Date().toISOString();
      await env.DB.prepare("UPDATE partner_access_requests SET status='CANCELLED',reviewed_by=?,reviewed_at=?,review_note='cancelled_by_requester' WHERE request_id=? AND status='PENDING'")
        .bind(actorId,now,pending.request_id).run();
    }
    return showAccessGate(context.token,update,null,context.channel_role);
  }

  const reviewMatch=data.match(/^cp:access-review:(cpar-[A-Za-z0-9-]+)$/);
  if(reviewMatch){
    if(!canManageAccess(reporter)){
      await send(context.token,chatId,'🔒 No tienes permisos para revisar accesos de Chépica Play.');
      return json({ok:true,handled:'chepica_play_access_review_denied'});
    }
    const row=await env.DB.prepare('SELECT * FROM partner_access_requests WHERE request_id=?').bind(reviewMatch[1]).first();
    if(!row){
      await send(context.token,chatId,'⚠️ La solicitud ya no existe.');
      return json({ok:true,handled:'chepica_play_access_request_missing'});
    }
    if(row.status!=='PENDING'){
      await send(context.token,chatId,`ℹ️ Esta solicitud ya fue procesada. Estado: ${row.status}.`);
      return json({ok:true,handled:'chepica_play_access_request_processed',request_status:row.status});
    }
    const mode=await showReview(context.token,update,row);
    return json({ok:true,handled:'chepica_play_access_review',request_id:row.request_id,presentation_mode:mode});
  }

  const approveMatch=data.match(/^cp:access-approve:(cpar-[A-Za-z0-9-]+)$/);
  if(approveMatch){
    if(!canManageAccess(reporter)){
      await send(context.token,chatId,'🔒 No tienes permisos para aprobar accesos de Chépica Play.');
      return json({ok:true,handled:'chepica_play_access_approve_denied'});
    }
    const row=await env.DB.prepare("SELECT * FROM partner_access_requests WHERE request_id=? AND status='PENDING'").bind(approveMatch[1]).first();
    if(!row){
      await send(context.token,chatId,'ℹ️ La solicitud ya fue procesada o no existe.');
      return json({ok:true,handled:'chepica_play_access_request_not_pending'});
    }
    const now=new Date().toISOString();
    const grantId=`mpg-${PARTNER_CODE}-${row.telegram_user_id}-${Date.now().toString(36)}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE partner_access_requests SET status='APPROVED',reviewed_by=?,reviewed_at=?,review_note='approved_by_manage_access' WHERE request_id=? AND status='PENDING'")
        .bind(actorId,now,row.request_id),
      env.DB.prepare(`INSERT INTO actor_scope_grants
        (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
        VALUES (?,?,'MEDIA_PARTNER','COMPETITION',?,?,'VERIFIED',?,?,1,?,?,?)
        ON CONFLICT(telegram_user_id,role,scope_type,scope_id) DO UPDATE SET
          capabilities_json=excluded.capabilities_json,
          trust_level=excluded.trust_level,
          source_label=excluded.source_label,
          granted_by=excluded.granted_by,
          active=1,
          updated_at=excluded.updated_at,
          partner_code=excluded.partner_code`)
        .bind(grantId,row.telegram_user_id,COMPETITION_ID,JSON.stringify(PARTNER_CAPABILITIES),PARTNER_NAME,actorId,now,now,PARTNER_CODE),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,NULL,'APPROVE_MEDIA_PARTNER_ACCESS','partner_access_request',?,1,'verified_admin_approved_chepica_play_access',?)`)
        .bind(`cp-access-approve-${row.request_id}`,actorId,reporter.role,row.request_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,actor_id,actor_name,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(`cp-access-approved-${row.request_id}`,'telegram.partner_access.approved',now,now,COMPETITION_ID,'2026',actorId,reporter.display_name||actorId,'VERIFIED',JSON.stringify({request_id:row.request_id,target_telegram_user_id:row.telegram_user_id,partner_code:PARTNER_CODE,capabilities:PARTNER_CAPABILITIES}))
    ]);
    await send(
      context.token,
      row.telegram_user_id,
      `✅ ACCESO CHÉPICA PLAY APROBADO\n\nTu cuenta quedó vinculada a Chépica Play. Ya puedes entrar desde Inicio → 🎥 Chépica Play.`,
      [[{text:'🎥 Entrar a Chépica Play',callback_data:'mp:home'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]
    );
    await present(context.token,update,`✅ ACCESO APROBADO\n\n${row.display_name||row.telegram_user_id} quedó vinculado a Chépica Play.`,[[{text:'🏠 Inicio',callback_data:'tp:home'}]]);
    return json({ok:true,handled:'chepica_play_access_approved',request_id:row.request_id,target_id:row.telegram_user_id,permission_change:true,identity_change:false});
  }

  const rejectMatch=data.match(/^cp:access-reject:(cpar-[A-Za-z0-9-]+)$/);
  if(rejectMatch){
    if(!canManageAccess(reporter)){
      await send(context.token,chatId,'🔒 No tienes permisos para rechazar accesos de Chépica Play.');
      return json({ok:true,handled:'chepica_play_access_reject_denied'});
    }
    const row=await env.DB.prepare("SELECT * FROM partner_access_requests WHERE request_id=? AND status='PENDING'").bind(rejectMatch[1]).first();
    if(!row){
      await send(context.token,chatId,'ℹ️ La solicitud ya fue procesada o no existe.');
      return json({ok:true,handled:'chepica_play_access_request_not_pending'});
    }
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE partner_access_requests SET status='REJECTED',reviewed_by=?,reviewed_at=?,review_note='rejected_by_manage_access' WHERE request_id=? AND status='PENDING'")
        .bind(actorId,now,row.request_id),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,NULL,'REJECT_MEDIA_PARTNER_ACCESS','partner_access_request',?,1,'verified_admin_rejected_chepica_play_access',?)`)
        .bind(`cp-access-reject-${row.request_id}`,actorId,reporter.role,row.request_id,now)
    ]);
    await send(context.token,row.telegram_user_id,'❌ Tu solicitud de acceso a Chépica Play fue rechazada. Tu acceso público sigue disponible.',[[{text:'🌐 Público general',callback_data:'tp:public'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]);
    await present(context.token,update,`❌ SOLICITUD RECHAZADA\n\n${row.display_name||row.telegram_user_id} no fue vinculado a Chépica Play.`,[[{text:'🏠 Inicio',callback_data:'tp:home'}]]);
    return json({ok:true,handled:'chepica_play_access_rejected',request_id:row.request_id,target_id:row.telegram_user_id,permission_change:false,identity_change:false});
  }

  if(linked){
    return showOperationalHome(context.token,update,{linked,reporter,channelRole:context.channel_role});
  }

  return showAccessGate(context.token,update,await pendingRequest(env.DB,actorId),context.channel_role);
}
