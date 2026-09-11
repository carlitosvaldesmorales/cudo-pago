import worker from './worker/index.js';
import { handleSeriesRequest } from './worker/series-entry.js';
import { handlePortalRequest } from './worker/portal-entry.js';
import { handleClubAdminSeriesScore } from './worker/club-admin-series-entry.js';
import { handleGlobalAdminResultsRequest } from './worker/global-admin-results-entry.js';
import { handleDirigentesLifecycleRequest } from './worker/dirigentes-lifecycle-entry.js';
import { handleSuspendedDirigenteGuard } from './worker/dirigentes-suspended-guard-entry.js';
import { handlePublicReportContractAdapter } from './worker/public-report-contract-adapter.js';
import { handleContributorObservationRequest } from './worker/contributor-observation-entry.js';
import { handlePublicResultRequest } from './worker/public-result-entry.js';
import { handleResultGovernanceRequest } from './worker/result-governance-entry.js';
import { syncTelegramNativeMenu, handleTelegramNativeMenuCommand, PUBLIC_NATIVE_COMMANDS } from './worker/telegram-native-menu-entry.js';

const TARGET_BOT_NAME = 'Fútbol Chépica';
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
      bot_id:null,
      bot_name_configured:false,
      webhook_configured:false,
      native_menu_configured:false,
      default_commands_configured:false,
      error:'telegram_bot_token_missing'
    }),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
  }
  try {
    const [meRes, nameRes, whRes, menuRes, commandsRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`),
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMyName`),
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`),
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMenuButton`),
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMyCommands`)
    ]);
    const me = await meRes.json();
    const name = await nameRes.json();
    const wh = await whRes.json();
    const menu = await menuRes.json();
    const commands = await commandsRes.json();
    const info = wh?.result || {};
    const webhookUrl = String(info.url || '');
    const commandNames = Array.isArray(commands?.result) ? commands.result.map(x=>x.command) : [];
    const defaultCommandsOk = PUBLIC_NATIVE_COMMANDS.every(x=>commandNames.includes(x.command));
    const nativeMenuOk = !!menu?.ok && menu?.result?.type === 'commands';
    const botName = String(name?.result?.name || '');
    const botNameOk = !!name?.ok && botName === TARGET_BOT_NAME;
    const ok = !!me?.ok && !!wh?.ok && secretConfigured && webhookUrl.endsWith('/webhook/telegram') && nativeMenuOk && defaultCommandsOk && botNameOk;
    return new Response(JSON.stringify({
      ok,
      bot_token_configured:true,
      webhook_secret_configured:secretConfigured,
      bot_api_ok:!!me?.ok,
      bot_id:me?.result?.id ?? null,
      bot_username:me?.result?.username || null,
      bot_name:botName || null,
      bot_name_configured:botNameOk,
      webhook_configured:!!wh?.ok && webhookUrl.endsWith('/webhook/telegram'),
      native_menu_configured:nativeMenuOk,
      default_commands_configured:defaultCommandsOk,
      default_commands:commandNames,
      pending_update_count:Number(info.pending_update_count || 0),
      last_error_date:info.last_error_date || null,
      last_error_message:info.last_error_message || null
    }),{status:ok?200:503,headers:{'content-type':'application/json; charset=utf-8'}});
  } catch (error) {
    return new Response(JSON.stringify({
      ok:false,
      bot_token_configured:true,
      webhook_secret_configured:secretConfigured,
      bot_api_ok:false,
      bot_id:null,
      bot_name_configured:false,
      webhook_configured:false,
      native_menu_configured:false,
      default_commands_configured:false,
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
  const call = (method,body)=>fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  }).then(r=>r.json());
  const [webhook,menu,commands,name] = await Promise.all([
    call('setWebhook',{
      url:`${origin}/webhook/telegram`,
      secret_token:safeSecret,
      allowed_updates:['message','callback_query'],
      drop_pending_updates:false
    }),
    call('setChatMenuButton',{menu_button:{type:'commands'}}),
    call('setMyCommands',{commands:PUBLIC_NATIVE_COMMANDS}),
    call('setMyName',{name:TARGET_BOT_NAME})
  ]);
  const ok=!!webhook?.ok&&!!menu?.ok&&!!commands?.ok&&!!name?.ok;
  return new Response(JSON.stringify({
    ok,
    webhook:!!webhook?.ok,
    native_menu:!!menu?.ok,
    default_commands:!!commands?.ok,
    bot_name:!!name?.ok,
    description:webhook?.description||null
  }),{
    status:ok?200:502,
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
    await syncTelegramNativeMenu(telegramRequest.clone(), env, ctx);
    const suspendedGuard = await handleSuspendedDirigenteGuard(telegramRequest.clone(), env, ctx);
    const publicReportContract = suspendedGuard ? null : await handlePublicReportContractAdapter(telegramRequest.clone(), env, ctx);
    const observation = (suspendedGuard || publicReportContract) ? null : await handleContributorObservationRequest(telegramRequest.clone(), env, ctx);
    const globalAdminResults = (suspendedGuard || publicReportContract || observation) ? null : await handleGlobalAdminResultsRequest(telegramRequest.clone(), env, ctx);
    const nativeMenu = (suspendedGuard || publicReportContract || observation || globalAdminResults) ? null : await handleTelegramNativeMenuCommand(telegramRequest.clone(), env, ctx);
    const resultGovernance = (suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu) ? null : await handleResultGovernanceRequest(telegramRequest.clone(), env, ctx);
    const publicResult = (suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu || resultGovernance) ? null : await handlePublicResultRequest(telegramRequest.clone(), env, ctx);
    const dirigentesLifecycle = (suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu || resultGovernance || publicResult) ? null : await handleDirigentesLifecycleRequest(telegramRequest.clone(), env, ctx);
    const portal = (suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu || resultGovernance || publicResult || dirigentesLifecycle) ? null : await handlePortalRequest(telegramRequest.clone(), env, ctx);
    const clubAdminScore = (suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu || resultGovernance || publicResult || dirigentesLifecycle || portal) ? null : await handleClubAdminSeriesScore(telegramRequest.clone(), env, ctx);
    const series = (suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu || resultGovernance || publicResult || dirigentesLifecycle || portal || clubAdminScore) ? null : await handleSeriesRequest(telegramRequest.clone(), env, ctx);
    const response = suspendedGuard || publicReportContract || observation || globalAdminResults || nativeMenu || resultGovernance || publicResult || dirigentesLifecycle || portal || clubAdminScore || series || await worker.fetch(request, env, ctx);
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