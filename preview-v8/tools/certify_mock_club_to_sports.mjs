import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMockRuntime,applyMockAdminAction} from '../shared/mock-admin-engine.mjs';
import {deriveMockSportsProjection} from '../shared/mock-sports-projection.mjs';

function loadSeed(){
  const source=fs.readFileSync('preview-v8/shared/seed-data.js','utf8');
  const context={window:{},location:{href:'https://cudo.cl/preview-v8/partidos/'},URL,Response,console};
  vm.createContext(context);
  vm.runInContext(source,context);
  return context.window.CUDO_SEED_DATA;
}
function comparableTable(items){
  return items.map(({id,...rest})=>rest);
}

const seed=loadSeed();
assert.ok(seed.partidos.items.length>0,'seed matches required');
assert.ok(seed.tabla.items.length>0,'seed standings required');

const golden=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
let runtime=createMockRuntime(golden,{createdAt:'2026-09-18T21:00:00-03:00'});

// Baseline convergence: runtime without sports-enabled source facts must preserve current seed behavior exactly.
let projection=deriveMockSportsProjection(runtime,{seedMatches:seed.partidos.items,seedTable:seed.tabla.items});
assert.equal(projection.partidos.items.length,seed.partidos.items.length);
assert.deepEqual(comparableTable(projection.tabla.items),comparableTable(seed.tabla.items));
assert.equal(projection.runtime_match_ids.length,0);

function apply(action,at){
  const out=applyMockAdminAction(runtime,{...action,expected_revision:runtime.revision,at});
  runtime=out.runtime;
  return out;
}

// One canonical source event.
apply({
  action_id:'SPORT-EVENT-001',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-SPORTS-01',
  display_name:'CUDO vs Deportivo Runtime',
  kind:'MATCH',
  state:'SCHEDULED',
  starts_at:'2026-10-18T15:45:00-03:00',
  resource_refs:['MOCK-RESOURCE-STADIUM-01'],
  local:'CUDO',
  visita:'Deportivo Runtime',
  categoria:'PRIMERA',
  competencia:'Campeonato Club OS',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
},'2026-09-18T21:01:00-03:00');

const event=runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-SPORTS-01');
assert.ok(event?.sports,'sports identity must live inside canonical event');
assert.equal(event.sports.local,'CUDO');
assert.equal(event.sports.visita,'Deportivo Runtime (Mock)');
assert.equal(event.sports.competencia,'Campeonato Club OS (Mock)');

// SCHEDULED projects as PROGRAMADO, no separate sports write.
projection=deriveMockSportsProjection(runtime,{seedMatches:seed.partidos.items,seedTable:seed.tabla.items});
let publicMatch=projection.partidos.items.find(x=>x.id==='mock-event-sports-01');
assert.ok(publicMatch);
assert.equal(publicMatch.estado_partido,'PROGRAMADO');
assert.equal(publicMatch.local,'CUDO');
assert.equal(publicMatch.visita,'Deportivo Runtime (Mock)');
assert.equal(publicMatch.categoria,'PRIMERA');
let runtimeRows=projection.tabla.items.filter(x=>x.competencia==='Campeonato Club OS (Mock)'&&x.categoria==='PRIMERA');
assert.equal(runtimeRows.length,2);
assert.ok(runtimeRows.every(x=>x.pj===0&&x.pts===0));

// LIVE stays public-compatible PROGRAMADO because public contract has no LIVE state.
apply({
  action_id:'SPORT-EVENT-LIVE-001',
  type:'EVENT_TRANSITION',
  event_id:'MOCK-EVENT-SPORTS-01',
  expected_state:'SCHEDULED',
  next_state:'LIVE'
},'2026-10-18T15:45:00-03:00');
projection=deriveMockSportsProjection(runtime,{seedMatches:seed.partidos.items,seedTable:seed.tabla.items});
publicMatch=projection.partidos.items.find(x=>x.id==='mock-event-sports-01');
assert.equal(publicMatch.estado_partido,'PROGRAMADO');

// Completion requires score in the same source action.
assert.throws(()=>applyMockAdminAction(runtime,{
  action_id:'SPORT-EVENT-DONE-BAD',
  type:'EVENT_TRANSITION',
  event_id:'MOCK-EVENT-SPORTS-01',
  expected_state:'LIVE',
  next_state:'COMPLETED',
  expected_revision:runtime.revision,
  at:'2026-10-18T18:00:00-03:00'
}),/completed MATCH requires non-negative integer score/);

const completed=apply({
  action_id:'SPORT-EVENT-DONE-001',
  type:'EVENT_TRANSITION',
  event_id:'MOCK-EVENT-SPORTS-01',
  expected_state:'LIVE',
  next_state:'COMPLETED',
  goles_local:2,
  goles_visita:1
},'2026-10-18T18:00:00-03:00');
assert.equal(completed.runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-SPORTS-01').sports.goles_local,2);
assert.equal(completed.runtime.state.events.find(x=>x.event_id==='MOCK-EVENT-SPORTS-01').sports.goles_visita,1);

// The same source event now drives public result AND standings.
projection=deriveMockSportsProjection(runtime,{seedMatches:seed.partidos.items,seedTable:seed.tabla.items});
publicMatch=projection.partidos.items.find(x=>x.id==='mock-event-sports-01');
assert.equal(publicMatch.estado_partido,'FINALIZADO');
assert.equal(publicMatch.goles_local,2);
assert.equal(publicMatch.goles_visita,1);
runtimeRows=projection.tabla.items.filter(x=>x.competencia==='Campeonato Club OS (Mock)'&&x.categoria==='PRIMERA');
const cudo=runtimeRows.find(x=>x.equipo==='CUDO');
const rival=runtimeRows.find(x=>x.equipo==='Deportivo Runtime (Mock)');
assert.deepEqual({pj:cudo.pj,pg:cudo.pg,pe:cudo.pe,pp:cudo.pp,gf:cudo.gf,gc:cudo.gc,dg:cudo.dg,pts:cudo.pts},{pj:1,pg:1,pe:0,pp:0,gf:2,gc:1,dg:1,pts:3});
assert.deepEqual({pj:rival.pj,pg:rival.pg,pe:rival.pe,pp:rival.pp,gf:rival.gf,gc:rival.gc,dg:rival.dg,pts:rival.pts},{pj:1,pg:0,pe:0,pp:1,gf:1,gc:2,dg:-1,pts:0});
assert.equal(cudo.posicion,1);
assert.equal(rival.posicion,2);

// No table mutation action exists: standings are derived from match source state.
assert.equal(runtime.applied_actions.some(x=>/TABLE|STANDING/.test(x.type)),false);

// Cancellation projection.
apply({
  action_id:'SPORT-EVENT-002',
  type:'EVENT_CREATE',
  event_id:'MOCK-EVENT-SPORTS-CANCEL-01',
  display_name:'CUDO vs Rival Cancel',
  kind:'MATCH',
  state:'SCHEDULED',
  starts_at:'2026-10-25T15:45:00-03:00',
  resource_refs:['MOCK-RESOURCE-STADIUM-01'],
  local:'CUDO',
  visita:'Rival Cancel',
  categoria:'PRIMERA',
  competencia:'Campeonato Club OS',
  recinto:'Cancha de la Orilla',
  counts_for_standings:true
},'2026-09-18T21:03:00-03:00');
apply({
  action_id:'SPORT-EVENT-CANCEL-001',
  type:'EVENT_TRANSITION',
  event_id:'MOCK-EVENT-SPORTS-CANCEL-01',
  expected_state:'SCHEDULED',
  next_state:'CANCELLED'
},'2026-09-18T21:04:00-03:00');
projection=deriveMockSportsProjection(runtime,{seedMatches:seed.partidos.items,seedTable:seed.tabla.items});
assert.equal(projection.partidos.items.find(x=>x.id==='mock-event-sports-cancel-01').estado_partido,'CANCELADO');

// Runtime source wins if an ID collides with seed; no duplicate public match.
const collisionSeed=[...seed.partidos.items,{...publicMatch,id:'mock-event-sports-01',local:'WRONG'}];
projection=deriveMockSportsProjection(runtime,{seedMatches:collisionSeed,seedTable:seed.tabla.items});
assert.equal(projection.partidos.items.filter(x=>x.id==='mock-event-sports-01').length,1);
assert.equal(projection.partidos.items.find(x=>x.id==='mock-event-sports-01').local,'CUDO');

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_MOCK_CLUB_TO_SPORTS_V1',
  baseline_seed_behavior_preserved:true,
  canonical_event_to_public_match:true,
  live_public_contract_mapping:'PROGRAMADO',
  completion_requires_score:true,
  result_to_standings_without_second_write:true,
  cancellation_projection:true,
  runtime_source_precedence:true,
  no_manual_table_action:true,
  production_write:false
},null,2));
