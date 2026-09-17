import assert from 'node:assert/strict';
import {planPersonaReviewDecisions,REVIEW_SHEET_ID,PERSONAS_SHEET_ID} from './process_persona_review_decisions.mjs';
const audit=[
 ['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','OBSERVACIONES','REVISOR','ESTADO_PROCESO','ID_RESUELTO','COINCIDENCIAS','RESULTADO','FECHA_APLICACION','CAMPO_CORRECCION','NUEVO_VALOR'],
 ['CUDO-REV-TEST','2026-09-16T00:00:00Z','PERSONA','CUDO-PER-TEST','DAR_DE_ALTA','NO','NO APLICA','QA','sistemas@cudo.cl','','','','','','','']
];
const control=[['ID_PERSONA','TALLY_SUBMISSION_ID','FECHA_ENVIO','RELACION_CUDO','NOMBRE_PUBLICO'],['CUDO-PER-TEST','TEST','2026-09-16','Dirigente','Persona QA']];
const revision=[['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION','REVISOR','FECHA_REVISION','OBSERVACIONES']];
const readValues=async(id,range)=>id===REVIEW_SHEET_ID?audit:id===PERSONAS_SHEET_ID&&range.startsWith('PERSONAS_CONTROL')?control:revision;
const plan=await planPersonaReviewDecisions({readValues,now:()=> '2026-09-16T12:00:00.000Z',expectedPending:1});
assert.equal(plan.pending_count,1);
assert.equal(plan.summary[0].status,'APLICADO');
const revMutation=plan.mutations.find(x=>x.kind==='PERSONA_REVISION');
assert.deepEqual(revMutation.values[0].slice(0,5),['CUDO-PER-TEST','ALTA','NO','INTERNO','AUTORIZADO']);
assert.equal(plan.mutations.find(x=>x.kind==='AUDIT').values[0][0],'APLICADO');
console.log(JSON.stringify({ok:true,test:'PERSONA DAR_DE_ALTA remains internal',mutations:plan.mutations.length},null,2));
