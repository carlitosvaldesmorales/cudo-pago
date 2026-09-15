import fs from 'node:fs';
import path from 'node:path';

const APPLY=String(process.env.CUDO_FORM_ACCESS_APPLY||'false').toLowerCase()==='true';
const EVIDENCE_PATH=process.env.CUDO_FORM_ACCESS_EVIDENCE||'qa-form-access/form-responder-access.json';

const TARGETS=[
  {key:'EQUIPO',formId:'1Ila0fWY-bAq5Biuzn5Hp1_CdcDiiLXex91x62zKCUkk',desired:'ANYONE_WITH_LINK'},
  {key:'PARTIDO',formId:'1ZujRoboJGqqkKQJBwJeD1UNMiIYnDzstSWL24n_TtCA',desired:'ANYONE_WITH_LINK'},
  {key:'TABLA',formId:'1teEHaQ1xRGJX3Y0sFsF7Y_j67usO-wssXgzCqpPYfUc',desired:'ANYONE_WITH_LINK'},
  {key:'MAINTENANCE',formId:'1vry-EQ7V_DvD6ZF64OaHk4KXtTjtvonIfnnYaG1rruw',desired:'ANYONE_WITH_LINK'},
  {key:'REVIEW',formId:'1YHuKTdApT0dawISYNAolVjn1HlpI7cuBQOs8T7cRgnw',desired:'DOMAIN_ONLY'}
];

function isPublishedResponder(p){return p?.role==='reader'&&p?.view==='published';}
function isAnyoneResponder(p){return isPublishedResponder(p)&&p?.type==='anyone';}
function isCudoDomainResponder(p){return isPublishedResponder(p)&&p?.type==='domain'&&p?.domain==='cudo.cl';}
function sanitizePermission(p){return {
  id:p?.id||null,
  type:p?.type||null,
  role:p?.role||null,
  view:p?.view||null,
  domain:p?.domain||null,
  allowFileDiscovery:p?.allowFileDiscovery??null
};}

async function getAccessToken(){
  const values={
    client_id:process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID||'',
    client_secret:process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET||'',
    refresh_token:process.env.CUDO_GOOGLE_REFRESH_TOKEN||''
  };
  for(const [key,value] of Object.entries(values)) if(!value) throw new Error(`${key} missing`);
  const body=new URLSearchParams({...values,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh failed HTTP ${r.status}: ${d.error_description||d.error||'unknown'}`);
  return d.access_token;
}

async function driveJson(access,url,options={}){
  const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',...(options.headers||{})}});
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{data={raw:text.slice(0,500)};}
  if(!r.ok) throw new Error(`Drive API HTTP ${r.status}: ${data?.error?.message||text.slice(0,200)||'unknown'}`);
  return data;
}

async function listPermissions(access,formId){
  const fields=encodeURIComponent('permissions(id,type,role,view,domain,allowFileDiscovery)');
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(formId)}/permissions?includePermissionsForView=published&fields=${fields}`;
  const d=await driveJson(access,url);
  return d.permissions||[];
}

async function createAnyonePublishedResponder(access,formId){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(formId)}/permissions?sendNotificationEmail=false`;
  return driveJson(access,url,{method:'POST',body:JSON.stringify({type:'anyone',role:'reader',view:'published',allowFileDiscovery:false})});
}

async function run(){
  const access=await getAccessToken();
  const evidence={
    ok:false,
    mode:APPLY?'APPLY':'DRY_RUN',
    generated_at:new Date().toISOString(),
    organization_wide_change:false,
    real_form_submission:false,
    targets:[],
    created_permission_ids:{},
    rollback:'DELETE_ONLY_CREATED_ANYONE_PUBLISHED_PERMISSION_IDS',
    assertions:{review_remains_domain_only:false,all_public_targets_anyone:false}
  };

  for(const target of TARGETS){
    const before=await listPermissions(access,target.formId);
    const domainBefore=before.some(isCudoDomainResponder);
    const anyoneBefore=before.some(isAnyoneResponder);
    if(!domainBefore) throw new Error(`${target.key}: expected existing cudo.cl published responder permission missing; refuse change`);

    const row={key:target.key,desired:target.desired,before:{domain_cudo_cl:domainBefore,anyone:anyoneBefore,permissions:before.map(sanitizePermission)},action:'NONE'};

    if(target.desired==='DOMAIN_ONLY'){
      if(anyoneBefore) throw new Error(`${target.key}: anyone responder unexpectedly present; refuse automatic security broadening/cleanup`);
      row.action='PRESERVE_DOMAIN_ONLY';
    }else if(anyoneBefore){
      row.action='ALREADY_ANYONE_WITH_LINK';
    }else if(APPLY){
      const created=await createAnyonePublishedResponder(access,target.formId);
      row.action='CREATED_ANYONE_WITH_LINK';
      if(created?.id) evidence.created_permission_ids[target.key]=created.id;
    }else{
      row.action='WOULD_CREATE_ANYONE_WITH_LINK';
    }

    const after=APPLY?await listPermissions(access,target.formId):before;
    row.after={
      domain_cudo_cl:after.some(isCudoDomainResponder),
      anyone:after.some(isAnyoneResponder),
      permissions:after.map(sanitizePermission)
    };

    if(target.desired==='DOMAIN_ONLY'&&row.after.anyone) throw new Error(`${target.key}: protected REVIEW gained anyone responder permission`);
    if(target.desired==='ANYONE_WITH_LINK'&&APPLY&&!row.after.anyone) throw new Error(`${target.key}: apply completed but anyone responder permission not observed`);
    evidence.targets.push(row);
  }

  const review=evidence.targets.find(t=>t.key==='REVIEW');
  evidence.assertions.review_remains_domain_only=Boolean(review?.after?.domain_cudo_cl&&!review?.after?.anyone);
  evidence.assertions.all_public_targets_anyone=evidence.targets.filter(t=>t.desired==='ANYONE_WITH_LINK').every(t=>APPLY?t.after.anyone:(!t.before.anyone&&t.action==='WOULD_CREATE_ANYONE_WITH_LINK')||t.before.anyone);
  if(!evidence.assertions.review_remains_domain_only) throw new Error('REVIEW protection assertion failed');
  if(!evidence.assertions.all_public_targets_anyone) throw new Error('public target responder assertion failed');
  evidence.ok=true;
  fs.mkdirSync(path.dirname(EVIDENCE_PATH),{recursive:true});
  fs.writeFileSync(EVIDENCE_PATH,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({
    ok:true,
    mode:evidence.mode,
    actions:Object.fromEntries(evidence.targets.map(t=>[t.key,t.action])),
    review_remains_domain_only:evidence.assertions.review_remains_domain_only,
    all_public_targets_anyone:evidence.assertions.all_public_targets_anyone,
    created_keys:Object.keys(evidence.created_permission_ids)
  },null,2));
}

await run();
