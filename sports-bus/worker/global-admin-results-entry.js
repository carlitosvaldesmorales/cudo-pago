const SERIES = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const SCORE_RE = /^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/;
const ANY_COMMAND_RE = /^\/[A-Za-z0-9_]+(?:@\w+)?(?:\s|$)/;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// GLOBAL-ADMIN-RESULTS-02
// SUPER_ADMIN is a PLATFORM role, not a club role. It owns every result in the
// competition scope: missing series can be registered and governed series can be
// corrected, disputed, annulled/restored or audited from one global surface.
export async function handleGlobalAdminResultsRequest(request, env) {
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
  const leadersEntry = /^\/dirigentes(?:@\w+)?$/i.test(text) || callbackData === 'tp:leaders';
  const legacyBridge = /^\/mispartidos(?:@\w+)?$/i.test(text) || callbackData === 'tp:mymatches';

  let session = null;
  if (env.DB) {
    session = await env.DB.prepare("SELECT * FROM telegram_series_sessions WHERE telegram_user_id=? AND state='AWAIT_GLOBAL_SCORE'").bind(actorId).first();
  }
  const scoreMessage = !!session && SCORE_RE.test(text);
  const escapeCommand = !!session && ANY_COMMAND_RE.test(text) && !leadersEntry && !/^\/mispartidos(?:@\w+)?$/i.test(text);
  const relevant = leadersEntry || legacyBridge || callbackData.startsWith('ga:') || scoreMessage || escapeCommand;
  if (!relevant) return null;

  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!env.TELEGRAM_WEBHOOK_SECRET || supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'global_admin_results_not_configured'},503);

  const reporter = await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if (!isSuperAdmin(reporter)) return null;

  if (leadersEntry) {
    await clearSession(env.DB, actorId);
    if (callback) await answerCallback(env, callback.id, 'Administración global');
    await showGlobalDashboard(env, chatId);
    // Compatibility: existing QA/contracts expect this handled identity for the leaders dashboard.
    return json({ok:true,handled:'public_result_admin_dashboard'});
  }

  // Leaving a staged global capture through another command must never preserve stale input.
  if (escapeCommand) {
    await clearSession(env.DB, actorId);
    return null;
  }

  if (legacyBridge || callbackData === 'ga:dates') {
    await clearSession(env.DB, actorId);
    if (callback) await answerCallback(env, callback.id, 'Administrar resultados');
    await showGlobalDates(env, chatId);
    return json({ok:true,handled:'global_admin_result_dates'});
  }

  if (callbackData === 'ga:home') {
    await clearSession(env.DB, actorId);
    await answerCallback(env, callback.id, 'Administración global');
    await showGlobalDashboard(env, chatId);
    return json({ok:true,handled:'global_admin_dashboard'});
  }

  if (callbackData === 'ga:cancel') {
    await clearSession(env.DB, actorId);
    await answerCallback(env, callback.id, 'Cancelado');
    await send(env, chatId, 'Operación cancelada. No se modificó ningún resultado.', {
      inline_keyboard:[[{text:'🛡 Administración global',callback_data:'tp:leaders'}]]
    });
    return json({ok:true,handled:'global_admin_result_cancel'});
  }

  const dateCb = callbackData.match(/^ga:date:(\d+)$/);
  if (dateCb) {
    await clearSession(env.DB, actorId);
    const roundNo = Number(dateCb[1]);
    await answerCallback(env, callback.id, `Fecha ${roundNo}`);
    await showGlobalRound(env, chatId, roundNo);
    return json({ok:true,handled:'global_admin_result_round',round_no:roundNo});
  }

  const matchCb = callbackData.match(/^ga:match:([A-Za-z0-9._:-]+)$/);
  if (matchCb) {
    await clearSession(env.DB, actorId);
    const match = await getMatch(env.DB, matchCb[1]);
    if (!match) {
      await answerCallback(env, callback.id, 'Partido no válido');
      return json({ok:true,handled:'global_admin_result_invalid_match'});
    }
    await answerCallback(env, callback.id, match.round_label || 'Partido');
    await showGlobalSeries(env, chatId, match);
    return json({ok:true,handled:'global_admin_result_series_menu',match_id:match.match_id});
  }

  const officialCb = callbackData.match(/^ga:official:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if (officialCb) {
    const [,matchId,seriesCode] = officialCb;
    await clearSession(env.DB, actorId);
    const [match,current] = await Promise.all([
      getMatch(env.DB, matchId),
      env.DB.prepare('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first()
    ]);
    await answerCallback(env, callback.id, 'Administrar resultado');
    if (!match || !current) return json({ok:true,handled:'global_admin_result_existing_missing'});

    const actions=[];
    if (current.validation_status === 'VERIFIED') {
      actions.push([{text:'✏️ Corregir marcador',callback_data:`rg:correct:${matchId}:${seriesCode}`}]);
      actions.push([{text:'⚠️ Poner en disputa',callback_data:`rg:dispute:${matchId}:${seriesCode}`}]);
      actions.push([{text:'🚫 Anular resultado',callback_data:`rg:annul:${matchId}:${seriesCode}`}]);
    } else if (current.validation_status === 'DISPUTED') {
      actions.push([{text:'✅ Confirmar marcador actual',callback_data:`rg:confirm:${matchId}:${seriesCode}`}]);
      actions.push([{text:'✏️ Corregir y resolver',callback_data:`rg:correct:${matchId}:${seriesCode}`}]);
      actions.push([{text:'🚫 Anular resultado',callback_data:`rg:annul:${matchId}:${seriesCode}`}]);
    } else if (current.validation_status === 'ANNULLED') {
      actions.push([{text:'♻️ Restaurar resultado',callback_data:`rg:restore:${matchId}:${seriesCode}`}]);
    }
    actions.push([{text:'🕘 Ver historial',callback_data:`rg:h:${matchId}:${seriesCode}`}]);
    actions.push([{text:'⬅️ Volver al partido',callback_data:`ga:match:${matchId}`}]);

    await send(env, chatId,
      `🛡 ADMINISTRAR RESULTADO\n\n📅 ${match.round_label} · Grupo ${match.group_id}\n🏟️ ${match.home_name} ${current.home_score}-${current.away_score} ${match.away_name}\n🏆 ${SERIES_LABEL[seriesCode]}\nEstado: ${statusLabel(current.validation_status)}\n\nComo administrador global puedes gobernar este resultado desde aquí.`,
      {inline_keyboard:actions}
    );
    return json({ok:true,handled:'global_admin_result_manage_existing',match_id:matchId,series_code:seriesCode,status:current.validation_status});
  }

  const seriesCb = callbackData.match(/^ga:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if (seriesCb) {
    const [,matchId,seriesCode] = seriesCb;
    const match = await getMatch(env.DB, matchId);
    if (!match) {
      await answerCallback(env, callback.id, 'Partido no válido');
      return json({ok:true,handled:'global_admin_result_invalid_match'});
    }
    const current = await env.DB.prepare('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first();
    if (current) {
      await clearSession(env.DB, actorId);
      await answerCallback(env, callback.id, 'Ya existe resultado');
      await send(env, chatId,
        `🧾 Esa serie ya tiene un resultado gobernado: ${current.home_score}-${current.away_score} · ${statusLabel(current.validation_status)}.\n\nUsa la serie existente para administrarla.`,
        {inline_keyboard:[[{text:'🛡 Administrar resultado',callback_data:`ga:official:${matchId}:${seriesCode}`}],[{text:'⬅️ Volver',callback_data:`ga:match:${match.match_id}`}]]}
      );
      return json({ok:true,handled:'global_admin_result_existing_guard',match_id:matchId,series_code:seriesCode});
    }

    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO telegram_series_sessions (telegram_user_id,chat_id,match_id,series_code,state,created_at,updated_at)
      VALUES (?,?,?,?, 'AWAIT_GLOBAL_SCORE', ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='AWAIT_GLOBAL_SCORE',updated_at=excluded.updated_at
    `).bind(actorId,String(chatId),matchId,seriesCode,now,now).run();
    await answerCallback(env, callback.id, SERIES_LABEL[seriesCode]);
    await send(env, chatId,
      `📝 REGISTRAR RESULTADO OFICIAL\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} vs ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n\nEscribe el marcador LOCAL-VISITA.\nEjemplo: 2-1\n\nEste flujo crea el primer resultado oficial de la serie.`,
      {inline_keyboard:[[{text:'Cancelar',callback_data:'ga:cancel'}]]}
    );
    return json({ok:true,handled:'global_admin_result_wait_score',match_id:matchId,series_code:seriesCode});
  }

  if (scoreMessage) {
    const match = await getMatch(env.DB, session.match_id);
    if (!match || !SERIES.includes(session.series_code)) {
      await clearSession(env.DB, actorId);
      await send(env, chatId, 'La sesión ya no corresponde a un partido válido. No se modificó ningún resultado.');
      return json({ok:true,handled:'global_admin_result_invalid_session'});
    }

    const current = await env.DB.prepare('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,session.series_code).first();
    if (current) {
      await clearSession(env.DB, actorId);
      await send(env, chatId,
        `⚠️ Mientras completabas la captura apareció un resultado gobernado (${current.home_score}-${current.away_score} · ${statusLabel(current.validation_status)}).\n\nTu marcador NO se guardó. Abre el resultado existente para administrarlo.`,
        {inline_keyboard:[[{text:'🛡 Administrar resultado',callback_data:`ga:official:${match.match_id}:${session.series_code}`}],[{text:'🛡 Administración global',callback_data:'tp:leaders'}]]}
      );
      return json({ok:true,handled:'global_admin_result_race_existing'});
    }

    const score = text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
    const home = Number(score[1]);
    const away = Number(score[2]);
    const seriesCode = session.series_code;
    const now = new Date().toISOString();
    const eventId = `tg-global-${update.update_id || Date.now()}-series`;
    const resultId = `${match.match_id}-${seriesCode}`;
    const reportId = `${match.match_id}:${seriesCode}:${actorId}`;
    const auditId = `${eventId}-audit`;
    const versionId = `${match.match_id}:${seriesCode}:v1`;

    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO match_series_results
            (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version)
          VALUES (?,?,?,?,?,'VERIFIED','TELEGRAM_SUPER_ADMIN','Telegram · Administrador global',?,NULL,?,?,1)
        `).bind(resultId,match.match_id,seriesCode,home,away,eventId,now,now),
        env.DB.prepare(`
          UPDATE match_series_result_versions
          SET actor_id=?,actor_role='SUPER_ADMIN',actor_club_id=NULL
          WHERE version_id=? AND action='BASELINE' AND actor_id IS NULL
        `).bind(actorId,versionId),
        env.DB.prepare(`
          INSERT INTO series_reports
            (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
          VALUES (?,?,?,?,NULL,?,?,'VERIFIED','telegram',?,?,?)
          ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET
            home_score=excluded.home_score,away_score=excluded.away_score,report_status='VERIFIED',source_event_id=excluded.source_event_id,updated_at=excluded.updated_at
        `).bind(reportId,match.match_id,seriesCode,actorId,home,away,eventId,now,now),
        env.DB.prepare(`
          INSERT OR REPLACE INTO events
            (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
          VALUES (?,?,?,?,?,?,?,?,?,NULL,'VERIFIED',?)
        `).bind(eventId,'match.series.result.reported',now,now,match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name || actor.first_name || actorId,JSON.stringify({series_code:seriesCode,home_score:home,away_score:away,source_channel:'telegram',authorization:'SUPER_ADMIN_GLOBAL',outcome:'FIRST_OFFICIAL'})),
        env.DB.prepare(`
          INSERT OR REPLACE INTO permission_audit
            (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
          VALUES (?,?,'SUPER_ADMIN',NULL,'REPORT_SERIES_RESULT','match_series',?,1,'verified_super_admin_global_first_official',?)
        `).bind(auditId,actorId,`${match.match_id}:${seriesCode}`,now),
        env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId)
      ]);
    } catch (error) {
      const appeared = await env.DB.prepare('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,seriesCode).first();
      await clearSession(env.DB, actorId);
      if (appeared) {
        await send(env, chatId, `⚠️ El resultado no se guardó porque esa serie ya tiene un resultado gobernado (${appeared.home_score}-${appeared.away_score}). Abre el resultado existente para administrarlo.`);
        return json({ok:true,handled:'global_admin_result_concurrency_guard'});
      }
      throw error;
    }

    await send(env, chatId,
      `✅ RESULTADO OFICIAL REGISTRADO\n\n${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n\nQuedó registrado como primer resultado oficial con trazabilidad del administrador global.`,
      {inline_keyboard:[
        [{text:'📝 Administrar otra serie',callback_data:`ga:match:${match.match_id}`}],
        [{text:'🛡 Administración global',callback_data:'tp:leaders'}]
      ]}
    );
    return json({ok:true,handled:'global_admin_result_saved',match_id:match.match_id,series_code:seriesCode,status:'VERIFIED'});
  }

  return null;
}

async function showGlobalDashboard(env, chatId) {
  const [access,pending,active,total] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE status='SUBMITTED'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
  ]);
  await send(env, chatId,
    `🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes de acceso: ${Number(access?.n||0)}\nResultados por revisar: ${Number(pending?.n||0)}\nDirigentes activos: ${Number(active?.n||0)}/${Number(total?.n||0)}`,
    {inline_keyboard:[
      [{text:`🔔 Solicitudes acceso (${Number(access?.n||0)})`,callback_data:'tp:requests'}],
      [{text:`🟡 Resultados pendientes (${Number(pending?.n||0)})`,callback_data:'pr:pending'}],
      [{text:`👥 Dirigentes (${Number(active?.n||0)}/${Number(total?.n||0)})`,callback_data:'tp:admins'}],
      [{text:'⚽ Administrar todos los resultados',callback_data:'ga:dates'}],
      [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
      [{text:'🛡️ Correcciones y disputas',callback_data:'rg:list'}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]}
  );
}

async function showGlobalDates(env, chatId) {
  const q = await env.DB.prepare("SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id='ANFA-CHEPICA-2026' ORDER BY round_no").all();
  const rows = (q.results || []).map(r=>[{text:`📅 ${r.round_label || 'Fecha '+r.round_no}`,callback_data:`ga:date:${r.round_no}`}]);
  rows.push([{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]);
  await send(env, chatId,
    '⚽ ADMINISTRAR TODOS LOS RESULTADOS\n\nTienes alcance global sobre todos los partidos y las cuatro series del campeonato. Selecciona una fecha:',
    {inline_keyboard:rows}
  );
}

async function showGlobalRound(env, chatId, roundNo) {
  const q = await env.DB.prepare(`
    SELECT match_id,group_id,round_no,round_label,home_name,away_name
    FROM matches
    WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=?
    ORDER BY group_id,match_id
  `).bind(roundNo).all();
  const matches = q.results || [];
  const rows = matches.map(m=>[{text:`Grupo ${m.group_id} · ${m.home_name} — ${m.away_name}`,callback_data:`ga:match:${m.match_id}`}]);
  rows.push([{text:'⬅️ Volver a fechas',callback_data:'ga:dates'}]);
  await send(env, chatId,
    matches.length ? `📅 FECHA ${roundNo}\n\nSelecciona cualquier partido para administrar sus resultados:` : `📅 FECHA ${roundNo}\n\nNo hay partidos cargados.`,
    {inline_keyboard:rows}
  );
}

async function showGlobalSeries(env, chatId, match) {
  const q = await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const current = new Map((q.results || []).map(x=>[x.series_code,x]));
  const buttons = SERIES.map(code=>{
    const r = current.get(code);
    if (!r) return {text:`➕ ${SERIES_LABEL[code]} · Registrar`,callback_data:`ga:series:${match.match_id}:${code}`};
    const icon = r.validation_status === 'VERIFIED' ? '✅' : r.validation_status === 'DISPUTED' ? '⚠️' : '🚫';
    return {text:`${icon} ${SERIES_LABEL[code]} · ${r.home_score}-${r.away_score}`,callback_data:`ga:official:${match.match_id}:${code}`};
  });
  await send(env, chatId,
    `🛡 ADMINISTRAR RESULTADOS DEL PARTIDO\n\n📅 ${match.round_label} · Grupo ${match.group_id}\n🏟️ ${match.home_name} — ${match.away_name}\n\n➕ Sin resultado: registrar.\n✅/⚠️/🚫 Con resultado: abrir y gobernar.`,
    {inline_keyboard:[
      [buttons[0],buttons[1]],
      [buttons[2],buttons[3]],
      [{text:`⬅️ Volver a ${match.round_label}`,callback_data:`ga:date:${match.round_no}`}],
      [{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]
    ]}
  );
}

async function getMatch(db, matchId) {
  return db.prepare(`
    SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name
    FROM matches
    WHERE competition_id='ANFA-CHEPICA-2026' AND match_id=?
    LIMIT 1
  `).bind(matchId).first();
}

function isSuperAdmin(r) {
  return !!r && Number(r.active) === 1 && r.trust_level === 'VERIFIED' && r.role === 'SUPER_ADMIN';
}

function statusLabel(status) {
  return status === 'VERIFIED' ? 'Oficial' : status === 'DISPUTED' ? 'En disputa' : status === 'ANNULLED' ? 'Anulado' : String(status || 'Sin estado');
}

async function clearSession(db, actorId) {
  await db.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).run();
}

async function send(env, chatId, text, replyMarkup) {
  const body = {chat_id:chatId,text};
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  });
}

async function answerCallback(env, id, text) {
  if (!id) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})
  });
}
