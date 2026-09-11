import { CAPABILITY, hasCapability, getActivePartnerMembership } from './access-control.js';

const PARTNER_CODE='CHEPICA_PLAY';
const PARTNER_NAME='Chépica Play';
const COMPETITION_ID='ANFA-CHEPICA-2026';
const INVITE_TTL_DAYS=7;
const PARTNER_CAPABILITIES=[CAPABILITY.READ_COMPETITION,CAPABILITY.OBSERVE_RESULT];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// MEDIA-PARTNER-TWO-CAPABILITIES-ROOT-05
// Product contract today:
//   1) consume championship results
//   2) register championship results
// One partner organization may have N independent Telegram identities.
// Each invitation is individual + single-use; several invitations may coexist.
// Context about transmission, correspondents or venues is NOT a product requirement.
export async function handleMediaPartnerEnrollmentRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const claim=text.match(/^\/start(?:@\w+)?\s+partner_([A-Za-z0-9_-]{12,80})$/i);
  const legacy=/^(mp:(coverage|mycoverages|hub)|mp:coverage-|mplive:)/.test(data);
  const relevant=!!claim||/^\/(medios|partner)(?:@\w+)?$/i.test(text)||data.startsWith('mp:')||data.startsWith('mplive:');
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'media_partner_collaboration_not_configured'},503);

  const actorId=String(actor.id);
  await upsertIdentity(env.DB,actorId,actor);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();

  if(legacy){
    if(callback) await answer(env,callback.id,'Flujo retirado');
    await send(env,chatId,`ℹ️ Ese botón pertenece a un modelo anterior de ${PARTNER_NAME} y ya no realiza acciones.\n\nHoy ${PARTNER_NAME} tiene sólo dos capacidades: consultar resultados y registrar resultados.`,{inline_keyboard:[[{text:'⚽ Consultar resultados',callback_data:'tp:public-results'}],[{text:'📝 Registrar resultado',callback_data:'obs:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return json({ok:true,handled:'media_partner_legacy_flow_retired'});
  }

  if(claim) return claimCollaborationInvite(env,chatId,actorId,reporter,claim[1]);

  if(/^\/medios(?:@\w+)?$/i.test(text)||data==='mp:manage'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    if(callback) await answer(env,callback.id,'Chépica Play');
    await showManagement(env,chatId);
    return json({ok:true,handled:'media_partner_management'});
  }

  if(/^\/partner(?:@\w+)?$/i.test(text)||data==='mp:home'){
    if(callback) await answer(env,callback.id,PARTNER_NAME);
    await showPartnerHome(env,chatId,actorId);
    return json({ok:true,handled:'media_partner_home'});
  }

  if(data==='mp:collab:invite'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    await expireInvites(env.DB);
    const token=randomToken(),tokenHash=await sha256Hex(token);
    const now=new Date(),expires=new Date(now.getTime()+INVITE_TTL_DAYS*86400000);
    const inviteId=`mpi-${Date.now().toString(36)}-${token.slice(0,6)}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partner_scope_invites (invite_id,token_hash,partner_code,role,scope_type,scope_id,capabilities_json,trust_level,status,created_by,created_at,expires_at)
        VALUES (?,?,?,'MEDIA_PARTNER','COMPETITION',?,?,'VERIFIED','PENDING',?,?,?)`).bind(inviteId,tokenHash,PARTNER_CODE,COMPETITION_ID,JSON.stringify(PARTNER_CAPABILITIES),actorId,now.toISOString(),expires.toISOString()),
      auditStmt(env.DB,`mp-invite-${inviteId}`,actorId,reporter,'CREATE_MEDIA_PARTNER_COLLABORATION_INVITE','partner_collaboration',PARTNER_CODE,1,'individual_single_use_partner_invite',now.toISOString())
    ]);
    const deepLink=`https://t.me/FutbolChepicaBot?start=partner_${token}`;
    await answer(env,callback.id,'Invitación creada');
    await send(env,chatId,`🤝 VINCULAR PERSONA · ${PARTNER_NAME}\n\nEsta invitación es individual y de un solo uso. Puedes generar una distinta para cada persona de ${PARTNER_NAME}; varias invitaciones pueden quedar pendientes al mismo tiempo.\n\nCada identidad vinculada obtiene exactamente dos capacidades:\n\n1. ⚽ Consultar resultados\n2. 📝 Registrar resultados\n\nNo asigna partidos, coberturas, corresponsales ni eventos en vivo. Tampoco entrega gobierno del campeonato.\nVigencia: ${INVITE_TTL_DAYS} días.\n\n${deepLink}`,{inline_keyboard:[[{text:'➕ Otra invitación',callback_data:'mp:collab:invite'}],[{text:'🕒 Invitaciones',callback_data:'mp:invites'}],[{text:'⬅️ Chépica Play',callback_data:'mp:manage'}]]});
    return json({ok:true,handled:'media_partner_collaboration_invite_created',invite_id:inviteId,scope_type:'COMPETITION',scope_id:COMPETITION_ID,capabilities:PARTNER_CAPABILITIES});
  }

  if(data==='mp:invites'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    await expireInvites(env.DB);
    await answer(env,callback.id,'Invitaciones');
    await showInvites(env,chatId);
    return json({ok:true,handled:'media_partner_invites'});
  }

  const revokeInvite=data.match(/^mp:invite-revoke:([A-Za-z0-9._:-]+)$/);
  if(revokeInvite){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    const now=new Date().toISOString();
    await env.DB.prepare("UPDATE partner_scope_invites SET status='REVOKED',revoked_by=?,revoked_at=? WHERE invite_id=? AND status='PENDING'").bind(actorId,now,revokeInvite[1]).run();
    await answer(env,callback.id,'Invitación revocada');
    await showInvites(env,chatId);
    return json({ok:true,handled:'media_partner_invite_revoked'});
  }

  if(data==='mp:members'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    await answer(env,callback.id,'Identidades');
    await showMembers(env,chatId);
    return json({ok:true,handled:'media_partner_members'});
  }

  const revokeMember=data.match(/^mp:member-revoke:([A-Za-z0-9._:-]+)$/);
  if(revokeMember){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    const grant=await env.DB.prepare("SELECT * FROM actor_scope_grants WHERE grant_id=? AND role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND partner_code=? AND active=1").bind(revokeMember[1],PARTNER_CODE).first();
    if(!grant){await answer(env,callback.id,'Ya no está activo');return json({ok:true,handled:'media_partner_member_not_active'});}
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE actor_scope_grants SET active=0,updated_at=? WHERE grant_id=? AND active=1').bind(now,grant.grant_id),
      auditStmt(env.DB,`mp-member-revoke-${grant.grant_id}`,actorId,reporter,'REVOKE_MEDIA_PARTNER_MEMBERSHIP','partner_collaboration',PARTNER_CODE,1,'partner_relationship_revoked_without_erasing_history',now)
    ]);
    await answer(env,callback.id,'Vínculo revocado');
    await send(env,grant.telegram_user_id,`⛔ Tu vínculo con ${PARTNER_NAME} fue revocado. Tu identidad y tus aportes históricos se conservan.`);
    await showMembers(env,chatId);
    return json({ok:true,handled:'media_partner_member_revoked'});
  }

  return null;
}

function canManagePartners(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&hasCapability(r,CAPABILITY.MANAGE_ACCESS)&&['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(r.role);}

async function claimCollaborationInvite(env,chatId,actorId,reporter,token){
  await expireInvites(env.DB);
  const hash=await sha256Hex(token);
  const invite=await env.DB.prepare(`SELECT i.*,p.display_name AS partner_name FROM partner_scope_invites i JOIN partner_definitions p ON p.partner_code=i.partner_code WHERE i.token_hash=? AND i.role='MEDIA_PARTNER' AND i.scope_type='COMPETITION' LIMIT 1`).bind(hash).first();
  if(!invite||invite.status!=='PENDING'){
    await send(env,chatId,'⚠️ Esta invitación no es válida, ya fue utilizada, fue revocada o venció.');
    return json({ok:true,handled:'media_partner_claim_invalid'});
  }

  const existing=await getActivePartnerMembership(env.DB,actorId,invite.scope_id);
  if(existing?.partner_code===invite.partner_code){
    await send(env,chatId,`ℹ️ Tu identidad ya está vinculada a ${invite.partner_name||PARTNER_NAME}.\n\nEsta invitación no fue consumida y puede ser utilizada por otra persona.` ,{inline_keyboard:[[{text:'⚽ Consultar resultados',callback_data:'tp:public-results'}],[{text:'📝 Registrar resultado',callback_data:'obs:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return json({ok:true,handled:'media_partner_already_member',grant_id:existing.grant_id,invite_id:invite.invite_id});
  }

  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE partner_scope_invites SET status='CLAIMED',claimed_by=?,claimed_at=? WHERE invite_id=? AND status='PENDING'").bind(actorId,now,invite.invite_id).run();
  const claimed=await env.DB.prepare('SELECT status,claimed_by FROM partner_scope_invites WHERE invite_id=?').bind(invite.invite_id).first();
  if(claimed?.status!=='CLAIMED'||String(claimed.claimed_by)!==actorId){
    await send(env,chatId,'⚠️ La invitación cambió mientras se procesaba. No se creó el vínculo.');
    return json({ok:true,handled:'media_partner_claim_race_guard'});
  }
  const grantId=`mpg-${invite.partner_code}-${actorId}-${invite.scope_id}`;
  const capabilities=JSON.stringify(PARTNER_CAPABILITIES);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO actor_scope_grants (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
      VALUES (?,?,'MEDIA_PARTNER','COMPETITION',?,?,?,?,?,1,?,?,?)
      ON CONFLICT(telegram_user_id,role,scope_type,scope_id) DO UPDATE SET capabilities_json=excluded.capabilities_json,trust_level=excluded.trust_level,source_label=excluded.source_label,granted_by=excluded.granted_by,active=1,updated_at=excluded.updated_at,partner_code=excluded.partner_code`).bind(grantId,actorId,invite.scope_id,capabilities,invite.trust_level,invite.partner_name||PARTNER_NAME,invite.created_by,now,now,invite.partner_code),
    auditStmt(env.DB,`mp-claim-${invite.invite_id}`,actorId,reporter||{role:'REPORTER',club_id:null},'CLAIM_MEDIA_PARTNER_COLLABORATION','partner_collaboration',invite.partner_code,1,'two_capability_partner_relationship_claimed',now)
  ]);
  await send(env,chatId,`✅ ${invite.partner_name||PARTNER_NAME} · VÍNCULO ACTIVO\n\nTu identidad quedó vinculada de forma independiente a ${PARTNER_NAME}. Puede haber otras identidades activas de la misma organización.\n\nTu espacio tiene sólo estas dos capacidades:\n\n1. ⚽ Consultar resultados\n2. 📝 Registrar resultados\n\nRegistrar un resultado crea un aporte identificado como ${PARTNER_NAME}; no te entrega gobierno ni modifica automáticamente el resultado oficial.`,{inline_keyboard:[[{text:'⚽ Consultar resultados',callback_data:'tp:public-results'}],[{text:'📝 Registrar resultado',callback_data:'obs:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
  return json({ok:true,handled:'media_partner_collaboration_claimed',grant_id:grantId,scope_type:'COMPETITION',scope_id:invite.scope_id,capabilities:PARTNER_CAPABILITIES});
}

async function showManagement(env,chatId){
  await expireInvites(env.DB);
  const [members,pending]=await Promise.all([
    activeMembers(env.DB),
    env.DB.prepare("SELECT COUNT(*) AS n FROM partner_scope_invites WHERE partner_code=? AND role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND scope_id=? AND status='PENDING' AND expires_at>?").bind(PARTNER_CODE,COMPETITION_ID,new Date().toISOString()).first()
  ]);
  await send(env,chatId,`🎥 ${PARTNER_NAME}\n\nEstado: ${members.length>0?'✅ ACTIVO':'⚪ SIN IDENTIDAD VINCULADA'}\nIdentidades activas: ${members.length}\nInvitaciones pendientes: ${Number(pending?.n||0)}\n\nMODELO DE IDENTIDAD\n${PARTNER_NAME} es una sola organización y puede tener varias identidades Telegram activas. Cada persona usa su propia cuenta; no se comparte una identidad técnica.\n\nCAPACIDADES ACTUALES\n1. ⚽ Consumir resultados\n2. 📝 Registrar resultados\n\nNo incluye coberturas, corresponsales, goles/eventos en vivo ni gobierno del campeonato.`,{inline_keyboard:[
    [{text:'➕ Nueva invitación individual',callback_data:'mp:collab:invite'}],
    [{text:`👥 Identidades (${members.length})`,callback_data:'mp:members'}],
    [{text:`🕒 Invitaciones (${Number(pending?.n||0)})`,callback_data:'mp:invites'}],
    [{text:'⬅️ Administración',callback_data:'po:home'}]
  ]});
}

async function showPartnerHome(env,chatId,actorId){
  const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
  if(!membership){
    await send(env,chatId,`🎥 ${PARTNER_NAME}\n\nTu cuenta no está vinculada a ${PARTNER_NAME}.`,{inline_keyboard:[[{text:'⚽ Consultar resultados',callback_data:'tp:public-results'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return;
  }
  await send(env,chatId,`🎥 ${PARTNER_NAME}\n\nEsta identidad está vinculada a ${PARTNER_NAME}. La organización puede tener más de una identidad activa, todas independientes.\n\nTienes dos capacidades habilitadas para el campeonato:\n\n1. ⚽ CONSUMIDOR DE RESULTADOS\nConsulta los resultados publicados.\n\n2. 📝 REGISTRADOR DE RESULTADOS\nInforma el marcador de una serie. El aporte queda trazado como fuente ${PARTNER_NAME} y no se convierte automáticamente en resultado oficial.`,{inline_keyboard:[
    [{text:'⚽ Consultar resultados',callback_data:'tp:public-results'}],
    [{text:'📝 Registrar resultado',callback_data:'obs:dates'}],
    [{text:'🏠 Inicio',callback_data:'tp:home'}]
  ]});
}

async function showInvites(env,chatId){
  const q=await env.DB.prepare("SELECT * FROM partner_scope_invites WHERE partner_code=? AND role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND scope_id=? ORDER BY created_at DESC LIMIT 10").bind(PARTNER_CODE,COMPETITION_ID).all();
  const rows=[];
  for(const i of q.results||[]){
    const icon=i.status==='PENDING'?'🕒':i.status==='CLAIMED'?'✅':i.status==='EXPIRED'?'⌛':'⛔';
    if(i.status==='PENDING') rows.push([{text:`${icon} ${i.invite_id}`,callback_data:`mp:invite-revoke:${i.invite_id}`}]);
  }
  rows.push([{text:'➕ Nueva invitación',callback_data:'mp:collab:invite'}]);
  rows.push([{text:'⬅️ Chépica Play',callback_data:'mp:manage'}]);
  const text=(q.results||[]).length?(q.results||[]).map(i=>`${i.status} · ${i.created_at}`).join('\n'):'Sin invitaciones registradas.';
  await send(env,chatId,`🕒 INVITACIONES · ${PARTNER_NAME}\n\nCada persona debe recibir su propia invitación. Pueden existir varias invitaciones pendientes simultáneamente; cada una es de un solo uso y habilita únicamente consultar + registrar resultados.\n\n${text}`,{inline_keyboard:rows});
}

async function showMembers(env,chatId){
  const q=await env.DB.prepare(`SELECT g.*,r.display_name FROM actor_scope_grants g LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id
    WHERE g.role='MEDIA_PARTNER' AND g.scope_type='COMPETITION' AND g.scope_id=? AND g.partner_code=? ORDER BY g.active DESC,g.updated_at DESC`).bind(COMPETITION_ID,PARTNER_CODE).all();
  const rows=[];
  for(const g of q.results||[]){if(Number(g.active)===1) rows.push([{text:`⛔ Revocar · ${g.display_name||g.telegram_user_id}`,callback_data:`mp:member-revoke:${g.grant_id}`}]);}
  rows.push([{text:'➕ Nueva invitación',callback_data:'mp:collab:invite'}]);
  rows.push([{text:'⬅️ Chépica Play',callback_data:'mp:manage'}]);
  const text=(q.results||[]).length?(q.results||[]).map(g=>`${Number(g.active)===1?'✅':'⛔'} ${g.display_name||g.telegram_user_id}`).join('\n'):'Sin identidades vinculadas.';
  await send(env,chatId,`👥 IDENTIDADES · ${PARTNER_NAME}\n\n${text}\n\n${PARTNER_NAME} puede tener múltiples identidades activas. Cada identidad es independiente y todas comparten el mismo contrato actual: consultar resultados + registrar resultados. Revocar una identidad no afecta a las demás.`,{inline_keyboard:rows});
}

async function activeMembers(db){
  const q=await db.prepare("SELECT * FROM actor_scope_grants WHERE role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND scope_id=? AND partner_code=? AND active=1 ORDER BY created_at").bind(COMPETITION_ID,PARTNER_CODE).all();
  return q.results||[];
}

async function expireInvites(db){await db.prepare("UPDATE partner_scope_invites SET status='EXPIRED' WHERE role='MEDIA_PARTNER' AND status='PENDING' AND expires_at<=?").bind(new Date().toISOString()).run();}

async function upsertIdentity(db,actorId,actor){
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`).bind(actorId,displayName(actor),actor.username||null,now,now).run();
}

function displayName(actor){return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()||actor?.username||String(actor?.id||'Usuario');}

async function denyManage(env,chatId,callback){if(callback)await answer(env,callback.id,'Sin permiso');await send(env,chatId,'🔒 Sólo la administración del campeonato puede gestionar vínculos de colaboradores.');return json({ok:true,handled:'media_partner_manage_denied'});}
function auditStmt(db,auditId,actorId,reporter,action,resourceType,resourceId,allowed,reason,createdAt){return db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(auditId,String(actorId),reporter?.role||'REPORTER',reporter?.club_id||null,action,resourceType,resourceId,allowed,reason,createdAt);}
async function send(env,chatId,text,replyMarkup=null){const body={chat_id:chatId,text};if(replyMarkup)body.reply_markup=replyMarkup;const res=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return res.json();}
async function answer(env,id,text){if(!id)return;await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});}
function randomToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(36).padStart(2,'0')).join('').slice(0,32);}
async function sha256Hex(value){const bytes=new TextEncoder().encode(String(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
