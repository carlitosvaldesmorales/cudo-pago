import { CAPABILITY, getActivePartnerMembership, hasScopedCapability } from './access-control.js';

const COMPETITION_ID='ANFA-CHEPICA-2026';
const PARTNER_NAME='Chépica Play';
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleMediaPartnerLiveEventRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update; try{update=await request.clone().json();}catch{return null;}
  const callback=update.callback_query,actor=callback?.from,chatId=callback?.message?.chat?.id,data=String(callback?.data||'');
  if(!data.startsWith('mplive:')||!actor?.id||!chatId) return null;
  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=? AND active=1').bind(actorId).first();
  const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
  if(!reporter||!membership) return deny(env,chatId,callback,'Tu cuenta no está vinculada como corresponsal activo.');

  const eventMenu=data.match(/^mplive:event:([A-Za-z0-9._:-]+)$/);
  if(eventMenu){
    const gate=await liveGate(env.DB,reporter,membership,eventMenu[1]);
    if(!gate.ok) return staleOrDenied(env,chatId,callback,gate.reason);
    await answer(env,callback.id,'Selecciona serie');
    await send(env,chatId,`⚽ REGISTRAR GOL · ${PARTNER_NAME}\n\n${gate.match.round_label} · ${gate.match.home_name} — ${gate.match.away_name}\n\nSelecciona la serie.`,{inline_keyboard:[[{text:'3ª',callback_data:`mplive:series:${gate.match.match_id}:TERCERA`},{text:'2ª',callback_data:`mplive:series:${gate.match.match_id}:SEGUNDA`}],[{text:'Senior',callback_data:`mplive:series:${gate.match.match_id}:SENIOR`},{text:'1ª',callback_data:`mplive:series:${gate.match.match_id}:PRIMERA`}],[{text:'⬅️ Cobertura',callback_data:`mp:coverage-open:${gate.match.match_id}`}]]});
    return json({ok:true,handled:'media_partner_live_series',match_id:gate.match.match_id});
  }

  const series=data.match(/^mplive:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(series){
    const [,matchId,seriesCode]=series,gate=await liveGate(env.DB,reporter,membership,matchId);
    if(!gate.ok) return staleOrDenied(env,chatId,callback,gate.reason);
    await answer(env,callback.id,SERIES_LABEL[seriesCode]);
    await send(env,chatId,`⚽ ${SERIES_LABEL[seriesCode]} · ¿Para qué equipo fue el gol?\n\n${gate.match.home_name} — ${gate.match.away_name}`,{inline_keyboard:[[{text:`⚽ ${short(gate.match.home_name)}`,callback_data:`mplive:evt:${matchId}:${seriesCode}:GOAL:HOME`}],[{text:`⚽ ${short(gate.match.away_name)}`,callback_data:`mplive:evt:${matchId}:${seriesCode}:GOAL:AWAY`}],[{text:'⬅️ Series',callback_data:`mplive:event:${matchId}`}]]});
    return json({ok:true,handled:'media_partner_live_goal_teams',match_id:matchId,series_code:seriesCode});
  }

  const unsupported=data.match(/^mplive:evt:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA):([A-Z_]+):(HOME|AWAY)$/);
  if(unsupported&&unsupported[3]!=='GOAL'){
    await answer(env,callback.id,'Fuera del alcance');
    await send(env,chatId,'ℹ️ Por ahora Chépica Play sólo registra goles en vivo. Este evento no fue guardado.');
    return json({ok:true,handled:'media_partner_live_event_unsupported'});
  }

  const event=data.match(/^mplive:evt:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA):GOAL:(HOME|AWAY)$/);
  if(!event) return null;
  const [,matchId,seriesCode,side]=event,gate=await liveGate(env.DB,reporter,membership,matchId);
  if(!gate.ok) return staleOrDenied(env,chatId,callback,gate.reason);
  const now=new Date().toISOString(),eventId=`mp-live-${String(callback.id||`${actorId}-${Date.now()}`)}`;
  const clubId=side==='HOME'?gate.match.home_id:gate.match.away_id,clubName=side==='HOME'?gate.match.home_name:gate.match.away_name;
  const payload={series_code:seriesCode,event_kind:'GOAL',side,club_name:clubName,source_type:'MEDIA_PARTNER',source_label:`${membership.source_label||PARTNER_NAME} · transmisión`,trust_level:membership.trust_level||'VERIFIED',partner_code:membership.partner_code,coverage_id:gate.assignment.coverage_id,assignment_id:gate.assignment.assignment_id,correspondent_actor_id:actorId,canonical:false,source_channel:'telegram'};
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,'match.event.observed',?,?,?,?,?,?,?,?,'PROVISIONAL',?)`).bind(eventId,now,now,gate.match.competition_id,gate.match.season_id||null,matchId,actorId,reporter.display_name||actorId,clubId,JSON.stringify(payload)).run();
  const inserted=Number(result?.meta?.changes??result?.changes??1)>0;
  const score=await observedScore(env.DB,membership.partner_code,matchId,seriesCode);
  await answer(env,callback.id,inserted?'Gol registrado':'Gol ya recibido');
  await send(env,chatId,`${inserted?'✅':'↩️'} ⚽ ${SERIES_LABEL[seriesCode]} · ${clubName}\n\nMarcador observado Chépica Play: ${gate.match.home_name} ${score.home}–${score.away} ${gate.match.away_name}\nCorresponsal: ${reporter.display_name||actorId}\n\nNo modifica automáticamente el resultado oficial.`,{inline_keyboard:[[{text:'⚽ Otro gol',callback_data:`mplive:series:${matchId}:${seriesCode}`}],[{text:'📊 Concentrador',callback_data:'mp:hub'}],[{text:'⬅️ Cobertura',callback_data:`mp:coverage-open:${matchId}`}]]});
  return json({ok:true,handled:inserted?'media_partner_live_goal_recorded':'media_partner_live_goal_duplicate',event_id:eventId,match_id:matchId,series_code:seriesCode,side,observed_score:score});
}

async function liveGate(db,reporter,membership,matchId){
  const match=await getMatch(db,matchId); if(!match||match.competition_id!==COMPETITION_ID) return {ok:false,reason:'match_out_of_scope'};
  const assignment=await getAssignmentAnyStatus(db,membership.partner_code,matchId,reporter.telegram_user_id);
  if(!assignment) return {ok:false,reason:'correspondent_not_assigned'};
  if(assignment.coverage_status!=='LIVE') return {ok:false,reason:'coverage_not_live'};
  if(!(await hasScopedCapability(db,reporter,CAPABILITY.PUBLISH_MATCH_EVENT,match))) return {ok:false,reason:'publish_event_not_allowed'};
  return {ok:true,match,assignment};
}
async function getAssignmentAnyStatus(db,partnerCode,matchId,actorId){return db.prepare(`SELECT a.*,c.status coverage_status FROM partner_coverage_assignments a JOIN partner_match_coverages c ON c.coverage_id=a.coverage_id WHERE a.partner_code=? AND a.telegram_user_id=? AND a.status='ACTIVE' AND c.partner_code=? AND c.match_id=? LIMIT 1`).bind(String(partnerCode),String(actorId),String(partnerCode),String(matchId)).first();}
async function observedScore(db,partnerCode,matchId,seriesCode){const q=await db.prepare("SELECT payload_json FROM events WHERE match_id=? AND event_type='match.event.observed'").bind(matchId).all();let home=0,away=0;for(const e of q.results||[]){let p;try{p=JSON.parse(e.payload_json||'{}')}catch{continue}if(p.partner_code===partnerCode&&p.event_kind==='GOAL'&&p.series_code===seriesCode){if(p.side==='HOME')home++;if(p.side==='AWAY')away++;}}return {home,away};}
async function getMatch(db,matchId){return db.prepare('SELECT match_id,competition_id,season_id,round_label,group_id,home_id,away_id,home_name,away_name FROM matches WHERE match_id=?').bind(matchId).first();}
function short(v){const s=String(v||'Equipo');return s.length<=24?s:`${s.slice(0,21)}…`;}
async function staleOrDenied(env,chatId,callback,reason){await answer(env,callback.id,'Acción no disponible');const text=reason==='coverage_not_live'?'⚠️ La cobertura ya no está EN VIVO.':reason==='correspondent_not_assigned'?'🔒 Eres miembro de Chépica Play, pero no estás asignado como corresponsal a este partido.':'🔒 Sin alcance para registrar goles en este partido.';await send(env,chatId,text,{inline_keyboard:[[{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],[{text:'📊 Concentrador',callback_data:'mp:hub'}]]});return json({ok:true,handled:reason==='coverage_not_live'?'media_partner_live_stale_callback':'media_partner_live_out_of_scope',reason});}
async function deny(env,chatId,callback,text){if(callback?.id)await answer(env,callback.id,'No autorizado');await send(env,chatId,`🔒 ${text}`);return json({ok:true,handled:'media_partner_live_denied'});}
async function send(env,chatId,text,replyMarkup=null){const body={chat_id:chatId,text};if(replyMarkup)body.reply_markup=replyMarkup;const res=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return res.json();}
async function answer(env,id,text){if(!id)return;await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});}
