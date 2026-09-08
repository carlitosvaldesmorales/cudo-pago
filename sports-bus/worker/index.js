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
      const secret = request.headers.get('x-telegram-bot-api-secret-token');
      if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }

      const update = await request.json();
      const normalized = normalizeTelegramUpdate(update);
      // Persistence/routing is intentionally left behind the contract boundary.
      return json({ ok: true, accepted: true, event: normalized });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }
};

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
