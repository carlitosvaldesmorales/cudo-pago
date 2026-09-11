import { CAPABILITY, getActivePartnerMembership, hasCapability, getPartnerCoverageAssignment } from './access-control.js';

const PARTNER_CODE='CHEPICA_PLAY';
const PARTNER_NAME='Chépica Play';
const COMPETITION_ID='ANFA-CHEPICA-2026';
const SERIES_ORDER=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// MEDIA-PARTNER-CORRESPONDENTS-HUB-03
// Chépica Play is the persistent organization/concentrator.
// Members are human correspondents. Coverage belongs to the organization;
// operational write scope belongs to explicitly assigned correspondents.
export async function handleMediaPartnerCorrespondentRequest(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.clone().json();}catch{return null;}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const relevant=/^\/partner(?:@\w+)?$/i.test(text)||[
    'mp:home','mp:hub','mp:coverage','mp:mycoverages'
  ].includes(data)||/^mp:coverage:(make|staff|assign-member|release-member):/.test(data)||/^mp:coverage-(open|live|close):/.test(data);
  if(!relevant) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'media_partner_correspondents_not_configured'},503);

  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=? AND active=1').bind(actorId).first();

  if(data==='mp:coverage'){
    if(!canManagePartners(reporter)) return null;
    await answer(env,callback.id,'Coberturas');
    await showCoverageManagement(env,chatId);
    return json({ok:true,handled:'media_partner_correspondent_coverage_management'});
  }

  const coverageMake=data.match(/^mp:coverage:make:([A-Za-z0-9._:-]+)$/);
  if(coverageMake){
    if(!canManagePartners(reporter)) return null;
    const match=await getMatch(env.DB,coverageMake[1]);
    if(!match||match.competition_id!==COMPETITION_ID){
      await answer(env,callback.id,'Partido no válido');
      return json({ok:true,handled:'media_partner_correspondent_invalid_match'});
    }
    const now=new Date().toISOString(),coverageId=`mpc-${PARTNER_CODE}-${match.match_id}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partner_match_coverages (coverage_id,partner_code,competition_id,match_id,status,assigned_by,assigned_at,updated_at)
        VALUES (?,?,?,?,'ASSIGNED',?,?,?)
        ON CONFLICT(partner_code,match_id) DO UPDATE SET status='ASSIGNED',assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,started_at=NULL,ended_at=NULL,updated_at=excluded.updated_at`)
        .bind(coverageId,PARTNER_CODE,COMPETITION_ID,match.match_id,actorId,now,now),
      auditStmt(env.DB,`mp-org-coverage-${coverageId}-${Date.now()}`,actorId,reporter,'ASSIGN_MEDIA_PARTNER_ORG_COVERAGE','match',match.match_id,1,'organization_coverage_created_before_human_assignment',now)
    ]);
    await answer(env,callback.id,'Cobertura creada');
    await showCoverageStaffing(env,chatId,match.match_id);
    return json({ok:true,handled:'media_partner_organization_coverage_created',match_id:match.match_id,coverage_id:coverageId});
  }

  const staffing=data.match(/^mp:coverage:staff:([A-Za-z0-9._:-]+)$/);
  if(staffing){
    if(!canManagePartners(reporter)) return null;
    await answer(env,callback.id,'Corresponsales');
    await showCoverageStaffing(env,chatId,staffing[1]);
    return json({ok:true,handled:'media_partner_coverage_staffing'});
  }

  const assignMember=data.match(/^mp:coverage:assign-member:([A-Za-z0-9._:-]+):(\d+)$/);
  if(assignMember){
    if(!canManagePartners(reporter)) return null;
    const [,matchId,memberId]=assignMember;
    const [coverage,membership]=await Promise.all([
      getCoverageAny(env.DB,PARTNER_CODE,matchId),
      getActivePartnerMembership(env.DB,memberId,COMPETITION_ID)
    ]);
    if(!coverage||!membership||membership.partner_code!==PARTNER_CODE){
      await answer(env,callback.id,'Asignación no válida');
      return json({ok:true,handled:'media_partner_correspondent_assignment_invalid'});
    }
    const now=new Date().toISOString();
    const assignmentId=`mpa-${coverage.coverage_id}-${memberId}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partner_coverage_assignments
        (assignment_id,coverage_id,partner_code,telegram_user_id,status,assigned_by,assigned_at,updated_at)
        VALUES (?,?,?,?,'ACTIVE',?,?,?)
        ON CONFLICT(coverage_id,telegram_user_id) DO UPDATE SET status='ACTIVE',assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at,released_by=NULL,released_at=NULL,updated_at=excluded.updated_at`)
        .bind(assignmentId,coverage.coverage_id,PARTNER_CODE,memberId,actorId,now,now),
      auditStmt(env.DB,`mp-correspondent-assign-${coverage.coverage_id}-${memberId}-${Date.now()}`,actorId,reporter,'ASSIGN_MEDIA_PARTNER_CORRESPONDENT','match',matchId,1,'human_correspondent_assigned_to_org_coverage',now)
    ]);
    const member=await env.DB.prepare('SELECT display_name FROM reporters WHERE telegram_user_id=?').bind(memberId).first();
    await answer(env,callback.id,'Corresponsal asignado');
    await send(env,memberId,`🎥 ${PARTNER_NAME} · NUEVA COBERTURA\n\nFuiste asignado como corresponsal a una cobertura.\n\nEntra a Mis coberturas para operar sólo los partidos que te correspondan.`,{inline_keyboard:[[{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],[{text:'📊 Concentrador',callback_data:'mp:hub'}]]});
    await send(env,chatId,`✅ Corresponsal asignado: ${member?.display_name||memberId}\n\nLa organización conserva la cobertura; esta identidad obtiene sólo el alcance operacional de ese partido.`,{inline_keyboard:[[{text:'👥 Ver corresponsales',callback_data:`mp:coverage:staff:${matchId}`}],[{text:'🎥 Coberturas',callback_data:'mp:coverage'}]]});
    return json({ok:true,handled:'media_partner_correspondent_assigned',match_id:matchId,telegram_user_id:memberId,assignment_id:assignmentId});
  }

  const releaseMember=data.match(/^mp:coverage:release-member:([A-Za-z0-9._:-]+):(\d+)$/);
  if(releaseMember){
    if(!canManagePartners(reporter)) return null;
    const [,matchId,memberId]=releaseMember;
    const coverage=await getCoverageAny(env.DB,PARTNER_CODE,matchId);
    if(!coverage){await answer(env,callback.id,'Cobertura no válida');return json({ok:true,handled:'media_partner_correspondent_release_invalid'});}
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE partner_coverage_assignments SET status='RELEASED',released_by=?,released_at=?,updated_at=?
        WHERE coverage_id=? AND telegram_user_id=? AND status='ACTIVE'`).bind(actorId,now,now,coverage.coverage_id,memberId),
      auditStmt(env.DB,`mp-correspondent-release-${coverage.coverage_id}-${memberId}-${Date.now()}`,actorId,reporter,'RELEASE_MEDIA_PARTNER_CORRESPONDENT','match',matchId,1,'human_assignment_released_without_deleting_org_coverage',now)
    ]);
    await answer(env,callback.id,'Corresponsal liberado');
    await showCoverageStaffing(env,chatId,matchId);
    return json({ok:true,handled:'media_partner_correspondent_released',match_id:matchId,telegram_user_id:memberId});
  }

  if(/^\/partner(?:@\w+)?$/i.test(text)||data==='mp:home'){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return null;
    if(callback) await answer(env,callback.id,PARTNER_NAME);
    await showPartnerHome(env,chatId,actorId,membership);
    return json({ok:true,handled:'media_partner_correspondent_home'});
  }

  if(data==='mp:hub'){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyMember(env,chatId,callback);
    await answer(env,callback.id,'Concentrador');
    await showResultsHub(env,chatId,membership);
    return json({ok:true,handled:'media_partner_results_hub'});
  }

  if(data==='mp:mycoverages'){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyMember(env,chatId,callback);
    await answer(env,callback.id,'Mis coberturas');
    await showMyCoverages(env,chatId,actorId,membership);
    return json({ok:true,handled:'media_partner_correspondent_my_coverages'});
  }

  const openCoverage=data.match(/^mp:coverage-open:([A-Za-z0-9._:-]+)$/);
  if(openCoverage){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyMember(env,chatId,callback);
    const [match,assignment]=await Promise.all([
      getMatch(env.DB,openCoverage[1]),
      getPartnerCoverageAssignment(env.DB,membership.partner_code,openCoverage[1],actorId)
    ]);
    if(!match||!assignment) return denyAssignment(env,chatId,callback);
    await answer(env,callback.id,'Cobertura');
    await showCorrespondentWorkspace(env,chatId,match,assignment);
    return json({ok:true,handled:'media_partner_correspondent_workspace',match_id:match.match_id,status:assignment.coverage_status});
  }

  const coverageState=data.match(/^mp:coverage-(live|close):([A-Za-z0-9._:-]+)$/);
  if(coverageState){
    const membership=await getActivePartnerMembership(env.DB,actorId,COMPETITION_ID);
    if(!membership) return denyMember(env,chatId,callback);
    const action=coverageState[1],matchId=coverageState[2];
    const assignment=await getPartnerCoverageAssignment(env.DB,membership.partner_code,matchId,actorId);
    if(!assignment) return denyAssignment(env,chatId,callback);
    const now=new Date().toISOString();
    if(action==='live'){
      await env.DB.prepare("UPDATE partner_match_coverages SET status='LIVE',started_at=COALESCE(started_at,?),ended_at=NULL,updated_at=? WHERE coverage_id=? AND status IN ('ASSIGNED','CLOSED')")
        .bind(now,now,assignment.coverage_id).run();
      await answer(env,callback.id,'Cobertura en vivo');
    }else{
      await env.DB.prepare("UPDATE partner_match_coverages SET status='CLOSED',ended_at=?,updated_at=? WHERE coverage_id=? AND status IN ('ASSIGNED','LIVE')")
        .bind(now,now,assignment.coverage_id).run();
      await answer(env,callback.id,'Cobertura finalizada');
    }
    const match=await getMatch(env.DB,matchId);
    const fresh=await getAssignmentAny(env.DB,assignment.coverage_id,actorId);
    await showCorrespondentWorkspace(env,chatId,match,{...fresh,coverage_status:action==='live'?'LIVE':'CLOSED'});
    return json({ok:true,handled:action==='live'?'media_partner_correspondent_live':'media_partner_correspondent_closed',match_id:matchId});
  }

  return null;
}

function canManagePartners(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&hasCapability(r,CAPABILITY.MANAGE_ACCESS)&&['SUPER_ADMIN','PLATFORM_OPERATOR'].includes(r.role);}

async function showCoverageManagement(env,chatId){
  const q=await env.DB.prepare(`SELECT c.*,m.round_label,m.group_id,m.home_name,m.away_name,
      (SELECT COUNT(*) FROM partner_coverage_assignments a WHERE a.coverage_id=c.coverage_id AND a.status='ACTIVE') correspondent_count
    FROM partner_match_coverages c JOIN matches m ON m.match_id=c.match_id
    WHERE c.partner_code=? ORDER BY CASE c.status WHEN 'LIVE' THEN 0 WHEN 'ASSIGNED' THEN 1 WHEN 'CLOSED' THEN 2 ELSE 3 END,m.round_no DESC,c.assigned_at DESC LIMIT 12`).bind(PARTNER_CODE).all();
  const rows=[[{text:'➕ Nueva cobertura',callback_data:'mp:coverage:add'}]];
  for(const c of q.results||[]){
    rows.push([{text:`${coverageIcon(c.status)} ${c.round_label} · ${short(c.home_name)} — ${short(c.away_name)} · 👤${Number(c.correspondent_count||0)}`,callback_data:`mp:coverage:staff:${c.match_id}`}]);
  }
  rows.push([{text:'⬅️ Colaboradores',callback_data:'mp:manage'}]);
  await send(env,chatId,`🎥 COBERTURAS · ${PARTNER_NAME}\n\nLa cobertura pertenece a la organización. Los corresponsales se asignan aparte y sólo ellos pueden registrar goles en ese partido.`,{inline_keyboard:rows});
}

async function showCoverageStaffing(env,chatId,matchId){
  const [match,coverage,members]=await Promise.all([
    getMatch(env.DB,matchId),
    getCoverageAny(env.DB,PARTNER_CODE,matchId),
    activeMembers(env.DB)
  ]);
  if(!match||!coverage){
    await send(env,chatId,'⚠️ Cobertura no disponible.');
    return;
  }
  const assignments=await env.DB.prepare(`SELECT a.*,r.display_name FROM partner_coverage_assignments a
    LEFT JOIN reporters r ON r.telegram_user_id=a.telegram_user_id
    WHERE a.coverage_id=? AND a.status='ACTIVE' ORDER BY a.assigned_at`).bind(coverage.coverage_id).all();
  const assignedIds=new Set((assignments.results||[]).map(a=>String(a.telegram_user_id)));
  const rows=[];
  for(const a of assignments.results||[]){
    rows.push([{text:`⛔ Quitar · ${short(a.display_name||a.telegram_user_id)}`,callback_data:`mp:coverage:release-member:${matchId}:${a.telegram_user_id}`}]);
  }
  for(const m of members){
    if(!assignedIds.has(String(m.telegram_user_id))) rows.push([{text:`➕ ${short(m.display_name||m.telegram_user_id)}`,callback_data:`mp:coverage:assign-member:${matchId}:${m.telegram_user_id}`}]);
  }
  rows.push([{text:'⬅️ Coberturas',callback_data:'mp:coverage'}]);
  const assignedText=(assignments.results||[]).length
    ? (assignments.results||[]).map(a=>`✅ ${a.display_name||a.telegram_user_id}`).join('\n')
    : '⚠️ Sin corresponsal asignado.';
  await send(env,chatId,`👥 CORRESPONSALES · ${PARTNER_NAME}\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\nCobertura organización: ${coverage.status}\n\n${assignedText}\n\nAsignar una persona no cambia su membresía ni la cobertura de la organización; sólo entrega scope operacional para este partido.`,{inline_keyboard:rows});
}

async function showPartnerHome(env,chatId,actorId,membership){
  const [myAssignments,orgCoverages,members]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) n FROM partner_coverage_assignments a JOIN partner_match_coverages c ON c.coverage_id=a.coverage_id
      WHERE a.partner_code=? AND a.telegram_user_id=? AND a.status='ACTIVE' AND c.status IN ('ASSIGNED','LIVE')`).bind(membership.partner_code,actorId).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM partner_match_coverages WHERE partner_code=? AND status IN ('ASSIGNED','LIVE')").bind(membership.partner_code).first(),
    activeMembers(env.DB)
  ]);
  await send(env,chatId,`📡 ${PARTNER_NAME} · CONCENTRADOR\n\nOrganización: ✅ ACTIVA\nCorresponsales activos: ${members.length}\nCoberturas organización: ${Number(orgCoverages?.n||0)}\nMis coberturas asignadas: ${Number(myAssignments?.n||0)}\n\nPuedes ver el concentrado completo de Chépica Play. Para registrar goles debes estar asignado personalmente a la cobertura.`,{inline_keyboard:[
    [{text:'📊 Concentrador de resultados',callback_data:'mp:hub'}],
    [{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],
    [{text:'🌐 Consultar campeonato',callback_data:'tp:public'}],
    [{text:'⚽ Resultados oficiales',callback_data:'tp:public-results'}],
    [{text:'🏠 Inicio',callback_data:'tp:home'}]
  ]});
}

async function showMyCoverages(env,chatId,actorId,membership){
  const q=await env.DB.prepare(`SELECT c.*,m.round_label,m.group_id,m.home_name,m.away_name,a.assignment_id
    FROM partner_coverage_assignments a
    JOIN partner_match_coverages c ON c.coverage_id=a.coverage_id
    JOIN matches m ON m.match_id=c.match_id
    WHERE a.partner_code=? AND a.telegram_user_id=? AND a.status='ACTIVE'
      AND c.status IN ('ASSIGNED','LIVE','CLOSED')
    ORDER BY CASE c.status WHEN 'LIVE' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,m.round_no DESC LIMIT 12`)
    .bind(membership.partner_code,actorId).all();
  const rows=(q.results||[]).map(c=>[{text:`${coverageIcon(c.status)} ${c.round_label} · ${short(c.home_name)} — ${short(c.away_name)}`,callback_data:`mp:coverage-open:${c.match_id}`}]);
  rows.push([{text:'📊 Concentrador',callback_data:'mp:hub'}]);
  rows.push([{text:'⬅️ Chépica Play',callback_data:'mp:home'}]);
  await send(env,chatId,`🎥 MIS COBERTURAS · ${PARTNER_NAME}\n\n${(q.results||[]).length?'Sólo aparecen las coberturas donde tú eres corresponsal asignado.':'Todavía no tienes coberturas asignadas.'}`,{inline_keyboard:rows});
}

async function showCorrespondentWorkspace(env,chatId,match,assignment){
  const status=assignment.coverage_status;
  const rows=[];
  if(status==='ASSIGNED'||status==='CLOSED') rows.push([{text:'🔴 Iniciar cobertura',callback_data:`mp:coverage-live:${match.match_id}`}]);
  if(status==='LIVE') rows.push([{text:'⚽ Registrar gol',callback_data:`mplive:event:${match.match_id}`}]);
  if(status==='LIVE') rows.push([{text:'🏁 Finalizar cobertura',callback_data:`mp:coverage-close:${match.match_id}`}]);
  rows.push([{text:'📊 Concentrador Chépica Play',callback_data:'mp:hub'}]);
  rows.push([{text:'⬅️ Mis coberturas',callback_data:'mp:mycoverages'}]);
  await send(env,chatId,`🎥 COBERTURA · ${PARTNER_NAME}\n\n${match.round_label} · Grupo ${match.group_id}\n${match.home_name} — ${match.away_name}\nEstado: ${status}\n\nTú eres el corresponsal asignado a este partido. Los goles quedan trazados con tu identidad + ${PARTNER_NAME} + esta cobertura.`,{inline_keyboard:rows});
}

async function showResultsHub(env,chatId,membership){
  const coverages=await env.DB.prepare(`SELECT c.*,m.round_no,m.round_label,m.group_id,m.home_name,m.away_name
    FROM partner_match_coverages c JOIN matches m ON m.match_id=c.match_id
    WHERE c.partner_code=? AND c.status<>'CANCELLED'
    ORDER BY CASE c.status WHEN 'LIVE' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,m.round_no DESC,c.updated_at DESC LIMIT 10`)
    .bind(membership.partner_code).all();
  const events=await env.DB.prepare(`SELECT event_id,match_id,actor_id,payload_json FROM events
    WHERE competition_id=? AND event_type='match.event.observed' ORDER BY occurred_at`).bind(COMPETITION_ID).all();

  const scores=new Map();
  for(const e of events.results||[]){
    let p; try{p=JSON.parse(String(e.payload_json||'{}'));}catch{continue;}
    if(p.partner_code!==membership.partner_code||p.event_kind!=='GOAL'||!SERIES_ORDER.includes(p.series_code)||!['HOME','AWAY'].includes(p.side)) continue;
    const key=`${e.match_id}|${p.series_code}`;
    const s=scores.get(key)||{home:0,away:0,actors:new Set()};
    if(p.side==='HOME') s.home+=1; else s.away+=1;
    s.actors.add(String(e.actor_id));
    scores.set(key,s);
  }

  const blocks=[];
  for(const c of coverages.results||[]){
    const lines=[];
    for(const series of SERIES_ORDER){
      const s=scores.get(`${c.match_id}|${series}`);
      if(s) lines.push(`${SERIES_LABEL[series]} ${s.home}–${s.away} · 👤${s.actors.size}`);
    }
    blocks.push(`${coverageIcon(c.status)} ${c.round_label} · ${c.home_name} — ${c.away_name}\n${lines.length?lines.join('\n'):'Sin goles registrados'}`);
  }
  const body=blocks.length?blocks.join('\n\n'):'Aún no hay coberturas de Chépica Play.';
  await send(env,chatId,`📊 CONCENTRADOR · ${PARTNER_NAME}\n\n${body}\n\nEstos marcadores se derivan sólo de goles observados por corresponsales de Chépica Play. No son automáticamente resultados oficiales. “Sin goles registrados” no se interpreta como 0–0.`,{inline_keyboard:[[{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],[{text:'⬅️ Chépica Play',callback_data:'mp:home'}]]});
}

async function activeMembers(db){
  const q=await db.prepare(`SELECT g.telegram_user_id,g.grant_id,r.display_name
    FROM actor_scope_grants g LEFT JOIN reporters r ON r.telegram_user_id=g.telegram_user_id
    WHERE g.role='MEDIA_PARTNER' AND g.scope_type='COMPETITION' AND g.scope_id=? AND g.partner_code=? AND g.active=1
    ORDER BY g.created_at`).bind(COMPETITION_ID,PARTNER_CODE).all();
  return q.results||[];
}
async function getCoverageAny(db,partnerCode,matchId){return db.prepare('SELECT * FROM partner_match_coverages WHERE partner_code=? AND match_id=? LIMIT 1').bind(partnerCode,matchId).first();}
async function getAssignmentAny(db,coverageId,actorId){return db.prepare("SELECT * FROM partner_coverage_assignments WHERE coverage_id=? AND telegram_user_id=? AND status='ACTIVE' LIMIT 1").bind(coverageId,actorId).first();}
async function getMatch(db,matchId){return db.prepare('SELECT match_id,competition_id,round_no,round_label,group_id,home_id,away_id,home_name,away_name FROM matches WHERE match_id=?').bind(matchId).first();}
function coverageIcon(status){return status==='LIVE'?'🔴':status==='ASSIGNED'?'🎥':status==='CLOSED'?'✅':'⛔';}
function short(value){const s=String(value||'');return s.length<=24?s:`${s.slice(0,21)}…`;}
async function denyMember(env,chatId,callback){if(callback)await answer(env,callback.id,'Sin vínculo');await send(env,chatId,`🔒 Tu identidad no pertenece actualmente a ${PARTNER_NAME}.`);return json({ok:true,handled:'media_partner_correspondent_member_denied'});}
async function denyAssignment(env,chatId,callback){if(callback)await answer(env,callback.id,'Sin asignación');await send(env,chatId,'🔒 Eres miembro de Chépica Play, pero no eres corresponsal asignado a esta cobertura.',{inline_keyboard:[[{text:'🎥 Mis coberturas',callback_data:'mp:mycoverages'}],[{text:'📊 Concentrador',callback_data:'mp:hub'}]]});return json({ok:true,handled:'media_partner_correspondent_assignment_denied'});}
function auditStmt(db,auditId,actorId,reporter,action,resourceType,resourceId,allowed,reason,createdAt){return db.prepare(`INSERT OR REPLACE INTO permission_audit (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(auditId,String(actorId),reporter?.role||'REPORTER',reporter?.club_id||null,action,resourceType,resourceId,allowed,reason,createdAt);}
async function send(env,chatId,text,replyMarkup=null){const body={chat_id:chatId,text};if(replyMarkup)body.reply_markup=replyMarkup;const res=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return res.json();}
async function answer(env,id,text){if(!id)return;await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});}
