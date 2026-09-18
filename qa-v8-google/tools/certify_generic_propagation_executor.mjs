import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planPropagation,stateFingerprint} from './generic_propagation_executor.mjs';

const registry=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-dependency-rule-registry-v1.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-propagation-fixture-v1.json','utf8'));
const NOW='2026-09-18T12:30:00.000Z';

function readField(objects,path){
  const dot=path.indexOf('.');
  const objectId=path.slice(0,dot);
  const field=path.slice(dot+1);
  const object=objects.find(x=>x.object_id===objectId);
  assert.ok(object,`missing expected object ${objectId}`);
  return object.data[field];
}
function assertExpected(result,expected){
  for(const [path,value] of Object.entries(expected)){
    assert.deepEqual(readField(result.objects,path),value,`${path} unexpected`);
  }
}
function runScenario(scenario){
  const result=planPropagation({
    objects:fixture.objects,
    registry,
    changes:scenario.changes,
    activeConditions:fixture.active_conditions,
    now:NOW
  });
  assert.equal(result.ok,true,`${scenario.id}: ${JSON.stringify(result.failures)}`);
  assert.equal(result.production_write,false);
  assert.equal(result.metrics.cycle_guard_hit,false);
  assert.equal(result.dirty_remaining.length,0);
  assert.ok(result.metrics.source_changes>=1);
  assert.ok(result.metrics.derived_recalculations>=1);
  assertExpected(result,scenario.expected);

  const replay=planPropagation({
    objects:fixture.objects,
    registry,
    changes:scenario.changes,
    activeConditions:fixture.active_conditions,
    now:NOW
  });
  assert.equal(stateFingerprint(replay.objects),stateFingerprint(result.objects),`${scenario.id}: nondeterministic final state`);
  assert.deepEqual(replay.transitions,result.transitions,`${scenario.id}: nondeterministic transition chain`);

  const idempotent=planPropagation({
    objects:result.objects,
    registry,
    changes:scenario.changes,
    activeConditions:fixture.active_conditions,
    now:NOW
  });
  assert.equal(idempotent.transitions.length,0,`${scenario.id}: replay on converged state must be idempotent`);
  return result;
}

const results=fixture.scenarios.map(runScenario);

const returnResult=results.find((_,i)=>fixture.scenarios[i].id==='RETURN_PROPAGATES_TO_PAYABLE');
const returnRules=returnResult.transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').map(x=>x.rule_id);
assert.deepEqual(returnRules,[
  'RULE_PAYABLE_QTY_AFTER_RETURN_V1',
  'RULE_SUPPLIER_PAYABLE_V1'
]);
assert.equal(returnResult.transitions[2].cause_transition_id,returnResult.transitions[1].transition_id,'second-hop propagation must be caused by first derived transition');

const costResult=results.find((_,i)=>fixture.scenarios[i].id==='UNIT_COST_REVERSE_RELATION_PROPAGATION');
assert.ok(costResult.transitions.some(x=>x.rule_id==='RULE_SUPPLIER_PAYABLE_V1'),'reverse related input did not trigger supplier payable');

const soldResult=results.find((_,i)=>fixture.scenarios[i].id==='SOLD_QTY_CROSSES_OPERATION_AND_EVENT_FINANCE');
assert.ok(soldResult.transitions.some(x=>x.object_id==='CUDO-EVENT-SYNTH-SALE-001'&&x.field==='sales_revenue'),'cross-object event revenue was not recalculated');

// Failure isolation: remove only the event relation. Stock must still recalculate while sales revenue fails.
const brokenObjects=JSON.parse(JSON.stringify(fixture.objects));
const brokenResource=brokenObjects.find(x=>x.object_id==='CUDO-RESOURCE-SYNTH-BEV-001');
brokenResource.relationships=brokenResource.relationships.filter(x=>x.relationship_type!=='USED_BY_EVENT');
const isolated=planPropagation({
  objects:brokenObjects,
  registry,
  changes:[{object_id:'CUDO-RESOURCE-SYNTH-BEV-001',field:'sold_qty',value:69,source_ref:'fixture://failure-isolation'}],
  activeConditions:fixture.active_conditions,
  now:NOW
});
assert.equal(isolated.ok,false);
assert.ok(isolated.failures.some(x=>x.rule_id==='RULE_SALES_REVENUE_V1'));
assert.equal(readField(isolated.objects,'CUDO-RESOURCE-SYNTH-BEV-001.stock_after_sales'),31,'independent stock rule must survive unrelated relation failure');

// Cycle guard: synthetic non-convergent loop must stop without external writes.
const cycleObject={
  schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
  object_id:'CUDO-RESOURCE-CYCLE-001',
  object_type:'RESOURCE_FACILITY',
  object_version:1,
  lifecycle_state:'TEST',
  data:{seed:0,factor:2,a:0,b:0},
  field_semantics:{
    seed:{state_kind:'SOURCE',source_refs:['fixture://cycle/seed']},
    factor:{state_kind:'SOURCE',source_refs:['fixture://cycle/factor']},
    a:{state_kind:'DERIVED',rule_ids:['RULE_CYCLE_SEED_A_V1','RULE_CYCLE_B_A_V1']},
    b:{state_kind:'DERIVED',rule_ids:['RULE_CYCLE_A_B_V1']}
  },
  relationships:[],
  provenance:{created_at:NOW,updated_at:null,source_system:'CUDO_SYNTHETIC_QA',source_refs:['fixture://cycle']},
  legacy_refs:[]
};
const bind=(name,field)=>({name,selector:{scope:'SOURCE_OBJECT',object_type:'RESOURCE_FACILITY',field}});
const cycleRegistry={rules:[
  {rule_id:'RULE_CYCLE_SEED_A_V1',status:'ACTIVE',inputs:[bind('seed','seed'),bind('factor','factor')],outputs:[bind('a','a')],expression:{operator:'MULTIPLY',args:['seed','factor']},applicability:{mode:'ALWAYS'}},
  {rule_id:'RULE_CYCLE_A_B_V1',status:'ACTIVE',inputs:[bind('a','a'),bind('factor','factor')],outputs:[bind('b','b')],expression:{operator:'MULTIPLY',args:['a','factor']},applicability:{mode:'ALWAYS'}},
  {rule_id:'RULE_CYCLE_B_A_V1',status:'ACTIVE',inputs:[bind('b','b'),bind('factor','factor')],outputs:[bind('a','a')],expression:{operator:'MULTIPLY',args:['b','factor']},applicability:{mode:'ALWAYS'}}
]};
const cycle=planPropagation({
  objects:[cycleObject],
  registry:cycleRegistry,
  changes:[{object_id:'CUDO-RESOURCE-CYCLE-001',field:'seed',value:1,source_ref:'fixture://cycle/start'}],
  now:NOW,
  maxEvaluations:12
});
assert.equal(cycle.metrics.cycle_guard_hit,true);
assert.equal(cycle.production_write,false);

console.log(JSON.stringify({
  ok:true,
  executor:'CUDO_GENERIC_PROPAGATION_EXECUTOR_V1',
  scenarios:fixture.scenarios.length,
  deterministic_replay:true,
  idempotence:true,
  cross_object_resolution:true,
  multi_hop_propagation:true,
  reverse_related_input_trigger:true,
  failure_isolation:true,
  cycle_guard:true,
  production_write:false,
  scenario_metrics:results.map((result,index)=>({
    id:fixture.scenarios[index].id,
    source_changes:result.metrics.source_changes,
    derived_recalculations:result.metrics.derived_recalculations,
    rule_evaluations:result.metrics.rule_evaluations,
    transitions:result.transitions.length
  }))
},null,2));
