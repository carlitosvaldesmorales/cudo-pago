import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODULES, planReviewDecisions } from './process_review_decisions.mjs';

const EXPECTED_BRANCH='qa/review-event-no-prod-20260915';
const SYNTHETIC_PREFIX='CUDO-QA-SYNTH-';
const SUPPORTED_MODULES=new Set(['NOTICIA','EQUIPO','TABLA']);
const MODULE_META={
  NOTICIA:{idHeader:'ID_NOTICIA',overlay:'noticias.json'},
  EQUIPO:{idHeader:'ID_EQUIPO',overlay:'equipos.json'},
  TABLA:{idHeader:'ID_TABLA',overlay:'tabla.json'}
};

export function rowContainsSyntheticMarker(row,marker=''){
  const values=Object.values(row||{}).map(v=>String(v??''));
  if(marker&&values.some(v=>v.includes(marker))) return true;
  return values.some(v=>v.includes(SYNTHETIC_PREFIX)||v.includes('SYNTHETIC_QA_'));
}

function requireSynthetic(row,label){
  if(!rowContainsSyntheticMarker(row)) throw new Error(`QA quarantine: ${label} no sintético`);
}

export function publicNoticiaItem(row,resolvedId){
  const item={
    id:String(resolvedId||row?.ID_NOTICIA||'').trim(),
    fecha:String(row?.FECHA||'').trim(),
    slug:String(row?.SLUG||'').trim(),
    titulo:String(row?.TITULO||'').trim(),
    resumen:String(row?.RESUMEN||'').trim(),
    cuerpo:String(row?.CUERPO||'').trim()
  };
  if(!item.id||!item.fecha||!item.slug||!item.titulo||!item.resumen||!item.cuerpo) throw new Error('QA quarantine: noticia sin contrato público mínimo');
  requireSynthetic(row,'noticia');
  return item;
}

export function publicEquipoItem(row,resolvedId){
  const item={
    id:String(resolvedId||row?.ID_EQUIPO||'').trim(),
    nombre:String(row?.NOMBRE||'').trim(),
    categoria:String(row?.CATEGORIA||'').trim(),
    descripcion:String(row?.DESCRIPCION||'').trim()
  };
  if(!item.id||!item.nombre||!item.categoria) throw new Error('QA quarantine: equipo sin contrato público mínimo');
  requireSynthetic(row,'equipo');
  return item;
}

function integerField(row,key){
  const raw=String(row?.[key]??'').trim();
  if(!/^-?\d+$/.test(raw)) throw new Error(`QA quarantine: tabla ${key} no entero`);
  const value=Number(raw);
  if(!Number.isSafeInteger(value)) throw new Error(`QA quarantine: tabla ${key} fuera de rango`);
  return value;
}

export function publicTablaItem(row,resolvedId){
  const item={
    id:String(resolvedId||row?.ID_TABLA||'').trim(),
    competencia:String(row?.COMPETENCIA||'').trim(),
    categoria:String(row?.CATEGORIA||'').trim(),
    posicion:integerField(row,'POSICION'),
    equipo:String(row?.EQUIPO||'').trim(),
    pj:integerField(row,'PJ'),
    pg:integerField(row,'PG'),
    pe:integerField(row,'PE'),
    pp:integerField(row,'PP'),
    gf:integerField(row,'GF'),
    gc:integerField(row,'GC'),
    dg:integerField(row,'DG'),
    pts:integerField(row,'PTS')
  };
  if(!item.id||!item.competencia||!item.categoria||!item.equipo) throw new Error('QA quarantine: tabla sin contrato público mínimo');
  if(item.posicion<1||[item.pj,item.pg,item.pe,item.pp,item.gf,item.gc,item.pts].some(v=>v<0)) throw new Error('QA quarantine: tabla con entero fuera de contrato');
  if(item.pg+item.pe+item.pp>item.pj) throw new Error('QA quarantine: tabla PG+PE+PP supera PJ');
  if(item.gf-item.gc!==item.dg) throw new Error('QA quarantine: tabla DG no coincide con GF-GC');
  requireSynthetic(row,'tabla');
  return item;
}

export function publicItemForModule(moduleKey,row,resolvedId){
  if(moduleKey==='NOTICIA') return publicNoticiaItem(row,resolvedId);
  if(moduleKey==='EQUIPO') return publicEquipoItem(row,resolvedId);
  if(moduleKey==='TABLA') return publicTablaItem(row,resolvedId);
  throw new Error(`QA quarantine: módulo no permitido ${moduleKey}`);
}

export function validateQuarantinePlan(plan,{expectedMarker,targetRow}){
  if(plan.pending!==1||plan.summary.length!==1) throw new Error(`QA quarantine: se esperaba exactamente 1 decisión pendiente y llegaron ${plan.pending}`);
  const s=plan.summary[0];
  if(!SUPPORTED_MODULES.has(s.module)||s.action!=='PUBLISH'||s.status!=='APLICADO') throw new Error(`QA quarantine: decisión no permitida ${JSON.stringify({module:s.module,action:s.action,status:s.status})}`);
  if(!String(s.identifier||'').includes(expectedMarker)) throw new Error('QA quarantine: identificador no coincide con marker esperado');
  if(!rowContainsSyntheticMarker(targetRow,expectedMarker)) throw new Error('QA quarantine: target no contiene marker sintético esperado');
  const audit=plan.mutations.filter(m=>m.kind==='AUDIT');
  const revision=plan.mutations.filter(m=>m.kind==='REVISION');
  const other=plan.mutations.filter(m=>!['AUDIT','REVISION'].includes(m.kind));
  if(audit.length!==1||revision.length!==1||other.length) throw new Error(`QA quarantine: mutaciones inesperadas audit=${audit.length} revision=${revision.length} other=${other.length}`);
  if(revision[0].spreadsheetId!==MODULES[s.module].spreadsheetId) throw new Error(`QA quarantine: REVISION no pertenece a ${s.module}`);
  return {summary:s,auditMutation:audit[0],revisionSuppressed:revision[0]};
}

function rowsToObjects(values){
  if(!values.length) return [];
  const headers=values[0].map(v=>String(v??'').trim());
  return values.slice(1).map((row,index)=>({__row:index+2,...Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()]))}));
}

async function getAccessToken(){
  const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID,CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}`);return d.access_token;
}

async function adapter(){
  const token=await getAccessToken();
  const readValues=async(spreadsheetId,range)=>{const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(`Sheets read ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'unknown'}`);return d.values||[];};
  const updateValues=async(spreadsheetId,range,values)=>{const u=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;const r=await fetch(u,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})});const d=await r.json();if(!r.ok)throw new Error(`Sheets update ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message||'unknown'}`);return d;};
  return {readValues,updateValues};
}

export async function runQaQuarantine({readValues,updateValues,expectedMarker,overlayPath=null,now=()=>new Date().toISOString()}){
  if(!expectedMarker||!expectedMarker.startsWith(SYNTHETIC_PREFIX)) throw new Error('QA quarantine: marker sintético esperado no configurado');
  const plan=await planReviewDecisions({readValues,now,expectedPending:1});
  const s=plan.summary[0];
  if(!SUPPORTED_MODULES.has(s?.module)) throw new Error(`QA quarantine: módulo no permitido ${s?.module||'desconocido'}`);
  const mod=MODULES[s.module],meta=MODULE_META[s.module];
  const operational=rowsToObjects(await readValues(mod.spreadsheetId,`${mod.operationalSheet}!A:Z`));
  const target=operational.find(r=>String(r[meta.idHeader]||'').trim()===String(s?.id||'').trim());
  if(!target) throw new Error(`QA quarantine: target de ${s.module} no encontrado por ID resuelto`);
  const validated=validateQuarantinePlan(plan,{expectedMarker,targetRow:target});
  const item=publicItemForModule(s.module,target,validated.summary.id);

  const audit=structuredClone(validated.auditMutation);
  audit.values[0][0]='APLICADO';
  audit.values[0][3]=`Aprobación QA cuarentena ${s.module} aplicada; REVISION/PUBLICO_EXPORT compartido no fue modificado`;
  await updateValues(audit.spreadsheetId,audit.range,audit.values);

  const targetOverlay=overlayPath||path.join('qa-v8-google','qa_review_overrides',meta.overlay);
  fs.mkdirSync(path.dirname(targetOverlay),{recursive:true});
  let doc={schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:s.module,items:[]};
  if(fs.existsSync(targetOverlay)) doc=JSON.parse(fs.readFileSync(targetOverlay,'utf8'));
  doc.schema_version='1.0';doc.mode='QA_SYNTHETIC_QUARANTINE';doc.module=s.module;
  doc.items=Array.isArray(doc.items)?doc.items.filter(x=>x.id!==item.id):[];
  doc.items.push(item);
  fs.writeFileSync(targetOverlay,JSON.stringify(doc,null,2)+'\n');
  return {ok:true,mode:'QA_SYNTHETIC_QUARANTINE',marker:expectedMarker,id:item.id,module:s.module,action:'PUBLISH',shared_revision_writes:0,audit_writes:1,overlay_items:doc.items.length,overlay_path:targetOverlay,item};
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain){
  if(process.env.GITHUB_REF_NAME&&process.env.GITHUB_REF_NAME!==EXPECTED_BRANCH) throw new Error(`QA quarantine: branch inválida ${process.env.GITHUB_REF_NAME}`);
  const expectedMarker=process.env.CUDO_QA_EXPECT_MARKER||'';
  const a=await adapter();
  const result=await runQaQuarantine({...a,expectedMarker});
  console.log(JSON.stringify(result,null,2));
}
