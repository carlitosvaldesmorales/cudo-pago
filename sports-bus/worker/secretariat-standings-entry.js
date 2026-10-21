const SECRETARIAT_POLICY='AWARD_OPPONENT_WIN';

const SERIES = Object.freeze({
  TERCERA:{label:'Tercera',championship:'PRINCIPAL',win:2,draw:1,loss:0},
  SEGUNDA:{label:'Segunda',championship:'PRINCIPAL',win:3,draw:1,loss:0},
  SENIOR:{label:'Senior',championship:'SENIOR',win:3,draw:1,loss:0},
  PRIMERA:{label:'Primera',championship:'PRINCIPAL',win:4,draw:2,loss:0}
});

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const safeReason=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,300);

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function slot(url){return url.pathname==='/webhook/telegram-next'?'next':'primary'}
function isSuperAdmin(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&r.role==='SUPER_ADMIN'}

export function sportingPointsForTeam(row,teamId){
  const cfg=SERIES[row?.series_code];
  if(!cfg||!row||![row.home_id,row.away_id].includes(teamId)) return 0;
  const isHome=teamId===row.home_id;
  const mine=Number(isHome?row.home_score:row.away_score);
  const other=Number(isHome?row.away_score:row.home_score);
  return mine>other?cfg.win:mine===other?cfg.draw:cfg.loss;
}

export function administrativeAwardForSanction(row,sanctionedTeamId){
  const cfg=SERIES[row?.series_code];
  if(!cfg||!row||![row.home_id,row.away_id].includes(sanctionedTeamId)) return null;
  const beneficiaryTeamId=sanctionedTeamId===row.home_id?row.away_id:row.home_id;
  const sanctionedBefore=sportingPointsForTeam(row,sanctionedTeamId);
  const beneficiaryBefore=sportingPointsForTeam(row,beneficiaryTeamId);
  const sanctionedTarget=Number(cfg.loss||0);
  const beneficiaryTarget=Number(cfg.win||0);
  return {
    policy:SECRETARIAT_POLICY,
    sanctioned_team_id:sanctionedTeamId,
    beneficiary_team_id:beneficiaryTeamId,
    sanctioned_points_before:sanctionedBefore,
    sanctioned_target_points:sanctionedTarget,
    sanctioned_delta:sanctionedTarget-sanctionedBefore,
    beneficiary_points_before:beneficiaryBefore,
    beneficiary_target_points:beneficiaryTarget,
    beneficiary_delta:beneficiaryTarget-beneficiaryBefore
  };
}

async function currentResult(db,matchId,seriesCode){
  return db.prepare(`SELECT r.*,m.competition_id,m.season_id,m.group_id,m.round_no,m.round_label,
      m.home_id,m.home_name,m.away_id,m.away_name
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE r.match_id=? AND r.series_code=?`).bind(matchId,seriesCode).first();
}
async function sendApi(token,method,body){
  return fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
async function present(token,chatId,callback,text,replyMarkup){
  const body={chat_id:chatId,text,parse_mode:'HTML'};
  if(replyMarkup) body.reply_markup=replyMarkup;
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
async function audit(db,actorId,reporter,action,resourceId,allowed,reason){
  const now=new Date().toISOString();
  const id=`sec-audit-${actorId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  await db.prepare(`INSERT OR REPLACE INTO permission_audit
    (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
    VALUES (?,?,?,?,?,'secretariat_resolution',?,?,?,?)`)
    .bind(id,actorId,reporter?.role||null,reporter?.club_id||null,action,resourceId||null,allowed?1:0,reason,now).run();
}
async function deny(env,token,chatId,callback,actorId,reporter,reason){
  if(callback?.id) await sendApi(token,'answerCallbackQuery',{callback_query_id:callback.id,text:'Sin permisos'});
  await audit(env.DB,actorId,reporter,'APPLY_SECRETARIAT_STANDINGS_ADJUSTMENT',null,false,reason);
  await sendApi(token,'sendMessage',{chat_id:chatId,text:'🔒 Los reclamos de Secretaría que modifican la tabla requieren SUPER_ADMIN verificado.'});
  return json({ok:true,handled:'secretariat_adjustment_denied',reason});
}
async function loadActiveResolution(db,row,sanctioned,beneficiary){
  return db.prepare(`SELECT * FROM secretariat_standings_resolutions
    WHERE match_id=? AND series_code=? AND sanctioned_team_id=? AND beneficiary_team_id=?
      AND status='ACTIVE'
    ORDER BY created_at DESC LIMIT 1`)
    .bind(row.match_id,row.series_code,sanctioned,beneficiary).first();
}
function teamName(row,teamId){return teamId===row.home_id?row.home_name:teamId===row.away_id?row.away_name:teamId}
function resultBack(row){return {inline_keyboard:[[{text:'⬅️ Resultado',callback_data:`rg:r:${row.match_id}:${row.series_code}`}]]}}
function signed(n){const v=Number(n||0);return v>0?`+${v}`:String(v)}
function awardLabel(award,row){
  return `🏛️ Dar triunfo a ${teamName(row,award.beneficiary_team_id)} · ${signed(award.sanctioned_delta)} / ${signed(award.beneficiary_delta)}`;
}
function awardLines(award,row){
  return `• ${esc(teamName(row,award.sanctioned_team_id))}: <b>${award.sanctioned_points_before} → ${award.sanctioned_target_points}</b> pts (${signed(award.sanctioned_delta)})\n• ${esc(teamName(row,award.beneficiary_team_id))}: <b>${award.beneficiary_points_before} → ${award.beneficiary_target_points}</b> pts (${signed(award.beneficiary_delta)})`;
}

async function showStart(env,token,chatId,callback,reporter,row){
  if(row.validation_status!=='VERIFIED'){
    await present(token,chatId,callback,'🏛️ <b>SECRETARÍA</b>\n\nEl resultado debe estar VERIFIED para aplicar un ajuste de tabla. Resuelve primero su estado de gobierno.',resultBack(row));
    return 'secretariat_adjustment_invalid_result_state';
  }
  const homeAward=administrativeAwardForSanction(row,row.home_id);
  const awayAward=administrativeAwardForSanction(row,row.away_id);
  const buttons=[];
  for(const [side,award] of [['HOME',homeAward],['AWAY',awayAward]]){
    if(award&&(award.sanctioned_delta!==0||award.beneficiary_delta!==0)){
      buttons.push([{text:awardLabel(award,row),callback_data:`sec:pick:${row.match_id}:${row.series_code}:${side}`}]);
    }
  }
  buttons.push([{text:'⬅️ Resultado',callback_data:`rg:r:${row.match_id}:${row.series_code}`}]);
  const hp=sportingPointsForTeam(row,row.home_id),ap=sportingPointsForTeam(row,row.away_id);
  const cfg=SERIES[row.series_code];
  const pointsText=`${esc(row.home_name)}: <b>${hp}</b> pts en cancha · ${esc(row.away_name)}: <b>${ap}</b> pts en cancha`;
  await present(token,chatId,callback,
    `🏛️ <b>RECLAMO DE SECRETARÍA</b>\n\n📅 ${esc(row.round_label)} · Grupo ${esc(row.group_id)}\n🏟️ <b>${esc(row.home_name)} ${row.home_score}–${row.away_score} ${esc(row.away_name)}</b>\n🏆 ${cfg.label}\n\n${pointsText}\n\nSelecciona el club sancionado. El fallo dejará al sancionado con <b>${cfg.loss} pts</b> y otorgará al rival los <b>${cfg.win} pts de victoria</b> de esta serie. <b>El marcador histórico no cambia.</b>`,
    {inline_keyboard:buttons});
  return 'secretariat_adjustment_start';
}

async function startReason(env,token,chatId,callback,reporter,actorId,row,side){
  if(row.validation_status!=='VERIFIED') return showStart(env,token,chatId,callback,reporter,row);
  const sanctioned=side==='HOME'?row.home_id:row.away_id;
  const award=administrativeAwardForSanction(row,sanctioned);
  if(!award||(award.sanctioned_delta===0&&award.beneficiary_delta===0)){
    await present(token,chatId,callback,'ℹ️ Ese fallo no cambia los puntos de tabla: el rival ya tiene los puntos de victoria y el sancionado los de derrota.',resultBack(row));
    return 'secretariat_adjustment_no_points_change';
  }
  const existing=await loadActiveResolution(env.DB,row,award.sanctioned_team_id,award.beneficiary_team_id);
  if(existing){
    const sd=existing.sanctioned_points_delta??-Number(existing.points_amount||0);
    const bd=existing.beneficiary_points_delta??Number(existing.points_amount||0);
    await present(token,chatId,callback,
      `ℹ️ Ya existe una resolución activa de Secretaría para este partido y serie.\n\n${esc(teamName(row,award.sanctioned_team_id))}: ${signed(sd)} pts\n${esc(teamName(row,award.beneficiary_team_id))}: ${signed(bd)} pts\n\nNo se duplicó el ajuste.`,
      resultBack(row));
    return 'secretariat_adjustment_duplicate_guard';
  }
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO telegram_secretariat_sessions
    (telegram_user_id,chat_id,match_id,series_code,sanctioned_team_id,beneficiary_team_id,points_amount,
     expected_governance_version,phase,reason,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?, 'AWAIT_REASON',NULL,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET
      chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,
      sanctioned_team_id=excluded.sanctioned_team_id,beneficiary_team_id=excluded.beneficiary_team_id,
      points_amount=excluded.points_amount,expected_governance_version=excluded.expected_governance_version,
      phase='AWAIT_REASON',reason=NULL,updated_at=excluded.updated_at`)
    .bind(actorId,String(chatId),row.match_id,row.series_code,award.sanctioned_team_id,award.beneficiary_team_id,
      award.beneficiary_target_points,Number(row.governance_version||1),now,now).run();
  await present(token,chatId,callback,
    `🏛️ <b>MOTIVO DEL RECLAMO</b>\n\nSe propone adjudicar administrativamente la victoria a ${esc(teamName(row,award.beneficiary_team_id))}:\n${awardLines(award,row)}\n• Marcador: <b>se conserva ${row.home_score}–${row.away_score}</b>\n\nEscribe ahora el motivo de Secretaría, por ejemplo: <i>carnet vencido</i>.`,
    {inline_keyboard:[[{text:'Cancelar',callback_data:'sec:cancel'}]]});
  return 'secretariat_adjustment_wait_reason';
}

async function showConfirmation(env,token,chatId,reporter,session,row){
  const award=administrativeAwardForSanction(row,session.sanctioned_team_id);
  if(!award) return;
  await present(token,chatId,null,
    `🏛️ <b>CONFIRMAR RESOLUCIÓN DE SECRETARÍA</b>\n\n📅 ${esc(row.round_label)} · ${SERIES[row.series_code].label}\n🏟️ ${esc(row.home_name)} ${row.home_score}–${row.away_score} ${esc(row.away_name)}\n\n<b>Fallo: victoria administrativa para ${esc(teamName(row,award.beneficiary_team_id))}</b>\n${awardLines(award,row)}\n• Marcador histórico: <b>sin cambios</b>\n• Motivo: ${esc(session.reason)}\n\nAl confirmar, la tabla canónica se recalcula automáticamente.`,
    {inline_keyboard:[
      [{text:'✅ Aplicar resolución',callback_data:'sec:apply'}],
      [{text:'Cancelar',callback_data:'sec:cancel'}]
    ]});
}

async function applyResolution(env,token,chatId,callback,reporter,actorId,session){
  const row=await currentResult(env.DB,session.match_id,session.series_code);
  if(!row){
    await env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await present(token,chatId,callback,'⚠️ El resultado ya no existe. No se aplicó ningún ajuste.',null);
    return 'secretariat_adjustment_missing_result';
  }
  if(row.validation_status!=='VERIFIED'||Number(row.governance_version)!==Number(session.expected_governance_version)){
    await env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await present(token,chatId,callback,'⚠️ El resultado cambió mientras resolvías el reclamo. No se aplicó el ajuste; vuelve a abrir el resultado.',resultBack(row));
    return 'secretariat_adjustment_concurrent_change';
  }
  const award=administrativeAwardForSanction(row,session.sanctioned_team_id);
  if(!award||award.beneficiary_team_id!==session.beneficiary_team_id||award.beneficiary_target_points!==Number(session.points_amount)){
    await env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await present(token,chatId,callback,'⚠️ La regla de puntos ya no coincide con la propuesta. No se aplicó el ajuste.',resultBack(row));
    return 'secretariat_adjustment_points_changed';
  }
  if(award.sanctioned_delta===0&&award.beneficiary_delta===0){
    await env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await present(token,chatId,callback,'ℹ️ El fallo ya no produce cambios en la tabla.',resultBack(row));
    return 'secretariat_adjustment_no_points_change';
  }
  const existing=await loadActiveResolution(env.DB,row,award.sanctioned_team_id,award.beneficiary_team_id);
  if(existing){
    await env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await present(token,chatId,callback,'ℹ️ La resolución ya estaba aplicada. No se duplicaron puntos.',resultBack(row));
    return 'secretariat_adjustment_duplicate_guard';
  }

  const now=new Date().toISOString();
  const resolutionId=`sec-${row.match_id}-${row.series_code}-${award.sanctioned_team_id}-to-${award.beneficiary_team_id}-${Date.now()}`;
  const debitId=`${resolutionId}:DEBIT`,creditId=`${resolutionId}:CREDIT`,eventId=`${resolutionId}:EVENT`;
  const cfg=SERIES[row.series_code];
  const reason=safeReason(session.reason);
  const sourceLabel='Secretaría · AWARD_OPPONENT_WIN';
  const payload={
    resolution_id:resolutionId,
    resolution_type:'TRANSFER_POINTS',
    resolution_policy:SECRETARIAT_POLICY,
    series_code:row.series_code,
    score:[Number(row.home_score),Number(row.away_score)],
    sanctioned_team_id:award.sanctioned_team_id,
    beneficiary_team_id:award.beneficiary_team_id,
    sanctioned_points_before:award.sanctioned_points_before,
    sanctioned_target_points:award.sanctioned_target_points,
    sanctioned_delta:award.sanctioned_delta,
    beneficiary_points_before:award.beneficiary_points_before,
    beneficiary_target_points:award.beneficiary_target_points,
    beneficiary_delta:award.beneficiary_delta,
    adjustment_ids:[debitId,creditId],
    reason
  };

  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO secretariat_standings_resolutions
        (resolution_id,competition_id,season_id,group_id,match_id,series_code,championship_code,resolution_type,
         sanctioned_team_id,beneficiary_team_id,points_amount,reason,source_home_score,source_away_score,
         source_governance_version,actor_id,actor_role,source_label,status,created_at,updated_at,
         resolution_policy,sanctioned_points_before,sanctioned_target_points,sanctioned_points_delta,
         beneficiary_points_before,beneficiary_target_points,beneficiary_points_delta)
        VALUES (?,?,?,?,?,?,?,'TRANSFER_POINTS',?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,?,?)`)
        .bind(resolutionId,row.competition_id,row.season_id,row.group_id,row.match_id,row.series_code,cfg.championship,
          award.sanctioned_team_id,award.beneficiary_team_id,award.beneficiary_target_points,reason,
          Number(row.home_score),Number(row.away_score),Number(row.governance_version||1),actorId,reporter.role,sourceLabel,now,now,
          SECRETARIAT_POLICY,award.sanctioned_points_before,award.sanctioned_target_points,award.sanctioned_delta,
          award.beneficiary_points_before,award.beneficiary_target_points,award.beneficiary_delta),
      env.DB.prepare(`INSERT INTO standings_adjustments
        (adjustment_id,competition_id,group_id,championship_code,team_id,points_delta,reason,source_label,effective_on,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`)
        .bind(debitId,row.competition_id,row.group_id,cfg.championship,award.sanctioned_team_id,award.sanctioned_delta,reason,sourceLabel,row.played_on||null,now,now),
      env.DB.prepare(`INSERT INTO standings_adjustments
        (adjustment_id,competition_id,group_id,championship_code,team_id,points_delta,reason,source_label,effective_on,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`)
        .bind(creditId,row.competition_id,row.group_id,cfg.championship,award.beneficiary_team_id,award.beneficiary_delta,reason,sourceLabel,row.played_on||null,now,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'VERIFIED',?)`)
        .bind(eventId,'standings.secretariat.win_awarded',now,now,row.competition_id,row.season_id,row.match_id,actorId,reporter.display_name||actorId,reporter.club_id||null,JSON.stringify(payload)),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?,?,'secretariat_resolution',?,1,?,?)`)
        .bind(`${resolutionId}:AUDIT`,actorId,reporter.role,reporter.club_id||null,'APPLY_SECRETARIAT_AWARDED_WIN',resolutionId,reason,now),
      env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId)
    ]);
  }catch(err){
    console.error('secretariat_award_apply_failed',err);
    await present(token,chatId,callback,'⚠️ No se pudo aplicar la resolución de forma atómica. La tabla no fue modificada.',resultBack(row));
    return 'secretariat_adjustment_apply_failed';
  }

  await present(token,chatId,callback,
    `✅ <b>RESOLUCIÓN DE SECRETARÍA APLICADA</b>\n\n<b>Victoria administrativa para ${esc(teamName(row,award.beneficiary_team_id))}</b>\n${awardLines(award,row)}\nMarcador ${row.home_score}–${row.away_score}: <b>sin cambios</b>\nMotivo: ${esc(reason)}\n\nLa Tabla de posiciones ya consume estos ajustes automáticamente.`,
    resultBack(row));
  return 'secretariat_adjustment_applied';
}

export async function handleSecretariatStandingsRequest(request,env){
  const url=new URL(request.url);
  if(!['/webhook/telegram','/webhook/telegram-next'].includes(url.pathname)||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json()}catch{return null}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId||!env.DB||!env.TELEGRAM_WEBHOOK_SECRET) return null;

  const actorId=String(actor.id);
  const data=String(callback?.data||'');
  const text=String(message?.text||'').trim();
  const session=await env.DB.prepare('SELECT * FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).first();
  const relevant=data.startsWith('sec:')||!!(session&&message&&text&&!text.startsWith('/'));
  if(!relevant) return null;

  const secretSource=slot(url)==='next'?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await sha256Hex(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return null;
  const token=slot(url)==='next'?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return null;

  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!isSuperAdmin(reporter)) return deny(env,token,chatId,callback,actorId,reporter,'super_admin_required');

  if(data==='sec:cancel'){
    await env.DB.prepare('DELETE FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).run();
    if(callback?.id) await sendApi(token,'answerCallbackQuery',{callback_query_id:callback.id,text:'Cancelado'});
    await sendApi(token,'sendMessage',{chat_id:chatId,text:'Operación de Secretaría cancelada. No se modificó la tabla.'});
    return json({ok:true,handled:'secretariat_adjustment_cancelled'});
  }

  const start=data.match(/^sec:start:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(start){
    const row=await currentResult(env.DB,start[1],start[2]);
    if(!row) return json({ok:true,handled:'secretariat_adjustment_missing_result'});
    const handled=await showStart(env,token,chatId,callback,reporter,row);
    return json({ok:true,handled});
  }

  const pick=data.match(/^sec:pick:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA):(HOME|AWAY)$/);
  if(pick){
    const row=await currentResult(env.DB,pick[1],pick[2]);
    if(!row) return json({ok:true,handled:'secretariat_adjustment_missing_result'});
    const handled=await startReason(env,token,chatId,callback,reporter,actorId,row,pick[3]);
    return json({ok:true,handled});
  }

  if(session&&message&&text&&!text.startsWith('/')){
    if(session.phase!=='AWAIT_REASON') return json({ok:true,handled:'secretariat_adjustment_wait_confirmation'});
    const reason=safeReason(text);
    if(reason.length<3){
      await sendApi(token,'sendMessage',{chat_id:chatId,text:'Escribe un motivo de al menos 3 caracteres para dejar trazabilidad de Secretaría.'});
      return json({ok:true,handled:'secretariat_adjustment_reason_too_short'});
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`UPDATE telegram_secretariat_sessions SET reason=?,phase='CONFIRM',updated_at=? WHERE telegram_user_id=?`)
      .bind(reason,now,actorId).run();
    const updated=await env.DB.prepare('SELECT * FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).first();
    const row=await currentResult(env.DB,updated.match_id,updated.series_code);
    if(!row) return json({ok:true,handled:'secretariat_adjustment_missing_result'});
    await showConfirmation(env,token,chatId,reporter,updated,row);
    return json({ok:true,handled:'secretariat_adjustment_confirmation'});
  }

  if(data==='sec:apply'){
    const current=await env.DB.prepare('SELECT * FROM telegram_secretariat_sessions WHERE telegram_user_id=?').bind(actorId).first();
    if(!current||current.phase!=='CONFIRM'||!safeReason(current.reason)){
      if(callback?.id) await sendApi(token,'answerCallbackQuery',{callback_query_id:callback.id,text:'Sesión vencida'});
      return json({ok:true,handled:'secretariat_adjustment_session_missing'});
    }
    const handled=await applyResolution(env,token,chatId,callback,reporter,actorId,current);
    return json({ok:true,handled});
  }

  return null;
}
