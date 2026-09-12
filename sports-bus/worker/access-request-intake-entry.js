import { CAPABILITY, getActivePartnerMembership, hasCapability } from './access-control.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';
import { getStructuredIntakePolicy, INTAKE_STATE, validateDeclaredName, validateRepresentedEntity, buildReviewSummary } from './access-request-intake-model.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_CODE='CHEPICA_PLAY';
const INTAKE_TTL_MS=30*60*1000;

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
  await telegram(token,'answerCallbackQuery',{callback_query_id:callbackId,text});
}

async function send(token,chatId,text,replyMarkup=null){
  const body={chat_id:chatId,text,disable_web_page_preview:true};
  if(replyMarkup) body.reply_markup=replyMarkup;
  return telegram(token,'sendMessage',body);
}

async function present(token,update,text,inlineKeyboard){
  const callback=update?.callback_query;
  const chatId=update?.message?.chat?.id||callback?.message?.chat?.id;
  const messageId=callback?.message?.message_id;
  const payload={text,reply_markup:{inline_keyboard:inlineKeyboard},disable_web_page_preview:true};
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

async function forceReply(token,chatId,text,placeholder){
  return send(token,chatId,text,{
    force_reply:true,
    selective:true,
    input_field_placeholder:placeholder
  });
}

function telegramDisplayName(actor){
  return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()
    || actor?.username
    || String(actor?.id||'Usuario Telegram');
}

function isVerifiedLeader(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR','CLUB_ADMIN'].includes(reporter.role);
}

function canManageAccess(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(reporter.role)
    && hasCapability(reporter,CAPABILITY.MANAGE_ACCESS);
}

function isPotentialCallback(data){
  return data==='tp:req'
    || data==='cp:access-request'
    || /^ari:(confirm|edit-name|edit-entity|cancel):/.test(data)
    || /^ari:club:/.test(data)
    || /^cp:access-review:/.test(data)
    || /^tp:review:/.test(data);
}

async function activeDraft(db,actorId){
  return db.prepare(`SELECT * FROM access_request_intakes
    WHERE telegram_user_id=? AND expires_at>datetime('now')
    ORDER BY updated_at DESC LIMIT 1`)
    .bind(String(actorId)).first();
}

async function draftById(db,actorId,intakeId){
  return db.prepare(`SELECT * FROM access_request_intakes
    WHERE intake_id=? AND telegram_user_id=? AND expires_at>datetime('now')`)
    .bind(intakeId,String(actorId)).first();
}

async function clearActorDrafts(db,actorId){
  await db.prepare('DELETE FROM access_request_intakes WHERE telegram_user_id=?').bind(String(actorId)).run();
}

async function startDraft(db,actorId,audienceId){
  getStructuredIntakePolicy(audienceId);
  await clearActorDrafts(db,actorId);
  const now=new Date();
  const intakeId=`ari-${actorId}-${now.getTime().toString(36)}`;
  const createdAt=now.toISOString();
  const expiresAt=new Date(now.getTime()+INTAKE_TTL_MS).toISOString();
  await db.prepare(`INSERT INTO access_request_intakes
    (intake_id,telegram_user_id,audience_id,state,created_at,updated_at,expires_at)
    VALUES (?,?,?,'AWAITING_NAME',?,?,?)`)
    .bind(intakeId,String(actorId),audienceId,createdAt,createdAt,expiresAt).run();
  return draftById(db,actorId,intakeId);
}

async function updateDraft(db,intakeId,sets,values){
  const now=new Date().toISOString();
  await db.prepare(`UPDATE access_request_intakes SET ${sets},updated_at=? WHERE intake_id=?`)
    .bind(...values,now,intakeId).run();
}

async function showNamePrompt(token,chatId,audienceId,invalid=false){
  const audience=audienceId==='DIRIGENTES'?'Dirigentes':'Chépica Play';
  const prefix=invalid?'⚠️ Necesito un nombre válido.\n\n':'';
  await forceReply(
    token,
    chatId,
    `${prefix}👤 SOLICITUD ${audience.toUpperCase()} · PASO 1\n\nEscribe tu nombre y apellido.\n\nEste dato será mostrado al administrador para revisar tu solicitud. Tu identidad técnica seguirá siendo tu cuenta real de Telegram.\n\nPara salir escribe /cancelar.`,
    'Nombre y apellido'
  );
}

async function showEntityPrompt(token,chatId,invalid=false){
  const prefix=invalid?'⚠️ Necesito un club o institución válido.\n\n':'';
  await forceReply(
    token,
    chatId,
    `${prefix}🏟️ SOLICITUD CHÉPICA PLAY · PASO 2\n\nEscribe el nombre del club o institución que representas.\n\nEjemplo: Club Unión Orilla, Chépica Play, medio de comunicación, organización deportiva, etc.\n\nPara salir escribe /cancelar.`,
    'Club o institución'
  );
}

async function showClubPicker(db,token,chatId,intakeId){
  const q=await db.prepare('SELECT team_id,canonical_name FROM teams ORDER BY canonical_name').all();
  const rows=(q.results||[]).map(team=>[{
    text:`🏟️ ${team.canonical_name}`,
    callback_data:`ari:club:${intakeId}:${team.team_id}`
  }]);
  rows.push([{text:'❌ Cancelar',callback_data:`ari:cancel:${intakeId}`}]);
  await send(
    token,
    chatId,
    '🏟️ SOLICITUD DIRIGENTES · PASO 2\n\nSelecciona el club que representas.\n\nTodavía no se ha enviado ninguna solicitud ni se han concedido permisos.',
    {inline_keyboard:rows}
  );
}

async function showReview(token,update,draft){
  const keyboard=[
    [{text:'✅ Enviar solicitud',callback_data:`ari:confirm:${draft.intake_id}`}],
    [{text:'✏️ Corregir nombre',callback_data:`ari:edit-name:${draft.intake_id}`}],
    [{text:draft.audience_id==='DIRIGENTES'?'🏟️ Cambiar club':'🏟️ Corregir club/institución',callback_data:`ari:edit-entity:${draft.intake_id}`}],
    [{text:'❌ Cancelar',callback_data:`ari:cancel:${draft.intake_id}`}]
  ];
  return present(token,update,buildReviewSummary(draft),keyboard);
}

async function upsertReporter(db,actor){
  const now=new Date().toISOString();
  const actorId=String(actor.id);
  await db.prepare(`INSERT INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`)
    .bind(actorId,telegramDisplayName(actor),actor.username||null,now,now).run();
}

async function pendingForAudience(db,actorId,audienceId){
  if(audienceId==='CHEPICA_PLAY'){
    return db.prepare(`SELECT request_id FROM partner_access_requests
      WHERE telegram_user_id=? AND partner_code='CHEPICA_PLAY' AND scope_id=? AND status='PENDING' LIMIT 1`)
      .bind(String(actorId),COMPETITION_ID).first();
  }
  return db.prepare("SELECT request_id FROM access_requests WHERE telegram_user_id=? AND status='PENDING' LIMIT 1")
    .bind(String(actorId)).first();
}

async function notifyApprovers(db,token,audienceId,row){
  const q=await db.prepare(`SELECT * FROM reporters
    WHERE active=1 AND trust_level='VERIFIED' AND role IN ('SUPER_ADMIN','PLATFORM_OPERATOR')`).all();
  let count=0;
  for(const reviewer of q.results||[]){
    if(audienceId==='DIRIGENTES'){
      if(reviewer.role!=='SUPER_ADMIN') continue;
    }else if(!canManageAccess(reviewer)) continue;

    const callback=audienceId==='DIRIGENTES'
      ?`tp:review:${row.request_id}`
      :`cp:access-review:${row.request_id}`;
    const title=audienceId==='DIRIGENTES'?'DIRIGENTES':'CHÉPICA PLAY';
    await send(
      token,
      String(reviewer.telegram_user_id),
      `🔔 SOLICITUD ${title}\n\n👤 Nombre declarado: ${row.declared_name}\n🏟️ Representa: ${row.represented_entity_label||row.represented_entity}\n📱 Telegram: ${row.username?'@'+row.username:row.telegram_user_id}\n\nLa solicitud está PENDIENTE. Revisar no concede permisos; sólo Aprobar puede materializar la autoridad correspondiente.`,
      {inline_keyboard:[[{text:'🔎 Revisar solicitud',callback_data:callback}]]}
    );
    count++;
  }
  return count;
}

async function submitDraft(db,token,actor,draft){
  const actorId=String(actor.id);
  const now=new Date().toISOString();
  const existing=await pendingForAudience(db,actorId,draft.audience_id);
  if(existing) return {existing:true,request_id:existing.request_id,approvers_notified:0};

  if(draft.audience_id==='CHEPICA_PLAY'){
    const requestId=`cpar-${actorId}-${Date.now().toString(36)}`;
    await db.batch([
      db.prepare(`INSERT INTO partner_access_requests
        (request_id,telegram_user_id,display_name,username,partner_code,requested_role,scope_type,scope_id,status,created_at,declared_name,represented_entity,intake_id,submitted_at)
        VALUES (?,?,?,?,?,'MEDIA_PARTNER','COMPETITION',?,'PENDING',?,?,?,?,?,?)`)
        .bind(requestId,actorId,telegramDisplayName(actor),actor.username||null,PARTNER_CODE,COMPETITION_ID,now,draft.declared_name,draft.represented_entity_label,draft.intake_id,now),
      db.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,actor_id,actor_name,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(`cp-access-${requestId}`,'telegram.partner_access.requested',now,now,COMPETITION_ID,'2026',actorId,telegramDisplayName(actor),'PENDING',JSON.stringify({request_id:requestId,partner_code:PARTNER_CODE,role:'MEDIA_PARTNER',declared_name:draft.declared_name,represented_entity:draft.represented_entity_label,intake_id:draft.intake_id}))
    ]);
    const row=await db.prepare('SELECT * FROM partner_access_requests WHERE request_id=?').bind(requestId).first();
    const approvers=await notifyApprovers(db,token,draft.audience_id,row);
    return {existing:false,request_id:requestId,approvers_notified:approvers};
  }

  const requestId=`ar-${actorId}-${Date.now().toString(36)}`;
  await db.batch([
    db.prepare(`INSERT INTO access_requests
      (request_id,telegram_user_id,display_name,username,requested_club_id,requested_role,status,created_at,declared_name,represented_entity_label,intake_id,submitted_at)
      VALUES (?,?,?,?,?,'CLUB_ADMIN','PENDING',?,?,?,?,?,?)`)
      .bind(requestId,actorId,telegramDisplayName(actor),actor.username||null,draft.represented_entity_id,now,draft.declared_name,draft.represented_entity_label,draft.intake_id,now),
    db.prepare(`INSERT OR REPLACE INTO events
      (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(`access-${requestId}`,'telegram.access.requested',now,now,actorId,telegramDisplayName(actor),draft.represented_entity_id,'PENDING',JSON.stringify({requested_role:'CLUB_ADMIN',declared_name:draft.declared_name,represented_entity:draft.represented_entity_label,intake_id:draft.intake_id}))
  ]);
  const row=await db.prepare('SELECT * FROM access_requests WHERE request_id=?').bind(requestId).first();
  const approvers=await notifyApprovers(db,token,draft.audience_id,row);
  return {existing:false,request_id:requestId,approvers_notified:approvers};
}

async function showSubmitted(token,update,draft,result){
  const statusCallback=draft.audience_id==='DIRIGENTES'?'tp:reqstatus':'cp:access-status';
  const audience=draft.audience_id==='DIRIGENTES'?'DIRIGENTES':'CHÉPICA PLAY';
  return present(
    token,
    update,
    `🕒 SOLICITUD ${audience}\n\n👤 Nombre: ${draft.declared_name}\n🏟️ Representa: ${draft.represented_entity_label}\n\nEstado: PENDIENTE\n\nUn administrador debe revisarla. Enviar esta solicitud no cambió tus permisos.`,
    [
      [{text:'🔎 Ver estado',callback_data:statusCallback}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]
  );
}

async function showEnrichedReview(db,token,update,actorId,data){
  const reporter=await db.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(String(actorId)).first();
  const cp=data.match(/^cp:access-review:(cpar-[A-Za-z0-9-]+)$/);
  if(cp){
    if(!canManageAccess(reporter)) return null;
    const row=await db.prepare('SELECT * FROM partner_access_requests WHERE request_id=?').bind(cp[1]).first();
    if(!row) return null;
    await answer(token,update.callback_query.id,'Revisar');
    const declared=row.declared_name||row.display_name||row.telegram_user_id;
    const represented=row.represented_entity||'No declarado (solicitud anterior)';
    await present(token,update,
      `🔐 REVISAR ACCESO CHÉPICA PLAY\n\n👤 Nombre declarado: ${declared}\n🏟️ Club / institución: ${represented}\n📱 Telegram: ${row.username?'@'+row.username:row.telegram_user_id}\nEstado: ${row.status}\n\nAl aprobar se vincula esta identidad a Chépica Play con sólo:\n1. 📝 Ingresar resultados\n2. ⚽ Consultar resultados`,
      [[{text:'✅ Aprobar',callback_data:`cp:access-approve:${row.request_id}`}],[{text:'❌ Rechazar',callback_data:`cp:access-reject:${row.request_id}`}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]
    );
    return json({ok:true,handled:'structured_access_review',audience_id:'CHEPICA_PLAY',request_id:row.request_id});
  }

  const leaders=data.match(/^tp:review:(ar-[A-Za-z0-9-]+)$/);
  if(leaders){
    if(!reporter||reporter.role!=='SUPER_ADMIN'||Number(reporter.active)!==1||reporter.trust_level!=='VERIFIED') return null;
    const row=await db.prepare(`SELECT a.*,t.canonical_name FROM access_requests a
      LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.request_id=?`).bind(leaders[1]).first();
    if(!row) return null;
    await answer(token,update.callback_query.id,'Revisar');
    await present(token,update,
      `🔐 REVISAR ACCESO DIRIGENTE\n\n👤 Nombre declarado: ${row.declared_name||row.display_name||row.telegram_user_id}\n🏟️ Club: ${row.represented_entity_label||row.canonical_name||row.requested_club_id}\n📱 Telegram: ${row.username?'@'+row.username:row.telegram_user_id}\nEstado: ${row.status}\n\nAprobar habilitará el rol CLUB_ADMIN para ese club.`,
      [[{text:'✅ Aprobar',callback_data:`tp:approve:${row.request_id}`}],[{text:'❌ Rechazar',callback_data:`tp:reject:${row.request_id}`}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]
    );
    return json({ok:true,handled:'structured_access_review',audience_id:'DIRIGENTES',request_id:row.request_id});
  }
  return null;
}

export async function handleAccessRequestIntake(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST'||!env.DB) return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const actor=update?.message?.from||update?.callback_query?.from;
  const chatId=update?.message?.chat?.id||update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const data=String(update?.callback_query?.data||'');
  const text=String(update?.message?.text||'').trim();
  let draft=null;
  if(!isPotentialCallback(data)){
    draft=await activeDraft(env.DB,actor.id);
    if(!draft) return null;
    if(text.startsWith('/')&&text.toLowerCase()!=='/cancelar') return null;
  }

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  await upsertReporter(env.DB,actor);
  const actorId=String(actor.id);

  if(/^cp:access-review:|^tp:review:/.test(data)){
    return showEnrichedReview(env.DB,context.token,update,actorId,data);
  }

  if(data==='tp:req'||data==='cp:access-request'){
    const audienceId=data==='tp:req'?'DIRIGENTES':'CHEPICA_PLAY';
    const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
    if(audienceId==='DIRIGENTES'&&isVerifiedLeader(reporter)) return null;
    if(audienceId==='CHEPICA_PLAY'){
      const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
      if(membership?.partner_code===PARTNER_CODE) return null;
    }
    if(await pendingForAudience(env.DB,actorId,audienceId)) return null;

    if(update.callback_query) await answer(context.token,update.callback_query.id,'Solicitud');
    draft=await startDraft(env.DB,actorId,audienceId);
    await showNamePrompt(context.token,chatId,audienceId,false);
    return json({ok:true,handled:'access_intake_started',audience_id:audienceId,intake_id:draft.intake_id,request_status:null,permission_change:false});
  }

  if(text.toLowerCase()==='/cancelar'&&draft){
    await clearActorDrafts(env.DB,actorId);
    await send(context.token,chatId,'❌ Solicitud cancelada. No se creó ninguna solicitud PENDIENTE ni se modificaron tus permisos.',{inline_keyboard:[[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return json({ok:true,handled:'access_intake_cancelled',permission_change:false});
  }

  const callbackIntake=data.match(/^ari:(confirm|edit-name|edit-entity|cancel):(.+)$/);
  if(callbackIntake){
    draft=await draftById(env.DB,actorId,callbackIntake[2]);
    if(!draft){
      await answer(context.token,update.callback_query.id,'Solicitud vencida');
      return json({ok:true,handled:'access_intake_stale'});
    }
    const action=callbackIntake[1];
    await answer(context.token,update.callback_query.id,'Solicitud');
    if(action==='cancel'){
      await clearActorDrafts(env.DB,actorId);
      await present(context.token,update,'❌ Solicitud cancelada.\n\nNo se creó ninguna solicitud PENDIENTE ni se modificaron tus permisos.',[[{text:'🏠 Inicio',callback_data:'tp:home'}]]);
      return json({ok:true,handled:'access_intake_cancelled',permission_change:false});
    }
    if(action==='edit-name'){
      await updateDraft(env.DB,draft.intake_id,'state=?',[INTAKE_STATE.AWAITING_NAME]);
      await showNamePrompt(context.token,chatId,draft.audience_id,false);
      return json({ok:true,handled:'access_intake_edit_name',permission_change:false});
    }
    if(action==='edit-entity'){
      await updateDraft(env.DB,draft.intake_id,'state=?',[INTAKE_STATE.AWAITING_ENTITY]);
      if(draft.audience_id==='DIRIGENTES') await showClubPicker(env.DB,context.token,chatId,draft.intake_id);
      else await showEntityPrompt(context.token,chatId,false);
      return json({ok:true,handled:'access_intake_edit_entity',permission_change:false});
    }
    if(action==='confirm'){
      if(draft.state!==INTAKE_STATE.REVIEW) return json({ok:false,error:'intake_not_ready'},409);
      const result=await submitDraft(env.DB,context.token,actor,draft);
      await clearActorDrafts(env.DB,actorId);
      const mode=await showSubmitted(context.token,update,draft,result);
      return json({ok:true,handled:'access_request_submitted',audience_id:draft.audience_id,request_id:result.request_id,request_status:'PENDING',approvers_notified:result.approvers_notified,presentation_mode:mode,permission_change:false});
    }
  }

  const clubChoice=data.match(/^ari:club:([^:]+(?:-[^:]+)*):(.+)$/);
  if(clubChoice){
    draft=await draftById(env.DB,actorId,clubChoice[1]);
    if(!draft||draft.audience_id!=='DIRIGENTES') return null;
    const team=await env.DB.prepare('SELECT team_id,canonical_name FROM teams WHERE team_id=?').bind(clubChoice[2]).first();
    if(!team){
      await answer(context.token,update.callback_query.id,'Club no válido');
      return json({ok:true,handled:'access_intake_invalid_club'});
    }
    await answer(context.token,update.callback_query.id,'Club');
    await updateDraft(env.DB,draft.intake_id,'represented_entity_id=?,represented_entity_label=?,state=?',[team.team_id,team.canonical_name,INTAKE_STATE.REVIEW]);
    draft=await draftById(env.DB,actorId,draft.intake_id);
    const mode=await showReview(context.token,update,draft);
    return json({ok:true,handled:'access_intake_review',audience_id:draft.audience_id,presentation_mode:mode,permission_change:false});
  }

  if(!draft) draft=await activeDraft(env.DB,actorId);
  if(!draft) return null;

  if(draft.state===INTAKE_STATE.AWAITING_NAME){
    const declared=validateDeclaredName(text);
    if(!declared){
      await showNamePrompt(context.token,chatId,draft.audience_id,true);
      return json({ok:true,handled:'access_intake_name_invalid'});
    }
    await updateDraft(env.DB,draft.intake_id,'declared_name=?,state=?',[declared,INTAKE_STATE.AWAITING_ENTITY]);
    if(draft.audience_id==='DIRIGENTES') await showClubPicker(env.DB,context.token,chatId,draft.intake_id);
    else await showEntityPrompt(context.token,chatId,false);
    return json({ok:true,handled:'access_intake_name_captured',permission_change:false});
  }

  if(draft.state===INTAKE_STATE.AWAITING_ENTITY){
    if(draft.audience_id==='DIRIGENTES'){
      await showClubPicker(env.DB,context.token,chatId,draft.intake_id);
      return json({ok:true,handled:'access_intake_requires_club_choice'});
    }
    const represented=validateRepresentedEntity(text);
    if(!represented){
      await showEntityPrompt(context.token,chatId,true);
      return json({ok:true,handled:'access_intake_entity_invalid'});
    }
    await updateDraft(env.DB,draft.intake_id,'represented_entity_label=?,state=?',[represented,INTAKE_STATE.REVIEW]);
    draft=await draftById(env.DB,actorId,draft.intake_id);
    const mode=await showReview(context.token,update,draft);
    return json({ok:true,handled:'access_intake_review',audience_id:draft.audience_id,presentation_mode:mode,permission_change:false});
  }

  return null;
}
