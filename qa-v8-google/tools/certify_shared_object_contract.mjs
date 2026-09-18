import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const fixturePath='qa-v8-google/contracts/cudo-shared-object-fixture-v1.json';
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const allowedTypes=new Set([
  'ACTOR',
  'ACTIVITY_EVENT',
  'RESOURCE_FACILITY',
  'RULE_DECISION',
  'FINANCIAL_OBLIGATION',
  'FINANCIAL_MOVEMENT',
  'DOCUMENT_EVIDENCE',
  'WORK_ITEM'
]);

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function fingerprint(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function validateObject(obj){
  assert.equal(obj.schema_version,'CUDO_SHARED_OBJECT_CONTRACT_V1');
  assert.match(obj.object_id,/^[A-Z][A-Z0-9_-]{2,127}$/);
  assert.ok(allowedTypes.has(obj.object_type),`unsupported object_type ${obj.object_type}`);
  assert.ok(Number.isInteger(obj.object_version)&&obj.object_version>=1);
  assert.ok(typeof obj.lifecycle_state==='string'&&obj.lifecycle_state.length>0);
  assert.ok(obj.data&&typeof obj.data==='object'&&!Array.isArray(obj.data));
  assert.ok(obj.field_semantics&&typeof obj.field_semantics==='object'&&!Array.isArray(obj.field_semantics));
  assert.ok(Array.isArray(obj.relationships));
  assert.ok(obj.provenance&&typeof obj.provenance==='object');
  assert.ok(obj.provenance.source_system);
  assert.ok(Array.isArray(obj.provenance.source_refs)&&obj.provenance.source_refs.length>0);
  assert.ok(!Number.isNaN(Date.parse(obj.provenance.created_at)));

  const dataKeys=Object.keys(obj.data).sort();
  const semanticKeys=Object.keys(obj.field_semantics).sort();
  assert.deepEqual(semanticKeys,dataKeys,`${obj.object_id}: every data field must have exactly one semantic declaration`);

  for(const [field,sem] of Object.entries(obj.field_semantics)){
    assert.ok(['SOURCE','DERIVED','OPAQUE'].includes(sem.state_kind),`${obj.object_id}.${field}: invalid state_kind`);
    if(sem.state_kind==='SOURCE'){
      assert.ok(Array.isArray(sem.source_refs)&&sem.source_refs.length>0,`${obj.object_id}.${field}: SOURCE requires source_refs`);
      assert.ok(!sem.rule_ids,`${obj.object_id}.${field}: SOURCE cannot declare rule_ids`);
      assert.ok(!sem.gap_id,`${obj.object_id}.${field}: SOURCE cannot declare gap_id`);
    }
    if(sem.state_kind==='DERIVED'){
      assert.ok(Array.isArray(sem.rule_ids)&&sem.rule_ids.length>0,`${obj.object_id}.${field}: DERIVED requires rule_ids`);
      assert.ok(!sem.gap_id,`${obj.object_id}.${field}: DERIVED cannot declare gap_id`);
    }
    if(sem.state_kind==='OPAQUE'){
      assert.ok(typeof sem.gap_id==='string'&&sem.gap_id.length>0,`${obj.object_id}.${field}: OPAQUE requires gap_id`);
      assert.ok(!sem.rule_ids,`${obj.object_id}.${field}: OPAQUE cannot declare rule_ids`);
    }
  }
  for(const relation of obj.relationships){
    assert.match(relation.relationship_id,/^[A-Z][A-Z0-9_-]{2,127}$/);
    assert.match(relation.relationship_type,/^[A-Z][A-Z0-9_]{2,79}$/);
    assert.match(relation.target_object_id,/^[A-Z][A-Z0-9_-]{2,127}$/);
  }
  return fingerprint(obj);
}

assert.equal(fixture.schema_version,'CUDO_SHARED_OBJECT_FIXTURE_V1');
assert.ok(Array.isArray(fixture.objects)&&fixture.objects.length>=4);

const ids=new Set();
const relationshipIds=new Set();
const fingerprints=new Map();
for(const obj of fixture.objects){
  assert.ok(!ids.has(obj.object_id),`duplicate object_id ${obj.object_id}`);
  ids.add(obj.object_id);
  for(const relation of obj.relationships){
    assert.ok(!relationshipIds.has(relation.relationship_id),`duplicate relationship_id ${relation.relationship_id}`);
    relationshipIds.add(relation.relationship_id);
  }
  fingerprints.set(obj.object_id,validateObject(obj));
}
for(const obj of fixture.objects){
  for(const relation of obj.relationships){
    assert.ok(ids.has(relation.target_object_id),`${obj.object_id}: unresolved target ${relation.target_object_id}`);
  }
}

const event=fixture.objects.find(x=>x.object_type==='ACTIVITY_EVENT');
assert.equal(event.data.entry_revenue,event.data.paid_entries*event.data.entry_price);
assert.equal(event.field_semantics.entry_revenue.state_kind,'DERIVED');

const opaque=fixture.objects.find(x=>x.object_id==='CUDO-EVID-SYNTH-001');
assert.equal(opaque.field_semantics.opaque_legacy_value.state_kind,'OPAQUE');

const replayFingerprints=new Map(fixture.objects.map(obj=>[obj.object_id,validateObject(JSON.parse(JSON.stringify(obj)))]));
assert.deepEqual([...replayFingerprints],[...fingerprints],'deterministic replay changed object fingerprints');

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_SHARED_OBJECT_CONTRACT_V1',
  objects:fixture.objects.length,
  object_types:[...new Set(fixture.objects.map(x=>x.object_type))],
  relationships:relationshipIds.size,
  semantic_fields:fixture.objects.reduce((n,x)=>n+Object.keys(x.field_semantics).length,0),
  deterministic_replay:true,
  production_write:false
},null,2));
