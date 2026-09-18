import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T23:30:00-03:00'});

function apply(action,at='2026-09-18T23:31:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

apply({
  action_id:'DAMAGE-LIABLE-ACTOR-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-CLUB-RIVAL-001',
  display_name:'Club Rival',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'PARTICIPATING_CLUB'
});

let out=apply({
  action_id:'DAMAGE-REPORT-001',
  type:'FACILITY_DAMAGE_REPORT',
  case_id:'MOCK-DECISION-DAMAGE-001',
  resource_id:'MOCK-RESOURCE-STADIUM-01',
  liable_actor_id:'MOCK-ACTOR-CLUB-RIVAL-001',
  responsible_actor_id:'MOCK-ACTOR-ESTADIO-01'
},'2026-09-18T23:32:00-03:00');

let decision=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-DAMAGE-001');
let resource=runtime.state.resources.find(x=>x.resource_id==='MOCK-RESOURCE-STADIUM-01');
let work=runtime.state.work_items.find(x=>x.work_id===decision.assessment_work_ref);

assert.ok(decision);
assert.equal(decision.kind,'FACILITY_DAMAGE_COMPENSATION');
assert.equal(decision.state,'PENDING_HUMAN');
assert.equal(decision.agreed_amount_clp,null);
assert.equal(resource.state,'DAMAGED');
assert.equal(resource.attention,'ACTION_REQUIRED');
assert.equal(work.work_kind,'FACILITY_DAMAGE_ASSESSMENT');
assert.equal(work.state,'OPEN');
assert.equal(work.responsible_actor_id,'MOCK-ACTOR-ESTADIO-01');
assert.equal(runtime.state.financial_obligations.some(x=>x.cause_ref===decision.decision_id),false);
assert.ok(out.effects.some(x=>x.kind==='FACILITY_DAMAGE_REPORTED'));
assert.ok(out.effects.some(x=>x.kind==='DAMAGE_ASSESSMENT_WORK_CREATED'));

// Idempotent report does not duplicate case or work.
const replay=applyMockAdminAction(runtime,{
  action_id:'DAMAGE-REPORT-001',
  type:'FACILITY_DAMAGE_REPORT',
  case_id:'MOCK-DECISION-DAMAGE-001',
  resource_id:'MOCK-RESOURCE-STADIUM-01',
  liable_actor_id:'MOCK-ACTOR-CLUB-RIVAL-001',
  responsible_actor_id:'MOCK-ACTOR-ESTADIO-01',
  expected_revision:2,
  at:'2026-09-18T23:32:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.decisions.filter(x=>x.decision_id==='MOCK-DECISION-DAMAGE-001').length,1);
assert.equal(replay.runtime.state.work_items.filter(x=>x.work_id===work.work_id).length,1);

// Fail closed: no amount can be applied before the assessment work is done.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'DAMAGE-AMOUNT-EARLY-001',
  type:'DAMAGE_AMOUNT_AGREE',
  decision_id:decision.decision_id,
  amount_clp:125000,
  evidence_ref:'MOCK-EVIDENCE-NOT-READY',
  expected_revision:runtime.revision,
  at:'2026-09-18T23:32:30-03:00'
}),/damage assessment work must be DONE before amount agreement/);

// Complete the human assessment with evidence.
apply({
  action_id:'DAMAGE-WORK-START-001',
  type:'WORK_TRANSITION',
  work_id:work.work_id,
  expected_state:'OPEN',
  next_state:'IN_PROGRESS',
  reason:'Evaluación iniciada'
},'2026-09-18T23:33:00-03:00');

apply({
  action_id:'DAMAGE-EVIDENCE-001',
  type:'EVIDENCE_ADD',
  evidence_id:'MOCK-EVIDENCE-DAMAGE-001',
  kind:'DAMAGE_ASSESSMENT',
  display_name:'Evaluación daño estadio Mock',
  related_refs:[work.work_id,decision.decision_id]
},'2026-09-18T23:34:00-03:00');

apply({
  action_id:'DAMAGE-WORK-DONE-001',
  type:'WORK_TRANSITION',
  work_id:work.work_id,
  expected_state:'IN_PROGRESS',
  next_state:'DONE',
  evidence_ref:'MOCK-EVIDENCE-DAMAGE-001',
  reason:'Evaluación con evidencia'
},'2026-09-18T23:35:00-03:00');

decision=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-DAMAGE-001');
work=runtime.state.work_items.find(x=>x.work_id===decision.assessment_work_ref);
assert.equal(work.state,'DONE');
assert.ok(work.evidence_refs.includes('MOCK-EVIDENCE-DAMAGE-001'));
assert.equal(runtime.state.financial_obligations.some(x=>x.cause_ref===decision.decision_id),false);

// Generic decision transition cannot bypass the specialized evidence-backed agreement.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'DAMAGE-GENERIC-DECISION-001',
  type:'DECISION_TRANSITION',
  decision_id:decision.decision_id,
  expected_state:'PENDING_HUMAN',
  next_state:'APPROVED',
  expected_revision:runtime.revision,
  at:'2026-09-18T23:35:30-03:00'
}),/facility damage decision requires DAMAGE_AMOUNT_AGREE/);

out=apply({
  action_id:'DAMAGE-AMOUNT-001',
  type:'DAMAGE_AMOUNT_AGREE',
  decision_id:decision.decision_id,
  amount_clp:125000,
  evidence_ref:'MOCK-EVIDENCE-DAMAGE-001'
},'2026-09-18T23:36:00-03:00');

decision=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-DAMAGE-001');
work=runtime.state.work_items.find(x=>x.work_id===decision.assessment_work_ref);
let obligation=runtime.state.financial_obligations.find(x=>x.cause_ref===decision.decision_id);
assert.equal(decision.state,'APPLIED');
assert.equal(decision.agreed_amount_clp,125000);
assert.equal(decision.evidence_ref,'MOCK-EVIDENCE-DAMAGE-001');
assert.ok(obligation);
assert.equal(obligation.kind,'FACILITY_DAMAGE_COMPENSATION');
assert.equal(obligation.direction,'RECEIVABLE');
assert.equal(obligation.amount_clp,125000);
assert.equal(obligation.outstanding_amount_clp,125000);
assert.equal(obligation.counterparty_ref,'MOCK-ACTOR-CLUB-RIVAL-001');
assert.equal(obligation.resource_ref,'MOCK-RESOURCE-STADIUM-01');
assert.ok(work.financial_obligation_refs.includes(obligation.obligation_id));
assert.ok(out.effects.some(x=>x.kind==='DAMAGE_COMPENSATION_RECEIVABLE_DERIVED'));

// Partial settlement updates finance only; it does not invent repair.
apply({
  action_id:'DAMAGE-PAY-001',
  type:'FINANCIAL_SETTLE',
  obligation_id:obligation.obligation_id,
  amount_clp:25000,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-DAMAGE-PAY-001'
},'2026-09-18T23:37:00-03:00');
obligation=runtime.state.financial_obligations.find(x=>x.obligation_id===obligation.obligation_id);
resource=runtime.state.resources.find(x=>x.resource_id==='MOCK-RESOURCE-STADIUM-01');
assert.equal(obligation.state,'PARTIALLY_SETTLED');
assert.equal(obligation.outstanding_amount_clp,100000);
assert.equal(resource.state,'DAMAGED');

apply({
  action_id:'DAMAGE-PAY-002',
  type:'FINANCIAL_SETTLE',
  obligation_id:obligation.obligation_id,
  amount_clp:100000,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-DAMAGE-PAY-002'
},'2026-09-18T23:38:00-03:00');
obligation=runtime.state.financial_obligations.find(x=>x.obligation_id===obligation.obligation_id);
resource=runtime.state.resources.find(x=>x.resource_id==='MOCK-RESOURCE-STADIUM-01');
assert.equal(obligation.state,'SETTLED');
assert.equal(obligation.outstanding_amount_clp,0);
assert.equal(resource.state,'DAMAGED');
assert.equal(resource.attention,'ACTION_REQUIRED');

// Read models expose one causal chain across governance, work, finance and resource.
const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-18'});
const damageCase=views.governance.damage_cases.find(x=>x.decision_id==='MOCK-DECISION-DAMAGE-001');
const damageWork=views.operation.items.find(x=>x.work_id===damageCase.assessment_work_ref);
const damageObligation=views.finance.obligations.find(x=>x.cause_ref===damageCase.decision_id);
const damagedResource=views.resources.items.find(x=>x.resource_id===damageCase.resource_ref);
assert.equal(damageCase.state,'APPLIED');
assert.equal(damageWork.state,'DONE');
assert.equal(damageWork.financial_effect.obligation_id,damageObligation.obligation_id);
assert.equal(damageObligation.state,'SETTLED');
assert.equal(damagedResource.state,'DAMAGED');
assert.ok(views.evidence.audit.some(x=>x.kind==='FACILITY_DAMAGE_REPORTED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='DAMAGE_AMOUNT_AGREED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='DAMAGE_COMPENSATION_RECEIVABLE_DERIVED'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_FACILITY_DAMAGE_COMPENSATION_V1',
  report_creates_no_debt:true,
  assessment_work_required:true,
  amount_requires_completed_work_and_evidence:true,
  agreed_amount_to_receivable:true,
  partial_and_full_settlement:true,
  payment_does_not_fake_repair:true,
  generic_decision_bypass_blocked:true,
  idempotent_damage_report:true,
  production_write:false
},null,2));
