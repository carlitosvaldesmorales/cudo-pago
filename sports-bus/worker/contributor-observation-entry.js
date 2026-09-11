import { resolveObservationProvenance, getActivePartnerMembership } from './access-control.js';

const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const MAX_PENDING_PER_USER=8;
const COMPETITION_ID='ANFA-CHEPICA-2026';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleContributorObservationRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update.message;
  const callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;
  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const relevant=data==='tp:public-report'||data.startsWith('obs:')||/^\/informar(?:@\w+)?$/i.test(text);
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'observation_flow_not_configured'},503);

  const actorId=String(actor.id);
  await upsertIdentity(env.DB,actorId,actor);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  const partnerUi=!!(await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID));

  if(data==='tp:public-report'||data==='obs:dates'||/^\/informar(?:@\w+)?$/i.test(text)){
    await clearSession(env.DB,actorId);
    if(callback) await answer(env,callback.id,'Informar resultado');
    await showDates(env,chatId,partnerUi);
    return json({ok:true,handled:'observation_dates'});
  }

  if(data==='obs:cancel'){
    await clearSession(env.DB,actorId);
    await answer(env,callback.id,'Cancelado');
    const home=partnerUi?{text:'🎥 Chépica Play',callback_data:'mp:home'}:{text:'🌐 Público',callback_data:'tp:public'};
    await send(env,chatId,'Operación cancelada. No se guardó ninguna observación.',{inline_keyboard:[[home]]});
    return json({ok:true,handled:'observation_cancel'});
  }

  const dateCb=data.match(/^obs:date:(\d+)$/);
  if(dateCb){
    await clearSession(env.DB,actorId);
    const roundNo=Number(dateCb[1]);
    await answer(env,callback.id,`Fecha ${roundNo}`);
    await showRound(env,chatId,roundNo);
    return json({ok:true,handled:'observation_round',round_no:roundNo});
  }

  const matchCb=data.match(/^obs:match:([A-Za-z0-9._:-]+)$/);
  if(matchCb){
    await clearSession(env.DB,actorId);
    const match=await getMatch(env.DB,matchCb[1]);
    if(!match){
      await answer(env,callback.id,'Partido no válido');
      return json({ok:true,handled:'observation_invalid_match'});
    }
    await answer(env,callback.id,'Selecciona serie');
    await showSeries(env,chatId,match);
    return json({ok:true,handled:'observation_series',match_id:match.match_id});
  }

  const seriesCb=data.match(/^obs:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesCb){
    const [,matchId,seriesCode]=seriesCb;
    const match=await getMatch(env.DB,matchId);
    if(!match){
      await answer(env,callback.id,'Partido no válido');
      return json({ok:true,handled:'observation_invalid_match'});
    }
    const existing=await env.DB.prepare("SELECT submission_id,home_score,away_score FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED' LIMIT 1").bind(matchId,seriesCode,actorId).first();
    if(existing){
      await answer(env,callback.id,'Ya tienes un aporte pendiente');
      await send(env,chatId,`🕒 Ya tienes una observación pendiente para esta serie: ${existing.home_score}-${existing.away_score}.`,{inline_keyboard:[[{text:'🔎 Mis aportes',callback_data:'pr:my'}],[{text:'⬅️ Partido',callback_data:`obs:match:${matchId}`}]]});
      return json({ok:true,handled:'observation_duplicate_pending'});
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_public_result_sessions
      (telegram_user_id,chat_id,match_id,series_code,state,home_score,away_score,created_at,updated_at)
      VALUES (?,?,?,?, 'HOME_SCORE', NULL, NULL, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,state='HOME_SCORE',home_score=NULL,away_score=NULL,updated_at=excluded.updated_at`)
      .bind(actorId,String(chatId),matchId,seriesCode,now,now).run();
    await answer(env,callback.id,SERIES_LABEL[seriesCode]);
    await showScorePicker(env,chatId,match,seriesCode,'HOME');
    return json({ok:true,handled:'observation_home_score',match_id:matchId,series_code:seriesCode});
  }

  const directScore=data.match(/^obs:(h|a):(\d)$/);
  if(directScore){
    const side=directScore[1]==='h'?'HOME':'AWAY';
    const score=Number(directScore[2]);
    const session=await sessionFor(env.DB,actorId);
    if(!session||!validScoreState(session,side)) return stale(env,chatId,callback);
    await setScore(env.DB,actorId,side,score,side==='HOME'?'AWAY_SCORE':'CONFIRM');
    await answer(env,callback.id,String(score));
    const match=await getMatch(env.DB,session.match_id);
    if(side==='HOME') await showScorePicker(env,chatId,match,session.series_code,'AWAY',score);
    else await showConfirmation(env,chatId,actorId,reporter,partnerUi);
    return json({ok:true,handled:side==='HOME'?'observation_away_score':'observation_confirm'});
  }

  const highStart=data.match(/^obs:(h|a):more$/);
  if(highStart){
    const side=highStart[1]==='h'?'HOME':'AWAY';
    const session=await sessionFor(env.DB,actorId);
    if(!session||!validScoreState(session,side)) return stale(env,chatId,callback);
    await setScore(env.DB,actorId,side,8,side==='HOME'?'HOME_HIGH':'AWAY_HIGH');
    await answer(env,callback.id,'8+');
    await showHighStepper(env,chatId,actorId,side);
    return json({ok:true,handled:'observation_high_score'});
  }

  const highStep=data.match(/^obs:step:(h|a):(inc|dec|ok)$/);
  if(highStep){
    const side=highStep[1]==='h'?'HOME':'AWAY';
    const action=highStep[2];
    let session=await sessionFor(env.DB,actorId);
    const expected=side==='HOME'?'HOME_HIGH':'AWAY_HIGH';
    if(!session||session.state!==expected) return stale(env,chatId,callback);
    if(action==='inc'||action==='dec'){
      const current=Number(side==='HOME'?session.home_score:session.away_score)||8;
      const next=Math.max(8,Math.min(99,current+(action==='inc'?1:-1)));
      await setScore(env.DB,actorId,side,next,expected);
      await answer(env,callback.id,String(next));
      await showHighStepper(env,chatId,actorId,side);
      return json({ok:true,handled:'observation_high_score_adjust',score:next});
    }
    await env.DB.prepare('UPDATE telegram_public_result_sessions SET state=?,updated_at=? WHERE telegram_user_id=?').bind(side==='HOME'?'AWAY_SCORE':'CONFIRM',new Date().toISOString(),actorId).run();
    await answer(env,callback.id,'Listo');
    session=await sessionFor(env.DB,actorId);
    const match=await getMatch(env.DB,session.match_id);
    if(side==='HOME') await showScorePicker(env,chatId,match,session.series_code,'AWAY',Number(session.home_score));
    else await showConfirmation(env,chatId,actorId,reporter,partnerUi);
    return json({ok:true,handled:side==='HOME'?'observation_away_score':'observation_confirm'});
  }

  if(data==='obs:change'){
    const session=await sessionFor(env.DB,actorId);
    if(!session) return stale(env,chatId,callback);
    await env.DB.prepare("UPDATE telegram_public_result_sessions SET state='HOME_SCORE',home_score=NULL,away_score=NULL,updated_at=? WHERE telegram_user_id=?").bind(new Date().toISOString(),actorId).run();
    await answer(env,callback.id,'Cambiar marcador');
    const match=await getMatch(env.DB,session.match_id);
    await showScorePicker(env,chatId,match,session.series_code,'HOME');
    return json({ok:true,handled:'observation_change'});
  }

  if(data==='obs:confirm'){
    const session=await sessionFor(env.DB,actorId);
    if(!session||session.state!=='CONFIRM'||session.home_score===null||session.away_score===null) return stale(env,chatId,callback);
    const match=await getMatch(env.DB,session.match_id);
    if(!match||!SERIES.includes(session.series_code)) return stale(env,chatId,callback);

    const duplicate=await env.DB.prepare("SELECT submission_id FROM public_result_submissions WHERE match_id=? AND series_code=? AND submitter_id=? AND status='SUBMITTED' LIMIT 1").bind(match.match_id,session.series_code,actorId).first();
    if(duplicate){
      await clearSession(env.DB,actorId);
      await answer(env,callback.id,'Ya estaba pendiente');
      await send(env,chatId,'🕒 Ya existe una observación tuya pendiente para ese partido y serie. No se creó un duplicado.');
      return json({ok:true,handled:'observation_duplicate_pending'});
    }
    const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE submitter_id=? AND status='SUBMITTED'").bind(actorId).first();
    if(Number(pending?.n||0)>=MAX_PENDING_PER_USER){
      await clearSession(env.DB,actorId);
      await answer(env,callback.id,'Límite pendiente');
      await send(env,chatId,`⚠️ Ya tienes ${MAX_PENDING_PER_USER} observaciones pendientes. Espera su revisión antes de enviar más.`,{inline_keyboard:[[{text:'🔎 Mis aportes',callback_data:'pr:my'}]]});
      return json({ok:true,handled:'observation_pending_limit'});
    }

    const official=await env.DB.prepare('SELECT result_id,home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,session.series_code).first();
    const home=Number(session.home_score),away=Number(session.away_score);
    const observationKind=!official?'INITIAL':Number(official.home_score)===home&&Number(official.away_score)===away?'CORROBORATION':'DISCREPANCY';
    const provenance=await resolveObservationProvenance(env.DB,reporter,match);
    const now=new Date().toISOString();
    const submissionId=`obs-${actorId}-${update.update_id||Date.now()}`;
    const eventId=`observation-${submissionId}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO public_result_submissions
        (submission_id,match_id,series_code,submitter_id,submitter_name,home_score,away_score,status,source_channel,source_event_id,source_type,source_label,trust_level,evidence_ref,observation_kind,observed_result_id,observed_validation_status,observed_home_score,observed_away_score,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'SUBMITTED','telegram',?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(submissionId,match.match_id,session.series_code,actorId,displayName(actor),home,away,eventId,provenance.source_type,provenance.source_label,provenance.trust_level,null,observationKind,official?.result_id||null,official?.validation_status||null,official?.home_score??null,official?.away_score??null,now,now),
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'SUBMITTED',?)`)
        .bind(eventId,'match.series.result.observed',now,now,match.competition_id,match.season_id,match.match_id,actorId,displayName(actor),reporter?.club_id||null,JSON.stringify({submission_id:submissionId,series_code:session.series_code,home_score:home,away_score:away,observation_kind:observationKind,source_type:provenance.source_type,source_label:provenance.source_label,trust_level:provenance.trust_level,observed_result_id:official?.result_id||null})),
      env.DB.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId)
    ]);
    await answer(env,callback.id,'Información recibida');
    const context=observationKind==='INITIAL'
      ? 'Todavía no existe un resultado oficial para esta serie.'
      : observationKind==='CORROBORATION'
        ? `Tu información coincide con el resultado oficial actual (${official.home_score}-${official.away_score}).`
        : `Tu información difiere del resultado oficial actual (${official.home_score}-${official.away_score}). El oficial NO fue modificado.`;
    const homeButton=partnerUi?{text:'🎥 Chépica Play',callback_data:'mp:home'}:{text:'🌐 Público',callback_data:'tp:public'};
    await send(env,chatId,`✅ INFORMACIÓN RECIBIDA\n\n${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[session.series_code]}\n\n${context}\n\nOrigen registrado: ${provenance.source_label}\nEstado del aporte: PENDIENTE`,{inline_keyboard:[[{text:'🔎 Mis aportes',callback_data:'pr:my'}],[{text:'📣 Informar otro resultado',callback_data:'obs:dates'}],[homeButton]]});
    await notifyReviewers(env,match,submissionId,session.series_code,home,away,displayName(actor),observationKind,provenance.source_label);
    return json({ok:true,handled:'observation_submitted',submission_id:submissionId,observation_kind:observationKind,source_type:provenance.source_type});
  }

  return null;
}

async function showDates(env,chatId,partnerUi=false){
  const q=await env.DB.prepare("SELECT DISTINCT round_no,round_label FROM matches WHERE competition_id=? ORDER BY round_no").bind(COMPETITION_ID).all();
  const rows=(q.results||[]).map(r=>[{text:`⚽ ${r.round_label||'Fecha '+r.round_no}`,callback_data:`obs:date:${r.round_no}`}]);
  const home=partnerUi?{text:'🎥 Chépica Play',callback_data:'mp:home'}:{text:'🌐 Público',callback_data:'tp:public'};
  rows.push([home]);
  const text=partnerUi
    ? '🎥 CHÉPICA PLAY · REGISTRAR RESULTADO\n\nSelecciona la fecha. El marcador quedará identificado como un aporte de Chépica Play y no modifica automáticamente el resultado oficial.'
    : '📣 INFORMAR RESULTADO\n\nCualquier persona puede aportar información. Selecciona la fecha; el sistema te guiará sólo con opciones válidas.';
  await send(env,chatId,text,{inline_keyboard:rows});
}

async function showRound(env,chatId,roundNo){
  const q=await env.DB.prepare("SELECT match_id,group_id,round_no,round_label,home_name,away_name FROM matches WHERE competition_id=? AND round_no=? ORDER BY group_id,match_id").bind(COMPETITION_ID,roundNo).all();
  const rows=(q.results||[]).map(m=>[{text:`Grupo ${m.group_id} · ${m.home_name} — ${m.away_name}`,callback_data:`obs:match:${m.match_id}`}]);
  rows.push([{text:'⬅️ Fechas',callback_data:'obs:dates'}]);
  await send(env,chatId,`📅 Fecha ${roundNo}\n\nSelecciona el partido:`,{inline_keyboard:rows});
}

async function showSeries(env,chatId,match){
  const q=await env.DB.prepare('SELECT series_code,home_score,away_score,validation_status FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const current=new Map((q.results||[]).map(r=>[r.series_code,r]));
  const rows=SERIES.map(code=>{
    const r=current.get(code);
    const label=r?`✅ ${SERIES_LABEL[code]} · ${r.home_score}-${r.away_score} · informar`:`➕ ${SERIES_LABEL[code]} · sin resultado`;
    return [{text:label,callback_data:`obs:series:${match.match_id}:${code}`}];
  });
  rows.push([{text:`⬅️ ${match.round_label||'Fecha'}`,callback_data:`obs:date:${match.round_no}`}]);
  await send(env,chatId,`🏟 ${match.home_name} — ${match.away_name}\n${match.round_label} · Grupo ${match.group_id}\n\nSelecciona la serie. Incluso si ya existe un resultado oficial puedes informar un marcador; tu aporte nunca lo sobrescribe.`,{inline_keyboard:rows});
}

function scoreKeyboard(side){
  const p=side==='HOME'?'h':'a';
  return {inline_keyboard:[
    [0,1,2,3].map(n=>({text:String(n),callback_data:`obs:${p}:${n}`})),
    [4,5,6,7].map(n=>({text:String(n),callback_data:`obs:${p}:${n}`})),
    [{text:'8+',callback_data:`obs:${p}:more`}],
    [{text:'❌ Cancelar',callback_data:'obs:cancel'}]
  ]};
}

async function showScorePicker(env,chatId,match,seriesCode,side,homeScore=null){
  const team=side==='HOME'?match.home_name:match.away_name;
  const prefix=side==='AWAY'&&homeScore!==null?`Marcador parcial: ${match.home_name} ${homeScore}–? ${match.away_name}\n\n`:'';
  await send(env,chatId,`⚽ ${SERIES_LABEL[seriesCode]}\n${match.home_name} — ${match.away_name}\n\n${prefix}¿Cuántos goles hizo ${team}?`,scoreKeyboard(side));
}

async function showHighStepper(env,chatId,actorId,side){
  const session=await sessionFor(env.DB,actorId);
  const score=Number(side==='HOME'?session?.home_score:session?.away_score)||8;
  const p=side==='HOME'?'h':'a';
  await send(env,chatId,`⚽ Marcador alto: ${score}\n\nAjusta con los botones y confirma.`,{inline_keyboard:[
    [{text:'➖',callback_data:`obs:step:${p}:dec`},{text:String(score),callback_data:`obs:step:${p}:ok`},{text:'➕',callback_data:`obs:step:${p}:inc`}],
    [{text:'✅ Usar este valor',callback_data:`obs:step:${p}:ok`}],
    [{text:'❌ Cancelar',callback_data:'obs:cancel'}]
  ]});
}

async function showConfirmation(env,chatId,actorId,reporter,partnerUi=false){
  const session=await sessionFor(env.DB,actorId);
  if(!session) return;
  const match=await getMatch(env.DB,session.match_id);
  if(!match) return;
  const official=await env.DB.prepare('SELECT home_score,away_score,validation_status FROM match_series_results WHERE match_id=? AND series_code=?').bind(match.match_id,session.series_code).first();
  const provenance=await resolveObservationProvenance(env.DB,reporter,match);
  const comparison=official?`\nResultado oficial actual: ${official.home_score}-${official.away_score}`:'\nAún no existe resultado oficial.';
  const origin=partnerUi?`\nOrigen: ${provenance.source_label}\nEste aporte no reemplaza automáticamente el resultado oficial.`:`\nOrigen: ${provenance.source_label}`;
  await send(env,chatId,`🧾 CONFIRMAR RESULTADO\n\n${match.round_label} · Grupo ${match.group_id} · ${SERIES_LABEL[session.series_code]}\n${match.home_name} ${session.home_score}–${session.away_score} ${match.away_name}${comparison}${origin}\n\n¿Confirmas que el marcador ingresado es correcto?`,{inline_keyboard:[
    [{text:'✅ Confirmar',callback_data:'obs:confirm'}],
    [{text:'✏️ Cambiar marcador',callback_data:'obs:change'}],
    [{text:'❌ Cancelar',callback_data:'obs:cancel'}]
  ]});
}

async function notifyReviewers(env,match,submissionId,seriesCode,home,away,submitterName,kind,sourceLabel){
  const q=await env.DB.prepare(`SELECT telegram_user_id,role,club_id FROM reporters
    WHERE active=1 AND trust_level='VERIFIED' AND (
      role IN ('SUPER_ADMIN','PLATFORM_OPERATOR') OR
      (role='CLUB_ADMIN' AND (club_id=? OR club_id=?))
    )`).bind(match.home_id,match.away_id).all();
  const seen=new Set();
  for(const r of q.results||[]){
    const id=String(r.telegram_user_id);
    if(seen.has(id)) continue;
    seen.add(id);
    const note=kind==='DISCREPANCY'?'⚠️ Difiere del resultado oficial actual.':kind==='CORROBORATION'?'✅ Corrobora el resultado oficial actual.':'🟡 Aún no hay resultado oficial.';
    await send(env,id,`📣 NUEVA OBSERVACIÓN\n\n${match.home_name} ${home}-${away} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\nInformado por: ${submitterName}\nOrigen: ${sourceLabel}\n${note}\n\nEl aporte no modifica por sí solo el estado canónico.`,{inline_keyboard:[[{text:'🧾 Revisar aporte',callback_data:`pr:review:${submissionId}`}],[{text:'🛡 Gobierno de resultados',callback_data:'rg:list'}]]});
  }
}

async function upsertIdentity(db,actorId,actor){
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`)
    .bind(actorId,displayName(actor),actor.username||null,now,now).run();
}

async function sessionFor(db,actorId){return db.prepare('SELECT * FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).first();}
async function clearSession(db,actorId){await db.prepare('DELETE FROM telegram_public_result_sessions WHERE telegram_user_id=?').bind(actorId).run();}
async function setScore(db,actorId,side,score,state){
  const col=side==='HOME'?'home_score':'away_score';
  await db.prepare(`UPDATE telegram_public_result_sessions SET ${col}=?,state=?,updated_at=? WHERE telegram_user_id=?`).bind(score,state,new Date().toISOString(),actorId).run();
}
function validScoreState(session,side){return session.state===(side==='HOME'?'HOME_SCORE':'AWAY_SCORE');}
async function getMatch(db,matchId){return db.prepare(`SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name FROM matches WHERE match_id=?`).bind(matchId).first();}
function displayName(actor){return [actor?.first_name,actor?.last_name].filter(Boolean).join(' ').trim()||actor?.username||String(actor?.id||'Usuario Telegram');}

async function stale(env,chatId,callback){
  if(callback) await answer(env,callback.id,'Sesión vencida');
  await send(env,chatId,'⚠️ Esa selección ya no está activa. Vuelve a iniciar el aporte.',{inline_keyboard:[[{text:'📣 Informar resultado',callback_data:'obs:dates'}]]});
  return json({ok:true,handled:'observation_stale_session'});
}
async function answer(env,id,text){if(!id)return;await telegram(env,'answerCallbackQuery',{callback_query_id:id,text:String(text).slice(0,180)});}
async function send(env,chatId,text,replyMarkup=null){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await telegram(env,'sendMessage',body);
}
async function telegram(env,method,body){return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
