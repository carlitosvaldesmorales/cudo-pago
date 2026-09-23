import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EVENT_IDS,EVENT_REQUEST_HEADERS,loadDependencyRegistry,planEventResourceSheetRequests} from './process_event_resource_requests.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../contracts/cudo-event-resource-governed-fixture-v1.json',import.meta.url),'utf8'));
const registry=loadDependencyRegistry();
const rows=[EVENT_REQUEST_HEADERS,
['G-C','2026-09-22T06:59:00Z',EVENT_IDS.MATCH,'1','MATCH_CONFIGURE_OPERATION',JSON.stringify({starts_at:'2026-09-27T13:00:00-03:00',location:'LOCAL',conditions:{venue_required:true,food_sales_enabled:false,bar_sales_enabled:true,ticketing_enabled:true,broadcast_enabled:false}}),'configure','qa://configure','sistemas@cudo.cl','PENDING','',''],
['G-O','2026-09-22T07:00:00Z',EVENT_IDS.MATCH,'2','MATCH_ADD_OFFERING',JSON.stringify({name:'Bebida QA',mode:'DIRECT_RESALE',sell_price:1500}),'offer','qa://offer','sistemas@cudo.cl','PENDING','',''],
['G-P','2026-09-22T07:01:00Z',EVENT_IDS.MATCH,'3','MATCH_PURCHASE',JSON.stringify({item_id:'INV-BEBIDA_QA',qty:10,unit_cost:700,supplier:'Proveedor QA',payment:'PENDING'}),'purchase','qa://purchase','sistemas@cudo.cl','PENDING','',''],
['G-S','2026-09-22T07:02:00Z',EVENT_IDS.MATCH,'4','MATCH_SALE',JSON.stringify({offering_id:'OFFER-BEBIDA_QA',qty:4,unit_price:1500,method:'CASH'}),'sale','qa://sale','sistemas@cudo.cl','PENDING','',''],
['G-BAD','2026-09-22T07:03:00Z',EVENT_IDS.BINGO,'5','BINGO_DONATE_PRIZE','{bad json','bad','qa://bad','sistemas@cudo.cl','PENDING','','']];
let n=0;const plan=planEventResourceSheetRequests({requestValues:rows,stateStore:state,registry,expectedPending:5,now:()=> '2026-09-22T07:'+String(10+n++).padStart(2,'0')+':00Z'});
assert.deepEqual(plan.summary.map(x=>x.status),['APPLIED','APPLIED','APPLIED','APPLIED','BLOCKED_PAYLOAD_JSON']);assert.equal(plan.state_store.store_revision,5);
assert.equal(plan.projection.MATCH.commerce.inventory_items[0].stock,6);assert.equal(plan.projection.MATCH.commerce.purchase_total,7000);assert.equal(plan.projection.MATCH.commerce.sales_revenue,6000);assert.equal(plan.projection.MATCH.supplier_payable.amount,7000);
const control=plan.sheet_mutations.find(x=>x.kind==='EVENT_CONTROL');assert.deepEqual(control.values[0].slice(0,7),['EVENT_ID','KIND','DISPLAY_NAME','STORE_REVISION','CLOSED','OFFERINGS_JSON','INVENTORY_JSON']);
const match=control.values.find((x,i)=>i>0&&x[1]==='MATCH');assert.equal(JSON.parse(match[5])[0].name,'Bebida QA');assert.equal(JSON.parse(match[6])[0].stock,6);assert.equal(match[15],'2026-09-27T13:00:00-03:00');assert.equal(match[16],'LOCAL');assert.equal(JSON.parse(match[17]).bar_sales_enabled,true);
assert.throws(()=>planEventResourceSheetRequests({requestValues:[['WRONG_HEADER']],stateStore:state,registry}),/unexpected contract/);
console.log(JSON.stringify({schema_version:'CUDO_EVENT_RESOURCE_GOOGLE_ADAPTER_FIXTURE_CERT_V2',pass:true,dynamic_control_projection:true,state_revision:plan.state_store.store_revision,production_write:false},null,2));
