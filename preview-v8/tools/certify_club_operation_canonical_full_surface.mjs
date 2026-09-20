import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('preview-v8/club-operacion-lab/index.html','utf8');
const projection=JSON.parse(fs.readFileSync('qa-v8-google/data/operacion.json','utf8'));
const state=JSON.parse(fs.readFileSync('qa-v8-google/state/operational-work-state.json','utf8'));

assert.equal(projection.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(projection.production_write,false);
assert.equal(state.production_write,false);
assert.ok(Array.isArray(projection.items)&&projection.items.length>=4,'expected existing canonical work items');

const byId=new Map(state.objects.map(x=>[x.object_id,x]));
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
  "NO CREA RAÍZ COMÚN"
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
  all_work_items_resolved:true,
  all_relations_resolved:true,
  each_work_has_source_refs:true,
  no_common_root_invented:true,
  production_write:false,
  items:results
},null,2));
