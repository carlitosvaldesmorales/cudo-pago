import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const ORIGIN='https://carlitosvaldesmorales.github.io';
const page=fs.readFileSync('preview-v8/chepica-play/index.html','utf8');
const live=fs.readFileSync('preview-v8/chepica-play/live.js','utf8');
const runtimeCheck=process.env.RUNTIME_CHECK==='1';

assert.match(page,/Chépica Play · En cancha/);
assert.match(page,/INFORMADO todavía no es un resultado OFICIAL/);
assert.match(live,/results\?mode=reported/);
assert.match(live,/\/stream\/ws\//);
assert.match(live,/PENDIENTE[^\n]+INFORMADO/);
assert.match(live,/VERIFIED[^\n]+OFICIAL/);
assert.doesNotMatch(live,/setInterval\s*\(/);
assert.doesNotMatch(live,/api\/v1\/public-championship/);
console.log('PASS static: vista usa proyección reported + WebSocket, sin polling ni segunda autoridad');

if(!runtimeCheck){
  console.log('RESULT: PASS (static PR gate)');
  process.exit(0);
}

async function waitForCors(){
  let last=null;
  for(let i=1;i<=30;i++){
    const response=await fetch(`${BASE}/api/v1/rounds/3/results?mode=reported`,{headers:{Origin:ORIGIN}});
    last=response;
    const cors=response.headers.get('access-control-allow-origin');
    console.log(`Runtime attempt ${i}/30: HTTP ${response.status}, CORS ${cors||'missing'}`);
    if(response.status===200&&cors===ORIGIN) return response;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  return last;
}

const reportedRes=await waitForCors();
assert.equal(reportedRes?.status,200);
assert.equal(reportedRes?.headers.get('access-control-allow-origin'),ORIGIN);
const reported=await reportedRes.json();
assert.equal(reported.ok,true);
assert.equal(reported.mode,'reported');
assert.equal(reported.round_no,3);
assert.ok(Array.isArray(reported.matches)&&reported.matches.length>0);
for(const match of reported.matches){
  assert.equal(match.series.length,4);
  for(const series of match.series){
    assert.ok(['TERCERA','SEGUNDA','SENIOR','PRIMERA'].includes(series.series_code));
    assert.ok(['PENDIENTE','VERIFIED','DISPUTED','ANNULLED','SIN_RESULTADO'].includes(series.status));
    if(series.status==='PENDIENTE') assert.equal(series.canonical,false);
  }
}
console.log(`PASS runtime: reported fecha 3 accesible desde GitHub Pages (${reported.matches.length} partidos)`);

const officialRes=await fetch(`${BASE}/api/v1/rounds/3/results?mode=official`,{headers:{Origin:ORIGIN}});
assert.equal(officialRes.status,200);
assert.equal(officialRes.headers.get('access-control-allow-origin'),ORIGIN);
const official=await officialRes.json();
assert.equal(official.mode,'official');
for(const match of official.matches){
  for(const series of match.series){
    assert.notEqual(series.status,'PENDIENTE','official no debe exponer aportes pendientes');
  }
}
console.log('PASS authority: proyección official permanece separada de aportes pending');

await new Promise((resolve,reject)=>{
  const ws=new WebSocket(`${BASE.replace('https://','wss://')}/stream/ws/3`);
  const timer=setTimeout(()=>{try{ws.close();}catch{}reject(new Error('websocket_timeout'));},10000);
  ws.addEventListener('open',()=>{clearTimeout(timer);ws.close();resolve();});
  ws.addEventListener('error',event=>{clearTimeout(timer);reject(new Error(`websocket_error:${event?.message||'unknown'}`));});
});
console.log('PASS runtime: WebSocket fecha 3 acepta conexión real');
console.log('RESULT: PASS');
