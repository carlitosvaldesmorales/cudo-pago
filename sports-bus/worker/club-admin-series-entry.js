const SERIES = ['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL = {TERCERA:'Tercera',SEGUNDA:'Segunda',SENIOR:'Senior',PRIMERA:'Primera'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// TELEGRAM-PORTAL-01 policy override:
// a VERIFIED CLUB_ADMIN may publish a first result for a series of a match in its own club scope directly as VERIFIED.
// If an official result already exists, the system never silently overwrites it:
// - same score => corroboration, official result remains VERIFIED;
// - different score => conflict, official score is preserved and the series becomes DISPUTED for global resolution.
// SUPER_ADMIN remains handled by the existing series/governance flow. Public users are handled separately as SUBMITTED.
export async function handleClubAdminSeriesScore(request, env) {
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;

  let update;
  try{update=await request.json();}catch{return null;}
  const message=update.message;
  const actor=message?.from;
  const chatId=message?.chat?.id;
  const text=String(message?.text||'').trim();
  if(!actor?.id||!chatId||!/^\s*\d{1,2}\s*[-:]\s*\d{1,2}\s*$/.test(text)) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'club_admin_series_not_configured'},503);

  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!reporter||reporter.active!==1||reporter.trust_level!=='VERIFIED'||reporter.role!=='CLUB_ADMIN'||!reporter.club_id) return null;

  const session=await env.DB.prepare('SELECT * FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).first();
  if(!session||session.state!=='AWAIT_SCORE'||!SERIES.includes(session.series_code)) return null;

  const match=await env.DB.prepare(`
    SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name
    FROM matches WHERE match_id=? AND (home_id=? OR away_id=?)
  `).bind(session.match_id,reporter.club_id,reporter.club_id).first();
  if(!match){
    await env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId).run();
    await send(env,chatId,'🔒 La sesión ya no corresponde a un partido de tu club.');
    return json({ok:true,handled:'club_admin_scope_denied'});
  }

  const score=text.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
  const home=Number(score[1]),away=Number(score[2]);
  const seriesCode=session.series_code;
  const now=new Date().toISOString();
  const eventId=`tg-${update.update_id||Date.now()}-series`;
  const reportId=`${match.match_id}:${seriesCode}:${actorId}`;
  const auditId=`${eventId}-audit`;
  const current=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,seriesCode).first();

  const reportUpsert=env.DB.prepare(`
    INSERT INTO series_reports (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'VERIFIED','telegram',?,?,?)
    ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,report_status='VERIFIED',source_event_id=excluded.source_event_id,updated_at=excluded.updated_at
  `).bind(reportId,match.match_id,seriesCode,actorId,reporter.club_id,home,away,eventId,now,now);

  if(!current){
    await env.DB.batch([
      reportUpsert,
      env.DB.prepare(`
        INSERT INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version)
        VALUES (?,?,?,?,?,'VERIFIED','TELEGRAM_CLUB_ADMIN',?,?,NULL,?,?,1)
      `).bind(`${match.match_id}-${seriesCode}`,match.match_id,seriesCode,home,away,`Telegram · Administrador de club ${reporter.club_id}`,eventId,now,now),
      env.DB.prepare(`
        INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'VERIFIED',?)
      `).bind(eventId,'match.series.result.reported',now,now,match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name||actor.first_name||reporter.club_id,reporter.club_id,JSON.stringify({series_code:seriesCode,home_score:home,away_score:away,source_channel:'telegram',authorization:'CLUB_ADMIN_DIRECT',outcome:'FIRST_OFFICIAL'})),
      env.DB.prepare(`
        INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'REPORT_SERIES_RESULT','match_series',?,1,'verified_club_admin_first_official',?)
      `).bind(auditId,actorId,reporter.role,reporter.club_id,`${match.match_id}:${seriesCode}`,now),
      env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId)
    ]);

    await send(env,chatId,`${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n✅ Resultado oficial registrado por administrador de ${reporter.club_id}.`);
    await showSeriesMenu(env,chatId,match);
    return json({ok:true,handled:'club_admin_series_verified',match_id:match.match_id,series_code:seriesCode,status:'VERIFIED',outcome:'FIRST_OFFICIAL'});
  }

  const sameScore=Number(current.home_score)===home&&Number(current.away_score)===away;
  if(sameScore){
    await env.DB.batch([
      reportUpsert,
      env.DB.prepare(`
        INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'VERIFIED',?)
      `).bind(eventId,'match.series.result.corroborated',now,now,match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name||actor.first_name||reporter.club_id,reporter.club_id,JSON.stringify({series_code:seriesCode,home_score:home,away_score:away,source_channel:'telegram',authorization:'CLUB_ADMIN_DIRECT',official_version:Number(current.governance_version||1),outcome:'CORROBORATED'})),
      env.DB.prepare(`
        INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'CORROBORATE_SERIES_RESULT','match_series',?,1,'verified_club_admin_same_score',?)
      `).bind(auditId,actorId,reporter.role,reporter.club_id,`${match.match_id}:${seriesCode}`,now),
      env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId)
    ]);

    await send(env,chatId,`${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n✅ Tu marcador coincide con el resultado oficial. Quedó registrado como corroboración.`);
    await showSeriesMenu(env,chatId,match);
    return json({ok:true,handled:'club_admin_series_corroborated',match_id:match.match_id,series_code:seriesCode,status:current.validation_status,outcome:'CORROBORATED'});
  }

  const currentVersion=Number(current.governance_version||1);
  const nextVersion=currentVersion+1;
  const versionId=`${match.match_id}:${seriesCode}:v${nextVersion}`;
  const conflictReason=`club_admin_conflict:${reporter.club_id}:${home}-${away}`;
  await env.DB.batch([
    reportUpsert,
    env.DB.prepare(`
      UPDATE match_series_results
      SET validation_status='DISPUTED',source_type='TELEGRAM_CLUB_ADMIN_CONFLICT',source_label='Conflicto entre aportes de dirigentes',source_ref=?,governance_version=?,updated_at=?
      WHERE result_id=?
    `).bind(eventId,nextVersion,now,current.result_id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO match_series_result_versions
      (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
      VALUES (?,?,?,?,?,?,'DISPUTED','DISPUTE',?,'TELEGRAM_CLUB_ADMIN_CONFLICT','Conflicto entre aportes de dirigentes',?,?,?,'CLUB_ADMIN',?,?)
    `).bind(versionId,match.match_id,seriesCode,nextVersion,Number(current.home_score),Number(current.away_score),conflictReason,eventId,current.played_on||null,actorId,reporter.club_id,now),
    env.DB.prepare(`
      INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'DISPUTED',?)
    `).bind(eventId,'match.series.result.conflicted',now,now,match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name||actor.first_name||reporter.club_id,reporter.club_id,JSON.stringify({series_code:seriesCode,official_score:[Number(current.home_score),Number(current.away_score)],reported_score:[home,away],official_version:currentVersion,dispute_version:nextVersion,source_channel:'telegram',authorization:'CLUB_ADMIN_DIRECT',outcome:'CONFLICT'})),
    env.DB.prepare(`
      INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
      VALUES (?,?,?,?, 'REPORT_SERIES_RESULT_CONFLICT','match_series',?,1,'verified_club_admin_conflicting_score',?)
    `).bind(auditId,actorId,reporter.role,reporter.club_id,`${match.match_id}:${seriesCode}`,now),
    env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(actorId)
  ]);

  await send(env,chatId,`${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n⚠️ Tu marcador no coincide con el oficial ${current.home_score}-${current.away_score}.\n\nNo se reemplazó el marcador existente. El resultado quedó EN DISPUTA para revisión.`);
  await notifyGlobalAdmins(env,match,seriesCode,current,home,away,reporter);
  await showSeriesMenu(env,chatId,match);
  return json({ok:true,handled:'club_admin_series_conflict',match_id:match.match_id,series_code:seriesCode,status:'DISPUTED',outcome:'CONFLICT'});
}

async function notifyGlobalAdmins(env,match,seriesCode,current,home,away,reporter){
  let rows=[];
  try{
    const q=await env.DB.prepare("SELECT telegram_user_id FROM reporters WHERE role='SUPER_ADMIN' AND trust_level='VERIFIED' AND active=1").all();
    rows=q.results||[];
  }catch{return;}
  for(const admin of rows){
    try{
      await send(env,admin.telegram_user_id,`⚠️ CONFLICTO DE RESULTADO\n\n${match.home_name} — ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\nOficial: ${current.home_score}-${current.away_score}\nAporte ${reporter.club_id}: ${home}-${away}\n\nEl marcador oficial no fue sobrescrito y la serie quedó en disputa.`);
    }catch{}
  }
}

async function showSeriesMenu(env,chatId,match){
  const rows=await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const existing=new Map((rows.results||[]).map(r=>[r.series_code,r]));
  const buttons=SERIES.map(code=>{
    const r=existing.get(code);
    let label=SERIES_LABEL[code];
    if(r?.validation_status==='VERIFIED') label=`✅ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score}`;
    else if(r?.validation_status==='DISPUTED') label=`⚠️ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score}`;
    else if(r?.validation_status==='ANNULLED') label=`🚫 ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score}`;
    return [{text:label,callback_data:`rs:series:${match.match_id}:${code}`}];
  });
  buttons.push([{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]);
  await send(env,chatId,`📝 ${match.round_label} · Grupo ${match.group_id}\n${match.home_name} vs ${match.away_name}\n\nPuedes informar otra serie:`,{inline_keyboard:buttons});
}

async function send(env,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup)body.reply_markup=replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
