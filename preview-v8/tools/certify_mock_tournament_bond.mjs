import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-19T00:10:00-03:00'});

function apply(action,at='2026-09-19T00:11:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

apply({
  action_id:'BOND-CLUB-CREATE-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-BOND-CLUB-001',
  display_name:'Club Participante Uno',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'PARTICIPATING_CLUB'
});

let out=apply({
  action_id:'BOND-RECEIVE-001',
  type:'TOURNAMENT_BOND_RECEIVE',
  obligation_id:'MOCK-OBL-BOND-001',
  club_actor_id:'MOCK-ACTOR-BOND-CLUB-001',
  channel:'BANK_TRANSFER'
},'2026-09-19T00:12:00-03:00');

let bond=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-001');
let receipt=runtime.state.financial_movements.find(x=>x.movement_id===bond.received_movement_ref);
assert.ok(bond);
assert.equal(bond.direction,'PAYABLE');
assert.equal(bond.kind,'TOURNAMENT_BOND_REFUND');
assert.equal(bond.amount_clp,250000);
assert.equal(bond.outstanding_amount_clp,250000);
assert.equal(bond.bond_state,'ACTIVE');
assert.equal(receipt.direction,'IN');
assert.equal(receipt.amount_clp,250000);
assert.equal(receipt.kind,'TOURNAMENT_BOND_RECEIPT');
assert.equal(receipt.economic_class,'REFUNDABLE_DEPOSIT');
assert.equal(receipt.revenue,false);
assert.equal(receipt.cash_effect,true);
assert.ok(out.effects.some(x=>x.kind==='TOURNAMENT_BOND_REFUND_PAYABLE_CREATED'));

// Idempotent receipt cannot duplicate the cash movement or liability.
const replay=applyMockAdminAction(runtime,{
  action_id:'BOND-RECEIVE-001',
  type:'TOURNAMENT_BOND_RECEIVE',
  obligation_id:'MOCK-OBL-BOND-001',
  club_actor_id:'MOCK-ACTOR-BOND-CLUB-001',
  channel:'BANK_TRANSFER',
  expected_revision:2,
  at:'2026-09-19T00:12:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.financial_obligations.filter(x=>x.obligation_id==='MOCK-OBL-BOND-001').length,1);
assert.equal(replay.runtime.state.financial_movements.filter(x=>x.movement_id===receipt.movement_id).length,1);

// Generic settlement is forbidden because bond closure has its own semantics.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'BOND-GENERIC-SETTLE-BAD-001',
  type:'FINANCIAL_SETTLE',
  obligation_id:bond.obligation_id,
  amount_clp:250000,
  expected_revision:runtime.revision,
  at:'2026-09-19T00:12:30-03:00'
}),/tournament bond refund requires TOURNAMENT_BOND_REFUND action/);

const cashBeforeOffsets=runtime.state.financial_movements.filter(x=>['IN','OUT'].includes(x.direction)).length;

out=apply({
  action_id:'BOND-FINE-001',
  type:'TOURNAMENT_BOND_FINE_OFFSET_APPLY',
  decision_id:'MOCK-DECISION-BOND-FINE-001',
  obligation_id:bond.obligation_id,
  rule_code:'NO_SHOW_SECOND_HALF',
  responsible_actor_id:'MOCK-ACTOR-TESORERIA-01'
},'2026-09-19T00:13:00-03:00');

bond=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-001');
let offset=runtime.state.financial_movements.find(x=>x.kind==='NON_CASH_BOND_OFFSET'&&x.amount_clp===50000);
assert.equal(bond.state,'PARTIALLY_SETTLED');
assert.equal(bond.outstanding_amount_clp,200000);
assert.equal(bond.fine_offset_amount_clp,50000);
assert.equal(offset.direction,'INTERNAL');
assert.equal(offset.channel,'BOND_OFFSET');
assert.equal(offset.cash_effect,false);
assert.equal(runtime.state.financial_movements.filter(x=>['IN','OUT'].includes(x.direction)).length,cashBeforeOffsets);

apply({
  action_id:'BOND-FINE-002',
  type:'TOURNAMENT_BOND_FINE_OFFSET_APPLY',
  decision_id:'MOCK-DECISION-BOND-FINE-002',
  obligation_id:bond.obligation_id,
  rule_code:'MISSING_SERIES',
  responsible_actor_id:'MOCK-ACTOR-TESORERIA-01'
},'2026-09-19T00:14:00-03:00');

bond=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-001');
assert.equal(bond.outstanding_amount_clp,100000);
assert.equal(bond.fine_offset_amount_clp,150000);
assert.equal(runtime.state.financial_obligations.some(x=>x.direction==='RECEIVABLE'&&x.cause_ref?.includes('BOND-FINE')),false);

// Closing participation refunds only the remaining balance in cash.
out=apply({
  action_id:'BOND-REFUND-001',
  type:'TOURNAMENT_BOND_REFUND',
  obligation_id:bond.obligation_id,
  responsible_actor_id:'MOCK-ACTOR-TESORERIA-01',
  channel:'BANK_TRANSFER'
},'2026-09-19T00:15:00-03:00');

bond=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-001');
const refund=runtime.state.financial_movements.find(x=>x.kind==='TOURNAMENT_BOND_REFUND'&&x.amount_clp===100000);
assert.equal(bond.state,'SETTLED');
assert.equal(bond.outstanding_amount_clp,0);
assert.equal(bond.settled_amount_clp,250000);
assert.equal(bond.fine_offset_amount_clp,150000);
assert.equal(bond.cash_refunded_amount_clp,100000);
assert.equal(bond.bond_state,'CLOSED_REFUNDED');
assert.equal(refund.direction,'OUT');
assert.equal(refund.cash_effect,true);
assert.ok(out.effects.some(x=>x.kind==='TOURNAMENT_BOND_CLOSED'&&x.refund_amount_clp===100000));

// Closed bond cannot receive another offset.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'BOND-FINE-AFTER-CLOSE-001',
  type:'TOURNAMENT_BOND_FINE_OFFSET_APPLY',
  decision_id:'MOCK-DECISION-BOND-FINE-CLOSED-001',
  obligation_id:bond.obligation_id,
  rule_code:'NO_SHOW_SECOND_HALF',
  responsible_actor_id:'MOCK-ACTOR-TESORERIA-01',
  expected_revision:runtime.revision,
  at:'2026-09-19T00:15:30-03:00'
}),/tournament bond is not active/);

// Second bond proves fail-closed when a fine is larger than remaining refundable balance.
apply({
  action_id:'BOND-CLUB-CREATE-002',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-BOND-CLUB-002',
  display_name:'Club Participante Dos',
  actor_kind:'EXTERNAL_ORGANIZATION',
  role:'PARTICIPATING_CLUB'
},'2026-09-19T00:16:00-03:00');
apply({
  action_id:'BOND-RECEIVE-002',
  type:'TOURNAMENT_BOND_RECEIVE',
  obligation_id:'MOCK-OBL-BOND-002',
  club_actor_id:'MOCK-ACTOR-BOND-CLUB-002'
},'2026-09-19T00:17:00-03:00');
for(const [i,rule] of [['003','MISSING_SERIES'],['004','MISSING_SERIES'],['005','NO_SHOW_SECOND_HALF']]){
  apply({
    action_id:'BOND-FINE-'+i,
    type:'TOURNAMENT_BOND_FINE_OFFSET_APPLY',
    decision_id:'MOCK-DECISION-BOND-FINE-'+i,
    obligation_id:'MOCK-OBL-BOND-002',
    rule_code:rule,
    responsible_actor_id:'MOCK-ACTOR-TESORERIA-01'
  },'2026-09-19T00:18:00-03:00');
}
const exhausted=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-002');
assert.equal(exhausted.outstanding_amount_clp,0);
assert.equal(exhausted.fine_offset_amount_clp,250000);
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'BOND-FINE-OVER-001',
  type:'TOURNAMENT_BOND_FINE_OFFSET_APPLY',
  decision_id:'MOCK-DECISION-BOND-FINE-OVER-001',
  obligation_id:'MOCK-OBL-BOND-002',
  rule_code:'NO_SHOW_SECOND_HALF',
  responsible_actor_id:'MOCK-ACTOR-TESORERIA-01',
  expected_revision:runtime.revision,
  at:'2026-09-19T00:19:00-03:00'
}),/fine offset exceeds refundable bond balance/);

const movementsBeforeZeroClose=runtime.state.financial_movements.length;
apply({
  action_id:'BOND-REFUND-002',
  type:'TOURNAMENT_BOND_REFUND',
  obligation_id:'MOCK-OBL-BOND-002',
  responsible_actor_id:'MOCK-ACTOR-TESORERIA-01'
},'2026-09-19T00:20:00-03:00');
const exhaustedClosed=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-002');
assert.equal(exhaustedClosed.bond_state,'CLOSED_NO_REFUND_BALANCE');
assert.equal(runtime.state.financial_movements.length,movementsBeforeZeroClose);

const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-19'});
assert.equal(views.finance.tournament_bonds.length,2);
assert.equal(views.finance.summary.refundable_bond_balance,0);
assert.ok(views.evidence.audit.some(x=>x.kind==='TOURNAMENT_BOND_RECEIVED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='TOURNAMENT_BOND_FINE_OFFSET_APPLIED'));
assert.ok(views.evidence.audit.some(x=>x.kind==='TOURNAMENT_BOND_CLOSED'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_TOURNAMENT_BOND_V1',
  fixed_bond_clp:250000,
  receipt_is_cash_in_and_liability_not_revenue:true,
  fine_offset_is_non_cash:true,
  no_second_receivable_for_retained_fine:true,
  remaining_balance_refunded_as_cash_out:true,
  generic_settlement_bypass_blocked:true,
  over_offset_blocked:true,
  zero_balance_close_has_no_cash_movement:true,
  idempotent_receipt:true,
  production_write:false
},null,2));
