const COMPETITION_ID='ANFA-CHEPICA-2026';
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];
const SERIES_LABEL={TERCERA:'3ª',SEGUNDA:'2ª',SENIOR:'Senior',PRIMERA:'1ª'};
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',...extra}});

export class ResultsStreamHub {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/connect'){
      if(String(request.headers.get('Upgrade')||'').toLowerCase()!=='websocket') return new Response('Upgrade Required',{status:426});
      const pair=new WebSocketPair();
      const client=pair[0],server=pair[1];
      this.state.acceptWebSocket(server);
      const latest=await this.state.storage.get('latest');
      if(latest){try{server.send(JSON.stringify(latest));}catch{}}
      return new Response(null,{status:101,webSocket:client});
    }
    if(url.pathname==='/publish'&&request.method==='POST'){
      const payload=await request.json();
      await this.state.storage.put('latest',payload);
      const wire=JSON.stringify(payload);
      for(const ws of this.state.getWebSockets()){
        try{ws.send(wire);}catch{}
      }
      return new Response(null,{status:204});
    }
    return new Response('Not Found',{status:404});
  }
  webSocketMessage(ws,message){if(message==='ping'){try{ws.send('pong');}catch{}}}
  webSocketClose(){}
  webSocketError(){}
}

export async function buildRoundSnapshots(env,roundNo){
  if(!env.DB) throw new Error('persistence_not_configured');
  const [mq,rq,sq]=await Promise.all([
    env.DB.prepare(`SELECT match_id,group_id,round_no,round_label,home_id,home_name,away_id,away_name FROM matches WHERE competition_id=? AND round_no=? ORDER BY group_id,match_id`).bind(COMPETITION_ID,roundNo).all(),
    env.DB.prepare(`SELECT r.match_id,r.series_code,r.home_score,r.away_score,r.validation_status,r.updated_at,r.source_label FROM match_series_results r JOIN matches m ON m.match_id=r.match_id WHERE m.competition_id=? AND m.round_no=? ORDER BY r.updated_at`).bind(COMPETITION_ID,roundNo).all(),
    env.DB.prepare(`SELECT s.match_id,s.series_code,s.home_score,s.away_score,s.status,s.updated_at,s.source_label,s.submitter_name FROM public_result_submissions s JOIN matches m ON m.match_id=s.match_id WHERE m.competition_id=? AND m.round_no=? AND s.status='SUBMITTED' ORDER BY s.updated_at`).bind(COMPETITION_ID,roundNo).all()
  ]);
  const matches=mq.results||[];
  const official=new Map();
  for(const r of rq.results||[]) official.set(`${r.match_id}:${r.series_code}`,r);
  const pending=new Map();
  for(const r of sq.results||[]) pending.set(`${r.match_id}:${r.series_code}`,r);

  const make=(mode)=>({
    ok:true,
    competition_id:COMPETITION_ID,
    round_no:Number(roundNo),
    mode,
    generated_at:new Date().toISOString(),
    matches:matches.map(m=>({
      match_id:m.match_id,group_id:m.group_id,round_no:m.round_no,round_label:m.round_label,
      home_id:m.home_id,home_name:m.home_name,away_id:m.away_id,away_name:m.away_name,
      series:SERIES.map(code=>{
        const key=`${m.match_id}:${code}`,o=official.get(key),p=pending.get(key);
        if(mode==='reported'&&p){
          return {series_code:code,series_label:SERIES_LABEL[code],home_score:Number(p.home_score),away_score:Number(p.away_score),status:'PENDIENTE',canonical:false,source_label:p.source_label||p.submitter_name||'Resultado informado',updated_at:p.updated_at};
        }
        if(o){
          return {series_code:code,series_label:SERIES_LABEL[code],home_score:Number(o.home_score),away_score:Number(o.away_score),status:o.validation_status,canonical:true,source_label:o.source_label||'Resultado oficial',updated_at:o.updated_at};
        }
        return {series_code:code,series_label:SERIES_LABEL[code],home_score:null,away_score:null,status:'SIN_RESULTADO',canonical:false,source_label:null,updated_at:null};
      })
    }))
  });
  return {official:make('official'),reported:make('reported')};
}

export async function publishRoundSnapshots(env,roundNo,cause={}){
  if(!env.RESULTS_STREAM||!env.DB) return {published:false,reason:'stream_binding_unavailable'};
  const modes=await buildRoundSnapshots(env,roundNo);
  const payload={type:'results.snapshot',competition_id:COMPETITION_ID,round_no:Number(roundNo),cause,generated_at:new Date().toISOString(),modes};
  const id=env.RESULTS_STREAM.idFromName(`${COMPETITION_ID}:round:${roundNo}`);
  const res=await env.RESULTS_STREAM.get(id).fetch('https://results-stream/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  return {published:res.ok,status:res.status};
}

export async function handleResultsStreamRequest(request,env){
  const url=new URL(request.url);
  let m=url.pathname.match(/^\/api\/v1\/rounds\/(\d+)\/results$/);
  if(m&&request.method==='GET'){
    if(!env.DB) return json({ok:false,error:'persistence_not_configured'},503);
    const roundNo=Number(m[1]),mode=url.searchParams.get('mode')==='reported'?'reported':'official';
    const modes=await buildRoundSnapshots(env,roundNo);
    return json(modes[mode],200,{'cache-control':'no-store'});
  }

  m=url.pathname.match(/^\/stream\/ws\/(\d+)$/);
  if(m&&request.method==='GET'){
    if(!env.RESULTS_STREAM) return json({ok:false,error:'results_stream_not_configured'},503);
    const id=env.RESULTS_STREAM.idFromName(`${COMPETITION_ID}:round:${Number(m[1])}`);
    const target=new URL('https://results-stream/connect');
    return env.RESULTS_STREAM.get(id).fetch(new Request(target,request));
  }

  m=url.pathname.match(/^\/stream\/fecha\/(\d+)$/);
  if(m&&request.method==='GET'){
    if(!env.DB) return new Response('Streaming no configurado',{status:503});
    const roundNo=Number(m[1]),mode=url.searchParams.get('mode')==='official'?'official':'reported';
    const modes=await buildRoundSnapshots(env,roundNo);
    return new Response(renderOverlay(roundNo,mode,modes),{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }
  return null;
}

function renderOverlay(roundNo,mode,modes){
  const safe=JSON.stringify(modes).replace(/</g,'\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fecha ${roundNo} · Resultados</title><style>
  :root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden}.wrap{padding:18px;width:100vw}.head{display:flex;gap:10px;align-items:center;margin-bottom:12px;text-shadow:0 2px 8px #000}.title{font-size:28px;font-weight:900;letter-spacing:.02em}.live{font-size:12px;font-weight:800;padding:5px 9px;border-radius:999px;background:rgba(0,0,0,.72)}.grid{display:grid;gap:10px}.match{background:rgba(10,15,24,.88);backdrop-filter:blur(9px);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.28)}.teams{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;font-size:17px;font-weight:850}.teams .away{text-align:right}.dash{opacity:.55}.series{margin-top:8px;display:grid;gap:5px}.row{display:grid;grid-template-columns:80px 1fr auto;align-items:center;gap:9px;padding-top:5px;border-top:1px solid rgba(255,255,255,.1)}.sl{font-size:12px;font-weight:800;opacity:.8}.score{font-size:22px;font-weight:950}.status{font-size:10px;font-weight:900;padding:3px 6px;border-radius:999px;background:rgba(255,255,255,.14)}.empty{font-size:15px;opacity:.72;background:rgba(10,15,24,.82);padding:14px;border-radius:12px}.pulse{animation:pulse .65s ease}@keyframes pulse{0%{transform:scale(1)}45%{transform:scale(1.015)}100%{transform:scale(1)}}
  </style></head><body><div class="wrap"><div class="head"><div class="title">⚽ FECHA ${roundNo} · RESULTADOS</div><div class="live" id="conn">CONECTANDO</div></div><div id="grid" class="grid"></div></div><script>
  const MODE=${JSON.stringify(mode)};let modes=${safe};let snapshot=modes[MODE];const grid=document.getElementById('grid'),conn=document.getElementById('conn');
  function render(){const cards=[];for(const m of snapshot.matches||[]){const rows=(m.series||[]).filter(s=>s.home_score!==null&&s.away_score!==null);if(!rows.length)continue;cards.push('<section class="match"><div class="teams"><span>'+esc(m.home_name)+'</span><span class="dash">—</span><span class="away">'+esc(m.away_name)+'</span></div><div class="series">'+rows.map(s=>'<div class="row"><span class="sl">'+esc(s.series_label)+'</span><span class="score">'+s.home_score+' — '+s.away_score+'</span><span class="status">'+label(s)+'</span></div>').join('')+'</div></section>')}grid.innerHTML=cards.join('')||'<div class="empty">Aún no hay resultados informados para esta fecha.</div>';grid.classList.remove('pulse');void grid.offsetWidth;grid.classList.add('pulse')}
  function label(s){if(s.status==='PENDIENTE')return 'INFORMADO';if(s.status==='DISPUTED')return 'EN DISPUTA';if(s.status==='ANNULLED')return 'ANULADO';return 'OFICIAL'}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function connect(){const proto=location.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(proto+'//'+location.host+'/stream/ws/${roundNo}');ws.onopen=()=>{conn.textContent='EN VIVO'};ws.onmessage=e=>{try{const p=JSON.parse(e.data);if(p.type==='results.snapshot'&&p.round_no===${roundNo}&&p.modes){modes=p.modes;snapshot=modes[MODE];render()}}catch{}};ws.onclose=()=>{conn.textContent='RECONECTANDO';setTimeout(connect,2000)};ws.onerror=()=>ws.close()}
  render();connect();
  </script></body></html>`;
}
