import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AUDIENCE_ACCESS_POLICIES,
  ACCESS_INTAKE_CONTRACT,
  validateAudienceAccessPolicies
} from '../../sports-bus/worker/audience-access-policy.js';
import {
  INTAKE_CONTRACT,
  INTAKE_STATE,
  validateDeclaredName,
  validateRepresentedEntity,
  isDraftComplete,
  buildReviewSummary
} from '../../sports-bus/worker/access-request-intake-model.js';

const restricted=AUDIENCE_ACCESS_POLICIES.filter(policy=>policy.requestable);
assert.equal(restricted.length,2);
for(const policy of restricted){
  assert.equal(policy.intake_contract,ACCESS_INTAKE_CONTRACT);
  assert.equal(policy.submission_requires_confirmation,true);
  assert.deepEqual([...policy.required_claims],['DECLARED_NAME','REPRESENTED_ENTITY']);
}
assert.deepEqual(validateAudienceAccessPolicies(),[]);
console.log('PASS every requestable restricted audience requires structured claims + confirmation');

assert.equal(INTAKE_CONTRACT.draft_never_creates_authority,true);
assert.equal(INTAKE_CONTRACT.draft_never_notifies_approvers,true);
assert.equal(INTAKE_CONTRACT.pending_exists_only_after_confirmation,true);
assert.equal(INTAKE_CONTRACT.technical_identity_separate_from_declared_profile,true);
assert.equal(INTAKE_CONTRACT.one_active_intake_per_actor,true);
console.log('PASS intake lifecycle invariants');

assert.equal(validateDeclaredName('  Juan   Pérez  '),'Juan Pérez');
assert.equal(validateDeclaredName('A'),null);
assert.equal(validateDeclaredName('/inicio'),null);
assert.equal(validateRepresentedEntity('  Club Unión Orilla  '),'Club Unión Orilla');
assert.equal(validateRepresentedEntity(''),null);
console.log('PASS human claim normalization and validation');

const draft={
  intake_id:'ari-123-demo',
  audience_id:'CHEPICA_PLAY',
  state:INTAKE_STATE.REVIEW,
  declared_name:'Juan Pérez',
  represented_entity_label:'Club Unión Orilla'
};
assert.equal(isDraftComplete(draft),true);
const summary=buildReviewSummary(draft);
assert.match(summary,/Juan Pérez/);
assert.match(summary,/Club Unión Orilla/);
assert.match(summary,/no entrega permisos/i);
console.log('PASS review surface contains decision context before submission');

const canonical=fs.readFileSync('sports-bus/canonical-entry.js','utf8');
const intakeIndex=canonical.indexOf('handleAccessRequestIntake(request.clone(),env)');
const cpIndex=canonical.indexOf('handleTelegramChepicaPlayHomeRequest(request.clone(),env)');
const coreIndex=canonical.indexOf('return coreWorker.fetch(request,env,ctx)');
assert.ok(intakeIndex>0);
assert.ok(cpIndex>intakeIndex,'structured intake must intercept Chépica Play request intent before legacy handler');
assert.ok(coreIndex>intakeIndex,'structured intake must intercept Dirigentes request intent before legacy portal');
console.log('PASS canonical routing makes structured intake authoritative');

const runtime=fs.readFileSync('sports-bus/worker/access-request-intake-entry.js','utf8');
assert.match(runtime,/force_reply:true/);
assert.match(runtime,/AWAITING_NAME/);
assert.match(runtime,/AWAITING_ENTITY/);
assert.match(runtime,/access_request_submitted/);
assert.match(runtime,/declared_name/);
assert.match(runtime,/represented_entity/);
assert.match(runtime,/submitted_at/);
assert.match(runtime,/permission_change:false/);
assert.match(runtime,/cp:access-review:/);
assert.match(runtime,/tp:review:/);
console.log('PASS Telegram adapter captures, reviews, confirms and enriches reviewer context');

const migration=fs.readFileSync('sports-bus/migrations/0027_structured_access_request_intake.sql','utf8');
assert.match(migration,/CREATE TABLE IF NOT EXISTS access_request_intakes/);
assert.match(migration,/superseded_by_structured_intake_v1/);
assert.match(migration,/ALTER TABLE partner_access_requests ADD COLUMN declared_name/);
assert.match(migration,/ALTER TABLE access_requests ADD COLUMN declared_name/);
console.log('PASS persistence separates draft from submitted governed requests');

const adn=fs.readFileSync('docs/architecture/human-transaction-intake-adn-v1.md','utf8');
for(const invariant of [
  'INTENT_NEQ_SUBMISSION',
  'DRAFT_NEQ_PENDING',
  'REQUIRED_HUMAN_CONTEXT_PRECEDES_SUBMISSION',
  'CONFIRMATION_PRECEDES_PENDING',
  'TECHNICAL_IDENTITY_NEQ_DECLARED_PROFILE',
  'REVIEWER_CONTEXT_REQUIRED',
  'CHANNEL_NATIVE_INPUT'
]) assert.match(adn,new RegExp(invariant));
console.log('PASS root ADN is explicit and reusable beyond Chépica Play');

console.log('RESULT: PASS');
