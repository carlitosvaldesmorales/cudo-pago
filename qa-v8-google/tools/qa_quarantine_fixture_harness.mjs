import assert from 'node:assert/strict';
import { rowContainsSyntheticMarker, publicNoticiaItem, validateQuarantinePlan } from './process_review_decisions_qa_quarantine.mjs';
import { mergeNoticiasQaOverride } from './apply_qa_review_overrides.mjs';

const marker='CUDO-QA-SYNTH-NOTICIA-TEST-001';
const target={ID_NOTICIA:'QA-NOT-001',FECHA:'2026-09-16',SLUG:'cudo-qa-synth-noticia-test-001',TITULO:marker,RESUMEN:'Resumen QA',CUERPO:'Contenido QA',IMAGEN_REF:'',OBSERVACIONES:'SYNTHETIC_QA_DO_NOT_PUBLISH'};
assert.equal(rowContainsSyntheticMarker(target,marker),true);
assert.equal(rowContainsSyntheticMarker({TITULO:'Noticia real'},marker),false);
assert.deepEqual(publicNoticiaItem(target,'QA-NOT-001'),{id:'QA-NOT-001',fecha:'2026-09-16',slug:'cudo-qa-synth-noticia-test-001',titulo:marker,resumen:'Resumen QA',cuerpo:'Contenido QA'});
assert.throws(()=>publicNoticiaItem({...target,TITULO:'Real',OBSERVACIONES:''},'QA-NOT-001'),/no sintética/);

const plan={pending:1,summary:[{module:'NOTICIA',action:'PUBLISH',status:'APLICADO',identifier:marker,id:'QA-NOT-001'}],mutations:[
  {op:'append',kind:'REVISION',spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',range:'REVISION!A:H',values:[['QA-NOT-001']]},
  {op:'update',kind:'AUDIT',spreadsheetId:'1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms',range:'AUDITORIA_REVISION!J2:N2',values:[['APLICADO','QA-NOT-001','1','Aprobar publicación aplicado','2026-09-16T00:00:00Z']]}
]};
const validated=validateQuarantinePlan(plan,{expectedMarker:marker,targetRow:target});
assert.equal(validated.summary.id,'QA-NOT-001');
assert.equal(validated.auditMutation.kind,'AUDIT');
assert.equal(validated.revisionSuppressed.kind,'REVISION');
assert.throws(()=>validateQuarantinePlan({...plan,pending:2},{expectedMarker:marker,targetRow:target}),/exactamente 1/);
assert.throws(()=>validateQuarantinePlan({...plan,summary:[{...plan.summary[0],identifier:'otra'}]},{expectedMarker:marker,targetRow:target}),/identificador/);

const publicDoc={schema_version:'1.0',generated_at:'old',source:'CUDO_WEB_NOTICIAS',items:[{id:'N-1',titulo:'Real'}]};
const overlay={schema_version:'1.0',mode:'QA_SYNTHETIC_QUARANTINE',items:[publicNoticiaItem(target,'QA-NOT-001')]};
const merged=mergeNoticiasQaOverride(publicDoc,overlay);
assert.equal(merged.items.length,2);
assert.equal(merged.items.some(x=>x.id==='QA-NOT-001'&&x.titulo===marker),true);
assert.throws(()=>mergeNoticiasQaOverride(publicDoc,{...overlay,items:[{id:'X',titulo:'Noticia real'}]}),/sintéticas/);

console.log(JSON.stringify({ok:true,mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',shared_revision_suppressed:true,qa_overlay_contract:true,marker},null,2));
