import fs from 'node:fs';

const CONTROL=JSON.parse(fs.readFileSync('control/cudo-event-work-assignment-proof.json','utf8'));
const WEB_APP='https://script.google.com/macros/s/AKfycbw1WjtJHJZO5RaJ6mtL6Um9afRKXArw9th-wLtUdY7qmClxvF7S3s1JUNL7-5WUjBCeDQ/exec';
const SHEET_ID='1Yf2JeTLY6_Vk9URlV2FoXhuKWyJGcXEePx1OmApEYqA';
const OUT='evidence/event-work-review-assignment/assignment-proof.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function oauth(){
  const body=new URLSearchParams({
    client_id:process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID||'',
    client_secret:process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET||'',
    refresh_token:process.env.CUDO_GOOGLE_REFRESH_TOKEN||'',
    grant_type:'refresh_token'
  });
  if([...body.values()].slice(0,3).some(v=>!v)) throw new Error('OAuth secrets missing');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error('OAuth refresh failed');
  return d.access_token;
}
async function googleRows(token,tab){
  const range=`'${tab}'!A:AZ`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    const d=await r.json().catch(()=>({}));
    if(r.ok){
      const v=d.values||[], h=v[0]||[];
      return v.slice(1).map(row=>Object.fromEntries(h.map((x,j)=>[x,row[j]??''])));
    }
    last={status:r.status,message:d.error?.message||'unknown'};
    if(![429,500,502,503,504].includes(r.status)) break;
    await sleep(1000*(2**i));
  }
  throw new Error(`Sheets ${tab} HTTP ${last?.status}: ${last?.message}`);
}
async function getState(){
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(WEB_APP+'?format=json&activity='+encodeURIComponent(CONTROL.activity_id));
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.ok) return d;
    last={status:r.status,d};
    await sleep(1500*(i+1));
  }
  throw new Error('Apps Script state unavailable: '+JSON.stringify(last));
}
async function act(action){
  const r=await fetch(WEB_APP,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action,workstreamId:CONTROL.workstream_id,activityId:CONTROL.activity_id})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok) throw new Error(`${action} failed HTTP ${r.status}: ${JSON.stringify(d)}`);
  return d.state;
}
function ws(state){
  return (state.workstreams||[]).find(x=>x.workstream_id===CONTROL.workstream_id);
}
async function main(){
  if(CONTROL.apply!==true||CONTROL.production_write!==false||!CONTROL.idempotency_key) throw new Error('Explicit synthetic QA apply gate missing');
  const token=await oauth();
  const before=await getState();
  const beforeWs=ws(before);
  if(!beforeWs) throw new Error('Target workstream missing');
  const transitions=[];
  let state=before;
  const person=String(beforeWs.assignment?.person_display||'');
  if(!person){
    state=await act('ASSIGN_DEMO');
    transitions.push('ASSIGN_DEMO');
    const a=ws(state);
    if(a?.assignment?.assignment_state!=='ASSIGNED'||a?.assignment?.person_display!=='Persona QA 1') throw new Error('ASSIGN_DEMO did not persist expected state');
  }
  const current=ws(state);
  if(String(current?.assignment?.person_display||'')!=='Persona QA 2'){
    state=await act('REASSIGN_DEMO');
    transitions.push('REASSIGN_DEMO');
  }
  const finalWs=ws(state);
  const assignments=await googleRows(token,'RESPONSABLES');
  const events=await googleRows(token,'EVENTOS');
  const assignment=assignments.find(x=>x.workstream_id===CONTROL.workstream_id);
  const relatedEvents=events.filter(x=>x.activity_id===CONTROL.activity_id&&x.workstream_id===CONTROL.workstream_id);
  const types=relatedEvents.map(x=>x.event_type);
  const result={
    schema_version:'CUDO_EVENT_WORK_ASSIGNMENT_PROOF_RESULT_V1',
    generated_at:new Date().toISOString(),
    idempotency_key:CONTROL.idempotency_key,
    activity_id:CONTROL.activity_id,
    workstream_id:CONTROL.workstream_id,
    production_write:false,
    synthetic_qa:true,
    transitions_executed:transitions,
    before:{assignment_state:beforeWs.assignment?.assignment_state||'',person:beforeWs.assignment?.person_display||''},
    after:{assignment_state:finalWs?.assignment?.assignment_state||'',person:finalWs?.assignment?.person_display||''},
    sheets_assignment:assignment||null,
    audit_event_types:types,
    audit_event_count:relatedEvents.length,
    decision:(finalWs?.assignment?.assignment_state==='ASSIGNED'&&finalWs?.assignment?.person_display==='Persona QA 2'&&assignment?.person_display==='Persona QA 2'&&types.includes('ROLE_ASSIGNED')&&types.includes('ROLE_REASSIGNED'))?'PASS':'FAIL'
  };
  fs.mkdirSync('evidence/event-work-review-assignment',{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(result.decision!=='PASS') process.exit(1);
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
