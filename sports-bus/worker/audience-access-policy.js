export const AUDIENCE_ACCESS_MODE=Object.freeze({
  OPEN:'OPEN',
  RESTRICTED:'RESTRICTED'
});

export const AUTHORIZATION_MODEL=Object.freeze({
  NONE:'NONE',
  ROLE:'ROLE',
  SCOPED_GRANT:'SCOPED_GRANT'
});

export const AUDIENCE_ACCESS_STATE=Object.freeze({
  OPEN:'OPEN',
  AUTHORIZED:'AUTHORIZED',
  PENDING:'PENDING',
  REQUESTABLE:'REQUESTABLE'
});

const POLICIES=Object.freeze([
  Object.freeze({
    id:'PUBLIC_GENERAL',
    order:10,
    label:'🌐 Público general',
    entry_callback:'tp:public',
    access_mode:AUDIENCE_ACCESS_MODE.OPEN,
    authorization_model:AUTHORIZATION_MODEL.NONE,
    requestable:false,
    approval_required:false,
    grants_on_entry:false
  }),
  Object.freeze({
    id:'DIRIGENTES',
    order:20,
    label:'🔐 Dirigentes',
    entry_callback:'tp:leaders',
    access_mode:AUDIENCE_ACCESS_MODE.RESTRICTED,
    authorization_model:AUTHORIZATION_MODEL.ROLE,
    target_authority:'CLUB_ADMIN',
    requestable:true,
    request_callback:'tp:req',
    status_callback:'tp:reqstatus',
    approval_required:true,
    grants_on_entry:false,
    persistence_adapter:'access_requests',
    enrollment_capture:'CLUB'
  }),
  Object.freeze({
    id:'CHEPICA_PLAY',
    order:30,
    label:'🎥 Chépica Play',
    entry_callback:'mp:home',
    access_mode:AUDIENCE_ACCESS_MODE.RESTRICTED,
    authorization_model:AUTHORIZATION_MODEL.SCOPED_GRANT,
    target_authority:'MEDIA_PARTNER',
    requestable:true,
    request_callback:'cp:access-request',
    status_callback:'cp:access-status',
    cancel_callback:'cp:access-cancel',
    approval_required:true,
    grants_on_entry:false,
    control_plane_bypass:false,
    persistence_adapter:'partner_access_requests',
    scope_type:'COMPETITION',
    scope_id:'ANFA-CHEPICA-2026',
    capabilities:Object.freeze(['READ_COMPETITION','OBSERVE_RESULT']),
    invitation_supported:true
  })
]);

export const AUDIENCE_ACCESS_POLICIES=POLICIES;

export const AUDIENCE_ACCESS_CONTRACT=Object.freeze({
  canonical_registry:'AUDIENCE_ACCESS_POLICIES',
  restricted_audience_requires_actionable_enrollment:true,
  request_never_grants_authority:true,
  approval_precedes_authority_materialization:true,
  audience_entry_never_materializes_authority:true,
  scoped_grant_requires_explicit_membership:true,
  control_plane_authority_never_implies_scoped_audience_membership:true,
  storage_adapter_is_not_access_semantics:true
});

export function getAudienceAccessPolicy(id){
  return POLICIES.find(policy=>policy.id===id)||null;
}

export function resolveAudienceAccessState(policy,{authorized=false,pending=false}={}){
  if(!policy) throw new Error('audience_access_policy_missing');
  if(policy.access_mode===AUDIENCE_ACCESS_MODE.OPEN) return AUDIENCE_ACCESS_STATE.OPEN;
  if(authorized) return AUDIENCE_ACCESS_STATE.AUTHORIZED;
  if(pending) return AUDIENCE_ACCESS_STATE.PENDING;
  if(policy.requestable||policy.invitation_supported) return AUDIENCE_ACCESS_STATE.REQUESTABLE;
  throw new Error(`restricted_audience_dead_end:${policy.id}`);
}

export function validateAudienceAccessPolicies(policies=POLICIES){
  const errors=[];
  const ids=new Set();
  const callbacks=new Set();

  for(const policy of policies){
    if(!policy?.id) errors.push('policy_missing_id');
    else if(ids.has(policy.id)) errors.push(`duplicate_policy_id:${policy.id}`);
    else ids.add(policy.id);

    if(!policy?.entry_callback) errors.push(`entry_callback_missing:${policy?.id||'UNKNOWN'}`);
    else if(callbacks.has(policy.entry_callback)) errors.push(`duplicate_entry_callback:${policy.entry_callback}`);
    else callbacks.add(policy.entry_callback);

    if(policy?.grants_on_entry!==false) errors.push(`entry_must_not_grant_authority:${policy?.id||'UNKNOWN'}`);

    if(policy?.access_mode===AUDIENCE_ACCESS_MODE.OPEN){
      if(policy.authorization_model!==AUTHORIZATION_MODEL.NONE) errors.push(`open_audience_authorization_model:${policy.id}`);
      if(policy.approval_required) errors.push(`open_audience_requires_approval:${policy.id}`);
      continue;
    }

    if(policy?.access_mode!==AUDIENCE_ACCESS_MODE.RESTRICTED){
      errors.push(`invalid_access_mode:${policy?.id||'UNKNOWN'}`);
      continue;
    }

    if(!policy.approval_required) errors.push(`restricted_audience_without_approval:${policy.id}`);
    if(!policy.requestable&&!policy.invitation_supported) errors.push(`restricted_audience_dead_end:${policy.id}`);
    if(policy.requestable&&!policy.request_callback) errors.push(`request_callback_missing:${policy.id}`);
    if(policy.requestable&&!policy.status_callback) errors.push(`status_callback_missing:${policy.id}`);
    if(policy.authorization_model===AUTHORIZATION_MODEL.NONE) errors.push(`restricted_audience_without_authority_model:${policy.id}`);
    if(policy.authorization_model===AUTHORIZATION_MODEL.SCOPED_GRANT&&policy.control_plane_bypass!==false){
      errors.push(`scoped_audience_control_plane_bypass_forbidden:${policy.id}`);
    }
  }

  return errors;
}

export function assertAudienceAccessPolicies(policies=POLICIES){
  const errors=validateAudienceAccessPolicies(policies);
  if(errors.length) throw new Error(`invalid_audience_access_policy:${errors.join(',')}`);
  return true;
}

assertAudienceAccessPolicies();
