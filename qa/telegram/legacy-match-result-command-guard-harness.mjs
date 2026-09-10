import assert from 'node:assert/strict';
import worker from '../../sports-bus/telegram-route-clarity-entry.js';

const env = {
  TELEGRAM_BOT_TOKEN: 'primary-token',
  TELEGRAM_BOT_TOKEN_NEXT: 'next-token',
  TELEGRAM_WEBHOOK_SECRET: 'root-secret'
};

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  if (!target.startsWith('https://api.telegram.org/bot')) {
    throw new Error(`Unexpected network call: ${target}`);
  }
  const body = init.body ? JSON.parse(String(init.body)) : {};
  calls.push({ target, body });
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

async function safeSecret(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function update(text) {
  return {
    update_id: 9001,
    message: {
      message_id: 77,
      from: { id: 123456, first_name: 'QA' },
      chat: { id: 123456, type: 'private' },
      text
    }
  };
}

async function invoke(path, secretSource, text) {
  const secret = await safeSecret(secretSource);
  return worker.fetch(new Request(`https://qa.invalid${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': secret
    },
    body: JSON.stringify(update(text))
  }), env, {});
}

try {
  let response = await invoke('/webhook/telegram', env.TELEGRAM_WEBHOOK_SECRET, '/resultado A-R1-01 2-1');
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.handled, 'legacy_match_result_command_blocked');
  assert.equal(calls.length, 1);
  assert.match(calls[0].target, /botprimary-token\/sendMessage$/);
  assert.match(calls[0].body.text, /ya no modifica resultados/i);
  assert.match(calls[0].body.text, /No se modificó ningún marcador/i);

  calls.length = 0;
  response = await invoke('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, '/resultado A-R1-01 9-9');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'legacy_match_result_command_blocked');
  assert.equal(calls.length, 1);
  assert.match(calls[0].target, /botnext-token\/sendMessage$/);
  assert.match(calls[0].body.text, /Dirigentes → Mis partidos/);
  assert.match(calls[0].body.text, /\/correcciones/);

  console.log('PASS primary bot blocks legacy match-level /resultado without mutation');
  console.log('PASS destination bot blocks legacy match-level /resultado without mutation');
  console.log('RESULT: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
