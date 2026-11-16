// READ ONLY: exact CUDO Apps Script project already used by the original
// deploy-cudo-work-state-web-qa.yml. Uses the same CUDO Google OAuth secret
// source in GitHub Actions. Does NOT update script/deployment or expose token.
import {getAccessToken} from './refresh_real_flow_san_ramon_google_sheet.mjs';
import {readFileSync} from 'node:fs';
const id='1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8';
const stable='AKfycbxae8ZOaPJElvF9cTa0EdDzb-KBm4nItqHSnUdZngQ2nRnEEy3nX3AJMQHsySt5lE99Sw';
const token=await getAccessToken();
async function get(path){
 const r=await fetch('https://script.googleapis.com/v1/projects/'+id+path,{
  headers:{authorization:'Bearer '+token,accept:'application/json'}});
 if(!r.ok)throw Error('EXISTING_APPS_SCRIPT_READ_FAILED_'+r.status);
 return r.json();
}
const content=await get('/content');
const files=content.files||[];
const original=files.filter(f=>f.name==='CudoWorkStateWeb'&&f.type==='SERVER_JS');
const manifest=files.find(f=>f.name==='appsscript'&&f.type==='JSON');
if(original.length!==1||!manifest)throw Error('CUDO_EXISTING_SCRIPT_PROJECT_NOT_CUDO_WORK_STATE');
const manifestSource=JSON.parse(manifest.source||'{}');
const deployments=await get('/deployments?pageSize=200');
const known=(deployments.deployments||[]).find(d=>d.deploymentId===stable);
if(!known)throw Error('EXISTING_STABLE_CUDO_WORK_DEPLOYMENT_MISSING');
const stableVersion=Number(known.deploymentConfig?.versionNumber);
if(!Number.isSafeInteger(stableVersion)||stableVersion<=0)
 throw Error('EXISTING_WORK_DEPLOYMENT_VERSION_UNVERIFIED');
// Verify the IMMUTABLE version actually serving the existing public URL,
// not merely the editable HEAD source that an incomplete deploy can change.
const live=await get('/content?versionNumber='+stableVersion);
const cash=(live.files||[]).find(f=>f.name==='CudoBonosCajaReadiness'&&f.type==='SERVER_JS');
const workLive=(live.files||[]).find(f=>f.name==='CudoWorkStateWeb'&&f.type==='SERVER_JS');
const manifestLive=(live.files||[]).find(f=>f.name==='appsscript'&&f.type==='JSON');
const installed=!!cash?.source?.includes('CUDO_BONOS_CASH_EXISTING_SCRIPT_PREFLIGHT_V1')&&
 !!workLive?.source?.includes('cudoBonosCajaReadiness_()')&&!!manifestLive;
// The same source files as the existing CUDO Apps Script deployment job.
// Compare only in memory; never send provider code or private data to logs.
const localWork=readFileSync(new URL('../apps-script/CudoWorkStateWeb.gs',import.meta.url),'utf8');
const localCash=readFileSync(new URL('../apps-script/CudoBonosCajaReadiness.gs',import.meta.url),'utf8');
const activeSourceIdentical=workLive?.source===localWork&&cash?.source===localCash;
if(process.env.CUDO_REQUIRE_CASH_LIVE==='true'&&!installed)
 throw Error('CUDO_STABLE_DEPLOYMENT_LIVE_CASH_PREFLIGHT_NOT_PRESENT');
if(!manifestLive)throw Error('CUDO_EXISTING_DEPLOYMENT_VERSION_MANIFEST_MISSING');
const activeManifest=JSON.parse(manifestLive.source||'{}');
const activeScopes=activeManifest.oauthScopes;
const headScopes=manifestSource.oauthScopes;
// Scopes are permissions metadata, not tokens or identities. Never print
// private document contents, OAuth token or contact data.
const scope='https://www.googleapis.com/auth/userinfo.email';
if(process.env.CUDO_REQUIRE_CASH_LIVE==='true'&&
  !(Array.isArray(activeScopes)&&activeScopes.includes(scope)))
 throw Error('CUDO_USERINFO_EMAIL_SCOPE_MISSING_FROM_LIVE_DEPLOYMENT');
if(activeManifest.webapp?.access!=='MYSELF'||activeManifest.webapp?.executeAs!=='USER_DEPLOYING')
 throw Error('CUDO_EXISTING_DEPLOYMENT_PRIVATE_SCOPE_CHANGED');
const result={
 contract:'CUDO_EXISTING_WORK_SCRIPT_PROJECT_READBACK_V1',ok:true,
 existingProjectVerified:true,projectKind:'CUDO_WORK_STATE_PRIVATE',
 stableDeploymentPresent:true,
 stableDeploymentVersion:stableVersion,
 cashPreflightPresentInActiveVersion:installed,
 activeSourceIdenticalToRepo:activeSourceIdentical,
 headExplicitScopes:Array.isArray(headScopes),
 headOauthScopeCount:Array.isArray(headScopes)?headScopes.length:0,
 activeExplicitScopes:Array.isArray(activeScopes),
 activeOauthScopeCount:Array.isArray(activeScopes)?activeScopes.length:0,
 headUserinfoEmailScopeGranted:Array.isArray(headScopes)&&headScopes.includes(scope),
 activeUserinfoEmailScopeDeclared:Array.isArray(activeScopes)&&activeScopes.includes(scope),
 privateWorkPanelCallsCashPreflight:installed,
 stableDeploymentAccess:manifestSource.webapp?.access||'UNSPECIFIED',
 stableDeploymentExecuteAs:manifestSource.webapp?.executeAs||'UNSPECIFIED',
 workFilePresent:true,cashFileAlreadyPresent:files.some(f=>f.name==='CudoBonosCajaReadiness'),
 existingDeploymentCount:(deployments.deployments||[]).length,
 moneyWriterActive:false,
 runtimeGap:!installed?'CUDO_STABLE_DEPLOYMENT_NOT_YET_UPDATED':
  !(Array.isArray(activeScopes)&&activeScopes.includes(scope))?'CUDO_USERINFO_SCOPE_MISSING':null,
 performedMutation:false
};
console.log(JSON.stringify(result));
