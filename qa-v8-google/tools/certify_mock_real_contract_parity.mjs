import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const show=(ref,path)=>execFileSync('git',['show',`${ref}:${path}`],{encoding:'utf8'});
const showJson=(ref,path)=>JSON.parse(show(ref,path));

const contract=readJson('preview-v8/contracts/cudo-mock-real-contract-parity-v1.json');
const realWorkContract=readJson('qa-v8-google/contracts/cudo-work-item-contract-v1.json');
const realWorkEngine=fs.readFileSync('qa-v8-google/tools/work_item_engine.mjs','utf8');
const realOperation=readJson('qa-v8-google/data/operacion.json');

const mockRef=process.env.CUDO_MOCK_REF||'origin/qa-v8-mock';
const mockManifest=showJson(mockRef,'preview-v8/data/mock-manifest.json');
const mockEngine=show(mockRef,'preview-v8/shared/mock-admin-engine.mjs');
const mockOperation=showJson(mockRef,'preview-v8/data/operacion.json');

function transitionMap(source,constName){
  const marker=`const ${constName}={`;
  const start=source.indexOf(marker);
  if(start<0) throw new Error(`missing ${constName}`);
  const end=source.indexOf('\n};',start);
  if(end<0) throw new Error(`unterminated ${constName}`);
  const block=source.slice(start,end+3);
  const map={};
  const re=/([A-Z_]+):new Set\(\[([^\]]*)\]\)/g;
  let m;
  while((m=re.exec(block))){
    const values=[...m[2].matchAll(/'([^']+)'/g)].map(x=>x[1]);
    map[m[1]]=values;
  }
  return map;
}
function pairs(map){
  return new Set(Object.entries(map).flatMap(([from,tos])=>tos.map(to=>`${from}->${to}`)));
}
function sorted(xs){return [...xs].sort()}
function diff(a,b){return new Set([...a].filter(x=>!b.has(x)))}
function sameSet(actual,expected,label){
  assert.deepEqual(sorted(actual),sorted(expected),label);
}
function fieldsOf(item){return new Set(Object.keys(item||{}))}

assert.equal(contract.schema_version,'CUDO_MOCK_REAL_CONTRACT_PARITY_V1');
assert.equal(contract.production_write,false);

// 1. State vocabulary must be exact across environments.
sameSet(realWorkContract.lifecycle_states,contract.shared_required.work_states,'Real QA work states drifted');
sameSet(mockManifest.coverage.work_states,contract.shared_required.work_states,'Golden mock work states drifted');

// 2. Transition parity with explicit governed deltas.
const realTransitions=pairs(transitionMap(realWorkEngine,'ALLOWED'));
const mockTransitions=pairs(transitionMap(mockEngine,'WORK_TRANSITIONS'));
for(const pair of contract.shared_required.common_work_transitions){
  assert.ok(realTransitions.has(pair),`Real QA missing shared transition ${pair}`);
  assert.ok(mockTransitions.has(pair),`Mock missing shared transition ${pair}`);
}
const mockOnly=diff(mockTransitions,realTransitions);
const realOnly=diff(realTransitions,mockTransitions);
sameSet(mockOnly,contract.governed_deltas.mock_only_transitions,'Unexpected mock-only transition drift');
sameSet(realOnly,contract.governed_deltas.real_only_transitions,'Unexpected real-only transition drift');

// 3. Shared governance semantics.
assert.equal(realWorkContract.governance.stable_identity_required,true);
assert.equal(realWorkContract.governance.expected_state_precondition_required_for_transition,true);
assert.equal(realWorkContract.governance.transition_audit_required,true);
assert.equal(realWorkContract.governance.evidence_required_for_DONE,true);
assert.equal(realWorkContract.governance.production_write,false);
assert.ok(mockEngine.includes('stale revision:'),'Mock optimistic revision guard missing');
assert.ok(mockEngine.includes('work state conflict:'),'Mock expected-state guard missing');
assert.ok(mockEngine.includes('appendAudit(state'),'Mock transition audit missing');
assert.ok(mockEngine.includes('DONE requires evidence'),'Mock DONE evidence guard missing');
assert.ok(mockEngine.includes('production_write:false'),'Mock production-write guard missing');

// 4. Operational read model contract.
assert.equal(realOperation.schema_version,contract.shared_required.operational_read_model.schema_version);
assert.equal(mockOperation.schema_version,contract.shared_required.operational_read_model.schema_version);
assert.ok(Array.isArray(realOperation.items)&&realOperation.items.length>0,'Real QA operation fixture empty');
assert.ok(Array.isArray(mockOperation.items)&&mockOperation.items.length>0,'Mock operation fixture empty');
for(const field of contract.shared_required.operational_read_model.common_item_fields){
  assert.ok(fieldsOf(realOperation.items[0]).has(field),`Real QA operation missing field ${field}`);
  assert.ok(fieldsOf(mockOperation.items[0]).has(field),`Mock operation missing field ${field}`);
}

// 5. Strict provenance/environment separation.
assert.equal(mockManifest.mock,true);
assert.equal(mockManifest.golden_fixture,true);
assert.equal(mockManifest.production_write,false);
assert.notEqual(realOperation.authority,'GOLDEN_MOCK_READ_MODEL');
assert.notEqual(realOperation.authority,'GOLDEN_MOCK_RUNTIME');
assert.equal(realOperation.production_write,false);
assert.equal(JSON.stringify(realOperation).includes('"mock":true'),false,'Real QA must not claim mock authority');

// 6. Governed asymmetry must stay visible rather than silently disappearing.
for(const cap of contract.governed_deltas.mock_ahead_capabilities) assert.equal(typeof cap,'string');
for(const cap of contract.governed_deltas.real_ahead_capabilities) assert.equal(typeof cap,'string');
assert.ok(mockEngine.includes('AUTO_UNBLOCK_RESOURCE'));
assert.ok(mockEngine.includes('AUTO_UNBLOCK_DEPENDENCY'));
assert.ok(realWorkContract.financial_effect_policy?.no_double_entry===true);

console.log(JSON.stringify({
  ok:true,
  contract:contract.schema_version,
  real_ref:'HEAD',
  mock_ref:mockRef,
  shared_work_states:sorted(contract.shared_required.work_states),
  shared_transition_count:contract.shared_required.common_work_transitions.length,
  governed_mock_only_transitions:sorted(mockOnly),
  governed_real_only_transitions:sorted(realOnly),
  operational_schema:realOperation.schema_version,
  governance_parity:true,
  environment_separation:true,
  production_write:false
},null,2));
