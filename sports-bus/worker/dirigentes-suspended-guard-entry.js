const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});

// Prevents a suspended CLUB_ADMIN from using stale enrollment buttons to create
// a new access request. Suspension must only be resolved by a SUPER_ADMIN via
// the lifecycle flow; revocation deliberately returns the identity to REPORTER,
// which may request access again later.
export async function handleSuspendedDirigenteGuard(request, env) {
  const url=new URL(request.url);
  if(url.pathname!=='/webhook/telegram'||request.method!=='POST') return null;

  let update;
  try{update=await request.json();}catch{return null;}

  const message=update.message;
  const callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;

  const text=String(message?.text||'').trim();
  const callbackData=String(callback?.data||'');
  const leadersCommand=/^\/dirigentes(?:@\w+)?$/i.test(text);
  const guardedCallback=callbackData==='tp:leaders'||callbackData==='tp:req'||callbackData.startsWith('tp:reqclub:');
  if(!leadersCommand&&!guardedCallback) return null;

  const supplied=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if(!env.TELEGRAM_WEBHOOK_SECRET||supplied!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false,error:'unauthorized'},401);
  if(!env.DB||!env.TELEGRAM_BOT_TOKEN) return json({ok:false,error:'suspended_guard_not_configured'},503);

  const actorId=String(actor.id);
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(actorId).first();
  const suspendedClubAdmin=!!reporter&&reporter.role==='CLUB_ADMIN'&&reporter.active!==1;
  if(!suspendedClubAdmin) return null;

  const team=reporter.club_id
    ? await env.DB.prepare('SELECT canonical_name FROM teams WHERE team_id=?').bind(reporter.club_id).first()
    : null;

  if(callback) await answerCallback(env,callback.id,'Acceso suspendido');
  await send(env,chatId,
    `⏸ ACCESO DE DIRIGENTE SUSPENDIDO\n\nClub: ${team?.canonical_name||reporter.club_id||'Sin club'}\n\nNo puedes usar funciones administrativas ni generar una nueva solicitud mientras tu acceso siga suspendido. Un administrador global debe reactivarlo o revocarlo.\n\nLas funciones públicas siguen disponibles.`,
    {inline_keyboard:[[{text:'🏠 Inicio',callback_data:'tp:home'}]]}
  );
  return json({ok:true,handled:'suspended_club_admin_guard',club_id:reporter.club_id||null});
}

async function send(env,chatId,text,replyMarkup){
  const body={chat_id:chatId,text};
  if(replyMarkup) body.reply_markup=replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

async function answerCallback(env,id,text){
  if(!id) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});
}
