import { CAPABILITY, hasCapability, getActivePartnerMembership, getPartnerCoverage } from './access-control.js';

const PARTNER_CODE='CHEPICA_PLAY';
const PARTNER_NAME='Chépica Play';
const COMPETITION_ID='ANFA-CHEPICA-2026';
const INVITE_TTL_DAYS=7;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// MEDIA-PARTNER-COLLABORATION-ROOT-02
// Identity/relationship is persistent at COMPETITION scope.
// Match coverage is an operational assignment, never an access grant.
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
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'media_partner_collaboration_not_configured'},503);

  const actorId=String(actor.id);
  await upsertIdentity(env.DB,actorId,actor);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();

  if(claim) return claimCollaborationInvite(env,chatId,actorId,reporter,claim[1]);

  if(/^\/medios(?:@\w+)?$/i.test(text)||data==='mp:manage'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    if(callback) await answer(env,callback.id,'Colaboradores');
    await showManagement(env,chatId);
    return json({ok:true,handled:'media_partner_management'});
  }

  if(/^\/partner(?:@\w+)?$/i.test(text)||data==='mp:home'){
    if(callback) await answer(env,callback.id,'Chépica Play');
    await showPartnerHome(env,chatId,actorId);
    return json({ok:true,handled:'media_partner_home'});
  }

  if(data==='mp:collab:invite'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    const active=await activeMembers(env.DB);
    const pending=await env.DB.prepare("SELECT invite_id FROM partner_scope_invites WHERE partner_code=? AND role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND scope_id=? AND status='PENDING' AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(PARTNER_CODE,COMPETITION_ID,new Date().toISOString()).first();
    if(pending){
      await answer(env,callback.id,'Ya existe invitación');
      await send(env,chatId,'🕒 Ya existe una invitación pendiente para vincular una identidad de Chépica Play. Revócala o espera su vencimiento antes de generar otra.',{inline_keyboard:[[{text:'🕒 Invitaciones',callback_data:'mp:invites'}],[{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]]});
      return json({ok:true,handled:'media_partner_collaboration_invite_exists'});
    }
    const token=randomToken(),tokenHash=await sha256Hex(token);
    const now=new Date(),expires=new Date(now.getTime()+INVITE_TTL_DAYS*86400000);
    const inviteId=`mpi-${Date.now().toString(36)}-${token.slice(0,6)}`;
    const capabilities=[CAPABILITY.READ_COMPETITION,CAPABILITY.OBSERVE_RESULT,CAPABILITY.PUBLISH_MATCH_EVENT];
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partner_scope_invites (invite_id,token_hash,partner_code,role,scope_type,scope_id,capabilities_json,trust_level,status,created_by,created_at,expires_at)
        VALUES (?,?,?,'MEDIA_PARTNER','COMPETITION',?,?,'VERIFIED','PENDING',?,?,?)`).bind(inviteId,tokenHash,PARTNER_CODE,COMPETITION_ID,JSON.stringify(capabilities),actorId,now.toISOString(),expires.toISOString()),
      auditStmt(env.DB,`mp-invite-${inviteId}`,actorId,reporter,'CREATE_MEDIA_PARTNER_COLLABORATION_INVITE','partner_collaboration',PARTNER_CODE,1,'persistent_partner_relationship_invite',now.toISOString())
    ]);
    const deepLink=`https://t.me/FutbolChepicaBot?start=partner_${token}`;
    await answer(env,callback.id,'Invitación creada');
    await send(env,chatId,`🤝 VINCULAR COLABORADOR · ${PARTNER_NAME}\n\nEsta invitación vincula una identidad de Telegram como colaborador PERMANENTE del campeonato.\n\nNo está asociada a un partido. Las coberturas se asignan aparte.\nVigencia del enlace: ${INVITE_TTL_DAYS} días.\nMiembros activos actuales: ${active.length}\n\n${deepLink}\n\nEl enlace es de un solo uso y no entrega gobierno del campeonato ni permisos de política.`,{inline_keyboard:[[{text:'🕒 Invitaciones',callback_data:'mp:invites'}],[{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]]});
    return json({ok:true,handled:'media_partner_collaboration_invite_created',invite_id:inviteId,scope_type:'COMPETITION',scope_id:COMPETITION_ID});
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
    await answer(env,callback.id,'Miembros');
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
    await answer(env,callback.id,'Colaboración revocada');
    await send(env,grant.telegram_user_id,`⛔ Tu vínculo como colaborador de ${PARTNER_NAME} fue revocado. Tu cuenta y tus aportes históricos se conservan; sigues pudiendo usar las funciones públicas.`);
    await showMembers(env,chatId);
    return json({ok:true,handled:'media_partner_member_revoked'});
  }

  if(data==='mp:coverage'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    await answer(env,callback.id,'Coberturas');
    await showCoverageManagement(env,chatId);
    return json({ok:true,handled:'media_partner_coverage_management'});
  }

  if(data==='mp:coverage:add'){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    if((await activeMembers(env.DB)).length===0){
      await answer(env,callback.id,'Primero vincula al colaborador');
      await send(env,chatId,`⚠️ ${PARTNER_NAME} aún no tiene ninguna identidad colaboradora activa. Vincula al colaborador una sola vez; después podrás asignarle coberturas sin volver a darle acceso.`,{inline_keyboard:[[{text:'🤝 Vincular colaborador',callback_data:'mp:collab:invite'}],[{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]]});
      return json({ok:true,handled:'media_partner_coverage_requires_member'});
    }
    await answer(env,callback.id,'Selecciona fecha');
    await showCoverageDates(env,chatId);
    return json({ok:true,handled:'media_partner_coverage_dates'});
  }

  const coverageDate=data.match(/^mp:coverage:date:(\d+)$/);
  if(coverageDate){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    await answer(env,callback.id,`Fecha ${coverageDate[1]}`);
    await showCoverageMatches(env,chatId,Number(coverageDate[1]));
    return json({ok:true,handled:'media_partner_coverage_matches'});
  }

  const coverageMake=data.match(/^mp:coverage:make:([A-Za-z0-9._:-]+)$/);
  if(coverageMake){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    const match=await getMatch(env.DB,coverageMake[1]);
    if(!match||match.competition_id!==COMPETITION_ID){await answer(env,callback.id,'Partido no válido');return json({ok:true,handled:'media_partner_invalid_match'});}
    const now=new Date().toISOString(),coverageId=`mpc-${PARTNER_CODE}-${match.match_id}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partner_match_coverages (coverage_id,partner_code,competition_id,match_id,status,assigned_by,assigned_at,updated_at)
        VALUES (?,?,?,?,'ASSIGNED',?,?,?)
        ON CONFLICT(partner_code,match_id) DO UPDATE SET status='ASSIGNED',assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,started_at=NULL,ended_at=NULL,updated_at=excluded.updated_at`).bind(coverageId,PARTNER_CODE,COMPETITION_ID,match.match_id,actorId,now,now),
      auditStmt(env.DB,`mp-coverage-${coverageId}-${Date.now()}`,actorId,reporter,'ASSIGN_MEDIA_PARTNER_COVERAGE','match',match.match_id,1,'coverage_assignment_does_not_change_partner_identity',now)
    ]);
    await answer(env,callback.id,'Cobertura asignada');
    await send(env,chatId,`✅ COBERTURA ASIGNADA\n\n${PARTNER_NAME}\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\n\nEsto sólo define el partido que cubrirá. No crea, cambia ni elimina su relación de colaborador.`,{inline_keyboard:[[{text:'🎥 Ver coberturas',callback_data:'mp:coverage'}],[{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]]});
    return json({ok:true,handled:'media_partner_coverage_assigned',match_id:match.match_id});
  }

  const coverageCancel=data.match(/^mp:coverage-cancel:([A-Za-z0-9._:-]+)$/);
  if(coverageCancel){
    if(!canManagePartners(reporter)) return denyManage(env,chatId,callback);
    const now=new Date().toISOString();
    await env.DB.prepare("UPDATE partner_match_coverages SET status='CANCELLED',ended_at=?,updated_at=? WHERE partner_code=? AND match_id=? AND status IN ('ASSIGNED','LIVE')").bind(now,now,PARTNER_CODE,coverageCancel[1]).run();
    await answer(env,callback.id,'Cobertura cancelada');
    await showCoverageManagement(env,chatId);
    return json({ok:true,handled:'media_partner_coverage_cancelled'});
  }

  if(data==='mp:mycoverages'){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyPartner(env,chatId,callback);
    if(callback) await answer(env,callback.id,'Mis coberturas');
    await showPartnerCoverages(env,chatId,membership);
    return json({ok:true,handled:'media_partner_my_coverages'});
  }

  const openCoverage=data.match(/^mp:coverage-open:([A-Za-z0-9._:-]+)$/);
  if(openCoverage){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyPartner(env,chatId,callback);
    const [match,coverage]=await Promise.all([getMatch(env.DB,openCoverage[1]),getPartnerCoverageAny(env.DB,membership.partner_code,openCoverage[1])]);
    if(!match||!coverage||coverage.status==='CANCELLED') return denyPartner(env,chatId,callback);
    await answer(env,callback.id,'Cobertura');
    await showCoverageWorkspace(env,chatId,match,coverage);
    return json({ok:true,handled:'media_partner_coverage_workspace'});
  }

  const coverageState=data.match(/^mp:coverage-(live|close):([A-Za-z0-9._:-]+)$/);
  if(coverageState){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyPartner(env,chatId,callback);
    const coverage=await getPartnerCoverageAny(env.DB,membership.partner_code,coverageState[2]);
    if(!coverage||coverage.status==='CANCELLED') return denyPartner(env,chatId,callback);
    const now=new Date().toISOString();
    if(coverageState[1]==='live'){
      await env.DB.prepare("UPDATE partner_match_coverages SET status='LIVE',started_at=COALESCE(started_at,?),ended_at=NULL,updated_at=? WHERE coverage_id=? AND status IN ('ASSIGNED','CLOSED')").bind(now,now,coverage.coverage_id).run();
      await answer(env,callback.id,'Cobertura en vivo');
    }else{
      await env.DB.prepare("UPDATE partner_match_coverages SET status='CLOSED',ended_at=?,updated_at=? WHERE coverage_id=? AND status IN ('ASSIGNED','LIVE')").bind(now,now,coverage.coverage_id).run();
      await answer(env,callback.id,'Cobertura finalizada');
    }
    const match=await getMatch(env.DB,coverage.match_id),fresh=await getPartnerCoverageAny(env.DB,membership.partner_code,coverage.match_id);
    await showCoverageWorkspace(env,chatId,match,fresh);
    return json({ok:true,handled:coverageState[1]==='live'?'media_partner_coverage_live':'media_partner_coverage_closed'});
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
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE partner_scope_invites SET status='CLAIMED',claimed_by=?,claimed_at=? WHERE invite_id=? AND status='PENDING'").bind(actorId,now,invite.invite_id).run();
  const claimed=await env.DB.prepare('SELECT status,claimed_by FROM partner_scope_invites WHERE invite_id=?').bind(invite.invite_id).first();
  if(claimed?.status!=='CLAIMED'||String(claimed.claimed_by)!==actorId){
    await send(env,chatId,'⚠️ La invitación cambió mientras se procesaba. No se creó el vínculo de colaborador.');
    return json({ok:true,handled:'media_partner_claim_race_guard'});
  }
  const grantId=`mpg-${invite.partner_code}-${actorId}-${invite.scope_id}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO actor_scope_grants (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at,partner_code)
      VALUES (?,?,'MEDIA_PARTNER','COMPETITION',?,?,?,?,?,1,?,?,?)
      ON CONFLICT(telegram_user_id,role,scope_type,scope_id) DO UPDATE SET capabilities_json=excluded.capabilities_json,trust_level=excluded.trust_level,source_label=excluded.source_label,granted_by=excluded.granted_by,active=1,updated_at=excluded.updated_at,partner_code=excluded.partner_code`).bind(grantId,actorId,invite.scope_id,invite.capabilities_json,invite.trust_level,invite.partner_name||PARTNER_NAME,invite.created_by,now,now,invite.partner_code),
    auditStmt(env.DB,`mp-claim-${invite.invite_id}`,actorId,reporter||{role:'REPORTER',club_id:null},'CLAIM_MEDIA_PARTNER_COLLABORATION','partner_collaboration',invite.partner_code,1,'persistent_partner_relationship_claimed',now)
  ]);
  const baseRole=(await env.DB.prepare('SELECT role FROM reporters WHERE telegram_user_id=?').bind(actorId).first())?.role||'REPORTER';
  await send(env,chatId,`✅ ${invite.partner_name||PARTNER_NAME} · COLABORADOR ACTIVO\n\nLa relación quedó vinculada al campeonato, no a un partido.\nTu rol base sigue siendo ${baseRole}.\n\nPuedes consumir la información pública del campeonato y, cuando ${PARTNER_NAME} tenga una cobertura asignada, tus aportes de ese partido quedarán identificados como fuente de ${PARTNER_NAME}.\n\nNo puedes cambiar políticas ni gobernar resultados oficiales por este vínculo.`,{inline_keyboard:[[{text:'🎥 Abrir espacio de colaborador',callback_data:'mp:home'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
  return json({ok:true,handled:'media_partner_collaboration_claimed',grant_id:grantId,scope_type:'COMPETITION',scope_id:invite.scope_id});
}

async function showManagement(env,chatId){
  await expireInvites(env.DB);
  const [members,pending,coverages]=await Promise.all([
    activeMembers(env.DB),
    env.DB.prepare("SELECT COUNT(*) AS n FROM partner_scope_invites WHERE partner_code=? AND role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND scope_id=? AND status='PENDING' AND expires_at>?").bind(PARTNER_CODE,COMPETITION_ID,new Date().toISOString()).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM partner_match_coverages WHERE partner_code=? AND status IN ('ASSIGNED','LIVE')").bind(PARTNER_CODE).first()
  ]);
  await send(env,chatId,`🎥 COLABORADORES · ${PARTNER_NAME}\n\nRelación: ${members.length>0?'✅ ACTIVA':'⚪ SIN IDENTIDAD VINCULADA'}\nMiembros activos: ${members.length}\nInvitaciones pendientes: ${Number(pending?.n||0)}\nCoberturas activas: ${Number(coverages?.n||0)}\n\n${PARTNER_NAME} es un colaborador permanente de la plataforma. La cobertura de un partido es una asignación operacional separada; no es un permiso de acceso.`,{inline_keyboard:[
    [{text:'🤝 Vincular identidad colaboradora',callback_data:'mp:collab:invite'}],
    [{text:`👥 Miembros (${members.length})`,callback_data:'mp:members'}],
    [{text:`🎥 Coberturas (${Number(coverages?.n||0)})`,callback_data:'mp:coverage'}],
    [{text:`🕒 Invitaciones (${Number(pending?.n||0)})`,callback_data:'mp:invites'}],
    [{text:'⬅️ Administración',callback_data:'po:home'}]
  ]});
}

async function showPartnerHome(env,chatId,actorId){
  const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
  if(!membership){
    await send(env,chatId,`🎥 ${PARTNER_NAME}\n\nTu cuenta no está vinculada como identidad colaboradora. Puedes seguir consultando e informando como cualquier usuario.`,{inline_keyboard:[[{text:'🌐 Consultar campeonato',callback_data:'tp:public'}],[{text:'📣 Informar resultado',callback_data:'obs:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return;
  }
  const coverage=await env.DB.prepare("SELECT COUNT(*) AS n FROM partner_match_coverages WHERE partner_code=? AND status IN ('ASSIGNED','LIVE')").bind(membership.partner_code).first();
  await send(env,chatId,`🎥 ${PARTNER_NAME} · COLABORADOR\n\nRelación: ✅ ACTIVA\nAlcance de consumo: campeonato ${COMPETITION_ID}\nCoberturas activas/asignadas: ${Number(coverage?.n||0)}\n\nPuedes consumir los datos públicos del campeonato. Tus aportes se identifican como ${PARTNER_NAME} sólo cuando corresponden a una cobertura asignada.`,{inline_keyboard:[
    [{text:'🌐 Consultar campeonato',callback_data:'tp:public'}],
    [{text:'⚽ Resultados verificados',callback_data:'tp:public-results'}],
    [{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],
    [{text:'📣 Informar resultado',callback_data:'obs:dates'}],
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
  rows.push([{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]);
  await send(env,chatId,`🕒 INVITACIONES DE COLABORACIÓN\n\nEstas invitaciones vinculan identidades permanentes de ${PARTNER_NAME}. No asignan partidos.\n\n${(q.results||[]).length? (q.results||[]).map(i=>`${i.status} · ${i.created_at}`).join('\n'):'Sin invitaciones registradas.'}`,{inline_keyboard:rows});
}

async function showMembers(env,chatId){
  const q=await env.DB.prepare(`SELECT g.*,r.display_name,r.username FROM actor_scope_grants g LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id
    WHERE g.role='MEDIA_PARTNER' AND g.scope_type='COMPETITION' AND g.scope_id=? AND g.partner_code=? ORDER BY g.active DESC,g.updated_at DESC`).bind(COMPETITION_ID,PARTNER_CODE).all();
  const rows=[];
  for(const g of q.results||[]){if(Number(g.active)===1) rows.push([{text:`⛔ Revocar · ${g.display_name||g.telegram_user_id}`,callback_data:`mp:member-revoke:${g.grant_id}`}]);}
  rows.push([{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]);
  const text=(q.results||[]).length?(q.results||[]).map(g=>`${Number(g.active)===1?'✅':'⛔'} ${g.display_name||g.telegram_user_id} · rol base preservado`).join('\n'):'Sin identidades vinculadas.';
  await send(env,chatId,`👥 MIEMBROS · ${PARTNER_NAME}\n\n${text}\n\nRevocar la colaboración no elimina la identidad ni sus aportes históricos.`,{inline_keyboard:rows});
}

async function showCoverageManagement(env,chatId){
  const q=await env.DB.prepare(`SELECT c.*,m.round_label,m.group_id,m.home_name,m.away_name FROM partner_match_coverages c JOIN matches m ON m.match_id=c.match_id
    WHERE c.partner_code=? ORDER BY m.round_no DESC,c.assigned_at DESC LIMIT 12`).bind(PARTNER_CODE).all();
  const rows=[[{text:'➕ Asignar cobertura',callback_data:'mp:coverage:add'}]];
  for(const c of q.results||[]){if(['ASSIGNED','LIVE'].includes(c.status)) rows.push([{text:`${c.status==='LIVE'?'🔴':'🎥'} ${c.round_label} · ${c.home_name} — ${c.away_name}`,callback_data:`mp:coverage-cancel:${c.match_id}`}]);}
  rows.push([{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]);
  const text=(q.results||[]).length?(q.results||[]).map(c=>`${coverageIcon(c.status)} ${c.round_label} · ${c.home_name} — ${c.away_name} · ${c.status}`).join('\n'):'Sin coberturas asignadas.';
  await send(env,chatId,`🎥 COBERTURAS · ${PARTNER_NAME}\n\n${text}\n\nUna cobertura define contexto de trabajo. No modifica la identidad, el rol base ni la relación de colaborador.`,{inline_keyboard:rows});
}

async function showCoverageDates(env,chatId){
  const q=await env.DB.prepare("SELECT round_no,MAX(round_label) round_label,COUNT(*) n FROM matches WHERE competition_id=? GROUP BY round_no ORDER BY round_no").bind(COMPETITION_ID).all();
  const rows=(q.results||[]).map(r=>[{text:`📅 ${r.round_label||'Fecha '+r.round_no}`,callback_data:`mp:coverage:date:${r.round_no}`}]);
  rows.push([{text:'⬅️ Coberturas',callback_data:'mp:coverage'}]);
  await send(env,chatId,'🎥 ASIGNAR COBERTURA\n\nSelecciona la fecha del partido que transmitirá Chépica Play.',{inline_keyboard:rows});
}

async function showCoverageMatches(env,chatId,roundNo){
  const q=await env.DB.prepare("SELECT match_id,round_no,round_label,group_id,home_name,away_name FROM matches WHERE competition_id=? AND round_no=? ORDER BY group_id,match_id").bind(COMPETITION_ID,roundNo).all();
  const rows=(q.results||[]).map(m=>[{text:`Grupo ${m.group_id} · ${m.home_name} — ${m.away_name}`,callback_data:`mp:coverage:make:${m.match_id}`}]);
  rows.push([{text:'⬅️ Fechas',callback_data:'mp:coverage:add'}]);
  await send(env,chatId,`📅 Fecha ${roundNo}\n\nSelecciona el partido que Chépica Play cubrirá.`,{inline_keyboard:rows});
}

async function showPartnerCoverages(env,chatId,membership){
  const q=await env.DB.prepare(`SELECT c.*,m.round_label,m.group_id,m.home_name,m.away_name FROM partner_match_coverages c JOIN matches m ON m.match_id=c.match_id
    WHERE c.partner_code=? AND c.status IN ('ASSIGNED','LIVE','CLOSED') ORDER BY CASE c.status WHEN 'LIVE' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,m.round_no DESC LIMIT 12`).bind(membership.partner_code).all();
  const rows=(q.results||[]).map(c=>[{text:`${coverageIcon(c.status)} ${c.round_label} · ${c.home_name} — ${c.away_name}`,callback_data:`mp:coverage-open:${c.match_id}`}]);
  rows.push([{text:'⬅️ Chépica Play',callback_data:'mp:home'}]);
  await send(env,chatId,`🎥 MIS COBERTURAS · ${PARTNER_NAME}\n\n${(q.results||[]).length?'Selecciona una cobertura.':'Todavía no hay partidos asignados.'}`,{inline_keyboard:rows});
}

async function showCoverageWorkspace(env,chatId,match,coverage){
  const rows=[];
  if(coverage.status==='ASSIGNED'||coverage.status==='CLOSED') rows.push([{text:'🔴 Iniciar cobertura',callback_data:`mp:coverage-live:${match.match_id}`}]);
  if(coverage.status==='ASSIGNED'||coverage.status==='LIVE') rows.push([{text:'📣 Informar resultado',callback_data:`obs:match:${match.match_id}`}]);
  if(coverage.status==='LIVE') rows.push([{text:'🏁 Finalizar cobertura',callback_data:`mp:coverage-close:${match.match_id}`}]);
  rows.push([{text:'⚽ Resultados verificados',callback_data:'tp:public-results'}]);
  rows.push([{text:'⬅️ Mis coberturas',callback_data:'mp:mycoverages'}]);
  await send(env,chatId,`🎥 COBERTURA · ${PARTNER_NAME}\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\nEstado cobertura: ${coverage.status}\n\nLos aportes enviados durante una cobertura activa quedan trazados como observaciones de ${PARTNER_NAME}; no sobrescriben automáticamente el resultado canónico.`,{inline_keyboard:rows});
}

async function activeMembers(db){
  const q=await db.prepare("SELECT * FROM actor_scope_grants WHERE role='MEDIA_PARTNER' AND scope_type='COMPETITION' AND scope_id=? AND partner_code=? AND active=1 ORDER BY created_at").bind(COMPETITION_ID,PARTNER_CODE).all();
  return q.results||[];
}

async function getPartnerCoverageAny(db,partnerCode,matchId){return db.prepare('SELECT * FROM partner_match_coverages WHERE partner_code=? AND match_id=? LIMIT 1').bind(partnerCode,matchId).first();}

async function getMatch(db,matchId){return db.prepare('SELECT match_id,competition_id,round_no,round_label,group_id,home_id,away_id,home_name,away_name FROM matches WHERE match_id=?').bind(matchId).first();}

async function expireInvites(db){await db.prepare("UPDATE partner_scope_invites SET status='EXPIRED' WHERE role='MEDIA_PARTNER' AND status='PENDING' AND expires_at<=?").bind(new Date().toISOString()).run();}

async function upsertIdentity(db,actorId,actor){
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`).bind(actorId,displayName(actor),actor.username||null,now,now).run();
}

function displayName(actor){return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()||actor?.username||String(actor?.id||'Usuario');}
function coverageIcon(status){return status==='LIVE'?'🔴':status==='ASSIGNED'?'🎥':status==='CLOSED'?'✅':'⛔';}

async function denyManage(env,chatId,callback){if(callback) await answer(env,callback.id,'Sin permiso');await send(env,chatId,'🔒 Esta función corresponde a la administración operacional del campeonato.');return json({ok:true,handled:'media_partner_manage_denied'});}
async function denyPartner(env,chatId,callback){if(callback) await answer(env,callback.id,'Sin vínculo activo');await send(env,chatId,`🔒 Tu identidad no tiene una colaboración activa de ${PARTNER_NAME}.`);return json({ok:true,handled:'media_partner_scope_denied'});}

function auditStmt(db,auditId,actorId,reporter,action,resourceType,resourceId,allowed,reason,createdAt){return db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(auditId,String(actorId),reporter?.role||'REPORTER',reporter?.club_id||null,action,resourceType,resourceId,allowed,reason,createdAt);}

async function send(env,chatId,text,replyMarkup=null){
  const body={chat_id:chatId,text}; if(replyMarkup) body.reply_markup=replyMarkup;
  const res=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return res.json();
}
async function answer(env,callbackId,text){if(!callbackId)return;await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:callbackId,text})});}

function randomToken(){const b=new Uint8Array(24);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function sha256Hex(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
