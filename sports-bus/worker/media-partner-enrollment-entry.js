import { CAPABILITY, hasCapability, matchingScopedGrant } from './access-control.js';

const PARTNER_CODE='CHEPICA_PLAY';
const PARTNER_NAME='Chépica Play';
const INVITE_TTL_DAYS=7;
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// MEDIA-PARTNER-ENROLLMENT-01
// A partner grant is additive and resource-scoped. Claiming an invitation never
// replaces the person's base role and never grants administrative authority.
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
  const relevant=!!claim||/^\/(medios|partner)(?:@\w+)?$/i.test(text)||data.startsWith('mp:');
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'media_partner_enrollment_not_configured'},503);

  const actorId=String(actor.id);
  await upsertIdentity(env.DB,actorId,actor);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();

  if(claim) return claimInvite(env,chatId,actorId,actor,claim[1]);

  if(/^\/partner(?:@\w+)?$/i.test(text)||data==='mp:home'){
    if(callback) await answer(env,callback.id,'Medio colaborador');
    await showPartnerHome(env,chatId,actorId);
    return json({ok:true,handled:'media_partner_home'});
  }

  if(/^\/medios(?:@\w+)?$/i.test(text)||data==='mp:manage'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    if(callback) await answer(env,callback.id,'Medios colaboradores');
    await showManagement(env,chatId);
    return json({ok:true,handled:'media_partner_management'});
  }

  if(data==='mp:create'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    await answer(env,callback.id,'Asignar partido');
    await showInviteDates(env,chatId);
    return json({ok:true,handled:'media_partner_invite_dates'});
  }

  const date=data.match(/^mp:date:(\d+)$/);
  if(date){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    await answer(env,callback.id,`Fecha ${date[1]}`);
    await showInviteMatches(env,chatId,Number(date[1]));
    return json({ok:true,handled:'media_partner_invite_matches'});
  }

  const make=data.match(/^mp:make:([A-Za-z0-9._:-]+)$/);
  if(make){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    const match=await getMatch(env.DB,make[1]);
    if(!match){await answer(env,callback.id,'Partido no válido');return json({ok:true,handled:'media_partner_invalid_match'});}
    const existing=await env.DB.prepare("SELECT i.invite_id,i.expires_at FROM partner_scope_invites i WHERE i.partner_code=? AND i.scope_type='MATCH' AND i.scope_id=? AND i.status='PENDING' AND i.expires_at>? ORDER BY i.created_at DESC LIMIT 1").bind(PARTNER_CODE,match.match_id,new Date().toISOString()).first();
    if(existing){
      await answer(env,callback.id,'Ya existe invitación');
      await send(env,chatId,`🕒 Ya existe una invitación pendiente para ${PARTNER_NAME} en este partido. Por seguridad no se puede volver a mostrar el token original; revócala o espera su vencimiento antes de crear otra.`,{inline_keyboard:[[{text:'📋 Ver invitaciones',callback_data:'mp:invites'}],[{text:'⬅️ Partido',callback_data:`mp:date:${match.round_no}`}]]});
      return json({ok:true,handled:'media_partner_invite_already_pending'});
    }
    const token=randomToken();
    const tokenHash=await sha256Hex(token);
    const now=new Date();
    const expires=new Date(now.getTime()+INVITE_TTL_DAYS*86400000).toISOString();
    const inviteId=`mpi-${Date.now().toString(36)}-${token.slice(0,6)}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partner_scope_invites (invite_id,token_hash,partner_code,role,scope_type,scope_id,capabilities_json,trust_level,status,created_by,created_at,expires_at) VALUES (?,?,?,'MEDIA_PARTNER','MATCH',?,?,'VERIFIED','PENDING',?,?,?)`).bind(inviteId,tokenHash,PARTNER_CODE,match.match_id,JSON.stringify([CAPABILITY.OBSERVE_RESULT,CAPABILITY.PUBLISH_MATCH_EVENT]),actorId,now.toISOString(),expires),
      auditStmt(env.DB,`mp-invite-${inviteId}`,actorId,reporter,'CREATE_MEDIA_PARTNER_INVITE','partner_scope_invite',inviteId,1,'platform_access_manager_created_match_scoped_invite',now.toISOString())
    ]);
    await answer(env,callback.id,'Invitación creada');
    const deepLink=`https://t.me/FutbolChepicaBot?start=partner_${token}`;
    await send(env,chatId,`🎥 INVITACIÓN · ${PARTNER_NAME}\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\nAlcance: SOLO ESTE PARTIDO\nVigencia: ${INVITE_TTL_DAYS} días\n\nComparte este enlace con la identidad de Telegram que representará a ${PARTNER_NAME}:\n${deepLink}\n\nEl enlace es de un solo uso. Al reclamarlo se crea un grant MEDIA_PARTNER; no entrega permisos administrativos.`,{inline_keyboard:[[{text:'📋 Ver invitaciones',callback_data:'mp:invites'}],[{text:'⬅️ Medios',callback_data:'mp:manage'}]]});
    return json({ok:true,handled:'media_partner_invite_created',invite_id:inviteId,scope_type:'MATCH',scope_id:match.match_id});
  }

  if(data==='mp:invites'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    await answer(env,callback.id,'Invitaciones');
    await expireInvites(env.DB);
    await showInvites(env,chatId);
    return json({ok:true,handled:'media_partner_invite_list'});
  }

  const inviteDetail=data.match(/^mp:invite:([A-Za-z0-9._:-]+)$/);
  if(inviteDetail){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    await answer(env,callback.id,'Invitación');
    await showInviteDetail(env,chatId,inviteDetail[1]);
    return json({ok:true,handled:'media_partner_invite_detail'});
  }

  const revokeInvite=data.match(/^mp:invite-revoke:([A-Za-z0-9._:-]+)$/);
  if(revokeInvite){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    const row=await env.DB.prepare("SELECT * FROM partner_scope_invites WHERE invite_id=? AND status='PENDING'").bind(revokeInvite[1]).first();
    if(!row){await answer(env,callback.id,'Ya no está pendiente');return json({ok:true,handled:'media_partner_invite_not_pending'});}
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE partner_scope_invites SET status='REVOKED',revoked_by=?,revoked_at=? WHERE invite_id=? AND status='PENDING'").bind(actorId,now,row.invite_id),
      auditStmt(env.DB,`mp-invite-revoke-${row.invite_id}`,actorId,reporter,'REVOKE_MEDIA_PARTNER_INVITE','partner_scope_invite',row.invite_id,1,'platform_access_manager_revoked_invite',now)
    ]);
    await answer(env,callback.id,'Invitación revocada');
    await showInvites(env,chatId);
    return json({ok:true,handled:'media_partner_invite_revoked'});
  }

  if(data==='mp:grants'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    await answer(env,callback.id,'Accesos activos');
    await showGrants(env,chatId);
    return json({ok:true,handled:'media_partner_grant_list'});
  }

  const grantDetail=data.match(/^mp:grant:([A-Za-z0-9._:-]+)$/);
  if(grantDetail){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    await answer(env,callback.id,'Acceso');
    await showGrant(env,chatId,grantDetail[1]);
    return json({ok:true,handled:'media_partner_grant_detail'});
  }

  const grantRevoke=data.match(/^mp:grant-revoke:([A-Za-z0-9._:-]+)$/);
  if(grantRevoke){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback,actorId,reporter);
    const g=await env.DB.prepare("SELECT * FROM actor_scope_grants WHERE grant_id=? AND role='MEDIA_PARTNER' AND active=1").bind(grantRevoke[1]).first();
    if(!g){await answer(env,callback.id,'Ya revocado');return json({ok:true,handled:'media_partner_grant_not_active'});}
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE actor_scope_grants SET active=0,updated_at=? WHERE grant_id=? AND role='MEDIA_PARTNER' AND active=1").bind(now,g.grant_id),
      auditStmt(env.DB,`mp-grant-revoke-${g.grant_id}`,actorId,reporter,'REVOKE_MEDIA_PARTNER_GRANT','actor_scope_grant',g.grant_id,1,'platform_access_manager_revoked_partner_grant',now)
    ]);
    await answer(env,callback.id,'Acceso revocado');
    await send(env,g.telegram_user_id,`⛔ Tu acceso de ${PARTNER_NAME} para el partido asignado fue revocado. Sigues pudiendo usar las funciones públicas como cualquier usuario.`);
    await showGrants(env,chatId);
    return json({ok:true,handled:'media_partner_grant_revoked'});
  }

  const partnerMatch=data.match(/^mp:match:([A-Za-z0-9._:-]+)$/);
  if(partnerMatch){
    const match=await getMatch(env.DB,partnerMatch[1]);
    if(!match){await answer(env,callback.id,'Partido no válido');return json({ok:true,handled:'media_partner_invalid_match'});}
    const grant=await matchingScopedGrant(env.DB,reporter,match,'MEDIA_PARTNER');
    if(!grant){await answer(env,callback.id,'Fuera de alcance');await send(env,chatId,'🔒 Esa identidad no tiene un grant de medio colaborador para este partido.');return json({ok:true,handled:'media_partner_scope_denied'});}
    await answer(env,callback.id,'Partido asignado');
    await showPartnerMatch(env,chatId,match,grant);
    return json({ok:true,handled:'media_partner_match'});
  }

  return null;
}

function canManagePartners(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&hasCapability(r,CAPABILITY.MANAGE_ACCESS)&&['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(r.role);}

async function claimInvite(env,chatId,actorId,actor,token){
  await expireInvites(env.DB);
  const hash=await sha256Hex(token);
  const invite=await env.DB.prepare(`SELECT i.*,p.display_name AS partner_name FROM partner_scope_invites i JOIN partner_definitions p ON p.partner_code=i.partner_code WHERE i.token_hash=? LIMIT 1`).bind(hash).first();
  if(!invite||invite.status!=='PENDING'){
    await send(env,chatId,'⚠️ Esta invitación no es válida, ya fue utilizada, fue revocada o venció.');
    return json({ok:true,handled:'media_partner_claim_invalid'});
  }
  const match=invite.scope_type==='MATCH'?await getMatch(env.DB,invite.scope_id):null;
  if(invite.scope_type==='MATCH'&&!match){
    await send(env,chatId,'⚠️ El partido asociado a esta invitación ya no está disponible. No se creó ningún acceso.');
    return json({ok:true,handled:'media_partner_claim_scope_missing'});
  }
  const now=new Date().toISOString();
  const grantId=`mpg-${invite.invite_id}`;
  const sourceLabel=`${invite.partner_name||PARTNER_NAME} · transmisión`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO actor_scope_grants (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at) VALUES (?,?,'MEDIA_PARTNER',?,?,?,?,?,?,1,?,?) ON CONFLICT(telegram_user_id,role,scope_type,scope_id) DO UPDATE SET capabilities_json=excluded.capabilities_json,trust_level=excluded.trust_level,source_label=excluded.source_label,granted_by=excluded.granted_by,active=1,updated_at=excluded.updated_at`).bind(grantId,actorId,invite.scope_type,invite.scope_id,invite.capabilities_json,invite.trust_level,sourceLabel,invite.created_by,now,now),
    env.DB.prepare("UPDATE partner_scope_invites SET status='CLAIMED',claimed_by=?,claimed_at=? WHERE invite_id=? AND status='PENDING'").bind(actorId,now,invite.invite_id)
  ]);
  const claimed=await env.DB.prepare("SELECT status,claimed_by FROM partner_scope_invites WHERE invite_id=?").bind(invite.invite_id).first();
  if(claimed?.status!=='CLAIMED'||String(claimed.claimed_by)!==actorId){
    await send(env,chatId,'⚠️ La invitación cambió mientras se procesaba. No se pudo confirmar el acceso.');
    return json({ok:true,handled:'media_partner_claim_race_guard'});
  }
  const baseRole=(await env.DB.prepare('SELECT role FROM reporters WHERE telegram_user_id=?').bind(actorId).first())?.role||'REPORTER';
  await send(env,chatId,`✅ ${invite.partner_name||PARTNER_NAME} CONECTADO\n\n${match?`${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}`:`Alcance: ${invite.scope_type} ${invite.scope_id}`}\n\nTu rol base sigue siendo ${baseRole}. Se agregó un acceso MEDIA_PARTNER sólo para el alcance asignado. Tus observaciones en ese partido quedarán identificadas como fuente de ${invite.partner_name||PARTNER_NAME}; no pueden cambiar políticas ni sobrescribir por sí solas el resultado oficial.`,{inline_keyboard:[[{text:'🎥 Abrir partido asignado',callback_data:match?`mp:match:${match.match_id}`:'mp:home'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
  return json({ok:true,handled:'media_partner_claimed',grant_id:grantId,scope_type:invite.scope_type,scope_id:invite.scope_id,base_role:baseRole});
}

async function showPartnerHome(env,chatId,actorId){
  const q=await env.DB.prepare(`SELECT g.*,m.round_label,m.group_id,m.home_name,m.away_name FROM actor_scope_grants g LEFT JOIN matches m ON g.scope_type='MATCH' AND m.match_id=g.scope_id WHERE g.telegram_user_id=? AND g.role='MEDIA_PARTNER' AND g.active=1 ORDER BY g.updated_at DESC`).bind(actorId).all();
  const grants=q.results||[];
  if(!grants.length){
    await send(env,chatId,'🎥 MEDIO COLABORADOR\n\nNo tienes partidos asignados como MEDIA_PARTNER. Si recibiste una invitación, ábrela desde esta misma cuenta de Telegram.',{inline_keyboard:[[{text:'🌐 Público',callback_data:'tp:public'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return;
  }
  const rows=grants.filter(g=>g.scope_type==='MATCH'&&g.home_name).map(g=>[{text:`🎥 ${g.round_label} · ${g.home_name} — ${g.away_name}`,callback_data:`mp:match:${g.scope_id}`}]);
  rows.push([{text:'🌐 Público',callback_data:'tp:public'}]);
  rows.push([{text:'🏠 Inicio',callback_data:'tp:home'}]);
  await send(env,chatId,`🎥 ${PARTNER_NAME.toUpperCase()} · PARTIDOS ASIGNADOS\n\nTu acceso es de contribución y consumo; no es administración del campeonato.`,{inline_keyboard:rows});
}

async function showPartnerMatch(env,chatId,match,grant){
  const q=await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const map=new Map((q.results||[]).map(r=>[r.series_code,r]));
  const lines=SERIES.map(s=>{const r=map.get(s);return r?`✅ ${SERIES_LABEL[s]} · ${r.home_score}-${r.away_score} · ${r.validation_status}`:`➕ ${SERIES_LABEL[s]} · sin resultado`;});
  await send(env,chatId,`🎥 ${PARTNER_NAME}\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\n\n${lines.join('\n')}\n\nTus aportes se guardan como observaciones con procedencia “${grant.source_label||PARTNER_NAME}”. Un aporte nunca sobrescribe automáticamente el resultado canónico.`,{inline_keyboard:[[{text:'📣 Informar resultado',callback_data:`obs:match:${match.match_id}`}],[{text:'⬅️ Mis partidos asignados',callback_data:'mp:home'}]]});
}

async function showManagement(env,chatId){
  const [pending,grants]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM partner_scope_invites WHERE partner_code=? AND status='PENDING' AND expires_at>?").bind(PARTNER_CODE,new Date().toISOString()).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM actor_scope_grants WHERE role='MEDIA_PARTNER' AND active=1 AND source_label LIKE ?").bind(`${PARTNER_NAME}%`).first()
  ]);
  await send(env,chatId,`🎥 MEDIOS COLABORADORES\n\n${PARTNER_NAME}\nInvitaciones pendientes: ${Number(pending?.n||0)}\nAccesos activos: ${Number(grants?.n||0)}\n\nEl acceso se asigna por partido; no entrega gobierno del campeonato.`,{inline_keyboard:[[{text:'➕ Asignar partido a Chépica Play',callback_data:'mp:create'}],[{text:`🕒 Invitaciones (${Number(pending?.n||0)})`,callback_data:'mp:invites'}],[{text:`🎥 Accesos activos (${Number(grants?.n||0)})`,callback_data:'mp:grants'}],[{text:'⬅️ Administración',callback_data:'tp:leaders'}]]});
}

async function showInviteDates(env,chatId){
  const q=await env.DB.prepare("SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id='ANFA-CHEPICA-2026' ORDER BY round_no").all();
  const rows=(q.results||[]).map(r=>[{text:`⚽ ${r.round_label||'Fecha '+r.round_no}`,callback_data:`mp:date:${r.round_no}`}]);
  rows.push([{text:'⬅️ Medios',callback_data:'mp:manage'}]);
  await send(env,chatId,`🎥 ASIGNAR PARTIDO · ${PARTNER_NAME}\n\nSelecciona la fecha del partido que cubrirá el medio.`,{inline_keyboard:rows});
}

async function showInviteMatches(env,chatId,roundNo){
  const q=await env.DB.prepare("SELECT match_id,group_id,round_no,round_label,home_name,away_name FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=? ORDER BY group_id,match_id").bind(roundNo).all();
  const rows=(q.results||[]).map(m=>[{text:`Grupo ${m.group_id} · ${m.home_name} — ${m.away_name}`,callback_data:`mp:make:${m.match_id}`}]);
  rows.push([{text:'⬅️ Fechas',callback_data:'mp:create'}]);
  await send(env,chatId,`📅 Fecha ${roundNo}\n\nSelecciona el partido. La invitación quedará limitada exclusivamente a ese partido.`,{inline_keyboard:rows});
}

async function showInvites(env,chatId){
  const q=await env.DB.prepare(`SELECT i.*,m.round_label,m.home_name,m.away_name FROM partner_scope_invites i LEFT JOIN matches m ON i.scope_type='MATCH' AND m.match_id=i.scope_id WHERE i.partner_code=? ORDER BY i.created_at DESC LIMIT 30`).bind(PARTNER_CODE).all();
  const rows=(q.results||[]).map(i=>[{text:`${inviteIcon(i.status)} ${i.status} · ${i.round_label||i.scope_id} · ${i.home_name||''} ${i.away_name?'— '+i.away_name:''}`.trim(),callback_data:`mp:invite:${i.invite_id}`}]);
  rows.push([{text:'⬅️ Medios',callback_data:'mp:manage'}]);
  await send(env,chatId,`🕒 INVITACIONES · ${PARTNER_NAME}\n\nEl token sólo se muestra en el momento de creación.`,{inline_keyboard:rows});
}

async function showInviteDetail(env,chatId,id){
  const i=await env.DB.prepare(`SELECT i.*,m.round_label,m.home_name,m.away_name,r.display_name AS claimed_name,r.username AS claimed_username FROM partner_scope_invites i LEFT JOIN matches m ON i.scope_type='MATCH' AND m.match_id=i.scope_id LEFT JOIN reporters r ON r.telegram_user_id=i.claimed_by WHERE i.invite_id=?`).bind(id).first();
  if(!i){await send(env,chatId,'Invitación no encontrada.');return;}
  const rows=[];
  if(i.status==='PENDING') rows.push([{text:'⛔ Revocar invitación',callback_data:`mp:invite-revoke:${id}`}]);
  rows.push([{text:'⬅️ Invitaciones',callback_data:'mp:invites'}]);
  await send(env,chatId,`🧾 INVITACIÓN MEDIA_PARTNER\n\nPartner: ${PARTNER_NAME}\nPartido: ${i.round_label||''} · ${i.home_name||i.scope_id}${i.away_name?' — '+i.away_name:''}\nEstado: ${i.status}\nVence: ${i.expires_at}\nReclamada por: ${i.claimed_name||i.claimed_username||i.claimed_by||'—'}`,{inline_keyboard:rows});
}

async function showGrants(env,chatId){
  const q=await env.DB.prepare(`SELECT g.*,r.display_name,r.username,m.round_label,m.home_name,m.away_name FROM actor_scope_grants g LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id LEFT JOIN matches m ON g.scope_type='MATCH' AND m.match_id=g.scope_id WHERE g.role='MEDIA_PARTNER' AND g.active=1 ORDER BY g.updated_at DESC LIMIT 40`).all();
  const rows=(q.results||[]).map(g=>[{text:`🎥 ${g.display_name||g.username||g.telegram_user_id} · ${g.round_label||g.scope_id}`,callback_data:`mp:grant:${g.grant_id}`}]);
  rows.push([{text:'⬅️ Medios',callback_data:'mp:manage'}]);
  await send(env,chatId,`🎥 ACCESOS MEDIA_PARTNER ACTIVOS\n\n${q.results?.length||0} grant(s) activo(s).`,{inline_keyboard:rows});
}

async function showGrant(env,chatId,id){
  const g=await env.DB.prepare(`SELECT g.*,r.display_name,r.username,m.round_label,m.home_name,m.away_name FROM actor_scope_grants g LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id LEFT JOIN matches m ON g.scope_type='MATCH' AND m.match_id=g.scope_id WHERE g.grant_id=? AND g.role='MEDIA_PARTNER'`).bind(id).first();
  if(!g){await send(env,chatId,'Acceso no encontrado.');return;}
  await send(env,chatId,`🎥 ACCESO MEDIA_PARTNER\n\nIdentidad: ${g.display_name||g.username||g.telegram_user_id}\nFuente: ${g.source_label||PARTNER_NAME}\nAlcance: ${g.scope_type}\nPartido: ${g.round_label||''} · ${g.home_name||g.scope_id}${g.away_name?' — '+g.away_name:''}\nConfianza: ${g.trust_level}\nEstado: ${Number(g.active)===1?'ACTIVO':'REVOCADO'}`,{inline_keyboard:[...(Number(g.active)===1?[[{text:'⛔ Revocar acceso',callback_data:`mp:grant-revoke:${id}`}]]:[]),[{text:'⬅️ Accesos',callback_data:'mp:grants'}]]});
}

async function expireInvites(db){await db.prepare("UPDATE partner_scope_invites SET status='EXPIRED' WHERE status='PENDING' AND expires_at<=?").bind(new Date().toISOString()).run();}
async function getMatch(db,id){return db.prepare("SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name FROM matches WHERE match_id=? AND competition_id='ANFA-CHEPICA-2026'").bind(id).first();}
async function upsertIdentity(db,id,actor){const now=new Date().toISOString();await db.prepare(`INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at) VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`).bind(id,displayName(actor),actor.username||null,now,now).run();}
function displayName(a){return [a?.first_name,a?.last_name].filter(Boolean).join(' ').trim()||a?.username||String(a?.id||'Usuario Telegram');}
function randomToken(){const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);return bytesToBase64Url(bytes);}
function bytesToBase64Url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function inviteIcon(s){return s==='CLAIMED'?'✅':s==='REVOKED'?'⛔':s==='EXPIRED'?'⌛':'🕒';}
function auditStmt(db,id,actorId,reporter,action,type,resource,allowed,reason,now){return db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,actorId,reporter?.role||null,reporter?.club_id||null,action,type,resource,allowed,reason,now);}
async function denyManage(env,chatId,callback,actorId,reporter){if(callback)await answer(env,callback.id,'No autorizado');await auditStmt(env.DB,`mp-deny-${actorId}-${Date.now().toString(36)}`,actorId,reporter,'MANAGE_MEDIA_PARTNER','partner',PARTNER_CODE,0,'requires_manage_access_without_policy_change',new Date().toISOString()).run();await send(env,chatId,'🔒 No tienes autorización para gestionar medios colaboradores.');return json({ok:true,handled:'media_partner_management_denied'});}
async function answer(env,id,text){if(!id)return;await telegram(env,'answerCallbackQuery',{callback_query_id:id,text:String(text).slice(0,180)});}
async function send(env,chatId,text,replyMarkup=null){const body={chat_id:chatId,text};if(replyMarkup)body.reply_markup=replyMarkup;await telegram(env,'sendMessage',body);}
async function telegram(env,method,body){return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
