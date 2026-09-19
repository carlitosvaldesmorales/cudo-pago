import crypto from 'node:crypto';

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function digest(value){ return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function makeId(prefix,payload){ return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`; }

export function createPatternReviewRequest({
  candidate,
  requestedBy,
  reason,
  evidenceRefs,
  proposedSemantics,
  now='2026-09-19T22:45:00.000Z'
}){
  if(!candidate||candidate.object_type!=='PATTERN_CANDIDATE') throw new Error('pattern review requires PATTERN_CANDIDATE');
  if(candidate.lifecycle_state!=='PROPOSED'||candidate.data?.semantic_status!=='UNVALIDATED') throw new Error('pattern candidate is not reviewable');
  if(!requestedBy) throw new Error('pattern review requires requestedBy');
  if(!reason) throw new Error('pattern review requires reason');
  if(!Array.isArray(evidenceRefs)||evidenceRefs.length===0) throw new Error('pattern review requires evidenceRefs');
  if(!proposedSemantics||typeof proposedSemantics!=='string') throw new Error('pattern review requires proposedSemantics');

  const payload={candidate_id:candidate.object_id,requestedBy,reason,evidenceRefs,proposedSemantics,now};
  return {
    schema_version:'CUDO_PATTERN_REVIEW_REQUEST_V1',
    request_id:makeId('CUDO-PATTERN-REVIEW',payload),
    candidate_id:candidate.object_id,
    requested_by:requestedBy,
    reason,
    evidence_refs:[...evidenceRefs],
    proposed_semantics:proposedSemantics,
    state:'PENDING_APPROVAL',
    decision:null,
    approved_by:null,
    approved_at:null,
    created_at:now,
    production_write:false
  };
}

export function decidePatternReview(request,{
  decision,
  approvedBy,
  now='2026-09-19T22:46:00.000Z'
}){
  if(request.state!=='PENDING_APPROVAL') throw new Error('pattern review is not pending approval');
  if(!approvedBy) throw new Error('pattern review decision requires approvedBy');
  if(!['VALIDATE','REJECT'].includes(decision)) throw new Error('pattern review decision must be VALIDATE or REJECT');
  return {
    ...clone(request),
    state:'APPROVED',
    decision,
    approved_by:approvedBy,
    approved_at:now
  };
}

export function applyPatternReview({
  candidate,
  observations,
  approvedRequest,
  now='2026-09-19T22:47:00.000Z'
}){
  if(!candidate||candidate.object_type!=='PATTERN_CANDIDATE') throw new Error('apply requires PATTERN_CANDIDATE');
  if(approvedRequest.state!=='APPROVED'||!approvedRequest.approved_by) throw new Error('pattern review requires approved human decision');
  if(approvedRequest.candidate_id!==candidate.object_id) throw new Error('pattern review candidate mismatch');

  const beforeObservations=clone(observations||[]);
  const updated=clone(candidate);
  updated.object_version=Number(updated.object_version)+1;
  updated.provenance={...updated.provenance,updated_at:now,transition_id:approvedRequest.request_id};

  if(approvedRequest.decision==='VALIDATE'){
    updated.lifecycle_state='VALIDATED';
    updated.data.semantic_status='VALIDATED';
    updated.data.promotion_state='APPROVED_AS_PATTERN';
  } else {
    updated.lifecycle_state='REJECTED';
    updated.data.semantic_status='REJECTED';
    updated.data.promotion_state='NOT_PROMOTED';
  }

  return {
    ok:true,
    candidate:updated,
    observations:beforeObservations,
    executable_rule_created:false,
    rule_decision_created:false,
    audit:{
      kind:'PATTERN_REVIEW_DECISION',
      request_id:approvedRequest.request_id,
      candidate_id:candidate.object_id,
      decision:approvedRequest.decision,
      requested_by:approvedRequest.requested_by,
      approved_by:approvedRequest.approved_by,
      reason:approvedRequest.reason,
      evidence_refs:[...approvedRequest.evidence_refs],
      proposed_semantics:approvedRequest.proposed_semantics,
      applied_at:now
    },
    production_write:false
  };
}
