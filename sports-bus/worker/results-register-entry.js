// Stable canonical facade. RESULTS-REGISTER v2 keeps this import path so consumers do not fork semantics.
// Historical Dirigentes screens emitted tp:mymatches. Normalize that legacy entry here so
// every identity reaches the same canonical result-capture capability before legacy fallbacks.
import { handleResultsRegisterRequest as handleResultsRegisterV2 } from './results-register-v2-entry.js';

async function normalizeLegacyResultsEntry(request){
  if(request.method!=='POST') return request;
  let update;
  try{update=await request.clone().json();}catch{return request;}
  if(String(update?.callback_query?.data||'')!=='tp:mymatches') return request;
  const normalized={
    ...update,
    callback_query:{...update.callback_query,data:'rr:dates'}
  };
  return new Request(request.url,{
    method:request.method,
    headers:new Headers(request.headers),
    body:JSON.stringify(normalized)
  });
}

export async function handleResultsRegisterRequest(request,env,ctx){
  return handleResultsRegisterV2(await normalizeLegacyResultsEntry(request),env,ctx);
}
