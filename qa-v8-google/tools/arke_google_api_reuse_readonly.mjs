/**
 * ARKE read-only reuse gate for the EXISTING CUDO Google OAuth secret binding.
 * Based on qa-v8-google/tools/sync_google_publico.mjs:getAccessToken
 * and diagnose/google-forms-authority-v1's capability-readonly workflow.
 *
 * Nothing is deployed, no Google data is read, no credentials are exported.
 * This script is only permitted on the isolated CUDO branch.
 */
const EXACT_REF = 'refs/heads/lab/cudo-google-api-arke-reuse-20261010';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const INFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

export function classifyGoogleScopes(scopeString) {
  const scopes = new Set(typeof scopeString === 'string' ? scopeString.trim().split(/\s+/).filter(Boolean) : []);
  const has = (suffix) => scopes.has('https://www.googleapis.com/auth/'+suffix);
  return {
    google_data_api_drive: has('drive'),
    google_data_api_sheets: has('spreadsheets'),
    google_data_api_forms: has('forms'),
    google_apps_script_projects: has('script.projects'),
    google_apps_script_deployments: has('script.deployments'),
    cloud_platform_scope: has('cloud-platform'),
    openid_scope: scopes.has('openid'),
    email_scope: scopes.has('email') || has('userinfo.email'),
    profile_scope: scopes.has('profile') || has('userinfo.profile'),
    proven_current_google_oauth_client_registered_for_supabase_redirect: false,
    proven_google_cloud_oauth_client_management_permission: false,
    only_classification_not_scope_grant: true,
  };
}
async function jsonAt(url, init, fetchFn) {
  const response=await fetchFn(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw new Error('GOOGLE_PROVIDER_HTTP_'+response.status);
  return response.json();
}
export async function attestExistingGoogleOAuth({env=process.env,fetchFn=fetch}={}) {
  if(env.GITHUB_REF!==EXACT_REF || env.CUDO_GOOGLE_API_REUSE_MODE!=='READONLY_ATTEST')
    throw new Error('GATE_UNAUTHORIZED_BRANCH_OR_MODE');
  const vars=['CUDO_GOOGLE_OAUTH_CLIENT_ID','CUDO_GOOGLE_OAUTH_CLIENT_SECRET','CUDO_GOOGLE_REFRESH_TOKEN'];
  if(vars.some(x=>typeof env[x]!=='string'||!env[x].trim()))
    throw new Error('EXISTING_CUDO_GITHUB_SECRET_BINDING_MISSING');
  // Adapted unchanged Google OAuth refresh grant shape from CUDO sync script.
  const body=new URLSearchParams({
    client_id:env.CUDO_GOOGLE_OAUTH_CLIENT_ID,
    client_secret:env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token:env.CUDO_GOOGLE_REFRESH_TOKEN,
    grant_type:'refresh_token'
  });
  const data=await jsonAt(TOKEN_ENDPOINT,{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body
  },fetchFn);
  if(typeof data?.access_token!=='string'||data.access_token.length<20)
    throw new Error('GOOGLE_REFRESH_DID_NOT_RETURN_BEARER');
  const info=await jsonAt(INFO_ENDPOINT+'?access_token='+encodeURIComponent(data.access_token),{
    method:'GET',headers:{accept:'application/json'}
  },fetchFn);
  const classification=classifyGoogleScopes(info?.scope);
  return {
    schema_version:'ARKE_CUDO_GOOGLE_OAUTH_REUSE_READONLY_V1',
    verified_at:new Date().toISOString(),
    source:'CUDO_GITHUB_ACTIONS_EXISTING_SECRET_BINDING',
    token_refresh_succeeded:true,
    account_email_proven_by_this_token:false,
    api_permission_evidence:classification,
    google_auth_client_for_supabase_reusable:'NOT_VALIDATED',
    provider_side_mutation:false,
    production_write:false,
    extra_cost_commitment:false,
    secret_values_returned:false,
  };
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  try {
    const result=await attestExistingGoogleOAuth();
    // Only the nonsecret allowlisted boolean schema is written. Tokeninfo and
    // refresh-token responses MUST never be emitted, including on failures.
    console.log('ARKE_CUDO_GOOGLE_API_REUSE_RECEIPT='+JSON.stringify(result));
  } catch(e) {
    console.error('ARKE_CUDO_GOOGLE_API_REUSE_GATE=DENIED');
    process.exitCode=1;
  }
}
