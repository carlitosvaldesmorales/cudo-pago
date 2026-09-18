import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction,deriveMockReadModels} from '../shared/mock-admin-engine.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T19:00:00-03:00'});
const baseline={
  actors:runtime.state.actors.length,
  resources:runtime.state.resources.length,
  events:runtime.state.events.length,
  decisions:runtime.state.decisions.length,
  work:runtime.state.work_items.length,
  obligations:runtime.state.financial_obligations.length
};

function apply(action){
  const out=applyMockAdminAction(runtime,{
    ...action,
    expected_revision:runtime.revision,
    at:action.at||'2026-09-18T19:01:00-03:00'
  });
  runtime=out.runtime;
  return out;
}

// 1) Create a responsible actor.
let out=apply({
  action_id:'SRC-ACTOR-001',
  type:'ACTOR_CREATE',
  actor_id:'MOCK-ACTOR-RUNTIME-01',
  display_name:'Responsable Nuevo',
  actor_kind:'PERSON',
  role:'EVENT_COORDINATOR'
});
const actor=runtime.state.actors.find(x=>x.actor_id==='MOCK-ACTOR-RUNTIME-01');
assert.ok(actor);
assert.equal(actor.display_name,'Responsable Nuevo (Mock)');
assert.equal(actor.mock,true);
assert.ok(out.effects.some(x=>x.kind==='SOURCE_ACTOR_CREATED'));

// 2) Create a resource.
out=apply({
  action_id:'SRC-RESOURCE-001',
  type:'RESOURCE_CREATE',
  resource_id:'MOCK-RESOURCE-RUNTIME-FIELD-01',
  display_name:'Cancha Auxiliar',
  kind:'FIELD',
  state:'AVAILABLE',
  attention:'NORMAL'
});
assert.equal(runtime.state.resources.find(x=>x.resource_id==='MOCK-RESOURCE-RUNTIME-FIELD-01').display_name,'Cancha Auxiliar (Mock)');

// 3) Create a scheduled MATCH source fact -> one derived preparation work.
out=apply({
  action_id:'SRC-EVENT-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-RUNTIME-MATCH-01',
  display_name:'Partido Nuevo',
  kind:'MATCH',
  state:'SCHEDULED',
  starts_at:'2026-10-11T15:00:00-03:00',
  resource_refs:['MOCK-RESOURCE-RUNTIME-FIELD-01']
});
const event=runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-RUNTIME-MATCH-01');
assert.equal(event.display_name,'Partido Nuevo (Mock)');
const derived=runtime.state.work_items.find(x=>x.source_ref===event.event_id&&x.derived_by_rule==='MOCK_RULE_SCHEDULED_MATCH_TO_PREPARATION_WORK_V1');
assert.ok(derived,'scheduled match must derive preparation work');
assert.equal(derived.state,'OPEN');
assert.equal(derived.resource_ref,'MOCK-RESOURCE-RUNTIME-FIELD-01');
assert.ok(out.effects.some(x=>x.kind==='DERIVED_WORK_CREATED'&&x.work_id===derived.work_id));

// Duplicate source fact is fail-closed.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'SRC-EVENT-DUP',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-RUNTIME-MATCH-01',
  display_name:'Duplicado',
  kind:'MATCH',
  state:'SCHEDULED',
  expected_revision:runtime.revision,
  at:'2026-09-18T19:02:00-03:00'
}),/duplicate event/);

// Non-match event remains a source fact and does not invent work.
const workBeforeFundraising=runtime.state.work_items.length;
apply({
  action_id:'SRC-EVENT-002',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-RUNTIME-FUNDRAISING-01',
  display_name:'Actividad Recaudación',
  kind:'FUNDRAISING',
  state:'SCHEDULED',
  starts_at:'2026-10-18T18:00:00-03:00',
  resource_refs:[]
});
assert.equal(runtime.state.work_items.length,workBeforeFundraising);

// 4) Create a pending human decision.
apply({
  action_id:'SRC-DECISION-001',
  type:'DECISION_CREATE',
  decision_id:'MOCK-DECISION-RUNTIME-01',
  display_name:'Aprobar compra nueva',
  kind:'EXPENSE_APPROVAL',
  responsible_actor_id:'MOCK-ACTOR-RUNTIME-01'
});
assert.equal(runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-RUNTIME-01').state,'PENDING_HUMAN');

// 5) Human-created work must be linked to a known cause.
apply({
  action_id:'SRC-WORK-001',
  type:'HUMAN_WORK_CREATE',
  work_id:'MOCK-WORK-RUNTIME-HUMAN-01',
  title:'Coordinar árbitro Mock',
  work_kind:'COORDINATION',
  responsible_actor_id:'MOCK-ACTOR-RUNTIME-01',
  source_ref:'MOCK-EVENT-RUNTIME-MATCH-01',
  resource_ref:'MOCK-RESOURCE-RUNTIME-FIELD-01',
  due_at:'2026-10-10T18:00:00-03:00',
  priority:'HIGH'
});
const humanWork=runtime.state.work_items.find(x=>x.work_id==='MOCK-WORK-RUNTIME-HUMAN-01');
assert.ok(humanWork);
assert.equal(humanWork.created_by_human,true);
assert.equal(humanWork.source_ref,'MOCK-EVENT-RUNTIME-MATCH-01');

assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'SRC-WORK-BAD',
  type:'HUMAN_WORK_CREATE',
  work_id:'MOCK-WORK-RUNTIME-BAD-01',
  title:'Trabajo sin causa',
  responsible_actor_id:'MOCK-ACTOR-RUNTIME-01',
  source_ref:'MOCK-EVENT-NOT-EXIST',
  expected_revision:runtime.revision,
  at:'2026-09-18T19:03:00-03:00'
}),/unknown work source/);

// 6) Create a financial obligation linked to the human-created work.
apply({
  action_id:'SRC-OBL-001',
  type:'OBLIGATION_CREATE',
  obligation_id:'MOCK-OBL-RUNTIME-01',
  direction:'PAYABLE',
  kind:'MOCK_SERVICE',
  amount_clp:45000,
  cause_ref:'MOCK-WORK-RUNTIME-HUMAN-01',
  counterparty_ref:'MOCK-ACTOR-RUNTIME-01'
});
const obligation=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-RUNTIME-01');
assert.ok(obligation);
assert.equal(obligation.state,'OPEN');
assert.equal(obligation.outstanding_amount_clp,45000);

// 7) Read models update from the same canonical runtime.
const views=deriveMockReadModels(runtime,{referenceDate:'2026-09-18'});
assert.equal(views.club.summary.actors,baseline.actors+1);
assert.equal(views.club.summary.events,baseline.events+2);
assert.equal(views.resources.summary.total,baseline.resources+1);
assert.equal(views.governance.summary.total,baseline.decisions+1);
assert.equal(views.operation.summary.total,baseline.work+2); // derived + human-created
assert.equal(views.finance.summary.obligations_total,baseline.obligations+1);
assert.ok(views.operation.items.some(x=>x.work_id===derived.work_id));
assert.ok(views.operation.items.some(x=>x.work_id==='MOCK-WORK-RUNTIME-HUMAN-01'));
assert.ok(views.finance.obligations.some(x=>x.obligation_id==='MOCK-OBL-RUNTIME-01'));

// 8) All created source entities remain explicitly synthetic.
assert.ok(runtime.state.actors.filter(x=>x.actor_id.includes('RUNTIME')).every(x=>x.mock===true&&/mock/i.test(x.display_name)));
assert.ok(runtime.state.events.filter(x=>x.event_id.includes('RUNTIME')).every(x=>x.mock===true&&/mock/i.test(x.display_name)));
assert.ok(runtime.state.resources.filter(x=>x.resource_id.includes('RUNTIME')).every(x=>x.mock===true&&/mock/i.test(x.display_name)));

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_SOURCE_FACT_CREATION_V1',
  actor_create:true,
  resource_create:true,
  event_create:true,
  scheduled_match_to_work_propagation:true,
  non_match_no_invented_work:true,
  decision_create:true,
  human_created_work:true,
  work_requires_known_source:true,
  obligation_create:true,
  same_runtime_read_models:true,
  synthetic_provenance:true,
  production_write:false
},null,2));
