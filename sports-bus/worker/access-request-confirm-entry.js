import { CAPABILITY, hasCapability } from './access-control.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';
import { INTAKE_STATE } from './access-request-intake-model.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_CODE='CHEPICA_PLAY';

export const GOVERNED_CONFIRMATION_CONTRACT=Object.freeze({
  id:'GOVERNED_CONFIRMATION_V1',
  callback_ack_is_best_effort:true,
  durable_transition_precedes_side_effects:true,
  notification_failure_does_not_revert_submission:true,
  presentation_failure_does_not_revert_submission:true,
  persistence_failure_preserves_draft:true,
  repeated_confirmation_is_idempotent:true,
  failures_must_not_be_silent:true,
  sql_bind_arity_verified:true
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
    console.warn('governed_confirmation_callback_ack_failed',{
      message:String(error?.message||error),
      method:error?.telegram_method||'answerCallbackQuery'
    });
    return {ok:false,reason:'telegram_ack_failed'};
  }
}

async function present(token,update,text,inlineKeyboard){
  const callback=update?.callback_query;
  const chatId=callback?.message?.chat?.id;
  const messageId=callback?.message?.message_id;
  if(!chatId) throw new Error('telegram_chat_missing');
  const payload={text,reply_markup:{inline_keyboard:inlineKeyboard},disable_web_page_preview:true};
  if(messageId){
    try{
      await telegram(token,'editMessageText',{chat_id:chatId,message_id:messageId,...payload});
      return 'EDITED';
    }catch(error){
      if(String(error.telegram_description||'').toLowerCase().includes('message is not modified')) return 'UNCHANGED';
      console.warn('governed_confirmation_edit_failed',{message:String(error?.message||error)});
    }
  }
  await telegram(token,'sendMessage',{chat_id:chatId,...payload});
  return 'SENT';
}

async function bestEffortPresent(token,update,text,keyboard){
  try{
    return {ok:true,mode:await present(token,update,text,keyboard)};
  }catch(error){
    console.error('governed_confirmation_presentation_failed',{message:String(error?.message||error)});
    return {ok:false,mode:'FAILED'};
  }
}

function telegramDisplayName(actor){
  return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()
    || actor?.username
    || String(actor?.id||'Usuario Telegram');
}

function canManageAccess(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(reporter.role)
    && hasCapability(reporter,CAPABILITY.MANAGE_ACCESS);
}

async function draftById(db,actorId,intakeId){
  return db.prepare(`SELECT * FROM access_request_intakes
    WHERE intake_id=? AND telegram_user_id=? AND expires_at>datetime('now')`)
    .bind(intakeId,String(actorId)).first();
}

async function submittedForIntake(db,actorId,intakeId){
  const partner=await db.prepare(`SELECT request_id,'CHEPICA_PLAY' AS audience_id,status,submitted_at,declared_name,represented_entity AS represented_entity_label
    FROM partner_access_requests
    WHERE telegram_user_id=? AND intake_id=? AND partner_code='CHEPICA_PLAY'
    ORDER BY created_at DESC LIMIT 1`)
    .bind(String(actorId),intakeId).first();
  if(partner) return partner;

  return db.prepare(`SELECT request_id,'DIRIGENTES' AS audience_id,status,submitted_at,declared_name,represented_entity_label
    FROM access_requests
    WHERE telegram_user_id=? AND intake_id=?
    ORDER BY created_at DESC LIMIT 1`)
    .bind(String(actorId),intakeId).first();
}

async function pendingForAudience(db,actorId,audienceId){
  if(audienceId==='CHEPICA_PLAY'){
    return db.prepare(`SELECT request_id,'CHEPICA_PLAY' AS audience_id,status,submitted_at,declared_name,represented_entity AS represented_entity_label
      FROM partner_access_requests
      WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND scope_id=? AND status='PENDING' LIMIT 1`)
      .bind(String(actorId),COMPETITION_ID).first();
  }
  return db.prepare(`SELECT request_id,'DIRIGENTES' AS audience_id,status,submitted_at,declared_name,represented_entity_label
    FROM access_requests WHERE telegram_user_id=? AND status='PENDING' LIMIT 1`)
    .bind(String(actorId)).first();
}

async function clearDraft(db,actorId,intakeId){
  await db.prepare('DELETE FROM access_request_intakes WHERE telegram_user_id=? AND intake_id=?')
    .bind(String(actorId),intakeId).run();
}

async function persistSubmission(db,actor,draft){
  const actorId=String(actor.id);
  const existing=await pendingForAudience(db,actorId,draft.audience_id);
  if(existing) return {...existing,existing:true};

  const now=new Date().toISOString();
  if(draft.audience_id==='CHEPICA_PLAY'){
    const requestId=`cpar-${actorId}-${Date.now().toString(36)}`;
    await db.batch([
      db.prepare(`INSERT INTO partner_access_requests
        (request_id,telegram_user_id,display_name,username,partner_code,requested_role,scope_type,scope_id,status,created_at,declared_name,represented_entity,intake_id,submitted_at)
        VALUES (?,?,?,?,?,'MEDIA_PARTNER','COMPETITION',?,'PENDING',?,?,?,?,?)`)
        .bind(requestId,actorId,telegramDisplayName(actor),actor.username||null,PARTNER_CODE,COMPETITION_ID,now,draft.declared_name,draft.represented_entity_label,draft.intake_id,now),
      db.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,actor_id,actor_name,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(`cp-access-${requestId}`,'telegram.partner_access.requested',now,now,COMPETITION_ID,'2026',actorId,telegramDisplayName(actor),'PENDING',JSON.stringify({request_id:requestId,partner_code:PARTNER_CODE,role:'MEDIA_PARTNER',declared_name:draft.declared_name,represented_entity:draft.represented_entity_label,intake_id:draft.intake_id}))
    ]);
    const persisted=await submittedForIntake(db,actorId,draft.intake_id);
    if(!persisted||persisted.status!=='PENDING'||!persisted.submitted_at) throw new Error('durable_submission_not_observed');
    return {...persisted,existing:false};
  }

  const requestId=`ar-${actorId}-${Date.now().toString(36)}`;
  await db.batch([
    db.prepare(`INSERT INTO access_requests
      (request_id,telegram_user_id,display_name,username,requested_club_id,requested_role,status,created_at,declared_name,represented_entity_label,intake_id,submitted_at)
      VALUES (?,?,?,?,?,'CLUB_ADMIN','PENDING',?,?,?,?,?)`)
      .bind(requestId,actorId,telegramDisplayName(actor),actor.username||null,draft.represented_entity_id,now,draft.declared_name,draft.represented_entity_label,draft.intake_id,now),
    db.prepare(`INSERT OR REPLACE INTO events
      (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(`access-${requestId}`,'telegram.access.requested',now,now,actorId,telegramDisplayName(actor),draft.represented_entity_id,'PENDING',JSON.stringify({requested_role:'CLUB_ADMIN',declared_name:draft.declared_name,represented_entity:draft.represented_entity_label,intake_id:draft.intake_id}))
  ]);
  const persisted=await submittedForIntake(db,actorId,draft.intake_id);
  if(!persisted||persisted.status!=='PENDING'||!persisted.submitted_at) throw new Error('durable_submission_not_observed');
  return {...persisted,existing:false};
}

async function bestEffortNotifyApprovers(db,token,audienceId,row){
  let reviewers=[];
  try{
    const q=await db.prepare(`SELECT * FROM reporters
      WHERE active=1 AND trust_level='VERIFIED' AND role IN ('SUPER_ADMIN','PLATFORM_OPERATOR')`).all();
    reviewers=q.results||[];
  }catch(error){
    console.error('governed_confirmation_reviewer_lookup_failed',{message:String(error?.message||error)});
    return {notified:0,failed:1};
  }

  let notified=0;
  let failed=0;
  for(const reviewer of reviewers){
    if(audienceId==='DIRIGENTES'){
      if(reviewer.role!=='SUPER_ADMIN') continue;
    }else if(!canManageAccess(reviewer)) continue;

    const callback=audienceId==='DIRIGENTES'
      ?`tp:review:${row.request_id}`
      :`cp:access-review:${row.request_id}`;
    const title=audienceId==='DIRIGENTES'?'DIRIGENTES':'CHÉPICA PLAY';
    try{
      await telegram(token,'sendMessage',{
        chat_id:String(reviewer.telegram_user_id),
        text:`🔔 SOLICITUD ${title}\n\n👤 Nombre declarado: ${row.declared_name}\n🏟️ Representa: ${row.represented_entity_label}\n📱 Telegram: ${row.username?'@'+row.username:row.telegram_user_id}\n\nLa solicitud está PENDIENTE. Revisar no concede permisos; sólo Aprobar puede materializar la autoridad correspondiente.`,
        reply_markup:{inline_keyboard:[[{text:'🔎 Revisar solicitud',callback_data:callback}]]},
        disable_web_page_preview:true
      });
      notified++;
    }catch(error){
      failed++;
      console.error('governed_confirmation_approver_notification_failed',{
        reviewer_id:String(reviewer.telegram_user_id),
        message:String(error?.message||error)
      });
    }
  }
  return {notified,failed};
}

function submittedText(audienceId,row){
  const audience=audienceId==='DIRIGENTES'?'DIRIGENTES':'CHÉPICA PLAY';
  return `🕒 SOLICITUD ${audience}\n\n👤 Nombre: ${row.declared_name}\n🏟️ Representa: ${row.represented_entity_label}\n\nEstado: PENDIENTE\n\nUn administrador debe revisarla. Enviar esta solicitud no cambió tus permisos.`;
}

function submittedKeyboard(audienceId){
  const statusCallback=audienceId==='DIRIGENTES'?'tp:reqstatus':'cp:access-status';
  return [
    [{text:'🔎 Ver estado',callback_data:statusCallback}],
    [{text:'🏠 Inicio',callback_data:'tp:home'}]
  ];
}

async function showRetryableFailure(token,update){
  const text='⚠️ No pude completar el envío de la solicitud.\n\nTus datos siguen guardados como borrador y no se concedió ningún permiso. Puedes intentar nuevamente con ✅ Enviar solicitud.';
  const callback=update?.callback_query;
  const retryData=String(callback?.data||'');
  const keyboard=[
    [{text:'🔁 Reintentar envío',callback_data:retryData}],
    [{text:'🏠 Inicio',callback_data:'tp:home'}]
  ];
  return bestEffortPresent(token,update,text,keyboard);
}

export async function handleAccessRequestConfirmation(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST'||!env?.DB) return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const data=String(update?.callback_query?.data||'');
  const match=data.match(/^ari:confirm:(.+)$/);
  if(!match) return null;

  const actor=update?.callback_query?.from;
  const chatId=update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  const actorId=String(actor.id);
  const intakeId=match[1];
  const ack=await bestEffortAnswer(context.token,update.callback_query.id,'Enviando solicitud…');

  let draft=await draftById(env.DB,actorId,intakeId);
  if(!draft){
    const prior=await submittedForIntake(env.DB,actorId,intakeId);
    if(prior?.status==='PENDING'){
      const presentation=await bestEffortPresent(context.token,update,submittedText(prior.audience_id,prior),submittedKeyboard(prior.audience_id));
      return json({
        ok:true,
        handled:'access_request_confirm_idempotent',
        audience_id:prior.audience_id,
        request_id:prior.request_id,
        request_status:'PENDING',
        callback_ack:ack.ok?'OK':'FAILED_NON_BLOCKING',
        presentation_mode:presentation.mode,
        permission_change:false
      });
    }
    await bestEffortPresent(context.token,update,'⌛ Esta solicitud ya no está disponible. Vuelve a iniciar el proceso desde el menú de acceso.',[[{text:'🏠 Inicio',callback_data:'tp:home'}]]);
    return json({ok:true,handled:'access_intake_stale',permission_change:false});
  }

  if(draft.state!==INTAKE_STATE.REVIEW){
    await bestEffortPresent(context.token,update,'⚠️ La solicitud aún no está lista para enviarse. Completa los datos requeridos antes de confirmar.',[[{text:'🏠 Inicio',callback_data:'tp:home'}]]);
    return json({ok:true,handled:'access_intake_not_ready',state:draft.state,permission_change:false});
  }

  let persisted;
  try{
    persisted=await persistSubmission(env.DB,actor,draft);
  }catch(error){
    console.error('governed_confirmation_persistence_failed',{
      actor_id:actorId,
      intake_id:intakeId,
      audience_id:draft.audience_id,
      message:String(error?.message||error)
    });
    const presentation=await showRetryableFailure(context.token,update);
    return json({
      ok:true,
      handled:'access_request_submit_retryable_failure',
      audience_id:draft.audience_id,
      request_status:null,
      draft_preserved:true,
      callback_ack:ack.ok?'OK':'FAILED_NON_BLOCKING',
      presentation_mode:presentation.mode,
      permission_change:false
    });
  }

  await clearDraft(env.DB,actorId,intakeId);
  const row={
    ...persisted,
    telegram_user_id:actorId,
    username:actor.username||null,
    declared_name:persisted.declared_name||draft.declared_name,
    represented_entity_label:persisted.represented_entity_label||draft.represented_entity_label
  };

  const notifications=persisted.existing
    ?{notified:0,failed:0}
    :await bestEffortNotifyApprovers(env.DB,context.token,draft.audience_id,row);

  const presentation=await bestEffortPresent(
    context.token,
    update,
    submittedText(draft.audience_id,row),
    submittedKeyboard(draft.audience_id)
  );

  return json({
    ok:true,
    handled:'access_request_submitted',
    audience_id:draft.audience_id,
    request_id:persisted.request_id,
    request_status:'PENDING',
    callback_ack:ack.ok?'OK':'FAILED_NON_BLOCKING',
    approvers_notified:notifications.notified,
    approver_notification_failures:notifications.failed,
    presentation_mode:presentation.mode,
    permission_change:false
  });
}
