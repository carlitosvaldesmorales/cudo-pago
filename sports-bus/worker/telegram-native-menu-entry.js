const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

export const TELEGRAM_MENU_VERSION=1;
export const PUBLIC_NATIVE_COMMANDS=[
  {command:'inicio',description:'Abrir Fútbol Chépica'},
  {command:'publico',description:'Partidos y resultados públicos'},
  {command:'dirigentes',description:'Acceso de dirigentes'}
];

const CLUB_ADMIN_COMMANDS=[
  {command:'inicio',description:'Abrir menú de mi club'},
  {command:'mispartidos',description:'Ver mis partidos'},
  {command:'pendientes',description:'Resultados por revisar'},
  {command:'resultados',description:'Resultados registrados'},
  {command:'correcciones',description:'Disputas y correcciones'},
  {command:'publico',description:'Vista pública'}
];

const SUPER_ADMIN_COMMANDS=[
  {command:'inicio',description:'Abrir administración global'},
  {command:'solicitudes',description:'Solicitudes de dirigentes'},
  {command:'dirigentes',description:'Administrar dirigentes'},
  {command:'pendientes',description:'Resultados por revisar'},
  {command:'correcciones',description:'Gobierno de resultados'},
  {command:'resultados',description:'Resultados registrados'}
];

export function nativeMenuProfile(reporter){
  if(reporter?.active===1&&reporter?.trust_level==='VERIFIED'&&reporter?.role==='SUPER_ADMIN') return 'SUPER_ADMIN';
  if(reporter?.active===1&&reporter?.trust_level==='VERIFIED'&&reporter?.role==='CLUB_ADMIN'&&reporter?.club_id) return 'CLUB_ADMIN';
  return 'PUBLIC';
}

export function nativeCommandsForProfile(profile){
  if(profile==='SUPER_ADMIN') return SUPER_ADMIN_COMMANDS;
  if(profile==='CLUB_ADMIN') return CLUB_ADMIN_COMMANDS;
  return PUBLIC_NATIVE_COMMANDS;
}

// Side effect only. It never consumes an update. If Telegram is temporarily unavailable,
// the user flow continues and the menu is retried on the next interaction.
export async function syncTelegramNativeMenu(request,env){
  try{
    const url=new URL(request.url);
    if(url.pathname!=='/webhook/telegram'||request.method!=='POST'||!env.DB||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET) return {ok:false,skipped:true};
    const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if(supplied!==env.TELEGRAM_WEBHOOK_SECRET) return {ok:false,skipped:true};
    const update=await request.json();
    const actor=update.message?.from||update.callback_query?.from;
    const chat=update.message?.chat||update.callback_query?.message?.chat;
    if(!actor?.id||!chat?.id||chat.type!=='private') return {ok:false,skipped:true};

    const actorId=String(actor.id);
    await upsertIdentity(env.DB,actorId,actor);
    const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
    const profile=nativeMenuProfile(reporter);
    const current=await env.DB.prepare('SELECT menu_profile,menu_version FROM telegram_menu_state WHERE telegram_user_id=?').bind(actorId).first();
    if(current?.menu_profile===profile&&Number(current?.menu_version)===TELEGRAM_MENU_VERSION) return {ok:true,profile,synced:false};

    const commands=nativeCommandsForProfile(profile);
    const [menuRes,commandsRes]=await Promise.all([
      telegram(env,'setChatMenuButton',{chat_id:chat.id,menu_button:{type:'commands'}}),
      telegram(env,'setMyCommands',{scope:{type:'chat',chat_id:chat.id},commands})
    ]);
    if(!menuRes.ok||!commandsRes.ok){
      console.error('telegram_native_menu_sync_failed',{profile,menu:menuRes,commands:commandsRes});
      return {ok:false,profile,synced:false};
    }
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO telegram_menu_state (telegram_user_id,menu_profile,menu_version,synced_at)
      VALUES (?,?,?,?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET menu_profile=excluded.menu_profile,menu_version=excluded.menu_version,synced_at=excluded.synced_at`)
      .bind(actorId,profile,TELEGRAM_MENU_VERSION,now).run();
    return {ok:true,profile,synced:true};
  }catch(error){
    console.error('telegram_native_menu_sync_exception',String(error?.message||error));
    return {ok:false,synced:false};
  }
}

// Direct commands shown by Telegram's native Menu button. Existing /dirigentes and
// /correcciones continue to be handled by their established modules.
export async function handleTelegramNativeMenuCommand(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;
  let update;
  try{update=await request.json();}catch{return null;}
  const message=update.message;
  const actor=message?.from;
  const chat=message?.chat;
  if(!actor?.id||!chat?.id||chat.type!=='private') return null;
  const text=String(message.text||'').trim();
  const match=text.match(/^\/(menu|inicio|publico|mispartidos|solicitudes|pendientes|resultados)(?:@\w+)?$/i);
  if(!match) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'telegram_native_menu_not_configured'},503);

  const actorId=String(actor.id);
  await upsertIdentity(env.DB,actorId,actor);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  const profile=nativeMenuProfile(reporter);
  const command=match[1].toLowerCase();

  if(command==='menu'||command==='inicio'){
    await showRoleHome(env,chat.id,reporter,profile);
    return json({ok:true,handled:'telegram_native_menu_home',profile});
  }
  if(command==='publico'){
    await send(env,chat.id,'🌐 FÚTBOL CHÉPICA · PÚBLICO\n\nConsulta información verificada o aporta un resultado para revisión.',{inline_keyboard:[
      [{text:'⚽ Resultados verificados',callback_data:'tp:public-results'}],
      [{text:'📝 Informar resultado',callback_data:'tp:public-report'}],
      [{text:'🔎 Mis aportes',callback_data:'pr:my'}],
      [{text:'🏠 Inicio',callback_data:'tp:home'}]
    ]});
    return json({ok:true,handled:'telegram_native_menu_public',profile});
  }
  if(command==='mispartidos'){
    if(!isVerifiedAdmin(reporter)||!reporter.club_id) return denied(env,chat.id,'Esta opción requiere una cuenta de dirigente activa.','telegram_native_menu_denied');
    const team=await env.DB.prepare('SELECT team_id,canonical_name,group_id FROM teams WHERE team_id=?').bind(reporter.club_id).first();
    if(!team) return denied(env,chat.id,'No encontré el club asociado a tu cuenta.','telegram_native_menu_missing_club');
    const q=await env.DB.prepare("SELECT match_id,round_no,round_label,home_name,away_name FROM matches WHERE competition_id='ANFA-CHEPICA-2026' AND (home_id=? OR away_id=?) ORDER BY round_no,match_id").bind(reporter.club_id,reporter.club_id).all();
    const buttons=(q.results||[]).map(m=>[{text:`${m.round_label} · ${m.home_name} vs ${m.away_name}`,callback_data:`rs:date:${m.round_no}`}]);
    buttons.push([{text:'🔐 Dirigentes',callback_data:'tp:leaders'}]);
    await send(env,chat.id,`⚽ MIS PARTIDOS\nClub: ${team.canonical_name}\nGrupo: ${team.group_id}\n\nSelecciona una fecha:`,{inline_keyboard:buttons});
    return json({ok:true,handled:'telegram_native_menu_my_matches',profile});
  }
  if(command==='solicitudes'){
    if(profile!=='SUPER_ADMIN') return denied(env,chat.id,'Sólo un administrador global puede revisar solicitudes de dirigentes.','telegram_native_menu_denied');
    const q=await env.DB.prepare("SELECT a.request_id,a.display_name,a.requested_club_id,t.canonical_name FROM access_requests a LEFT JOIN teams t ON t.team_id=a.requested_club_id WHERE a.status='PENDING' ORDER BY a.created_at LIMIT 20").all();
    const rows=(q.results||[]).map(r=>[{text:`${r.canonical_name||r.requested_club_id} · ${r.display_name||r.request_id}`,callback_data:`tp:review:${r.request_id}`}]);
    rows.push([{text:'🛡 Administración global',callback_data:'tp:leaders'}]);
    await send(env,chat.id,rows.length===1?'✅ No hay solicitudes de dirigentes pendientes.':'🔔 SOLICITUDES PENDIENTES\n\nSelecciona una solicitud para revisarla.',{inline_keyboard:rows});
    return json({ok:true,handled:'telegram_native_menu_access_requests',profile});
  }
  if(command==='pendientes'){
    if(!isVerifiedAdmin(reporter)) return denied(env,chat.id,'Esta opción requiere una cuenta de dirigente activa.','telegram_native_menu_denied');
    const sql=profile==='SUPER_ADMIN'
      ? `SELECT s.*,m.home_id,m.away_id,m.home_name,m.away_name,m.group_id,m.round_label FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' ORDER BY s.created_at LIMIT 30`
      : `SELECT s.*,m.home_id,m.away_id,m.home_name,m.away_name,m.group_id,m.round_label FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' AND (m.home_id=? OR m.away_id=?) ORDER BY s.created_at LIMIT 30`;
    const q=profile==='SUPER_ADMIN'?await env.DB.prepare(sql).all():await env.DB.prepare(sql).bind(reporter.club_id,reporter.club_id).all();
    const items=q.results||[];
    const rows=items.map(s=>[{text:`${s.round_label} · ${s.series_code} · ${s.home_score}-${s.away_score} · ${s.home_name} vs ${s.away_name}`,callback_data:`pr:review:${s.submission_id}`}]);
    rows.push([{text:'🔐 Dirigentes',callback_data:'tp:leaders'}]);
    await send(env,chat.id,items.length?`🟡 RESULTADOS PENDIENTES\n\n${items.length} aporte(s) dentro de tu alcance.`:'🟡 RESULTADOS PENDIENTES\n\nNo hay aportes pendientes dentro de tu alcance.',{inline_keyboard:rows});
    return json({ok:true,handled:'telegram_native_menu_pending_results',profile});
  }
  if(command==='resultados'){
    const params=[];
    let scope='';
    if(profile==='CLUB_ADMIN'){
      scope=' AND (m.home_id=? OR m.away_id=?)';
      params.push(reporter.club_id,reporter.club_id);
    }
    const q=await env.DB.prepare(`SELECT r.match_id,m.round_no,m.round_label,m.home_name,m.away_name,r.series_code,r.home_score,r.away_score FROM match_series_results r JOIN matches m ON m.match_id=r.match_id WHERE r.validation_status='VERIFIED'${scope} ORDER BY m.round_no DESC,r.match_id,r.series_code LIMIT 40`).bind(...params).all();
    const items=q.results||[];
    if(!items.length){
      await send(env,chat.id,'📋 RESULTADOS REGISTRADOS\n\nNo hay resultados verificados disponibles todavía.');
      return json({ok:true,handled:'telegram_native_menu_results',profile,count:0});
    }
    const lines=items.map(r=>`${r.round_label||'Fecha'} · ${r.series_code}\n${r.home_name} ${r.home_score}-${r.away_score} ${r.away_name}`);
    await send(env,chat.id,`📋 RESULTADOS REGISTRADOS\n\n${lines.join('\n\n')}`,{inline_keyboard:[[{text:profile==='PUBLIC'?'🌐 Público':'🔐 Dirigentes',callback_data:profile==='PUBLIC'?'tp:public':'tp:leaders'}]]});
    return json({ok:true,handled:'telegram_native_menu_results',profile,count:items.length});
  }
  return null;
}

async function showRoleHome(env,chatId,reporter,profile){
  if(profile==='SUPER_ADMIN'){
    const [requests,pending,active,total]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='PENDING'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM public_result_submissions WHERE status='SUBMITTED'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN' AND active=1").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM reporters WHERE role='CLUB_ADMIN'").first()
    ]);
    await send(env,chatId,`🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL\n\nSolicitudes: ${Number(requests?.n||0)}\nResultados por revisar: ${Number(pending?.n||0)}\nDirigentes activos: ${Number(active?.n||0)}/${Number(total?.n||0)}`,{inline_keyboard:[
      [{text:`🔔 Solicitudes (${Number(requests?.n||0)})`,callback_data:'tp:requests'}],
      [{text:`🟡 Resultados pendientes (${Number(pending?.n||0)})`,callback_data:'pr:pending'}],
      [{text:`👥 Dirigentes (${Number(active?.n||0)}/${Number(total?.n||0)})`,callback_data:'tp:admins'}],
      [{text:'🛡️ Correcciones y disputas',callback_data:'rg:list'}],
      [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
      [{text:'🌐 Vista pública',callback_data:'tp:public'}]
    ]});
    return;
  }
  if(profile==='CLUB_ADMIN'){
    const team=await env.DB.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(reporter.club_id).first();
    const pending=await env.DB.prepare(`SELECT COUNT(*) AS n FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE s.status='SUBMITTED' AND (m.home_id=? OR m.away_id=?)`).bind(reporter.club_id,reporter.club_id).first();
    await send(env,chatId,`🔐 FÚTBOL CHÉPICA · ${team?.canonical_name||reporter.club_id}\n\nAdministrador del club\nResultados por revisar: ${Number(pending?.n||0)}`,{inline_keyboard:[
      [{text:'⚽ Mis partidos',callback_data:'tp:mymatches'}],
      [{text:`🟡 Aportes pendientes (${Number(pending?.n||0)})`,callback_data:'pr:pending'}],
      [{text:'📋 Resultados registrados',callback_data:'tp:registered'}],
      [{text:'⚠️ Correcciones / disputas',callback_data:'rg:list'}],
      [{text:'🌐 Vista pública',callback_data:'tp:public'}]
    ]});
    return;
  }
  await send(env,chatId,'⚽ FÚTBOL CHÉPICA\n\n¿Qué quieres hacer?',{inline_keyboard:[
    [{text:'🌐 Ver fútbol de Chépica',callback_data:'tp:public'}],
    [{text:'🔐 Soy dirigente',callback_data:'tp:leaders'}]
  ]});
}

function isVerifiedAdmin(r){return !!r&&r.active===1&&r.trust_level==='VERIFIED'&&['SUPER_ADMIN','CLUB_ADMIN'].includes(r.role);}

async function denied(env,chatId,text,handled){
  await send(env,chatId,`🔒 ${text}`,{inline_keyboard:[[{text:'🏠 Inicio',callback_data:'tp:home'}]]});
  return json({ok:true,handled});
}

async function upsertIdentity(db,actorId,actor){
  const now=new Date().toISOString();
  await db.prepare(`INSERT INTO reporters (telegram_user_id,display_name,username,club_id,role,trust_level,active,created_at,updated_at)
    VALUES (?,?,?,NULL,'REPORTER','PROVISIONAL',1,?,?)
    ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`)
    .bind(actorId,displayName(actor),actor.username||null,now,now).run();
}

function displayName(actor){return [actor.first_name,actor.last_name].filter(Boolean).join(' ').trim()||actor.username||String(actor.id);}

async function telegram(env,method,body){
  const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try{return await response.json();}catch{return {ok:false};}
}

async function send(env,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await telegram(env,'sendMessage',body);
}
