import assert from 'node:assert/strict';
import {AUDIT_HEADERS,RESPONSE_PREFIX_HEADERS,REVIEW_SHEET_ID,ingestReviewResponses,stableReviewId} from './ingest_review_form_responses.mjs';

const responseHeaders=[...RESPONSE_PREFIX_HEADERS,'¿Qué dato se corrige?','¿Cuál es el valor aprobado?','Decisión de revisión','¿La publicación está autorizada?','Si aparecen menores, ¿la autorización fue verificada?','Observaciones de revisión','Nombre del revisor','¿Qué dato se corrige?','¿Cuál es el valor aprobado?'];
const baselineRows=[
  ['2026-09-05 14:41','Partido / Resultado','QA-PAR-001','Aprobar publicación','SI','NO APLICA','histórico','qa-user'],
  ['2026-09-05 14:42','Partido / Resultado','QA-PAR-001','Aprobar corrección','SI','NO APLICA','histórico','qa-user','Recinto','Cancha QA'],
  ['2026-09-05 14:43','Partido / Resultado','QA-PAR-001','Aprobar retiro','SI','NO APLICA','histórico','qa-user']
];
const newPublish=['2026-09-15 10:00','Noticia','Noticia nueva','Aprobar publicación','SI','NO APLICA','publicar','qa-reviewer'];
const newCorrection=['2026-09-15 10:01','Partido / Resultado','CUDO vs Rival 2026-09-20','Aprobar corrección','SI','NO APLICA','cambiar cancha','qa-reviewer','Recinto','Cancha Nueva'];

function idFor(row){
  return stableReviewId({
    submittedAt:row[0],contentType:row[1],identifier:row[2],decision:row[3],
    authorizationPublication:row[4],authorizationMinors:row[5],observations:row[6],reviewer:row[7],
    correctionField:row[8]||'',newValue:row[9]||''
  });
}

const baselineIds=baselineRows.map(idFor);
// Reproduce the real regression: a new Form response is inserted BEFORE the historical rows.
// Positional baselines would incorrectly discard row 2; identity baselines must still ingest it.
const responses=[responseHeaders,newCorrection,...baselineRows,newPublish];

const publishId=idFor(newPublish);
const audit=[AUDIT_HEADERS,[publishId,newPublish[0],newPublish[1],newPublish[2],newPublish[3],newPublish[4],newPublish[5],newPublish[6],newPublish[7],'APLICADO','','','','','','']];
const state={historical_baseline_review_ids:baselineIds};
const writes=[];
const adapter={
  readValues:async(spreadsheetId,range)=>{
    assert.equal(spreadsheetId,REVIEW_SHEET_ID);
    if(range.includes('Respuestas de formulario 1')) return JSON.parse(JSON.stringify(responses));
    if(range==='AUDITORIA_REVISION!A:P') return JSON.parse(JSON.stringify(audit));
    throw new Error(`Lectura inesperada ${range}`);
  },
  appendValues:async(spreadsheetId,range,values)=>{writes.push({spreadsheetId,range,values:JSON.parse(JSON.stringify(values))});return{};}
};

const dry=await ingestReviewResponses({...adapter,state,apply:false,expectedNew:1});
assert.equal(dry.baseline_identity_mode,'stable_review_id');
assert.equal(dry.new_count,1);
assert.equal(dry.duplicate_count,1);
assert.deepEqual(dry.historical_baseline_rows,[3,4,5]);
assert.deepEqual(new Set(dry.historical_baseline_ids),new Set(baselineIds));
assert.equal(dry.writes_applied,0);
assert.equal(writes.length,0);
assert.equal(dry.new_entries[0].source_row,2);
assert.equal(dry.new_entries[0].has_correction,true);
assert.equal(dry.new_entries[0].audit_row[14],'Recinto');
assert.equal(dry.new_entries[0].audit_row[15],'Cancha Nueva');

await assert.rejects(()=>ingestReviewResponses({...adapter,state,apply:false,expectedNew:0}),/Safety gate ingestión: respuestas nuevas 1, esperado 0/);
assert.equal(writes.length,0);

const applied=await ingestReviewResponses({...adapter,state,apply:true,expectedNew:1});
assert.equal(applied.rows_appended,1);
assert.equal(applied.writes_applied,1);
assert.equal(writes.length,1);
assert.equal(writes[0].range,'AUDITORIA_REVISION!A:P');
assert.equal(writes[0].values.length,1);
assert.equal(writes[0].values[0][2],'Partido / Resultado');
assert.equal(writes[0].values[0][4],'Aprobar corrección');
assert.equal(writes[0].values[0][14],'Recinto');
assert.equal(writes[0].values[0][15],'Cancha Nueva');

const incomplete=['2026-09-15 11:00','Noticia','Sin revisor','Aprobar publicación','SI','NO APLICA','',''];
const incompleteResponses=[responseHeaders,incomplete,...baselineRows];
const badAdapter={...adapter,readValues:async(_id,range)=>range.includes('Respuestas de formulario 1')?incompleteResponses:[AUDIT_HEADERS]};
await assert.rejects(()=>ingestReviewResponses({...badAdapter,state,apply:false}),/respuesta incompleta \(reviewer\)/);

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',
  baseline_identity_mode:'stable_review_id',
  reordered_new_response_before_historical_baseline:'PASS',
  historical_baseline_rows_after_reorder:[3,4,5],
  duplicate_detection:'PASS',
  stable_id:'PASS',
  correction_mapping_I_J:'PASS',
  expected_new_gate:'PASS',
  dry_run_zero_writes:'PASS',
  apply_append_once:'PASS',
  incomplete_response_blocks:'PASS'
},null,2));
