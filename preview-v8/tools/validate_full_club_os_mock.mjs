import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const mock=read('preview-v8/data/club-os-mock.json');
const ops=read('preview-v8/data/operacion.json');
const fin=read('preview-v8/data/finanzas.json');
const resources=read('preview-v8/data/recursos.json');
const governance=read('preview-v8/data/gobernanza.json');
const evidence=read('preview-v8/data/evidencia.json');
const manifest=read('preview-v8/data/mock-manifest.json');

assert.equal(mock.schema_version,'CUDO_CLUB_OS_GOLDEN_MOCK_V1');
assert.equal(mock.environment,'qa-v8-mock');
assert.equal(mock.mock,true);
assert.equal(mock.production_write,false);
assert.equal(manifest.golden_fixture,true);
assert.equal(manifest.strategy,'FULL_CLUB_OS_SCENARIO_NOT_ONLY_SPORTS_CONTENT');

const requiredObjectTypes=[
  'ACTOR','ACTIVITY_EVENT','RESOURCE_FACILITY','RULE_DECISION',
  'WORK_ITEM','FINANCIAL_OBLIGATION','FINANCIAL_MOVEMENT','DOCUMENT_EVIDENCE'
];
for(const type of requiredObjectTypes) assert.ok(mock.coverage.object_types.includes(type),`missing object type ${type}`);

const requiredWorkStates=['OPEN','IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED'];
for(const state of requiredWorkStates){
  assert.ok(mock.work_items.some(x=>x.state===state),`missing work state ${state}`);
}
assert.ok(mock.work_items.some(x=>x.attention==='OVERDUE'),'missing overdue work');
assert.ok(mock.work_items.some(x=>(x.blocker_refs||[]).length>0),'missing blocker');
assert.ok(mock.work_items.some(x=>(x.dependency_refs||[]).length>0),'missing dependency');
assert.ok(mock.work_items.some(x=>(x.evidence_refs||[]).length>0),'missing work evidence');
assert.ok(mock.work_items.some(x=>(x.financial_obligation_refs||[]).length>0),'missing work->finance relation');

for(const state of ['OPEN','PARTIALLY_SETTLED','SETTLED']){
  assert.ok(mock.financial_obligations.some(x=>x.state===state),`missing obligation state ${state}`);
}
assert.ok(mock.financial_obligations.some(x=>x.direction==='PAYABLE'));
assert.ok(mock.financial_obligations.some(x=>x.direction==='RECEIVABLE'));
assert.ok(mock.financial_movements.some(x=>x.status==='PENDING'));
assert.ok(mock.financial_movements.some(x=>x.status==='CONFIRMED'));
assert.ok(mock.financial_movements.some(x=>x.reconciliation_state==='RECONCILED'));
assert.ok(mock.evidence.some(x=>x.state==='AVAILABLE'));
assert.ok(mock.evidence.some(x=>x.state==='MISSING'));
assert.ok(mock.decisions.some(x=>x.state==='PENDING_HUMAN'));
assert.ok(mock.decisions.some(x=>['APPROVED','APPLIED'].includes(x.state)));
assert.ok(mock.resources.some(x=>x.attention==='BLOCKING'));

assert.equal(ops.mock,true);
assert.equal(ops.summary.total,mock.work_items.length);
for(const state of requiredWorkStates){
  assert.ok(ops.items.some(x=>x.state===state),`operational projection missing ${state}`);
}
assert.ok(ops.items.some(x=>(x.blockers?.refs||[]).length>0));
assert.ok(ops.items.some(x=>(x.dependencies?.refs||[]).length>0));
assert.ok(ops.items.some(x=>x.financial_effect));

assert.equal(fin.mock,true);
assert.equal(fin.summary.obligations_total,mock.financial_obligations.length);
assert.ok(fin.summary.outstanding_payable>0);
assert.ok(fin.summary.outstanding_receivable>0);
assert.ok(fin.summary.confirmed_movements>0);
assert.ok(fin.summary.pending_movements>0);

assert.equal(resources.mock,true);
assert.ok(resources.summary.blocking>0);
assert.equal(governance.mock,true);
assert.ok(governance.summary.pending_human>0);
assert.equal(evidence.mock,true);
assert.ok(evidence.summary.evidence_missing>0);
assert.ok(evidence.summary.audit_events>0);

const serialized=JSON.stringify(mock);
assert.ok(!serialized.includes('artifact:'),'golden mock must not claim real artifact evidence');
assert.ok(!serialized.includes('source_system":"CUDO_REAL'),'golden mock must not claim real source system');
assert.ok(mock.actors.every(x=>/Mock|MOCK/i.test(x.display_name)),'all mock actor display names must be obviously synthetic');

console.log(JSON.stringify({
  ok:true,
  environment:'qa-v8-mock',
  strategy:'FULL_CLUB_OS_SCENARIO_NOT_ONLY_SPORTS_CONTENT',
  actors:mock.actors.length,
  events:mock.events.length,
  resources:mock.resources.length,
  decisions:mock.decisions.length,
  work_items:mock.work_items.length,
  work_states:[...new Set(mock.work_items.map(x=>x.state))].sort(),
  obligations:mock.financial_obligations.length,
  movements:mock.financial_movements.length,
  evidence:mock.evidence.length,
  audit_events:mock.audit.length,
  blockers:true,
  dependencies:true,
  overdue:true,
  governance:true,
  finance:true,
  evidence_audit:true,
  sports_content_fixture:'preview-v8/shared/seed-data.js',
  production_write:false
},null,2));
