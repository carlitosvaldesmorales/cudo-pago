import assert from 'node:assert/strict';
import {recordContextualArbitrationDecision} from './contextual_human_arbitration_decision.mjs';
import {arbitrationDecisionToObservation} from './arbitration_decision_feedback.mjs';

const decision=recordContextualArbitrationDecision({
  candidateIds:['CUDO-ACTION-A','CUDO-ACTION-B','CUDO-ACTION-C'],
  chosenIds:['CUDO-ACTION-B'],
  decidedBy:'directiva@cudo.cl',
  reason:'Elección contextual sintética.',
  sourceRefs:['fixture://human-decision'],
  scopeRef:'CUDO-SCOPE-FEEDBACK-001'
});
const obs=arbitrationDecisionToObservation({decision});
assert.equal(obs.object_type,'OBSERVATION');
assert.equal(obs.data.observation_kind,'HUMAN_ARBITRATION_DECISION');
assert.deepEqual(obs.data.considered_candidate_ids,['CUDO-ACTION-A','CUDO-ACTION-B','CUDO-ACTION-C']);
assert.deepEqual(obs.data.selected_candidate_ids,['CUDO-ACTION-B']);
assert.equal(obs.data.decision_creates_global_priority_policy,false);
assert.ok(!Object.hasOwn(obs.data,'pattern_id'));
assert.equal(obs.relationships[0].relationship_type,'OBSERVES_DECISION');
assert.equal(obs.relationships[0].target_object_id,decision.object_id);
assert.ok(obs.provenance.source_refs.includes(decision.object_id));

assert.throws(()=>arbitrationDecisionToObservation({
  decision:{object_type:'RULE_DECISION',data:{decision_kind:'OTHER'},provenance:{source_refs:['x']},relationships:[]}
}),/CONTEXTUAL_ARBITRATION/);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_ARBITRATION_DECISION_FEEDBACK_OBSERVATION_V1',
  decision_becomes_observation:true,
  preserves_context:true,
  pattern_id_required:false,
  automatic_rule_promotion:false,
  global_policy_created:false,
  production_write:false
},null,2));
