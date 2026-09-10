import coreWorker from './cors-entry.js';
import { PUBLIC_NATIVE_COMMANDS } from './worker/telegram-native-menu-entry.js';
import { handlePublicResultsUxV2 } from './worker/public-results-ux-v2.js';
import { handlePublicResultsUxV3 } from './worker/public-results-ux-v3.js';

const TARGET_BOT_NAME = 'Fútbol Chépica';
const NEXT_WEBHOOK_PATH = '/webhook/telegram-next';
const NEXT_HEALTH_PATH = '/health/telegram-next';
const NEXT_RECONCILE_PATH = '/ops/telegram-next/reconcile';
const CORE_WEBHOOK_PATH = '/webhook/telegram';

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
  if (!tokenConfigured) {
    return new Response(JSON.stringify({
      ok: false,
      slot: 'next',
      bot_token_configured: false,
      webhook_secret_configured: secretConfigured,
      bot_api_ok: false,
      bot_id: null,
      bot_username: null,
      bot_name: null,
      bot_name_configured: false,
      webhook_configured: false,
      native_menu_configured: false,
      default_commands_configured: false,
      public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
      error: 'telegram_next_bot_token_missing'
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
    const botNameOk = !!name?.ok && botName === TARGET_BOT_NAME;
    const username = String(me?.result?.username || '');
    const usernameShapeOk = /^[A-Za-z0-9_]{5,32}$/.test(username) && /bot$/i.test(username);
    const webhookOk = !!wh?.ok && webhookUrl.endsWith(NEXT_WEBHOOK_PATH);
    const ok = !!me?.ok && secretConfigured && usernameShapeOk && webhookOk && nativeMenuOk && defaultCommandsOk && botNameOk;

    return new Response(JSON.stringify({
      ok,
      slot: 'next',
      bot_token_configured: true,
      webhook_secret_configured: secretConfigured,
      bot_api_ok: !!me?.ok,
      bot_id: me?.result?.id ?? null,
      bot_username: username || null,
      bot_username_shape_ok: usernameShapeOk,
      bot_name: botName || null,
      bot_name_configured: botNameOk,
      webhook_configured: webhookOk,
      native_menu_configured: nativeMenuOk,
      default_commands_configured: defaultCommandsOk,
      default_commands: commandNames,
      public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
      pending_update_count: Number(info.pending_update_count || 0),
      last_error_date: info.last_error_date || null,
      last_error_message: info.last_error_message || null
    }), { status: ok ? 200 : 503, headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      slot: 'next',
      bot_token_configured: true,
      webhook_secret_configured: secretConfigured,
      bot_api_ok: false,
      bot_id: null,
      bot_name_configured: false,
      webhook_configured: false,
      native_menu_configured: false,
      default_commands_configured: false,
      public_results_ux_version: runtime.TELEGRAM_PUBLIC_UX_VERSION,
      error: 'telegram_next_health_check_failed'
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
    return new Response(JSON.stringify({ ok: false, slot: 'next', error: 'telegram_next_runtime_secret_missing' }), {
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

  const [webhook, menu, commands, name] = await Promise.all([
    call('setWebhook', {
      url: `${origin}${NEXT_WEBHOOK_PATH}`,
      secret_token: safeSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    }),
    call('setChatMenuButton', { menu_button: { type: 'commands' } }),
    call('setMyCommands', { commands: PUBLIC_NATIVE_COMMANDS }),
    call('setMyName', { name: TARGET_BOT_NAME })
  ]);

  const ok = !!webhook?.ok && !!menu?.ok && !!commands?.ok && !!name?.ok;
  return new Response(JSON.stringify({
    ok,
    slot: 'next',
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

    if (url.pathname === NEXT_HEALTH_PATH && request.method === 'GET') {
      return telegramNextRuntimeHealth(env);
    }

    if (url.pathname === NEXT_RECONCILE_PATH && request.method === 'POST') {
      return reconcileTelegramNext(request, env);
    }

    if (url.pathname === NEXT_WEBHOOK_PATH && request.method === 'POST') {
      const runtime = nextRuntimeEnv(env);
      if (!runtime.TELEGRAM_BOT_TOKEN || !runtime.TELEGRAM_WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'telegram_next_not_configured' }), {
          status: 503,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }

      const publicUxV3 = await handlePublicResultsUxV3(request.clone(), runtime);
      if (publicUxV3) return publicUxV3;

      // Keep V2 callbacks alive for historical messages already present in Telegram.
      const publicUxV2 = await handlePublicResultsUxV2(request.clone(), runtime);
      if (publicUxV2) return publicUxV2;

      const rewritten = await rewriteWebhookRequest(request);
      return coreWorker.fetch(rewritten, runtime, ctx);
    }

    return coreWorker.fetch(request, env, ctx);
  }
};