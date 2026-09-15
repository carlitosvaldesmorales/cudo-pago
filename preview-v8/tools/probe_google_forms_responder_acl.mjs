import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) {
  if(!value) throw new Error(`${name} no configurado`);
}

const EXPECTED_FORMS=[
  {
    file_id:'1Ila0fWY-bAq5Biuzn5Hp1_CdcDiiLXex91x62zKCUkk',
    name:'CUDO QA · Equipos',
    role:'CONTENT_INPUT',
    anyone_with_link:true
  },
  {
    file_id:'1ZujRoboJGqqkKQJBwJeD1UNMiIYnDzstSWL24n_TtCA',
    name:'CUDO QA · Partidos y Resultados',
    role:'CONTENT_INPUT',
    anyone_with_link:true
  },
  {
    file_id:'1teEHaQ1xRGJX3Y0sFsF7Y_j67usO-wssXgzCqpPYfUc',
    name:'CUDO QA · Tabla de Posiciones',
    role:'CONTENT_INPUT',
    anyone_with_link:true
  },
  {
    file_id:'1vry-EQ7V_DvD6ZF64OaHk4KXtTjtvonIfnnYaG1rruw',
    name:'CUDO QA · Corregir o retirar contenido publicado',
    role:'CONTENT_MAINTENANCE_REQUEST',
    anyone_with_link:true
  },
  {
    file_id:'1YHuKTdApT0dawISYNAolVjn1HlpI7cuBQOs8T7cRgnw',
    name:'CUDO QA · Revisar contenido antes de publicar',
    role:'AUTHORIZED_REVIEW',
    anyone_with_link:false
  }
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
  if(!r.ok) throw new Error(`${label} HTTP ${r.status}: ${d.error?.message||d.error_description||d.error||'desconocido'}`);
  return d;
}

async function driveFile(accessToken,fileId){
  const params=new URLSearchParams({fields:'id,name,mimeType,modifiedTime,owners(displayName)'});
  return googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,accessToken,`Drive files.get ${fileId}`);
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
  contract:EXPECTED_FORMS.map(({file_id,name,role,anyone_with_link})=>({file_id,name,role,anyone_with_link})),
  forms:[],
  failures:[]
};

for(const expected of EXPECTED_FORMS){
  try {
    const file=await driveFile(accessToken,expected.file_id);
    if(file.mimeType!=='application/vnd.google-apps.form') throw new Error(`${expected.name}: MIME inesperado ${file.mimeType}`);
    if(file.name!==expected.name) throw new Error(`${expected.file_id}: nombre inesperado '${file.name}' != '${expected.name}'`);
    const permissions=await publishedPermissions(accessToken,expected.file_id);
    const publishedReaders=permissions.filter(p=>p.view==='published'&&p.role==='reader');
    const anyoneWithLink=publishedReaders.some(p=>p.type==='anyone');
    const actual={
      file_id:file.id,
      name:file.name,
      role:expected.role,
      modified_time:file.modifiedTime||null,
      owner_names:(file.owners||[]).map(o=>o.displayName).filter(Boolean),
      published_reader_types:[...new Set(publishedReaders.map(p=>p.type).filter(Boolean))].sort(),
      published_reader_count:publishedReaders.length,
      expected_anyone_with_link:expected.anyone_with_link,
      anyone_with_link:anyoneWithLink,
      contract_ok:anyoneWithLink===expected.anyone_with_link
    };
    report.forms.push(actual);
    if(!actual.contract_ok){
      report.failures.push(`${expected.name}: anyone_with_link=${anyoneWithLink}, esperado ${expected.anyone_with_link}`);
    }
  } catch(error) {
    report.forms.push({file_id:expected.file_id,name:expected.name,role:expected.role,error:String(error?.message||error)});
    report.failures.push(String(error?.message||error));
  }
}

report.ok=report.failures.length===0 && report.forms.length===EXPECTED_FORMS.length;
fs.mkdirSync('qa-google-forms-acl',{recursive:true});
fs.writeFileSync('qa-google-forms-acl/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
