import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODULES } from './process_review_decisions.mjs';
import { rowContainsSyntheticMarker, publicNoticiaItem, publicEquipoItem, publicPlantelItem, publicPartidoItem, publicTablaItem, validateQuarantinePlan, materializeQaImageRef, finalizeQaAudit } from './process_review_decisions_qa_quarantine.mjs';
import { mergeNoticiasQaOverride, mergeEquiposQaOverride, mergePlantelQaOverride, mergePartidosQaOverride, mergeTablaQaOverride } from './apply_qa_review_overrides.mjs';

function planFor(module,marker,id){
  return {pending:1,summary:[{module,action:'PUBLISH',status:'APLICADO',identifier:marker,id}],mutations:[
    {op:'append',kind:'REVISION',spreadsheetId:MODULES[module].spreadsheetId,range:'REVISION!A:H',values:[[id]]},
    {op:'update',kind:'AUDIT',spreadsheetId:'1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms',range:'AUDITORIA_REVISION!J2:N2',values:[['APLICADO',id,'1','Aprobar publicación aplicado','2026-09-16T00:00:00Z']]}
  ]};
}

const noticiaMarker='CUDO-QA-SYNTH-NOTICIA-TEST-001';
const noticia={ID_NOTICIA:'QA-NOT-001',FECHA:'2026-09-16',SLUG:'cudo-qa-synth-noticia-test-001',TITULO:noticiaMarker,RESUMEN:'Resumen QA',CUERPO:'Contenido QA',IMAGEN_REF:'',OBSERVACIONES:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
assert.equal(rowContainsSyntheticMarker(noticia,noticiaMarker),true);
assert.equal(rowContainsSyntheticMarker({TITULO:'Noticia real'},noticiaMarker),false);
assert.deepEqual(publicNoticiaItem(noticia,'QA-NOT-001'),{id:'QA-NOT-001',fecha:'2026-09-16',slug:'cudo-qa-synth-noticia-test-001',titulo:noticiaMarker,resumen:'Resumen QA',cuerpo:'Contenido QA'});
assert.throws(()=>publicNoticiaItem({...noticia,TITULO:'Real',OBSERVACIONES:''},'QA-NOT-001'),/no sintético/);
const noticiaPlan=planFor('NOTICIA',noticiaMarker,'QA-NOT-001');
assert.equal(validateQuarantinePlan(noticiaPlan,{expectedMarker:noticiaMarker,targetRow:noticia}).revisionSuppressed.kind,'REVISION');

const equipoMarker='CUDO-QA-SYNTH-EQUIPO-TEST-001';
const equipo={ID_EQUIPO:'QA-EQU-001',NOMBRE:equipoMarker,CATEGORIA:'TERCERA',DESCRIPCION:'Serie sintética QA',OBSERVACIONES:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
const equipoItem=publicEquipoItem(equipo,'QA-EQU-001');
assert.deepEqual(equipoItem,{id:'QA-EQU-001',nombre:equipoMarker,categoria:'TERCERA',descripcion:'Serie sintética QA'});
assert.equal(validateQuarantinePlan(planFor('EQUIPO',equipoMarker,'QA-EQU-001'),{expectedMarker:'CUDO-QA-SYNTH-',targetRow:equipo}).summary.module,'EQUIPO');
assert.throws(()=>publicEquipoItem({...equipo,NOMBRE:'Equipo real',OBSERVACIONES:''},'QA-EQU-001'),/no sintético/);

const plantelMarker='CUDO-QA-SYNTH-PLANTEL-TEST-001';
const plantel={ID_INTERNO:'QA-PLA-001',NOMBRE_DEPORTIVO_PUBLICO:plantelMarker,NUMERO:'99',POSICION:'DEFENSA',CATEGORIA:'TERCERA',FOTO_REF:'',CAPITAN:'NO',OBSERVACIONES_VALIDACION:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
const plantelItem=publicPlantelItem(plantel,'QA-PLA-001');
assert.deepEqual(plantelItem,{id:'QA-PLA-001',nombre_deportivo:plantelMarker,numero:99,posicion:'DEFENSA',categoria:'TERCERA',foto_ref:'',capitan:false});
assert.equal(validateQuarantinePlan(planFor('PLANTEL',plantelMarker,'QA-PLA-001'),{expectedMarker:'CUDO-QA-SYNTH-',targetRow:plantel}).summary.module,'PLANTEL');
assert.throws(()=>publicPlantelItem({...plantel,NOMBRE_DEPORTIVO_PUBLICO:'Jugador real',OBSERVACIONES_VALIDACION:''},'QA-PLA-001'),/no sintético/);
assert.throws(()=>publicPlantelItem({...plantel,NUMERO:'0'},'QA-PLA-001'),/fuera de rango/);
assert.throws(()=>publicPlantelItem({...plantel,POSICION:'LIBERO'},'QA-PLA-001'),/POSICION fuera de contrato/);
assert.throws(()=>publicPlantelItem({...plantel,CAPITAN:'QUIZAS'},'QA-PLA-001'),/no booleano/);

const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
const tmpMedia=fs.mkdtempSync(path.join(os.tmpdir(),'cudo-qa-media-'));
const fakeFetch=async()=>({
  ok:true,
  status:200,
  headers:{get:key=>key==='content-type'?'image/png':key==='content-length'?String(png.length):null},
  arrayBuffer:async()=>png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength)
});
const materialized=await materializeQaImageRef({moduleKey:'PLANTEL',itemId:'QA-PLA-001',value:'https://storage.tally.so/private/player.png?accessToken=fake&signature=fake',qaRoot:tmpMedia,fetchImpl:fakeFetch});
assert.match(materialized,/^media\/plantel\/tally-[a-f0-9]{20}\.png$/);
assert.equal(fs.existsSync(path.join(tmpMedia,materialized)),true);
assert.equal(await materializeQaImageRef({moduleKey:'PLANTEL',itemId:'QA-PLA-001',value:'https://example.org/player.png',qaRoot:tmpMedia,fetchImpl:fakeFetch}),'https://example.org/player.png');
fs.rmSync(tmpMedia,{recursive:true,force:true});

const tmpAuditDir=fs.mkdtempSync(path.join(os.tmpdir(),'cudo-qa-audit-'));
const auditMutationPath=path.join(tmpAuditDir,'audit.json');
fs.writeFileSync(auditMutationPath,JSON.stringify({spreadsheetId:'SHEET',range:'AUDITORIA_REVISION!J2:N2',values:[['APLICADO','QA-PLA-001','1','QA','2026-09-17T00:00:00Z']]},null,2));
let finalized=null;
const finalizeResult=await finalizeQaAudit({auditMutationPath,updateValues:async(spreadsheetId,range,values)=>{finalized={spreadsheetId,range,values};}});
assert.equal(finalizeResult.audit_writes,1);
assert.deepEqual(finalized,{spreadsheetId:'SHEET',range:'AUDITORIA_REVISION!J2:N2',values:[['APLICADO','QA-PLA-001','1','QA','2026-09-17T00:00:00Z']]});
fs.rmSync(tmpAuditDir,{recursive:true,force:true});

const partidoMarker='CUDO-QA-SYNTH-PARTIDO-TEST-001';
const partido={ID_PARTIDO:'QA-PAR-001',COMPETENCIA:'Copa QA',JORNADA:'Fecha QA',FECHA:'2026-09-20',HORA:'0,625',CATEGORIA:'TERCERA',LOCAL:'CUDO',VISITA:'Rival Sintético QA',RECINTO:partidoMarker,ESTADO_PARTIDO:'PROGRAMADO',GOLES_LOCAL:'',GOLES_VISITA:'',OBSERVACIONES:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
const partidoItem=publicPartidoItem(partido,'QA-PAR-001');
assert.deepEqual(partidoItem,{id:'QA-PAR-001',competencia:'Copa QA',fecha:'2026-09-20',hora:'15:00',categoria:'TERCERA',local:'CUDO',visita:'Rival Sintético QA',recinto:partidoMarker,estado_partido:'PROGRAMADO',goles_local:null,goles_visita:null});
assert.equal(validateQuarantinePlan(planFor('PARTIDO',partidoMarker,'QA-PAR-001'),{expectedMarker:partidoMarker,targetRow:partido}).summary.module,'PARTIDO');
assert.throws(()=>publicPartidoItem({...partido,RECINTO:'Cancha real',OBSERVACIONES:''},'QA-PAR-001'),/no sintético/);
assert.throws(()=>publicPartidoItem({...partido,ESTADO_PARTIDO:'FINALIZADO'},'QA-PAR-001'),/sin ambos marcadores/);
assert.throws(()=>publicPartidoItem({...partido,ESTADO_PARTIDO:'DESCONOCIDO'},'QA-PAR-001'),/fuera de contrato/);

const tablaMarker='CUDO-QA-SYNTH-TABLA-TEST-001';
const tabla={ID_TABLA:'QA-TAB-001',COMPETENCIA:'Copa QA',CATEGORIA:'TERCERA',POSICION:'1',EQUIPO:tablaMarker,PJ:'0',PG:'0',PE:'0',PP:'0',GF:'0',GC:'0',DG:'0',PTS:'0',OBSERVACIONES:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
const tablaItem=publicTablaItem(tabla,'QA-TAB-001');
assert.deepEqual(tablaItem,{id:'QA-TAB-001',competencia:'Copa QA',categoria:'TERCERA',posicion:1,equipo:tablaMarker,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,dg:0,pts:0});
assert.equal(validateQuarantinePlan(planFor('TABLA',tablaMarker,'QA-TAB-001'),{expectedMarker:'CUDO-QA-SYNTH-',targetRow:tabla}).summary.module,'TABLA');
assert.throws(()=>publicTablaItem({...tabla,DG:'1'},'QA-TAB-001'),/DG no coincide/);
assert.throws(()=>publicTablaItem({...tabla,EQUIPO:'Tabla real',OBSERVACIONES:''},'QA-TAB-001'),/no sintético/);

assert.throws(()=>validateQuarantinePlan({...noticiaPlan,pending:2},{expectedMarker:noticiaMarker,targetRow:noticia}),/exactamente 1/);
assert.throws(()=>validateQuarantinePlan({...noticiaPlan,summary:[{...noticiaPlan.summary[0],identifier:'otra'}]},{expectedMarker:noticiaMarker,targetRow:noticia}),/identificador/);
assert.throws(()=>validateQuarantinePlan({...noticiaPlan,summary:[{...noticiaPlan.summary[0],module:'GALERIA'}]},{expectedMarker:noticiaMarker,targetRow:noticia}),/decisión no permitida/);

const noticiaPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_NOTICIAS',items:[{id:'N-1',titulo:'Real'}]};
const noticiaOverlay={schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'NOTICIA',items:[publicNoticiaItem(noticia,'QA-NOT-001')]};
const noticiaMerged=mergeNoticiasQaOverride(noticiaPublic,noticiaOverlay);
assert.equal(noticiaMerged.items.some(x=>x.id==='QA-NOT-001'&&x.titulo===noticiaMarker),true);

const equipoPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_EQUIPOS',items:[]};
const equipoMerged=mergeEquiposQaOverride(equipoPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'EQUIPO',items:[equipoItem]});
assert.deepEqual(equipoMerged.items,[equipoItem]);
assert.throws(()=>mergeEquiposQaOverride(equipoPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'EQUIPO',items:[{id:'X',nombre:'Real',categoria:'PRIMERA'}]}),/sintéticos/);

const plantelPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_PLANTEL',items:[]};
const plantelMerged=mergePlantelQaOverride(plantelPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'PLANTEL',items:[plantelItem]});
assert.deepEqual(plantelMerged.items,[plantelItem]);
assert.throws(()=>mergePlantelQaOverride(plantelPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'PLANTEL',items:[{...plantelItem,nombre_deportivo:'Jugador real'}]}),/sintéticos/);

const partidoPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_PARTIDOS',items:[]};
const partidoMerged=mergePartidosQaOverride(partidoPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'PARTIDO',items:[partidoItem]});
assert.deepEqual(partidoMerged.items,[partidoItem]);
assert.throws(()=>mergePartidosQaOverride(partidoPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'PARTIDO',items:[{...partidoItem,recinto:'Cancha real'}]}),/sintéticos/);

const tablaPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_TABLA',items:[]};
const tablaMerged=mergeTablaQaOverride(tablaPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'TABLA',items:[tablaItem]});
assert.deepEqual(tablaMerged.items,[tablaItem]);
assert.throws(()=>mergeTablaQaOverride(tablaPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'TABLA',items:[{...tablaItem,equipo:'Real'}]}),/sintéticas/);

console.log(JSON.stringify({ok:true,mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',supported_modules:['NOTICIA','EQUIPO','PLANTEL','PARTIDO','TABLA'],shared_revision_suppressed:true,qa_overlay_contract:true,private_tally_media_materialization:true,deferred_audit_finalize:true},null,2));
