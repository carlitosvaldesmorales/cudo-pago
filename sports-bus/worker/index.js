const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'sports-event-bus', version: 'v1' });
    }

    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      if (!(await authorized(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);

      const update = await request.json();
      const normalized = normalizeTelegramUpdate(update);

      if (normalized.payload.chat_id && env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, normalized.payload.chat_id,
          'CUDO Sports Event Bus conectado ✅\nEvento recibido: ' + normalized.event_id);
      }

      return json({ ok: true, accepted: true, event: normalized });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};

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
