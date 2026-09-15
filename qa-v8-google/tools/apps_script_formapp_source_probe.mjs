const SCRIPT_ID='1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8';
const FORMS={
  EQUIPO:'1Ila0fWY-bAq5Biuzn5Hp1_CdcDiiLXex91x62zKCUkk',
  PARTIDO:'1ZujRoboJGqqkKQJBwJeD1UNMiIYnDzstSWL24n_TtCA',
  TABLA:'1teEHaQ1xRGJX3Y0sFsF7Y_j67usO-wssXgzCqpPYfUc',
  REVIEW:'1YHuKTdApT0dawISYNAolVjn1HlpI7cuBQOs8T7cRgnw',
  MAINTENANCE:'1vry-EQ7V_DvD6ZF64OaHk4KXtTjtvonIfnnYaG1rruw'
};

async function token(){
  const body=new URLSearchParams({
    client_id:process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID||'',
    client_secret:process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET||'',
    refresh_token:process.env.CUDO_GOOGLE_REFRESH_TOKEN||'',
    grant_type:'refresh_token'
  });
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json(); if(!r.ok||!d.access_token) throw new Error(`OAuth ${r.status}`); return d.access_token;
}

function functions(src){return [...src.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].map(m=>m[1]);}
function calls(src){
  const names=['FormApp.openById','FormApp.getActiveForm','FormApp.create','setDestination','getDestinationId','getPublishedUrl','getEditUrl','getItems','getTitle','getCollectEmail','getLimitOneResponsePerUser','requiresLogin','SpreadsheetApp.openById','ScriptApp.newTrigger'];
  return names.filter(n=>src.includes(n));
}
function ids(src){return [...new Set([...src.matchAll(/["'`]([A-Za-z0-9_-]{30,})["'`]/g)].map(m=>m[1]).filter(v=>v.length>=35&&v.length<=80))];}
function setters(src){return [...new Set([...src.matchAll(/\.((?:set|add)[A-Z][A-Za-z0-9_]*)\s*\(/g)].map(m=>m[1]))].sort();}
function accessSignals(src){
  const needles=['setCollectEmail','setLimitOneResponsePerUser','setRequireLogin','requiresLogin','setAcceptingResponses','setDestination'];
  return Object.fromEntries(needles.map(n=>[n,src.includes(n)]));
}

async function responderPermissions(access){
  const result={};
  for(const [key,formId] of Object.entries(FORMS)){
    const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(formId)}/permissions?includePermissionsForView=published&fields=permissions(id,type,role,view,domain,allowFileDiscovery)`;
    const r=await fetch(url,{headers:{Authorization:`Bearer ${access}`}});
    const d=await r.json();
    if(!r.ok){
      result[key]={ok:false,http:r.status,error:d?.error?.message||'unknown'};
      continue;
    }
    const perms=(d.permissions||[]).map(p=>({type:p.type||null,role:p.role||null,view:p.view||null,domain:p.domain||null,allowFileDiscovery:p.allowFileDiscovery??null}));
    result[key]={
      ok:true,
      anyone_with_link_responder:perms.some(p=>p.type==='anyone'&&p.role==='reader'&&p.view==='published'),
      responder_permission_shapes:perms
    };
  }
  return result;
}

const access=await token();
const r=await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/content`,{headers:{Authorization:`Bearer ${access}`}});
const d=await r.json(); if(!r.ok) throw new Error(JSON.stringify(d));
const selected=(d.files||[]).filter(f=>['FormAudit','SafeProvision','Maintenance','Review','ReviewApply','Code','PartidosBranching'].includes(f.name)).map(f=>({
  name:f.name,
  functions:functions(f.source||''),
  relevant_calls:calls(f.source||''),
  setter_calls:setters(f.source||''),
  access_signals:accessSignals(f.source||''),
  literal_ids:ids(f.source||'')
}));
const form_responder_permissions=await responderPermissions(access);
console.log(JSON.stringify({ok:true,mode:'READONLY_APPS_SCRIPT_CAPABILITY_PROBE',selected,form_responder_permissions},null,2));
