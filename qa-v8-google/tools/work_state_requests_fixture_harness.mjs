import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  planWorkStateRequests,
  REQUEST_HEADERS
} from './process_work_state_requests.mjs';

const initial=JSON.parse(fs.readFileSync('qa-v8-google/state/operational-work-state.json','utf8'));
const workId='CUDO-WORK-GRASS-CUT-20260921';

function requestRow({
  id,
  expected,
  action,
  reason,
  evidence='',
  by='sistemas@cudo.cl',
  status='PENDING'
}){
  return [
    id,
    '2026-09-18T15:30:00.000Z',
    workId,
    expected,
    action,
    reason,
    evidence,
    by,
    status,
    '',
    ''
  ];
}

const start=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({id:'REQ-START-001',expected:'OPEN',action:'START',reason:'Inicio QA'})
  ],
  stateStore:initial,
  now:()=> '2026-09-18T15:31:00.000Z',
  expectedPending:1
});
assert.equal(start.summary[0].status,'APPLIED');
assert.equal(start.state_store.objects[0].lifecycle_state,'IN_PROGRESS');
assert.equal(start.projection.items[0].state,'IN_PROGRESS');
assert.equal(start.state_store.audit.length,1);
assert.equal(start.sheet_mutations.some(x=>x.kind==='WORK_AUDIT'),true);
assert.equal(start.sheet_mutations.some(x=>x.kind==='WORK_CONTROL'),true);
const controlMutation=start.sheet_mutations.find(x=>x.kind==='WORK_CONTROL');
assert.equal(controlMutation.values[0][8],'FINANCIAL_CONTEXT');
assert.equal(controlMutation.values[0][9],'FINANCIAL_CONTEXT_SEMANTICS');
const controlText=controlMutation.values.slice(1).map(row=>String(row[8]||''));
assert.ok(controlText.includes('CLP 50000 · EVERY_TWO_MONTHS'));
assert.ok(controlText.includes('CLP 25000-30000 · según suciedad'));
assert.ok(controlText.includes('CLP 15000 por equipo lavado'));

const noEvidence=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({
      id:'REQ-DONE-NO-EVID',
      expected:'IN_PROGRESS',
      action:'COMPLETE',
      reason:'Cerrar sin evidencia'
    })
  ],
  stateStore:start.state_store,
  now:()=> '2026-09-18T15:32:00.000Z',
  expectedPending:1
});
assert.equal(noEvidence.summary[0].status,'DONE_REQUIRES_EVIDENCE');
assert.equal(noEvidence.state_store.objects[0].lifecycle_state,'IN_PROGRESS');
assert.equal(noEvidence.state_store.audit.length,1);

const done=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({
      id:'REQ-DONE-001',
      expected:'IN_PROGRESS',
      action:'COMPLETE',
      reason:'Trabajo terminado',
      evidence:'qa://evidence/grass-cut-photo'
    })
  ],
  stateStore:start.state_store,
  now:()=> '2026-09-18T15:33:00.000Z',
  expectedPending:1
});
assert.equal(done.summary[0].status,'APPLIED');
assert.equal(done.state_store.objects[0].lifecycle_state,'DONE');
assert.equal(done.projection.summary.done,1);
assert.equal(done.state_store.audit.length,2);
assert.equal(done.state_store.audit[1].evidence_refs[0],'qa://evidence/grass-cut-photo');

const conflict=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({id:'REQ-CONFLICT-001',expected:'OPEN',action:'START',reason:'Estado viejo'})
  ],
  stateStore:start.state_store,
  now:()=> '2026-09-18T15:34:00.000Z',
  expectedPending:1
});
assert.equal(conflict.summary[0].status,'EXPECTED_STATE_CONFLICT');
assert.equal(conflict.state_store.objects[0].lifecycle_state,'IN_PROGRESS');

const unauthorized=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({
      id:'REQ-BAD-USER',
      expected:'IN_PROGRESS',
      action:'BLOCK',
      reason:'No autorizado',
      by:'otro@example.com'
    })
  ],
  stateStore:start.state_store,
  now:()=> '2026-09-18T15:35:00.000Z',
  expectedPending:1
});
assert.equal(unauthorized.summary[0].status,'BLOCKED_REQUESTER');
assert.equal(unauthorized.state_store.objects[0].lifecycle_state,'IN_PROGRESS');

const duplicate=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({
      id:'REQ-START-001',
      expected:'IN_PROGRESS',
      action:'BLOCK',
      reason:'Duplicado'
    })
  ],
  stateStore:start.state_store,
  now:()=> '2026-09-18T15:36:00.000Z',
  expectedPending:1
});
assert.equal(duplicate.summary[0].status,'DUPLICATE_ALREADY_APPLIED');
assert.equal(duplicate.state_store.objects[0].lifecycle_state,'IN_PROGRESS');

assert.throws(
  ()=>planWorkStateRequests({
    requestValues:[REQUEST_HEADERS],
    stateStore:initial,
    now:()=> '2026-09-18T15:37:00.000Z',
    expectedPending:1
  }),
  /pendientes 0, esperado 1/
);

console.log(JSON.stringify({
  ok:true,
  processor:'CUDO_WORK_STATE_REQUEST_PROCESSOR_V1',
  start_transition:true,
  done_requires_evidence:true,
  complete_with_evidence:true,
  expected_state_fail_closed:true,
  requester_acl:true,
  duplicate_idempotent:true,
  pending_count_safety_gate:true,
  projection_updates_with_state:true,
  work_control_sheet_is_projection:true,
  production_write:false
},null,2));
