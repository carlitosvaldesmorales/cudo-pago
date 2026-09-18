import crypto from 'node:crypto';

function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function same(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function transitionId(payload){
  return 'CUDO-TRANS-'+digest(payload).slice(0,20).toUpperCase();
}
function selectorKey(selector){
  return [selector.scope,selector.object_type,selector.relationship_type||'',selector.field].join(':');
}
function anchorTypeForRule(rule){
  const sourceTypes=new Set(
    [...rule.inputs,...rule.outputs]
      .filter(binding=>binding.selector.scope==='SOURCE_OBJECT')
      .map(binding=>binding.selector.object_type)
  );
  if(sourceTypes.size!==1) throw new Error(`${rule.rule_id}: executor v1 requires exactly one SOURCE_OBJECT anchor type`);
  return [...sourceTypes][0];
}
function relationTargets(anchor,selector,objectMap){
  const matches=[];
  for(const relation of anchor.relationships||[]){
    if(relation.relationship_type!==selector.relationship_type) continue;
    const target=objectMap.get(relation.target_object_id);
    if(!target) throw new Error(`${anchor.object_id}: relationship target ${relation.target_object_id} not found`);
    if(target.object_type!==selector.object_type) continue;
    matches.push(target);
  }
  return matches;
}
function reverseRelationSources(anchor,selector,objects){
  const matches=[];
  for(const object of objects){
    if(object.object_type!==selector.object_type) continue;
    const linked=(object.relationships||[]).some(relation=>
      relation.relationship_type===selector.relationship_type &&
      relation.target_object_id===anchor.object_id
    );
    if(linked) matches.push(object);
  }
  return matches.sort((a,b)=>a.object_id.localeCompare(b.object_id));
}
function resolveBinding(binding,anchor,objectMap,objects){
  const selector=binding.selector;
  let object;
  if(selector.scope==='SOURCE_OBJECT'){
    if(anchor.object_type!==selector.object_type){
      throw new Error(`${binding.name}: anchor ${anchor.object_id} type ${anchor.object_type} != ${selector.object_type}`);
    }
    object=anchor;
  }else if(selector.scope==='RELATED_OBJECT'){
    const matches=relationTargets(anchor,selector,objectMap);
    if(matches.length!==1){
      throw new Error(`${binding.name}: ${anchor.object_id} relation ${selector.relationship_type} resolved ${matches.length} objects`);
    }
    object=matches[0];
  }else if(selector.scope==='REVERSE_RELATED_OBJECTS'){
    const matches=reverseRelationSources(anchor,selector,objects);
    if(matches.length===0){
      throw new Error(`${binding.name}: ${anchor.object_id} reverse relation ${selector.relationship_type} resolved 0 objects`);
    }
    for(const match of matches){
      if(!Object.hasOwn(match.data||{},selector.field)){
        throw new Error(`${binding.name}: ${match.object_id} missing data field ${selector.field}`);
      }
    }
    return {objects:matches,field:selector.field,value:matches.map(match=>match.data[selector.field])};
  }else{
    throw new Error(`${binding.name}: unsupported selector scope ${selector.scope}`);
  }
  if(!Object.hasOwn(object.data||{},selector.field)){
    throw new Error(`${binding.name}: ${object.object_id} missing data field ${selector.field}`);
  }
  return {object,field:selector.field,value:object.data[selector.field]};
}
function candidateAnchors(rule,changedObject,changedField,objects,objectMap){
  const anchorType=anchorTypeForRule(rule);
  const found=new Map();
  for(const input of rule.inputs){
    const selector=input.selector;
    if(selector.field!==changedField||selector.object_type!==changedObject.object_type) continue;
    if(selector.scope==='SOURCE_OBJECT'){
      if(changedObject.object_type===anchorType) found.set(changedObject.object_id,changedObject);
      continue;
    }
    if(selector.scope==='RELATED_OBJECT'){
      for(const possibleAnchor of objects){
        if(possibleAnchor.object_type!==anchorType) continue;
        const targets=relationTargets(possibleAnchor,selector,objectMap);
        if(targets.some(target=>target.object_id===changedObject.object_id)){
          found.set(possibleAnchor.object_id,possibleAnchor);
        }
      }
    }
    if(selector.scope==='REVERSE_RELATED_OBJECTS'){
      for(const relation of changedObject.relationships||[]){
        if(relation.relationship_type!==selector.relationship_type) continue;
        const target=objectMap.get(relation.target_object_id);
        if(target&&target.object_type===anchorType) found.set(target.object_id,target);
      }
    }
  }
  return [...found.values()].sort((a,b)=>a.object_id.localeCompare(b.object_id));
}
function evaluateExpression(rule,inputValues){
  const args=rule.expression.args.map(name=>{
    if(!Object.hasOwn(inputValues,name)) throw new Error(`${rule.rule_id}: expression input ${name} unresolved`);
    return inputValues[name];
  });
  switch(rule.expression.operator){
    case 'IDENTITY':
      if(args.length!==1) throw new Error(`${rule.rule_id}: IDENTITY requires 1 arg`);
      return clone(args[0]);
    case 'SUM':
      if(args.length!==1||!Array.isArray(args[0])) throw new Error(`${rule.rule_id}: SUM requires one array arg`);
      return args[0].reduce((sum,v)=>sum+Number(v),0);
    case 'MULTIPLY':
      if(args.length!==2) throw new Error(`${rule.rule_id}: MULTIPLY requires 2 args`);
      return Number(args[0])*Number(args[1]);
    case 'SUBTRACT':
      if(args.length!==2) throw new Error(`${rule.rule_id}: SUBTRACT requires 2 args`);
      return Number(args[0])-Number(args[1]);
    case 'SUM_DIFFERENCE':
      if(args.length!==2||!Array.isArray(args[0])||!Array.isArray(args[1])){
        throw new Error(`${rule.rule_id}: SUM_DIFFERENCE requires two arrays`);
      }
      return args[0].reduce((sum,v)=>sum+Number(v),0)-args[1].reduce((sum,v)=>sum+Number(v),0);
    default:
      throw new Error(`${rule.rule_id}: unsupported operator ${rule.expression.operator}`);
  }
}
function conditionEnabled(rule,activeConditions){
  if(rule.applicability.mode==='ALWAYS') return true;
  if(rule.applicability.mode==='CONDITIONAL') return activeConditions.has(rule.applicability.condition_id);
  throw new Error(`${rule.rule_id}: unsupported applicability mode ${rule.applicability.mode}`);
}
function validateDerivedTarget(object,field,ruleId){
  const semantic=object.field_semantics?.[field];
  if(!semantic) throw new Error(`${object.object_id}.${field}: missing field_semantics`);
  if(semantic.state_kind!=='DERIVED') throw new Error(`${object.object_id}.${field}: rule output must target DERIVED state`);
  if(!Array.isArray(semantic.rule_ids)||!semantic.rule_ids.includes(ruleId)){
    throw new Error(`${object.object_id}.${field}: DERIVED semantics do not authorize ${ruleId}`);
  }
}
function touch(object,{now,transition_id}){
  object.object_version=Number(object.object_version||0)+1;
  object.provenance={...(object.provenance||{}),updated_at:now,transition_id};
}
function makeTransition({kind,object,field,oldValue,newValue,ruleId=null,causeTransitionId=null,sourceRef=null,now}){
  const payload={
    kind,
    object_id:object.object_id,
    field,
    old_value:oldValue,
    new_value:newValue,
    rule_id:ruleId,
    cause_transition_id:causeTransitionId,
    source_ref:sourceRef
  };
  return {...payload,transition_id:transitionId(payload),at:now};
}

export function planPropagation({
  objects,
  registry,
  changes,
  activeConditions=[],
  allowExperimental=false,
  now='2026-09-18T12:00:00.000Z',
  maxEvaluations=250
}){
  const state=clone(objects);
  const objectMap=new Map(state.map(object=>[object.object_id,object]));
  if(objectMap.size!==state.length) throw new Error('duplicate object_id in propagation state');
  const conditions=new Set(activeConditions);
  const enabledRules=(registry.rules||[])
    .filter(rule=>rule.status==='ACTIVE'||(allowExperimental&&rule.status==='EXPERIMENTAL'))
    .sort((a,b)=>a.rule_id.localeCompare(b.rule_id));
  for(const group of registry.exclusive_condition_groups||[]){
    const active=(group.condition_ids||[]).filter(conditionId=>conditions.has(conditionId));
    if(active.length>1){
      throw new Error(`exclusive condition conflict ${group.group_id}: ${active.join(',')}`);
    }
  }

  const transitions=[];
  const failures=[];
  const invalidations=[];
  const queue=[];
  const evaluated=new Set();
  let evaluationCount=0;
  let cycleGuardHit=false;

  for(const change of changes){
    const object=objectMap.get(change.object_id);
    if(!object) throw new Error(`source change object not found: ${change.object_id}`);
    if(!Object.hasOwn(object.data||{},change.field)) throw new Error(`${change.object_id}: source field ${change.field} missing`);
    const semantic=object.field_semantics?.[change.field];
    if(!semantic||semantic.state_kind!=='SOURCE'){
      throw new Error(`${change.object_id}.${change.field}: external change must target SOURCE state`);
    }
    if(same(object.data[change.field],change.value)) continue;
    const oldValue=clone(object.data[change.field]);
    object.data[change.field]=clone(change.value);
    const transition=makeTransition({
      kind:'SOURCE_CHANGE',
      object,
      field:change.field,
      oldValue,
      newValue:clone(change.value),
      sourceRef:change.source_ref||'synthetic://propagation-change',
      now
    });
    touch(object,{now,transition_id:transition.transition_id});
    transitions.push(transition);
    queue.push({object_id:object.object_id,field:change.field,cause_transition_id:transition.transition_id});
  }

  while(queue.length){
    const changed=queue.shift();
    const changedObject=objectMap.get(changed.object_id);
    for(const rule of enabledRules){
      let anchors;
      try{
        anchors=candidateAnchors(rule,changedObject,changed.field,state,objectMap);
      }catch(error){
        failures.push({rule_id:rule.rule_id,changed_object_id:changed.object_id,changed_field:changed.field,error:error.message});
        continue;
      }
      for(const anchor of anchors){
        if(!conditionEnabled(rule,conditions)) continue;
        if(++evaluationCount>maxEvaluations){
          cycleGuardHit=true;
          queue.length=0;
          break;
        }
        try{
          const inputValues={};
          const inputRefs={};
          for(const binding of rule.inputs){
            const resolved=resolveBinding(binding,anchor,objectMap,state);
            inputValues[binding.name]=clone(resolved.value);
            inputRefs[binding.name]=resolved.objects
              ? resolved.objects.map(object=>({object_id:object.object_id,field:resolved.field}))
              : {object_id:resolved.object.object_id,field:resolved.field};
          }
          const signature=digest({rule_id:rule.rule_id,anchor:anchor.object_id,inputValues});
          const evaluationKey=`${rule.rule_id}|${anchor.object_id}|${signature}`;
          if(evaluated.has(evaluationKey)) continue;
          evaluated.add(evaluationKey);

          if(rule.outputs.length!==1) throw new Error(`${rule.rule_id}: executor v1 supports exactly one output`);
          const output=resolveBinding(rule.outputs[0],anchor,objectMap,state);
          validateDerivedTarget(output.object,output.field,rule.rule_id);
          const invalidation={
            rule_id:rule.rule_id,
            anchor_object_id:anchor.object_id,
            target_object_id:output.object.object_id,
            target_field:output.field,
            cause_transition_id:changed.cause_transition_id,
            input_refs:inputRefs,
            status:'DIRTY'
          };
          invalidations.push(invalidation);

          const nextValue=evaluateExpression(rule,inputValues);
          const oldValue=clone(output.object.data[output.field]);
          if(!same(oldValue,nextValue)){
            output.object.data[output.field]=clone(nextValue);
            const transition=makeTransition({
              kind:'DERIVED_RECALCULATION',
              object:output.object,
              field:output.field,
              oldValue,
              newValue:clone(nextValue),
              ruleId:rule.rule_id,
              causeTransitionId:changed.cause_transition_id,
              now
            });
            touch(output.object,{now,transition_id:transition.transition_id});
            transitions.push(transition);
            queue.push({object_id:output.object.object_id,field:output.field,cause_transition_id:transition.transition_id});
          }
          invalidation.status='RECALCULATED';
          invalidation.result=clone(nextValue);
        }catch(error){
          failures.push({
            rule_id:rule.rule_id,
            anchor_object_id:anchor.object_id,
            changed_object_id:changed.object_id,
            changed_field:changed.field,
            error:error.message
          });
        }
      }
      if(cycleGuardHit) break;
    }
  }

  const dirtyRemaining=invalidations.filter(item=>item.status!=='RECALCULATED');
  return {
    ok:failures.length===0&&!cycleGuardHit,
    executor_version:'CUDO_GENERIC_PROPAGATION_EXECUTOR_V1',
    objects:state,
    transitions,
    invalidations,
    dirty_remaining:dirtyRemaining,
    failures,
    metrics:{
      source_changes:transitions.filter(x=>x.kind==='SOURCE_CHANGE').length,
      derived_recalculations:transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').length,
      rule_evaluations:evaluationCount,
      conditions_active:[...conditions].sort(),
      cycle_guard_hit:cycleGuardHit,
      max_evaluations:maxEvaluations
    },
    production_write:false
  };
}

export function stateFingerprint(objects){
  return digest(objects);
}
