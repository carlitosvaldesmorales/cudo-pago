import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
export const EVENT_MODEL_PATH=path.resolve(__dirname,'../data/event-resource-qa.json');
export const CATALOG_PATH=path.resolve(__dirname,'../contracts/cudo-event-work-pattern-catalog-v1.json');
const TABS=['ACTIVIDADES','FRENTES','RESPONSABLES','TAREAS','EVENTOS'];

function clone(v){return JSON.parse(JSON.stringify(v));}
function clean(v){return String(v??'').trim();}
function nowIso(){return new Date().toISOString();}
function colName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function rowsToTable(values){
  const headers=(values[0]||[]).map(clean);
  return {headers,rows:values.slice(1).map((row,i)=>({__row:i+2,...Object.fromEntries(headers.map((h,j)=>[h,row[j]??'']))})).filter(r=>headers.some(h=>clean(r[h])))};
}
function rowValues(headers,obj){return headers.map(h=>obj[h]??'');}
function bool(v){return v===true||String(v).toLowerCase()==='true'||String(v)==='1';}

export function eventSignals(event){
  const c=event.conditions||{},local=clean(event.location).toUpperCase()==='LOCAL';
  const commerce=bool(c.food_sales_enabled)||bool(c.bar_sales_enabled)||bool(c.ticketing_enabled);
  return {
    venue_required:local&&bool(c.venue_required),
    playing_surface_required:local&&bool(c.venue_required),
    food_preparation:bool(c.food_sales_enabled),
    food_service:bool(c.food_sales_enabled),
    beverage_service:bool(c.bar_sales_enabled),
    sales_or_cash_handling:commerce,
    public_access:bool(c.ticketing_enabled),
    cleaning_required:local&&bool(c.venue_required),
    setup_required:local&&bool(c.venue_required),
    teardown_required:local&&bool(c.venue_required),
    equipment_required:local&&bool(c.venue_required),
    ticketing_or_access_control:bool(c.ticketing_enabled),
    communications_required:bool(c.broadcast_enabled),
    sports_operation_required:clean(event.kind).toUpperCase()==='MATCH'
  };
}

export function deriveEventWork(event,catalog){
  const family=clean(event.kind).toUpperCase(),binding=catalog.activity_bindings?.[family];
  if(!binding||binding.event_id!==event.event_id) return {configured:false,reason:'UNBOUND_EVENT',family,event_id:event.event_id};
  if(!clean(event.starts_at)||!clean(event.location)) return {configured:false,reason:'EVENT_OPERATION_NOT_CONFIGURED',family,event_id:event.event_id,activity_id:binding.activity_id};
  const signals=eventSignals(event);
  const active=(catalog.patterns||[]).map(pattern=>({...pattern,reasons:(pattern.activation_conditions||[]).filter(x=>signals[x]===true)})).filter(x=>x.reasons.length);
  return {
    configured:true,family,event_id:event.event_id,activity_id:binding.activity_id,binding,signals,
    workstreams:active.map(pattern=>({
      capability_tag:pattern.capability_tag,
      workstream_id:binding.workstream_ids[pattern.capability_tag],
      assignment_id:binding.assignment_ids[pattern.capability_tag],
      label:pattern.human_label,
      activation_reason:pattern.reasons.join('|'),
      phase:pattern.phase||'DURANTE',
      human_gate:pattern.human_gate||'NONE',
      tasks:(pattern.tasks||[]).filter(t=>!t.activity_kinds||t.activity_kinds.includes(family)).map(t=>({...t,task_id:binding.task_ids[t.work_id]})).filter(t=>t.task_id)
    }))
  };
}

function preserveFrontState(existing,hasPerson){
  const state=clean(existing?.state);
  if(['BLOCKED','IN_PROGRESS','DONE'].includes(state)) return state;
  return hasPerson?'READY':'REQUIRED_UNASSIGNED';
}

export function planRegistryReconcile({eventModel,catalog,tables,at='2026-09-23T12:00:00.000Z'}){
  const mutations=[],eventsToAppend=[],summary=[];
  const activities=tables.ACTIVIDADES,fronts=tables.FRENTES,assignments=tables.RESPONSABLES,tasks=tables.TAREAS,events=tables.EVENTOS;
  const eventIds=new Set(events.rows.map(x=>clean(x.event_id)));
  const eventList=['MATCH','BINGO'].map(k=>eventModel[k]).filter(Boolean);

  const upsert=(tab,idHeader,id,obj)=>{
    const table=tables[tab],existing=table.rows.find(r=>clean(r[idHeader])===id);
    if(existing) mutations.push({op:'update',tab,row:existing.__row,values:rowValues(table.headers,{...existing,...obj})});
    else mutations.push({op:'append',tab,values:rowValues(table.headers,obj)});
    return existing;
  };
  const appendAudit=(obj)=>{
    if(eventIds.has(obj.event_id)) return;
    eventIds.add(obj.event_id);eventsToAppend.push(obj);
  };

  for(const event of eventList){
    const derived=deriveEventWork(event,catalog);
    if(!derived.configured){summary.push({event_id:event.event_id,configured:false,reason:derived.reason});continue;}
    const aid=derived.activity_id,status=event.closed?'DONE':'IN_PREPARATION';
    const existingActivity=activities.rows.find(r=>clean(r.activity_id)===aid);
    upsert('ACTIVIDADES','activity_id',aid,{
      activity_id:aid,title:event.display_name,activity_type:event.kind,starts_at:event.starts_at,status,
      provenance:'SYNTHETIC',created_at:existingActivity?.created_at||at,updated_at:at
    });
    if(!existingActivity){
      appendAudit({event_id:'QA-EVT-AUTO-'+aid+'-CREATED',activity_id:aid,workstream_id:'',task_id:'',timestamp:at,event_type:'ACTIVITY_CREATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_RECONCILER',previous_state:'',new_state:status,comment:'Actividad creada desde ACTIVITY_EVENT canónico',provenance:'SYNTHETIC'});
    }

    const activeCaps=new Set(derived.workstreams.map(x=>x.capability_tag));
    for(const existingFront of fronts.rows.filter(r=>clean(r.activity_id)===aid)){
      if(activeCaps.has(clean(existingFront.capability_tag))) continue;
      if(clean(existingFront.state)!=='NOT_APPLICABLE'){
        upsert('FRENTES','workstream_id',clean(existingFront.workstream_id),{...existingFront,state:'NOT_APPLICABLE',progress_pct:existingFront.progress_pct||0});
        appendAudit({event_id:'QA-EVT-AUTO-'+clean(existingFront.workstream_id)+'-DEACTIVATED',activity_id:aid,workstream_id:clean(existingFront.workstream_id),task_id:'',timestamp:at,event_type:'WORKSTREAM_DEACTIVATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_RECONCILER',previous_state:clean(existingFront.state),new_state:'NOT_APPLICABLE',comment:'La configuración actual del evento ya no requiere este frente',provenance:'SYNTHETIC'});
      }
    }

    for(const ws of derived.workstreams){
      const existingFront=fronts.rows.find(r=>clean(r.workstream_id)===ws.workstream_id);
      const existingAssignment=assignments.rows.find(r=>clean(r.workstream_id)===ws.workstream_id);
      const hasPerson=Boolean(clean(existingAssignment?.person_ref));
      const nextState=preserveFrontState(existingFront,hasPerson);
      upsert('FRENTES','workstream_id',ws.workstream_id,{
        workstream_id:ws.workstream_id,activity_id:aid,capability_tag:ws.capability_tag,label:ws.label,
        activation_reason:ws.activation_reason,state:nextState,accountable_role_id:'QA-ROLE-'+ws.workstream_id.replace('QA-WS-',''),
        human_gate:ws.human_gate,progress_pct:existingFront?.progress_pct||0,purpose:existingFront?.purpose||'',dependencies:existingFront?.dependencies||''
      });
      if(!existingAssignment){
        upsert('RESPONSABLES','assignment_id',ws.assignment_id,{
          assignment_id:ws.assignment_id,workstream_id:ws.workstream_id,role_instance_id:'QA-ROLE-'+ws.workstream_id.replace('QA-WS-',''),
          display_role:ws.label,person_ref:'',person_display:'',assignment_state:'UNASSIGNED',assigned_at:'',confirmed_at:'',provenance:'SYNTHETIC'
        });
      }
      if(!existingFront){
        appendAudit({event_id:'QA-EVT-AUTO-'+ws.workstream_id+'-REQUIRED',activity_id:aid,workstream_id:ws.workstream_id,task_id:'',timestamp:at,event_type:'ROLE_REQUIRED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_RECONCILER',previous_state:'',new_state:nextState,comment:'Responsabilidad derivada automáticamente desde las condiciones del evento',provenance:'SYNTHETIC'});
      }else if(clean(existingFront.state)==='NOT_APPLICABLE'){
        appendAudit({event_id:'QA-EVT-AUTO-'+ws.workstream_id+'-REACTIVATED-'+clean(eventModel.store_revision),activity_id:aid,workstream_id:ws.workstream_id,task_id:'',timestamp:at,event_type:'WORKSTREAM_REACTIVATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_RECONCILER',previous_state:'NOT_APPLICABLE',new_state:nextState,comment:'La configuración actual volvió a requerir este frente',provenance:'SYNTHETIC'});
      }

      for(const task of ws.tasks){
        const existingTask=tasks.rows.find(r=>clean(r.task_id)===task.task_id);
        upsert('TAREAS','task_id',task.task_id,{
          task_id:task.task_id,workstream_id:ws.workstream_id,title:task.title,state:existingTask?.state||'TODO',
          due_at:existingTask?.due_at||'',assignee_ref:existingTask?.assignee_ref||'',assignee_display:existingTask?.assignee_display||'',
          priority:existingTask?.priority||'NORMAL',updated_at:at
        });
        if(!existingTask){
          appendAudit({event_id:'QA-EVT-AUTO-'+task.task_id+'-CREATED',activity_id:aid,workstream_id:ws.workstream_id,task_id:task.task_id,timestamp:at,event_type:'TASK_CREATED',actor_type:'SYSTEM',actor_ref:'CUDO_EVENT_WORK_RECONCILER',previous_state:'',new_state:'TODO',comment:'Tarea derivada automáticamente: '+task.title,provenance:'SYNTHETIC'});
        }
      }
    }
    summary.push({event_id:event.event_id,activity_id:aid,configured:true,active_workstreams:derived.workstreams.length,tasks:derived.workstreams.reduce((n,x)=>n+x.tasks.length,0),unassigned_expected:derived.workstreams.filter(ws=>!clean(assignments.rows.find(a=>clean(a.workstream_id)===ws.workstream_id)?.person_ref)).length});
  }
  for(const ev of eventsToAppend) mutations.push({op:'append',tab:'EVENTOS',values:rowValues(events.headers,ev)});
  return {schema_version:'CUDO_EVENT_WORK_REGISTRY_RECONCILE_PLAN_V1',generated_at:at,summary,mutations,production_write:false};
}

async function oauth(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID,client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('OAuth secrets missing');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})});
  const d=await r.json();if(!r.ok||!d.access_token) throw new Error('OAuth refresh failed');return d.access_token;
}
async function request(token,method,url,body){
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await r.text(),d=text?JSON.parse(text):{};
    if(r.ok)return d;last={status:r.status,d};
    if(![429,500,502,503,504].includes(r.status))break;
    await new Promise(x=>setTimeout(x,800*(2**i)));
  }
  throw new Error('Google HTTP '+last?.status+': '+(last?.d?.error?.message||'unknown'));
}
async function readTable(token,sheetId,tab){
  const range="'"+tab+"'!A:AZ",url='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent(range)+'?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE';
  return rowsToTable((await request(token,'GET',url)).values||[]);
}
async function applyMutation(token,sheetId,tables,m){
  const table=tables[m.tab],end=colName(table.headers.length);
  if(m.op==='update'){
    const range="'"+m.tab+"'!A"+m.row+':'+end+m.row;
    const url='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent(range)+'?valueInputOption=USER_ENTERED';
    return request(token,'PUT',url,{range,majorDimension:'ROWS',values:[m.values]});
  }
  if(m.op==='append'){
    const range="'"+m.tab+"'!A:"+end;
    const url='https://sheets.googleapis.com/v4/spreadsheets/'+sheetId+'/values/'+encodeURIComponent(range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    return request(token,'POST',url,{range,majorDimension:'ROWS',values:[m.values]});
  }
  throw new Error('Unsupported mutation '+m.op);
}

export async function reconcileEventWorkRegistry({apply=false,eventModelPath=EVENT_MODEL_PATH,catalogPath=CATALOG_PATH}={}){
  const eventModel=JSON.parse(fs.readFileSync(eventModelPath,'utf8')),catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
  const token=await oauth(),tables={};
  for(const tab of TABS) tables[tab]=await readTable(token,catalog.registry_spreadsheet_id,tab);
  const plan=planRegistryReconcile({eventModel,catalog,tables,at:nowIso()});
  let writes=0;
  if(apply){
    for(const m of plan.mutations){await applyMutation(token,catalog.registry_spreadsheet_id,tables,m);writes++;}
  }
  return {...plan,apply,writes_applied:writes};
}

if(import.meta.url==='file://'+process.argv[1]){
  const apply=String(process.env.CUDO_EVENT_WORK_REGISTRY_APPLY||'').toLowerCase()==='true';
  reconcileEventWorkRegistry({apply}).then(r=>console.log(JSON.stringify({ok:true,apply:r.apply,writes_applied:r.writes_applied,summary:r.summary,planned_mutations:r.mutations.length,production_write:false},null,2))).catch(e=>{console.error(e.stack||e);process.exit(1);});
}
