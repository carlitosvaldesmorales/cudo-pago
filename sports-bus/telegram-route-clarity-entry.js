import worker from './telegram-migration-entry.js';
import { handlePublicResultsTableView } from './worker/public-results-table-view.js';
import { handleResultGovernanceUxRequest } from './worker/result-governance-ux-entry.js';
import { handleResultCorrectionFlow } from './worker/result-correction-flow-entry.js';
import { handleResultGovernanceScopeRequest } from './worker/result-governance-scope-entry.js';
import { handlePublicResultGovernanceStatus } from './worker/public-result-governance-status-entry.js';
import { handlePublicChampionshipRequest } from './worker/public-championship-entry.js';

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

  try {
    await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?')
      .bind(String(message.from.id)).run();
    return true;
  } catch {
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
    // Public web read model is deliberately separated from Telegram. It projects
    // only governed public data and never exposes actor/audit/source internals.
    const publicChampionship = await handlePublicChampionshipRequest(request.clone(), env);
    if (publicChampionship) return publicChampionship;

    await releaseCorrectionSessionForCommand(request, env);

    const legacyBlocked = await blockLegacyMatchResultCommand(request, env);
    if (legacyBlocked) return legacyBlocked;

    const correctionFlow = await handleResultCorrectionFlow(request.clone(), env);
    if (correctionFlow) return correctionFlow;

    const governanceScope = await handleResultGovernanceScopeRequest(request.clone(), env);
    if (governanceScope) return governanceScope;

    const governanceUx = await handleResultGovernanceUxRequest(request.clone(), env);
    if (governanceUx) return governanceUx;

    const publicGovernanceStatus = await handlePublicResultGovernanceStatus(request.clone(), env);
    if (publicGovernanceStatus) return publicGovernanceStatus;

    const normalized = await normalizeDestinationResultsCommand(request);
    const allResults = await handlePublicResultsTableView(normalized.clone(), env);
    if (allResults) return allResults;
    return worker.fetch(normalized, env, ctx);
  }
};
