// Contract-level guard for CUDO-owned operations, not a claim of live E2E.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const contract=JSON.parse(read('qa-v8-google/contracts/cudo-operational-sovereignty-v1.json'));
const c=contract.declared_operational_capabilities;
const auth=contract.authority_rules;
const evidence=contract.evidence_boundary;

assert.equal(contract.schema_version,'CUDO_OPERATIONAL_SOVEREIGNTY_V1');
assert.equal(contract.owner,'CLUB_DEPORTIVO_UNION_ORILLA');
assert.equal(contract.institutional_operator_initial,'sistemas@cudo.cl');
assert.equal(contract.authoritative_repositories.club_operations,'carlitosvaldesmorales/cudo-pago');
assert.equal(contract.authoritative_repositories.club_portal_and_bonos,'carlitosvaldesmorales/cudo-vnext');
assert.equal(auth.runtime_must_wait_for_arke_root_main,false);
assert.equal(auth.arke_root_authority_for_cudo_business,false);
assert.equal(auth.arke_patterns_use,'OPTIONAL_READ_ONLY_REFERENCE_NOT_OPERATIONAL_GATE');
assert.equal(auth.optional_external_adapter_never_required_for_work_engine,true);
assert.equal(auth.owner_final_go_required_for_public_money_and_publication,true);
assert.equal(auth.financial_grants_require_independent_authorized_action,true);
assert.equal(auth.no_silent_auto_publish_or_auto_grant,true);
assert.equal(evidence.live_workflow_e2e,'NOT_CERTIFIED');
assert.equal(evidence.autonomous_presidency_e2e,'NOT_CERTIFIED');
assert.equal(evidence.production_money,'OFF_UNTIL_APPROVED');

assert.equal(c.work_contract,'qa-v8-google/contracts/cudo-work-item-contract-v1.json');
assert.equal(c.work_engine,'qa-v8-google/tools/work_item_engine.mjs');
assert.equal(c.institutional_review_ui,'qa-v8-google/apps-script/CudoWorkStateWeb.gs');
assert.equal(c.existing_ci,'.github/workflows/certify-cudo-operational-work-state.yml');
assert.equal(c.existing_external_pattern_adapter,'.github/workflows/cudo-arke-project-worker.yml');

const workContract=JSON.parse(read(c.work_contract));
assert.equal(workContract.schema_version,'CUDO_WORK_ITEM_CONTRACT_V1');
assert.deepEqual(workContract.lifecycle_states,
  ['OPEN','IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED']);
assert.equal(workContract.governance.evidence_required_for_DONE,true);
assert.equal(workContract.governance.expected_state_precondition_required_for_transition,true);

const engine=read(c.work_engine);
const ui=read(c.institutional_review_ui);
const ci=read(c.existing_ci);
const adapter=read(c.existing_external_pattern_adapter);
const ownRuntime=[engine,ui,ci].join('\n');
const forbidden=/carlitosvaldesmorales\/arke-root|ARKE_RECONCILER_CONTROL|ARKE_FOREMAN|arke-foreman\.yml|CANONICAL_CONNECTIVITY_MAINTENANCE_FREEZE_ACTIVE/i;
assert.equal(forbidden.test(ownRuntime),false,
 'CUDO native operating path must not require ARKE root authority or Foreman');
assert.match(engine,/export function materializeResponsibilityWorkState\(/);
assert.match(engine,/export function transitionWorkItem\(/);
assert.match(engine,/DONE_REQUIRES_EVIDENCE/);
assert.match(ui,/CUDO_WORK_ALLOWED_REVIEWER_='sistemas@cudo\.cl'/);
assert.match(ui,/CUDO_WORK_REQUESTS_SHEET_='WORK_STATE_REQUESTS'/);
assert.ok(ui.includes(c.existing_event_route),'Reuse native CUDO Apps Script event dispatch');
assert.match(ui,/action==='COMPLETE'&&!evidenceRef/);
assert.match(ci,/name: Certify CUDO Operational Work State/);
assert.match(ci,/pull_request:/);
assert.match(ci,/node qa-v8-google\/tools\/certify_work_item_engine\.mjs/);
assert.match(ci,/node qa-v8-google\/tools\/certify_operational_sovereignty\.mjs/);
assert.match(adapter,/repository_dispatch:/);
assert.match(adapter,/arke_cudo_handoff/);
assert.doesNotMatch(ci,/cudo-arke-project-worker\.yml.*(requires|needs)/s);

// Negative regression: detect a reintroduced ARKE execution dependency.
assert.equal(forbidden.test("require ARKE_FOREMAN before CUDO work"),true);

// Audit the exact formerly coupled live workflow. It may validate with official
// Google Sheets and archive CUDO evidence; dispatching to ARKE is not a precondition.
const adoption=read('.github/workflows/cudo-mobile-adoption-event.yml');
assert.ok(adoption.includes('CUDO_MOBILE_ADOPTION_REAL_EVENT_EVIDENCE_V1'));
assert.ok(adoption.includes('Validate real adoption against canonical Sheet'));
assert.ok(adoption.includes('CUDO_MOBILE_ADOPTION_OWN_RECEIPT_VALIDATED=PASS'));
assert.ok(adoption.includes('actions/upload-artifact@v4'));
for(const forbiddenSource of [
  'CUDO_TO_ARKE_APP_',
  'repos/carlitosvaldesmorales/arke-root/dispatches',
  'repositories: arke-root',
  'Mint dedicated CUDO to ARKE token',
  'Dispatch validated event to ARKE'
]){
  assert.ok(!adoption.includes(forbiddenSource),'Forbidden external routing: '+forbiddenSource);
}
const agentRules=read('AGENTS.md');
assert.ok(agentRules.includes('CUDO es la autoridad de su propia operación'));
assert.ok(agentRules.includes('ARKĒ es solo una fuente opcional de patrones'));
assert.ok(agentRules.includes('no exige autorización de arke-root/main'));

console.log('CUDO_OPERATIONAL_SOVEREIGNTY_CONTRACT=PASS');
console.log('CUDO_NATIVE_ENGINE_EXISTS=PASS');
console.log('CUDO_INSTITUTIONAL_OPERATOR_SISTEMAS=PASS');
console.log('CUDO_ARKE_RUNTIME_DEPENDENCY=ABSENT_IN_GUARDED_PATH');
console.log('CUDO_LIVE_E2E=NOT_CERTIFIED');
console.log('PRODUCTION_FINANCE_MUTATION=NONE');
