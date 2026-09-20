import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('preview-v8/club-operacion-lab/index.html','utf8');
const projection=JSON.parse(fs.readFileSync('qa-v8-google/data/operacion.json','utf8'));
const state=JSON.parse(fs.readFileSync('qa-v8-google/state/operational-work-state.json','utf8'));
const contracts=[
  JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-irrigation-v1.json','utf8')),
  JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json','utf8')),
  JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-post-match-v1.json','utf8'))
];

assert.equal(projection.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(projection.production_write,false);
assert.equal(state.production_write,false);
for(const contract of contracts) assert.equal(contract.production_write,false);
assert.ok(Array.isArray(projection.items)&&projection.items.length>=4,'expected existing canonical work items');

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function materialSignature(object){
  return JSON.stringify({object_type:object.object_type,data:stable(object.data||{})});
}
function buildIndex(){
  const index=new Map();
  const duplicates=[];
  for(const object of [...state.objects,...contracts.flatMap(x=>x.objects||[])]){
    const prior=index.get(object.object_id);
    if(!prior){index.set(object.object_id,object);continue;}
    assert.equal(
      materialSignature(prior),
      materialSignature(object),
      'conflicting canonical identity '+object.object_id
    );
    duplicates.push(object.object_id);
  }
  return {index,duplicates:[...new Set(duplicates)]};
}
const {index:byId,duplicates}=buildIndex();
assert.ok(duplicates.includes('CUDO-RESOURCE-ESTADIO-001'),'expected shared stadium resource to prove compatible duplicate resolution');

const results=[];
for(const item of projection.items){
  const work=byId.get(item.work_id);
  assert.ok(work,'missing work object '+item.work_id);
  assert.equal(work.object_type,'WORK_ITEM',item.work_id+' must be WORK_ITEM');
  const refs=[...(item.evidence_refs||[]),...(work.provenance?.source_refs||[])];
  assert.ok(refs.length>0,item.work_id+' has no traceable refs');
  const rels=work.relationships||[];
  assert.ok(rels.some(r=>r.relationship_type==='ASSIGNED_TO'),item.work_id+' missing ASSIGNED_TO');
  assert.ok(rels.some(r=>r.relationship_type==='APPLIES_TO_RESOURCE'),item.work_id+' missing resource relation');
  for(const rel of rels){
    assert.ok(byId.has(rel.target_object_id),item.work_id+' unresolved relation '+rel.target_object_id);
  }
  results.push({
    work_id:item.work_id,
    refs:[...new Set(refs)],
    relationships:rels.map(r=>({type:r.relationship_type,target:r.target_object_id}))
  });
}

const grassEvent=byId.get('CUDO-EVENT-QA-SATURDAY-MATCH-001');
assert.equal(grassEvent?.data?.qa_synthetic,true,'grass trigger must remain explicitly synthetic QA');
assert.ok(grassEvent?.provenance?.source_refs?.every(x=>x.startsWith('qa://')),'grass trigger must not masquerade as real artifact evidence');

const grassActor=byId.get('CUDO-ACTOR-MAX-FIGUEROA-001');
assert.ok(grassActor?.provenance?.source_refs?.some(x=>x.includes("Check-List tareas estadio y partidos.xlsx#'Check list'!B4:C4")),'grass responsible must resolve to real source contract');

for(const token of [
  'id="canonicalFullSurface"',
  'Lo que CUDO ya puede demostrar',
  'sin inventar una raíz común',
  'function renderCanonicalFullSurface()',
  "traceButton('canonical:item:'+item.work_id)",
  "traceButton('canonical:object:'+id)",
  "key.startsWith('canonical:item:')",
  "key.startsWith('canonical:object:')",
  "key.startsWith('canonical:persistence-item:')",
  "key.startsWith('canonical:financial-item:')",
  "key.startsWith('canonical:history-item:')",
  "function sourceClassification(refs)",
  "MIXTA · EVIDENCIA REAL + DISPARADOR QA",
  "QA SINTÉTICA",
  "NO CREA RAÍZ COMÚN",
  "function buildCanonicalObjectIndex(stateStore,contracts)",
  "conflicto de identidad canónica",
  "/qa-v8-google/contracts/cudo-real-work-irrigation-v1.json",
  "/qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json",
  "/qa-v8-google/contracts/cudo-real-work-post-match-v1.json"
]){
  assert.ok(html.includes(token),'missing full-surface trace contract: '+token);
}

assert.ok(html.includes("No se crea una lista paralela"),'must state no parallel task source');
assert.ok(html.includes("No se infiere sobrecarga"),'must not infer overload');
assert.ok(html.includes("Cada trabajo conserva su propia causa"),'must preserve independent causes');

console.log(JSON.stringify({
  ok:true,
  authority:projection.authority,
  projected_work_items:projection.items.length,
  resolved_object_universe:byId.size,
  compatible_duplicate_ids:duplicates,
  all_work_items_resolved:true,
  all_relations_resolved:true,
  each_work_has_source_refs:true,
  synthetic_trigger_stays_explicit:true,
  real_source_actors_resolve_from_existing_contracts:true,
  no_common_root_invented:true,
  production_write:false,
  items:results
},null,2));
