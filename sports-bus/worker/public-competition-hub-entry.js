const PRIMARY='/webhook/telegram';
const NEXT='/webhook/telegram-next';

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{'content-type':'application/json; charset=utf-8'}
});

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function telegramContext(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,NEXT].includes(url.pathname)||request.method!=='POST') return null;
  if(!env.TELEGRAM_WEBHOOK_SECRET) return null;

  const isNext=url.pathname===NEXT;
  const secretSource=isNext?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await sha256Hex(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return {error:'unauthorized'};

  const token=isNext?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return {error:'telegram_bot_not_configured'};
  return {token};
}

async function callTelegram(token,method,body){
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({ok:false}));
  if(!response.ok||!payload?.ok) throw new Error(`telegram_${method}_failed`);
  return payload;
}

async function answer(token,callbackId,text){
  if(!callbackId) return;
  await callTelegram(token,'answerCallbackQuery',{callback_query_id:callbackId,text});
}

async function send(token,chatId,text,replyMarkup){
  await callTelegram(token,'sendMessage',{
    chat_id:chatId,
    text,
    reply_markup:replyMarkup
  });
}

export async function handlePublicCompetitionHubRequest(request,env){
  const url=new URL(request.url);
  if(![PRIMARY,NEXT].includes(url.pathname)||request.method!=='POST') return null;

  let update;
  try{update=await request.clone().json();}catch{return null;}
  const callback=update?.callback_query;
  const data=String(callback?.data||'');
  if(!['tp:public','tp:public-standings'].includes(data)) return null;

  const chatId=callback?.message?.chat?.id;
  if(!callback?.from?.id||!chatId) return null;

  const context=await telegramContext(request,env);
  if(context?.error==='unauthorized') return json({ok:false,error:'unauthorized'},401);
  if(context?.error) return json({ok:false,error:context.error},503);
  if(!context) return null;

  if(data==='tp:public'){
    await answer(context.token,callback.id,'Público');
    await send(
      context.token,
      chatId,
      '🌐 FÚTBOL CHÉPICA · PÚBLICO\n\nInformación oficial del campeonato.\n\nConsulta primero la información publicada. También puedes aportar un resultado para revisión.',
      {inline_keyboard:[
        [{text:'⚽ Resultados',callback_data:'tp:public-results'}],
        [{text:'🏆 Tabla de posiciones',callback_data:'tp:public-standings'}],
        [{text:'📝 Informar resultado',callback_data:'tp:public-report'}],
        [{text:'🔎 Mis aportes',callback_data:'pr:my'}],
        [{text:'🏠 Volver',callback_data:'tp:home'}]
      ]}
    );
    return json({ok:true,handled:'public_competition_hub'});
  }

  await answer(context.token,callback.id,'Tabla de posiciones');
  await send(
    context.token,
    chatId,
    '🏆 TABLA DE POSICIONES\n\nAún no se publica. Falta incorporar la regla oficial de clasificación del Campeonato ANFA Chépica 2026: estructura de la tabla, puntaje, desempates, WO y sanciones.\n\nNo calcularemos una tabla usando supuestos. Cuando exista la fuente oficial, la tabla se calculará únicamente desde resultados verificados.',
    {inline_keyboard:[
      [{text:'⚽ Resultados',callback_data:'tp:public-results'}],
      [{text:'🌐 Público',callback_data:'tp:public'}]
    ]}
  );
  return json({
    ok:true,
    handled:'public_standings_source_gap',
    blocker:'STANDINGS_RULES_SOURCE'
  });
}
