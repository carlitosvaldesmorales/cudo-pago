import { getAudienceAccessPolicy } from './audience-access-policy.js';

export const INTAKE_STATE=Object.freeze({
  AWAITING_NAME:'AWAITING_NAME',
  AWAITING_ENTITY:'AWAITING_ENTITY',
  REVIEW:'REVIEW'
});

export const INTAKE_CONTRACT=Object.freeze({
  id:'STRUCTURED_ACCESS_INTAKE_V1',
  one_active_intake_per_actor:true,
  draft_never_creates_authority:true,
  draft_never_notifies_approvers:true,
  pending_exists_only_after_confirmation:true,
  technical_identity_separate_from_declared_profile:true,
  reviewer_context_required:true,
  channel_native_text_capture:true
});

export function normalizeHumanClaim(value,{min=2,max=100}={}){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(!text||text.startsWith('/')) return null;
  if(text.length<min||text.length>max) return null;
  return text;
}

export function validateDeclaredName(value){
  return normalizeHumanClaim(value,{min:3,max:80});
}

export function validateRepresentedEntity(value){
  return normalizeHumanClaim(value,{min:2,max:100});
}

export function getStructuredIntakePolicy(audienceId){
  const policy=getAudienceAccessPolicy(audienceId);
  if(!policy?.requestable) throw new Error(`intake_audience_not_requestable:${audienceId}`);
  if(policy.submission_requires_confirmation!==true) throw new Error(`intake_confirmation_contract_missing:${audienceId}`);
  return policy;
}

export function isDraftComplete(draft){
  return !!(
    draft
    && validateDeclaredName(draft.declared_name)
    && validateRepresentedEntity(draft.represented_entity_label)
  );
}

export function buildReviewSummary(draft){
  if(!isDraftComplete(draft)) throw new Error('intake_review_incomplete');
  const label=draft.audience_id==='DIRIGENTES'?'DIRIGENTES':'CHÉPICA PLAY';
  return [
    `📋 SOLICITUD ${label}`,
    '',
    `👤 Nombre: ${draft.declared_name}`,
    `🏟️ Representa: ${draft.represented_entity_label}`,
    '',
    'Revisa los datos antes de enviar.',
    '',
    '⚠️ Enviar la solicitud no entrega permisos. Quedará PENDIENTE hasta que un administrador la revise.'
  ].join('\n');
}
