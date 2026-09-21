import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EVENT_IDS,
  loadEventResourceState,
  loadDependencyRegistry,
  processEventResourceRequests,
  buildEventResourceProjection,
  saveEventResourceState
} from './process_event_resource_requests.mjs';
import {buildSourceChangeCommand} from './projection_persistence_adapters.mjs';

const base=loadEventResourceState();
const registry=loadDependencyRegistry();
let state=JSON.parse(JSON.stringify(base));
let tick=0;
const now=()=> '2026-09-21T20:'+String(tick++).padStart(2,'0')+':00.000Z';
const make=(id,event_id,expected_revision,action,payload={})=>({
  request_id:id,
  requested_at:now(),
  event_id,
  expected_revision,
  action,
  payload,
  requested_by:'sistemas@cudo.cl',
  reason:'QA governed '+action,
  evidence_ref:'qa://event-request/'+id
});
const apply=(request)=>{
  const result=processEventResourceRequests({requests:[request],stateStore:state,registry,now});
  state=result.state_store;
  return result;
};

let r=apply(make('REQ-MATCH-PUR-1',EVENT_IDS.MATCH,1,'MATCH_PURCHASE',{qty:10,unit_cost:700}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.MATCH.resource.stock_after_sales,22);
assert.equal(r.projection.MATCH.resource.purchase_total,7000);
assert.equal(r.projection.MATCH.supplier_payable.amount,7000);
assert.equal(state.store_revision,2);

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cudo-event-resource-'));
const statePath=path.join(dir,'state.json');
const projectionPath=path.join(dir,'projection.json');
saveEventResourceState({stateStore:state,projection:r.projection,statePath,projectionPath});
state=loadEventResourceState(statePath);
assert.equal(buildEventResourceProjection(state).MATCH.resource.stock_after_sales,22);

r=apply(make('REQ-MATCH-SALE-1',EVENT_IDS.MATCH,2,'MATCH_SALE',{qty:5,unit_price:1500}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.MATCH.resource.stock_after_sales,17);
assert.equal(r.projection.MATCH.resource.sales_revenue,7500);
assert.equal(r.projection.MATCH.operational_resource_result_clp,500);
assert.equal(state.store_revision,3);

const beforeConflict=JSON.stringify(state.objects);
r=apply(make('REQ-STALE-1',EVENT_IDS.MATCH,2,'MATCH_SALE',{qty:1,unit_price:1500}));
assert.equal(r.summary[0].status,'BLOCKED_REVISION_CONFLICT');
assert.equal(JSON.stringify(state.objects),beforeConflict);
assert.equal(state.store_revision,3);

r=apply(make('REQ-MATCH-SALE-1',EVENT_IDS.MATCH,3,'MATCH_SALE',{qty:5,unit_price:1500}));
assert.equal(r.summary[0].status,'DUPLICATE_ALREADY_APPLIED');
assert.equal(state.store_revision,3);

r=apply(make('REQ-MATCH-RESULT-1',EVENT_IDS.MATCH,3,'MATCH_RESULT',{series:'Primera',home:2,away:1}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.MATCH.sport_results[0].home,2);
assert.equal(state.store_revision,4);

r=apply(make('REQ-BINGO-PERMIT-1',EVENT_IDS.BINGO,4,'BINGO_CONFIRM_PERMIT',{reference:'AUT-QA-001'}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.BINGO.permit_confirmed,true);
assert.equal(state.store_revision,5);

const payableBeforeDonation=r.projection.BINGO.supplier_payable.amount;
r=apply(make('REQ-BINGO-PRIZE-1',EVENT_IDS.BINGO,5,'BINGO_DONATE_PRIZE',{name:'Canasta familiar',reference:'DON-QA-001'}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.BINGO.donated_prizes.length,1);
assert.equal(r.projection.BINGO.supplier_payable.amount,payableBeforeDonation);
assert.equal(state.store_revision,6);

r=apply(make('REQ-BINGO-PUR-1',EVENT_IDS.BINGO,6,'BINGO_PURCHASE',{qty:8,unit_cost:500}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.BINGO.resource.stock_after_sales,24);
assert.equal(r.projection.BINGO.resource.purchase_total,4000);
assert.equal(r.projection.BINGO.supplier_payable.amount,4000);
assert.equal(state.store_revision,7);

r=apply(make('REQ-BINGO-SALE-1',EVENT_IDS.BINGO,7,'BINGO_SALE',{qty:4,unit_price:1500}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.BINGO.resource.stock_after_sales,20);
assert.equal(r.projection.BINGO.resource.sales_revenue,6000);
assert.equal(r.projection.BINGO.operational_resource_result_clp,2000);
assert.equal(state.store_revision,8);

r=apply(make('REQ-MATCH-CLOSE-1',EVENT_IDS.MATCH,8,'MATCH_CLOSE',{}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.MATCH.closed,true);
assert.equal(state.store_revision,9);

r=apply(make('REQ-BINGO-CLOSE-1',EVENT_IDS.BINGO,9,'BINGO_CLOSE',{}));
assert.equal(r.summary[0].status,'APPLIED');
assert.equal(r.projection.BINGO.closed,true);
assert.equal(state.store_revision,10);

const matchEvent=state.objects.find(x=>x.object_id===EVENT_IDS.MATCH);
assert.throws(()=>buildSourceChangeCommand({
  objects:state.objects,
  surface:'CUDO_WEB_EVENT_RESOURCE_QA',
  objectId:matchEvent.object_id,
  field:'sales_revenue',
  value:999,
  requestedBy:'sistemas@cudo.cl',
  reason:'must fail derived direct write',
  evidenceRefs:['qa://derived-write-negative-control']
}),/direct surface write blocked/);

const applied=state.audit.filter(x=>x.status==='APPLIED');
assert.equal(applied.length,9);
assert.ok(applied.every(x=>Array.isArray(x.command_ids)&&x.command_ids.length>0));
assert.ok(applied.every(x=>x.transaction_id));
assert.ok(applied.every(x=>Array.isArray(x.transition_ids)&&x.transition_ids.length>0));
assert.equal(state.production_write,false);

saveEventResourceState({
  stateStore:state,
  projection:buildEventResourceProjection(state),
  statePath,
  projectionPath
});
const reread=loadEventResourceState(statePath);
const finalProjection=JSON.parse(fs.readFileSync(projectionPath,'utf8'));
assert.equal(reread.store_revision,10);
assert.equal(finalProjection.MATCH.resource.stock_after_sales,17);
assert.equal(finalProjection.BINGO.resource.stock_after_sales,20);
assert.equal(finalProjection.authority,'CANONICAL_GRAPH_READ_MODEL');

console.log(JSON.stringify({
  schema_version:'CUDO_EVENT_RESOURCE_GOVERNED_PERSISTENCE_CERT_V1',
  pass:true,
  final_revision:reread.store_revision,
  applied_requests:applied.length,
  stale_revision_fail_closed:true,
  duplicate_request_idempotent:true,
  direct_derived_write_blocked:true,
  persisted_reload_pass:true,
  match:{
    stock:finalProjection.MATCH.resource.stock_after_sales,
    sales_revenue:finalProjection.MATCH.resource.sales_revenue,
    supplier_payable:finalProjection.MATCH.supplier_payable.amount,
    result:finalProjection.MATCH.sport_results,
    closed:finalProjection.MATCH.closed
  },
  bingo:{
    permit_confirmed:finalProjection.BINGO.permit_confirmed,
    donated_prizes:finalProjection.BINGO.donated_prizes.length,
    stock:finalProjection.BINGO.resource.stock_after_sales,
    sales_revenue:finalProjection.BINGO.resource.sales_revenue,
    supplier_payable:finalProjection.BINGO.supplier_payable.amount,
    closed:finalProjection.BINGO.closed
  },
  production_write:false
},null,2));
