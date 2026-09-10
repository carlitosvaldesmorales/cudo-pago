const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

const COMPETITION_ID = 'ANFA-CHEPICA-2026';
const SERIES_ORDER = ['TERCERA', 'SEGUNDA', 'SENIOR', 'PRIMERA'];
const SERIES_LABEL = { TERCERA: '3ª', SEGUNDA: '2ª', SENIOR: 'Senior', PRIMERA: '1ª' };
const SERIES_LONG = { TERCERA: 'Tercera', SEGUNDA: 'Segunda', SENIOR: 'Senior', PRIMERA: 'Primera' };

export async function handlePublicResultsUxV3(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/webhook/telegram-next' || request.method !== 'POST') return null;

  let update;
  try { update = await request.json(); } catch { return null; }

  const callback = update.callback_query;
  const actor = callback?.from;
  const chatId = callback?.message?.chat?.id;
  const messageId = callback?.message?.message_id;
  const data = String(callback?.data || '');

  if (!actor?.id || !chatId || !messageId) return null;
  if (data !== 'tp:public-results' && !data.startsWith('p3:')) return null;

  const presented = request.headers.get('x-telegram-bot-api-secret-token');
  const expected = env.TELEGRAM_WEBHOOK_SECRET ? await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET) : null;
  if (!expected || presented !== expected) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'public_results_ux_v3_not_configured' }, 503);

  if (data === 'tp:public-results' || data === 'p3:latest') {
    await answer(env, callback.id, 'Resultados');
    const latest = await latestRound(env.DB);
    if (!latest) {
      await render(env, callback, '⚽ RESULTADOS OFICIALES\n\nTodavía no hay resultados verificados.', {
        inline_keyboard: [[{ text: '🌐 Público', callback_data: 'p3:public' }]]
      });
      return json({ ok: true, handled: 'public_results_ux_v3_empty' });
    }
    await showRound(env, callback, latest.round_no);
    return json({ ok: true, handled: 'public_results_ux_v3_latest', round_no: latest.round_no });
  }

  if (data === 'p3:search') {
    await answer(env, callback.id, 'Buscar');
    await render(env, callback, '🔎 OTROS RESULTADOS\n\n¿Cómo quieres buscar?', {
      inline_keyboard: [
        [{ text: '📅 Por fecha', callback_data: 'p3:dates' }, { text: '🏟 Por club', callback_data: 'p3:clubs' }],
        [{ text: '🏆 Por serie', callback_data: 'p3:series' }],
        [{ text: '⬅️ Última fecha', callback_data: 'p3:latest' }]
      ]
    });
    return json({ ok: true, handled: 'public_results_ux_v3_search' });
  }

  if (data === 'p3:public') {
    await answer(env, callback.id, 'Público');
    await render(env, callback, '🌐 FÚTBOL CHÉPICA · PÚBLICO\n\nConsulta información verificada del campeonato.', {
      inline_keyboard: [
        [{ text: '⚽ Resultados verificados', callback_data: 'tp:public-results' }],
        [{ text: '🏠 Volver', callback_data: 'tp:home' }]
      ]
    });
    return json({ ok: true, handled: 'public_results_ux_v3_public' });
  }

  if (data === 'p3:dates') {
    await answer(env, callback.id, 'Fechas');
    await showDatePicker(env, callback);
    return json({ ok: true, handled: 'public_results_ux_v3_dates' });
  }

  const dateMatch = data.match(/^p3:d:(\d{1,3})$/);
  if (dateMatch) {
    const roundNo = Number(dateMatch[1]);
    await answer(env, callback.id, `Fecha ${roundNo}`);
    await showRound(env, callback, roundNo);
    return json({ ok: true, handled: 'public_results_ux_v3_round', round_no: roundNo });
  }

  const matchPick = data.match(/^p3:m:(\d{1,3}):([A-Za-z0-9._:-]+)$/);
  if (matchPick) {
    const roundNo = Number(matchPick[1]);
    const teamId = matchPick[2];
    await answer(env, callback.id, 'Partido');
    await showMatch(env, callback, roundNo, teamId);
    return json({ ok: true, handled: 'public_results_ux_v3_match', round_no: roundNo, team_id: teamId });
  }

  if (data === 'p3:clubs') {
    await answer(env, callback.id, 'Clubes');
    await showClubPicker(env, callback);
    return json({ ok: true, handled: 'public_results_ux_v3_clubs' });
  }

  const clubMatch = data.match(/^p3:c:([A-Za-z0-9._:-]+)$/);
  if (clubMatch) {
    await answer(env, callback.id, 'Club');
    await showClub(env, callback, clubMatch[1]);
    return json({ ok: true, handled: 'public_results_ux_v3_club', team_id: clubMatch[1] });
  }

  if (data === 'p3:series') {
    await answer(env, callback.id, 'Series');
    await render(env, callback, '🏆 RESULTADOS POR SERIE\n\nElige una serie.', {
      inline_keyboard: [
        [{ text: '3ª Tercera', callback_data: 'p3:s:TERCERA' }, { text: '2ª Segunda', callback_data: 'p3:s:SEGUNDA' }],
        [{ text: 'Senior', callback_data: 'p3:s:SENIOR' }, { text: '1ª Primera', callback_data: 'p3:s:PRIMERA' }],
        [{ text: '⬅️ Buscar', callback_data: 'p3:search' }]
      ]
    });
    return json({ ok: true, handled: 'public_results_ux_v3_series' });
  }

  const seriesMatch = data.match(/^p3:s:(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if (seriesMatch) {
    await answer(env, callback.id, SERIES_LONG[seriesMatch[1]]);
    await showSeriesDates(env, callback, seriesMatch[1]);
    return json({ ok: true, handled: 'public_results_ux_v3_series_dates', series_code: seriesMatch[1] });
  }

  const seriesDate = data.match(/^p3:sd:(TERCERA|SEGUNDA|SENIOR|PRIMERA):(\d{1,3})$/);
  if (seriesDate) {
    const seriesCode = seriesDate[1];
    const roundNo = Number(seriesDate[2]);
    await answer(env, callback.id, 'Resultados');
    await showSeriesRound(env, callback, seriesCode, roundNo);
    return json({ ok: true, handled: 'public_results_ux_v3_series_round', series_code: seriesCode, round_no: roundNo });
  }

  return null;
}

async function showRound(env, callback, roundNo) {
  const q = await env.DB.prepare(`SELECT m.match_id,m.round_no,m.round_label,m.group_id,m.home_id,m.home_name,m.away_id,m.away_name,COUNT(r.series_code) AS series_count
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND m.round_no=? AND r.validation_status='VERIFIED'
    GROUP BY m.match_id,m.round_no,m.round_label,m.group_id,m.home_id,m.home_name,m.away_id,m.away_name
    ORDER BY m.group_id,m.match_id`).bind(COMPETITION_ID, roundNo).all();
  const matches = q.results || [];

  if (!matches.length) {
    await render(env, callback, `📅 FECHA ${roundNo}\n\nNo hay resultados verificados para esta fecha.`, {
      inline_keyboard: [
        [{ text: '📅 Otras fechas', callback_data: 'p3:dates' }],
        [{ text: '⬅️ Última fecha', callback_data: 'p3:latest' }]
      ]
    });
    return;
  }

  const label = matches[0].round_label || `Fecha ${roundNo}`;
  const buttons = matches.map(match => {
    const count = Number(match.series_count || 0);
    const warning = count === 4 ? '' : ` · ⚠️ ${count}/4`;
    return [{
      text: `🏟 ${match.home_name} vs ${match.away_name}${warning}`,
      callback_data: `p3:m:${roundNo}:${match.home_id}`
    }];
  });
  buttons.push([{ text: '🔎 Otros resultados', callback_data: 'p3:search' }, { text: '🌐 Público', callback_data: 'p3:public' }]);

  await render(env, callback, `⚽ RESULTADOS OFICIALES · ${String(label).toUpperCase()}\n\nElige un partido:`, {
    inline_keyboard: buttons
  });
}

async function showMatch(env, callback, roundNo, teamId) {
  const match = await env.DB.prepare(`SELECT match_id,round_no,round_label,group_id,home_id,home_name,away_id,away_name
    FROM matches WHERE competition_id=? AND round_no=? AND (home_id=? OR away_id=?) LIMIT 1`)
    .bind(COMPETITION_ID, roundNo, teamId, teamId).first();

  if (!match) {
    await render(env, callback, 'No encontré ese partido.', {
      inline_keyboard: [[{ text: '⬅️ Última fecha', callback_data: 'p3:latest' }]]
    });
    return;
  }

  const q = await env.DB.prepare(`SELECT series_code,home_score,away_score FROM match_series_results
    WHERE match_id=? AND validation_status='VERIFIED'`).bind(match.match_id).all();
  const bySeries = new Map((q.results || []).map(row => [row.series_code, row]));
  const lines = SERIES_ORDER.filter(code => bySeries.has(code)).map(code => {
    const row = bySeries.get(code);
    return `${SERIES_LABEL[code].padEnd(7, ' ')} ${row.home_score} — ${row.away_score}`;
  });

  const label = match.round_label || `Fecha ${roundNo}`;
  const group = match.group_id ? ` · Grupo ${match.group_id}` : '';
  const text = `⚽ ${String(label).toUpperCase()}${group}\n\n🏟 ${match.home_name} vs ${match.away_name}\n\n${lines.join('\n')}\n\n✅ Oficial`;

  await render(env, callback, text, {
    inline_keyboard: [
      [{ text: `⬅️ ${label}`, callback_data: `p3:d:${roundNo}` }, { text: '🔎 Otros', callback_data: 'p3:search' }]
    ]
  });
}

async function showDatePicker(env, callback) {
  const q = await env.DB.prepare(`SELECT DISTINCT m.round_no,m.round_label
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC LIMIT 12`).bind(COMPETITION_ID).all();
  const rows = (q.results || []).map(row => [{
    text: `📅 ${row.round_label || `Fecha ${row.round_no}`}`,
    callback_data: `p3:d:${row.round_no}`
  }]);
  rows.push([{ text: '⬅️ Buscar', callback_data: 'p3:search' }]);
  await render(env, callback, '📅 RESULTADOS POR FECHA\n\nElige una fecha.', { inline_keyboard: rows });
}

async function showClubPicker(env, callback) {
  const q = await env.DB.prepare(`SELECT DISTINCT t.team_id,t.canonical_name
    FROM teams t JOIN matches m ON (m.home_id=t.team_id OR m.away_id=t.team_id)
    JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND r.validation_status='VERIFIED'
    ORDER BY t.canonical_name`).bind(COMPETITION_ID).all();
  const rows = (q.results || []).map(team => [{ text: `🏟 ${team.canonical_name}`, callback_data: `p3:c:${team.team_id}` }]);
  rows.push([{ text: '⬅️ Buscar', callback_data: 'p3:search' }]);
  await render(env, callback, '🏟 RESULTADOS POR CLUB\n\nElige un club.', { inline_keyboard: rows });
}

async function showClub(env, callback, teamId) {
  const team = await env.DB.prepare('SELECT team_id,canonical_name FROM teams WHERE team_id=?').bind(teamId).first();
  if (!team) {
    await render(env, callback, 'No encontré ese club.', { inline_keyboard: [[{ text: '⬅️ Clubes', callback_data: 'p3:clubs' }]] });
    return;
  }

  const q = await env.DB.prepare(`SELECT DISTINCT m.round_no,m.round_label,m.home_id,m.home_name,m.away_id,m.away_name
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND (m.home_id=? OR m.away_id=?) AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC LIMIT 12`).bind(COMPETITION_ID, teamId, teamId).all();

  const rows = (q.results || []).map(match => {
    const opponent = match.home_id === teamId ? match.away_name : match.home_name;
    return [{ text: `${match.round_label || `Fecha ${match.round_no}`} · vs ${opponent}`, callback_data: `p3:m:${match.round_no}:${teamId}` }];
  });
  rows.push([{ text: '⬅️ Clubes', callback_data: 'p3:clubs' }, { text: '🔎 Buscar', callback_data: 'p3:search' }]);
  await render(env, callback, `🏟 ${team.canonical_name.toUpperCase()}\n\nElige un partido.`, { inline_keyboard: rows });
}

async function showSeriesDates(env, callback, seriesCode) {
  const q = await env.DB.prepare(`SELECT DISTINCT m.round_no,m.round_label
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND r.validation_status='VERIFIED' AND r.series_code=?
    ORDER BY m.round_no DESC LIMIT 12`).bind(COMPETITION_ID, seriesCode).all();
  const rows = (q.results || []).map(row => [{
    text: `📅 ${row.round_label || `Fecha ${row.round_no}`}`,
    callback_data: `p3:sd:${seriesCode}:${row.round_no}`
  }]);
  rows.push([{ text: '⬅️ Series', callback_data: 'p3:series' }]);
  await render(env, callback, `🏆 ${SERIES_LONG[seriesCode].toUpperCase()}\n\nElige una fecha.`, { inline_keyboard: rows });
}

async function showSeriesRound(env, callback, seriesCode, roundNo) {
  const q = await env.DB.prepare(`SELECT m.round_label,m.group_id,m.home_name,m.away_name,r.home_score,r.away_score
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND m.round_no=? AND r.series_code=? AND r.validation_status='VERIFIED'
    ORDER BY m.group_id,m.match_id`).bind(COMPETITION_ID, roundNo, seriesCode).all();
  const rows = q.results || [];
  const label = rows[0]?.round_label || `Fecha ${roundNo}`;
  const lines = rows.map(row => `${row.group_id ? `Grupo ${row.group_id} · ` : ''}${row.home_name} ${row.home_score} — ${row.away_score} ${row.away_name}`);
  await render(env, callback, `🏆 ${SERIES_LONG[seriesCode].toUpperCase()} · ${String(label).toUpperCase()}\n\n${lines.length ? lines.join('\n\n') : 'No hay resultados verificados para esta fecha.'}`, {
    inline_keyboard: [
      [{ text: `⬅️ ${SERIES_LONG[seriesCode]}`, callback_data: `p3:s:${seriesCode}` }, { text: '🔎 Buscar', callback_data: 'p3:search' }]
    ]
  });
}

async function latestRound(db) {
  return db.prepare(`SELECT m.round_no,m.round_label
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC LIMIT 1`).bind(COMPETITION_ID).first();
}

async function render(env, callback, text, replyMarkup) {
  const body = {
    chat_id: callback.message.chat.id,
    message_id: callback.message.message_id,
    text,
    reply_markup: replyMarkup
  };

  const edited = await telegram(env, 'editMessageText', body);
  if (edited.ok) return { mode: 'edit' };

  const description = String(edited.description || '');
  if (/message is not modified/i.test(description)) return { mode: 'noop' };

  const fallback = await telegram(env, 'sendMessage', {
    chat_id: callback.message.chat.id,
    text,
    reply_markup: replyMarkup
  });
  if (!fallback.ok) throw new Error('telegram_public_results_v3_render_failed');
  return { mode: 'fallback-send' };
}

async function answer(env, callbackId, text) {
  if (!callbackId) return;
  await telegram(env, 'answerCallbackQuery', { callback_query_id: callbackId, text });
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
