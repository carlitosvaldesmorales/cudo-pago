import worker from './worker/index.js';
import { handleSeriesRequest } from './worker/series-entry.js';
import { handlePortalRequest } from './worker/portal-entry.js';

const ALLOWED_ORIGINS = new Set([
  'https://cudo.cl',
  'https://www.cudo.cl',
  'https://carlitosvaldesmorales.github.io'
]);

function isPublicApi(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/v1/');
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

async function deriveTelegramSafeSecret(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function telegramRuntimeHealth(env) {
  const tokenConfigured = !!env.TELEGRAM_BOT_TOKEN;
  const secretConfigured = !!env.TELEGRAM_WEBHOOK_SECRET;
  if (!tokenConfigured) {
    return new Response(JSON.stringify({
      ok:false,
      bot_token_configured:false,
      webhook_secret_configured:secretConfigured,
      bot_api_ok:false,
      webhook_configured:false,
      error:'telegram_bot_token_missing'
    }),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
  }
  try {
    const [meRes, whRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`),
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`)
    ]);
    const me = await meRes.json();
    const wh = await whRes.json();
    const info = wh?.result || {};
    const webhookUrl = String(info.url || '');
    return new Response(JSON.stringify({
      ok:!!me?.ok && !!wh?.ok && secretConfigured && webhookUrl.endsWith('/webhook/telegram'),
      bot_token_configured:true,
      webhook_secret_configured:secretConfigured,
      bot_api_ok:!!me?.ok,
      bot_username:me?.result?.username || null,
      webhook_configured:!!wh?.ok && webhookUrl.endsWith('/webhook/telegram'),
      pending_update_count:Number(info.pending_update_count || 0),
      last_error_date:info.last_error_date || null,
      last_error_message:info.last_error_message || null
    }),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
  } catch (error) {
    return new Response(JSON.stringify({
      ok:false,
      bot_token_configured:true,
      webhook_secret_configured:secretConfigured,
      bot_api_ok:false,
      webhook_configured:false,
      error:'telegram_health_check_failed'
    }),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
  }
}

async function reconcileTelegramWebhook(request, env) {
  if (request.headers.get('X-CUDO-Repair') !== 'reconcile-webhook') {
    return new Response(JSON.stringify({ok:false,error:'forbidden'}),{status:403,headers:{'content-type':'application/json; charset=utf-8'}});
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ok:false,error:'telegram_runtime_secrets_missing'}),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
  }
  const safeSecret = await deriveTelegramSafeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const origin = new URL(request.url).origin;
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      url:`${origin}/webhook/telegram`,
      secret_token:safeSecret,
      allowed_updates:['message','callback_query'],
      drop_pending_updates:false
    })
  });
  const data = await response.json();
  return new Response(JSON.stringify({ok:!!data?.ok,description:data?.description||null}),{
    status:data?.ok?200:502,
    headers:{'content-type':'application/json; charset=utf-8'}
  });
}

async function telegramHandlerRequest(request, env) {
  const clone = request.clone();
  const url = new URL(clone.url);
  if (url.pathname !== '/webhook/telegram' || clone.method !== 'POST' || !env.TELEGRAM_WEBHOOK_SECRET) return clone;
  const presented = clone.headers.get('x-telegram-bot-api-secret-token');
  if (!presented) return clone;
  const expected = await deriveTelegramSafeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  if (presented !== expected) return clone;
  const headers = new Headers(clone.headers);
  headers.set('x-telegram-bot-api-secret-token', env.TELEGRAM_WEBHOOK_SECRET);
  return new Request(clone,{headers});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health/telegram' && request.method === 'GET') {
      return telegramRuntimeHealth(env);
    }

    if (url.pathname === '/ops/telegram/reconcile' && request.method === 'POST') {
      return reconcileTelegramWebhook(request, env);
    }

    if (isPublicApi(request) && request.method === 'OPTIONS') {
      const headers = corsHeaders(request);
      return headers
        ? new Response(null, { status: 204, headers })
        : new Response(null, { status: 403 });
    }

    const telegramRequest = await telegramHandlerRequest(request, env);
    const portal = await handlePortalRequest(telegramRequest.clone(), env, ctx);
    const series = portal ? null : await handleSeriesRequest(telegramRequest.clone(), env, ctx);
    const response = portal || series || await worker.fetch(request, env, ctx);
    if (!isPublicApi(request) || request.method !== 'GET') return response;

    const cors = corsHeaders(request);
    if (!cors) return response;

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
