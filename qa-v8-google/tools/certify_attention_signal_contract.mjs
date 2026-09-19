import assert from 'node:assert/strict';
import {createAttentionSignal} from './attention_signal_contract.mjs';

const subject='CUDO-WORK-SYNTH-001';

assert.throws(()=>createAttentionSignal({
  subjectObjectId:subject,
  signalCode:'WORK_BLOCKED',
  explanation:'Bloqueo sintético',
  sourceRefs:[]
}),/sourceRefs/);

const a=createAttentionSignal({
  subjectObjectId:subject,
  signalCode:'WORK_BLOCKED_OR_DEPENDENCY_PENDING',
  explanation:'El trabajo sintético depende de una condición aún no resuelta.',
  sourceRefs:['fixture://attention/blocker']
});
const b=createAttentionSignal({
  subjectObjectId:subject,
  signalCode:'NUEVA_CAUSA_NO_PREDEFINIDA',
  explanation:'Causa sintética nueva no incluida en los ejemplos conocidos.',
  sourceRefs:['fixture://attention/open-world'],
  observedAt:'2026-09-19T23:01:00.000Z'
});

assert.equal(a.object_type,'ATTENTION_SIGNAL');
assert.equal(a.lifecycle_state,'ACTIVE');
assert.equal(a.relationships[0].target_object_id,subject);
assert.equal(b.data.signal_code,'NUEVA_CAUSA_NO_PREDEFINIDA');
assert.notEqual(a.object_id,b.object_id);

for(const signal of [a,b]){
  assert.ok(!Object.hasOwn(signal.data,'priority_score'));
  assert.ok(!Object.hasOwn(signal.data,'severity'));
  assert.ok(!Object.hasOwn(signal.data,'weight'));
  assert.equal(signal.relationships[0].relationship_type,'ATTENTION_ON');
}

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_EXPLAINABLE_ATTENTION_SIGNAL_V1',
  open_signal_code:true,
  multiple_signals_same_subject:true,
  global_priority_score:false,
  hidden_weight:false,
  fixed_universal_severity:false,
  production_write:false
},null,2));
