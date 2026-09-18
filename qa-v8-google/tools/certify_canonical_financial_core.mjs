import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFinancialSnapshot,financialCorePolicy} from './canonical_financial_core.mjs';

const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-canonical-financial-fixture-v1.json','utf8'));

function obligation(snapshot,id){
  const item=snapshot.obligation_views.find(x=>x.object_id===id);
  assert.ok(item,`missing obligation view ${id}`);
  return item;
}
function movement(snapshot,id){
  const item=snapshot.movement_views.find(x=>x.object_id===id);
  assert.ok(item,`missing movement view ${id}`);
  return item;
}

// Evidence-backed workbook invariants, preserved as source patterns.
const pedido=fixture.evidence_patterns.PEDIDO_SAN_RAMON_2025;
assert.equal(pedido.purchase_total,pedido.supplier_payable+pedido.remaining_stock_value);
assert.equal(pedido.purchase_total,274260);
assert.equal(pedido.sales_revenue,353000);

const snapshot=buildFinancialSnapshot({
  objects:fixture.objects,
  settlements:fixture.settlements,
  openingPositions:fixture.opening_positions,
  currency:fixture.currency
});
assert.equal(snapshot.ok,true,JSON.stringify(snapshot.errors));

// Supplier payable is settled by two OUT movements.
const supplier=obligation(snapshot,'CUDO-OBL-FIN-SUP-001');
assert.equal(supplier.amount,164570);
assert.equal(supplier.settled_amount,164570);
assert.equal(supplier.outstanding_amount,0);
assert.equal(supplier.derived_lifecycle,'SETTLED');

// Sales receivable is settled by an IN movement.
const sale=obligation(snapshot,'CUDO-OBL-FIN-SALE-001');
assert.equal(sale.settled_amount,353000);
assert.equal(sale.outstanding_amount,0);
assert.equal(sale.derived_lifecycle,'SETTLED');

// Service obligation from real checklist pattern is represented and settled.
const cleaning=obligation(snapshot,'CUDO-OBL-FIN-CLEAN-001');
assert.equal(cleaning.amount,25000);
assert.equal(cleaning.derived_lifecycle,'SETTLED');
assert.deepEqual(cleaning.causal_object_ids,['CUDO-RULE-FIN-001']);

// Operational positions are derived, not manually owned.
assert.deepEqual(snapshot.channel_positions.CASH,{
  opening_position:0,
  confirmed_in:353000,
  confirmed_out:89570,
  operational_position:263430
});
assert.deepEqual(snapshot.channel_positions.BANK_TRANSFER,{
  opening_position:200000,
  confirmed_in:0,
  confirmed_out:100000,
  operational_position:100000
});
assert.equal(snapshot.reconciliation.complete,true);

// Partial settlement is a derived state.
const partialSettlements=fixture.settlements.filter(x=>x.settlement_id!=='CUDO-SET-FIN-003');
const partialObjects=fixture.objects.filter(x=>x.object_id!=='CUDO-MOV-FIN-OUT-002');
const partial=buildFinancialSnapshot({
  objects:partialObjects,
  settlements:partialSettlements,
  openingPositions:fixture.opening_positions
});
assert.equal(partial.ok,true);
const partialSupplier=obligation(partial,'CUDO-OBL-FIN-SUP-001');
assert.equal(partialSupplier.settled_amount,100000);
assert.equal(partialSupplier.outstanding_amount,64570);
assert.equal(partialSupplier.derived_lifecycle,'PARTIALLY_SETTLED');

// Pending movement cannot actively settle.
const pendingObjects=JSON.parse(JSON.stringify(fixture.objects));
pendingObjects.find(x=>x.object_id==='CUDO-MOV-FIN-OUT-001').data.movement_status='PENDING';
const pending=buildFinancialSnapshot({
  objects:pendingObjects,
  settlements:fixture.settlements,
  openingPositions:fixture.opening_positions
});
assert.equal(pending.ok,false);
assert.ok(pending.errors.some(x=>x.kind==='SETTLEMENT'&&/CONFIRMED/.test(x.error)));

// PAYABLE cannot be settled by an IN movement.
const wrongDirection=JSON.parse(JSON.stringify(fixture.settlements));
wrongDirection[1].movement_id='CUDO-MOV-FIN-IN-001';
const direction=buildFinancialSnapshot({
  objects:fixture.objects,
  settlements:wrongDirection,
  openingPositions:fixture.opening_positions
});
assert.equal(direction.ok,false);
assert.ok(direction.errors.some(x=>x.kind==='SETTLEMENT'&&/PAYABLE requires OUT/.test(x.error)));

// Over-allocation fails closed.
const over=JSON.parse(JSON.stringify(fixture.settlements));
over[1].amount=120000;
over[2].amount=64570;
const overSnapshot=buildFinancialSnapshot({
  objects:fixture.objects,
  settlements:over,
  openingPositions:fixture.opening_positions
});
assert.equal(overSnapshot.ok,false);
assert.ok(overSnapshot.errors.some(x=>x.kind==='OBLIGATION_OVERSETTLEMENT'));

// Orphan confirmed money is forbidden.
const orphanObjects=JSON.parse(JSON.stringify(fixture.objects));
orphanObjects.push({
  schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
  object_id:'CUDO-MOV-FIN-ORPHAN-001',
  object_type:'FINANCIAL_MOVEMENT',
  object_version:1,
  lifecycle_state:'CONFIRMED',
  data:{
    movement_direction:'IN',
    amount:10000,
    currency:'CLP',
    channel:'CASH',
    movement_status:'CONFIRMED',
    occurred_at:'2026-09-18T15:00:00.000Z',
    reconciliation_state:'UNRECONCILED'
  },
  field_semantics:{
    movement_direction:{state_kind:'SOURCE',source_refs:['fixture://orphan']},
    amount:{state_kind:'SOURCE',source_refs:['fixture://orphan']},
    currency:{state_kind:'SOURCE',source_refs:['fixture://orphan']},
    channel:{state_kind:'SOURCE',source_refs:['fixture://orphan']},
    movement_status:{state_kind:'SOURCE',source_refs:['fixture://orphan']},
    occurred_at:{state_kind:'SOURCE',source_refs:['fixture://orphan']},
    reconciliation_state:{state_kind:'SOURCE',source_refs:['fixture://orphan']}
  },
  relationships:[],
  provenance:{created_at:'2026-09-18T15:00:00.000Z',updated_at:null,source_system:'CUDO_SYNTHETIC_QA',source_refs:['fixture://orphan/evidence']},
  legacy_refs:[]
});
const orphan=buildFinancialSnapshot({
  objects:orphanObjects,
  settlements:fixture.settlements,
  openingPositions:fixture.opening_positions
});
assert.equal(orphan.ok,false);
assert.ok(orphan.errors.some(x=>x.kind==='ORPHAN_MOVEMENT'));

// Unallocated money is valid when it has an explicit non-financial cause.
const donationObjects=JSON.parse(JSON.stringify(fixture.objects));
donationObjects.push({
  schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
  object_id:'CUDO-MOV-FIN-DONATION-001',
  object_type:'FINANCIAL_MOVEMENT',
  object_version:1,
  lifecycle_state:'CONFIRMED',
  data:{
    movement_direction:'IN',
    amount:10000,
    currency:'CLP',
    channel:'BANK_TRANSFER',
    movement_status:'CONFIRMED',
    occurred_at:'2026-09-18T15:10:00.000Z',
    reconciliation_state:'RECONCILED'
  },
  field_semantics:{
    movement_direction:{state_kind:'SOURCE',source_refs:['fixture://donation']},
    amount:{state_kind:'SOURCE',source_refs:['fixture://donation']},
    currency:{state_kind:'SOURCE',source_refs:['fixture://donation']},
    channel:{state_kind:'SOURCE',source_refs:['fixture://donation']},
    movement_status:{state_kind:'SOURCE',source_refs:['fixture://donation']},
    occurred_at:{state_kind:'SOURCE',source_refs:['fixture://donation']},
    reconciliation_state:{state_kind:'SOURCE',source_refs:['fixture://donation']}
  },
  relationships:[
    {relationship_id:'REL-FIN-DONATION-CAUSE-001',relationship_type:'CAUSED_BY_EVENT',target_object_id:'CUDO-EVENT-FIN-001'}
  ],
  provenance:{created_at:'2026-09-18T15:10:00.000Z',updated_at:null,source_system:'CUDO_SYNTHETIC_QA',source_refs:['fixture://donation/evidence']},
  legacy_refs:[]
});
const donation=buildFinancialSnapshot({
  objects:donationObjects,
  settlements:fixture.settlements,
  openingPositions:fixture.opening_positions
});
assert.equal(donation.ok,true,JSON.stringify(donation.errors));
const donationView=movement(donation,'CUDO-MOV-FIN-DONATION-001');
assert.equal(donationView.unallocated_amount,10000);

// Reconciliation is explicit, not inferred.
const unreconciledObjects=JSON.parse(JSON.stringify(fixture.objects));
unreconciledObjects.find(x=>x.object_id==='CUDO-MOV-FIN-OUT-002').data.reconciliation_state='UNRECONCILED';
const unreconciled=buildFinancialSnapshot({
  objects:unreconciledObjects,
  settlements:fixture.settlements,
  openingPositions:fixture.opening_positions
});
assert.equal(unreconciled.ok,true);
assert.equal(unreconciled.reconciliation.complete,false);

const policy=financialCorePolicy();
assert.match(policy.balance,/derived operational position/);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_CANONICAL_FINANCIAL_CORE_V1',
  obligations:snapshot.obligation_views.length,
  movements:snapshot.movement_views.length,
  active_settlements:snapshot.traceability.active_settlements.length,
  payable_and_receivable:true,
  partial_and_full_settlement:true,
  channel_positions:true,
  reconciliation_explicit:true,
  causal_money_traceability:true,
  orphan_money_blocked:true,
  overallocation_blocked:true,
  source_pattern_pedido_san_ramon:true,
  legacy_treasury_xls_imported:false,
  statutory_accounting_claimed:false,
  production_write:false
},null,2));
