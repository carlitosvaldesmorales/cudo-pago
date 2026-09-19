import crypto from 'node:crypto';

function clone(v){return JSON.parse(JSON.stringify(v));}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function id(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}
function numeric(v,name){
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error(`${name} must be numeric`);
  return n;
}

export function createGoalCommitment({
  subjectObjectId,
  metricKey,
  comparator,
  targetValue,
  unit=null,
  declaredBy,
  reason,
  sourceRefs,
  now='2026-09-19T22:50:00.000Z'
}){
  if(!subjectObjectId) throw new Error('goal requires subjectObjectId');
  if(!metricKey) throw new Error('goal requires metricKey');
  if(!['AT_LEAST','AT_MOST','EQUAL'].includes(comparator)) throw new Error('unsupported comparator');
  const target=numeric(targetValue,'targetValue');
  if(!declaredBy) throw new Error('goal requires declaredBy');
  if(!reason) throw new Error('goal requires reason');
  if(!Array.isArray(sourceRefs)||sourceRefs.length===0) throw new Error('goal requires sourceRefs');

  const goalId=id('CUDO-GOAL',{subjectObjectId,metricKey,comparator,target,unit,declaredBy,reason,sourceRefs});
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:goalId,
    object_type:'GOAL_COMMITMENT',
    object_version:1,
    lifecycle_state:'ACTIVE',
    data:{
      metric_key:metricKey,
      comparator,
      target_value:target,
      unit,
      declared_by:declaredBy,
      reason
    },
    field_semantics:{
      metric_key:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      comparator:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      target_value:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      unit:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      declared_by:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      reason:{state_kind:'SOURCE',source_refs:[...sourceRefs]}
    },
    relationships:[{
      relationship_id:id('REL-GOAL-SUBJECT',{goalId,subjectObjectId}),
      relationship_type:'TARGETS',
      target_object_id:subjectObjectId
    }],
    provenance:{
      created_at:now,
      updated_at:null,
      source_system:'CUDO_GOAL_DECLARATION',
      source_refs:[...sourceRefs]
    },
    legacy_refs:[]
  };
}

export function deriveNumericGap({
  goal,
  observation,
  observedField='current_value',
  now='2026-09-19T22:51:00.000Z'
}){
  if(!goal||goal.object_type!=='GOAL_COMMITMENT') throw new Error('gap derivation requires GOAL_COMMITMENT');
  if(!observation||observation.object_type!=='OBSERVATION') throw new Error('gap derivation requires OBSERVATION');
  if(!Object.hasOwn(observation.data||{},observedField)) throw new Error('observed field missing');

  const target=numeric(goal.data.target_value,'goal target');
  const observed=numeric(observation.data[observedField],'observed value');
  let amount;
  switch(goal.data.comparator){
    case 'AT_LEAST': amount=Math.max(0,target-observed); break;
    case 'AT_MOST': amount=Math.max(0,observed-target); break;
    case 'EQUAL': amount=Math.abs(target-observed); break;
    default: throw new Error('unsupported comparator');
  }

  const gapId=id('CUDO-GAP',{goal_id:goal.object_id,observation_id:observation.object_id,observed,target,comparator:goal.data.comparator});
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:gapId,
    object_type:'GAP',
    object_version:1,
    lifecycle_state:amount===0?'CLOSED':'OPEN',
    data:{
      metric_key:goal.data.metric_key,
      comparator:goal.data.comparator,
      observed_value:observed,
      target_value:target,
      gap_value:amount,
      unit:goal.data.unit
    },
    field_semantics:{
      metric_key:{state_kind:'DERIVED',rule_ids:['RULE_GOAL_GAP_NUMERIC_V1']},
      comparator:{state_kind:'DERIVED',rule_ids:['RULE_GOAL_GAP_NUMERIC_V1']},
      observed_value:{state_kind:'SOURCE',source_refs:[...observation.provenance.source_refs]},
      target_value:{state_kind:'SOURCE',source_refs:[...goal.provenance.source_refs]},
      gap_value:{state_kind:'DERIVED',rule_ids:['RULE_GOAL_GAP_NUMERIC_V1']},
      unit:{state_kind:'DERIVED',rule_ids:['RULE_GOAL_GAP_NUMERIC_V1']}
    },
    relationships:[
      {relationship_id:id('REL-GAP-GOAL',{gapId,goal:goal.object_id}),relationship_type:'DERIVED_FROM_GOAL',target_object_id:goal.object_id},
      {relationship_id:id('REL-GAP-OBS',{gapId,obs:observation.object_id}),relationship_type:'DERIVED_FROM_OBSERVATION',target_object_id:observation.object_id}
    ],
    provenance:{
      created_at:now,
      updated_at:null,
      source_system:'CUDO_GOAL_GAP_DERIVATION',
      source_refs:[goal.object_id,observation.object_id],
      transition_id:null
    },
    legacy_refs:[]
  };
}

export function gapValue({comparator,targetValue,observedValue}){
  const goal={object_type:'GOAL_COMMITMENT',data:{comparator,target_value:targetValue,metric_key:'generic',unit:null},provenance:{source_refs:['fixture://goal']}};
  const observation={object_type:'OBSERVATION',object_id:'CUDO-OBS-TEMP',data:{current_value:observedValue},provenance:{source_refs:['fixture://obs']}};
  return deriveNumericGap({goal:{...goal,object_id:'CUDO-GOAL-TEMP'},observation}).data.gap_value;
}
