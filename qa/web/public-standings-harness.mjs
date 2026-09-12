import assert from 'node:assert/strict';
import {
  calculatePublicStandings,
  SERIES_POINTS
} from '../../sports-bus/worker/public-standings-entry.js';

assert.deepEqual(SERIES_POINTS.TERCERA,{win:2,draw:1,loss:0});
assert.deepEqual(SERIES_POINTS.SEGUNDA,{win:3,draw:1,loss:0});
assert.deepEqual(SERIES_POINTS.PRIMERA,{win:4,draw:2,loss:0});
assert.deepEqual(SERIES_POINTS.SENIOR,{win:3,draw:1,loss:0});
console.log('PASS official 2026 series point weights');

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
const groupA=standings.groups.find(group=>group.group_id==='A');
const general=groupA.tables.find(table=>table.table_code==='GENERAL');
const senior=groupA.tables.find(table=>table.table_code==='SENIOR');
const orillaGeneral=general.rows.find(row=>row.team_id==='ORILLA');
const sanJuanGeneral=general.rows.find(row=>row.team_id==='SANJUAN');
const orillaSenior=senior.rows.find(row=>row.team_id==='ORILLA');

assert.equal(orillaGeneral.points,7);
assert.equal(sanJuanGeneral.points,2);
assert.equal(orillaSenior.points,1);
assert.equal(orillaGeneral.verified_series,3);
assert.equal(orillaGeneral.goals_for,6);
assert.equal(orillaGeneral.goals_against,3);
console.log('PASS recovered Fecha II example: General +7 and Senior +1');

assert.equal(orillaGeneral.points,7,'PENDING result must not change standings');
console.log('PASS only VERIFIED results affect standings');

standings=calculatePublicStandings({
  teams,
  results,
  adjustments:[{
    adjustment_id:'sanction-1',competition_id:'ANFA-CHEPICA-2026',group_id:'A',table_code:'GENERAL',team_id:'ORILLA',points_delta:-5,reason:'QA',active:1
  }]
});
const adjusted=standings.groups[0].tables.find(table=>table.table_code==='GENERAL').rows.find(row=>row.team_id==='ORILLA');
assert.equal(adjusted.base_points,7);
assert.equal(adjusted.adjustment_points,-5);
assert.equal(adjusted.points,2);
console.log('PASS administrative point adjustments are explicit and do not mutate scores');

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
const tiedGeneral=tied.groups[0].tables.find(table=>table.table_code==='GENERAL').rows;
const rowA=tiedGeneral.find(row=>row.team_id==='A');
const rowB=tiedGeneral.find(row=>row.team_id==='B');
assert.equal(rowA.points,rowB.points);
assert.notEqual(rowA.goal_difference,rowB.goal_difference);
assert.equal(rowA.position,rowB.position);
assert.equal(rowA.tiebreak_status,'PLAYOFF_REQUIRED');
assert.equal(rowB.tiebreak_status,'PLAYOFF_REQUIRED');
console.log('PASS goal difference never resolves an official tie');

assert.equal(standings.rules.goal_difference_is_tiebreaker,false);
assert.deepEqual(standings.rules.tiebreak_order,['TOTAL_POINTS','HEAD_TO_HEAD_POINTS','PLAYOFF_MATCH']);
console.log('RESULT: PASS');
