import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inspectReviewRunLog,
  assertEventDrivenOnly,
  materializeCertification,
} from './review_event_observer.mjs';

const realAppliedLog=`CUDO_REVIEW_TRIGGER_SOURCE=apps_script_form_submit\n{\n  "new_count": 2\n}\n{\n  "summary": [\n    {"status": "APLICADO"},\n    {"status": "BLOQUEADO_SIN_COINCIDENCIAS"}\n  ],\n  "writes_applied": 3\n}\n`;
const pingLog=`CUDO_REVIEW_TRIGGER_SOURCE=agent_ping\n{\n  "new_count": 2\n}\n{\n  "summary": [{"status": "APLICADO"}]\n}\n`;
const emptyRealLog=`CUDO_REVIEW_TRIGGER_SOURCE=apps_script_form_submit\n{\n  "new_count": 0\n}\n{\n  "summary": [{"status": "APLICADO"}]\n}\n`;
const blockedRealLog=`CUDO_REVIEW_TRIGGER_SOURCE=apps_script_form_submit\n{\n  "new_count": 1\n}\n{\n  "summary": [{"status": "BLOQUEADO_SIN_COINCIDENCIAS"}],\n  "writes_applied": 1\n}\n`;

assert.deepEqual(inspectReviewRunLog(realAppliedLog),{ok:true,source:'apps_script_form_submit',new_count:2,applied_count:1});
assert.equal(inspectReviewRunLog(pingLog).ok,false);
assert.equal(inspectReviewRunLog(pingLog).reason,'NOT_REAL_FORM_EVENT');
assert.equal(inspectReviewRunLog(emptyRealLog).ok,false);
assert.equal(inspectReviewRunLog(emptyRealLog).reason,'NO_NEW_FORM_RESPONSE');
assert.equal(inspectReviewRunLog(blockedRealLog).ok,false);
assert.equal(inspectReviewRunLog(blockedRealLog).reason,'NO_APPLIED_REVIEW_DECISION');
assert.equal(inspectReviewRunLog(blockedRealLog).applied_count,0);

assert.deepEqual(assertEventDrivenOnly(`name: test\non:\n  workflow_dispatch:\n`),{ok:true,polling:false,mode:'EVENT_DRIVEN_ONLY'});
assert.throws(()=>assertEventDrivenOnly("on:\n  schedule:\n    - cron: '*/5 * * * *'\n"),/POLLING_NOT_ALLOWED/);
assert.throws(()=>assertEventDrivenOnly("on:\n  schedule:\n    - cron: '17 9 * * *'\n"),/POLLING_NOT_ALLOWED/);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cudo-review-observer-'));
const result=materializeCertification({
  logText:realAppliedLog,
  workflowText:`name: test\non:\n  workflow_dispatch:\n`,
  metadata:{runId:'123',headSha:'abc',createdAt:'2026-09-15T00:00:00Z',title:'CUDO Review Engine · workflow_dispatch · apps_script_form_submit'},
  evidenceDir:tmp,
});
assert.equal(result.evidence.review_engine_run_id,123);
assert.equal(result.evidence.new_count,2);
assert.equal(result.evidence.applied_count,1);
assert.equal(result.evidence.polling,false);
assert.equal(result.evidence.execution_mode,'EVENT_DRIVEN_ONLY');
assert.ok(fs.existsSync(path.join(tmp,'event-driven-latest.json')));
assert.ok(fs.existsSync(path.join(tmp,'event-driven-latest.md')));

assert.throws(()=>materializeCertification({
  logText:pingLog,
  workflowText:`name: test\non:\n  workflow_dispatch:\n`,
  metadata:{runId:'124'},
  evidenceDir:path.join(tmp,'blocked-ping'),
}),/NOT_REAL_FORM_EVENT/);

assert.throws(()=>materializeCertification({
  logText:emptyRealLog,
  workflowText:`name: test\non:\n  workflow_dispatch:\n`,
  metadata:{runId:'125'},
  evidenceDir:path.join(tmp,'blocked-empty'),
}),/NO_NEW_FORM_RESPONSE/);

assert.throws(()=>materializeCertification({
  logText:blockedRealLog,
  workflowText:`name: test\non:\n  workflow_dispatch:\n`,
  metadata:{runId:'126'},
  evidenceDir:path.join(tmp,'blocked-unapplied'),
}),/NO_APPLIED_REVIEW_DECISION/);

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_EVENT_OBSERVER_EVENT_DRIVEN_ONLY',
  cases:[
    'real-form-event-with-new-and-applied-review-passes',
    'agent-ping-is-not-a-real-form-event',
    'real-source-with-zero-new-responses-fails',
    'real-source-with-only-blocked-review-fails',
    'workflow-without-schedule-passes',
    'five-minute-cron-is-forbidden',
    'daily-cron-is-also-forbidden',
    'evidence-materializes-only-after-real-applied-event-pass'
  ]
},null,2));
