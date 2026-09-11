import { handleContributorObservationRequest } from './contributor-observation-entry.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// Compatibility shim: existing callers/tests know tp:public-report as the public-result
// entry contract. The visible UX is now the contributor observation flow, but the
// handled identity remains stable while old clients migrate to obs:* callbacks.
export async function handlePublicReportContractAdapter(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  if(String(update.callback_query?.data||'')!=='tp:public-report') return null;
  const response=await handleContributorObservationRequest(request.clone(),env);
  if(!response) return null;
  let body;
  try{body=await response.clone().json();}catch{return response;}
  if(body?.handled!=='observation_dates') return response;
  return json({...body,handled:'public_result_dates',observation_contract:'contributor-observation-plane-v1'},response.status);
}
