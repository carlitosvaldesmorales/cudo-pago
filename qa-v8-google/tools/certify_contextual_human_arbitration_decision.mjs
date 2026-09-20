import assert from 'node:assert/strict';
import {recordContextualArbitrationDecision} from './contextual_human_arbitration_decision.mjs';

const candidates=['CUDO-ACTION-CANCHA','CUDO-ACTION-FINANCIAMIENTO','CUDO-ACTION-PERMISO'];

assert.throws(()=>recordContextualArbitrationDecision({
  candidateIds:['A'],
  chosenIds:['A'],
  decidedBy:'directiva@cudo.cl',
  reason:'test',
  sourceRefs:['fixture://decision'],
  scopeRef:'CUDO-SCOPE-SYNTH'
}),/at least two candidates/);

assert.throws(()=>recordContextualArbitrationDecision({
  candidateIds:candidates,
  chosenIds:['CUDO-ACTION-NO-EXISTE'],
  decidedBy:'directiva@cudo.cl',
  reason:'test',
  sourceRefs:['fixture://decision'],
  scopeRef:'CUDO-SCOPE-SYNTH'
}),/must belong/);

assert.throws(()=>recordContextualArbitrationDecision({
  candidateIds:candidates,
  chosenIds:['CUDO-ACTION-CANCHA'],
  decidedBy:'directiva@cudo.cl',
  reason:'test',
  sourceRefs:[],
  scopeRef:'CUDO-SCOPE-SYNTH'
}),/sourceRefs/);

const decision=recordContextualArbitrationDecision({
  candidateIds:candidates,
  chosenIds:['CUDO-ACTION-CANCHA'],
  decidedBy:'directiva@cudo.cl',
  reason:'Decisión sintética contextual: concentrar atención inmediata en dejar la cancha operativa.',
  sourceRefs:['fixture://decision/human-authority'],
  scopeRef:'CUDO-SCOPE-SYNTH-20260920'
});

assert.equal(decision.object_type,'RULE_DECISION');
assert.equal(decision.data.decision_kind,'CONTEXTUAL_ARBITRATION');
assert.equal(decision.data.scope_kind,'ONE_DECISION_INSTANCE');
assert.equal(decision.data.creates_global_priority_policy,false);
assert.equal(decision.data.candidate_count,3);
assert.equal(decision.data.chosen_count,1);
assert.equal(decision.relationships.filter(x=>x.relationship_type==='CONSIDERS').length,3);
assert.equal(decision.relationships.filter(x=>x.relationship_type==='SELECTS_FOR_CURRENT_ATTENTION').length,1);
assert.ok(!Object.hasOwn(decision.data,'priority_score'));
assert.ok(!Object.hasOwn(decision.data,'weights'));
assert.ok(!Object.hasOwn(decision.data,'universal_priority'));

const parallel=recordContextualArbitrationDecision({
  candidateIds:candidates,
  chosenIds:['CUDO-ACTION-CANCHA','CUDO-ACTION-PERMISO'],
  decidedBy:'directiva@cudo.cl',
  reason:'Ambas acciones pueden recibir atención en paralelo.',
  sourceRefs:['fixture://decision/parallel'],
  scopeRef:'CUDO-SCOPE-SYNTH-20260920-PARALLEL',
  decidedAt:'2026-09-20T01:46:00.000Z'
});
assert.equal(parallel.data.chosen_count,2);
assert.equal(parallel.data.creates_global_priority_policy,false);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_CONTEXTUAL_HUMAN_ARBITRATION_DECISION_V1',
  uses_rule_decision:true,
  contextual_scope:true,
  human_decider_required:true,
  reason_required:true,
  source_refs_required:true,
  multiple_choices_supported:true,
  global_priority_policy_created:false,
  numeric_weights_created:false,
  production_write:false
},null,2));
