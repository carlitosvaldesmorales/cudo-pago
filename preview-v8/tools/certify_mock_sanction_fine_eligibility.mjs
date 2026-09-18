import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T23:00:00-03:00'});

function apply(action,at='2026-09-18T23:01:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

apply({
  action_id:'PLAYER-CREATE-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-PLAYER-001',
  display_name:'Jugador Uno',
  actor_kind:'PERSON',
  role:'PLAYER'
});

let out=apply({
  action_id:'SANCTION-DOUBLE-001',
  type:'SANCTION_APPLY',
  sanction_id:'MOCK-DECISION-SANCTION-DOUBLE-001',
  actor_id:'MOCK-ACTOR-PLAYER-001',
  sanction_kind:'DOUBLE_YELLOW'
},'2026-09-18T23:02:00-03:00');

let actor=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-PLAYER-001');
let sanction=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-SANCTION-DOUBLE-001');
let fine=runtime.state.financial_obligations.find(x=>x.cause_ref===sanction.decision_id);

assert.ok(sanction);
assert.equal(sanction.kind,'TOURNAMENT_SANCTION');
assert.equal(sanction.state,'APPLIED');
assert.equal(sanction.sanction_kind,'DOUBLE_YELLOW');
assert.equal(fine.kind,'SANCTION_FINE');
assert.equal(fine.direction,'RECEIVABLE');
assert.equal(fine.amount_clp,10000);
assert.equal(fine.outstanding_amount_clp,10000);
assert.equal(fine.state,'OPEN');
assert.equal(actor.sports_eligibility.status,'SUSPENDED_PENDING_FINE');
assert.equal(actor.sports_eligibility.outstanding_amount_clp,10000);
assert.ok(out.effects.some(x=>x.kind==='SANCTION_INCIDENT_RECORDED'));
assert.ok(out.effects.some(x=>x.kind==='SANCTION_FINE_DERIVED'));
assert.ok(out.effects.some(x=>x.kind==='PLAYER_ELIGIBILITY_RECALCULATED'&&x.to==='SUSPENDED_PENDING_FINE'));

// Idempotent replay must not duplicate sanction or fine.
const replay=applyMockAdminAction(runtime,{
  action_id:'SANCTION-DOUBLE-001',
  type:'SANCTION_APPLY',
  sanction_id:'MOCK-DECISION-SANCTION-DOUBLE-001',
  actor_id:'MOCK-ACTOR-PLAYER-001',
  sanction_kind:'DOUBLE_YELLOW',
  expected_revision:2,
  at:'2026-09-18T23:02:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.decisions.filter(x=>x.decision_id==='MOCK-DECISION-SANCTION-DOUBLE-001').length,1);
assert.equal(replay.runtime.state.financial_obligations.filter(x=>x.cause_ref==='MOCK-DECISION-SANCTION-DOUBLE-001').length,1);

// Partial settlement keeps the player suspended.
out=apply({
  action_id:'SANCTION-PAY-001',
  type:'FINANCIAL_SETTLE',
  obligation_id:fine.obligation_id,
  amount_clp:4000,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-SANCTION-PAY-001'
},'2026-09-18T23:03:00-03:00');
actor=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-PLAYER-001');
fine=runtime.state.financial_obligations.find(x=>x.obligation_id===fine.obligation_id);
assert.equal(fine.state,'PARTIALLY_SETTLED');
assert.equal(fine.outstanding_amount_clp,6000);
assert.equal(actor.sports_eligibility.status,'SUSPENDED_PENDING_FINE');
assert.equal(actor.sports_eligibility.outstanding_amount_clp,6000);

// Full settlement recalculates eligibility automatically.
out=apply({
  action_id:'SANCTION-PAY-002',
  type:'FINANCIAL_SETTLE',
  obligation_id:fine.obligation_id,
  amount_clp:6000,
  channel:'BANK_TRANSFER',
  evidence_ref:'MOCK-EVIDENCE-SANCTION-PAY-002'
},'2026-09-18T23:04:00-03:00');
actor=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-PLAYER-001');
fine=runtime.state.financial_obligations.find(x=>x.obligation_id===fine.obligation_id);
assert.equal(fine.state,'SETTLED');
assert.equal(fine.outstanding_amount_clp,0);
assert.equal(actor.sports_eligibility.status,'ELIGIBLE_NEXT_DATE');
assert.equal(actor.sports_eligibility.outstanding_amount_clp,0);
assert.ok(out.effects.some(x=>x.kind==='PLAYER_ELIGIBILITY_RECALCULATED'&&x.to==='ELIGIBLE_NEXT_DATE'));

// Direct red uses the fixed CLP 15,000 rule and suspends again.
out=apply({
  action_id:'SANCTION-RED-001',
  type:'SANCTION_APPLY',
  sanction_id:'MOCK-DECISION-SANCTION-RED-001',
  actor_id:'MOCK-ACTOR-PLAYER-001',
  sanction_kind:'DIRECT_RED'
},'2026-09-18T23:05:00-03:00');
const directRedFine=runtime.state.financial_obligations.find(x=>x.cause_ref==='MOCK-DECISION-SANCTION-RED-001');
actor=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-PLAYER-001');
assert.equal(directRedFine.amount_clp,15000);
assert.equal(actor.sports_eligibility.status,'SUSPENDED_PENDING_FINE');
assert.equal(actor.sports_eligibility.outstanding_amount_clp,15000);

// Serious aggression is fail-closed: no custom payable escape is accepted.
apply({
  action_id:'PLAYER-CREATE-002',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-PLAYER-002',
  display_name:'Jugador Dos',
  actor_kind:'PERSON',
  role:'PLAYER'
},'2026-09-18T23:06:00-03:00');

assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'SANCTION-AGGRESSION-BAD-001',
  type:'SANCTION_APPLY',
  sanction_id:'MOCK-DECISION-SANCTION-AGGRESSION-BAD-001',
  actor_id:'MOCK-ACTOR-PLAYER-002',
  sanction_kind:'SERIOUS_FOUL_OR_AGGRESSION',
  fine_amount_clp:1000,
  expected_revision:runtime.revision,
  at:'2026-09-18T23:06:30-03:00'
}),/serious aggression is non-payable in bounded ruleset/);

apply({
  action_id:'SANCTION-AGGRESSION-001',
  type:'SANCTION_APPLY',
  sanction_id:'MOCK-DECISION-SANCTION-AGGRESSION-001',
  actor_id:'MOCK-ACTOR-PLAYER-002',
  sanction_kind:'SERIOUS_FOUL_OR_AGGRESSION'
},'2026-09-18T23:07:00-03:00');

const expelled=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-PLAYER-002');
assert.equal(expelled.sports_eligibility.status,'EXPELLED_TOURNAMENT');
assert.equal(runtime.state.financial_obligations.some(x=>x.cause_ref==='MOCK-DECISION-SANCTION-AGGRESSION-001'),false);

assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'SANCTION-UNKNOWN-001',
  type:'SANCTION_APPLY',
  sanction_id:'MOCK-DECISION-SANCTION-UNKNOWN-001',
  actor_id:'MOCK-ACTOR-PLAYER-002',
  sanction_kind:'UNKNOWN',
  expected_revision:runtime.revision,
  at:'2026-09-18T23:08:00-03:00'
}),/unsupported bounded tournament sanction/);

const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-18'});
assert.equal(views.club.sanctioned_actors.length,2);
assert.ok(views.club.sanctioned_actors.some(x=>x.actor_id==='MOCK-ACTOR-PLAYER-001'&&x.sports_eligibility.status==='SUSPENDED_PENDING_FINE'));
assert.ok(views.club.sanctioned_actors.some(x=>x.actor_id==='MOCK-ACTOR-PLAYER-002'&&x.sports_eligibility.status==='EXPELLED_TOURNAMENT'));
assert.ok(views.finance.obligations.some(x=>x.kind==='SANCTION_FINE'&&x.amount_clp===10000&&x.state==='SETTLED'));
assert.ok(views.finance.obligations.some(x=>x.kind==='SANCTION_FINE'&&x.amount_clp===15000&&x.state==='OPEN'));
assert.ok(views.evidence.audit.some(x=>x.kind==='SANCTION_INCIDENT_RECORDED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='TOURNAMENT_RULE_APPLIED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='PLAYER_ELIGIBILITY_RECALCULATED'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_SANCTION_FINE_ELIGIBILITY_V1',
  double_yellow_fine_clp:10000,
  direct_red_fine_clp:15000,
  partial_settlement_keeps_suspended:true,
  full_settlement_restores_next_date_eligibility:true,
  serious_aggression_non_payable_expulsion:true,
  idempotent_sanction_action:true,
  audit_persisted:true,
  bounded_tournament_scope:true,
  production_write:false
},null,2));
