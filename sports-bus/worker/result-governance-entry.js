const SERIES_LABEL={TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'};
const SCORE_RE=/^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// G3 / RESULT-GOVERNANCE-01
// match_series_results is the current projection. Every mutation of an already
// official result must create an immutable version before changing that projection.
export async function handleResultGovernanceRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;

  let update;
  try{update=await request.json();}catch{return null;}
  const message=update.message;
  const callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const actorId=String(actor.id);
  const text=String(message?.text||'').trim();
  const callbackData=String(callback?.data||'');
  const command=/^\/(correcciones|gobiernoresultados)(?:@\w+)?$/i.test(text);
  const scoreLike=SCORE_RE.test(text);

  let governanceSession=null;
  let legacySeriesSession=null;
  if(env.DB&&scoreLike){
    governanceSession=await env.DB.prepare('SELECT * FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).first();
    if(!governanceSession){
      legacySeriesSession=await env.DB.prepare('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).first();
    }
  }

  let guardedExisting=null;
  if(env.DB&&legacySeriesSession){
    guardedExisting=await env.DB.prepare('SELECT result_id,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(legacySeriesSession.match_id,legacySeriesSession.series_code).first();
  }

  const relevant=command||callbackData.startsWith('rg:')||!!governanceSession||!!guardedExisting;
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'result_governance_not_configured'},503);

  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!isVerifiedAdmin(reporter)){
    if(callback) await answerCallback(env,callback.id,'Sin permisos');
    await audit(env.DB,actorId,reporter,'ACCESS_RESULT_GOVERNANCE','match_series',null,0,'not_verified_admin');
    await send(env,chatId,'🔒 Esta función requiere una cuenta de dirigente verificada.');
    return json({ok:true,handled:'result_governance_access_denied'});
  }

  // Critical G3 guard: the old score-entry flows may create a session for a
  // series that already has an official result. Never allow that message to
  // reach an UPSERT path. Redirect the user into governed correction instead.
  if(guardedExisting&&legacySeriesSession){
    await env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await audit(env.DB,actorId,reporter,'OVERWRITE_SERIES_RESULT','match_series',`${legacySeriesSession.match_id}:${legacySeriesSession.series_code}`,0,'official_result_requires_governance');
    await send(env,chatId,'🛡️ Ese resultado ya es oficial. No fue sobrescrito.\n\nPara cambiar, disputar o anular un resultado existente usa /correcciones.');
    return json({ok:true,handled:'result_governance_overwrite_guard'});
  }

  if(command||callbackData==='rg:list'){
    if(callback) await answerCallback(env,callback.id,'Resultados oficiales');
    await showGovernanceList(env,chatId,reporter);
    return json({ok:true,handled:'result_governance_list'});
  }

  if(callbackData==='rg:cancel'){
    await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await answerCallback(env,callback.id,'Cancelado');
    await send(env,chatId,'Operación cancelada. No se modificó ningún resultado.',{inline_keyboard:[[{text:'⬅️ Resultados oficiales',callback_data:'rg:list'}]]});
    return json({ok:true,handled:'result_governance_cancel'});
  }

  const resultCb=callbackData.match(/^rg:r:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(resultCb){
    const row=await currentResult(env.DB,resultCb[1],resultCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!canSee(reporter,row)) return deny(env,chatId,callback,actorId,reporter,'VIEW_RESULT_GOVERNANCE',row,'club_not_in_match');
    await answerCallback(env,callback.id,'Resultado');
    await showResult(env,chatId,reporter,row);
    return json({ok:true,handled:'result_governance_detail'});
  }

  const histCb=callbackData.match(/^rg:h:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(histCb){
    const row=await currentResult(env.DB,histCb[1],histCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!canSee(reporter,row)) return deny(env,chatId,callback,actorId,reporter,'VIEW_RESULT_HISTORY',row,'club_not_in_match');
    await answerCallback(env,callback.id,'Historial');
    await showHistory(env,chatId,row);
    return json({ok:true,handled:'result_governance_history'});
  }

  const correctCb=callbackData.match(/^rg:correct:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(correctCb){
    const row=await currentResult(env.DB,correctCb[1],correctCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!isSuperAdmin(reporter)) return deny(env,chatId,callback,actorId,reporter,'CORRECT_OFFICIAL_RESULT',row,'super_admin_required');
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_result_governance_sessions
      (telegram_user_id,chat_id,match_id,series_code,action,state,created_at,updated_at)
      VALUES (?,?,?,?, 'CORRECT','AWAIT_SCORE',?,?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,action='CORRECT',state='AWAIT_SCORE',updated_at=excluded.updated_at`)
      .bind(actorId,String(chatId),row.match_id,row.series_code,now,now).run();
    await answerCallback(env,callback.id,'Corregir');
    await send(env,chatId,`✏️ CORREGIR RESULTADO · v${row.governance_version}\n\n${row.home_name} ${row.home_score}-${row.away_score} ${row.away_name}\nSerie: ${SERIES_LABEL[row.series_code]}\n\nEscribe el NUEVO marcador LOCAL-VISITA, por ejemplo 2-1.\n\nSe conservará la versión anterior.`,{inline_keyboard:[[{text:'Cancelar',callback_data:'rg:cancel'}]]});
    return json({ok:true,handled:'result_governance_wait_correction'});
  }

  if(governanceSession&&scoreLike){
    if(!isSuperAdmin(reporter)){
      await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).run();
      return deny(env,chatId,null,actorId,reporter,'CORRECT_OFFICIAL_RESULT',null,'super_admin_required');
    }
    const row=await currentResult(env.DB,governanceSession.match_id,governanceSession.series_code);
    if(!row){
      await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env,chatId,'El resultado ya no existe. No se aplicó ningún cambio.');
      return json({ok:true,handled:'result_governance_session_missing'});
    }
    const m=text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
    const home=Number(m[1]),away=Number(m[2]);
    if(home===Number(row.home_score)&&away===Number(row.away_score)&&row.validation_status==='VERIFIED'){
      await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).run();
      await send(env,chatId,'ℹ️ El marcador ingresado es igual al resultado oficial actual. No se creó una versión innecesaria.');
      return json({ok:true,handled:'result_governance_no_change'});
    }
    const changed=await transition(env.DB,row,{home,away,status:'VERIFIED',action:'CORRECT',reason:'super_admin_score_correction'},actorId,reporter);
    await env.DB.prepare('DELETE FROM telegram_result_governance_sessions WHERE telegram_user_id=?').bind(actorId).run();
    if(!changed){
      await send(env,chatId,'⚠️ El resultado cambió mientras intentabas corregirlo. No se aplicó tu modificación; vuelve a abrir /correcciones.');
      return json({ok:true,handled:'result_governance_concurrent_change'});
    }
    await send(env,chatId,`✅ RESULTADO CORREGIDO · v${changed.governance_version}\n\n${changed.home_name} ${changed.home_score}-${changed.away_score} ${changed.away_name}\nSerie: ${SERIES_LABEL[changed.series_code]}\nEstado: VERIFIED\n\nLa versión anterior quedó preservada en el historial.`);
    await notifyStakeholders(env,changed,actorId,`✏️ Resultado oficial corregido\n${changed.home_name} ${changed.home_score}-${changed.away_score} ${changed.away_name}\n${SERIES_LABEL[changed.series_code]} · v${changed.governance_version}`);
    return json({ok:true,handled:'result_governance_corrected',status:'VERIFIED',version:changed.governance_version});
  }

  const disputeCb=callbackData.match(/^rg:dispute:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(disputeCb){
    const row=await currentResult(env.DB,disputeCb[1],disputeCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!canSee(reporter,row)) return deny(env,chatId,callback,actorId,reporter,'DISPUTE_OFFICIAL_RESULT',row,'club_not_in_match');
    if(row.validation_status!=='VERIFIED'){
      await answerCallback(env,callback.id,'Ya no está VERIFIED');
      return json({ok:true,handled:'result_governance_invalid_transition',status:row.validation_status});
    }
    const reason=isSuperAdmin(reporter)?'super_admin_dispute':'participating_club_dispute';
    const changed=await transition(env.DB,row,{home:row.home_score,away:row.away_score,status:'DISPUTED',action:'DISPUTE',reason},actorId,reporter);
    if(!changed) return concurrent(env,chatId,callback);
    await answerCallback(env,callback.id,'En disputa');
    await send(env,chatId,`⚠️ RESULTADO EN DISPUTA · v${changed.governance_version}\n\n${changed.home_name} ${changed.home_score}-${changed.away_score} ${changed.away_name}\n${SERIES_LABEL[changed.series_code]}\n\nMientras esté DISPUTED no se publica ni computa en la tabla.`);
    await notifySuperAdmins(env,changed,actorId,'⚠️ Resultado puesto en disputa. Requiere resolución global.');
    return json({ok:true,handled:'result_governance_disputed',status:'DISPUTED',version:changed.governance_version});
  }

  const confirmCb=callbackData.match(/^rg:confirm:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(confirmCb){
    const row=await currentResult(env.DB,confirmCb[1],confirmCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!isSuperAdmin(reporter)) return deny(env,chatId,callback,actorId,reporter,'RESOLVE_RESULT_DISPUTE',row,'super_admin_required');
    if(row.validation_status!=='DISPUTED') return invalidState(env,chatId,callback,row);
    const changed=await transition(env.DB,row,{home:row.home_score,away:row.away_score,status:'VERIFIED',action:'RESOLVE',reason:'super_admin_confirmed_current_score'},actorId,reporter);
    if(!changed) return concurrent(env,chatId,callback);
    await answerCallback(env,callback.id,'Disputa resuelta');
    await send(env,chatId,`✅ DISPUTA RESUELTA · v${changed.governance_version}\n\nSe confirma ${changed.home_name} ${changed.home_score}-${changed.away_score} ${changed.away_name}.\nEl resultado vuelve a VERIFIED y a la fuente pública.`);
    await notifyStakeholders(env,changed,actorId,'✅ La disputa del resultado fue resuelta y el marcador actual quedó confirmado.');
    return json({ok:true,handled:'result_governance_resolved',status:'VERIFIED',version:changed.governance_version});
  }

  const annulCb=callbackData.match(/^rg:annul:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(annulCb){
    const row=await currentResult(env.DB,annulCb[1],annulCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!isSuperAdmin(reporter)) return deny(env,chatId,callback,actorId,reporter,'ANNUL_OFFICIAL_RESULT',row,'super_admin_required');
    if(row.validation_status==='ANNULLED') return invalidState(env,chatId,callback,row);
    const changed=await transition(env.DB,row,{home:row.home_score,away:row.away_score,status:'ANNULLED',action:'ANNUL',reason:'super_admin_annulled_result'},actorId,reporter);
    if(!changed) return concurrent(env,chatId,callback);
    await answerCallback(env,callback.id,'Anulado');
    await send(env,chatId,`🚫 RESULTADO ANULADO · v${changed.governance_version}\n\n${changed.home_name} ${changed.home_score}-${changed.away_score} ${changed.away_name}\n${SERIES_LABEL[changed.series_code]}\n\nLa historia se conserva, pero el resultado deja de publicarse y computarse.`);
    await notifyStakeholders(env,changed,actorId,'🚫 Un administrador global anuló este resultado oficial.');
    return json({ok:true,handled:'result_governance_annulled',status:'ANNULLED',version:changed.governance_version});
  }

  const restoreCb=callbackData.match(/^rg:restore:([A-Za-z0-9._-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(restoreCb){
    const row=await currentResult(env.DB,restoreCb[1],restoreCb[2]);
    if(!row) return missing(env,chatId,callback);
    if(!isSuperAdmin(reporter)) return deny(env,chatId,callback,actorId,reporter,'RESTORE_OFFICIAL_RESULT',row,'super_admin_required');
    if(row.validation_status!=='ANNULLED') return invalidState(env,chatId,callback,row);
    const changed=await transition(env.DB,row,{home:row.home_score,away:row.away_score,status:'VERIFIED',action:'RESTORE',reason:'super_admin_restored_result'},actorId,reporter);
    if(!changed) return concurrent(env,chatId,callback);
    await answerCallback(env,callback.id,'Restaurado');
    await send(env,chatId,`♻️ RESULTADO RESTAURADO · v${changed.governance_version}\n\n${changed.home_name} ${changed.home_score}-${changed.away_score} ${changed.away_name}\nVuelve a estado VERIFIED.`);
    await notifyStakeholders(env,changed,actorId,'♻️ Un administrador global restauró este resultado oficial.');
    return json({ok:true,handled:'result_governance_restored',status:'VERIFIED',version:changed.governance_version});
  }

  return null;
}

async function showGovernanceList(env,chatId,reporter){
  const base=`SELECT r.result_id,r.match_id,r.series_code,r.home_score,r.away_score,r.validation_status,r.governance_version,
    m.home_id,m.home_name,m.away_id,m.away_name,m.group_id,m.round_no,m.round_label
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id`;
  const q=isSuperAdmin(reporter)
    ? await env.DB.prepare(`${base} ORDER BY m.round_no,r.match_id,CASE r.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END LIMIT 50`).all()
    : await env.DB.prepare(`${base} WHERE m.home_id=? OR m.away_id=? ORDER BY m.round_no,r.match_id,CASE r.series_code WHEN 'TERCERA' THEN 1 WHEN 'SEGUNDA' THEN 2 WHEN 'SENIOR' THEN 3 ELSE 4 END LIMIT 50`).bind(reporter.club_id,reporter.club_id).all();
  const items=q.results||[];
  if(!items.length){
    await send(env,chatId,'🛡️ GOBIERNO DE RESULTADOS\n\nNo hay resultados oficiales dentro de tu alcance.');
    return;
  }
  const rows=items.map(r=>[{text:`${stateIcon(r.validation_status)} ${r.round_label} · ${SERIES_LABEL[r.series_code]} · ${r.home_score}-${r.away_score} · v${r.governance_version}`,callback_data:`rg:r:${r.match_id}:${r.series_code}`}]);
  rows.push([{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]);
  await send(env,chatId,`🛡️ GOBIERNO DE RESULTADOS\n\n${isSuperAdmin(reporter)?'Administrador global':'Sólo partidos de tu club'}.\nSelecciona un resultado:`,{inline_keyboard:rows});
}

async function showResult(env,chatId,reporter,row){
  const buttons=[];
  if(isSuperAdmin(reporter)){
    if(row.validation_status==='VERIFIED'){
      buttons.push([{text:'✏️ Corregir marcador',callback_data:`rg:correct:${row.match_id}:${row.series_code}`}]);
      buttons.push([{text:'⚠️ Poner en disputa',callback_data:`rg:dispute:${row.match_id}:${row.series_code}`}]);
      buttons.push([{text:'🚫 Anular resultado',callback_data:`rg:annul:${row.match_id}:${row.series_code}`}]);
    }else if(row.validation_status==='DISPUTED'){
      buttons.push([{text:'✅ Confirmar marcador actual',callback_data:`rg:confirm:${row.match_id}:${row.series_code}`}]);
      buttons.push([{text:'✏️ Corregir y resolver',callback_data:`rg:correct:${row.match_id}:${row.series_code}`}]);
      buttons.push([{text:'🚫 Anular resultado',callback_data:`rg:annul:${row.match_id}:${row.series_code}`}]);
    }else if(row.validation_status==='ANNULLED'){
      buttons.push([{text:'♻️ Restaurar resultado',callback_data:`rg:restore:${row.match_id}:${row.series_code}`}]);
    }
  }else if(row.validation_status==='VERIFIED'){
    buttons.push([{text:'⚠️ Disputar resultado',callback_data:`rg:dispute:${row.match_id}:${row.series_code}`}]);
  }
  buttons.push([{text:'🕘 Ver historial',callback_data:`rg:h:${row.match_id}:${row.series_code}`}]);
  buttons.push([{text:'⬅️ Resultados oficiales',callback_data:'rg:list'}]);
  const publicEffect=row.validation_status==='VERIFIED'?'✅ Publicado y computable':'⛔ Fuera de publicación y tabla';
  await send(env,chatId,`🧾 RESULTADO OFICIAL · v${row.governance_version}\n\n${row.round_label} · Grupo ${row.group_id}\n${row.home_name} ${row.home_score}-${row.away_score} ${row.away_name}\nSerie: ${SERIES_LABEL[row.series_code]}\nEstado: ${row.validation_status}\n${publicEffect}`,{inline_keyboard:buttons});
}

async function showHistory(env,chatId,row){
  const q=await env.DB.prepare(`SELECT version_no,home_score,away_score,validation_status,action,actor_role,actor_club_id,created_at
    FROM match_series_result_versions WHERE match_id=? AND series_code=? ORDER BY version_no DESC LIMIT 12`).bind(row.match_id,row.series_code).all();
  const lines=(q.results||[]).map(v=>`v${v.version_no} · ${v.home_score}-${v.away_score} · ${v.validation_status}\n${v.action}${v.actor_role?` · ${v.actor_role}${v.actor_club_id?' / '+v.actor_club_id:''}`:''}`);
  await send(env,chatId,`🕘 HISTORIAL INMUTABLE\n\n${row.home_name} vs ${row.away_name} · ${SERIES_LABEL[row.series_code]}\n\n${lines.join('\n\n')}`,{inline_keyboard:[[{text:'⬅️ Resultado',callback_data:`rg:r:${row.match_id}:${row.series_code}`}]]});
}

async function currentResult(db,matchId,seriesCode){
  return db.prepare(`SELECT r.*,m.competition_id,m.season_id,m.home_id,m.home_name,m.away_id,m.away_name,m.group_id,m.round_no,m.round_label
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE r.match_id=? AND r.series_code=?`).bind(matchId,seriesCode).first();
}

async function transition(db,row,next,actorId,reporter){
  const now=new Date().toISOString();
  const currentVersion=Number(row.governance_version||1);
  const nextVersion=currentVersion+1;
  const versionId=`${row.match_id}:${row.series_code}:v${nextVersion}`;
  const eventId=`rg-${row.match_id}-${row.series_code}-v${nextVersion}`;
  const sourceType=`RESULT_GOVERNANCE_${next.action}`;
  const sourceLabel=`Fútbol Chépica · ${next.action}`;
  try{
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO match_series_result_versions
        (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(`${row.match_id}:${row.series_code}:v${currentVersion}`,row.match_id,row.series_code,currentVersion,row.home_score,row.away_score,
          normalizeGovernedStatus(row.validation_status),'BASELINE','recovered_baseline',row.source_type,row.source_label,row.source_ref,row.played_on,null,null,null,row.created_at||now),
      db.prepare(`INSERT INTO match_series_result_versions
        (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(versionId,row.match_id,row.series_code,nextVersion,Number(next.home),Number(next.away),next.status,next.action,next.reason,sourceType,sourceLabel,eventId,row.played_on,actorId,reporter.role,reporter.club_id||null,now),
      db.prepare(`UPDATE match_series_results SET home_score=?,away_score=?,validation_status=?,source_type=?,source_label=?,source_ref=?,governance_version=?,updated_at=?
        WHERE result_id=? AND governance_version=?`)
        .bind(Number(next.home),Number(next.away),next.status,sourceType,sourceLabel,eventId,nextVersion,now,row.result_id,currentVersion),
      db.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,eventType(next.action),now,now,row.competition_id,row.season_id,row.match_id,actorId,reporter.display_name||actorId,reporter.club_id||null,next.status,
          JSON.stringify({series_code:row.series_code,previous_version:currentVersion,version:nextVersion,previous_score:[row.home_score,row.away_score],score:[Number(next.home),Number(next.away)],previous_status:row.validation_status,status:next.status,action:next.action,reason:next.reason})),
      db.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?,?,'match_series',?,1,?,?)`)
        .bind(`${eventId}-audit`,actorId,reporter.role,reporter.club_id||null,`${next.action}_OFFICIAL_RESULT`,`${row.match_id}:${row.series_code}`,next.reason,now)
    ]);
  }catch{return null;}
  const final=await currentResult(db,row.match_id,row.series_code);
  return Number(final?.governance_version)===nextVersion?final:null;
}

function eventType(action){
  return ({CORRECT:'match.series.result.corrected',DISPUTE:'match.series.result.disputed',RESOLVE:'match.series.result.dispute_resolved',ANNUL:'match.series.result.annulled',RESTORE:'match.series.result.restored'})[action]||'match.series.result.governed';
}
function normalizeGovernedStatus(s){return ['VERIFIED','DISPUTED','ANNULLED'].includes(s)?s:'DISPUTED';}
function isVerifiedAdmin(r){return !!r&&r.active===1&&r.trust_level==='VERIFIED'&&['SUPER_ADMIN','CLUB_ADMIN'].includes(r.role);}
function isSuperAdmin(r){return isVerifiedAdmin(r)&&r.role==='SUPER_ADMIN';}
function canSee(r,row){return isSuperAdmin(r)||(r?.role==='CLUB_ADMIN'&&r.club_id&&(r.club_id===row.home_id||r.club_id===row.away_id));}
function stateIcon(s){return s==='VERIFIED'?'✅':s==='DISPUTED'?'⚠️':'🚫';}

async function audit(db,actorId,reporter,action,resourceType,resourceId,allowed,reason){
  const now=new Date().toISOString();
  const id=`rg-audit-${actorId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  await db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,actorId,reporter?.role||null,reporter?.club_id||null,action,resourceType,resourceId,allowed,reason,now).run();
}
async function deny(env,chatId,callback,actorId,reporter,action,row,reason){
  if(callback) await answerCallback(env,callback.id,'Sin permisos');
  await audit(env.DB,actorId,reporter,action,'match_series',row?`${row.match_id}:${row.series_code}`:null,0,reason);
  await send(env,chatId,'🔒 No tienes permisos para ejecutar esa acción sobre este resultado.');
  return json({ok:true,handled:'result_governance_denied',reason});
}
async function missing(env,chatId,callback){
  if(callback) await answerCallback(env,callback.id,'No encontrado');
  await send(env,chatId,'El resultado ya no está disponible.');
  return json({ok:true,handled:'result_governance_missing'});
}
async function invalidState(env,chatId,callback,row){
  if(callback) await answerCallback(env,callback.id,'Estado no válido');
  await send(env,chatId,`La transición ya no corresponde: el resultado está ${row.validation_status}.`);
  return json({ok:true,handled:'result_governance_invalid_transition',status:row.validation_status});
}
async function concurrent(env,chatId,callback){
  if(callback) await answerCallback(env,callback.id,'Cambió mientras operabas');
  await send(env,chatId,'⚠️ El resultado cambió mientras operabas. No se aplicó una segunda transición. Vuelve a abrir /correcciones.');
  return json({ok:true,handled:'result_governance_concurrent_change'});
}

async function notifySuperAdmins(env,row,actorId,text){
  const q=await env.DB.prepare("SELECT telegram_user_id FROM reporters WHERE active=1 AND trust_level='VERIFIED' AND role='SUPER_ADMIN'").all();
  for(const r of q.results||[]) if(String(r.telegram_user_id)!==String(actorId)) await send(env,r.telegram_user_id,`${text}\n\n${row.home_name} ${row.home_score}-${row.away_score} ${row.away_name}\n${SERIES_LABEL[row.series_code]} · v${row.governance_version}`);
}
async function notifyStakeholders(env,row,actorId,text){
  const q=await env.DB.prepare(`SELECT telegram_user_id FROM reporters WHERE active=1 AND trust_level='VERIFIED' AND
    (role='SUPER_ADMIN' OR (role='CLUB_ADMIN' AND (club_id=? OR club_id=?)))`).bind(row.home_id,row.away_id).all();
  const seen=new Set();
  for(const r of q.results||[]){
    const id=String(r.telegram_user_id);
    if(id===String(actorId)||seen.has(id)) continue;
    seen.add(id);
    await send(env,id,text);
  }
}
async function send(env,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
async function answerCallback(env,id,text){
  if(!id) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});
}
