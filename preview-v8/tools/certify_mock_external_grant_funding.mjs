import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-19T01:40:00-03:00'});

function apply(action,at='2026-09-19T01:41:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

apply({
  action_id:'GRANT-AUTHORITY-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001',
  display_name:'Municipalidad Grant',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'FUNDING_AUTHORITY'
});
apply({
  action_id:'GRANT-WRONG-AUTHORITY-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-WRONG-001',
  display_name:'Autoridad Incorrecta Grant',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'FUNDING_AUTHORITY'
});

const obligationsBefore=runtime.state.financial_obligations.length;
const movementsBefore=runtime.state.financial_movements.length;

let out=apply({
  action_id:'GRANT-PREPARE-001',
  type:'EXTERNAL_FUNDING_REQUEST_PREPARE',
  decision_id:'MOCK-DECISION-GRANT-001',
  display_name:'Subvención municipal 1.400.000',
  requested_amount_clp:1400000,
  purpose_text:'Indumentaria, mejoras de camarines, balones y material de demarcación',
  responsible_actor_id:'MOCK-ACTOR-PRESIDENCIA-01',
  external_target_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001'
},'2026-09-19T01:42:00-03:00');

let decision=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-GRANT-001');
let work=runtime.state.work_items.find(x=>x.work_id===decision.application_work_ref);

assert.equal(decision.kind,'EXTERNAL_FUNDING_REQUEST');
assert.equal(decision.state,'PENDING_EXTERNAL');
assert.equal(decision.requested_amount_clp,1400000);
assert.equal(decision.approved_amount_clp,null);
assert.equal(decision.external_target_actor_id,'MOCK-ACTOR-GRANT-AUTHORITY-001');
assert.equal(work.work_kind,'EXTERNAL_FUNDING_APPLICATION');
assert.equal(work.state,'OPEN');
assert.equal(work.external_target_actor_id,'MOCK-ACTOR-GRANT-AUTHORITY-001');
assert.equal(runtime.state.financial_obligations.length,obligationsBefore);
assert.equal(runtime.state.financial_movements.length,movementsBefore);
assert.ok(out.effects.some(x=>x.kind==='EXTERNAL_FUNDING_APPLICATION_WORK_CREATED'));

// Generic decision action cannot bypass the external-decision contract.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'GRANT-GENERIC-BYPASS-001',
  type:'DECISION_TRANSITION',
  decision_id:decision.decision_id,
  expected_state:'PENDING_EXTERNAL',
  next_state:'APPLIED',
  expected_revision:runtime.revision,
  at:'2026-09-19T01:42:30-03:00'
}),/requires EXTERNAL_FUNDING_DECISION_RECORD/);

// External decision before application work is complete is rejected.
apply({
  action_id:'GRANT-RESPONSE-EVID-EARLY-001',
  type:'EVIDENCE_ADD',
  evidence_id:'MOCK-EVIDENCE-GRANT-RESPONSE-EARLY-001',
  kind:'EXTERNAL_FUNDING_RESPONSE',
  display_name:'Respuesta externa anticipada Mock',
  related_refs:[decision.decision_id,work.work_id]
},'2026-09-19T01:43:00-03:00');
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'GRANT-DECISION-EARLY-001',
  type:'EXTERNAL_FUNDING_DECISION_RECORD',
  decision_id:decision.decision_id,
  result:'APPROVED',
  approved_amount_clp:1400000,
  authority_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001',
  evidence_ref:'MOCK-EVIDENCE-GRANT-RESPONSE-EARLY-001',
  expected_revision:runtime.revision,
  at:'2026-09-19T01:43:30-03:00'
}),/requires completed application work/);

// Complete application work with evidence.
apply({
  action_id:'GRANT-WORK-START-001',
  type:'WORK_TRANSITION',
  work_id:work.work_id,
  expected_state:'OPEN',
  next_state:'IN_PROGRESS',
  reason:'Preparación de postulación'
},'2026-09-19T01:44:00-03:00');
apply({
  action_id:'GRANT-APPLICATION-EVIDENCE-001',
  type:'EVIDENCE_ADD',
  evidence_id:'MOCK-EVIDENCE-GRANT-APPLICATION-001',
  kind:'FUNDING_APPLICATION',
  display_name:'Postulación y antecedentes Grant Mock',
  related_refs:[decision.decision_id,work.work_id]
},'2026-09-19T01:45:00-03:00');
apply({
  action_id:'GRANT-WORK-DONE-001',
  type:'WORK_TRANSITION',
  work_id:work.work_id,
  expected_state:'IN_PROGRESS',
  next_state:'DONE',
  evidence_ref:'MOCK-EVIDENCE-GRANT-APPLICATION-001',
  reason:'Postulación presentada con evidencia'
},'2026-09-19T01:46:00-03:00');

decision=runtime.state.decisions.find(x=>x.decision_id===decision.decision_id);
work=runtime.state.work_items.find(x=>x.work_id===work.work_id);
assert.equal(work.state,'DONE');

// Add response evidence linked to request/application.
apply({
  action_id:'GRANT-RESPONSE-EVIDENCE-001',
  type:'EVIDENCE_ADD',
  evidence_id:'MOCK-EVIDENCE-GRANT-RESPONSE-001',
  kind:'EXTERNAL_FUNDING_RESPONSE',
  display_name:'Respuesta municipal Grant Mock',
  related_refs:[decision.decision_id,work.work_id]
},'2026-09-19T01:47:00-03:00');

// Wrong authority cannot approve.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'GRANT-WRONG-AUTHORITY-DECISION-001',
  type:'EXTERNAL_FUNDING_DECISION_RECORD',
  decision_id:decision.decision_id,
  result:'APPROVED',
  approved_amount_clp:1400000,
  authority_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-WRONG-001',
  evidence_ref:'MOCK-EVIDENCE-GRANT-RESPONSE-001',
  expected_revision:runtime.revision,
  at:'2026-09-19T01:47:30-03:00'
}),/authority must match request external target/);

// Amount guards.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'GRANT-OVER-APPROVAL-001',
  type:'EXTERNAL_FUNDING_DECISION_RECORD',
  decision_id:decision.decision_id,
  result:'PARTIAL',
  approved_amount_clp:1500000,
  authority_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001',
  evidence_ref:'MOCK-EVIDENCE-GRANT-RESPONSE-001',
  expected_revision:runtime.revision,
  at:'2026-09-19T01:48:00-03:00'
}),/partial funding approval must be positive and below requested amount/);

out=apply({
  action_id:'GRANT-APPROVE-001',
  type:'EXTERNAL_FUNDING_DECISION_RECORD',
  decision_id:decision.decision_id,
  result:'APPROVED',
  approved_amount_clp:1400000,
  authority_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001',
  evidence_ref:'MOCK-EVIDENCE-GRANT-RESPONSE-001'
},'2026-09-19T01:49:00-03:00');

decision=runtime.state.decisions.find(x=>x.decision_id===decision.decision_id);
work=runtime.state.work_items.find(x=>x.work_id===work.work_id);
let obligation=runtime.state.financial_obligations.find(x=>x.cause_ref===decision.decision_id);

assert.equal(decision.state,'APPLIED');
assert.equal(decision.external_result,'APPROVED');
assert.equal(decision.approved_amount_clp,1400000);
assert.equal(decision.response_evidence_ref,'MOCK-EVIDENCE-GRANT-RESPONSE-001');
assert.ok(obligation);
assert.equal(obligation.direction,'RECEIVABLE');
assert.equal(obligation.kind,'EXTERNAL_GRANT');
assert.equal(obligation.amount_clp,1400000);
assert.equal(obligation.outstanding_amount_clp,1400000);
assert.equal(obligation.counterparty_ref,'MOCK-ACTOR-GRANT-AUTHORITY-001');
assert.ok(work.financial_obligation_refs.includes(obligation.obligation_id));
assert.equal(runtime.state.financial_movements.length,movementsBefore);
assert.ok(out.effects.some(x=>x.kind==='EXTERNAL_GRANT_RECEIVABLE_DERIVED'));

// Cash only appears when the existing financial settlement is executed.
apply({
  action_id:'GRANT-COLLECT-PARTIAL-001',
  type:'FINANCIAL_SETTLE',
  obligation_id:obligation.obligation_id,
  amount_clp:400000,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-GRANT-PAYMENT-001'
},'2026-09-19T01:50:00-03:00');
obligation=runtime.state.financial_obligations.find(x=>x.obligation_id===obligation.obligation_id);
assert.equal(obligation.state,'PARTIALLY_SETTLED');
assert.equal(obligation.outstanding_amount_clp,1000000);
const grantMovement=runtime.state.financial_movements.find(x=>(x.settlement_refs||[]).length&&x.amount_clp===400000);
assert.ok(grantMovement);
assert.equal(grantMovement.direction,'IN');

// A rejected request creates no receivable.
apply({
  action_id:'GRANT-PREPARE-REJECT-001',
  type:'EXTERNAL_FUNDING_REQUEST_PREPARE',
  decision_id:'MOCK-DECISION-GRANT-REJECT-001',
  display_name:'Subvención rechazada de prueba',
  requested_amount_clp:300000,
  purpose_text:'Mejora operativa Mock',
  responsible_actor_id:'MOCK-ACTOR-PRESIDENCIA-01',
  external_target_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001'
},'2026-09-19T01:51:00-03:00');
let rejected=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-GRANT-REJECT-001');
let rejectedWork=runtime.state.work_items.find(x=>x.work_id===rejected.application_work_ref);
apply({action_id:'GRANT-REJECT-WORK-START',type:'WORK_TRANSITION',work_id:rejectedWork.work_id,expected_state:'OPEN',next_state:'IN_PROGRESS',reason:'Preparación'},'2026-09-19T01:52:00-03:00');
apply({action_id:'GRANT-REJECT-APP-EVID',type:'EVIDENCE_ADD',evidence_id:'MOCK-EVIDENCE-GRANT-REJECT-APP',kind:'FUNDING_APPLICATION',display_name:'Postulación rechazada Mock',related_refs:[rejected.decision_id,rejectedWork.work_id]},'2026-09-19T01:53:00-03:00');
apply({action_id:'GRANT-REJECT-WORK-DONE',type:'WORK_TRANSITION',work_id:rejectedWork.work_id,expected_state:'IN_PROGRESS',next_state:'DONE',evidence_ref:'MOCK-EVIDENCE-GRANT-REJECT-APP',reason:'Presentada'},'2026-09-19T01:54:00-03:00');
apply({action_id:'GRANT-REJECT-RESP-EVID',type:'EVIDENCE_ADD',evidence_id:'MOCK-EVIDENCE-GRANT-REJECT-RESP',kind:'EXTERNAL_FUNDING_RESPONSE',display_name:'Rechazo externo Mock',related_refs:[rejected.decision_id,rejectedWork.work_id]},'2026-09-19T01:55:00-03:00');
apply({action_id:'GRANT-REJECT-DECISION',type:'EXTERNAL_FUNDING_DECISION_RECORD',decision_id:rejected.decision_id,result:'REJECTED',approved_amount_clp:0,authority_actor_id:'MOCK-ACTOR-GRANT-AUTHORITY-001',evidence_ref:'MOCK-EVIDENCE-GRANT-REJECT-RESP'},'2026-09-19T01:56:00-03:00');

rejected=runtime.state.decisions.find(x=>x.decision_id===rejected.decision_id);
assert.equal(rejected.state,'APPLIED');
assert.equal(rejected.external_result,'REJECTED');
assert.equal(rejected.approved_amount_clp,0);
assert.equal(runtime.state.financial_obligations.some(x=>x.cause_ref===rejected.decision_id),false);

// Read models expose authority/work/finance consistently.
const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-19'});
const grantView=views.governance.external_funding_requests.find(x=>x.decision_id==='MOCK-DECISION-GRANT-001');
const grantWork=views.operation.items.find(x=>x.work_id===grantView.application_work_ref);
const grantReceivable=views.finance.obligations.find(x=>x.cause_ref===grantView.decision_id);
assert.equal(grantWork.external_target.actor_id,'MOCK-ACTOR-GRANT-AUTHORITY-001');
assert.equal(grantReceivable.outstanding_amount_clp,1000000);
assert.ok(views.evidence.audit.some(x=>x.kind==='EXTERNAL_FUNDING_REQUEST_PREPARED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='EXTERNAL_FUNDING_DECISION_RECORDED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='EXTERNAL_GRANT_RECEIVABLE_DERIVED'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_EXTERNAL_GRANT_FUNDING_V1',
  request_creates_work_not_receivable:true,
  external_target_visible:true,
  application_done_requires_evidence:true,
  decision_requires_response_evidence:true,
  authority_identity_guard:true,
  approved_amount_guard:true,
  approval_to_receivable:true,
  rejection_creates_no_receivable:true,
  approval_does_not_create_cash:true,
  cash_only_via_financial_settlement:true,
  production_write:false
},null,2));
