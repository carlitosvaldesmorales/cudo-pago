import { handlePublicResultsUxV3 } from './public-results-ux-v3.js';

const COMPETITION_ID = 'ANFA-CHEPICA-2026';
const SERIES = ['TERCERA', 'SEGUNDA', 'SENIOR', 'PRIMERA'];
const SERIES_LABEL = { TERCERA: '3ª', SEGUNDA: '2ª', SENIOR: 'S', PRIMERA: '1ª' };
const PRIMARY_WEBHOOK_PATH = '/webhook/telegram';
const NEXT_WEBHOOK_PATH = '/webhook/telegram-next';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

export async function handlePublicResultsTableView(request, env) {
  const url = new URL(request.url);
  if (![PRIMARY_WEBHOOK_PATH, NEXT_WEBHOOK_PATH].includes(url.pathname) || request.method !== 'POST') return null;

  let update;
  try { update = await request.clone().json(); } catch { return null; }

  const callback = update.callback_query;
  const data = String(callback?.data || '');
  if (data !== 'tp:public-results' && !data.startsWith('p3:')) return null;

  const actor = callback?.from;
  const message = callback?.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!actor?.id || !chatId || !messageId) return null;

  const isNext = url.pathname === NEXT_WEBHOOK_PATH;
  const slotSecret = env.TELEGRAM_WEBHOOK_SECRET
    ? (isNext ? `${env.TELEGRAM_WEBHOOK_SECRET}:next` : env.TELEGRAM_WEBHOOK_SECRET)
    : null;
  const token = isNext ? env.TELEGRAM_BOT_TOKEN_NEXT : env.TELEGRAM_BOT_TOKEN;
  const presented = request.headers.get('x-telegram-bot-api-secret-token');
  const expected = slotSecret ? await sha256Hex(slotSecret) : null;
  if (!expected || presented !== expected) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB || !token) return json({ ok: false, error: 'public_results_table_not_configured' }, 503);

  // La matriz aprobada es la entrada canónica. Los callbacks p3:* reutilizan la
  // navegación V3 existente, pero el slot técnico no cambia su semántica.
  if (data.startsWith('p3:')) {
    const runtime = Object.create(env);
    runtime.TELEGRAM_BOT_TOKEN = token;
    runtime.TELEGRAM_WEBHOOK_SECRET = slotSecret;
    const target = new URL(request.url);
    target.pathname = NEXT_WEBHOOK_PATH;
    const delegated = new Request(target.toString(), {
      method: 'POST',
      headers: new Headers(request.headers),
      body: JSON.stringify(update)
    });
    return handlePublicResultsUxV3(delegated, runtime);
  }

  if (callback.id) await telegram(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'Resultados' });

  const q = await env.DB.prepare(`SELECT
      m.match_id,m.round_no,m.round_label,m.group_id,m.home_name,m.away_name,
      r.series_code,r.home_score,r.away_score
    FROM matches m
    JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id=? AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC,m.group_id,m.match_id`).bind(COMPETITION_ID).all();

  const rows = q.results || [];
  if (!rows.length) {
    await render(token, message, '⚽ <b>RESULTADOS OFICIALES</b>\n\nTodavía no hay resultados verificados.', {
      inline_keyboard: [[{ text: '🌐 Público', callback_data: 'p3:public' }]]
    });
    return json({ ok: true, handled: 'public_results_table_empty', match_count: 0 });
  }

  const rounds = groupResults(rows);
  const text = buildText(rounds);
  await render(token, message, text, {
    inline_keyboard: [[
      { text: '🔎 Buscar / filtrar', callback_data: 'p3:search' },
      { text: '🌐 Público', callback_data: 'p3:public' }
    ]]
  });

  return json({
    ok: true,
    handled: 'public_results_table_all',
    round_count: rounds.length,
    match_count: rounds.reduce((n, round) => n + round.matches.length, 0)
  });
}

function groupResults(rows) {
  const roundMap = new Map();
  for (const row of rows) {
    const roundKey = String(row.round_no);
    if (!roundMap.has(roundKey)) {
      roundMap.set(roundKey, {
        round_no: Number(row.round_no),
        round_label: row.round_label || `Fecha ${row.round_no}`,
        matches: [],
        matchMap: new Map()
      });
    }
    const round = roundMap.get(roundKey);
    if (!round.matchMap.has(row.match_id)) {
      const match = {
        match_id: row.match_id,
        group_id: row.group_id || '',
        home_name: row.home_name,
        away_name: row.away_name,
        scores: new Map()
      };
      round.matchMap.set(row.match_id, match);
      round.matches.push(match);
    }
    round.matchMap.get(row.match_id).scores.set(row.series_code, {
      home: row.home_score,
      away: row.away_score
    });
  }
  return [...roundMap.values()].map(round => {
    delete round.matchMap;
    return round;
  });
}

function buildText(rounds) {
  const out = ['⚽ <b>RESULTADOS OFICIALES</b>'];
  for (const round of rounds) {
    out.push('', `📅 <b>${escapeHtml(String(round.round_label).toUpperCase())}</b>`);
    for (const match of round.matches) {
      const group = match.group_id ? `${escapeHtml(match.group_id)} · ` : '';
      out.push(`🏟 ${group}<b>${escapeHtml(match.home_name)} — ${escapeHtml(match.away_name)}</b>`);
      const [top, bottom] = scoreGrid(match.scores);
      out.push(`<code>${top}</code>\n<code>${bottom}</code>`);
    }
  }
  out.push('', '✅ Marcadores verificados');
  return out.join('\n');
}

function scoreGrid(scores) {
  const value = code => {
    const row = scores.get(code);
    return row ? `${row.home}–${row.away}` : '—';
  };
  const top = `${SERIES_LABEL.TERCERA.padEnd(3)} ${value('TERCERA').padEnd(5)}  ${SERIES_LABEL.SEGUNDA.padEnd(3)} ${value('SEGUNDA')}`;
  const bottom = `${SERIES_LABEL.SENIOR.padEnd(3)} ${value('SENIOR').padEnd(5)}  ${SERIES_LABEL.PRIMERA.padEnd(3)} ${value('PRIMERA')}`;
  return [top, bottom];
}

async function render(token, message, text, replyMarkup) {
  const edit = await telegram(token, 'editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  });
  if (edit.ok || /message is not modified/i.test(String(edit.description || ''))) return;

  const sent = await telegram(token, 'sendMessage', {
    chat_id: message.chat.id,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup
  });
  if (!sent.ok) throw new Error('telegram_public_results_table_render_failed');
}

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  try { return await response.json(); } catch { return { ok: false }; }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
