import { CAPABILITY, hasCapability } from './access-control.js';

const COMPETITION_ID='ANFA-CHEPICA-2026';
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const CARD_LABEL={SECOND_YELLOW:'🟨🟨 Doble amarilla',DIRECT_RED:'🟥 Roja directa',OTHER_EXPULSION:'⚠️ Otra expulsión'};
const CARD_CODE={Y2:'SECOND_YELLOW',DR:'DIRECT_RED',OTH:'OTHER_EXPULSION'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export async function handleMatchDisciplineRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update?.message;
  const callback=update?.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const actorId=String(actor.id);
  const data=String(callback?.data||'');
  const text=String(message?.text||'').trim();
  const session=await activeSession(env.DB,actorId);
  const relevant=data.startsWith('disc:')||!!session;
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'discipline_not_configured'},503);

  if(session&&message&&text.startsWith('/')){
    await clearSession(env.DB,actorId);
    return null;
  }

  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!canPublishDiscipline(reporter)){
    if(callback) await answer(env,callback.id,'No autorizado');
    await send(env,chatId,'🔒 El registro disciplinario canónico requiere autorización de administrador global.');
    if(session) await clearSession(env.DB,actorId);
    return json({ok:true,handled:'match_discipline_denied',permission_change:false});
  }

  if(data==='disc:list'){
    if(callback) await answer(env,callback.id,'Registro disciplinario');
    await showGlobalList(env,chatId,callback?.message?.message_id||null);
    return json({ok:true,handled:'match_discipline_list'});
  }

  const matchCb=data.match(/^disc:match:([A-Za-z0-9._:-]+)$/);
  if(matchCb){
    const match=await getMatch(env.DB,matchCb[1]);
    if(!match) return missingMatch(env,chatId,callback);
    await clearSession(env.DB,actorId);
    if(callback) await answer(env,callback.id,'Expulsados');
    await showMatch(env,chatId,match,callback?.message?.message_id||null);
    return json({ok:true,handled:'match_discipline_match',match_id:match.match_id});
  }

  const addCb=data.match(/^disc:add:([A-Za-z0-9._:-]+)$/);
  if(addCb){
    const match=await getMatch(env.DB,addCb[1]);
    if(!match) return missingMatch(env,chatId,callback);
    await clearSession(env.DB,actorId);
    await answer(env,callback.id,'Registrar expulsado');
    await showSeriesPicker(env,chatId,match,callback?.message?.message_id||null);
    return json({ok:true,handled:'match_discipline_series_picker',match_id:match.match_id});
  }

  const seriesCb=data.match(/^disc:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesCb){
    const match=await getMatch(env.DB,seriesCb[1]);
    if(!match) return missingMatch(env,chatId,callback);
    await answer(env,callback.id,SERIES_LABEL[seriesCb[2]]);
    await showTeamPicker(env,chatId,match,seriesCb[2],callback?.message?.message_id||null);
    return json({ok:true,handled:'match_discipline_team_picker',match_id:match.match_id,series_code:seriesCb[2]});
  }

  const teamCb=data.match(/^disc:team:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA):(H|A)$/);
  if(teamCb){
    const [,matchId,seriesCode,side]=teamCb;
    const match=await getMatch(env.DB,matchId);
    if(!match) return missingMatch(env,chatId,callback);
    const teamId=side==='H'?match.home_id:match.away_id;
    const teamName=side==='H'?match.home_name:match.away_name;
    const nonce=makeToken('dxs');
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_discipline_sessions
      (telegram_user_id,chat_id,match_id,series_code,team_id,state,participant_name,participant_name_key,card_type,nonce,revision,created_at,updated_at)
      VALUES (?,?,?,?,?,'AWAIT_NAME',NULL,NULL,NULL,?,1,?,?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET
        chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,team_id=excluded.team_id,
        state='AWAIT_NAME',participant_name=NULL,participant_name_key=NULL,card_type=NULL,nonce=excluded.nonce,
        revision=telegram_discipline_sessions.revision+1,updated_at=excluded.updated_at`)
      .bind(actorId,String(chatId),matchId,seriesCode,teamId,nonce,now,now).run();
    await answer(env,callback.id,teamName);
    await present(env,chatId,callback?.message?.message_id||null,
      `🟥 REGISTRAR EXPULSADO\n\n${match.round_label} · ${SERIES_LABEL[seriesCode]}\n${match.home_name} — ${match.away_name}\nClub: ${teamName}\n\nEscribe el nombre del jugador expulsado.\n\nSe registrará el hecho disciplinario. No se aplicarán automáticamente fechas de suspensión, multas ni cambios de tabla.`,
      {inline_keyboard:[[{text:'❌ Cancelar',callback_data:`disc:cancel:${nonce}`}]]});
    return json({ok:true,handled:'match_discipline_wait_name',match_id:matchId,series_code:seriesCode,team_id:teamId});
  }

  if(message&&session?.state==='AWAIT_NAME'){
    const name=normalizeParticipantName(text);
    if(!name){
      await send(env,chatId,'⚠️ Escribe un nombre válido de 2 a 80 caracteres. No se guardó nada.');
      return json({ok:true,handled:'match_discipline_invalid_name'});
    }
    const key=participantKey(name);
    const existing=await env.DB.prepare(`SELECT incident_id FROM match_disciplinary_incidents
      WHERE match_id=? AND series_code=? AND team_id=? AND participant_name_key=? AND incident_status='ACTIVE' LIMIT 1`)
      .bind(session.match_id,session.series_code,session.team_id,key).first();
    if(existing){
      const match=await getMatch(env.DB,session.match_id);
      await clearSession(env.DB,actorId);
      await send(env,chatId,`ℹ️ ${name} ya figura como expulsado en este partido, serie y club. No se duplicó el registro.`,
        {inline_keyboard:[[{text:'⬅️ Expulsados del partido',callback_data:`disc:match:${match.match_id}`}]]});
      return json({ok:true,handled:'match_discipline_duplicate_guard',incident_id:existing.incident_id});
    }
    await env.DB.prepare(`UPDATE telegram_discipline_sessions
      SET participant_name=?,participant_name_key=?,state='AWAIT_CARD',updated_at=?
      WHERE telegram_user_id=? AND nonce=? AND state='AWAIT_NAME'`)
      .bind(name,key,new Date().toISOString(),actorId,session.nonce).run();
    const fresh=await activeSession(env.DB,actorId);
    const match=await getMatch(env.DB,fresh.match_id);
    const teamName=teamNameFor(match,fresh.team_id);
    await send(env,chatId,
      `🟥 TIPO DE EXPULSIÓN\n\nJugador: ${name}\nClub: ${teamName}\nSerie: ${SERIES_LABEL[fresh.series_code]}\n\nSelecciona cómo fue expulsado:`,
      {inline_keyboard:[
        [{text:'🟥 Roja directa',callback_data:`disc:card:${fresh.nonce}:DR`}],
        [{text:'🟨🟨 Doble amarilla',callback_data:`disc:card:${fresh.nonce}:Y2`}],
        [{text:'⚠️ Otra expulsión',callback_data:`disc:card:${fresh.nonce}:OTH`}],
        [{text:'❌ Cancelar',callback_data:`disc:cancel:${fresh.nonce}`}]
      ]});
    return json({ok:true,handled:'match_discipline_card_picker'});
  }

  const cardCb=data.match(/^disc:card:([A-Za-z0-9_-]{6,32}):(DR|Y2|OTH)$/);
  if(cardCb){
    const s=await sessionByNonce(env.DB,actorId,cardCb[1]);
    if(!s||s.state!=='AWAIT_CARD'||!s.participant_name) return stale(env,callback);
    const cardType=CARD_CODE[cardCb[2]];
    await env.DB.prepare(`UPDATE telegram_discipline_sessions SET card_type=?,state='CONFIRM',updated_at=?
      WHERE telegram_user_id=? AND nonce=? AND state='AWAIT_CARD'`)
      .bind(cardType,new Date().toISOString(),actorId,s.nonce).run();
    await answer(env,callback.id,CARD_LABEL[cardType]);
    const fresh=await sessionByNonce(env.DB,actorId,s.nonce);
    const match=await getMatch(env.DB,fresh.match_id);
    await showConfirmation(env,chatId,callback?.message?.message_id||null,match,fresh);
    return json({ok:true,handled:'match_discipline_confirm'});
  }

  const cancelCb=data.match(/^disc:cancel:([A-Za-z0-9_-]{6,32})$/);
  if(cancelCb){
    const s=await sessionByNonce(env.DB,actorId,cancelCb[1]);
    if(!s) return stale(env,callback);
    const match=await getMatch(env.DB,s.match_id);
    await clearSession(env.DB,actorId);
    await answer(env,callback.id,'Cancelado');
    if(match) await showMatch(env,chatId,match,callback?.message?.message_id||null,'↩️ Registro cancelado. No se guardó ninguna expulsión.');
    return json({ok:true,handled:'match_discipline_cancelled'});
  }

  const confirmCb=data.match(/^disc:confirm:([A-Za-z0-9_-]{6,32})$/);
  if(confirmCb){
    const s=await sessionByNonce(env.DB,actorId,confirmCb[1]);
    if(!s||s.state!=='CONFIRM'||!s.participant_name||!s.participant_name_key||!s.card_type) return stale(env,callback);
    const match=await getMatch(env.DB,s.match_id);
    if(!match) return missingMatch(env,chatId,callback);
    const existing=await env.DB.prepare(`SELECT incident_id FROM match_disciplinary_incidents
      WHERE match_id=? AND series_code=? AND team_id=? AND participant_name_key=? AND incident_status='ACTIVE' LIMIT 1`)
      .bind(s.match_id,s.series_code,s.team_id,s.participant_name_key).first();
    if(existing){
      await clearSession(env.DB,actorId);
      await answer(env,callback.id,'Ya registrado');
      await showMatch(env,chatId,match,callback?.message?.message_id||null,'ℹ️ Ese jugador ya figuraba como expulsado. No se duplicó el registro.');
      return json({ok:true,handled:'match_discipline_duplicate_guard',incident_id:existing.incident_id});
    }

    const claim=await env.DB.prepare(`UPDATE telegram_discipline_sessions SET state='APPLYING',updated_at=?
      WHERE telegram_user_id=? AND nonce=? AND state='CONFIRM'`)
      .bind(new Date().toISOString(),actorId,s.nonce).run();
    if(Number(claim?.meta?.changes??claim?.changes??0)!==1) return stale(env,callback);

    const now=new Date().toISOString();
    const incidentId=makeToken('exp');
    const eventId=`${incidentId}:event`;
    const teamName=teamNameFor(match,s.team_id);
    const sourceLabel='Telegram · administrador global';
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO match_disciplinary_incidents
          (incident_id,competition_id,season_id,match_id,series_code,team_id,team_name,participant_name,participant_name_key,
           incident_kind,card_type,incident_status,sanction_state,actor_id,actor_role,source_type,source_label,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,'EXPULSION',?,'ACTIVE','RECORDED_PENDING_RULE_DECISION',?,?,'TELEGRAM_SUPER_ADMIN',?,?,?)`)
          .bind(incidentId,match.competition_id,match.season_id,match.match_id,s.series_code,s.team_id,teamName,
            s.participant_name,s.participant_name_key,s.card_type,actorId,reporter.role,sourceLabel,now,now),
        env.DB.prepare(`INSERT OR REPLACE INTO events
          (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'VERIFIED',?)`)
          .bind(eventId,'match.player.expelled',now,now,match.competition_id,match.season_id,match.match_id,actorId,
            reporter.display_name||actor.first_name||actorId,reporter.club_id||null,
            JSON.stringify({incident_id:incidentId,series_code:s.series_code,team_id:s.team_id,team_name:teamName,
              participant_name:s.participant_name,card_type:s.card_type,incident_kind:'EXPULSION',
              sanction_state:'RECORDED_PENDING_RULE_DECISION',automatic_consequence_applied:false})),
        env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
          (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
          VALUES (?,?,?,?, 'REGISTER_MATCH_EXPULSION','match_disciplinary_incident',?,1,'super_admin_recorded_match_expulsion',?)`)
          .bind(`${incidentId}:audit`,actorId,reporter.role,reporter.club_id||null,incidentId,now),
        env.DB.prepare('DELETE FROM telegram_discipline_sessions WHERE telegram_user_id=?').bind(actorId)
      ]);
    }catch(error){
      console.error('match_discipline_apply_failed',error);
      await env.DB.prepare(`UPDATE telegram_discipline_sessions SET state='CONFIRM',updated_at=?
        WHERE telegram_user_id=? AND nonce=? AND state='APPLYING'`).bind(new Date().toISOString(),actorId,s.nonce).run().catch(()=>{});
      await showConfirmation(env,chatId,callback?.message?.message_id||null,match,s,'⚠️ No pude guardar. Puedes volver a confirmar; no se duplicó ninguna mutación.');
      return json({ok:false,error:'match_discipline_apply_failed'},500);
    }
    await answer(env,callback.id,'Expulsión registrada');
    await showMatch(env,chatId,match,callback?.message?.message_id||null,
      `✅ Expulsión registrada: ${s.participant_name} · ${teamName} · ${CARD_LABEL[s.card_type]}.\nNo se aplicó automáticamente ninguna sanción reglamentaria.`);
    return json({ok:true,handled:'match_discipline_applied',incident_id:incidentId,match_id:match.match_id,series_code:s.series_code});
  }

  const itemCb=data.match(/^disc:item:(exp-[A-Za-z0-9_-]{6,40})$/);
  if(itemCb){
    const incident=await getIncident(env.DB,itemCb[1]);
    if(!incident){
      await answer(env,callback.id,'No encontrado');
      await showGlobalList(env,chatId,callback?.message?.message_id||null);
      return json({ok:true,handled:'match_discipline_incident_missing'});
    }
    const match=await getMatch(env.DB,incident.match_id);
    await answer(env,callback.id,'Detalle');
    await showIncident(env,chatId,callback?.message?.message_id||null,incident,match);
    return json({ok:true,handled:'match_discipline_incident_detail',incident_id:incident.incident_id});
  }

  const voidConfirm=data.match(/^disc:void-confirm:(exp-[A-Za-z0-9_-]{6,40})$/);
  if(voidConfirm){
    const incident=await getIncident(env.DB,voidConfirm[1]);
    if(!incident||incident.incident_status!=='ACTIVE') return stale(env,callback);
    const match=await getMatch(env.DB,incident.match_id);
    await answer(env,callback.id,'Confirmar anulación');
    await present(env,chatId,callback?.message?.message_id||null,
      `⚠️ ANULAR REGISTRO DE EXPULSIÓN\n\n${incident.participant_name} · ${incident.team_name}\n${match?.round_label||incident.match_id} · ${SERIES_LABEL[incident.series_code]}\n${CARD_LABEL[incident.card_type]}\n\nSe conservará el historial y la auditoría; el registro quedará marcado como ANULADO.`,
      {inline_keyboard:[
        [{text:'🚫 Sí, anular registro',callback_data:`disc:void:${incident.incident_id}`}],
        [{text:'⬅️ Cancelar',callback_data:`disc:item:${incident.incident_id}`}]
      ]});
    return json({ok:true,handled:'match_discipline_void_confirmation'});
  }

  const voidCb=data.match(/^disc:void:(exp-[A-Za-z0-9_-]{6,40})$/);
  if(voidCb){
    const incident=await getIncident(env.DB,voidCb[1]);
    if(!incident||incident.incident_status!=='ACTIVE') return stale(env,callback);
    const now=new Date().toISOString();
    const eventId=`${incident.incident_id}:void:${Date.now().toString(36)}`;
    const changed=await env.DB.prepare(`UPDATE match_disciplinary_incidents
      SET incident_status='VOID',voided_at=?,voided_by=?,void_reason='super_admin_voided_incorrect_record',updated_at=?
      WHERE incident_id=? AND incident_status='ACTIVE'`)
      .bind(now,actorId,now,incident.incident_id).run();
    if(Number(changed?.meta?.changes??changed?.changes??0)!==1) return stale(env,callback);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR REPLACE INTO events
        (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'VERIFIED',?)`)
        .bind(eventId,'match.player.expulsion.voided',now,now,incident.competition_id,incident.season_id,incident.match_id,actorId,
          reporter.display_name||actor.first_name||actorId,reporter.club_id||null,
          JSON.stringify({incident_id:incident.incident_id,participant_name:incident.participant_name,team_id:incident.team_id,
            series_code:incident.series_code,previous_status:'ACTIVE',status:'VOID'})),
      env.DB.prepare(`INSERT OR REPLACE INTO permission_audit
        (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
        VALUES (?,?,?,?, 'VOID_MATCH_EXPULSION','match_disciplinary_incident',?,1,'super_admin_voided_incorrect_expulsion_record',?)`)
        .bind(`${eventId}:audit`,actorId,reporter.role,reporter.club_id||null,incident.incident_id,now)
    ]);
    const match=await getMatch(env.DB,incident.match_id);
    await answer(env,callback.id,'Registro anulado');
    await showMatch(env,chatId,match,callback?.message?.message_id||null,`🚫 Registro de ${incident.participant_name} anulado. El historial quedó preservado.`);
    return json({ok:true,handled:'match_discipline_voided',incident_id:incident.incident_id});
  }

  if(session&&message){
    return json({ok:true,handled:'match_discipline_waiting_input'});
  }

  return null;
}

function canPublishDiscipline(reporter){
  return !!reporter
    && Number(reporter.active)===1
    && reporter.trust_level==='VERIFIED'
    && hasCapability(reporter,CAPABILITY.PUBLISH_MATCH_EVENT);
}

async function activeSession(db,actorId){
  if(!db||!actorId) return null;
  return db.prepare('SELECT * FROM telegram_discipline_sessions WHERE telegram_user_id=?').bind(String(actorId)).first();
}

async function sessionByNonce(db,actorId,nonce){
  return db.prepare('SELECT * FROM telegram_discipline_sessions WHERE telegram_user_id=? AND nonce=?')
    .bind(String(actorId),String(nonce)).first();
}

async function clearSession(db,actorId){
  if(!db||!actorId) return;
  await db.prepare('DELETE FROM telegram_discipline_sessions WHERE telegram_user_id=?').bind(String(actorId)).run();
}

async function getMatch(db,matchId){
  return db.prepare(`SELECT * FROM matches WHERE competition_id=? AND match_id=?`).bind(COMPETITION_ID,String(matchId)).first();
}

async function getIncident(db,incidentId){
  return db.prepare('SELECT * FROM match_disciplinary_incidents WHERE incident_id=?').bind(String(incidentId)).first();
}

async function showGlobalList(env,chatId,messageId=null){
  const q=await env.DB.prepare(`SELECT d.*,m.round_no,m.round_label,m.home_name,m.away_name
    FROM match_disciplinary_incidents d JOIN matches m ON m.match_id=d.match_id
    WHERE d.competition_id=?
    ORDER BY d.created_at DESC LIMIT 50`).bind(COMPETITION_ID).all();
  const items=q.results||[];
  const rows=items.map(x=>[{
    text:`${x.incident_status==='ACTIVE'?'🟥':'🚫'} ${x.round_label} · ${SERIES_LABEL[x.series_code]} · ${x.participant_name}`,
    callback_data:`disc:item:${x.incident_id}`
  }]);
  rows.push([{text:'⬅️ Admin global',callback_data:'tp:leaders'}]);
  const lines=items.length
    ?items.map(x=>`${x.incident_status==='ACTIVE'?'🟥':'🚫'} ${x.participant_name} · ${x.team_name} · ${x.round_label} · ${SERIES_LABEL[x.series_code]}`).join('\n')
    :'Todavía no hay expulsiones registradas.';
  await present(env,chatId,messageId,
    `🟥 REGISTRO DISCIPLINARIO\n\n${lines}\n\nEste registro conserva el hecho de expulsión. Suspensiones, multas o efectos deportivos requieren una regla explícita del campeonato.`,
    {inline_keyboard:rows});
}

async function showMatch(env,chatId,match,messageId=null,notice=null){
  const q=await env.DB.prepare(`SELECT * FROM match_disciplinary_incidents
    WHERE match_id=? ORDER BY CASE incident_status WHEN 'ACTIVE' THEN 0 ELSE 1 END,created_at,incident_id`)
    .bind(match.match_id).all();
  const items=q.results||[];
  const active=items.filter(x=>x.incident_status==='ACTIVE');
  const lines=items.length
    ?items.map(x=>`${x.incident_status==='ACTIVE'?'🟥':'🚫'} ${SERIES_LABEL[x.series_code]} · ${x.participant_name} · ${x.team_name} · ${CARD_LABEL[x.card_type]}`).join('\n')
    :'Sin expulsiones registradas.';
  const rows=active.map(x=>[{text:`🟥 ${SERIES_LABEL[x.series_code]} · ${x.participant_name}`,callback_data:`disc:item:${x.incident_id}`}]);
  rows.push([{text:'➕ Registrar expulsado',callback_data:`disc:add:${match.match_id}`}]);
  rows.push([{text:'⬅️ Volver al partido',callback_data:`rr:match:${match.match_id}`}]);
  const head=notice?`${notice}\n\n`:'';
  await present(env,chatId,messageId,
    `${head}🟥 EXPULSADOS DEL PARTIDO\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\n\n${lines}\n\nActivos: ${active.length}. El registro disciplinario no altera el marcador ni la tabla.`,
    {inline_keyboard:rows});
}

async function showSeriesPicker(env,chatId,match,messageId=null){
  const rows=SERIES.map(code=>[{text:SERIES_LABEL[code],callback_data:`disc:series:${match.match_id}:${code}`}]);
  rows.push([{text:'⬅️ Expulsados del partido',callback_data:`disc:match:${match.match_id}`}]);
  await present(env,chatId,messageId,
    `🟥 REGISTRAR EXPULSADO\n\n${match.round_label}\n${match.home_name} — ${match.away_name}\n\nSelecciona la serie:`,
    {inline_keyboard:rows});
}

async function showTeamPicker(env,chatId,match,seriesCode,messageId=null){
  await present(env,chatId,messageId,
    `🟥 REGISTRAR EXPULSADO\n\n${match.round_label} · ${SERIES_LABEL[seriesCode]}\n${match.home_name} — ${match.away_name}\n\n¿De qué club es el jugador expulsado?`,
    {inline_keyboard:[
      [{text:`🏠 ${match.home_name}`,callback_data:`disc:team:${match.match_id}:${seriesCode}:H`}],
      [{text:`🚗 ${match.away_name}`,callback_data:`disc:team:${match.match_id}:${seriesCode}:A`}],
      [{text:'⬅️ Volver a series',callback_data:`disc:add:${match.match_id}`}]
    ]});
}

async function showConfirmation(env,chatId,messageId,match,session,notice=null){
  const teamName=teamNameFor(match,session.team_id);
  const head=notice?`${notice}\n\n`:'';
  await present(env,chatId,messageId,
    `${head}🟥 CONFIRMAR EXPULSIÓN\n\n${match.round_label} · ${SERIES_LABEL[session.series_code]}\n${match.home_name} — ${match.away_name}\n\nJugador: ${session.participant_name}\nClub: ${teamName}\nTipo: ${CARD_LABEL[session.card_type]}\n\nAl confirmar se guardará el hecho disciplinario con auditoría.\nNo se aplicará automáticamente una suspensión, multa ni cambio de tabla.`,
    {inline_keyboard:[
      [{text:'✅ Guardar expulsión',callback_data:`disc:confirm:${session.nonce}`}],
      [{text:'❌ Cancelar',callback_data:`disc:cancel:${session.nonce}`}]
    ]});
}

async function showIncident(env,chatId,messageId,incident,match){
  const status=incident.incident_status==='ACTIVE'?'🟥 ACTIVO':'🚫 ANULADO';
  const rows=[];
  if(incident.incident_status==='ACTIVE') rows.push([{text:'🚫 Anular registro',callback_data:`disc:void-confirm:${incident.incident_id}`}]);
  rows.push([{text:'⬅️ Expulsados del partido',callback_data:`disc:match:${incident.match_id}`}]);
  rows.push([{text:'📋 Registro completo',callback_data:'disc:list'}]);
  await present(env,chatId,messageId,
    `👤 EXPULSIÓN REGISTRADA\n\nJugador: ${incident.participant_name}\nClub: ${incident.team_name}\nPartido: ${match?.home_name||''} — ${match?.away_name||''}\nFecha: ${match?.round_label||incident.match_id}\nSerie: ${SERIES_LABEL[incident.series_code]}\nTipo: ${CARD_LABEL[incident.card_type]}\nEstado: ${status}\n\nEstado de sanción: PENDIENTE DE REGLA/DECISIÓN.\nNo existe una consecuencia automática asociada a este registro.`,
    {inline_keyboard:rows});
}

function normalizeParticipantName(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(!text||text.startsWith('/')||text.length<2||text.length>80) return null;
  return text;
}

function participantKey(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function teamNameFor(match,teamId){
  if(match?.home_id===teamId) return match.home_name;
  if(match?.away_id===teamId) return match.away_name;
  return teamId;
}

function makeToken(prefix){
  return `${prefix}-${crypto.randomUUID().replace(/-/g,'').slice(0,16)}`;
}

async function missingMatch(env,chatId,callback){
  if(callback) await answer(env,callback.id,'Partido no encontrado');
  await send(env,chatId,'⚠️ No encontré ese partido. No se modificó ningún registro.');
  return json({ok:true,handled:'match_discipline_match_missing'});
}

async function stale(env,callback){
  if(callback) await answer(env,callback.id,'Acción vencida');
  return json({ok:true,handled:'match_discipline_stale'});
}

async function send(env,chatId,text,replyMarkup=null){
  const body={chat_id:chatId,text,disable_web_page_preview:true};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await telegram(env,'sendMessage',body);
}

async function present(env,chatId,messageId,text,replyMarkup){
  const body={chat_id:chatId,text,reply_markup:replyMarkup,disable_web_page_preview:true};
  if(messageId){
    try{
      await telegram(env,'editMessageText',{...body,message_id:messageId});
      return 'EDITED';
    }catch(error){
      if(String(error.telegram_description||'').toLowerCase().includes('message is not modified')) return 'UNCHANGED';
    }
  }
  await telegram(env,'sendMessage',body);
  return 'SENT';
}

async function answer(env,callbackId,text){
  if(!callbackId) return;
  try{await telegram(env,'answerCallbackQuery',{callback_query_id:callbackId,text});}catch{}
}

async function telegram(env,method,body){
  const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({ok:false}));
  if(!response.ok||!payload?.ok){
    const error=new Error(payload?.description||`telegram_${method}_failed`);
    error.telegram_description=String(payload?.description||'');
    throw error;
  }
  return payload;
}
