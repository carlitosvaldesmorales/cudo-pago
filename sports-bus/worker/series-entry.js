const SERIES = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'};
const TEST_MATCH_ID = 'A-F2-M2';

const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleSeriesRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/v1/series-results' && request.method === 'GET') {
    if (!env.DB) return json({ok:false,error:'persistence_not_configured'},503);
    const q = await env.DB.prepare(`
      SELECT r.match_id,m.home_name,m.away_name,r.series_code,r.home_score,r.away_score,
             r.validation_status,r.source_type,r.source_label,r.source_ref,r.played_on,r.updated_at
      FROM match_series_results r
      JOIN matches m ON m.match_id=r.match_id
      WHERE r.validation_status='VERIFIED'
      ORDER BY m.round_label,r.match_id,
        CASE r.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'PRIMERA' THEN 4 ELSE 9 END
    `).all();
    const grouped = new Map();
    for (const row of q.results ?? []) {
      if (!grouped.has(row.match_id)) grouped.set(row.match_id, {
        match_id: row.match_id,
        home_name: row.home_name,
        away_name: row.away_name,
        validation_status: 'VERIFIED',
        series: []
      });
      grouped.get(row.match_id).series.push({
        series: row.series_code,
        home_score: row.home_score,
        away_score: row.away_score,
        validation_status: row.validation_status,
        source_type: row.source_type,
        source_label: row.source_label,
        source_ref: row.source_ref,
        played_on: row.played_on,
        updated_at: row.updated_at
      });
    }
    return json({ok:true,results:[...grouped.values()]});
  }

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
  const actorId = String(actor.id);

  let session = null;
  if (env.DB) session = await env.DB.prepare('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).first();
  const relevant = /^\/fecha2(?:@\w+)?$/i.test(text) || callbackData.startsWith('r2:') || (session && /^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text));
  if (!relevant) return null;

  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'series_flow_not_configured'},503);

  const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  const permission = reporter && reporter.active === 1 && reporter.trust_level === 'VERIFIED' && reporter.club_id === 'CUDO' && ['SUPER_ADMIN','CLUB_ADMIN'].includes(reporter.role);
  if (!permission) {
    await send(env, chatId, '🔒 Esta prueba está habilitada sólo para un administrador verificado de CUDO.');
    return json({ok:true,handled:'series_test_denied'});
  }

  const match = await env.DB.prepare('SELECT * FROM matches WHERE match_id=?').bind(TEST_MATCH_ID).first();
  if (!match || (match.home_id !== 'CUDO' && match.away_id !== 'CUDO')) {
    await send(env, chatId, 'No encontré el partido de CUDO de la Fecha II en el fixture materializado.');
    return json({ok:true,handled:'series_test_missing_match'});
  }

  if (/^\/fecha2(?:@\w+)?$/i.test(text)) {
    await showSeriesMenu(env, chatId, match);
    return json({ok:true,handled:'series_test_menu'});
  }

  if (callbackData === 'r2:cancel') {
    await env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await answerCallback(env, callback.id, 'Cancelado');
    await send(env, chatId, 'Prueba cancelada. No se modificó ningún resultado.');
    return json({ok:true,handled:'series_test_cancel'});
  }

  const cb = callbackData.match(/^r2:([^:]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if (cb) {
    const [,matchId,seriesCode] = cb;
    if (matchId !== TEST_MATCH_ID) return json({ok:true,handled:'series_test_wrong_match'});
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO telegram_series_sessions (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
      VALUES (?,?,?,?, 'AWAIT_SCORE', ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='AWAIT_SCORE',updated_at=excluded.updated_at
    `).bind(actorId,String(chatId),matchId,seriesCode,now,now).run();
    await answerCallback(env, callback.id, SERIES_LABEL[seriesCode]);
    await send(env, chatId,
      `Fecha II · ${SERIES_LABEL[seriesCode]}\n${match.home_name} vs ${match.away_name}\n\nEscribe el marcador LOCAL-VISITA, por ejemplo: 2-1\n\n⚠️ Ingresa sólo el resultado real. No usamos datos ficticios.`
    );
    return json({ok:true,handled:'series_test_wait_score'});
  }

  if (session && /^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text)) {
    const score = text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
    const home = Number(score[1]), away = Number(score[2]);
    const seriesCode = session.series_code;
    if (!SERIES.includes(seriesCode)) return json({ok:true,handled:'series_test_invalid_session'});

    const now = new Date().toISOString();
    const eventId = `tg-${update.update_id || Date.now()}-series`;
    const reportId = `${TEST_MATCH_ID}:${seriesCode}:${actorId}`;
    const reportStatus = reporter.role === 'SUPER_ADMIN' ? 'VERIFIED' : 'PROVISIONAL';
    const auditId = `${eventId}-audit`;
    const statements = [
      env.DB.prepare(`
        INSERT INTO series_reports (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'telegram', ?, ?, ?)
        ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,report_status=excluded.report_status,source_event_id=excluded.source_event_id,updated_at=excluded.updated_at
      `).bind(reportId,TEST_MATCH_ID,seriesCode,actorId,reporter.club_id,home,away,reportStatus,eventId,now,now),
      env.DB.prepare(`
        INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(eventId,'match.series.result.reported',now,now,match.competition_id,match.season_id,TEST_MATCH_ID,actorId,reporter.display_name || actor.first_name || 'CUDO',reporter.club_id,reportStatus,JSON.stringify({series_code:seriesCode,home_score:home,away_score:away,source_channel:'telegram'})),
      env.DB.prepare(`
        INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REPORT_SERIES_RESULT','match_series',?,1,'verified_cudo_admin',?)
      `).bind(auditId,actorId,reporter.role,reporter.club_id,`${TEST_MATCH_ID}:${seriesCode}`,now),
      env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId)
    ];

    if (reportStatus === 'VERIFIED') {
      statements.push(env.DB.prepare(`
        INSERT INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at)
        VALUES (?,?,?,?,?,'VERIFIED','TELEGRAM_ADMIN',?,?,NULL,?,?)
        ON CONFLICT(match_id,series_code) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,validation_status='VERIFIED',source_type=excluded.source_type,source_label=excluded.source_label,source_ref=excluded.source_ref,updated_at=excluded.updated_at
      `).bind(`${TEST_MATCH_ID}-${seriesCode}`,TEST_MATCH_ID,seriesCode,home,away,'CUDO Telegram · administrador verificado',eventId,now,now));
    }

    await env.DB.batch(statements);
    const statusText = reportStatus === 'VERIFIED'
      ? '✅ Resultado VERIFICADO y disponible para la web.'
      : '🟡 Resultado PROVISIONAL. Falta validación de contraparte o SUPER_ADMIN.';
    await send(env, chatId, `${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n${statusText}`);
    await showSeriesMenu(env, chatId, match, 'Puedes cargar otra serie de la Fecha II:');
    return json({ok:true,handled:'series_test_saved',match_id:TEST_MATCH_ID,series_code:seriesCode,status:reportStatus});
  }

  return null;
}

async function showSeriesMenu(env, chatId, match, lead='Selecciona la serie que quieres informar:') {
  const rows = await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(TEST_MATCH_ID).all();
  const existing = new Map((rows.results ?? []).map(r=>[r.series_code,r]));
  const buttons = SERIES.map(code=>{
    const r = existing.get(code);
    const label = r ? `✅ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score}` : SERIES_LABEL[code];
    return [{text:label,callback_data:`r2:${TEST_MATCH_ID}:${code}`}];
  });
  buttons.push([{text:'Cancelar',callback_data:'r2:cancel'}]);
  await send(env, chatId,
    `📝 PRUEBA RESULTADOS · FECHA II\n${match.home_name} vs ${match.away_name}\n\n${lead}`,
    {inline_keyboard:buttons}
  );
}

async function send(env, chatId, text, replyMarkup) {
  const body = {chat_id:chatId,text};
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  });
}

async function answerCallback(env, id, text) {
  if (!id) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})
  });
}
