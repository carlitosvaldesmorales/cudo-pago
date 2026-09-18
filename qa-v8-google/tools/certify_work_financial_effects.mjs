import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transitionWorkItem,buildClubOperationalStateProjection} from './work_item_engine.mjs';
import {deriveFinancialObligationsFromCompletedWork,enrichOperationalProjectionWithFinancialEffects} from './work_financial_effects.mjs';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';

const store=JSON.parse(fs.readFileSync('qa-v8-google/state/operational-work-state.json','utf8'));
const irrigationId='CUDO-WORK-IRRIGATION-20261005';

// OPEN work creates no payable.
const before=deriveFinancialObligationsFromCompletedWork({
  objects:store.objects,
  now:'2026-10-06T17:00:00.000Z'
});
assert.equal(before.created.length,0);
assert.ok(before.audit.some(x=>x.work_id===irrigationId&&x.kind==='NOOP_WORK_NOT_DONE'));

// Governance: transition OPEN -> IN_PROGRESS -> DONE with evidence.
const started=transitionWorkItem({
  objects:store.objects,
  workItemId:irrigationId,
  expectedState:'OPEN',
  nextState:'IN_PROGRESS',
  performedByActorId:'CUDO-ACTOR-ADMIN-SISTEMAS',
  reason:'Inicio QA del riego',
  now:'2026-10-05T12:00:00.000Z'
});
assert.equal(started.ok,true);

const done=transitionWorkItem({
  objects:started.objects,
  workItemId:irrigationId,
  expectedState:'IN_PROGRESS',
  nextState:'DONE',
  performedByActorId:'CUDO-ACTOR-ADMIN-SISTEMAS',
  reason:'Riego finalizado QA',
  evidenceRefs:['qa://evidence/irrigation-completed-2026-10-06'],
  now:'2026-10-06T17:30:00.000Z'
});
assert.equal(done.ok,true);

const derived=deriveFinancialObligationsFromCompletedWork({
  objects:done.objects,
  now:'2026-10-06T17:31:00.000Z'
});
assert.equal(derived.ok,true);
assert.equal(derived.created.length,1);

const obligation=derived.created[0];
assert.equal(obligation.object_id,'CUDO-OBL-WORK-IRRIGATION-20261005');
assert.equal(obligation.object_type,'FINANCIAL_OBLIGATION');
assert.equal(obligation.lifecycle_state,'OPEN');
assert.equal(obligation.data.obligation_direction,'PAYABLE');
assert.equal(obligation.data.obligation_kind,'STADIUM_IRRIGATION_SERVICE');
assert.equal(obligation.data.amount,50000);
assert.equal(obligation.data.currency,'CLP');
assert.equal(obligation.data.payee_display_name,'Mario Díaz');
assert.equal(obligation.data.source_work_id,irrigationId);
assert.equal(obligation.data.payment_context_cycle,'PER_COMPLETED_IRRIGATION');
assert.equal(obligation.data.payment_context_condition,'MONTHLY_SETTLEMENT_FIRST_FIVE_DAYS');
assert.ok(obligation.relationships.some(x=>x.relationship_type==='CAUSED_BY_WORK_ITEM'&&x.target_object_id===irrigationId));
assert.ok(obligation.provenance.source_refs.includes('qa://evidence/irrigation-completed-2026-10-06'));

// Canonical financial core accepts it and derives a real outstanding payable.
const financial=buildFinancialSnapshot({
  objects:derived.objects,
  settlements:[],
  openingPositions:{},
  currency:'CLP'
});
assert.equal(financial.ok,true,JSON.stringify(financial.errors));
assert.equal(financial.obligation_views.length,1);
const view=financial.obligation_views[0];
assert.equal(view.object_id,obligation.object_id);
assert.equal(view.amount,50000);
assert.equal(view.settled_amount,0);
assert.equal(view.outstanding_amount,50000);
assert.equal(view.derived_lifecycle,'OPEN');
assert.deepEqual(view.causal_object_ids,[irrigationId]);

// No payment/movement is invented.
assert.equal(financial.movement_views.length,0);
assert.equal(derived.objects.filter(x=>x.object_type==='FINANCIAL_MOVEMENT').length,0);

// Deterministic replay creates no duplicate obligation.
const replay=deriveFinancialObligationsFromCompletedWork({
  objects:derived.objects,
  now:'2026-10-06T17:32:00.000Z'
});
assert.equal(replay.created.length,0);
assert.ok(replay.audit.some(x=>x.kind==='NOOP_EXISTING_OBLIGATION'&&x.work_id===irrigationId));

// Ambiguous financial contexts remain fail-closed.
function markDone(objects,workKind,evidenceRef){
  const work=objects.find(x=>x.object_type==='WORK_ITEM'&&x.data.work_kind===workKind);
  assert.ok(work,`missing work kind ${workKind}`);
  work.lifecycle_state='DONE';
  work.provenance.source_refs=[...(work.provenance.source_refs||[]),evidenceRef];
}
const ambiguous=JSON.parse(JSON.stringify(store.objects));
markDone(ambiguous,'STADIUM_CLEANING','qa://evidence/cleaning-complete');
markDone(ambiguous,'KIT_WASHING','qa://evidence/washing-complete');
const ambiguousResult=deriveFinancialObligationsFromCompletedWork({
  objects:ambiguous,
  now:'2026-10-06T17:33:00.000Z'
});
assert.equal(ambiguousResult.created.length,0);
assert.ok(ambiguousResult.audit.some(x=>x.work_kind==='STADIUM_CLEANING'&&x.kind==='NOOP_FINANCIAL_EFFECT_NOT_AUTOMATABLE'));
assert.ok(ambiguousResult.audit.some(x=>x.work_kind==='KIT_WASHING'&&x.kind==='NOOP_FINANCIAL_EFFECT_NOT_AUTOMATABLE'));

// Web-facing operational projection can now expose the financial effect without manual re-entry.
const projection=buildClubOperationalStateProjection({
  objects:derived.objects,
  generatedAt:'2026-10-06T17:34:00.000Z',
  referenceDate:'2026-10-06'
});
const enriched=enrichOperationalProjectionWithFinancialEffects({
  projection,
  objects:derived.objects,
  financialSnapshot:financial
});
const irrigationItem=enriched.items.find(x=>x.work_id===irrigationId);
assert.ok(irrigationItem.financial_effect);
assert.equal(irrigationItem.financial_effect.obligation_id,'CUDO-OBL-WORK-IRRIGATION-20261005');
assert.equal(irrigationItem.financial_effect.amount_clp,50000);
assert.equal(irrigationItem.financial_effect.outstanding_amount_clp,50000);
assert.equal(irrigationItem.financial_effect.state,'OPEN');
assert.equal(irrigationItem.financial_effect.payee_display_name,'Mario Díaz');

console.log(JSON.stringify({
  ok:true,
  cluster:'CUDO_COMPLETED_WORK_TO_FINANCIAL_OBLIGATION_V1',
  source_work:irrigationId,
  trigger:'WORK_ITEM DONE WITH EVIDENCE',
  obligation_id:'CUDO-OBL-WORK-IRRIGATION-20261005',
  payable_amount_clp:50000,
  outstanding_amount_clp:50000,
  no_manual_finance_reentry:true,
  no_payment_invented:true,
  idempotent_obligation_creation:true,
  cleaning_ambiguous_amount_fail_closed:true,
  washing_missing_quantity_fail_closed:true,
  operational_projection_exposes_financial_effect:true,
  production_write:false
},null,2));
