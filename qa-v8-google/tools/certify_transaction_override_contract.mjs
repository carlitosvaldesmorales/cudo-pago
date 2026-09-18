import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stateFingerprint} from './generic_propagation_executor.mjs';
import {
  buildTransactionPlan,
  commitTransaction,
  buildCompensationPlan,
  createOverrideRequest,
  approveOverride,
  revokeOverride,
  effectiveValue,
  transactionFingerprint
} from './transaction_override_contract.mjs';

const registry=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-dependency-rule-registry-v1.json','utf8'));
const propagationFixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-propagation-fixture-v1.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-transaction-override-fixture-v1.json','utf8'));
const NOW='2026-09-18T13:00:00.000Z';

function readField(objects,objectId,field){
  const object=objects.find(x=>x.object_id===objectId);
  assert.ok(object,`missing object ${objectId}`);
  return object.data[field];
}

// 1) Clean plan + all-or-none canonical commit.
const plan=buildTransactionPlan({
  objects:propagationFixture.objects,
  registry,
  changes:[{object_id:'CUDO-RESOURCE-SYNTH-BEV-001',field:'returned_qty',value:25,source_ref:'fixture://txn/return'}],
  activeConditions:fixture.active_conditions,
  requestedBy:fixture.requested_by,
  reason:fixture.reason,
  evidenceRefs:fixture.evidence_refs,
  now:NOW
});
assert.equal(plan.status,'READY');
assert.equal(plan.transitions.length,3);
assert.equal(plan.preconditions.length,2);
const committed=commitTransaction({currentObjects:propagationFixture.objects,plan,now:'2026-09-18T13:01:00.000Z'});
assert.equal(committed.ok,true);
assert.equal(committed.status,'COMMITTED');
assert.equal(readField(committed.objects,'CUDO-OBL-SYNTH-SUP-001','payable_qty'),75);
assert.equal(readField(committed.objects,'CUDO-OBL-SYNTH-SUP-001','supplier_payable'),37500);

// 2) Optimistic concurrency conflict is fail-closed and does not partially mutate state.
const concurrent=JSON.parse(JSON.stringify(propagationFixture.objects));
concurrent.find(x=>x.object_id==='CUDO-RESOURCE-SYNTH-BEV-001').object_version++;
const beforeConflict=stateFingerprint(concurrent);
const conflict=commitTransaction({currentObjects:concurrent,plan,now:'2026-09-18T13:01:30.000Z'});
assert.equal(conflict.ok,false);
assert.equal(conflict.status,'CONFLICT');
assert.equal(stateFingerprint(conflict.objects),beforeConflict,'conflict must not mutate current state');

// 3) Propagation failure blocks transaction before commit.
const broken=JSON.parse(JSON.stringify(propagationFixture.objects));
broken.find(x=>x.object_id==='CUDO-RESOURCE-SYNTH-BEV-001').relationships=
  broken.find(x=>x.object_id==='CUDO-RESOURCE-SYNTH-BEV-001').relationships.filter(x=>x.relationship_type!=='USED_BY_EVENT');
const blockedPlan=buildTransactionPlan({
  objects:broken,
  registry,
  changes:[{object_id:'CUDO-RESOURCE-SYNTH-BEV-001',field:'sold_qty',value:69,source_ref:'fixture://txn/broken'}],
  activeConditions:fixture.active_conditions,
  requestedBy:fixture.requested_by,
  reason:fixture.reason,
  evidenceRefs:fixture.evidence_refs,
  now:NOW
});
assert.equal(blockedPlan.status,'BLOCKED');
assert.equal(blockedPlan.transitions.length,0);
const blockedCommit=commitTransaction({currentObjects:broken,plan:blockedPlan});
assert.equal(blockedCommit.ok,false);
assert.equal(blockedCommit.status,'BLOCKED');

// 4) Compensation is explicit, reverse ordered and never auto-executed externally.
const appliedIds=plan.transitions.slice(0,2).map(x=>x.transition_id);
const compensation=buildCompensationPlan({
  transactionPlan:plan,
  appliedTransitionIds:appliedIds,
  reason:'Simulación de fallo parcial de adaptador externo',
  requestedBy:fixture.requested_by
});
assert.equal(compensation.automatic_external_execution,false);
assert.equal(compensation.reversals.length,2);
assert.equal(compensation.reversals[0].compensation_for_transition_id,appliedIds[1]);
assert.equal(compensation.reversals[1].compensation_for_transition_id,appliedIds[0]);

// 5) Human override overlays a DERIVED field; canonical algebra keeps running underneath.
const overrideRequest=createOverrideRequest({
  objects:committed.objects,
  objectId:'CUDO-OBL-SYNTH-SUP-001',
  field:'supplier_payable',
  requestedValue:39000,
  requestedBy:fixture.requested_by,
  reason:'Ajuste humano sintético respaldado',
  evidenceRefs:['fixture://override/evidence'],
  now:'2026-09-18T13:03:00.000Z'
});
assert.equal(overrideRequest.state,'PENDING_APPROVAL');
const activeOverride=approveOverride(overrideRequest,{approvedBy:fixture.approved_by,now:'2026-09-18T13:04:00.000Z'});
const effectiveBefore=effectiveValue({
  objects:committed.objects,
  overrides:[activeOverride],
  objectId:'CUDO-OBL-SYNTH-SUP-001',
  field:'supplier_payable',
  at:'2026-09-18T13:04:30.000Z'
});
assert.equal(effectiveBefore.value,39000);
assert.equal(effectiveBefore.canonical_value,37500);
assert.equal(effectiveBefore.source,'HUMAN_OVERRIDE');

const costPlan=buildTransactionPlan({
  objects:committed.objects,
  registry,
  changes:[{object_id:'CUDO-RESOURCE-SYNTH-BEV-001',field:'unit_cost',value:600,source_ref:'fixture://txn/cost'}],
  activeConditions:fixture.active_conditions,
  requestedBy:fixture.requested_by,
  reason:'Cambio sintético de costo',
  evidenceRefs:['fixture://txn/cost'],
  now:'2026-09-18T13:05:00.000Z'
});
const costCommit=commitTransaction({currentObjects:committed.objects,plan:costPlan,now:'2026-09-18T13:05:10.000Z'});
assert.equal(costCommit.ok,true);
assert.equal(readField(costCommit.objects,'CUDO-OBL-SYNTH-SUP-001','supplier_payable'),45000);
const effectiveDuring=effectiveValue({
  objects:costCommit.objects,
  overrides:[activeOverride],
  objectId:'CUDO-OBL-SYNTH-SUP-001',
  field:'supplier_payable',
  at:'2026-09-18T13:05:20.000Z'
});
assert.equal(effectiveDuring.value,39000,'active override must remain an overlay');
assert.equal(effectiveDuring.canonical_value,45000,'canonical algebra must continue underneath override');

const revoked=revokeOverride(activeOverride,{revokedBy:fixture.approved_by,now:'2026-09-18T13:05:30.000Z'});
const effectiveAfter=effectiveValue({
  objects:costCommit.objects,
  overrides:[revoked],
  objectId:'CUDO-OBL-SYNTH-SUP-001',
  field:'supplier_payable',
  at:'2026-09-18T13:05:40.000Z'
});
assert.equal(effectiveAfter.value,45000);
assert.equal(effectiveAfter.source,'CANONICAL');

// 6) SOURCE fields cannot be overridden; they must go through normal source-change transaction.
assert.throws(()=>createOverrideRequest({
  objects:costCommit.objects,
  objectId:'CUDO-RESOURCE-SYNTH-BEV-001',
  field:'unit_cost',
  requestedValue:999,
  requestedBy:fixture.requested_by,
  reason:'No permitido',
  evidenceRefs:['fixture://override/source']
}),/DERIVED fields/);

// 7) Multiple active overrides for same target are fail-closed.
const override2=approveOverride(createOverrideRequest({
  objects:costCommit.objects,
  objectId:'CUDO-OBL-SYNTH-SUP-001',
  field:'supplier_payable',
  requestedValue:41000,
  requestedBy:fixture.requested_by,
  reason:'Segundo override sintético',
  evidenceRefs:['fixture://override/second']
}),{approvedBy:fixture.approved_by});
assert.throws(()=>effectiveValue({
  objects:costCommit.objects,
  overrides:[activeOverride,override2],
  objectId:'CUDO-OBL-SYNTH-SUP-001',
  field:'supplier_payable'
}),/ambiguous active overrides/);

// 8) Determinism of plan identity.
const replayPlan=buildTransactionPlan({
  objects:propagationFixture.objects,
  registry,
  changes:[{object_id:'CUDO-RESOURCE-SYNTH-BEV-001',field:'returned_qty',value:25,source_ref:'fixture://txn/return'}],
  activeConditions:fixture.active_conditions,
  requestedBy:fixture.requested_by,
  reason:fixture.reason,
  evidenceRefs:fixture.evidence_refs,
  now:NOW
});
assert.equal(replayPlan.transaction_id,plan.transaction_id);
assert.equal(transactionFingerprint(replayPlan),transactionFingerprint(plan));

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_TRANSACTION_OVERRIDE_CONTRACT_V1',
  atomic_canonical_commit:true,
  optimistic_concurrency:true,
  propagation_failure_fail_closed:true,
  compensation_plan:true,
  automatic_external_compensation:false,
  human_override_overlay:true,
  canonical_algebra_continues_under_override:true,
  source_override_blocked:true,
  ambiguous_override_blocked:true,
  deterministic_transaction_plan:true,
  production_write:false
},null,2));
