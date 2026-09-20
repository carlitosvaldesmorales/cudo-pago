import crypto from 'node:crypto';

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function makeId(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}

export function arbitrationDecisionToObservation({
  decision,
  observedAt='2026-09-20T01:55:00.000Z'
}){
  if(!decision||decision.object_type!=='RULE_DECISION') throw new Error('feedback requires RULE_DECISION');
  if(decision.data?.decision_kind!=='CONTEXTUAL_ARBITRATION') throw new Error('feedback requires CONTEXTUAL_ARBITRATION decision');
  if(!decision.provenance?.source_refs?.length) throw new Error('decision provenance required');

  const considered=decision.relationships?.filter(x=>x.relationship_type==='CONSIDERS').map(x=>x.target_object_id).sort()||[];
  const selected=decision.relationships?.filter(x=>x.relationship_type==='SELECTS_FOR_CURRENT_ATTENTION').map(x=>x.target_object_id).sort()||[];
  if(considered.length<2||selected.length<1) throw new Error('decision relationships incomplete');

  const objectId=makeId('CUDO-OBS-ARBITRATION',{
    decision_id:decision.object_id,
    observedAt
  });
  const sourceRefs=[decision.object_id,...decision.provenance.source_refs];

  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:objectId,
    object_type:'OBSERVATION',
    object_version:1,
    lifecycle_state:'OBSERVED',
    data:{
      observation_state:'OBSERVED',
      observation_kind:'HUMAN_ARBITRATION_DECISION',
      scope_ref:decision.data.scope_ref,
      considered_candidate_ids:considered,
      selected_candidate_ids:selected,
      decision_reason:decision.data.reason,
      decided_by:decision.data.decided_by,
      decision_creates_global_priority_policy:false
    },
    field_semantics:{
      observation_state:{state_kind:'SOURCE',source_refs:sourceRefs},
      observation_kind:{state_kind:'SOURCE',source_refs:sourceRefs},
      scope_ref:{state_kind:'SOURCE',source_refs:sourceRefs},
      considered_candidate_ids:{state_kind:'SOURCE',source_refs:sourceRefs},
      selected_candidate_ids:{state_kind:'SOURCE',source_refs:sourceRefs},
      decision_reason:{state_kind:'SOURCE',source_refs:sourceRefs},
      decided_by:{state_kind:'SOURCE',source_refs:sourceRefs},
      decision_creates_global_priority_policy:{state_kind:'SOURCE',source_refs:sourceRefs}
    },
    relationships:[{
      relationship_id:makeId('REL-OBS-DECISION',{objectId,decision_id:decision.object_id}),
      relationship_type:'OBSERVES_DECISION',
      target_object_id:decision.object_id
    }],
    provenance:{
      created_at:observedAt,
      updated_at:null,
      source_system:'CUDO_FEEDBACK_LOOP',
      source_refs:sourceRefs
    },
    legacy_refs:[]
  };
}
