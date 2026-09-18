import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction} from '../shared/mock-admin-engine.mjs';
import {deriveMockSportsProjection} from '../shared/mock-sports-projection.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T23:50:00-03:00'});

function apply(action,at='2026-09-18T23:51:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

apply({
  action_id:'ADMIN-MATCH-CREATE-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-ADMIN-MATCH-001',
  display_name:'Partido resolución administrativa',
  kind:'MATCH',
  state:'LIVE',
  starts_at:'2026-09-18T20:00:00-03:00',
  local:'CUDO',
  visita:'Club Rival Administrativo',
  categoria:'PRIMERA',
  competencia:'Pendiente de regla',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
});

const beforeObligations=runtime.state.financial_obligations.length;
let out=apply({
  action_id:'ADMIN-MATCH-OUTCOME-001',
  type:'MATCH_ADMINISTRATIVE_OUTCOME_APPLY',
  decision_id:'MOCK-DECISION-MATCH-ADMIN-001',
  event_id:'MOCK-EVENT-ADMIN-MATCH-001',
  offending_side:'VISITA',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01'
},'2026-09-18T23:52:00-03:00');

let event=runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-ADMIN-MATCH-001');
const decision=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-MATCH-ADMIN-001');
assert.equal(event.state,'COMPLETED');
assert.equal(Object.hasOwn(event.sports,'goles_local'),false);
assert.equal(Object.hasOwn(event.sports,'goles_visita'),false);
assert.equal(event.sports.competencia,'Cuadrangular Otoño CUDO (Mock)');
assert.equal(event.sports.administrative_outcome.kind,'AWARDED_WIN');
assert.equal(event.sports.administrative_outcome.winner_side,'LOCAL');
assert.equal(event.sports.administrative_outcome.points_local,6);
assert.equal(event.sports.administrative_outcome.points_visita,0);
assert.equal(decision.kind,'ADMINISTRATIVE_MATCH_OUTCOME');
assert.equal(decision.state,'APPLIED');
assert.equal(decision.financial_consequence.kind,'PRIZE_DEDUCTION');
assert.equal(decision.financial_consequence.amount_clp,100000);
assert.equal(decision.financial_consequence.state,'DEFERRED_NO_PRIZE_CONTRACT');
assert.equal(runtime.state.financial_obligations.length,beforeObligations);
assert.ok(out.effects.some(x=>x.kind==='ADMINISTRATIVE_MATCH_OUTCOME_APPLIED'));
assert.equal(out.effects.filter(x=>x.kind==='POST_EVENT_WORK_CREATED').length,2);

// Idempotent replay cannot duplicate the administrative decision.
const replay=applyMockAdminAction(runtime,{
  action_id:'ADMIN-MATCH-OUTCOME-001',
  type:'MATCH_ADMINISTRATIVE_OUTCOME_APPLY',
  decision_id:'MOCK-DECISION-MATCH-ADMIN-001',
  event_id:'MOCK-EVENT-ADMIN-MATCH-001',
  offending_side:'VISITA',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  expected_revision:2,
  at:'2026-09-18T23:52:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.decisions.filter(x=>x.decision_id==='MOCK-DECISION-MATCH-ADMIN-001').length,1);

const sports=deriveMockSportsProjection(runtime,{seedMatches:[],seedTable:[]});
const projected=sports.partidos.items.find(x=>x.id==='mock-event-admin-match-001');
assert.ok(projected);
assert.equal(projected.estado_partido,'FINALIZADO');
assert.equal(projected.resultado_administrativo,'AWARDED_WIN');
assert.equal(projected.ganador,'CUDO');
assert.equal(projected.puntos_local,6);
assert.equal(projected.puntos_visita,0);
assert.equal(Object.hasOwn(projected,'goles_local'),false);
assert.equal(Object.hasOwn(projected,'goles_visita'),false);

const cudo=sports.tabla.items.find(x=>x.equipo==='CUDO');
const rival=sports.tabla.items.find(x=>x.equipo==='Club Rival Administrativo (Mock)');
assert.ok(cudo);
assert.ok(rival);
assert.equal(cudo.pj,1);
assert.equal(cudo.pg,1);
assert.equal(cudo.pp,0);
assert.equal(cudo.gf,0);
assert.equal(cudo.gc,0);
assert.equal(cudo.pts,6);
assert.equal(rival.pj,1);
assert.equal(rival.pg,0);
assert.equal(rival.pp,1);
assert.equal(rival.gf,0);
assert.equal(rival.gc,0);
assert.equal(rival.pts,0);

// Bounded rule explicitly excludes SENIOR.
apply({
  action_id:'ADMIN-MATCH-CREATE-SENIOR-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-ADMIN-SENIOR-001',
  display_name:'Senior fuera de regla',
  kind:'MATCH',
  state:'LIVE',
  starts_at:'2026-09-18T21:00:00-03:00',
  local:'CUDO',
  visita:'Club Rival Senior',
  categoria:'SENIOR',
  competencia:'No aplicable',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
},'2026-09-18T23:53:00-03:00');

assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'ADMIN-MATCH-SENIOR-BAD-001',
  type:'MATCH_ADMINISTRATIVE_OUTCOME_APPLY',
  decision_id:'MOCK-DECISION-MATCH-ADMIN-SENIOR-001',
  event_id:'MOCK-EVENT-ADMIN-SENIOR-001',
  offending_side:'LOCAL',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  expected_revision:runtime.revision,
  at:'2026-09-18T23:54:00-03:00'
}),/administrative outcome category not supported by bounded ruleset/);

assert.ok((runtime.state.audit||[]).some(x=>x.kind==='ADMINISTRATIVE_MATCH_OUTCOME_APPLIED'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_ADMINISTRATIVE_MATCH_OUTCOME_V1',
  no_fake_score:true,
  primera_awarded_win_points:6,
  standings_recalculated_without_goals:true,
  normal_score_path_preserved_by_regression_suite:true,
  senior_fail_closed:true,
  prize_deduction_deferred_without_prize_contract:true,
  idempotent_action:true,
  production_write:false
},null,2));
