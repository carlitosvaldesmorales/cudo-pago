import assert from 'node:assert/strict';
import { MODULES, REVIEW_SHEET_ID, processReviewDecisions, transition } from './process_review_decisions.mjs';

const HEADERS=['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','OBSERVACIONES','REVISOR','ESTADO_PROCESO','RESERVA','ESTADO_APLICACION','OBJETO','VERSION','MENSAJE','FECHA_APLICACION','ERROR','EXTRA'];
const audit=[
  HEADERS,
  ['rev-1','2026-09-15','NOTICIA','NOT-001','Aprobar y publicar','QA sintético','qa-agent',''],
  ['rev-2','2026-09-15','NOTICIA','NOT-002','Solicitar corrección','Falta bajada','qa-editor',''],
  ['rev-3','2026-09-15','PARTIDO','MATCH-QA','Aprobar y publicar','','qa-agent',''],
  ['rev-4','2026-09-15','NOTICIA','NOT-004','DECISION DESCONOCIDA','','qa-agent',''],
  ['rev-5','2026-09-15','NOTICIA','NOT-005','Rechazar','','qa-agent','APLICADO']
];
const revisions=[
  ['ID','ESTADO_REGISTRO','PUBLICAR','PRIVACIDAD','ESTADO_REVISION','REVISOR','FECHA_REVISION','OBSERVACIONES'],
  ['NOT-002','PENDIENTE','NO','INTERNO','PENDIENTE','','','']
];

const clone=value=>JSON.parse(JSON.stringify(value));
const makeAdapter=writes=>({
  now:()=> '2026-09-15T04:00:00.000Z',
  readValues:async(spreadsheetId,range)=>{
    if(spreadsheetId===REVIEW_SHEET_ID&&range==='AUDITORIA_REVISION!A:P') return clone(audit);
    if(spreadsheetId===MODULES.NOTICIA.spreadsheetId&&range==='REVISION!A:H') return clone(revisions);
    throw new Error(`Lectura inesperada ${spreadsheetId}/${range}`);
  },
  updateValues:async(spreadsheetId,range,values)=>{
    writes.push({op:'update',spreadsheetId,range,values:clone(values)});
    return {updatedRange:range};
  },
  appendValues:async(spreadsheetId,range,values)=>{
    writes.push({op:'append',spreadsheetId,range,values:clone(values)});
    return {updates:{updatedRange:range}};
  }
});

assert.deepEqual(transition('Aprobar y publicar'),['PUBLICADO','SI','PUBLICO','AUTORIZADO']);
assert.deepEqual(transition('Solicitar corrección'),['REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE']);
assert.deepEqual(transition('Rechazar'),['RECHAZADO','NO','INTERNO','PENDIENTE']);
assert.equal(transition('otra'),null);

const guardedWrites=[];
await assert.rejects(
  ()=>processReviewDecisions({...makeAdapter(guardedWrites),expectedPending:0}),
  /Safety gate: decisiones pendientes 4, esperado 0/
);
assert.equal(guardedWrites.length,0,'El safety gate debe detenerse antes de cualquier escritura');

const writes=[];
const result=await processReviewDecisions(makeAdapter(writes));
assert.equal(result.ok,true);
assert.equal(result.pending,4);
assert.deepEqual(result.summary.map(x=>x.status),[
  'APLICADO',
  'APLICADO',
  'IGNORADO_TIPO_NO_IMPLEMENTADO',
  'IGNORADO_DECISION_NO_IMPLEMENTADA'
]);

const append=writes.find(w=>w.op==='append'&&w.spreadsheetId===MODULES.NOTICIA.spreadsheetId);
assert.ok(append,'La noticia nueva debe agregarse a REVISION');
assert.deepEqual(append.values[0],[
  'NOT-001','PUBLICADO','SI','PUBLICO','AUTORIZADO','qa-agent','2026-09-15T04:00:00.000Z','QA sintético'
]);

const updateRevision=writes.find(w=>w.op==='update'&&w.range==='REVISION!A2:H2');
assert.ok(updateRevision,'La revisión existente debe actualizarse, no duplicarse');
assert.deepEqual(updateRevision.values[0],[
  'NOT-002','REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE','qa-editor','2026-09-15T04:00:00.000Z','Falta bajada'
]);

const auditWrites=writes.filter(w=>w.spreadsheetId===REVIEW_SHEET_ID&&w.range.startsWith('AUDITORIA_REVISION!J'));
assert.equal(auditWrites.length,2,'Sólo decisiones aplicadas deben marcarse en auditoría');
assert.equal(auditWrites[0].range,'AUDITORIA_REVISION!J2:O2');
assert.equal(auditWrites[1].range,'AUDITORIA_REVISION!J3:O3');

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',
  processor:'qa-v8-google/tools/process_review_decisions.mjs',
  safety_gate:'PASS_NO_WRITES_ON_PENDING_MISMATCH',
  pending:result.pending,
  applied:result.summary.filter(x=>x.status==='APLICADO').length,
  ignored:result.summary.filter(x=>x.status.startsWith('IGNORADO_')).length,
  writes:writes.map(w=>({op:w.op,range:w.range}))
},null,2));
