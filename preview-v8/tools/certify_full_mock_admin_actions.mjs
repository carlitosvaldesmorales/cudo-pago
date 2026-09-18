import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T18:30:00-03:00'});
assert.equal(runtime.revision,1);
assert.equal(runtime.mock,true);
assert.equal(runtime.production_write,false);

// Baseline coverage.
let views=deriveMockReadModels(runtime,{referenceDate:'2026-09-18'});
assert.equal(views.operation.summary.total,12);
assert.equal(views.operation.summary.blocked,2);
assert.equal(views.operation.summary.waiting_external,2);
assert.equal(views.operation.summary.overdue,1);

// 1) Repair tractor -> blocked grass-cut work auto-unblocks.
let out=applyMockAdminAction(runtime,{
  action_id:'ACT-RESOURCE-001',
  type:'RESOURCE_STATE_SET',
  resource_id:'MOCK-RESOURCE-TRACTOR-01',
  expected_state:'MAINTENANCE',
  next_state:'AVAILABLE',
  attention:'NORMAL',
  reason:'Tractor reparado en escenario mock',
  expected_revision:1,
  at:'2026-09-18T18:31:00-03:00'
});
runtime=out.runtime;
assert.ok(out.effects.some(x=>x.kind==='AUTO_UNBLOCK_RESOURCE'&&x.work_id==='MOCK-WORK-GRASS-CUT-01'));
assert.equal(runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-GRASS-CUT-01').state,'OPEN');

// Idempotent action replay.
const replay=applyMockAdminAction(runtime,{
  action_id:'ACT-RESOURCE-001',
  type:'RESOURCE_STATE_SET',
  resource_id:'MOCK-RESOURCE-TRACTOR-01',
  expected_state:'MAINTENANCE',
  next_state:'AVAILABLE',
  expected_revision:1,
  at:'2026-09-18T18:31:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.revision,runtime.revision);

// 2) Beverage return OPEN -> IN_PROGRESS -> DONE with evidence -> settlement auto-unblocks.
out=applyMockAdminAction(runtime,{
  action_id:'ACT-BEV-START-001',type:'WORK_TRANSITION',
  work_id:'MOCK-WORK-BEVERAGE-RETURN-01',expected_state:'OPEN',next_state:'IN_PROGRESS',
  reason:'Inicio devolución mock',expected_revision:runtime.revision,at:'2026-09-18T18:32:00-03:00'
});
runtime=out.runtime;
out=applyMockAdminAction(runtime,{
  action_id:'ACT-BEV-DONE-001',type:'WORK_TRANSITION',
  work_id:'MOCK-WORK-BEVERAGE-RETURN-01',expected_state:'IN_PROGRESS',next_state:'DONE',
  evidence_ref:'MOCK-EVIDENCE-BEVERAGE-RETURN-001',reason:'Sobrante devuelto',
  expected_revision:runtime.revision,at:'2026-09-18T18:33:00-03:00'
});
runtime=out.runtime;
assert.equal(runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-BEVERAGE-RETURN-01').state,'DONE');
assert.equal(runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-BEVERAGE-SETTLEMENT-01').state,'OPEN');
assert.ok(out.effects.some(x=>x.kind==='AUTO_UNBLOCK_DEPENDENCY'));

// 3) DONE without evidence must fail.
out=applyMockAdminAction(runtime,{
  action_id:'ACT-PREP-START-001',type:'WORK_TRANSITION',
  work_id:'MOCK-WORK-PREPARE-FIELD-01',expected_state:'OPEN',next_state:'IN_PROGRESS',
  expected_revision:runtime.revision,at:'2026-09-18T18:34:00-03:00'
});
runtime=out.runtime;
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'ACT-PREP-DONE-BAD',type:'WORK_TRANSITION',
  work_id:'MOCK-WORK-PREPARE-FIELD-01',expected_state:'IN_PROGRESS',next_state:'DONE',
  expected_revision:runtime.revision,at:'2026-09-18T18:35:00-03:00'
}),/DONE requires evidence/);

// Add evidence + complete.
out=applyMockAdminAction(runtime,{
  action_id:'ACT-EVIDENCE-001',type:'EVIDENCE_ADD',
  evidence_id:'MOCK-EVIDENCE-FIELD-READY-001',kind:'PHOTO',
  display_name:'Cancha preparada Mock',
  related_refs:['MOCK-WORK-PREPARE-FIELD-01'],
  expected_revision:runtime.revision,at:'2026-09-18T18:36:00-03:00'
});
runtime=out.runtime;
out=applyMockAdminAction(runtime,{
  action_id:'ACT-PREP-DONE-001',type:'WORK_TRANSITION',
  work_id:'MOCK-WORK-PREPARE-FIELD-01',expected_state:'IN_PROGRESS',next_state:'DONE',
  evidence_ref:'MOCK-EVIDENCE-FIELD-READY-001',
  expected_revision:runtime.revision,at:'2026-09-18T18:37:00-03:00'
});
runtime=out.runtime;
assert.equal(runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-PREPARE-FIELD-01').state,'DONE');

// 4) Human decision.
out=applyMockAdminAction(runtime,{
  action_id:'ACT-DECISION-001',type:'DECISION_TRANSITION',
  decision_id:'MOCK-DECISION-EXPENSE-01',expected_state:'PENDING_HUMAN',next_state:'APPROVED',
  reason:'Aprobación sintética',expected_revision:runtime.revision,at:'2026-09-18T18:38:00-03:00'
});
runtime=out.runtime;
assert.equal(runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-EXPENSE-01').state,'APPROVED');

// 5) Finance: settle the open irrigation payable; movement and settlement are derived in same action.
out=applyMockAdminAction(runtime,{
  action_id:'ACT-FINANCE-001',type:'FINANCIAL_SETTLE',
  obligation_id:'MOCK-OBL-IRRIGATION-01',amount_clp:50000,channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-TRANSFER-001',expected_revision:runtime.revision,
  at:'2026-09-18T18:39:00-03:00'
});
runtime=out.runtime;
const obl=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-IRRIGATION-01');
assert.equal(obl.state,'SETTLED');
assert.equal(obl.outstanding_amount_clp,0);
assert.ok(runtime.state.financial_movements.some(x=>x.movement_id===out.effects[0].movement_id));
assert.ok(runtime.state.settlements.some(x=>x.obligation_id==='MOCK-OBL-IRRIGATION-01'));

// 6) Optimistic concurrency guard.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'ACT-STALE-001',type:'DECISION_TRANSITION',
  decision_id:'MOCK-DECISION-EXPENSE-01',expected_state:'APPROVED',next_state:'APPLIED',
  expected_revision:1,at:'2026-09-18T18:40:00-03:00'
}),/stale revision/);

views=deriveMockReadModels(runtime,{referenceDate:'2026-09-18'});
assert.equal(views.operation.items.find(x=>x.work_id==='MOCK-WORK-GRASS-CUT-01').state,'OPEN');
assert.equal(views.operation.items.find(x=>x.work_id==='MOCK-WORK-BEVERAGE-SETTLEMENT-01').state,'OPEN');
assert.equal(views.finance.obligations.find(x=>x.obligation_id==='MOCK-OBL-IRRIGATION-01').state,'SETTLED');
assert.equal(views.governance.decisions.find(x=>x.decision_id==='MOCK-DECISION-EXPENSE-01').state,'APPROVED');
assert.ok(views.evidence.summary.audit_events>golden.audit.length);

console.log(JSON.stringify({
  ok:true,
  runtime:'CUDO_MOCK_ADMIN_RUNTIME_V1',
  final_revision:runtime.revision,
  resource_blocker_auto_unblocked:true,
  work_dependency_auto_unblocked:true,
  done_requires_evidence:true,
  evidence_add:true,
  human_decision_transition:true,
  financial_settlement_propagation:true,
  optimistic_revision_guard:true,
  action_idempotence:true,
  production_write:false
},null,2));
