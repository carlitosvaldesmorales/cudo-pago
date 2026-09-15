import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
export const RESPONSE_SHEET='Respuestas de formulario 1';
export const AUDIT_SHEET='AUDITORIA_REVISION';
export const AUDIT_HEADERS=['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','OBSERVACIONES','REVISOR','ESTADO_PROCESO','ID_RESUELTO','COINCIDENCIAS','RESULTADO','FECHA_APLICACION','CAMPO_CORRECCION','NUEVO_VALOR'];
export const RESPONSE_PREFIX_HEADERS=['Marca temporal','¿Qué contenido desea revisar?','Identifique el contenido','Decisión de revisión','¿La publicación está autorizada?','Si aparecen menores, ¿la autorización fue verificada?','Observaciones de revisión','Nombre del revisor'];

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_PATH=path.resolve(__dirname,'../review_ingestion_state.json');

export function loadIngestionState(statePath=DEFAULT_STATE_PATH){
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  if(!Number.isInteger(state.historical_baseline_through_response_row)||state.historical_baseline_through_response_row<1){
    throw new Error('review_ingestion_state.json: historical_baseline_through_response_row inválido');
  }
  return state;
}

function clean(value){return String(value??'').trim();}
function isBlankRow(row){return !row.some(value=>clean(value)!=='');}
function assertResponseHeaders(values){
  if(!values.length) throw new Error(`${RESPONSE_SHEET}: sin encabezados`);
  const actual=values[0].slice(0,RESPONSE_PREFIX_HEADERS.length).map(clean);
  if(JSON.stringify(actual)!==JSON.stringify(RESPONSE_PREFIX_HEADERS)){
    throw new Error(`${RESPONSE_SHEET}: contrato A:H inesperado: ${actual.join('|')}`);
  }
}
function assertAuditHeaders(values){
  if(!values.length) throw new Error(`${AUDIT_SHEET}: sin encabezados`);
  const actual=values[0].slice(0,AUDIT_HEADERS.length).map(clean);
  if(JSON.stringify(actual)!==JSON.stringify(AUDIT_HEADERS)){
    throw new Error(`${AUDIT_SHEET}: contrato inesperado: ${actual.join('|')}`);
  }
}

export function stableReviewId({submittedAt,contentType,identifier,decision,authorizationPublication,authorizationMinors,observations,reviewer,correctionField,newValue}){
  const canonical=[submittedAt,contentType,identifier,decision,authorizationPublication,authorizationMinors,observations,reviewer,correctionField,newValue].map(clean);
  const digest=crypto.createHash('sha256').update(JSON.stringify(canonical),'utf8').digest('hex').slice(0,16).toUpperCase();
  return `CUDO-REV-${digest}`;
}

export function responseRowToAudit(row,rowNumber){
  if(isBlankRow(row)) return null;
  const submittedAt=clean(row[0]);
  const contentType=clean(row[1]);
  const identifier=clean(row[2]);
  const decision=clean(row[3]);
  const authorizationPublication=clean(row[4]);
  const authorizationMinors=clean(row[5]);
  const observations=clean(row[6]);
  const reviewer=clean(row[7]);
  // La hoja conserva encabezados históricos duplicados desde I:Q. La evidencia real demuestra
  // que las preguntas 8 y 9 vigentes del FORM_SPEC se escriben actualmente en I/J.
  const correctionField=clean(row[8]);
  const newValue=clean(row[9]);
  const required={submittedAt,contentType,identifier,decision,authorizationPublication,authorizationMinors,reviewer};
  const missing=Object.entries(required).filter(([,value])=>!value).map(([key])=>key);
  if(missing.length) throw new Error(`${RESPONSE_SHEET}!${rowNumber}: respuesta incompleta (${missing.join(',')})`);
  const id=stableReviewId({submittedAt,contentType,identifier,decision,authorizationPublication,authorizationMinors,observations,reviewer,correctionField,newValue});
  return {
    source_row:rowNumber,
    id,
    decision,
    content_type:contentType,
    has_correction:Boolean(correctionField||newValue),
    audit_row:[id,submittedAt,contentType,identifier,decision,authorizationPublication,authorizationMinors,observations,reviewer,'','','','','',correctionField,newValue]
  };
}

export async function planReviewResponseIngestion({readValues,state=loadIngestionState(),reviewSheetId=REVIEW_SHEET_ID,expectedNew=null}){
  const responses=await readValues(reviewSheetId,`'${RESPONSE_SHEET}'!A:Q`);
  const audit=await readValues(reviewSheetId,`${AUDIT_SHEET}!A:P`);
  assertResponseHeaders(responses);
  assertAuditHeaders(audit);

  const existingIds=new Set(audit.slice(1).map(row=>clean(row[0])).filter(Boolean));
  const baselineThrough=state.historical_baseline_through_response_row;
  const baseline=[];
  const duplicates=[];
  const newEntries=[];

  for(let i=1;i<responses.length;i++){
    const rowNumber=i+1;
    const row=responses[i]||[];
    if(isBlankRow(row)) continue;
    if(rowNumber<=baselineThrough){baseline.push(rowNumber);continue;}
    const entry=responseRowToAudit(row,rowNumber);
    if(existingIds.has(entry.id)){duplicates.push({source_row:rowNumber,id:entry.id});continue;}
    newEntries.push(entry);
  }

  if(expectedNew!==null&&newEntries.length!==expectedNew){
    throw new Error(`Safety gate ingestión: respuestas nuevas ${newEntries.length}, esperado ${expectedNew}. No se aplicó ninguna escritura.`);
  }

  return {
    ok:true,
    baseline_through_response_row:baselineThrough,
    historical_baseline_rows:baseline,
    duplicate_count:duplicates.length,
    duplicates,
    new_count:newEntries.length,
    new_entries:newEntries,
    mutations:newEntries.length?[{op:'append',spreadsheetId:reviewSheetId,range:`${AUDIT_SHEET}!A:P`,values:newEntries.map(entry=>entry.audit_row)}]:[]
  };
}

export async function ingestReviewResponses({readValues,appendValues,apply=false,...rest}){
  const plan=await planReviewResponseIngestion({readValues,...rest});
  if(apply){
    for(const mutation of plan.mutations) await appendValues(mutation.spreadsheetId,mutation.range,mutation.values);
  }
  return {...plan,apply,writes_applied:apply?plan.mutations.length:0,rows_appended:apply?plan.new_count:0};
}

async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function getAccessToken(){
  const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID,CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${d.error_description||d.error||'desconocido'}`);
  return d.access_token;
}
async function productionAdapter(){
  const token=await getAccessToken();
  return {
    readValues:async(spreadsheetId,range)=>{
      const url=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
      let last;
      for(let i=0;i<5;i++){
        const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}}),d=await r.json();
        if(r.ok) return d.values||[];
        last={status:r.status,data:d};
        if(![429,500,502,503,504].includes(r.status)||i===4) break;
        await sleep(750*(2**i));
      }
      throw new Error(`Sheets read ${spreadsheetId}/${range} HTTP ${last?.status}: ${last?.data?.error?.message||'desconocido'}`);
    },
    appendValues:async(spreadsheetId,range,values)=>{
      const url=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})}),d=await r.json();
      if(!r.ok) throw new Error(`Sheets append ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);
      return d;
    }
  };
}

const isMain=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  const adapter=await productionAdapter();
  const expectedRaw=process.env.CUDO_REVIEW_INGEST_EXPECT_NEW;
  const expectedNew=expectedRaw===undefined||expectedRaw===''?null:Number(expectedRaw);
  if(expectedNew!==null&&!Number.isInteger(expectedNew)) throw new Error('CUDO_REVIEW_INGEST_EXPECT_NEW debe ser entero');
  const apply=String(process.env.CUDO_REVIEW_INGEST_APPLY||'').toLowerCase()==='true';
  const result=await ingestReviewResponses({...adapter,apply,expectedNew});
  console.log(JSON.stringify({
    ok:result.ok,
    mode:apply?'APPLY_NEW_FORM_RESPONSES':'DRY_RUN_NEW_FORM_RESPONSES',
    baseline_through_response_row:result.baseline_through_response_row,
    historical_baseline_rows:result.historical_baseline_rows,
    duplicate_count:result.duplicate_count,
    new_count:result.new_count,
    new_entries:result.new_entries.map(entry=>({source_row:entry.source_row,id:entry.id,content_type:entry.content_type,decision:entry.decision,has_correction:entry.has_correction})),
    writes_applied:result.writes_applied,
    rows_appended:result.rows_appended
  },null,2));
}
