import assert from 'node:assert/strict';
import fs from 'node:fs';
import {materializeResponsibilityWorkState,buildClubOperationalStateProjection} from './work_item_engine.mjs';

const grass=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json','utf8'));
const post=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-post-match-v1.json','utf8'));
const irrigation=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-irrigation-v1.json','utf8'));
const stored=JSON.parse(fs.readFileSync('qa-v8-google/data/operacion.json','utf8'));
const html=fs.readFileSync('qa-v8-google/operacion/index.html','utf8');

function mergeObjects(...groups){
  const map=new Map();
  for(const group of groups){
    for(const object of group){
      if(!map.has(object.object_id)) map.set(object.object_id,object);
    }
  }
  return [...map.values()];
}

const materialized=materializeResponsibilityWorkState({
  objects:mergeObjects(grass.objects,post.objects,irrigation.objects),
  now:'2026-09-18T17:20:00.000Z',
  planningDate:'2026-10-05'
});
const regenerated=buildClubOperationalStateProjection({
  objects:materialized.objects,
  generatedAt:'2026-09-18T17:21:00.000Z',
  referenceDate:'2026-09-18'
});

assert.deepEqual(stored,regenerated,'operacion.json drifted from canonical work engine');
assert.equal(stored.summary.total,4);
assert.equal(stored.summary.open,4);
assert.equal(stored.summary.overdue,0);

const names=stored.items.map(x=>x.responsible.display_name).sort();
assert.deepEqual(names,['Cecilia','Mario Díaz','Maximiliano Figueroa','Sandra Salinas']);

const irrigationItem=stored.items.find(x=>x.work_kind==='IRRIGATION');
assert.ok(irrigationItem);
assert.equal(irrigationItem.due_date,'2026-10-06');
assert.equal(irrigationItem.schedule.start_date,'2026-10-05');
assert.equal(irrigationItem.schedule.expected_end_date,'2026-10-06');
assert.equal(irrigationItem.schedule.conditional_extension_date,'2026-10-07');
assert.equal(irrigationItem.schedule.condition,'MAY_EXTEND_TO_WEDNESDAY_DEPENDING_ON_WATER');
assert.equal(irrigationItem.financial_context.amount_clp,50000);
assert.equal(irrigationItem.financial_context.cycle,'PER_COMPLETED_IRRIGATION');
assert.equal(irrigationItem.financial_context.condition,'MONTHLY_SETTLEMENT_FIRST_FIVE_DAYS');

const cleaning=stored.items.find(x=>x.work_kind==='STADIUM_CLEANING');
assert.equal(cleaning.financial_context.min_amount_clp,25000);
assert.equal(cleaning.financial_context.max_amount_clp,30000);

const washing=stored.items.find(x=>x.work_kind==='KIT_WASHING');
assert.equal(washing.financial_context.unit_amount_clp,15000);
assert.equal(washing.financial_context.unit_label,'TEAM_WASHED');

assert.ok(html.includes("fetch('../data/operacion.json'"));
assert.ok(html.includes('Estado del club'));
assert.ok(html.includes('Responsable'));
assert.ok(html.includes('Fecha objetivo'));
assert.ok(html.includes('Contexto financiero'));
assert.ok(html.includes('financialEffectLabel'));
assert.ok(html.includes('Efecto financiero real'));
assert.ok(html.includes('Aún no constituye una obligación actual'));
assert.ok(html.includes('Sin fecha definida por la fuente'));
assert.ok(html.includes('por equipo lavado'));
assert.ok(html.includes('según suciedad'));
assert.ok(html.includes('Trabajo recurrente activo según temporada y calendario.'));
assert.ok(html.includes('posible extensión'));
assert.ok(html.includes('según agua'));
assert.ok(!/\+?56\s?9\d{8}/.test(html),'web projection must not expose source phone numbers');

for(const item of stored.items){
  assert.equal(item.financial_context.semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');
}

console.log(JSON.stringify({
  ok:true,
  surface:'qa-v8-google/operacion/',
  projection:'CUDO_CLUB_OPERATIONAL_STATE_V1',
  deterministic_data:true,
  visible_work_items:4,
  visible_responsibles:4,
  recurring_schedule_visible:true,
  seasonal_responsibility_visible:true,
  conditional_extension_visible_without_invention:true,
  source_cause_visible:true,
  financial_context_fixed_range_and_unit_supported:true,
  no_false_financial_obligation:true,
  phone_numbers_not_exposed:true,
  production_write:false
},null,2));
