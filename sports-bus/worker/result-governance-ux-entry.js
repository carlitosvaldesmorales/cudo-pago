const SERIES_ORDER = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const STATUS_LABEL = {VERIFIED:'Oficial',DISPUTED:'En disputa',ANNULLED:'Anulado'};
const STATUS_ICON = {VERIFIED:'✅',DISPUTED:'⚠️',ANNULLED:'🚫'};
const ACTION_LABEL = {BASELINE:'Registro inicial',CORRECT:'Marcador corregido',DISPUTE:'Puesto en disputa',RESOLVE:'Disputa resuelta',ANNUL:'Resultado anulado',RESTORE:'Resultado restaurado'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

async function deriveTelegramSafeSecret(source){
  const bytes=new TextEncoder().encode(source);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function slot(url){return url.pathname==='/webhook/telegram-next'?'next':'primary'}
function isVerifiedAdmin(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&['SUPER_ADMIN','CLUB_ADMIN'].includes(r.role)}
function isSuperAdmin(r){return isVerifiedAdmin(r)&&r.role==='SUPER_ADMIN'}
function canSee(r,row){return isSuperAdmin(r)||(r?.role==='CLUB_ADMIN'&&r.club_id&&(r.club_id===row.home_id||r.club_id===row.away_id))}
function statusIcon(status){return STATUS_ICON[status]||'•'}
function statusLabel(status){return STATUS_LABEL[status]||status}

async function sendApi(token,method,body){
  const res=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return res;
}

async function present(token,chatId,callback,text,replyMarkup){
  const body={chat_id:chatId,text,parse_mode:'HTML',reply_markup:replyMarkup};
  if(callback?.message?.message_id){
    const edit={...body,message_id:callback.message.message_id};
    const res=await sendApi(token,'editMessageText',edit);
    if(res.ok){
      if(callback.id) await sendApi(token,'answerCallbackQuery',{callback_query_id:callback.id});
      return;
    }
  }
  await sendApi(token,'sendMessage',body);
  if(callback?.id) await sendApi(token,'answerCallbackQuery',{callback_query_id:callback.id});
}

async function currentResult(db,matchId,seriesCode){
  return db.prepare(`SELECT r.*,m.competition_id,m.season_id,m.home_id,m.home_name,m.away_id,m.away_name,m.group_id,m.round_no,m.round_label
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE r.match_id=? AND r.series_code=?`).bind(matchId,seriesCode).first();
}

async function rowsInScope(db,reporter){
  const base=`SELECT r.match_id,r.series_code,r.home_score,r.away_score,r.validation_status,r.governance_version,
    m.home_id,m.home_name,m.away_id,m.away_name,m.group_id,m.round_no,m.round_label
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id`;
  const q=isSuperAdmin(reporter)
    ? await db.prepare(`${base} ORDER BY m.round_no DESC,r.match_id,CASE r.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END`).all()
    : await db.prepare(`${base} WHERE m.home_id=? OR m.away_id=? ORDER BY m.round_no DESC,r.match_id,CASE r.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END`).bind(reporter.club_id,reporter.club_id).all();
  return q.results||[];
}

function groupMatches(rows){
  const map=new Map();
  for(const r of rows){
    if(!map.has(r.match_id)) map.set(r.match_id,{match_id:r.match_id,round_no:r.round_no,round_label:r.round_label,group_id:r.group_id,home_id:r.home_id,home_name:r.home_name,away_id:r.away_id,away_name:r.away_name,series:[]});
    map.get(r.match_id).series.push(r);
  }
  return [...map.values()];
}

function matchState(match){
  if(match.series.some(x=>x.validation_status==='DISPUTED')) return '⚠️';
  if(match.series.some(x=>x.validation_status==='ANNULLED')) return '🚫';
  return '✅';
}

async function showMatchList(env,token,chatId,callback,reporter){
  const matches=groupMatches(await rowsInScope(env.DB,reporter));
  if(!matches.length){
    await present(token,chatId,callback,'🛡️ <b>GOBIERNO DE RESULTADOS</b>\n\nNo hay resultados oficiales dentro de tu alcance.',{inline_keyboard:[[{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]]});
    return;
  }
  const buttons=matches.map(m=>[{text:`${matchState(m)} ${m.round_label} · ${m.home_name} — ${m.away_name}`,callback_data:`rgux:m:${m.match_id}`}]);
  buttons.push([{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]);
  await present(token,chatId,callback,`🛡️ <b>GOBIERNO DE RESULTADOS</b>\n\n${isSuperAdmin(reporter)?'Administración global del campeonato.':'Sólo partidos de tu club.'}\nElige un partido para revisar sus series.`,{inline_keyboard:buttons});
}

async function showMatch(env,token,chatId,callback,reporter,matchId){
  const rows=(await rowsInScope(env.DB,reporter)).filter(x=>x.match_id===matchId);
  if(!rows.length){
    await present(token,chatId,callback,'🔒 Ese partido no está disponible dentro de tu alcance.',{inline_keyboard:[[{text:'⬅️ Partidos',callback_data:'rg:list'}]]});
    return false;
  }
  const first=rows[0];
  const bySeries=new Map(rows.map(r=>[r.series_code,r]));
  const cells=SERIES_ORDER.filter(s=>bySeries.has(s)).map(s=>{
    const r=bySeries.get(s);
    return {text:`${statusIcon(r.validation_status)} ${SERIES_LABEL[s]} · ${r.home_score}–${r.away_score}`,callback_data:`rg:r:${matchId}:${s}`};
  });
  const keyboard=[];
  for(let i=0;i<cells.length;i+=2) keyboard.push(cells.slice(i,i+2));
  keyboard.push([{text:'⬅️ Todos los partidos',callback_data:'rg:list'}]);
  await present(token,chatId,callback,`🛡️ <b>RESULTADOS DEL PARTIDO</b>\n\n📅 ${esc(first.round_label)} · Grupo ${esc(first.group_id)}\n🏟️ <b>${esc(first.home_name)} — ${esc(first.away_name)}</b>\n\nSelecciona la serie que necesitas revisar.`,{inline_keyboard:keyboard});
  return true;
}

async function showResult(env,token,chatId,callback,reporter,matchId,seriesCode){
  const row=await currentResult(env.DB,matchId,seriesCode);
  if(!row||!canSee(reporter,row)){
    await present(token,chatId,callback,'🔒 Ese resultado no está disponible dentro de tu alcance.',{inline_keyboard:[[{text:'⬅️ Partidos',callback_data:'rg:list'}]]});
    return false;
  }
  const buttons=[];
  if(isSuperAdmin(reporter)){
    if(row.validation_status==='VERIFIED'){
      buttons.push([{text:'✏️ Corregir marcador',callback_data:`rg:correct:${row.match_id}:${row.series_code}`,style:'primary'}]);
      buttons.push([{text:'⚠️ Poner en disputa',callback_data:`rg:dispute:${row.match_id}:${row.series_code}`}]);
      buttons.push([{text:'🚫 Anular resultado',callback_data:`rg:annul:${row.match_id}:${row.series_code}`,style:'danger'}]);
    }else if(row.validation_status==='DISPUTED'){
      buttons.push([{text:'✅ Confirmar marcador actual',callback_data:`rg:confirm:${row.match_id}:${row.series_code}`,style:'success'}]);
      buttons.push([{text:'✏️ Corregir y resolver',callback_data:`rg:correct:${row.match_id}:${row.series_code}`,style:'primary'}]);
      buttons.push([{text:'🚫 Anular resultado',callback_data:`rg:annul:${row.match_id}:${row.series_code}`,style:'danger'}]);
    }else if(row.validation_status==='ANNULLED'){
      buttons.push([{text:'♻️ Restaurar resultado',callback_data:`rg:restore:${row.match_id}:${row.series_code}`,style:'success'}]);
    }
  }else if(row.validation_status==='VERIFIED'){
    buttons.push([{text:'⚠️ Disputar resultado',callback_data:`rg:dispute:${row.match_id}:${row.series_code}`}]);
  }
  buttons.push([{text:'🕘 Ver historial',callback_data:`rg:h:${row.match_id}:${row.series_code}`}]);
  buttons.push([{text:'⬅️ Volver al partido',callback_data:`rgux:m:${row.match_id}`}]);
  const effect=row.validation_status==='VERIFIED'?'Publicado y suma en la tabla':'Fuera de publicación y tabla';
  await present(token,chatId,callback,`🧾 <b>RESULTADO OFICIAL</b>\n\n📅 ${esc(row.round_label)} · Grupo ${esc(row.group_id)}\n🏟️ <b>${esc(row.home_name)} ${row.home_score}–${row.away_score} ${esc(row.away_name)}</b>\n🏆 ${SERIES_LABEL[row.series_code]||esc(row.series_code)}\n\n${statusIcon(row.validation_status)} <b>${statusLabel(row.validation_status)}</b> · ${effect}`,{inline_keyboard:buttons});
  return true;
}

async function showHistory(env,token,chatId,callback,reporter,matchId,seriesCode){
  const row=await currentResult(env.DB,matchId,seriesCode);
  if(!row||!canSee(reporter,row)) return false;
  const q=await env.DB.prepare(`SELECT version_no,home_score,away_score,validation_status,action,created_at
    FROM match_series_result_versions WHERE match_id=? AND series_code=? ORDER BY version_no DESC LIMIT 12`).bind(matchId,seriesCode).all();
  const versions=q.results||[];
  const lines=versions.map((v,i)=>`${i===0?'🔹':'▫️'} ${v.home_score}–${v.away_score} · ${statusLabel(v.validation_status)}\n   ${ACTION_LABEL[v.action]||v.action}`);
  await present(token,chatId,callback,`🕘 <b>HISTORIAL DEL RESULTADO</b>\n\n🏟️ ${esc(row.home_name)} — ${esc(row.away_name)}\n🏆 ${SERIES_LABEL[row.series_code]||esc(row.series_code)}\n\n${lines.join('\n\n')||'Sin movimientos registrados.'}`,{inline_keyboard:[[{text:'⬅️ Resultado',callback_data:`rg:r:${row.match_id}:${row.series_code}`}]]});
  return true;
}

export async function handleResultGovernanceUxRequest(request,env){
  const url=new URL(request.url);
  if(!['/webhook/telegram','/webhook/telegram-next'].includes(url.pathname)||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json()}catch{return null}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;
  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const relevant=/^\/(correcciones|gobiernoresultados)(?:@\w+)?$/i.test(text)||data==='rg:list'||/^rgux:m:/.test(data)||/^rg:r:/.test(data)||/^rg:h:/.test(data);
  if(!relevant) return null;
  if(!env.DB||!env.TELEGRAM_WEBHOOK_SECRET) return null;
  const secretSource=slot(url)==='next'?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await deriveTelegramSafeSecret(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return null;
  const token=slot(url)==='next'?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return null;
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(String(actor.id)).first();
  if(!isVerifiedAdmin(reporter)) return null;

  if(/^\/(correcciones|gobiernoresultados)(?:@\w+)?$/i.test(text)||data==='rg:list'){
    await showMatchList(env,token,chatId,callback,reporter);
    return json({ok:true,handled:'result_governance_ux_list'});
  }
  const matchCb=data.match(/^rgux:m:([A-Za-z0-9._:-]+)$/);
  if(matchCb){
    const ok=await showMatch(env,token,chatId,callback,reporter,matchCb[1]);
    return json({ok:true,handled:ok?'result_governance_ux_match':'result_governance_ux_match_denied'});
  }
  const resultCb=data.match(/^rg:r:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(resultCb){
    const ok=await showResult(env,token,chatId,callback,reporter,resultCb[1],resultCb[2]);
    return json({ok:true,handled:ok?'result_governance_ux_detail':'result_governance_ux_detail_denied'});
  }
  const histCb=data.match(/^rg:h:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(histCb){
    const ok=await showHistory(env,token,chatId,callback,reporter,histCb[1],histCb[2]);
    return json({ok:true,handled:ok?'result_governance_ux_history':'result_governance_ux_history_denied'});
  }
  return null;
}
