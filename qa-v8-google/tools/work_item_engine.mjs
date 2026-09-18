import crypto from 'node:crypto';

const WEEKDAY_INDEX={MONDAY:0,TUESDAY:1,WEDNESDAY:2,THURSDAY:3,FRIDAY:4,SATURDAY:5,SUNDAY:6};
const STATES=new Set(['OPEN','IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED']);
const ALLOWED={
  OPEN:new Set(['IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','CANCELLED']),
  IN_PROGRESS:new Set(['BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED']),
  BLOCKED:new Set(['OPEN','IN_PROGRESS','WAITING_EXTERNAL','CANCELLED']),
  WAITING_EXTERNAL:new Set(['OPEN','IN_PROGRESS','BLOCKED','CANCELLED']),
  DONE:new Set(),
  CANCELLED:new Set()
};

function clone(v){return JSON.parse(JSON.stringify(v));}
function objectMap(objects){return new Map(objects.map(x=>[x.object_id,x]));}
function addDays(date,days){
  const d=new Date(date+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function mondayOf(date){
  const d=new Date(date+'T12:00:00Z');
  const day=d.getUTCDay();
  const diff=day===0?-6:1-day;
  d.setUTCDate(d.getUTCDate()+diff);
  return d.toISOString().slice(0,10);
}
function weekday(date){
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][day];
}
function dateForWeekday(weekMonday,target){
  if(WEEKDAY_INDEX[target]===undefined) throw new Error(`unsupported weekday ${target}`);
  return addDays(weekMonday,WEEKDAY_INDEX[target]);
}
function relationTarget(object,type,map,expectedType){
  const rels=(object.relationships||[]).filter(r=>r.relationship_type===type);
  if(rels.length!==1) throw new Error(`${object.object_id}: ${type} resolved ${rels.length} targets`);
  const target=map.get(rels[0].target_object_id);
  if(!target) throw new Error(`${object.object_id}: unresolved target ${rels[0].target_object_id}`);
  if(expectedType&&target.object_type!==expectedType) throw new Error(`${object.object_id}: ${type} target type ${target.object_type}`);
  return target;
}
function usesResource(event,resourceId){
  return (event.relationships||[]).some(r=>r.relationship_type==='USES_RESOURCE'&&r.target_object_id===resourceId);
}
function stableTransitionId(payload){
  return 'CUDO-WORK-TRANS-'+crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,20).toUpperCase();
}

export function materializeResponsibilityWorkState({objects,now='2026-09-18T15:00:00.000Z'}){
  const state=clone(objects);
  const map=objectMap(state);
  const rules=state.filter(x=>x.object_type==='RULE_DECISION'&&x.data?.work_rule_kind==='WEEKLY_RESOURCE_MAINTENANCE_WITH_EVENT_CONFLICT');
  const created=[];
  const audited=[];

  for(const rule of rules){
    const actor=relationTarget(rule,'ASSIGNED_TO',map,'ACTOR');
    const resource=relationTarget(rule,'APPLIES_TO_RESOURCE',map,'RESOURCE_FACILITY');
    const events=state.filter(x=>
      x.object_type==='ACTIVITY_EVENT' &&
      x.data?.activity_kind===rule.data.conflict_activity_kind &&
      usesResource(x,resource.object_id)
    );
    for(const event of events){
      const eventDate=String(event.data?.scheduled_date||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error(`${event.object_id}: invalid scheduled_date`);
      const weekStart=mondayOf(eventDate);
      const normalDue=dateForWeekday(weekStart,rule.data.normal_weekday);
      const conflict=weekday(eventDate)===rule.data.conflict_weekday && eventDate===normalDue;
      const dueDate=conflict?addDays(normalDue,Number(rule.data.conflict_shift_days)):normalDue;
      const workId=`CUDO-WORK-${rule.data.work_kind}-${weekStart.replaceAll('-','')}`;
      const existing=map.get(workId);
      if(existing){
        audited.push({kind:'NOOP_EXISTING_WORK',work_id:workId,event_id:event.object_id});
        continue;
      }

      const work={
        schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
        object_id:workId,
        object_type:'WORK_ITEM',
        object_version:1,
        lifecycle_state:'OPEN',
        data:{
          work_kind:rule.data.work_kind,
          title:rule.data.title,
          responsible_actor_id:actor.object_id,
          responsible_display_name:actor.data.display_name,
          resource_id:resource.object_id,
          resource_display_name:resource.data.display_name,
          source_object_id:event.object_id,
          source_display_name:event.data.display_name,
          due_date:dueDate,
          priority:rule.data.priority,
          trigger_reason:conflict
            ? 'MATCH_ON_NORMAL_MAINTENANCE_DAY_SHIFT_TO_PREVIOUS_DAY'
            : 'NORMAL_WEEKLY_MAINTENANCE_DAY',
          financial_context_amount_clp:rule.data.financial_context_amount_clp,
          financial_context_cycle:rule.data.financial_context_cycle,
          financial_context_semantics:rule.data.financial_context_semantics
        },
        field_semantics:Object.fromEntries([
          'work_kind','title','responsible_actor_id','responsible_display_name','resource_id',
          'resource_display_name','source_object_id','source_display_name','due_date','priority',
          'trigger_reason','financial_context_amount_clp','financial_context_cycle','financial_context_semantics'
        ].map(field=>[field,{state_kind:'DERIVED',rule_ids:['WORK_RULE_GRASS_CUT_SATURDAY_MATCH_V1']} ])),
        relationships:[
          {relationship_id:`REL-${workId}-ACTOR`,relationship_type:'ASSIGNED_TO',target_object_id:actor.object_id},
          {relationship_id:`REL-${workId}-RESOURCE`,relationship_type:'APPLIES_TO_RESOURCE',target_object_id:resource.object_id},
          {relationship_id:`REL-${workId}-EVENT`,relationship_type:'CAUSED_BY_EVENT',target_object_id:event.object_id},
          {relationship_id:`REL-${workId}-RULE`,relationship_type:'DERIVED_FROM_RULE',target_object_id:rule.object_id}
        ],
        provenance:{
          created_at:now,
          updated_at:null,
          source_system:'CUDO_WORK_ITEM_ENGINE',
          source_refs:[...new Set([...(rule.provenance?.source_refs||[]),...(event.provenance?.source_refs||[])])],
          transition_id:null
        },
        legacy_refs:[]
      };
      state.push(work);
      map.set(workId,work);
      created.push(work);
      audited.push({
        kind:'WORK_ITEM_CREATED',
        work_id:workId,
        responsible_actor_id:actor.object_id,
        source_object_id:event.object_id,
        due_date:dueDate,
        reason:work.data.trigger_reason
      });
    }
  }
  return {ok:true,objects:state,created,audit:audited,production_write:false};
}

export function transitionWorkItem({
  objects,
  workItemId,
  expectedState,
  nextState,
  performedByActorId,
  reason,
  evidenceRefs=[],
  now='2026-09-18T15:10:00.000Z'
}){
  if(!STATES.has(nextState)) throw new Error(`unsupported work state ${nextState}`);
  if(!performedByActorId||!reason) throw new Error('work transition requires performedByActorId and reason');
  const state=clone(objects);
  const map=objectMap(state);
  const work=map.get(workItemId);
  if(!work||work.object_type!=='WORK_ITEM') return {ok:false,status:'WORK_ITEM_NOT_FOUND',objects:state,audit:null};
  if(work.lifecycle_state!==expectedState){
    return {ok:false,status:'EXPECTED_STATE_CONFLICT',expected:expectedState,actual:work.lifecycle_state,objects:state,audit:null};
  }
  if(!ALLOWED[expectedState]?.has(nextState)){
    return {ok:false,status:'TRANSITION_NOT_ALLOWED',from:expectedState,to:nextState,objects:state,audit:null};
  }
  if(nextState==='DONE'&&(!Array.isArray(evidenceRefs)||evidenceRefs.length===0)){
    return {ok:false,status:'DONE_REQUIRES_EVIDENCE',objects:state,audit:null};
  }
  const transitionId=stableTransitionId({workItemId,expectedState,nextState,performedByActorId,reason,evidenceRefs,now});
  work.lifecycle_state=nextState;
  work.object_version+=1;
  work.provenance.updated_at=now;
  work.provenance.transition_id=transitionId;
  work.provenance.source_refs=[...new Set([...(work.provenance.source_refs||[]),...evidenceRefs])];
  const audit={
    transition_id:transitionId,
    work_id:workItemId,
    from:expectedState,
    to:nextState,
    performed_by_actor_id:performedByActorId,
    reason,
    evidence_refs:[...evidenceRefs],
    timestamp:now
  };
  return {ok:true,status:'APPLIED',objects:state,audit,production_write:false};
}

export function buildClubOperationalStateProjection({
  objects,
  generatedAt='2026-09-18T15:20:00.000Z',
  referenceDate='2026-09-18'
}){
  const workItems=objects.filter(x=>x.object_type==='WORK_ITEM').sort((a,b)=>a.object_id.localeCompare(b.object_id));
  const summary={total:workItems.length,open:0,in_progress:0,blocked:0,waiting_external:0,done:0,cancelled:0,overdue:0};
  const items=workItems.map(work=>{
    const key=work.lifecycle_state.toLowerCase();
    if(Object.hasOwn(summary,key)) summary[key]+=1;
    const overdue=!['DONE','CANCELLED'].includes(work.lifecycle_state)&&String(work.data.due_date)<referenceDate;
    if(overdue) summary.overdue+=1;
    const attention=work.lifecycle_state==='BLOCKED'?'BLOCKED':overdue?'OVERDUE':work.lifecycle_state==='OPEN'?'PENDING':work.lifecycle_state;
    return {
      work_id:work.object_id,
      title:work.data.title,
      work_kind:work.data.work_kind,
      state:work.lifecycle_state,
      attention,
      responsible:{actor_id:work.data.responsible_actor_id,display_name:work.data.responsible_display_name},
      due_date:work.data.due_date,
      priority:work.data.priority,
      resource:{resource_id:work.data.resource_id,display_name:work.data.resource_display_name},
      source:{object_id:work.data.source_object_id,display_name:work.data.source_display_name},
      trigger_reason:work.data.trigger_reason,
      financial_context:{
        amount_clp:work.data.financial_context_amount_clp,
        cycle:work.data.financial_context_cycle,
        semantics:work.data.financial_context_semantics
      },
      evidence_refs:[...(work.provenance?.source_refs||[])],
      object_version:work.object_version
    };
  });
  return {
    schema_version:'CUDO_CLUB_OPERATIONAL_STATE_V1',
    generated_at:generatedAt,
    reference_date:referenceDate,
    authority:'CANONICAL_GRAPH_READ_MODEL',
    summary,
    items,
    production_write:false
  };
}
