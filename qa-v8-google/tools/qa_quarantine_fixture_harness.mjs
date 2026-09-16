import assert from 'node:assert/strict';
import { MODULES } from './process_review_decisions.mjs';
import { rowContainsSyntheticMarker, publicNoticiaItem, publicEquipoItem, publicTablaItem, validateQuarantinePlan } from './process_review_decisions_qa_quarantine.mjs';
import { mergeNoticiasQaOverride, mergeEquiposQaOverride, mergeTablaQaOverride } from './apply_qa_review_overrides.mjs';

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

const tablaMarker='CUDO-QA-SYNTH-TABLA-TEST-001';
const tabla={ID_TABLA:'QA-TAB-001',COMPETENCIA:'Copa QA',CATEGORIA:'TERCERA',POSICION:'1',EQUIPO:tablaMarker,PJ:'0',PG:'0',PE:'0',PP:'0',GF:'0',GC:'0',DG:'0',PTS:'0',OBSERVACIONES:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
const tablaItem=publicTablaItem(tabla,'QA-TAB-001');
assert.deepEqual(tablaItem,{id:'QA-TAB-001',competencia:'Copa QA',categoria:'TERCERA',posicion:1,equipo:tablaMarker,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,dg:0,pts:0});
assert.equal(validateQuarantinePlan(planFor('TABLA',tablaMarker,'QA-TAB-001'),{expectedMarker:'CUDO-QA-SYNTH-',targetRow:tabla}).summary.module,'TABLA');
assert.throws(()=>publicTablaItem({...tabla,DG:'1'},'QA-TAB-001'),/DG no coincide/);
assert.throws(()=>publicTablaItem({...tabla,EQUIPO:'Tabla real',OBSERVACIONES:''},'QA-TAB-001'),/no sintético/);

assert.throws(()=>validateQuarantinePlan({...noticiaPlan,pending:2},{expectedMarker:noticiaMarker,targetRow:noticia}),/exactamente 1/);
assert.throws(()=>validateQuarantinePlan({...noticiaPlan,summary:[{...noticiaPlan.summary[0],identifier:'otra'}]},{expectedMarker:noticiaMarker,targetRow:noticia}),/identificador/);
assert.throws(()=>validateQuarantinePlan({...noticiaPlan,summary:[{...noticiaPlan.summary[0],module:'PLANTEL'}]},{expectedMarker:noticiaMarker,targetRow:noticia}),/decisión no permitida/);

const noticiaPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_NOTICIAS',items:[{id:'N-1',titulo:'Real'}]};
const noticiaOverlay={schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'NOTICIA',items:[publicNoticiaItem(noticia,'QA-NOT-001')]};
const noticiaMerged=mergeNoticiasQaOverride(noticiaPublic,noticiaOverlay);
assert.equal(noticiaMerged.items.some(x=>x.id==='QA-NOT-001'&&x.titulo===noticiaMarker),true);

const equipoPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_EQUIPOS',items:[]};
const equipoMerged=mergeEquiposQaOverride(equipoPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'EQUIPO',items:[equipoItem]});
assert.deepEqual(equipoMerged.items,[equipoItem]);
assert.throws(()=>mergeEquiposQaOverride(equipoPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'EQUIPO',items:[{id:'X',nombre:'Real',categoria:'PRIMERA'}]}),/sintéticos/);

const tablaPublic={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_TABLA',items:[]};
const tablaMerged=mergeTablaQaOverride(tablaPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'TABLA',items:[tablaItem]});
assert.deepEqual(tablaMerged.items,[tablaItem]);
assert.throws(()=>mergeTablaQaOverride(tablaPublic,{schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',module:'TABLA',items:[{...tablaItem,equipo:'Real'}]}),/sintéticas/);

console.log(JSON.stringify({ok:true,mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',supported_modules:['NOTICIA','EQUIPO','TABLA'],shared_revision_suppressed:true,qa_overlay_contract:true},null,2));
