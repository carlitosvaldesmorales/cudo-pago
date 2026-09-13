import { getActivePartnerMembership } from './access-control.js';
import { AUDIENCE_ACCESS_POLICIES } from './audience-access-policy.js';
import { getStructuredIntakePolicy, INTAKE_STATE } from './access-request-intake-model.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const CANONICAL=TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_CODE='CHEPICA_PLAY';
const INTAKE_TTL_MS=30*60*1000;

export const GOVERNED_ACCESS_START_CONTRACT=Object.freeze({
  id:'GOVERNED_ACCESS_START_V1',
  policy_driven_request_callback:true,
  durable_draft_precedes_channel_ack:true,
  callback_ack_is_best_effort:true,
  same_transition_for_all_requestable_audiences:true,
  draft_never_grants_authority:true
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
  return {token};
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
    console.warn('governed_access_start_callback_ack_failed',{
      method:error?.telegram_method||'answerCallbackQuery',
      message:String(error?.message||error)
    });
    return {ok:false,reason:'telegram_ack_failed'};
  }
}

async function promptName(token,chatId,audienceId){
  const audience=audienceId==='DIRIGENTES'?'Dirigentes':'Chépica Play';
  await telegram(token,'sendMessage',{
    chat_id:chatId,
    text:`👤 SOLICITUD ${audience.toUpperCase()} · PASO 1\n\nEscribe tu nombre y apellido.\n\nEste dato será mostrado al administrador para revisar tu solicitud. Tu identidad técnica seguirá siendo tu cuenta real de Telegram.\n\nPara salir escribe /cancelar.`,
    reply_markup:{
      force_reply:true,
      selective:true,
      input_field_placeholder:'Nombre y apellido'
    },
    disable_web_page_preview:true
  });
}

async function bestEffortPromptName(token,chatId,audienceId){
  try{
    await promptName(token,chatId,audienceId);
    return {ok:true};
  }catch(error){
    console.error('governed_access_start_prompt_failed',{
      audience_id:audienceId,
      message:String(error?.message||error)
    });
    return {ok:false};
  }
}

function telegramDisplayName(actor){
  return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()
    || actor?.username
    || String(actor?.id||'Usuario Telegram');
}

async function upsertReporter(db,actor){
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO reporters
    (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      display_name=excluded.display_name,
      username=excluded.username,
      updated_at=excluded.updated_at`)
    .bind(String(actor.id),telegramDisplayName(actor),actor.username||null,now,now).run();
}

function isVerifiedLeader(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && ['SUPER_ADMIN','PLATFORM_OPERATOR','CLUB_ADMIN'].includes(reporter.role);
}

async function isAlreadyAuthorized(db,actorId,audienceId){
  if(audienceId==='DIRIGENTES'){
    const reporter=await db.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(String(actorId)).first();
    return isVerifiedLeader(reporter);
  }
  const membership=await getActivePartnerMembership(db,String(actorId),COMPETITION_ID);
  return membership?.partner_code===PARTNER_CODE;
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

async function clearActorDrafts(db,actorId){
  await db.prepare('DELETE FROM access_request_intakes WHERE telegram_user_id=?').bind(String(actorId)).run();
}

async function createDraft(db,actorId,audienceId){
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
  return db.prepare('SELECT * FROM access_request_intakes WHERE intake_id=?').bind(intakeId).first();
}

function requestPolicyForCallback(callbackData){
  return AUDIENCE_ACCESS_POLICIES.find(policy=>
    policy.requestable===true && policy.request_callback===callbackData
  )||null;
}

export async function handleAccessRequestStart(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,CANONICAL].includes(url.pathname)||request.method!=='POST'||!env?.DB) return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const data=String(update?.callback_query?.data||'');
  const policy=requestPolicyForCallback(data);
  if(!policy) return null;

  const actor=update?.callback_query?.from;
  const chatId=update?.callback_query?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const context=await runtimeContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  const actorId=String(actor.id);
  await upsertReporter(env.DB,actor);

  if(await isAlreadyAuthorized(env.DB,actorId,policy.id)) return null;
  if(await pendingForAudience(env.DB,actorId,policy.id)) return null;

  // The business transition is durable before Telegram side effects.
  // This is the same governed-transition rule already used by confirmation.
  const draft=await createDraft(env.DB,actorId,policy.id);
  if(!draft||draft.state!==INTAKE_STATE.AWAITING_NAME){
    return json({ok:false,error:'durable_access_draft_not_observed'},500);
  }

  const ack=await bestEffortAnswer(context.token,update.callback_query.id,'Solicitud');
  const presentation=await bestEffortPromptName(context.token,chatId,policy.id);

  return json({
    ok:true,
    handled:'access_intake_started',
    audience_id:policy.id,
    intake_id:draft.intake_id,
    intake_state:draft.state,
    request_status:null,
    callback_ack:ack.ok?'OK':'FAILED_NON_BLOCKING',
    presentation:presentation.ok?'SENT':'FAILED_NON_BLOCKING',
    permission_change:false
  });
}
