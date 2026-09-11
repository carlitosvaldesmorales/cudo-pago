import { CAPABILITY, hasCapability } from './access-control.js';

const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// PLATFORM-OPERATOR-RUNTIME-01
// Operational control plane for the championship. PLATFORM_OPERATOR can operate
// competition data and access workflows, but this handler intentionally exposes
// no policy-management or SUPER_ADMIN-granting operation.
export async function handlePlatformOperatorRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId||!env.DB) return null;
  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  if(!isOperator(reporter)) return null;

  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const relevant=/^\/(dirigentes|operador|gobiernoresultados|pendientesresultados)(?:@\w+)?$/i.test(text)
    || data==='tp:leaders'||data==='tp:mymatches'||data==='tp:requests'||data==='tp:admins'||data==='tp:registered'
    || data==='rg:list'||data==='pr:pending'
    || data.startsWith('po:')||data.startsWith('tp:review:')||data.startsWith('tp:approve:')||data.startsWith('tp:reject:')
    || data.startsWith('tp:admin:')||data.startsWith('tp:admin-suspend:')||data.startsWith('tp:admin-reactivate:')||data.startsWith('tp:admin-revoke-confirm:')||data.startsWith('tp:admin-revoke:')
    || data.startsWith('pr:review:')||data.startsWith('pr:approve:')||data.startsWith('pr:reject:');
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'platform_operator_not_configured'},503);

  if(/^\/(dirigentes|operador)(?:@\w+)?$/i.test(text)||data==='tp:leaders'||data==='po:home'){
    await clearOperationalSession(env.DB,actorId);
    if(callback) await answer(env,callback.id,'Administración del campeonato');
    await showDashboard(env,chatId);
    return json({ok:true,handled:'platform_operator_dashboard'});
  }

  if(/^\/gobiernoresultados(?:@\w+)?$/i.test(text)||data==='tp:mymatches'||data==='rg:list'||data==='po:results'){
    await clearOperationalSession(env.DB,actorId);
    if(callback) await answer(env,callback.id,'Gobierno de resultados');
    await showDates(env,chatId);
    return json({ok:true,handled:'platform_operator_result_dates'});
  }

  if(/^\/pendientesresultados(?:@\w+)?$/i.test(text)||data==='pr:pending'||data==='po:pending'){
    if(callback) await answer(env,callback.id,'Observaciones pendientes');
    await showPendingObservations(env,chatId);
    return json({ok:true,handled:'platform_operator_pending_observations'});
  }

  if(data==='tp:requests'||data==='po:requests'){
    await answer(env,callback.id,'Solicitudes');
    await showAccessRequests(env,chatId);
    return json({ok:true,handled:'platform_operator_access_requests'});
  }

  const accessReview=data.match(/^tp:review:(ar-[A-Za-z0-9-]+)$/);
  if(accessReview){
    await answer(env,callback.id,'Revisar solicitud');
    await showAccessRequest(env,chatId,accessReview[1]);
    return json({ok:true,handled:'platform_operator_access_review'});
  }
  const accessApprove=data.match(/^tp:approve:(ar-[A-Za-z0-9-]+)$/);
  if(accessApprove) return approveAccess(env,chatId,callback,actorId,reporter,accessApprove[1]);
  const accessReject=data.match(/^tp:reject:(ar-[A-Za-z0-9-]+)$/);
  if(accessReject) return rejectAccess(env,chatId,callback,actorId,reporter,accessReject[1]);

  if(data==='tp:admins'||data==='po:admins'){
    await answer(env,callback.id,'Dirigentes');
    await showClubAdmins(env,chatId);
    return json({ok:true,handled:'platform_operator_club_admin_list'});
  }
  const adminInspect=data.match(/^tp:admin:(\d+)$/);
  if(adminInspect){
    await answer(env,callback.id,'Dirigente');
    await showClubAdmin(env,chatId,adminInspect[1]);
    return json({ok:true,handled:'platform_operator_club_admin_detail'});
  }
  const adminSuspend=data.match(/^tp:admin-suspend:(\d+)$/);
  if(adminSuspend) return changeClubAdminLifecycle(env,chatId,callback,actorId,reporter,adminSuspend[1],'SUSPEND');
  const adminReactivate=data.match(/^tp:admin-reactivate:(\d+)$/);
  if(adminReactivate) return changeClubAdminLifecycle(env,chatId,callback,actorId,reporter,adminReactivate[1],'REACTIVATE');
  const adminRevokeConfirm=data.match(/^tp:admin-revoke-confirm:(\d+)$/);
  if(adminRevokeConfirm){
    const target=await getClubAdmin(env.DB,adminRevokeConfirm[1]);
    if(!target) return missingTarget(env,chatId,callback);
    await answer(env,callback.id,'Confirmar revocación');
    await send(env,chatId,`⚠️ REVOCAR ACCESO\n\n${target.display_name||target.telegram_user_id}\nClub: ${target.canonical_name||target.club_id}\n\nSe conservarán identidad, historial y aportes. El usuario volverá a REPORTER.`,{inline_keyboard:[[{text:'❌ Sí, revocar',callback_data:`tp:admin-revoke:${target.telegram_user_id}`}],[{text:'⬅️ Cancelar',callback_data:`tp:admin:${target.telegram_user_id}`}]]});
    return json({ok:true,handled:'platform_operator_club_admin_revoke_confirmation'});
  }
  const adminRevoke=data.match(/^tp:admin-revoke:(\d+)$/);
  if(adminRevoke) return changeClubAdminLifecycle(env,chatId,callback,actorId,reporter,adminRevoke[1],'REVOKE');

  if(data==='tp:registered'||data==='po:registered'){
    await answer(env,callback.id,'Resultados registrados');
    await showRegistered(env,chatId);
    return json({ok:true,handled:'platform_operator_registered_results'});
  }

  const observationReview=data.match(/^pr:review:([A-Za-z0-9._:-]+)$/);
  if(observationReview){
    await answer(env,callback.id,'Revisar aporte');
    await showObservation(env,chatId,actorId,observationReview[1]);
    return json({ok:true,handled:'platform_operator_observation_review'});
  }
  const observationApprove=data.match(/^pr:approve:([A-Za-z0-9._:-]+)$/);
  if(observationApprove) return approveObservation(env,chatId,callback,actorId,reporter,observationApprove[1]);
  const observationReject=data.match(/^pr:reject:([A-Za-z0-9._:-]+)$/);
  if(observationReject) return rejectObservation(env,chatId,callback,actorId,reporter,observationReject[1]);

  const date=data.match(/^po:date:(\d+)$/);
  if(date){
    await clearOperationalSession(env.DB,actorId);
    await answer(env,callback.id,`Fecha ${date[1]}`);
    await showRound(env,chatId,Number(date[1]));
    return json({ok:true,handled:'platform_operator_result_round'});
  }
  const matchCb=data.match(/^po:match:([A-Za-z0-9._:-]+)$/);
  if(matchCb){
    await clearOperationalSession(env.DB,actorId);
    const match=await getMatch(env.DB,matchCb[1]);
    if(!match) return invalidMatch(env,chatId,callback);
    await answer(env,callback.id,'Partido');
    await showMatch(env,chatId,match);
    return json({ok:true,handled:'platform_operator_match'});
  }
  const seriesCb=data.match(/^po:series:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(seriesCb){
    await clearOperationalSession(env.DB,actorId);
    const [,matchId,seriesCode]=seriesCb;
    const match=await getMatch(env.DB,matchId);
    if(!match) return invalidMatch(env,chatId,callback);
    const current=await getResult(env.DB,matchId,seriesCode);
    await answer(env,callback.id,SERIES_LABEL[seriesCode]);
    if(!current){
      await startResultSession(env.DB,actorId,chatId,matchId,seriesCode,'REGISTER',null);
      await showScorePicker(env,chatId,match,seriesCode,'HOME',0);
      return json({ok:true,handled:'platform_operator_register_home_score'});
    }
    await showResultActions(env,chatId,match,current);
    return json({ok:true,handled:'platform_operator_result_actions',status:current.validation_status});
  }

  const correct=data.match(/^po:correct:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(correct){
    const [,matchId,seriesCode]=correct;
    const [match,current]=await Promise.all([getMatch(env.DB,matchId),getResult(env.DB,matchId,seriesCode)]);
    if(!match||!current) return invalidResult(env,chatId,callback);
    await startResultSession(env.DB,actorId,chatId,matchId,seriesCode,'CORRECT',Number(current.governance_version||1));
    await answer(env,callback.id,'Corregir marcador');
    await showScorePicker(env,chatId,match,seriesCode,'HOME',0,current);
    return json({ok:true,handled:'platform_operator_correct_home_score'});
  }

  const score=data.match(/^po:score:(h|a):(\d{1,2})$/);
  if(score){
    const side=score[1]==='h'?'HOME':'AWAY';
    const value=Number(score[2]);
    if(value<0||value>99) return stale(env,chatId,callback);
    const session=await getOperationalSession(env.DB,actorId);
    if(!session||session.phase!==(side==='HOME'?'HOME_SCORE':'AWAY_SCORE')) return stale(env,chatId,callback);
    const match=await getMatch(env.DB,session.match_id);
    if(!match) return stale(env,chatId,callback);
    if(side==='HOME'){
      await env.DB.prepare("UPDATE telegram_operational_result_sessions SET home_score=?,phase='AWAY_SCORE',updated_at=? WHERE telegram_user_id=?").bind(value,new Date().toISOString(),actorId).run();
      await answer(env,callback.id,String(value));
      await showScorePicker(env,chatId,match,session.series_code,'AWAY',0,null,value);
      return json({ok:true,handled:'platform_operator_away_score'});
    }
    await env.DB.prepare("UPDATE telegram_operational_result_sessions SET away_score=?,phase=?,updated_at=? WHERE telegram_user_id=?").bind(value,session.action==='CORRECT'?'REASON':'CONFIRM',new Date().toISOString(),actorId).run();
    await answer(env,callback.id,String(value));
    if(session.action==='CORRECT') await showReasonPicker(env,chatId,actorId);
    else await showOperationalConfirmation(env,chatId,actorId);
    return json({ok:true,handled:session.action==='CORRECT'?'platform_operator_correction_reason':'platform_operator_result_confirm'});
  }

  const range=data.match(/^po:range:(h|a):(\d{1,2})$/);
  if(range){
    const side=range[1]==='h'?'HOME':'AWAY';
    const start=Math.min(96,Math.max(0,Number(range[2])));
    const session=await getOperationalSession(env.DB,actorId);
    if(!session||session.phase!==(side==='HOME'?'HOME_SCORE':'AWAY_SCORE')) return stale(env,chatId,callback);
    const match=await getMatch(env.DB,session.match_id);
    await answer(env,callback.id,'Más goles');
    await showScorePicker(env,chatId,match,session.series_code,side,start,null,session.home_score);
    return json({ok:true,handled:'platform_operator_score_range'});
  }

  const reason=data.match(/^po:reason:(TYPO|EVIDENCE|DISPUTE|ADMIN)$/);
  if(reason){
    const labels={TYPO:'Corrección de digitación',EVIDENCE:'Acta o evidencia oficial',DISPUTE:'Resolución de disputa',ADMIN:'Ajuste administrativo documentado'};
    const session=await getOperationalSession(env.DB,actorId);
    if(!session||session.action!=='CORRECT'||session.phase!=='REASON') return stale(env,chatId,callback);
    await env.DB.prepare("UPDATE telegram_operational_result_sessions SET reason=?,phase='CONFIRM',updated_at=? WHERE telegram_user_id=?").bind(labels[reason[1]],new Date().toISOString(),actorId).run();
    await answer(env,callback.id,labels[reason[1]]);
    await showOperationalConfirmation(env,chatId,actorId);
    return json({ok:true,handled:'platform_operator_correction_confirm'});
  }

  if(data==='po:session:cancel'){
    await clearOperationalSession(env.DB,actorId);
    await answer(env,callback.id,'Cancelado');
    await send(env,chatId,'Operación cancelada. No se modificó el estado canónico.',{inline_keyboard:[[{text:'🛡 Gobierno de resultados',callback_data:'po:results'}]]});
    return json({ok:true,handled:'platform_operator_session_cancel'});
  }
  if(data==='po:session:confirm') return commitOperationalSession(env,chatId,callback,actorId,reporter,update);

  const ask=data.match(/^po:ask:(DISPUTE|CONFIRM|ANNUL|RESTORE):([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(ask){
    const [,action,matchId,seriesCode]=ask;
    const [match,current]=await Promise.all([getMatch(env.DB,matchId),getResult(env.DB,matchId,seriesCode)]);
    if(!match||!current) return invalidResult(env,chatId,callback);
    await answer(env,callback.id,'Confirmar acción');
    const verb={DISPUTE:'poner en disputa',CONFIRM:'confirmar como oficial',ANNUL:'anular',RESTORE:'restaurar'}[action];
    await send(env,chatId,`⚠️ CONFIRMAR ACCIÓN\n\n${match.home_name} ${current.home_score}-${current.away_score} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\nEstado actual: ${statusLabel(current.validation_status)}\n\n¿Confirmas ${verb} este resultado?`,{inline_keyboard:[[{text:'✅ Confirmar',callback_data:`po:do:${action}:${matchId}:${seriesCode}`}],[{text:'⬅️ Cancelar',callback_data:`po:series:${matchId}:${seriesCode}`}]]});
    return json({ok:true,handled:'platform_operator_transition_confirmation'});
  }
  const transition=data.match(/^po:do:(DISPUTE|CONFIRM|ANNUL|RESTORE):([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(transition) return performTransition(env,chatId,callback,actorId,reporter,transition[1],transition[2],transition[3],update);

  const history=data.match(/^po:history:([A-Za-z0-9._:-]+):(TERCERA|SEGUNDA|SENIOR|PRIMERA)$/);
  if(history){
    await answer(env,callback.id,'Historial');
    await showHistory(env,chatId,history[1],history[2]);
    return json({ok:true,handled:'platform_operator_result_history'});
  }

  return null;
}

function isOperator(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&r.role==='PLATFORM_OPERATOR'&&hasCapability(r,CAPABILITY.GOVERN_RESULTS)&&!hasCapability(r,CAPABILITY.MANAGE_POLICY)&&!hasCapability(r,CAPABILITY.GRANT_SUPER_ADMIN);}

async function showDashboard(env,chatId){
  const [access,pending,active,total]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE status='SUBMITTED'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
  ]);
  await send(env,chatId,`🎛 FÚTBOL CHÉPICA · ADMINISTRADOR DEL CAMPEONATO\n\nResultados por revisar: ${Number(pending?.n||0)}\nSolicitudes de acceso: ${Number(access?.n||0)}\nDirigentes activos: ${Number(active?.n||0)}/${Number(total?.n||0)}\n\nPuedes operar el campeonato completo. Las políticas, permisos estructurales y SUPER_ADMIN quedan fuera de este rol.`,{inline_keyboard:[
    [{text:'🛡 Gobierno de resultados',callback_data:'po:results'}],
    [{text:`🟡 Observaciones pendientes (${Number(pending?.n||0)})`,callback_data:'po:pending'}],
    [{text:`🔔 Solicitudes acceso (${Number(access?.n||0)})`,callback_data:'po:requests'}],
    [{text:`👥 Dirigentes (${Number(active?.n||0)}/${Number(total?.n||0)})`,callback_data:'po:admins'}],
    [{text:'📋 Resultados registrados',callback_data:'po:registered'}],
    [{text:'📣 Informar como usuario',callback_data:'obs:dates'}],
    [{text:'🏠 Inicio',callback_data:'tp:home'}]
  ]});
}

async function showDates(env,chatId){
  const rounds=await env.DB.prepare("SELECT round_no,MAX(round_label) AS round_label,COUNT(*) AS matches FROM matches WHERE competition_id='ANFA-CHEPICA-2026' GROUP BY round_no ORDER BY round_no").all();
  const rows=[];
  for(const r of rounds.results||[]){
    const counts=await env.DB.prepare(`SELECT COUNT(*) AS expected,SUM(CASE WHEN x.result_id IS NULL THEN 1 ELSE 0 END) AS missing
      FROM (SELECT m.match_id,s.series_code FROM matches m CROSS JOIN (SELECT 'TERCERA' series_code UNION ALL SELECT 'SEGUNDA' UNION ALL SELECT 'SENIOR' UNION ALL SELECT 'PRIMERA') s WHERE m.competition_id='ANFA-CHEPICA-2026' AND m.round_no=?) e
      LEFT JOIN match_series_results x ON x.match_id=e.match_id AND x.series_code=e.series_code`).bind(r.round_no).first();
    rows.push([{text:`${Number(counts?.missing||0)>0?'🟡':'✅'} ${r.round_label||'Fecha '+r.round_no} · faltan ${Number(counts?.missing||0)}/${Number(counts?.expected||0)}`,callback_data:`po:date:${r.round_no}`}]);
  }
  rows.push([{text:'⬅️ Administración',callback_data:'po:home'}]);
  await send(env,chatId,'🛡 GOBIERNO DE RESULTADOS\n\nEl universo nace del fixture y las 4 series esperadas. Selecciona una fecha.',{inline_keyboard:rows});
}

async function showRound(env,chatId,roundNo){
  const q=await env.DB.prepare("SELECT match_id,group_id,round_no,round_label,home_name,away_name FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND round_no=? ORDER BY group_id,match_id").bind(roundNo).all();
  const rows=[];
  for(const m of q.results||[]){
    const c=await env.DB.prepare("SELECT COUNT(*) AS n FROM match_series_results WHERE match_id=?").bind(m.match_id).first();
    rows.push([{text:`${Number(c?.n||0)===4?'✅':'🟡'} Grupo ${m.group_id} · ${m.home_name} — ${m.away_name} · ${Number(c?.n||0)}/4`,callback_data:`po:match:${m.match_id}`}]);
  }
  rows.push([{text:'⬅️ Fechas',callback_data:'po:results'}]);
  await send(env,chatId,`📅 Fecha ${roundNo}\n\nCada partido normal debe tener 4/4 resultados gobernables.`,{inline_keyboard:rows});
}

async function showMatch(env,chatId,match){
  const q=await env.DB.prepare('SELECT * FROM match_series_results WHERE match_id=?').bind(match.match_id).all();
  const map=new Map((q.results||[]).map(r=>[r.series_code,r]));
  const rows=SERIES.map(code=>{
    const r=map.get(code);
    const text=!r?`➕ ${SERIES_LABEL[code]} · SIN RESULTADO`:`${statusIcon(r.validation_status)} ${SERIES_LABEL[code]} · ${r.home_score}-${r.away_score} · ${statusLabel(r.validation_status)}`;
    return [{text,callback_data:`po:series:${match.match_id}:${code}`}];
  });
  rows.push([{text:'⬅️ Fecha',callback_data:`po:date:${match.round_no}`}]);
  await send(env,chatId,`🏟 ${match.home_name} — ${match.away_name}\n${match.round_label} · Grupo ${match.group_id}\n\nGobierna cualquiera de las cuatro series, tenga o no resultado.`,{inline_keyboard:rows});
}

async function showResultActions(env,chatId,match,r){
  const rows=[];
  if(r.validation_status==='VERIFIED'){
    rows.push([{text:'✏️ Corregir marcador',callback_data:`po:correct:${match.match_id}:${r.series_code}`}]);
    rows.push([{text:'⚠️ Poner en disputa',callback_data:`po:ask:DISPUTE:${match.match_id}:${r.series_code}`}]);
    rows.push([{text:'🚫 Anular resultado',callback_data:`po:ask:ANNUL:${match.match_id}:${r.series_code}`}]);
  }else if(r.validation_status==='DISPUTED'){
    rows.push([{text:'✅ Confirmar marcador actual',callback_data:`po:ask:CONFIRM:${match.match_id}:${r.series_code}`}]);
    rows.push([{text:'✏️ Corregir y resolver',callback_data:`po:correct:${match.match_id}:${r.series_code}`}]);
    rows.push([{text:'🚫 Anular resultado',callback_data:`po:ask:ANNUL:${match.match_id}:${r.series_code}`}]);
  }else if(r.validation_status==='ANNULLED'){
    rows.push([{text:'♻️ Restaurar resultado',callback_data:`po:ask:RESTORE:${match.match_id}:${r.series_code}`}]);
  }
  rows.push([{text:'🕘 Historial',callback_data:`po:history:${match.match_id}:${r.series_code}`}]);
  rows.push([{text:'⬅️ Partido',callback_data:`po:match:${match.match_id}`}]);
  await send(env,chatId,`🛡 RESULTADO CANÓNICO\n\n${match.home_name} ${r.home_score}-${r.away_score} ${match.away_name}\nSerie: ${SERIES_LABEL[r.series_code]}\nEstado: ${statusLabel(r.validation_status)}\nVersión: ${Number(r.governance_version||1)}`,{inline_keyboard:rows});
}

async function showScorePicker(env,chatId,match,seriesCode,side,start=0,current=null,homeScore=null){
  const low=Math.max(0,Math.min(96,start));
  const nums=Array.from({length:8},(_,i)=>low+i).filter(n=>n<=99);
  const rows=[];
  for(let i=0;i<nums.length;i+=4) rows.push(nums.slice(i,i+4).map(n=>({text:String(n),callback_data:`po:score:${side==='HOME'?'h':'a'}:${n}`})));
  if(low+8<=99) rows.push([{text:`Más (${low+8}+)`,callback_data:`po:range:${side==='HOME'?'h':'a'}:${low+8}`}]);
  if(low>0) rows.push([{text:`⬅️ ${Math.max(0,low-8)}-${low-1}`,callback_data:`po:range:${side==='HOME'?'h':'a'}:${Math.max(0,low-8)}`}]);
  rows.push([{text:'❌ Cancelar',callback_data:'po:session:cancel'}]);
  const partial=side==='AWAY'&&homeScore!==null?`\nParcial: ${match.home_name} ${homeScore}–? ${match.away_name}`:'';
  const existing=current?`\nActual: ${current.home_score}-${current.away_score} · ${statusLabel(current.validation_status)}`:'';
  await send(env,chatId,`⚽ ${SERIES_LABEL[seriesCode]} · ${side==='HOME'?'GOLES LOCAL':'GOLES VISITA'}\n${match.home_name} — ${match.away_name}${existing}${partial}\n\nSelecciona el número de goles.`,{inline_keyboard:rows});
}

async function showReasonPicker(env,chatId){
  await send(env,chatId,'🧾 MOTIVO DE CORRECCIÓN\n\nSelecciona el motivo. La corrección quedará versionada y auditada.',{inline_keyboard:[
    [{text:'⌨️ Error de digitación',callback_data:'po:reason:TYPO'}],
    [{text:'📄 Acta / evidencia oficial',callback_data:'po:reason:EVIDENCE'}],
    [{text:'⚠️ Resolución de disputa',callback_data:'po:reason:DISPUTE'}],
    [{text:'🛠 Ajuste administrativo documentado',callback_data:'po:reason:ADMIN'}],
    [{text:'❌ Cancelar',callback_data:'po:session:cancel'}]
  ]});
}

async function showOperationalConfirmation(env,chatId,actorId){
  const s=await getOperationalSession(env.DB,actorId);
  if(!s) return;
  const [match,current]=await Promise.all([getMatch(env.DB,s.match_id),getResult(env.DB,s.match_id,s.series_code)]);
  if(!match) return;
  const operation=s.action==='REGISTER'?'REGISTRAR RESULTADO OFICIAL':'CORREGIR RESULTADO';
  const before=current?`\nActual: ${current.home_score}-${current.away_score} · ${statusLabel(current.validation_status)} · v${current.governance_version}`:'';
  const reason=s.reason?`\nMotivo: ${s.reason}`:'';
  await send(env,chatId,`🧾 CONFIRMAR · ${operation}\n\n${match.round_label} · ${SERIES_LABEL[s.series_code]}\n${match.home_name} ${s.home_score}-${s.away_score} ${match.away_name}${before}${reason}\n\nEsta acción modifica el estado canónico y quedará auditada.`,{inline_keyboard:[[{text:'✅ Confirmar',callback_data:'po:session:confirm'}],[{text:'❌ Cancelar',callback_data:'po:session:cancel'}]]});
}

async function commitOperationalSession(env,chatId,callback,actorId,reporter,update){
  const s=await getOperationalSession(env.DB,actorId);
  if(!s||s.phase!=='CONFIRM'||s.home_score===null||s.away_score===null) return stale(env,chatId,callback);
  const match=await getMatch(env.DB,s.match_id);
  if(!match) return stale(env,chatId,callback);
  const now=new Date().toISOString();
  const eventId=`po-${update.update_id||Date.now()}-${s.action.toLowerCase()}`;
  if(s.action==='REGISTER'){
    const existing=await getResult(env.DB,s.match_id,s.series_code);
    if(existing){
      await clearOperationalSession(env.DB,actorId);
      await answer(env,callback.id,'Ya existe resultado');
      await send(env,chatId,'⚠️ El resultado no se registró porque otro actor materializó esa serie mientras la estabas completando.',{inline_keyboard:[[{text:'🛡 Abrir resultado',callback_data:`po:series:${s.match_id}:${s.series_code}`}]]});
      return json({ok:true,handled:'platform_operator_register_race_guard'});
    }
    const resultId=`${s.match_id}-${s.series_code}`;
    const reportId=`${s.match_id}:${s.series_code}:${actorId}`;
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at,governance_version)
          VALUES (?,?,?,?,?,'VERIFIED','TELEGRAM_PLATFORM_OPERATOR','Telegram · Administrador del campeonato',?,NULL,?,?,1)`).bind(resultId,s.match_id,s.series_code,s.home_score,s.away_score,eventId,now,now),
        env.DB.prepare(`UPDATE match_series_result_versions SET actor_id=?,actor_role='PLATFORM_OPERATOR',actor_club_id=NULL WHERE version_id=? AND action='BASELINE' AND actor_id IS NULL`).bind(actorId,`${s.match_id}:${s.series_code}:v1`),
        env.DB.prepare(`INSERT INTO series_reports (report_id,match_id,series_code,reporter_id,reporter_club_id,home_score,away_score,report_status,source_channel,source_event_id,created_at,updated_at)
          VALUES (?,?,?,?,NULL,?,?,'VERIFIED','telegram',?,?,?) ON CONFLICT(match_id,series_code,reporter_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,report_status='VERIFIED',source_event_id=excluded.source_event_id,updated_at=excluded.updated_at`).bind(reportId,s.match_id,s.series_code,actorId,s.home_score,s.away_score,eventId,now,now),
        eventStmt(env.DB,eventId,'match.series.result.reported',match,actorId,reporter,'VERIFIED',{series_code:s.series_code,home_score:s.home_score,away_score:s.away_score,authorization:'PLATFORM_OPERATOR',outcome:'FIRST_OFFICIAL'}),
        auditStmt(env.DB,`${eventId}-audit`,actorId,reporter,'REPORT_SERIES_RESULT','match_series',`${s.match_id}:${s.series_code}`,1,'verified_platform_operator_first_official',now),
        env.DB.prepare('DELETE FROM telegram_operational_result_sessions WHERE telegram_user_id=?').bind(actorId)
      ]);
    }catch(error){
      await clearOperationalSession(env.DB,actorId);
      const appeared=await getResult(env.DB,s.match_id,s.series_code);
      if(appeared){
        await answer(env,callback.id,'Ya existe resultado');
        return json({ok:true,handled:'platform_operator_register_concurrency_guard'});
      }
      throw error;
    }
    await answer(env,callback.id,'Resultado oficial registrado');
    await send(env,chatId,`✅ RESULTADO OFICIAL\n\n${match.home_name} ${s.home_score}-${s.away_score} ${match.away_name}\nSerie: ${SERIES_LABEL[s.series_code]}\nEstado: OFICIAL\nActor: Administrador del campeonato`,{inline_keyboard:[[{text:'🛡 Volver al partido',callback_data:`po:match:${s.match_id}`}]]});
    return json({ok:true,handled:'platform_operator_result_registered'});
  }

  const current=await getResult(env.DB,s.match_id,s.series_code);
  if(!current||Number(current.governance_version)!==Number(s.base_version)){
    await clearOperationalSession(env.DB,actorId);
    await answer(env,callback.id,'Resultado cambió');
    await send(env,chatId,'⚠️ El resultado cambió mientras preparabas la corrección. No se aplicó tu cambio; vuelve a abrir la serie.',{inline_keyboard:[[{text:'🛡 Abrir serie',callback_data:`po:series:${s.match_id}:${s.series_code}`}]]});
    return json({ok:true,handled:'platform_operator_correction_stale_guard'});
  }
  const nextVersion=Number(current.governance_version)+1;
  const sourceRef=eventId;
  await env.DB.batch([
    env.DB.prepare(`UPDATE match_series_results SET home_score=?,away_score=?,validation_status='VERIFIED',source_type='TELEGRAM_PLATFORM_OPERATOR',source_label='Telegram · Administrador del campeonato',source_ref=?,updated_at=?,governance_version=? WHERE result_id=? AND governance_version=?`).bind(s.home_score,s.away_score,sourceRef,now,nextVersion,current.result_id,current.governance_version),
    env.DB.prepare(`INSERT OR IGNORE INTO match_series_result_versions (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
      SELECT ?,match_id,series_code,governance_version,home_score,away_score,validation_status,'CORRECT',?,'TELEGRAM_PLATFORM_OPERATOR','Telegram · Administrador del campeonato',source_ref,played_on,?,'PLATFORM_OPERATOR',NULL,? FROM match_series_results WHERE result_id=? AND governance_version=? AND source_ref=?`).bind(`${s.match_id}:${s.series_code}:v${nextVersion}`,s.reason||'Corrección operativa',actorId,now,current.result_id,nextVersion,sourceRef),
    eventConditionalStmt(env.DB,eventId,'match.series.result.corrected',match,actorId,reporter,'VERIFIED',{series_code:s.series_code,home_score:s.home_score,away_score:s.away_score,reason:s.reason,version:nextVersion},current.result_id,nextVersion,sourceRef),
    auditConditionalStmt(env.DB,`${eventId}-audit`,actorId,reporter,'CORRECT_SERIES_RESULT','match_series',`${s.match_id}:${s.series_code}`,1,'platform_operator_documented_correction',now,current.result_id,nextVersion,sourceRef),
    env.DB.prepare('DELETE FROM telegram_operational_result_sessions WHERE telegram_user_id=?').bind(actorId)
  ]);
  const final=await getResult(env.DB,s.match_id,s.series_code);
  if(!final||final.source_ref!==sourceRef||Number(final.governance_version)!==nextVersion){
    await answer(env,callback.id,'No aplicado');
    return json({ok:true,handled:'platform_operator_correction_concurrency_guard'});
  }
  await answer(env,callback.id,'Corrección aplicada');
  await send(env,chatId,`✅ RESULTADO CORREGIDO\n\n${match.home_name} ${final.home_score}-${final.away_score} ${match.away_name}\nSerie: ${SERIES_LABEL[s.series_code]}\nVersión: ${final.governance_version}\nMotivo: ${s.reason}`,{inline_keyboard:[[{text:'🛡 Volver al resultado',callback_data:`po:series:${s.match_id}:${s.series_code}`}]]});
  return json({ok:true,handled:'platform_operator_result_corrected'});
}

async function performTransition(env,chatId,callback,actorId,reporter,action,matchId,seriesCode,update){
  const [match,current]=await Promise.all([getMatch(env.DB,matchId),getResult(env.DB,matchId,seriesCode)]);
  if(!match||!current) return invalidResult(env,chatId,callback);
  const contract={
    DISPUTE:{from:'VERIFIED',to:'DISPUTED',versionAction:'DISPUTE',reason:'platform_operator_opened_dispute',label:'En disputa'},
    CONFIRM:{from:'DISPUTED',to:'VERIFIED',versionAction:'RESOLVE',reason:'platform_operator_resolved_dispute',label:'Oficial'},
    ANNUL:{from:['VERIFIED','DISPUTED'],to:'ANNULLED',versionAction:'ANNUL',reason:'platform_operator_annulled_result',label:'Anulado'},
    RESTORE:{from:'ANNULLED',to:'VERIFIED',versionAction:'RESTORE',reason:'platform_operator_restored_result',label:'Oficial'}
  }[action];
  const allowed=Array.isArray(contract.from)?contract.from.includes(current.validation_status):current.validation_status===contract.from;
  if(!allowed){
    await answer(env,callback.id,'Transición no válida');
    await showResultActions(env,chatId,match,current);
    return json({ok:true,handled:'platform_operator_transition_invalid_state'});
  }
  const now=new Date().toISOString(),next=Number(current.governance_version)+1;
  const eventId=`po-${update.update_id||Date.now()}-${action.toLowerCase()}`;
  await env.DB.batch([
    env.DB.prepare(`UPDATE match_series_results SET validation_status=?,source_type='TELEGRAM_PLATFORM_OPERATOR',source_label='Telegram · Administrador del campeonato',source_ref=?,updated_at=?,governance_version=? WHERE result_id=? AND governance_version=? AND validation_status=?`).bind(contract.to,eventId,now,next,current.result_id,current.governance_version,current.validation_status),
    env.DB.prepare(`INSERT OR IGNORE INTO match_series_result_versions (version_id,match_id,series_code,version_no,home_score,away_score,validation_status,action,reason,source_type,source_label,source_ref,played_on,actor_id,actor_role,actor_club_id,created_at)
      SELECT ?,match_id,series_code,governance_version,home_score,away_score,validation_status,?,?,'TELEGRAM_PLATFORM_OPERATOR','Telegram · Administrador del campeonato',source_ref,played_on,?,'PLATFORM_OPERATOR',NULL,? FROM match_series_results WHERE result_id=? AND governance_version=? AND source_ref=?`).bind(`${matchId}:${seriesCode}:v${next}`,contract.versionAction,contract.reason,actorId,now,current.result_id,next,eventId),
    eventConditionalStmt(env.DB,eventId,`match.series.result.${action.toLowerCase()}`,match,actorId,reporter,contract.to,{series_code:seriesCode,from:current.validation_status,to:contract.to,version:next},current.result_id,next,eventId),
    auditConditionalStmt(env.DB,`${eventId}-audit`,actorId,reporter,`${action}_SERIES_RESULT`,'match_series',`${matchId}:${seriesCode}`,1,contract.reason,now,current.result_id,next,eventId)
  ]);
  const final=await getResult(env.DB,matchId,seriesCode);
  if(!final||final.source_ref!==eventId||Number(final.governance_version)!==next){
    await answer(env,callback.id,'Resultado cambió');
    return json({ok:true,handled:'platform_operator_transition_concurrency_guard'});
  }
  await answer(env,callback.id,contract.label);
  await send(env,chatId,`✅ ESTADO ACTUALIZADO\n\n${match.home_name} ${final.home_score}-${final.away_score} ${match.away_name}\nSerie: ${SERIES_LABEL[seriesCode]}\nEstado: ${statusLabel(final.validation_status)}\nVersión: ${final.governance_version}`,{inline_keyboard:[[{text:'🛡 Volver al resultado',callback_data:`po:series:${matchId}:${seriesCode}`}]]});
  return json({ok:true,handled:'platform_operator_transition_applied',status:final.validation_status});
}

async function showHistory(env,chatId,matchId,seriesCode){
  const match=await getMatch(env.DB,matchId);
  const q=await env.DB.prepare('SELECT * FROM match_series_result_versions WHERE match_id=? AND series_code=? ORDER BY version_no DESC LIMIT 12').bind(matchId,seriesCode).all();
  const lines=(q.results||[]).map(v=>`v${v.version_no} · ${v.home_score}-${v.away_score} · ${statusLabel(v.validation_status)} · ${v.action}${v.reason?' · '+v.reason:''}${v.actor_role?' · '+v.actor_role:''}`);
  await send(env,chatId,`🕘 HISTORIAL DEL RESULTADO\n\n${match?match.home_name+' — '+match.away_name:matchId}\nSerie: ${SERIES_LABEL[seriesCode]}\n\n${lines.length?lines.join('\n'):'Sin versiones registradas.'}`,{inline_keyboard:[[{text:'⬅️ Resultado',callback_data:`po:series:${matchId}:${seriesCode}`}]]});
}

async function showPendingObservations(env,chatId){
  const q=await env.DB.prepare(`SELECT s.*,m.home_name,m.away_name,m.round_label FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' ORDER BY s.created_at LIMIT 30`).all();
  const rows=(q.results||[]).map(s=>[{text:`${s.round_label} · ${SERIES_LABEL[s.series_code]} · ${s.home_score}-${s.away_score} · ${s.source_type||'PUBLIC_USER'}`,callback_data:`pr:review:${s.submission_id}`}]);
  rows.push([{text:'⬅️ Administración',callback_data:'po:home'}]);
  await send(env,chatId,`🟡 OBSERVACIONES PENDIENTES\n\n${q.results?.length||0} aporte(s) pendientes. Son observaciones; no modifican por sí solas el estado canónico.`,{inline_keyboard:rows});
}

async function showObservation(env,chatId,actorId,id){
  const s=await getObservation(env.DB,id);
  if(!s){await send(env,chatId,'El aporte ya no existe.');return;}
  const same=String(s.submitter_id)===String(actorId);
  const current=await getResult(env.DB,s.match_id,s.series_code);
  const canonical=current?`\nCanónico actual: ${current.home_score}-${current.away_score} · ${statusLabel(current.validation_status)}`:'\nCanónico actual: SIN RESULTADO';
  const rows=[];
  if(s.status==='SUBMITTED'&&!same&&!current) rows.push([{text:'✅ Aprobar como primer oficial',callback_data:`pr:approve:${s.submission_id}`}]);
  if(s.status==='SUBMITTED') rows.push([{text:'❌ Rechazar aporte',callback_data:`pr:reject:${s.submission_id}`}]);
  rows.push([{text:'⬅️ Pendientes',callback_data:'po:pending'}]);
  await send(env,chatId,`🧾 REVISAR OBSERVACIÓN\n\n${s.round_label} · ${SERIES_LABEL[s.series_code]}\n${s.home_name} ${s.home_score}-${s.away_score} ${s.away_name}\nInformado por: ${s.submitter_name||s.submitter_id}\nOrigen: ${s.source_label||s.source_type||'PUBLIC_USER'}\nConfianza: ${s.trust_level||'PROVISIONAL'}\nTipo: ${s.observation_kind||'INITIAL'}\nEstado: ${s.status}${canonical}\n\n${same?'⚠️ No puedes aprobar una observación hecha por tu misma identidad.':''}`,{inline_keyboard:rows});
}

async function approveObservation(env,chatId,callback,actorId,reporter,id){
  const s=await getObservation(env.DB,id);
  if(!s||s.status!=='SUBMITTED'){await answer(env,callback.id,'Ya procesado');return json({ok:true,handled:'platform_operator_observation_not_pending'});}
  if(String(s.submitter_id)===String(actorId)){await answer(env,callback.id,'Autoaprobación bloqueada');await writeAudit(env.DB,actorId,reporter,'APPROVE_PUBLIC_RESULT','public_result_submission',id,0,'self_approval_forbidden');return json({ok:true,handled:'platform_operator_observation_self_approval_denied'});}
  const existing=await getResult(env.DB,s.match_id,s.series_code);
  if(existing){
    await env.DB.prepare("UPDATE public_result_submissions SET status='SUPERSEDED',reviewed_by=?,reviewed_role='PLATFORM_OPERATOR',reviewed_club_id=NULL,reviewed_at=?,review_reason='canonical_result_already_exists',updated_at=? WHERE submission_id=? AND status='SUBMITTED'").bind(actorId,new Date().toISOString(),new Date().toISOString(),id).run();
    await answer(env,callback.id,'No reemplaza oficial');
    return json({ok:true,handled:'platform_operator_observation_existing_guard'});
  }
  const now=new Date().toISOString(),resultId=`${s.match_id}-${s.series_code}`,eventId=`po-approve-${id}`;
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO match_series_results (result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,created_at,updated_at,governance_version) VALUES (?,?,?,?,?,'VERIFIED','TELEGRAM_OBSERVATION_APPROVED','Fútbol Chépica · observación aprobada',?,?,?,1)`).bind(resultId,s.match_id,s.series_code,s.home_score,s.away_score,id,now,now),
      env.DB.prepare(`UPDATE match_series_result_versions SET actor_id=?,actor_role='PLATFORM_OPERATOR',actor_club_id=NULL WHERE version_id=? AND action='BASELINE' AND actor_id IS NULL`).bind(actorId,`${s.match_id}:${s.series_code}:v1`),
      env.DB.prepare("UPDATE public_result_submissions SET status='APPROVED',reviewed_by=?,reviewed_role='PLATFORM_OPERATOR',reviewed_club_id=NULL,reviewed_at=?,review_reason='platform_operator_approved',updated_at=? WHERE submission_id=? AND status='SUBMITTED'").bind(actorId,now,now,id),
      env.DB.prepare("UPDATE public_result_submissions SET status='SUPERSEDED',reviewed_by=?,reviewed_role='PLATFORM_OPERATOR',reviewed_club_id=NULL,reviewed_at=?,review_reason='another_submission_approved',updated_at=? WHERE match_id=? AND series_code=? AND status='SUBMITTED' AND submission_id<>?").bind(actorId,now,now,s.match_id,s.series_code,id),
      auditStmt(env.DB,`${eventId}-audit`,actorId,reporter,'APPROVE_PUBLIC_RESULT','public_result_submission',id,1,'platform_operator_approved_observation',now)
    ]);
  }catch(error){
    const appeared=await getResult(env.DB,s.match_id,s.series_code);
    if(appeared){await answer(env,callback.id,'Ya existe oficial');return json({ok:true,handled:'platform_operator_observation_concurrency_guard'});}
    throw error;
  }
  await answer(env,callback.id,'Aprobado');
  await send(env,chatId,`✅ OBSERVACIÓN APROBADA\n\n${s.home_name} ${s.home_score}-${s.away_score} ${s.away_name}\nSerie: ${SERIES_LABEL[s.series_code]}\nSe convirtió en el primer resultado oficial.`,{inline_keyboard:[[{text:'🛡 Abrir resultado',callback_data:`po:series:${s.match_id}:${s.series_code}`}]]});
  await send(env,s.submitter_id,'✅ Tu observación fue aprobada y pasó a ser resultado oficial.');
  return json({ok:true,handled:'platform_operator_observation_approved'});
}

async function rejectObservation(env,chatId,callback,actorId,reporter,id){
  const s=await getObservation(env.DB,id);
  if(!s||s.status!=='SUBMITTED'){await answer(env,callback.id,'Ya procesado');return json({ok:true,handled:'platform_operator_observation_not_pending'});}
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE public_result_submissions SET status='REJECTED',reviewed_by=?,reviewed_role='PLATFORM_OPERATOR',reviewed_club_id=NULL,reviewed_at=?,review_reason='platform_operator_rejected',updated_at=? WHERE submission_id=? AND status='SUBMITTED'").bind(actorId,now,now,id),
    auditStmt(env.DB,`po-reject-${id}`,actorId,reporter,'REJECT_PUBLIC_RESULT','public_result_submission',id,1,'platform_operator_rejected_observation',now)
  ]);
  await answer(env,callback.id,'Rechazado');
  await send(env,chatId,'❌ Observación rechazada. No se modificó el estado canónico.',{inline_keyboard:[[{text:'⬅️ Pendientes',callback_data:'po:pending'}]]});
  await send(env,s.submitter_id,'❌ Tu observación fue revisada y rechazada. No modificó el resultado oficial.');
  return json({ok:true,handled:'platform_operator_observation_rejected'});
}

async function showAccessRequests(env,chatId){
  const q=await env.DB.prepare("SELECT a.*,t.canonical_name FROM access_requests a LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.status='PENDING' ORDER BY a.created_at LIMIT 30").all();
  const rows=(q.results||[]).map(r=>[{text:`🟡 ${r.canonical_name||r.requested_club_id} · ${r.display_name||r.telegram_user_id}`,callback_data:`tp:review:${r.request_id}`}]);
  rows.push([{text:'⬅️ Administración',callback_data:'po:home'}]);
  await send(env,chatId,`🔔 SOLICITUDES DE ACCESO\n\n${q.results?.length||0} solicitud(es) pendiente(s). El operador sólo puede aprobar acceso CLUB_ADMIN; no puede crear SUPER_ADMIN.`,{inline_keyboard:rows});
}

async function showAccessRequest(env,chatId,id){
  const r=await env.DB.prepare("SELECT a.*,t.canonical_name FROM access_requests a LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.request_id=?").bind(id).first();
  if(!r){await send(env,chatId,'Solicitud no encontrada.');return;}
  const rows=[];
  if(r.status==='PENDING'&&r.requested_role==='CLUB_ADMIN') rows.push([{text:'✅ Aprobar CLUB_ADMIN',callback_data:`tp:approve:${id}`}]);
  if(r.status==='PENDING') rows.push([{text:'❌ Rechazar',callback_data:`tp:reject:${id}`}]);
  rows.push([{text:'⬅️ Solicitudes',callback_data:'po:requests'}]);
  await send(env,chatId,`🧾 SOLICITUD DE ACCESO\n\nPersona: ${r.display_name||r.telegram_user_id}\nClub: ${r.canonical_name||r.requested_club_id}\nRol solicitado: ${r.requested_role}\nEstado: ${r.status}`,{inline_keyboard:rows});
}

async function approveAccess(env,chatId,callback,actorId,reporter,id){
  const r=await env.DB.prepare("SELECT * FROM access_requests WHERE request_id=? AND status='PENDING'").bind(id).first();
  if(!r){await answer(env,callback.id,'Ya procesada');return json({ok:true,handled:'platform_operator_access_not_pending'});}
  if(r.requested_role!=='CLUB_ADMIN'){
    await writeAudit(env.DB,actorId,reporter,'APPROVE_ACCESS','access_request',id,0,'platform_operator_role_boundary');
    await answer(env,callback.id,'Rol fuera de alcance');
    return json({ok:true,handled:'platform_operator_access_role_boundary'});
  }
  const target=await env.DB.prepare('SELECT role FROM reporters WHERE telegram_user_id=?').bind(r.telegram_user_id).first();
  if(['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(target?.role)){
    await writeAudit(env.DB,actorId,reporter,'APPROVE_CLUB_ADMIN','access_request',id,0,'cannot_demote_privileged_identity');
    await answer(env,callback.id,'Identidad privilegiada');
    return json({ok:true,handled:'platform_operator_access_privileged_guard'});
  }
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE access_requests SET status='APPROVED',reviewed_by=?,reviewed_at=?,review_note='platform_operator_approved' WHERE request_id=? AND status='PENDING'").bind(actorId,now,id),
    env.DB.prepare("UPDATE reporters SET club_id=?,role='CLUB_ADMIN',trust_level='VERIFIED',active=1,updated_at=? WHERE telegram_user_id=? AND role NOT IN ('SUPER_ADMIN','PLATFORM_OPERATOR')").bind(r.requested_club_id,now,r.telegram_user_id),
    auditStmt(env.DB,`po-access-${id}-approve`,actorId,reporter,'APPROVE_CLUB_ADMIN','access_request',id,1,'platform_operator_approved_enrollment',now)
  ]);
  await answer(env,callback.id,'Aprobado');
  await send(env,chatId,'✅ Acceso CLUB_ADMIN aprobado.');
  await send(env,r.telegram_user_id,'✅ Tu acceso de dirigente fue aprobado por la administración del campeonato.');
  return json({ok:true,handled:'platform_operator_access_approved'});
}

async function rejectAccess(env,chatId,callback,actorId,reporter,id){
  const r=await env.DB.prepare("SELECT * FROM access_requests WHERE request_id=? AND status='PENDING'").bind(id).first();
  if(!r){await answer(env,callback.id,'Ya procesada');return json({ok:true,handled:'platform_operator_access_not_pending'});}
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE access_requests SET status='REJECTED',reviewed_by=?,reviewed_at=?,review_note='platform_operator_rejected' WHERE request_id=? AND status='PENDING'").bind(actorId,now,id),
    auditStmt(env.DB,`po-access-${id}-reject`,actorId,reporter,'REJECT_CLUB_ADMIN','access_request',id,1,'platform_operator_rejected_enrollment',now)
  ]);
  await answer(env,callback.id,'Rechazado');
  await send(env,chatId,'❌ Solicitud rechazada.');
  await send(env,r.telegram_user_id,'❌ Tu solicitud de acceso de dirigente fue rechazada por la administración del campeonato.');
  return json({ok:true,handled:'platform_operator_access_rejected'});
}

async function showClubAdmins(env,chatId){
  const q=await env.DB.prepare(`SELECT r.*,t.canonical_name FROM reporters r LEFT JOIN teams t ON t.team_id=r.club_id WHERE r.role='CLUB_ADMIN' ORDER BY COALESCE(t.canonical_name,r.club_id),r.active DESC,COALESCE(r.display_name,r.telegram_user_id) LIMIT 50`).all();
  const rows=(q.results||[]).map(r=>[{text:`${Number(r.active)===1?'✅':'⏸'} ${r.canonical_name||r.club_id} · ${r.display_name||r.telegram_user_id}`,callback_data:`tp:admin:${r.telegram_user_id}`}]);
  rows.push([{text:'⬅️ Administración',callback_data:'po:home'}]);
  await send(env,chatId,`👥 DIRIGENTES\n\n${q.results?.length||0} registro(s). El operador puede administrar CLUB_ADMIN, nunca SUPER_ADMIN.`,{inline_keyboard:rows});
}

async function showClubAdmin(env,chatId,id){
  const r=await getClubAdmin(env.DB,id);
  if(!r){await send(env,chatId,'El usuario ya no figura como CLUB_ADMIN.');return;}
  const rows=[Number(r.active)===1?[{text:'⏸ Suspender',callback_data:`tp:admin-suspend:${id}`}]:[{text:'▶️ Reactivar',callback_data:`tp:admin-reactivate:${id}`}],[{text:'❌ Revocar acceso',callback_data:`tp:admin-revoke-confirm:${id}`}],[{text:'⬅️ Dirigentes',callback_data:'po:admins'}]];
  await send(env,chatId,`👤 DIRIGENTE\n\nNombre: ${r.display_name||id}\nClub: ${r.canonical_name||r.club_id}\nRol: CLUB_ADMIN\nEstado: ${Number(r.active)===1?'ACTIVO':'SUSPENDIDO'}`,{inline_keyboard:rows});
}

async function changeClubAdminLifecycle(env,chatId,callback,actorId,reporter,targetId,action){
  const t=await getClubAdmin(env.DB,targetId);
  if(!t) return missingTarget(env,chatId,callback);
  const now=new Date().toISOString(),eventId=`po-admin-${action.toLowerCase()}-${targetId}-${Date.now().toString(36)}`;
  if(action==='SUSPEND'){
    if(Number(t.active)!==1){await answer(env,callback.id,'Ya suspendido');return json({ok:true,handled:'platform_operator_admin_already_suspended'});}
    await env.DB.batch([env.DB.prepare("UPDATE reporters SET active=0,updated_at=? WHERE telegram_user_id=? AND role='CLUB_ADMIN' AND active=1").bind(now,targetId),env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(targetId),auditStmt(env.DB,`${eventId}-audit`,actorId,reporter,'SUSPEND_CLUB_ADMIN','reporter',targetId,1,'platform_operator_suspended_club_admin',now)]);
    await answer(env,callback.id,'Suspendido');await send(env,targetId,'⏸ Tu acceso de dirigente fue suspendido por la administración del campeonato.');
  }else if(action==='REACTIVATE'){
    if(Number(t.active)===1){await answer(env,callback.id,'Ya activo');return json({ok:true,handled:'platform_operator_admin_already_active'});}
    await env.DB.batch([env.DB.prepare("UPDATE reporters SET active=1,updated_at=? WHERE telegram_user_id=? AND role='CLUB_ADMIN' AND active=0").bind(now,targetId),auditStmt(env.DB,`${eventId}-audit`,actorId,reporter,'REACTIVATE_CLUB_ADMIN','reporter',targetId,1,'platform_operator_reactivated_club_admin',now)]);
    await answer(env,callback.id,'Reactivado');await send(env,targetId,'✅ Tu acceso de dirigente fue reactivado por la administración del campeonato.');
  }else{
    await env.DB.batch([env.DB.prepare("UPDATE reporters SET club_id=NULL,role='REPORTER',trust_level='PROVISIONAL',active=1,updated_at=? WHERE telegram_user_id=? AND role='CLUB_ADMIN'").bind(now,targetId),env.DB.prepare('DELETE FROM telegram_series_sessions WHERE telegram_user_id=?').bind(targetId),auditStmt(env.DB,`${eventId}-audit`,actorId,reporter,'REVOKE_CLUB_ADMIN','reporter',targetId,1,'platform_operator_revoked_club_admin',now)]);
    await answer(env,callback.id,'Revocado');await send(env,targetId,'❌ Tu acceso de dirigente fue revocado. Tu identidad e historial se conservan.');
  }
  await send(env,chatId,`✅ Operación ${action.toLowerCase()} aplicada a ${t.display_name||targetId}.`,{inline_keyboard:[[{text:'⬅️ Dirigentes',callback_data:'po:admins'}]]});
  return json({ok:true,handled:`platform_operator_admin_${action.toLowerCase()}`});
}

async function showRegistered(env,chatId){
  const q=await env.DB.prepare(`SELECT r.*,m.round_label,m.home_name,m.away_name FROM match_series_results r JOIN matches m ON m.match_id=r.match_id WHERE m.competition_id='ANFA-CHEPICA-2026' ORDER BY m.round_no DESC,m.match_id,r.series_code LIMIT 40`).all();
  const lines=(q.results||[]).map(r=>`${statusIcon(r.validation_status)} ${r.round_label} · ${SERIES_LABEL[r.series_code]} · ${r.home_name} ${r.home_score}-${r.away_score} ${r.away_name}`);
  await send(env,chatId,`📋 RESULTADOS REGISTRADOS\n\n${lines.length?lines.join('\n'):'Sin resultados.'}`,{inline_keyboard:[[{text:'🛡 Gobierno de resultados',callback_data:'po:results'}],[{text:'⬅️ Administración',callback_data:'po:home'}]]});
}

async function startResultSession(db,actorId,chatId,matchId,seriesCode,action,baseVersion){
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO telegram_operational_result_sessions (telegram_user_id,chat_id,match_id,series_code,action,phase,home_score,away_score,reason,base_version,created_at,updated_at) VALUES (?,?,?,?,?,'HOME_SCORE',NULL,NULL,NULL,?,?,?) ON CONFLICT(telegram_user_id) DO UPDATE SET chat_id=excluded.chat_id,match_id=excluded.match_id,series_code=excluded.series_code,action=excluded.action,phase='HOME_SCORE',home_score=NULL,away_score=NULL,reason=NULL,base_version=excluded.base_version,updated_at=excluded.updated_at`).bind(actorId,String(chatId),matchId,seriesCode,action,baseVersion,now,now).run();
}
async function getOperationalSession(db,id){return db.prepare('SELECT * FROM telegram_operational_result_sessions WHERE telegram_user_id=?').bind(id).first();}
async function clearOperationalSession(db,id){await db.prepare('DELETE FROM telegram_operational_result_sessions WHERE telegram_user_id=?').bind(id).run();}
async function getMatch(db,id){return db.prepare("SELECT match_id,competition_id,season_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name FROM matches WHERE match_id=? AND competition_id='ANFA-CHEPICA-2026'").bind(id).first();}
async function getResult(db,matchId,seriesCode){return db.prepare('SELECT * FROM match_series_results WHERE match_id=? AND series_code=?').bind(matchId,seriesCode).first();}
async function getObservation(db,id){return db.prepare(`SELECT s.*,m.home_name,m.away_name,m.round_label,m.group_id,m.competition_id,m.season_id FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.submission_id=?`).bind(id).first();}
async function getClubAdmin(db,id){return db.prepare(`SELECT r.*,t.canonical_name FROM reporters r LEFT JOIN teams t ON t.team_id=r.club_id WHERE r.telegram_user_id=? AND r.role='CLUB_ADMIN'`).bind(String(id)).first();}

function eventStmt(db,eventId,eventType,match,actorId,reporter,status,payload){return db.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)`).bind(eventId,eventType,new Date().toISOString(),new Date().toISOString(),match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name||actorId,status,JSON.stringify(payload));}
function auditStmt(db,id,actorId,reporter,action,type,resource,allowed,reason,now){return db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,? ,NULL,?,?,?,?,?,?)`).bind(id,actorId,reporter.role,action,type,resource,allowed,reason,now);}
function eventConditionalStmt(db,eventId,eventType,match,actorId,reporter,status,payload,resultId,version,sourceRef){return db.prepare(`INSERT OR REPLACE INTO events (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json) SELECT ?,?,?,?,?,?,?,?, ?,NULL,?,? WHERE EXISTS (SELECT 1 FROM match_series_results WHERE result_id=? AND governance_version=? AND source_ref=?)`).bind(eventId,eventType,new Date().toISOString(),new Date().toISOString(),match.competition_id,match.season_id,match.match_id,actorId,reporter.display_name||actorId,status,JSON.stringify(payload),resultId,version,sourceRef);}
function auditConditionalStmt(db,id,actorId,reporter,action,type,resource,allowed,reason,now,resultId,version,sourceRef){return db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) SELECT ?,?,?,NULL,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM match_series_results WHERE result_id=? AND governance_version=? AND source_ref=?)`).bind(id,actorId,reporter.role,action,type,resource,allowed,reason,now,resultId,version,sourceRef);}
async function writeAudit(db,actorId,reporter,action,type,resource,allowed,reason){await auditStmt(db,`po-audit-${action}-${resource||'none'}-${Date.now().toString(36)}`,actorId,reporter,action,type,resource,allowed,reason,new Date().toISOString()).run();}

function statusIcon(s){return s==='DISPUTED'?'⚠️':s==='ANNULLED'?'🚫':'✅';}
function statusLabel(s){return s==='DISPUTED'?'EN DISPUTA':s==='ANNULLED'?'ANULADO':'OFICIAL';}
async function invalidMatch(env,chatId,callback){if(callback)await answer(env,callback.id,'Partido no válido');await send(env,chatId,'Partido fuera del alcance operativo.');return json({ok:true,handled:'platform_operator_invalid_match'});}
async function invalidResult(env,chatId,callback){if(callback)await answer(env,callback.id,'Resultado no disponible');await send(env,chatId,'El resultado ya no está disponible.');return json({ok:true,handled:'platform_operator_invalid_result'});}
async function missingTarget(env,chatId,callback){if(callback)await answer(env,callback.id,'No disponible');await send(env,chatId,'El usuario ya no figura como CLUB_ADMIN.');return json({ok:true,handled:'platform_operator_admin_missing'});}
async function stale(env,chatId,callback){if(callback)await answer(env,callback.id,'Sesión vencida');await send(env,chatId,'⚠️ Esa selección ya no está activa. Vuelve al Gobierno de Resultados.',{inline_keyboard:[[{text:'🛡 Gobierno de resultados',callback_data:'po:results'}]]});return json({ok:true,handled:'platform_operator_stale_session'});}
async function answer(env,id,text){if(!id)return;await telegram(env,'answerCallbackQuery',{callback_query_id:id,text:String(text).slice(0,180)});}
async function send(env,chatId,text,replyMarkup=null){const body={chat_id:chatId,text};if(replyMarkup)body.reply_markup=replyMarkup;await telegram(env,'sendMessage',body);}
async function telegram(env,method,body){return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
