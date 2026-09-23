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
  status='PENDING',
  work_id=workId
}){
  return [
    id,
    '2026-09-18T15:30:00.000Z',
    work_id,
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
assert.equal(controlMutation.values[0][8],'SCHEDULE_CONTEXT');
assert.equal(controlMutation.values[0][9],'FINANCIAL_CONTEXT');
assert.equal(controlMutation.values[0][10],'FINANCIAL_CONTEXT_SEMANTICS');
assert.equal(controlMutation.values[0][11],'FINANCIAL_EFFECT');
assert.equal(controlMutation.values[0][12],'OUTSTANDING_CLP');
assert.equal(controlMutation.values[0][15],'RESPONSIBLE_ACTOR_ID');
assert.equal(controlMutation.values.find(row=>row[0]===workId)[15],'CUDO-ACTOR-MAX-FIGUEROA-001');
const scheduleText=controlMutation.values.slice(1).map(row=>String(row[8]||''));
const controlText=controlMutation.values.slice(1).map(row=>String(row[9]||''));
assert.ok(controlText.includes('CLP 50000 · EVERY_TWO_MONTHS'));
assert.ok(controlText.includes('CLP 25000-30000 · según suciedad'));
assert.ok(controlText.includes('CLP 15000 por equipo lavado'));
assert.ok(controlText.includes('CLP 50000 · PER_COMPLETED_IRRIGATION'));
assert.ok(scheduleText.includes('2026-10-05 -> 2026-10-06 · posible extensión 2026-10-07 según agua'));

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
assert.equal(done.state_store.objects.filter(x=>x.object_type==='FINANCIAL_OBLIGATION').length,0);

// Completing irrigation creates the real payable in the same governed cycle.
const irrigationId='CUDO-WORK-IRRIGATION-20261005';
const irrigationStart=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({
      id:'REQ-IRR-START-001',
      expected:'OPEN',
      action:'START',
      reason:'Inicio riego QA',
      work_id:irrigationId
    })
  ],
  stateStore:initial,
  now:()=> '2026-10-05T12:00:00.000Z',
  expectedPending:1
});
assert.equal(irrigationStart.summary[0].status,'APPLIED');
assert.equal(irrigationStart.state_store.objects.find(x=>x.object_id===irrigationId).lifecycle_state,'IN_PROGRESS');
assert.equal(irrigationStart.state_store.objects.filter(x=>x.object_type==='FINANCIAL_OBLIGATION').length,0);

const irrigationDone=planWorkStateRequests({
  requestValues:[
    REQUEST_HEADERS,
    requestRow({
      id:'REQ-IRR-DONE-001',
      expected:'IN_PROGRESS',
      action:'COMPLETE',
      reason:'Riego terminado QA',
      evidence:'qa://evidence/irrigation-completed-2026-10-06',
      work_id:irrigationId
    })
  ],
  stateStore:irrigationStart.state_store,
  now:()=> '2026-10-06T17:30:00.000Z',
  expectedPending:1
});
assert.equal(irrigationDone.summary[0].status,'APPLIED');
const irrigationObligations=irrigationDone.state_store.objects.filter(x=>x.object_type==='FINANCIAL_OBLIGATION');
assert.equal(irrigationObligations.length,1);
assert.equal(irrigationObligations[0].object_id,'CUDO-OBL-WORK-IRRIGATION-20261005');
assert.equal(irrigationObligations[0].data.amount,50000);
assert.equal(irrigationObligations[0].lifecycle_state,'OPEN');
assert.equal(irrigationDone.state_store.objects.filter(x=>x.object_type==='FINANCIAL_MOVEMENT').length,0);

const irrigationProjected=irrigationDone.projection.items.find(x=>x.work_id===irrigationId);
assert.equal(irrigationProjected.state,'DONE');
assert.equal(irrigationProjected.financial_effect.obligation_id,'CUDO-OBL-WORK-IRRIGATION-20261005');
assert.equal(irrigationProjected.financial_effect.outstanding_amount_clp,50000);
assert.equal(irrigationProjected.financial_effect.payee_display_name,'Mario Díaz');

const irrigationControl=irrigationDone.sheet_mutations.find(x=>x.kind==='WORK_CONTROL');
const irrigationRow=irrigationControl.values.find(row=>row[0]===irrigationId);
assert.ok(String(irrigationRow[11]).includes('OPEN · CUDO-OBL-WORK-IRRIGATION-20261005'));
assert.equal(irrigationRow[12],50000);

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
  completed_irrigation_creates_payable:true,
  no_manual_finance_reentry:true,
  no_payment_invented:true,
  production_write:false
},null,2));
