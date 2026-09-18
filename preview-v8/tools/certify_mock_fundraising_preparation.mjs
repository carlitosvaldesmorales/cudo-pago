import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-19T01:10:00-03:00'});

function apply(action,at='2026-09-19T01:11:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

apply({
  action_id:'FUND-AUTHORITY-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-FUND-AUTHORITY-001',
  display_name:'Autoridad Externa Fundraising',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'EXTERNAL_AUTHORITY'
});
apply({
  action_id:'FUND-DONOR-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-FUND-DONOR-001',
  display_name:'Donante Fundraising',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'DONOR'
});
apply({
  action_id:'FUND-WRONG-DONOR-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-FUND-WRONG-DONOR-001',
  display_name:'Donante Incorrecto',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'DONOR'
});

const obligationsBefore=runtime.state.financial_obligations.length;
const movementsBefore=runtime.state.financial_movements.length;

let out=apply({
  action_id:'FUND-PREPARE-001',
  type:'FUNDRAISING_EVENT_PREPARE',
  event_id:'MOCK-EVENT-FUNDRAISING-001',
  display_name:'Bingo CUDO de prueba',
  starts_at:'2026-10-12T14:00:00-03:00',
  purpose_text:'Apoyar mantención del estadio y actividades del club',
  permission_responsible_actor_id:'MOCK-ACTOR-SECRETARIA-01',
  permission_target_actor_id:'MOCK-ACTOR-FUND-AUTHORITY-001',
  prize_responsible_actor_id:'MOCK-ACTOR-PRESIDENCIA-01',
  prize_target_actor_id:'MOCK-ACTOR-FUND-DONOR-001',
  resource_ref:'MOCK-RESOURCE-STADIUM-01'
},'2026-09-19T01:12:00-03:00');

let event=runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-FUNDRAISING-001');
let permissionWork=runtime.state.work_items.find(x=>x.work_id===event.fundraising.permission_work_ref);
let prizeWork=runtime.state.work_items.find(x=>x.work_id===event.fundraising.prize_solicitation_work_ref);

assert.equal(event.kind,'FUNDRAISING');
assert.equal(event.state,'SCHEDULED');
assert.equal(event.fundraising.purpose_text,'Apoyar mantención del estadio y actividades del club');
assert.equal(permissionWork.work_kind,'FUNDRAISING_PERMISSION_REQUEST');
assert.equal(permissionWork.state,'OPEN');
assert.equal(permissionWork.responsible_actor_id,'MOCK-ACTOR-SECRETARIA-01');
assert.equal(permissionWork.external_target_actor_id,'MOCK-ACTOR-FUND-AUTHORITY-001');
assert.equal(prizeWork.work_kind,'FUNDRAISING_PRIZE_SOLICITATION');
assert.equal(prizeWork.state,'OPEN');
assert.equal(prizeWork.responsible_actor_id,'MOCK-ACTOR-PRESIDENCIA-01');
assert.equal(prizeWork.external_target_actor_id,'MOCK-ACTOR-FUND-DONOR-001');
assert.equal(runtime.state.financial_obligations.length,obligationsBefore);
assert.equal(runtime.state.financial_movements.length,movementsBefore);
assert.ok(out.effects.some(x=>x.kind==='FUNDRAISING_PERMISSION_WORK_DERIVED'));
assert.ok(out.effects.some(x=>x.kind==='FUNDRAISING_PRIZE_WORK_DERIVED'));

// Planning/requesting does not mean permission or donation were granted.
assert.equal(event.fundraising.donated_prize_resource_refs.length,0);
assert.equal(runtime.state.resources.some(x=>x.kind==='DONATED_PRIZE'),false);

// Donation cannot be confirmed before solicitation work is completed.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'FUND-DONATION-EARLY-001',
  type:'DONATED_PRIZE_CONFIRM',
  resource_id:'MOCK-RESOURCE-DONATED-PRIZE-EARLY-001',
  work_id:prizeWork.work_id,
  display_name:'Premio anticipado',
  donor_actor_id:'MOCK-ACTOR-FUND-DONOR-001',
  evidence_ref:'MOCK-EVIDENCE-FUND-PRIZE-001',
  expected_revision:runtime.revision,
  at:'2026-09-19T01:12:30-03:00'
}),/requires completed solicitation work/);

apply({
  action_id:'FUND-PRIZE-WORK-START-001',
  type:'WORK_TRANSITION',
  work_id:prizeWork.work_id,
  expected_state:'OPEN',
  next_state:'IN_PROGRESS',
  reason:'Solicitud enviada'
},'2026-09-19T01:13:00-03:00');

apply({
  action_id:'FUND-PRIZE-EVIDENCE-001',
  type:'EVIDENCE_ADD',
  evidence_id:'MOCK-EVIDENCE-FUND-PRIZE-001',
  kind:'DONATION_CONFIRMATION',
  display_name:'Confirmación premio fundraising Mock',
  related_refs:[event.event_id,prizeWork.work_id]
},'2026-09-19T01:14:00-03:00');

apply({
  action_id:'FUND-PRIZE-WORK-DONE-001',
  type:'WORK_TRANSITION',
  work_id:prizeWork.work_id,
  expected_state:'IN_PROGRESS',
  next_state:'DONE',
  evidence_ref:'MOCK-EVIDENCE-FUND-PRIZE-001',
  reason:'Solicitud cerrada con evidencia'
},'2026-09-19T01:15:00-03:00');

prizeWork=runtime.state.work_items.find(x=>x.work_id===prizeWork.work_id);
assert.equal(prizeWork.state,'DONE');
assert.ok(prizeWork.evidence_refs.includes('MOCK-EVIDENCE-FUND-PRIZE-001'));

// Wrong donor cannot be substituted even if the prize work is done.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'FUND-DONATION-WRONG-DONOR-001',
  type:'DONATED_PRIZE_CONFIRM',
  resource_id:'MOCK-RESOURCE-DONATED-PRIZE-WRONG-001',
  work_id:prizeWork.work_id,
  display_name:'Premio con donante incorrecto',
  donor_actor_id:'MOCK-ACTOR-FUND-WRONG-DONOR-001',
  evidence_ref:'MOCK-EVIDENCE-FUND-PRIZE-001',
  expected_revision:runtime.revision,
  at:'2026-09-19T01:15:30-03:00'
}),/donor actor must match solicitation external target/);

out=apply({
  action_id:'FUND-DONATION-CONFIRM-001',
  type:'DONATED_PRIZE_CONFIRM',
  resource_id:'MOCK-RESOURCE-DONATED-PRIZE-001',
  work_id:prizeWork.work_id,
  display_name:'Premio principal en especie',
  donor_actor_id:'MOCK-ACTOR-FUND-DONOR-001',
  evidence_ref:'MOCK-EVIDENCE-FUND-PRIZE-001'
},'2026-09-19T01:16:00-03:00');

event=runtime.state.events.find(x=>x.event_id===event.event_id);
const prize=runtime.state.resources.find(x=>x.resource_id==='MOCK-RESOURCE-DONATED-PRIZE-001');
assert.ok(prize);
assert.equal(prize.kind,'DONATED_PRIZE');
assert.equal(prize.state,'AVAILABLE');
assert.equal(prize.donor_actor_id,'MOCK-ACTOR-FUND-DONOR-001');
assert.equal(prize.event_ref,event.event_id);
assert.equal(prize.source_work_ref,prizeWork.work_id);
assert.equal(prize.evidence_ref,'MOCK-EVIDENCE-FUND-PRIZE-001');
assert.equal(prize.valuation_state,'UNVALUED_NOT_FINANCIAL');
assert.equal(prize.financial_effect,false);
assert.deepEqual(event.fundraising.donated_prize_resource_refs,['MOCK-RESOURCE-DONATED-PRIZE-001']);
assert.equal(runtime.state.financial_obligations.length,obligationsBefore);
assert.equal(runtime.state.financial_movements.length,movementsBefore);
assert.ok(out.effects.some(x=>x.kind==='IN_KIND_DONATION_CONFIRMED'&&x.financial_effect===false));

// Idempotent replay does not duplicate donated resource.
const replay=applyMockAdminAction(runtime,{
  action_id:'FUND-DONATION-CONFIRM-001',
  type:'DONATED_PRIZE_CONFIRM',
  resource_id:'MOCK-RESOURCE-DONATED-PRIZE-001',
  work_id:prizeWork.work_id,
  display_name:'Premio principal en especie',
  donor_actor_id:'MOCK-ACTOR-FUND-DONOR-001',
  evidence_ref:'MOCK-EVIDENCE-FUND-PRIZE-001',
  expected_revision:runtime.revision-1,
  at:'2026-09-19T01:16:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.resources.filter(x=>x.resource_id==='MOCK-RESOURCE-DONATED-PRIZE-001').length,1);

// Permission work remains independent: completing prize solicitation never means permission approved.
permissionWork=runtime.state.work_items.find(x=>x.work_id===permissionWork.work_id);
assert.equal(permissionWork.state,'OPEN');

const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-19'});
const projectedPrizeWork=views.operation.items.find(x=>x.work_id===prizeWork.work_id);
assert.equal(projectedPrizeWork.external_target.actor_id,'MOCK-ACTOR-FUND-DONOR-001');
assert.equal(projectedPrizeWork.external_target.display_name,'Donante Fundraising (Mock)');
assert.ok(views.resources.items.some(x=>x.kind==='DONATED_PRIZE'&&x.valuation_state==='UNVALUED_NOT_FINANCIAL'));
assert.ok(views.evidence.audit.some(x=>x.kind==='FUNDRAISING_EVENT_PLANNED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='FUNDRAISING_PERMISSION_WORK_DERIVED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='FUNDRAISING_PRIZE_WORK_DERIVED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='IN_KIND_DONATION_CONFIRMED'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_FUNDRAISING_EVENT_PREPARATION_V1',
  event_derives_permission_and_prize_work:true,
  external_targets_visible:true,
  request_does_not_imply_approval_or_donation:true,
  donation_requires_done_work_and_evidence:true,
  donor_identity_guard:true,
  donated_prize_is_resource:true,
  in_kind_prize_unvalued_not_financial:true,
  no_financial_obligation_or_cash_movement:true,
  idempotent_donation_confirmation:true,
  production_write:false
},null,2));
