import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/telegram-migration-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { PUBLIC_NATIVE_COMMANDS } from '../../sports-bus/worker/telegram-native-menu-entry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'sports-bus', 'migrations');
const TARGET_BOT_NAME = 'Fútbol Chépica';

const env = {
  DB: new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN: 'qa-old-token',
  TELEGRAM_BOT_TOKEN_NEXT: 'qa-new-token',
  TELEGRAM_WEBHOOK_SECRET: 'qa-shared-secret'
};

const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  const oldPrefix = 'https://api.telegram.org/botqa-old-token/';
  const newPrefix = 'https://api.telegram.org/botqa-new-token/';
  const slot = target.startsWith(oldPrefix) ? 'primary' : target.startsWith(newPrefix) ? 'next' : null;
  if (!slot) throw new Error(`QA migration harness blocked unexpected network call: ${target}`);
  const prefix = slot === 'primary' ? oldPrefix : newPrefix;
  const method = target.slice(prefix.length);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ slot, method, body });

  let result = true;
  if (method === 'getMe') {
    result = slot === 'primary'
      ? { id: 111111, is_bot: true, first_name: TARGET_BOT_NAME, username: 'CUDODeportesBot' }
      : { id: 222222, is_bot: true, first_name: TARGET_BOT_NAME, username: 'FutbolChepicaBot' };
  }
  if (method === 'getMyName') result = { name: TARGET_BOT_NAME };
  if (method === 'getWebhookInfo') {
    result = {
      url: slot === 'primary'
        ? 'https://qa.invalid/webhook/telegram'
        : 'https://qa.invalid/webhook/telegram-next',
      pending_update_count: 0
    };
  }
  if (method === 'getChatMenuButton') result = { type: 'commands' };
  if (method === 'getMyCommands') result = PUBLIC_NATIVE_COMMANDS;
  if (method === 'sendMessage') result = { message_id: calls.length };

  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

function applyMigrations() {
  for (const file of fs.readdirSync(migrationsDir).filter(x => x.endsWith('.sql')).sort()) {
    env.DB.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

let updateId = 990000;
const actor = { id: 9922001, first_name: 'QA', last_name: 'Migration', username: 'qa_migration' };

async function telegramMessage(pathname, secretSource, text) {
  const safe = await sha256Hex(secretSource);
  const request = new Request(`https://qa.invalid${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': safe
    },
    body: JSON.stringify({
      update_id: ++updateId,
      message: {
        message_id: updateId,
        from: actor,
        chat: { id: actor.id, type: 'private' },
        text
      }
    })
  });
  return worker.fetch(request, env, {});
}

function resetCalls() { calls.length = 0; }
function slotCalls(slot, method) { return calls.filter(x => x.slot === slot && (!method || x.method === method)); }
async function row(sql, ...params) { return env.DB.prepare(sql).bind(...params).first(); }

async function run() {
  console.log('TELEGRAM-BOT-MIGRATION-01');
  applyMigrations();

  assert.ok(await row("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_menu_state'"));
  assert.ok(await row("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_menu_state_next'"));
  console.log('PASS independent next-bot menu cache schema');

  resetCalls();
  let response = await telegramMessage('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, '/ayuda');
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.accepted, true);
  assert.equal(slotCalls('next', 'sendMessage').length, 1);
  assert.equal(slotCalls('primary', 'sendMessage').length, 0);
  assert.ok(slotCalls('next', 'setMyCommands').length >= 1);
  assert.ok(await row('SELECT telegram_user_id FROM telegram_menu_state_next WHERE telegram_user_id=?', String(actor.id)));
  assert.equal(await row('SELECT telegram_user_id FROM telegram_menu_state WHERE telegram_user_id=?', String(actor.id)), null);
  assert.ok(await row('SELECT telegram_user_id FROM reporters WHERE telegram_user_id=?', String(actor.id)));
  console.log('PASS next webhook reuses core logic, D1 identity and next token only');

  resetCalls();
  response = await telegramMessage('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, '/inicio');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.profile, 'PUBLIC');
  assert.equal(slotCalls('next', 'setMyCommands').length, 0, 'next bot menu cache must be idempotent');
  console.log('PASS next-bot menu sync idempotence');

  resetCalls();
  response = await telegramMessage('/webhook/telegram', env.TELEGRAM_WEBHOOK_SECRET, '/inicio');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.profile, 'PUBLIC');
  assert.ok(slotCalls('primary', 'setMyCommands').length >= 1, 'primary bot must maintain its own menu cache');
  assert.ok(await row('SELECT telegram_user_id FROM telegram_menu_state WHERE telegram_user_id=?', String(actor.id)));
  assert.ok(await row('SELECT telegram_user_id FROM telegram_menu_state_next WHERE telegram_user_id=?', String(actor.id)));
  console.log('PASS primary and next menu caches are independent');

  resetCalls();
  response = await worker.fetch(new Request('https://qa.invalid/ops/telegram-next/reconcile', {
    method: 'POST',
    headers: { 'X-CUDO-Repair': 'reconcile-webhook' }
  }), env, {});
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.slot, 'next');
  const webhookCall = slotCalls('next', 'setWebhook').at(-1);
  assert.ok(webhookCall);
  assert.equal(webhookCall.body.url, 'https://qa.invalid/webhook/telegram-next');
  assert.equal(webhookCall.body.drop_pending_updates, false);
  assert.equal(slotCalls('next', 'setMyName').at(-1).body.name, TARGET_BOT_NAME);
  console.log('PASS next reconcile configures isolated webhook, menu and branding');

  resetCalls();
  response = await worker.fetch(new Request('https://qa.invalid/health/telegram-next'), env, {});
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.slot, 'next');
  assert.equal(payload.bot_id, 222222);
  assert.equal(payload.bot_username, 'FutbolChepicaBot');
  assert.equal(payload.bot_username_shape_ok, true);
  assert.equal(payload.bot_name, TARGET_BOT_NAME);
  assert.equal(payload.webhook_configured, true);
  assert.equal(payload.native_menu_configured, true);
  assert.equal(payload.default_commands_configured, true);
  console.log('PASS next runtime health contract');

  resetCalls();
  response = await worker.fetch(new Request('https://qa.invalid/health/telegram'), env, {});
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.bot_id, 111111);
  assert.equal(payload.bot_username, 'CUDODeportesBot');
  assert.equal(payload.webhook_configured, true);
  console.log('PASS primary bot remains untouched during blue green migration');

  const noNext = { ...env, TELEGRAM_BOT_TOKEN_NEXT: undefined };
  resetCalls();
  response = await worker.fetch(new Request('https://qa.invalid/health/telegram-next'), noNext, {});
  assert.equal(response.status, 503);
  payload = await response.json();
  assert.equal(payload.error, 'telegram_next_bot_token_missing');
  assert.equal(payload.bot_token_configured, false);
  assert.equal(calls.length, 0, 'dormant next slot must not call Telegram');
  console.log('PASS migration slot stays safely dormant without next token');

  console.log('RESULT: PASS');
  console.log('Human-only blocker: create the destination bot in @BotFather and store its token as TELEGRAM_BOT_TOKEN_NEXT.');
}

try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
  env.DB.close();
}
