import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T20:00:00-03:00'});

function apply(action,at){
  const out=applyMockAdminAction(runtime,{
    ...action,
    expected_revision:runtime.revision,
    at:at||'2026-09-18T20:01:00-03:00'
  });
  runtime=out.runtime;
  return out;
}

// Create a scheduled match; preparation must be derived.
let out=apply({
  action_id:'EVT-CREATE-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-LIFECYCLE-01',
  display_name:'Partido Ciclo',
  kind:'MATCH',
  state:'SCHEDULED',
  starts_at:'2026-10-25T15:00:00-03:00',
  resource_refs:['MOCK-RESOURCE-STADIUM-01']
});
const eventId='MOCK-EVENT-LIFECYCLE-01';
const prepId='MOCK-WORK-AUTO-PREP-LIFECYCLE-01';
assert.equal(runtime.state.events.find(x=>x.event_id===eventId).state,'SCHEDULED');
assert.equal(runtime.state.work_items.find(x=>x.work_id===prepId).state,'OPEN');

// Illegal jump must fail closed.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'EVT-BAD-001',
  type:'EVENT_TRANSITION',
  event_id:eventId,
  expected_state:'SCHEDULED',
  next_state:'COMPLETED',
  expected_revision:runtime.revision,
  at:'2026-09-18T20:02:00-03:00'
}),/invalid event transition SCHEDULED -> COMPLETED/);

// SCHEDULED -> LIVE; no post-event work yet.
out=apply({
  action_id:'EVT-LIVE-001',
  type:'EVENT_TRANSITION',
  event_id:eventId,
  expected_state:'SCHEDULED',
  next_state:'LIVE',
  reason:'Inicio partido mock'
},'2026-10-25T15:00:00-03:00');
assert.equal(runtime.state.events.find(x=>x.event_id===eventId).state,'LIVE');
assert.equal(runtime.state.work_items.filter(x=>x.source_ref===eventId&&['STADIUM_CLEANING','KIT_WASHING'].includes(x.work_kind)).length,0);
assert.ok(out.effects.some(x=>x.kind==='EVENT_TRANSITION'));

// LIVE -> COMPLETED creates exactly two post-event work items.
out=apply({
  action_id:'EVT-DONE-001',
  type:'EVENT_TRANSITION',
  event_id:eventId,
  expected_state:'LIVE',
  next_state:'COMPLETED',
  reason:'Partido finalizado mock'
},'2026-10-25T18:00:00-03:00');
assert.equal(runtime.state.events.find(x=>x.event_id===eventId).state,'COMPLETED');
const post=runtime.state.work_items.filter(x=>x.source_ref===eventId&&['STADIUM_CLEANING','KIT_WASHING'].includes(x.work_kind));
assert.equal(post.length,2);
assert.deepEqual(post.map(x=>x.work_kind).sort(),['KIT_WASHING','STADIUM_CLEANING']);
assert.ok(post.every(x=>x.state==='OPEN'));
assert.ok(out.effects.filter(x=>x.kind==='POST_EVENT_WORK_CREATED').length===2);

// Same action ID replay cannot duplicate post-event work.
const replay=applyMockAdminAction(runtime,{
  action_id:'EVT-DONE-001',
  type:'EVENT_TRANSITION',
  event_id:eventId,
  expected_state:'LIVE',
  next_state:'COMPLETED',
  reason:'Partido finalizado mock',
  expected_revision:runtime.revision-1,
  at:'2026-10-25T18:00:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.work_items.filter(x=>x.source_ref===eventId&&['STADIUM_CLEANING','KIT_WASHING'].includes(x.work_kind)).length,2);

// Final state cannot advance.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'EVT-FINAL-BAD',
  type:'EVENT_TRANSITION',
  event_id:eventId,
  expected_state:'COMPLETED',
  next_state:'LIVE',
  expected_revision:runtime.revision,
  at:'2026-10-25T18:01:00-03:00'
}),/invalid event transition COMPLETED -> LIVE/);

// Cancellation case.
out=apply({
  action_id:'EVT-CREATE-002',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-CANCEL-FLOW-01',
  display_name:'Partido Cancelable',
  kind:'MATCH',
  state:'SCHEDULED',
  starts_at:'2026-11-01T15:00:00-03:00',
  resource_refs:['MOCK-RESOURCE-STADIUM-01']
},'2026-09-18T20:03:00-03:00');
const cancelEvent='MOCK-EVENT-CANCEL-FLOW-01';
const cancelPrep='MOCK-WORK-AUTO-PREP-CANCEL-FLOW-01';
assert.equal(runtime.state.work_items.find(x=>x.work_id===cancelPrep).state,'OPEN');

// Human-created work linked to same event must survive cancellation.
out=apply({
  action_id:'EVT-HUMAN-WORK-001',
  type:'HUMAN_WORK_CREATE',
  work_id:'MOCK-WORK-HUMAN-CANCEL-FLOW-01',
  title:'Avisar a delegados sobre cambio Mock',
  work_kind:'COMMUNICATION',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  source_ref:cancelEvent,
  resource_ref:null,
  priority:'HIGH'
},'2026-09-18T20:04:00-03:00');
assert.equal(runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-HUMAN-CANCEL-FLOW-01').state,'OPEN');

out=apply({
  action_id:'EVT-CANCEL-001',
  type:'EVENT_TRANSITION',
  event_id:cancelEvent,
  expected_state:'SCHEDULED',
  next_state:'CANCELLED',
  reason:'Suspensión sintética'
},'2026-09-18T20:05:00-03:00');
assert.equal(runtime.state.events.find(x=>x.event_id===cancelEvent).state,'CANCELLED');
assert.equal(runtime.state.work_items.find(x=>x.work_id===cancelPrep).state,'CANCELLED');
assert.equal(runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-HUMAN-CANCEL-FLOW-01').state,'OPEN');
assert.ok(out.effects.some(x=>x.kind==='AUTO_CANCEL_EVENT_PREPARATION'&&x.work_id===cancelPrep));

// A LIVE event can also be cancelled.
apply({
  action_id:'EVT-CREATE-003',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-LIVE-CANCEL-01',
  display_name:'Partido Live Cancel',
  kind:'MATCH',
  state:'SCHEDULED',
  resource_refs:['MOCK-RESOURCE-STADIUM-01']
},'2026-09-18T20:06:00-03:00');
apply({
  action_id:'EVT-LIVE-003',
  type:'EVENT_TRANSITION',
  event_id:'MOCK-EVENT-LIVE-CANCEL-01',
  expected_state:'SCHEDULED',
  next_state:'LIVE'
},'2026-09-18T20:07:00-03:00');
out=apply({
  action_id:'EVT-CANCEL-003',
  type:'EVENT_TRANSITION',
  event_id:'MOCK-EVENT-LIVE-CANCEL-01',
  expected_state:'LIVE',
  next_state:'CANCELLED'
},'2026-09-18T20:08:00-03:00');
assert.equal(runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-LIVE-CANCEL-01').state,'CANCELLED');

// Read models immediately reflect event and derived work state.
const views=deriveMockReadModels(runtime,{referenceDate:'2026-10-25'});
assert.equal(views.club.events.find(x=>x.event_id===eventId).state,'COMPLETED');
assert.ok(views.operation.items.some(x=>x.work_kind==='STADIUM_CLEANING'&&x.source.object_id===eventId));
assert.ok(views.operation.items.some(x=>x.work_kind==='KIT_WASHING'&&x.source.object_id===eventId));
assert.equal(views.operation.items.find(x=>x.work_id===cancelPrep).state,'CANCELLED');

// Audit contains lifecycle and propagation events.
assert.ok(runtime.state.audit.some(x=>x.kind==='EVENT_TRANSITION'&&x.object_ref===eventId&&x.to==='COMPLETED'));
assert.equal(runtime.state.audit.filter(x=>x.kind==='POST_EVENT_WORK_CREATED'&&x.source_ref===eventId).length,2);
assert.ok(runtime.state.audit.some(x=>x.kind==='AUTO_CANCEL_EVENT_PREPARATION'&&x.object_ref===cancelPrep));

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_EVENT_LIFECYCLE_V1',
  scheduled_to_live:true,
  live_to_completed:true,
  scheduled_to_cancelled:true,
  live_to_cancelled:true,
  invalid_jump_fail_closed:true,
  completed_match_creates_post_event_work:2,
  replay_no_duplicate:true,
  cancellation_only_removes_derived_preparation:true,
  human_work_preserved_on_event_cancel:true,
  shared_runtime_read_model_updated:true,
  audit_trace:true,
  production_write:false
},null,2));
