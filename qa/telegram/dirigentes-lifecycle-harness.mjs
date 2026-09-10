import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { handleDirigentesLifecycleRequest } from '../../sports-bus/worker/dirigentes-lifecycle-entry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'sports-bus', 'migrations');

const env = {
  DB: new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN: 'qa-dirigentes-token',
  TELEGRAM_WEBHOOK_SECRET: 'qa-dirigentes-secret'
};

const telegramCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  const prefix = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/`;
  if (!target.startsWith(prefix)) throw new Error(`Unexpected network call: ${target}`);
  const method = target.slice(prefix.length);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  telegramCalls.push({ method, body });
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

function applyMigrations() {
  for (const file of fs.readdirSync(migrationsDir).filter(x => x.endsWith('.sql')).sort()) {
    env.DB.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

async function seed() {
  const now = '2026-09-10T15:00:00Z';
  await env.DB.prepare(`INSERT OR REPLACE INTO teams
    (team_id,canonical_name,group_id,active,created_at,updated_at)
    VALUES ('QA-CLUB','Club QA','A',1,?,?)`).bind(now, now).run();

  const reporters = [
    ['900001','Admin Global QA','globalqa',null,'SUPER_ADMIN','VERIFIED',1],
    ['900002','Dirigente QA','clubqa','QA-CLUB','CLUB_ADMIN','VERIFIED',1],
    ['900003','Segundo Global','global2',null,'SUPER_ADMIN','VERIFIED',1],
    ['900004','Usuario QA','normalqa',null,'REPORTER','PROVISIONAL',1]
  ];
  for (const row of reporters) {
    await env.DB.prepare(`INSERT OR REPLACE INTO reporters
      (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(...row, now, now).run();
  }
}

function messageUpdate(actorId, text) {
  return {
    update_id: Date.now(),
    message: {
      message_id: 100,
      from: { id: Number(actorId), first_name: 'QA' },
      chat: { id: Number(actorId), type: 'private' },
      text
    }
  };
}

function callbackUpdate(actorId, data) {
  return {
    update_id: Date.now(),
    callback_query: {
      id: `cb-${Math.random()}`,
      from: { id: Number(actorId), first_name: 'QA' },
      data,
      message: {
        message_id: 101,
        chat: { id: Number(actorId), type: 'private' }
      }
    }
  };
}

async function invoke(update) {
  const response = await handleDirigentesLifecycleRequest(new Request('https://qa.invalid/webhook/telegram', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET
    },
    body: JSON.stringify(update)
  }), env);
  assert.ok(response, 'handler should claim lifecycle request');
  assert.equal(response.status, 200);
  return response.json();
}

async function reporter(id) {
  return env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(String(id)).first();
}

async function countAudit(action, targetId) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM permission_audit WHERE action=? AND resource_id=?')
    .bind(action, String(targetId)).first();
  return Number(row?.n || 0);
}

async function countEvent(type, targetId) {
  const q = await env.DB.prepare('SELECT payload_json FROM events WHERE event_type=?').bind(type).all();
  return (q.results || []).filter(x => {
    try { return JSON.parse(x.payload_json).target_telegram_user_id === String(targetId); }
    catch { return false; }
  }).length;
}

function lastMessageTo(chatId) {
  return telegramCalls.filter(x => x.method === 'sendMessage' && String(x.body.chat_id) === String(chatId)).at(-1)?.body;
}

async function run() {
  applyMigrations();
  await seed();

  // 1) SUPER_ADMIN can enter the global lifecycle surface and list CLUB_ADMIN.
  let payload = await invoke(messageUpdate('900001', '/dirigentes'));
  assert.equal(payload.handled, 'global_admin_menu');
  assert.match(lastMessageTo('900001').text, /ADMIN GLOBAL/);

  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admins'));
  assert.equal(payload.handled, 'club_admin_list');
  const listView = lastMessageTo('900001');
  assert.match(listView.text, /1 registro\(s\)/);
  const listButtons = listView.reply_markup.inline_keyboard.flat();
  assert.ok(listButtons.some(x => /Club QA · Dirigente QA/.test(x.text) && x.callback_data === 'tp:admin:900002'));

  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admin:900002'));
  assert.equal(payload.handled, 'club_admin_detail');
  const detail = lastMessageTo('900001');
  assert.match(detail.text, /Nombre: Dirigente QA/);
  assert.match(detail.text, /Estado: ✅ ACTIVO/);
  assert.ok(detail.reply_markup.inline_keyboard.flat().some(x => x.callback_data === 'tp:admin-suspend:900002'));

  // 2) Suspend: state changes, audit/event are written and target is notified.
  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admin-suspend:900002'));
  assert.equal(payload.handled, 'club_admin_suspended');
  let target = await reporter('900002');
  assert.equal(target.role, 'CLUB_ADMIN');
  assert.equal(target.active, 0);
  assert.equal(target.club_id, 'QA-CLUB');
  assert.equal(target.trust_level, 'VERIFIED');
  assert.equal(await countAudit('SUSPEND_CLUB_ADMIN', '900002'), 1);
  assert.equal(await countEvent('telegram.club_admin.suspended', '900002'), 1);
  assert.match(lastMessageTo('900002').text, /acceso de dirigente fue suspendido/i);

  // Repeating suspend is functional idempotence: no second transition/audit/event.
  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admin-suspend:900002'));
  assert.equal(payload.handled, 'club_admin_already_suspended');
  assert.equal(await countAudit('SUSPEND_CLUB_ADMIN', '900002'), 1);
  assert.equal(await countEvent('telegram.club_admin.suspended', '900002'), 1);

  // 3) Reactivate: restores same role/club and writes one transition.
  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admin-reactivate:900002'));
  assert.equal(payload.handled, 'club_admin_reactivated');
  target = await reporter('900002');
  assert.equal(target.role, 'CLUB_ADMIN');
  assert.equal(target.active, 1);
  assert.equal(target.club_id, 'QA-CLUB');
  assert.equal(target.trust_level, 'VERIFIED');
  assert.equal(await countAudit('REACTIVATE_CLUB_ADMIN', '900002'), 1);
  assert.equal(await countEvent('telegram.club_admin.reactivated', '900002'), 1);

  payload = await invoke(callbackUpdate('900001', 'tp:admin-reactivate:900002'));
  assert.equal(payload.handled, 'club_admin_already_active');
  assert.equal(await countAudit('REACTIVATE_CLUB_ADMIN', '900002'), 1);

  // 4) Revoke requires confirmation and preserves identity/history instead of DELETE.
  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admin-revoke-confirm:900002'));
  assert.equal(payload.handled, 'club_admin_revoke_confirmation');
  target = await reporter('900002');
  assert.equal(target.role, 'CLUB_ADMIN', 'confirmation must not mutate state');
  assert.ok(lastMessageTo('900001').reply_markup.inline_keyboard.flat().some(x => x.callback_data === 'tp:admin-revoke:900002'));

  telegramCalls.length = 0;
  payload = await invoke(callbackUpdate('900001', 'tp:admin-revoke:900002'));
  assert.equal(payload.handled, 'club_admin_revoked');
  target = await reporter('900002');
  assert.ok(target, 'identity row must be preserved');
  assert.equal(target.role, 'REPORTER');
  assert.equal(target.active, 1);
  assert.equal(target.club_id, null);
  assert.equal(target.trust_level, 'PROVISIONAL');
  assert.equal(await countAudit('REVOKE_CLUB_ADMIN', '900002'), 1);
  assert.equal(await countEvent('telegram.club_admin.revoked', '900002'), 1);
  assert.match(lastMessageTo('900002').text, /acceso de dirigente fue revocado/i);

  payload = await invoke(callbackUpdate('900001', 'tp:admin-revoke:900002'));
  assert.equal(payload.handled, 'club_admin_already_revoked');
  assert.equal(await countAudit('REVOKE_CLUB_ADMIN', '900002'), 1);

  // 5) A crafted callback cannot target another SUPER_ADMIN.
  const protectedGlobalBefore = await reporter('900003');
  payload = await invoke(callbackUpdate('900001', 'tp:admin-suspend:900003'));
  assert.equal(payload.handled, 'club_admin_not_found');
  const protectedGlobalAfter = await reporter('900003');
  assert.equal(protectedGlobalAfter.role, protectedGlobalBefore.role);
  assert.equal(protectedGlobalAfter.active, protectedGlobalBefore.active);
  assert.equal(await countAudit('SUSPEND_CLUB_ADMIN', '900003'), 0);

  // 6) Non-global identities cannot mutate another dirigente.
  await env.DB.prepare("UPDATE reporters SET role='CLUB_ADMIN',trust_level='VERIFIED',active=1,club_id='QA-CLUB' WHERE telegram_user_id='900002'").run();
  payload = await invoke(callbackUpdate('900004', 'tp:admin-suspend:900002'));
  assert.equal(payload.handled, 'dirigentes_lifecycle_denied');
  target = await reporter('900002');
  assert.equal(target.active, 1);
  assert.equal(await countAudit('SUSPEND_CLUB_ADMIN', '900002'), 1, 'only the earlier authorized suspend exists');

  console.log('PASS list and detail expose CLUB_ADMIN lifecycle to SUPER_ADMIN');
  console.log('PASS suspend/reactivate/revoke transitions preserve identity and audit history');
  console.log('PASS repeated transitions are functionally idempotent');
  console.log('PASS crafted callbacks cannot mutate SUPER_ADMIN identities');
  console.log('PASS non-global identities cannot mutate dirigentes');
  console.log('RESULT: PASS');
}

try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
  env.DB.close();
}
