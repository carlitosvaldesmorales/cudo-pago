import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAdaptiveControlProjection} from '../shared/adaptive-control-projection.mjs';

const club=JSON.parse(fs.readFileSync('preview-v8/data/club-os-mock.json','utf8'));
const control=JSON.parse(fs.readFileSync('preview-v8/data/adaptive-control-mock.json','utf8'));
const view=buildAdaptiveControlProjection(club,control);

assert.equal(view.goal.initial_gap,1000000);
assert.equal(view.goal.current_gap,600000);
assert.equal(view.goal.gap_delta,-400000);
assert.equal(view.human_capacity.unassigned_work_count,1);
assert.equal(view.human_capacity.overload_claimed,false);
assert.ok(view.human_capacity.people.some(x=>x.active_count>=2));
assert.ok(view.attention.some(x=>x.signal_code==='REQUIRED_WORK_UNASSIGNED'));
assert.ok(view.attention.some(x=>x.signal_code==='WORK_BLOCKED_OR_DEPENDENCY_PENDING'));
assert.ok(view.attention.some(x=>x.signal_code==='WAITING_EXTERNAL'));
assert.ok(view.attention.some(x=>x.signal_code==='RESOURCE_NOT_READY'));
assert.equal(view.arbitration.ok,true);
assert.deepEqual(view.arbitration.executable_now.map(x=>x.action_id),['MOCK-ACTION-PREPARE-BINGO-01','MOCK-ACTION-PREPARE-GRANT-01']);
assert.equal(view.arbitration.blocked[0].action_id,'MOCK-ACTION-EXTERNAL-GRANT-DECISION-01');
assert.deepEqual(view.arbitration.decision.selected_action_ids,['MOCK-ACTION-PREPARE-GRANT-01']);
assert.equal(view.invariants.global_priority_score,false);
assert.equal(view.invariants.overload_claimed,false);
assert.equal(view.invariants.global_priority_policy_created,false);
assert.equal(view.invariants.production_write,false);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_ADAPTIVE_CONTROL_WEB_MOCK_V1',
  initial_gap:view.goal.initial_gap,
  current_gap:view.goal.current_gap,
  attention_signals:view.attention.length,
  active_work:view.human_capacity.active_work_count,
  unassigned_work:view.human_capacity.unassigned_work_count,
  people_with_active_work:view.human_capacity.people.length,
  executable_now:view.arbitration.executable_now.map(x=>x.action_id),
  blocked:view.arbitration.blocked.map(x=>x.action_id),
  overload_claimed:false,
  global_priority_score:false,
  production_write:false
},null,2));
