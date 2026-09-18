import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSourceChangeCommand,buildProjectionBundle,planProjectionPersistence,applyProjectionPersistence} from './projection_persistence_adapters.mjs';
import {buildTransactionPlan,commitTransaction} from './transaction_override_contract.mjs';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';

const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-flow-san-ramon-corona-v1.json','utf8'));
const registry=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-dependency-rule-registry-v1.json','utf8'));
const NOW='2026-09-18T16:30:00.000Z';

function object(objects,id){
  const found=objects.find(x=>x.object_id===id);
  assert.ok(found,`missing object ${id}`);
  return found;
}
function value(objects,id,field){return object(objects,id).data[field];}

// SOURCE EVIDENCE: exact values transcribed from the uploaded real workbook row B3:L3.
const e=fixture.historical_evidence;
assert.deepEqual(e,{
  product_name:'Cerveza Corona',
  purchased_qty:120,
  unit_cost:840,
  purchase_total:100800,
  sell_price:2000,
  sold_qty:52,
  remaining_stock:68,
  sales_revenue:104000,
  supplier_payable:43680,
  remaining_stock_value:57120
});
assert.equal(e.purchased_qty*e.unit_cost,e.purchase_total);
assert.equal(e.sold_qty*e.sell_price,e.sales_revenue);
assert.equal(e.sold_qty*e.unit_cost,e.supplier_payable);
assert.equal(e.remaining_stock*e.unit_cost,e.remaining_stock_value);
assert.equal(e.sold_qty+e.remaining_stock,e.purchased_qty);

// PIECE 1 + 6 INGRESS: canonical objects exist, and each real correction enters as a SOURCE command.
for(const item of fixture.objects){
  assert.equal(item.schema_version,'CUDO_SHARED_OBJECT_CONTRACT_V1');
  assert.ok(item.object_id);
  assert.ok(item.object_type);
  assert.ok(item.field_semantics);
  assert.ok(item.provenance?.source_refs?.length);
}
const commands=fixture.correction_commands.map(c=>buildSourceChangeCommand({
  objects:fixture.objects,
  surface:c.surface,
  objectId:c.object_id,
  field:c.field,
  value:c.value,
  requestedBy:'sistemas@cudo.cl',
  reason:c.reason,
  evidenceRefs:c.evidence_refs
}));
assert.equal(commands.length,2);
assert.ok(commands.every(x=>x.route==='TRANSACTION_LAYER_REQUIRED'));

// PIECES 2,3,4: registry-driven propagation through transaction planning and commit.
const changes=commands.flatMap(x=>x.changes);
const plan=buildTransactionPlan({
  objects:fixture.objects,
  registry,
  changes,
  activeConditions:fixture.active_conditions,
  requestedBy:'sistemas@cudo.cl',
  reason:'Real CUDO evidence replay: San Ramon Corona row',
  evidenceRefs:[
    "artifact:PEDIDO CUDO.xlsx#'Pedido vs San Ramon 04-05-2025'!B3:L3"
  ],
  now:NOW
});
assert.equal(plan.status,'READY');
const ruleIds=plan.transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').map(x=>x.rule_id);
for(const required of [
  'RULE_STOCK_AFTER_SALES_V1',
  'RULE_SALES_REVENUE_V1',
  'RULE_PAYABLE_QTY_AFTER_RETURN_V1',
  'RULE_SUPPLIER_PAYABLE_V1',
  'RULE_OBLIGATION_AMOUNT_FROM_SUPPLIER_PAYABLE_V1'
]){
  assert.ok(ruleIds.includes(required),`missing propagation rule ${required}`);
}
assert.equal(plan.transitions.filter(x=>x.kind==='SOURCE_CHANGE').length,2);
assert.equal(plan.transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').length,5);

const committed=commitTransaction({
  currentObjects:fixture.objects,
  plan,
  now:'2026-09-18T16:31:00.000Z'
});
assert.equal(committed.ok,true);
assert.equal(committed.status,'COMMITTED');

const resourceId='CUDO-RESOURCE-SANRAMON-CORONA-001';
const obligationId='CUDO-OBL-SANRAMON-CORONA-001';
const eventId='CUDO-EVENT-SANRAMON-20250504-001';
assert.equal(value(committed.objects,resourceId,'sold_qty'),52);
assert.equal(value(committed.objects,resourceId,'returned_qty'),68);
assert.equal(value(committed.objects,resourceId,'stock_after_sales'),fixture.expected_after_commit.stock_after_sales);
assert.equal(value(committed.objects,eventId,'sales_revenue'),fixture.expected_after_commit.sales_revenue);
assert.equal(value(committed.objects,obligationId,'payable_qty'),fixture.expected_after_commit.payable_qty);
assert.equal(value(committed.objects,obligationId,'supplier_payable'),fixture.expected_after_commit.supplier_payable);
assert.equal(value(committed.objects,obligationId,'amount'),fixture.expected_after_commit.obligation_amount);

// PIECE 5: same committed canonical obligation becomes operational finance without duplicate manual amount.
const financial=buildFinancialSnapshot({
  objects:committed.objects,
  settlements:[],
  openingPositions:{},
  currency:'CLP'
});
assert.equal(financial.ok,true,JSON.stringify(financial.errors));
const supplierView=financial.obligation_views.find(x=>x.object_id===obligationId);
assert.ok(supplierView);
assert.equal(supplierView.amount,43680);
assert.equal(supplierView.settled_amount,0);
assert.equal(supplierView.outstanding_amount,fixture.expected_after_commit.outstanding_payable);
assert.equal(supplierView.derived_lifecycle,'OPEN');
assert.deepEqual(supplierView.causal_object_ids,[resourceId]);

// PIECE 6: JSON, admin and Sheets are projections of one canonical revision.
const bundle=buildProjectionBundle({
  objects:committed.objects,
  settlements:[],
  financialSnapshot:financial,
  legacyPublic:fixture.projection.legacy_public,
  generatedAt:'2026-09-18T16:32:00.000Z'
});
assert.ok(bundle.source_revision.startsWith('CUDO-REVISION-'));
assert.equal(bundle.public_json.san_ramon_corona.items.length,1);
assert.deepEqual(bundle.public_json.san_ramon_corona.items[0],{
  id:'SANRAMON-20250504-CORONA',
  event_name:'CUDO vs San Ramon 04-05-2025',
  product_name:'Cerveza Corona',
  sales_revenue:104000
});
assert.equal(bundle.admin.source_revision,bundle.source_revision);
assert.equal(bundle.sheets.source_revision,bundle.source_revision);
assert.equal(bundle.admin.summary.outstanding_payable,43680);
const sheetRows=bundle.sheets.tables.FINANCIAL_OBLIGATIONS;
const supplierRow=sheetRows.slice(1).find(row=>row[0]===obligationId);
assert.ok(supplierRow);
assert.equal(supplierRow[3],43680);
assert.equal(supplierRow[5],43680);
assert.equal(supplierRow[8],bundle.source_revision);

// Persistence path is planned and certified as DRY_RUN: zero external writes.
const persistencePlan=planProjectionPersistence({
  bundle,
  targets:fixture.projection.targets
});
let adapterCalls=0;
const adapter={
  async readJson(){adapterCalls++;return null;},
  async writeJson(){adapterCalls++;},
  async readValues(){adapterCalls++;return [];},
  async replaceValues(){adapterCalls++;}
};
const persistence=await applyProjectionPersistence({
  plan:persistencePlan,
  adapter,
  currentSourceRevision:bundle.source_revision,
  apply:false
});
assert.equal(persistence.ok,true);
assert.equal(persistence.status,'DRY_RUN');
assert.equal(persistence.writes_applied,0);
assert.equal(persistence.mutations_planned,3);
assert.equal(adapterCalls,0);

// Deterministic replay from the same pre-correction state produces the same canonical result.
const replayPlan=buildTransactionPlan({
  objects:fixture.objects,
  registry,
  changes,
  activeConditions:fixture.active_conditions,
  requestedBy:'sistemas@cudo.cl',
  reason:'Real CUDO evidence replay: San Ramon Corona row',
  evidenceRefs:["artifact:PEDIDO CUDO.xlsx#'Pedido vs San Ramon 04-05-2025'!B3:L3"],
  now:NOW
});
assert.deepEqual(replayPlan.transitions,plan.transitions);

console.log(JSON.stringify({
  ok:true,
  flow_id:fixture.flow_id,
  real_source:"PEDIDO CUDO.xlsx / Pedido vs San Ramon 04-05-2025 / B3:L3",
  piece_1_shared_object_contract:true,
  piece_2_dependency_registry:true,
  piece_3_propagation_executor:true,
  piece_4_transaction_commit:true,
  piece_5_financial_core:true,
  piece_6_projection_persistence_adapters:true,
  source_changes:2,
  derived_recalculations:5,
  real_target:{
    sold_qty:52,
    remaining_stock:68,
    sales_revenue:104000,
    supplier_payable:43680,
    remaining_stock_value:57120
  },
  canonical_outstanding_payable:43680,
  projection_mutations_planned:3,
  external_writes_applied:0,
  production_write:false
},null,2));
