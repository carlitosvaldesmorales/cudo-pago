import { loadResultControlPlane, SERIES_LABEL, SLOT_STATE } from './result-control-plane-model.js';

const SERIES_ORDER = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
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

function formatMoment(value){
  if(!value) return 'Fecha no registrada';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return esc(value);
  try{
    const parts=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return `${get('day')}-${get('month')}-${get('year')} · ${get('hour')}:${get('minute')}`;
  }catch{return esc(value)}
}

function actorLabel(v,row){
  const name=String(v.display_name||'').trim();
  const username=String(v.username||'').trim();
  if(name) return `${esc(name)}${username?` · @${esc(username)}`:''}`;
  if(!v.actor_id) return v.action==='BASELINE'?'Actor no registrado en la versión inicial':'Actor no registrado';
  let role=v.actor_role==='SUPER_ADMIN'?'Administrador global':v.actor_role==='CLUB_ADMIN'?'Dirigente':'Usuario';
  if(v.actor_club_id===row.home_id) role+=` · ${row.home_name}`;
  else if(v.actor_club_id===row.away_id) role+=` · ${row.away_name}`;
  return `${esc(role)} · ID ${esc(v.actor_id)}`;
}

function visibleReason(v){
  if(v.action!=='CORRECT') return '';
  const reason=String(v.reason||'').trim();
  if(!reason||reason==='super_admin_score_correction') return 'Motivo no registrado en esta corrección anterior';
  return reason;
}

async function sendApi(token,method,body){
  return fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
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

function matchIcon(match){
  if(match.state==='DISPUTED') return '⚠️';
  if(match.state==='HAS_ANNULLED') return '🚫';
  if(match.state==='INCOMPLETE') return '🟡';
  return '✅';
}

function slotButton(reporter,match,slot){
  if(slot.state===SLOT_STATE.MISSING){
    const callback=isSuperAdmin(reporter)
      ? `ga:series:${match.match_id}:${slot.series_code}`
      : `rs:series:${match.match_id}:${slot.series_code}`;
    return {text:`➕ ${slot.series_label} · Sin resultado`,callback_data:callback};
  }
  const icon=slot.state===SLOT_STATE.OFFICIAL?'✅':slot.state===SLOT_STATE.DISPUTED?'⚠️':'🚫';
  return {text:`${icon} ${slot.series_label} · ${slot.home_score}–${slot.away_score}`,callback_data:`rg:r:${match.match_id}:${slot.series_code}`};
}

async function showMatchList(env,token,chatId,callback,reporter){
  const plane=await loadResultControlPlane(env.DB,{reporter});
  const matches=[...plane.matches].sort((a,b)=>b.round_no-a.round_no||String(a.match_id).localeCompare(String(b.match_id)));
  if(!matches.length){
    await present(token,chatId,callback,'🛡️ <b>GOBIERNO DE RESULTADOS</b>\n\nNo hay partidos dentro de tu alcance.',{inline_keyboard:[[{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]]});
    return;
  }
  const buttons=matches.map(m=>[{text:`${matchIcon(m)} ${m.round_label} · ${m.home_name} — ${m.away_name} · ${m.counts.OFFICIAL}/4`,callback_data:`rgux:m:${m.match_id}`}]);
  buttons.push([{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]);
  const summary=plane.summary;
  const scope=isSuperAdmin(reporter)?'Control global de todos los partidos y sus cuatro series.':'Control de los partidos de tu club.';
  await present(token,chatId,callback,
    `🛡️ <b>GOBIERNO DE RESULTADOS</b>\n\n${scope}\n\n`+
    `Esperados: <b>${summary.expected_slots}</b> · Oficiales: <b>${summary.OFFICIAL}</b> · Sin resultado: <b>${summary.MISSING}</b>`+
    `${summary.DISPUTED?` · En disputa: <b>${summary.DISPUTED}</b>`:''}${summary.ANNULLED?` · Anulados: <b>${summary.ANNULLED}</b>`:''}\n\n`+
    `Elige un partido. Los espacios sin marcador también son gobernables.`,
    {inline_keyboard:buttons}
  );
}

async function showMatch(env,token,chatId,callback,reporter,matchId){
  const plane=await loadResultControlPlane(env.DB,{reporter});
  const match=plane.matches.find(x=>x.match_id===matchId);
  if(!match){
    await present(token,chatId,callback,'🔒 Ese partido no está disponible dentro de tu alcance.',{inline_keyboard:[[{text:'⬅️ Partidos',callback_data:'rg:list'}]]});
    return false;
  }
  const cells=SERIES_ORDER.map(code=>slotButton(reporter,match,match.slots.find(x=>x.series_code===code)));
  const keyboard=[];
  for(let i=0;i<cells.length;i+=2) keyboard.push(cells.slice(i,i+2));
  keyboard.push([{text:'⬅️ Todos los partidos',callback_data:'rg:list'}]);
  await present(token,chatId,callback,
    `🛡️ <b>RESULTADOS DEL PARTIDO</b>\n\n📅 ${esc(match.round_label)} · Grupo ${esc(match.group_id)}\n🏟️ <b>${esc(match.home_name)} — ${esc(match.away_name)}</b>\n\n`+
    `Estado: <b>${match.counts.OFFICIAL}/4 oficiales</b> · ${match.counts.MISSING} sin resultado${match.counts.DISPUTED?` · ${match.counts.DISPUTED} en disputa`:''}${match.counts.ANNULLED?` · ${match.counts.ANNULLED} anulados`:''}\n\n`+
    `Selecciona cualquiera de las cuatro series.`,
    {inline_keyboard:keyboard}
  );
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
  const q=await env.DB.prepare(`SELECT v.version_no,v.home_score,v.away_score,v.validation_status,v.action,v.reason,v.actor_id,v.actor_role,v.actor_club_id,v.created_at,
      r.display_name,r.username
    FROM match_series_result_versions v
    LEFT JOIN reporters r ON r.telegram_user_id=v.actor_id
    WHERE v.match_id=? AND v.series_code=? ORDER BY v.version_no DESC LIMIT 12`).bind(matchId,seriesCode).all();
  const versions=q.results||[];
  const lines=versions.map((v,i)=>{
    const reason=visibleReason(v);
    return `${i===0?'🔹':'▫️'} ${v.home_score}–${v.away_score} · ${statusLabel(v.validation_status)}\n   ${ACTION_LABEL[v.action]||esc(v.action)}\n   👤 ${actorLabel(v,row)}\n   🕒 ${formatMoment(v.created_at)}${reason?`\n   📝 ${esc(reason)}`:''}`;
  });
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
