import assert from 'node:assert/strict';
import fs from 'node:fs';

const access=fs.readFileSync('sports-bus/worker/access-control.js','utf8');
const registry=JSON.parse(fs.readFileSync('docs/architecture/super-admin-capability-reachability-v1.json','utf8'));

const superBlock=access.match(/\[ROLE\.SUPER_ADMIN\]:\s*new Set\(\[([\s\S]*?)\]\)/);
assert.ok(superBlock,'SUPER_ADMIN capability set must exist');
const declared=[...superBlock[1].matchAll(/CAPABILITY\.([A-Z0-9_]+)/g)].map(m=>m[1]);
assert.ok(declared.length>0,'SUPER_ADMIN must declare capabilities');

const dispositions=registry.dispositions||[];
assert.equal(registry.role,'SUPER_ADMIN');
assert.equal(new Set(dispositions.map(x=>x.capability)).size,dispositions.length,'capability dispositions must be unique');
assert.deepEqual(
  [...new Set(dispositions.map(x=>x.capability))].sort(),
  [...new Set(declared)].sort(),
  'every declared SUPER_ADMIN capability must have exactly one reachability disposition'
);

const allowed=new Set(['ABSORBED','MOVED','GAP']);
for(const item of dispositions){
  assert.ok(allowed.has(item.status),`invalid status for ${item.capability}`);
  assert.ok(Array.isArray(item.evidence)&&item.evidence.length>0,`${item.capability} requires evidence`);
  if(item.status==='ABSORBED'||item.status==='MOVED'){
    assert.ok(Array.isArray(item.entrypoints)&&item.entrypoints.length>0,`${item.capability} requires a reachable entrypoint`);
  }
  if(item.status==='GAP'){
    assert.ok(item.gap_id,`${item.capability} GAP requires gap_id`);
    assert.ok(item.next_discovery,`${item.capability} GAP requires next_discovery`);
  }
}

const byCapability=Object.fromEntries(dispositions.map(x=>[x.capability,x]));
for(const capability of ['REVIEW_RESULT','GOVERN_RESULTS','MANAGE_CLUB_RESULTS','MANAGE_ACCESS']){
  assert.equal(byCapability[capability]?.status,'ABSORBED',`${capability} must remain absorbed by the canonical admin surface`);
}
assert.equal(byCapability.READ_COMPETITION?.status,'MOVED');
assert.equal(byCapability.OBSERVE_RESULT?.status,'MOVED');

for(const capability of ['MANAGE_CLUBS','MANAGE_CONTENT','VIEW_AUDIT','PUBLISH_MATCH_EVENT','MANAGE_POLICY','GRANT_SUPER_ADMIN']){
  assert.equal(byCapability[capability]?.status,'GAP',`${capability} must remain an explicit GAP until evidence changes`);
}

assert.equal(byCapability.GRANT_SUPER_ADMIN.gap_id,'GAP_SUPER_ADMIN_RECOVERY_AND_SECOND_ADMIN');
assert.match(byCapability.GRANT_SUPER_ADMIN.note,/security boundary/i);

console.log('PASS all declared SUPER_ADMIN capabilities have an explicit reachability disposition');
console.log('PASS result/access capabilities remain reachable after canonical surface supersession');
console.log('PASS unresolved privileged/platform capabilities remain explicit GAPs instead of inferred features');
console.log('RESULT: PASS');
