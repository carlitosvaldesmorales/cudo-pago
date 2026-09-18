import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  materializeResponsibilityWorkState,
  buildClubOperationalStateProjection
} from './work_item_engine.mjs';

const irrigation=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-irrigation-v1.json','utf8'));
const grass=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json','utf8'));
const post=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-post-match-v1.json','utf8'));

function mergeObjects(...groups){
  const map=new Map();
  for(const group of groups){
    for(const object of group){
      if(!map.has(object.object_id)) map.set(object.object_id,object);
    }
  }
  return [...map.values()];
}

const oct=materializeResponsibilityWorkState({
  objects:irrigation.objects,
  now:'2026-09-18T17:10:00.000Z',
  planningDate:irrigation.expected.october.planning_date
});
assert.equal(oct.created.length,1);
const octWork=oct.created[0];
assert.equal(octWork.object_id,irrigation.expected.october.work_id);
assert.equal(octWork.data.responsible_display_name,irrigation.expected.october.responsible);
assert.equal(octWork.data.schedule_start_date,irrigation.expected.october.start_date);
assert.equal(octWork.data.schedule_expected_end_date,irrigation.expected.october.expected_end_date);
assert.equal(octWork.data.schedule_conditional_extension_date,irrigation.expected.october.conditional_extension_date);
assert.equal(octWork.data.due_date,'2026-10-06');
assert.equal(octWork.data.financial_context_amount_clp,50000);
assert.equal(octWork.data.financial_context_cycle,'PER_COMPLETED_IRRIGATION');
assert.equal(octWork.data.financial_context_condition,'MONTHLY_SETTLEMENT_FIRST_FIVE_DAYS');
assert.equal(octWork.data.financial_context_semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');

const octReplay=materializeResponsibilityWorkState({
  objects:oct.objects,
  now:'2026-09-18T17:11:00.000Z',
  planningDate:irrigation.expected.october.planning_date
});
assert.equal(octReplay.created.length,0);
assert.ok(octReplay.audit.some(x=>x.kind==='NOOP_EXISTING_WORK'));

const dec=materializeResponsibilityWorkState({
  objects:irrigation.objects,
  now:'2026-09-18T17:12:00.000Z',
  planningDate:irrigation.expected.december.planning_date
});
assert.equal(dec.created.length,1);
assert.equal(dec.created[0].object_id,irrigation.expected.december.work_id);
assert.equal(dec.created[0].data.responsible_display_name,irrigation.expected.december.responsible);

const sep=materializeResponsibilityWorkState({
  objects:irrigation.objects,
  now:'2026-09-18T17:13:00.000Z',
  planningDate:irrigation.expected.september.planning_date
});
assert.equal(sep.created.length,0);
assert.ok(sep.audit.some(x=>x.kind==='NOOP_OUTSIDE_ACTIVE_SEASON'));

const combined=materializeResponsibilityWorkState({
  objects:mergeObjects(grass.objects,post.objects,irrigation.objects),
  now:'2026-09-18T17:20:00.000Z',
  planningDate:'2026-10-05'
});
assert.equal(combined.created.length,4);
const projection=buildClubOperationalStateProjection({
  objects:combined.objects,
  generatedAt:'2026-09-18T17:21:00.000Z',
  referenceDate:'2026-09-18'
});
assert.equal(projection.summary.total,4);
assert.equal(projection.summary.open,4);
assert.equal(projection.summary.overdue,0);
const irrigationItem=projection.items.find(x=>x.work_kind==='IRRIGATION');
assert.ok(irrigationItem);
assert.equal(irrigationItem.responsible.display_name,'Mario Díaz');
assert.equal(irrigationItem.schedule.start_date,'2026-10-05');
assert.equal(irrigationItem.schedule.expected_end_date,'2026-10-06');
assert.equal(irrigationItem.schedule.conditional_extension_date,'2026-10-07');
assert.equal(irrigationItem.schedule.condition,'MAY_EXTEND_TO_WEDNESDAY_DEPENDING_ON_WATER');

const stateStore={
  schema_version:'CUDO_OPERATIONAL_WORK_STATE_STORE_V1',
  base_fixtures:[
    'qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json',
    'qa-v8-google/contracts/cudo-real-work-post-match-v1.json',
    'qa-v8-google/contracts/cudo-real-work-irrigation-v1.json'
  ],
  planning_context:{planning_date:'2026-10-05',generated_from:'SEASONAL_QA_PLANNING'},
  objects:combined.objects.filter(x=>x.object_type==='WORK_ITEM'),
  audit:[],
  production_write:false
};
console.log('CUDO_SEASONAL_COMBINED_STATE_BASE64='+Buffer.from(JSON.stringify(stateStore,null,2)+'\n','utf8').toString('base64'));
console.log('CUDO_SEASONAL_COMBINED_PROJECTION_BASE64='+Buffer.from(JSON.stringify(projection,null,2)+'\n','utf8').toString('base64'));
console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_WORK_CLUSTER_SEASONAL_IRRIGATION_V1',
  real_source:"Check-List tareas estadio y partidos.xlsx / Check list / B3:C3",
  recurring_calendar_work:true,
  october_responsible:'Mario Díaz',
  december_responsible:'Andres Salinas "Necho"',
  september_outside_season_no_work:true,
  schedule_window:true,
  conditional_extension_without_invention:true,
  payment_context_without_false_obligation:true,
  combined_operational_work_items:4,
  production_write:false
},null,2));
