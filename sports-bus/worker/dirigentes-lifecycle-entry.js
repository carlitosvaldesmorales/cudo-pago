const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

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
  const lifecycleCallback = callbackData === 'tp:leaders' || callbackData === 'tp:admins' || callbackData.startsWith('tp:admin:') || callbackData.startsWith('tp:admin-suspend:') || callbackData.startsWith('tp:admin-reactivate:') || callbackData.startsWith('tp:admin-revoke-confirm:') || callbackData.startsWith('tp:admin-revoke:');
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
    await showDirigentes(env, chatId);
    return json({ok:true,handled:'club_admin_list'});
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
      await showDirigentes(env, chatId);
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
    await showDirigentes(env, chatId);
    return json({ok:true,handled:'club_admin_revoked',target_id:target.telegram_user_id});
  }

  return null;
}

async function showGlobalMenu(env, chatId) {
  const [pending, active, total] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
  ]);
  const pendingN = Number(pending?.n || 0);
  const activeN = Number(active?.n || 0);
  const totalN = Number(total?.n || 0);
  await send(env, chatId,
    `🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes pendientes: ${pendingN}\nDirigentes activos: ${activeN}/${totalN}`,
    {inline_keyboard:[
      [{text:`🔔 Solicitudes (${pendingN})`,callback_data:'tp:requests'}],
      [{text:`👥 Dirigentes (${activeN}/${totalN})`,callback_data:'tp:admins'}],
      [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
      [{text:'⚽ Mis partidos de club',callback_data:'tp:mymatches'}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]}
  );
}

async function showDirigentes(env, chatId) {
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
    await send(env, chatId, 'El usuario ya no figura como dirigente de club.', {inline_keyboard:[[{text:'⬅️ Dirigentes',callback_data:'tp:admins'}]]});
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
      [{text:'⬅️ Dirigentes',callback_data:'tp:admins'}]
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
  await send(env, chatId, 'Ese usuario ya no figura como dirigente de club.', {inline_keyboard:[[{text:'⬅️ Dirigentes',callback_data:'tp:admins'}]]});
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
