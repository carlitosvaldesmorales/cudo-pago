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

export const EVENT_IDS={MATCH:'CUDO-EVENT-QA-MATCH-FULLDAY-001',BINGO:'CUDO-EVENT-QA-BINGO-FULLDAY-001'};
export const RESOURCE_IDS={MATCH:'CUDO-RESOURCE-QA-MATCH-BEV-001',BINGO:'CUDO-RESOURCE-QA-BINGO-BEV-001'};
export const OBLIGATION_IDS={MATCH:'CUDO-OBL-QA-MATCH-SUP-001',BINGO:'CUDO-OBL-QA-BINGO-SUP-001'};

const ACTIONS=new Set([
  'MATCH_PURCHASE','MATCH_SALE','MATCH_RESULT','MATCH_CLOSE',
  'BINGO_CONFIRM_PERMIT','BINGO_DONATE_PRIZE','BINGO_PURCHASE','BINGO_SALE','BINGO_CLOSE'
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
  const family=actionFamily(action);
  const expectedEventId=EVENT_IDS[family];
  const eventId=clean(request.event_id)||expectedEventId;
  if(eventId!==expectedEventId) throw new Error('event/action mismatch '+eventId+' '+action);
  const resourceId=RESOURCE_IDS[family];
  const event=objectById(state.objects,eventId);
  const resource=objectById(state.objects,resourceId);
  const payload=payloadOf(request);

  if(action.endsWith('_PURCHASE')){
    const qty=positive(payload.qty,'qty');
    const unitCost=positive(payload.unit_cost,'unit_cost');
    return [
      sourceSpec(resourceId,'purchased_qty',Number(resource.data.purchased_qty)+qty),
      sourceSpec(resourceId,'received_qty',Number(resource.data.received_qty)+qty),
      sourceSpec(resourceId,'stock_available_before_sales',Number(resource.data.stock_available_before_sales)+qty),
      sourceSpec(resourceId,'unit_cost',unitCost)
    ];
  }
  if(action.endsWith('_SALE')){
    const qty=positive(payload.qty,'qty');
    const unitPrice=positive(payload.unit_price,'unit_price');
    if(Number(resource.data.stock_after_sales)<qty) throw new Error('INSUFFICIENT_STOCK');
    return [
      sourceSpec(resourceId,'sold_qty',Number(resource.data.sold_qty)+qty),
      sourceSpec(resourceId,'sell_price',unitPrice)
    ];
  }
  if(action==='MATCH_RESULT'){
    const series=clean(payload.series);
    const home=int(payload.home,'home');
    const away=int(payload.away,'away');
    if(!series) throw new Error('series required');
    const prior=Array.isArray(event.data.sport_results)?clone(event.data.sport_results):[];
    const next=prior.filter(x=>x.series!==series);
    next.push({series,home,away,recorded_at:now});
    return [sourceSpec(eventId,'sport_results',next)];
  }
  if(action==='BINGO_CONFIRM_PERMIT'){
    const ref=clean(payload.reference);
    if(!ref) throw new Error('permit reference required');
    return [sourceSpec(eventId,'permit_confirmed',true),sourceSpec(eventId,'permit_ref',ref)];
  }
  if(action==='BINGO_DONATE_PRIZE'){
    const name=clean(payload.name),reference=clean(payload.reference);
    if(!name||!reference) throw new Error('donated prize name and reference required');
    const prior=Array.isArray(event.data.donated_prizes)?clone(event.data.donated_prizes):[];
    prior.push({name,reference,source:'DONATED',recorded_at:now});
    return [sourceSpec(eventId,'donated_prizes',prior)];
  }
  if(action.endsWith('_CLOSE')){
    return [sourceSpec(eventId,'closed',true),sourceSpec(eventId,'closed_at',now)];
  }
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
    const event=objectById(state.objects,EVENT_IDS[family]);
    const resource=objectById(state.objects,RESOURCE_IDS[family]);
    const obligation=objectById(state.objects,OBLIGATION_IDS[family]);
    const sales=Number(event.data.sales_revenue||0);
    const payable=Number(obligation.data.supplier_payable||0);
    return {
      event_id:event.object_id,
      kind:event.data.activity_kind,
      display_name:event.data.display_name,
      closed:Boolean(event.data.closed),
      closed_at:event.data.closed_at||null,
      permit_confirmed:Boolean(event.data.permit_confirmed),
      permit_ref:event.data.permit_ref||null,
      donated_prizes:clone(event.data.donated_prizes||[]),
      sport_results:clone(event.data.sport_results||[]),
      resource:{
        object_id:resource.object_id,
        opening_stock:Number(resource.data.opening_stock||0),
        purchased_qty:Number(resource.data.purchased_qty||0),
        purchase_total:Number(resource.data.purchase_total||0),
        sold_qty:Number(resource.data.sold_qty||0),
        stock_after_sales:Number(resource.data.stock_after_sales||0),
        sales_revenue:sales,
        unit_cost:Number(resource.data.unit_cost||0),
        sell_price:Number(resource.data.sell_price||0)
      },
      supplier_payable:{
        object_id:obligation.object_id,
        payable_qty:Number(obligation.data.payable_qty||0),
        amount:payable
      },
      operational_resource_result_clp:sales-payable
    };
  };
  return {
    schema_version:'CUDO_EVENT_RESOURCE_QA_READ_MODEL_V1',
    generated_at:state.generated_at,
    store_revision:state.store_revision,
    authority:'CANONICAL_GRAPH_READ_MODEL',
    MATCH:project('MATCH'),
    BINGO:project('BINGO'),
    audit_count:state.audit.length,
    production_write:false
  };
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

if(import.meta.url==='file://'+process.argv[1]){
  const requestFile=process.argv[2];
  if(!requestFile) throw new Error('usage: node process_event_resource_requests.mjs requests.json');
  const requests=JSON.parse(fs.readFileSync(requestFile,'utf8'));
  const result=processEventResourceRequests({requests,stateStore:loadEventResourceState()});
  saveEventResourceState({stateStore:result.state_store,projection:result.projection});
  console.log(JSON.stringify({ok:result.ok,summary:result.summary,store_revision:result.state_store.store_revision,production_write:false},null,2));
}
