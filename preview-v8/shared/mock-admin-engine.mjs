const clone=v=>JSON.parse(JSON.stringify(v));

const WORK_TRANSITIONS={
  OPEN:new Set(['IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','CANCELLED']),
  IN_PROGRESS:new Set(['BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED']),
  BLOCKED:new Set(['OPEN','IN_PROGRESS','CANCELLED']),
  WAITING_EXTERNAL:new Set(['OPEN','IN_PROGRESS','CANCELLED']),
  DONE:new Set([]),
  CANCELLED:new Set(['OPEN'])
};

const DECISION_TRANSITIONS={
  PENDING_HUMAN:new Set(['APPROVED','CANCELLED']),
  APPROVED:new Set(['APPLIED','CANCELLED']),
  APPLIED:new Set([]),
  CANCELLED:new Set(['PENDING_HUMAN'])
};

function assertRuntime(runtime){
  if(!runtime||runtime.schema_version!=='CUDO_MOCK_ADMIN_RUNTIME_V1') throw new Error('invalid mock runtime');
  if(!runtime.state||runtime.state.schema_version!=='CUDO_CLUB_OS_GOLDEN_MOCK_V1') throw new Error('invalid golden mock state');
}
function findBy(list,key,value,label){
  const item=(list||[]).find(x=>x[key]===value);
  if(!item) throw new Error(`${label||key} not found: ${value}`);
  return item;
}
function nextAuditId(state){
  return `MOCK-AUDIT-RUNTIME-${String((state.audit||[]).length+1).padStart(4,'0')}`;
}
function appendAudit(state,entry,at){
  state.audit=state.audit||[];
  state.audit.push({
    audit_id:nextAuditId(state),
    at,
    mock:true,
    ...entry
  });
}
function attentionForWork(work,referenceDate){
  if(work.state==='BLOCKED') return 'BLOCKED';
  if(work.state==='WAITING_EXTERNAL') return 'WAITING_EXTERNAL';
  if(work.state==='DONE') return 'DONE';
  if(work.state==='CANCELLED') return 'CANCELLED';
  if(work.state==='IN_PROGRESS') return 'IN_PROGRESS';
  if(work.due_at&&String(work.due_at).slice(0,10)<referenceDate) return 'OVERDUE';
  return 'PENDING';
}
function reconcileDependencies(state,at){
  const byWork=new Map(state.work_items.map(x=>[x.work_id,x]));
  const transitions=[];
  for(const work of state.work_items){
    const deps=work.dependency_refs||[];
    if(work.state!=='BLOCKED'||!deps.length) continue;
    const unresolved=deps.filter(id=>byWork.get(id)?.state!=='DONE');
    if(unresolved.length===0){
      const from=work.state;
      work.state='OPEN';
      work.attention='PENDING';
      work.blocker_reason=null;
      transitions.push({kind:'AUTO_UNBLOCK_DEPENDENCY',work_id:work.work_id,from,to:'OPEN',dependency_refs:[...deps]});
      appendAudit(state,{kind:'AUTO_UNBLOCK_DEPENDENCY',object_ref:work.work_id,from,to:'OPEN',dependency_refs:[...deps]},at);
    }
  }
  return transitions;
}
function resourceStillBlocking(resource){
  return resource && ['MAINTENANCE','UNAVAILABLE','BLOCKED','OUT_OF_SERVICE'].includes(resource.state);
}
function reconcileResourceBlockers(state,at){
  const resources=new Map(state.resources.map(x=>[x.resource_id,x]));
  const transitions=[];
  for(const work of state.work_items){
    const refs=work.blocker_refs||[];
    if(work.state!=='BLOCKED'||!refs.length) continue;
    const unresolved=refs.filter(id=>resourceStillBlocking(resources.get(id)));
    if(unresolved.length===0){
      const from=work.state;
      work.state='OPEN';
      work.attention='PENDING';
      work.blocker_reason=null;
      transitions.push({kind:'AUTO_UNBLOCK_RESOURCE',work_id:work.work_id,from,to:'OPEN',blocker_refs:[...refs]});
      appendAudit(state,{kind:'AUTO_UNBLOCK_RESOURCE',object_ref:work.work_id,from,to:'OPEN',blocker_refs:[...refs]},at);
    }
  }
  return transitions;
}
function dedupeAction(runtime,action){
  if(!action.action_id) return null;
  return (runtime.applied_actions||[]).find(x=>x.action_id===action.action_id)||null;
}

export function createMockRuntime(golden,{createdAt='2026-09-18T18:30:00-03:00'}={}){
  if(!golden||golden.schema_version!=='CUDO_CLUB_OS_GOLDEN_MOCK_V1'||golden.mock!==true) throw new Error('golden mock required');
  return {
    schema_version:'CUDO_MOCK_ADMIN_RUNTIME_V1',
    environment:'qa-v8-mock',
    mock:true,
    production_write:false,
    revision:1,
    created_at:createdAt,
    updated_at:createdAt,
    state:clone(golden),
    applied_actions:[]
  };
}

export function applyMockAdminAction(runtime,action){
  assertRuntime(runtime);
  if(!action||typeof action!=='object') throw new Error('action required');
  const replay=dedupeAction(runtime,action);
  if(replay) return {ok:true,replayed:true,runtime:clone(runtime),effects:clone(replay.effects||[])};
  if(action.expected_revision!=null&&Number(action.expected_revision)!==Number(runtime.revision)){
    throw new Error(`stale revision: expected ${action.expected_revision}, current ${runtime.revision}`);
  }
  const next=clone(runtime);
  const state=next.state;
  const at=action.at||new Date().toISOString();
  const effects=[];

  if(action.type==='WORK_TRANSITION'){
    const work=findBy(state.work_items,'work_id',action.work_id,'work');
    const expected=action.expected_state||work.state;
    if(work.state!==expected) throw new Error(`work state conflict: ${work.state} != ${expected}`);
    const allowed=WORK_TRANSITIONS[work.state]||new Set();
    if(!allowed.has(action.next_state)) throw new Error(`invalid work transition ${work.state} -> ${action.next_state}`);
    if(action.next_state==='DONE'){
      const evidence=action.evidence_ref||null;
      if(!evidence&&(work.evidence_refs||[]).length===0) throw new Error('DONE requires evidence');
      if(evidence&&!work.evidence_refs.includes(evidence)) work.evidence_refs.push(evidence);
    }
    if(action.next_state==='BLOCKED'&&!action.blocker_reason&&!(action.blocker_refs||[]).length) throw new Error('BLOCKED requires blocker');
    if(action.next_state==='WAITING_EXTERNAL'&&!action.blocker_reason) throw new Error('WAITING_EXTERNAL requires reason');
    const from=work.state;
    work.state=action.next_state;
    work.attention=attentionForWork(work,String(at).slice(0,10));
    if(action.blocker_reason!=null) work.blocker_reason=action.blocker_reason;
    if(action.blocker_refs) work.blocker_refs=[...action.blocker_refs];
    if(!['BLOCKED','WAITING_EXTERNAL'].includes(action.next_state)){
      if(action.clear_blocker!==false) work.blocker_reason=null;
    }
    appendAudit(state,{kind:'WORK_TRANSITION',object_ref:work.work_id,from,to:work.state,reason:action.reason||null,evidence_ref:action.evidence_ref||null},at);
    effects.push({kind:'WORK_TRANSITION',work_id:work.work_id,from,to:work.state});
    effects.push(...reconcileDependencies(state,at));
  } else if(action.type==='RESOURCE_STATE_SET'){
    const resource=findBy(state.resources,'resource_id',action.resource_id,'resource');
    const expected=action.expected_state||resource.state;
    if(resource.state!==expected) throw new Error(`resource state conflict: ${resource.state} != ${expected}`);
    const from=resource.state;
    resource.state=action.next_state;
    resource.attention=action.attention||(['AVAILABLE','READY'].includes(action.next_state)?'NORMAL':'ACTION_REQUIRED');
    appendAudit(state,{kind:'RESOURCE_STATE_SET',object_ref:resource.resource_id,from,to:resource.state,reason:action.reason||null},at);
    effects.push({kind:'RESOURCE_STATE_SET',resource_id:resource.resource_id,from,to:resource.state});
    effects.push(...reconcileResourceBlockers(state,at));
  } else if(action.type==='DECISION_TRANSITION'){
    const decision=findBy(state.decisions,'decision_id',action.decision_id,'decision');
    const expected=action.expected_state||decision.state;
    if(decision.state!==expected) throw new Error(`decision state conflict: ${decision.state} != ${expected}`);
    const allowed=DECISION_TRANSITIONS[decision.state]||new Set();
    if(!allowed.has(action.next_state)) throw new Error(`invalid decision transition ${decision.state} -> ${action.next_state}`);
    const from=decision.state;
    decision.state=action.next_state;
    appendAudit(state,{kind:'DECISION_TRANSITION',object_ref:decision.decision_id,from,to:decision.state,reason:action.reason||null},at);
    effects.push({kind:'DECISION_TRANSITION',decision_id:decision.decision_id,from,to:decision.state});
  } else if(action.type==='EVIDENCE_ADD'){
    if(!action.evidence_id||!action.kind||!action.display_name) throw new Error('evidence fields required');
    if((state.evidence||[]).some(x=>x.evidence_id===action.evidence_id)) throw new Error('duplicate evidence');
    const evidence={
      evidence_id:action.evidence_id,
      kind:action.kind,
      display_name:action.display_name,
      state:'AVAILABLE',
      related_refs:[...(action.related_refs||[])],
      mock:true
    };
    state.evidence.push(evidence);
    appendAudit(state,{kind:'EVIDENCE_ADDED',object_ref:evidence.evidence_id,related_refs:[...evidence.related_refs]},at);
    effects.push({kind:'EVIDENCE_ADDED',evidence_id:evidence.evidence_id});
  } else if(action.type==='FINANCIAL_SETTLE'){
    const obligation=findBy(state.financial_obligations,'obligation_id',action.obligation_id,'obligation');
    const amount=Number(action.amount_clp);
    if(!Number.isInteger(amount)||amount<=0) throw new Error('positive integer amount_clp required');
    if(amount>Number(obligation.outstanding_amount_clp)) throw new Error('settlement exceeds outstanding');
    const seq=state.financial_movements.length+1;
    const movementId=action.movement_id||`MOCK-MOV-RUNTIME-${String(seq).padStart(3,'0')}`;
    const settlementId=action.settlement_id||`MOCK-SET-RUNTIME-${String((state.settlements||[]).length+1).padStart(3,'0')}`;
    if(state.financial_movements.some(x=>x.movement_id===movementId)) throw new Error('duplicate movement');
    const movement={
      movement_id:movementId,
      direction:obligation.direction==='PAYABLE'?'OUT':'IN',
      amount_clp:amount,
      channel:action.channel||'BANK_TRANSFER',
      status:'CONFIRMED',
      reconciliation_state:'RECONCILED',
      occurred_at:at,
      settlement_refs:[settlementId],
      evidence_ref:action.evidence_ref||null,
      mock:true
    };
    const settlement={settlement_id:settlementId,movement_id:movementId,obligation_id:obligation.obligation_id,amount_clp:amount,state:'ACTIVE',mock:true};
    state.financial_movements.push(movement);
    state.settlements=state.settlements||[];
    state.settlements.push(settlement);
    obligation.settled_amount_clp=Number(obligation.settled_amount_clp||0)+amount;
    obligation.outstanding_amount_clp=Number(obligation.amount_clp)-obligation.settled_amount_clp;
    obligation.state=obligation.outstanding_amount_clp===0?'SETTLED':'PARTIALLY_SETTLED';
    appendAudit(state,{kind:'FINANCIAL_SETTLEMENT',object_ref:obligation.obligation_id,movement_ref:movementId,amount_clp:amount},at);
    effects.push({kind:'FINANCIAL_SETTLEMENT',obligation_id:obligation.obligation_id,movement_id:movementId,amount_clp:amount,new_state:obligation.state,outstanding_amount_clp:obligation.outstanding_amount_clp});
  } else {
    throw new Error(`unsupported action type ${action.type}`);
  }

  next.revision+=1;
  next.updated_at=at;
  next.applied_actions=next.applied_actions||[];
  next.applied_actions.push({action_id:action.action_id||`REV-${next.revision}`,type:action.type,at,effects:clone(effects)});
  return {ok:true,replayed:false,runtime:next,effects};
}

export function deriveMockReadModels(runtime,{referenceDate=null}={}){
  assertRuntime(runtime);
  const state=runtime.state;
  const date=referenceDate||String(runtime.updated_at).slice(0,10);
  const actors=new Map(state.actors.map(x=>[x.actor_id,x]));
  const resources=new Map(state.resources.map(x=>[x.resource_id,x]));
  const sources=new Map();
  for(const x of state.events) sources.set(x.event_id,x.display_name);
  for(const x of state.resources) sources.set(x.resource_id,x.display_name);
  for(const x of state.financial_obligations) sources.set(x.obligation_id,x.obligation_id);
  for(const x of state.decisions) sources.set(x.decision_id,x.display_name);
  const obligations=new Map(state.financial_obligations.map(x=>[x.obligation_id,x]));
  const works=new Map(state.work_items.map(x=>[x.work_id,x]));

  const items=state.work_items.map(w=>{
    const unresolved=(w.dependency_refs||[]).filter(id=>works.get(id)?.state!=='DONE');
    const obligation=(w.financial_obligation_refs||[]).map(id=>obligations.get(id)).find(Boolean)||null;
    return {
      work_id:w.work_id,title:w.title,work_kind:w.work_kind,state:w.state,
      attention:attentionForWork(w,date),
      responsible:{actor_id:w.responsible_actor_id,display_name:actors.get(w.responsible_actor_id)?.display_name||'Mock'},
      due_date:w.due_at?String(w.due_at).slice(0,10):null,priority:w.priority,
      resource:w.resource_ref?{resource_id:w.resource_ref,display_name:resources.get(w.resource_ref)?.display_name||w.resource_ref}:{resource_id:null,display_name:'Sin recurso'},
      source:{object_id:w.source_ref,display_name:sources.get(w.source_ref)||w.source_ref},
      trigger_reason:'MOCK_RUNTIME',
      blockers:{refs:[...(w.blocker_refs||[])],reason:w.blocker_reason||null},
      dependencies:{refs:[...(w.dependency_refs||[])],unresolved},
      financial_effect:obligation?{
        obligation_id:obligation.obligation_id,direction:obligation.direction,kind:obligation.kind,
        amount_clp:obligation.amount_clp,settled_amount_clp:obligation.settled_amount_clp,
        outstanding_amount_clp:obligation.outstanding_amount_clp,state:obligation.state
      }:null,
      evidence_refs:[...(w.evidence_refs||[])],object_version:runtime.revision,mock:true
    };
  });
  const count=s=>items.filter(x=>x.state===s).length;
  const operation={
    schema_version:'CUDO_CLUB_OPERATIONAL_STATE_V1',generated_at:runtime.updated_at,reference_date:date,
    authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{
      total:items.length,open:count('OPEN'),in_progress:count('IN_PROGRESS'),blocked:count('BLOCKED'),
      waiting_external:count('WAITING_EXTERNAL'),done:count('DONE'),cancelled:count('CANCELLED'),
      overdue:items.filter(x=>x.attention==='OVERDUE').length
    },items,production_write:false
  };
  const finance={
    schema_version:'CUDO_ADMIN_FINANCE_READ_MODEL_V1',generated_at:runtime.updated_at,source_revision:`MOCK-RUNTIME-${runtime.revision}`,
    authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{
      obligations_total:state.financial_obligations.length,
      obligations_open:state.financial_obligations.filter(x=>x.outstanding_amount_clp>0).length,
      outstanding_payable:state.financial_obligations.filter(x=>x.direction==='PAYABLE').reduce((s,x)=>s+Number(x.outstanding_amount_clp||0),0),
      outstanding_receivable:state.financial_obligations.filter(x=>x.direction==='RECEIVABLE').reduce((s,x)=>s+Number(x.outstanding_amount_clp||0),0),
      confirmed_movements:state.financial_movements.filter(x=>x.status==='CONFIRMED').length,
      pending_movements:state.financial_movements.filter(x=>x.status==='PENDING').length,
      reconciliation_complete:state.financial_movements.filter(x=>x.status==='CONFIRMED').every(x=>x.reconciliation_state==='RECONCILED')
    },obligations:clone(state.financial_obligations),movements:clone(state.financial_movements),settlements:clone(state.settlements||[]),production_write:false
  };
  return {
    operation,
    finance,
    resources:{schema_version:'CUDO_RESOURCE_STATE_MOCK_V1',generated_at:runtime.updated_at,authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{total:state.resources.length,blocking:state.resources.filter(x=>x.attention==='BLOCKING').length,action_required:state.resources.filter(x=>x.attention==='ACTION_REQUIRED').length},items:clone(state.resources),production_write:false},
    governance:{schema_version:'CUDO_GOVERNANCE_STATE_MOCK_V1',generated_at:runtime.updated_at,authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{total:state.decisions.length,pending_human:state.decisions.filter(x=>x.state==='PENDING_HUMAN').length,approved_or_applied:state.decisions.filter(x=>['APPROVED','APPLIED'].includes(x.state)).length},decisions:clone(state.decisions),production_write:false},
    evidence:{schema_version:'CUDO_EVIDENCE_AUDIT_STATE_MOCK_V1',generated_at:runtime.updated_at,authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{evidence_total:state.evidence.length,evidence_missing:state.evidence.filter(x=>x.state==='MISSING').length,audit_events:(state.audit||[]).length},evidence:clone(state.evidence),audit:clone(state.audit||[]),production_write:false}
  };
}
