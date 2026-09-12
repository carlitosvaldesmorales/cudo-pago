import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/telegram-route-clarity-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { PUBLIC_NATIVE_COMMANDS } from '../../sports-bus/worker/telegram-native-menu-entry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'sports-bus', 'migrations');
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
  if (!slot) throw new Error(`QA route clarity blocked unexpected network call: ${target}`);
  const prefix = slot === 'primary' ? oldPrefix : newPrefix;
  const method = target.slice(prefix.length);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ slot, method, body });

  // Fuerza fallback sendMessage para poder inspeccionar el render final en ambos slots.
  if (method === 'editMessageText') {
    return new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: message can't be edited" }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  let result = true;
  if (method === 'getMe') result = slot === 'primary'
    ? { id: 111111, is_bot: true, first_name: 'Fútbol Chépica', username: 'CUDODeportesBot' }
    : { id: 222222, is_bot: true, first_name: 'Fútbol Chépica', username: 'FutbolChepicaBot' };
  if (method === 'getMyName') result = { name: 'Fútbol Chépica' };
  if (method === 'getWebhookInfo') result = { url: slot === 'primary' ? 'https://qa.invalid/webhook/telegram' : 'https://qa.invalid/webhook/telegram-next', pending_update_count: 0 };
  if (method === 'getChatMenuButton') result = { type: 'commands' };
  if (method === 'getMyCommands') result = PUBLIC_NATIVE_COMMANDS;
  if (method === 'sendMessage') result = { message_id: 9901, chat: { id: body.chat_id } };
  return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};

function applyMigrations() {
  for (const file of fs.readdirSync(migrationsDir).filter(x => x.endsWith('.sql')).sort()) {
    env.DB.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

async function seedDateTwo() {
  const now = '2026-09-10T12:30:00Z';
  for (const [series, home, away] of [['TERCERA', 2, 3], ['SEGUNDA', 1, 0], ['SENIOR', 0, 0], ['PRIMERA', 3, 0]]) {
    await env.DB.prepare(`INSERT OR REPLACE INTO match_series_results
      (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,created_at,updated_at)
      VALUES (?,?,?,?,?,'VERIFIED','QA','Route clarity',?,?)`)
      .bind(`QA-ROUTE-A-F2-M2-${series}`, 'A-F2-M2', series, home, away, now, now).run();
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

const actor = { id: 9944001, first_name: 'QA', last_name: 'Ruta', username: 'qa_route' };
let updateId = 910000;

async function command(pathname, secretSource, text) {
  const safe = await sha256Hex(secretSource);
  return worker.fetch(new Request(`https://qa.invalid${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': safe },
    body: JSON.stringify({ update_id: ++updateId, message: { message_id: updateId, from: actor, chat: { id: actor.id, type: 'private' }, text } })
  }), env, {});
}

async function callback(pathname, secretSource, data) {
  const safe = await sha256Hex(secretSource);
  return worker.fetch(new Request(`https://qa.invalid${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': safe },
    body: JSON.stringify({
      update_id: ++updateId,
      callback_query: {
        id: `cb-${updateId}`,
        from: actor,
        message: { message_id: updateId, chat: { id: actor.id, type: 'private' } },
        data
      }
    })
  }), env, {});
}

function reset() { calls.length = 0; }
function lastSend(slot) { return calls.filter(x => x.slot === slot && x.method === 'sendMessage').at(-1)?.body; }

function assertApprovedMatrix(slot) {
  const out = lastSend(slot);
  assert.ok(out);
  assert.equal(out.parse_mode, 'HTML');
  assert.match(out.text, /RESULTADOS OFICIALES/);
  assert.match(out.text, /FECHA II/);
  assert.match(out.text, /FECHA I/);
  assert.match(out.text, /Unión Orilla — San Juan/);
  assert.match(out.text, /Santa Elena La Ruda — Unión Orilla/);
  assert.match(out.text, /<code>3ª\s+2–3\s+2ª\s+1–0<\/code>\n<code>S\s+0–0\s+1ª\s+3–0<\/code>/);
  assert.doesNotMatch(out.text, /<pre>/);
  assert.doesNotMatch(out.text, /RESULTADOS REGISTRADOS/);
  const callbacks = (out.reply_markup?.inline_keyboard || []).flat().map(x => x.callback_data);
  assert.deepEqual(callbacks, ['p3:search', 'p3:public']);
}

async function run() {
  applyMigrations();
  await seedDateTwo();

  reset();
  let response = await command('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, '/resultados');
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.handled, 'public_results_table_all');
  assert.equal(payload.round_count, 2);
  assert.equal(payload.match_count, 6);
  assertApprovedMatrix('next');
  assert.equal(calls.filter(x => x.slot === 'primary').length, 0);
  console.log('PASS next /resultados uses approved public matrix');

  reset();
  response = await command('/webhook/telegram', env.TELEGRAM_WEBHOOK_SECRET, '/resultados');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'public_results_table_all');
  assert.equal(payload.round_count, 2);
  assert.equal(payload.match_count, 6);
  assertApprovedMatrix('primary');
  assert.equal(calls.filter(x => x.slot === 'next').length, 0);
  console.log('PASS primary /resultados uses the same approved public matrix');

  reset();
  response = await callback('/webhook/telegram', env.TELEGRAM_WEBHOOK_SECRET, 'p3:search');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'public_results_ux_v3_search');
  const search = lastSend('primary');
  assert.ok(search);
  assert.match(search.text, /OTROS RESULTADOS/);
  const searchCallbacks = (search.reply_markup?.inline_keyboard || []).flat().map(x => x.callback_data);
  assert.deepEqual(searchCallbacks, ['p3:dates', 'p3:clubs', 'p3:series', 'p3:latest']);
  assert.equal(calls.filter(x => x.slot === 'next').length, 0);
  console.log('PASS secondary search navigation works on primary without changing semantics');

  reset();
  response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'p3:search');
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'public_results_ux_v3_search');
  assert.match(lastSend('next').text, /OTROS RESULTADOS/);
  assert.equal(calls.filter(x => x.slot === 'primary').length, 0);
  console.log('PASS secondary search navigation works on next');

  console.log('PASS bot/slot no longer changes RESULTS-READ semantics');
  console.log('RESULT: PASS');
}

try { await run(); }
finally { globalThis.fetch = originalFetch; env.DB.close(); }
