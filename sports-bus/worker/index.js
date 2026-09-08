const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'sports-event-bus',
        version: 'v1',
        persistence: env.DB ? 'd1' : 'not_configured'
      });
    }

    if (url.pathname === '/api/v1/matches' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const status = url.searchParams.get('status');
      const stmt = status
        ? env.DB.prepare('SELECT * FROM matches WHERE status = ? ORDER BY kickoff_at').bind(status)
        : env.DB.prepare('SELECT * FROM matches ORDER BY kickoff_at');
      const result = await stmt.all();
      return json({ ok: true, matches: result.results ?? [] });
    }

    if (url.pathname === '/api/v1/results' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const result = await env.DB.prepare(
        "SELECT * FROM matches WHERE status IN ('FINAL','LIVE') ORDER BY updated_at DESC"
      ).all();
      return json({ ok: true, results: result.results ?? [] });
    }

    if (url.pathname === '/api/v1/events' && request.method === 'GET') {
      if (!env.DB) return json({ ok: false, error: 'persistence_not_configured' }, 503);
      const result = await env.DB.prepare(
        'SELECT event_id,event_type,occurred_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json FROM events ORDER BY received_at DESC LIMIT 100'
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

  if (/^\/start\b/i.test(text) || /^\/ayuda\b/i.test(text)) {
    return [
      `Hola ${actorName} 👋`,
      'CUDO Sports Event Bus está operativo.',
      '',
      'Comandos:',
      '/quiensoy',
      '/resultado PARTIDO_ID 2-1',
      '/ayuda'
    ].join('\n');
  }

  if (/^\/quiensoy\b/i.test(text)) {
    if (!env.DB) return `Telegram ID: ${actorId}\nPersistencia aún no configurada.`;
    const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id = ?').bind(actorId).first();
    return [
      `Telegram ID: ${actorId}`,
      `Nombre: ${reporter?.display_name || actorName}`,
      `Club: ${reporter?.club_id || 'SIN_ASIGNAR'}`,
      `Rol: ${reporter?.role || 'REPORTER'}`,
      `Confianza: ${reporter?.trust_level || 'PROVISIONAL'}`
    ].join('\n');
  }

  const m = text.match(/^\/resultado\s+([A-Za-z0-9._:-]+)\s+(\d{1,2})\s*[-:]\s*(\d{1,2})$/i);
  if (m) {
    if (!env.DB) return 'La captura estructurada está lista, pero falta habilitar la base D1.';
    const [, matchId, homeRaw, awayRaw] = m;
    const home = Number(homeRaw);
    const away = Number(awayRaw);
    const match = await env.DB.prepare('SELECT * FROM matches WHERE match_id = ?').bind(matchId).first();
    if (!match) return `No existe el partido ${matchId}.`;

    const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id = ?').bind(actorId).first();
    const validation = reporter?.trust_level === 'VERIFIED' ? 'VERIFIED' : 'PROVISIONAL';
    const resultEventId = `${event.event_id}-result`;
    const occurredAt = new Date().toISOString();
    const payload = {
      home_score: home,
      away_score: away,
      reporter_telegram_id: actorId,
      source_channel: 'telegram'
    };

    await env.DB.batch([
      env.DB.prepare(
        'INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(resultEventId,'match.result.reported',occurredAt,occurredAt,match.competition_id,match.season_id,matchId,actorId,event.source.actor_name,reporter?.club_id || null,validation,JSON.stringify(payload)),
      env.DB.prepare(
        "UPDATE matches SET home_score=?, away_score=?, status='FINAL', validation_status=?, source_event_id=?, updated_at=? WHERE match_id=?"
      ).bind(home,away,validation,resultEventId,occurredAt,matchId)
    ]);

    return `${match.home_name} ${home}-${away} ${match.away_name}\nResultado recibido: ${validation}.`;
  }

  return 'Mensaje recibido ✅\nUsa /ayuda para ver las funciones disponibles.';
}

async function upsertReporter(db, source) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at`
  ).bind(source.actor_id,source.actor_name,null,null,'REPORTER','PROVISIONAL',1,now,now).run();
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
