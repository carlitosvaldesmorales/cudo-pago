import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSourceChangeCommand} from './projection_persistence_adapters.mjs';
import {buildTransactionPlan,commitTransaction,transactionFingerprint} from './transaction_override_contract.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STATE_PATH=path.resolve(__dirname,'../state/event-resource-state.json');
export const DEFAULT_READ_MODEL_PATH=path.resolve(__dirname,'../data/event-resource-qa.json');
export const REGISTRY_PATH=path.resolve(__dirname,'../contracts/cudo-dependency-rule-registry-v1.json');
export const ALLOWED_REQUESTER='sistemas@cudo.cl';
export const EVENT_RESOURCE_SHEET_ID='1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw';
export const EVENT_REQUESTS_SHEET='EVENT_RESOURCE_REQUESTS';
export const EVENT_CONTROL_SHEET='EVENT_RESOURCE_CONTROL';
export const EVENT_AUDIT_SHEET='EVENT_RESOURCE_AUDIT';
export const EVENT_REQUEST_HEADERS=['REQUEST_ID','REQUESTED_AT','EVENT_ID','EXPECTED_REVISION','ACTION','PAYLOAD_JSON','REASON','EVIDENCE_REF','REQUESTED_BY','PROCESS_STATUS','RESULT','APPLIED_AT'];
export const EVENT_AUDIT_HEADERS=['REQUEST_ID','EVENT_ID','ACTION','STATUS','EXPECTED_REVISION','NEW_REVISION','REQUESTED_BY','REASON','EVIDENCE_REF','TRANSACTION_ID','TRANSITION_IDS','APPLIED_AT'];

export const EVENT_IDS={MATCH:'CUDO-EVENT-QA-MATCH-FULLDAY-001',BINGO:'CUDO-EVENT-QA-BINGO-FULLDAY-001'};
export const RESOURCE_IDS={MATCH:'CUDO-COMMERCE-QA-MATCH-001',BINGO:'CUDO-COMMERCE-QA-BINGO-001'};
export const OBLIGATION_IDS={MATCH:'CUDO-OBL-QA-MATCH-SUP-001',BINGO:'CUDO-OBL-QA-BINGO-SUP-001'};

const ACTIONS=new Set([
  'MATCH_CONFIGURE_OPERATION','MATCH_ADD_OFFERING','MATCH_ADD_INGREDIENT','MATCH_PURCHASE','MATCH_SALE','MATCH_RESULT','MATCH_CLOSE',
  'BINGO_CONFIGURE_OPERATION','BINGO_ADD_OFFERING','BINGO_ADD_INGREDIENT','BINGO_CONFIRM_PERMIT','BINGO_DONATE_PRIZE','BINGO_PURCHASE','BINGO_SALE','BINGO_CLOSE'
]);

function clone(v){return JSON.parse(JSON.stringify(v));}
function clean(v){return String(v??'').trim();}
function int(v,label){const n=Number(v);if(!Number.isInteger(n)||n<0) throw new Error(label+' must be a non-negative integer');return n;}
function positive(v,label){const n=int(v,label);if(n<=0) throw new Error(label+' must be greater than zero');return n;}
function objectById(objects,id){const object=objects.find(x=>x.object_id===id);if(!object) throw new Error('object not found: '+id);return object;}
function actionFamily(action){if(action.startsWith('MATCH_')) return 'MATCH';if(action.startsWith('BINGO_')) return 'BINGO';throw new Error('unsupported event action '+action);}
function payloadOf(request){
  if(request.payload&&typeof request.payload==='object') return clone(request.payload);
  if(typeof request.payload_json==='string'&&request.payload_json.trim()) return JSON.parse(request.payload_json);
  return {};
}
function sourceSpec(objectId,field,value){return {objectId,field,value};}
function number(v,label,{positive=false,integer=false}={}){
  const n=Number(v);
  if(!Number.isFinite(n)||(positive?n<=0:n<0)||(integer&&!Number.isInteger(n))) throw new Error(label+' invalid');
  return n;
}
function slug(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,42)||'ITEM';}
function commerce(resource){
  for(const field of ['offerings','inventory_items','purchases','sales']) if(!Array.isArray(resource.data[field])) throw new Error(resource.object_id+': dynamic commerce field missing '+field);
  return resource.data;
}
function findOffering(resource,id){return commerce(resource).offerings.find(x=>x.offering_id===id);}
function findItem(resource,id){return commerce(resource).inventory_items.find(x=>x.item_id===id);}
function uniqueId(prefix,name,rows,key){
  const base=prefix+'-'+slug(name),used=new Set(rows.map(x=>x[key]));
  if(!used.has(base)) return base;
  let i=2;while(used.has(base+'-'+i)) i++;
  return base+'-'+i;
}
function componentNeeds(resource,offeringId,qty=1,stack=[]){
  const o=findOffering(resource,offeringId);
  if(!o) throw new Error('offering not found: '+offeringId);
  if(stack.includes(offeringId)) throw new Error('BUNDLE_CYCLE');
  const needs=new Map(),add=(id,n)=>needs.set(id,(needs.get(id)||0)+n);
  for(const c of o.components||[]){
    const per=Number(c.qty_per_sale||0);if(!(per>0)) continue;
    if(c.kind==='INVENTORY') add(c.item_id,per*qty);
    else if(c.kind==='OFFERING') for(const [id,n] of componentNeeds(resource,c.offering_id,per*qty,[...stack,offeringId])) add(id,n);
  }
  return needs;
}
function maxSellable(resource,offeringId){
  const needs=componentNeeds(resource,offeringId,1);if(!needs.size) return 0;
  let max=Infinity;
  for(const [id,need] of needs){const item=findItem(resource,id);if(!item||!(need>0)) return 0;max=Math.min(max,Math.floor((Number(item.stock||0)+1e-9)/need));}
  return Number.isFinite(max)?Math.max(0,max):0;
}

export function loadEventResourceState(statePath=DEFAULT_STATE_PATH){
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  if(state.schema_version!=='CUDO_EVENT_RESOURCE_STATE_STORE_V1') throw new Error('event resource state schema unexpected');
  if(!Number.isInteger(state.store_revision)||state.store_revision<1) throw new Error('event resource store revision invalid');
  if(!Array.isArray(state.objects)||!Array.isArray(state.audit)) throw new Error('event resource state incomplete');
  return state;
}
export function loadDependencyRegistry(registryPath=REGISTRY_PATH){
  return JSON.parse(fs.readFileSync(registryPath,'utf8'));
}

function mapActionToSourceSpecs({state,request,now}){
  const action=clean(request.action).toUpperCase();
  if(!ACTIONS.has(action)) throw new Error('unsupported action '+action);
  const family=actionFamily(action),eventId=clean(request.event_id)||EVENT_IDS[family];
  if(eventId!==EVENT_IDS[family]) throw new Error('event/action mismatch '+eventId+' '+action);
  const resourceId=RESOURCE_IDS[family],obligationId=OBLIGATION_IDS[family];
  const event=objectById(state.objects,eventId),resource=objectById(state.objects,resourceId),obligation=objectById(state.objects,obligationId);
  const payload=payloadOf(request),data=commerce(resource);

  if(action.endsWith('_CONFIGURE_OPERATION')){
    const startsAt=clean(payload.starts_at);
    const location=clean(payload.location).toUpperCase();
    if(!startsAt||!Number.isFinite(Date.parse(startsAt))) throw new Error('starts_at invalid');
    if(!['LOCAL','VISITA','OTRO'].includes(location)) throw new Error('location invalid');
    const raw=payload.conditions&&typeof payload.conditions==='object'?payload.conditions:{};
    const conditions={
      venue_required:Boolean(raw.venue_required),
      food_sales_enabled:Boolean(raw.food_sales_enabled),
      bar_sales_enabled:Boolean(raw.bar_sales_enabled),
      ticketing_enabled:Boolean(raw.ticketing_enabled),
      broadcast_enabled:Boolean(raw.broadcast_enabled)
    };
    return [
      sourceSpec(eventId,'starts_at',startsAt),
      sourceSpec(eventId,'location',location),
      sourceSpec(eventId,'conditions',conditions)
    ];
  }

  if(action.endsWith('_ADD_OFFERING')){
    const name=clean(payload.name),mode=clean(payload.mode).toUpperCase(),sellPrice=number(payload.sell_price,'sell_price');
    if(!name) throw new Error('offering name required');
    if(!['PREPARED','DIRECT_RESALE'].includes(mode)) throw new Error('unsupported offering mode '+mode);
    if(data.offerings.some(x=>slug(x.name)===slug(name))) throw new Error('OFFERING_ALREADY_EXISTS');
    const offerings=clone(data.offerings),inventory=clone(data.inventory_items);
    const offeringId=clean(payload.offering_id)||uniqueId('OFFER',name,offerings,'offering_id');
    const next={offering_id:offeringId,name,mode,sell_price:sellPrice,components:[]};
    if(mode==='DIRECT_RESALE'){
      const itemId=uniqueId('INV',name,inventory,'item_id');
      inventory.push({item_id:itemId,name,unit:'unidad',stock:0,unit_cost:0});
      next.components.push({kind:'INVENTORY',item_id:itemId,qty_per_sale:1});
    }
    offerings.push(next);
    return [sourceSpec(resourceId,'offerings',offerings),sourceSpec(resourceId,'inventory_items',inventory)];
  }
  if(action.endsWith('_ADD_INGREDIENT')){
    const offeringId=clean(payload.offering_id),itemName=clean(payload.item_name),unit=clean(payload.unit)||'unidad';
    const qty=number(payload.qty_per_sale,'qty_per_sale',{positive:true});
    if(!itemName) throw new Error('item_name required');
    const offerings=clone(data.offerings),inventory=clone(data.inventory_items),o=offerings.find(x=>x.offering_id===offeringId);
    if(!o||o.mode!=='PREPARED') throw new Error('INVALID_RECIPE_TARGET');
    let item=inventory.find(x=>slug(x.name)===slug(itemName)&&x.unit===unit);
    if(!item){item={item_id:uniqueId('INV',itemName,inventory,'item_id'),name:itemName,unit,stock:0,unit_cost:0};inventory.push(item);}
    const current=(o.components||[]).find(x=>x.kind==='INVENTORY'&&x.item_id===item.item_id);
    if(current) current.qty_per_sale=qty; else (o.components||(o.components=[])).push({kind:'INVENTORY',item_id:item.item_id,qty_per_sale:qty});
    return [sourceSpec(resourceId,'offerings',offerings),sourceSpec(resourceId,'inventory_items',inventory)];
  }
  if(action.endsWith('_PURCHASE')){
    const itemId=clean(payload.item_id),qty=number(payload.qty,'qty',{positive:true}),unitCost=number(payload.unit_cost,'unit_cost',{positive:true});
    const payment=clean(payload.payment).toUpperCase()||'PENDING',supplier=clean(payload.supplier)||'Proveedor QA';
    if(!['PENDING','CASH','TRANSFER'].includes(payment)) throw new Error('invalid payment');
    const inventory=clone(data.inventory_items),purchases=clone(data.purchases),item=inventory.find(x=>x.item_id===itemId);
    if(!item) throw new Error('inventory item not found: '+itemId);
    item.stock=Number(item.stock||0)+qty;item.unit_cost=unitCost;
    purchases.push({purchase_id:'PUR-'+clean(request.request_id),item_id:itemId,qty,unit_cost:unitCost,supplier,payment,created_at:now});
    const payable=purchases.filter(x=>x.payment==='PENDING').reduce((sum,x)=>sum+Number(x.qty)*Number(x.unit_cost),0);
    return [sourceSpec(resourceId,'inventory_items',inventory),sourceSpec(resourceId,'purchases',purchases),sourceSpec(obligationId,'supplier_payable',payable)];
  }
  if(action.endsWith('_SALE')){
    const offeringId=clean(payload.offering_id),qty=number(payload.qty,'qty',{positive:true,integer:true}),unitPrice=number(payload.unit_price,'unit_price');
    const method=clean(payload.method).toUpperCase()||'CASH';if(!['CASH','TRANSFER'].includes(method)) throw new Error('invalid sale method');
    const snapshot={...resource,data:{...resource.data,inventory_items:clone(data.inventory_items),offerings:clone(data.offerings)}};
    if(!findOffering(snapshot,offeringId)) throw new Error('offering not found: '+offeringId);
    const needs=componentNeeds(snapshot,offeringId,qty);if(!needs.size) throw new Error('OFFERING_WITHOUT_COMPONENTS');
    for(const [id,need] of needs){const item=findItem(snapshot,id);if(!item||Number(item.stock||0)+1e-9<need) throw new Error('INSUFFICIENT_STOCK');}
    for(const [id,need] of needs) findItem(snapshot,id).stock=Number(findItem(snapshot,id).stock||0)-need;
    const sales=clone(data.sales);sales.push({sale_id:'SALE-'+clean(request.request_id),offering_id:offeringId,qty,unit_price:unitPrice,method,created_at:now});
    return [sourceSpec(resourceId,'inventory_items',snapshot.data.inventory_items),sourceSpec(resourceId,'sales',sales)];
  }
  if(action==='MATCH_RESULT'){
    const series=clean(payload.series),home=int(payload.home,'home'),away=int(payload.away,'away');if(!series) throw new Error('series required');
    const prior=Array.isArray(event.data.sport_results)?clone(event.data.sport_results):[],next=prior.filter(x=>x.series!==series);next.push({series,home,away,recorded_at:now});
    return [sourceSpec(eventId,'sport_results',next)];
  }
  if(action==='BINGO_CONFIRM_PERMIT'){const ref=clean(payload.reference);if(!ref) throw new Error('permit reference required');return [sourceSpec(eventId,'permit_confirmed',true),sourceSpec(eventId,'permit_ref',ref)];}
  if(action==='BINGO_DONATE_PRIZE'){const name=clean(payload.name),reference=clean(payload.reference);if(!name||!reference) throw new Error('donated prize name and reference required');const prior=Array.isArray(event.data.donated_prizes)?clone(event.data.donated_prizes):[];prior.push({name,reference,source:'DONATED',recorded_at:now});return [sourceSpec(eventId,'donated_prizes',prior)];}
  if(action.endsWith('_CLOSE')) return [sourceSpec(eventId,'closed',true),sourceSpec(eventId,'closed_at',now)];
  throw new Error('action mapping missing '+action);
}

function buildGovernedChanges({state,request,now}){
  const specs=mapActionToSourceSpecs({state,request,now});
  const commandIds=[],changes=[];
  for(const spec of specs){
    const command=buildSourceChangeCommand({
      objects:state.objects,
      surface:'CUDO_WEB_EVENT_RESOURCE_QA',
      objectId:spec.objectId,
      field:spec.field,
      value:spec.value,
      requestedBy:clean(request.requested_by),
      reason:clean(request.reason),
      evidenceRefs:[clean(request.evidence_ref)]
    });
    if(command.route!=='TRANSACTION_LAYER_REQUIRED') throw new Error('source command bypassed transaction layer');
    commandIds.push(command.command_id);
    changes.push(...command.changes);
  }
  return {commandIds,changes};
}

export function buildEventResourceProjection(state){
  const project=(family)=>{
    const event=objectById(state.objects,EVENT_IDS[family]),resource=objectById(state.objects,RESOURCE_IDS[family]),obligation=objectById(state.objects,OBLIGATION_IDS[family]);
    const data=commerce(resource),purchaseTotal=data.purchases.reduce((s,x)=>s+Number(x.qty||0)*Number(x.unit_cost||0),0),salesRevenue=data.sales.reduce((s,x)=>s+Number(x.qty||0)*Number(x.unit_price||0),0),payable=Number(obligation.data.supplier_payable||0);
    const offerings=clone(data.offerings).map(o=>({...o,available_qty:maxSellable(resource,o.offering_id)}));
    return {
      event_id:event.object_id,kind:event.data.activity_kind,display_name:event.data.display_name,
      starts_at:event.data.starts_at||null,location:event.data.location||null,conditions:clone(event.data.conditions||{}),
      closed:Boolean(event.data.closed),closed_at:event.data.closed_at||null,
      permit_confirmed:Boolean(event.data.permit_confirmed),permit_ref:event.data.permit_ref||null,donated_prizes:clone(event.data.donated_prizes||[]),sport_results:clone(event.data.sport_results||[]),
      commerce:{object_id:resource.object_id,offerings,inventory_items:clone(data.inventory_items),purchases:clone(data.purchases),sales:clone(data.sales),purchase_total:purchaseTotal,sales_revenue:salesRevenue},
      resource:{object_id:resource.object_id,offerings_count:offerings.length,inventory_items_count:data.inventory_items.length,purchase_total:purchaseTotal,sales_revenue:salesRevenue},
      supplier_payable:{object_id:obligation.object_id,amount:payable},
      operational_resource_result_clp:salesRevenue-purchaseTotal
    };
  };
  return {schema_version:'CUDO_EVENT_RESOURCE_QA_READ_MODEL_V2',generated_at:state.generated_at,store_revision:state.store_revision,authority:'CANONICAL_GRAPH_READ_MODEL',commerce_model:'DYNAMIC_EVENT_OFFERINGS_RECIPE_AND_RESALE',MATCH:project('MATCH'),BINGO:project('BINGO'),audit_count:state.audit.length,production_write:false};
}

function auditEntry({request,status,now,details={}}){
  return {
    request_id:clean(request.request_id),
    requested_at:clean(request.requested_at)||now,
    applied_at:now,
    event_id:clean(request.event_id),
    action:clean(request.action).toUpperCase(),
    expected_revision:Number(request.expected_revision),
    requested_by:clean(request.requested_by).toLowerCase(),
    reason:clean(request.reason),
    evidence_ref:clean(request.evidence_ref),
    status,
    ...clone(details)
  };
}

export function processEventResourceRequests({requests,stateStore,registry=loadDependencyRegistry(),now=()=>new Date().toISOString()}){
  const state=clone(stateStore);
  const summary=[];
  const seen=new Set(state.audit.filter(x=>x.status==='APPLIED').map(x=>x.request_id));

  for(const raw of requests||[]){
    const request=clone(raw);
    const at=now();
    const requestId=clean(request.request_id);
    const requestedBy=clean(request.requested_by).toLowerCase();
    const reason=clean(request.reason);
    const evidenceRef=clean(request.evidence_ref);
    const expectedRevision=Number(request.expected_revision);

    if(!requestId||!ACTIONS.has(clean(request.action).toUpperCase())||!reason||!evidenceRef){
      const audit=auditEntry({request,status:'BLOCKED_INCOMPLETE',now:at});
      state.audit.push(audit);summary.push(audit);continue;
    }
    if(requestedBy!==ALLOWED_REQUESTER){
      const audit=auditEntry({request,status:'BLOCKED_REQUESTER',now:at});
      state.audit.push(audit);summary.push(audit);continue;
    }
    if(seen.has(requestId)){
      summary.push(auditEntry({request,status:'DUPLICATE_ALREADY_APPLIED',now:at}));
      continue;
    }
    if(!Number.isInteger(expectedRevision)||expectedRevision!==state.store_revision){
      const audit=auditEntry({request,status:'BLOCKED_REVISION_CONFLICT',now:at,details:{current_revision:state.store_revision}});
      state.audit.push(audit);summary.push(audit);continue;
    }

    try{
      const governed=buildGovernedChanges({state,request,now:at});
      const plan=buildTransactionPlan({
        objects:state.objects,
        registry,
        changes:governed.changes,
        activeConditions:state.active_conditions,
        requestedBy,
        reason,
        evidenceRefs:[evidenceRef],
        now:at
      });
      if(plan.status!=='READY') throw new Error('TRANSACTION_'+plan.status);
      const committed=commitTransaction({currentObjects:state.objects,plan,now:at});
      if(!committed.ok||committed.status!=='COMMITTED') throw new Error('COMMIT_'+committed.status);
      state.objects=committed.objects;
      state.store_revision+=1;
      state.generated_at=at;
      const audit=auditEntry({
        request,status:'APPLIED',now:at,
        details:{
          new_revision:state.store_revision,
          command_ids:governed.commandIds,
          transaction_id:plan.transaction_id,
          transition_ids:plan.transitions.map(x=>x.transition_id),
          transaction_fingerprint:transactionFingerprint(plan)
        }
      });
      state.audit.push(audit);
      seen.add(requestId);
      summary.push(audit);
    }catch(error){
      const audit=auditEntry({request,status:'BLOCKED_ENGINE',now:at,details:{error:error.message}});
      state.audit.push(audit);summary.push(audit);
    }
  }

  return {ok:true,state_store:state,projection:buildEventResourceProjection(state),summary,production_write:false};
}

export function saveEventResourceState({stateStore,projection,statePath=DEFAULT_STATE_PATH,projectionPath=DEFAULT_READ_MODEL_PATH}){
  fs.writeFileSync(statePath,JSON.stringify(stateStore,null,2)+'\n');
  fs.writeFileSync(projectionPath,JSON.stringify(projection,null,2)+'\n');
  return {statePath,projectionPath};
}


function rowsToObjects(values){
  if(!values.length) return [];
  const headers=values[0].map(clean);
  return values.slice(1).map((row,i)=>({__row:i+2,...Object.fromEntries(headers.map((h,j)=>[h,clean(row[j])]))}))
    .filter(row=>headers.some(h=>row[h]));
}
function assertHeaders(values,expected,label){
  if(!values.length) throw new Error(label+': missing headers');
  const actual=values[0].slice(0,expected.length).map(clean);
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(label+': unexpected contract '+actual.join('|'));
}
function requestStatusMutation(row,status,result,at){
  return {op:'update',kind:'REQUEST_STATUS',spreadsheetId:EVENT_RESOURCE_SHEET_ID,range:EVENT_REQUESTS_SHEET+'!J'+row+':L'+row,values:[[status,result,at]]};
}
function externalAuditRow(summary){
  return [
    summary.request_id,summary.event_id,summary.action,summary.status,summary.expected_revision,
    summary.new_revision??summary.current_revision??'',summary.requested_by,summary.reason,summary.evidence_ref,
    summary.transaction_id||'',Array.isArray(summary.transition_ids)?summary.transition_ids.join('|'):'',summary.applied_at
  ];
}
function controlRows(projection){
  const h=['EVENT_ID','KIND','DISPLAY_NAME','STORE_REVISION','CLOSED','OFFERINGS_JSON','INVENTORY_JSON','PURCHASE_TOTAL','SALES_REVENUE','SUPPLIER_PAYABLE','RESOURCE_RESULT','PERMIT_CONFIRMED','PRIZES_COUNT','SPORT_RESULTS_JSON','AUTHORITY','STARTS_AT','LOCATION','CONDITIONS_JSON'];
  return [h,...['MATCH','BINGO'].map(key=>{const e=projection[key];return [e.event_id,e.kind,e.display_name,projection.store_revision,e.closed?'TRUE':'FALSE',JSON.stringify(e.commerce.offerings),JSON.stringify(e.commerce.inventory_items),e.commerce.purchase_total,e.commerce.sales_revenue,e.supplier_payable.amount,e.operational_resource_result_clp,e.permit_confirmed?'TRUE':'FALSE',e.donated_prizes.length,JSON.stringify(e.sport_results),projection.authority,e.starts_at||'',e.location||'',JSON.stringify(e.conditions||{})];})];
}


export function planEventResourceSheetRequests({requestValues,stateStore,registry=loadDependencyRegistry(),now=()=>new Date().toISOString(),expectedPending=null}){
  assertHeaders(requestValues,EVENT_REQUEST_HEADERS,EVENT_REQUESTS_SHEET);
  const rows=rowsToObjects(requestValues).filter(x=>x.PROCESS_STATUS==='PENDING');
  if(expectedPending!==null&&rows.length!==expectedPending) throw new Error('EVENT_RESOURCE safety gate: pending '+rows.length+', expected '+expectedPending);
  let state=clone(stateStore);
  const summary=[],sheetMutations=[];
  for(const row of rows){
    let payload={};
    try{payload=row.PAYLOAD_JSON?JSON.parse(row.PAYLOAD_JSON):{};}
    catch(error){
      const at=now();
      const blocked={request_id:row.REQUEST_ID,event_id:row.EVENT_ID,action:row.ACTION,status:'BLOCKED_PAYLOAD_JSON',expected_revision:Number(row.EXPECTED_REVISION),requested_by:row.REQUESTED_BY,reason:row.REASON,evidence_ref:row.EVIDENCE_REF,applied_at:at,error:error.message};
      summary.push(blocked);
      sheetMutations.push(requestStatusMutation(row.__row,'BLOCKED','BLOCKED_PAYLOAD_JSON',at));
      sheetMutations.push({op:'append',kind:'EVENT_AUDIT',spreadsheetId:EVENT_RESOURCE_SHEET_ID,range:EVENT_AUDIT_SHEET+'!A:L',values:[externalAuditRow(blocked)]});
      continue;
    }
    const request={request_id:row.REQUEST_ID,requested_at:row.REQUESTED_AT,event_id:row.EVENT_ID,expected_revision:Number(row.EXPECTED_REVISION),action:row.ACTION,payload,requested_by:row.REQUESTED_BY,reason:row.REASON,evidence_ref:row.EVIDENCE_REF};
    const result=processEventResourceRequests({requests:[request],stateStore:state,registry,now});
    state=result.state_store;
    const item=result.summary[0];
    summary.push(item);
    const status=item.status==='APPLIED'?'APPLIED':item.status==='DUPLICATE_ALREADY_APPLIED'?'APPLIED':'BLOCKED';
    const resultText=item.status+(item.new_revision?' · revision '+item.new_revision:item.current_revision?' · current '+item.current_revision:'');
    sheetMutations.push(requestStatusMutation(row.__row,status,resultText,item.applied_at));
    sheetMutations.push({op:'append',kind:'EVENT_AUDIT',spreadsheetId:EVENT_RESOURCE_SHEET_ID,range:EVENT_AUDIT_SHEET+'!A:L',values:[externalAuditRow(item)]});
  }
  const projection=buildEventResourceProjection(state);
  sheetMutations.push({op:'replace',kind:'EVENT_CONTROL',spreadsheetId:EVENT_RESOURCE_SHEET_ID,range:EVENT_CONTROL_SHEET+'!A:R',values:controlRows(projection)});
  return {ok:true,pending_count:rows.length,summary,state_store:state,projection,sheet_mutations:sheetMutations,production_write:false};
}

async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function googleAccessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('EVENT_RESOURCE: Google OAuth incomplete');
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})
  });
  const data=await response.json();
  if(!response.ok||!data.access_token) throw new Error('EVENT_RESOURCE OAuth HTTP '+response.status);
  return data.access_token;
}
async function googleSheetAdapter(){
  const token=await googleAccessToken();
  const request=async(method,url,body)=>{
    let last;
    for(let i=0;i<5;i++){
      const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text();const data=text?JSON.parse(text):{};
      if(response.ok) return data;
      last={status:response.status,data};
      if(![429,500,502,503,504].includes(response.status)||i===4) break;
      await sleep(700*(2**i));
    }
    throw new Error('EVENT_RESOURCE Sheets HTTP '+(last?.status||'unknown')+': '+(last?.data?.error?.message||'unknown'));
  };
  return {
    readValues:async(id,range)=>(await request('GET','https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent(range)+'?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE')).values||[],
    updateValues:async(id,range,values)=>request('PUT','https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent(range)+'?valueInputOption=USER_ENTERED',{range,majorDimension:'ROWS',values}),
    appendValues:async(id,range,values)=>request('POST','https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent(range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',{range,majorDimension:'ROWS',values}),
    clearValues:async(id,range)=>request('POST','https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+encodeURIComponent(range)+':clear',{})
  };
}

export async function applyEventResourceSheetRequests({statePath=DEFAULT_STATE_PATH,projectionPath=DEFAULT_READ_MODEL_PATH,expectedPending=null}={}){
  const adapter=await googleSheetAdapter();
  const requestValues=await adapter.readValues(EVENT_RESOURCE_SHEET_ID,EVENT_REQUESTS_SHEET+'!A:L');
  const plan=planEventResourceSheetRequests({requestValues,stateStore:loadEventResourceState(statePath),expectedPending});
  for(const mutation of plan.sheet_mutations){
    if(mutation.op==='update') await adapter.updateValues(mutation.spreadsheetId,mutation.range,mutation.values);
    else if(mutation.op==='append') await adapter.appendValues(mutation.spreadsheetId,mutation.range,mutation.values);
    else if(mutation.op==='replace'){
      await adapter.clearValues(mutation.spreadsheetId,mutation.range);
      await adapter.updateValues(mutation.spreadsheetId,mutation.range,mutation.values);
    }
  }
  saveEventResourceState({stateStore:plan.state_store,projection:plan.projection,statePath,projectionPath});
  return {...plan,writes_applied:plan.sheet_mutations.length};
}

if(import.meta.url==='file://'+process.argv[1]){
  if(process.env.CUDO_EVENT_RESOURCE_APPLY_GOOGLE==='true'){
    const raw=process.env.CUDO_EVENT_RESOURCE_EXPECT_PENDING;
    const expectedPending=raw===undefined||raw===''?null:Number(raw);
    if(expectedPending!==null&&!Number.isInteger(expectedPending)) throw new Error('CUDO_EVENT_RESOURCE_EXPECT_PENDING must be integer');
    applyEventResourceSheetRequests({expectedPending}).then(result=>{
      console.log(JSON.stringify({ok:result.ok,pending_count:result.pending_count,summary:result.summary,writes_applied:result.writes_applied,store_revision:result.state_store.store_revision,production_write:false},null,2));
    }).catch(error=>{console.error(error.stack||error);process.exit(1);});
  }else{
    const requestFile=process.argv[2];
    if(!requestFile) throw new Error('usage: node process_event_resource_requests.mjs requests.json');
    const requests=JSON.parse(fs.readFileSync(requestFile,'utf8'));
    const result=processEventResourceRequests({requests,stateStore:loadEventResourceState()});
    saveEventResourceState({stateStore:result.state_store,projection:result.projection});
    console.log(JSON.stringify({ok:result.ok,summary:result.summary,store_revision:result.state_store.store_revision,production_write:false},null,2));
  }
}
