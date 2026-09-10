import worker from './telegram-migration-entry.js';
import { handlePublicResultsTableView } from './worker/public-results-table-view.js';
import { handleResultGovernanceUxRequest } from './worker/result-governance-ux-entry.js';
import { handleResultCorrectionFlow } from './worker/result-correction-flow-entry.js';
import { handleResultGovernanceScopeRequest } from './worker/result-governance-scope-entry.js';
import { handlePublicResultGovernanceStatus } from './worker/public-result-governance-status-entry.js';

const NEXT_WEBHOOK_PATH = '/webhook/telegram-next';
const PRIMARY_WEBHOOK_PATH = '/webhook/telegram';

async function deriveTelegramSafeSecret(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function releaseCorrectionSessionForCommand(request, env) {
  const url = new URL(request.url);
  if (![PRIMARY_WEBHOOK_PATH, NEXT_WEBHOOK_PATH].includes(url.pathname) || request.method !== 'POST' || !env.DB) return false;

  let update;
  try {
    update = await request.clone().json();
  } catch {
    return false;
  }

  const message = update?.message;
  const text = String(message?.text || '').trim();
  if (!message?.from?.id || !/^\/[A-Za-z0-9_]+(?:@\w+)?(?:\s|$)/.test(text)) return false;

  const rootSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!rootSecret) return false;
  const secretSource = url.pathname === NEXT_WEBHOOK_PATH ? `${rootSecret}:next` : rootSecret;
  const expected = await deriveTelegramSafeSecret(secretSource);
  const supplied = request.headers.get('x-telegram-bot-api-secret-token');
  if (supplied !== expected) return false;

  // A Telegram command is an explicit navigation intent. It must never be
  // consumed as the score/reason text of a pending correction. Releasing the
  // session here lets the normal command router continue with the same update.
  try {
    await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?')
      .bind(String(message.from.id)).run();
    return true;
  } catch {
    // Do not block unrelated Telegram commands if the session store is
    // temporarily unavailable; downstream handlers keep their normal behavior.
    return false;
  }
}

async function blockLegacyMatchResultCommand(request, env) {
  const url = new URL(request.url);
  if (![PRIMARY_WEBHOOK_PATH, NEXT_WEBHOOK_PATH].includes(url.pathname) || request.method !== 'POST') return null;

  let update;
  try {
    update = await request.clone().json();
  } catch {
    return null;
  }

  const message = update?.message;
  const text = String(message?.text || '').trim();
  if (!message?.from?.id || !message?.chat?.id || !/^\/resultado\b/i.test(text)) return null;

  const rootSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!rootSecret) return null;
  const secretSource = url.pathname === NEXT_WEBHOOK_PATH ? `${rootSecret}:next` : rootSecret;
  const expected = await deriveTelegramSafeSecret(secretSource);
  const supplied = request.headers.get('x-telegram-bot-api-secret-token');
  if (supplied !== expected) return null;

  const token = url.pathname === NEXT_WEBHOOK_PATH ? env.TELEGRAM_BOT_TOKEN_NEXT : env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const body = {
    chat_id: message.chat.id,
    text: '⚠️ Ese comando antiguo ya no modifica resultados.\n\nLos resultados oficiales se administran por serie desde Dirigentes → Mis partidos.\nPara corregir un resultado ya oficial usa /correcciones.\n\nNo se modificó ningún marcador.'
  };
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  return new Response(JSON.stringify({ ok: true, handled: 'legacy_match_result_command_blocked' }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

async function normalizeDestinationResultsCommand(request) {
  const url = new URL(request.url);
  if (url.pathname !== NEXT_WEBHOOK_PATH || request.method !== 'POST') return request;

  let update;
  try {
    update = await request.clone().json();
  } catch {
    return request;
  }

  const message = update?.message;
  const text = String(message?.text || '').trim();
  if (!message?.from?.id || !message?.chat?.id || !/^\/resultados(?:@\w+)?$/i.test(text)) {
    return request;
  }

  // On the destination bot, /resultados means the public results view.
  // The administrative registry remains available from the explicit
  // "Resultados registrados" button inside the dirigente/admin portal.
  const normalized = {
    ...update,
    callback_query: {
      from: message.from,
      message,
      data: 'tp:public-results'
    }
  };

  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: JSON.stringify(normalized)
  });
}

export default {
  async fetch(request, env, ctx) {
    // Commands are navigation. Never let a stale correction session trap a
    // user by interpreting /correcciones, /start, /menu, etc. as free text.
    await releaseCorrectionSessionForCommand(request, env);

    const legacyBlocked = await blockLegacyMatchResultCommand(request, env);
    if (legacyBlocked) return legacyBlocked;

    // Correction is a governed mutation flow. Handle it before the read-only
    // governance UX and before the legacy core so retries cannot duplicate prompts.
    const correctionFlow = await handleResultCorrectionFlow(request.clone(), env);
    if (correctionFlow) return correctionFlow;

    // Scope the normal governance list away from the isolated QA fixture and
    // expose /correccionesqa only to the global administrator.
    const governanceScope = await handleResultGovernanceScopeRequest(request.clone(), env);
    if (governanceScope) return governanceScope;

    const governanceUx = await handleResultGovernanceUxRequest(request.clone(), env);
    if (governanceUx) return governanceUx;

    // Public contribution screens must respect the same governance state as the
    // public SSOT: only VERIFIED is official. DISPUTED/ANNULLED are never rendered
    // as official scores and cannot be replaced from the public contribution flow.
    const publicGovernanceStatus = await handlePublicResultGovernanceStatus(request.clone(), env);
    if (publicGovernanceStatus) return publicGovernanceStatus;

    const normalized = await normalizeDestinationResultsCommand(request);
    const allResults = await handlePublicResultsTableView(normalized.clone(), env);
    if (allResults) return allResults;
    return worker.fetch(normalized, env, ctx);
  }
};
