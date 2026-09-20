import assert from 'node:assert/strict';
import {createGoalCommitment,deriveNumericGap} from './goal_gap_contract.mjs';
import {createAttentionSignal} from './attention_signal_contract.mjs';
import {createArbitrationConstraint,resolvePartialOrder} from './causal_partial_order_arbitration.mjs';
import {recordContextualArbitrationDecision} from './contextual_human_arbitration_decision.mjs';
import {arbitrationDecisionToObservation} from './arbitration_decision_feedback.mjs';
import {recordDecisionOutcomeObservation,recalibrateNumericGoalGapFromOutcome} from './decision_outcome_recalibration.mjs';

function observedState(value){
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:'CUDO-OBS-STATE-E2E-001',
    object_type:'OBSERVATION',
    object_version:1,
    lifecycle_state:'OBSERVED',
    data:{current_value:value},
    field_semantics:{current_value:{state_kind:'SOURCE',source_refs:['fixture://adaptive-e2e/state']}},
    relationships:[],
    provenance:{
      created_at:'2026-09-20T02:20:00.000Z',
      updated_at:null,
      source_system:'CUDO_SYNTHETIC_QA',
      source_refs:['fixture://adaptive-e2e/state']
    },
    legacy_refs:[]
  };
}

const state=observedState(500000);
const stateBefore=JSON.stringify(state);

const goal=createGoalCommitment({
  subjectObjectId:'CUDO-ACTION-GENERATE-RESOURCE',
  metricKey:'available_resource',
  comparator:'AT_LEAST',
  targetValue:1500000,
  unit:'CLP',
  declaredBy:'directiva@cudo.cl',
  reason:'Meta sintética declarada para probar el ciclo adaptativo.',
  sourceRefs:['fixture://adaptive-e2e/goal']
});

const gap1=deriveNumericGap({goal,observation:state});
assert.equal(gap1.data.gap_value,1000000);

const attention=createAttentionSignal({
  subjectObjectId:gap1.object_id,
  signalCode:'RESOURCE_GAP_REQUIRES_ATTENTION',
  explanation:'Existe una brecha medida entre recurso disponible y objetivo declarado.',
  sourceRefs:['fixture://adaptive-e2e/gap-attention'],
  observedAt:'2026-09-20T02:21:00.000Z'
});
assert.equal(attention.object_type,'ATTENTION_SIGNAL');
assert.ok(!Object.hasOwn(attention.data,'priority_score'));

const APPLY='CUDO-ACTION-PREPARE-GRANT';
const DECIDE='CUDO-ACTION-EXTERNAL-GRANT-DECISION';
const BINGO='CUDO-ACTION-PREPARE-BINGO';
const constraint=createArbitrationConstraint({
  predecessorId:APPLY,
  successorId:DECIDE,
  constraintCode:'EXTERNAL_DECISION_REQUIRES_APPLICATION_DONE',
  explanation:'La decisión externa depende de una solicitud completada.',
  sourceRefs:['arke://CUDO_EXTERNAL_GRANT_FUNDING_DISCOVERY_v1']
});
const order=resolvePartialOrder({candidateIds:[APPLY,DECIDE,BINGO],constraints:[constraint]});
assert.equal(order.ok,true);
assert.deepEqual([...order.executable_now].sort(),[APPLY,BINGO].sort());
assert.ok(order.incomparable_pairs.some(([a,b])=>a===APPLY&&b===BINGO)||order.incomparable_pairs.some(([a,b])=>a===BINGO&&b===APPLY));
assert.equal(order.total_order_claimed,false);

const decision=recordContextualArbitrationDecision({
  candidateIds:order.executable_now,
  chosenIds:[APPLY],
  decidedBy:'directiva@cudo.cl',
  reason:'Decisión sintética contextual para ejecutar primero la solicitud de financiamiento.',
  sourceRefs:['fixture://adaptive-e2e/human-decision'],
  scopeRef:'CUDO-ADAPTIVE-E2E-CYCLE-001',
  decidedAt:'2026-09-20T02:22:00.000Z'
});
assert.equal(decision.data.creates_global_priority_policy,false);

const decisionObservation=arbitrationDecisionToObservation({
  decision,
  observedAt:'2026-09-20T02:23:00.000Z'
});
assert.equal(decisionObservation.object_type,'OBSERVATION');
assert.equal(decisionObservation.data.observation_kind,'HUMAN_ARBITRATION_DECISION');
assert.ok(!Object.hasOwn(decisionObservation.data,'pattern_id'));

const outcome=recordDecisionOutcomeObservation({
  decision,
  subjectObjectId:APPLY,
  metricKey:'available_resource',
  currentValue:900000,
  unit:'CLP',
  outcomeCode:'MEASURED_POST_ACTION_RESOURCE_STATE',
  summary:'La medición posterior muestra CLP 900000 disponibles.',
  sourceRefs:['fixture://adaptive-e2e/outcome'],
  observedAt:'2026-09-20T02:24:00.000Z'
});

const recalibrated=recalibrateNumericGoalGapFromOutcome({
  goal,
  outcome,
  now:'2026-09-20T02:25:00.000Z'
});
assert.equal(recalibrated.feedback.gap_value,600000);
assert.equal(gap1.data.gap_value,1000000,'historical gap must remain unchanged');
assert.equal(JSON.stringify(state),stateBefore,'original state observation must remain immutable');
assert.equal(recalibrated.feedback.goal_changed,false);
assert.equal(recalibrated.feedback.automatic_priority_change,false);
assert.equal(recalibrated.feedback.automatic_rule_promotion,false);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_MINIMUM_ADAPTIVE_LOOP_E2E_V1',
  initial_state:500000,
  target:1500000,
  initial_gap:gap1.data.gap_value,
  executable_before_human_choice:order.executable_now,
  chosen_action:APPLY,
  measured_outcome:900000,
  recalibrated_gap:recalibrated.feedback.gap_value,
  historical_evidence_immutable:true,
  global_priority_score:false,
  global_policy_created:false,
  automatic_rule_promotion:false,
  production_write:false
},null,2));
