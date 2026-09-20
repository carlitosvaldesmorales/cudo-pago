import assert from 'node:assert/strict';
import {recordContextualArbitrationDecision} from './contextual_human_arbitration_decision.mjs';
import {createGoalCommitment,deriveNumericGap} from './goal_gap_contract.mjs';
import {recordDecisionOutcomeObservation,recalibrateNumericGoalGapFromOutcome} from './decision_outcome_recalibration.mjs';

const action='CUDO-ACTION-FINANCIAMIENTO';
const decision=recordContextualArbitrationDecision({
  candidateIds:[action,'CUDO-ACTION-CANCHA'],
  chosenIds:[action],
  decidedBy:'directiva@cudo.cl',
  reason:'Atender financiamiento en este contexto sintético.',
  sourceRefs:['fixture://decision-outcome/decision'],
  scopeRef:'CUDO-SCOPE-OUTCOME-001'
});

const goal=createGoalCommitment({
  subjectObjectId:action,
  metricKey:'available_resource',
  comparator:'AT_LEAST',
  targetValue:1500000,
  unit:'CLP',
  declaredBy:'directiva@cudo.cl',
  reason:'Meta sintética para probar feedback.',
  sourceRefs:['fixture://decision-outcome/goal']
});

const beforeObs={
  schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
  object_id:'CUDO-OBS-BEFORE-OUTCOME',
  object_type:'OBSERVATION',
  object_version:1,
  lifecycle_state:'OBSERVED',
  data:{current_value:500000},
  field_semantics:{current_value:{state_kind:'SOURCE',source_refs:['fixture://before']}},
  relationships:[],
  provenance:{created_at:'2026-09-20T02:00:00.000Z',updated_at:null,source_system:'CUDO_SYNTHETIC_QA',source_refs:['fixture://before']},
  legacy_refs:[]
};
const beforeGap=deriveNumericGap({goal,observation:beforeObs});
assert.equal(beforeGap.data.gap_value,1000000);

assert.throws(()=>recordDecisionOutcomeObservation({
  decision,
  subjectObjectId:'CUDO-ACTION-CANCHA',
  metricKey:'available_resource',
  currentValue:900000,
  outcomeCode:'MEASURED',
  summary:'wrong selected subject',
  sourceRefs:['fixture://outcome']
}),/must be selected/);

const improvedOutcome=recordDecisionOutcomeObservation({
  decision,
  subjectObjectId:action,
  metricKey:'available_resource',
  currentValue:900000,
  unit:'CLP',
  outcomeCode:'NUEVO_RESULTADO_REAL_NO_PREDEFINIDO',
  summary:'El recurso disponible medido después de la acción es CLP 900000.',
  sourceRefs:['fixture://outcome/improved']
});
const improved=recalibrateNumericGoalGapFromOutcome({goal,outcome:improvedOutcome});
assert.equal(improved.feedback.gap_value,600000);
assert.equal(improved.feedback.goal_changed,false);
assert.equal(improved.feedback.automatic_priority_change,false);

const worseOutcome=recordDecisionOutcomeObservation({
  decision,
  subjectObjectId:action,
  metricKey:'available_resource',
  currentValue:400000,
  unit:'CLP',
  outcomeCode:'RESULTADO_MENOR_AL_OBSERVADO_INICIALMENTE',
  summary:'El valor real posterior es menor; ejecutar no implica éxito.',
  sourceRefs:['fixture://outcome/worse'],
  observedAt:'2026-09-20T02:07:00.000Z'
});
const worse=recalibrateNumericGoalGapFromOutcome({goal,outcome:worseOutcome,now:'2026-09-20T02:08:00.000Z'});
assert.equal(worse.feedback.gap_value,1100000);

const closedOutcome=recordDecisionOutcomeObservation({
  decision,
  subjectObjectId:action,
  metricKey:'available_resource',
  currentValue:1500000,
  unit:'CLP',
  outcomeCode:'TARGET_REACHED_BY_MEASUREMENT',
  summary:'El valor observado alcanza la meta.',
  sourceRefs:['fixture://outcome/closed'],
  observedAt:'2026-09-20T02:09:00.000Z'
});
const closed=recalibrateNumericGoalGapFromOutcome({goal,outcome:closedOutcome,now:'2026-09-20T02:10:00.000Z'});
assert.equal(closed.feedback.gap_value,0);
assert.equal(closed.gap.lifecycle_state,'CLOSED');
assert.ok(!Object.hasOwn(improvedOutcome.data,'priority_score'));
assert.ok(!Object.hasOwn(improvedOutcome.data,'pattern_id'));

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_DECISION_OUTCOME_FEEDBACK_RECALIBRATION_V1',
  before_gap:beforeGap.data.gap_value,
  improved_gap:improved.feedback.gap_value,
  worse_gap:worse.feedback.gap_value,
  closed_gap:closed.feedback.gap_value,
  execution_implies_success:false,
  goal_changed:false,
  automatic_priority_change:false,
  automatic_rule_promotion:false,
  open_outcome_code:true,
  production_write:false
},null,2));
