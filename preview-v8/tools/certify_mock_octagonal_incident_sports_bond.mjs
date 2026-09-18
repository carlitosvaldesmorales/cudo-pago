import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMockRuntime,applyMockAdminAction} from '../shared/mock-admin-engine.mjs';
import {deriveMockSportsProjection} from '../shared/mock-sports-projection.mjs';

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-19T00:40:00-03:00'});

function apply(action,at='2026-09-19T00:41:00-03:00'){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

for(const [id,name] of [
  ['MOCK-ACTOR-OCT-CLUB-LOCAL-001','Club Local Octagonal'],
  ['MOCK-ACTOR-OCT-CLUB-VISITA-001','Club Visita Octagonal'],
  ['MOCK-ACTOR-OCT-CLUB-TEXT-TRAP-001','Club Texto Coincidente']
]){
  apply({
    action_id:'CREATE-'+id,
    type:'ACTOR_CREATE',
    actor_id:id,
    display_name:name,
    actor_kind:'EXTERNAL_ORGANIZATION',
    role:'PARTICIPATING_CLUB'
  });
}

apply({
  action_id:'OCT-BOND-RECEIVE-VISITA-001',
  type:'TOURNAMENT_BOND_RECEIVE',
  obligation_id:'MOCK-OBL-BOND-OCT-VISITA-001',
  club_actor_id:'MOCK-ACTOR-OCT-CLUB-VISITA-001'
});

apply({
  action_id:'OCT-MATCH-CREATE-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-OCT-MATCH-001',
  display_name:'Partido Octagonal Integrado',
  kind:'MATCH',
  state:'LIVE',
  starts_at:'2026-09-19T15:00:00-03:00',
  local:'Club Local Octagonal',
  visita:'Club Visita Octagonal',
  local_club_actor_id:'MOCK-ACTOR-OCT-CLUB-LOCAL-001',
  visita_club_actor_id:'MOCK-ACTOR-OCT-CLUB-VISITA-001',
  categoria:'PRIMERA',
  competencia:'Octagonal Febrero 2025 CUDO',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
});

let event=runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-OCT-MATCH-001');
assert.equal(event.sports.local_club_actor_id,'MOCK-ACTOR-OCT-CLUB-LOCAL-001');
assert.equal(event.sports.visita_club_actor_id,'MOCK-ACTOR-OCT-CLUB-VISITA-001');

const cashMovesBefore=runtime.state.financial_movements.filter(x=>['IN','OUT'].includes(x.direction)).length;
let out=apply({
  action_id:'OCT-INCIDENT-ACTION-001',
  type:'OCTAGONAL_INCIDENT_APPLY',
  incident_id:'MOCK-DECISION-OCTAGONAL-INCIDENT-001',
  event_id:'MOCK-EVENT-OCT-MATCH-001',
  offending_side:'VISITA',
  rule_code:'MISSING_SERIES',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01'
},'2026-09-19T00:45:00-03:00');

event=runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-OCT-MATCH-001');
const incident=runtime.state.decisions.find(x=>x.decision_id==='MOCK-DECISION-OCTAGONAL-INCIDENT-001');
const bond=runtime.state.financial_obligations.find(x=>x.obligation_id==='MOCK-OBL-BOND-OCT-VISITA-001');
const offset=runtime.state.financial_movements.find(x=>x.kind==='NON_CASH_BOND_OFFSET'&&x.event_ref===event.event_id);

assert.equal(event.state,'COMPLETED');
assert.equal(Object.hasOwn(event.sports,'goles_local'),false);
assert.equal(Object.hasOwn(event.sports,'goles_visita'),false);
assert.equal(event.sports.administrative_outcome.kind,'AWARDED_WIN');
assert.equal(event.sports.administrative_outcome.winner_side,'LOCAL');
assert.equal(event.sports.administrative_outcome.winner_club_actor_id,'MOCK-ACTOR-OCT-CLUB-LOCAL-001');
assert.equal(event.sports.administrative_outcome.offending_club_actor_id,'MOCK-ACTOR-OCT-CLUB-VISITA-001');
assert.equal(event.sports.administrative_outcome.points_local,6);
assert.equal(event.sports.administrative_outcome.points_visita,0);

assert.ok(incident);
assert.equal(incident.kind,'OCTAGONAL_INCIDENT');
assert.equal(incident.club_actor_id,'MOCK-ACTOR-OCT-CLUB-VISITA-001');
assert.equal(incident.offending_club_actor_id,'MOCK-ACTOR-OCT-CLUB-VISITA-001');
assert.equal(incident.winner_club_actor_id,'MOCK-ACTOR-OCT-CLUB-LOCAL-001');
assert.equal(incident.bond_obligation_ref,bond.obligation_id);
assert.equal(incident.amount_clp,100000);
assert.equal(incident.sports_consequence_state,'APPLIED_ATOMICALLY');
assert.equal(incident.financial_consequence_state,'APPLIED_ATOMICALLY');

assert.equal(bond.fine_offset_amount_clp,100000);
assert.equal(bond.outstanding_amount_clp,150000);
assert.equal(offset.direction,'INTERNAL');
assert.equal(offset.cash_effect,false);
assert.equal(runtime.state.financial_movements.filter(x=>['IN','OUT'].includes(x.direction)).length,cashMovesBefore);
assert.equal(runtime.state.financial_obligations.some(x=>x.direction==='RECEIVABLE'&&x.cause_ref===incident.decision_id),false);

assert.ok(out.effects.some(x=>x.kind==='OCTAGONAL_INCIDENT_APPLIED'));
assert.ok(out.effects.some(x=>x.kind==='ADMINISTRATIVE_MATCH_OUTCOME_APPLIED'));
assert.ok(out.effects.some(x=>x.kind==='TOURNAMENT_BOND_FINE_OFFSET_APPLIED'));
assert.ok(out.effects.some(x=>x.kind==='TOURNAMENT_BOND_REFUNDABLE_BALANCE_RECALCULATED'));

// Public sports projection gets the awarded win without a fake score, and standings use Octagonal points.
const sports=deriveMockSportsProjection(runtime,{seedMatches:[],seedTable:[]});
const match=sports.partidos.items.find(x=>x.id==='mock-event-oct-match-001');
assert.ok(match);
assert.equal(match.resultado_administrativo,'AWARDED_WIN');
assert.equal(match.ganador,'Club Local Octagonal (Mock)');
assert.equal(Object.hasOwn(match,'goles_local'),false);
assert.equal(Object.hasOwn(match,'goles_visita'),false);
const homeRow=sports.tabla.items.find(x=>x.equipo==='Club Local Octagonal (Mock)');
const awayRow=sports.tabla.items.find(x=>x.equipo==='Club Visita Octagonal (Mock)');
assert.ok(homeRow);
assert.ok(awayRow);
assert.equal(homeRow.pj,1);
assert.equal(homeRow.pg,1);
assert.equal(homeRow.pts,6);
assert.equal(homeRow.gf,0);
assert.equal(homeRow.gc,0);
assert.equal(awayRow.pp,1);
assert.equal(awayRow.pts,0);

// Idempotent replay cannot double-apply points or bond offset.
const replay=applyMockAdminAction(runtime,{
  action_id:'OCT-INCIDENT-ACTION-001',
  type:'OCTAGONAL_INCIDENT_APPLY',
  incident_id:'MOCK-DECISION-OCTAGONAL-INCIDENT-001',
  event_id:'MOCK-EVENT-OCT-MATCH-001',
  offending_side:'VISITA',
  rule_code:'MISSING_SERIES',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  expected_revision:runtime.revision-1,
  at:'2026-09-19T00:45:00-03:00'
});
assert.equal(replay.replayed,true);
assert.equal(replay.runtime.state.financial_obligations.find(x=>x.obligation_id===bond.obligation_id).fine_offset_amount_clp,100000);
assert.equal(replay.runtime.state.decisions.filter(x=>x.decision_id===incident.decision_id).length,1);

// Fail closed when match has only display names and no stable actor refs.
apply({
  action_id:'OCT-MATCH-LEGACY-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-OCT-LEGACY-001',
  display_name:'Partido Legacy Sin IDs',
  kind:'MATCH',
  state:'LIVE',
  starts_at:'2026-09-19T16:00:00-03:00',
  local:'Club Local Octagonal',
  visita:'Club Visita Octagonal',
  categoria:'SEGUNDA',
  competencia:'Octagonal Febrero 2025 CUDO',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
});
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'OCT-INCIDENT-NO-IDS-001',
  type:'OCTAGONAL_INCIDENT_APPLY',
  incident_id:'MOCK-DECISION-OCTAGONAL-INCIDENT-NO-IDS-001',
  event_id:'MOCK-EVENT-OCT-LEGACY-001',
  offending_side:'VISITA',
  rule_code:'NO_SHOW_SECOND_HALF',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  expected_revision:runtime.revision,
  at:'2026-09-19T00:47:00-03:00'
}),/requires stable club actor refs on both match sides/);

// Text equality cannot substitute identity: visible visiting name matches the bonded club, but actor ref points elsewhere.
apply({
  action_id:'OCT-MATCH-TEXT-TRAP-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-OCT-TEXT-TRAP-001',
  display_name:'Partido Trampa de Nombre',
  kind:'MATCH',
  state:'LIVE',
  starts_at:'2026-09-19T17:00:00-03:00',
  local:'Club Local Octagonal',
  visita:'Club Visita Octagonal',
  local_club_actor_id:'MOCK-ACTOR-OCT-CLUB-LOCAL-001',
  visita_club_actor_id:'MOCK-ACTOR-OCT-CLUB-TEXT-TRAP-001',
  categoria:'SEGUNDA',
  competencia:'Octagonal Febrero 2025 CUDO',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
});
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'OCT-INCIDENT-TEXT-TRAP-001',
  type:'OCTAGONAL_INCIDENT_APPLY',
  incident_id:'MOCK-DECISION-OCTAGONAL-INCIDENT-TEXT-TRAP-001',
  event_id:'MOCK-EVENT-OCT-TEXT-TRAP-001',
  offending_side:'VISITA',
  rule_code:'NO_SHOW_SECOND_HALF',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  expected_revision:runtime.revision,
  at:'2026-09-19T00:48:00-03:00'
}),/active tournament bond not found for offending club actor/);

// TERCERA is not part of this bounded Octagonal scoring contract.
apply({
  action_id:'OCT-BOND-RECEIVE-LOCAL-001',
  type:'TOURNAMENT_BOND_RECEIVE',
  obligation_id:'MOCK-OBL-BOND-OCT-LOCAL-001',
  club_actor_id:'MOCK-ACTOR-OCT-CLUB-LOCAL-001'
});
apply({
  action_id:'OCT-MATCH-TERCERA-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-OCT-TERCERA-001',
  display_name:'Tercera Fuera de Contrato Octagonal',
  kind:'MATCH',
  state:'LIVE',
  starts_at:'2026-09-19T18:00:00-03:00',
  local:'Club Local Octagonal',
  visita:'Club Visita Octagonal',
  local_club_actor_id:'MOCK-ACTOR-OCT-CLUB-LOCAL-001',
  visita_club_actor_id:'MOCK-ACTOR-OCT-CLUB-VISITA-001',
  categoria:'TERCERA',
  competencia:'Octagonal Febrero 2025 CUDO',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
});
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'OCT-INCIDENT-TERCERA-001',
  type:'OCTAGONAL_INCIDENT_APPLY',
  incident_id:'MOCK-DECISION-OCTAGONAL-INCIDENT-TERCERA-001',
  event_id:'MOCK-EVENT-OCT-TERCERA-001',
  offending_side:'LOCAL',
  rule_code:'NO_SHOW_SECOND_HALF',
  responsible_actor_id:'MOCK-ACTOR-DEPORTES-01',
  expected_revision:runtime.revision,
  at:'2026-09-19T00:49:00-03:00'
}),/category not supported by bounded ruleset/);

assert.ok(runtime.state.audit.some(x=>x.kind==='OCTAGONAL_INCIDENT_RECORDED'));
assert.ok(runtime.state.audit.some(x=>x.kind==='OCTAGONAL_SPORTS_CONSEQUENCE_APPLIED'));
assert.ok(runtime.state.audit.some(x=>x.kind==='TOURNAMENT_BOND_FINE_OFFSET_APPLIED'&&x.event_ref==='MOCK-EVENT-OCT-MATCH-001'));
assert.equal(runtime.production_write,false);

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_OCTAGONAL_INCIDENT_SPORTS_BOND_V1',
  stable_match_side_actor_identity:true,
  no_string_matching_for_financial_counterparty:true,
  one_incident_drives_sports_and_finance:true,
  scoreless_awarded_win:true,
  standings_points_and_bond_balance_recalculated:true,
  fine_offset_non_cash:true,
  no_second_receivable:true,
  idempotent_incident:true,
  legacy_match_without_ids_fail_closed:true,
  unsupported_category_fail_closed:true,
  production_write:false
},null,2));
