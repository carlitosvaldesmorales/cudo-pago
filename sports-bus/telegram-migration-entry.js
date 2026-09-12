import coreWorker from './cors-entry.js';
import { PUBLIC_NATIVE_COMMANDS } from './worker/telegram-native-menu-entry.js';
import { handlePublicResultsUxV2 } from './worker/public-results-ux-v2.js';
import { handlePublicResultsUxV3 } from './worker/public-results-ux-v3.js';
import {
  TELEGRAM_PRODUCT_NAME,
  TELEGRAM_CHANNEL,
  isCanonicalTelegramUsername
} from './worker/telegram-channel-contract.js';

const NEXT_WEBHOOK_PATH = TELEGRAM_CHANNEL.CANONICAL.webhook_path;
const NEXT_HEALTH_PATH = TELEGRAM_CHANNEL.CANONICAL.compatibility_health_path;
const CANONICAL_HEALTH_PATH = TELEGRAM_CHANNEL.CANONICAL.health_path;
const NEXT_RECONCILE_PATH = TELEGRAM_CHANNEL.CANONICAL.compatibility_reconcile_path;
const CANONICAL_RECONCILE_PATH = TELEGRAM_CHANNEL.CANONICAL.reconcile_path;
const CORE_WEBHOOK_PATH = TELEGRAM_CHANNEL.LEGACY.webhook_path;

async function deriveTelegramSafeSecret(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function nextMenuDb(db) {
  if (!db) return db;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) => target.prepare(String(sql).replace(/\btelegram_menu_state\b/g, 'telegram_menu_state_next'));
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function nextRuntimeEnv(env) {
  const runtime = Object.create(env);
  runtime.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN_NEXT || null;
  runtime.TELEGRAM_WEBHOOK_SECRET = env.TELEGRAM_WEBHOOK_SECRET
    ? `${env.TELEGRAM_WEBHOOK_SECRET}:next`
    : null;
  runtime.DB = nextMenuDb(env.DB);
  runtime.TELEGRAM_PUBLIC_UX_VERSION = '3';
  return runtime;
}

async function rewriteWebhookRequest(request) {
  const url = new URL(request.url);
  url.pathname = CORE_WEBHOOK_PATH;
  const init = {
    method: request.method,
    headers: new Headers(request.headers),
    redirect: request.redirect
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }
  return new Request(url.toString(), init);
}

async function telegramNextRuntimeHealth(env) {
  const runtime = nextRuntimeEnv(env);
  const tokenConfigured = !!runtime.TELEGRAM_BOT_TOKEN;
  const secretConfigured = !!runtime.TELEGRAM_WEBHOOK_SECRET;
  const base = {
    slot: 'next',
    internal_slot: TELEGRAM_CHANNEL.CANONICAL.internal_slot,
    channel_role: TELEGRAM_CHANNEL.CANONICAL.role,
    canonical_username: TELEGRAM_CHANNEL.CANONICAL.username,
    canonical_mention: TELEGRAM_CHANNEL.CANONICAL.mention
  };
  if (!tokenConfigured) {
    return new Response(JSON.stringify({
      ok: false,
      ...base,
      bot_token_configured: false,
      webhook_secret_configured: secretConfigured,
      bot_api_ok: false,
      bot_id: null,
      bot_username: null,
      bot_username_shape_ok: false,
      is_canonical_bot: false,
      bot_name: null,
      bot_name_configured: false,
      webhook_configured: false,
      native_menu_configured: false,
      default_commands_configured: false,
      public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
      error: 'telegram_next_bot_token_missing',
      canonical_error: 'telegram_canonical_bot_token_missing'
    }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  try {
    const token = runtime.TELEGRAM_BOT_TOKEN;
    const [meRes, nameRes, whRes, menuRes, commandsRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${token}/getMe`),
      fetch(`https://api.telegram.org/bot${token}/getMyName`),
      fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`),
      fetch(`https://api.telegram.org/bot${token}/getChatMenuButton`),
      fetch(`https://api.telegram.org/bot${token}/getMyCommands`)
    ]);
    const me = await meRes.json();
    const name = await nameRes.json();
    const wh = await whRes.json();
    const menu = await menuRes.json();
    const commands = await commandsRes.json();
    const info = wh?.result || {};
    const webhookUrl = String(info.url || '');
    const commandNames = Array.isArray(commands?.result) ? commands.result.map(x => x.command) : [];
    const defaultCommandsOk = PUBLIC_NATIVE_COMMANDS.every(x => commandNames.includes(x.command));
    const nativeMenuOk = !!menu?.ok && menu?.result?.type === 'commands';
    const botName = String(name?.result?.name || '');
    const botNameOk = !!name?.ok && botName === TELEGRAM_PRODUCT_NAME;
    const username = String(me?.result?.username || '');
    const usernameShapeOk = /^[A-Za-z0-9_]{5,32}$/.test(username) && /bot$/i.test(username);
    const canonicalUsernameOk = !!me?.ok && isCanonicalTelegramUsername(username);
    const webhookOk = !!wh?.ok && webhookUrl.endsWith(NEXT_WEBHOOK_PATH);
    const ok = !!me?.ok && secretConfigured && canonicalUsernameOk && webhookOk && nativeMenuOk && defaultCommandsOk && botNameOk;

    return new Response(JSON.stringify({
      ok,
      ...base,
      bot_token_configured: true,
      webhook_secret_configured: secretConfigured,
      bot_api_ok: !!me?.ok,
      bot_id: me?.result?.id ?? null,
      bot_username: username || null,
      bot_username_shape_ok: usernameShapeOk,
      is_canonical_bot: canonicalUsernameOk,
      bot_name: botName || null,
      bot_name_configured: botNameOk,
      webhook_configured: webhookOk,
      native_menu_configured: nativeMenuOk,
      default_commands_configured: defaultCommandsOk,
      default_commands: commandNames,
      public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
      pending_update_count: Number(info.pending_update_count || 0),
      last_error_date: info.last_error_date || null,
      last_error_message: info.last_error_message || null,
      error: canonicalUsernameOk ? null : 'telegram_token_does_not_match_canonical_username'
    }), { status: ok ? 200 : 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      ...base,
      bot_token_configured: true,
      webhook_secret_configured: secretConfigured,
      bot_api_ok: false,
      bot_id: null,
      bot_username: null,
      bot_username_shape_ok: false,
      is_canonical_bot: false,
      bot_name_configured: false,
      webhook_configured: false,
      native_menu_configured: false,
      default_commands_configured: false,
      public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
      error: 'telegram_canonical_health_check_failed'
    }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
}

async function reconcileTelegramNext(request, env) {
  if (request.headers.get('X-CUDO-Repair') !== 'reconcile-webhook') {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const runtime = nextRuntimeEnv(env);
  if (!runtime.TELEGRAM_BOT_TOKEN || !runtime.TELEGRAM_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ ok: false, slot: 'next', channel_role: 'CANONICAL', error: 'telegram_next_runtime_secret_missing' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const safeSecret = await deriveTelegramSafeSecret(runtime.TELEGRAM_WEBHOOK_SECRET);
  const origin = new URL(request.url).origin;
  const call = (method, body) => fetch(`https://api.telegram.org/bot${runtime.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());

  const me = await call('getMe', {});
  const username = String(me?.result?.username || '');
  if (!me?.ok || !isCanonicalTelegramUsername(username)) {
    return new Response(JSON.stringify({
      ok: false,
      slot: 'next',
      channel_role: 'CANONICAL',
      expected_username: TELEGRAM_CHANNEL.CANONICAL.username,
      actual_username: username || null,
      error: 'refusing_to_reconcile_noncanonical_bot_token'
    }), {
      status: 409,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const [webhook, menu, commands, name] = await Promise.all([
    call('setWebhook', {
      url: `${origin}${NEXT_WEBHOOK_PATH}`,
      secret_token: safeSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    }),
    call('setChatMenuButton', { menu_button: { type: 'commands' } }),
    call('setMyCommands', { commands: PUBLIC_NATIVE_COMMANDS }),
    call('setMyName', { name: TELEGRAM_PRODUCT_NAME })
  ]);

  const ok = !!webhook?.ok && !!menu?.ok && !!commands?.ok && !!name?.ok;
  return new Response(JSON.stringify({
    ok,
    slot: 'next',
    channel_role: 'CANONICAL',
    bot_username: username,
    webhook: !!webhook?.ok,
    native_menu: !!menu?.ok,
    default_commands: !!commands?.ok,
    bot_name: !!name?.ok,
    public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
    description: webhook?.description || null
  }), {
    status: ok ? 200 : 502,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ([NEXT_HEALTH_PATH, CANONICAL_HEALTH_PATH].includes(url.pathname) && request.method === 'GET') {
      return telegramNextRuntimeHealth(env);
    }

    if ([NEXT_RECONCILE_PATH, CANONICAL_RECONCILE_PATH].includes(url.pathname) && request.method === 'POST') {
      return reconcileTelegramNext(request, env);
    }

    if (url.pathname === NEXT_WEBHOOK_PATH && request.method === 'POST') {
      const runtime = nextRuntimeEnv(env);
      if (!runtime.TELEGRAM_BOT_TOKEN || !runtime.TELEGRAM_WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'telegram_next_not_configured', canonical_error: 'telegram_canonical_not_configured' }), {
          status: 503,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }

      const publicUxV3 = await handlePublicResultsUxV3(request.clone(), runtime);
      if (publicUxV3) return publicUxV3;

      // Historical callbacks remain compatible, but all new product work targets @FutbolChepicaBot.
      const publicUxV2 = await handlePublicResultsUxV2(request.clone(), runtime);
      if (publicUxV2) return publicUxV2;

      // Adapter-only distinction: the canonical bot reuses the same core capabilities as the legacy slot.
      const rewritten = await rewriteWebhookRequest(request);
      return coreWorker.fetch(rewritten, runtime, ctx);
    }

    return coreWorker.fetch(request, env, ctx);
  }
};
