import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSourceChangeCommand,buildProjectionBundle,planProjectionPersistence,applyProjectionPersistence} from './projection_persistence_adapters.mjs';
import {buildTransactionPlan,commitTransaction} from './transaction_override_contract.mjs';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';

const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-flow-san-ramon-complete-event-v1.json','utf8'));
const registry=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-dependency-rule-registry-v1.json','utf8'));
const NOW='2026-09-18T17:30:00.000Z';

function byId(objects,id){
  const x=objects.find(o=>o.object_id===id);
  assert.ok(x,`missing object ${id}`);
  return x;
}
function sum(values){return values.reduce((a,b)=>a+Number(b),0);}

const products=fixture.historical_evidence.products;
assert.equal(products.length,5);
assert.deepEqual(products.map(x=>x.product_name),[
  'Cerveza Corona',
  'Bebida Cocacola-sprite-fanta',
  'Bebida CCU',
  'Johnnie walker',
  'Vino Aromo'
]);
const totals=fixture.historical_evidence.totals;
assert.equal(sum(products.map(x=>x.purchase_total)),totals.purchase_total);
assert.equal(sum(products.map(x=>x.sales_revenue)),totals.sales_revenue);
assert.equal(sum(products.map(x=>x.supplier_payable)),totals.supplier_payable);
assert.equal(sum(products.map(x=>x.remaining_stock_value)),totals.remaining_stock_value);
assert.equal(sum(products.map(x=>x.purchased_qty)),totals.purchased_qty);
assert.equal(sum(products.map(x=>x.sold_qty)),totals.sold_qty);
assert.equal(sum(products.map(x=>x.remaining_stock)),totals.remaining_stock);
assert.equal(totals.sold_qty+totals.remaining_stock,totals.purchased_qty);
const ccu=products.find(x=>x.product_name==='Bebida CCU');
assert.equal(ccu.remaining_stock,0);
assert.equal(ccu.remaining_stock_evidence,'INFERRED_ZERO_FROM_H5_FORMULA_AND_L5_VALUE');

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
assert.equal(commands.length,9);

const plan=buildTransactionPlan({
  objects:fixture.objects,
  registry,
  changes:commands.flatMap(c=>c.changes),
  activeConditions:fixture.active_conditions,
  requestedBy:'sistemas@cudo.cl',
  reason:'Real CUDO complete event evidence replay: San Ramon rows 3-7',
  evidenceRefs:["artifact:PEDIDO CUDO.xlsx#'Pedido vs San Ramon 04-05-2025'!B3:L8"],
  now:NOW
});
assert.equal(plan.status,'READY',JSON.stringify(plan.propagation_failures||[]));
assert.equal(plan.transitions.filter(x=>x.kind==='SOURCE_CHANGE').length,9);
const ruleIds=new Set(plan.transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').map(x=>x.rule_id));
for(const id of [
  'RULE_STOCK_AFTER_SALES_V1',
  'RULE_RESOURCE_SALES_REVENUE_V1',
  'RULE_EVENT_SALES_REVENUE_SUM_V1',
  'RULE_RESOURCE_REMAINING_STOCK_VALUE_V1',
  'RULE_PAYABLE_QTY_AFTER_RETURN_V1',
  'RULE_SUPPLIER_PAYABLE_V1',
  'RULE_OBLIGATION_AMOUNT_FROM_SUPPLIER_PAYABLE_V1'
]) assert.ok(ruleIds.has(id),`missing rule ${id}`);
assert.ok(!ruleIds.has('RULE_SALES_REVENUE_V1'),'legacy direct event sales rule must not execute in multi-resource mode');

const committed=commitTransaction({
  currentObjects:fixture.objects,
  plan,
  now:'2026-09-18T17:31:00.000Z'
});
assert.equal(committed.ok,true);

const resources=committed.objects.filter(x=>x.object_type==='RESOURCE_FACILITY');
const obligations=committed.objects.filter(x=>x.object_type==='FINANCIAL_OBLIGATION');
const event=byId(committed.objects,'CUDO-EVENT-SANRAMON-20250504-COMPLETE');
assert.equal(resources.length,5);
assert.equal(obligations.length,5);
assert.equal(event.data.sales_revenue,353000);

for(const evidence of products){
  const slug={
    'Cerveza Corona':'CORONA',
    'Bebida Cocacola-sprite-fanta':'COCA',
    'Bebida CCU':'CCU',
    'Johnnie walker':'JOHNNIE',
    'Vino Aromo':'AROMO'
  }[evidence.product_name];
  const resource=byId(committed.objects,`CUDO-RESOURCE-SANRAMON-${slug}-001`);
  const obligation=byId(committed.objects,`CUDO-OBL-SANRAMON-${slug}-001`);
  assert.equal(resource.data.purchased_qty,evidence.purchased_qty);
  assert.equal(resource.data.purchase_total,evidence.purchase_total);
  assert.equal(resource.data.sold_qty,evidence.sold_qty);
  assert.equal(resource.data.stock_after_sales,evidence.remaining_stock);
  assert.equal(resource.data.sales_revenue,evidence.sales_revenue);
  assert.equal(resource.data.remaining_stock_value,evidence.remaining_stock_value);
  assert.equal(obligation.data.supplier_payable,evidence.supplier_payable);
  assert.equal(obligation.data.amount,evidence.supplier_payable);
}
assert.equal(sum(resources.map(x=>x.data.purchase_total)),274260);
assert.equal(sum(resources.map(x=>x.data.sales_revenue)),353000);
assert.equal(sum(resources.map(x=>x.data.remaining_stock_value)),109690);
assert.equal(sum(obligations.map(x=>x.data.amount)),164570);

const financial=buildFinancialSnapshot({
  objects:committed.objects,
  settlements:[],
  openingPositions:{},
  currency:'CLP'
});
assert.equal(financial.ok,true,JSON.stringify(financial.errors));
assert.equal(financial.obligation_views.length,5);
assert.equal(financial.obligation_views.filter(x=>x.derived_lifecycle==='OPEN').length,5);
assert.equal(sum(financial.obligation_views.map(x=>x.outstanding_amount)),164570);

const bundle=buildProjectionBundle({
  objects:committed.objects,
  settlements:[],
  financialSnapshot:financial,
  legacyPublic:fixture.projection.legacy_public,
  generatedAt:'2026-09-18T17:32:00.000Z'
});
assert.equal(bundle.public_json.san_ramon_complete.items.length,1);
assert.deepEqual(bundle.public_json.san_ramon_complete.items[0],{
  id:'SANRAMON-20250504-COMPLETE',
  event_name:'CUDO vs San Ramon 04-05-2025',
  sales_revenue:353000
});
assert.equal(bundle.admin.summary.obligations_total,5);
assert.equal(bundle.admin.summary.obligations_open,5);
assert.equal(bundle.admin.summary.outstanding_payable,164570);
assert.equal(bundle.sheets.tables.FINANCIAL_OBLIGATIONS.length,6);

const persistencePlan=planProjectionPersistence({bundle,targets:fixture.projection.targets});
const dry=await applyProjectionPersistence({
  plan:persistencePlan,
  adapter:{
    async readJson(){throw new Error('dry-run must not read adapter');},
    async writeJson(){throw new Error('dry-run must not write adapter');},
    async readValues(){throw new Error('dry-run must not read adapter');},
    async replaceValues(){throw new Error('dry-run must not write adapter');}
  },
  currentSourceRevision:bundle.source_revision,
  apply:false
});
assert.equal(dry.status,'DRY_RUN');
assert.equal(dry.writes_applied,0);
assert.equal(dry.mutations_planned,3);

console.log(JSON.stringify({
  ok:true,
  flow_id:fixture.flow_id,
  source:"PEDIDO CUDO.xlsx / Pedido vs San Ramon 04-05-2025 / B3:L8",
  products:5,
  source_changes:9,
  derived_recalculations:plan.transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').length,
  aggregate_reverse_relation:true,
  legacy_direct_sales_rule_executed:false,
  totals:{
    purchase_total:274260,
    sales_revenue:353000,
    supplier_payable:164570,
    remaining_stock_value:109690,
    purchased_qty:282,
    sold_qty:199,
    remaining_stock:83
  },
  financial_obligations:5,
  outstanding_payable:164570,
  projection_mutations_planned:3,
  production_write:false
},null,2));
