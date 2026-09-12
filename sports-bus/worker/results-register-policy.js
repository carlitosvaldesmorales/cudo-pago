import { ROLE, resolveObservationProvenance } from './access-control.js';

const MAX_PENDING_PER_USER=8;

export async function applyResultsRegisterPolicy(env,actor,ctx,match,session,updateId){
  const actorId=String(actor.id);
  const home=Number(session.home_score);
  const away=Number(session.away_score);
  const seriesCode=session.series_code;
  if(ctx.officialAuthority) return applyOfficialPolicy(env,actor,ctx,match,seriesCode,home,away,updateId);
  const reporter=ctx.reporter||{telegram_user_id:actorId,active:1,role:'REPORTER',trust_level:'PROVISIONAL'};
  return applyObservationPolicy(env,actor,reporter,match,seriesCode,home,away,updateId);
}

export function outcomeNotice(outcome){
  if(!outcome) return null;
  if(outcome.outcome==='FIRST_OFFICIAL') return '✅ Resultado registrado como oficial.';
  if(outcome.outcome==='CORROBORATED') return '✅ El marcador coincide con el resultado registrado.';
  if(outcome.outcome==='SUBMITTED') return '🕒 Resultado informado y enviado para validación.';
  if(outcome.outcome==='DUPLICATE_PENDING') return '🕒 Ya tenías un aporte pendiente para esa serie; no se duplicó.';
  if(outcome.outcome==='CONFLICT') return '⚠️ El marcador quedó en disputa; no reemplazó el existente.';
  if(outcome.outcome==='REQUIRES_GOVERNANCE') return '⚠️ Existe otro marcador. No fue reemplazado; requiere corrección/gobierno.';
  if(outcome.outcome==='PENDING_LIMIT') return '⚠️ Alcanzaste el límite de aportes pendientes. Deben revisarse antes de continuar.';
  return '✅ Resultado procesado.';
}

async function applyObservationPolicy(env,actor,reporter,match,seriesCode,home,away,updateId){
  const actorId=String(actor.id);
  const existing=await env.DB.prepare("SELECT submission_id,home_score,away_score FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED' LIMIT 1")
    .bind(match.match_id,seriesCode,actorId).first();
  if(existing) return {outcome:'DUPLICATE_PENDING',status:'SUBMITTED',submission_id:existing.submission_id,existing};

  const pending=await env.DB.prepare("SELECT COUNT(*) n FROM public_result_submissions WHERE submitter_id=? AND status='SUBMITTED'")
    .bind(actorId).first();
  if(Number(pending?.n||0)>=MAX_PENDING_PER_USER) return {outcome:'PENDING_LIMIT',status:'SUBMITTED'};

  const official=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?')
    .bind(match.match_id,seriesCode).first();
  const provenance=await resolveObservationProvenance(env.DB,reporter,match);
  const kind=!official?'INITIAL':Number(official.home_score)===home&&Number(official.away_score)===away?'CORROBORATION':'DISCREPANCY';
  const now=new Date().toISOString();
  const submissionId=`rr-${actorId}-${updateId}-${sessionSafe(seriesCode)}`;
  const eventId=`result-register-${submissionId}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO public_result_submissions
      (submission_id,match_id,series_code,submitter_id,submitter_name,home_score,away_score,status,source_channel,source_event_id,source_type,source_label,trust_level,evidence_ref,observation_kind,observed_result_id,observed_validation_status,observed_home_score,observed_away_score,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'SUBMITTED','telegram',?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(submissionId,match.match_id,seriesCode,actorId,displayName(actor),home,away,eventId,provenance.source_type,provenance.source_label,provenance.trust_level,null,kind,official?.result_id||null,official?.validation_status||null,official?.home_score??null,official?.away_score??null,now,now),
    env.DB.prepare(`INSERT OR REPLACE INTO events
      (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'SUBMITTED',?)`)
      .bind(eventId,'match.series.result.registered',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),reporter?.club_id||null,JSON.stringify({module:'RESULTS-REGISTER',submission_id:submissionId,series_code:seriesCode,home_score:home,away_score:away,observation_kind:kind,source_type:provenance.source_type,source_label:provenance.source_label}))
  ]);
  return {outcome:'SUBMITTED',status:'SUBMITTED',submission_id:submissionId,source_label:provenance.source_label};
}

async function applyOfficialPolicy(env,actor,ctx,match,seriesCode,home,away,updateId){
  const actorId=String(actor.id);
  const role=ctx.role;
  const current=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?')
    .bind(match.match_id,seriesCode).first();
  const now=new Date().toISOString();
  const eventId=`rr-official-${actorId}-${updateId}-${sessionSafe(seriesCode)}`;
  const sourceType=role===ROLE.CLUB_ADMIN?'TELEGRAM_CLUB_ADMIN':role===ROLE.PLATFORM_OPERATOR?'PLATFORM_OPERATOR':'TELEGRAM_SUPER_ADMIN';
  const sourceLabel=role===ROLE.CLUB_ADMIN?`Telegram · dirigente ${ctx.reporter.club_id}`:role===ROLE.PLATFORM_OPERATOR?'Telegram · administrador del campeonato':'Telegram · administrador global';
  const reportId=`${match.match_id}:${seriesCode}:${actorId}`;
  const report=env.DB.prepare(`INSERT INTO series_reports
      (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'VERIFIED','telegram',?,?,?)
      ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET
        home_score=excluded.home_score,away_score=excluded.away_score,report_status='VERIFIED',source_event_id=excluded.source_event_id,updated_at=excluded.updated_at`)
    .bind(reportId,match.match_id,seriesCode,actorId,ctx.reporter?.club_id||null,home,away,eventId,now,now);

  if(!current){
    await env.DB.batch([
      report,
      env.DB.prepare(`INSERT INTO match_series_results
        (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version)
        VALUES (?,?,?,?,?,'VERIFIED',?,?,?,NULL,?,?,1)`)
        .bind(`${match.match_id}-${seriesCode}`,match.match_id,seriesCode,home,away,sourceType,sourceLabel,eventId,now,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,'VERIFIED',?)`)
        .bind(eventId,'match.series.result.registered',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),ctx.reporter?.club_id||null,JSON.stringify({module:'RESULTS-REGISTER',series_code:seriesCode,home_score:home,away_score:away,outcome:'FIRST_OFFICIAL',authorization:role}))
    ]);
    return {outcome:'FIRST_OFFICIAL',status:'VERIFIED'};
  }

  if(Number(current.home_score)===home&&Number(current.away_score)===away){
    await env.DB.batch([
      report,
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'match.series.result.corroborated',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),ctx.reporter?.club_id||null,current.validation_status,JSON.stringify({module:'RESULTS-REGISTER',series_code:seriesCode,home_score:home,away_score:away,outcome:'CORROBORATED',authorization:role}))
    ]);
    return {outcome:'CORROBORATED',status:current.validation_status};
  }

  if(role!==ROLE.CLUB_ADMIN) return {outcome:'REQUIRES_GOVERNANCE',status:current.validation_status,current};

  const nextVersion=Number(current.governance_version||1)+1;
  await env.DB.batch([
    report,
    env.DB.prepare(`UPDATE match_series_results SET
      validation_status='DISPUTED',source_type='TELEGRAM_CLUB_ADMIN_CONFLICT',source_label='Conflicto entre aportes de dirigentes',source_ref=?,governance_version=?,updated_at=?
      WHERE result_id=?`).bind(eventId,nextVersion,now,current.result_id),
    env.DB.prepare(`INSERT OR IGNORE INTO match_series_result_versions
      (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
      VALUES (?,?,?,?,?,?,'DISPUTED','DISPUTE',?,'TELEGRAM_CLUB_ADMIN_CONFLICT','Conflicto entre aportes de dirigentes',?,?,?,'CLUB_ADMIN',?,?)`)
      .bind(`${match.match_id}:${seriesCode}:v${nextVersion}`,match.match_id,seriesCode,nextVersion,Number(current.home_score),Number(current.away_score),`club_admin_conflict:${ctx.reporter.club_id}:${home}-${away}`,eventId,current.played_on||null,actorId,ctx.reporter.club_id,now),
    env.DB.prepare(`INSERT OR REPLACE INTO events
      (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,'DISPUTED',?)`)
      .bind(eventId,'match.series.result.conflicted',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),ctx.reporter.club_id,JSON.stringify({module:'RESULTS-REGISTER',series_code:seriesCode,official_score:[Number(current.home_score),Number(current.away_score)],reported_score:[home,away],outcome:'CONFLICT'}))
  ]);
  return {outcome:'CONFLICT',status:'DISPUTED',current};
}

function sessionSafe(v){return String(v).replace(/[^A-Za-z0-9]/g,'').slice(0,16);}
function displayName(a){return [a?.first_name,a?.last_name].filter(Boolean).join(' ')||a?.username||String(a?.id||'Telegram');}
