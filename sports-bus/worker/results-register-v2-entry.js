import { ROLE, effectiveRole, getActivePartnerMembership } from './access-control.js';
import { publishRoundSnapshots } from './results-stream-entry.js';
import { applyResultsRegisterPolicy, outcomeNotice } from './results-register-policy.js';

const COMPETITION_ID='ANFA-CHEPICA-2026';
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleResultsRegisterRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update.message;
  const callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const actorId=String(actor.id);
  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const surface=callback?.message?.message_id||null;
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
    await render(env,chatId,surface,'🔒 Tu acceso de dirigente no está activo. No puedes registrar resultados con esa autorización.',homeKeyboard());
    return json({ok:true,handled:'results_register_actor_denied'});
  }

  if(entry){
    await clearSession(env.DB,actorId);
    if(callback) await answer(env,callback.id,'Registrar resultado');
    await showDates(env,chatId,context,surface);
    return json({ok:true,handled:'results_register_dates'});
  }

  if(data==='rr:cancel-menu'){
    await clearSession(env.DB,actorId);
    await answer(env,callback.id,'Carga cerrada');
    await render(env,chatId,surface,'✅ Carga cerrada.\n\nLos resultados que ya confirmaste permanecen guardados.',homeKeyboard());
    return json({ok:true,handled:'results_register_cancel'});
  }

  const dateCb=data.match(/^rr:date:(\d+)$/);
  if(dateCb){
    await clearSession(env.DB,actorId);
    const roundNo=Number(dateCb[1]);
    await answer(env,callback.id,`Fecha ${roundNo}`);
    await showRound(env,chatId,context,roundNo,surface);
    return json({ok:true,handled:'results_register_round',round_no:roundNo});
  }

  const matchCb=data.match(/^rr:match:([A-Za-z0-9._:-]+)$/);
  if(matchCb){
    await clearSession(env.DB,actorId);
    const match=await scopedMatch(env.DB,context,matchCb[1]);
    if(!match) return denyScope(env,chatId,callback,surface);
    await answer(env,callback.id,'Partido');
    await showMatchDashboard(env,chatId,context,actorId,match,surface);
    return json({ok:true,handled:'results_register_match_dashboard',match_id:match.match_id});
  }

  const finishCb=data.match(/^rr:finish:([A-Za-z0-9._:-]+)$/);
  if(finishCb){
    const match=await scopedMatch(env.DB,context,finishCb[1]);
    if(!match) return denyScope(env,chatId,callback,surface);
    await clearSession(env.DB,actorId);
    await answer(env,callback.id,'Partido listo');
    await showRound(env,chatId,context,Number(match.round_no),surface,`✅ Terminaste la carga de ${match.home_name} — ${match.away_name}.`);
    return json({ok:true,handled:'results_register_match_finished',match_id:match.match_id});
  }

  const statusCb=data.match(/^rr:status:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(statusCb){
    const [,matchId,seriesCode]=statusCb;
    const match=await scopedMatch(env.DB,context,matchId);
    if(!match) return denyScope(env,chatId,callback,surface);
    await answer(env,callback.id,`${SERIES_LABEL[seriesCode]} ya fue informada`);
    await showMatchDashboard(env,chatId,context,actorId,match,surface);
    return json({ok:true,handled:'results_register_series_status'});
  }

  const existsCb=data.match(/^rr:exists:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(existsCb){
    const [,matchId,seriesCode]=existsCb;
    const match=await scopedMatch(env.DB,context,matchId);
    if(!match) return denyScope(env,chatId,callback,surface);
    await answer(env,callback.id,`${SERIES_LABEL[seriesCode]} ya tiene resultado`);
    await showMatchDashboard(env,chatId,context,actorId,match,surface);
    return json({ok:true,handled:'results_register_existing_guard'});
  }

  const seriesCb=data.match(/^rr:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesCb){
    const [,matchId,seriesCode]=seriesCb;
    const match=await scopedMatch(env.DB,context,matchId);
    if(!match) return denyScope(env,chatId,callback,surface);
    if(context.officialAuthority){
      const current=await env.DB.prepare('SELECT result_id FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first();
      if(current){
        await answer(env,callback.id,'Ya registrado');
        await showMatchDashboard(env,chatId,context,actorId,match,surface);
        return json({ok:true,handled:'results_register_existing_guard'});
      }
    }
    const n=makeNonce();
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_result_register_sessions
      (telegram_user_id,chat_id,match_id,series_code,state,home_score,away_score,nonce,revision,created_at,updated_at)
      VALUES (?,?,?,?, 'HOME_SCORE',NULL,NULL,?,1,?,?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='HOME_SCORE',home_score=NULL,away_score=NULL,nonce=excluded.nonce,revision=telegram_result_register_sessions.revision+1,updated_at=excluded.updated_at`)
      .bind(actorId,String(chatId),matchId,seriesCode,n,now,now).run();
    await answer(env,callback.id,SERIES_LABEL[seriesCode]);
    await showScorePicker(env,chatId,surface,match,seriesCode,'HOME',n,null);
    return json({ok:true,handled:'results_register_home_score',match_id:matchId,series_code:seriesCode});
  }

  const scoreCb=data.match(/^rr:(h|a):([A-Za-z0-9_-]{6,24}):(\d)$/);
  if(scoreCb){
    const side=scoreCb[1]==='h'?'HOME':'AWAY';
    const n=scoreCb[2];
    const score=Number(scoreCb[3]);
    const session=await sessionFor(env.DB,actorId,n);
    if(!session||!validState(session,side)) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    await setScore(env.DB,actorId,n,side,score,side==='HOME'?'AWAY_SCORE':'CONFIRM');
    await answer(env,callback.id,String(score));
    if(side==='HOME') await showScorePicker(env,chatId,surface,match,session.series_code,'AWAY',n,score);
    else await showConfirmation(env,chatId,surface,match,session.series_code,n,Number(session.home_score),score);
    return json({ok:true,handled:side==='HOME'?'results_register_away_score':'results_register_confirm'});
  }

  const highStart=data.match(/^rr:(h|a):([A-Za-z0-9_-]{6,24}):more$/);
  if(highStart){
    const side=highStart[1]==='h'?'HOME':'AWAY';
    const n=highStart[2];
    const session=await sessionFor(env.DB,actorId,n);
    if(!session||!validState(session,side)) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    await setScore(env.DB,actorId,n,side,8,side==='HOME'?'HOME_HIGH':'AWAY_HIGH');
    await answer(env,callback.id,'8+');
    await showHighStepper(env,chatId,surface,match,session,n,side);
    return json({ok:true,handled:'results_register_high_score'});
  }

  const highStep=data.match(/^rr:step:([A-Za-z0-9_-]{6,24}):(h|a):(inc|dec|ok)$/);
  if(highStep){
    const n=highStep[1];
    const side=highStep[2]==='h'?'HOME':'AWAY';
    const action=highStep[3];
    let session=await sessionFor(env.DB,actorId,n);
    const expected=side==='HOME'?'HOME_HIGH':'AWAY_HIGH';
    if(!session||session.state!==expected) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    if(action==='inc'||action==='dec'){
      const current=Number(side==='HOME'?session.home_score:session.away_score)||8;
      const next=Math.max(8,Math.min(99,current+(action==='inc'?1:-1)));
      await setScore(env.DB,actorId,n,side,next,expected);
      session=await sessionFor(env.DB,actorId,n);
      await answer(env,callback.id,String(next));
      await showHighStepper(env,chatId,surface,match,session,n,side);
      return json({ok:true,handled:'results_register_high_adjust',score:next});
    }
    await env.DB.prepare('UPDATE telegram_result_register_sessions SET state=?,updated_at=? WHERE telegram_user_id=? AND nonce=? AND state=?')
      .bind(side==='HOME'?'AWAY_SCORE':'CONFIRM',new Date().toISOString(),actorId,n,expected).run();
    session=await sessionFor(env.DB,actorId,n);
    if(!session) return stale(env,callback);
    await answer(env,callback.id,'Listo');
    if(side==='HOME') await showScorePicker(env,chatId,surface,match,session.series_code,'AWAY',n,Number(session.home_score));
    else await showConfirmation(env,chatId,surface,match,session.series_code,n,Number(session.home_score),Number(session.away_score));
    return json({ok:true,handled:side==='HOME'?'results_register_away_score':'results_register_confirm'});
  }

  const backHome=data.match(/^rr:back-home:([A-Za-z0-9_-]{6,24})$/);
  if(backHome){
    const n=backHome[1];
    const session=await sessionFor(env.DB,actorId,n);
    if(!session) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='HOME_SCORE',home_score=NULL,away_score=NULL,updated_at=? WHERE telegram_user_id=? AND nonce=?")
      .bind(new Date().toISOString(),actorId,n).run();
    await answer(env,callback.id,'Goles local');
    await showScorePicker(env,chatId,surface,match,session.series_code,'HOME',n,null);
    return json({ok:true,handled:'results_register_back_home'});
  }

  const backSeries=data.match(/^rr:back-series:([A-Za-z0-9_-]{6,24})$/);
  if(backSeries){
    const n=backSeries[1];
    const session=await sessionFor(env.DB,actorId,n);
    if(!session) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    await clearSession(env.DB,actorId,n);
    await answer(env,callback.id,'Partido');
    await showMatchDashboard(env,chatId,context,actorId,match,surface,'↩️ Serie sin cambios.');
    return json({ok:true,handled:'results_register_back_match'});
  }

  const changeCb=data.match(/^rr:change:([A-Za-z0-9_-]{6,24})$/);
  if(changeCb){
    const n=changeCb[1];
    const session=await sessionFor(env.DB,actorId,n);
    if(!session||session.state!=='CONFIRM') return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='HOME_SCORE',home_score=NULL,away_score=NULL,updated_at=? WHERE telegram_user_id=? AND nonce=? AND state='CONFIRM'")
      .bind(new Date().toISOString(),actorId,n).run();
    await answer(env,callback.id,'Cambiar marcador');
    await showScorePicker(env,chatId,surface,match,session.series_code,'HOME',n,null);
    return json({ok:true,handled:'results_register_change'});
  }

  const cancelCb=data.match(/^rr:cancel:([A-Za-z0-9_-]{6,24})$/);
  if(cancelCb){
    const n=cancelCb[1];
    const session=await sessionFor(env.DB,actorId,n);
    if(!session) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    await clearSession(env.DB,actorId,n);
    await answer(env,callback.id,'Serie cancelada');
    if(!match) return stale(env,callback);
    await showMatchDashboard(env,chatId,context,actorId,match,surface,'↩️ Serie cancelada. Los resultados ya guardados no cambiaron.');
    return json({ok:true,handled:'results_register_series_cancel'});
  }

  const confirmCb=data.match(/^rr:confirm:([A-Za-z0-9_-]{6,24})$/);
  if(confirmCb){
    const n=confirmCb[1];
    const session=await sessionFor(env.DB,actorId,n);
    if(!session||session.state!=='CONFIRM'||session.home_score===null||session.away_score===null) return stale(env,callback);
    const match=await scopedMatch(env.DB,context,session.match_id);
    if(!match) return stale(env,callback);
    const claim=await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='APPLYING',updated_at=? WHERE telegram_user_id=? AND nonce=? AND state='CONFIRM'")
      .bind(new Date().toISOString(),actorId,n).run();
    if(Number(claim?.meta?.changes??claim?.changes??0)!==1) return stale(env,callback);
    await answer(env,callback.id,'Guardando');
    try{
      const outcome=await applyResultsRegisterPolicy(env,actor,context,match,session,update.update_id||Date.now());
      await clearSession(env.DB,actorId,n);
      await publishRoundSnapshots(env,match.round_no,{module:'RESULTS-REGISTER',outcome:outcome.outcome,match_id:match.match_id,series_code:session.series_code}).catch(()=>{});
      await showMatchDashboard(env,chatId,context,actorId,match,surface,outcomeNotice(outcome));
      return json({ok:true,handled:'results_register_applied',outcome:outcome.outcome,status:outcome.status,submission_id:outcome.submission_id||null,match_id:match.match_id,series_code:session.series_code});
    }catch(error){
      await env.DB.prepare("UPDATE telegram_result_register_sessions SET state='CONFIRM',updated_at=? WHERE telegram_user_id=? AND nonce=? AND state='APPLYING'")
        .bind(new Date().toISOString(),actorId,n).run().catch(()=>{});
      await showConfirmation(env,chatId,surface,match,session.series_code,n,Number(session.home_score),Number(session.away_score),'⚠️ No pude guardar. Puedes volver a confirmar; no se duplicó ninguna mutación.');
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

async function showDates(env,chatId,ctx,messageId=null){
  const q=ctx.scopeClub
    ? await env.DB.prepare(`SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id=? AND (home_id=? OR away_id=?) ORDER BY round_no`).bind(COMPETITION_ID,ctx.scopeClub,ctx.scopeClub).all()
    : await env.DB.prepare('SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id=? ORDER BY round_no').bind(COMPETITION_ID).all();
  const rounds=q.results||[];
  rounds.sort((a,b)=>Number(a.round_no===3?-1000:a.round_no)-Number(b.round_no===3?-1000:b.round_no));
  const rows=rounds.map(r=>[{text:`⚽ ${r.round_label||`Fecha ${r.round_no}`}`,callback_data:`rr:date:${r.round_no}`}]);
  rows.push([{text:'🏠 Inicio',callback_data:'tp:home'}]);
  await render(env,chatId,messageId,'📝 REGISTRAR RESULTADOS\n\nSelecciona la fecha:',{inline_keyboard:rows});
}

async function showRound(env,chatId,ctx,roundNo,messageId=null,notice=null){
  const q=ctx.scopeClub
    ? await env.DB.prepare(`SELECT * FROM matches WHERE competition_id=? AND round_no=? AND (home_id=? OR away_id=?) ORDER BY group_id,match_id`).bind(COMPETITION_ID,roundNo,ctx.scopeClub,ctx.scopeClub).all()
    : await env.DB.prepare('SELECT * FROM matches WHERE competition_id=? AND round_no=? ORDER BY group_id,match_id').bind(COMPETITION_ID,roundNo).all();
  const rows=(q.results||[]).map(m=>[{text:`${m.home_name} — ${m.away_name}`,callback_data:`rr:match:${m.match_id}`}]);
  rows.push([{text:'⬅️ Fechas',callback_data:'rr:dates'}],[{text:'❌ Salir',callback_data:'rr:cancel-menu'}]);
  const head=notice?`${notice}\n\n`:'';
  await render(env,chatId,messageId,`${head}📅 FECHA ${roundNo}\n\nSelecciona el partido que vas a completar:`,{inline_keyboard:rows});
}

async function showMatchDashboard(env,chatId,ctx,actorId,match,messageId=null,notice=null){
  const officialQ=await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const pendingQ=await env.DB.prepare("SELECT series_code,home_score,away_score,status FROM public_result_submissions WHERE match_id=? AND submitter_id=? AND status='SUBMITTED'").bind(match.match_id,actorId).all();
  const official=new Map((officialQ.results||[]).map(r=>[r.series_code,r]));
  const pending=new Map((pendingQ.results||[]).map(r=>[r.series_code,r]));
  const lines=[];
  const buttons=[];
  let complete=0;

  for(const code of SERIES){
    const own=pending.get(code);
    const off=official.get(code);
    if(own){
      complete++;
      lines.push(`🕒 ${SERIES_LABEL[code]}   ${own.home_score} — ${own.away_score}   INFORMADO`);
      buttons.push({text:`🕒 ${SERIES_LABEL[code]} ${own.home_score}-${own.away_score}`,callback_data:`rr:status:${match.match_id}:${code}`});
      continue;
    }
    if(off){
      complete++;
      const verified=off.validation_status==='VERIFIED';
      lines.push(`${verified?'✅':'⚠️'} ${SERIES_LABEL[code]}   ${off.home_score} — ${off.away_score}   ${verified?'OFICIAL':'EN REVISIÓN'}`);
      buttons.push({text:`${verified?'✅':'⚠️'} ${SERIES_LABEL[code]} ${off.home_score}-${off.away_score}`,callback_data:ctx.officialAuthority?`rr:exists:${match.match_id}:${code}`:`rr:series:${match.match_id}:${code}`});
      continue;
    }
    lines.push(`▫️ ${SERIES_LABEL[code]}   — — —`);
    buttons.push({text:`✏️ ${SERIES_LABEL[code]}`,callback_data:`rr:series:${match.match_id}:${code}`});
  }

  const rows=[[buttons[0],buttons[1]],[buttons[2],buttons[3]]];
  rows.push([{text:'✅ Terminar carga del partido',callback_data:`rr:finish:${match.match_id}`}]);
  rows.push([{text:`⬅️ ${match.round_label||`Fecha ${match.round_no}`}`,callback_data:`rr:date:${match.round_no}`}],[{text:'❌ Salir',callback_data:'rr:cancel-menu'}]);
  const prefix=notice?`${notice}\n\n`:'';
  const text=`${prefix}⚽ ${match.round_label||`Fecha ${match.round_no}`}\n${match.home_name} — ${match.away_name}\n\nRESULTADOS DEL PARTIDO · ${complete}/4 con dato\n\n${lines.join('\n')}\n\nSelecciona una serie para completar o revisar.`;
  await render(env,chatId,messageId,text,{inline_keyboard:rows});
}

async function showScorePicker(env,chatId,messageId,match,seriesCode,side,n,homeScore){
  const isHome=side==='HOME';
  const name=isHome?match.home_name:match.away_name;
  const prefix=isHome?'h':'a';
  const buttons=[[0,1,2,3],[4,5,6,7]].map(xs=>xs.map(v=>({text:String(v),callback_data:`rr:${prefix}:${n}:${v}`})));
  buttons.push([{text:'8+',callback_data:`rr:${prefix}:${n}:more`}]);
  buttons.push([{text:isHome?'⬅️ Partido':'⬅️ Local',callback_data:isHome?`rr:back-series:${n}`:`rr:back-home:${n}`}],[{text:'❌ Cancelar serie',callback_data:`rr:cancel:${n}`}]);
  const marker=isHome?`${match.home_name} ? — ? ${match.away_name}`:`${match.home_name} ${homeScore} — ? ${match.away_name}`;
  const text=`⚽ ${match.home_name} — ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\n\n${isHome?'🏠':'🚗'} Goles de ${name}\n\nMarcador: ${marker}`;
  await render(env,chatId,messageId,text,{inline_keyboard:buttons});
}

async function showHighStepper(env,chatId,messageId,match,session,n,side){
  const score=Number(side==='HOME'?session.home_score:session.away_score)||8;
  const prefix=side==='HOME'?'h':'a';
  const name=side==='HOME'?match.home_name:match.away_name;
  const text=`⚽ ${match.home_name} — ${match.away_name}\nSerie: ${SERIES_LABEL[session.series_code]}\n\nGoles de ${name}: ${score}`;
  await render(env,chatId,messageId,text,{inline_keyboard:[
    [{text:'➖',callback_data:`rr:step:${n}:${prefix}:dec`},{text:'➕',callback_data:`rr:step:${n}:${prefix}:inc`}],
    [{text:`✅ Usar ${score}`,callback_data:`rr:step:${n}:${prefix}:ok`}],
    [{text:'❌ Cancelar serie',callback_data:`rr:cancel:${n}`}]
  ]});
}

async function showConfirmation(env,chatId,messageId,match,seriesCode,n,home,away,notice=null){
  const prefix=notice?`${notice}\n\n`:'';
  await render(env,chatId,messageId,`${prefix}🧾 CONFIRMAR SERIE\n\n${match.round_label||`Fecha ${match.round_no}`} · ${SERIES_LABEL[seriesCode]}\n${match.home_name} ${home} — ${away} ${match.away_name}\n\n¿El marcador es correcto?`,{inline_keyboard:[
    [{text:'✅ Guardar serie',callback_data:`rr:confirm:${n}`}],
    [{text:'✏️ Cambiar marcador',callback_data:`rr:change:${n}`}],
    [{text:'❌ Cancelar serie',callback_data:`rr:cancel:${n}`}]
  ]});
}

function validState(session,side){return session.state===(side==='HOME'?'HOME_SCORE':'AWAY_SCORE');}
async function sessionFor(db,actorId,n){return db.prepare('SELECT * FROM telegram_result_register_sessions WHERE telegram_user_id=? AND nonce=?').bind(actorId,n).first();}
async function setScore(db,actorId,n,side,score,state){const col=side==='HOME'?'home_score':'away_score';return db.prepare(`UPDATE telegram_result_register_sessions SET ${col}=?,state=?,updated_at=? WHERE telegram_user_id=? AND nonce=?`).bind(score,state,new Date().toISOString(),actorId,n).run();}
async function clearSession(db,actorId,n=null){return n?db.prepare('DELETE FROM telegram_result_register_sessions WHERE telegram_user_id=? AND nonce=?').bind(actorId,n).run():db.prepare('DELETE FROM telegram_result_register_sessions WHERE telegram_user_id=?').bind(actorId).run();}
async function stale(env,callback){if(callback)await answer(env,callback.id,'Acción vencida. El estado no cambió.');return json({ok:true,handled:'results_register_stale'});}
async function denyScope(env,chatId,callback,messageId){if(callback)await answer(env,callback.id,'Fuera de alcance');await render(env,chatId,messageId,'🔒 Ese partido no está disponible para tu autorización.',homeKeyboard());return json({ok:true,handled:'results_register_scope_denied'});}
function makeNonce(){return `${Date.now().toString(36)}${crypto.getRandomValues(new Uint16Array(1))[0].toString(36)}`.slice(-12);}
function homeKeyboard(){return {inline_keyboard:[[{text:'📝 Registrar resultados',callback_data:'rr:dates'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]};}

async function answer(env,id,text){if(!id)return;await tg(env,'answerCallbackQuery',{callback_query_id:id,text}).catch(()=>{});}
async function render(env,chatId,messageId,text,replyMarkup){
  if(messageId){
    const body={chat_id:chatId,message_id:messageId,text};
    if(replyMarkup) body.reply_markup=replyMarkup;
    const edited=await tg(env,'editMessageText',body).catch(()=>null);
    if(edited?.ok||/message is not modified/i.test(String(edited?.description||''))) return edited;
  }
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  return tg(env,'sendMessage',body);
}
async function tg(env,method,body){
  const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  let payload=null;
  try{payload=await response.json();}catch{payload={ok:response.ok};}
  return payload;
}
