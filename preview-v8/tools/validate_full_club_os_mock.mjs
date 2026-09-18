import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const mock=read('preview-v8/data/club-os-mock.json');
const ops=read('preview-v8/data/operacion.json');
const fin=read('preview-v8/data/finanzas.json');
const resources=read('preview-v8/data/recursos.json');
const governance=read('preview-v8/data/gobernanza.json');
const evidence=read('preview-v8/data/evidencia.json');
const manifest=read('preview-v8/data/mock-manifest.json');
const dashboard=fs.readFileSync('preview-v8/club-os-mock/index.html','utf8');
const admin=fs.readFileSync('preview-v8/admin/index.html','utf8');
const engine=fs.readFileSync('preview-v8/shared/mock-admin-engine.mjs','utf8');
const home=fs.readFileSync('preview-v8/index.html','utf8');
const partidosPage=fs.readFileSync('preview-v8/partidos/index.html','utf8');
const sportsProjection=fs.readFileSync('preview-v8/shared/mock-sports-projection.mjs','utf8');
const pageUx=fs.readFileSync('preview-v8/shared/page-ux.js','utf8');

assert.equal(mock.schema_version,'CUDO_CLUB_OS_GOLDEN_MOCK_V1');
assert.equal(mock.environment,'qa-v8-mock');
assert.equal(mock.mock,true);
assert.equal(mock.production_write,false);
assert.equal(manifest.golden_fixture,true);
assert.equal(manifest.strategy,'FULL_CLUB_OS_SCENARIO_NOT_ONLY_SPORTS_CONTENT');
assert.ok(home.includes('href="club-os-mock/"'),'home must link golden mock dashboard');
assert.ok(dashboard.includes("deriveMockReadModels"),'dashboard must derive from shared mock runtime');
assert.ok(dashboard.includes("CUDO_FULL_MOCK_ADMIN_RUNTIME_V1"),'dashboard must consume shared runtime key');
assert.ok(dashboard.includes('href="../admin/"'),'dashboard must link admin');
assert.ok(home.includes('href="admin/"'),'home must link mock admin');
assert.ok(home.includes("mock-sports-projection.mjs"),'home must consume Club sports projection');
assert.ok(partidosPage.includes("mock-sports-projection.mjs"),'Partidos must consume Club sports projection');
assert.ok(admin.includes("applyMockAdminAction"),'admin must use shared action engine');
assert.ok(admin.includes("deriveMockReadModels"),'admin must use shared read models');
assert.ok(admin.includes("Restablecer golden mock"),'admin must provide safe reset');
for(const id of ['memberForm','actorForm','fundraisingForm','donatedPrizeForm','octagonalIncidentForm','bondForm','damageForm','sanctionForm','resourceForm','eventForm','decisionForm','workForm','obligationForm']) assert.ok(admin.includes(`id="${id}"`),`admin missing source form ${id}`);
assert.ok(dashboard.includes('id="members"'));
assert.ok(dashboard.includes('id="sanctions"'));
assert.ok(admin.includes('id="sanctions"'));
assert.ok(admin.includes('id="damageCases"'));
assert.ok(dashboard.includes('id="damageCases"'));
assert.ok(admin.includes('id="bonds"'));
assert.ok(dashboard.includes('id="bonds"'));
assert.ok(dashboard.includes('id="actors"'));
assert.ok(dashboard.includes('id="events"'));
assert.ok(admin.includes("data-event-next"));
assert.ok(admin.includes("Finalizar"));
assert.ok(admin.includes("Cancelar"));
assert.ok(admin.includes("Ninguna acción escribe Google Sheets, GitHub productivo ni CUDO real"));
assert.ok(engine.includes("AUTO_UNBLOCK_DEPENDENCY"));
assert.ok(engine.includes("AUTO_UNBLOCK_RESOURCE"));
assert.ok(engine.includes("FINANCIAL_SETTLEMENT"));
assert.ok(engine.includes("SOURCE_ACTOR_CREATED"));
assert.ok(engine.includes("SOURCE_EVENT_CREATED"));
assert.ok(engine.includes("DERIVED_WORK_CREATED"));
assert.ok(engine.includes("HUMAN_WORK_CREATED"));
assert.ok(engine.includes("SOURCE_FINANCIAL_OBLIGATION_CREATED"));
assert.ok(engine.includes("EVENT_TRANSITION"));
assert.ok(engine.includes("POST_EVENT_WORK_CREATED"));
assert.ok(engine.includes("AUTO_CANCEL_EVENT_PREPARATION"));
assert.ok(engine.includes("completed MATCH requires non-negative integer score"));
assert.ok(engine.includes("MEMBER_ENROLL"));
assert.ok(engine.includes("MEMBERSHIP_DUE"));
assert.ok(engine.includes("MEMBER_FINANCIAL_STATUS_RECALCULATED"));
assert.ok(engine.includes("membership monthly amount must be integer >= 2000 CLP"));
assert.ok(engine.includes("SANCTION_APPLY"));
assert.ok(engine.includes("SANCTION_FINE"));
assert.ok(engine.includes("SUSPENDED_PENDING_FINE"));
assert.ok(engine.includes("ELIGIBLE_NEXT_DATE"));
assert.ok(engine.includes("EXPELLED_TOURNAMENT"));
assert.ok(engine.includes("serious aggression is non-payable in bounded ruleset"));
assert.ok(engine.includes("FACILITY_DAMAGE_REPORT"));
assert.ok(engine.includes("DAMAGE_AMOUNT_AGREE"));
assert.ok(engine.includes("FACILITY_DAMAGE_ASSESSMENT"));
assert.ok(engine.includes("FACILITY_DAMAGE_COMPENSATION"));
assert.ok(engine.includes("damage assessment work must be DONE before amount agreement"));
assert.ok(engine.includes("damage amount agreement requires assessment evidence"));
assert.ok(engine.includes("facility damage decision requires DAMAGE_AMOUNT_AGREE"));
assert.ok(engine.includes("MATCH_ADMINISTRATIVE_OUTCOME_APPLY"));
assert.ok(engine.includes("ADMINISTRATIVE_MATCH_OUTCOME"));
assert.ok(engine.includes("DEFERRED_NO_PRIZE_CONTRACT"));
assert.ok(engine.includes("administrative outcome category not supported by bounded ruleset"));
assert.ok(sportsProjection.includes("resultado_administrativo"));
assert.ok(sportsProjection.includes("puntos_local"));
assert.ok(sportsProjection.includes("AWARDED_WIN"));
assert.ok(pageUx.includes("CUDO GANA · ADM."));
assert.ok(pageUx.includes("RIVAL GANA · ADM."));
assert.ok(admin.includes("data-admin-match"));
assert.ok(engine.includes("TOURNAMENT_BOND_RECEIVE"));
assert.ok(engine.includes("TOURNAMENT_BOND_FINE_OFFSET_APPLY"));
assert.ok(engine.includes("TOURNAMENT_BOND_REFUND"));
assert.ok(engine.includes("NON_CASH_BOND_OFFSET"));
assert.ok(engine.includes("REFUNDABLE_DEPOSIT"));
assert.ok(engine.includes("tournament bond refund requires TOURNAMENT_BOND_REFUND action"));
assert.ok(engine.includes("fine offset exceeds refundable bond balance"));
assert.ok(engine.includes("sports_consequence_state:decisionKind==='OCTAGONAL_INCIDENT'?'APPLIED_ATOMICALLY':'DEFERRED_OUT_OF_FINANCIAL_CLUSTER'"));
assert.ok(engine.includes("OCTAGONAL_INCIDENT_APPLY"));
assert.ok(engine.includes("octagonal incident requires stable club actor refs on both match sides"));
assert.ok(engine.includes("active tournament bond not found for offending club actor"));
assert.ok(engine.includes("local_club_actor_id"));
assert.ok(engine.includes("visita_club_actor_id"));
assert.ok(engine.includes("OCTAGONAL_SPORTS_CONSEQUENCE_APPLIED"));
assert.ok(admin.includes('id="octagonalIncidentForm"'));
assert.ok(admin.includes('data-select="linked-live-matches"'));
assert.ok(engine.includes("FUNDRAISING_EVENT_PREPARE"));
assert.ok(engine.includes("FUNDRAISING_PERMISSION_REQUEST"));
assert.ok(engine.includes("FUNDRAISING_PRIZE_SOLICITATION"));
assert.ok(engine.includes("DONATED_PRIZE_CONFIRM"));
assert.ok(engine.includes("UNVALUED_NOT_FINANCIAL"));
assert.ok(engine.includes("donated prize requires completed solicitation work"));
assert.ok(engine.includes("donor actor must match solicitation external target"));
assert.ok(engine.includes("external_target_actor_id"));
assert.ok(admin.includes('data-select="completed-prize-work"'));
assert.ok(dashboard.includes("Contraparte externa:"));
assert.ok(admin.includes("data-bond-fine"));
assert.ok(admin.includes("data-bond-refund"));
assert.ok(engine.includes("event.sports={"));
assert.ok(sportsProjection.includes("deriveMockSportsProjection"));
assert.ok(sportsProjection.includes("CUDO_WEB_PARTIDOS"));
assert.ok(sportsProjection.includes("CUDO_WEB_TABLA"));
assert.ok(sportsProjection.includes("counts_for_standings"));
assert.ok(sportsProjection.includes("runtime_match_ids"));
assert.ok(engine.includes("DONE requires evidence"));
assert.ok(dashboard.includes('100% DATOS MOCK'));
assert.ok(dashboard.includes('Bloqueo:'));
assert.ok(dashboard.includes('Dependencias:'));
assert.ok(dashboard.includes('Efecto financiero:'));

const requiredObjectTypes=[
  'ACTOR','ACTIVITY_EVENT','RESOURCE_FACILITY','RULE_DECISION',
  'WORK_ITEM','FINANCIAL_OBLIGATION','FINANCIAL_MOVEMENT','DOCUMENT_EVIDENCE'
];
for(const type of requiredObjectTypes) assert.ok(mock.coverage.object_types.includes(type),`missing object type ${type}`);

const requiredWorkStates=['OPEN','IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED'];
for(const state of requiredWorkStates){
  assert.ok(mock.work_items.some(x=>x.state===state),`missing work state ${state}`);
}
assert.ok(mock.work_items.some(x=>x.attention==='OVERDUE'),'missing overdue work');
assert.ok(mock.work_items.some(x=>(x.blocker_refs||[]).length>0),'missing blocker');
assert.ok(mock.work_items.some(x=>(x.dependency_refs||[]).length>0),'missing dependency');
assert.ok(mock.work_items.some(x=>(x.evidence_refs||[]).length>0),'missing work evidence');
assert.ok(mock.work_items.some(x=>(x.financial_obligation_refs||[]).length>0),'missing work->finance relation');

for(const state of ['OPEN','PARTIALLY_SETTLED','SETTLED']){
  assert.ok(mock.financial_obligations.some(x=>x.state===state),`missing obligation state ${state}`);
}
assert.ok(mock.financial_obligations.some(x=>x.direction==='PAYABLE'));
assert.ok(mock.financial_obligations.some(x=>x.direction==='RECEIVABLE'));
assert.ok(mock.financial_movements.some(x=>x.status==='PENDING'));
assert.ok(mock.financial_movements.some(x=>x.status==='CONFIRMED'));
assert.ok(mock.financial_movements.some(x=>x.reconciliation_state==='RECONCILED'));
assert.ok(mock.evidence.some(x=>x.state==='AVAILABLE'));
assert.ok(mock.evidence.some(x=>x.state==='MISSING'));
assert.ok(mock.decisions.some(x=>x.state==='PENDING_HUMAN'));
assert.ok(mock.decisions.some(x=>['APPROVED','APPLIED'].includes(x.state)));
assert.ok(mock.resources.some(x=>x.attention==='BLOCKING'));

assert.equal(ops.mock,true);
assert.equal(ops.summary.total,mock.work_items.length);
for(const state of requiredWorkStates){
  assert.ok(ops.items.some(x=>x.state===state),`operational projection missing ${state}`);
}
assert.ok(ops.items.some(x=>(x.blockers?.refs||[]).length>0));
assert.ok(ops.items.some(x=>(x.dependencies?.refs||[]).length>0));
assert.ok(ops.items.some(x=>x.financial_effect));

assert.equal(fin.mock,true);
assert.equal(fin.summary.obligations_total,mock.financial_obligations.length);
assert.ok(fin.summary.outstanding_payable>0);
assert.ok(fin.summary.outstanding_receivable>0);
assert.ok(fin.summary.confirmed_movements>0);
assert.ok(fin.summary.pending_movements>0);

assert.equal(resources.mock,true);
assert.ok(resources.summary.blocking>0);
assert.equal(governance.mock,true);
assert.ok(governance.summary.pending_human>0);
assert.equal(evidence.mock,true);
assert.ok(evidence.summary.evidence_missing>0);
assert.ok(evidence.summary.audit_events>0);

const serialized=JSON.stringify(mock);
assert.ok(!serialized.includes('artifact:'),'golden mock must not claim real artifact evidence');
assert.ok(!serialized.includes('source_system":"CUDO_REAL'),'golden mock must not claim real source system');
assert.ok(mock.actors.every(x=>/Mock|MOCK/i.test(x.display_name)),'all mock actor display names must be obviously synthetic');

console.log(JSON.stringify({
  ok:true,
  environment:'qa-v8-mock',
  strategy:'FULL_CLUB_OS_SCENARIO_NOT_ONLY_SPORTS_CONTENT',
  actors:mock.actors.length,
  events:mock.events.length,
  resources:mock.resources.length,
  decisions:mock.decisions.length,
  work_items:mock.work_items.length,
  work_states:[...new Set(mock.work_items.map(x=>x.state))].sort(),
  obligations:mock.financial_obligations.length,
  movements:mock.financial_movements.length,
  evidence:mock.evidence.length,
  audit_events:mock.audit.length,
  blockers:true,
  dependencies:true,
  overdue:true,
  governance:true,
  finance:true,
  evidence_audit:true,
  mock_admin_actions:true,
  shared_runtime_between_admin_and_dashboard:true,
  automatic_dependency_propagation:true,
  automatic_resource_unblock:true,
  mock_financial_settlement:true,
  source_fact_creation:true,
  scheduled_match_to_derived_work:true,
  human_created_work:true,
  event_lifecycle_actions:true,
  post_event_work_propagation:true,
  club_event_to_public_match_projection:true,
  completed_match_result_to_standings:true,
  sports_runtime_precedes_seed_on_collision:true,
  home_and_partidos_share_club_sports_projection:true,
  membership_enrollment_to_due:true,
  membership_payment_to_financial_status:true,
  sanction_incident_to_fine:true,
  sanction_settlement_to_eligibility:true,
  serious_aggression_non_payable_expulsion:true,
  facility_damage_report_to_assessment_work:true,
  evidence_backed_damage_amount_to_receivable:true,
  settlement_does_not_fake_resource_repair:true,
  administrative_match_outcome_without_fake_score:true,
  bounded_category_points_to_standings:true,
  prize_deduction_deferred_without_financial_contract:true,
  tournament_bond_receipt_to_refundable_liability:true,
  tournament_bond_non_cash_fine_offset:true,
  tournament_bond_remaining_balance_refund:true,
  stable_club_actor_refs_on_match_sides:true,
  one_incident_to_sports_and_bond:true,
  cross_plane_incident_uses_actor_identity_not_text:true,
  fundraising_event_to_external_work:true,
  completed_prize_solicitation_to_unvalued_donated_resource:true,
  in_kind_donation_has_no_invented_financial_effect:true,
  sports_content_fixture:'preview-v8/shared/seed-data.js',
  production_write:false
},null,2));
