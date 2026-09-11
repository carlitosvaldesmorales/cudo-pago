import { CAPABILITY, getActivePartnerMembership, hasScopedCapability } from './access-control.js';

const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_NAME='Chépica Play';
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const EVENT_LABEL={GOAL:'⚽ Gol'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// MEDIA-PARTNER-LIVE-MOFPLUS-01
// Thin vertical slice: persistent partner -> assigned coverage -> LIVE -> goal observation.
// Goals are observations with provenance, never canonical result mutations.
export async function handleMediaPartnerLiveEventRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  const callback=update.callback_query;
  const actor=callback?.from;
  const chatId=callback?.message?.chat?.id;
  const data=String(callback?.data||'');
  const relevant=/^mp:coverage-(open|live|close):/.test(data)||data.startsWith('mplive:');
  if(!relevant) return null;
  if(!actor?.id||!chatId) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'media_partner_live_not_configured'},503);

  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=? AND active=1').bind(actorId).first();
  const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
  if(!reporter||!membership) return deny(env,chatId,callback,'Tu cuenta no está vinculada como colaborador activo.');

  const workspace=data.match(/^mp:coverage-open:([A-Za-z0-9._:-]+)$/);
  if(workspace){
    const match=await getMatch(env.DB,workspace[1]);
    const coverage=await getCoverage(env.DB,membership.partner_code,workspace[1]);
    if(!match||!coverage||coverage.status==='CANCELLED') return deny(env,chatId,callback,'Cobertura no disponible.');
    await answer(env,callback.id,'Cobertura');
    await showWorkspace(env,chatId,match,coverage);
    return json({ok:true,handled:'media_partner_live_workspace',match_id:match.match_id,status:coverage.status});
  }

  const coverageState=data.match(/^mp:coverage-(live|close):([A-Za-z0-9._:-]+)$/);
  if(coverageState){
    const action=coverageState[1],matchId=coverageState[2];
    const match=await getMatch(env.DB,matchId);
    const coverage=await getCoverage(env.DB,membership.partner_code,matchId);
    if(!match||!coverage||coverage.status==='CANCELLED') return deny(env,chatId,callback,'Cobertura no disponible.');
    const now=new Date().toISOString();
    if(action==='live'){
      await env.DB.prepare("UPDATE partner_match_coverages SET status='LIVE',started_at=COALESCE(started_at,?),ended_at=NULL,updated_at=? WHERE coverage_id=? AND status IN ('ASSIGNED','CLOSED')")
        .bind(now,now,coverage.coverage_id).run();
      await answer(env,callback.id,'Cobertura en vivo');
    }else{
      await env.DB.prepare("UPDATE partner_match_coverages SET status='CLOSED',ended_at=?,updated_at=? WHERE coverage_id=? AND status IN ('ASSIGNED','LIVE')")
        .bind(now,now,coverage.coverage_id).run();
      await answer(env,callback.id,'Cobertura finalizada');
    }
    const fresh=await getCoverage(env.DB,membership.partner_code,matchId);
    await showWorkspace(env,chatId,match,fresh);
    return json({ok:true,handled:action==='live'?'media_partner_live_started':'media_partner_live_closed',match_id:matchId,status:fresh?.status});
  }

  const eventMenu=data.match(/^mplive:event:([A-Za-z0-9._:-]+)$/);
  if(eventMenu){
    const gate=await liveGate(env.DB,reporter,membership,eventMenu[1]);
    if(!gate.ok) return staleOrDenied(env,chatId,callback,gate.reason);
    await answer(env,callback.id,'Selecciona serie');
    await send(env,chatId,`⚽ REGISTRAR GOL · ${PARTNER_NAME}\n\n${gate.match.round_label} · ${gate.match.home_name} — ${gate.match.away_name}\n\nSelecciona la serie del gol.`,{
      inline_keyboard:[
        [{text:'3ª',callback_data:`mplive:series:${gate.match.match_id}:TERCERA`},{text:'2ª',callback_data:`mplive:series:${gate.match.match_id}:SEGUNDA`}],
        [{text:'Senior',callback_data:`mplive:series:${gate.match.match_id}:SENIOR`},{text:'1ª',callback_data:`mplive:series:${gate.match.match_id}:PRIMERA`}],
        [{text:'⬅️ Cobertura',callback_data:`mp:coverage-open:${gate.match.match_id}`}]
      ]
    });
    return json({ok:true,handled:'media_partner_live_series',match_id:gate.match.match_id});
  }

  const seriesMenu=data.match(/^mplive:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesMenu){
    const [,matchId,seriesCode]=seriesMenu;
    const gate=await liveGate(env.DB,reporter,membership,matchId);
    if(!gate.ok) return staleOrDenied(env,chatId,callback,gate.reason);
    await answer(env,callback.id,SERIES_LABEL[seriesCode]);
    await showGoalTeams(env,chatId,gate.match,seriesCode);
    return json({ok:true,handled:'media_partner_live_goal_teams',match_id:matchId,series_code:seriesCode});
  }

  const unsupported=data.match(/^mplive:evt:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA):([A-Z_]+):(HOME|AWAY)$/);
  if(unsupported&&unsupported[3]!=='GOAL'){
    const [,matchId,seriesCode,eventKind]=unsupported;
    await answer(env,callback.id,'Evento fuera del alcance actual');
    await send(env,chatId,`ℹ️ Por ahora Chépica Play sólo registra goles en vivo.\n\nEl evento ${eventKind} no fue guardado.`,{
      inline_keyboard:[
        [{text:'⚽ Registrar gol',callback_data:`mplive:series:${matchId}:${seriesCode}`}],
        [{text:'⬅️ Cobertura',callback_data:`mp:coverage-open:${matchId}`}]
      ]
    });
    return json({ok:true,handled:'media_partner_live_event_unsupported',match_id:matchId,series_code:seriesCode,event_kind:eventKind});
  }

  const event=data.match(/^mplive:evt:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA):GOAL:(HOME|AWAY)$/);
  if(event){
    const [,matchId,seriesCode,side]=event;
    const gate=await liveGate(env.DB,reporter,membership,matchId);
    if(!gate.ok) return staleOrDenied(env,chatId,callback,gate.reason);
    const now=new Date().toISOString();
    const callbackId=String(callback.id||`${actorId}-${Date.now()}`);
    const eventId=`mp-live-${callbackId}`;
    const clubId=side==='HOME'?gate.match.home_id:gate.match.away_id;
    const clubName=side==='HOME'?gate.match.home_name:gate.match.away_name;
    const payload={
      series_code:seriesCode,
      event_kind:'GOAL',
      side,
      club_name:clubName,
      source_type:'MEDIA_PARTNER',
      source_label:`${membership.source_label||PARTNER_NAME} · transmisión`,
      trust_level:membership.trust_level||'VERIFIED',
      partner_code:membership.partner_code,
      coverage_id:gate.coverage.coverage_id,
      canonical:false,
      source_channel:'telegram'
    };
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO events
      (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
      VALUES (?,'match.event.observed',?,?,?,?,?,?,?,?,'PROVISIONAL',?)`)
      .bind(eventId,now,now,gate.match.competition_id,gate.match.season_id||null,gate.match.match_id,actorId,reporter.display_name||actor.username||actorId,clubId,JSON.stringify(payload)).run();
    const inserted=Number(result?.meta?.changes??result?.changes??1)>0;
    await answer(env,callback.id,inserted?'Gol registrado':'Gol ya recibido');
    await send(env,chatId,`${inserted?'✅':'↩️'} ${EVENT_LABEL.GOAL} · ${SERIES_LABEL[seriesCode]}\n${clubName}\n\n${inserted?'Registrado como observación de Chépica Play.':'Este mismo callback ya había sido procesado; no se duplicó el gol.'}\nNo modifica automáticamente el resultado oficial.`,{
      inline_keyboard:[
        [{text:'⚽ Otro gol',callback_data:`mplive:series:${matchId}:${seriesCode}`}],
        [{text:'📣 Informar resultado',callback_data:`obs:match:${matchId}`}],
        [{text:'⬅️ Cobertura',callback_data:`mp:coverage-open:${matchId}`}]
      ]
    });
    return json({ok:true,handled:inserted?'media_partner_live_goal_recorded':'media_partner_live_goal_duplicate',event_id:eventId,match_id:matchId,series_code:seriesCode,event_kind:'GOAL',side});
  }

  return null;
}

async function liveGate(db,reporter,membership,matchId){
  const match=await getMatch(db,matchId);
  if(!match||match.competition_id!==COMPETITION_ID) return {ok:false,reason:'match_out_of_scope'};
  const coverage=await getCoverage(db,membership.partner_code,matchId);
  if(!coverage||coverage.status!=='LIVE') return {ok:false,reason:'coverage_not_live'};
  const allowed=await hasScopedCapability(db,reporter,CAPABILITY.PUBLISH_MATCH_EVENT,match);
  if(!allowed) return {ok:false,reason:'publish_event_not_allowed'};
  return {ok:true,match,coverage};
}

async function showWorkspace(env,chatId,match,coverage){
  const rows=[];
  if(coverage.status==='ASSIGNED'||coverage.status==='CLOSED') rows.push([{text:'🔴 Iniciar cobertura',callback_data:`mp:coverage-live:${match.match_id}`}]);
  if(coverage.status==='ASSIGNED'||coverage.status==='LIVE') rows.push([{text:'📣 Informar resultado',callback_data:`obs:match:${match.match_id}`}]);
  if(coverage.status==='LIVE') rows.push([{text:'⚽ Registrar gol',callback_data:`mplive:event:${match.match_id}`}]);
  if(coverage.status==='LIVE') rows.push([{text:'🏁 Finalizar cobertura',callback_data:`mp:coverage-close:${match.match_id}`}]);
  rows.push([{text:'⚽ Resultados verificados',callback_data:'tp:public-results'}]);
  rows.push([{text:'⬅️ Mis coberturas',callback_data:'mp:mycoverages'}]);
  await send(env,chatId,`🎥 COBERTURA · ${PARTNER_NAME}\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\nEstado cobertura: ${coverage.status}\n\nCONSUME: resultados y datos públicos del campeonato.\nCONTRIBUYE: marcador y goles mientras esta cobertura está activa.\n\nLos aportes quedan trazados como observaciones de ${PARTNER_NAME}; no sobrescriben automáticamente el estado canónico.`,{inline_keyboard:rows});
}

async function showGoalTeams(env,chatId,match,seriesCode){
  await send(env,chatId,`⚽ ${SERIES_LABEL[seriesCode]} · ¿Para qué equipo fue el gol?\n\n${match.home_name} — ${match.away_name}`,{
    inline_keyboard:[
      [{text:`⚽ ${short(match.home_name)}`,callback_data:`mplive:evt:${match.match_id}:${seriesCode}:GOAL:HOME`}],
      [{text:`⚽ ${short(match.away_name)}`,callback_data:`mplive:evt:${match.match_id}:${seriesCode}:GOAL:AWAY`}],
      [{text:'⬅️ Series',callback_data:`mplive:event:${match.match_id}`}]
    ]
  });
}

async function getMatch(db,matchId){return db.prepare('SELECT match_id,competition_id,season_id,round_label,group_id,home_id,away_id,home_name,away_name FROM matches WHERE match_id=?').bind(matchId).first();}
async function getCoverage(db,partnerCode,matchId){return db.prepare('SELECT * FROM partner_match_coverages WHERE partner_code=? AND match_id=? LIMIT 1').bind(partnerCode,matchId).first();}
function short(value){const s=String(value||'Equipo');return s.length<=24?s:`${s.slice(0,21)}…`;}

async function staleOrDenied(env,chatId,callback,reason){
  await answer(env,callback.id,'Acción no disponible');
  const text=reason==='coverage_not_live'
    ? '⚠️ Este botón ya no corresponde al estado actual. Los goles sólo pueden registrarse mientras la cobertura está EN VIVO.'
    : '🔒 Esta identidad no tiene alcance para registrar goles en este partido.';
  await send(env,chatId,text,{inline_keyboard:[[{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
  return json({ok:true,handled:reason==='coverage_not_live'?'media_partner_live_stale_callback':'media_partner_live_out_of_scope',reason});
}

async function deny(env,chatId,callback,text){if(callback?.id) await answer(env,callback.id,'No autorizado');await send(env,chatId,`🔒 ${text}`);return json({ok:true,handled:'media_partner_live_denied'});}
async function send(env,chatId,text,replyMarkup=null){const body={chat_id:chatId,text};if(replyMarkup) body.reply_markup=replyMarkup;const res=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return res.json();}
async function answer(env,id,text){if(!id) return;await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});}
