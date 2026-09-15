import assert from 'node:assert/strict';
import { MODULES, REVIEW_SHEET_ID, processReviewDecisions, resolveContentType, transition } from './process_review_decisions.mjs';

const HEADERS=['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','OBSERVACIONES','REVISOR','ESTADO_PROCESO','ID_RESUELTO','COINCIDENCIAS','RESULTADO','FECHA_APLICACION','CAMPO_CORRECCION','NUEVO_VALOR'];
const audit=[
  HEADERS,
  ['rev-1','2026-09-15','NOTICIA','NOT-001','Aprobar y publicar','','','QA noticia','qa-agent',''],
  ['rev-2','2026-09-15','Equipo / Serie','EQ-001','Aprobar y publicar','','','QA equipo','qa-agent',''],
  ['rev-3','2026-09-15','Jugador / Plantel','JUG-001','Solicitar corrección','','','Falta dorsal','qa-editor',''],
  ['rev-4','2026-09-15','Partido / Resultado','MATCH-QA','Aprobar y publicar','','','QA partido','qa-agent',''],
  ['rev-5','2026-09-15','TABLA','TAB-001','Rechazar','','','QA tabla','qa-agent',''],
  ['rev-6','2026-09-15','Galería','GAL-001','Aprobar y publicar','AUTORIZADO','NO APLICA','QA galería','qa-agent',''],
  ['rev-7','2026-09-15','OTRO','X-001','Aprobar y publicar','','','','qa-agent',''],
  ['rev-8','2026-09-15','NOTICIA','NOT-004','DECISION DESCONOCIDA','','','','qa-agent',''],
  ['rev-9','2026-09-15','NOTICIA','NOT-005','Rechazar','','','','qa-agent','APLICADO']
];
const STANDARD_HEADERS=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION','REVISOR','FECHA_REVISION','OBSERVACIONES'];
const revisionByModule={
  NOTICIA:[STANDARD_HEADERS],
  EQUIPO:[STANDARD_HEADERS],
  PLANTEL:[STANDARD_HEADERS,['JUG-001','PENDIENTE','NO','INTERNO','PENDIENTE','','','']],
  PARTIDO:[STANDARD_HEADERS],
  TABLA:[STANDARD_HEADERS]
};

const clone=value=>JSON.parse(JSON.stringify(value));
const moduleBySpreadsheet=Object.fromEntries(Object.entries(MODULES).map(([key,value])=>[value.spreadsheetId,key]));
const makeAdapter=(writes,{badContractModule=null}={})=>({
  now:()=> '2026-09-15T05:15:00.000Z',
  readValues:async(spreadsheetId,range)=>{
    if(spreadsheetId===REVIEW_SHEET_ID&&range==='AUDITORIA_REVISION!A:P') return clone(audit);
    const moduleKey=moduleBySpreadsheet[spreadsheetId];
    if(moduleKey&&range==='REVISION!A:H'){
      if(moduleKey==='GALERIA') throw new Error('Galería no debe leerse mientras su contrato esté bloqueado');
      const rows=clone(revisionByModule[moduleKey]);
      if(moduleKey===badContractModule) rows[0]=['ID','ESTADO_ROTO',...STANDARD_HEADERS.slice(2)];
      return rows;
    }
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
assert.equal(resolveContentType('NOTICIA'),'NOTICIA');
assert.equal(resolveContentType('Equipo / Serie'),'EQUIPO');
assert.equal(resolveContentType('Jugador / Plantel'),'PLANTEL');
assert.equal(resolveContentType('Partido / Resultado'),'PARTIDO');
assert.equal(resolveContentType('tabla'),'TABLA');
assert.equal(resolveContentType('Galería'),'GALERIA');

const guardedWrites=[];
await assert.rejects(
  ()=>processReviewDecisions({...makeAdapter(guardedWrites),expectedPending:0}),
  /Safety gate: decisiones pendientes 8, esperado 0/
);
assert.equal(guardedWrites.length,0,'El safety gate debe detenerse antes de cualquier escritura');

const contractWrites=[];
await assert.rejects(
  ()=>processReviewDecisions(makeAdapter(contractWrites,{badContractModule:'EQUIPO'})),
  /EQUIPO: contrato REVISION inesperado/
);
assert.equal(contractWrites.length,0,'El preflight de contratos debe fallar antes de la primera escritura');

const writes=[];
const result=await processReviewDecisions(makeAdapter(writes));
assert.equal(result.ok,true);
assert.equal(result.pending,8);
assert.deepEqual(result.preflight_modules.sort(),['EQUIPO','NOTICIA','PARTIDO','PLANTEL','TABLA']);
assert.deepEqual(result.summary.map(x=>x.status),[
  'APLICADO',
  'APLICADO',
  'APLICADO',
  'APLICADO',
  'APLICADO',
  'BLOQUEADO_CONTRATO_AUTORIZACION_MENORES_REQUIERE_ADAPTADOR',
  'IGNORADO_TIPO_NO_IMPLEMENTADO',
  'IGNORADO_DECISION_NO_IMPLEMENTADA'
]);

for(const key of ['NOTICIA','EQUIPO','PARTIDO','TABLA']){
  const append=writes.find(w=>w.op==='append'&&w.spreadsheetId===MODULES[key].spreadsheetId);
  assert.ok(append,`${key} debe agregar una fila REVISION`);
}
const updatePlantel=writes.find(w=>w.op==='update'&&w.spreadsheetId===MODULES.PLANTEL.spreadsheetId&&w.range==='REVISION!A2:H2');
assert.ok(updatePlantel,'PLANTEL debe actualizar la revisión existente');
assert.deepEqual(updatePlantel.values[0],[
  'JUG-001','REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE','qa-editor','2026-09-15T05:15:00.000Z','Falta dorsal'
]);
assert.equal(writes.some(w=>w.spreadsheetId===MODULES.GALERIA.spreadsheetId),false,'Galería debe quedar sin escrituras hasta adaptar autorización de menores');

const auditWrites=writes.filter(w=>w.spreadsheetId===REVIEW_SHEET_ID&&w.range.startsWith('AUDITORIA_REVISION!J'));
assert.equal(auditWrites.length,5,'Cinco dominios seguros deben marcar sus decisiones como aplicadas');

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',
  processor:'qa-v8-google/tools/process_review_decisions.mjs',
  safety_gate:'PASS_NO_WRITES_ON_PENDING_MISMATCH',
  contract_preflight:'PASS_NO_PARTIAL_WRITES_ON_SCHEMA_DRIFT',
  supported_domains:['NOTICIA','EQUIPO','PLANTEL','PARTIDO','TABLA'],
  blocked_domains:['GALERIA'],
  pending:result.pending,
  applied:result.summary.filter(x=>x.status==='APLICADO').length,
  blocked:result.summary.filter(x=>x.status.startsWith('BLOQUEADO_')).length,
  writes:writes.map(w=>({op:w.op,spreadsheetId:w.spreadsheetId===REVIEW_SHEET_ID?'REVIEW_AUDIT':moduleBySpreadsheet[w.spreadsheetId],range:w.range}))
},null,2));
