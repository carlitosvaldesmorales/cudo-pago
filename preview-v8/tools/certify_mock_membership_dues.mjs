import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T22:00:00-03:00'});

function apply(action,at='2026-09-18T22:01:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

// Minimum published rule: CLP 2000.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'MEMBER-BAD-001',
  type:'MEMBER_ENROLL',
  actor_id:'MOCK-ACTOR-MEMBER-BAD-01',
  display_name:'Socio Bajo Mínimo',
  period:'2026-09',
  amount_clp:1999,
  expected_revision:runtime.revision,
  at:'2026-09-18T22:00:30-03:00'
}),/membership monthly amount must be integer >= 2000 CLP/);

let out=apply({
  action_id:'MEMBER-ENROLL-001',
  type:'MEMBER_ENROLL',
  actor_id:'MOCK-ACTOR-MEMBER-001',
  display_name:'Socio Uno',
  period:'2026-09',
  amount_clp:2000
});

const actor=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-MEMBER-001');
assert.ok(actor);
assert.equal(actor.role,'MEMBER');
assert.equal(actor.membership.status,'ACTIVE');
assert.equal(actor.membership.financial_status,'PENDIENTE');
assert.equal(actor.membership.monthly_due_amount_clp,2000);
assert.equal(actor.membership.external_subscription_connected,false);

const dueId=actor.membership.obligation_refs[0];
const due=runtime.state.financial_obligations.find(x=>x.obligation_id===dueId);
assert.ok(due);
assert.equal(due.kind,'MEMBERSHIP_DUE');
assert.equal(due.direction,'RECEIVABLE');
assert.equal(due.amount_clp,2000);
assert.equal(due.outstanding_amount_clp,2000);
assert.equal(due.state,'OPEN');
assert.equal(due.cause_ref,actor.actor_id);
assert.ok(out.effects.some(x=>x.kind==='MEMBERSHIP_DUE_DERIVED'));

// Idempotent replay does not duplicate member or due.
const replay=applyMockAdminAction(runtime,{
  action_id:'MEMBER-ENROLL-001',
  type:'MEMBER_ENROLL',
  actor_id:'MOCK-ACTOR-MEMBER-001',
  display_name:'Socio Uno',
  period:'2026-09',
  amount_clp:2000,
  expected_revision:1,
  at:'2026-09-18T22:01:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.actors.filter(x=>x.actor_id==='MOCK-ACTOR-MEMBER-001').length,1);
assert.equal(replay.runtime.state.financial_obligations.filter(x=>x.obligation_id===dueId).length,1);

// Partial payment keeps member PENDIENTE.
out=apply({
  action_id:'MEMBER-PAY-001',
  type:'FINANCIAL_SETTLE',
  obligation_id:dueId,
  amount_clp:500,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-MEMBER-PAY-001'
},'2026-09-18T22:02:00-03:00');
let member=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-MEMBER-001');
let obligation=runtime.state.financial_obligations.find(x=>x.obligation_id===dueId);
assert.equal(obligation.state,'PARTIALLY_SETTLED');
assert.equal(obligation.outstanding_amount_clp,1500);
assert.equal(member.membership.financial_status,'PENDIENTE');
assert.equal(member.membership.outstanding_amount_clp,1500);
assert.ok(out.effects.some(x=>x.kind==='MEMBER_FINANCIAL_STATUS_RECALCULATED'&&x.to==='PENDIENTE'));

// Full settlement updates member automatically to AL_DIA.
out=apply({
  action_id:'MEMBER-PAY-002',
  type:'FINANCIAL_SETTLE',
  obligation_id:dueId,
  amount_clp:1500,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-MEMBER-PAY-002'
},'2026-09-18T22:03:00-03:00');
member=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-MEMBER-001');
obligation=runtime.state.financial_obligations.find(x=>x.obligation_id===dueId);
assert.equal(obligation.state,'SETTLED');
assert.equal(obligation.outstanding_amount_clp,0);
assert.equal(member.membership.financial_status,'AL_DIA');
assert.equal(member.membership.outstanding_amount_clp,0);
assert.ok(out.effects.some(x=>x.kind==='MEMBER_FINANCIAL_STATUS_RECALCULATED'&&x.to==='AL_DIA'));

// Payment movement is incoming because membership due is receivable.
const movements=runtime.state.financial_movements.filter(x=>x.settlement_refs?.length&&x.amount_clp>0);
assert.ok(movements.some(x=>x.direction==='IN'&&x.amount_clp===500));
assert.ok(movements.some(x=>x.direction==='IN'&&x.amount_clp===1500));

// Read models expose same member and financial state.
const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-18'});
assert.equal(views.club.summary.members,1);
const readMember=views.club.members.find(x=>x.actor_id==='MOCK-ACTOR-MEMBER-001');
assert.equal(readMember.membership.financial_status,'AL_DIA');
assert.equal(readMember.membership.outstanding_amount_clp,0);
assert.equal(views.finance.obligations.find(x=>x.obligation_id===dueId).state,'SETTLED');

// No external subscription is invented.
assert.equal(JSON.stringify(runtime).includes('"external_subscription_connected":true'),false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_MEMBERSHIP_DUES_V1',
  published_minimum_due_clp:2000,
  enrollment_to_due:true,
  partial_payment_to_pending:true,
  full_payment_to_al_dia:true,
  receivable_settlement_creates_incoming_movement:true,
  no_double_entry:true,
  idempotent_enrollment:true,
  external_provider_not_faked:true,
  production_write:false
},null,2));
