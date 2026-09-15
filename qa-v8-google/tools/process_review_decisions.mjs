import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const STANDARD_REVISION_HEADERS=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION','REVISOR','FECHA_REVISION','OBSERVACIONES'];
const GALLERY_REVISION_HEADERS=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','REVISOR','FECHA_REVISION'];

export const MODULES={
  NOTICIA:{
    spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',operationalSheet:'NOTICIAS',idHeader:'ID_NOTICIA',
    resolverHeaders:['TITULO','SLUG'],revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS,correctionsSheet:'CORRECCIONES',
    correctionsHeaders:['ID','FECHA','TITULO','RESUMEN','CUERPO','IMAGEN_REF','REVISOR','FECHA_CORRECCION','MOTIVO']
  },
  EQUIPO:{
    spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',operationalSheet:'CONTROL',idHeader:'ID_EQUIPO',
    resolverHeaders:['NOMBRE','CATEGORIA'],revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS,correctionsSheet:'CORRECCIONES',
    correctionsHeaders:['ID','NOMBRE','CATEGORIA','DESCRIPCION','ESTADO_SERIE','REVISOR','FECHA_CORRECCION','MOTIVO']
  },
  PLANTEL:{
    spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',operationalSheet:'PLANTEL_CONTROL',idHeader:'ID_INTERNO',
    resolverHeaders:['NOMBRE_DEPORTIVO_PUBLICO','NUMERO','CATEGORIA'],revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS,correctionsSheet:'CORRECCIONES',
    correctionsHeaders:['ID','NOMBRE_DEPORTIVO_PUBLICO','NUMERO','POSICION','CATEGORIA','FOTO_REF','CAPITAN','REVISOR','FECHA_CORRECCION','MOTIVO']
  },
  PARTIDO:{
    spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',operationalSheet:'CONTROL',idHeader:'ID_PARTIDO',
    resolverHeaders:['JORNADA','LOCAL','VISITA','RECINTO'],revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS,correctionsSheet:'CORRECCIONES',
    correctionsHeaders:['ID','COMPETENCIA','JORNADA','FECHA','HORA','CATEGORIA','LOCAL','VISITA','RECINTO','ESTADO_PARTIDO','GOLES_LOCAL','GOLES_VISITA','REVISOR','FECHA_CORRECCION','MOTIVO']
  },
  TABLA:{
    spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',operationalSheet:'CONTROL',idHeader:'ID_TABLA',
    resolverHeaders:['EQUIPO','CATEGORIA','COMPETENCIA'],revisionSheet:'REVISION',revisionHeaders:STANDARD_REVISION_HEADERS,correctionsSheet:'CORRECCIONES',
    correctionsHeaders:['ID','COMPETENCIA','CATEGORIA','POSICION','EQUIPO','PJ','PG','PE','PP','GF','GC','DG','PTS','REVISOR','FECHA_CORRECCION','MOTIVO']
  },
  GALERIA:{
    spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',operationalSheet:'CONTROL',idHeader:'ID_FOTO',
    resolverHeaders:['ALBUM_ID','ALBUM','TITULO'],revisionSheet:'REVISION',revisionHeaders:GALLERY_REVISION_HEADERS,correctionsSheet:'CORRECCIONES',
    correctionsHeaders:['ID','ALBUM_ID','ALBUM','FECHA','CATEGORIA','TITULO','DESCRIPCION','IMAGEN_REF','ALT','REVISOR','FECHA_CORRECCION','MOTIVO']
  }
};

export function normalize(value){
  return String(value??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
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

export function canonicalDecision(value){
  const decision=normalize(value);
  const aliases={
    'APROBAR PUBLICACION':'PUBLISH',
    'APROBAR Y PUBLICAR':'PUBLISH',
    'RECHAZAR PUBLICACION':'REJECT',
    'RECHAZAR':'REJECT',
    'APROBAR RETIRO':'RETIRE',
    'APROBAR REACTIVACION':'REACTIVATE',
    'APROBAR CORRECCION':'CORRECT',
    'SOLICITAR CORRECCION':'REQUEST_CORRECTION'
  };
  return aliases[decision]||null;
}

export function transition(decision){
  const action=canonicalDecision(decision);
  if(action==='PUBLISH'||action==='REACTIVATE') return ['PUBLICADO','SI','PUBLICO','AUTORIZADO'];
  if(action==='REJECT') return ['RECHAZADO','NO','INTERNO','PENDIENTE'];
  if(action==='RETIRE') return ['RETIRADO','NO','INTERNO','AUTORIZADO'];
  if(action==='REQUEST_CORRECTION') return ['REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE'];
  return null;
}

function colName(count){
  let n=count,s='';
  while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}return s;
}
function rowsToObjects(values){
  if(!values.length) return [];
  const headers=values[0].map(v=>String(v??'').trim());
  return values.slice(1).map((row,index)=>({
    __row:index+2,
    ...Object.fromEntries(headers.map((header,i)=>[header,String(row[i]??'').trim()]))
  })).filter(row=>headers.some(h=>String(row[h]??'').trim()!==''));
}
function assertLeadingHeaders(values,expected,label){
  if(!values.length) throw new Error(`${label}: hoja sin encabezados`);
  const actual=values[0].map(v=>String(v??'').trim()).slice(0,expected.length);
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(`${label}: contrato inesperado: ${actual.join('|')}`);
}
function assertOperational(values,mod,moduleKey){
  if(!values.length) throw new Error(`${moduleKey}: ${mod.operationalSheet} sin encabezados`);
  const headers=values[0].map(v=>String(v??'').trim());
  if(!headers.includes(mod.idHeader)) throw new Error(`${moduleKey}: falta ${mod.idHeader} en ${mod.operationalSheet}`);
}

function resolverCandidates(moduleKey,row,mod){
  const values=[row[mod.idHeader],...mod.resolverHeaders.map(h=>row[h])];
  if(moduleKey==='EQUIPO') values.push(`${row.NOMBRE||''} ${row.CATEGORIA||''}`);
  if(moduleKey==='PLANTEL') values.push(`${row.NOMBRE_DEPORTIVO_PUBLICO||''} ${row.CATEGORIA||''}`,`${row.NOMBRE_DEPORTIVO_PUBLICO||''} ${row.NUMERO||''}`);
  if(moduleKey==='PARTIDO'){
    const pair=`${row.LOCAL||''} vs ${row.VISITA||''}`;
    values.push(pair,`${pair} ${row.FECHA||''}`,`${row.FECHA||''} ${pair}`,`${row.VISITA||''} ${row.FECHA||''}`,`${row.LOCAL||''} ${row.FECHA||''}`,`${row.JORNADA||''} ${pair}`);
  }
  if(moduleKey==='TABLA') values.push(`${row.EQUIPO||''} ${row.CATEGORIA||''}`,`${row.COMPETENCIA||''} ${row.CATEGORIA||''} ${row.EQUIPO||''}`);
  if(moduleKey==='GALERIA') values.push(`${row.ALBUM||''} ${row.TITULO||''}`,`${row.ALBUM||''} ${row.FECHA||''} ${row.TITULO||''}`);
  return [...new Set(values.map(normalize).filter(Boolean))];
}

export function resolveTarget(moduleKey,identifier,operationalRows,mod=MODULES[moduleKey]){
  const needle=normalize(identifier);
  if(!needle) return {matches:[],count:0,id:null,row:null};
  const matches=operationalRows.filter(row=>resolverCandidates(moduleKey,row,mod).includes(needle));
  const unique=[];
  const seen=new Set();
  for(const row of matches){
    const id=String(row[mod.idHeader]??'').trim();
    const key=id||`ROW:${row.__row}`;
    if(seen.has(key)) continue;
    seen.add(key);unique.push(row);
  }
  if(unique.length!==1) return {matches:unique,count:unique.length,id:null,row:null};
  const row=unique[0];
  const id=String(row[mod.idHeader]??'').trim();
  return {matches:unique,count:1,id:id||null,row};
}

function cudoSide(row){
  const local=normalize(row.LOCAL),visit=normalize(row.VISITA);
  if(local==='CUDO'&&visit!=='CUDO') return 'LOCAL';
  if(visit==='CUDO'&&local!=='CUDO') return 'VISITA';
  return null;
}

export function resolveCorrectionField(moduleKey,label,targetRow={}){
  const field=normalize(label);
  const fixed={
    'RESUMEN O DESCRIPCION':{NOTICIA:'RESUMEN',EQUIPO:'DESCRIPCION',GALERIA:'DESCRIPCION'},
    'TEXTO PRINCIPAL':{NOTICIA:'CUERPO'},
    'FECHA':{NOTICIA:'FECHA',PARTIDO:'FECHA',GALERIA:'FECHA'},
    'HORA':{PARTIDO:'HORA'},
    'CATEGORIA O SERIE':{EQUIPO:'CATEGORIA',PLANTEL:'CATEGORIA',PARTIDO:'CATEGORIA',TABLA:'CATEGORIA',GALERIA:'CATEGORIA'},
    'NUMERO DE CAMISETA':{PLANTEL:'NUMERO'},
    'POSICION':{PLANTEL:'POSICION'},
    'RECINTO':{PARTIDO:'RECINTO'},
    'ESTADO DEL PARTIDO':{PARTIDO:'ESTADO_PARTIDO'},
    'PARTIDOS JUGADOS PJ':{TABLA:'PJ'},
    'PARTIDOS GANADOS PG':{TABLA:'PG'},
    'PARTIDOS EMPATADOS PE':{TABLA:'PE'},
    'PARTIDOS PERDIDOS PP':{TABLA:'PP'},
    'GOLES A FAVOR GF':{TABLA:'GF'},
    'GOLES EN CONTRA GC':{TABLA:'GC'},
    'PUNTOS':{TABLA:'PTS'},
    'POSICION EN LA TABLA':{TABLA:'POSICION'}
  };
  if(field==='TITULO O NOMBRE') return ({NOTICIA:'TITULO',EQUIPO:'NOMBRE',PLANTEL:'NOMBRE_DEPORTIVO_PUBLICO',GALERIA:'TITULO'})[moduleKey]||null;
  if(field==='EQUIPO O RIVAL'){
    if(moduleKey==='TABLA') return 'EQUIPO';
    if(moduleKey==='PARTIDO'){
      const side=cudoSide(targetRow);return side==='LOCAL'?'VISITA':side==='VISITA'?'LOCAL':null;
    }
  }
  if(field==='GOLES DE CUDO'&&moduleKey==='PARTIDO'){
    const side=cudoSide(targetRow);return side==='LOCAL'?'GOLES_LOCAL':side==='VISITA'?'GOLES_VISITA':null;
  }
  if(field==='GOLES DEL RIVAL'&&moduleKey==='PARTIDO'){
    const side=cudoSide(targetRow);return side==='LOCAL'?'GOLES_VISITA':side==='VISITA'?'GOLES_LOCAL':null;
  }
  return fixed[field]?.[moduleKey]||null;
}

function galleryMinorAuthorization(targetRow,auditMinor,{requireAuthorized=false}={}){
  const contains=normalize(targetRow.CONTIENE_MENORES);
  const supplied=normalize(auditMinor);
  if(contains==='SI'){
    if(supplied==='SI') return {ok:true,value:'AUTORIZADO'};
    if(requireAuthorized) return {ok:false,reason:'MENORES_SIN_AUTORIZACION'};
    return {ok:true,value:supplied==='NO'?'NO_AUTORIZADO':'PENDIENTE'};
  }
  return {ok:true,value:'NO APLICA'};
}

function galleryRevisionRow(action,id,targetRow,auditRow,idx,timestamp){
  const reviewer=String(auditRow[idx.REVISOR]??'').trim();
  const authPub=normalize(auditRow[idx.AUTORIZACION_PUBLICACION]);
  const authMin=String(auditRow[idx.AUTORIZACION_MENORES]??'').trim();
  if(action==='PUBLISH'||action==='REACTIVATE'){
    if(authPub!=='SI') return {blocked:'PUBLICACION_NO_AUTORIZADA'};
    const minors=galleryMinorAuthorization(targetRow,authMin,{requireAuthorized:true});
    if(!minors.ok) return {blocked:minors.reason};
    return {row:[id,'PUBLICADO','SI','PUBLICO','AUTORIZADO',minors.value,reviewer,timestamp]};
  }
  const minors=galleryMinorAuthorization(targetRow,authMin);
  if(action==='REJECT') return {row:[id,'RECHAZADO','NO','INTERNO','NO_AUTORIZADO',minors.value,reviewer,timestamp]};
  if(action==='RETIRE') return {row:[id,'RETIRADO','NO','INTERNO',authPub==='SI'?'AUTORIZADO':'NO_AUTORIZADO',minors.value,reviewer,timestamp]};
  if(action==='REQUEST_CORRECTION') return {row:[id,'REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE',minors.value,reviewer,timestamp]};
  return {blocked:'DECISION_NO_IMPLEMENTADA'};
}

function buildCorrectionRow(moduleKey,mod,targetRow,resolvedId,fieldHeader,newValue,reviewer,timestamp,observations){
  return mod.correctionsHeaders.map(header=>{
    if(header==='ID') return resolvedId;
    if(header==='REVISOR') return reviewer;
    if(header==='FECHA_CORRECCION') return timestamp;
    if(header==='MOTIVO') return observations||`Corrección aprobada: ${fieldHeader}`;
    if(header===fieldHeader) return newValue;
    return String(targetRow[header]??'').trim();
  });
}

function cloneRows(values){return values.map(row=>[...row]);}

export async function planReviewDecisions({readValues,now=()=>new Date().toISOString(),modules=MODULES,reviewSheetId=REVIEW_SHEET_ID,expectedPending=null}){
  const audit=await readValues(reviewSheetId,'AUDITORIA_REVISION!A:P');
  if(!audit.length) throw new Error('AUDITORIA_REVISION sin encabezados');
  const headers=audit[0].map(v=>String(v??'').trim());
  const idx=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const required=['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','OBSERVACIONES','REVISOR','ESTADO_PROCESO','CAMPO_CORRECCION','NUEVO_VALOR'];
  for(const h of required) if(idx[h]===undefined) throw new Error(`Falta columna ${h} en AUDITORIA_REVISION`);

  const pending=audit.slice(1).map((row,n)=>({row,rowNumber:n+2})).filter(({row})=>{
    const identifier=String(row[idx.IDENTIFICADOR_HUMANO]??'').trim();
    const type=String(row[idx.TIPO_CONTENIDO]??'').trim();
    const decision=String(row[idx.DECISION]??'').trim();
    const state=String(row[idx.ESTADO_PROCESO]??'').trim();
    return Boolean(identifier&&type&&decision&&!state);
  });
  if(expectedPending!==null&&pending.length!==expectedPending) throw new Error(`Safety gate: decisiones pendientes ${pending.length}, esperado ${expectedPending}. No se aplicó ninguna escritura.`);

  const neededModules=new Set();
  for(const item of pending){
    const moduleKey=resolveContentType(item.row[idx.TIPO_CONTENIDO]);
    const action=canonicalDecision(item.row[idx.DECISION]);
    if(moduleKey&&modules[moduleKey]&&action) neededModules.add(moduleKey);
  }

  const cache=new Map();
  for(const moduleKey of neededModules){
    const mod=modules[moduleKey];
    const operational=await readValues(mod.spreadsheetId,`${mod.operationalSheet}!A:Z`);
    const revisionEnd=colName(mod.revisionHeaders.length);
    const correctionsEnd=colName(mod.correctionsHeaders.length);
    const revisions=await readValues(mod.spreadsheetId,`${mod.revisionSheet}!A:${revisionEnd}`);
    const corrections=await readValues(mod.spreadsheetId,`${mod.correctionsSheet}!A:${correctionsEnd}`);
    assertOperational(operational,mod,moduleKey);
    assertLeadingHeaders(revisions,mod.revisionHeaders,`${moduleKey}: ${mod.revisionSheet}`);
    assertLeadingHeaders(corrections,mod.correctionsHeaders,`${moduleKey}: ${mod.correctionsSheet}`);
    cache.set(moduleKey,{operationalRows:rowsToObjects(operational),revisions:cloneRows(revisions),corrections:cloneRows(corrections)});
  }

  const mutations=[];
  const summary=[];
  const markAudit=(rowNumber,status,id,count,result,timestamp)=>{
    mutations.push({op:'update',kind:'AUDIT',spreadsheetId:reviewSheetId,range:`AUDITORIA_REVISION!J${rowNumber}:N${rowNumber}`,values:[[status,id||'',String(count??0),result,timestamp]]});
  };

  for(const {row,rowNumber} of pending){
    const rawType=String(row[idx.TIPO_CONTENIDO]??'').trim();
    const identifier=String(row[idx.IDENTIFICADOR_HUMANO]??'').trim();
    const decision=String(row[idx.DECISION]??'').trim();
    const moduleKey=resolveContentType(rawType);
    const action=canonicalDecision(decision);
    const timestamp=now();
    if(!moduleKey||!modules[moduleKey]){
      const result='Bloqueado: tipo de contenido no implementado';markAudit(rowNumber,'BLOQUEADO','',0,result,timestamp);
      summary.push({row:rowNumber,type:rawType,identifier,decision,module:null,status:'BLOQUEADO_TIPO_NO_IMPLEMENTADO'});continue;
    }
    if(!action){
      const result='Bloqueado: decisión no implementada';markAudit(rowNumber,'BLOQUEADO','',0,result,timestamp);
      summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,status:'BLOQUEADO_DECISION_NO_IMPLEMENTADA'});continue;
    }
    const mod=modules[moduleKey],state=cache.get(moduleKey);
    const resolved=resolveTarget(moduleKey,identifier,state.operationalRows,mod);
    if(resolved.count!==1){
      const result=`Bloqueado: resolución ${resolved.count===0?'sin coincidencias':'ambigua'}`;markAudit(rowNumber,'BLOQUEADO','',resolved.count,result,timestamp);
      summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,status:resolved.count===0?'BLOQUEADO_SIN_COINCIDENCIAS':'BLOQUEADO_RESOLUCION_AMBIGUA',coincidencias:resolved.count});continue;
    }
    if(!resolved.id){
      const result='Bloqueado: registro sin ID técnico';markAudit(rowNumber,'BLOQUEADO','',1,result,timestamp);
      summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,status:'BLOQUEADO_SIN_ID_TECNICO',coincidencias:1});continue;
    }
    const resolvedId=resolved.id,target=resolved.row;
    const reviewer=String(row[idx.REVISOR]??'').trim(),observations=String(row[idx.OBSERVACIONES]??'').trim();

    if(action==='CORRECT'){
      const fieldLabel=String(row[idx.CAMPO_CORRECCION]??'').trim(),newValue=String(row[idx.NUEVO_VALOR]??'').trim();
      if(!fieldLabel||!newValue){
        const result='Bloqueado: corrección incompleta';markAudit(rowNumber,'BLOQUEADO',resolvedId,1,result,timestamp);
        summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,id:resolvedId,status:'BLOQUEADO_CORRECCION_INCOMPLETA'});continue;
      }
      const fieldHeader=resolveCorrectionField(moduleKey,fieldLabel,target);
      if(!fieldHeader||!mod.correctionsHeaders.includes(fieldHeader)){
        const result=`Bloqueado: campo de corrección no soportado (${fieldLabel})`;markAudit(rowNumber,'BLOQUEADO',resolvedId,1,result,timestamp);
        summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,id:resolvedId,status:'BLOQUEADO_CAMPO_CORRECCION_NO_SOPORTADO'});continue;
      }
      const correctionRow=buildCorrectionRow(moduleKey,mod,target,resolvedId,fieldHeader,newValue,reviewer,timestamp,observations);
      const existingIndex=state.corrections.findIndex((r,n)=>n>0&&String(r[0]??'').trim()===resolvedId);
      if(existingIndex>0){
        const range=`${mod.correctionsSheet}!A${existingIndex+1}:${colName(mod.correctionsHeaders.length)}${existingIndex+1}`;
        mutations.push({op:'update',kind:'CORRECTION',spreadsheetId:mod.spreadsheetId,range,values:[correctionRow]});state.corrections[existingIndex]=correctionRow;
      }else{
        mutations.push({op:'append',kind:'CORRECTION',spreadsheetId:mod.spreadsheetId,range:`${mod.correctionsSheet}!A:${colName(mod.correctionsHeaders.length)}`,values:[correctionRow]});state.corrections.push(correctionRow);
      }
      const result=`Corrección aplicada: ${fieldLabel}`;markAudit(rowNumber,'APLICADO',resolvedId,1,result,timestamp);
      summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,id:resolvedId,status:'APLICADO',action,correction_field:fieldHeader});continue;
    }

    let revisionRow;
    if(moduleKey==='GALERIA'){
      const gallery=galleryRevisionRow(action,resolvedId,target,row,idx,timestamp);
      if(gallery.blocked){
        const result=`Bloqueado: ${gallery.blocked}`;markAudit(rowNumber,'BLOQUEADO',resolvedId,1,result,timestamp);
        summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,id:resolvedId,status:`BLOQUEADO_${gallery.blocked}`});continue;
      }
      revisionRow=gallery.row;
    }else{
      const next=transition(decision);
      if(!next){
        const result='Bloqueado: transición no implementada';markAudit(rowNumber,'BLOQUEADO',resolvedId,1,result,timestamp);
        summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,id:resolvedId,status:'BLOQUEADO_TRANSICION_NO_IMPLEMENTADA'});continue;
      }
      revisionRow=[resolvedId,...next,reviewer,timestamp,observations];
    }
    const existingIndex=state.revisions.findIndex((r,n)=>n>0&&String(r[0]??'').trim()===resolvedId);
    if(existingIndex>0){
      const range=`${mod.revisionSheet}!A${existingIndex+1}:${colName(mod.revisionHeaders.length)}${existingIndex+1}`;
      mutations.push({op:'update',kind:'REVISION',spreadsheetId:mod.spreadsheetId,range,values:[revisionRow]});state.revisions[existingIndex]=revisionRow;
    }else{
      mutations.push({op:'append',kind:'REVISION',spreadsheetId:mod.spreadsheetId,range:`${mod.revisionSheet}!A:${colName(mod.revisionHeaders.length)}`,values:[revisionRow]});state.revisions.push(revisionRow);
    }
    const result=`${decision} aplicado`;markAudit(rowNumber,'APLICADO',resolvedId,1,result,timestamp);
    summary.push({row:rowNumber,type:rawType,identifier,decision,module:moduleKey,id:resolvedId,status:'APLICADO',action});
  }

  return {ok:true,pending:pending.length,preflight_modules:[...neededModules],summary,mutations};
}

export async function processReviewDecisions({readValues,updateValues,appendValues,dryRun=false,...rest}){
  const plan=await planReviewDecisions({readValues,...rest});
  if(!dryRun){
    for(const mutation of plan.mutations){
      if(mutation.op==='update') await updateValues(mutation.spreadsheetId,mutation.range,mutation.values);
      else if(mutation.op==='append') await appendValues(mutation.spreadsheetId,mutation.range,mutation.values);
      else throw new Error(`Operación desconocida ${mutation.op}`);
    }
  }
  return {...plan,dry_run:dryRun,writes_applied:dryRun?0:plan.mutations.length};
}

async function getAccessToken(){
  const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID,CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${d.error_description||d.error||'desconocido'}`);return d.access_token;
}
async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fetchJsonWithReadRetry(url,options={},attempts=5){
  let last;
  for(let i=0;i<attempts;i++){
    const r=await fetch(url,options),d=await r.json();
    if(r.ok) return d;
    last={status:r.status,data:d};
    if(![429,500,502,503,504].includes(r.status)||i===attempts-1) break;
    await sleep(750*(2**i));
  }
  const error=new Error(`HTTP ${last?.status}: ${last?.data?.error?.message||'desconocido'}`);error.status=last?.status;throw error;
}
async function productionAdapter(){
  const token=await getAccessToken();
  return {
    readValues:async(spreadsheetId,range)=>{
      const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
      try{const d=await fetchJsonWithReadRetry(u,{headers:{Authorization:`Bearer ${token}`}});return d.values||[];}catch(e){throw new Error(`Sheets read ${spreadsheetId}/${range}: ${e.message}`);}
    },
    updateValues:async(spreadsheetId,range,values)=>{
      const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
      const r=await fetch(u,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})}),d=await r.json();
      if(!r.ok) throw new Error(`Sheets write ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);return d;
    },
    appendValues:async(spreadsheetId,range,values)=>{
      const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const r=await fetch(u,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})}),d=await r.json();
      if(!r.ok) throw new Error(`Sheets append ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);return d;
    }
  };
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain){
  const adapter=await productionAdapter();
  const expectedRaw=process.env.CUDO_REVIEW_EXPECT_PENDING;
  const expectedPending=expectedRaw===undefined||expectedRaw===''?null:Number(expectedRaw);
  if(expectedPending!==null&&!Number.isInteger(expectedPending)) throw new Error('CUDO_REVIEW_EXPECT_PENDING debe ser entero');
  const dryRun=String(process.env.CUDO_REVIEW_DRY_RUN||'').toLowerCase()==='true';
  const result=await processReviewDecisions({...adapter,expectedPending,dryRun});
  console.log(JSON.stringify({ok:result.ok,pending:result.pending,preflight_modules:result.preflight_modules,summary:result.summary,dry_run:result.dry_run,writes_applied:result.writes_applied,planned_mutations:result.mutations.length},null,2));
}
