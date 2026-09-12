import {
  AUDIENCE_ACCESS_CONTRACT,
  AUDIENCE_ACCESS_POLICIES,
  assertAudienceAccessPolicies
} from './audience-access-policy.js';

assertAudienceAccessPolicies();

export const TELEGRAM_ROOT_AUDIENCES=Object.freeze(
  [...AUDIENCE_ACCESS_POLICIES]
    .sort((a,b)=>a.order-b.order)
    .map(policy=>Object.freeze({
      id:policy.id,
      label:policy.label,
      callback_data:policy.entry_callback
    }))
);

export const AUDIENCE_ROOT_CONTRACT=Object.freeze({
  screen_id:'AUDIENCE_ROOT',
  canonical_bot:'@FutbolChepicaBot',
  root_represents_audiences:true,
  audience_selection_precedes_capabilities:true,
  audience_selection_grants_permissions:false,
  capability_logic_is_reused:true,
  root_access_policy_is_canonical:true,
  restricted_audiences_have_actionable_enrollment:AUDIENCE_ACCESS_CONTRACT.restricted_audience_requires_actionable_enrollment,
  request_never_grants_authority:AUDIENCE_ACCESS_CONTRACT.request_never_grants_authority,
  approval_precedes_authority_materialization:AUDIENCE_ACCESS_CONTRACT.approval_precedes_authority_materialization,
  audience_ids:Object.freeze(TELEGRAM_ROOT_AUDIENCES.map(item=>item.id))
});

export function buildTelegramAudienceRoot(){
  return {
    screen_id:AUDIENCE_ROOT_CONTRACT.screen_id,
    title:'⚽ FÚTBOL CHÉPICA',
    lead:'Portal del campeonato. Selecciona tu tipo de acceso:',
    audiences:TELEGRAM_ROOT_AUDIENCES.map(item=>({...item}))
  };
}

export function renderTelegramAudienceRoot(){
  const model=buildTelegramAudienceRoot();
  return {
    text:`${model.title}\n\n${model.lead}`,
    reply_markup:{
      inline_keyboard:model.audiences.map(item=>[{
        text:item.label,
        callback_data:item.callback_data
      }])
    }
  };
}
