const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const ASSOCIATION_ROLE='ASSOCIATION_DIRIGENTE';
const ASSOCIATION_SCOPE_TYPE='PLATFORM';
const ASSOCIATION_SCOPE_ID='FUTBOL-CHEPICA';
const ASSOCIATION_LABEL='Asociación de Fútbol Chépica';

// DIRIGENTES-LIFECYCLE-01
// Global administration of CLUB_ADMIN identities without deleting their history.
// Lifecycle: list -> inspect -> suspend/reactivate -> revoke.
export async function handleDirigentesLifecycleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/webhook/telegram' || request.method !== 'POST') return null;

  let update;
  try { update = await request.json(); } catch { return null; }

  const message = update.message;
  const callback = update.callback_query;
  const actor = message?.from || callback?.from;
  const chatId = message?.chat?.id || callback?.message?.chat?.id;
  if (!actor?.id || !chatId) return null;

  const text = String(message?.text || '').trim();
  const callbackData = String(callback?.data || '');
  const leadersCommand = /^\/dirigentes(?:@\w+)?$/i.test(text);
  const lifecycleCallback = callbackData === 'tp:leaders'
    || callbackData === 'tp:admins'
    || callbackData === 'tp:admins:clubs'
    || callbackData === 'tp:admins:association'
    || callbackData === 'tp:assoc-add'
    || callbackData.startsWith('tp:assoc:')
    || callbackData.startsWith('tp:assoc-add:')
    || callbackData.startsWith('tp:assoc-suspend:')
    || callbackData.startsWith('tp:assoc-reactivate:')
    || callbackData.startsWith('tp:admin:')
    || callbackData.startsWith('tp:admin-suspend:')
    || callbackData.startsWith('tp:admin-reactivate:')
    || callbackData.startsWith('tp:admin-revoke-confirm:')
    || callbackData.startsWith('tp:admin-revoke:');
  if (!leadersCommand && !lifecycleCallback) return null;

  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'dirigentes_lifecycle_not_configured'},503);

  const actorId = String(actor.id);
  const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();

  // Only intercept the shared Dirigentes entrypoint for SUPER_ADMIN.
  // CLUB_ADMIN and normal users continue through portal-entry.js.
  if ((leadersCommand || callbackData === 'tp:leaders') && !isSuperAdmin(reporter)) return null;

  if (!isSuperAdmin(reporter)) {
    if (callback) await answerCallback(env, callback.id, 'No autorizado');
    await send(env, chatId, '🔒 Sólo un administrador global puede administrar dirigentes.');
    return json({ok:true,handled:'dirigentes_lifecycle_denied'});
  }

  if (leadersCommand || callbackData === 'tp:leaders') {
    if (callback) await answerCallback(env, callback.id, 'Dirigentes');
    await showGlobalMenu(env, chatId);
    return json({ok:true,handled:'global_admin_menu'});
  }

  if (callbackData === 'tp:admins') {
    await answerCallback(env, callback.id, 'Dirigentes');
    await showDirigentesHub(env, chatId);
    return json({ok:true,handled:'dirigentes_directory'});
  }

  if (callbackData === 'tp:admins:clubs') {
    await answerCallback(env, callback.id, 'Clubes');
    await showClubDirigentes(env, chatId);
    return json({ok:true,handled:'club_admin_list'});
  }

  if (callbackData === 'tp:admins:association') {
    await answerCallback(env, callback.id, 'Asociación');
    await showAssociationDirigentes(env, chatId);
    return json({ok:true,handled:'association_dirigente_list'});
  }

  if (callbackData === 'tp:assoc-add') {
    await answerCallback(env, callback.id, 'Agregar dirigente');
    await showAssociationCandidates(env, chatId);
    return json({ok:true,handled:'association_dirigente_candidates'});
  }

  const associationAdd = callbackData.match(/^tp:assoc-add:(\d+)$/);
  if (associationAdd) {
    const target = await getReporterIdentity(env.DB, associationAdd[1]);
    if (!target) return associationTargetMissing(env, chatId, callback);
    const now = new Date().toISOString();
    const eventId = lifecycleEventId('association-link', target.telegram_user_id);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO actor_scope_grants
        (grant_id,telegram_user_id,role,scope_type,scope_id,capabilities_json,trust_level,source_label,granted_by,active,created_at,updated_at)
        VALUES (?,?,?, ?,?,'[]','VERIFIED',?,?,1,?,?)
        ON CONFLICT(telegram_user_id,role,scope_type,scope_id) DO UPDATE SET
          trust_level='VERIFIED',source_label=excluded.source_label,granted_by=excluded.granted_by,active=1,updated_at=excluded.updated_at`)
        .bind(`assoc-dirigente-${target.telegram_user_id}`,target.telegram_user_id,ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID,ASSOCIATION_LABEL,actorId,now,now),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'LINK_ASSOCIATION_DIRIGENTE','actor_scope_grant',?,1,'super_admin_linked_association_dirigente',?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,null,target.telegram_user_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'telegram.association_dirigente.linked',now,now,actorId,reporter.display_name || actor.first_name || actorId,null,'VERIFIED',JSON.stringify({target_telegram_user_id:target.telegram_user_id,target_name:target.display_name||null,association:ASSOCIATION_LABEL,capabilities:[]}))
    ]);
    await answerCallback(env, callback.id, 'Agregado a Asociación');
    await send(env, chatId, `✅ Dirigente de Asociación agregado\n${target.display_name || target.telegram_user_id} · ${ASSOCIATION_LABEL}\n\nEsta afiliación no cambió su rol ni sus permisos existentes.`);
    await showAssociationDirigentes(env, chatId);
    return json({ok:true,handled:'association_dirigente_linked',target_id:target.telegram_user_id,permission_change:false});
  }

  const associationInspect = callbackData.match(/^tp:assoc:(\d+)$/);
  if (associationInspect) {
    await answerCallback(env, callback.id, 'Dirigente Asociación');
    await showAssociationDirigente(env, chatId, associationInspect[1]);
    return json({ok:true,handled:'association_dirigente_detail'});
  }

  const associationSuspend = callbackData.match(/^tp:assoc-suspend:(\d+)$/);
  if (associationSuspend) {
    const target = await getAssociationDirigente(env.DB, associationSuspend[1]);
    if (!target) return associationTargetMissing(env, chatId, callback);
    if (Number(target.affiliation_active)!==1) {
      await answerCallback(env, callback.id, 'Ya estaba fuera del listado');
      await showAssociationDirigente(env, chatId, target.telegram_user_id);
      return json({ok:true,handled:'association_dirigente_already_suspended'});
    }
    const now = new Date().toISOString();
    const eventId = lifecycleEventId('association-suspend', target.telegram_user_id);
    await env.DB.batch([
      env.DB.prepare(`UPDATE actor_scope_grants SET active=0,updated_at=?
        WHERE telegram_user_id=? AND role=? AND scope_type=? AND scope_id=? AND active=1`)
        .bind(now,target.telegram_user_id,ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'SUSPEND_ASSOCIATION_DIRIGENTE','actor_scope_grant',?,1,'super_admin_suspended_association_dirigente',?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,null,target.telegram_user_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'telegram.association_dirigente.suspended',now,now,actorId,reporter.display_name || actor.first_name || actorId,null,'VERIFIED',JSON.stringify({target_telegram_user_id:target.telegram_user_id,target_name:target.display_name||null,association:ASSOCIATION_LABEL}))
    ]);
    await answerCallback(env, callback.id, 'Quitado del listado');
    await showAssociationDirigente(env, chatId, target.telegram_user_id);
    return json({ok:true,handled:'association_dirigente_suspended',target_id:target.telegram_user_id,permission_change:false});
  }

  const associationReactivate = callbackData.match(/^tp:assoc-reactivate:(\d+)$/);
  if (associationReactivate) {
    const target = await getAssociationDirigente(env.DB, associationReactivate[1]);
    if (!target) return associationTargetMissing(env, chatId, callback);
    if (Number(target.affiliation_active)===1) {
      await answerCallback(env, callback.id, 'Ya estaba activo');
      await showAssociationDirigente(env, chatId, target.telegram_user_id);
      return json({ok:true,handled:'association_dirigente_already_active'});
    }
    const now = new Date().toISOString();
    const eventId = lifecycleEventId('association-reactivate', target.telegram_user_id);
    await env.DB.batch([
      env.DB.prepare(`UPDATE actor_scope_grants SET active=1,updated_at=?
        WHERE telegram_user_id=? AND role=? AND scope_type=? AND scope_id=? AND active=0`)
        .bind(now,target.telegram_user_id,ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REACTIVATE_ASSOCIATION_DIRIGENTE','actor_scope_grant',?,1,'super_admin_reactivated_association_dirigente',?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,null,target.telegram_user_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'telegram.association_dirigente.reactivated',now,now,actorId,reporter.display_name || actor.first_name || actorId,null,'VERIFIED',JSON.stringify({target_telegram_user_id:target.telegram_user_id,target_name:target.display_name||null,association:ASSOCIATION_LABEL}))
    ]);
    await answerCallback(env, callback.id, 'Reactivado');
    await showAssociationDirigente(env, chatId, target.telegram_user_id);
    return json({ok:true,handled:'association_dirigente_reactivated',target_id:target.telegram_user_id,permission_change:false});
  }

  const inspect = callbackData.match(/^tp:admin:(\d+)$/);
  if (inspect) {
    await answerCallback(env, callback.id, 'Dirigente');
    await showDirigente(env, chatId, inspect[1]);
    return json({ok:true,handled:'club_admin_detail'});
  }

  const suspend = callbackData.match(/^tp:admin-suspend:(\d+)$/);
  if (suspend) {
    const target = await getClubAdmin(env.DB, suspend[1]);
    if (!target) return targetMissing(env, chatId, callback);
    if (target.active !== 1) {
      await answerCallback(env, callback.id, 'Ya estaba suspendido');
      await showDirigente(env, chatId, target.telegram_user_id);
      return json({ok:true,handled:'club_admin_already_suspended'});
    }
    const now = new Date().toISOString();
    const eventId = lifecycleEventId('suspend', target.telegram_user_id);
    await env.DB.batch([
      env.DB.prepare("UPDATE reporters SET active=0,updated_at=? WHERE telegram_user_id=? AND role='CLUB_ADMIN' AND active=1").bind(now,target.telegram_user_id),
      env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(target.telegram_user_id),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'SUSPEND_CLUB_ADMIN','reporter',?,1,'super_admin_suspended_club_admin',?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,target.club_id,target.telegram_user_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'telegram.club_admin.suspended',now,now,actorId,reporter.display_name || actor.first_name || actorId,target.club_id,'VERIFIED',JSON.stringify({target_telegram_user_id:target.telegram_user_id,target_name:target.display_name || null,previous_role:target.role,previous_active:target.active}))
    ]);
    await answerCallback(env, callback.id, 'Suspendido');
    await send(env, target.telegram_user_id, `⏸ Tu acceso de dirigente fue suspendido.\n\nClub: ${target.canonical_name || target.club_id}\nMientras esté suspendido no podrás usar funciones administrativas. Tu acceso público sigue disponible.`);
    await send(env, chatId, `⏸ Acceso suspendido\n${target.display_name || target.telegram_user_id} · ${target.canonical_name || target.club_id}`);
    await showDirigente(env, chatId, target.telegram_user_id);
    return json({ok:true,handled:'club_admin_suspended',target_id:target.telegram_user_id});
  }

  const reactivate = callbackData.match(/^tp:admin-reactivate:(\d+)$/);
  if (reactivate) {
    const target = await getClubAdmin(env.DB, reactivate[1]);
    if (!target) return targetMissing(env, chatId, callback);
    if (target.active === 1) {
      await answerCallback(env, callback.id, 'Ya estaba activo');
      await showDirigente(env, chatId, target.telegram_user_id);
      return json({ok:true,handled:'club_admin_already_active'});
    }
    const now = new Date().toISOString();
    const eventId = lifecycleEventId('reactivate', target.telegram_user_id);
    await env.DB.batch([
      env.DB.prepare("UPDATE reporters SET active=1,updated_at=? WHERE telegram_user_id=? AND role='CLUB_ADMIN' AND active=0").bind(now,target.telegram_user_id),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REACTIVATE_CLUB_ADMIN','reporter',?,1,'super_admin_reactivated_club_admin',?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,target.club_id,target.telegram_user_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'telegram.club_admin.reactivated',now,now,actorId,reporter.display_name || actor.first_name || actorId,target.club_id,'VERIFIED',JSON.stringify({target_telegram_user_id:target.telegram_user_id,target_name:target.display_name || null,role:target.role}))
    ]);
    await answerCallback(env, callback.id, 'Reactivado');
    await send(env, target.telegram_user_id, `✅ Tu acceso de dirigente fue reactivado.\n\nClub: ${target.canonical_name || target.club_id}\nYa puedes volver a usar 🔐 Dirigentes.`);
    await send(env, chatId, `✅ Acceso reactivado\n${target.display_name || target.telegram_user_id} · ${target.canonical_name || target.club_id}`);
    await showDirigente(env, chatId, target.telegram_user_id);
    return json({ok:true,handled:'club_admin_reactivated',target_id:target.telegram_user_id});
  }

  const revokeConfirm = callbackData.match(/^tp:admin-revoke-confirm:(\d+)$/);
  if (revokeConfirm) {
    const target = await getClubAdmin(env.DB, revokeConfirm[1]);
    if (!target) return targetMissing(env, chatId, callback);
    await answerCallback(env, callback.id, 'Confirmar revocación');
    await send(env, chatId,
      `⚠️ REVOCAR ACCESO DE DIRIGENTE\n\nPersona: ${target.display_name || target.telegram_user_id}\nClub: ${target.canonical_name || target.club_id}\n\nLa persona dejará de ser CLUB_ADMIN, pero NO se borrará su identidad ni su historial. Podrá usar el portal público y volver a solicitar acceso en el futuro.`,
      {inline_keyboard:[
        [{text:'❌ Sí, revocar acceso',callback_data:`tp:admin-revoke:${target.telegram_user_id}`}],
        [{text:'⬅️ Cancelar',callback_data:`tp:admin:${target.telegram_user_id}`}]
      ]}
    );
    return json({ok:true,handled:'club_admin_revoke_confirmation'});
  }

  const revoke = callbackData.match(/^tp:admin-revoke:(\d+)$/);
  if (revoke) {
    const target = await getClubAdmin(env.DB, revoke[1]);
    if (!target) {
      await answerCallback(env, callback.id, 'Ya no es dirigente');
      await showClubDirigentes(env, chatId);
      return json({ok:true,handled:'club_admin_already_revoked'});
    }
    const now = new Date().toISOString();
    const eventId = lifecycleEventId('revoke', target.telegram_user_id);
    await env.DB.batch([
      env.DB.prepare("UPDATE reporters SET club_id=NULL,role='REPORTER',trust_level='PROVISIONAL',active=1,updated_at=? WHERE telegram_user_id=? AND role='CLUB_ADMIN'").bind(now,target.telegram_user_id),
      env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(target.telegram_user_id),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REVOKE_CLUB_ADMIN','reporter',?,1,'super_admin_revoked_club_admin',?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,target.club_id,target.telegram_user_id,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'telegram.club_admin.revoked',now,now,actorId,reporter.display_name || actor.first_name || actorId,target.club_id,'VERIFIED',JSON.stringify({target_telegram_user_id:target.telegram_user_id,target_name:target.display_name || null,previous_role:target.role,previous_club_id:target.club_id,previous_active:target.active,new_role:'REPORTER',new_trust_level:'PROVISIONAL'}))
    ]);
    await answerCallback(env, callback.id, 'Acceso revocado');
    await send(env, target.telegram_user_id, `❌ Tu acceso de dirigente fue revocado.\n\nClub anterior: ${target.canonical_name || target.club_id}\nTu identidad e historial se conservan. Puedes seguir usando las funciones públicas y, si corresponde, solicitar acceso nuevamente.`);
    await send(env, chatId, `❌ Acceso de dirigente revocado\n${target.display_name || target.telegram_user_id} · ${target.canonical_name || target.club_id}`);
    await showClubDirigentes(env, chatId);
    return json({ok:true,handled:'club_admin_revoked',target_id:target.telegram_user_id});
  }

  return null;
}

async function showGlobalMenu(env, chatId) {
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first();
  const [clubs,association]=await Promise.all([clubAdminCounts(env.DB),associationCounts(env.DB)]);
  const pendingN = Number(pending?.n || 0);
  await send(env, chatId,
    `🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes pendientes: ${pendingN}\nDirigentes clubes: ${clubs.active}/${clubs.total}\nDirigentes asociación: ${association.active}/${association.total}`,
    {inline_keyboard:[
      [{text:`🔔 Solicitudes (${pendingN})`,callback_data:'tp:requests'}],
      [{text:'👥 Dirigentes',callback_data:'tp:admins'}],
      [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
      [{text:'⚽ Mis partidos de club',callback_data:'tp:mymatches'}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]}
  );
}

async function associationCounts(db){
  const [active,total]=await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM actor_scope_grants WHERE role=? AND scope_type=? AND scope_id=? AND active=1`)
      .bind(ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM actor_scope_grants WHERE role=? AND scope_type=? AND scope_id=?`)
      .bind(ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID).first()
  ]);
  return {active:Number(active?.n||0),total:Number(total?.n||0)};
}

async function clubAdminCounts(db){
  const [active,total]=await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
    db.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
  ]);
  return {active:Number(active?.n||0),total:Number(total?.n||0)};
}

async function showDirigentesHub(env, chatId){
  const [clubs,association]=await Promise.all([clubAdminCounts(env.DB),associationCounts(env.DB)]);
  await send(env,chatId,
    `👥 DIRIGENTES\n\n🏟 Clubes: ${clubs.active}/${clubs.total} activos\n🏛 Asociación: ${association.active}/${association.total} activos\n\nSelecciona qué dirigentes quieres administrar.`,
    {inline_keyboard:[
      [{text:`🏟 Clubes (${clubs.active}/${clubs.total})`,callback_data:'tp:admins:clubs'}],
      [{text:`🏛 Asociación (${association.active}/${association.total})`,callback_data:'tp:admins:association'}],
      [{text:'⬅️ Admin global',callback_data:'tp:leaders'}]
    ]});
}

async function showAssociationDirigentes(env,chatId){
  const q=await env.DB.prepare(`SELECT g.telegram_user_id,g.active AS affiliation_active,g.created_at,g.updated_at,
      r.display_name,r.username,r.role AS base_role,r.club_id,t.canonical_name
    FROM actor_scope_grants g
    LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id
    LEFT JOIN teams t ON t.team_id=r.club_id
    WHERE g.role=? AND g.scope_type=? AND g.scope_id=?
    ORDER BY g.active DESC,COALESCE(r.display_name,g.telegram_user_id)
    LIMIT 40`)
    .bind(ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID).all();
  const items=q.results||[];
  const rows=items.map(r=>[{
    text:`${Number(r.affiliation_active)===1?'✅':'⏸'} ${r.display_name||r.telegram_user_id}`,
    callback_data:`tp:assoc:${r.telegram_user_id}`
  }]);
  rows.push([{text:'➕ Agregar dirigente de Asociación',callback_data:'tp:assoc-add'}]);
  rows.push([{text:'⬅️ Dirigentes',callback_data:'tp:admins'}]);
  const text=items.length
    ?`🏛 ${ASSOCIATION_LABEL.toUpperCase()}\n\n${items.length} registro(s). ✅ activo · ⏸ fuera del listado\nLa afiliación es independiente del rol y no agrega permisos por sí sola.`
    :`🏛 ${ASSOCIATION_LABEL.toUpperCase()}\n\nTodavía no hay dirigentes de la Asociación vinculados.\nLa afiliación es independiente del rol y no agrega permisos por sí sola.`;
  await send(env,chatId,text,{inline_keyboard:rows});
}

async function showAssociationCandidates(env,chatId){
  const q=await env.DB.prepare(`SELECT r.telegram_user_id,r.display_name,r.username,r.role,r.club_id,t.canonical_name
    FROM reporters r
    LEFT JOIN teams t ON t.team_id=r.club_id
    LEFT JOIN actor_scope_grants g ON g.telegram_user_id=r.telegram_user_id AND g.role=? AND g.scope_type=? AND g.scope_id=?
    WHERE r.active=1 AND g.telegram_user_id IS NULL
    ORDER BY COALESCE(r.display_name,r.telegram_user_id)
    LIMIT 40`)
    .bind(ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID).all();
  const items=q.results||[];
  if(!items.length){
    await send(env,chatId,`🏛 AGREGAR DIRIGENTE DE ASOCIACIÓN\n\nNo hay identidades disponibles para vincular. La persona debe haber interactuado al menos una vez con el bot.`,{inline_keyboard:[[{text:'⬅️ Asociación',callback_data:'tp:admins:association'}]]});
    return;
  }
  const rows=items.map(r=>[{
    text:`➕ ${r.display_name||r.telegram_user_id}${r.canonical_name?' · '+r.canonical_name:''}`,
    callback_data:`tp:assoc-add:${r.telegram_user_id}`
  }]);
  rows.push([{text:'⬅️ Asociación',callback_data:'tp:admins:association'}]);
  await send(env,chatId,`🏛 AGREGAR DIRIGENTE DE ASOCIACIÓN\n\nSelecciona una identidad que ya haya interactuado con el bot.\n\nEsto sólo crea la afiliación a ${ASSOCIATION_LABEL}; no cambia su rol ni sus permisos.`,{inline_keyboard:rows});
}

async function showAssociationDirigente(env,chatId,targetId){
  const target=await getAssociationDirigente(env.DB,targetId);
  if(!target) return send(env,chatId,'La persona no figura como dirigente de la Asociación.',{inline_keyboard:[[{text:'⬅️ Asociación',callback_data:'tp:admins:association'}]]});
  const active=Number(target.affiliation_active)===1;
  const action=active
    ?[{text:'⏸ Quitar del listado activo',callback_data:`tp:assoc-suspend:${target.telegram_user_id}`}]
    :[{text:'▶️ Reactivar en Asociación',callback_data:`tp:assoc-reactivate:${target.telegram_user_id}`}];
  await send(env,chatId,
    `👤 DIRIGENTE DE ASOCIACIÓN\n\nNombre: ${target.display_name||'Sin nombre'}\nTelegram: ${target.username?'@'+target.username:target.telegram_user_id}\nEntidad: ${ASSOCIATION_LABEL}\nAfiliación: ${active?'✅ ACTIVA':'⏸ INACTIVA'}\nRol técnico actual: ${target.base_role||'REPORTER'}${target.canonical_name?`\nClub adicional: ${target.canonical_name}`:''}\n\nEsta afiliación no concede capacidades adicionales.`,
    {inline_keyboard:[action,[{text:'⬅️ Asociación',callback_data:'tp:admins:association'}]]});
}

async function getAssociationDirigente(db,targetId){
  return db.prepare(`SELECT g.telegram_user_id,g.active AS affiliation_active,g.created_at,g.updated_at,
      r.display_name,r.username,r.role AS base_role,r.club_id,t.canonical_name
    FROM actor_scope_grants g
    LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id
    LEFT JOIN teams t ON t.team_id=r.club_id
    WHERE g.telegram_user_id=? AND g.role=? AND g.scope_type=? AND g.scope_id=?`)
    .bind(String(targetId),ASSOCIATION_ROLE,ASSOCIATION_SCOPE_TYPE,ASSOCIATION_SCOPE_ID).first();
}

async function getReporterIdentity(db,targetId){
  return db.prepare(`SELECT r.*,t.canonical_name FROM reporters r LEFT JOIN teams t ON t.team_id=r.club_id WHERE r.telegram_user_id=?`)
    .bind(String(targetId)).first();
}

async function associationTargetMissing(env,chatId,callback){
  if(callback) await answerCallback(env,callback.id,'No encontrado');
  await send(env,chatId,'No encontré esa identidad o afiliación de Asociación.',{inline_keyboard:[[{text:'⬅️ Asociación',callback_data:'tp:admins:association'}]]});
  return json({ok:true,handled:'association_dirigente_not_found'});
}

async function showClubDirigentes(env, chatId) {
  const q = await env.DB.prepare(`
    SELECT r.telegram_user_id,r.display_name,r.username,r.club_id,r.active,t.canonical_name
    FROM reporters r
    LEFT JOIN teams t ON t.team_id=r.club_id
    WHERE r.role='CLUB_ADMIN'
    ORDER BY COALESCE(t.canonical_name,r.club_id),r.active DESC,COALESCE(r.display_name,r.telegram_user_id)
    LIMIT 40
  `).all();
  const items = q.results || [];
  if (!items.length) {
    await send(env, chatId, '👥 DIRIGENTES\n\nNo hay administradores de club registrados.', {inline_keyboard:[[{text:'⬅️ Admin global',callback_data:'tp:leaders'}]]});
    return;
  }
  const rows = items.map(r=>[{
    text:`${r.active===1?'✅':'⏸'} ${r.canonical_name || r.club_id || 'Sin club'} · ${r.display_name || r.telegram_user_id}`,
    callback_data:`tp:admin:${r.telegram_user_id}`
  }]);
  rows.push([{text:'⬅️ Admin global',callback_data:'tp:leaders'}]);
  await send(env, chatId, `👥 DIRIGENTES\n\n${items.length} registro(s). ✅ activo · ⏸ suspendido\nSelecciona una persona para administrar su acceso.`, {inline_keyboard:rows});
}

async function showDirigente(env, chatId, targetId) {
  const target = await getClubAdmin(env.DB, targetId);
  if (!target) {
    await send(env, chatId, 'El usuario ya no figura como dirigente de club.', {inline_keyboard:[[{text:'⬅️ Dirigentes',callback_data:'tp:admins:clubs'}]]});
    return;
  }
  const status = target.active===1 ? '✅ ACTIVO' : '⏸ SUSPENDIDO';
  const action = target.active===1
    ? [{text:'⏸ Suspender',callback_data:`tp:admin-suspend:${target.telegram_user_id}`}]
    : [{text:'▶️ Reactivar',callback_data:`tp:admin-reactivate:${target.telegram_user_id}`}];
  await send(env, chatId,
    `👤 DIRIGENTE\n\nNombre: ${target.display_name || 'Sin nombre'}\nTelegram: ${target.username ? '@'+target.username : target.telegram_user_id}\nClub: ${target.canonical_name || target.club_id || 'Sin club'}\nRol: CLUB_ADMIN\nEstado: ${status}`,
    {inline_keyboard:[
      action,
      [{text:'❌ Revocar acceso',callback_data:`tp:admin-revoke-confirm:${target.telegram_user_id}`}],
      [{text:'⬅️ Dirigentes',callback_data:'tp:admins:clubs'}]
    ]}
  );
}

async function getClubAdmin(db, targetId) {
  return db.prepare(`
    SELECT r.*,t.canonical_name
    FROM reporters r
    LEFT JOIN teams t ON t.team_id=r.club_id
    WHERE r.telegram_user_id=? AND r.role='CLUB_ADMIN'
  `).bind(String(targetId)).first();
}

function isSuperAdmin(reporter) {
  return !!reporter && reporter.active===1 && reporter.trust_level==='VERIFIED' && reporter.role==='SUPER_ADMIN';
}

function lifecycleEventId(action,targetId) {
  return `admin-${targetId}-${action}-${Date.now().toString(36)}`;
}

async function targetMissing(env, chatId, callback) {
  if (callback) await answerCallback(env, callback.id, 'No encontrado');
  await send(env, chatId, 'Ese usuario ya no figura como dirigente de club.', {inline_keyboard:[[{text:'⬅️ Dirigentes',callback_data:'tp:admins:clubs'}]]});
  return json({ok:true,handled:'club_admin_not_found'});
}

async function send(env, chatId, text, replyMarkup) {
  const body={chat_id:chatId,text};
  if (replyMarkup) body.reply_markup=replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

async function answerCallback(env,id,text) {
  if (!id) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});
}
