import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildRealFlowSanRamonArtifacts} from './real_flow_san_ramon_runtime.mjs';

const {artifacts}=buildRealFlowSanRamonArtifacts();
const paths={
  publicJson:'qa-v8-google/evidence/real-flow-san-ramon/public.json',
  adminFinance:'qa-v8-google/evidence/real-flow-san-ramon/admin-finance.json',
  sheetModel:'qa-v8-google/evidence/real-flow-san-ramon/financial-obligations.json',
  manifest:'qa-v8-google/evidence/real-flow-san-ramon/manifest.json'
};
for(const [key,path] of Object.entries(paths)){
  const stored=JSON.parse(fs.readFileSync(path,'utf8'));
  assert.deepEqual(stored,artifacts[key],`${path} drifted from deterministic runtime output`);
}
assert.equal(artifacts.manifest.production_write,false);
assert.equal(artifacts.publicJson.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(artifacts.adminFinance.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(artifacts.sheetModel.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(artifacts.publicJson.source_revision,artifacts.manifest.source_revision);
assert.equal(artifacts.adminFinance.source_revision,artifacts.manifest.source_revision);
assert.equal(artifacts.sheetModel.source_revision,artifacts.manifest.source_revision);

console.log(JSON.stringify({
  ok:true,
  artifact_set:'CUDO_REAL_FLOW_SAN_RAMON_VERSIONED_QA_ARTIFACTS_V1',
  source_revision:artifacts.manifest.source_revision,
  transaction_id:artifacts.manifest.transaction_id,
  files:Object.values(paths),
  deterministic_regeneration:true,
  production_write:false
},null,2));
