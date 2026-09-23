import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transitionWorkItem,buildClubOperationalStateProjection} from './work_item_engine.mjs';
import {deriveFinancialObligationsFromCompletedWork,enrichOperationalProjectionWithFinancialEffects} from './work_financial_effects.mjs';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';

export const WORK_SHEET_ID='1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw';
export const WORK_CONTROL_SHEET='WORK_CONTROL';
export const WORK_REQUESTS_SHEET='WORK_STATE_REQUESTS';
export const WORK_AUDIT_SHEET='WORK_AUDIT';
export const ALLOWED_REQUESTER='sistemas@cudo.cl';
export const REQUEST_HEADERS=['REQUEST_ID','REQUESTED_AT','WORK_ID','EXPECTED_STATE','ACTION','REASON','EVIDENCE_REF','REQUESTED_BY','PROCESS_STATUS','RESULT','APPLIED_AT'];
export const AUDIT_HEADERS=['TRANSITION_ID','WORK_ID','FROM_STATE','TO_STATE','PERFORMED_BY','REASON','EVIDENCE_REF','TIMESTAMP','RESULT','OBJECT_VERSION'];

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_PATH=path.resolve(__dirname,'../state/operational-work-state.json');
const DEFAULT_PROJECTION_PATH=path.resolve(__dirname,'../data/operacion.json');

const ACTION_TO_STATE={
  START:'IN_PROGRESS',
  BLOCK:'BLOCKED',
  WAIT_EXTERNAL:'WAITING_EXTERNAL',
  REOPEN:'OPEN',
  COMPLETE:'DONE',
  CANCEL:'CANCELLED'
};

function clean(v){return String(v??'').trim();}
function rowsToObjects(values){
  if(!values.length) return [];
  const h=values[0].map(clean);
  return values.slice(1).map((row,i)=>({
    __row:i+2,
    ...Object.fromEntries(h.map((x,j)=>[x,clean(row[j])]))
  })).filter(r=>h.some(x=>r[x]));
}
function assertHeaders(values,expected,label){
  if(!values.length) throw new Error(`${label}: sin encabezados`);
  const actual=values[0].slice(0,expected.length).map(clean);
  if(JSON.stringify(actual)!==JSON.stringify(expected)){
    throw new Error(`${label}: contrato inesperado ${actual.join('|')}`);
  }
}
function clone(v){return JSON.parse(JSON.stringify(v));}
export function loadOperationalWorkState(statePath=DEFAULT_STATE_PATH){
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  if(state.schema_version!=='CUDO_OPERATIONAL_WORK_STATE_STORE_V1'){
    throw new Error('operational work state schema inesperado');
  }
  if(!Array.isArray(state.objects)||!Array.isArray(state.audit)){
    throw new Error('operational work state incompleto');
  }
  return state;
}
function scheduleContextLabel(schedule){
  if(!schedule?.start_date) return '';
  let text=`${schedule.start_date} -> ${schedule.expected_end_date||''}`;
  if(schedule.conditional_extension_date){
    text+=` · posible extensión ${schedule.conditional_extension_date}`;
  }
  if(schedule.condition==='MAY_EXTEND_TO_WEDNESDAY_DEPENDING_ON_WATER'){
    text+=' según agua';
  }
  return text;
}
function financialContextLabel(ctx){
  if(ctx?.amount_clp!=null) return `CLP ${ctx.amount_clp} · ${ctx.cycle||''}`;
  if(ctx?.min_amount_clp!=null||ctx?.max_amount_clp!=null){
    const min=ctx.min_amount_clp!=null?ctx.min_amount_clp:'';
    const max=ctx.max_amount_clp!=null?ctx.max_amount_clp:'';
    const condition=ctx.condition==='DEPENDS_ON_DIRTINESS'?' · según suciedad':'';
    return `CLP ${min}-${max}${condition}`;
  }
  if(ctx?.unit_amount_clp!=null){
    const unit=ctx.unit_label==='TEAM_WASHED'?'por equipo lavado':(ctx.unit_label||'por unidad');
    return `CLP ${ctx.unit_amount_clp} ${unit}`;
  }
  return '';
}
function buildControlRows(projection){
  return [
    ['WORK_ID','TITLE','STATE','RESPONSIBLE','DUE_DATE','ATTENTION','RESOURCE','SOURCE','SCHEDULE_CONTEXT','FINANCIAL_CONTEXT','FINANCIAL_CONTEXT_SEMANTICS','FINANCIAL_EFFECT','OUTSTANDING_CLP','OBJECT_VERSION','AUTHORITY','RESPONSIBLE_ACTOR_ID'],
    ...projection.items.map(item=>[
      item.work_id,item.title,item.state,item.responsible.display_name,item.due_date,item.attention,
      item.resource.display_name,item.source.display_name,scheduleContextLabel(item.schedule),financialContextLabel(item.financial_context),
      item.financial_context.semantics,
      item.financial_effect?`${item.financial_effect.state} · ${item.financial_effect.obligation_id}`:'',
      item.financial_effect?.outstanding_amount_clp??'',
      item.object_version,projection.authority,item.responsible.actor_id
    ])
  ];
}
function requestResultMutation(rowNumber,status,result,appliedAt){
  return {
    op:'update',
    kind:'REQUEST_STATUS',
    spreadsheetId:WORK_SHEET_ID,
    range:`${WORK_REQUESTS_SHEET}!I${rowNumber}:K${rowNumber}`,
    values:[[status,result,appliedAt]]
  };
}
function auditRow(entry,objectVersion){
  return [
    entry.transition_id,entry.work_id,entry.from,entry.to,entry.requested_by,entry.reason,
    entry.evidence_refs.join('|'),entry.timestamp,'APPLIED',objectVersion
  ];
}

export function planWorkStateRequests({
  requestValues,
  stateStore,
  now=()=>new Date().toISOString(),
  expectedPending=null
}){
  assertHeaders(requestValues,REQUEST_HEADERS,WORK_REQUESTS_SHEET);
  const requests=rowsToObjects(requestValues).filter(r=>clean(r.PROCESS_STATUS)==='PENDING');
  if(expectedPending!==null&&requests.length!==expectedPending){
    throw new Error(`WORK safety gate: pendientes ${requests.length}, esperado ${expectedPending}`);
  }

  const state=clone(stateStore);
  const sheetMutations=[];
  const summary=[];
  const existingRequestIds=new Set(state.audit.map(x=>clean(x.request_id)).filter(Boolean));

  for(const req of requests){
    const appliedAt=now();
    const requestId=clean(req.REQUEST_ID);
    const workId=clean(req.WORK_ID);
    const expectedState=clean(req.EXPECTED_STATE);
    const action=clean(req.ACTION).toUpperCase();
    const reason=clean(req.REASON);
    const evidenceRef=clean(req.EVIDENCE_REF);
    const requestedBy=clean(req.REQUESTED_BY).toLowerCase();

    if(!requestId||!workId||!expectedState||!action||!reason||!requestedBy){
      const result='Bloqueado: solicitud incompleta';
      sheetMutations.push(requestResultMutation(req.__row,'BLOCKED',result,appliedAt));
      summary.push({row:req.__row,request_id:requestId,work_id:workId,status:'BLOCKED_INCOMPLETE'});
      continue;
    }
    if(requestedBy!==ALLOWED_REQUESTER){
      const result='Bloqueado: solicitante no autorizado';
      sheetMutations.push(requestResultMutation(req.__row,'BLOCKED',result,appliedAt));
      summary.push({row:req.__row,request_id:requestId,work_id:workId,status:'BLOCKED_REQUESTER'});
      continue;
    }
    if(existingRequestIds.has(requestId)){
      const result='Solicitud ya aplicada anteriormente';
      sheetMutations.push(requestResultMutation(req.__row,'APPLIED',result,appliedAt));
      summary.push({row:req.__row,request_id:requestId,work_id:workId,status:'DUPLICATE_ALREADY_APPLIED'});
      continue;
    }

    const nextState=ACTION_TO_STATE[action];
    if(!nextState){
      const result='Bloqueado: acción no implementada';
      sheetMutations.push(requestResultMutation(req.__row,'BLOCKED',result,appliedAt));
      summary.push({row:req.__row,request_id:requestId,work_id:workId,status:'BLOCKED_ACTION'});
      continue;
    }

    const transition=transitionWorkItem({
      objects:state.objects,
      workItemId:workId,
      expectedState,
      nextState,
      performedByActorId:'CUDO-ACTOR-ADMIN-SISTEMAS',
      reason,
      evidenceRefs:evidenceRef?[evidenceRef]:[],
      now:appliedAt
    });

    if(!transition.ok){
      const result=`Bloqueado: ${transition.status}`;
      sheetMutations.push(requestResultMutation(req.__row,'BLOCKED',result,appliedAt));
      summary.push({row:req.__row,request_id:requestId,work_id:workId,status:transition.status});
      continue;
    }

    state.objects=transition.objects;
    const updated=state.objects.find(x=>x.object_id===workId);
    const audit={request_id:requestId,requested_by:requestedBy,...transition.audit};
    state.audit.push(audit);
    existingRequestIds.add(requestId);

    sheetMutations.push(requestResultMutation(req.__row,'APPLIED',`${expectedState} -> ${nextState}`,appliedAt));
    sheetMutations.push({
      op:'append',
      kind:'WORK_AUDIT',
      spreadsheetId:WORK_SHEET_ID,
      range:`${WORK_AUDIT_SHEET}!A:J`,
      values:[auditRow(audit,updated.object_version)]
    });
    summary.push({
      row:req.__row,
      request_id:requestId,
      work_id:workId,
      status:'APPLIED',
      from:expectedState,
      to:nextState
    });
  }

  const generatedAt=now();
  const financialEffects=deriveFinancialObligationsFromCompletedWork({
    objects:state.objects,
    now:generatedAt
  });
  state.objects=financialEffects.objects;
  state.financial_audit=[
    ...(state.financial_audit||[]),
    ...financialEffects.audit.filter(x=>x.kind==='FINANCIAL_OBLIGATION_CREATED')
  ];

  const financialSnapshot=buildFinancialSnapshot({
    objects:state.objects,
    settlements:[],
    openingPositions:{},
    currency:'CLP'
  });
  if(!financialSnapshot.ok){
    throw new Error(`WORK financial snapshot invalid: ${JSON.stringify(financialSnapshot.errors)}`);
  }

  const baseProjection=buildClubOperationalStateProjection({
    objects:state.objects,
    generatedAt,
    referenceDate:generatedAt.slice(0,10)
  });
  const projection=enrichOperationalProjectionWithFinancialEffects({
    projection:baseProjection,
    objects:state.objects,
    financialSnapshot
  });
  sheetMutations.push({
    op:'replace',
    kind:'WORK_CONTROL',
    spreadsheetId:WORK_SHEET_ID,
    range:`${WORK_CONTROL_SHEET}!A:P`,
    values:buildControlRows(projection)
  });

  return {
    ok:true,
    pending_count:requests.length,
    summary,
    state_store:state,
    projection,
    sheet_mutations:sheetMutations,
    production_write:false
  };
}

async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function getAccessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('WORK: OAuth Google incompleto');
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})
  });
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`WORK OAuth HTTP ${r.status}`);
  return d.access_token;
}
async function googleAdapter(){
  const token=await getAccessToken();
  const request=async(method,url,body)=>{
    let last;
    for(let i=0;i<5;i++){
      const r=await fetch(url,{
        method,
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:body===undefined?undefined:JSON.stringify(body)
      });
      const text=await r.text();
      const d=text?JSON.parse(text):{};
      if(r.ok) return d;
      last={status:r.status,d};
      if(![429,500,502,503,504].includes(r.status)||i===4) break;
      await sleep(700*(2**i));
    }
    throw new Error(`WORK Sheets HTTP ${last?.status}: ${last?.d?.error?.message||'desconocido'}`);
  };
  return {
    readValues:async(id,range)=>(await request(
      'GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
    )).values||[],
    updateValues:async(id,range,values)=>request(
      'PUT',
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {range,majorDimension:'ROWS',values}
    ),
    appendValues:async(id,range,values)=>request(
      'POST',
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {range,majorDimension:'ROWS',values}
    ),
    clearValues:async(id,range)=>request(
      'POST',
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}:clear`,
      {}
    )
  };
}

export async function applyWorkStateRequests({
  statePath=DEFAULT_STATE_PATH,
  projectionPath=DEFAULT_PROJECTION_PATH,
  expectedPending=null
}={}){
  const adapter=await googleAdapter();
  const requests=await adapter.readValues(WORK_SHEET_ID,`${WORK_REQUESTS_SHEET}!A:K`);
  const plan=planWorkStateRequests({
    requestValues:requests,
    stateStore:loadOperationalWorkState(statePath),
    expectedPending
  });

  for(const m of plan.sheet_mutations){
    if(m.op==='update') await adapter.updateValues(m.spreadsheetId,m.range,m.values);
    else if(m.op==='append') await adapter.appendValues(m.spreadsheetId,m.range,m.values);
    else if(m.op==='replace'){
      await adapter.clearValues(m.spreadsheetId,m.range);
      await adapter.updateValues(m.spreadsheetId,m.range,m.values);
    }
  }

  fs.writeFileSync(statePath,JSON.stringify(plan.state_store,null,2)+'\n');
  fs.writeFileSync(projectionPath,JSON.stringify(plan.projection,null,2)+'\n');
  return {...plan,writes_applied:plan.sheet_mutations.length};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const expectedRaw=process.env.CUDO_WORK_EXPECT_PENDING;
  const expectedPending=expectedRaw===undefined||expectedRaw===''?null:Number(expectedRaw);
  if(expectedPending!==null&&!Number.isInteger(expectedPending)){
    throw new Error('CUDO_WORK_EXPECT_PENDING debe ser entero');
  }
  applyWorkStateRequests({expectedPending}).then(r=>console.log(JSON.stringify({
    ok:r.ok,
    pending_count:r.pending_count,
    summary:r.summary,
    writes_applied:r.writes_applied,
    production_write:false
  },null,2))).catch(e=>{console.error(e.stack||e);process.exit(1);});
}
