import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1SqliteAdapter } from './d1-sqlite-adapter.mjs';
import { loadResultControlPlane, EXPECTED_SERIES } from '../../sports-bus/worker/result-control-plane-model.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const migrations=path.join(root,'sports-bus','migrations');
const db=new D1SqliteAdapter();

for(const file of fs.readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort()){
  db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
}

try{
  const model=await loadResultControlPlane(db);
  assert.equal(model.phase_contract,'GROUP_PHASE_ALL_FOUR_SERIES');
  assert.deepEqual(model.expected_series,[...EXPECTED_SERIES]);
  assert.ok(model.matches.length>0,'group phase fixture must contain matches');
  assert.equal(model.summary.expected_slots,model.matches.length*4);
  assert.equal(model.summary.MISSING+model.summary.OFFICIAL+model.summary.DISPUTED+model.summary.ANNULLED,model.summary.expected_slots);
  for(const match of model.matches){
    assert.equal(match.expected_slots,4);
    assert.equal(match.slots.length,4);
    assert.deepEqual(match.slots.map(x=>x.series_code),[...EXPECTED_SERIES]);
  }
  const empty=model.matches.flatMap(m=>m.slots).find(s=>s.state==='MISSING');
  assert.ok(empty,'fixture must expose at least one expected slot without a stored result');
  assert.equal(empty.observed,false);
  assert.equal(empty.result_id,null);

  const stored=model.matches.flatMap(m=>m.slots).find(s=>s.observed);
  assert.ok(stored,'fixture must expose at least one observed result');
  assert.notEqual(stored.state,'MISSING');

  const byeIds=new Set((model.byes||[]).map(x=>x.bye_id));
  assert.equal(byeIds.size,(model.byes||[]).length);

  console.log(`PASS desired inventory: ${model.matches.length} matches x 4 = ${model.summary.expected_slots} result slots`);
  console.log(`PASS actual overlay: ${model.summary.OFFICIAL} official / ${model.summary.MISSING} missing / ${model.summary.DISPUTED} disputed / ${model.summary.ANNULLED} annulled`);
  console.log('PASS absence of stored result is represented as MISSING, not omitted');
  console.log('PASS byes remain separate and do not create result slots');
  console.log('RESULT: PASS');
}finally{
  db.close();
}
