const SERIES = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'};
const PRIMARY_PATH='/webhook/telegram';
const NEXT_PATH='/webhook/telegram-next';
const PUBLIC_COMPETITION='ANFA-CHEPICA-2026';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

async function deriveSafeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function slot(url){return url.pathname===NEXT_PATH?'next':'primary'}
function tokenFor(env,url){return slot(url)==='next'?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN}
async function telegram(token,method,body){
  return fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
async function send(token,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await telegram(token,'sendMessage',body);
}
async function answer(token,id,text){if(id) await telegram(token,'answerCallbackQuery',{callback_query_id:id,text})}

async function publicMatch(db,matchId){
  return db.prepare(`SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name
    FROM matches WHERE match_id=? AND competition_id=?`).bind(matchId,PUBLIC_COMPETITION).first();
}
async function currentResult(db,matchId,seriesCode){
  return db.prepare(`SELECT result_id,match_id,series_code,home_score,away_score,validation_status,governance_version
    FROM match_series_results WHERE match_id=? AND series_code=?`).bind(matchId,seriesCode).first();
}

function buttonFor(matchId,code,r){
  if(!r) return {text:`📝 ${SERIES_LABEL[code]}`,callback_data:`pr:series:${matchId}:${code}`};
  if(r.validation_status==='VERIFIED') return {text:`✅ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score} · oficial`,callback_data:`pr:official:${matchId}:${code}`};
  if(r.validation_status==='DISPUTED') return {text:`⚠️ ${SERIES_LABEL[code]} · en revisión`,callback_data:`pr:status:${matchId}:${code}`};
  if(r.validation_status==='ANNULLED') return {text:`🚫 ${SERIES_LABEL[code]} · anulado`,callback_data:`pr:status:${matchId}:${code}`};
  return {text:`⏸️ ${SERIES_LABEL[code]} · no publicable`,callback_data:`pr:status:${matchId}:${code}`};
}

async function showStatus(token,chatId,callback,row,match){
  const label=SERIES_LABEL[row.series_code]||row.series_code;
  if(row.validation_status==='VERIFIED'){
    await answer(token,callback?.id,'Resultado oficial');
    await send(token,chatId,`✅ ${label} tiene resultado oficial ${row.home_score}-${row.away_score}.\n\nUn aporte público no puede reemplazarlo. Las correcciones se gestionan por el flujo de dirigentes.`,{inline_keyboard:[[{text:'⬅️ Volver al partido',callback_data:`pr:match:${match.match_id}`}]]});
    return 'VERIFIED';
  }
  if(row.validation_status==='DISPUTED'){
    await answer(token,callback?.id,'Resultado en revisión');
    await send(token,chatId,`⚠️ ${label} está EN REVISIÓN por una disputa de resultado.\n\nMientras se resuelve, no se muestra un marcador como oficial ni se acepta un aporte público para reemplazarlo.`,{inline_keyboard:[[{text:'⬅️ Volver al partido',callback_data:`pr:match:${match.match_id}`}]]});
    return 'DISPUTED';
  }
  if(row.validation_status==='ANNULLED'){
    await answer(token,callback?.id,'Resultado anulado');
    await send(token,chatId,`🚫 ${label} tiene el resultado ANULADO.\n\nNo existe un marcador oficial publicable para esta serie. La situación debe resolverse desde el portal de dirigentes.`,{inline_keyboard:[[{text:'⬅️ Volver al partido',callback_data:`pr:match:${match.match_id}`}]]});
    return 'ANNULLED';
  }
  await answer(token,callback?.id,'Resultado no publicable');
  await send(token,chatId,`⏸️ ${label} tiene un estado de gobierno que no permite publicarlo como oficial.\n\nVuelve a intentarlo cuando un dirigente haya resuelto el estado.`,{inline_keyboard:[[{text:'⬅️ Volver al partido',callback_data:`pr:match:${match.match_id}`}]]});
  return row.validation_status||'UNKNOWN';
}

export async function handlePublicResultGovernanceStatus(request,env){
  const url=new URL(request.url);
  if(![PRIMARY_PATH,NEXT_PATH].includes(url.pathname)||request.method!=='POST'||!env.DB||!env.TELEGRAM_WEBHOOK_SECRET) return null;

  let update;
  try{update=await request.clone().json()}catch{return null}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;
  const data=String(callback?.data||'');
  const text=String(message?.text||'').trim();
  const matchCb=data.match(/^pr:match:([A-Za-z0-9._:-]+)$/);
  const seriesCb=data.match(/^pr:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  const officialCb=data.match(/^pr:official:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  const statusCb=data.match(/^pr:status:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  let session=null;
  if(message?.text&&/^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text)){
    session=await env.DB.prepare('SELECT * FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(String(actor.id)).first();
  }
  if(!matchCb&&!seriesCb&&!officialCb&&!statusCb&&!session) return null;

  const source=slot(url)==='next'?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await deriveSafeSecret(source);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return null;
  const token=tokenFor(env,url);
  if(!token) return null;

  if(matchCb){
    const match=await publicMatch(env.DB,matchCb[1]);
    if(!match){
      await answer(token,callback?.id,'Partido no disponible');
      return json({ok:true,handled:'public_result_governance_invalid_match'});
    }
    const q=await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
    const current=new Map((q.results||[]).map(x=>[x.series_code,x]));
    const rows=SERIES.map(code=>[buttonFor(match.match_id,code,current.get(code))]);
    rows.push([{text:`⬅️ ${match.round_label||'Fecha'}`,callback_data:`pr:date:${match.round_no}`}]);
    await answer(token,callback?.id,match.round_label||'Partido');
    await send(token,chatId,`${match.round_label} · Grupo ${match.group_id}\n${match.home_name} vs ${match.away_name}\n\nSelecciona una serie.\n✅ Oficial · ⚠️ En revisión · 🚫 Anulado · 📝 Disponible para aportar.`,{inline_keyboard:rows});
    return json({ok:true,handled:'public_result_series_menu',match_id:match.match_id,status_aware:true});
  }

  const selected=seriesCb||officialCb||statusCb;
  if(selected){
    const match=await publicMatch(env.DB,selected[1]);
    if(!match){
      await answer(token,callback?.id,'Partido no disponible');
      return json({ok:true,handled:'public_result_governance_invalid_match'});
    }
    const row=await currentResult(env.DB,selected[1],selected[2]);
    if(!row){
      if(seriesCb) return null;
      await answer(token,callback?.id,'Estado actualizado');
      await send(token,chatId,'ℹ️ Esa serie ya no tiene un resultado registrado. Vuelve al partido para actualizar la vista.',{inline_keyboard:[[{text:'⬅️ Volver al partido',callback_data:`pr:match:${match.match_id}`}]]});
      return json({ok:true,handled:'public_result_governance_status_changed'});
    }
    const state=await showStatus(token,chatId,callback,row,match);
    return json({ok:true,handled:state==='VERIFIED'?'public_result_already_verified':'public_result_governance_locked',validation_status:state});
  }

  if(session){
    const match=await publicMatch(env.DB,session.match_id);
    if(!match||!SERIES.includes(session.series_code)){
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(String(actor.id)).run();
      await send(token,chatId,'⚠️ La sesión de aporte ya no corresponde a un partido público válido. No se guardó ningún resultado.');
      return json({ok:true,handled:'public_result_governance_invalid_session'});
    }
    const row=await currentResult(env.DB,session.match_id,session.series_code);
    if(row&&row.validation_status!=='VERIFIED'){
      await env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(String(actor.id)).run();
      const state=await showStatus(token,chatId,null,row,match);
      return json({ok:true,handled:'public_result_governance_race_locked',validation_status:state});
    }
    return null;
  }

  return null;
}
