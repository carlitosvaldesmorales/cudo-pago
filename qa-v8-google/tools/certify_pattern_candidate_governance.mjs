import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createPatternReviewRequest,
  decidePatternReview,
  applyPatternReview
} from './pattern_candidate_governance.mjs';

const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-shared-object-fixture-v1.json','utf8'));
const candidate=fixture.objects.find(x=>x.object_type==='PATTERN_CANDIDATE');
const observations=fixture.objects.filter(x=>x.object_type==='OBSERVATION');
assert.ok(candidate);
assert.equal(observations.length>=3,true);

assert.throws(()=>createPatternReviewRequest({
  candidate,
  requestedBy:'sistemas@cudo.cl',
  reason:'sin evidencia',
  evidenceRefs:[],
  proposedSemantics:'patron recurrente'
}),/evidenceRefs/);

const request=createPatternReviewRequest({
  candidate,
  requestedBy:'sistemas@cudo.cl',
  reason:'La estructura se repite en observaciones sintéticas y requiere validación humana.',
  evidenceRefs:['fixture://pattern-review/evidence'],
  proposedSemantics:'Patrón operacional recurrente observado; aún no es una regla ejecutable.'
});
assert.equal(request.state,'PENDING_APPROVAL');
assert.throws(()=>applyPatternReview({candidate,observations,approvedRequest:request}),/approved human decision/);

const approved=decidePatternReview(request,{decision:'VALIDATE',approvedBy:'sistemas@cudo.cl'});
const before=JSON.stringify(observations);
const applied=applyPatternReview({candidate,observations,approvedRequest:approved});
assert.equal(applied.ok,true);
assert.equal(applied.candidate.lifecycle_state,'VALIDATED');
assert.equal(applied.candidate.data.semantic_status,'VALIDATED');
assert.equal(applied.candidate.data.promotion_state,'APPROVED_AS_PATTERN');
assert.equal(applied.executable_rule_created,false);
assert.equal(applied.rule_decision_created,false);
assert.equal(JSON.stringify(applied.observations),before,'pattern validation must not mutate raw observations');
assert.equal(applied.audit.approved_by,'sistemas@cudo.cl');
assert.equal(applied.audit.evidence_refs.length,1);

const rejectRequest=createPatternReviewRequest({
  candidate,
  requestedBy:'sistemas@cudo.cl',
  reason:'Ruta sintética de rechazo.',
  evidenceRefs:['fixture://pattern-review/reject-evidence'],
  proposedSemantics:'Hipótesis de patrón a rechazar.'
});
const rejectedDecision=decidePatternReview(rejectRequest,{decision:'REJECT',approvedBy:'sistemas@cudo.cl'});
const rejected=applyPatternReview({candidate,observations,approvedRequest:rejectedDecision});
assert.equal(rejected.candidate.lifecycle_state,'REJECTED');
assert.equal(rejected.candidate.data.semantic_status,'REJECTED');
assert.equal(rejected.candidate.data.promotion_state,'NOT_PROMOTED');
assert.equal(rejected.executable_rule_created,false);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_PATTERN_CANDIDATE_GOVERNANCE_V1',
  validate_path:'PASS',
  reject_path:'PASS',
  requires_requester:true,
  requires_approver:true,
  requires_reason:true,
  requires_evidence:true,
  raw_observations_immutable:true,
  executable_rule_created:false,
  production_write:false
},null,2));
