import fs from 'node:fs';

const SHEET_ID='1Yf2JeTLY6_Vk9URlV2FoXhuKWyJGcXEePx1OmApEYqA';
const WEB_APP='https://script.google.com/macros/s/AKfycbw1WjtJHJZO5RaJ6mtL6Um9afRKXArw9th-wLtUdY7qmClxvF7S3s1JUNL7-5WUjBCeDQ/exec';
const CONFIG=JSON.parse(fs.readFileSync('preview-v8/data/event-work-review-config-qa.json','utf8'));
const EVENT=JSON.parse(fs.readFileSync('preview-v8/data/match-full-day-qa.json','utf8'));
const CONTROL=JSON.parse(fs.readFileSync('control/cudo-event-work-review-assignment-apply.json','utf8'));
const OUT='evidence/event-work-review-assignment/apply.json';
const TABS=['ACTIVIDADES','FRENTES','RESPONSABLES','TAREAS','EVENTOS'];
const now=()=>new Date().toISOString();

async function accessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('OAuth secrets missing');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error('OAuth refresh failed');
  return d.access_token;
}
async function req(token,method,url,body){
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await r.text(); const d=text?JSON.parse(text):{};
    if(r.ok) return d;
    last={status:r.status,d};
    if(![429,500,502,503,504].includes(r.status)) break;
    await new Promise(x=>setTimeout(x,1000*(2**i)));
  }
  throw new Error(`Google HTTP ${last?.status}: ${last?.d?.error?.message||'unknown'}`);
}
async function values(token,tab){
  const range=`'${tab}'!A:AZ`;
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  return (await req(token,'GET',u)).values||[];
}
async function append(token,tab,headers,objects){
  if(!objects.length) return 0;
  const vals=objects.map(o=>headers.map(h=>o[h]??''));
  const range=`'${tab}'!A:${String.fromCharCode(64+Math.min(headers.length,26))}`;
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await req(token,'POST',u,{majorDimension:'ROWS',values:vals});
  return vals.length;
}
function mapRows(values){
  const h=values[0]||[];
  return {headers:h,rows:values.slice(1).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])))};
}
function signals(){
  const c=EVENT.event.conditions||{}, local=EVENT.event.location==='LOCAL', commerce=!!c.food_sales_enabled||!!c.bar_sales_enabled;
  return {
    venue_required:local&&!!c.venue_required,
    playing_surface_required:local&&!!c.venue_required,
    food_preparation:!!c.food_sales_enabled,
    food_service:!!c.food_sales_enabled,
    beverage_service:!!c.bar_sales_enabled,
    sales_or_cash_handling:commerce,
    public_access:!!c.ticketing_enabled,
    cleaning_required:local&&!!c.venue_required,
    setup_required:local&&!!c.venue_required,
    teardown_required:local&&!!c.venue_required,
    equipment_required:local&&!!c.venue_required,
    ticketing_or_access_control:!!c.ticketing_enabled,
    communications_required:!!c.broadcast_enabled,
    sports_operation_required:EVENT.event.kind==='MATCH'
  };
}
function activePatterns(){
  const s=signals();
  return (EVENT.workstream_patterns||[]).map(p=>({...p,reasons:(p.activation_conditions||[]).filter(k=>s[k]===true)})).filter(p=>p.reasons.length);
}
function labelFromRole(v){return String(v||'').replace(/^Encargado\/a de\s+/i,'').replace(/^Encargado\/a del\s+/i,'');}
function saturday(date){const d=new Date(date+'T12:00:00Z');return d.getUTCDay()===6;}
function previousDate(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
function build(){
  const activityId=CONFIG.target_activity_id, ts=now(), patterns=activePatterns();
  const activity={activity_id:activityId,title:EVENT.event.display_name,activity_type:EVENT.event.kind,starts_at:EVENT.event.date+'T00:00:00-03:00',status:'IN_PREPARATION',provenance:'SYNTHETIC',created_at:ts,updated_at:ts};
  const fronts=[], assignments=[], tasks=[], events=[];
  let ti=201;
  patterns.forEach((p,i)=>{
    const n=201+i, ws=`QA-WS-${n}`, role=`QA-ROLE-${n}`, asg=`QA-ASG-${n}`;
    fronts.push({workstream_id:ws,activity_id:activityId,capability_tag:p.capability_tag,label:labelFromRole(p.human_label),activation_reason:p.reasons.join('|'),state:'REQUIRED_UNASSIGNED',accountable_role_id:role,human_gate:p.human_gate||'NONE',progress_pct:0,purpose:'',dependencies:''});
    assignments.push({assignment_id:asg,workstream_id:ws,role_instance_id:role,display_role:p.human_label,person_ref:'',person_display:'',assignment_state:'UNASSIGNED',assigned_at:'',confirmed_at:'',provenance:'SYNTHETIC'});
    events.push({event_id:`QA-EVT-MATCH-${n}-ROLE`,activity_id:activityId,workstream_id:ws,task_id:'',timestamp:ts,event_type:'ROLE_REQUIRED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_BRIDGE',previous_state:'',new_state:'UNASSIGNED',comment:`Responsabilidad derivada: ${p.human_label}`,provenance:'SYNTHETIC'});
    for(const raw of p.post_tasks||[]){
      const ov=CONFIG.source_backed_task_overrides?.[raw.work_id]||{};
      const taskId=`QA-TASK-${ti++}`;
      tasks.push({task_id:taskId,workstream_id:ws,title:ov.title||raw.title,state:'TODO',due_at:'',assignee_ref:ov.assignee_ref||'',assignee_display:ov.assignee_display||'',priority:'NORMAL',updated_at:ts});
      events.push({event_id:`QA-EVT-MATCH-${taskId}-CREATE`,activity_id:activityId,workstream_id:ws,task_id:taskId,timestamp:ts,event_type:'TASK_CREATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_BRIDGE',previous_state:'',new_state:'TODO',comment:`Tarea derivada: ${ov.title||raw.title}`,provenance:'SYNTHETIC'});
    }
    if(p.capability_tag==='VENUE_AND_FIELD'&&EVENT.event.location==='LOCAL'&&saturday(EVENT.event.date)){
      const rule=(CONFIG.conditional_source_backed_rules||[]).find(x=>x.rule_id==='GRASS_CUT_MATCH_ON_SATURDAY');
      if(rule){
        const taskId=`QA-TASK-${ti++}`;
        tasks.push({task_id:taskId,workstream_id:ws,title:rule.title,state:'TODO',due_at:previousDate(EVENT.event.date)+'T18:00:00-03:00',assignee_ref:rule.assignee_ref,assignee_display:rule.assignee_display,priority:'HIGH',updated_at:ts});
        events.push({event_id:`QA-EVT-MATCH-${taskId}-CREATE`,activity_id:activityId,workstream_id:ws,task_id:taskId,timestamp:ts,event_type:'TASK_CREATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_BRIDGE',previous_state:'',new_state:'TODO',comment:'Tarea derivada por regla real de conflicto sábado/partido',provenance:'SYNTHETIC'});
      }
    }
  });
  events.unshift({event_id:'QA-EVT-MATCH-201-ACTIVITY',activity_id:activityId,workstream_id:'',task_id:'',timestamp:ts,event_type:'ACTIVITY_CREATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_BRIDGE',previous_state:'',new_state:'IN_PREPARATION',comment:'MATCH PR219 proyectado al registro operacional QA',provenance:'SYNTHETIC'});
  return {activity,fronts,assignments,tasks,events};
}
async function fetchState(activityId){
  const r=await fetch(WEB_APP+'?format=json&activity='+encodeURIComponent(activityId));
  const d=await r.json();
  if(!r.ok||!d.ok) throw new Error('Activity web state unavailable: '+JSON.stringify(d));
  return d;
}
async function main(){
  if(CONTROL.apply!==true||CONTROL.production_write!==false||!CONTROL.idempotency_key) throw new Error('Explicit QA apply authorization missing');
  const token=await accessToken();
  const current={};
  for(const tab of TABS) current[tab]=mapRows(await values(token,tab));
  const built=build(), aid=built.activity.activity_id;
  const exists=current.ACTIVIDADES.rows.some(r=>r.activity_id===aid);
  let writes={ACTIVIDADES:0,FRENTES:0,RESPONSABLES:0,TAREAS:0,EVENTOS:0};
  if(!exists){
    writes.ACTIVIDADES=await append(token,'ACTIVIDADES',current.ACTIVIDADES.headers,[built.activity]);
    writes.FRENTES=await append(token,'FRENTES',current.FRENTES.headers,built.fronts);
    writes.RESPONSABLES=await append(token,'RESPONSABLES',current.RESPONSABLES.headers,built.assignments);
    writes.TAREAS=await append(token,'TAREAS',current.TAREAS.headers,built.tasks);
    writes.EVENTOS=await append(token,'EVENTOS',current.EVENTOS.headers,built.events);
  }
  const state=await fetchState(aid);
  const expectedWorkstreams=built.fronts.length, expectedTasks=built.tasks.length;
  const actualTasks=(state.workstreams||[]).reduce((n,w)=>n+(w.tasks||[]).length,0);
  const result={
    schema_version:'CUDO_EVENT_WORK_REVIEW_ASSIGNMENT_BRIDGE_RESULT_V1',
    generated_at:now(),
    activity_id:aid,
    idempotency_key:CONTROL.idempotency_key,
    preexisting:exists,
    writes,
    production_write:false,
    expected:{workstreams:expectedWorkstreams,tasks:expectedTasks},
    observed:{workstreams:(state.workstreams||[]).length,tasks:actualTasks,unassigned:state.summary?.unassigned,blocked:state.summary?.blocked},
    assignments:(state.workstreams||[]).map(w=>({workstream_id:w.workstream_id,label:w.label,assignment_state:w.assignment?.assignment_state||'',person:w.assignment?.person_display||'',tasks:(w.tasks||[]).map(t=>({task_id:t.task_id,title:t.title,state:t.state,assignee:t.assignee_display||''}))})),
    decision:((state.workstreams||[]).length===expectedWorkstreams&&actualTasks===expectedTasks&&state.summary?.unassigned===expectedWorkstreams)?'PASS':'FAIL'
  };
  fs.mkdirSync('evidence/event-work-review-assignment',{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(result.decision!=='PASS') process.exit(1);
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
