const QA_COMPETITION_ID='CUDO-QA-RESULT-GOVERNANCE';
const QA_MATCH_ID='QA-RG-MUTATION-01';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function slot(url){return url.pathname==='/webhook/telegram-next'?'next':'primary'}
function isVerifiedAdmin(r){return !!r&&Number(r.active)===1&&r.trust_level==='VERIFIED'&&['SUPER_ADMIN','CLUB_ADMIN'].includes(r.role)}
function isSuperAdmin(r){return isVerifiedAdmin(r)&&r.role==='SUPER_ADMIN'}
function stateIcon(statuses){
  if(statuses.includes('DISPUTED')) return '⚠️';
  if(statuses.includes('ANNULLED')) return '🚫';
  return '✅';
}

async function deriveSecret(source){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function telegram(token,method,body){
  return fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
async function present(token,chatId,callback,text,replyMarkup){
  const body={chat_id:chatId,text,parse_mode:'HTML',reply_markup:replyMarkup};
  if(callback?.message?.message_id){
    const res=await telegram(token,'editMessageText',{...body,message_id:callback.message.message_id});
    if(res.ok){
      if(callback.id) await telegram(token,'answerCallbackQuery',{callback_query_id:callback.id});
      return;
    }
    let description='';
    try{description=String((await res.clone().json())?.description||'')}catch{}
    if(res.status===400&&/message is not modified/i.test(description)){
      if(callback.id) await telegram(token,'answerCallbackQuery',{callback_query_id:callback.id});
      return;
    }
  }
  await telegram(token,'sendMessage',body);
  if(callback?.id) await telegram(token,'answerCallbackQuery',{callback_query_id:callback.id});
}

async function normalRows(db,reporter){
  const base=`SELECT m.match_id,m.competition_id,m.round_no,m.round_label,m.group_id,m.home_id,m.home_name,m.away_id,m.away_name,r.validation_status
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE m.competition_id<>?`;
  const q=isSuperAdmin(reporter)
    ? await db.prepare(`${base} ORDER BY m.round_no DESC,m.match_id`).bind(QA_COMPETITION_ID).all()
    : await db.prepare(`${base} AND (m.home_id=? OR m.away_id=?) ORDER BY m.round_no DESC,m.match_id`).bind(QA_COMPETITION_ID,reporter.club_id,reporter.club_id).all();
  return q.results||[];
}

function groupMatches(rows){
  const map=new Map();
  for(const r of rows){
    if(!map.has(r.match_id)) map.set(r.match_id,{...r,statuses:[]});
    map.get(r.match_id).statuses.push(r.validation_status);
  }
  return [...map.values()];
}

async function showNormal(env,token,chatId,callback,reporter){
  const matches=groupMatches(await normalRows(env.DB,reporter));
  if(!matches.length){
    await present(token,chatId,callback,'🛡️ <b>GOBIERNO DE RESULTADOS</b>\n\nNo hay resultados oficiales dentro de tu alcance.',{inline_keyboard:[[{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]]});
    return;
  }
  const keyboard=matches.map(m=>[{text:`${stateIcon(m.statuses)} ${m.round_label} · ${m.home_name} — ${m.away_name}`,callback_data:`rgux:m:${m.match_id}`}]);
  keyboard.push([{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]);
  await present(token,chatId,callback,`🛡️ <b>GOBIERNO DE RESULTADOS</b>\n\n${isSuperAdmin(reporter)?'Administración global del campeonato.':'Sólo partidos de tu club.'}\nElige un partido para revisar sus series.`,{inline_keyboard:keyboard});
}

async function showQa(env,token,chatId,callback,reporter){
  if(!isSuperAdmin(reporter)){
    await present(token,chatId,callback,'🔒 La prueba de mutación está disponible sólo para el administrador global.',{inline_keyboard:[[{text:'🔐 Dirigentes',callback_data:'tp:leaders'}]]});
    return 'denied';
  }
  const row=await env.DB.prepare(`SELECT r.series_code,r.home_score,r.away_score,r.validation_status,m.home_name,m.away_name
    FROM match_series_results r JOIN matches m ON m.match_id=r.match_id
    WHERE m.match_id=? AND m.competition_id=? AND r.series_code='TERCERA'`).bind(QA_MATCH_ID,QA_COMPETITION_ID).first();
  if(!row){
    await present(token,chatId,callback,'⚠️ La cancha de prueba QA todavía no está materializada. No se tocaron resultados reales.',{inline_keyboard:[[{text:'🔐 Dirigentes',callback_data:'tp:leaders'}]]});
    return 'missing';
  }
  const icon=row.validation_status==='VERIFIED'?'✅':row.validation_status==='DISPUTED'?'⚠️':'🚫';
  await present(token,chatId,callback,`🧪 <b>PRUEBA SEGURA DE CORRECCIÓN</b>\n\nEste partido es ficticio y está fuera de <b>ANFA Chépica 2026</b>.\nNo aparece en Resultados Públicos ni suma en la tabla real.\n\n🏟️ <b>${esc(row.home_name)} ${row.home_score}–${row.away_score} ${esc(row.away_name)}</b>\n🏆 3ª\n\nPuedes corregir este marcador y confirmar la escritura sin afectar un partido real.`,{inline_keyboard:[[{text:`${icon} Abrir resultado QA · ${row.home_score}–${row.away_score}`,callback_data:`rg:r:${QA_MATCH_ID}:TERCERA`}],[{text:'🔐 Volver a Dirigentes',callback_data:'tp:leaders'}]]});
  return 'ok';
}

export async function handleResultGovernanceScopeRequest(request,env){
  const url=new URL(request.url);
  if(!['/webhook/telegram','/webhook/telegram-next'].includes(url.pathname)||request.method!=='POST') return null;
  if(!env.DB||!env.TELEGRAM_WEBHOOK_SECRET) return null;
  let update;
  try{update=await request.clone().json()}catch{return null}
  const message=update.message,callback=update.callback_query;
  const actor=message?.from||callback?.from;
  const chatId=message?.chat?.id||callback?.message?.chat?.id;
  if(!actor?.id||!chatId) return null;
  const text=String(message?.text||'').trim();
  const data=String(callback?.data||'');
  const normal=/^\/(correcciones|gobiernoresultados)(?:@\w+)?$/i.test(text)||data==='rg:list';
  const qa=/^\/correccionesqa(?:@\w+)?$/i.test(text)||data==='rgqa:list';
  if(!normal&&!qa) return null;

  const source=slot(url)==='next'?`${env.TELEGRAM_WEBHOOK_SECRET}:next`:env.TELEGRAM_WEBHOOK_SECRET;
  const expected=await deriveSecret(source);
  if(request.headers.get('x-telegram-bot-api-secret-token')!==expected) return null;
  const token=slot(url)==='next'?env.TELEGRAM_BOT_TOKEN_NEXT:env.TELEGRAM_BOT_TOKEN;
  if(!token) return null;
  const reporter=await env.DB.prepare('SELECT * FROM reporters WHERE telegram_user_id=?').bind(String(actor.id)).first();
  if(!isVerifiedAdmin(reporter)) return null;

  if(qa){
    const outcome=await showQa(env,token,chatId,callback,reporter);
    return json({ok:true,handled:`result_governance_qa_${outcome}`});
  }
  await showNormal(env,token,chatId,callback,reporter);
  return json({ok:true,handled:'result_governance_scoped_list'});
}
