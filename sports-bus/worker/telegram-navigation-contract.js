export const NAVIGATION_ACTION=Object.freeze({
  BACK:'BACK',
  CANCEL:'CANCEL',
  FINISH:'FINISH',
  HOME:'HOME'
});

export const NAVIGATION_LABEL=Object.freeze({
  BACK:'⬅️ Volver',
  CANCEL:'❌ Cancelar',
  FINISH:'✅ Terminar',
  HOME:'🏠 Inicio'
});

export const NAVIGATION_SEMANTICS=Object.freeze({
  BACK:Object.freeze({
    mutates_business_state:false,
    destroys_navigation_context:false,
    destination:'IMMEDIATE_PARENT'
  }),
  CANCEL:Object.freeze({
    mutates_business_state:false,
    may_discard_unconfirmed_draft:true,
    destroys_navigation_context:false,
    destination:'IMMEDIATE_PARENT'
  }),
  FINISH:Object.freeze({
    closes_completed_task:true,
    destroys_navigation_context:false,
    destination:'AUDIENCE_HOME'
  }),
  HOME:Object.freeze({
    explicit_context_exit:true,
    destroys_navigation_context:true,
    destination:'ROOT'
  })
});

export const AUDIENCE_CONTEXT=Object.freeze({
  PUBLIC_GENERAL:'PUBLIC_GENERAL',
  DIRIGENTES:'DIRIGENTES',
  CHEPICA_PLAY:'CHEPICA_PLAY'
});

export const AUDIENCE_HOME_CALLBACK=Object.freeze({
  PUBLIC_GENERAL:'tp:public',
  DIRIGENTES:'tp:leaders',
  CHEPICA_PLAY:'mp:home'
});

export function audienceHomeCallback(contextCode){
  return AUDIENCE_HOME_CALLBACK[String(contextCode||'')]||'tp:home';
}

export function navigationButton(action,callbackData,label=null){
  const canonical=String(action||'').toUpperCase();
  if(!NAVIGATION_ACTION[canonical]) throw new Error(`unknown_navigation_action:${action}`);
  return {
    text:label||NAVIGATION_LABEL[canonical],
    callback_data:callbackData
  };
}

export const NAVIGATION_CONTRACT=Object.freeze({
  version:'navigation-continuity-v1',
  invariants:Object.freeze([
    'BACK_RETURNS_TO_IMMEDIATE_PARENT',
    'BACK_NEVER_MEANS_HOME',
    'BACK_DOES_NOT_DESTROY_AUDIENCE_CONTEXT',
    'CANCEL_ONLY_DISCARDS_UNCONFIRMED_WORK',
    'FINISH_CLOSES_TASK_WITHOUT_EXITING_AUDIENCE',
    'HOME_IS_EXPLICIT_CONTEXT_EXIT',
    'SHARED_CAPABILITY_RETURNS_TO_ORIGIN_AUDIENCE'
  ])
});
