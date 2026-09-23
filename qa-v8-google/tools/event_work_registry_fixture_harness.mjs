import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deriveEventWork,eventSignals,planRegistryReconcile} from './sync_event_work_registry.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../contracts/cudo-event-work-pattern-catalog-v1.json',import.meta.url),'utf8'));
const match={event_id:'CUDO-EVENT-QA-MATCH-FULLDAY-001',kind:'MATCH',display_name:'CUDO vs San Juan',starts_at:'2026-09-27T13:00:00-03:00',location:'LOCAL',closed:false,conditions:{venue_required:true,food_sales_enabled:true,bar_sales_enabled:true,ticketing_enabled:true,broadcast_enabled:false}};
const derived=deriveEventWork(match,catalog);
assert.equal(derived.configured,true);
assert.deepEqual(derived.workstreams.map(x=>x.capability_tag),['VENUE_AND_FIELD','FOOD_SERVICE','CONCESSIONS','CLEANING_AND_SANITATION','SETUP_AND_LOGISTICS','ACCESS_AND_RECEPTION','SPORTS_OPERATION','FINANCIAL_CONTROL']);
assert.equal(derived.workstreams.reduce((n,x)=>n+x.tasks.length,0),3);
assert.equal(eventSignals(match).communications_required,false);

const tables={
  ACTIVIDADES:{headers:['activity_id','title','activity_type','starts_at','status','provenance','created_at','updated_at'],rows:[]},
  FRENTES:{headers:['workstream_id','activity_id','capability_tag','label','activation_reason','state','accountable_role_id','human_gate','progress_pct','purpose','dependencies'],rows:[]},
  RESPONSABLES:{headers:['assignment_id','workstream_id','role_instance_id','display_role','person_ref','person_display','assignment_state','assigned_at','confirmed_at','provenance'],rows:[]},
  TAREAS:{headers:['task_id','workstream_id','title','state','due_at','assignee_ref','assignee_display','priority','updated_at'],rows:[]},
  EVENTOS:{headers:['event_id','activity_id','workstream_id','task_id','timestamp','event_type','actor_type','actor_ref','previous_state','new_state','comment','provenance'],rows:[]}
};
const eventModel={schema_version:'TEST',store_revision:7,MATCH:match,BINGO:{event_id:'CUDO-EVENT-QA-BINGO-FULLDAY-001',kind:'BINGO',display_name:'Bingo',starts_at:null,location:null,closed:false,conditions:{}}};
const plan=planRegistryReconcile({eventModel,catalog,tables,at:'2026-09-23T12:00:00.000Z'});
assert.equal(plan.summary[0].active_workstreams,8);
assert.equal(plan.summary[0].tasks,3);
assert.equal(plan.summary[1].configured,false);
assert.equal(plan.mutations.filter(x=>x.tab==='FRENTES').length,8);
assert.equal(plan.mutations.filter(x=>x.tab==='RESPONSABLES').length,8);
assert.equal(plan.mutations.filter(x=>x.tab==='TAREAS').length,3);
assert.equal(plan.production_write,false);

const withoutBar=structuredClone(match);withoutBar.conditions.bar_sales_enabled=false;withoutBar.conditions.food_sales_enabled=false;withoutBar.conditions.ticketing_enabled=false;
const d2=deriveEventWork(withoutBar,catalog);
assert.deepEqual(d2.workstreams.map(x=>x.capability_tag),['VENUE_AND_FIELD','CLEANING_AND_SANITATION','SETUP_AND_LOGISTICS','SPORTS_OPERATION']);
console.log(JSON.stringify({schema_version:'CUDO_EVENT_WORK_AUTO_DERIVATION_FIXTURE_V1',pass:true,initial_workstreams:8,initial_tasks:3,reduced_workstreams:4,production_write:false},null,2));
