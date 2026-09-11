import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const registryPath=path.join(root,'product','modules','registry.json');
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));

const expectedLifecycle=['DEFINED','VISUALIZED','PRODUCT_VALIDATED','IMPLEMENTED','QA_PASSED','CONSUMABLE'];
assert.deepEqual(registry.lifecycle,expectedLifecycle,'Lifecycle changed without updating the gate contract');
assert.equal(registry.schema_version,1,'Unsupported product module registry schema');
assert.ok(Array.isArray(registry.modules)&&registry.modules.length>0,'At least one product module must be registered');

const rank=new Map(expectedLifecycle.map((s,i)=>[s,i]));
const byId=new Map();
for(const m of registry.modules){
  assert.ok(m.id&&typeof m.id==='string', 'Module id is required');
  assert.equal(byId.has(m.id),false,`Duplicate module id: ${m.id}`);
  byId.set(m.id,m);
  assert.ok(rank.has(m.status),`${m.id}: invalid status ${m.status}`);
  for(const field of ['name','consumer_type','consumer','goal','entry','result','postcondition','authority']){
    assert.ok(typeof m[field]==='string'&&m[field].trim(),`${m.id}: missing ${field}`);
  }
  assert.ok(['HUMAN','MACHINE'].includes(m.consumer_type),`${m.id}: invalid consumer_type`);
  assert.ok(Array.isArray(m.dependencies),`${m.id}: dependencies must be an array`);
  assert.ok(Array.isArray(m.runtime_paths),`${m.id}: runtime_paths must be an array`);

  const r=rank.get(m.status);
  if(r>=rank.get('VISUALIZED')){
    assert.ok(typeof m.visual_contract==='string'&&m.visual_contract.trim(),`${m.id}: VISUALIZED requires visual_contract`);
    const visualPath=path.join(root,m.visual_contract);
    assert.ok(fs.existsSync(visualPath),`${m.id}: visual_contract does not exist: ${m.visual_contract}`);
    if(m.consumer_type==='HUMAN'){
      assert.match(m.visual_contract,/\.(png|jpe?g|webp|pdf|html)$/i,`${m.id}: human visual_contract must be a versioned visual artifact`);
    }
  }
  if(r>=rank.get('PRODUCT_VALIDATED')){
    assert.ok(typeof m.product_approval==='string'&&m.product_approval.trim(),`${m.id}: PRODUCT_VALIDATED requires explicit product_approval evidence`);
  }
  if(r>=rank.get('IMPLEMENTED')){
    assert.ok(Array.isArray(m.implementation_evidence)&&m.implementation_evidence.length>0,`${m.id}: IMPLEMENTED requires implementation_evidence`);
  }
  if(r>=rank.get('QA_PASSED')){
    assert.ok(Array.isArray(m.qa_evidence)&&m.qa_evidence.length>0,`${m.id}: QA_PASSED requires qa_evidence`);
  }
  if(r>=rank.get('CONSUMABLE')){
    assert.ok(typeof m.final_state_evidence==='string'&&m.final_state_evidence.trim(),`${m.id}: CONSUMABLE requires final_state_evidence`);
  }
  if(m.technical_state==='EXISTS_AHEAD_OF_PRODUCT'){
    assert.ok(r<rank.get('PRODUCT_VALIDATED'),`${m.id}: implementation cannot remain classified ahead-of-product after product validation`);
  }
}

for(const m of registry.modules){
  for(const dep of m.dependencies){
    assert.ok(byId.has(dep),`${m.id}: unknown dependency ${dep}`);
    if(rank.get(m.status)>=rank.get('PRODUCT_VALIDATED')){
      assert.equal(byId.get(dep).status,'CONSUMABLE',`${m.id}: dependency ${dep} must be CONSUMABLE before product validation or implementation can advance`);
    }
  }
}

const changed=String(process.env.CHANGED_FILES||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
if(changed.length){
  const violations=[];
  for(const m of registry.modules){
    if(rank.get(m.status)>=rank.get('PRODUCT_VALIDATED')) continue;
    const touched=changed.filter(file=>m.runtime_paths.some(p=>file===p||file.startsWith(`${p}/`)));
    if(touched.length){
      violations.push(`${m.id} is ${m.status}; runtime changes are blocked until PRODUCT_VALIDATED. Touched: ${touched.join(', ')}`);
    }
  }
  if(violations.length){
    console.error('PRODUCT MODULE GATE: BLOCKED');
    for(const v of violations) console.error(`- ${v}`);
    process.exit(1);
  }
}

for(const m of registry.modules){
  console.log(`MODULE ${m.id}: ${m.status}${m.blocker?` · blocker=${m.blocker}`:''}`);
}
console.log('RESULT: PASS');
