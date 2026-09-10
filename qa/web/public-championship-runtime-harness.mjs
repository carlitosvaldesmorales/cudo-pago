import assert from 'node:assert/strict';

const BASE=process.env.CUDO_SPORTS_BASE||'https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const URL=`${BASE}/api/v1/public-championship`;
const SERIES=['TERCERA','SEGUNDA','SENIOR','PRIMERA'];

async function getWithRetry(){
  let lastError;
  for(let attempt=1;attempt<=20;attempt++){
    try{
      const response=await fetch(URL,{headers:{Origin:'https://cudo.cl'},cache:'no-store'});
      const text=await response.text();
      if(response.ok){
        const body=JSON.parse(text);
        if(body?.ok&&body?.contract==='public-championship-v1') return {response,body};
      }
      lastError=new Error(`HTTP ${response.status}: ${text.slice(0,500)}`);
    }catch(error){lastError=error}
    await new Promise(r=>setTimeout(r,3000));
  }
  throw lastError||new Error('public championship runtime unavailable');
}

const {response,body}=await getWithRetry();
assert.equal(response.status,200);
assert.equal(response.headers.get('access-control-allow-origin'),'https://cudo.cl');
assert.equal(body.competition?.competition_id,'ANFA-CHEPICA-2026');
assert.equal(body.matches?.length,25);
assert.equal(body.byes?.length,5);
assert.equal(body.summary?.matches,25);
assert.equal(body.summary?.byes,5);
assert.ok(body.matches.every(m=>m.competition_id==='ANFA-CHEPICA-2026'));
assert.ok(body.matches.every(m=>Array.isArray(m.series)&&m.series.length===4));
for(const match of body.matches){
  const codes=match.series.map(s=>s.series_code);
  assert.deepEqual([...codes].sort(),[...SERIES].sort());
  for(const serie of match.series){
    assert.ok(['OFFICIAL','IN_REVIEW','ANNULLED','PENDING'].includes(serie.public_status));
    if(serie.public_status==='OFFICIAL'){
      assert.ok(Number.isInteger(serie.home_score));
      assert.ok(Number.isInteger(serie.away_score));
    }else{
      assert.equal(serie.home_score,null);
      assert.equal(serie.away_score,null);
    }
  }
}
const serialized=JSON.stringify(body);
assert.ok(!serialized.includes('QA-RG-MUTATION-01'),'QA fixture must never reach public runtime');
for(const forbidden of ['telegram_user_id','actor_id','actor_role','source_ref','source_type','source_label','permission_audit']){
  assert.ok(!serialized.includes(`\"${forbidden}\"`),`runtime must not expose ${forbidden}`);
}

console.log(`PASS runtime ${URL}`);
console.log(`PASS competition ${body.competition.competition_id}: ${body.matches.length} matches / ${body.byes.length} byes`);
console.log(`PASS governed series summary ${JSON.stringify(body.summary.series)}`);
console.log('PASS no QA fixture or internal identity/source fields exposed');
console.log('RESULT: PASS');
