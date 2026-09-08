const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

const ROLE = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  CLUB_ADMIN: 'CLUB_ADMIN',
  REPORTER: 'REPORTER'
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'sports-event-bus',
        version: 'v1',
        persistence: env.DB ? 'd1' : 'not_configured',
        authorization: 'scoped-rbac-v1'
      });
    }

    if (url.pathname === '/api/v1/matches' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const status = url.searchParams.get('status');
      const stmt = status
        ? env.DB.prepare('SELECT * FROM matches WHERE status = ? ORDER BY round_label, kickoff_at, match_id').bind(status)
        : env.DB.prepare('SELECT * FROM matches ORDER BY round_label, kickoff_at, match_id');
      const result = await stmt.all();
      return json({ ok: true, matches: result.results ?? [] });
    }

    if (url.pathname === '/api/v1/results' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const result = await env.DB.prepare(
        "SELECT * FROM matches WHERE status IN ('FINAL','LIVE','REPORTED','CONFLICT') ORDER BY updated_at DESC"
      ).all();
      return json({ ok: true, results: result.results ?? [] });
    }

    if (url.pathname === '/api/v1/reports' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const matchId = url.searchParams.get('match_id');
      const stmt = matchId
        ? env.DB.prepare('SELECT report_id,match_id,reporter_club_id,home_score,away_score,report_status,evidence_ref,created_at,updated_at FROM match_reports WHERE match_id=? ORDER BY updated_at').bind(matchId)
        : env.DB.prepare('SELECT report_id,match_id,reporter_club_id,home_score,away_score,report_status,evidence_ref,created_at,updated_at FROM match_reports ORDER BY updated_at DESC LIMIT 200');
      const result = await stmt.all();
      return json({ ok: true, reports: result.results ?? [] });
    }

    if (url.pathname === '/api/v1/events' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const result = await env.DB.prepare(
        'SELECT event_id,event_type,occurred_at,competition_id,season_id,match_id,actor_name,club_id,validation_status,payload_json FROM events ORDER BY received_at DESC LIMIT 100'
      ).all();
      return json({ ok: true, events: (result.results ?? []).map(r => ({ ...r, payload: safeJson(r.payload_json) })) });
    }

    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      if (!(await authorized(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);

      const update = await request.json();
      const normalized = normalizeTelegramUpdate(update);
      const actor = normalized.source;
      const chatId = normalized.payload.chat_id;

      if (env.DB && actor.actor_id) {
        await upsertReporter(env.DB, actor);
        await persistEvent(env.DB, normalized);
      }

      if (chatId && env.TELEGRAM_BOT_TOKEN) {
        const text = (normalized.payload.text || '').trim();
        const responseText = await handleTelegramCommand(text, normalized, env);
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseText);
      }

      return json({ ok: true, accepted: true, event_id: normalized.event_id });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};

async function handleTelegramCommand(text, event, env) {
  const actorId = event.source.actor_id;
  const actorName = event.source.actor_name || 'reportero';
  if (!env.DB) return 'Persistencia no disponible.';

  const inviteMatch = text.match(/^\/start\s+clubadmin_([A-Za-z0-9_-]+)$/i);
  if (inviteMatch) return consumeClubAdminInvite(inviteMatch[1], actorId, actorName, env);

  if (/^\/start\b/i.test(text) || /^\/ayuda\b/i.test(text)) {
    const reporter = await getReporter(env.DB, actorId);
    return helpText(actorName, reporter);
  }

  if (/^\/setupadmin\b/i.test(text)) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='SUPER_ADMIN' AND trust_level='VERIFIED' AND active=1").first();
    if ((row?.n || 0) > 0) return 'Bootstrap cerrado: ya existe un SUPER_ADMIN verificado.';
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE reporters SET club_id='CUDO', role='SUPER_ADMIN', trust_level='VERIFIED', active=1, updated_at=? WHERE telegram_user_id=?"
    ).bind(now, actorId).run();
    return 'Administrador global configurado ✅\nClub: CUDO\nRol: SUPER_ADMIN\nConfianza: VERIFIED';
  }

  if (/^\/quiensoy\b/i.test(text) || /^\/mispermisos\b/i.test(text)) {
    const reporter = await getReporter(env.DB, actorId);
    return [
      `Telegram ID: ${actorId}`,
      `Nombre: ${reporter?.display_name || actorName}`,
      `Club: ${reporter?.club_id || 'SIN_ASIGNAR'}`,
      `Rol: ${reporter?.role || ROLE.REPORTER}`,
      `Confianza: ${reporter?.trust_level || 'PROVISIONAL'}`,
      `Alcance: ${reporter?.role === ROLE.SUPER_ADMIN ? 'TODO EL CAMPEONATO' : reporter?.club_id ? 'SOLO PARTIDOS DE SU CLUB' : 'SOLO CONSULTA'}`
    ].join('\n');
  }

  const inviteCmd = text.match(/^\/invitaradmin\s+([A-Za-z0-9._:-]+)$/i);
  if (inviteCmd) {
    const reporter = await getReporter(env.DB, actorId);
    if (!isSuperAdmin(reporter)) {
      await auditPermission(env.DB, reporter, 'CREATE_CLUB_ADMIN_INVITE', 'club', inviteCmd[1], false, 'requires_super_admin');
      return 'No autorizado. Solo un SUPER_ADMIN puede invitar administradores de club.';
    }
    await auditPermission(env.DB, reporter, 'CREATE_CLUB_ADMIN_INVITE', 'club', inviteCmd[1], true, 'super_admin');
    return createClubAdminInvite(inviteCmd[1], reporter, env);
  }

  if (/^\/mispartidos\b/i.test(text)) {
    const reporter = await getReporter(env.DB, actorId);
    if (!reporter?.active) return 'Tu cuenta no está habilitada.';
    const result = isSuperAdmin(reporter)
      ? await env.DB.prepare('SELECT match_id,round_label,home_name,away_name,status,validation_status FROM matches ORDER BY round_label,match_id LIMIT 50').all()
      : reporter.club_id
        ? await env.DB.prepare('SELECT match_id,round_label,home_name,away_name,status,validation_status FROM matches WHERE home_id=? OR away_id=? ORDER BY round_label,match_id LIMIT 50').bind(reporter.club_id, reporter.club_id).all()
        : { results: [] };
    const rows = result.results ?? [];
    if (!rows.length) return 'No hay partidos disponibles para tu alcance todavía.';
    return rows.map(m => `${m.round_label || 'Fecha'} | ${m.home_name} vs ${m.away_name} | ${m.status}/${m.validation_status} | ${m.match_id}`).join('\n');
  }

  const resultCmd = text.match(/^\/resultado\s+([A-Za-z0-9._:-]+)\s+(\d{1,2})\s*[-:]\s*(\d{1,2})$/i);
  if (resultCmd) {
    const [, matchId, homeRaw, awayRaw] = resultCmd;
    return reportMatchResult(matchId, Number(homeRaw), Number(awayRaw), event, env);
  }

  return 'Mensaje recibido ✅\nUsa /ayuda para ver las funciones disponibles.';
}

function helpText(actorName, reporter) {
  const lines = [
    `Hola ${actorName} 👋`,
    'Sports Event Bus está operativo.',
    '',
    '/quiensoy — identidad, rol y alcance',
    '/mispartidos — partidos dentro de tu alcance',
    '/resultado PARTIDO_ID 2-1 — reportar resultado'
  ];
  if (isSuperAdmin(reporter)) lines.push('/invitaradmin CLUB_ID — generar invitación CLUB_ADMIN');
  lines.push('/ayuda');
  return lines.join('\n');
}

async function reportMatchResult(matchId, home, away, event, env) {
  const actorId = event.source.actor_id;
  const reporter = await getReporter(env.DB, actorId);
  const match = await env.DB.prepare('SELECT * FROM matches WHERE match_id=?').bind(matchId).first();
  if (!match) return `No existe el partido ${matchId}.`;

  const permission = canReportResult(reporter, match);
  await auditPermission(env.DB, reporter, 'REPORT_RESULT', 'match', matchId, permission.allowed, permission.reason);
  if (!permission.allowed) {
    return `🔒 No autorizado para modificar este partido.\nTu alcance: ${reporter?.club_id || 'SIN_ASIGNAR'}.`;
  }

  const now = new Date().toISOString();
  const reportId = `${matchId}:${actorId}`;
  const resultEventId = `${event.event_id}-result`;
  const reportStatus = isSuperAdmin(reporter) ? 'VERIFIED' : 'PROVISIONAL';
  const payload = {
    home_score: home,
    away_score: away,
    reporter_club_id: reporter.club_id,
    role: reporter.role,
    source_channel: 'telegram'
  };

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO match_reports (report_id,match_id,reporter_id,reporter_club_id,home_score,away_score,report_status,evidence_ref,source_event_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(match_id,reporter_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,report_status=excluded.report_status,source_event_id=excluded.source_event_id,updated_at=excluded.updated_at`
    ).bind(reportId,matchId,actorId,reporter.club_id,home,away,reportStatus,null,resultEventId,now,now),
    env.DB.prepare(
      'INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(resultEventId,'match.result.reported',now,now,match.competition_id,match.season_id,matchId,actorId,event.source.actor_name,reporter.club_id,reportStatus,JSON.stringify(payload))
  ]);

  const reconciliation = await reconcileMatch(env.DB, match, reporter, home, away, resultEventId, now);
  return `${match.home_name} ${home}-${away} ${match.away_name}\n${reconciliation.message}`;
}

function canReportResult(reporter, match) {
  if (!reporter || !reporter.active) return { allowed: false, reason: 'inactive_or_missing_reporter' };
  if (reporter.trust_level !== 'VERIFIED') return { allowed: false, reason: 'reporter_not_verified' };
  if (reporter.role === ROLE.SUPER_ADMIN) return { allowed: true, reason: 'super_admin' };
  if (reporter.role !== ROLE.CLUB_ADMIN) return { allowed: false, reason: 'role_cannot_modify' };
  if (!reporter.club_id) return { allowed: false, reason: 'club_scope_missing' };
  if (reporter.club_id !== match.home_id && reporter.club_id !== match.away_id) return { allowed: false, reason: 'club_not_in_match' };
  return { allowed: true, reason: 'club_admin_in_match' };
}

async function reconcileMatch(db, match, reporter, home, away, sourceEventId, now) {
  if (isSuperAdmin(reporter)) {
    await db.prepare("UPDATE matches SET home_score=?,away_score=?,status='FINAL',validation_status='VERIFIED',source_event_id=?,updated_at=? WHERE match_id=?")
      .bind(home,away,sourceEventId,now,match.match_id).run();
    return { status: 'VERIFIED', message: '✅ Resultado validado por SUPER_ADMIN.' };
  }

  const all = await db.prepare(
    `SELECT reporter_club_id,home_score,away_score,report_status,updated_at
     FROM match_reports WHERE match_id=? AND reporter_club_id IN (?,?) ORDER BY updated_at DESC`
  ).bind(match.match_id, match.home_id, match.away_id).all();

  const latestByClub = new Map();
  for (const r of all.results ?? []) if (!latestByClub.has(r.reporter_club_id)) latestByClub.set(r.reporter_club_id, r);
  const homeReport = latestByClub.get(match.home_id);
  const awayReport = latestByClub.get(match.away_id);

  if (!homeReport || !awayReport) {
    await db.prepare("UPDATE matches SET status='REPORTED',validation_status='PROVISIONAL',home_score=NULL,away_score=NULL,source_event_id=?,updated_at=? WHERE match_id=?")
      .bind(sourceEventId,now,match.match_id).run();
    return { status: 'PROVISIONAL', message: '🟡 Reporte guardado. Falta confirmación del club rival.' };
  }

  if (homeReport.home_score === awayReport.home_score && homeReport.away_score === awayReport.away_score) {
    await db.batch([
      db.prepare("UPDATE matches SET home_score=?,away_score=?,status='FINAL',validation_status='VERIFIED',source_event_id=?,updated_at=? WHERE match_id=?")
        .bind(homeReport.home_score,homeReport.away_score,sourceEventId,now,match.match_id),
      db.prepare("UPDATE match_reports SET report_status='VERIFIED',updated_at=? WHERE match_id=? AND reporter_club_id IN (?,?)")
        .bind(now,match.match_id,match.home_id,match.away_id)
    ]);
    return { status: 'VERIFIED', message: '✅ Ambos clubes coinciden. Resultado VERIFICADO.' };
  }

  await db.prepare("UPDATE matches SET home_score=NULL,away_score=NULL,status='CONFLICT',validation_status='CONFLICT',source_event_id=?,updated_at=? WHERE match_id=?")
    .bind(sourceEventId,now,match.match_id).run();
  return { status: 'CONFLICT', message: '🔴 CONFLICTO: los clubes informaron marcadores distintos. Requiere SUPER_ADMIN.' };
}

async function createClubAdminInvite(clubId, reporter, env) {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await env.DB.prepare(
    'INSERT INTO admin_invites (token,club_id,role,created_by,created_at,expires_at,active) VALUES (?,?,?,?,?,?,1)'
  ).bind(token,clubId,ROLE.CLUB_ADMIN,reporter.telegram_user_id,now.toISOString(),expires.toISOString()).run();

  const me = await telegramApi(env.TELEGRAM_BOT_TOKEN, 'getMe');
  const username = me?.result?.username;
  if (!me.ok || !username) return 'Invitación creada, pero no pude resolver el nombre público del bot.';
  return [
    `Invitación CLUB_ADMIN creada para ${clubId} ✅`,
    `Vence: ${expires.toISOString().slice(0,10)}`,
    `https://t.me/${username}?start=clubadmin_${token}`,
    '',
    'Es de un solo uso. Compártela únicamente con el encargado autorizado.'
  ].join('\n');
}

async function consumeClubAdminInvite(token, actorId, actorName, env) {
  const invite = await env.DB.prepare('SELECT * FROM admin_invites WHERE token=?').bind(token).first();
  const now = new Date();
  if (!invite || !invite.active || invite.used_at || new Date(invite.expires_at) < now) return 'La invitación no existe, venció o ya fue utilizada.';

  await env.DB.batch([
    env.DB.prepare("UPDATE reporters SET club_id=?,role='CLUB_ADMIN',trust_level='VERIFIED',active=1,display_name=COALESCE(display_name,?),updated_at=? WHERE telegram_user_id=?")
      .bind(invite.club_id,actorName,now.toISOString(),actorId),
    env.DB.prepare('UPDATE admin_invites SET active=0,used_by=?,used_at=? WHERE token=? AND active=1')
      .bind(actorId,now.toISOString(),token)
  ]);
  const verify = await getReporter(env.DB, actorId);
  if (verify?.role !== ROLE.CLUB_ADMIN || verify?.club_id !== invite.club_id) return 'No se pudo completar la asignación de CLUB_ADMIN.';
  return `Administrador de club configurado ✅\nClub: ${invite.club_id}\nRol: CLUB_ADMIN\nAlcance: solo partidos de ${invite.club_id}`;
}

async function auditPermission(db, reporter, action, resourceType, resourceId, allowed, reason) {
  const now = new Date().toISOString();
  const auditId = `auth:${crypto.randomUUID()}`;
  await db.prepare(
    'INSERT INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(auditId,reporter?.telegram_user_id || null,reporter?.role || null,reporter?.club_id || null,action,resourceType,resourceId,allowed ? 1 : 0,reason,now).run();
}

async function getReporter(db, actorId) {
  return db.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
}

function isSuperAdmin(reporter) {
  return Boolean(reporter?.active && reporter?.role === ROLE.SUPER_ADMIN && reporter?.trust_level === 'VERIFIED');
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function upsertReporter(db, source) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at`
  ).bind(source.actor_id,source.actor_name,null,null,ROLE.REPORTER,'PROVISIONAL',1,now,now).run();
}

async function persistEvent(db, event) {
  await db.prepare(
    `INSERT OR IGNORE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    event.event_id,event.event_type,event.occurred_at,event.received_at,
    event.competition_id || null,event.season_id || null,event.match_id || null,
    event.source.actor_id,event.source.actor_name,event.source.club_id,
    event.validation.status,JSON.stringify(event.payload)
  ).run();
}

async function authorized(request, env) {
  const presented = request.headers.get('x-telegram-bot-api-secret-token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || !presented) return false;
  const expected = await deriveTelegramSafeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  return presented === expected;
}

async function deriveTelegramSafeSecret(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function telegramApi(token, method, payload) {
  const options = payload === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, options);
  return await response.json();
}

async function sendTelegramMessage(token, chatId, text) {
  const result = await telegramApi(token, 'sendMessage', { chat_id: chatId, text });
  if (!result.ok) throw new Error('Telegram sendMessage failed');
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeTelegramUpdate(update) {
  const message = update.message ?? update.edited_message ?? null;
  const callback = update.callback_query ?? null;
  const sourceMessage = message ?? callback?.message ?? null;
  const actor = message?.from ?? callback?.from ?? null;

  return {
    event_id: `tg-${update.update_id}`,
    event_type: callback ? 'telegram.callback.received' : 'telegram.message.received',
    occurred_at: new Date((sourceMessage?.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    received_at: new Date().toISOString(),
    competition_id: null,
    season_id: null,
    match_id: null,
    request_id: null,
    source: {
      channel: 'telegram',
      kind: 'human',
      actor_id: actor?.id ? String(actor.id) : null,
      actor_name: [actor?.first_name, actor?.last_name].filter(Boolean).join(' ') || actor?.username || null,
      club_id: null,
      evidence_ref: null
    },
    validation: { status: 'PENDING', verified_by: null, verified_at: null },
    payload: {
      chat_id: sourceMessage?.chat?.id ? String(sourceMessage.chat.id) : null,
      text: message?.text ?? callback?.data ?? null,
      message_id: sourceMessage?.message_id ?? null,
      raw_update_id: update.update_id
    }
  };
}
