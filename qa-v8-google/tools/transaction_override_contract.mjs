import crypto from 'node:crypto';
import {planPropagation,stateFingerprint} from './generic_propagation_executor.mjs';

function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function makeId(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}
function objectMap(objects){return new Map(objects.map(x=>[x.object_id,x]));}
function affectedIds(transitions){return [...new Set(transitions.map(x=>x.object_id))].sort();}

export function buildTransactionPlan({
  objects,
  registry,
  changes,
  activeConditions=[],
  requestedBy,
  reason,
  evidenceRefs=[],
  now='2026-09-18T13:00:00.000Z'
}){
  if(!requestedBy) throw new Error('transaction requires requestedBy');
  if(!reason) throw new Error('transaction requires reason');
  if(!Array.isArray(evidenceRefs)||evidenceRefs.length===0) throw new Error('transaction requires evidenceRefs');

  const before=clone(objects);
  const beforeMap=objectMap(before);
  const propagation=planPropagation({objects:before,registry,changes,activeConditions,now});
  const base={
    schema_version:'CUDO_TRANSACTION_PLAN_V1',
    requested_by:requestedBy,
    reason,
    evidence_refs:[...evidenceRefs],
    created_at:now,
    production_write:false
  };
  if(!propagation.ok||propagation.dirty_remaining.length){
    return {
      ...base,
      transaction_id:makeId('CUDO-TXN',{requestedBy,reason,changes,now}),
      status:'BLOCKED',
      block_reason:'PROPAGATION_NOT_CLEAN',
      propagation_failures:clone(propagation.failures),
      dirty_remaining:clone(propagation.dirty_remaining),
      preconditions:[],
      transitions:[],
      proposed_objects:before
    };
  }

  const ids=affectedIds(propagation.transitions);
  const preconditions=ids.map(id=>{
    const object=beforeMap.get(id);
    return {
      object_id:id,
      expected_object_version:object.object_version,
      expected_object_fingerprint:stateFingerprint([object])
    };
  });
  const proposedMap=objectMap(propagation.objects);
  const proposedObjects=ids.map(id=>clone(proposedMap.get(id)));
  const transactionId=makeId('CUDO-TXN',{
    requestedBy,reason,evidenceRefs,changes,
    transitions:propagation.transitions.map(x=>x.transition_id)
  });
  return {
    ...base,
    transaction_id:transactionId,
    status:'READY',
    preconditions,
    transitions:clone(propagation.transitions),
    proposed_objects:proposedObjects,
    propagation_metrics:clone(propagation.metrics)
  };
}

export function commitTransaction({currentObjects,plan,now='2026-09-18T13:01:00.000Z'}){
  const current=clone(currentObjects);
  const currentMap=objectMap(current);
  if(plan.status!=='READY'){
    return {ok:false,status:'BLOCKED',reason:'PLAN_NOT_READY',objects:current,production_write:false};
  }

  const conflicts=[];
  for(const pre of plan.preconditions){
    const object=currentMap.get(pre.object_id);
    if(!object){
      conflicts.push({object_id:pre.object_id,reason:'OBJECT_MISSING'});
      continue;
    }
    if(object.object_version!==pre.expected_object_version){
      conflicts.push({
        object_id:pre.object_id,
        reason:'VERSION_MISMATCH',
        expected:pre.expected_object_version,
        actual:object.object_version
      });
      continue;
    }
    const fp=stateFingerprint([object]);
    if(fp!==pre.expected_object_fingerprint){
      conflicts.push({object_id:pre.object_id,reason:'FINGERPRINT_MISMATCH'});
    }
  }
  if(conflicts.length){
    return {
      ok:false,
      status:'CONFLICT',
      transaction_id:plan.transaction_id,
      conflicts,
      objects:current,
      committed_at:null,
      production_write:false
    };
  }

  const proposedMap=objectMap(plan.proposed_objects);
  const committed=current.map(object=>proposedMap.has(object.object_id)?clone(proposedMap.get(object.object_id)):object);
  return {
    ok:true,
    status:'COMMITTED',
    transaction_id:plan.transaction_id,
    committed_at:now,
    objects:committed,
    audit:{
      requested_by:plan.requested_by,
      reason:plan.reason,
      evidence_refs:clone(plan.evidence_refs),
      transition_ids:plan.transitions.map(x=>x.transition_id)
    },
    production_write:false
  };
}

export function buildCompensationPlan({transactionPlan,appliedTransitionIds,reason,requestedBy,now='2026-09-18T13:02:00.000Z'}){
  if(!requestedBy||!reason) throw new Error('compensation requires requestedBy and reason');
  const applied=new Set(appliedTransitionIds||[]);
  const selected=transactionPlan.transitions.filter(x=>applied.has(x.transition_id));
  const reversals=[...selected].reverse().map(transition=>({
    compensation_for_transition_id:transition.transition_id,
    object_id:transition.object_id,
    field:transition.field,
    from_value:clone(transition.new_value),
    to_value:clone(transition.old_value),
    rule_id:transition.rule_id,
    cause_transition_id:transition.cause_transition_id
  }));
  return {
    schema_version:'CUDO_COMPENSATION_PLAN_V1',
    compensation_id:makeId('CUDO-COMP',{transaction_id:transactionPlan.transaction_id,appliedTransitionIds,reason,requestedBy}),
    transaction_id:transactionPlan.transaction_id,
    requested_by:requestedBy,
    reason,
    created_at:now,
    execution_mode:'MANUAL_OR_ADAPTER_COORDINATED',
    automatic_external_execution:false,
    reversals,
    production_write:false
  };
}

function findObject(objects,objectId){
  const object=objects.find(x=>x.object_id===objectId);
  if(!object) throw new Error(`override target object not found: ${objectId}`);
  return object;
}

export function createOverrideRequest({
  objects,
  objectId,
  field,
  requestedValue,
  requestedBy,
  reason,
  evidenceRefs,
  now='2026-09-18T13:03:00.000Z',
  expiresAt=null
}){
  if(!requestedBy) throw new Error('override requires requestedBy');
  if(!reason) throw new Error('override requires reason');
  if(!Array.isArray(evidenceRefs)||evidenceRefs.length===0) throw new Error('override requires evidenceRefs');
  const object=findObject(objects,objectId);
  if(!Object.hasOwn(object.data||{},field)) throw new Error(`override target field missing: ${objectId}.${field}`);
  const semantic=object.field_semantics?.[field];
  if(!semantic||semantic.state_kind!=='DERIVED') throw new Error('override is allowed only on DERIVED fields; SOURCE corrections use a normal transaction');
  if(expiresAt!==null&&!Number.isFinite(Date.parse(expiresAt))) throw new Error('override expiresAt invalid');

  const payload={objectId,field,requestedValue,requestedBy,reason,evidenceRefs,created_at:now,expires_at:expiresAt};
  return {
    schema_version:'CUDO_OVERRIDE_REQUEST_V1',
    override_id:makeId('CUDO-OVR',payload),
    target:{object_id:objectId,field},
    canonical_value_at_request:clone(object.data[field]),
    requested_value:clone(requestedValue),
    requested_by:requestedBy,
    reason,
    evidence_refs:[...evidenceRefs],
    created_at:now,
    expires_at:expiresAt,
    state:'PENDING_APPROVAL',
    approved_by:null,
    approved_at:null,
    revoked_by:null,
    revoked_at:null
  };
}

export function approveOverride(request,{approvedBy,now='2026-09-18T13:04:00.000Z'}){
  if(request.state!=='PENDING_APPROVAL') throw new Error('override is not pending approval');
  if(!approvedBy) throw new Error('override approval requires approvedBy');
  return {...clone(request),state:'ACTIVE',approved_by:approvedBy,approved_at:now};
}
export function rejectOverride(request,{approvedBy,now='2026-09-18T13:04:00.000Z'}){
  if(request.state!=='PENDING_APPROVAL') throw new Error('override is not pending approval');
  if(!approvedBy) throw new Error('override rejection requires approvedBy');
  return {...clone(request),state:'REJECTED',approved_by:approvedBy,approved_at:now};
}
export function revokeOverride(request,{revokedBy,now='2026-09-18T13:05:00.000Z'}){
  if(request.state!=='ACTIVE') throw new Error('only ACTIVE override can be revoked');
  if(!revokedBy) throw new Error('override revocation requires revokedBy');
  return {...clone(request),state:'REVOKED',revoked_by:revokedBy,revoked_at:now};
}
function overrideStateAt(override,at){
  if(override.state!=='ACTIVE') return override.state;
  if(override.expires_at&&Date.parse(at)>=Date.parse(override.expires_at)) return 'EXPIRED';
  return 'ACTIVE';
}
export function effectiveValue({objects,overrides,objectId,field,at='2026-09-18T13:06:00.000Z'}){
  const object=findObject(objects,objectId);
  const applicable=(overrides||[]).filter(override=>
    override.target.object_id===objectId&&
    override.target.field===field&&
    overrideStateAt(override,at)==='ACTIVE'
  );
  if(applicable.length>1) throw new Error(`ambiguous active overrides for ${objectId}.${field}`);
  if(applicable.length===1){
    return {
      value:clone(applicable[0].requested_value),
      source:'HUMAN_OVERRIDE',
      override_id:applicable[0].override_id,
      canonical_value:clone(object.data[field])
    };
  }
  return {value:clone(object.data[field]),source:'CANONICAL',override_id:null,canonical_value:clone(object.data[field])};
}

export function transactionFingerprint(value){return digest(value);}
