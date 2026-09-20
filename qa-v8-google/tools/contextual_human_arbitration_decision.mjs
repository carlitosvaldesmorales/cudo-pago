import crypto from 'node:crypto';

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function makeId(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}

export function recordContextualArbitrationDecision({
  candidateIds,
  chosenIds,
  decidedBy,
  reason,
  sourceRefs,
  scopeRef,
  validUntil=null,
  decidedAt='2026-09-20T01:45:00.000Z'
}){
  if(!Array.isArray(candidateIds)||candidateIds.length<2) throw new Error('contextual arbitration requires at least two candidates');
  const candidates=[...new Set(candidateIds)];
  if(candidates.length!==candidateIds.length) throw new Error('duplicate candidates are not allowed');
  if(!Array.isArray(chosenIds)||chosenIds.length<1) throw new Error('contextual arbitration requires at least one chosen candidate');
  const chosen=[...new Set(chosenIds)];
  if(chosen.length!==chosenIds.length) throw new Error('duplicate chosen candidates are not allowed');
  const candidateSet=new Set(candidates);
  for(const id of chosen) if(!candidateSet.has(id)) throw new Error('chosen candidate must belong to candidate set');
  if(!decidedBy) throw new Error('contextual arbitration requires decidedBy');
  if(!reason) throw new Error('contextual arbitration requires reason');
  if(!Array.isArray(sourceRefs)||sourceRefs.length===0) throw new Error('contextual arbitration requires sourceRefs');
  if(!scopeRef) throw new Error('contextual arbitration requires scopeRef');
  if(validUntil!==null&&!Number.isFinite(Date.parse(validUntil))) throw new Error('validUntil invalid');

  const objectId=makeId('CUDO-DECISION-ARBITRATION',{candidates,chosen,decidedBy,reason,sourceRefs,scopeRef,validUntil,decidedAt});
  const relationships=[];
  for(const id of candidates){
    relationships.push({
      relationship_id:makeId('REL-DECISION-CONSIDERS',{objectId,id}),
      relationship_type:'CONSIDERS',
      target_object_id:id
    });
  }
  for(const id of chosen){
    relationships.push({
      relationship_id:makeId('REL-DECISION-SELECTS',{objectId,id}),
      relationship_type:'SELECTS_FOR_CURRENT_ATTENTION',
      target_object_id:id
    });
  }

  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:objectId,
    object_type:'RULE_DECISION',
    object_version:1,
    lifecycle_state:'ACTIVE',
    data:{
      decision_kind:'CONTEXTUAL_ARBITRATION',
      scope_kind:'ONE_DECISION_INSTANCE',
      scope_ref:scopeRef,
      candidate_count:candidates.length,
      chosen_count:chosen.length,
      decided_by:decidedBy,
      reason,
      decided_at:decidedAt,
      valid_until:validUntil,
      creates_global_priority_policy:false
    },
    field_semantics:{
      decision_kind:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      scope_kind:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      scope_ref:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      candidate_count:{state_kind:'DERIVED',rule_ids:['RULE_CONTEXTUAL_ARBITRATION_COUNTS_V1']},
      chosen_count:{state_kind:'DERIVED',rule_ids:['RULE_CONTEXTUAL_ARBITRATION_COUNTS_V1']},
      decided_by:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      reason:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      decided_at:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      valid_until:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      creates_global_priority_policy:{state_kind:'SOURCE',source_refs:[...sourceRefs]}
    },
    relationships,
    provenance:{
      created_at:decidedAt,
      updated_at:null,
      source_system:'CUDO_HUMAN_GOVERNANCE',
      source_refs:[...sourceRefs]
    },
    legacy_refs:[]
  };
}
