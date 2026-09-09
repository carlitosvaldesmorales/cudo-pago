import worker from './worker/index.js';
import { handleSeriesRequest } from './worker/series-entry.js';

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health/telegram' && request.method === 'GET') {
      return telegramRuntimeHealth(env);
    }

    if (isPublicApi(request) && request.method === 'OPTIONS') {
      const headers = corsHeaders(request);
      return headers
        ? new Response(null, { status: 204, headers })
        : new Response(null, { status: 403 });
    }

    const intercepted = await handleSeriesRequest(request.clone(), env, ctx);
    const response = intercepted || await worker.fetch(request, env, ctx);
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
