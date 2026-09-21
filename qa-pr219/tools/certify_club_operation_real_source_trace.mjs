import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('preview-v8/club-operacion-lab/index.html','utf8');
const projection=JSON.parse(fs.readFileSync('qa-v8-google/data/operacion.json','utf8'));
const state=JSON.parse(fs.readFileSync('qa-v8-google/state/operational-work-state.json','utf8'));
const contract=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-irrigation-v1.json','utf8'));

const workId='CUDO-WORK-IRRIGATION-20261005';
const work=projection.items.find(x=>x.work_id===workId);
const workObject=state.objects.find(x=>x.object_id===workId);

assert.equal(projection.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(projection.production_write,false);
assert.equal(state.production_write,false);
assert.equal(contract.production_write,false);
assert.ok(work,'canonical irrigation work missing from read model');
assert.ok(workObject,'canonical irrigation work object missing from state store');
assert.ok(work.evidence_refs.includes("artifact:Check-List tareas estadio y partidos.xlsx#'Check list'!B3:C3"),'real source ref missing');

const rule=contract.objects.find(x=>x.object_id===work.source.object_id);
const resource=contract.objects.find(x=>x.object_id===work.resource.resource_id);
const actor=contract.objects.find(x=>x.object_id===work.responsible.actor_id);
assert.ok(rule,'source rule missing');
assert.ok(resource,'resource missing');
assert.ok(actor,'responsible actor missing');
assert.ok(rule.provenance.source_refs.includes("artifact:Check-List tareas estadio y partidos.xlsx#'Check list'!B3:C3"));
assert.ok(Object.values(workObject.field_semantics||{}).some(x=>(x.rule_ids||[]).includes('WORK_RULE_SEASONAL_IRRIGATION_V1')),'work derivation rule missing');

for(const token of [
  "const CANONICAL_READ_MODEL_URL='/qa-v8-google/data/operacion.json'",
  "const CANONICAL_STATE_URL='/qa-v8-google/state/operational-work-state.json'",
  "const CANONICAL_SOURCE_CONTRACT_URL='/qa-v8-google/contracts/cudo-real-work-irrigation-v1.json'",
  "const CANONICAL_WORK_ID='CUDO-WORK-IRRIGATION-20261005'",
  "fetch(CANONICAL_READ_MODEL_URL,{cache:'no-store'})",
  "projection.authority!=='CANONICAL_GRAPH_READ_MODEL'",
  "projection.production_write!==false",
  "canonicalLive={status:'ERROR'",
  "CUDO no sustituye este dato por un mock",
  "canonical:work",
  "canonical:rule",
  "canonical:resource",
  "canonical:actor",
  "canonical:financial",
  "canonical:persistence",
  "canonical:evidence",
  "canonical:history",
  "CUDO_QA_OPERATIONAL_WORK_STATE"
]){
  assert.ok(html.includes(token),'missing real-source trace contract: '+token);
}

assert.ok(html.includes("TRACE_LINKS.workSheet"),'Google Sheet persistence must be navigable');
assert.ok(html.includes("El archivo original no se publica desde esta pantalla."),'original artifact publication boundary must be explicit');
assert.ok(html.includes("No se presenta como obligación actual."),'financial source context must not masquerade as an obligation');

console.log(JSON.stringify({
  ok:true,
  work_id:workId,
  title:work.title,
  authority:projection.authority,
  source_ref:work.evidence_refs[0],
  source_rule:rule.object_id,
  resource:resource.object_id,
  persistence_sheet:'CUDO_QA_OPERATIONAL_WORK_STATE',
  live_surface:'/preview-v8/club-operacion-lab/',
  fetches_canonical_runtime:true,
  fail_closed:true,
  production_write:false
},null,2));
