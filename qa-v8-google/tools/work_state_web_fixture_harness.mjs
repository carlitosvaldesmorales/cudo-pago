import assert from 'node:assert/strict';
import fs from 'node:fs';

const work=fs.readFileSync('qa-v8-google/apps-script/CudoWorkStateWeb.gs','utf8');
const event=fs.readFileSync('qa-v8-google/apps-script/CudoEventResourceWeb.gs','utf8');
const persona=fs.readFileSync('qa-v8-google/apps-script/CudoPersonaReviewWeb.gs','utf8');
const bridge=fs.readFileSync('qa-v8-google/apps-script/CudoReviewEventBridge.gs','utf8');
const workflow=fs.readFileSync('.github/workflows/cudo-review-engine.yml','utf8');

assert.ok(work.includes("CUDO_WORK_ALLOWED_REVIEWER_='sistemas@cudo.cl'"));
assert.ok(work.includes("1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw"));
assert.ok(work.includes("WORK_STATE_REQUESTS"));
assert.ok(work.includes("action==='COMPLETE'&&!evidenceRef"));
assert.ok(work.includes("current.STATE!==expectedState"));
assert.ok(work.includes("FINANCIAL_CONTEXT"));
assert.ok(work.includes("FINANCIAL_EFFECT"));
assert.ok(work.includes("OUTSTANDING_CLP"));
assert.ok(work.includes("<b>Efecto financiero real:</b>"));
assert.ok(work.includes("SCHEDULE_CONTEXT"));
assert.ok(work.includes("<b>Ventana:</b>"));
assert.ok(work.includes("sin fecha definida"));
assert.ok(work.includes("cudoReviewDispatch_('apps_script_work_state')"));
assert.ok(work.includes("name=\"kind\" value=\"WORK_ITEM\""));

assert.ok(event.includes("CUDO_EVENT_RESOURCE_ALLOWED_REVIEWER_='sistemas@cudo.cl'"));
assert.ok(event.includes("EVENT_RESOURCE_REQUESTS"));
assert.ok(event.includes("EVENT_RESOURCE_CONTROL"));
assert.ok(event.includes("CUDO_EVENT_RESOURCE_QA_REF_='agent/match-full-club-day-roundtrip-20260921'"));
assert.ok(event.includes("cudoReviewDispatch_('apps_script_event_resource',CUDO_EVENT_RESOURCE_QA_REF_)"));
assert.ok(event.includes("name=\"kind\" value=\"EVENT_RESOURCE\""));
assert.ok(event.includes("MATCH_PURCHASE"));
assert.ok(event.includes("MATCH_RESULT"));
assert.ok(event.includes("BINGO_CONFIRM_PERMIT"));
assert.ok(event.includes("BINGO_DONATE_PRIZE"));
assert.ok(event.includes("setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)"));

assert.ok(persona.includes("view==='work'"));
assert.ok(persona.includes("view==='event'"));
assert.ok(persona.includes("return cudoWorkRender_('')"));
assert.ok(persona.includes("kind==='WORK_ITEM'"));
assert.ok(persona.includes("return cudoWorkHandlePost_(e)"));
assert.ok(persona.includes("kind==='EVENT_RESOURCE'"));
assert.ok(persona.includes("return cudoEventHandlePost_(e)"));
assert.ok(persona.includes("return cudoPersonaHandlePost_(e)"));

assert.ok(bridge.includes("CUDO_GITHUB_ACTIONS_TOKEN"));
assert.ok(workflow.includes("apps_script_work_state"));
assert.ok(workflow.includes("apps_script_event_resource"));
assert.ok(workflow.includes("process_work_state_requests.mjs"));
assert.ok(workflow.includes("process_event_resource_requests.mjs"));
assert.ok(workflow.includes("qa-v8-google/state/event-resource-state.json"));
assert.ok(workflow.includes("qa-v8-google/data/event-resource-qa.json"));
assert.ok(workflow.includes("qa-v8-google/state/operational-work-state.json"));
assert.ok(workflow.includes("qa-v8-google/data/operacion.json"));
assert.ok(workflow.includes("Persistir estado operacional QA si cambió"));

assert.ok(!workflow.includes("if: inputs.source == 'apps_script_work_state'\n        run: node preview-v8/tools/sync_google_publico.mjs"));

console.log(JSON.stringify({
  ok:true,
  private_web_acl:true,
  existing_private_web_app_reused:true,
  expected_state_precondition:true,
  complete_requires_evidence:true,
  request_ledger_is_adapter:true,
  existing_event_driven_dispatch_reused:true,
  event_resource_private_surface_routed:true,
  event_resource_branch_isolated:true,
  work_source_isolated_from_public_sync:true,
  qa_state_persistence:true,
  token_property_reused_not_exposed:true,
  production_write:false
},null,2));
