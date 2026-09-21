import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EVENT_IDS,
  EVENT_REQUEST_HEADERS,
  loadEventResourceState,
  loadDependencyRegistry,
  planEventResourceSheetRequests
} from './process_event_resource_requests.mjs';

const state=JSON.parse(fs.readFileSync(new URL('../contracts/cudo-event-resource-governed-fixture-v1.json',import.meta.url),'utf8'));
const registry=loadDependencyRegistry();
const rows=[
  EVENT_REQUEST_HEADERS,
  ['REQ-GOOGLE-MATCH-PUR','2026-09-21T21:00:00.000Z',EVENT_IDS.MATCH,'1','MATCH_PURCHASE',JSON.stringify({qty:10,unit_cost:700}),'QA Google purchase','qa://google/match-purchase','sistemas@cudo.cl','PENDING','',''],
  ['REQ-GOOGLE-BINGO-PERMIT','2026-09-21T21:01:00.000Z',EVENT_IDS.BINGO,'2','BINGO_CONFIRM_PERMIT',JSON.stringify({reference:'AUT-QA-GOOGLE'}),'QA Google permit','qa://google/bingo-permit','sistemas@cudo.cl','PENDING','',''],
  ['REQ-GOOGLE-BAD-JSON','2026-09-21T21:02:00.000Z',EVENT_IDS.BINGO,'3','BINGO_DONATE_PRIZE','{bad json','QA bad JSON','qa://google/bad','sistemas@cudo.cl','PENDING','','']
];
let tick=0;
const plan=planEventResourceSheetRequests({
  requestValues:rows,
  stateStore:state,
  registry,
  expectedPending:3,
  now:()=> '2026-09-21T21:'+String(10+tick++).padStart(2,'0')+':00.000Z'
});
assert.equal(plan.ok,true);
assert.equal(plan.pending_count,3);
assert.equal(plan.summary[0].status,'APPLIED');
assert.equal(plan.summary[1].status,'APPLIED');
assert.equal(plan.summary[2].status,'BLOCKED_PAYLOAD_JSON');
assert.equal(plan.state_store.store_revision,3);
assert.equal(plan.projection.MATCH.resource.stock_after_sales,22);
assert.equal(plan.projection.MATCH.supplier_payable.amount,7000);
assert.equal(plan.projection.BINGO.permit_confirmed,true);
assert.equal(plan.projection.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(plan.production_write,false);

const statusMutations=plan.sheet_mutations.filter(x=>x.kind==='REQUEST_STATUS');
const auditMutations=plan.sheet_mutations.filter(x=>x.kind==='EVENT_AUDIT');
const controlMutations=plan.sheet_mutations.filter(x=>x.kind==='EVENT_CONTROL');
assert.equal(statusMutations.length,3);
assert.equal(auditMutations.length,3);
assert.equal(controlMutations.length,1);
assert.ok(statusMutations.every(x=>x.spreadsheetId==='1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw'));
assert.ok(auditMutations.every(x=>x.op==='append'));
assert.equal(controlMutations[0].op,'replace');
assert.equal(controlMutations[0].values[0][0],'EVENT_ID');
assert.equal(controlMutations[0].values.length,3);

assert.throws(()=>planEventResourceSheetRequests({
  requestValues:[['WRONG_HEADER']],
  stateStore:state,
  registry
}),/unexpected contract/);

console.log(JSON.stringify({
  schema_version:'CUDO_EVENT_RESOURCE_GOOGLE_ADAPTER_FIXTURE_CERT_V1',
  pass:true,
  pending_count:plan.pending_count,
  applied_count:plan.summary.filter(x=>x.status==='APPLIED').length,
  blocked_bad_json:true,
  request_status_mutations:statusMutations.length,
  append_only_audit_mutations:auditMutations.length,
  control_projection_rows:controlMutations[0].values.length,
  state_revision:plan.state_store.store_revision,
  canonical_read_model:true,
  production_write:false
},null,2));
