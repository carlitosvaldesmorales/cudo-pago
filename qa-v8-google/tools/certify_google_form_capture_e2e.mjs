import fs from 'node:fs';

const APPLY=String(process.env.CUDO_CAPTURE_QA_APPLY||'').toLowerCase()==='true';
const RUN_ID=process.env.GITHUB_RUN_ID||`local-${Date.now()}`;
const RUN_ATTEMPT=Number(process.env.GITHUB_RUN_ATTEMPT||'1');
if(APPLY&&RUN_ATTEMPT!==1) throw new Error('Safety gate: no se permite re-ejecutar un run APPLY. Cree un run nuevo.');

const MODULES={
  EQUIPO:{
    url:'https://docs.google.com/forms/d/e/1FAIpQLScMsSWHj_u6waAtMUSbkyTEr15Ckt1kJPMXaLFNYuWyDzw0uA/viewform',
    spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',
    provider:'Respuestas de formulario 1',raw:'RAW_FORM_EQUIPOS',control:'CONTROL',public:'PUBLICO_EXPORT',
    marker:`CUDO-QA-SYNTH-EQUIPO-${RUN_ID}`,
    answers:{
      'Nombre público del equipo o serie':`CUDO-QA-SYNTH-EQUIPO-${RUN_ID}`,
      'Serie o categoría':'TERCERA',
      'Presentación pública de la serie':`Registro sintético QA ${RUN_ID}. No representa información real del club y no debe publicarse.`,
      'Estado actual de la serie':'Temporalmente inactiva',
      '¿La información fue confirmada por el club?':'Aún debe revisarse',
      'Nombre de quien registra la información':'CUDO QA Automation',
      'Nota para revisión':`SYNTHETIC_QA_DO_NOT_PUBLISH:${RUN_ID}`
    }
  },
  TABLA:{
    url:'https://docs.google.com/forms/d/e/1FAIpQLSf_WwBEVwZkvlDFMHnfO3FOFG7h9eUd-6DG4Rh6MW6kix696Q/viewform',
    spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',
    provider:'Respuestas de formulario 1',raw:'RAW_FORM_TABLA',control:'CONTROL',public:'PUBLICO_EXPORT',
    marker:`CUDO-QA-SYNTH-TABLA-${RUN_ID}`,
    answers:{
      'Competencia':'Copa/Otro',
      'Serie o categoría':'TERCERA',
      'Posición en la tabla':'1',
      'Nombre del equipo':`CUDO-QA-SYNTH-TABLA-${RUN_ID}`,
      'Partidos jugados (PJ)':'0',
      'Partidos ganados (PG)':'0',
      'Partidos empatados (PE)':'0',
      'Partidos perdidos (PP)':'0',
      'Goles a favor (GF)':'0',
      'Goles en contra (GC)':'0',
      'Jornada o fecha hasta la que está actualizada la tabla':`QA ${RUN_ID}`,
      'Puntos (PTS)':'0',
      'Fuente oficial de la tabla':`SYNTHETIC_QA_NOT_OFFICIAL:${RUN_ID}`,
      'Nombre de quien registra la información':'CUDO QA Automation',
      'Nota para revisión':`SYNTHETIC_QA_DO_NOT_PUBLISH:${RUN_ID}`
    }
  }
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function extractPublicData(html){
  const marker='FB_PUBLIC_LOAD_DATA_ =';
  const idx=html.indexOf(marker); if(idx<0) throw new Error('FB_PUBLIC_LOAD_DATA_ no encontrado');
  let p=html.indexOf('[',idx+marker.length); if(p<0) throw new Error('JSON público no encontrado');
  const start=p; let depth=0,inString=false,escape=false;
  for(;p<html.length;p++){
    const ch=html[p];
    if(inString){if(escape){escape=false;continue;} if(ch==='\\'){escape=true;continue;} if(ch==='"')inString=false; continue;}
    if(ch==='"'){inString=true;continue;} if(ch==='[')depth++; else if(ch===']'&&--depth===0)return JSON.parse(html.slice(start,p+1));
  }
  throw new Error('JSON público incompleto');
}
function stringsDeep(v,out=[]){if(typeof v==='string'&&v.trim())out.push(v.trim());else if(Array.isArray(v))for(const x of v)stringsDeep(x,out);return out;}
function parseQuestions(data){
  const items=data?.[1]?.[1]; if(!Array.isArray(items))throw new Error('Estructura Google Forms inesperada');
  const out=[];
  for(const item of items){
    if(!Array.isArray(item)||typeof item[1]!=='string'||!Array.isArray(item[4])||!item[4].length)continue;
    const e=item[4][0]; if(!Array.isArray(e)||!Number.isInteger(e[0]))continue;
    const title=item[1].trim();
    out.push({title,entry:`entry.${e[0]}`,required:Boolean(e[2]),type:item[3],publicStrings:[...new Set(stringsDeep(item).filter(s=>s!==title))]});
  }
  return out;
}
async function liveSchema(url){
  const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 CUDO-QA-Capture-E2E/1.0'}});
  const html=await r.text(); if(!r.ok)throw new Error(`GET form HTTP ${r.status}`);
  return parseQuestions(extractPublicData(html));
}
function buildSubmission(module,schema){
  const byTitle=new Map(schema.map(q=>[q.title,q])); const body=new URLSearchParams(); const mapped=[];
  for(const [title,value] of Object.entries(module.answers)){
    const q=byTitle.get(title); if(!q)throw new Error(`Pregunta live ausente: ${title}`);
    if(q.type===3 && !q.publicStrings.includes(value)) throw new Error(`Valor '${value}' no aparece como opción pública de '${title}'`);
    body.append(q.entry,value); mapped.push({title,entry:q.entry,value});
  }
  for(const q of schema.filter(q=>q.required)) if(!module.answers[q.title]) throw new Error(`Falta respuesta requerida: ${q.title}`);
  body.append('fvv','1'); body.append('pageHistory','0');
  return {body,mapped,responseEndpoint:module.url.replace(/\/viewform(?:\?.*)?$/,'/formResponse')};
}
async function postForm(endpoint,body){
  const r=await fetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0 CUDO-QA-Capture-E2E/1.0'},body});
  if(![200,302,303].includes(r.status)) throw new Error(`POST formResponse HTTP ${r.status}`);
  return {status:r.status,location:r.headers.get('location')};
}
async function accessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID,client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [k,v] of Object.entries({client_id,client_secret,refresh_token}))if(!v)throw new Error(`${k} no configurado`);
  const body=new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json(); if(!r.ok||!d.access_token)throw new Error(`OAuth refresh HTTP ${r.status}`); return d.access_token;
}
async function readValues(token,spreadsheetId,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}}); const d=await r.json().catch(()=>({}));
    if(r.ok)return d.values||[]; last={status:r.status,msg:d.error?.message};
    if(![429,500,502,503,504].includes(r.status)||i===5)break; await sleep(1500*(i+1));
  }
  throw new Error(`Sheets read ${range} HTTP ${last?.status}: ${last?.msg||'desconocido'}`);
}
function containsMarker(values,marker){return values.some(row=>row.some(v=>String(v??'').includes(marker)));}
async function verifyStages(token,module){
  const deadline=Date.now()+60000; let snapshot;
  while(Date.now()<deadline){
    const provider=await readValues(token,module.spreadsheetId,`'${module.provider}'!A:AZ`);
    const raw=await readValues(token,module.spreadsheetId,`'${module.raw}'!A:AZ`);
    const control=await readValues(token,module.spreadsheetId,`'${module.control}'!A:AZ`);
    const pub=await readValues(token,module.spreadsheetId,`'${module.public}'!A:AZ`);
    snapshot={provider:containsMarker(provider,module.marker),raw:containsMarker(raw,module.marker),control:containsMarker(control,module.marker),public_export:containsMarker(pub,module.marker)};
    if(snapshot.provider&&snapshot.raw&&snapshot.control&&!snapshot.public_export)return snapshot;
    await sleep(3000);
  }
  throw new Error(`Timeout verificando downstream ${JSON.stringify(snapshot)}`);
}

const report={ok:true,mode:APPLY?'SYNTHETIC_QA_APPLY_AND_VERIFY':'DRY_RUN_NO_EXTERNAL_WRITES',run_id:RUN_ID,writes_planned:APPLY?2:0,writes_applied:0,modules:{},errors:[]};
let token=null;
if(APPLY) token=await accessToken();
for(const [key,module] of Object.entries(MODULES)){
  try{
    const schema=await liveSchema(module.url); const submission=buildSubmission(module,schema);
    const item={marker:module.marker,response_endpoint:submission.responseEndpoint,payload:submission.mapped,submitted:false,post:null,stages:null};
    if(APPLY){item.post=await postForm(submission.responseEndpoint,submission.body); item.submitted=true; report.writes_applied++; item.stages=await verifyStages(token,module);}
    report.modules[key]=item;
  }catch(error){report.ok=false;report.errors.push(`${key}: ${String(error?.message||error)}`);}
}
fs.mkdirSync('qa-capture-e2e',{recursive:true});
fs.writeFileSync('qa-capture-e2e/capture-e2e-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);
