import { buildPublicStandings } from './public-standings-entry.js';
import { TELEGRAM_CHANNEL } from './telegram-channel-contract.js';

const PRIMARY=TELEGRAM_CHANNEL.LEGACY.webhook_path;
const NEXT=TELEGRAM_CHANNEL.CANONICAL.webhook_path;

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

  const isCanonical=url.pathname===NEXT;
  const secretSource=isCanonical?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await sha256Hex(secretSource);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return {error:'unauthorized'};

  const token=isCanonical?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return {error:'telegram_bot_not_configured'};
  return {token,channel_role:isCanonical?'CANONICAL':'LEGACY_COMPATIBILITY'};
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

function formatRows(championship){
  return championship.rows.map(row=>{
    const tie=row.tiebreak_status==='PLAYOFF_REQUIRED'?' ⚖️':'';
    const adjustment=row.adjustment_points
      ? ` · ajuste ${row.adjustment_points>0?'+':''}${row.adjustment_points}`
      : '';
    return `${row.position}. ${row.team_name} — ${row.points} pts${adjustment}${tie}`;
  }).join('\n');
}

function formatStandings(standings){
  const blocks=[
    '🏆 CAMPEONATOS · ANFA CHÉPICA 2026',
    '',
    '⚽ CAMPEONATO PRINCIPAL',
    '3ª + 2ª + 1ª · máximo 9 puntos por jornada',
    ''
  ];

  for(const group of standings.groups){
    const principal=group.championships.find(item=>item.championship_code==='PRINCIPAL');
    blocks.push(`GRUPO ${group.group_id}`);
    blocks.push(formatRows(principal));
    blocks.push('');
  }

  blocks.push('👴 CAMPEONATO SENIOR · INDEPENDIENTE');
  blocks.push('Senior tiene su propia clasificación y no suma a los 9 puntos del Campeonato Principal.');
  blocks.push('');

  for(const group of standings.groups){
    const senior=group.championships.find(item=>item.championship_code==='SENIOR');
    blocks.push(`GRUPO ${group.group_id}`);
    blocks.push(formatRows(senior));
    blocks.push('');
  }

  blocks.push('⚖️ Igualdad no resuelta por puntaje entre los clubes: definición por partido único.');
  blocks.push('Sólo resultados verificados modifican las clasificaciones.');
  return blocks.join('\n').trim();
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
      '🌐 FÚTBOL CHÉPICA · PÚBLICO\n\nInformación oficial del Campeonato Principal y del Campeonato Senior.\n\nConsulta primero la información publicada. También puedes aportar un resultado para revisión.',
      {inline_keyboard:[
        [{text:'⚽ Resultados',callback_data:'tp:public-results'}],
        [{text:'🏆 Tablas de posiciones',callback_data:'tp:public-standings'}],
        [{text:'📝 Informar resultado',callback_data:'tp:public-report'}],
        [{text:'🔎 Mis aportes',callback_data:'pr:my'}],
        [{text:'🏠 Volver',callback_data:'tp:home'}]
      ]}
    );
    return json({ok:true,handled:'public_competition_hub',channel_role:context.channel_role});
  }

  await answer(context.token,callback.id,'Tablas de posiciones');
  if(!env.DB){
    await send(context.token,chatId,'⚠️ Las tablas no están disponibles temporalmente: persistencia no configurada.',{
      inline_keyboard:[[{text:'🌐 Público',callback_data:'tp:public'}]]
    });
    return json({ok:false,error:'persistence_not_configured'},503);
  }

  try{
    const standings=await buildPublicStandings(env);
    await send(
      context.token,
      chatId,
      formatStandings(standings),
      {inline_keyboard:[
        [{text:'⚽ Resultados',callback_data:'tp:public-results'}],
        [{text:'🌐 Público',callback_data:'tp:public'}]
      ]}
    );
    return json({
      ok:true,
      handled:'public_standings',
      contract:standings.contract,
      groups:standings.groups.length,
      channel_role:context.channel_role
    });
  }catch(error){
    await send(context.token,chatId,'⚠️ No fue posible calcular las tablas desde los resultados verificados. No se publicaron posiciones parciales inventadas.',{
      inline_keyboard:[[{text:'🌐 Público',callback_data:'tp:public'}]]
    });
    return json({ok:false,error:'standings_build_failed'},500);
  }
}
