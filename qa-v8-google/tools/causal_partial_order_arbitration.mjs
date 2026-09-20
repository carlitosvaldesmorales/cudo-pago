import crypto from 'node:crypto';

function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function makeId(prefix,payload){return `${prefix}-${digest(payload).slice(0,20).toUpperCase()}`;}

export function createArbitrationConstraint({
  predecessorId,
  successorId,
  constraintCode,
  explanation,
  sourceRefs,
  createdAt='2026-09-20T01:35:00.000Z'
}){
  if(!predecessorId||!successorId) throw new Error('constraint requires predecessorId and successorId');
  if(predecessorId===successorId) throw new Error('self precedence is invalid');
  if(!constraintCode||typeof constraintCode!=='string') throw new Error('constraint requires constraintCode');
  if(!explanation||typeof explanation!=='string') throw new Error('constraint requires explanation');
  if(!Array.isArray(sourceRefs)||sourceRefs.length===0) throw new Error('constraint requires sourceRefs');

  const objectId=makeId('CUDO-ARB-CONSTRAINT',{predecessorId,successorId,constraintCode,sourceRefs});
  return {
    schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
    object_id:objectId,
    object_type:'ARBITRATION_CONSTRAINT',
    object_version:1,
    lifecycle_state:'ACTIVE',
    data:{
      constraint_code:constraintCode,
      explanation,
      relation:'MUST_PRECEDE'
    },
    field_semantics:{
      constraint_code:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      explanation:{state_kind:'SOURCE',source_refs:[...sourceRefs]},
      relation:{state_kind:'SOURCE',source_refs:[...sourceRefs]}
    },
    relationships:[
      {relationship_id:makeId('REL-ARB-PRED',{objectId,predecessorId}),relationship_type:'PREDECESSOR',target_object_id:predecessorId},
      {relationship_id:makeId('REL-ARB-SUCC',{objectId,successorId}),relationship_type:'SUCCESSOR',target_object_id:successorId}
    ],
    provenance:{
      created_at:createdAt,
      updated_at:null,
      source_system:'CUDO_CAUSAL_PRECEDENCE',
      source_refs:[...sourceRefs]
    },
    legacy_refs:[]
  };
}

function endpoints(constraint){
  const pred=constraint.relationships?.find(x=>x.relationship_type==='PREDECESSOR')?.target_object_id;
  const succ=constraint.relationships?.find(x=>x.relationship_type==='SUCCESSOR')?.target_object_id;
  if(!pred||!succ) throw new Error(`${constraint.object_id||'constraint'} missing PREDECESSOR/SUCCESSOR`);
  return [pred,succ];
}

export function resolvePartialOrder({candidateIds,constraints,completedIds=[]}){
  if(!Array.isArray(candidateIds)||candidateIds.length===0) throw new Error('candidateIds required');
  const candidates=[...new Set(candidateIds)];
  if(candidates.length!==candidateIds.length) throw new Error('duplicate candidateIds');
  const candidateSet=new Set(candidates);
  const completed=new Set(completedIds||[]);
  const incoming=new Map(candidates.map(id=>[id,new Set()]));
  const outgoing=new Map(candidates.map(id=>[id,new Set()]));
  const edges=[];

  for(const constraint of constraints||[]){
    if(constraint.object_type!=='ARBITRATION_CONSTRAINT') throw new Error('resolver accepts ARBITRATION_CONSTRAINT only');
    if(constraint.lifecycle_state!=='ACTIVE') continue;
    const [pred,succ]=endpoints(constraint);
    if(!candidateSet.has(pred)||!candidateSet.has(succ)) throw new Error('constraint endpoint outside candidate set');
    incoming.get(succ).add(pred);
    outgoing.get(pred).add(succ);
    edges.push({constraint_id:constraint.object_id,predecessor_id:pred,successor_id:succ,constraint_code:constraint.data.constraint_code});
  }

  const indegree=new Map(candidates.map(id=>[id,incoming.get(id).size]));
  const queue=candidates.filter(id=>indegree.get(id)===0).sort();
  const topo=[];
  while(queue.length){
    const id=queue.shift();
    topo.push(id);
    for(const next of [...outgoing.get(id)].sort()){
      indegree.set(next,indegree.get(next)-1);
      if(indegree.get(next)===0){ queue.push(next); queue.sort(); }
    }
  }
  if(topo.length!==candidates.length){
    const cycleNodes=candidates.filter(id=>!topo.includes(id)).sort();
    return {
      ok:false,
      status:'BLOCKED_CYCLE',
      cycle_nodes:cycleNodes,
      executable_now:[],
      blocked:[],
      layers:[],
      edges,
      total_order_claimed:false,
      production_write:false
    };
  }

  const pending=candidates.filter(id=>!completed.has(id));
  const executable=[];
  const blocked=[];
  for(const id of pending){
    const blockers=[...incoming.get(id)].filter(pred=>!completed.has(pred)).sort();
    if(blockers.length===0) executable.push(id);
    else blocked.push({candidate_id:id,blocked_by:blockers});
  }
  executable.sort();
  blocked.sort((a,b)=>a.candidate_id.localeCompare(b.candidate_id));

  const remaining=new Set(pending);
  const tempCompleted=new Set(completed);
  const layers=[];
  while(remaining.size){
    const layer=[...remaining].filter(id=>[...incoming.get(id)].every(pred=>tempCompleted.has(pred))).sort();
    if(!layer.length) break;
    layers.push(layer);
    for(const id of layer){remaining.delete(id);tempCompleted.add(id);}
  }

  const reach=new Map(candidates.map(id=>[id,new Set()]));
  for(const id of [...candidates].reverse()){
    for(const next of outgoing.get(id)){
      reach.get(id).add(next);
      for(const r of reach.get(next)) reach.get(id).add(r);
    }
  }
  const incomparablePairs=[];
  for(let i=0;i<candidates.length;i++){
    for(let j=i+1;j<candidates.length;j++){
      const a=candidates[i],b=candidates[j];
      if(!reach.get(a).has(b)&&!reach.get(b).has(a)) incomparablePairs.push([a,b]);
    }
  }

  return {
    ok:true,
    status:'RESOLVED_PARTIAL_ORDER',
    executable_now:executable,
    blocked,
    layers,
    edges,
    incomparable_pairs:incomparablePairs,
    total_order_claimed:false,
    production_write:false
  };
}
