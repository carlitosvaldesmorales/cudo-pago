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

    // One-time bootstrap without exposing either Telegram secret.
    // Authorization uses the webhook secret itself in the standard Telegram header.
    if (url.pathname === '/admin/telegram/configure' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ ok: false, error: 'telegram_secrets_missing' }, 500);
      }

      const webhookUrl = `${url.origin}/webhook/telegram`;
      const result = await telegramApi(env.TELEGRAM_BOT_TOKEN, 'setWebhook', {
        url: webhookUrl,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: true
      });
      if (!result.ok) return json({ ok: false, error: 'setWebhook_failed', telegram: result }, 502);
      return json({ ok: true, configured: true, webhook_url: webhookUrl });
    }

    if (url.pathname === '/admin/telegram/status' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: 'telegram_bot_token_missing' }, 500);
      const info = await telegramApi(env.TELEGRAM_BOT_TOKEN, 'getWebhookInfo');
      if (!info.ok) return json({ ok: false, error: 'getWebhookInfo_failed' }, 502);
      const r = info.result ?? {};
      return json({
        ok: true,
        webhook: {
          url: r.url || null,
          has_custom_certificate: Boolean(r.has_custom_certificate),
          pending_update_count: r.pending_update_count ?? null,
          last_error_date: r.last_error_date ?? null,
          last_error_message: r.last_error_message ?? null,
          max_connections: r.max_connections ?? null,
          allowed_updates: r.allowed_updates ?? null
        }
      });
    }

    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);

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

function authorized(request, env) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  return Boolean(env.TELEGRAM_WEBHOOK_SECRET && secret === env.TELEGRAM_WEBHOOK_SECRET);
}

async function telegramApi(token, method, payload) {
  const options = payload === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, options);
  const data = await response.json();
  return data;
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
