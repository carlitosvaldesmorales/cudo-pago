import assert from 'node:assert/strict';
import fs from 'node:fs';
import {materializeResponsibilityWorkState,buildClubOperationalStateProjection} from './work_item_engine.mjs';

const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-work-grass-cut-v1.json','utf8'));
const stored=JSON.parse(fs.readFileSync('qa-v8-google/data/operacion.json','utf8'));
const html=fs.readFileSync('qa-v8-google/operacion/index.html','utf8');

const materialized=materializeResponsibilityWorkState({objects:fixture.objects,now:'2026-09-18T15:00:00.000Z'});
const regenerated=buildClubOperationalStateProjection({
  objects:materialized.objects,
  generatedAt:'2026-09-18T15:20:00.000Z',
  referenceDate:'2026-09-18'
});
assert.deepEqual(stored,regenerated,'operacion.json drifted from canonical work engine');
assert.ok(html.includes("fetch('../data/operacion.json'"));
assert.ok(html.includes('Estado del club'));
assert.ok(html.includes('Responsable'));
assert.ok(html.includes('Fecha objetivo'));
assert.ok(html.includes('Contexto financiero'));
assert.ok(html.includes('trigger sintético QA'));
assert.ok(!/\+?56\s?9\d{8}/.test(html),'web projection must not expose source phone numbers');
assert.equal(stored.items[0].responsible.display_name,'Maximiliano Figueroa');
assert.equal(stored.items[0].due_date,'2026-09-25');
assert.equal(stored.items[0].financial_context.semantics,'SOURCE_CONTEXT_NOT_CURRENT_OBLIGATION');

console.log(JSON.stringify({
  ok:true,
  surface:'qa-v8-google/operacion/',
  projection:'CUDO_CLUB_OPERATIONAL_STATE_V1',
  deterministic_data:true,
  responsible_visible:true,
  work_state_visible:true,
  source_cause_visible:true,
  financial_context_visible_without_false_debt:true,
  phone_numbers_not_exposed:true,
  production_write:false
},null,2));
