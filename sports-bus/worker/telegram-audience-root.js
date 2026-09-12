export const TELEGRAM_ROOT_AUDIENCES=Object.freeze([
  Object.freeze({
    id:'PUBLIC_GENERAL',
    label:'🌐 Público general',
    callback_data:'tp:public'
  }),
  Object.freeze({
    id:'DIRIGENTES',
    label:'🔐 Dirigentes',
    callback_data:'tp:leaders'
  }),
  Object.freeze({
    id:'CHEPICA_PLAY',
    label:'🎥 Chépica Play',
    callback_data:'mp:home'
  })
]);

export const AUDIENCE_ROOT_CONTRACT=Object.freeze({
  screen_id:'AUDIENCE_ROOT',
  canonical_bot:'@FutbolChepicaBot',
  root_represents_audiences:true,
  audience_selection_precedes_capabilities:true,
  audience_selection_grants_permissions:false,
  capability_logic_is_reused:true,
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
