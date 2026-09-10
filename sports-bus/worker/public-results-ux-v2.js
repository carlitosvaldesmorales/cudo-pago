const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

const SERIES_ORDER=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};

export async function handlePublicResultsUxV2(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram-next'||request.method!=='POST') return null;

  let update;
  try{update=await request.json();}catch{return null;}
  const callback=update.callback_query;
  const actor=callback?.from;
  const chatId=callback?.message?.chat?.id;
  const data=String(callback?.data||'');
  if(!actor?.id||!chatId) return null;
  if(data!=='tp:public-results'&&!data.startsWith('px:')) return null;

  const presented=request.headers.get('x-telegram-bot-api-secret-token');
  const expected=env.TELEGRAM_WEBHOOK_SECRET?await sha256Hex(env.TELEGRAM_WEBHOOK_SECRET):null;
  if(!expected||presented!==expected) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'public_results_ux_not_configured'},503);

  if(data==='tp:public-results'||data==='px:home'){
    await answer(env,callback.id,'Resultados oficiales');
    await showHome(env,chatId);
    return json({ok:true,handled:'public_results_ux_home'});
  }

  if(data==='px:latest'){
    const latest=await latestRound(env.DB);
    await answer(env,callback.id,latest?`Fecha ${latest.round_no}`:'Sin resultados');
    if(!latest){await send(env,chatId,'⚽ RESULTADOS OFICIALES\n\nTodavía no hay resultados verificados.',homeKeyboard());return json({ok:true,handled:'public_results_ux_empty'});}
    await showRound(env,chatId,latest.round_no);
    return json({ok:true,handled:'public_results_ux_latest',round_no:latest.round_no});
  }

  if(data==='px:dates'){
    await answer(env,callback.id,'Fechas');
    await showDatePicker(env,chatId);
    return json({ok:true,handled:'public_results_ux_dates'});
  }

  const dateMatch=data.match(/^px:d:(\d{1,3})$/);
  if(dateMatch){
    const roundNo=Number(dateMatch[1]);
    await answer(env,callback.id,`Fecha ${roundNo}`);
    await showRound(env,chatId,roundNo);
    return json({ok:true,handled:'public_results_ux_round',round_no:roundNo});
  }

  const matchPick=data.match(/^px:m:(\d{1,3}):([A-Za-z0-9._:-]+)$/);
  if(matchPick){
    const roundNo=Number(matchPick[1]);
    const teamId=matchPick[2];
    await answer(env,callback.id,'Partido');
    await showMatch(env,chatId,roundNo,teamId);
    return json({ok:true,handled:'public_results_ux_match',round_no:roundNo,team_id:teamId});
  }

  if(data==='px:clubs'){
    await answer(env,callback.id,'Clubes');
    await showClubPicker(env,chatId);
    return json({ok:true,handled:'public_results_ux_clubs'});
  }

  const clubMatch=data.match(/^px:c:([A-Za-z0-9._:-]+)$/);
  if(clubMatch){
    await answer(env,callback.id,'Club');
    await showClub(env,chatId,clubMatch[1]);
    return json({ok:true,handled:'public_results_ux_club',team_id:clubMatch[1]});
  }

  if(data==='px:series'){
    await answer(env,callback.id,'Series');
    await showSeriesPicker(env,chatId);
    return json({ok:true,handled:'public_results_ux_series'});
  }

  const seriesMatch=data.match(/^px:s:(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesMatch){
    await answer(env,callback.id,seriesLabel(seriesMatch[1]));
    await showSeriesDates(env,chatId,seriesMatch[1]);
    return json({ok:true,handled:'public_results_ux_series_dates',series_code:seriesMatch[1]});
  }

  const seriesDate=data.match(/^px:sd:(TERCERA|SEGUNDA|SENIOR|PRIMERA):(\d{1,3})$/);
  if(seriesDate){
    await answer(env,callback.id,'Resultados');
    await showSeriesRound(env,chatId,seriesDate[1],Number(seriesDate[2]));
    return json({ok:true,handled:'public_results_ux_series_round',series_code:seriesDate[1],round_no:Number(seriesDate[2])});
  }

  return null;
}

async function showHome(env,chatId){
  const latest=await latestRound(env.DB);
  const latestText=latest?`🆕 ${latest.round_label||`Fecha ${latest.round_no}`} · última con resultados`:'🆕 Última fecha';
  await send(env,chatId,'⚽ RESULTADOS OFICIALES\n\nConsulta de forma rápida por fecha, club o serie.',{
    inline_keyboard:[
      [{text:latestText,callback_data:'px:latest'}],
      [{text:'📅 Por fecha',callback_data:'px:dates'},{text:'🏟 Por club',callback_data:'px:clubs'}],
      [{text:'🏆 Por serie',callback_data:'px:series'}],
      [{text:'🌐 Volver a Público',callback_data:'tp:public'}]
    ]
  });
}

async function showDatePicker(env,chatId){
  const q=await env.DB.prepare(`SELECT DISTINCT m.round_no,m.round_label
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC LIMIT 12`).all();
  const rows=(q.results||[]).map(r=>[{text:`📅 ${r.round_label||`Fecha ${r.round_no}`}`,callback_data:`px:d:${r.round_no}`}]);
  rows.push([{text:'⬅️ Resultados',callback_data:'px:home'}]);
  await send(env,chatId,'📅 RESULTADOS POR FECHA\n\nElige una fecha para ver sus partidos.',{inline_keyboard:rows});
}

async function showRound(env,chatId,roundNo){
  const q=await env.DB.prepare(`SELECT m.match_id,m.round_no,m.round_label,m.group_id,m.home_id,m.home_name,m.away_id,m.away_name,COUNT(r.series_code) AS series_count
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND m.round_no=? AND r.validation_status='VERIFIED'
    GROUP BY m.match_id,m.round_no,m.round_label,m.group_id,m.home_id,m.home_name,m.away_id,m.away_name
    ORDER BY m.group_id,m.match_id`).bind(roundNo).all();
  const matches=q.results||[];
  if(!matches.length){
    await send(env,chatId,`📅 FECHA ${roundNo}\n\nNo hay resultados verificados para esta fecha.`,{inline_keyboard:[[{text:'⬅️ Fechas',callback_data:'px:dates'}],[{text:'⚽ Resultados',callback_data:'px:home'}]]});
    return;
  }
  const label=matches[0].round_label||`Fecha ${roundNo}`;
  const buttons=matches.map(m=>[{text:`🏟 ${m.home_name} vs ${m.away_name} · ${Number(m.series_count)}/4`,callback_data:`px:m:${roundNo}:${m.home_id}`}]);
  buttons.push([{text:'⬅️ Fechas',callback_data:'px:dates'},{text:'⚽ Inicio resultados',callback_data:'px:home'}]);
  await send(env,chatId,`📅 ${String(label).toUpperCase()} · RESULTADOS OFICIALES\n\nSelecciona un partido para ver sus series.`,{inline_keyboard:buttons});
}

async function showMatch(env,chatId,roundNo,teamId){
  const match=await env.DB.prepare(`SELECT match_id,round_no,round_label,group_id,home_id,home_name,away_id,away_name
    FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=? AND (home_id=? OR away_id=?) LIMIT 1`).bind(roundNo,teamId,teamId).first();
  if(!match){await send(env,chatId,'No encontré ese partido.',homeKeyboard());return;}
  const q=await env.DB.prepare(`SELECT series_code,home_score,away_score FROM match_series_results
    WHERE match_id=? AND validation_status='VERIFIED'`).bind(match.match_id).all();
  const bySeries=new Map((q.results||[]).map(r=>[r.series_code,r]));
  const lines=SERIES_ORDER.filter(code=>bySeries.has(code)).map(code=>{
    const r=bySeries.get(code);
    return `${seriesLabel(code).padEnd(7,' ')} ${r.home_score} — ${r.away_score}`;
  });
  const group=match.group_id?` · Grupo ${match.group_id}`:'';
  await send(env,chatId,`⚽ ${(match.round_label||`Fecha ${roundNo}`).toUpperCase()}${group}\n🏟 ${match.home_name} vs ${match.away_name}\n\n${lines.join('\n')}\n\n✅ Resultados verificados`,{
    inline_keyboard:[
      [{text:`⬅️ ${match.round_label||`Fecha ${roundNo}`}`,callback_data:`px:d:${roundNo}`}],
      [{text:'⚽ Resultados oficiales',callback_data:'px:home'}]
    ]
  });
}

async function showClubPicker(env,chatId){
  const q=await env.DB.prepare(`SELECT DISTINCT t.team_id,t.canonical_name
    FROM teams t JOIN matches m ON (m.home_id=t.team_id OR m.away_id=t.team_id)
    JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.validation_status='VERIFIED'
    ORDER BY t.canonical_name`).all();
  const buttons=[];
  for(const t of q.results||[]) buttons.push([{text:`🏟 ${t.canonical_name}`,callback_data:`px:c:${t.team_id}`}]);
  buttons.push([{text:'⬅️ Resultados',callback_data:'px:home'}]);
  await send(env,chatId,'🏟 RESULTADOS POR CLUB\n\nElige un club para ver sus fechas con resultados.',{inline_keyboard:buttons});
}

async function showClub(env,chatId,teamId){
  const team=await env.DB.prepare('SELECT team_id,canonical_name FROM teams WHERE team_id=?').bind(teamId).first();
  if(!team){await send(env,chatId,'No encontré ese club.',homeKeyboard());return;}
  const q=await env.DB.prepare(`SELECT DISTINCT m.round_no,m.round_label,m.home_id,m.home_name,m.away_id,m.away_name
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND (m.home_id=? OR m.away_id=?) AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC LIMIT 12`).bind(teamId,teamId).all();
  const buttons=(q.results||[]).map(m=>{
    const opponent=m.home_id===teamId?m.away_name:m.home_name;
    return [{text:`${m.round_label||`Fecha ${m.round_no}`} · vs ${opponent}`,callback_data:`px:m:${m.round_no}:${teamId}`}];
  });
  buttons.push([{text:'⬅️ Clubes',callback_data:'px:clubs'},{text:'⚽ Resultados',callback_data:'px:home'}]);
  await send(env,chatId,`🏟 ${team.canonical_name.toUpperCase()}\n\nSelecciona una fecha para ver el marcador por series.`,{inline_keyboard:buttons});
}

async function showSeriesPicker(env,chatId){
  await send(env,chatId,'🏆 RESULTADOS POR SERIE\n\nElige la serie que quieres consultar.',{
    inline_keyboard:[
      [{text:'3ª Tercera',callback_data:'px:s:TERCERA'},{text:'2ª Segunda',callback_data:'px:s:SEGUNDA'}],
      [{text:'Senior',callback_data:'px:s:SENIOR'},{text:'1ª Primera',callback_data:'px:s:PRIMERA'}],
      [{text:'⬅️ Resultados',callback_data:'px:home'}]
    ]
  });
}

async function showSeriesDates(env,chatId,seriesCode){
  const q=await env.DB.prepare(`SELECT DISTINCT m.round_no,m.round_label
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.validation_status='VERIFIED' AND r.series_code=?
    ORDER BY m.round_no DESC LIMIT 12`).bind(seriesCode).all();
  const buttons=(q.results||[]).map(r=>[{text:`📅 ${r.round_label||`Fecha ${r.round_no}`}`,callback_data:`px:sd:${seriesCode}:${r.round_no}`}]);
  buttons.push([{text:'⬅️ Series',callback_data:'px:series'},{text:'⚽ Resultados',callback_data:'px:home'}]);
  await send(env,chatId,`🏆 ${seriesLongLabel(seriesCode).toUpperCase()}\n\nElige una fecha.`,{inline_keyboard:buttons});
}

async function showSeriesRound(env,chatId,seriesCode,roundNo){
  const q=await env.DB.prepare(`SELECT m.round_label,m.group_id,m.home_name,m.away_name,r.home_score,r.away_score
    FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND m.round_no=? AND r.series_code=? AND r.validation_status='VERIFIED'
    ORDER BY m.group_id,m.match_id`).bind(roundNo,seriesCode).all();
  const rows=q.results||[];
  const label=rows[0]?.round_label||`Fecha ${roundNo}`;
  const lines=rows.map(r=>`${r.group_id?`Grupo ${r.group_id} · `:''}${r.home_name} ${r.home_score} — ${r.away_score} ${r.away_name}`);
  await send(env,chatId,`🏆 ${seriesLongLabel(seriesCode).toUpperCase()} · ${String(label).toUpperCase()}\n\n${lines.length?lines.join('\n\n'):'No hay resultados verificados para esta fecha.'}`,{
    inline_keyboard:[
      [{text:`⬅️ ${seriesLongLabel(seriesCode)}`,callback_data:`px:s:${seriesCode}`}],
      [{text:'⚽ Resultados oficiales',callback_data:'px:home'}]
    ]
  });
}

async function latestRound(db){
  return db.prepare(`SELECT m.round_no,m.round_label FROM matches m JOIN match_series_results r ON r.match_id=m.match_id
    WHERE m.competition_id='ANFA-CHEPICA-2026' AND r.validation_status='VERIFIED'
    ORDER BY m.round_no DESC LIMIT 1`).first();
}

function homeKeyboard(){return {inline_keyboard:[[{text:'⚽ Resultados oficiales',callback_data:'px:home'}],[{text:'🌐 Público',callback_data:'tp:public'}]]};}
function seriesLabel(code){return SERIES_LABEL[code]||code;}
function seriesLongLabel(code){return ({TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'})[code]||code;}

async function send(env,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  const r=await telegram(env,'sendMessage',body);
  if(!r.ok) throw new Error('telegram_public_results_send_failed');
}

async function answer(env,callbackId,text){
  if(!callbackId) return;
  await telegram(env,'answerCallbackQuery',{callback_query_id:callbackId,text});
}

async function telegram(env,method,body){
  const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  });
  return response.json();
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
