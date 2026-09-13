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
const env = {
  DB: new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN: 'qa-old-token',
  TELEGRAM_BOT_TOKEN_NEXT: 'qa-new-token',
  TELEGRAM_WEBHOOK_SECRET: 'qa-shared-secret'
};

const calls = [];
let forceEditFailure = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  const oldPrefix = 'https://api.telegram.org/botqa-old-token/';
  const newPrefix = 'https://api.telegram.org/botqa-new-token/';
  const slot = target.startsWith(oldPrefix) ? 'primary' : target.startsWith(newPrefix) ? 'next' : null;
  if (!slot) throw new Error(`QA V3 harness blocked unexpected network call: ${target}`);
  const prefix = slot === 'primary' ? oldPrefix : newPrefix;
  const method = target.slice(prefix.length);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ slot, method, body });

  if (method === 'editMessageText' && forceEditFailure) {
    return new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: message can\'t be edited' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }

  let result = true;
  if (method === 'getMe') result = slot === 'primary'
    ? { id: 111111, is_bot: true, first_name: 'Fútbol Chépica', username: 'CUDODeportesBot' }
    : { id: 222222, is_bot: true, first_name: 'Fútbol Chépica', username: 'FutbolChepicaBot' };
  if (method === 'getMyName') result = { name: 'Fútbol Chépica' };
  if (method === 'getWebhookInfo') result = { url: slot === 'primary' ? 'https://qa.invalid/webhook/telegram' : 'https://qa.invalid/webhook/telegram-next', pending_update_count: 0 };
  if (method === 'getChatMenuButton') result = { type: 'commands' };
  if (method === 'getMyCommands') result = PUBLIC_NATIVE_COMMANDS;
  if (method === 'sendMessage' || method === 'editMessageText') result = { message_id: body.message_id || 9001, chat: { id: body.chat_id } };

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

async function seedDateTwo() {
  const now = '2026-09-10T12:30:00Z';
  for (const [series, home, away] of [['TERCERA', 2, 3], ['SEGUNDA', 1, 0], ['SENIOR', 0, 0], ['PRIMERA', 3, 0]]) {
    await env.DB.prepare(`INSERT OR REPLACE INTO match_series_results
      (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,created_at,updated_at)
      VALUES (?,?,?, ?,?,'VERIFIED','QA','Public UX V3',?,?)`)
      .bind(`QA-V3-A-F2-M2-${series}`, 'A-F2-M2', series, home, away, now, now).run();
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

let updateId = 880000;
const actor = { id: 9933001, first_name: 'QA', last_name: 'Público', username: 'qa_public_ux_v3' };
async function callback(pathname, secretSource, data, messageId = 4242) {
  const safe = await sha256Hex(secretSource);
  return worker.fetch(new Request(`https://qa.invalid${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': safe },
    body: JSON.stringify({
      update_id: ++updateId,
      callback_query: {
        id: `cb-${updateId}`,
        from: actor,
        data,
        message: { message_id: messageId, date: 1789000000, chat: { id: actor.id, type: 'private' } }
      }
    })
  }), env, {});
}

function reset() { calls.length = 0; forceEditFailure = false; }
function slotCalls(slot, method) { return calls.filter(x => x.slot === slot && (!method || x.method === method)); }
function lastCall(slot, method) { return slotCalls(slot, method).at(-1)?.body; }
function buttonData(message) { return (message?.reply_markup?.inline_keyboard || []).flat().map(x => x.callback_data).filter(Boolean); }
function buttonTexts(message) { return (message?.reply_markup?.inline_keyboard || []).flat().map(x => x.text).filter(Boolean); }

async function run() {
  console.log('TELEGRAM-PUBLIC-RESULTS-UX-V3');
  applyMigrations();
  await seedDateTwo();

  reset();
  let response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'tp:public-results', 5001);
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.handled, 'public_results_ux_v3_latest');
  assert.equal(payload.round_no, 2);
  assert.equal(slotCalls('next', 'sendMessage').length, 0);
  assert.equal(slotCalls('next', 'editMessageText').length, 1);
  let edited = lastCall('next', 'editMessageText');
  assert.equal(edited.message_id, 5001);
  assert.match(edited.text, /RESULTADOS OFICIALES · FECHA II/);
  assert.match(edited.text, /Elige un partido/);
  assert.ok(buttonTexts(edited).some(x => /Unión Orilla vs San Juan/.test(x)));
  assert.ok(buttonTexts(edited).every(x => !/4\/4/.test(x)));
  assert.ok(buttonData(edited).includes('p3:search'));
  assert.ok(buttonData(edited).includes('nav:back'));
  assert.ok(!buttonData(edited).includes('p3:public'));
  console.log('PASS entry goes directly to latest round and exposes canonical Back navigation');

  reset();
  response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'p3:m:2:UNION-ORILLA', 5001);
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'public_results_ux_v3_match');
  assert.equal(slotCalls('next', 'sendMessage').length, 0);
  edited = lastCall('next', 'editMessageText');
  assert.equal(edited.message_id, 5001);
  assert.match(edited.text, /Unión Orilla vs San Juan/);
  assert.match(edited.text, /3ª\s+2 — 3/);
  assert.match(edited.text, /2ª\s+1 — 0/);
  assert.match(edited.text, /Senior\s+0 — 0/);
  assert.match(edited.text, /1ª\s+3 — 0/);
  assert.match(edited.text, /✅ Oficial/);
  assert.ok(buttonData(edited).includes('p3:d:2'));
  assert.ok(buttonData(edited).includes('p3:search'));
  console.log('PASS match detail replaces the same panel with compact four-series score');

  reset();
  response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'p3:search', 5001);
  assert.equal(response.status, 200);
  edited = lastCall('next', 'editMessageText');
  assert.match(edited.text, /OTROS RESULTADOS/);
  const searchButtons = buttonData(edited);
  assert.deepEqual(searchButtons.slice(0, 4), ['p3:dates', 'p3:clubs', 'p3:series', 'p3:latest']);
  assert.equal(slotCalls('next', 'sendMessage').length, 0);
  console.log('PASS secondary filters are hidden behind one explicit search action');

  reset();
  response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'p3:public', 5001);
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'public_results_ux_v3_legacy_public_bridge');
  edited = lastCall('next', 'editMessageText');
  assert.match(edited.text, /vista antigua/);
  assert.ok(buttonData(edited).includes('nav:back'));
  assert.equal(slotCalls('next', 'sendMessage').length, 0);
  console.log('PASS historical p3:public is a compatibility bridge to canonical Back navigation');

  reset();
  response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'px:latest', 5001);
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'public_results_ux_latest');
  assert.equal(slotCalls('next', 'sendMessage').length, 1);
  assert.equal(slotCalls('next', 'editMessageText').length, 0);
  console.log('PASS historical V2 callback namespace remains compatible');

  reset();
  response = await callback('/webhook/telegram', env.TELEGRAM_WEBHOOK_SECRET, 'tp:public-results', 5001);
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.handled, 'portal_public_results');
  assert.match(lastCall('primary', 'sendMessage').text, /RESULTADOS REGISTRADOS/);
  assert.equal(slotCalls('next').length, 0);
  console.log('PASS primary rollback bot remains untouched');

  reset();
  response = await worker.fetch(new Request('https://qa.invalid/health/telegram-next'), env, {});
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.public_results_ux_version, '3');
  assert.equal(payload.bot_username, 'FutbolChepicaBot');
  console.log('PASS destination runtime advertises UX contract version 3');

  reset();
  forceEditFailure = true;
  response = await callback('/webhook/telegram-next', `${env.TELEGRAM_WEBHOOK_SECRET}:next`, 'p3:latest', 5002);
  assert.equal(response.status, 200);
  assert.equal(slotCalls('next', 'editMessageText').length, 1);
  assert.equal(slotCalls('next', 'sendMessage').length, 1);
  console.log('PASS exceptional edit failure has a functional sendMessage fallback');

  reset();
  const badSecret = await sha256Hex('wrong-secret');
  response = await worker.fetch(new Request('https://qa.invalid/webhook/telegram-next', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': badSecret },
    body: JSON.stringify({ update_id: ++updateId, callback_query: { id: `cb-${updateId}`, from: actor, data: 'p3:latest', message: { message_id: 5003, chat: { id: actor.id, type: 'private' } } } })
  }), env, {});
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
  console.log('PASS invalid webhook secret is rejected before Telegram or D1 side effects');

  console.log('RESULT: PASS');
  console.log('Human-only residual gate: visually validate that one Telegram panel mutates in place on @FutbolChepicaBot iOS.');
}

try { await run(); }
finally { globalThis.fetch = originalFetch; env.DB.close(); }
