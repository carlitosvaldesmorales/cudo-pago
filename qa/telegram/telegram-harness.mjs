import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../sports-bus/cors-entry.js';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'sports-bus', 'migrations');

const QA = {
  SUPER: { id: '9900001', first_name: 'QA', last_name: 'Global', username: 'qa_global' },
  USER: { id: '9900002', first_name: 'QA', last_name: 'Dirigente', username: 'qa_dirigente' },
  OUTSIDER: { id: '9900003', first_name: 'QA', last_name: 'Externo', username: 'qa_externo' }
};

const env = {
  DB: new D1SqliteAdapter(),
  TELEGRAM_BOT_TOKEN: 'qa-token-never-sent',
  TELEGRAM_WEBHOOK_SECRET: 'qa-webhook-secret'
};

const outbound = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init={}) => {
  const target = String(url);
  if (!target.startsWith('https://api.telegram.org/botqa-token-never-sent/')) {
    throw new Error(`QA harness blocked unexpected network call: ${target}`);
  }
  const method = target.split('/').pop();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  outbound.push({ method, body });
  return new Response(JSON.stringify({ ok: true, result: { message_id: outbound.length } }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

function applyMigrations() {
  const files = fs.readdirSync(migrationsDir).filter(x => x.endsWith('.sql')).sort();
  assert.ok(files.length >= 7, 'Expected the real migration set');
  for (const file of files) {
    env.DB.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

let updateId = 700000;
async function dispatch(update) {
  const safeSecret = await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET);
  const request = new Request('https://qa.invalid/webhook/telegram', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': safeSecret
    },
    body: JSON.stringify({ update_id: ++updateId, ...update })
  });
  const response = await worker.fetch(request, env, {});
  assert.equal(response.status, 200, `Worker response must be 200 for QA update ${updateId}`);
  return response.json();
}

async function message(actor, text) {
  return dispatch({
    message: {
      message_id: updateId,
      from: actor,
      chat: { id: Number(actor.id), type: 'private' },
      text
    }
  });
}

async function callback(actor, data) {
  return dispatch({
    callback_query: {
      id: `cb-${updateId + 1}`,
      from: actor,
      data,
      message: {
        message_id: updateId,
        chat: { id: Number(actor.id), type: 'private' }
      }
    }
  });
}

function sentMessages(chatId=null) {
  return outbound.filter(x => x.method === 'sendMessage' && (chatId === null || String(x.body.chat_id) === String(chatId)));
}

function lastMessage(chatId) {
  const items = sentMessages(chatId);
  assert.ok(items.length, `Expected at least one Telegram message for ${chatId}`);
  return items.at(-1).body;
}

function resetOutbound() {
  outbound.length = 0;
}

async function one(sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}

async function all(sql, ...params) {
  return (await env.DB.prepare(sql).bind(...params).all()).results;
}

async function seedSuperAdmin() {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT OR REPLACE INTO reporters
      (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,'UNION-ORILLA','SUPER_ADMIN','VERIFIED',1,?,?)
  `).bind(QA.SUPER.id,'QA Global',QA.SUPER.username,now,now).run();
}

function buttonTexts(messageBody) {
  return (messageBody.reply_markup?.inline_keyboard || []).flat().map(x => x.text);
}

function callbackData(messageBody) {
  return (messageBody.reply_markup?.inline_keyboard || []).flat().map(x => x.callback_data).filter(Boolean);
}

async function assertNoPendingFor(userId) {
  const row = await one("SELECT COUNT(*) AS n FROM access_requests WHERE telegram_user_id=? AND status='PENDING'", userId);
  assert.equal(Number(row.n), 0);
}

async function run() {
  console.log('TELEGRAM-QA-HARNESS-01');
  console.log('Mode: simulated Telegram + real Worker routing + SQLite D1 adapter');

  applyMigrations();
  await seedSuperAdmin();

  const teams = await all('SELECT team_id,canonical_name FROM teams ORDER BY canonical_name');
  assert.ok(teams.length >= 11, 'Expected multi-club fixture data');
  assert.ok(teams.some(x => x.team_id === 'UNION-ORILLA'), 'UNION-ORILLA must exist');
  console.log(`PASS fixture: ${teams.length} teams`);

  resetOutbound();
  let result = await message(QA.USER, '/start');
  assert.equal(result.handled, 'portal_home');
  let m = lastMessage(QA.USER.id);
  assert.match(m.text, /FÚTBOL CHÉPICA/);
  assert.deepEqual(buttonTexts(m), ['🌐 Público','🔐 Dirigentes']);
  console.log('PASS public portal entry');

  resetOutbound();
  result = await callback(QA.USER, 'tp:leaders');
  assert.equal(result.handled, 'portal_leaders');
  m = lastMessage(QA.USER.id);
  assert.match(m.text, /todavía no tiene permisos administrativos/);
  assert.ok(callbackData(m).includes('tp:req'));
  console.log('PASS unprivileged leader portal');

  resetOutbound();
  result = await callback(QA.USER, 'tp:req');
  assert.equal(result.handled, 'portal_request_choose_club');
  m = lastMessage(QA.USER.id);
  assert.ok(callbackData(m).includes('tp:reqclub:UNION-ORILLA'));

  result = await callback(QA.USER, 'tp:reqclub:UNION-ORILLA');
  assert.equal(result.handled, 'portal_request_created');
  let pending = await one("SELECT * FROM access_requests WHERE telegram_user_id=? AND status='PENDING'", QA.USER.id);
  assert.ok(pending?.request_id);
  assert.equal(pending.requested_club_id, 'UNION-ORILLA');

  await callback(QA.USER, 'tp:reqclub:UNION-ORILLA');
  const pendingCount = await one("SELECT COUNT(*) AS n FROM access_requests WHERE telegram_user_id=? AND status='PENDING'", QA.USER.id);
  assert.equal(Number(pendingCount.n), 1, 'Retry must not duplicate pending enrollment');
  console.log('PASS enrollment idempotence');

  resetOutbound();
  result = await callback(QA.OUTSIDER, `tp:admin-suspend:${QA.USER.id}`);
  assert.equal(result.handled, 'dirigentes_lifecycle_denied');
  assert.match(lastMessage(QA.OUTSIDER.id).text, /Sólo un administrador global/);
  console.log('PASS lifecycle authorization');

  resetOutbound();
  result = await callback(QA.SUPER, 'tp:leaders');
  assert.equal(result.handled, 'public_result_admin_dashboard');
  m = lastMessage(QA.SUPER.id);
  assert.match(m.text, /ADMIN GLOBAL/);
  assert.ok(buttonTexts(m).some(x => x.startsWith('👥 Dirigentes')));
  assert.ok(buttonTexts(m).some(x => x.includes('Solicitudes')));

  await callback(QA.SUPER, 'tp:requests');
  m = lastMessage(QA.SUPER.id);
  assert.ok(callbackData(m).includes(`tp:review:${pending.request_id}`));

  await callback(QA.SUPER, `tp:review:${pending.request_id}`);
  m = lastMessage(QA.SUPER.id);
  assert.ok(callbackData(m).includes(`tp:approve:${pending.request_id}`));

  result = await callback(QA.SUPER, `tp:approve:${pending.request_id}`);
  assert.equal(result.handled, 'portal_request_approved');
  let reporter = await one('SELECT * FROM reporters WHERE telegram_user_id=?', QA.USER.id);
  assert.equal(reporter.role, 'CLUB_ADMIN');
  assert.equal(reporter.trust_level, 'VERIFIED');
  assert.equal(Number(reporter.active), 1);
  assert.equal(reporter.club_id, 'UNION-ORILLA');
  const approved = await one('SELECT status FROM access_requests WHERE request_id=?', pending.request_id);
  assert.equal(approved.status, 'APPROVED');
  assert.ok(sentMessages(QA.USER.id).some(x => /acceso de dirigente fue aprobado/.test(x.body.text)));
  console.log('PASS SUPER_ADMIN approval -> CLUB_ADMIN');

  resetOutbound();
  result = await callback(QA.USER, 'tp:leaders');
  assert.equal(result.handled, 'public_result_admin_dashboard');
  assert.match(lastMessage(QA.USER.id).text, /Administrador del club/);

  result = await callback(QA.USER, 'tp:mymatches');
  assert.equal(result.handled, 'portal_my_matches');
  m = lastMessage(QA.USER.id);
  const visibleButtons = buttonTexts(m).filter(x => x.includes('Fecha'));
  const scoped = await all("SELECT match_id,round_no,home_id,away_id FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND (home_id='UNION-ORILLA' OR away_id='UNION-ORILLA') ORDER BY round_no,match_id");
  assert.equal(visibleButtons.length, scoped.length, 'UI match count must equal DB club scope');
  assert.ok(scoped.length > 0);
  console.log(`PASS club scope: ${scoped.length} matches visible`);

  const firstMatch = scoped[0];
  resetOutbound();
  await callback(QA.USER, `rs:date:${firstMatch.round_no}`);
  await callback(QA.USER, `rs:match:${firstMatch.match_id}`);
  await callback(QA.USER, `rs:series:${firstMatch.match_id}:TERCERA`);
  let session = await one('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?', QA.USER.id);
  assert.equal(session.series_code, 'TERCERA');

  result = await message(QA.USER, '2-1');
  assert.equal(result.handled, 'club_admin_series_verified');
  const verified = await one('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?', firstMatch.match_id, 'TERCERA');
  assert.equal(verified.validation_status, 'VERIFIED');
  assert.equal(verified.source_type, 'TELEGRAM_CLUB_ADMIN');
  assert.equal(Number(verified.home_score), 2);
  assert.equal(Number(verified.away_score), 1);
  assert.ok(sentMessages(QA.USER.id).some(x => /Resultado VERIFICADO/.test(x.body.text)));
  console.log('PASS CLUB_ADMIN direct VERIFIED result (QA DB only)');

  resetOutbound();
  await callback(QA.USER, `rs:series:${firstMatch.match_id}:SEGUNDA`);
  session = await one('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?', QA.USER.id);
  assert.equal(session.series_code, 'SEGUNDA');

  result = await callback(QA.SUPER, `tp:admin-suspend:${QA.USER.id}`);
  assert.equal(result.handled, 'club_admin_suspended');
  reporter = await one('SELECT * FROM reporters WHERE telegram_user_id=?', QA.USER.id);
  assert.equal(Number(reporter.active), 0);
  session = await one('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?', QA.USER.id);
  assert.equal(session, null, 'Suspension must delete open score session');

  await callback(QA.SUPER, `tp:admin-suspend:${QA.USER.id}`);
  const suspendAudits = await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='SUSPEND_CLUB_ADMIN' AND resource_id=?", QA.USER.id);
  assert.equal(Number(suspendAudits.n), 1, 'Repeated suspend must be idempotent');
  console.log('PASS suspend + session invalidation + idempotence');

  await assertNoPendingFor(QA.USER.id);
  resetOutbound();
  result = await callback(QA.USER, 'tp:req');
  assert.equal(result.handled, 'suspended_club_admin_guard');
  assert.match(lastMessage(QA.USER.id).text, /ACCESO DE DIRIGENTE SUSPENDIDO/);
  await assertNoPendingFor(QA.USER.id);

  resetOutbound();
  result = await callback(QA.USER, `rs:date:${firstMatch.round_no}`);
  assert.equal(result.handled, 'club_scope_denied');
  assert.match(lastMessage(QA.USER.id).text, /no está habilitada como administrador verificado/);
  console.log('PASS suspended guard + stale callback denial');

  resetOutbound();
  result = await callback(QA.SUPER, `tp:admin-reactivate:${QA.USER.id}`);
  assert.equal(result.handled, 'club_admin_reactivated');
  reporter = await one('SELECT * FROM reporters WHERE telegram_user_id=?', QA.USER.id);
  assert.equal(reporter.role, 'CLUB_ADMIN');
  assert.equal(reporter.club_id, 'UNION-ORILLA');
  assert.equal(reporter.trust_level, 'VERIFIED');
  assert.equal(Number(reporter.active), 1);

  await callback(QA.SUPER, `tp:admin-reactivate:${QA.USER.id}`);
  const reactivateAudits = await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='REACTIVATE_CLUB_ADMIN' AND resource_id=?", QA.USER.id);
  assert.equal(Number(reactivateAudits.n), 1, 'Repeated reactivate must be idempotent');

  resetOutbound();
  result = await callback(QA.USER, 'tp:leaders');
  assert.equal(result.handled, 'public_result_admin_dashboard');
  assert.match(lastMessage(QA.USER.id).text, /Administrador del club/);
  console.log('PASS reactivate + role restoration + idempotence');

  resetOutbound();
  result = await callback(QA.SUPER, `tp:admin-revoke-confirm:${QA.USER.id}`);
  assert.equal(result.handled, 'club_admin_revoke_confirmation');
  assert.ok(callbackData(lastMessage(QA.SUPER.id)).includes(`tp:admin-revoke:${QA.USER.id}`));

  result = await callback(QA.SUPER, `tp:admin-revoke:${QA.USER.id}`);
  assert.equal(result.handled, 'club_admin_revoked');
  reporter = await one('SELECT * FROM reporters WHERE telegram_user_id=?', QA.USER.id);
  assert.ok(reporter, 'Revocation must not delete reporter identity');
  assert.equal(reporter.role, 'REPORTER');
  assert.equal(reporter.trust_level, 'PROVISIONAL');
  assert.equal(Number(reporter.active), 1);
  assert.equal(reporter.club_id, null);
  const revokeAudit = await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='REVOKE_CLUB_ADMIN' AND resource_id=?", QA.USER.id);
  assert.equal(Number(revokeAudit.n), 1);

  await callback(QA.SUPER, `tp:admin-revoke:${QA.USER.id}`);
  const revokeAuditAfterRetry = await one("SELECT COUNT(*) AS n FROM permission_audit WHERE action='REVOKE_CLUB_ADMIN' AND resource_id=?", QA.USER.id);
  assert.equal(Number(revokeAuditAfterRetry.n), 1, 'Repeated revoke must be idempotent');
  console.log('PASS revoke preserves identity + audit + idempotence');

  resetOutbound();
  result = await callback(QA.USER, `rs:date:${firstMatch.round_no}`);
  assert.equal(result.handled, 'club_scope_denied');

  resetOutbound();
  result = await callback(QA.USER, 'tp:req');
  assert.equal(result.handled, 'portal_request_choose_club');
  assert.ok(callbackData(lastMessage(QA.USER.id)).some(x => x.startsWith('tp:reqclub:')));
  console.log('PASS revoked user can re-enroll but cannot use old admin callbacks');

  const audit = await all("SELECT action,resource_id,allowed FROM permission_audit WHERE resource_id=? ORDER BY created_at", QA.USER.id);
  const actions = new Set(audit.map(x => x.action));
  for (const expected of ['SUSPEND_CLUB_ADMIN','REACTIVATE_CLUB_ADMIN','REVOKE_CLUB_ADMIN']) assert.ok(actions.has(expected));
  assert.ok(audit.every(x => Number(x.allowed) === 1));
  console.log('PASS lifecycle audit coverage');

  console.log('RESULT: PASS');
  console.log('Human-only residual gate: real Telegram delivery/rendering and visual interaction in an authenticated Telegram client.');
}

try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
  env.DB.close();
}
