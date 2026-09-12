import { ROLE, effectiveRole, resolveObservationProvenance, getActivePartnerMembership } from './access-control.js';
import { publishRoundSnapshots } from './results-stream-entry.js';

const COMPETITION_ID='ANFA-CHEPICA-2026';
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const MAX_PENDING_PER_USER=8;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleResultsRegisterRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;
  const actorId=String(actor.id),text=String(message?.text||'').trim(),data=String(callback?.data||'');
  const entry=/^\/(informar|registrarresultado|mispartidos)(?:@\w+)?$/i.test(text)
    || ['tp:public-report','obs:dates','rs:dates','ga:dates','rr:dates'].includes(data);
  const relevant=entry||data.startsWith('rr:');
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'results_register_not_configured'},503);

  const context=await actorContext(env.DB,actorId);
  if(context.denied){
    if(callback) await answer(env,callback.id,'Acceso suspendido');
    await send(env,chatId,'🔒 Tu acceso de dirigente no está activo. No puedes registrar resultados con esa autorización.');
    return json({ok:true,handled:'results_register_actor_denied'});
  }

  if(entry){
    await clearSession(env.DB,actorId);
    if(callback) await answer(env,callback.id,'Registrar resultado');
    await showDates(env,chatId,context);
    return json({ok:true,handled:'results_register_dates'});
  }

  if(data==='rr:cancel-menu'){
    await clearSession(env.DB,actorId);
    await answer(env,callback.id,'Cancelado');
    await send(env,chatId,'Operación cancelada. No se registró ningún resultado.',homeKeyboard());
    return json({ok:true,handled:'results_register_cancel'});
  }

  const dateCb=data.match(/^rr:date:(\d+)$/);
  if(dateCb){
    await clearSession(env.DB,actorId);
    const roundNo=Number(dateCb[1]);
    await answer(env,callback.id,`Fecha ${roundNo}`);
    await showRound(env,chatId,context,roundNo);
    return json({ok:true,handled:'results_register_round',round_no:roundNo});
  }

  const matchCb=data.match(/^rr:match:([A-Za-z0-9._:-]+)$/);
  if(matchCb){
    await clearSession(env.DB,actorId);
    const match=await scopedMatch(env.DB,context,matchCb[1]);
    if(!match) return denyScope(env,chatId,callback);
    await answer(env,callback.id,'Selecciona la serie');
    await showSeries(env,chatId,context,match);
    return json({ok:true,handled:'results_register_series',match_id:match.match_id});
  }

  const existsCb=data.match(/^rr:exists:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(existsCb){
    const [,matchId,seriesCode]=existsCb;
    const match=await scopedMatch(env.DB,context,matchId);
    if(!match) return denyScope(env,chatId,callback);
    const current=await env.DB.prepare('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first();
    await answer(env,callback.id,'Ya registrado');
    await send(env,chatId,current
      ? `✅ ${SERIES_LABEL[seriesCode]} ya tiene un resultado: ${current.home_score}-${current.away_score}.\n\nRegistrar resultado no sobrescribe un resultado existente. Para cambiarlo corresponde usar el módulo de gobierno/corrección.`
      : 'El resultado cambió de estado. Vuelve al partido para actualizar las opciones.',
      {inline_keyboard:[[{text:'⬅️ Volver al partido',callback_data:`rr:match:${matchId}`}],[{text:'❌ Cancelar',callback_data:'rr:cancel-menu'}]]});
    return json({ok:true,handled:'results_register_existing_guard'});
  }

  const seriesCb=data.match(/^rr:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesCb){
    const [,matchId,seriesCode]=seriesCb;
    const match=await scopedMatch(env.DB,context,matchId);
    if(!match) return denyScope(env,chatId,callback);
    if(context.officialAuthority){
      const current=await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first();
      if(current){
        await answer(env,callback.id,'Ya registrado');
        await showSeries(env,chatId,context,match);
        return json({ok:true,handled:'results_register_existing_guard'});
      }
    }
    const n=makeNonce(),now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_result_register_sessions
      (telegram_user_id,chat_id,match_id,series_code,state,home_score,away_score,nonce,revision,created_at,updated_at)
      VALUES (?,?,?,?, 'HOME_SCORE',NULL,NULL,?,1,?,?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='HOME_SCORE',home_score=NULL,away_score=NULL,nonce=excluded.nonce,revision=telegram_result_register_sessions.revision+1,updated_at=excluded.updated_at`)
      .bind(actorId,String(chatId),matchId,seriesCode,n,now,now).run();
    await answer(env,callback.id,SERIES_LABEL[seriesCode]);
    await showScorePicker(env,chatId,match,seriesCode,'HOME',n,null);
    return json({ok:true,handled:'results_register_home_score',match_id:matchId,series_code:seriesCode});
  }

  const scoreCb=data.match(/^rr:(h|a):([A-Za-z0-9_-]{6,24}):(\d)$/);
  if(scoreCb){
    const side=scoreCb[1]==='h'?'HOME':'AWAY',n=scoreCb[2],score=Number(scoreCb[3]);
    const session=await sessionFor(env.DB,actorId,n);
    if(!session||!validState(session,side)) return stale(env,chatId,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,chatId,callback);
    await setScore(env.DB,actorId,n,side,score,side==='HOME'?'AWAY_SCORE':'CONFIRM');
    await answer(env,callback.id,String(score));
    if(side==='HOME') await showScorePicker(env,chatId,match,session.series_code,'AWAY',n,score);
    else await showConfirmation(env,chatId,match,session.series_code,n,Number(session.home_score),score);
    return json({ok:true,handled:side==='HOME'?'results_register_away_score':'results_register_confirm'});
  }

  const highStart=data.match(/^rr:(h|a):([A-Za-z0-9_-]{6,24}):more$/);
  if(highStart){
    const side=highStart[1]==='h'?'HOME':'AWAY',n=highStart[2],session=await sessionFor(env.DB,actorId,n);
    if(!session||!validState(session,side)) return stale(env,chatId,callback);
    await setScore(env.DB,actorId,n,side,8,side==='HOME'?'HOME_HIGH':'AWAY_HIGH');
    await answer(env,callback.id,'8+');
    await showHighStepper(env,chatId,actorId,n,side);
    return json({ok:true,handled:'results_register_high_score'});
  }

  const highStep=data.match(/^rr:step:([A-Za-z0-9_-]{6,24}):(h|a):(inc|dec|ok)$/);
  if(highStep){
    const n=highStep[1],side=highStep[2]==='h'?'HOME':'AWAY',action=highStep[3];
    let session=await sessionFor(env.DB,actorId,n),expected=side==='HOME'?'HOME_HIGH':'AWAY_HIGH';
    if(!session||session.state!==expected) return stale(env,chatId,callback);
    if(action==='inc'||action==='dec'){
      const current=Number(side==='HOME'?session.home_score:session.away_score)||8;
      const next=Math.max(8,Math.min(99,current+(action==='inc'?1:-1)));
      await setScore(env.DB,actorId,n,side,next,expected);
      await answer(env,callback.id,String(next));
      await showHighStepper(env,chatId,actorId,n,side);
      return json({ok:true,handled:'results_register_high_adjust',score:next});
    }
    await env.DB.prepare('UPDATE telegram_result_register_sessions SET state=?,updated_at=? WHERE telegram_user_id=? AND nonce=? AND state=?')
      .bind(side==='HOME'?'AWAY_SCORE':'CONFIRM',new Date().toISOString(),actorId,n,expected).run();
    session=await sessionFor(env.DB,actorId,n);
    const match=session&&await scopedMatch(env.DB,context,session.match_id);
    if(!session||!match) return stale(env,chatId,callback);
    await answer(env,callback.id,'Listo');
    if(side==='HOME') await showScorePicker(env,chatId,match,session.series_code,'AWAY',n,Number(session.home_score));
    else await showConfirmation(env,chatId,match,session.series_code,n,Number(session.home_score),Number(session.away_score));
    return json({ok:true,handled:side==='HOME'?'results_register_away_score':'results_register_confirm'});
  }

  const backHome=data.match(/^rr:back-home:([A-Za-z0-9_-]{6,24})$/);
  if(backHome){
    const n=backHome[1],session=await sessionFor(env.DB,actorId,n);
    if(!session) return stale(env,chatId,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);if(!match)return stale(env,chatId,callback);
    await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='HOME_SCORE',home_score=NULL,away_score=NULL,updated_at=? WHERE telegram_user_id=? AND nonce=?").bind(new Date().toISOString(),actorId,n).run();
    await answer(env,callback.id,'Marcador local');
    await showScorePicker(env,chatId,match,session.series_code,'HOME',n,null);
    return json({ok:true,handled:'results_register_back_home'});
  }

  const backSeries=data.match(/^rr:back-series:([A-Za-z0-9_-]{6,24})$/);
  if(backSeries){
    const n=backSeries[1],session=await sessionFor(env.DB,actorId,n);
    if(!session) return stale(env,chatId,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);if(!match)return stale(env,chatId,callback);
    await clearSession(env.DB,actorId,n);await answer(env,callback.id,'Serie');await showSeries(env,chatId,context,match);
    return json({ok:true,handled:'results_register_back_series'});
  }

  const changeCb=data.match(/^rr:change:([A-Za-z0-9_-]{6,24})$/);
  if(changeCb){
    const n=changeCb[1],session=await sessionFor(env.DB,actorId,n);
    if(!session||session.state!=='CONFIRM') return stale(env,chatId,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);if(!match)return stale(env,chatId,callback);
    await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='HOME_SCORE',home_score=NULL,away_score=NULL,updated_at=? WHERE telegram_user_id=? AND nonce=? AND state='CONFIRM'").bind(new Date().toISOString(),actorId,n).run();
    await answer(env,callback.id,'Cambiar marcador');await showScorePicker(env,chatId,match,session.series_code,'HOME',n,null);
    return json({ok:true,handled:'results_register_change'});
  }

  const cancelCb=data.match(/^rr:cancel:([A-Za-z0-9_-]{6,24})$/);
  if(cancelCb){
    const n=cancelCb[1];await clearSession(env.DB,actorId,n);await answer(env,callback.id,'Cancelado');
    await send(env,chatId,'Operación cancelada. No se registró ningún resultado.',homeKeyboard());
    return json({ok:true,handled:'results_register_cancel'});
  }

  const confirmCb=data.match(/^rr:confirm:([A-Za-z0-9_-]{6,24})$/);
  if(confirmCb){
    const n=confirmCb[1],session=await sessionFor(env.DB,actorId,n);
    if(!session||session.state!=='CONFIRM'||session.home_score===null||session.away_score===null) return stale(env,chatId,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);if(!match)return stale(env,chatId,callback);
    const claim=await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='APPLYING',updated_at=? WHERE telegram_user_id=? AND nonce=? AND state='CONFIRM'").bind(new Date().toISOString(),actorId,n).run();
    if(Number(claim?.meta?.changes??claim?.changes??0)!==1) return stale(env,chatId,callback);
    await answer(env,callback.id,'Registrando');
    try{
      const outcome=await applyPolicy(env,actor,context,match,session,update.update_id||Date.now());
      await clearSession(env.DB,actorId,n);
      await publishRoundSnapshots(env,match.round_no,{module:'RESULTS-REGISTER',outcome:outcome.outcome,match_id:match.match_id,series_code:session.series_code}).catch(()=>{});
      await showReceipt(env,chatId,match,session.series_code,Number(session.home_score),Number(session.away_score),outcome);
      return json({ok:true,handled:'results_register_applied',outcome:outcome.outcome,status:outcome.status,submission_id:outcome.submission_id||null,match_id:match.match_id,series_code:session.series_code});
    }catch(error){
      await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='CONFIRM',updated_at=? WHERE telegram_user_id=? AND nonce=? AND state='APPLYING'").bind(new Date().toISOString(),actorId,n).run().catch(()=>{});
      await send(env,chatId,'⚠️ No pude registrar el resultado. La confirmación sigue disponible; no se duplicó ninguna mutación.');
      return json({ok:false,error:'results_register_apply_failed'},500);
    }
  }
  return null;
}

async function actorContext(db,actorId){
  const reporter=await db.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(reporter?.role==='CLUB_ADMIN'&&(Number(reporter.active)!==1||reporter.trust_level!=='VERIFIED')) return {reporter,denied:true};
  const role=effectiveRole(reporter);
  const membership=await getActivePartnerMembership(db,actorId,COMPETITION_ID);
  const officialAuthority=!!reporter&&Number(reporter.active)===1&&reporter.trust_level==='VERIFIED'&&[ROLE.CLUB_ADMIN,ROLE.PLATFORM_OPERATOR,ROLE.SUPER_ADMIN].includes(role);
  return {reporter,role,membership,officialAuthority,scopeClub:role===ROLE.CLUB_ADMIN&&reporter?.trust_level==='VERIFIED'?reporter.club_id:null,denied:false};
}

async function scopedMatch(db,ctx,matchId){
  if(ctx.scopeClub) return db.prepare(`SELECT * FROM matches WHERE competition_id=? AND match_id=? AND (home_id=? OR away_id=?)`).bind(COMPETITION_ID,matchId,ctx.scopeClub,ctx.scopeClub).first();
  return db.prepare('SELECT * FROM matches WHERE competition_id=? AND match_id=?').bind(COMPETITION_ID,matchId).first();
}

async function showDates(env,chatId,ctx){
  const q=ctx.scopeClub
    ? await env.DB.prepare(`SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id=? AND (home_id=? OR away_id=?) ORDER BY round_no`).bind(COMPETITION_ID,ctx.scopeClub,ctx.scopeClub).all()
    : await env.DB.prepare('SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id=? ORDER BY round_no').bind(COMPETITION_ID).all();
  const rounds=q.results||[];
  rounds.sort((a,b)=>Number(a.round_no===3?-1000:a.round_no)-Number(b.round_no===3?-1000:b.round_no));
  const rows=rounds.map(r=>[{text:`⚽ ${r.round_label||`Fecha ${r.round_no}`}`,callback_data:`rr:date:${r.round_no}`}]);
  rows.push([{text:'🏠 Inicio',callback_data:'tp:home'}]);
  await send(env,chatId,'📝 REGISTRAR RESULTADO\n\nSelecciona la fecha:',{inline_keyboard:rows});
}

async function showRound(env,chatId,ctx,roundNo){
  const q=ctx.scopeClub
    ? await env.DB.prepare(`SELECT * FROM matches WHERE competition_id=? AND round_no=? AND (home_id=? OR away_id=?) ORDER BY group_id,match_id`).bind(COMPETITION_ID,roundNo,ctx.scopeClub,ctx.scopeClub).all()
    : await env.DB.prepare('SELECT * FROM matches WHERE competition_id=? AND round_no=? ORDER BY group_id,match_id').bind(COMPETITION_ID,roundNo).all();
  const rows=(q.results||[]).map(m=>[{text:`${m.home_name} — ${m.away_name}`,callback_data:`rr:match:${m.match_id}`}]);
  rows.push([{text:'⬅️ Fechas',callback_data:'rr:dates'}],[{text:'❌ Cancelar',callback_data:'rr:cancel-menu'}]);
  await send(env,chatId,`📅 FECHA ${roundNo}\n\nSelecciona el partido:`,{inline_keyboard:rows});
}

async function showSeries(env,chatId,ctx,match){
  const q=await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const current=new Map((q.results||[]).map(r=>[r.series_code,r]));
  const rows=SERIES.map(code=>{
    const r=current.get(code);
    if(r&&ctx.officialAuthority) return [{text:`✅ ${SERIES_LABEL[code]} ${r.home_score}-${r.away_score}`,callback_data:`rr:exists:${match.match_id}:${code}`}];
    const label=r?`${SERIES_LABEL[code]} · informar otro marcador`:SERIES_LABEL[code];
    return [{text:label,callback_data:`rr:series:${match.match_id}:${code}`}];
  });
  rows.push([{text:`⬅️ ${match.round_label||`Fecha ${match.round_no}`}`,callback_data:`rr:date:${match.round_no}`}],[{text:'❌ Cancelar',callback_data:'rr:cancel-menu'}]);
  await send(env,chatId,`⚽ ${match.home_name} — ${match.away_name}\n\nSelecciona la serie:`,{inline_keyboard:rows});
}

async function showScorePicker(env,chatId,match,seriesCode,side,n,homeScore){
  const isHome=side==='HOME',name=isHome?match.home_name:match.away_name,icon=isHome?'🏠':'🚗',prefix=isHome?'h':'a';
  const buttons=[[0,1,2,3],[4,5,6,7]].map(xs=>xs.map(v=>({text:String(v),callback_data:`rr:${prefix}:${n}:${v}`})));
  buttons.push([{text:'8+',callback_data:`rr:${prefix}:${n}:more`}]);
  buttons.push([{text:isHome?'⬅️ Serie':'⬅️ Local',callback_data:isHome?`rr:back-series:${n}`:`rr:back-home:${n}`}],[{text:'❌ Cancelar',callback_data:`rr:cancel:${n}`}]);
  const marker=isHome?`${match.home_name} ? — ? ${match.away_name}`:`${match.home_name} ${homeScore} — ? ${match.away_name}`;
  await send(env,chatId,`${icon} ${String(name).toUpperCase()}\nSelecciona sus goles:\n\nMarcador: ${marker}\nSerie: ${SERIES_LABEL[seriesCode]}`,{inline_keyboard:buttons});
}

async function showHighStepper(env,chatId,actorId,n,side){
  const s=await sessionFor(env.DB,actorId,n);if(!s)return;
  const score=Number(side==='HOME'?s.home_score:s.away_score)||8,prefix=side==='HOME'?'h':'a';
  await send(env,chatId,`⚽ Goles: ${score}`,{inline_keyboard:[[{text:'➖',callback_data:`rr:step:${n}:${prefix}:dec`},{text:'➕',callback_data:`rr:step:${n}:${prefix}:inc`}],[{text:`✅ Usar ${score}`,callback_data:`rr:step:${n}:${prefix}:ok`}],[{text:'❌ Cancelar',callback_data:`rr:cancel:${n}`}]]});
}

async function showConfirmation(env,chatId,match,seriesCode,n,home,away){
  await send(env,chatId,`🧾 CONFIRMAR RESULTADO\n\n${match.round_label||`Fecha ${match.round_no}`}\n${SERIES_LABEL[seriesCode]}\n${match.home_name} ${home} — ${away} ${match.away_name}\n\n¿El marcador es correcto?`,{inline_keyboard:[[{text:'✅ Confirmar',callback_data:`rr:confirm:${n}`}],[{text:'✏️ Cambiar marcador',callback_data:`rr:change:${n}`}],[{text:'❌ Cancelar',callback_data:`rr:cancel:${n}`}]]});
}

async function applyPolicy(env,actor,ctx,match,session,updateId){
  const actorId=String(actor.id),home=Number(session.home_score),away=Number(session.away_score),seriesCode=session.series_code;
  if(ctx.officialAuthority) return applyOfficialPolicy(env,actor,ctx,match,seriesCode,home,away,updateId);
  const reporter=ctx.reporter||{telegram_user_id:actorId,active:1,role:'REPORTER',trust_level:'PROVISIONAL'};
  return applyObservationPolicy(env,actor,reporter,match,seriesCode,home,away,updateId);
}

async function applyObservationPolicy(env,actor,reporter,match,seriesCode,home,away,updateId){
  const actorId=String(actor.id);
  const existing=await env.DB.prepare("SELECT submission_id,home_score,away_score FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED' LIMIT 1").bind(match.match_id,seriesCode,actorId).first();
  if(existing) return {outcome:'DUPLICATE_PENDING',status:'SUBMITTED',submission_id:existing.submission_id,existing};
  const pending=await env.DB.prepare("SELECT COUNT(*) n FROM public_result_submissions WHERE submitter_id=? AND status='SUBMITTED'").bind(actorId).first();
  if(Number(pending?.n||0)>=MAX_PENDING_PER_USER) return {outcome:'PENDING_LIMIT',status:'SUBMITTED'};
  const official=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,seriesCode).first();
  const provenance=await resolveObservationProvenance(env.DB,reporter,match);
  const kind=!official?'INITIAL':Number(official.home_score)===home&&Number(official.away_score)===away?'CORROBORATION':'DISCREPANCY';
  const now=new Date().toISOString(),submissionId=`rr-${actorId}-${updateId}-${sessionSafe(seriesCode)}`,eventId=`result-register-${submissionId}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO public_result_submissions
      (submission_id,match_id,series_code,submitter_id,submitter_name,home_score,away_score,status,source_channel,source_event_id,source_type,source_label,trust_level,evidence_ref,observation_kind,observed_result_id,observed_validation_status,observed_home_score,observed_away_score,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'SUBMITTED','telegram',?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(submissionId,match.match_id,seriesCode,actorId,displayName(actor),home,away,eventId,provenance.source_type,provenance.source_label,provenance.trust_level,null,kind,official?.result_id||null,official?.validation_status||null,official?.home_score??null,official?.away_score??null,now,now),
    env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?, 'SUBMITTED',?)`)
      .bind(eventId,'match.series.result.registered',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),reporter?.club_id||null,JSON.stringify({module:'RESULTS-REGISTER',submission_id:submissionId,series_code:seriesCode,home_score:home,away_score:away,observation_kind:kind,source_type:provenance.source_type,source_label:provenance.source_label}))
  ]);
  return {outcome:'SUBMITTED',status:'SUBMITTED',submission_id:submissionId,source_label:provenance.source_label};
}

async function applyOfficialPolicy(env,actor,ctx,match,seriesCode,home,away,updateId){
  const actorId=String(actor.id),role=ctx.role,current=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,seriesCode).first();
  const now=new Date().toISOString(),eventId=`rr-official-${actorId}-${updateId}-${sessionSafe(seriesCode)}`;
  const sourceType=role===ROLE.CLUB_ADMIN?'TELEGRAM_CLUB_ADMIN':role===ROLE.PLATFORM_OPERATOR?'PLATFORM_OPERATOR':'TELEGRAM_SUPER_ADMIN';
  const sourceLabel=role===ROLE.CLUB_ADMIN?`Telegram · dirigente ${ctx.reporter.club_id}`:role===ROLE.PLATFORM_OPERATOR?'Telegram · administrador del campeonato':'Telegram · administrador global';
  const reportId=`${match.match_id}:${seriesCode}:${actorId}`;
  const report=env.DB.prepare(`INSERT INTO series_reports (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'VERIFIED','telegram',?,?,?) ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,report_status='VERIFIED',source_event_id=excluded.source_event_id,updated_at=excluded.updated_at`)
    .bind(reportId,match.match_id,seriesCode,actorId,ctx.reporter?.club_id||null,home,away,eventId,now,now);
  if(!current){
    await env.DB.batch([
      report,
      env.DB.prepare(`INSERT INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version) VALUES (?,?,?,?,?,'VERIFIED',?,?,?,NULL,?,?,1)`)
        .bind(`${match.match_id}-${seriesCode}`,match.match_id,seriesCode,home,away,sourceType,sourceLabel,eventId,now,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,'VERIFIED',?)`)
        .bind(eventId,'match.series.result.registered',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),ctx.reporter?.club_id||null,JSON.stringify({module:'RESULTS-REGISTER',series_code:seriesCode,home_score:home,away_score:away,outcome:'FIRST_OFFICIAL',authorization:role}))
    ]);
    return {outcome:'FIRST_OFFICIAL',status:'VERIFIED'};
  }
  if(Number(current.home_score)===home&&Number(current.away_score)===away){
    await env.DB.batch([
      report,
      env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(eventId,'match.series.result.corroborated',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),ctx.reporter?.club_id||null,current.validation_status,JSON.stringify({module:'RESULTS-REGISTER',series_code:seriesCode,home_score:home,away_score:away,outcome:'CORROBORATED',authorization:role}))
    ]);
    return {outcome:'CORROBORATED',status:current.validation_status};
  }
  if(role!==ROLE.CLUB_ADMIN) return {outcome:'REQUIRES_GOVERNANCE',status:current.validation_status,current};
  const nextVersion=Number(current.governance_version||1)+1;
  await env.DB.batch([
    report,
    env.DB.prepare(`UPDATE match_series_results SET validation_status='DISPUTED',source_type='TELEGRAM_CLUB_ADMIN_CONFLICT',source_label='Conflicto entre aportes de dirigentes',source_ref=?,governance_version=?,updated_at=? WHERE result_id=?`).bind(eventId,nextVersion,now,current.result_id),
    env.DB.prepare(`INSERT OR IGNORE INTO match_series_result_versions (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at) VALUES (?,?,?,?,?,?,'DISPUTED','DISPUTE',?,'TELEGRAM_CLUB_ADMIN_CONFLICT','Conflicto entre aportes de dirigentes',?,?,?,'CLUB_ADMIN',?,?)`)
      .bind(`${match.match_id}:${seriesCode}:v${nextVersion}`,match.match_id,seriesCode,nextVersion,Number(current.home_score),Number(current.away_score),`club_admin_conflict:${ctx.reporter.club_id}:${home}-${away}`,eventId,current.played_on||null,actorId,ctx.reporter.club_id,now),
    env.DB.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,'DISPUTED',?)`)
      .bind(eventId,'match.series.result.conflicted',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),ctx.reporter.club_id,JSON.stringify({module:'RESULTS-REGISTER',series_code:seriesCode,official_score:[Number(current.home_score),Number(current.away_score)],reported_score:[home,away],outcome:'CONFLICT'}))
  ]);
  return {outcome:'CONFLICT',status:'DISPUTED',current};
}

async function showReceipt(env,chatId,match,seriesCode,home,away,outcome){
  let title='✅ RESULTADO RECIBIDO',detail='Quedó enviado para validación.';
  if(['FIRST_OFFICIAL','CORROBORATED'].includes(outcome.outcome)){title='✅ RESULTADO REGISTRADO';detail=outcome.outcome==='CORROBORATED'?'El marcador coincide con el resultado registrado.':'El resultado quedó registrado.';}
  else if(outcome.outcome==='CONFLICT'){title='⚠️ RESULTADO EN DISPUTA';detail=`El marcador informado no reemplazó el existente. Quedó marcado para revisión.`;}
  else if(outcome.outcome==='REQUIRES_GOVERNANCE'){title='⚠️ RESULTADO YA EXISTENTE';detail=`Existe un marcador distinto. No fue reemplazado; corresponde usar gobierno/corrección.`;}
  else if(outcome.outcome==='DUPLICATE_PENDING'){title='🕒 RESULTADO YA INFORMADO';detail=`Ya existe un aporte pendiente tuyo para esta serie. No se creó un duplicado.`;}
  else if(outcome.outcome==='PENDING_LIMIT'){title='⚠️ LÍMITE DE APORTES PENDIENTES';detail='Debes esperar revisión antes de enviar más aportes.';}
  await send(env,chatId,`${title}\n\n${match.home_name} ${home} — ${away} ${match.away_name}\n${SERIES_LABEL[seriesCode]} · ${match.round_label||`Fecha ${match.round_no}`}\n\n${detail}`,{inline_keyboard:[[{text:'📝 Registrar otro resultado',callback_data:'rr:dates'}],[{text:'📊 Ver resultados',callback_data:'tp:public-results'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
}

function validState(session,side){return session.state===(side==='HOME'?'HOME_SCORE':'AWAY_SCORE');}
async function sessionFor(db,actorId,n){return db.prepare('SELECT * FROM telegram_result_register_sessions WHERE telegram_user_id=? AND nonce=?').bind(actorId,n).first();}
async function setScore(db,actorId,n,side,score,state){const col=side==='HOME'?'home_score':'away_score';return db.prepare(`UPDATE telegram_result_register_sessions SET ${col}=?,state=?,updated_at=? WHERE telegram_user_id=? AND nonce=?`).bind(score,state,new Date().toISOString(),actorId,n).run();}
async function clearSession(db,actorId,n=null){return n?db.prepare('DELETE FROM telegram_result_register_sessions WHERE telegram_user_id=? AND nonce=?').bind(actorId,n).run():db.prepare('DELETE FROM telegram_result_register_sessions WHERE telegram_user_id=?').bind(actorId).run();}
async function stale(env,chatId,callback){if(callback)await answer(env,callback.id,'Acción vencida');await send(env,chatId,'⌛ Ese botón pertenece a una captura anterior. No se modificó ningún resultado.',{inline_keyboard:[[{text:'📝 Registrar resultado',callback_data:'rr:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});return json({ok:true,handled:'results_register_stale'});}
async function denyScope(env,chatId,callback){if(callback)await answer(env,callback.id,'Fuera de alcance');await send(env,chatId,'🔒 Ese partido no está disponible para tu autorización.');return json({ok:true,handled:'results_register_scope_denied'});}
function makeNonce(){return `${Date.now().toString(36)}${crypto.getRandomValues(new Uint16Array(1))[0].toString(36)}`.slice(-12);}
function sessionSafe(v){return String(v).replace(/[^A-Za-z0-9]/g,'').slice(0,16);}
function displayName(a){return [a?.first_name,a?.last_name].filter(Boolean).join(' ')||a?.username||String(a?.id||'Telegram');}
function homeKeyboard(){return {inline_keyboard:[[{text:'📝 Registrar resultado',callback_data:'rr:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]};}
async function answer(env,id,text){if(!id)return;await tg(env,'answerCallbackQuery',{callback_query_id:id,text}).catch(()=>{});}
async function send(env,chatId,text,replyMarkup){const body={chat_id:chatId,text};if(replyMarkup)body.reply_markup=replyMarkup;return tg(env,'sendMessage',body);}
async function tg(env,method,body){return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
