const ACTIVE_EXCLUDED=new Set(['DONE','CANCELLED']);

export function deriveGap(goal,value){
  const target=Number(goal.target_value||0),observed=Number(value||0);
  if(goal.comparator==='AT_LEAST')return Math.max(0,target-observed);
  if(goal.comparator==='AT_MOST')return Math.max(0,observed-target);
  if(goal.comparator==='EQUAL')return Math.abs(target-observed);
  throw new Error('Unsupported comparator');
}

export function resolvePartialOrder(arbitration){
  const candidates=(arbitration.candidates||[]).map(x=>x.action_id);
  const completed=new Set(arbitration.completed_action_ids||[]);
  const incoming=new Map(candidates.map(x=>[x,new Set()]));
  const outgoing=new Map(candidates.map(x=>[x,new Set()]));
  for(const c of arbitration.constraints||[]){
    if(!incoming.has(c.predecessor_id)||!incoming.has(c.successor_id))throw new Error('Constraint endpoint missing');
    incoming.get(c.successor_id).add(c.predecessor_id);
    outgoing.get(c.predecessor_id).add(c.successor_id);
  }
  const degree=new Map(candidates.map(x=>[x,incoming.get(x).size]));
  const q=candidates.filter(x=>degree.get(x)===0).sort(),topo=[];
  while(q.length){
    const id=q.shift();topo.push(id);
    for(const n of [...outgoing.get(id)].sort()){degree.set(n,degree.get(n)-1);if(degree.get(n)===0){q.push(n);q.sort()}}
  }
  if(topo.length!==candidates.length)return {ok:false,status:'BLOCKED_CYCLE',executable_now:[],blocked:[],layers:[]};
  const pending=candidates.filter(x=>!completed.has(x));
  const executable_now=pending.filter(id=>[...incoming.get(id)].every(p=>completed.has(p))).sort();
  const blocked=pending.filter(id=>!executable_now.includes(id)).map(id=>({action_id:id,blocked_by:[...incoming.get(id)].filter(p=>!completed.has(p)).sort()}));
  const layers=[],remaining=new Set(pending),done=new Set(completed);
  while(remaining.size){
    const layer=[...remaining].filter(id=>[...incoming.get(id)].every(p=>done.has(p))).sort();
    if(!layer.length)break;
    layers.push(layer);for(const id of layer){remaining.delete(id);done.add(id)}
  }
  return {ok:true,status:'RESOLVED_PARTIAL_ORDER',executable_now,blocked,layers};
}

export function projectHumanCapacity(club,control){
  const actors=new Map((club.actors||[]).map(a=>[a.actor_id,a]));
  const works=[...(club.work_items||[]),...(control.additional_work||[])];
  const active=works.filter(w=>!ACTIVE_EXCLUDED.has(w.state));
  const unassigned=active.filter(w=>!w.responsible_actor_id);
  const byActor=new Map();
  for(const w of active){
    if(!w.responsible_actor_id)continue;
    if(!byActor.has(w.responsible_actor_id))byActor.set(w.responsible_actor_id,[]);
    byActor.get(w.responsible_actor_id).push(w);
  }
  const people=[...byActor].map(([id,items])=>({
    actor_id:id,
    display_name:actors.get(id)?.display_name||id,
    role_context:actors.get(id)?.role||null,
    active_count:items.length,
    blocked_count:items.filter(w=>w.state==='BLOCKED').length,
    waiting_external_count:items.filter(w=>w.state==='WAITING_EXTERNAL').length,
    work:items
  })).sort((a,b)=>b.active_count-a.active_count||a.display_name.localeCompare(b.display_name));
  return {
    active_work_count:active.length,
    unassigned_work_count:unassigned.length,
    unassigned_work:unassigned,
    people,
    overload_claimed:false,
    overload_gap:'availability_effort_and_criticality_not_fully_known'
  };
}

export function projectAttention(club,control){
  const works=[...(club.work_items||[]),...(control.additional_work||[])];
  const signals=[];
  for(const w of works){
    if(ACTIVE_EXCLUDED.has(w.state))continue;
    if(!w.responsible_actor_id)signals.push({subject_ref:w.work_id,signal_code:'REQUIRED_WORK_UNASSIGNED',explanation:'Trabajo requerido sin persona responsable.',title:w.title});
    if(w.state==='BLOCKED')signals.push({subject_ref:w.work_id,signal_code:'WORK_BLOCKED_OR_DEPENDENCY_PENDING',explanation:w.blocker_reason||'Trabajo bloqueado por dependencia o recurso.',title:w.title});
    if(w.state==='WAITING_EXTERNAL')signals.push({subject_ref:w.work_id,signal_code:'WAITING_EXTERNAL',explanation:w.blocker_reason||'El avance depende de un tercero.',title:w.title});
    if(w.attention==='OVERDUE')signals.push({subject_ref:w.work_id,signal_code:'OVERDUE_WORK',explanation:'La fuente QA marca este trabajo como vencido.',title:w.title});
  }
  for(const r of club.resources||[]){
    if(['BLOCKING','ACTION_REQUIRED'].includes(r.attention))signals.push({subject_ref:r.resource_id,signal_code:'RESOURCE_NOT_READY',explanation:`${r.display_name}: ${r.state}`,title:r.display_name});
  }
  return signals;
}

export function buildAdaptiveControlProjection(club,control){
  if(club.mock!==true||club.production_write!==false)throw new Error('Club source is not safe mock');
  if(control.mock!==true||control.production_write!==false)throw new Error('Control source is not safe mock');
  const initialGap=deriveGap(control.goal,control.observations.initial.current_value);
  const currentGap=deriveGap(control.goal,control.observations.current.current_value);
  const arbitration=resolvePartialOrder(control.arbitration);
  const labels=new Map((control.arbitration.candidates||[]).map(x=>[x.action_id,x.label]));
  return {
    as_of:control.as_of,
    goal:{
      ...control.goal,
      initial_value:control.observations.initial.current_value,
      current_value:control.observations.current.current_value,
      initial_gap:initialGap,
      current_gap:currentGap,
      gap_delta:currentGap-initialGap
    },
    attention:projectAttention(club,control),
    human_capacity:projectHumanCapacity(club,control),
    arbitration:{
      ...arbitration,
      executable_now:arbitration.executable_now.map(id=>({action_id:id,label:labels.get(id)||id})),
      blocked:arbitration.blocked.map(x=>({action_id:x.action_id,label:labels.get(x.action_id)||x.action_id,blocked_by:x.blocked_by.map(id=>({action_id:id,label:labels.get(id)||id}))})),
      decision:control.arbitration.decision
    },
    invariants:{
      global_priority_score:false,
      overload_claimed:false,
      global_priority_policy_created:control.arbitration.decision.creates_global_priority_policy===true,
      production_write:false
    }
  };
}
