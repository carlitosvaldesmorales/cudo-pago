const SERIES = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'};

const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleSeriesRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === '/api/v1/series-results' && request.method === 'GET') {
    if (!env.DB) return json({ok:false,error:'persistence_not_configured'},503);
    const q = await env.DB.prepare(`
      SELECT r.match_id,m.home_name,m.away_name,m.group_id,m.round_no,m.round_label,
             r.series_code,r.home_score,r.away_score,r.validation_status,
             r.source_type,r.source_label,r.source_ref,r.played_on,r.updated_at
      FROM match_series_results r
      JOIN matches m ON m.match_id=r.match_id
      WHERE r.validation_status='VERIFIED'
      ORDER BY m.round_no,r.match_id,
        CASE r.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'PRIMERA' THEN 4 ELSE 9 END
    `).all();
    const grouped = new Map();
    for (const row of q.results ?? []) {
      if (!grouped.has(row.match_id)) grouped.set(row.match_id, {
        match_id: row.match_id,
        home_name: row.home_name,
        away_name: row.away_name,
        group_id: row.group_id,
        round_no: row.round_no,
        round_label: row.round_label,
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
  const menuCommand = /^\/(mispartidos|resultados)(?:@\w+)?$/i.test(text);
  const legacyFecha2 = /^\/fecha2(?:@\w+)?$/i.test(text);
  const relevant = menuCommand || legacyFecha2 || callbackData.startsWith('rs:') || (session && /^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text));
  if (!relevant) return null;

  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'series_flow_not_configured'},503);

  const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  const permission = reporter && reporter.active === 1 && reporter.trust_level === 'VERIFIED' && reporter.club_id && ['SUPER_ADMIN','CLUB_ADMIN'].includes(reporter.role);
  if (!permission) {
    await send(env, chatId, '🔒 Tu cuenta no está habilitada como administrador verificado de un club.');
    return json({ok:true,handled:'club_scope_denied'});
  }

  const team = await env.DB.prepare('SELECT team_id,canonical_name,group_id FROM teams WHERE team_id=?').bind(reporter.club_id).first();
  if (!team) {
    await send(env, chatId, 'No encontré el club asociado a tu cuenta en el campeonato.');
    return json({ok:true,handled:'club_scope_missing_team'});
  }

  if (menuCommand || legacyFecha2) {
    await showMyDates(env, chatId, reporter, team);
    return json({ok:true,handled:'club_dates_menu',club_id:reporter.club_id,group_id:team.group_id});
  }

  if (callbackData === 'rs:dates') {
    await answerCallback(env, callback.id, 'Mis fechas');
    await showMyDates(env, chatId, reporter, team);
    return json({ok:true,handled:'club_dates_menu'});
  }

  if (callbackData === 'rs:cancel') {
    await env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await answerCallback(env, callback.id, 'Cancelado');
    await send(env, chatId, 'Operación cancelada. No se modificó ningún resultado.');
    return json({ok:true,handled:'series_cancel'});
  }

  const dateCb = callbackData.match(/^rs:date:(\d+)$/);
  if (dateCb) {
    const roundNo = Number(dateCb[1]);
    await answerCallback(env, callback.id, `Fecha ${roundNo}`);
    await showMyRound(env, chatId, reporter, team, roundNo);
    return json({ok:true,handled:'club_round_menu',round_no:roundNo});
  }

  const matchCb = callbackData.match(/^rs:match:([A-Za-z0-9._:-]+)$/);
  if (matchCb) {
    const match = await scopedMatch(env.DB, reporter.club_id, matchCb[1]);
    if (!match) {
      await answerCallback(env, callback.id, 'Fuera de tu alcance');
      await send(env, chatId, '🔒 Ese partido no corresponde al club asociado a tu cuenta.');
      return json({ok:true,handled:'scope_match_denied'});
    }
    await answerCallback(env, callback.id, match.round_label || 'Partido');
    await showSeriesMenu(env, chatId, match);
    return json({ok:true,handled:'series_menu',match_id:match.match_id});
  }

  const seriesCb = callbackData.match(/^rs:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if (seriesCb) {
    const [,matchId,seriesCode] = seriesCb;
    const match = await scopedMatch(env.DB, reporter.club_id, matchId);
    if (!match) {
      await answerCallback(env, callback.id, 'Fuera de tu alcance');
      return json({ok:true,handled:'scope_series_denied'});
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO telegram_series_sessions (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
      VALUES (?,?,?,?, 'AWAIT_SCORE', ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='AWAIT_SCORE',updated_at=excluded.updated_at
    `).bind(actorId,String(chatId),matchId,seriesCode,now,now).run();
    await answerCallback(env, callback.id, SERIES_LABEL[seriesCode]);
    await send(env, chatId,
      `${match.round_label} · Grupo ${match.group_id} · ${SERIES_LABEL[seriesCode]}\n${match.home_name} vs ${match.away_name}\n\nEscribe el marcador LOCAL-VISITA, por ejemplo: 2-1\n\n⚠️ Ingresa sólo el resultado real.`
    );
    return json({ok:true,handled:'series_wait_score',match_id:matchId,series_code:seriesCode});
  }

  if (session && /^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text)) {
    const match = await scopedMatch(env.DB, reporter.club_id, session.match_id);
    if (!match) {
      await env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env, chatId, '🔒 La sesión ya no corresponde a un partido de tu club.');
      return json({ok:true,handled:'scope_session_denied'});
    }
    const score = text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
    const home = Number(score[1]), away = Number(score[2]);
    const seriesCode = session.series_code;
    if (!SERIES.includes(seriesCode)) return json({ok:true,handled:'invalid_series_session'});

    const now = new Date().toISOString();
    const eventId = `tg-${update.update_id || Date.now()}-series`;
    const reportId = `${match.match_id}:${seriesCode}:${actorId}`;
    const reportStatus = reporter.role === 'SUPER_ADMIN' ? 'VERIFIED' : 'PROVISIONAL';
    const auditId = `${eventId}-audit`;

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO series_reports (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'telegram', ?, ?, ?)
        ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,report_status=excluded.report_status,source_event_id=excluded.source_event_id,updated_at=excluded.updated_at
      `).bind(reportId,match.match_id,seriesCode,actorId,reporter.club_id,home,away,reportStatus,eventId,now,now),
      env.DB.prepare(`
        INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(eventId,'match.series.result.reported',now,now,match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name || actor.first_name || reporter.club_id,reporter.club_id,reportStatus,JSON.stringify({series_code:seriesCode,home_score:home,away_score:away,source_channel:'telegram'})),
      env.DB.prepare(`
        INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REPORT_SERIES_RESULT','match_series',?,1,'verified_club_admin_in_match',?)
      `).bind(auditId,actorId,reporter.role,reporter.club_id,`${match.match_id}:${seriesCode}`,now),
      env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId)
    ]);

    const reconciliation = await reconcileSeries(env.DB, match, seriesCode, reporter, home, away, eventId, now);
    await send(env, chatId, `${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n${reconciliation.message}`);
    await showSeriesMenu(env, chatId, match, 'Puedes informar otra serie de este mismo partido:');
    return json({ok:true,handled:'series_saved',match_id:match.match_id,series_code:seriesCode,status:reconciliation.status});
  }

  return null;
}

async function scopedMatch(db, clubId, matchId) {
  return db.prepare(`
    SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name
    FROM matches
    WHERE match_id=? AND (home_id=? OR away_id=?)
  `).bind(matchId,clubId,clubId).first();
}

async function showMyDates(env, chatId, reporter, team) {
  const matches = await env.DB.prepare(`
    SELECT match_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name
    FROM matches
    WHERE competition_id='ANFA-CHEPICA-2026' AND (home_id=? OR away_id=?)
    ORDER BY round_no,match_id
  `).bind(reporter.club_id,reporter.club_id).all();
  const byes = await env.DB.prepare(`
    SELECT round_no FROM byes
    WHERE competition_id='ANFA-CHEPICA-2026' AND team_id=?
    ORDER BY round_no
  `).bind(reporter.club_id).all();
  const byeRounds = new Set((byes.results ?? []).map(x=>Number(x.round_no)));
  const rows = [];
  for (const m of matches.results ?? []) {
    const rival = m.home_id === reporter.club_id ? m.away_name : m.home_name;
    rows.push([{text:`${m.round_label} · vs ${rival}`,callback_data:`rs:date:${m.round_no}`}]);
  }
  for (const roundNo of byeRounds) rows.push([{text:`Fecha ${roundNo} · Libre`,callback_data:`rs:date:${roundNo}`}]);
  rows.sort((a,b)=>Number(a[0].callback_data.split(':').pop())-Number(b[0].callback_data.split(':').pop()));
  rows.push([{text:'Cancelar',callback_data:'rs:cancel'}]);
  await send(env, chatId,
    `⚽ MIS PARTIDOS\nClub: ${team.canonical_name}\nGrupo: ${team.group_id}\n\nTu cuenta sólo muestra fechas y partidos donde participa tu club. Selecciona una fecha:`,
    {inline_keyboard:rows}
  );
}

async function showMyRound(env, chatId, reporter, team, roundNo) {
  const match = await env.DB.prepare(`
    SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name
    FROM matches
    WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=? AND (home_id=? OR away_id=?)
    ORDER BY match_id LIMIT 1
  `).bind(roundNo,reporter.club_id,reporter.club_id).first();
  if (!match) {
    const bye = await env.DB.prepare(`SELECT bye_id FROM byes WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=? AND team_id=?`).bind(roundNo,reporter.club_id).first();
    if (bye) {
      await send(env, chatId, `Fecha ${roundNo} · Grupo ${team.group_id}\n${team.canonical_name}: LIBRE`, {inline_keyboard:[[{text:'⬅️ Volver a mis fechas',callback_data:'rs:dates'}]]});
      return;
    }
    await send(env, chatId, `No hay partido asociado a tu club en la Fecha ${roundNo}.`, {inline_keyboard:[[{text:'⬅️ Volver a mis fechas',callback_data:'rs:dates'}]]});
    return;
  }
  await send(env, chatId,
    `${match.round_label} · Grupo ${match.group_id}\n${match.home_name} vs ${match.away_name}\n\nEste es el único partido visible para tu cuenta en esta fecha.`,
    {inline_keyboard:[[{text:'Ingresar resultados por serie',callback_data:`rs:match:${match.match_id}`}],[{text:'⬅️ Volver a mis fechas',callback_data:'rs:dates'}]]}
  );
}

async function showSeriesMenu(env, chatId, match, lead='Selecciona la serie que quieres informar:') {
  const rows = await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const existing = new Map((rows.results ?? []).map(r=>[r.series_code,r]));
  const buttons = SERIES.map(code=>{
    const r = existing.get(code);
    const label = r?.validation_status === 'VERIFIED' ? `✅ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score}` : SERIES_LABEL[code];
    return [{text:label,callback_data:`rs:series:${match.match_id}:${code}`}];
  });
  buttons.push([{text:'⬅️ Volver a mis fechas',callback_data:'rs:dates'}],[{text:'Cancelar',callback_data:'rs:cancel'}]);
  await send(env, chatId,
    `📝 ${match.round_label} · Grupo ${match.group_id}\n${match.home_name} vs ${match.away_name}\n\n${lead}`,
    {inline_keyboard:buttons}
  );
}

async function reconcileSeries(db, match, seriesCode, reporter, home, away, sourceEventId, now) {
  if (reporter.role === 'SUPER_ADMIN') {
    await publishVerified(db, match, seriesCode, home, away, sourceEventId, now, 'TELEGRAM_SUPER_ADMIN', 'Telegram · SUPER_ADMIN verificado');
    await db.prepare("UPDATE series_reports SET report_status='VERIFIED',updated_at=? WHERE match_id=? AND series_code=? AND reporter_id=?")
      .bind(now,match.match_id,seriesCode,reporter.telegram_user_id).run();
    return {status:'VERIFIED',message:'✅ Resultado VERIFICADO por administrador global y disponible para la web.'};
  }

  const reports = await db.prepare(`
    SELECT reporter_club_id,home_score,away_score,updated_at
    FROM series_reports
    WHERE match_id=? AND series_code=? AND reporter_club_id IN (?,?)
    ORDER BY updated_at DESC
  `).bind(match.match_id,seriesCode,match.home_id,match.away_id).all();
  const latest = new Map();
  for (const r of reports.results ?? []) if (!latest.has(r.reporter_club_id)) latest.set(r.reporter_club_id,r);
  const homeReport = latest.get(match.home_id);
  const awayReport = latest.get(match.away_id);

  if (!homeReport || !awayReport) {
    return {status:'PROVISIONAL',message:'🟡 Resultado guardado para tu club. Falta confirmación del club rival o validación de SUPER_ADMIN.'};
  }

  if (homeReport.home_score === awayReport.home_score && homeReport.away_score === awayReport.away_score) {
    await publishVerified(db, match, seriesCode, homeReport.home_score, homeReport.away_score, sourceEventId, now, 'TELEGRAM_DUAL_CLUB', 'Telegram · ambos clubes coinciden');
    await db.prepare("UPDATE series_reports SET report_status='VERIFIED',updated_at=? WHERE match_id=? AND series_code=? AND reporter_club_id IN (?,?)")
      .bind(now,match.match_id,seriesCode,match.home_id,match.away_id).run();
    return {status:'VERIFIED',message:'✅ Ambos clubes informaron el mismo marcador. Resultado VERIFICADO y disponible para la web.'};
  }

  await db.prepare("UPDATE series_reports SET report_status='CONFLICT',updated_at=? WHERE match_id=? AND series_code=? AND reporter_club_id IN (?,?)")
    .bind(now,match.match_id,seriesCode,match.home_id,match.away_id).run();
  return {status:'CONFLICT',message:'🔴 CONFLICTO: el club rival informó un marcador distinto. No se publica hasta resolución de SUPER_ADMIN.'};
}

async function publishVerified(db, match, seriesCode, home, away, sourceEventId, now, sourceType, sourceLabel) {
  await db.prepare(`
    INSERT INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at)
    VALUES (?,?,?,?,?,'VERIFIED',?,?,?,NULL,?,?)
    ON CONFLICT(match_id,series_code) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,validation_status='VERIFIED',source_type=excluded.source_type,source_label=excluded.source_label,source_ref=excluded.source_ref,updated_at=excluded.updated_at
  `).bind(`${match.match_id}-${seriesCode}`,match.match_id,seriesCode,home,away,sourceType,sourceLabel,sourceEventId,now,now).run();
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
