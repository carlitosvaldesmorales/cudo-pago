import { NAVIGATION_ACTION, navigationButton } from './telegram-navigation-contract.js';

const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handlePortalRequest(request, env) {
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
  const exactStart = /^\/start(?:@\w+)?$/i.test(text);
  const portalCommand = /^\/(portal|dirigentes)(?:@\w+)?$/i.test(text);
  const relevant = exactStart || portalCommand || callbackData.startsWith('tp:');
  if (!relevant) return null;

  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'portal_not_configured'},503);

  const actorId = String(actor.id);
  await upsertIdentity(env.DB, actorId, actor);
  const reporter = await getReporter(env.DB, actorId);

  if (exactStart || /^\/portal(?:@\w+)?$/i.test(text) || callbackData === 'tp:home') {
    if (callback) await answerCallback(env, callback.id, 'Inicio');
    await showHome(env, chatId);
    return json({ok:true,handled:'portal_home'});
  }

  if (/^\/dirigentes(?:@\w+)?$/i.test(text) || callbackData === 'tp:leaders') {
    if (callback) await answerCallback(env, callback.id, 'Dirigentes');
    await showLeaderPortal(env, chatId, reporter);
    return json({ok:true,handled:'portal_leaders'});
  }

  if (callbackData === 'tp:public') {
    await answerCallback(env, callback.id, 'Público');
    await send(env, chatId, '🌐 FÚTBOL CHÉPICA · PÚBLICO\n\nConsulta información verificada del campeonato.', {
      inline_keyboard:[
        [{text:'⚽ Resultados verificados',callback_data:'tp:public-results'}],
        [navigationButton(NAVIGATION_ACTION.BACK,'tp:home')]
      ]
    });
    return json({ok:true,handled:'portal_public'});
  }

  if (callbackData === 'tp:public-results') {
    await answerCallback(env, callback.id, 'Resultados');
    await showRegisteredResults(env, chatId, null, false);
    return json({ok:true,handled:'portal_public_results'});
  }

  if (callbackData === 'tp:req') {
    await answerCallback(env, callback.id, 'Solicitar acceso');
    if (isVerifiedAdmin(reporter)) {
      await send(env, chatId, '✅ Tu cuenta ya tiene acceso de dirigente.');
      await showLeaderPortal(env, chatId, reporter);
      return json({ok:true,handled:'portal_access_already_active'});
    }
    const pending = await env.DB.prepare("SELECT request_id,requested_club_id,created_at FROM access_requests WHERE telegram_user_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1").bind(actorId).first();
    if (pending) {
      await showRequestStatus(env, chatId, actorId);
      return json({ok:true,handled:'portal_request_already_pending'});
    }
    await showClubPicker(env, chatId);
    return json({ok:true,handled:'portal_request_choose_club'});
  }

  const clubChoice = callbackData.match(/^tp:reqclub:([A-Za-z0-9._:-]+)$/);
  if (clubChoice) {
    const clubId = clubChoice[1];
    const team = await env.DB.prepare('SELECT team_id,canonical_name FROM teams WHERE team_id=?').bind(clubId).first();
    if (!team) {
      await answerCallback(env, callback.id, 'Club no válido');
      return json({ok:true,handled:'portal_request_invalid_club'});
    }
    if (isVerifiedAdmin(reporter)) {
      await answerCallback(env, callback.id, 'Ya tienes acceso');
      return json({ok:true,handled:'portal_request_already_admin'});
    }
    const existing = await env.DB.prepare("SELECT request_id FROM access_requests WHERE telegram_user_id=? AND status='PENDING' LIMIT 1").bind(actorId).first();
    if (!existing) {
      const now = new Date().toISOString();
      const requestId = `ar-${actorId}-${Date.now().toString(36)}`;
      await env.DB.prepare(`
        INSERT INTO access_requests (request_id,telegram_user_id,display_name,username,requested_club_id,requested_role,status,created_at)
        VALUES (?,?,?,?,?,'CLUB_ADMIN','PENDING',?)
      `).bind(requestId,actorId,displayName(actor),actor.username || null,team.team_id,now).run();
      await env.DB.prepare(`
        INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(`access-${requestId}`,'telegram.access.requested',now,now,actorId,displayName(actor),team.team_id,'PENDING',JSON.stringify({requested_role:'CLUB_ADMIN'})).run();
    }
    await answerCallback(env, callback.id, 'Solicitud enviada');
    await send(env, chatId, `🕒 Solicitud enviada\n\nClub: ${team.canonical_name}\nAcceso: Dirigente / administrador del club\nEstado: PENDIENTE\n\nUn administrador global debe aprobarla antes de habilitar funciones administrativas.`, {
      inline_keyboard:[
        [{text:'🔎 Ver estado',callback_data:'tp:reqstatus'}],
        [{text:'⬅️ Volver a Dirigentes',callback_data:'tp:leaders'}]
      ]
    });
    return json({ok:true,handled:'portal_request_created',club_id:team.team_id});
  }

  if (callbackData === 'tp:reqstatus') {
    await answerCallback(env, callback.id, 'Estado');
    await showRequestStatus(env, chatId, actorId);
    return json({ok:true,handled:'portal_request_status'});
  }

  if (callbackData === 'tp:requests') {
    if (!isSuperAdmin(reporter)) return deny(env, chatId, callback);
    await answerCallback(env, callback.id, 'Solicitudes');
    await showPendingRequests(env, chatId);
    return json({ok:true,handled:'portal_pending_requests'});
  }

  const review = callbackData.match(/^tp:review:(ar-[A-Za-z0-9-]+)$/);
  if (review) {
    if (!isSuperAdmin(reporter)) return deny(env, chatId, callback);
    await answerCallback(env, callback.id, 'Revisar');
    await showRequestReview(env, chatId, review[1]);
    return json({ok:true,handled:'portal_request_review'});
  }

  const approve = callbackData.match(/^tp:approve:(ar-[A-Za-z0-9-]+)$/);
  if (approve) {
    if (!isSuperAdmin(reporter)) return deny(env, chatId, callback);
    const row = await env.DB.prepare("SELECT * FROM access_requests WHERE request_id=? AND status='PENDING'").bind(approve[1]).first();
    if (!row) {
      await answerCallback(env, callback.id, 'Ya procesada');
      return json({ok:true,handled:'portal_request_not_pending'});
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE access_requests SET status='APPROVED',reviewed_by=?,reviewed_at=? WHERE request_id=? AND status='PENDING'").bind(actorId,now,row.request_id),
      env.DB.prepare("UPDATE reporters SET club_id=?,role='CLUB_ADMIN',trust_level='VERIFIED',active=1,updated_at=? WHERE telegram_user_id=? AND role<>'SUPER_ADMIN'").bind(row.requested_club_id,now,row.telegram_user_id),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'APPROVE_CLUB_ADMIN','access_request',?,1,'super_admin_approved_enrollment',?)`)
        .bind(`access-${row.request_id}-approve`,actorId,reporter.role,row.requested_club_id,row.request_id,now)
    ]);
    const team = await env.DB.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(row.requested_club_id).first();
    await answerCallback(env, callback.id, 'Aprobado');
    await send(env, chatId, `✅ Acceso aprobado\n${row.display_name || row.telegram_user_id} → ${team?.canonical_name || row.requested_club_id} · CLUB_ADMIN`, {inline_keyboard:[[{text:'⬅️ Volver a solicitudes',callback_data:'tp:requests'}]]});
    await send(env, row.telegram_user_id, `✅ Tu acceso de dirigente fue aprobado.\n\nClub: ${team?.canonical_name || row.requested_club_id}\nYa puedes entrar a 🔐 Dirigentes desde el portal.`, {inline_keyboard:[[{text:'🔐 Entrar a Dirigentes',callback_data:'tp:leaders'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return json({ok:true,handled:'portal_request_approved'});
  }

  const reject = callbackData.match(/^tp:reject:(ar-[A-Za-z0-9-]+)$/);
  if (reject) {
    if (!isSuperAdmin(reporter)) return deny(env, chatId, callback);
    const row = await env.DB.prepare("SELECT * FROM access_requests WHERE request_id=? AND status='PENDING'").bind(reject[1]).first();
    if (!row) {
      await answerCallback(env, callback.id, 'Ya procesada');
      return json({ok:true,handled:'portal_request_not_pending'});
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE access_requests SET status='REJECTED',reviewed_by=?,reviewed_at=? WHERE request_id=? AND status='PENDING'").bind(actorId,now,row.request_id),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REJECT_CLUB_ADMIN','access_request',?,1,'super_admin_rejected_enrollment',?)`)
        .bind(`access-${row.request_id}-reject`,actorId,reporter.role,row.requested_club_id,row.request_id,now)
    ]);
    await answerCallback(env, callback.id, 'Rechazado');
    await send(env, chatId, `❌ Solicitud rechazada\n${row.display_name || row.telegram_user_id} · ${row.requested_club_id}`, {inline_keyboard:[[{text:'⬅️ Volver a solicitudes',callback_data:'tp:requests'}]]});
    await send(env, row.telegram_user_id, '❌ Tu solicitud de acceso de dirigente fue rechazada. Si corresponde, contacta al administrador del campeonato.', {inline_keyboard:[[{text:'⬅️ Volver a Dirigentes',callback_data:'tp:leaders'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
    return json({ok:true,handled:'portal_request_rejected'});
  }

  if (callbackData === 'tp:registered') {
    if (!isVerifiedAdmin(reporter)) return deny(env, chatId, callback);
    await answerCallback(env, callback.id, 'Registrados');
    await showRegisteredResults(env, chatId, reporter, true);
    return json({ok:true,handled:'portal_registered_results'});
  }

  if (callbackData === 'tp:mymatches') {
    if (!isVerifiedAdmin(reporter) || !reporter.club_id) return deny(env, chatId, callback);
    await answerCallback(env, callback.id, 'Mis partidos');
    await showMyMatchesBridge(env, chatId, reporter);
    return json({ok:true,handled:'portal_my_matches'});
  }

  return null;
}

async function showHome(env, chatId) {
  await send(env, chatId, '⚽ FÚTBOL CHÉPICA\n\nPortal del campeonato. Elige cómo quieres ingresar:', {
    inline_keyboard:[
      [{text:'🌐 Público',callback_data:'tp:public'}],
      [{text:'🔐 Dirigentes',callback_data:'tp:leaders'}]
    ]
  });
}

async function showLeaderPortal(env, chatId, reporter) {
  if (isSuperAdmin(reporter)) {
    const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first();
    await send(env, chatId, `🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes pendientes: ${Number(pending?.n || 0)}`, {
      inline_keyboard:[
        [{text:`🔔 Solicitudes (${Number(pending?.n || 0)})`,callback_data:'tp:requests'}],
        [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
        [{text:'⚽ Mis partidos de club',callback_data:'tp:mymatches'}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    });
    return;
  }
  if (isVerifiedAdmin(reporter)) {
    const team = await env.DB.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(reporter.club_id).first();
    await send(env, chatId, `🔐 PORTAL DIRIGENTES\n\n🏟 ${team?.canonical_name || reporter.club_id}\nRol: Administrador del club`, {
      inline_keyboard:[
        [{text:'⚽ Mis partidos',callback_data:'tp:mymatches'}],
        [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
        [{text:'🏠 Inicio',callback_data:'tp:home'}]
      ]
    });
    return;
  }
  const pending = await env.DB.prepare("SELECT requested_club_id,created_at FROM access_requests WHERE telegram_user_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1").bind(reporter?.telegram_user_id || '').first();
  await send(env, chatId, pending
    ? `🔐 PORTAL DIRIGENTES\n\nTu solicitud está en revisión.\nClub solicitado: ${pending.requested_club_id}`
    : '🔐 PORTAL DIRIGENTES\n\nTu cuenta todavía no tiene permisos administrativos.', {
    inline_keyboard: pending
      ? [[{text:'🔎 Ver estado',callback_data:'tp:reqstatus'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]
      : [[{text:'📝 Solicitar acceso',callback_data:'tp:req'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]
  });
}

async function showClubPicker(env, chatId) {
  const q = await env.DB.prepare("SELECT team_id,canonical_name FROM teams ORDER BY canonical_name").all();
  const rows = (q.results || []).map(t=>[{text:`🏟 ${t.canonical_name}`,callback_data:`tp:reqclub:${t.team_id}`}]);
  rows.push([{text:'⬅️ Volver',callback_data:'tp:leaders'}]);
  await send(env, chatId, '📝 SOLICITAR ACCESO DE DIRIGENTE\n\nSelecciona el club que representas. Esto crea una solicitud; no entrega permisos automáticamente.', {inline_keyboard:rows});
}

async function showRequestStatus(env, chatId, actorId) {
  const row = await env.DB.prepare("SELECT a.*,t.canonical_name FROM access_requests a LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.telegram_user_id=? ORDER BY a.created_at DESC LIMIT 1").bind(actorId).first();
  if (!row) {
    await send(env, chatId, 'No tienes solicitudes de acceso registradas.', {inline_keyboard:[[{text:'📝 Solicitar acceso',callback_data:'tp:req'}],[{text:'⬅️ Volver a Dirigentes',callback_data:'tp:leaders'}]]});
    return;
  }
  await send(env, chatId, `🔎 ESTADO DE SOLICITUD\n\nClub: ${row.canonical_name || row.requested_club_id}\nRol: ${row.requested_role}\nEstado: ${row.status}\nFecha: ${row.created_at}`, {inline_keyboard:[[{text:'⬅️ Volver a Dirigentes',callback_data:'tp:leaders'}]]});
}

async function showPendingRequests(env, chatId) {
  const q = await env.DB.prepare("SELECT a.request_id,a.display_name,a.requested_club_id,t.canonical_name FROM access_requests a LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.status='PENDING' ORDER BY a.created_at LIMIT 20").all();
  const rows = (q.results || []).map(r=>[{text:`${r.canonical_name || r.requested_club_id} · ${r.display_name || r.request_id}`,callback_data:`tp:review:${r.request_id}`}]);
  rows.push([{text:'⬅️ Volver',callback_data:'tp:leaders'}]);
  await send(env, chatId, rows.length===1 ? '✅ No hay solicitudes de dirigentes pendientes.' : '🔔 SOLICITUDES PENDIENTES\n\nSelecciona una solicitud para revisarla.', {inline_keyboard:rows});
}

async function showRequestReview(env, chatId, requestId) {
  const row = await env.DB.prepare("SELECT a.*,t.canonical_name FROM access_requests a LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.request_id=?").bind(requestId).first();
  if (!row) return send(env, chatId, 'Solicitud no encontrada.');
  await send(env, chatId, `👤 SOLICITUD DE DIRIGENTE\n\nNombre: ${row.display_name || 'Sin nombre'}\nTelegram: ${row.username ? '@'+row.username : row.telegram_user_id}\nClub: ${row.canonical_name || row.requested_club_id}\nRol solicitado: ${row.requested_role}\nEstado: ${row.status}`, {
    inline_keyboard: row.status === 'PENDING'
      ? [[{text:'✅ Aprobar',callback_data:`tp:approve:${row.request_id}`}],[{text:'❌ Rechazar',callback_data:`tp:reject:${row.request_id}`}],[{text:'⬅️ Solicitudes',callback_data:'tp:requests'}]]
      : [[{text:'⬅️ Solicitudes',callback_data:'tp:requests'}]]
  });
}

async function showRegisteredResults(env, chatId, reporter, leaderView) {
  const params = [];
  let scope = '';
  if (reporter && !isSuperAdmin(reporter) && reporter.club_id) {
    scope = ' AND (m.home_id=? OR m.away_id=?)';
    params.push(reporter.club_id,reporter.club_id);
  }
  const stmt = env.DB.prepare(`
    SELECT r.match_id,m.round_no,m.round_label,m.home_name,m.away_name,r.series_code,r.home_score,r.away_score,r.updated_at
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE r.validation_status='VERIFIED'${scope}
    ORDER BY m.round_no DESC,r.match_id,r.series_code LIMIT 40
  `).bind(...params);
  const q = await stmt.all();
  const rows = q.results || [];
  if (!rows.length) {
    await send(env, chatId, 'No hay resultados verificados disponibles todavía.', {inline_keyboard:[[navigationButton(NAVIGATION_ACTION.BACK,'nav:back')]]});
    return;
  }
  const lines = rows.map(r=>`${r.round_label || 'Fecha'} · ${r.series_code}\n${r.home_name} ${r.home_score}-${r.away_score} ${r.away_name}`);
  await send(env, chatId, `📋 RESULTADOS REGISTRADOS\n\n${lines.join('\n\n')}`, {inline_keyboard:[[navigationButton(NAVIGATION_ACTION.BACK,'nav:back')]]});
}

async function showMyMatchesBridge(env, chatId, reporter) {
  const team = await env.DB.prepare('SELECT team_id,canonical_name,group_id FROM teams WHERE team_id=?').bind(reporter.club_id).first();
  if (!team) return send(env, chatId, 'No encontré el club asociado a tu cuenta.');
  const q = await env.DB.prepare("SELECT match_id,round_no,round_label,home_name,away_name FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND (home_id=? OR away_id=?) ORDER BY round_no,match_id").bind(reporter.club_id,reporter.club_id).all();
  const buttons = (q.results || []).map(m=>[{text:`${m.round_label} · ${m.home_name} vs ${m.away_name}`,callback_data:`rs:date:${m.round_no}`}]);
  buttons.push([{text:'⬅️ Volver a Dirigentes',callback_data:'tp:leaders'}]);
  await send(env, chatId, `⚽ MIS PARTIDOS\nClub: ${team.canonical_name}\nGrupo: ${team.group_id}\n\nSelecciona una fecha:`, {inline_keyboard:buttons});
}

async function upsertIdentity(db, actorId, actor) {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at
  `).bind(actorId,displayName(actor),actor.username || null,now,now).run();
}

async function getReporter(db, actorId) {
  return db.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
}

function displayName(actor) {
  return [actor.first_name,actor.last_name].filter(Boolean).join(' ').trim() || actor.username || String(actor.id);
}
function isSuperAdmin(r) { return !!r && r.active===1 && r.trust_level==='VERIFIED' && r.role==='SUPER_ADMIN'; }
function isVerifiedAdmin(r) { return !!r && r.active===1 && r.trust_level==='VERIFIED' && ['SUPER_ADMIN','CLUB_ADMIN'].includes(r.role); }

async function deny(env, chatId, callback) {
  if (callback) await answerCallback(env, callback.id, 'No autorizado');
  await send(env, chatId, '🔒 No tienes permisos para esta función.', {inline_keyboard:[[navigationButton(NAVIGATION_ACTION.BACK,'nav:back')]]});
  return json({ok:true,handled:'portal_denied'});
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
