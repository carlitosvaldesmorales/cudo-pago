import crypto from 'node:crypto';
import {deriveNumericGap} from './goal_gap_contract.mjs';

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function makeId(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}

export function recordDecisionOutcomeObservation({
  decision,
  subjectObjectId,
  metricKey,
  currentValue,
  unit=null,
  outcomeCode,
  summary,
  sourceRefs,
  observedAt='2026-09-20T02:05:00.000Z'
}){
  if(!decision||decision.object_type!=='RULE_DECISION') throw new Error('outcome requires RULE_DECISION');
  if(decision.data?.decision_kind!=='CONTEXTUAL_ARBITRATION') throw new Error('outcome requires CONTEXTUAL_ARBITRATION decision');
  const selected=decision.relationships?.filter(x=>x.relationship_type==='SELECTS_FOR_CURRENT_ATTENTION').map(x=>x.target_object_id)||[];
  if(!subjectObjectId||!selected.includes(subjectObjectId)) throw new Error('outcome subject must be selected by decision');
  if(!metricKey) throw new Error('outcome requires metricKey');
  const n=Number(currentValue);
  if(!Number.isFinite(n)) throw new Error('currentValue must be numeric');
  if(!outcomeCode||typeof outcomeCode!=='string') throw new Error('outcome requires outcomeCode');
  if(!summary||typeof summary!=='string') throw new Error('outcome requires summary');
  if(!Array.isArray(sourceRefs)||sourceRefs.length===0) throw new Error('outcome requires sourceRefs');

  const objectId=makeId('CUDO-OBS-OUTCOME',{decision_id:decision.object_id,subjectObjectId,metricKey,n,unit,outcomeCode,sourceRefs,observedAt});
  const refs=[decision.object_id,...sourceRefs];
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:objectId,
    object_type:'OBSERVATION',
    object_version:1,
    lifecycle_state:'OBSERVED',
    data:{
      observation_state:'OBSERVED',
      observation_kind:'DECISION_OUTCOME',
      metric_key:metricKey,
      current_value:n,
      unit,
      outcome_code:outcomeCode,
      summary
    },
    field_semantics:{
      observation_state:{state_kind:'SOURCE',source_refs:refs},
      observation_kind:{state_kind:'SOURCE',source_refs:refs},
      metric_key:{state_kind:'SOURCE',source_refs:refs},
      current_value:{state_kind:'SOURCE',source_refs:refs},
      unit:{state_kind:'SOURCE',source_refs:refs},
      outcome_code:{state_kind:'SOURCE',source_refs:refs},
      summary:{state_kind:'SOURCE',source_refs:refs}
    },
    relationships:[
      {relationship_id:makeId('REL-OUTCOME-DECISION',{objectId,decision:decision.object_id}),relationship_type:'OUTCOME_OF_DECISION',target_object_id:decision.object_id},
      {relationship_id:makeId('REL-OUTCOME-SUBJECT',{objectId,subjectObjectId}),relationship_type:'OUTCOME_ON',target_object_id:subjectObjectId}
    ],
    provenance:{
      created_at:observedAt,
      updated_at:null,
      source_system:'CUDO_FEEDBACK_LOOP',
      source_refs:refs
    },
    legacy_refs:[]
  };
}

export function recalibrateNumericGoalGapFromOutcome({goal,outcome,now='2026-09-20T02:06:00.000Z'}){
  if(!goal||goal.object_type!=='GOAL_COMMITMENT') throw new Error('recalibration requires GOAL_COMMITMENT');
  if(!outcome||outcome.object_type!=='OBSERVATION'||outcome.data?.observation_kind!=='DECISION_OUTCOME') throw new Error('recalibration requires DECISION_OUTCOME observation');
  if(goal.data.metric_key!==outcome.data.metric_key) throw new Error('goal/outcome metric mismatch');
  const gap=deriveNumericGap({goal,observation:outcome,observedField:'current_value',now});
  return {
    gap,
    feedback:{
      goal_id:goal.object_id,
      outcome_observation_id:outcome.object_id,
      observed_value:outcome.data.current_value,
      target_value:goal.data.target_value,
      gap_value:gap.data.gap_value,
      goal_changed:false,
      automatic_priority_change:false,
      automatic_rule_promotion:false
    },
    production_write:false
  };
}
