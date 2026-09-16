import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(process.cwd());
const SYNTHETIC_PREFIX='CUDO-QA-SYNTH-';

function hasSyntheticMarker(item){
  return Object.values(item||{}).some(v=>String(v??'').includes(SYNTHETIC_PREFIX));
}

function assertBase(publicDoc,module){
  if(publicDoc?.schema_version!=='1.0'||!Array.isArray(publicDoc.items)) throw new Error(`QA override ${module}: JSON público inválido`);
}

function assertOverlay(overlayDoc,module){
  if(overlayDoc?.schema_version!=='1.0'||overlayDoc?.mode!=='QA_SYNTHETIC_QUARANTINE'||!Array.isArray(overlayDoc.items)) throw new Error(`QA override ${module}: overlay inválido`);
  if(overlayDoc.module&&overlayDoc.module!==module) throw new Error(`QA override ${module}: módulo overlay inesperado ${overlayDoc.module}`);
}

function assertNoticia(item){
  for(const key of ['id','fecha','slug','titulo','resumen','cuerpo']) if(!String(item?.[key]??'').trim()) throw new Error(`QA override NOTICIA: falta ${key}`);
  if(!hasSyntheticMarker(item)) throw new Error('QA override NOTICIA: sólo se permiten noticias sintéticas identificables');
}

function assertEquipo(item){
  for(const key of ['id','nombre','categoria']) if(!String(item?.[key]??'').trim()) throw new Error(`QA override EQUIPO: falta ${key}`);
  if(!hasSyntheticMarker(item)) throw new Error('QA override EQUIPO: sólo se permiten equipos sintéticos identificables');
}

function assertTabla(item){
  for(const key of ['id','competencia','categoria','equipo']) if(!String(item?.[key]??'').trim()) throw new Error(`QA override TABLA: falta ${key}`);
  for(const key of ['posicion','pj','pg','pe','pp','gf','gc','dg','pts']) if(!Number.isSafeInteger(item?.[key])) throw new Error(`QA override TABLA: ${key} debe ser entero`);
  if(item.posicion<1||[item.pj,item.pg,item.pe,item.pp,item.gf,item.gc,item.pts].some(v=>v<0)) throw new Error('QA override TABLA: entero fuera de contrato');
  if(item.pg+item.pe+item.pp>item.pj) throw new Error('QA override TABLA: PG+PE+PP supera PJ');
  if(item.gf-item.gc!==item.dg) throw new Error('QA override TABLA: DG no coincide con GF-GC');
  if(!hasSyntheticMarker(item)) throw new Error('QA override TABLA: sólo se permiten filas sintéticas identificables');
}

export function mergeQaOverride(publicDoc,overlayDoc,{module,validateItem}){
  assertBase(publicDoc,module);
  assertOverlay(overlayDoc,module);
  const base=structuredClone(publicDoc);
  const map=new Map(base.items.map(item=>[String(item?.id||''),item]));
  for(const item of overlayDoc.items){
    validateItem(item);
    const id=String(item?.id||'').trim();
    if(!id) throw new Error(`QA override ${module}: item sin id`);
    map.set(id,item);
  }
  base.items=[...map.values()];
  base.generated_at=new Date().toISOString();
  return base;
}

export function mergeNoticiasQaOverride(publicDoc,overlayDoc){return mergeQaOverride(publicDoc,overlayDoc,{module:'NOTICIA',validateItem:assertNoticia});}
export function mergeEquiposQaOverride(publicDoc,overlayDoc){return mergeQaOverride(publicDoc,overlayDoc,{module:'EQUIPO',validateItem:assertEquipo});}
export function mergeTablaQaOverride(publicDoc,overlayDoc){return mergeQaOverride(publicDoc,overlayDoc,{module:'TABLA',validateItem:assertTabla});}

const MODULES=[
  {module:'NOTICIA',file:'noticias.json',merge:mergeNoticiasQaOverride},
  {module:'EQUIPO',file:'equipos.json',merge:mergeEquiposQaOverride},
  {module:'TABLA',file:'tabla.json',merge:mergeTablaQaOverride}
];
const summary={};
for(const cfg of MODULES){
  const overlayPath=path.join(ROOT,'qa-v8-google','qa_review_overrides',cfg.file);
  const targetPath=path.join(ROOT,'qa-v8-google','data',cfg.file);
  if(!fs.existsSync(overlayPath)){
    summary[cfg.module]={mode:'NO_QA_OVERRIDE',overlay_items:0,target:path.relative(ROOT,targetPath)};
    continue;
  }
  if(!fs.existsSync(targetPath)) throw new Error(`QA override ${cfg.module}: falta ${path.relative(ROOT,targetPath)}`);
  const publicDoc=JSON.parse(fs.readFileSync(targetPath,'utf8'));
  const overlayDoc=JSON.parse(fs.readFileSync(overlayPath,'utf8'));
  const merged=cfg.merge(publicDoc,overlayDoc);
  fs.writeFileSync(targetPath,JSON.stringify(merged,null,2)+'\n');
  summary[cfg.module]={mode:'QA_SYNTHETIC_QUARANTINE',overlay_items:overlayDoc.items.length,result_items:merged.items.length,target:path.relative(ROOT,targetPath)};
}
console.log(JSON.stringify({ok:true,mode:'QA_SYNTHETIC_QUARANTINE_MULTI_DOMAIN',modules:summary,production_preview_v8_touched:false},null,2));
