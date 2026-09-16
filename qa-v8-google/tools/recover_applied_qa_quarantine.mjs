import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODULES, REVIEW_SHEET_ID, canonicalDecision, resolveContentType } from './process_review_decisions.mjs';
import { publicNoticiaItem, rowContainsSyntheticMarker } from './process_review_decisions_qa_quarantine.mjs';

const EXPECTED_BRANCH='qa/review-event-no-prod-20260915';

function rowsToObjects(values){
  if(!values.length) return [];
  const headers=values[0].map(v=>String(v??'').trim());
  return values.slice(1).map((row,index)=>({__row:index+2,...Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()]))}));
}

async function getAccessToken(){
  const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}`);
  return d.access_token;
}

async function readValues(token,spreadsheetId,range){
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});
  const d=await r.json();
  if(!r.ok) throw new Error(`Sheets read ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'unknown'}`);
  return d.values||[];
}

export async function recoverAppliedQuarantine({readValuesFn,marker,overlayPath='qa-v8-google/qa_review_overrides/noticias.json'}){
  if(!/^CUDO-QA-SYNTH-NOTICIA-\d+$/.test(marker)) throw new Error('Recovery: marker sintético inválido');
  const audit=rowsToObjects(await readValuesFn(REVIEW_SHEET_ID,'AUDITORIA_REVISION!A:P'));
  const matches=audit.filter(row=>
    String(row.IDENTIFICADOR_HUMANO||'').trim()===marker &&
    resolveContentType(row.TIPO_CONTENIDO)==='NOTICIA' &&
    canonicalDecision(row.DECISION)==='PUBLISH' &&
    String(row.ESTADO_PROCESO||'').trim().toUpperCase()==='APLICADO'
  );
  if(matches.length!==1) throw new Error(`Recovery: se esperaba 1 auditoría aplicada y llegaron ${matches.length}`);
  const auditRow=matches[0];
  if(!String(auditRow.RESULTADO||'').toLowerCase().includes('cuarentena')) throw new Error('Recovery: auditoría no acredita cuarentena QA');
  const resolvedId=String(auditRow.ID_RESUELTO||'').trim();
  if(!resolvedId) throw new Error('Recovery: auditoría aplicada sin ID_RESUELTO');

  const operational=rowsToObjects(await readValuesFn(MODULES.NOTICIA.spreadsheetId,`${MODULES.NOTICIA.operationalSheet}!A:Z`));
  const targets=operational.filter(row=>String(row.ID_NOTICIA||'').trim()===resolvedId);
  if(targets.length!==1) throw new Error(`Recovery: ID resuelto tiene ${targets.length} filas operacionales`);
  const target=targets[0];
  if(!rowContainsSyntheticMarker(target,marker)) throw new Error('Recovery: fila operacional no contiene marker sintético');

  const revisions=await readValuesFn(MODULES.NOTICIA.spreadsheetId,`${MODULES.NOTICIA.revisionSheet}!A:Z`);
  const sharedRevisionHits=revisions.slice(1).filter(row=>String(row[0]??'').trim()===resolvedId).length;
  if(sharedRevisionHits!==0) throw new Error(`Recovery: REVISION compartida contiene ${sharedRevisionHits} fila(s) para ${resolvedId}`);

  const publicExport=await readValuesFn(MODULES.NOTICIA.spreadsheetId,'PUBLICO_EXPORT!A:Z');
  const sharedPublicHits=publicExport.slice(1).filter(row=>row.some(v=>[marker,resolvedId].some(needle=>String(v??'').includes(needle)))).length;
  if(sharedPublicHits!==0) throw new Error(`Recovery: PUBLICO_EXPORT compartido contiene ${sharedPublicHits} fila(s) sintéticas`);

  const item=publicNoticiaItem(target,resolvedId);
  fs.mkdirSync(path.dirname(overlayPath),{recursive:true});
  let doc={schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',items:[]};
  if(fs.existsSync(overlayPath)) doc=JSON.parse(fs.readFileSync(overlayPath,'utf8'));
  doc.schema_version='1.0';
  doc.mode='QA_SYNTHETIC_QUARANTINE';
  doc.items=Array.isArray(doc.items)?doc.items.filter(x=>x.id!==item.id):[];
  doc.items.push(item);
  fs.writeFileSync(overlayPath,JSON.stringify(doc,null,2)+'\n');
  return {ok:true,mode:'RECOVER_APPLIED_QA_QUARANTINE',marker,id:resolvedId,audit_row:auditRow.__row,shared_revision_hits:0,shared_public_export_hits:0,overlay_items:doc.items.length,item};
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain){
  if(process.env.GITHUB_REF_NAME&&process.env.GITHUB_REF_NAME!==EXPECTED_BRANCH) throw new Error(`Recovery: branch inválida ${process.env.GITHUB_REF_NAME}`);
  const marker=process.env.CUDO_QA_RECOVERY_MARKER||'';
  const token=await getAccessToken();
  const result=await recoverAppliedQuarantine({marker,readValuesFn:(sheet,range)=>readValues(token,sheet,range)});
  console.log(JSON.stringify(result,null,2));
}
