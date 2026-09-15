import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) {
  if(!value) throw new Error(`${name} no configurado`);
}

const TARGETS=[
  {label:'Administrar equipo o serie',publishedId:'1FAIpQLScMsSWHj_u6waAtMUSbkyTEr15Ckt1kJPMXaLFNYuWyDzw0uA'},
  {label:'Registrar partido o resultado',publishedId:'1FAIpQLSfD8jwbGL_kUAYm2A6DR3yYmANMoyTr2ja609JTFqBH9zvg2w'},
  {label:'Actualizar tabla',publishedId:'1FAIpQLSf_WwBEVwZkvlDFMHnfO3FOFG7h9eUd-6DG4Rh6MW6kix696Q'},
  {label:'Corregir, actualizar, retirar o reactivar',publishedId:'1FAIpQLSeHt_FhOGLSks4WjGgyuV6NNboyA8dgtT0bQTR8cinH4oonRg'},
  {label:'Revisar contenido pendiente',publishedId:'1FAIpQLScSrCXYIqCQzDSzF22_CBC_uOd20CRnkncWqcQ98nZrE4HgFA'}
];

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
  if(!r.ok) {
    const error=new Error(`${label} HTTP ${r.status}: ${d.error?.message||d.error_description||d.error||'desconocido'}`);
    error.httpStatus=r.status;
    error.google=d;
    throw error;
  }
  return d;
}

function responderPublishedId(uri){
  const m=String(uri||'').match(/\/forms\/d\/e\/([^/]+)\/viewform/);
  return m?.[1]||null;
}

async function listForms(accessToken){
  const q="mimeType='application/vnd.google-apps.form' and trashed=false";
  const fields='nextPageToken,files(id,name,modifiedTime,webViewLink)';
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

async function formMetadata(accessToken,file){
  const fields='formId,info(title,documentTitle),responderUri,publishSettings';
  const params=new URLSearchParams({fields});
  const d=await googleJson(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(file.id)}?${params}`,accessToken,`Forms get ${file.id}`);
  return {
    fileId:file.id,
    name:file.name||null,
    title:d.info?.title||null,
    responderUri:d.responderUri||null,
    publishedId:responderPublishedId(d.responderUri),
    publishSettings:d.publishSettings||null
  };
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
  generated_at:new Date().toISOString(),
  oauth_scopes:scope,
  expected_targets:TARGETS.map(({label,publishedId})=>({label,publishedId})),
  drive_forms_count:null,
  matched:[],
  unmatched:[],
  discovery_errors:[]
};

let driveForms=[];
try {
  driveForms=await listForms(accessToken);
  report.drive_forms_count=driveForms.length;
} catch(error) {
  report.discovery_errors.push(String(error?.message||error));
}

const metadata=[];
if(driveForms.length){
  for(const file of driveForms){
    try {
      metadata.push(await formMetadata(accessToken,file));
    } catch(error) {
      // No abortamos por Forms individuales ajenos al CUDO o no accesibles.
      report.discovery_errors.push(String(error?.message||error));
    }
  }
}

for(const target of TARGETS){
  const candidates=metadata.filter(f=>f.publishedId===target.publishedId);
  if(candidates.length!==1){
    report.unmatched.push({
      label:target.label,
      publishedId:target.publishedId,
      match_count:candidates.length
    });
    continue;
  }
  const form=candidates[0];
  try {
    const permissions=await publishedPermissions(accessToken,form.fileId);
    const publishedReaders=permissions.filter(p=>p.view==='published'&&p.role==='reader');
    const anyoneWithLink=publishedReaders.some(p=>p.type==='anyone');
    report.matched.push({
      label:target.label,
      file_id:form.fileId,
      title:form.title||form.name,
      published_id:form.publishedId,
      is_published:form.publishSettings?.isPublished ?? form.publishSettings?.publishState?.isPublished ?? null,
      is_accepting_responses:form.publishSettings?.isAcceptingResponses ?? form.publishSettings?.publishState?.isAcceptingResponses ?? null,
      published_reader_types:[...new Set(publishedReaders.map(p=>p.type).filter(Boolean))].sort(),
      anyone_with_link:anyoneWithLink
    });
  } catch(error) {
    report.matched.push({
      label:target.label,
      file_id:form.fileId,
      title:form.title||form.name,
      published_id:form.publishedId,
      acl_error:String(error?.message||error)
    });
  }
}

report.ok=report.matched.length===TARGETS.length && report.unmatched.length===0 && report.matched.every(x=>typeof x.anyone_with_link==='boolean');
fs.mkdirSync('qa-google-forms-acl',{recursive:true});
fs.writeFileSync('qa-google-forms-acl/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
