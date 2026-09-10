const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const SCORE_RE=/^\s*(\d{1,2})\s*[-:]\s*(\d{1,2})\s*$/;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function slot(url){return url.pathname==='/webhook/telegram-next'?'next':'primary'}
function isVerifiedAdmin(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&['SUPER_ADMIN','CLUB_ADMIN'].includes(r.role)}
function isSuperAdmin(r){return isVerifiedAdmin(r)&&r.role==='SUPER_ADMIN'}

async function deriveTelegramSafeSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function telegram(token,method,body){
  return fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  });
}

async function answer(token,id,text){
  if(!id) return;
  try{await telegram(token,'answerCallbackQuery',{callback_query_id:id,text})}catch{}
}

async function present(token,chatId,callback,text,replyMarkup){
  const body={chat_id:chatId,text,parse_mode:'HTML'};
  if(replyMarkup) body.reply_markup=replyMarkup;
  if(callback?.message?.message_id){
    const res=await telegram(token,'editMessageText',{...body,message_id:callback.message.message_id});
    if(res.ok){
      await answer(token,callback.id);
      return 'edited';
    }
    let description='';
    try{description=String((await res.clone().json())?.description||'')}catch{}
    if(res.status===400&&/message is not modified/i.test(description)){
      await answer(token,callback.id);
      return 'unchanged';
    }
  }
  await telegram(token,'sendMessage',body);
  await answer(token,callback?.id);
  return 'sent';
}

async function sendText(token,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  return telegram(token,'sendMessage',body);
}

async function currentResult(db,matchId,seriesCode){
  return db.prepare(`SELECT r.*,m.competition_id,m.season_id,m.home_id,m.home_name,m.away_id,m.away_name,m.group_id,m.round_no,m.round_label
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE r.match_id=? AND r.series_code=?`).bind(matchId,seriesCode).first();
}

async function getSession(db,actorId){
  return db.prepare('SELECT * FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).first();
}

async function clearSession(db,actorId){
  await db.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).run();
}

function correctionPrompt(row){
  return `✏️ <b>CORREGIR RESULTADO</b>\n\n🏟️ <b>${esc(row.home_name)} ${row.home_score}–${row.away_score} ${esc(row.away_name)}</b>\n🏆 ${SERIES_LABEL[row.series_code]||esc(row.series_code)}\n\nEscribe el <b>nuevo marcador</b> local–visita.\nEjemplo: <b>2-1</b>.\n\nLa corrección no se aplicará hasta que indiques el motivo y la confirmes.`;
}

function reasonPrompt(row,home,away){
  return `📝 <b>MOTIVO DE LA CORRECCIÓN</b>\n\n${esc(row.home_name)} <b>${home}–${away}</b> ${esc(row.away_name)}\n🏆 ${SERIES_LABEL[row.series_code]||esc(row.series_code)}\n\nEscribe un motivo breve y concreto.\nEjemplo: <i>Error de digitación en la planilla.</i>`;
}

function confirmPrompt(row,session){
  return `🧾 <b>CONFIRMAR CORRECCIÓN</b>\n\n🏟️ ${esc(row.home_name)} — ${esc(row.away_name)}\n🏆 ${SERIES_LABEL[row.series_code]||esc(row.series_code)}\n\nActual: <b>${row.home_score}–${row.away_score}</b>\nNuevo: <b>${session.pending_home_score}–${session.pending_away_score}</b>\nMotivo: ${esc(session.pending_reason)}\n\nEl resultado oficial sólo cambiará al confirmar.`;
}

async function applyCorrection(db,row,session,actorId,reporter){
  const currentVersion=Number(row.governance_version||1);
  const expectedVersion=Number(session.base_version||currentVersion);
  if(currentVersion!==expectedVersion) return {ok:false,reason:'concurrent_change'};
  const nextVersion=currentVersion+1;
  const now=new Date().toISOString();
  const versionId=`${row.match_id}:${row.series_code}:v${nextVersion}`;
  const eventId=`rg-${row.match_id}-${row.series_code}-v${nextVersion}`;
  const reason=String(session.pending_reason||'').trim();
  const home=Number(session.pending_home_score),away=Number(session.pending_away_score);
  try{
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO match_series_result_versions
        (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(`${row.match_id}:${row.series_code}:v${currentVersion}`,row.match_id,row.series_code,currentVersion,row.home_score,row.away_score,
          ['VERIFIED','DISPUTED','ANNULLED'].includes(row.validation_status)?row.validation_status:'DISPUTED','BASELINE','recovered_baseline',row.source_type,row.source_label,row.source_ref,row.played_on,null,null,null,row.created_at||now),
      db.prepare(`INSERT INTO match_series_result_versions
        (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(versionId,row.match_id,row.series_code,nextVersion,home,away,'VERIFIED','CORRECT',reason,'RESULT_GOVERNANCE_CORRECT','Fútbol Chépica · Corrección',eventId,row.played_on,actorId,reporter.role,reporter.club_id||null,now),
      db.prepare(`UPDATE match_series_results SET home_score=?,away_score=?,validation_status='VERIFIED',source_type='RESULT_GOVERNANCE_CORRECT',source_label='Fútbol Chépica · Corrección',source_ref=?,governance_version=?,updated_at=?
        WHERE result_id=? AND governance_version=?`)
        .bind(home,away,eventId,nextVersion,now,row.result_id,currentVersion),
      db.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'match.series.result.corrected',now,now,row.competition_id,row.season_id,row.match_id,actorId,reporter.display_name||actorId,reporter.club_id||null,'VERIFIED',
          JSON.stringify({series_code:row.series_code,previous_version:currentVersion,version:nextVersion,previous_score:[row.home_score,row.away_score],score:[home,away],previous_status:row.validation_status,status:'VERIFIED',action:'CORRECT',reason})),
      db.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?,?,'match_series',?,1,?,?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,reporter.club_id||null,'CORRECT_OFFICIAL_RESULT',`${row.match_id}:${row.series_code}`,reason,now)
    ]);
  }catch(error){
    return {ok:false,reason:'write_failed'};
  }
  const final=await currentResult(db,row.match_id,row.series_code);
  if(Number(final?.governance_version)!==nextVersion||Number(final?.home_score)!==home||Number(final?.away_score)!==away){
    return {ok:false,reason:'concurrent_change'};
  }
  return {ok:true,row:final};
}

async function notifyStakeholders(env,token,row,actorId,reason){
  const q=await env.DB.prepare(`SELECT telegram_user_id FROM reporters WHERE active=1 AND trust_level='VERIFIED' AND
    (role='SUPER_ADMIN' OR (role='CLUB_ADMIN' AND (club_id=? OR club_id=?)))`).bind(row.home_id,row.away_id).all();
  const seen=new Set();
  for(const r of q.results||[]){
    const id=String(r.telegram_user_id);
    if(id===String(actorId)||seen.has(id)) continue;
    seen.add(id);
    try{
      await sendText(token,id,`✏️ Resultado oficial corregido\n\n${row.home_name} ${row.home_score}-${row.away_score} ${row.away_name}\n${SERIES_LABEL[row.series_code]||row.series_code}\nMotivo: ${reason}`);
    }catch{}
  }
}

export async function handleResultCorrectionFlow(request,env){
  const url=new URL(request.url);
  if(!['/webhook/telegram','/webhook/telegram-next'].includes(url.pathname)||request.method!=='POST') return null;
  if(!env.DB||!env.TELEGRAM_WEBHOOK_SECRET) return null;

  let update;
  try{update=await request.clone().json()}catch{return null}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;
  const actorId=String(actor.id);
  const data=String(callback?.data||'');
  const text=String(message?.text||'').trim();
  const correctionCb=/^rg:correct:[A-Za-z0-9._:-]+:(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/.test(data);
  const applyCb=/^rg:apply:[A-Za-z0-9._:-]+:(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/.test(data);
  const cancelCb=data==='rg:cancel';
  let session=null;
  if(message?.text||applyCb||cancelCb) session=await getSession(env.DB,actorId);
  if(!correctionCb&&!applyCb&&!cancelCb&&!session) return null;

  const secretSource=slot(url)==='next'?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await deriveTelegramSafeSecret(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return null;
  const token=slot(url)==='next'?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return null;

  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!isSuperAdmin(reporter)){
    if(callback) await answer(token,callback.id,'Sin permisos');
    await sendText(token,chatId,'🔒 Sólo el administrador global puede corregir un resultado oficial.');
    return json({ok:true,handled:'result_correction_denied'});
  }

  const correct=data.match(/^rg:correct:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(correct){
    const row=await currentResult(env.DB,correct[1],correct[2]);
    if(!row){
      await answer(token,callback?.id,'No encontrado');
      return json({ok:true,handled:'result_correction_missing'});
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_result_governance_sessions
      (telegram_user_id,chat_id,match_id,series_code,action,state,created_at,updated_at,phase,pending_home_score,pending_away_score,pending_reason,base_version)
      VALUES (?,?,?,?, 'CORRECT','AWAIT_SCORE',?,?,'SCORE',NULL,NULL,NULL,?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,
        action='CORRECT',state='AWAIT_SCORE',updated_at=excluded.updated_at,phase='SCORE',pending_home_score=NULL,pending_away_score=NULL,pending_reason=NULL,base_version=excluded.base_version`)
      .bind(actorId,String(chatId),row.match_id,row.series_code,now,now,Number(row.governance_version||1)).run();
    await present(token,chatId,callback,correctionPrompt(row),{inline_keyboard:[[{text:'Cancelar',callback_data:'rg:cancel'}]]});
    return json({ok:true,handled:'result_correction_wait_score'});
  }

  if(cancelCb){
    if(!session){
      await answer(token,callback?.id,'Ya no hay una corrección pendiente');
      return json({ok:true,handled:'result_correction_cancel_idempotent'});
    }
    await clearSession(env.DB,actorId);
    await present(token,chatId,callback,'✅ Operación cancelada. No se modificó ningún resultado.',{inline_keyboard:[[{text:'⬅️ Volver al resultado',callback_data:`rg:r:${session.match_id}:${session.series_code}`}]]});
    return json({ok:true,handled:'result_correction_cancelled'});
  }

  const apply=data.match(/^rg:apply:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(apply){
    if(!session){
      await answer(token,callback?.id,'Ya procesado');
      return json({ok:true,handled:'result_correction_apply_idempotent'});
    }
    if(session.match_id!==apply[1]||session.series_code!==apply[2]||session.phase!=='CONFIRM'||session.pending_home_score==null||session.pending_away_score==null||!String(session.pending_reason||'').trim()){
      await answer(token,callback?.id,'Corrección incompleta');
      return json({ok:true,handled:'result_correction_not_ready'});
    }
    const row=await currentResult(env.DB,session.match_id,session.series_code);
    if(!row){
      await clearSession(env.DB,actorId);
      await present(token,chatId,callback,'⚠️ El resultado ya no está disponible. No se aplicó ningún cambio.',{inline_keyboard:[[{text:'⬅️ Resultados',callback_data:'rg:list'}]]});
      return json({ok:true,handled:'result_correction_missing'});
    }
    if(Number(row.governance_version)!==Number(session.base_version)){
      await clearSession(env.DB,actorId);
      await present(token,chatId,callback,'⚠️ El resultado cambió mientras preparabas la corrección. No se aplicó tu modificación.',{inline_keyboard:[[{text:'⬅️ Abrir resultado',callback_data:`rg:r:${row.match_id}:${row.series_code}`}]]});
      return json({ok:true,handled:'result_correction_concurrent_change'});
    }
    const result=await applyCorrection(env.DB,row,session,actorId,reporter);
    if(!result.ok){
      await clearSession(env.DB,actorId);
      await present(token,chatId,callback,'⚠️ No fue posible aplicar la corrección de forma segura. El flujo se cerró sin confirmar un nuevo resultado.',{inline_keyboard:[[{text:'⬅️ Abrir resultado',callback_data:`rg:r:${row.match_id}:${row.series_code}`}]]});
      return json({ok:true,handled:'result_correction_write_failed',reason:result.reason});
    }
    await clearSession(env.DB,actorId);
    const changed=result.row;
    const reason=String(session.pending_reason).trim();
    await present(token,chatId,callback,`✅ <b>RESULTADO CORREGIDO</b>\n\n🏟️ <b>${esc(changed.home_name)} ${changed.home_score}–${changed.away_score} ${esc(changed.away_name)}</b>\n🏆 ${SERIES_LABEL[changed.series_code]||esc(changed.series_code)}\n\nMotivo: ${esc(reason)}\n\nQuedó registrado en el historial y el resultado está oficial.`,{inline_keyboard:[[{text:'⬅️ Ver resultado',callback_data:`rg:r:${changed.match_id}:${changed.series_code}`}]]});
    await notifyStakeholders(env,token,changed,actorId,reason);
    return json({ok:true,handled:'result_correction_applied',status:'VERIFIED'});
  }

  if(!session||!message?.text) return null;
  const row=await currentResult(env.DB,session.match_id,session.series_code);
  if(!row){
    await clearSession(env.DB,actorId);
    await sendText(token,chatId,'⚠️ El resultado ya no está disponible. No se aplicó ningún cambio.');
    return json({ok:true,handled:'result_correction_missing'});
  }
  if(session.base_version!=null&&Number(row.governance_version)!==Number(session.base_version)){
    await clearSession(env.DB,actorId);
    await sendText(token,chatId,'⚠️ El resultado cambió mientras preparabas la corrección. No se aplicó tu modificación; vuelve a abrir /correcciones.');
    return json({ok:true,handled:'result_correction_concurrent_change'});
  }

  const score=text.match(SCORE_RE);
  if(score&&(session.phase==='SCORE'||session.phase==='REASON'||session.phase==='CONFIRM')){
    const home=Number(score[1]),away=Number(score[2]);
    if(home===Number(row.home_score)&&away===Number(row.away_score)&&row.validation_status==='VERIFIED'){
      await clearSession(env.DB,actorId);
      await sendText(token,chatId,'ℹ️ El marcador ingresado es igual al resultado oficial actual. No se creó una corrección.');
      return json({ok:true,handled:'result_correction_no_change'});
    }
    if(session.phase==='REASON'&&Number(session.pending_home_score)===home&&Number(session.pending_away_score)===away){
      return json({ok:true,handled:'result_correction_score_idempotent'});
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`UPDATE telegram_result_governance_sessions
      SET pending_home_score=?,pending_away_score=?,pending_reason=NULL,phase='REASON',base_version=COALESCE(base_version,?),updated_at=?
      WHERE telegram_user_id=?`).bind(home,away,Number(row.governance_version||1),now,actorId).run();
    await sendText(token,chatId,reasonPrompt(row,home,away),{inline_keyboard:[[{text:'Cancelar',callback_data:'rg:cancel'}]]});
    return json({ok:true,handled:'result_correction_wait_reason'});
  }

  if(session.phase==='SCORE'){
    await sendText(token,chatId,'Escribe sólo el nuevo marcador en formato local-visita. Ejemplo: 2-1.');
    return json({ok:true,handled:'result_correction_score_format'});
  }

  if(session.phase==='REASON'){
    const reason=text.replace(/\s+/g,' ').trim();
    if(reason.length<3){
      await sendText(token,chatId,'El motivo es demasiado corto. Describe brevemente por qué debe corregirse el resultado.');
      return json({ok:true,handled:'result_correction_reason_too_short'});
    }
    if(reason.length>240){
      await sendText(token,chatId,'El motivo es demasiado largo. Déjalo en un máximo de 240 caracteres.');
      return json({ok:true,handled:'result_correction_reason_too_long'});
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`UPDATE telegram_result_governance_sessions SET pending_reason=?,phase='CONFIRM',updated_at=? WHERE telegram_user_id=?`).bind(reason,now,actorId).run();
    session=await getSession(env.DB,actorId);
    await sendText(token,chatId,confirmPrompt(row,session),{inline_keyboard:[[{text:'✅ Confirmar corrección',callback_data:`rg:apply:${session.match_id}:${session.series_code}`}],[{text:'Cancelar',callback_data:'rg:cancel'}]]});
    return json({ok:true,handled:'result_correction_wait_confirm'});
  }

  if(session.phase==='CONFIRM'){
    if(text.replace(/\s+/g,' ').trim()===String(session.pending_reason||'')) return json({ok:true,handled:'result_correction_reason_idempotent'});
    await sendText(token,chatId,'La corrección está lista. Usa “✅ Confirmar corrección” para aplicarla o “Cancelar” para salir sin cambios.');
    return json({ok:true,handled:'result_correction_waiting_button'});
  }

  return null;
}
