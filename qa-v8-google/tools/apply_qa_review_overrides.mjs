import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(process.cwd());
const OVERLAY=path.join(ROOT,'qa-v8-google','qa_review_overrides','noticias.json');
const TARGET=path.join(ROOT,'qa-v8-google','data','noticias.json');

export function mergeNoticiasQaOverride(publicDoc,overlayDoc){
  const base=structuredClone(publicDoc);
  if(base?.schema_version!=='1.0'||!Array.isArray(base.items)) throw new Error('QA override: noticias.json inválido');
  if(overlayDoc?.schema_version!=='1.0'||overlayDoc?.mode!=='QA_SYNTHETIC_QUARANTINE'||!Array.isArray(overlayDoc.items)) throw new Error('QA override: overlay inválido');
  const map=new Map(base.items.map(item=>[String(item?.id||''),item]));
  for(const item of overlayDoc.items){
    const id=String(item?.id||'').trim();
    const title=String(item?.titulo||'');
    if(!id||!title.includes('CUDO-QA-SYNTH-')) throw new Error('QA override: sólo se permiten noticias sintéticas identificables');
    map.set(id,item);
  }
  base.items=[...map.values()];
  base.generated_at=new Date().toISOString();
  return base;
}

if(fs.existsSync(OVERLAY)){
  if(!fs.existsSync(TARGET)) throw new Error('QA override: falta qa-v8-google/data/noticias.json');
  const publicDoc=JSON.parse(fs.readFileSync(TARGET,'utf8'));
  const overlayDoc=JSON.parse(fs.readFileSync(OVERLAY,'utf8'));
  const merged=mergeNoticiasQaOverride(publicDoc,overlayDoc);
  fs.writeFileSync(TARGET,JSON.stringify(merged,null,2)+'\n');
  console.log(JSON.stringify({ok:true,mode:'QA_SYNTHETIC_QUARANTINE',overlay_items:overlayDoc.items.length,result_items:merged.items.length,target:'qa-v8-google/data/noticias.json',production_preview_v8_touched:false},null,2));
}else{
  console.log(JSON.stringify({ok:true,mode:'NO_QA_OVERRIDE',overlay_items:0,target:'qa-v8-google/data/noticias.json',production_preview_v8_touched:false},null,2));
}
