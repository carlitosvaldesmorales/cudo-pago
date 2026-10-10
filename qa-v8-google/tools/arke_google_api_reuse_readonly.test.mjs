import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attestExistingGoogleOAuth, classifyGoogleScopes} from './arke_google_api_reuse_readonly.mjs';
const env={
  GITHUB_REF:'refs/heads/lab/cudo-google-api-arke-reuse-20261010',
  CUDO_GOOGLE_API_REUSE_MODE:'READONLY_ATTEST',
  CUDO_GOOGLE_OAUTH_CLIENT_ID:'synthetic-id',
  CUDO_GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-secret',
  CUDO_GOOGLE_REFRESH_TOKEN:'synthetic-refresh'
};
const token='synthetic_opaque_access_token_12345678901234567890';
const scope='https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/forms https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/script.deployments';
test('classifies CUDO historical data API scopes but not login/admin authority',()=>{
  const d=classifyGoogleScopes(scope);
  assert.equal(d.google_data_api_drive,true);
  assert.equal(d.google_apps_script_deployments,true);
  assert.equal(d.cloud_platform_scope,false);
  assert.equal(d.openid_scope,false);
  assert.equal(d.proven_google_cloud_oauth_client_management_permission,false);
});
test('wrong branch fails before any provider request',async()=>{
  let calls=0;
  await assert.rejects(()=>attestExistingGoogleOAuth({env:{...env,GITHUB_REF:'refs/heads/main'},fetchFn:async()=>{calls++;}}),/UNAUTHORIZED/);
  assert.equal(calls,0);
});
test('absent CUDO secret binding fails closed without provider request',async()=>{
  let calls=0;
  await assert.rejects(()=>attestExistingGoogleOAuth({env:{...env,CUDO_GOOGLE_REFRESH_TOKEN:''},fetchFn:async()=>{calls++;}}),/MISSING/);
  assert.equal(calls,0);
});
test('reuses exact CUDO refresh shape, outputs only nonsecret boolean metadata',async()=>{
  const calls=[];
  const result=await attestExistingGoogleOAuth({env,fetchFn:async(url,init)=>{
    calls.push({url,init});
    if(calls.length===1) {
      assert.equal(url,'https://oauth2.googleapis.com/token');
      assert.equal(init.method,'POST');
      assert.equal(init.body.get('grant_type'),'refresh_token');
      assert.equal(init.body.get('refresh_token'),env.CUDO_GOOGLE_REFRESH_TOKEN);
      return new Response(JSON.stringify({access_token:token}),{status:200});
    }
    assert.equal(new URL(url).hostname,'oauth2.googleapis.com');
    assert.equal(new URL(url).pathname,'/tokeninfo');
    return new Response(JSON.stringify({scope}),{status:200});
  }});
  assert.equal(calls.length,2);
  assert.equal(result.token_refresh_succeeded,true);
  assert.equal(result.api_permission_evidence.google_data_api_sheets,true);
  assert.equal(result.api_permission_evidence.cloud_platform_scope,false);
  assert.equal(result.google_auth_client_for_supabase_reusable,'NOT_VALIDATED');
  const out=JSON.stringify(result);
  for(const secret of [env.CUDO_GOOGLE_OAUTH_CLIENT_ID,env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,env.CUDO_GOOGLE_REFRESH_TOKEN,token])assert.equal(out.includes(secret),false);
});
test('provider rejects refresh grant => no fallback or claims of authority',async()=>{
  await assert.rejects(()=>attestExistingGoogleOAuth({env,fetchFn:async()=>new Response('{}',{status:401})}),/GOOGLE_PROVIDER_HTTP_401/);
});
test('empty scope string grants nothing',()=>{
  const out=classifyGoogleScopes('');
  for(const [key,val] of Object.entries(out))if(key.endsWith('_scope')||key.startsWith('google_data_api_'))assert.equal(val,false);
});
