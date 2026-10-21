import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {D1SqliteAdapter} from './d1-sqlite-adapter.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const db=new D1SqliteAdapter();

function applyUntil(nameExclusive){
  for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
    if(file===nameExclusive) break;
    db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  }
}
async function one(sql,...args){return db.prepare(sql).bind(...args).first()}
async function all(sql,...args){return (await db.prepare(sql).bind(...args).all()).results}

try{
  applyUntil('0030_secretariat_awarded_win_policy.sql');
  const now='2026-10-20T20:00:00.000Z';

  await db.prepare("INSERT OR REPLACE INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at) VALUES ('A-F3-M1-SEGUNDA','A-F3-M1','SEGUNDA',1,1,'VERIFIED','QA_LEGACY','QA legacy draw','qa-legacy','2026-09-13',?,?)").bind(now,now).run();

  const resolutionId='sec-A-F3-M1-SEGUNDA-JUV-CHEPICA-to-SANTA-ELENA-legacy';
  await db.prepare("INSERT INTO secretariat_standings_resolutions (resolution_id,competition_id,season_id,group_id,match_id,series_code,championship_code,resolution_type,sanctioned_team_id,beneficiary_team_id,points_amount,reason,source_home_score,source_away_score,source_governance_version,actor_id,actor_role,source_label,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'TRANSFER_POINTS',?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?)")
    .bind(resolutionId,'ANFA-CHEPICA-2026','2026','A','A-F3-M1','SEGUNDA','PRINCIPAL','JUV-CHEPICA','SANTA-ELENA',1,'Secretaría reclamo contra Juventud de Chépica en Segunda',1,1,1,'5554938590','SUPER_ADMIN','Secretaría resolución informada por SUPER_ADMIN',now,now).run();

  await db.prepare("INSERT INTO standings_adjustments (adjustment_id,competition_id,group_id,championship_code,team_id,points_delta,reason,source_label,effective_on,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)")
    .bind(resolutionId+':DEBIT','ANFA-CHEPICA-2026','A','PRINCIPAL','JUV-CHEPICA',-1,'Secretaría reclamo contra Juventud de Chépica en Segunda','Secretaría resolución informada por SUPER_ADMIN',null,now,now).run();
  await db.prepare("INSERT INTO standings_adjustments (adjustment_id,competition_id,group_id,championship_code,team_id,points_delta,reason,source_label,effective_on,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)")
    .bind(resolutionId+':CREDIT','ANFA-CHEPICA-2026','A','PRINCIPAL','SANTA-ELENA',1,'Secretaría reclamo contra Juventud de Chépica en Segunda','Secretaría resolución informada por SUPER_ADMIN',null,now,now).run();

  db.exec(fs.readFileSync(path.join(migrations,'0030_secretariat_awarded_win_policy.sql'),'utf8'));

  const resolution=await one("SELECT * FROM secretariat_standings_resolutions WHERE resolution_id=?",resolutionId);
  assert.equal(resolution.resolution_policy,'AWARD_OPPONENT_WIN');
  assert.equal(resolution.points_amount,3);
  assert.equal(resolution.sanctioned_points_before,1);
  assert.equal(resolution.sanctioned_target_points,0);
  assert.equal(resolution.sanctioned_points_delta,-1);
  assert.equal(resolution.beneficiary_points_before,1);
  assert.equal(resolution.beneficiary_target_points,3);
  assert.equal(resolution.beneficiary_points_delta,2);

  const adjustments=await all("SELECT adjustment_id,team_id,points_delta,active FROM standings_adjustments WHERE adjustment_id LIKE ? ORDER BY team_id",resolutionId+'%');
  assert.deepEqual(adjustments.map(x=>[x.team_id,x.points_delta,x.active]),[
    ['JUV-CHEPICA',-1,1],
    ['SANTA-ELENA',2,1]
  ]);

  const score=await one("SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id='A-F3-M1' AND series_code='SEGUNDA'");
  assert.equal(score.home_score,1);
  assert.equal(score.away_score,1);
  assert.equal(score.validation_status,'VERIFIED');

  const event=await one("SELECT event_type,payload_json FROM events WHERE event_id='sec-policy-fix-A-F3-M1-SEGUNDA-20261021'");
  assert.equal(event.event_type,'standings.secretariat.award_win.corrected');
  const payload=JSON.parse(event.payload_json);
  assert.equal(payload.sanctioned_delta,-1);
  assert.equal(payload.beneficiary_delta,2);
  assert.equal(payload.beneficiary_target_points,3);

  const audit=await one("SELECT action,allowed FROM permission_audit WHERE audit_id='sec-policy-fix-A-F3-M1-SEGUNDA-20261021:AUDIT'");
  assert.equal(audit.action,'CORRECT_SECRETARIAT_AWARD_WIN_POLICY');
  assert.equal(audit.allowed,1);

  console.log('PASS migration converts legacy La Ruda +1 to awarded-win +2 without changing 1-1 score');
  console.log('RESULT: PASS');
}finally{
  db.close();
}
