import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  materializeResponsibilityWorkState,
  transitionWorkItem,
  buildClubOperationalStateProjection
} from './work_item_engine.mjs';

const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json','utf8'));

assert.equal(fixture.real_source.observed_task,'Cortes de pasto');
assert.equal(fixture.real_source.observed_responsible,'Maximiliano Figueroa');
assert.equal(fixture.real_source.observed_normal_day,'SATURDAY');
assert.equal(fixture.real_source.observed_payment_amount_clp,50000);
assert.equal(fixture.real_source.observed_payment_cycle,'EVERY_TWO_MONTHS');

const first=materializeResponsibilityWorkState({
  objects:fixture.objects,
  now:'2026-09-18T15:00:00.000Z'
});
assert.equal(first.ok,true);
assert.equal(first.created.length,1);
const work=first.created[0];
assert.equal(work.object_id,fixture.expected.work_id);
assert.equal(work.object_type,'WORK_ITEM');
assert.equal(work.lifecycle_state,'OPEN');
assert.equal(work.data.responsible_actor_id,fixture.expected.responsible_actor_id);
assert.equal(work.data.resource_id,fixture.expected.resource_id);
assert.equal(work.data.source_object_id,fixture.expected.source_object_id);
assert.equal(work.data.due_date,fixture.expected.due_date);
assert.equal(work.data.trigger_reason,fixture.expected.trigger_reason);
assert.equal(work.data.financial_context_amount_clp,fixture.expected.financial_context_amount_clp);
assert.equal(work.data.financial_context_cycle,fixture.expected.financial_context_cycle);
assert.equal(work.data.financial_context_semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');
assert.equal(work.relationships.find(x=>x.relationship_type==='ASSIGNED_TO').target_object_id,'CUDO-ACTOR-MAX-FIGUEROA-001');
assert.equal(work.relationships.find(x=>x.relationship_type==='CAUSED_BY_EVENT').target_object_id,'CUDO-EVENT-QA-SATURDAY-MATCH-001');

// Deterministic replay/no duplicate work.
const second=materializeResponsibilityWorkState({
  objects:first.objects,
  now:'2026-09-18T15:01:00.000Z'
});
assert.equal(second.created.length,0);
assert.ok(second.audit.some(x=>x.kind==='NOOP_EXISTING_WORK'));

// State governance: fail closed, then valid transition, DONE requires evidence.
const conflict=transitionWorkItem({
  objects:first.objects,
  workItemId:work.object_id,
  expectedState:'IN_PROGRESS',
  nextState:'DONE',
  performedByActorId:'CUDO-ACTOR-MAX-FIGUEROA-001',
  reason:'Estado esperado incorrecto',
  evidenceRefs:['qa://evidence/wrong']
});
assert.equal(conflict.ok,false);
assert.equal(conflict.status,'EXPECTED_STATE_CONFLICT');

const started=transitionWorkItem({
  objects:first.objects,
  workItemId:work.object_id,
  expectedState:'OPEN',
  nextState:'IN_PROGRESS',
  performedByActorId:'CUDO-ACTOR-MAX-FIGUEROA-001',
  reason:'Inicio del trabajo QA',
  now:'2026-09-18T15:10:00.000Z'
});
assert.equal(started.ok,true);
assert.equal(started.audit.from,'OPEN');
assert.equal(started.audit.to,'IN_PROGRESS');

const noEvidence=transitionWorkItem({
  objects:started.objects,
  workItemId:work.object_id,
  expectedState:'IN_PROGRESS',
  nextState:'DONE',
  performedByActorId:'CUDO-ACTOR-MAX-FIGUEROA-001',
  reason:'Intento de cerrar sin evidencia',
  evidenceRefs:[],
  now:'2026-09-18T15:11:00.000Z'
});
assert.equal(noEvidence.ok,false);
assert.equal(noEvidence.status,'DONE_REQUIRES_EVIDENCE');

const done=transitionWorkItem({
  objects:started.objects,
  workItemId:work.object_id,
  expectedState:'IN_PROGRESS',
  nextState:'DONE',
  performedByActorId:'CUDO-ACTOR-MAX-FIGUEROA-001',
  reason:'Trabajo QA finalizado',
  evidenceRefs:['qa://evidence/grass-cut-complete'],
  now:'2026-09-18T15:12:00.000Z'
});
assert.equal(done.ok,true);
assert.equal(done.objects.find(x=>x.object_id===work.object_id).lifecycle_state,'DONE');

// Initial operational projection is the web-facing state to manage.
const projection=buildClubOperationalStateProjection({
  objects:first.objects,
  generatedAt:'2026-09-18T15:20:00.000Z',
  referenceDate:'2026-09-18'
});
assert.equal(projection.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(projection.summary.total,1);
assert.equal(projection.summary.open,1);
assert.equal(projection.items[0].responsible.display_name,'Maximiliano Figueroa');
assert.equal(projection.items[0].state,'OPEN');
assert.equal(projection.items[0].attention,'PENDING');
assert.equal(projection.items[0].due_date,'2026-09-25');
assert.equal(projection.items[0].resource.display_name,'Estadio CUDO');
assert.equal(projection.items[0].financial_context.amount_clp,50000);
assert.equal(projection.items[0].financial_context.semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');

const encoded=Buffer.from(JSON.stringify(projection,null,2)+'\n','utf8').toString('base64');
console.log('CUDO_OPERATIONAL_PROJECTION_BASE64='+encoded);
console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_WORK_ITEM_CONTRACT_V1',
  real_source:"Check-List tareas estadio y partidos.xlsx / Check list / B4:C4",
  canonical_work_item:true,
  stable_identity:true,
  responsible_actor:true,
  event_to_work_materialization:true,
  match_conflict_due_shift:true,
  deterministic_no_duplicate:true,
  expected_state_conflict_fail_closed:true,
  done_requires_evidence:true,
  audit_transition:true,
  web_operational_projection:true,
  financial_context_not_false_obligation:true,
  production_write:false
},null,2));
