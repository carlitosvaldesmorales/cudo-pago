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

const EVENT_TRANSITIONS={
  SCHEDULED:new Set(['LIVE','CANCELLED']),
  LIVE:new Set(['COMPLETED','CANCELLED']),
  COMPLETED:new Set([]),
  CANCELLED:new Set([])
};

const CUDO_TOURNAMENT_RULESET_REF='CUDO_QUADRANGULAR_OTONO_BOUNDED_RULESET';
const SANCTION_RULES={
  DOUBLE_YELLOW:{
    fine_clp:10000,
    rule_id:'CUDO_QUADRANGULAR_OTONO_RULE_9_DOUBLE_YELLOW',
    consequence:'MAY_PLAY_NEXT_DATE_IF_FINE_PAID'
  },
  DIRECT_RED:{
    fine_clp:15000,
    rule_id:'CUDO_QUADRANGULAR_OTONO_RULE_9_DIRECT_RED',
    consequence:'MAY_PLAY_NEXT_DATE_IF_FINE_PAID'
  },
  SERIOUS_FOUL_OR_AGGRESSION:{
    fine_clp:null,
    rule_id:'CUDO_QUADRANGULAR_OTONO_RULE_9_SERIOUS_AGGRESSION',
    consequence:'EXPELLED_FROM_TOURNAMENT'
  }
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
function syntheticName(value){
  const text=String(value||'').trim();
  if(!text) throw new Error('display_name required');
  return /mock/i.test(text)?text:`${text} (Mock)`;
}
function mockTeamName(value){
  const text=String(value||'').trim();
  if(!text) throw new Error('team required');
  if(text.toUpperCase()==='CUDO') return 'CUDO';
  return /mock/i.test(text)?text:`${text} (Mock)`;
}
function validScore(value){
  return Number.isInteger(value)&&value>=0;
}
function requireMockId(value,prefix){
  const id=String(value||'').trim();
  if(!id.startsWith(prefix)) throw new Error(`id must start with ${prefix}`);
  return id;
}
function ensureUnique(list,key,id,label){
  if((list||[]).some(x=>x[key]===id)) throw new Error(`duplicate ${label||key}: ${id}`);
}
function knownSource(state,id){
  return [
    ...(state.events||[]).map(x=>x.event_id),
    ...(state.resources||[]).map(x=>x.resource_id),
    ...(state.decisions||[]).map(x=>x.decision_id),
    ...(state.financial_obligations||[]).map(x=>x.obligation_id),
    ...(state.work_items||[]).map(x=>x.work_id)
  ].includes(id);
}
function deriveWorkFromCreatedEvent(state,event,at){
  if(event.kind!=='MATCH'||event.state!=='SCHEDULED') return null;
  const actor=(state.actors||[]).find(x=>x.role==='OPERACIONES_ESTADIO')||(state.actors||[])[0];
  if(!actor) throw new Error('no mock actor available for derived event work');
  const suffix=String(event.event_id).replace(/^MOCK-EVENT-/,'');
  const workId=`MOCK-WORK-AUTO-PREP-${suffix}`;
  if((state.work_items||[]).some(x=>x.work_id===workId)) return null;
  const work={
    work_id:workId,
    title:`Preparar ${event.display_name}`,
    work_kind:'EVENT_PREPARATION',
    state:'OPEN',
    attention:'PENDING',
    priority:'NORMAL',
    responsible_actor_id:actor.actor_id,
    due_at:null,
    source_ref:event.event_id,
    resource_ref:(event.resource_refs||[])[0]||null,
    blocker_refs:[],
    dependency_refs:[],
    evidence_refs:[],
    financial_obligation_refs:[],
    derived_by_rule:'MOCK_RULE_SCHEDULED_MATCH_TO_PREPARATION_WORK_V1',
    mock:true
  };
  state.work_items.push(work);
  appendAudit(state,{kind:'WORK_DERIVED_FROM_SOURCE_EVENT',object_ref:work.work_id,source_ref:event.event_id,rule_id:work.derived_by_rule},at);
  return work;
}

function derivePostEventWork(state,event,at){
  if(event.kind!=='MATCH'||event.state!=='COMPLETED') return [];
  const actor=(state.actors||[]).find(x=>x.role==='OPERACIONES_ESTADIO')||(state.actors||[])[0];
  if(!actor) throw new Error('no mock actor available for post-event work');
  const suffix=String(event.event_id).replace(/^MOCK-EVENT-/,'');
  const resourceRef=(event.resource_refs||[])[0]||null;
  const specs=[
    {
      work_id:`MOCK-WORK-AUTO-CLEAN-${suffix}`,
      title:`Aseo post-partido · ${event.display_name}`,
      work_kind:'STADIUM_CLEANING',
      rule:'MOCK_RULE_COMPLETED_MATCH_TO_STADIUM_CLEANING_V1'
    },
    {
      work_id:`MOCK-WORK-AUTO-KIT-${suffix}`,
      title:`Lavado de camisetas · ${event.display_name}`,
      work_kind:'KIT_WASHING',
      rule:'MOCK_RULE_COMPLETED_MATCH_TO_KIT_WASHING_V1'
    }
  ];
  const created=[];
  for(const spec of specs){
    if((state.work_items||[]).some(x=>x.work_id===spec.work_id)) continue;
    const work={
      work_id:spec.work_id,
      title:spec.title,
      work_kind:spec.work_kind,
      state:'OPEN',
      attention:'PENDING',
      priority:'NORMAL',
      responsible_actor_id:actor.actor_id,
      due_at:null,
      source_ref:event.event_id,
      resource_ref:resourceRef,
      blocker_refs:[],
      dependency_refs:[],
      evidence_refs:[],
      financial_obligation_refs:[],
      derived_by_rule:spec.rule,
      mock:true
    };
    state.work_items.push(work);
    appendAudit(state,{kind:'POST_EVENT_WORK_CREATED',object_ref:work.work_id,source_ref:event.event_id,rule_id:spec.rule},at);
    created.push(work);
  }
  return created;
}

function reconcileMemberFinancialState(state,actorId,at){
  const actor=(state.actors||[]).find(x=>x.actor_id===actorId);
  if(!actor?.membership) return null;
  const dues=(state.financial_obligations||[]).filter(x=>x.kind==='MEMBERSHIP_DUE'&&x.cause_ref===actorId);
  const outstanding=dues.reduce((sum,x)=>sum+Number(x.outstanding_amount_clp||0),0);
  const nextStatus=outstanding===0?'AL_DIA':'PENDIENTE';
  const from=actor.membership.financial_status||null;
  actor.membership.financial_status=nextStatus;
  actor.membership.outstanding_amount_clp=outstanding;
  actor.membership.obligation_refs=dues.map(x=>x.obligation_id);
  if(from!==nextStatus){
    appendAudit(state,{kind:'MEMBER_FINANCIAL_STATUS_RECALCULATED',object_ref:actorId,from,to:nextStatus,outstanding_amount_clp:outstanding},at);
  }
  return {kind:'MEMBER_FINANCIAL_STATUS_RECALCULATED',actor_id:actorId,from,to:nextStatus,outstanding_amount_clp:outstanding};
}

function reconcileSanctionEligibility(state,actorId,tournamentRef,at){
  const actor=findBy(state.actors,'actor_id',actorId,'sanctioned actor');
  const current=actor.sports_eligibility||{};
  if(current.status==='EXPELLED_TOURNAMENT'){
    return {kind:'PLAYER_ELIGIBILITY_RECALCULATED',actor_id:actorId,from:'EXPELLED_TOURNAMENT',to:'EXPELLED_TOURNAMENT',outstanding_amount_clp:Number(current.outstanding_amount_clp||0),preserved_expulsion:true};
  }
  const fines=(state.financial_obligations||[]).filter(x=>x.kind==='SANCTION_FINE'&&x.counterparty_ref===actorId&&x.tournament_ref===tournamentRef);
  const outstanding=fines.reduce((sum,x)=>sum+Number(x.outstanding_amount_clp||0),0);
  const nextStatus=outstanding===0?'ELIGIBLE_NEXT_DATE':'SUSPENDED_PENDING_FINE';
  const from=current.status||null;
  const sanctionRefs=(state.decisions||[]).filter(x=>x.kind==='TOURNAMENT_SANCTION'&&x.subject_actor_id===actorId&&x.tournament_ref===tournamentRef).map(x=>x.decision_id);
  actor.sports_eligibility={
    tournament_ref:tournamentRef,
    status:nextStatus,
    outstanding_amount_clp:outstanding,
    obligation_refs:fines.map(x=>x.obligation_id),
    sanction_refs:sanctionRefs,
    mock:true
  };
  if(from!==nextStatus||Number(current.outstanding_amount_clp||0)!==outstanding){
    appendAudit(state,{kind:'PLAYER_ELIGIBILITY_RECALCULATED',object_ref:actorId,from,to:nextStatus,tournament_ref:tournamentRef,outstanding_amount_clp:outstanding},at);
  }
  return {kind:'PLAYER_ELIGIBILITY_RECALCULATED',actor_id:actorId,from,to:nextStatus,outstanding_amount_clp:outstanding};
}

function cancelDerivedPreparationForEvent(state,event,at){
  const changed=[];
  for(const work of state.work_items||[]){
    if(work.source_ref!==event.event_id) continue;
    if(work.work_kind!=='EVENT_PREPARATION') continue;
    if(work.derived_by_rule!=='MOCK_RULE_SCHEDULED_MATCH_TO_PREPARATION_WORK_V1') continue;
    if(!['OPEN','IN_PROGRESS','BLOCKED','WAITING_EXTERNAL'].includes(work.state)) continue;
    const from=work.state;
    work.state='CANCELLED';
    work.attention='CANCELLED';
    work.blocker_reason=null;
    appendAudit(state,{kind:'AUTO_CANCEL_EVENT_PREPARATION',object_ref:work.work_id,source_ref:event.event_id,from,to:'CANCELLED'},at);
    changed.push({kind:'AUTO_CANCEL_EVENT_PREPARATION',work_id:work.work_id,from,to:'CANCELLED'});
  }
  return changed;
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

  if(action.type==='SANCTION_APPLY'){
    const sanctionId=requireMockId(action.sanction_id,'MOCK-DECISION-SANCTION-');
    ensureUnique(state.decisions,'decision_id',sanctionId,'sanction decision');
    const actor=findBy(state.actors,'actor_id',action.actor_id,'sanctioned actor');
    if(actor.actor_kind!=='PERSON') throw new Error('sanctioned actor must be PERSON');
    const sanctionKind=String(action.sanction_kind||'').trim().toUpperCase();
    const rule=SANCTION_RULES[sanctionKind];
    if(!rule) throw new Error('unsupported bounded tournament sanction');
    const tournamentRef=String(action.tournament_ref||CUDO_TOURNAMENT_RULESET_REF);
    if(tournamentRef!==CUDO_TOURNAMENT_RULESET_REF) throw new Error('sanction tournament scope not allowed');
    if(actor.sports_eligibility?.status==='EXPELLED_TOURNAMENT') throw new Error('expelled actor cannot regain eligibility through payable sanction');
    if(sanctionKind==='SERIOUS_FOUL_OR_AGGRESSION'&&action.fine_amount_clp!=null){
      throw new Error('serious aggression is non-payable in bounded ruleset');
    }
    const decision={
      decision_id:sanctionId,
      kind:'TOURNAMENT_SANCTION',
      display_name:`${sanctionKind} · ${actor.display_name}`,
      state:'APPLIED',
      responsible_actor_id:actor.actor_id,
      subject_actor_id:actor.actor_id,
      sanction_kind:sanctionKind,
      tournament_ref:tournamentRef,
      rule_id:rule.rule_id,
      consequence:rule.consequence,
      mock:true
    };
    state.decisions.push(decision);
    appendAudit(state,{kind:'SANCTION_INCIDENT_RECORDED',object_ref:sanctionId,actor_ref:actor.actor_id,sanction_kind:sanctionKind,tournament_ref:tournamentRef},at);
    appendAudit(state,{kind:'TOURNAMENT_RULE_APPLIED',object_ref:sanctionId,actor_ref:actor.actor_id,rule_id:rule.rule_id,consequence:rule.consequence},at);
    effects.push({kind:'SANCTION_INCIDENT_RECORDED',sanction_id:sanctionId,actor_id:actor.actor_id,sanction_kind:sanctionKind});
    effects.push({kind:'TOURNAMENT_RULE_APPLIED',sanction_id:sanctionId,rule_id:rule.rule_id});

    if(sanctionKind==='SERIOUS_FOUL_OR_AGGRESSION'){
      const from=actor.sports_eligibility?.status||null;
      actor.sports_eligibility={
        tournament_ref:tournamentRef,
        status:'EXPELLED_TOURNAMENT',
        outstanding_amount_clp:0,
        obligation_refs:[],
        sanction_refs:[...(actor.sports_eligibility?.sanction_refs||[]),sanctionId],
        mock:true
      };
      appendAudit(state,{kind:'PLAYER_ELIGIBILITY_RECALCULATED',object_ref:actor.actor_id,from,to:'EXPELLED_TOURNAMENT',tournament_ref:tournamentRef,outstanding_amount_clp:0},at);
      effects.push({kind:'PLAYER_ELIGIBILITY_RECALCULATED',actor_id:actor.actor_id,from,to:'EXPELLED_TOURNAMENT',outstanding_amount_clp:0});
    } else {
      const obligationId=`MOCK-OBL-SANCTION-${sanctionId.replace(/^MOCK-DECISION-SANCTION-/,'')}`;
      ensureUnique(state.financial_obligations,'obligation_id',obligationId,'sanction fine');
      const obligation={
        obligation_id:obligationId,
        direction:'RECEIVABLE',
        kind:'SANCTION_FINE',
        amount_clp:rule.fine_clp,
        settled_amount_clp:0,
        outstanding_amount_clp:rule.fine_clp,
        state:'OPEN',
        cause_ref:sanctionId,
        counterparty_ref:actor.actor_id,
        tournament_ref:tournamentRef,
        sanction_kind:sanctionKind,
        mock:true
      };
      state.financial_obligations.push(obligation);
      appendAudit(state,{kind:'SANCTION_FINE_DERIVED',object_ref:obligationId,cause_ref:sanctionId,actor_ref:actor.actor_id,amount_clp:rule.fine_clp,tournament_ref:tournamentRef},at);
      effects.push({kind:'SANCTION_FINE_DERIVED',obligation_id:obligationId,actor_id:actor.actor_id,amount_clp:rule.fine_clp});
      const eligibilityEffect=reconcileSanctionEligibility(state,actor.actor_id,tournamentRef,at);
      if(eligibilityEffect) effects.push(eligibilityEffect);
    }
  } else if(action.type==='MEMBER_ENROLL'){
    const actorId=requireMockId(action.actor_id,'MOCK-ACTOR-MEMBER-');
    ensureUnique(state.actors,'actor_id',actorId,'member actor');
    const amount=Number(action.amount_clp??2000);
    if(!Number.isInteger(amount)||amount<2000) throw new Error('membership monthly amount must be integer >= 2000 CLP');
    const period=String(action.period||'').trim();
    if(!/^\d{4}-\d{2}$/.test(period)) throw new Error('membership period must use YYYY-MM');
    const actor={
      actor_id:actorId,
      display_name:syntheticName(action.display_name),
      actor_kind:'PERSON',
      role:'MEMBER',
      membership:{
        status:'ACTIVE',
        plan:'MONTHLY',
        period,
        monthly_due_amount_clp:amount,
        financial_status:'PENDIENTE',
        outstanding_amount_clp:amount,
        obligation_refs:[],
        external_subscription_connected:false
      },
      mock:true
    };
    state.actors.push(actor);
    const obligationId=`MOCK-OBL-DUE-${actorId.replace(/^MOCK-ACTOR-MEMBER-/,'')}-${period}`;
    ensureUnique(state.financial_obligations,'obligation_id',obligationId,'membership due');
    const obligation={
      obligation_id:obligationId,
      direction:'RECEIVABLE',
      kind:'MEMBERSHIP_DUE',
      amount_clp:amount,
      settled_amount_clp:0,
      outstanding_amount_clp:amount,
      state:'OPEN',
      cause_ref:actorId,
      counterparty_ref:actorId,
      period,
      mock:true
    };
    state.financial_obligations.push(obligation);
    actor.membership.obligation_refs=[obligationId];
    appendAudit(state,{kind:'SOURCE_MEMBER_ENROLLED',object_ref:actorId,period,monthly_due_amount_clp:amount},at);
    appendAudit(state,{kind:'MEMBERSHIP_DUE_DERIVED',object_ref:obligationId,cause_ref:actorId,period,amount_clp:amount},at);
    effects.push({kind:'SOURCE_MEMBER_ENROLLED',actor_id:actorId});
    effects.push({kind:'MEMBERSHIP_DUE_DERIVED',obligation_id:obligationId,actor_id:actorId,amount_clp:amount,period});
  } else if(action.type==='ACTOR_CREATE'){
    const actorId=requireMockId(action.actor_id,'MOCK-ACTOR-');
    ensureUnique(state.actors,'actor_id',actorId,'actor');
    const actor={
      actor_id:actorId,
      display_name:syntheticName(action.display_name),
      actor_kind:action.actor_kind||'PERSON',
      role:action.role||'COLLABORATOR',
      mock:true
    };
    state.actors.push(actor);
    appendAudit(state,{kind:'SOURCE_ACTOR_CREATED',object_ref:actor.actor_id},at);
    effects.push({kind:'SOURCE_ACTOR_CREATED',actor_id:actor.actor_id});
  } else if(action.type==='RESOURCE_CREATE'){
    const resourceId=requireMockId(action.resource_id,'MOCK-RESOURCE-');
    ensureUnique(state.resources,'resource_id',resourceId,'resource');
    const resource={
      resource_id:resourceId,
      kind:action.kind||'RESOURCE',
      display_name:syntheticName(action.display_name),
      state:action.state||'AVAILABLE',
      attention:action.attention||'NORMAL',
      mock:true
    };
    state.resources.push(resource);
    appendAudit(state,{kind:'SOURCE_RESOURCE_CREATED',object_ref:resource.resource_id},at);
    effects.push({kind:'SOURCE_RESOURCE_CREATED',resource_id:resource.resource_id});
  } else if(action.type==='EVENT_CREATE'){
    const eventId=requireMockId(action.event_id,'MOCK-EVENT-');
    ensureUnique(state.events,'event_id',eventId,'event');
    for(const ref of action.resource_refs||[]){
      findBy(state.resources,'resource_id',ref,'resource');
    }
    const kind=action.kind||'ACTIVITY';
    const event={
      event_id:eventId,
      kind,
      display_name:syntheticName(action.display_name),
      state:action.state||'SCHEDULED',
      starts_at:action.starts_at||null,
      resource_refs:[...(action.resource_refs||[])],
      mock:true
    };
    if(kind==='MATCH'){
      const local=mockTeamName(action.local||'CUDO');
      const visita=mockTeamName(action.visita);
      if(local===visita) throw new Error('MATCH local and visita must differ');
      event.sports={
        public_match_id:eventId.toLowerCase(),
        local,
        visita,
        categoria:String(action.categoria||'PRIMERA').toUpperCase(),
        competencia:syntheticName(action.competencia||'Campeonato Club OS'),
        recinto:syntheticName(action.recinto||'Cancha de la Orilla'),
        counts_for_standings:action.counts_for_standings!==false
      };
    }
    state.events.push(event);
    appendAudit(state,{kind:'SOURCE_EVENT_CREATED',object_ref:event.event_id,state:event.state},at);
    effects.push({kind:'SOURCE_EVENT_CREATED',event_id:event.event_id});
    const derived=deriveWorkFromCreatedEvent(state,event,at);
    if(derived) effects.push({kind:'DERIVED_WORK_CREATED',work_id:derived.work_id,source_ref:event.event_id});
  } else if(action.type==='DECISION_CREATE'){
    const decisionId=requireMockId(action.decision_id,'MOCK-DECISION-');
    ensureUnique(state.decisions,'decision_id',decisionId,'decision');
    findBy(state.actors,'actor_id',action.responsible_actor_id,'responsible actor');
    const decision={
      decision_id:decisionId,
      kind:action.kind||'CLUB_DECISION',
      display_name:syntheticName(action.display_name),
      state:'PENDING_HUMAN',
      responsible_actor_id:action.responsible_actor_id,
      mock:true
    };
    state.decisions.push(decision);
    appendAudit(state,{kind:'SOURCE_DECISION_CREATED',object_ref:decision.decision_id},at);
    effects.push({kind:'SOURCE_DECISION_CREATED',decision_id:decision.decision_id});
  } else if(action.type==='HUMAN_WORK_CREATE'){
    const workId=requireMockId(action.work_id,'MOCK-WORK-');
    ensureUnique(state.work_items,'work_id',workId,'work');
    findBy(state.actors,'actor_id',action.responsible_actor_id,'responsible actor');
    if(!knownSource(state,action.source_ref)) throw new Error(`unknown work source: ${action.source_ref}`);
    if(action.resource_ref) findBy(state.resources,'resource_id',action.resource_ref,'resource');
    const work={
      work_id:workId,
      title:String(action.title||'').trim()||'Trabajo humano Mock',
      work_kind:action.work_kind||'HUMAN_CREATED_WORK',
      state:'OPEN',
      attention:'PENDING',
      priority:action.priority||'NORMAL',
      responsible_actor_id:action.responsible_actor_id,
      due_at:action.due_at||null,
      source_ref:action.source_ref,
      resource_ref:action.resource_ref||null,
      blocker_refs:[],
      dependency_refs:[...(action.dependency_refs||[])],
      evidence_refs:[],
      financial_obligation_refs:[],
      created_by_human:true,
      mock:true
    };
    for(const dep of work.dependency_refs) findBy(state.work_items,'work_id',dep,'dependency work');
    state.work_items.push(work);
    appendAudit(state,{kind:'HUMAN_WORK_CREATED',object_ref:work.work_id,source_ref:work.source_ref},at);
    effects.push({kind:'HUMAN_WORK_CREATED',work_id:work.work_id});
  } else if(action.type==='OBLIGATION_CREATE'){
    const obligationId=requireMockId(action.obligation_id,'MOCK-OBL-');
    ensureUnique(state.financial_obligations,'obligation_id',obligationId,'obligation');
    const amount=Number(action.amount_clp);
    if(!Number.isInteger(amount)||amount<=0) throw new Error('positive integer amount_clp required');
    if(!['PAYABLE','RECEIVABLE'].includes(action.direction)) throw new Error('direction must be PAYABLE or RECEIVABLE');
    if(!knownSource(state,action.cause_ref)) throw new Error(`unknown obligation cause: ${action.cause_ref}`);
    if(action.counterparty_ref) findBy(state.actors,'actor_id',action.counterparty_ref,'counterparty actor');
    const obligation={
      obligation_id:obligationId,
      direction:action.direction,
      kind:action.kind||'MANUAL_MOCK_OBLIGATION',
      amount_clp:amount,
      settled_amount_clp:0,
      outstanding_amount_clp:amount,
      state:'OPEN',
      cause_ref:action.cause_ref,
      counterparty_ref:action.counterparty_ref||null,
      mock:true
    };
    state.financial_obligations.push(obligation);
    appendAudit(state,{kind:'SOURCE_FINANCIAL_OBLIGATION_CREATED',object_ref:obligation.obligation_id,cause_ref:obligation.cause_ref,amount_clp:amount},at);
    effects.push({kind:'SOURCE_FINANCIAL_OBLIGATION_CREATED',obligation_id:obligation.obligation_id,amount_clp:amount});
  } else if(action.type==='EVENT_TRANSITION'){
    const event=findBy(state.events,'event_id',action.event_id,'event');
    const expected=action.expected_state||event.state;
    if(event.state!==expected) throw new Error(`event state conflict: ${event.state} != ${expected}`);
    const allowed=EVENT_TRANSITIONS[event.state]||new Set();
    if(!allowed.has(action.next_state)) throw new Error(`invalid event transition ${event.state} -> ${action.next_state}`);
    const from=event.state;
    if(action.next_state==='COMPLETED'&&event.kind==='MATCH'){
      const gl=Number(action.goles_local),gv=Number(action.goles_visita);
      if(!validScore(gl)||!validScore(gv)) throw new Error('completed MATCH requires non-negative integer score');
      event.sports=event.sports||{};
      event.sports.goles_local=gl;
      event.sports.goles_visita=gv;
    }
    event.state=action.next_state;
    appendAudit(state,{kind:'EVENT_TRANSITION',object_ref:event.event_id,from,to:event.state,reason:action.reason||null,score:event.kind==='MATCH'&&event.state==='COMPLETED'?{goles_local:event.sports.goles_local,goles_visita:event.sports.goles_visita}:null},at);
    effects.push({kind:'EVENT_TRANSITION',event_id:event.event_id,from,to:event.state});
    if(event.state==='COMPLETED'){
      const post=derivePostEventWork(state,event,at);
      for(const work of post) effects.push({kind:'POST_EVENT_WORK_CREATED',work_id:work.work_id,source_ref:event.event_id});
    }
    if(event.state==='CANCELLED'){
      effects.push(...cancelDerivedPreparationForEvent(state,event,at));
    }
  } else if(action.type==='WORK_TRANSITION'){
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
    if(obligation.kind==='MEMBERSHIP_DUE'&&obligation.cause_ref){
      const memberEffect=reconcileMemberFinancialState(state,obligation.cause_ref,at);
      if(memberEffect) effects.push(memberEffect);
    }
    if(obligation.kind==='SANCTION_FINE'&&obligation.counterparty_ref&&obligation.tournament_ref){
      const eligibilityEffect=reconcileSanctionEligibility(state,obligation.counterparty_ref,obligation.tournament_ref,at);
      if(eligibilityEffect) effects.push(eligibilityEffect);
    }
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
    club:{
      schema_version:'CUDO_CLUB_SOURCE_STATE_MOCK_V1',
      generated_at:runtime.updated_at,
      authority:'GOLDEN_MOCK_RUNTIME',
      mock:true,
      summary:{actors:state.actors.length,events:state.events.length,members:state.actors.filter(x=>x.membership).length,sanctioned_actors:state.actors.filter(x=>x.sports_eligibility).length},
      actors:clone(state.actors),
      members:clone(state.actors.filter(x=>x.membership)),
      sanctioned_actors:clone(state.actors.filter(x=>x.sports_eligibility)),
      events:clone(state.events),
      production_write:false
    },
    operation,
    finance,
    resources:{schema_version:'CUDO_RESOURCE_STATE_MOCK_V1',generated_at:runtime.updated_at,authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{total:state.resources.length,blocking:state.resources.filter(x=>x.attention==='BLOCKING').length,action_required:state.resources.filter(x=>x.attention==='ACTION_REQUIRED').length},items:clone(state.resources),production_write:false},
    governance:{schema_version:'CUDO_GOVERNANCE_STATE_MOCK_V1',generated_at:runtime.updated_at,authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{total:state.decisions.length,pending_human:state.decisions.filter(x=>x.state==='PENDING_HUMAN').length,approved_or_applied:state.decisions.filter(x=>['APPROVED','APPLIED'].includes(x.state)).length,sanctions:state.decisions.filter(x=>x.kind==='TOURNAMENT_SANCTION').length},decisions:clone(state.decisions),production_write:false},
    evidence:{schema_version:'CUDO_EVIDENCE_AUDIT_STATE_MOCK_V1',generated_at:runtime.updated_at,authority:'GOLDEN_MOCK_RUNTIME',mock:true,summary:{evidence_total:state.evidence.length,evidence_missing:state.evidence.filter(x=>x.state==='MISSING').length,audit_events:(state.audit||[]).length},evidence:clone(state.evidence),audit:clone(state.audit||[]),production_write:false}
  };
}
