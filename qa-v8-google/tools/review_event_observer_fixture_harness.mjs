import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inspectReviewRunLog,
  reducePollingToDaily,
  materializeCertification,
  FAST_CRON,
  DAILY_CRON,
} from './review_event_observer.mjs';

const realLog=`CUDO_REVIEW_TRIGGER_SOURCE=apps_script_form_submit\n{\n  "new_count": 2,\n  "writes_applied": 2\n}\n`;
const pingLog=`CUDO_REVIEW_TRIGGER_SOURCE=agent_ping\n{\n  "new_count": 2\n}\n`;
const emptyRealLog=`CUDO_REVIEW_TRIGGER_SOURCE=apps_script_form_submit\n{\n  "new_count": 0\n}\n`;

assert.deepEqual(inspectReviewRunLog(realLog),{ok:true,source:'apps_script_form_submit',new_count:2});
assert.equal(inspectReviewRunLog(pingLog).ok,false);
assert.equal(inspectReviewRunLog(pingLog).reason,'NOT_REAL_FORM_EVENT');
assert.equal(inspectReviewRunLog(emptyRealLog).ok,false);
assert.equal(inspectReviewRunLog(emptyRealLog).reason,'NO_NEW_FORM_RESPONSE');

{
  const r=reducePollingToDaily(`schedule:\n${FAST_CRON}\n`);
  assert.equal(r.changed,true);
  assert.ok(r.text.includes(DAILY_CRON));
  assert.ok(!r.text.includes(FAST_CRON));
}
{
  const r=reducePollingToDaily(`schedule:\n${DAILY_CRON}\n`);
  assert.equal(r.changed,false);
}
assert.throws(()=>reducePollingToDaily("schedule:\n    - cron: '0 * * * *'\n"),/Unexpected scheduler contract/);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cudo-review-observer-'));
const result=materializeCertification({
  logText:realLog,
  workflowText:`name: test\nschedule:\n${FAST_CRON}\n`,
  metadata:{runId:'123',headSha:'abc',createdAt:'2026-09-15T00:00:00Z',title:'CUDO Review Engine · workflow_dispatch · apps_script_form_submit'},
  evidenceDir:tmp,
});
assert.equal(result.evidence.review_engine_run_id,123);
assert.equal(result.evidence.new_count,2);
assert.equal(result.schedule.changed,true);
assert.ok(fs.existsSync(path.join(tmp,'event-driven-latest.json')));
assert.ok(fs.existsSync(path.join(tmp,'event-driven-latest.md')));

assert.throws(()=>materializeCertification({
  logText:pingLog,
  workflowText:`schedule:\n${FAST_CRON}\n`,
  metadata:{runId:'124'},
  evidenceDir:path.join(tmp,'blocked-ping'),
}),/NOT_REAL_FORM_EVENT/);

assert.throws(()=>materializeCertification({
  logText:emptyRealLog,
  workflowText:`schedule:\n${FAST_CRON}\n`,
  metadata:{runId:'125'},
  evidenceDir:path.join(tmp,'blocked-empty'),
}),/NO_NEW_FORM_RESPONSE/);

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_EVENT_OBSERVER_SAFETY_GATE',
  cases:[
    'real-form-event-with-new-response-passes',
    'agent-ping-cannot-retire-polling',
    'real-source-with-zero-new-responses-cannot-retire-polling',
    'five-minute-cron-reduces-to-daily',
    'daily-cron-is-idempotent',
    'unexpected-cron-fails-closed',
    'evidence-materializes-only-after-real-event-pass'
  ]
},null,2));
