import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const STANDARD_REVISION_HEADERS=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION','REVISOR','FECHA_REVISION','OBSERVACIONES'];
export const MODULES={
  NOTICIA:{spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS},
  EQUIPO:{spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS},
  PLANTEL:{spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS},
  PARTIDO:{spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS},
  TABLA:{spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS},
  GALERIA:{spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',revisionSheet:'REVISION',supported:false,blockReason:'CONTRATO_AUTORIZACION_MENORES_REQUIERE_ADAPTADOR'}
};

export function transition(decision){
  if(decision==='Solicitar corrección') return ['REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE'];
  if(decision==='Aprobar y publicar') return ['PUBLICADO','SI','PUBLICO','AUTORIZADO'];
  if(decision==='Rechazar') return ['RECHAZADO','NO','INTERNO','PENDIENTE'];
  return null;
}

function normalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
}

export function resolveContentType(value){
  const type=normalize(value);
  if(!type) return null;
  if(MODULES[type]) return type;
  if(type.includes('NOTICIA')) return 'NOTICIA';
  if(type.includes('EQUIPO')||type.includes('SERIE')) return 'EQUIPO';
  if(type.includes('PLANTEL')||type.includes('JUGADOR')) return 'PLANTEL';
  if(type.includes('PARTIDO')||type.includes('RESULTADO')) return 'PARTIDO';
  if(type.includes('TABLA')) return 'TABLA';
  if(type.includes('GALERIA')||type.includes('FOTO')) return 'GALERIA';
  return null;
}

function assertRevisionContract(revisions,mod,moduleKey){
  if(!revisions.length) throw new Error(`${moduleKey}: REVISION sin encabezados`);
  const actual=revisions[0].map(v=>String(v||'').trim()).slice(0,mod.revisionHeaders.length);
  if(JSON.stringify(actual)!==JSON.stringify(mod.revisionHeaders)){
    throw new Error(`${moduleKey}: contrato REVISION inesperado: ${actual.join('|')}`);
  }
}

export async function processReviewDecisions({readValues,updateValues,appendValues,now=()=>new Date().toISOString(),modules=MODULES,reviewSheetId=REVIEW_SHEET_ID,expectedPending=null}){
  const audit=await readValues(reviewSheetId,'AUDITORIA_REVISION!A:P');
  if(!audit.length) throw new Error('AUDITORIA_REVISION sin encabezados');
  const headers=audit[0].map(v=>String(v||'').trim());
  const idx=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const required=['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','OBSERVACIONES','REVISOR','ESTADO_PROCESO'];
  for(const h of required) if(idx[h]===undefined) throw new Error(`Falta columna ${h} en AUDITORIA_REVISION`);

  const pendingRows=audit.slice(1).filter(row=>{
    const id=String(row[idx.IDENTIFICADOR_HUMANO]||'').trim();
    const type=String(row[idx.TIPO_CONTENIDO]||'').trim();
    const decision=String(row[idx.DECISION]||'').trim();
    const processState=String(row[idx.ESTADO_PROCESO]||'').trim();
    return Boolean(id&&type&&decision&&!processState);
  });
  if(expectedPending!==null&&pendingRows.length!==expectedPending){
    throw new Error(`Safety gate: decisiones pendientes ${pendingRows.length}, esperado ${expectedPending}. No se aplicó ninguna escritura.`);
  }

  const summary=[];
  for(let i=1;i<audit.length;i++){
    const row=audit[i];
    const id=String(row[idx.IDENTIFICADOR_HUMANO]||'').trim();
    const rawType=String(row[idx.TIPO_CONTENIDO]||'').trim();
    const decision=String(row[idx.DECISION]||'').trim();
    const processState=String(row[idx.ESTADO_PROCESO]||'').trim();
    if(!id||!rawType||!decision||processState) continue;

    const moduleKey=resolveContentType(rawType);
    const mod=moduleKey?modules[moduleKey]:null;
    if(!mod){
      summary.push({row:i+1,id,type:rawType,module:null,decision,status:'IGNORADO_TIPO_NO_IMPLEMENTADO'});
      continue;
    }
    if(mod.supported===false){
      summary.push({row:i+1,id,type:rawType,module:moduleKey,decision,status:`BLOQUEADO_${mod.blockReason}`});
      continue;
    }
    const next=transition(decision);
    if(!next){
      summary.push({row:i+1,id,type:rawType,module:moduleKey,decision,status:'IGNORADO_DECISION_NO_IMPLEMENTADA'});
      continue;
    }

    const revisions=await readValues(mod.spreadsheetId,`${mod.revisionSheet}!A:H`);
    assertRevisionContract(revisions,mod,moduleKey);
    const existingIndex=revisions.findIndex((r,n)=>n>0&&String(r[0]||'').trim()===id);
    const timestamp=now();
    const revRow=[id,...next,String(row[idx.REVISOR]||'').trim(),timestamp,String(row[idx.OBSERVACIONES]||'').trim()];
    if(existingIndex>0) await updateValues(mod.spreadsheetId,`${mod.revisionSheet}!A${existingIndex+1}:H${existingIndex+1}`,[revRow]);
    else await appendValues(mod.spreadsheetId,`${mod.revisionSheet}!A:H`,[revRow]);

    const auditRow=i+1;
    await updateValues(reviewSheetId,`AUDITORIA_REVISION!J${auditRow}:O${auditRow}`,[['APLICADO',id,1,`${decision} aplicado`,timestamp,'']]);
    summary.push({row:auditRow,id,type:rawType,module:moduleKey,decision,status:'APLICADO'});
  }
  return {ok:true,pending:pendingRows.length,summary};
}

async function getAccessToken(){
  const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
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
      const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
      const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}}),d=await r.json();
      if(!r.ok) throw new Error(`Sheets read ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);
      return d.values||[];
    },
    updateValues:async(spreadsheetId,range,values)=>{
      const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
      const r=await fetch(u,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})}),d=await r.json();
      if(!r.ok) throw new Error(`Sheets write ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);
      return d;
    },
    appendValues:async(spreadsheetId,range,values)=>{
      const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const r=await fetch(u,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})}),d=await r.json();
      if(!r.ok) throw new Error(`Sheets append ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);
      return d;
    }
  };
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain){
  const adapter=await productionAdapter();
  const expectedRaw=process.env.CUDO_REVIEW_EXPECT_PENDING;
  const expectedPending=expectedRaw===undefined||expectedRaw===''?null:Number(expectedRaw);
  if(expectedPending!==null&&!Number.isInteger(expectedPending)) throw new Error('CUDO_REVIEW_EXPECT_PENDING debe ser entero');
  const result=await processReviewDecisions({...adapter,expectedPending});
  console.log(JSON.stringify(result,null,2));
}
