function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

function standingsLines(rows){
  return (rows||[]).map(row=>{
    const pos=Number.isFinite(Number(row.position))?Number(row.position):'-';
    const club=escapeHtml(row.team_name||'');
    const points=Number(row.points||0);
    return `<b>${pos}.</b> ${club} — <b>${points} pts</b>`;
  });
}

export function renderPublicHubTelegram(model){
  const text=[
    `🌐 <b>${escapeHtml(model.title)}</b>`,
    '',
    escapeHtml(model.lead)
  ].join('\n');

  const actions=model.actions||[];
  const reply_markup={inline_keyboard:actions.map(action=>[{
    text:action.label,
    callback_data:action.callback_data
  }])};

  return {text,parse_mode:'HTML',reply_markup};
}

export function renderStandingsTelegram(model){
  const lines=[
    `${model.championship_icon} <b>${escapeHtml(model.championship_title)}</b>`,
    `<i>${escapeHtml(model.subtitle)}</i>`
  ];

  for(const group of model.groups||[]){
    lines.push('');
    lines.push(`<b>GRUPO ${escapeHtml(group.group_id)}</b>`);
    lines.push(...standingsLines(group.rows));
  }

  lines.push('');
  lines.push(`✅ ${escapeHtml(model.status_text)}`);

  if(model.tie_notice){
    lines.push(`⚖️ ${escapeHtml(model.tie_notice)}`);
  }
  if(model.adjustment_notice){
    lines.push(`🧾 ${escapeHtml(model.adjustment_notice)}`);
  }

  const championshipButtons=model.navigation.championships.map(item=>({
    text:`${item.active?'● ':'○ '}${item.label}`,
    callback_data:item.callback_data
  }));

  return {
    text:lines.join('\n'),
    parse_mode:'HTML',
    reply_markup:{
      inline_keyboard:[
        championshipButtons,
        [
          {text:model.navigation.results.label,callback_data:model.navigation.results.callback_data},
          {text:model.navigation.public.label,callback_data:model.navigation.public.callback_data}
        ]
      ]
    }
  };
}

export const TELEGRAM_PRESENTATION_CONTRACT=Object.freeze({
  parse_mode:'HTML',
  standings:{
    one_championship_per_message:true,
    all_groups_in_same_championship_message:true,
    group_navigation:false,
    no_pre_or_code:true,
    horizontal_scroll_required:false,
    tie_notice_once:true,
    navigation_inline:true,
    update_existing_message_when_possible:true
  }
});
