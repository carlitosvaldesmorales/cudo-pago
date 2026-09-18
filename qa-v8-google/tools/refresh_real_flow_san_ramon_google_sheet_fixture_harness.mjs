import assert from 'node:assert/strict';
import {
  QA_SPREADSHEET_ID,
  ADAPTER_VERSION,
  buildExpectedReadModel,
  manifestRevision,
  planQaSheetRefresh
} from './refresh_real_flow_san_ramon_google_sheet.mjs';

const expected=buildExpectedReadModel();
assert.equal(expected.spreadsheet_id,QA_SPREADSHEET_ID);
assert.equal(expected.source_revision,'CUDO-REVISION-C3E389FDF7B36D61D27F645B');
assert.equal(expected.obligation_values[1][3],43680);
assert.equal(expected.obligation_values[1][5],43680);
assert.equal(manifestRevision(expected.manifest_values),expected.source_revision);
assert.equal(expected.manifest_values.at(-1)[1],ADAPTER_VERSION);

const noop=planQaSheetRefresh({
  currentObligations:expected.obligation_values,
  currentManifest:expected.manifest_values,
  apply:true,
  expectedCurrentRevision:expected.source_revision
});
assert.equal(noop.ok,true);
assert.equal(noop.status,'NOOP_ALREADY_CURRENT');
assert.equal(noop.writes_applied,0);

const staleManifest=expected.manifest_values.map(row=>[...row]);
staleManifest.find(row=>row[0]==='SOURCE_REVISION')[1]='CUDO-REVISION-QA-ADAPTER-PROBE-V0';
const staleObligations=expected.obligation_values.map(row=>[...row]);
staleObligations[1][3]=42000;
staleObligations[1][5]=42000;

const dry=planQaSheetRefresh({
  currentObligations:staleObligations,
  currentManifest:staleManifest,
  apply:false
});
assert.equal(dry.status,'DRY_RUN_CHANGES_REQUIRED');
assert.equal(dry.writes_planned,2);

const blocked=planQaSheetRefresh({
  currentObligations:staleObligations,
  currentManifest:staleManifest,
  apply:true
});
assert.equal(blocked.ok,false);
assert.equal(blocked.status,'BLOCKED_EXPECTED_CURRENT_REVISION_REQUIRED');

const conflict=planQaSheetRefresh({
  currentObligations:staleObligations,
  currentManifest:staleManifest,
  apply:true,
  expectedCurrentRevision:'WRONG'
});
assert.equal(conflict.ok,false);
assert.equal(conflict.status,'CONFLICT_CURRENT_REVISION_MISMATCH');

const ready=planQaSheetRefresh({
  currentObligations:staleObligations,
  currentManifest:staleManifest,
  apply:true,
  expectedCurrentRevision:'CUDO-REVISION-QA-ADAPTER-PROBE-V0'
});
assert.equal(ready.ok,true);
assert.equal(ready.status,'READY_TO_APPLY');
assert.equal(ready.writes_planned,2);

console.log(JSON.stringify({
  ok:true,
  adapter:ADAPTER_VERSION,
  spreadsheet_allowlist:QA_SPREADSHEET_ID,
  idempotent_noop:true,
  dry_run:true,
  expected_revision_required:true,
  revision_conflict_fail_closed:true,
  ready_apply_when_revision_matches:true,
  production_write:false
},null,2));
