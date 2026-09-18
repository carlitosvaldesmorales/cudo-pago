import assert from 'node:assert/strict';
import fs from 'node:fs';

const registry=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-dependency-rule-registry-v1.json','utf8'));
const shared=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-shared-object-fixture-v1.json','utf8'));

const allowedTypes=new Set([
  'ACTOR','ACTIVITY_EVENT','RESOURCE_FACILITY','RULE_DECISION',
  'FINANCIAL_OBLIGATION','FINANCIAL_MOVEMENT','DOCUMENT_EVIDENCE'
]);
const allowedEvidence=new Set(['DIRECT','DIRECT_PATTERN','SYNTHETIC_CONTRACT_EXAMPLE','INFERENCE']);
const allowedOperators=new Set(['MULTIPLY','SUBTRACT','SUM_DIFFERENCE','IDENTITY','SUM']);

function selectorKey(selector){
  return [selector.scope,selector.object_type,selector.relationship_type||'',selector.field].join(':');
}
function evaluate(rule,inputs){
  const args=rule.expression.args.map(name=>{
    assert.ok(Object.hasOwn(inputs,name),`${rule.rule_id}: missing test input ${name}`);
    return inputs[name];
  });
  switch(rule.expression.operator){
    case 'IDENTITY':
      assert.equal(args.length,1,`${rule.rule_id}: IDENTITY requires 1 arg`);
      return args[0];
    case 'SUM':
      assert.equal(args.length,1,`${rule.rule_id}: SUM requires 1 arg`);
      assert.ok(Array.isArray(args[0]),`${rule.rule_id}: SUM arg must be array`);
      return args[0].reduce((a,b)=>a+Number(b),0);
    case 'MULTIPLY':
      assert.equal(args.length,2,`${rule.rule_id}: MULTIPLY requires 2 args`);
      return Number(args[0])*Number(args[1]);
    case 'SUBTRACT':
      assert.equal(args.length,2,`${rule.rule_id}: SUBTRACT requires 2 args`);
      return Number(args[0])-Number(args[1]);
    case 'SUM_DIFFERENCE': {
      assert.equal(args.length,2,`${rule.rule_id}: SUM_DIFFERENCE requires 2 args`);
      assert.ok(Array.isArray(args[0])&&Array.isArray(args[1]),`${rule.rule_id}: SUM_DIFFERENCE args must be arrays`);
      return args[0].reduce((a,b)=>a+Number(b),0)-args[1].reduce((a,b)=>a+Number(b),0);
    }
    default:
      throw new Error(`${rule.rule_id}: unsupported operator ${rule.expression.operator}`);
  }
}

assert.equal(registry.schema_version,'CUDO_DEPENDENCY_RULE_REGISTRY_V1');
assert.ok(Number.isInteger(registry.registry_version)&&registry.registry_version>=1);
assert.ok(Array.isArray(registry.rules)&&registry.rules.length>0);

const ids=new Set();
const producerKeys=new Map();
const exclusiveGroups=registry.exclusive_condition_groups||[];
const seenGroupIds=new Set();
const seenExclusiveConditions=new Set();
for(const group of exclusiveGroups){
  assert.match(group.group_id,/^[A-Z][A-Z0-9_]{2,127}$/);
  assert.ok(!seenGroupIds.has(group.group_id),`duplicate exclusive group ${group.group_id}`);
  seenGroupIds.add(group.group_id);
  assert.ok(Array.isArray(group.condition_ids)&&group.condition_ids.length>=2);
  for(const conditionId of group.condition_ids){
    assert.match(conditionId,/^[A-Z][A-Z0-9_]{2,127}$/);
    assert.ok(!seenExclusiveConditions.has(conditionId),`condition ${conditionId} appears in multiple exclusive groups`);
    seenExclusiveConditions.add(conditionId);
  }
}
let testCount=0;
for(const rule of registry.rules){
  assert.match(rule.rule_id,/^RULE_[A-Z0-9_]+_V[0-9]+$/);
  assert.ok(!ids.has(rule.rule_id),`duplicate rule_id ${rule.rule_id}`);
  ids.add(rule.rule_id);
  assert.ok(Number.isInteger(rule.version)&&rule.version>=1);
  assert.ok(['ACTIVE','EXPERIMENTAL'].includes(rule.status));
  assert.ok(Array.isArray(rule.inputs)&&rule.inputs.length>0);
  assert.ok(Array.isArray(rule.outputs)&&rule.outputs.length>0);
  assert.ok(allowedOperators.has(rule.expression.operator));
  assert.ok(allowedEvidence.has(rule.evidence.evidence_level));
  assert.ok(Array.isArray(rule.evidence.source_refs)&&rule.evidence.source_refs.length>0);
  assert.ok(Array.isArray(rule.test_cases)&&rule.test_cases.length>0);

  const bindingNames=new Set();
  for(const binding of [...rule.inputs,...rule.outputs]){
    assert.match(binding.name,/^[a-z][a-z0-9_]{1,79}$/);
    assert.ok(!bindingNames.has(binding.name)||rule.inputs.some(x=>x.name===binding.name),`${rule.rule_id}: duplicate binding ${binding.name}`);
    bindingNames.add(binding.name);
    const s=binding.selector;
    assert.ok(['SOURCE_OBJECT','RELATED_OBJECT','REVERSE_RELATED_OBJECTS'].includes(s.scope));
    assert.ok(allowedTypes.has(s.object_type));
    assert.match(s.field,/^[a-z][a-z0-9_]{1,79}$/);
    if(s.scope==='RELATED_OBJECT'||s.scope==='REVERSE_RELATED_OBJECTS') assert.match(s.relationship_type,/^[A-Z][A-Z0-9_]{2,79}$/);
  }

  const inputNames=new Set(rule.inputs.map(x=>x.name));
  for(const arg of rule.expression.args) assert.ok(inputNames.has(arg),`${rule.rule_id}: expression arg ${arg} is not an input binding`);

  if(rule.applicability.mode==='CONDITIONAL'){
    assert.match(rule.applicability.condition_id,/^[A-Z][A-Z0-9_]{2,127}$/);
    assert.ok(rule.applicability.description);
  } else {
    assert.equal(rule.applicability.mode,'ALWAYS');
  }

  for(const output of rule.outputs){
    const key=selectorKey(output.selector);
    if(rule.status==='ACTIVE'){
      assert.ok(!producerKeys.has(key),`ambiguous ACTIVE producer for ${key}: ${producerKeys.get(key)} and ${rule.rule_id}`);
      producerKeys.set(key,rule.rule_id);
    }
  }

  for(const tc of rule.test_cases){
    assert.deepEqual(evaluate(rule,tc.inputs),tc.expected,`${rule.rule_id}: deterministic test failed`);
    assert.deepEqual(evaluate(rule,JSON.parse(JSON.stringify(tc.inputs))),tc.expected,`${rule.rule_id}: replay test failed`);
    testCount++;
  }
}

const derivedRefs=[];
for(const object of shared.objects||[]){
  for(const [field,semantic] of Object.entries(object.field_semantics||{})){
    if(semantic.state_kind!=='DERIVED') continue;
    for(const ruleId of semantic.rule_ids||[]){
      derivedRefs.push({object_id:object.object_id,field,rule_id:ruleId});
      assert.ok(ids.has(ruleId),`${object.object_id}.${field}: derived rule ${ruleId} missing from registry`);
    }
  }
}
assert.ok(derivedRefs.length>0,'shared object fixture must contain at least one DERIVED rule reference');

const graphEdges=[];
for(const rule of registry.rules){
  for(const input of rule.inputs){
    for(const output of rule.outputs){
      graphEdges.push({
        rule_id:rule.rule_id,
        from:selectorKey(input.selector),
        to:selectorKey(output.selector)
      });
    }
  }
}
assert.ok(graphEdges.length>0);

console.log(JSON.stringify({
  ok:true,
  registry:'CUDO_DEPENDENCY_RULE_REGISTRY_V1',
  rules:registry.rules.length,
  active_rules:registry.rules.filter(x=>x.status==='ACTIVE').length,
  experimental_rules:registry.rules.filter(x=>x.status==='EXPERIMENTAL').length,
  deterministic_tests:testCount,
  derived_contract_refs_closed:derivedRefs.length,
  dependency_edges:graphEdges.length,
  production_write:false
},null,2));
