import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);

const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const MODULES={
  NOTICIA:{spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',sheet:'PUBLICO_EXPORT',controlSheets:['NOTICIAS']},
  EQUIPO:{spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',sheet:'PUBLICO_EXPORT',controlSheets:['CONTROL']},
  PLANTEL:{spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',sheet:'PUBLICO_EXPORT',controlSheets:['PLANTEL_CONTROL']},
  PARTIDO:{spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',sheet:'PUBLICO_EXPORT',controlSheets:['CONTROL']},
  TABLA:{spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',sheet:'PUBLICO_EXPORT',controlSheets:['CONTROL']},
  GALERIA:{spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',sheet:'PUBLICO_EXPORT',controlSheets:['CONTROL']}
};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function token(){
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${d.error_description||d.error||'desconocido'}`);
  return d.access_token;
}

async function googleJson(url,accessToken,label){
  let last;
  for(let i=0;i<5;i++){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
    const d=await r.json().catch(()=>({}));
    if(r.ok) return d;
    last={status:r.status,data:d};
    if(![429,500,502,503,504].includes(r.status)||i===4) break;
    await sleep(750*(2**i));
  }
  throw new Error(`${label} HTTP ${last?.status}: ${last?.data?.error?.message||'desconocido'}`);
}

async function readValues(accessToken,spreadsheetId,range){
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const d=await googleJson(u,accessToken,`Sheets read ${spreadsheetId}/${range}`);
  return d.values||[];
}

async function spreadsheetMetadata(accessToken,spreadsheetId){
  const fields=encodeURIComponent('properties(title),sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))');
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false&fields=${fields}`;
  return googleJson(u,accessToken,`Sheets metadata ${spreadsheetId}`);
}

function quoteSheet(title){return `'${title.replaceAll("'","''")}'`;}

function nonSensitiveRevisionSamples(revision){
  if(!revision.length) return [];
  const headers=revision[0].map(v=>String(v||'').trim());
  const excluded=new Set(['ID','REVISOR','FECHA_REVISION','OBSERVACIONES']);
  return revision.slice(1,4).map(row=>Object.fromEntries(headers
    .map((h,i)=>[h,String(row[i]??'').trim()])
    .filter(([h])=>h&&!excluded.has(h))));
}

async function nonSensitiveStage(accessToken,spreadsheetId,title){
  const q=quoteSheet(title);
  const headerRows=await readValues(accessToken,spreadsheetId,`${q}!A1:AZ1`);
  const columnA=await readValues(accessToken,spreadsheetId,`${q}!A:A`);
  return {
    sheet:title,
    rows:Math.max(0,columnA.length-1),
    headers:(headerRows[0]||[]).map(v=>String(v||'').trim()).filter(Boolean)
  };
}

const report={
  ok:false,
  mode:'READ_ONLY_NO_EXTERNAL_WRITES',
  privacy:'HEADERS_AND_ROW_COUNTS_ONLY_FOR_CAPTURE_RAW_CONTROL_STAGES',
  timestamp:new Date().toISOString(),
  review_sheet:null,
  modules:{},
  errors:[]
};

try{
  const accessToken=await token();
  const audit=await readValues(accessToken,REVIEW_SHEET_ID,'AUDITORIA_REVISION!A:P');
  if(!audit.length) throw new Error('AUDITORIA_REVISION sin encabezados');
  const headers=audit[0].map(v=>String(v||'').trim());
  const idx=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const required=['ID_REVISION','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','ESTADO_PROCESO'];
  for(const h of required) if(idx[h]===undefined) throw new Error(`Falta columna ${h} en AUDITORIA_REVISION`);

  const pending=audit.slice(1).filter(row=>{
    const id=String(row[idx.IDENTIFICADOR_HUMANO]||'').trim();
    const type=String(row[idx.TIPO_CONTENIDO]||'').trim();
    const decision=String(row[idx.DECISION]||'').trim();
    const state=String(row[idx.ESTADO_PROCESO]||'').trim();
    return Boolean(id&&type&&decision&&!state);
  });
  const countsByType={};
  for(const row of pending){
    const type=String(row[idx.TIPO_CONTENIDO]||'').trim()||'(vacío)';
    countsByType[type]=(countsByType[type]||0)+1;
  }
  const historicalTypes={};
  for(const row of audit.slice(1)){
    const type=String(row[idx.TIPO_CONTENIDO]||'').trim();
    if(type) historicalTypes[type]=(historicalTypes[type]||0)+1;
  }
  report.review_sheet={headers,audit_rows:Math.max(0,audit.length-1),historical_types:historicalTypes,pending_decisions:pending.length,pending_by_type:countsByType};

  for(const [key,module] of Object.entries(MODULES)){
    try{
      const metadata=await spreadsheetMetadata(accessToken,module.spreadsheetId);
      const sheetTitles=(metadata.sheets||[]).map(s=>s.properties?.title).filter(Boolean);
      const values=await readValues(accessToken,module.spreadsheetId,`${module.sheet}!A:Z`);
      const hasRevision=sheetTitles.includes('REVISION');
      const revision=hasRevision?await readValues(accessToken,module.spreadsheetId,'REVISION!A:H'):[];
      const rawSheets=sheetTitles.filter(title=>/^RAW_FORM_/i.test(title));
      const providerCaptureSheets=sheetTitles.filter(title=>/^Respuestas de formulario/i.test(title)||/^TALLY_/i.test(title)||/^Subir fotos/i.test(title));
      const controlSheets=module.controlSheets.filter(title=>sheetTitles.includes(title));
      const stages={provider_capture:[],raw:[],control:[],revision:[],public_export:[]};
      for(const title of providerCaptureSheets) stages.provider_capture.push(await nonSensitiveStage(accessToken,module.spreadsheetId,title));
      for(const title of rawSheets) stages.raw.push(await nonSensitiveStage(accessToken,module.spreadsheetId,title));
      for(const title of controlSheets) stages.control.push(await nonSensitiveStage(accessToken,module.spreadsheetId,title));
      if(hasRevision) stages.revision.push(await nonSensitiveStage(accessToken,module.spreadsheetId,'REVISION'));
      stages.public_export.push(await nonSensitiveStage(accessToken,module.spreadsheetId,module.sheet));

      report.modules[key]={
        spreadsheet_title:metadata.properties?.title||null,
        sheet_titles:sheetTitles,
        stages,
        raw_form_sheets:rawSheets,
        control_sheets:controlSheets,
        has_revision:hasRevision,
        revision_rows:Math.max(0,revision.length-1),
        revision_headers:revision[0]?.map(v=>String(v||'').trim()).filter(Boolean)||[],
        revision_state_samples:nonSensitiveRevisionSamples(revision),
        public_export_rows:Math.max(0,values.length-1),
        public_export_headers:values[0]?.map(v=>String(v||'').trim()).filter(Boolean)||[]
      };
    }catch(error){
      report.errors.push(`${key}: ${String(error?.message||error)}`);
    }
  }
  report.ok=report.errors.length===0&&Object.keys(report.modules).length===Object.keys(MODULES).length;
}catch(error){
  report.errors.push(String(error?.message||error));
}

fs.mkdirSync('qa-review-probe',{recursive:true});
fs.writeFileSync('qa-review-probe/read-only-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
