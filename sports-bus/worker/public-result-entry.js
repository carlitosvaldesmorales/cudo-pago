const SERIES = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'};
const MAX_PENDING_PER_USER = 8;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// G2 / PUBLIC-RESULT-SUBMISSION-01
// Public contribution -> SUBMITTED -> participating CLUB_ADMIN or SUPER_ADMIN -> VERIFIED.
// No public contribution may overwrite an already registered series result.
export async function handlePublicResultRequest(request, env) {
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
  const actorId = String(actor.id);
  const adminCommand = /^\/(pendientesresultados|aportes)(?:@\w+)?$/i.test(text);
  const leadersEntry = /^\/(dirigentes)(?:@\w+)?$/i.test(text) || callbackData === 'tp:leaders';
  let session = null;
  if (env.DB) session = await env.DB.prepare('SELECT * FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).first();
  const scoreMessage = !!session && /^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text);
  const relevant = callbackData === 'tp:public' || callbackData === 'tp:public-report' || callbackData.startsWith('pr:') || adminCommand || leadersEntry || scoreMessage;
  if (!relevant) return null;

  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'public_result_flow_not_configured'},503);

  await upsertIdentity(env.DB, actorId, actor);
  const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();

  // Replace only the admin landing screen so G2 is discoverable without changing
  // the existing lifecycle/result handlers. Suspended CLUB_ADMIN is intercepted earlier.
  if (leadersEntry && isVerifiedAdmin(reporter)) {
    if (callback) await answerCallback(env, callback.id, 'Dirigentes');
    await showAdminDashboard(env, chatId, reporter);
    return json({ok:true,handled:'public_result_admin_dashboard'});
  }
  if (leadersEntry) return null;

  if (callbackData === 'tp:public') {
    await answerCallback(env, callback.id, 'Público');
    await showPublicHome(env, chatId);
    return json({ok:true,handled:'public_result_public_home'});
  }

  if (callbackData === 'tp:public-report' || callbackData === 'pr:dates') {
    if (callback) await answerCallback(env, callback.id, 'Informar resultado');
    if (isVerifiedAdmin(reporter)) {
      await send(env, chatId, '🔐 Tu cuenta es dirigente verificado. Para registrar un resultado oficial usa Dirigentes → Mis partidos.', {inline_keyboard:[[{text:'🔐 Ir a Dirigentes',callback_data:'tp:leaders'}],[{text:'🌐 Público',callback_data:'tp:public'}]]});
      return json({ok:true,handled:'public_result_admin_redirect'});
    }
    await showPublicDates(env, chatId);
    return json({ok:true,handled:'public_result_dates'});
  }

  if (callbackData === 'pr:my') {
    await answerCallback(env, callback.id, 'Mis aportes');
    await showMySubmissions(env, chatId, actorId);
    return json({ok:true,handled:'public_result_my_submissions'});
  }

  if (callbackData === 'pr:cancel') {
    await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await answerCallback(env, callback.id, 'Cancelado');
    await send(env, chatId, 'Operación cancelada. No se envió ningún resultado.', {inline_keyboard:[[{text:'🌐 Público',callback_data:'tp:public'}]]});
    return json({ok:true,handled:'public_result_cancel'});
  }

  const dateCb = callbackData.match(/^pr:date:(\d+)$/);
  if (dateCb) {
    const roundNo = Number(dateCb[1]);
    await answerCallback(env, callback.id, `Fecha ${roundNo}`);
    await showPublicRound(env, chatId, roundNo);
    return json({ok:true,handled:'public_result_round',round_no:roundNo});
  }

  const matchCb = callbackData.match(/^pr:match:([A-Za-z0-9._:-]+)$/);
  if (matchCb) {
    const match = await getMatch(env.DB, matchCb[1]);
    if (!match) {
      await answerCallback(env, callback.id, 'Partido no válido');
      return json({ok:true,handled:'public_result_invalid_match'});
    }
    await answerCallback(env, callback.id, match.round_label || 'Partido');
    await showPublicSeries(env, chatId, match);
    return json({ok:true,handled:'public_result_series_menu',match_id:match.match_id});
  }

  if (callbackData.startsWith('pr:official:')) {
    await answerCallback(env, callback.id, 'Ya existe resultado oficial');
    await send(env, chatId, '✅ Esa serie ya tiene un resultado VERIFICADO. Un aporte público no puede reemplazarlo. Las correcciones oficiales se gestionan por un flujo separado.');
    return json({ok:true,handled:'public_result_already_verified'});
  }

  const seriesCb = callbackData.match(/^pr:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if (seriesCb) {
    const [,matchId,seriesCode] = seriesCb;
    const match = await getMatch(env.DB, matchId);
    if (!match) {
      await answerCallback(env, callback.id, 'Partido no válido');
      return json({ok:true,handled:'public_result_invalid_match'});
    }
    const official = await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first();
    if (official) {
      await answerCallback(env, callback.id, 'Ya existe resultado');
      await send(env, chatId, '✅ Esa serie ya tiene un resultado registrado y no puede ser reemplazado desde un aporte público.');
      return json({ok:true,handled:'public_result_existing_result'});
    }
    const ownPending = await env.DB.prepare("SELECT submission_id,home_score,away_score FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED' LIMIT 1").bind(matchId,seriesCode,actorId).first();
    if (ownPending) {
      await answerCallback(env, callback.id, 'Ya está pendiente');
      await send(env, chatId, `🕒 Ya tienes un aporte pendiente para esta serie: ${ownPending.home_score}-${ownPending.away_score}. No se creó un duplicado.`, {inline_keyboard:[[{text:'🔎 Mis aportes',callback_data:'pr:my'}],[{text:'🌐 Público',callback_data:'tp:public'}]]});
      return json({ok:true,handled:'public_result_duplicate_pending'});
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO telegram_public_result_sessions (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
      VALUES (?,?,?,?, 'AWAIT_SCORE', ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='AWAIT_SCORE',updated_at=excluded.updated_at
    `).bind(actorId,String(chatId),matchId,seriesCode,now,now).run();
    await answerCallback(env, callback.id, SERIES_LABEL[seriesCode]);
    await send(env, chatId, `${match.round_label} · Grupo ${match.group_id} · ${SERIES_LABEL[seriesCode]}\n${match.home_name} vs ${match.away_name}\n\nEscribe el marcador LOCAL-VISITA, por ejemplo: 2-1.\n\n🕒 Tu aporte quedará PENDIENTE. No modifica resultados ni tabla hasta que un dirigente autorizado lo apruebe.`, {inline_keyboard:[[{text:'Cancelar',callback_data:'pr:cancel'}]]});
    return json({ok:true,handled:'public_result_wait_score',match_id:matchId,series_code:seriesCode});
  }

  if (scoreMessage) {
    if (isVerifiedAdmin(reporter)) {
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env, chatId, '🔐 Tu cuenta ahora es dirigente verificado. Usa Dirigentes → Mis partidos para registrar el resultado oficial.');
      return json({ok:true,handled:'public_result_admin_session_cancelled'});
    }
    const match = await getMatch(env.DB, session.match_id);
    if (!match || !SERIES.includes(session.series_code)) {
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();
      return json({ok:true,handled:'public_result_invalid_session'});
    }
    const official = await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,session.series_code).first();
    if (official) {
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env, chatId, '✅ Mientras completabas el aporte se registró un resultado oficial. Tu envío no se guardó ni modificó el resultado existente.');
      return json({ok:true,handled:'public_result_race_existing_result'});
    }
    const pendingTotal = await env.DB.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE submitter_id=? AND status='SUBMITTED'").bind(actorId).first();
    if (Number(pendingTotal?.n || 0) >= MAX_PENDING_PER_USER) {
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env, chatId, `⚠️ Ya tienes ${MAX_PENDING_PER_USER} aportes pendientes. Espera que sean revisados antes de enviar más.`, {inline_keyboard:[[{text:'🔎 Mis aportes',callback_data:'pr:my'}]]});
      return json({ok:true,handled:'public_result_pending_limit'});
    }
    const existing = await env.DB.prepare("SELECT submission_id FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED' LIMIT 1").bind(match.match_id,session.series_code,actorId).first();
    if (existing) {
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env, chatId, '🕒 Ya existe un aporte tuyo pendiente para esa serie. No se creó un duplicado.');
      return json({ok:true,handled:'public_result_duplicate_pending'});
    }

    const score = text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
    const home = Number(score[1]), away = Number(score[2]);
    const now = new Date().toISOString();
    const submissionId = `prs-${actorId}-${update.update_id || Date.now()}`;
    const eventId = `public-${submissionId}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO public_result_submissions
        (submission_id,match_id,series_code,submitter_id,submitter_name,home_score,away_score,status,source_channel,source_event_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'SUBMITTED','telegram',?,?,?)`)
        .bind(submissionId,match.match_id,session.series_code,actorId,displayName(actor),home,away,eventId,now,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,'SUBMITTED',?)`)
        .bind(eventId,'match.series.result.public_submitted',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),JSON.stringify({submission_id:submissionId,series_code:session.series_code,home_score:home,away_score:away,source_channel:'telegram'})),
      env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId)
    ]);
    await send(env, chatId, `🕒 RESULTADO ENVIADO PARA REVISIÓN\n\n${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[session.series_code]}\nEstado: PENDIENTE\n\nTodavía NO es un resultado oficial y NO afecta la tabla. Un dirigente de cualquiera de los dos clubes participantes o un administrador global debe revisarlo.`, {inline_keyboard:[[{text:'🔎 Mis aportes',callback_data:'pr:my'}],[{text:'🌐 Público',callback_data:'tp:public'}]]});
    await notifyReviewers(env, match, submissionId, session.series_code, home, away, displayName(actor), actorId);
    return json({ok:true,handled:'public_result_submitted',submission_id:submissionId,status:'SUBMITTED'});
  }

  if (adminCommand || callbackData === 'pr:pending') {
    if (!canReviewAny(reporter)) return denyReview(env, chatId, callback, reporter, 'VIEW_PUBLIC_RESULT_QUEUE', 'not_authorized_reviewer');
    if (callback) await answerCallback(env, callback.id, 'Pendientes');
    await showPending(env, chatId, reporter);
    return json({ok:true,handled:'public_result_pending_queue'});
  }

  const reviewCb = callbackData.match(/^pr:review:(prs-[A-Za-z0-9-]+)$/);
  if (reviewCb) {
    const sub = await getSubmission(env.DB, reviewCb[1]);
    if (!sub) {
      await answerCallback(env, callback.id, 'No encontrada');
      return json({ok:true,handled:'public_result_submission_missing'});
    }
    if (!canReviewSubmission(reporter, sub)) return denyReview(env, chatId, callback, reporter, 'REVIEW_PUBLIC_RESULT', 'club_not_in_match', sub.submission_id);
    await answerCallback(env, callback.id, 'Revisar');
    await showReview(env, chatId, sub, reporter);
    return json({ok:true,handled:'public_result_review'});
  }

  const approveCb = callbackData.match(/^pr:approve:(prs-[A-Za-z0-9-]+)$/);
  if (approveCb) {
    const sub = await getSubmission(env.DB, approveCb[1]);
    if (!sub) {
      await answerCallback(env, callback.id, 'No encontrada');
      return json({ok:true,handled:'public_result_submission_missing'});
    }
    if (!canReviewSubmission(reporter, sub)) return denyReview(env, chatId, callback, reporter, 'APPROVE_PUBLIC_RESULT', 'club_not_in_match', sub.submission_id);
    if (sub.submitter_id === actorId) return denyReview(env, chatId, callback, reporter, 'APPROVE_PUBLIC_RESULT', 'self_approval_forbidden', sub.submission_id);
    if (sub.status !== 'SUBMITTED') {
      await answerCallback(env, callback.id, 'Ya procesado');
      await send(env, chatId, `Este aporte ya está en estado ${sub.status}. No se ejecutó otra transición.`);
      return json({ok:true,handled:'public_result_already_processed',status:sub.status});
    }
    const resultId = `PUB-${sub.submission_id}`;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO match_series_results
        (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,created_at,updated_at)
        VALUES (?,?,?,?,?,'VERIFIED','TELEGRAM_PUBLIC_APPROVED','Fútbol Chépica · aporte público aprobado',?,?,?)`)
        .bind(resultId,sub.match_id,sub.series_code,sub.home_score,sub.away_score,sub.submission_id,now,now),
      env.DB.prepare(`UPDATE public_result_submissions
        SET status='APPROVED',reviewed_by=?,reviewed_role=?,reviewed_club_id=?,reviewed_at=?,review_reason='authorized_reviewer_approved',updated_at=?
        WHERE submission_id=? AND status='SUBMITTED'
          AND EXISTS (SELECT 1 FROM match_series_results r WHERE r.match_id=public_result_submissions.match_id AND r.series_code=public_result_submissions.series_code AND r.source_type='TELEGRAM_PUBLIC_APPROVED' AND r.source_ref=public_result_submissions.submission_id)`)
        .bind(actorId,reporter.role,reporter.club_id || null,now,now,sub.submission_id),
      env.DB.prepare(`UPDATE public_result_submissions
        SET status='SUPERSEDED',reviewed_by=?,reviewed_role=?,reviewed_club_id=?,reviewed_at=?,review_reason='another_submission_approved',updated_at=?
        WHERE match_id=? AND series_code=? AND status='SUBMITTED' AND submission_id<>?
          AND EXISTS (SELECT 1 FROM public_result_submissions winner WHERE winner.submission_id=? AND winner.status='APPROVED')`)
        .bind(actorId,reporter.role,reporter.club_id || null,now,now,sub.match_id,sub.series_code,sub.submission_id,sub.submission_id)
    ]);

    let final = await getSubmission(env.DB, sub.submission_id);
    if (final.status !== 'APPROVED') {
      await env.DB.prepare(`UPDATE public_result_submissions SET status='SUPERSEDED',reviewed_by=?,reviewed_role=?,reviewed_club_id=?,reviewed_at=?,review_reason='official_result_already_exists',updated_at=? WHERE submission_id=? AND status='SUBMITTED'`).bind(actorId,reporter.role,reporter.club_id || null,now,now,sub.submission_id).run();
      final = await getSubmission(env.DB, sub.submission_id);
      await answerCallback(env, callback.id, 'No se reemplazó resultado');
      await send(env, chatId, '⚠️ Ya existe un resultado registrado para esa serie. El aporte quedó SUPERADO y no reemplazó la fuente de verdad.');
      await send(env, sub.submitter_id, 'ℹ️ Tu aporte quedó cerrado porque ya existe un resultado registrado para esa serie. No modificó el resultado oficial.');
      await writeAudit(env.DB, actorId, reporter, 'APPROVE_PUBLIC_RESULT', 'public_result_submission', sub.submission_id, 0, 'existing_result_prevented_overwrite');
      return json({ok:true,handled:'public_result_approval_blocked_existing',status:final.status});
    }

    await writeAudit(env.DB, actorId, reporter, 'APPROVE_PUBLIC_RESULT', 'public_result_submission', sub.submission_id, 1, 'authorized_participating_admin');
    await writeEvent(env.DB, `public-${sub.submission_id}-approved`, 'match.series.result.public_approved', final, actorId, reporter, 'VERIFIED');
    await answerCallback(env, callback.id, 'Aprobado');
    await send(env, chatId, `✅ RESULTADO APROBADO\n\n${sub.home_name} ${sub.home_score}-${sub.away_score} ${sub.away_name}\nSerie: ${SERIES_LABEL[sub.series_code]}\nEstado: VERIFIED\n\nAhora sí forma parte de la fuente de verdad pública.`);
    await send(env, sub.submitter_id, `✅ Tu aporte fue aprobado.\n\n${sub.home_name} ${sub.home_score}-${sub.away_score} ${sub.away_name}\nSerie: ${SERIES_LABEL[sub.series_code]}\nEl resultado ahora está VERIFICADO.`);
    const superseded = await env.DB.prepare("SELECT submitter_id FROM public_result_submissions WHERE match_id=? AND series_code=? AND status='SUPERSEDED' AND reviewed_at=? AND submission_id<>?").bind(sub.match_id,sub.series_code,now,sub.submission_id).all();
    for (const row of superseded.results || []) {
      if (String(row.submitter_id) !== String(sub.submitter_id)) await send(env, row.submitter_id, 'ℹ️ Otro aporte para esa misma serie fue aprobado antes. Tu aporte quedó SUPERADO y no modificó el resultado oficial.');
    }
    return json({ok:true,handled:'public_result_approved',submission_id:sub.submission_id,status:'APPROVED'});
  }

  const rejectCb = callbackData.match(/^pr:reject:(prs-[A-Za-z0-9-]+)$/);
  if (rejectCb) {
    const sub = await getSubmission(env.DB, rejectCb[1]);
    if (!sub) {
      await answerCallback(env, callback.id, 'No encontrada');
      return json({ok:true,handled:'public_result_submission_missing'});
    }
    if (!canReviewSubmission(reporter, sub)) return denyReview(env, chatId, callback, reporter, 'REJECT_PUBLIC_RESULT', 'club_not_in_match', sub.submission_id);
    if (sub.status !== 'SUBMITTED') {
      await answerCallback(env, callback.id, 'Ya procesado');
      return json({ok:true,handled:'public_result_already_processed',status:sub.status});
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE public_result_submissions SET status='REJECTED',reviewed_by=?,reviewed_role=?,reviewed_club_id=?,reviewed_at=?,review_reason='authorized_reviewer_rejected',updated_at=? WHERE submission_id=? AND status='SUBMITTED'`).bind(actorId,reporter.role,reporter.club_id || null,now,now,sub.submission_id).run();
    const final = await getSubmission(env.DB, sub.submission_id);
    if (final.status !== 'REJECTED' || final.reviewed_by !== actorId) {
      await answerCallback(env, callback.id, 'Ya procesado');
      return json({ok:true,handled:'public_result_already_processed',status:final.status});
    }
    await writeAudit(env.DB, actorId, reporter, 'REJECT_PUBLIC_RESULT', 'public_result_submission', sub.submission_id, 1, 'authorized_participating_admin');
    await writeEvent(env.DB, `public-${sub.submission_id}-rejected`, 'match.series.result.public_rejected', final, actorId, reporter, 'REJECTED');
    await answerCallback(env, callback.id, 'Rechazado');
    await send(env, chatId, `❌ APORTE RECHAZADO\n\n${sub.home_name} ${sub.home_score}-${sub.away_score} ${sub.away_name}\nSerie: ${SERIES_LABEL[sub.series_code]}\nNo se modificó ningún resultado oficial.`);
    await send(env, sub.submitter_id, `❌ Tu aporte de resultado fue rechazado por un administrador autorizado.\n\n${sub.home_name} ${sub.home_score}-${sub.away_score} ${sub.away_name}\nSerie: ${SERIES_LABEL[sub.series_code]}\nNo afectó la tabla ni los resultados oficiales.`);
    return json({ok:true,handled:'public_result_rejected',submission_id:sub.submission_id,status:'REJECTED'});
  }

  return null;
}

async function showPublicHome(env, chatId) {
  await send(env, chatId, '🌐 FÚTBOL CHÉPICA · PÚBLICO\n\nConsulta información verificada o aporta un resultado para revisión.', {inline_keyboard:[
    [{text:'⚽ Resultados verificados',callback_data:'tp:public-results'}],
    [{text:'📝 Informar resultado',callback_data:'tp:public-report'}],
    [{text:'🔎 Mis aportes',callback_data:'pr:my'}],
    [{text:'🏠 Volver',callback_data:'tp:home'}]
  ]});
}

async function showPublicDates(env, chatId) {
  const q = await env.DB.prepare("SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id='ANFA-CHEPICA-2026' ORDER BY round_no").all();
  const rows = (q.results || []).map(r=>[{text:`⚽ ${r.round_label || 'Fecha '+r.round_no}`,callback_data:`pr:date:${r.round_no}`}]);
  rows.push([{text:'🌐 Público',callback_data:'tp:public'}]);
  await send(env, chatId, '📝 INFORMAR RESULTADO\n\nSelecciona la fecha. Tu aporte quedará pendiente hasta que lo revise un dirigente autorizado.', {inline_keyboard:rows});
}

async function showPublicRound(env, chatId, roundNo) {
  const q = await env.DB.prepare(`SELECT match_id,group_id,round_no,round_label,home_name,away_name FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=? ORDER BY group_id,match_id`).bind(roundNo).all();
  const rows = (q.results || []).map(m=>[{text:`Grupo ${m.group_id} · ${m.home_name} vs ${m.away_name}`,callback_data:`pr:match:${m.match_id}`}]);
  rows.push([{text:'⬅️ Fechas',callback_data:'pr:dates'}]);
  await send(env, chatId, `⚽ Fecha ${roundNo}\n\nSelecciona el partido que quieres informar:`, {inline_keyboard:rows});
}

async function showPublicSeries(env, chatId, match) {
  const q = await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const current = new Map((q.results || []).map(x=>[x.series_code,x]));
  const rows = SERIES.map(code=>{
    const r = current.get(code);
    return r
      ? [{text:`✅ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score} · oficial`,callback_data:`pr:official:${match.match_id}:${code}`}]
      : [{text:`📝 ${SERIES_LABEL[code]}`,callback_data:`pr:series:${match.match_id}:${code}`}];
  });
  rows.push([{text:`⬅️ ${match.round_label || 'Fecha'}`,callback_data:`pr:date:${match.round_no}`}]);
  await send(env, chatId, `${match.round_label} · Grupo ${match.group_id}\n${match.home_name} vs ${match.away_name}\n\nSelecciona una serie. Las marcadas ✅ ya tienen resultado registrado y no pueden reemplazarse desde el portal público.`, {inline_keyboard:rows});
}

async function showMySubmissions(env, chatId, actorId) {
  const q = await env.DB.prepare(`SELECT s.*,m.home_name,m.away_name,m.round_label FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.submitter_id=? ORDER BY s.created_at DESC LIMIT 10`).bind(actorId).all();
  const items = q.results || [];
  if (!items.length) {
    await send(env, chatId, '🔎 MIS APORTES\n\nTodavía no has informado resultados.', {inline_keyboard:[[{text:'📝 Informar resultado',callback_data:'tp:public-report'}],[{text:'🌐 Público',callback_data:'tp:public'}]]});
    return;
  }
  const lines = items.map(s=>`${statusIcon(s.status)} ${s.round_label} · ${SERIES_LABEL[s.series_code]} · ${s.home_name} ${s.home_score}-${s.away_score} ${s.away_name}\n   ${s.status}`);
  await send(env, chatId, `🔎 MIS APORTES\n\n${lines.join('\n\n')}`, {inline_keyboard:[[{text:'📝 Informar otro',callback_data:'tp:public-report'}],[{text:'🌐 Público',callback_data:'tp:public'}]]});
}

async function showAdminDashboard(env, chatId, reporter) {
  const pendingN = await pendingCount(env.DB, reporter);
  if (isSuperAdmin(reporter)) {
    const [access,active,total] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
    ]);
    await send(env, chatId, `🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes de acceso: ${Number(access?.n||0)}\nResultados por revisar: ${pendingN}\nDirigentes activos: ${Number(active?.n||0)}/${Number(total?.n||0)}`, {inline_keyboard:[
      [{text:`🔔 Solicitudes acceso (${Number(access?.n||0)})`,callback_data:'tp:requests'}],
      [{text:`🟡 Resultados pendientes (${pendingN})`,callback_data:'pr:pending'}],
      [{text:`👥 Dirigentes (${Number(active?.n||0)}/${Number(total?.n||0)})`,callback_data:'tp:admins'}],
      [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
      [{text:'🛡️ Correcciones y disputas',callback_data:'rg:list'}],
      [{text:'⚽ Mis partidos de club',callback_data:'tp:mymatches'}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]});
    return;
  }
  const team = await env.DB.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(reporter.club_id).first();
  await send(env, chatId, `🔐 PORTAL DIRIGENTES\n\n🏟 ${team?.canonical_name || reporter.club_id}\nRol: Administrador del club\nResultados por revisar: ${pendingN}`, {inline_keyboard:[
    [{text:'⚽ Mis partidos',callback_data:'tp:mymatches'}],
    [{text:`🟡 Aportes pendientes (${pendingN})`,callback_data:'pr:pending'}],
    [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
    [{text:'⚠️ Disputar resultado oficial',callback_data:'rg:list'}],
    [{text:'🏠 Inicio',callback_data:'tp:home'}]
  ]});
}

async function showPending(env, chatId, reporter) {
  const sql = isSuperAdmin(reporter)
    ? `SELECT s.*,m.home_id,m.away_id,m.home_name,m.away_name,m.group_id,m.round_label FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' ORDER BY s.created_at LIMIT 30`
    : `SELECT s.*,m.home_id,m.away_id,m.home_name,m.away_name,m.group_id,m.round_label FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' AND (m.home_id=? OR m.away_id=?) ORDER BY s.created_at LIMIT 30`;
  const q = isSuperAdmin(reporter) ? await env.DB.prepare(sql).all() : await env.DB.prepare(sql).bind(reporter.club_id,reporter.club_id).all();
  const items = q.results || [];
  if (!items.length) {
    await send(env, chatId, '🟡 RESULTADOS PENDIENTES\n\nNo hay aportes pendientes dentro de tu alcance.', {inline_keyboard:[[{text:'⬅️ Dirigentes',callback_data:'tp:leaders'}]]});
    return;
  }
  const rows = items.map(s=>[{text:`${s.round_label} · ${SERIES_LABEL[s.series_code]} · ${s.home_score}-${s.away_score} · ${s.home_name} vs ${s.away_name}`,callback_data:`pr:review:${s.submission_id}`}]);
  rows.push([{text:'⬅️ Dirigentes',callback_data:'tp:leaders'}]);
  await send(env, chatId, `🟡 RESULTADOS PENDIENTES\n\n${items.length} aporte(s) dentro de tu alcance. Selecciona uno para revisarlo.`, {inline_keyboard:rows});
}

async function showReview(env, chatId, sub, reporter) {
  const canSelfApprove = sub.submitter_id !== reporter.telegram_user_id;
  const buttons = [];
  if (sub.status === 'SUBMITTED' && canSelfApprove) buttons.push([{text:'✅ Aprobar como oficial',callback_data:`pr:approve:${sub.submission_id}`}]);
  if (sub.status === 'SUBMITTED') buttons.push([{text:'❌ Rechazar',callback_data:`pr:reject:${sub.submission_id}`}]);
  buttons.push([{text:'⬅️ Pendientes',callback_data:'pr:pending'}]);
  await send(env, chatId, `🧾 REVISAR APORTE\n\n${sub.round_label} · Grupo ${sub.group_id}\n${sub.home_name} ${sub.home_score}-${sub.away_score} ${sub.away_name}\nSerie: ${SERIES_LABEL[sub.series_code]}\nInformado por: ${sub.submitter_name || 'Usuario Telegram'}\nEstado: ${sub.status}\n\n${canSelfApprove?'Al aprobar, el resultado pasa a VERIFIED y recién entonces se publica.':'⚠️ No puedes aprobar un aporte realizado por tu misma identidad.'}`, {inline_keyboard:buttons});
}

async function notifyReviewers(env, match, submissionId, seriesCode, home, away, submitterName, submitterId) {
  const q = await env.DB.prepare(`SELECT telegram_user_id,role,club_id FROM reporters WHERE active=1 AND trust_level='VERIFIED' AND (role='SUPER_ADMIN' OR (role='CLUB_ADMIN' AND (club_id=? OR club_id=?)))`).bind(match.home_id,match.away_id).all();
  const seen = new Set();
  for (const r of q.results || []) {
    if (seen.has(String(r.telegram_user_id))) continue;
    seen.add(String(r.telegram_user_id));
    await send(env, r.telegram_user_id, `🟡 NUEVO RESULTADO PARA REVISAR\n\n${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\nInformado por: ${submitterName}\n\nEl aporte sigue PENDIENTE; aún no afecta resultados ni tabla.`, {inline_keyboard:[[{text:'🧾 Revisar aporte',callback_data:`pr:review:${submissionId}`}],[{text:'🟡 Ver pendientes',callback_data:'pr:pending'}]]});
  }
}

async function pendingCount(db, reporter) {
  if (isSuperAdmin(reporter)) {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE status='SUBMITTED'").first();
    return Number(r?.n || 0);
  }
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' AND (m.home_id=? OR m.away_id=?)`).bind(reporter.club_id,reporter.club_id).first();
  return Number(r?.n || 0);
}

async function getMatch(db, matchId) {
  return db.prepare(`SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name FROM matches WHERE match_id=?`).bind(matchId).first();
}

async function getSubmission(db, submissionId) {
  return db.prepare(`SELECT s.*,m.competition_id,m.season_id,m.group_id,m.round_no,m.round_label,m.home_id,m.home_name,m.away_id,m.away_name FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.submission_id=?`).bind(submissionId).first();
}

function isSuperAdmin(r) {
  return !!r && r.active===1 && r.trust_level==='VERIFIED' && r.role==='SUPER_ADMIN';
}
function isClubAdmin(r) {
  return !!r && r.active===1 && r.trust_level==='VERIFIED' && r.role==='CLUB_ADMIN' && !!r.club_id;
}
function isVerifiedAdmin(r) { return isSuperAdmin(r) || isClubAdmin(r); }
function canReviewAny(r) { return isVerifiedAdmin(r); }
function canReviewSubmission(r, sub) {
  if (isSuperAdmin(r)) return true;
  return isClubAdmin(r) && (r.club_id===sub.home_id || r.club_id===sub.away_id);
}

async function denyReview(env, chatId, callback, reporter, action, reason, resourceId=null) {
  if (callback) await answerCallback(env, callback.id, 'No autorizado');
  await writeAudit(env.DB, reporter?.telegram_user_id || null, reporter || {}, action, 'public_result_submission', resourceId, 0, reason);
  await send(env, chatId, '🔒 No tienes autorización para revisar ese aporte. Sólo un administrador global o un dirigente verificado de uno de los dos clubes participantes puede hacerlo.');
  return json({ok:true,handled:'public_result_review_denied',reason});
}

async function writeAudit(db, actorId, reporter, action, resourceType, resourceId, allowed, reason) {
  const now = new Date().toISOString();
  const suffix = `${action}-${resourceId || 'none'}-${actorId || 'anonymous'}-${allowed}`;
  const auditId = `pra-${suffix}`.slice(0,180);
  await db.prepare(`INSERT OR IGNORE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(auditId,actorId || null,reporter?.role || null,reporter?.club_id || null,action,resourceType,resourceId || null,allowed,reason,now).run();
}

async function writeEvent(db, eventId, eventType, sub, actorId, reporter, validationStatus) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(eventId,eventType,now,now,sub.competition_id,sub.season_id,sub.match_id,actorId,reporter.display_name || actorId,reporter.club_id || null,validationStatus,JSON.stringify({submission_id:sub.submission_id,series_code:sub.series_code,home_score:sub.home_score,away_score:sub.away_score,status:sub.status})).run();
}

async function upsertIdentity(db, actorId, actor) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO reporters (telegram_user_id,display_name,username,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`)
    .bind(actorId,displayName(actor),actor.username || null,now,now).run();
}

function displayName(actor) {
  return [actor.first_name,actor.last_name].filter(Boolean).join(' ').trim() || actor.username || String(actor.id);
}
function statusIcon(status) {
  return status==='APPROVED'?'✅':status==='REJECTED'?'❌':status==='SUPERSEDED'?'ℹ️':status==='CANCELLED'?'🚫':'🕒';
}
async function send(env, chatId, text, replyMarkup) {
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
async function answerCallback(env,id,text) {
  if(!id) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});
}
