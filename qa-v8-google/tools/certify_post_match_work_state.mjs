import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  materializeResponsibilityWorkState,
  buildClubOperationalStateProjection
} from './work_item_engine.mjs';

const post=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-post-match-v1.json','utf8'));
const grass=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json','utf8'));

function mergeObjects(...groups){
  const map=new Map();
  for(const group of groups){
    for(const object of group){
      if(!map.has(object.object_id)) map.set(object.object_id,object);
    }
  }
  return [...map.values()];
}

const single=materializeResponsibilityWorkState({
  objects:post.objects,
  now:'2026-09-18T16:10:00.000Z'
});
assert.equal(single.ok,true);
assert.equal(single.created.length,2);
assert.deepEqual(single.created.map(x=>x.object_id).sort(),post.expected.work_ids.slice().sort());

const cleaning=single.created.find(x=>x.data.work_kind==='STADIUM_CLEANING');
assert.ok(cleaning);
assert.equal(cleaning.lifecycle_state,'OPEN');
assert.equal(cleaning.data.responsible_display_name,'Sandra Salinas');
assert.equal(cleaning.data.due_date,null);
assert.equal(cleaning.data.source_object_id,post.expected.source_object_id);
assert.equal(cleaning.data.trigger_reason,'EVENT_COMPLETED_REQUIRES_WORK');
assert.equal(cleaning.data.financial_context_min_amount_clp,25000);
assert.equal(cleaning.data.financial_context_max_amount_clp,30000);
assert.equal(cleaning.data.financial_context_condition,'DEPENDS_ON_DIRTINESS');
assert.equal(cleaning.data.financial_context_semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');

const washing=single.created.find(x=>x.data.work_kind==='KIT_WASHING');
assert.ok(washing);
assert.equal(washing.lifecycle_state,'OPEN');
assert.equal(washing.data.responsible_display_name,'Cecilia');
assert.equal(washing.data.due_date,null);
assert.equal(washing.data.financial_context_unit_amount_clp,15000);
assert.equal(washing.data.financial_context_unit_label,'TEAM_WASHED');
assert.equal(washing.data.financial_context_cycle,'PER_TEAM_WASHED');
assert.equal(washing.data.financial_context_semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');

const replay=materializeResponsibilityWorkState({
  objects:single.objects,
  now:'2026-09-18T16:11:00.000Z'
});
assert.equal(replay.created.length,0);
assert.equal(replay.audit.filter(x=>x.kind==='NOOP_EXISTING_WORK').length,2);

const combinedSource=mergeObjects(grass.objects,post.objects);
const combined=materializeResponsibilityWorkState({
  objects:combinedSource,
  now:'2026-09-18T16:20:00.000Z'
});
assert.equal(combined.created.length,3);

const projection=buildClubOperationalStateProjection({
  objects:combined.objects,
  generatedAt:'2026-09-18T16:21:00.000Z',
  referenceDate:'2026-09-18'
});
assert.equal(projection.summary.total,3);
assert.equal(projection.summary.open,3);
assert.equal(projection.summary.overdue,0);
assert.equal(projection.items.filter(x=>x.due_date===null).length,2);
assert.equal(projection.items.filter(x=>x.responsible.display_name==='Maximiliano Figueroa').length,1);
assert.equal(projection.items.filter(x=>x.responsible.display_name==='Sandra Salinas').length,1);
assert.equal(projection.items.filter(x=>x.responsible.display_name==='Cecilia').length,1);

const encodedState=Buffer.from(JSON.stringify({
  schema_version:'CUDO_OPERATIONAL_WORK_STATE_STORE_V1',
  base_fixtures:[
    'qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json',
    'qa-v8-google/contracts/cudo-real-work-post-match-v1.json'
  ],
  objects:combined.objects.filter(x=>x.object_type==='WORK_ITEM'),
  audit:[],
  production_write:false
},null,2)+'\n','utf8').toString('base64');
const encodedProjection=Buffer.from(JSON.stringify(projection,null,2)+'\n','utf8').toString('base64');

console.log('CUDO_COMBINED_WORK_STATE_BASE64='+encodedState);
console.log('CUDO_COMBINED_OPERATIONAL_PROJECTION_BASE64='+encodedProjection);
console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_WORK_CLUSTER_POST_MATCH_FANOUT_V1',
  real_source:"Check-List tareas estadio y partidos.xlsx / Check list / B5:C6",
  event_to_multiple_work_items:true,
  work_items_created:2,
  combined_operational_work_items:3,
  nullable_due_date_without_invention:true,
  variable_cleaning_cost_context:true,
  per_team_washing_cost_context:true,
  duplicate_materialization_noop:true,
  production_write:false
},null,2));
