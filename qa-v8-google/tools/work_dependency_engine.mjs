function clone(v){return JSON.parse(JSON.stringify(v));}

function stableWorkId(step,eventId){
  const eventPart=String(eventId).replace(/^CUDO-EVENT-/,'').replaceAll('_','-');
  return `CUDO-WORK-${String(step.work_kind).replaceAll('_','-')}-${eventPart}`;
}

export function materializeDependentWorkSequences({
  objects,
  now='2026-09-18T18:10:00.000Z'
}){
  const state=clone(objects);
  const map=new Map(state.map(x=>[x.object_id,x]));
  const created=[];
  const audit=[];
  const rules=state.filter(x=>
    x.object_type==='RULE_DECISION' &&
    x.data?.work_rule_kind==='POST_EVENT_DEPENDENT_WORK_SEQUENCE'
  );

  for(const rule of rules){
    const actor=map.get(rule.data.process_owner_actor_id);
    if(!actor||actor.object_type!=='ACTOR') throw new Error(`${rule.object_id}: process owner unresolved`);
    const events=state.filter(x=>
      x.object_type==='ACTIVITY_EVENT' &&
      x.data?.activity_kind===rule.data.trigger_activity_kind &&
      x.lifecycle_state===rule.data.trigger_lifecycle_state
    );

    for(const event of events){
      const stepWorkIds=new Map();
      for(const step of rule.data.steps||[]){
        stepWorkIds.set(step.step_id,stableWorkId(step,event.object_id));
      }

      for(const step of rule.data.steps||[]){
        const workId=stepWorkIds.get(step.step_id);
        if(map.has(workId)){
          audit.push({kind:'NOOP_EXISTING_WORK',work_id:workId,event_id:event.object_id});
          continue;
        }
        const dependencyRefs=step.depends_on_step_id?[stepWorkIds.get(step.depends_on_step_id)]:[];
        const initialState=step.initial_state|| (dependencyRefs.length?'BLOCKED':'OPEN');
        const work={
          schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
          object_id:workId,
          object_type:'WORK_ITEM',
          object_version:1,
          lifecycle_state:initialState,
          data:{
            work_kind:step.work_kind,
            title:step.title,
            responsible_actor_id:actor.object_id,
            responsible_display_name:actor.data.display_name,
            responsibility_basis:rule.data.responsibility_basis,
            resource_id:null,
            resource_display_name:'Proceso de bebestibles',
            source_object_id:event.object_id,
            source_display_name:event.data.display_name,
            due_date:null,
            schedule_condition:rule.data.schedule_condition,
            priority:'NORMAL',
            trigger_reason:'POST_EVENT_DEPENDENT_WORK_SEQUENCE',
            dependency_refs:dependencyRefs,
            blocker_kind:dependencyRefs.length?'DEPENDENCY':null,
            blocker_reason:step.blocker_reason||null,
            external_party_display_name:rule.data.external_party_display_name||null,
            financial_context_semantics:step.financial_context_semantics||null
          },
          field_semantics:Object.fromEntries([
            'work_kind','title','responsible_actor_id','responsible_display_name','responsibility_basis',
            'resource_id','resource_display_name','source_object_id','source_display_name','due_date',
            'schedule_condition','priority','trigger_reason','dependency_refs','blocker_kind',
            'blocker_reason','external_party_display_name','financial_context_semantics'
          ].map(field=>[field,{state_kind:'DERIVED',rule_ids:[rule.data.rule_id]}])),
          relationships:[
            {relationship_id:`REL-${workId}-ACTOR`,relationship_type:'ASSIGNED_TO',target_object_id:actor.object_id},
            {relationship_id:`REL-${workId}-EVENT`,relationship_type:'CAUSED_BY_EVENT',target_object_id:event.object_id},
            {relationship_id:`REL-${workId}-RULE`,relationship_type:'DERIVED_FROM_RULE',target_object_id:rule.object_id},
            ...dependencyRefs.map((dep,i)=>({
              relationship_id:`REL-${workId}-DEP-${i+1}`,
              relationship_type:'DEPENDS_ON_WORK_ITEM',
              target_object_id:dep
            }))
          ],
          provenance:{
            created_at:now,
            updated_at:null,
            source_system:'CUDO_WORK_DEPENDENCY_ENGINE',
            source_refs:[...new Set([...(rule.provenance?.source_refs||[]),...(event.provenance?.source_refs||[])])],
            transition_id:null
          },
          legacy_refs:[]
        };
        state.push(work);
        map.set(workId,work);
        created.push(work);
        audit.push({
          kind:'WORK_ITEM_CREATED',
          work_id:workId,
          state:initialState,
          dependency_refs:dependencyRefs,
          responsibility_basis:rule.data.responsibility_basis
        });
      }
    }
  }
  return {ok:true,objects:state,created,audit,production_write:false};
}

export function unresolvedWorkDependencies(work,objectMap){
  const refs=work.data?.dependency_refs||[];
  return refs.filter(id=>{
    const dep=objectMap.get(id);
    return !dep||dep.object_type!=='WORK_ITEM'||dep.lifecycle_state!=='DONE';
  });
}

export function reconcileWorkDependencies({
  objects,
  now='2026-09-18T18:20:00.000Z'
}){
  const state=clone(objects);
  const map=new Map(state.map(x=>[x.object_id,x]));
  const transitions=[];

  for(const work of state.filter(x=>x.object_type==='WORK_ITEM')){
    const refs=work.data?.dependency_refs||[];
    if(refs.length===0) continue;
    const unresolved=unresolvedWorkDependencies(work,map);
    if(work.lifecycle_state==='BLOCKED'&&work.data?.blocker_kind==='DEPENDENCY'&&unresolved.length===0){
      const from=work.lifecycle_state;
      work.lifecycle_state='OPEN';
      work.object_version+=1;
      work.provenance.updated_at=now;
      work.data.blocker_kind=null;
      work.data.blocker_reason=null;
      transitions.push({
        kind:'DEPENDENCY_RESOLVED_AUTO_UNBLOCK',
        work_id:work.object_id,
        from,
        to:'OPEN',
        dependency_refs:[...refs]
      });
    }
  }
  return {ok:true,objects:state,transitions,production_write:false};
}
