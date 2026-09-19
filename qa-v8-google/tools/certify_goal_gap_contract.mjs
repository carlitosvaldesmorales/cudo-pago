import assert from 'node:assert/strict';
import {
  createGoalCommitment,
  deriveNumericGap,
  gapValue
} from './goal_gap_contract.mjs';

function observation(value,id='CUDO-OBS-GOAL-001'){
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:id,
    object_type:'OBSERVATION',
    object_version:1,
    lifecycle_state:'OBSERVED',
    data:{current_value:value},
    field_semantics:{current_value:{state_kind:'SOURCE',source_refs:['fixture://goal-gap/observed']}},
    relationships:[],
    provenance:{
      created_at:'2026-09-19T22:49:00.000Z',
      updated_at:null,
      source_system:'CUDO_SYNTHETIC_QA',
      source_refs:['fixture://goal-gap/observed']
    },
    legacy_refs:[]
  };
}

assert.throws(()=>createGoalCommitment({
  subjectObjectId:'CUDO-OBS-GOAL-001',
  metricKey:'available_resource',
  comparator:'AT_LEAST',
  targetValue:1500000,
  declaredBy:'directiva@cudo.cl',
  reason:'Meta sintética',
  sourceRefs:[]
}),/sourceRefs/);

const goal=createGoalCommitment({
  subjectObjectId:'CUDO-OBS-GOAL-001',
  metricKey:'available_resource',
  comparator:'AT_LEAST',
  targetValue:1500000,
  unit:'CLP',
  declaredBy:'directiva@cudo.cl',
  reason:'Meta sintética declarada por humano para probar brecha.',
  sourceRefs:['fixture://goal-gap/human-declared-goal']
});
assert.equal(goal.object_type,'GOAL_COMMITMENT');
assert.equal(goal.provenance.source_system,'CUDO_GOAL_DECLARATION');
assert.equal(goal.data.target_value,1500000);

const openGap=deriveNumericGap({goal,observation:observation(500000)});
assert.equal(openGap.object_type,'GAP');
assert.equal(openGap.lifecycle_state,'OPEN');
assert.equal(openGap.data.gap_value,1000000);
assert.equal(openGap.field_semantics.gap_value.state_kind,'DERIVED');

const closedGap=deriveNumericGap({goal,observation:observation(1600000,'CUDO-OBS-GOAL-002')});
assert.equal(closedGap.lifecycle_state,'CLOSED');
assert.equal(closedGap.data.gap_value,0);

assert.equal(gapValue({comparator:'AT_MOST',targetValue:10,observedValue:14}),4);
assert.equal(gapValue({comparator:'AT_MOST',targetValue:10,observedValue:8}),0);
assert.equal(gapValue({comparator:'EQUAL',targetValue:10,observedValue:7}),3);
assert.throws(()=>deriveNumericGap({goal:null,observation:observation(1)}),/GOAL_COMMITMENT/);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_GOAL_GAP_CONTRACT_V1',
  goal_source_required:true,
  system_invents_goal:false,
  comparators:['AT_LEAST','AT_MOST','EQUAL'],
  open_gap_value:openGap.data.gap_value,
  closed_at_zero:true,
  production_write:false
},null,2));
