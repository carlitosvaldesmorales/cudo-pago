function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

function truncate(value,max){
  const text=String(value||'');
  if(text.length<=max) return text;
  if(max<=1) return text.slice(0,max);
  return `${text.slice(0,max-1)}…`;
}

function standingsTable(rows){
  const clubWidth=Math.min(24,Math.max(10,...rows.map(row=>String(row.team_name||'').length)));
  const lines=['POS  CLUB'.padEnd(5+clubWidth,' ')+'  PTS'];
  for(const row of rows){
    const pos=String(row.position||'-').padStart(2,' ');
    const club=truncate(row.team_name,clubWidth).padEnd(clubWidth,' ');
    const pts=String(row.points??0).padStart(3,' ');
    lines.push(`${pos}.  ${club}  ${pts}`);
  }
  return lines.join('\n');
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
    `<b>Grupo ${escapeHtml(model.group_id)}</b>`,
    `<i>${escapeHtml(model.subtitle)}</i>`,
    '',
    `<pre>${escapeHtml(standingsTable(model.rows||[]))}</pre>`,
    '',
    `✅ ${escapeHtml(model.status_text)}`
  ];

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
  const groupButtons=model.navigation.groups.map(item=>({
    text:`${item.active?'● ':'○ '}${item.label}`,
    callback_data:item.callback_data
  }));

  return {
    text:lines.join('\n'),
    parse_mode:'HTML',
    reply_markup:{
      inline_keyboard:[
        championshipButtons,
        groupButtons,
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
    one_group_per_message:true,
    tie_notice_once:true,
    navigation_inline:true,
    update_existing_message_when_possible:true
  }
});
