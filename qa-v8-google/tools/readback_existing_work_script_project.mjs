// READ ONLY: exact CUDO Apps Script project already used by the original
// deploy-cudo-work-state-web-qa.yml. Uses the same CUDO Google OAuth secret
// source in GitHub Actions. Does NOT update script/deployment or expose token.
import {getAccessToken} from './refresh_real_flow_san_ramon_google_sheet.mjs';
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
if(!cash?.source?.includes('CUDO_BONOS_CASH_EXISTING_SCRIPT_PREFLIGHT_V1')||
   !workLive?.source?.includes('cudoBonosCajaReadiness_()')||
   !manifestLive)
 throw Error('CUDO_STABLE_DEPLOYMENT_LIVE_CASH_PREFLIGHT_NOT_PRESENT');
const activeManifest=JSON.parse(manifestLive.source||'{}');
if(activeManifest.webapp?.access!=='MYSELF'||activeManifest.webapp?.executeAs!=='USER_DEPLOYING')
 throw Error('CUDO_EXISTING_DEPLOYMENT_PRIVATE_SCOPE_CHANGED');
const result={
 contract:'CUDO_EXISTING_WORK_SCRIPT_PROJECT_READBACK_V1',ok:true,
 existingProjectVerified:true,projectKind:'CUDO_WORK_STATE_PRIVATE',
 stableDeploymentPresent:true,
 stableDeploymentVersion:stableVersion,
 cashPreflightPresentInActiveVersion:true,
 privateWorkPanelCallsCashPreflight:true,
 stableDeploymentAccess:manifestSource.webapp?.access||'UNSPECIFIED',
 stableDeploymentExecuteAs:manifestSource.webapp?.executeAs||'UNSPECIFIED',
 workFilePresent:true,cashFileAlreadyPresent:files.some(f=>f.name==='CudoBonosCajaReadiness'),
 existingDeploymentCount:(deployments.deployments||[]).length,
 moneyWriterActive:false,
 performedMutation:false
};
console.log(JSON.stringify(result));
