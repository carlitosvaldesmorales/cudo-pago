import assert from 'node:assert/strict';
import { calculatePublicStandings } from '../../sports-bus/worker/public-standings-entry.js';
import {
  CHAMPIONSHIP,
  SERIES_POINTS,
  assertCompetitionDomain
} from '../../sports-bus/worker/competition-domain.js';

assert.equal(assertCompetitionDomain(),true);
assert.deepEqual(SERIES_POINTS.TERCERA,{win:2,draw:1,loss:0,championship_code:'PRINCIPAL'});
assert.deepEqual(SERIES_POINTS.SEGUNDA,{win:3,draw:1,loss:0,championship_code:'PRINCIPAL'});
assert.deepEqual(SERIES_POINTS.PRIMERA,{win:4,draw:2,loss:0,championship_code:'PRINCIPAL'});
assert.deepEqual(SERIES_POINTS.SENIOR,{win:3,draw:1,loss:0,championship_code:'SENIOR'});
assert.deepEqual(CHAMPIONSHIP.PRINCIPAL.series,['TERCERA','SEGUNDA','PRIMERA']);
assert.equal(CHAMPIONSHIP.PRINCIPAL.max_points_per_matchday,9);
assert.deepEqual(CHAMPIONSHIP.SENIOR.series,['SENIOR']);
assert.equal(CHAMPIONSHIP.SENIOR.independent,true);
console.log('PASS ADN: Campeonato Principal is 3a+2a+1a with 9 maximum points per matchday; Senior is independent');

const teams=[
  {team_id:'ORILLA',canonical_name:'Unión Orilla',group_id:'A'},
  {team_id:'SANJUAN',canonical_name:'San Juan',group_id:'A'},
  {team_id:'TERCERO',canonical_name:'Tercero FC',group_id:'A'}
];

const results=[
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'TERCERA',home_score:2,away_score:3,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'SEGUNDA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'SENIOR',home_score:0,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F2-M1',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'PRIMERA',home_score:3,away_score:0,validation_status:'VERIFIED'},
  {match_id:'A-F3-M1',group_id:'A',home_id:'ORILLA',away_id:'TERCERO',series_code:'TERCERA',home_score:8,away_score:0,validation_status:'PENDING'}
];

let standings=calculatePublicStandings({teams,results,adjustments:[]});
assert.equal(standings.contract,'public-standings-v2');
assert.equal(standings.competition_model,'TWO_INDEPENDENT_CHAMPIONSHIPS_SHARED_MATCHDAY');
assert.equal(standings.championships.PRINCIPAL.max_points_per_matchday,9);
assert.equal(standings.championships.SENIOR.independent_from,'PRINCIPAL');

const groupA=standings.groups.find(group=>group.group_id==='A');
const principal=groupA.championships.find(item=>item.championship_code==='PRINCIPAL');
const senior=groupA.championships.find(item=>item.championship_code==='SENIOR');
const orillaPrincipal=principal.rows.find(row=>row.team_id==='ORILLA');
const sanJuanPrincipal=principal.rows.find(row=>row.team_id==='SANJUAN');
const orillaSenior=senior.rows.find(row=>row.team_id==='ORILLA');

assert.equal(orillaPrincipal.points,7);
assert.equal(sanJuanPrincipal.points,2);
assert.equal(orillaSenior.points,1);
assert.equal(orillaPrincipal.verified_series,3);
assert.equal(orillaSenior.verified_series,1);
console.log('PASS Fecha II example: Principal +7 and independent Senior +1');

assert.equal(orillaPrincipal.points,7,'PENDING result must not change championship standings');
console.log('PASS only VERIFIED results affect championships');

const perfectResults=[
  {match_id:'PERFECT',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'TERCERA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'PERFECT',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'SEGUNDA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'PERFECT',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'PRIMERA',home_score:1,away_score:0,validation_status:'VERIFIED'},
  {match_id:'PERFECT',group_id:'A',home_id:'ORILLA',away_id:'SANJUAN',series_code:'SENIOR',home_score:1,away_score:0,validation_status:'VERIFIED'}
];
const perfect=calculatePublicStandings({teams,results:perfectResults,adjustments:[]});
const perfectGroup=perfect.groups[0];
assert.equal(perfectGroup.championships.find(x=>x.championship_code==='PRINCIPAL').rows.find(x=>x.team_id==='ORILLA').points,9);
assert.equal(perfectGroup.championships.find(x=>x.championship_code==='SENIOR').rows.find(x=>x.team_id==='ORILLA').points,3);
console.log('PASS Senior victory does not turn the 9-point principal matchday into 12 points');

standings=calculatePublicStandings({
  teams,
  results,
  adjustments:[{
    adjustment_id:'sanction-1',competition_id:'ANFA-CHEPICA-2026',group_id:'A',championship_code:'PRINCIPAL',team_id:'ORILLA',points_delta:-5,reason:'QA',active:1
  }]
});
const adjusted=standings.groups[0].championships.find(item=>item.championship_code==='PRINCIPAL').rows.find(row=>row.team_id==='ORILLA');
assert.equal(adjusted.base_points,7);
assert.equal(adjusted.adjustment_points,-5);
assert.equal(adjusted.points,2);
console.log('PASS administrative adjustments target a championship explicitly and do not mutate scores');

const tieTeams=[
  {team_id:'A',canonical_name:'Club A',group_id:'A'},
  {team_id:'B',canonical_name:'Club B',group_id:'A'},
  {team_id:'C',canonical_name:'Club C',group_id:'A'}
];
const tieResults=[
  {match_id:'AB',group_id:'A',home_id:'A',away_id:'B',series_code:'TERCERA',home_score:1,away_score:1,validation_status:'VERIFIED'},
  {match_id:'AB',group_id:'A',home_id:'A',away_id:'B',series_code:'SEGUNDA',home_score:1,away_score:1,validation_status:'VERIFIED'},
  {match_id:'AB',group_id:'A',home_id:'A',away_id:'B',series_code:'PRIMERA',home_score:1,away_score:1,validation_status:'VERIFIED'},
  {match_id:'AC',group_id:'A',home_id:'A',away_id:'C',series_code:'TERCERA',home_score:8,away_score:0,validation_status:'VERIFIED'},
  {match_id:'BC',group_id:'A',home_id:'B',away_id:'C',series_code:'TERCERA',home_score:1,away_score:0,validation_status:'VERIFIED'}
];
const tied=calculatePublicStandings({teams:tieTeams,results:tieResults,adjustments:[]});
const tiedPrincipal=tied.groups[0].championships.find(item=>item.championship_code==='PRINCIPAL').rows;
const rowA=tiedPrincipal.find(row=>row.team_id==='A');
const rowB=tiedPrincipal.find(row=>row.team_id==='B');
assert.equal(rowA.points,rowB.points);
assert.notEqual(rowA.goal_difference,rowB.goal_difference);
assert.equal(rowA.position,rowB.position);
assert.equal(rowA.tiebreak_status,'PLAYOFF_REQUIRED');
assert.equal(rowB.tiebreak_status,'PLAYOFF_REQUIRED');
console.log('PASS goal difference never resolves an official tie');

assert.equal(standings.rules.goal_difference_is_tiebreaker,false);
assert.deepEqual(standings.rules.tiebreak_order,['TOTAL_POINTS','HEAD_TO_HEAD_POINTS','PLAYOFF_MATCH']);
console.log('RESULT: PASS');
