import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) {
  if(!value) throw new Error(`${name} no configurado`);
}

async function refreshAccessToken(){
  const body=new URLSearchParams({
    client_id:CLIENT_ID,
    client_secret:CLIENT_SECRET,
    refresh_token:REFRESH_TOKEN,
    grant_type:'refresh_token'
  });
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh fallo HTTP ${r.status}: ${d.error_description||d.error||'desconocido'}`);
  return {accessToken:d.access_token,scope:String(d.scope||'').split(/\s+/).filter(Boolean)};
}

async function googleJson(url,accessToken,label){
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`${label} HTTP ${r.status}: ${d.error?.message||d.error_description||d.error||'desconocido'}`);
  return d;
}

async function listForms(accessToken){
  const q="mimeType='application/vnd.google-apps.form' and trashed=false";
  const fields='nextPageToken,files(id,name,modifiedTime,webViewLink,owners(displayName))';
  let pageToken='';
  const files=[];
  do {
    const params=new URLSearchParams({q,pageSize:'1000',fields});
    if(pageToken) params.set('pageToken',pageToken);
    const d=await googleJson(`https://www.googleapis.com/drive/v3/files?${params}`,accessToken,'Drive files.list Forms');
    files.push(...(d.files||[]));
    pageToken=d.nextPageToken||'';
  } while(pageToken);
  return files;
}

async function publishedPermissions(accessToken,fileId){
  const params=new URLSearchParams({
    includePermissionsForView:'published',
    fields:'permissions(id,type,role,view)'
  });
  const d=await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?${params}`,accessToken,`Drive permissions.list ${fileId}`);
  return d.permissions||[];
}

const {accessToken,scope}=await refreshAccessToken();
const report={
  ok:false,
  mode:'READ_ONLY_NO_EXTERNAL_WRITES',
  method:'DRIVE_PUBLISHED_PERMISSIONS_ONLY',
  generated_at:new Date().toISOString(),
  oauth_scopes:scope,
  drive_forms_count:0,
  forms:[],
  errors:[]
};

let files=[];
try {
  files=await listForms(accessToken);
  report.drive_forms_count=files.length;
} catch(error) {
  report.errors.push(String(error?.message||error));
}

for(const file of files){
  try {
    const permissions=await publishedPermissions(accessToken,file.id);
    const publishedReaders=permissions.filter(p=>p.view==='published'&&p.role==='reader');
    report.forms.push({
      file_id:file.id,
      name:file.name||null,
      modified_time:file.modifiedTime||null,
      owner_names:(file.owners||[]).map(o=>o.displayName).filter(Boolean),
      published_reader_types:[...new Set(publishedReaders.map(p=>p.type).filter(Boolean))].sort(),
      published_reader_count:publishedReaders.length,
      anyone_with_link:publishedReaders.some(p=>p.type==='anyone')
    });
  } catch(error) {
    report.forms.push({file_id:file.id,name:file.name||null,acl_error:String(error?.message||error)});
  }
}

report.forms.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es'));
report.ok=report.drive_forms_count>0 && report.forms.length===report.drive_forms_count && report.forms.every(x=>typeof x.anyone_with_link==='boolean');
fs.mkdirSync('qa-google-forms-acl',{recursive:true});
fs.writeFileSync('qa-google-forms-acl/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
