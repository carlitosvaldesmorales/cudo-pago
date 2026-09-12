import coreWorker from './telegram-route-clarity-entry.js';
import { handleResultsRegisterRequest } from './worker/results-register-entry.js';
import { handleResultsStreamRequest, ResultsStreamHub } from './worker/results-stream-entry.js';

export { ResultsStreamHub };

const PRIMARY='/webhook/telegram';
const NEXT='/webhook/telegram-next';

async function sha256Hex(value){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function canonicalTelegramRuntime(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,NEXT].includes(url.pathname)||request.method!=='POST') return null;
  if(!env.TELEGRAM_WEBHOOK_SECRET) return null;
  const isNext=url.pathname===NEXT;
  const secretSource=isNext?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await sha256Hex(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return null;
  const token=isNext?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return null;

  const headers=new Headers(request.headers);
  headers.set('x-telegram-bot-api-secret-token',secretSource);
  const target=new URL(request.url);target.pathname=PRIMARY;
  const body=await request.clone().arrayBuffer();
  const normalized=new Request(target.toString(),{method:'POST',headers,body});
  const runtime=Object.create(env);
  runtime.TELEGRAM_BOT_TOKEN=token;
  runtime.TELEGRAM_WEBHOOK_SECRET=secretSource;
  return {request:normalized,env:runtime};
}

export default {
  async fetch(request,env,ctx){
    const stream=await handleResultsStreamRequest(request.clone(),env);
    if(stream) return stream;

    const canonical=await canonicalTelegramRuntime(request,env);
    if(canonical){
      const result=await handleResultsRegisterRequest(canonical.request,canonical.env,ctx);
      if(result) return result;
    }

    return coreWorker.fetch(request,env,ctx);
  }
};
