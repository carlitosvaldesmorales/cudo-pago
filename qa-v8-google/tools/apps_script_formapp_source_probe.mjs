const SCRIPT_ID='1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8';

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
  const names=['FormApp.openById','FormApp.getActiveForm','FormApp.create','setDestination','getDestinationId','getPublishedUrl','getEditUrl','getItems','getTitle','SpreadsheetApp.openById','ScriptApp.newTrigger'];
  return names.filter(n=>src.includes(n));
}
function ids(src){return [...new Set([...src.matchAll(/["'`]([A-Za-z0-9_-]{30,})["'`]/g)].map(m=>m[1]).filter(v=>v.length>=35&&v.length<=80))];}

const access=await token();
const r=await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/content`,{headers:{Authorization:`Bearer ${access}`}});
const d=await r.json(); if(!r.ok) throw new Error(JSON.stringify(d));
const selected=(d.files||[]).filter(f=>['FormAudit','SafeProvision','Maintenance','Review','ReviewApply','Code','PartidosBranching'].includes(f.name)).map(f=>({
  name:f.name,
  functions:functions(f.source||''),
  relevant_calls:calls(f.source||''),
  literal_ids:ids(f.source||'')
}));
console.log(JSON.stringify({ok:true,mode:'READONLY_APPS_SCRIPT_CAPABILITY_PROBE',selected},null,2));
