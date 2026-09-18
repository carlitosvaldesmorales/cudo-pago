function clone(value){return JSON.parse(JSON.stringify(value));}

const CAUSAL_PREFIXES=['CAUSED_BY_','APPLIES_TO_','OWED_BY_','OWED_TO_'];
const MOVEMENT_DIRECTIONS=new Set(['IN','OUT']);
const OBLIGATION_DIRECTIONS=new Set(['PAYABLE','RECEIVABLE']);
const MOVEMENT_STATES=new Set(['PENDING','CONFIRMED','VOIDED']);
const CHANNELS=new Set(['CASH','BANK_TRANSFER','ELECTRONIC','THIRD_PARTY','OTHER']);
const RECONCILIATION_STATES=new Set(['UNRECONCILED','RECONCILED']);

function assertPositiveInteger(value,label){
  if(!Number.isInteger(value)||value<=0) throw new Error(`${label} must be a positive integer CLP amount`);
}
function byId(objects){
  const map=new Map();
  for(const object of objects){
    if(map.has(object.object_id)) throw new Error(`duplicate object_id ${object.object_id}`);
    map.set(object.object_id,object);
  }
  return map;
}
function causalRelations(object,objectMap){
  return (object.relationships||[]).filter(rel=>{
    const target=objectMap.get(rel.target_object_id);
    return target &&
      !['FINANCIAL_OBLIGATION','FINANCIAL_MOVEMENT'].includes(target.object_type) &&
      CAUSAL_PREFIXES.some(prefix=>rel.relationship_type.startsWith(prefix));
  });
}
function activeSettlements(settlements){
  return settlements.filter(x=>x.state==='ACTIVE');
}
function sum(values){return values.reduce((a,b)=>a+Number(b),0);}

export function buildFinancialSnapshot({
  objects,
  settlements=[],
  openingPositions={},
  currency='CLP'
}){
  if(currency!=='CLP') throw new Error('financial core v1 supports CLP only');
  const state=clone(objects);
  const objectMap=byId(state);
  const obligations=state.filter(x=>x.object_type==='FINANCIAL_OBLIGATION');
  const movements=state.filter(x=>x.object_type==='FINANCIAL_MOVEMENT');
  const errors=[];

  for(const obligation of obligations){
    try{
      const d=obligation.data||{};
      if(!OBLIGATION_DIRECTIONS.has(d.obligation_direction)) throw new Error('invalid obligation_direction');
      assertPositiveInteger(d.amount,`${obligation.object_id}.amount`);
      if(d.currency!==currency) throw new Error('obligation currency mismatch');
      if(obligation.lifecycle_state!=='CANCELLED'&&causalRelations(obligation,objectMap).length===0){
        throw new Error('obligation has no causal non-financial relationship');
      }
    }catch(error){errors.push({kind:'OBLIGATION',object_id:obligation.object_id,error:error.message});}
  }

  for(const movement of movements){
    try{
      const d=movement.data||{};
      if(!MOVEMENT_DIRECTIONS.has(d.movement_direction)) throw new Error('invalid movement_direction');
      if(!MOVEMENT_STATES.has(d.movement_status)) throw new Error('invalid movement_status');
      if(!CHANNELS.has(d.channel)) throw new Error('invalid channel');
      if(!RECONCILIATION_STATES.has(d.reconciliation_state)) throw new Error('invalid reconciliation_state');
      assertPositiveInteger(d.amount,`${movement.object_id}.amount`);
      if(d.currency!==currency) throw new Error('movement currency mismatch');
      if(Number.isNaN(Date.parse(d.occurred_at))) throw new Error('occurred_at invalid');
      if(!Array.isArray(movement.provenance?.source_refs)||movement.provenance.source_refs.length===0){
        throw new Error('movement lacks evidence/provenance source_refs');
      }
    }catch(error){errors.push({kind:'MOVEMENT',object_id:movement.object_id,error:error.message});}
  }

  const settlementIds=new Set();
  const active=activeSettlements(settlements);
  for(const settlement of settlements){
    try{
      if(settlementIds.has(settlement.settlement_id)) throw new Error('duplicate settlement_id');
      settlementIds.add(settlement.settlement_id);
      if(!['ACTIVE','VOIDED'].includes(settlement.state)) throw new Error('invalid settlement state');
      assertPositiveInteger(settlement.amount,`${settlement.settlement_id}.amount`);
      if(settlement.currency!==currency) throw new Error('settlement currency mismatch');
      if(Number.isNaN(Date.parse(settlement.created_at))) throw new Error('settlement created_at invalid');
      if(!Array.isArray(settlement.evidence_refs)||settlement.evidence_refs.length===0) throw new Error('settlement evidence_refs required');
      const movement=objectMap.get(settlement.movement_id);
      const obligation=objectMap.get(settlement.obligation_id);
      if(!movement||movement.object_type!=='FINANCIAL_MOVEMENT') throw new Error('movement_id unresolved');
      if(!obligation||obligation.object_type!=='FINANCIAL_OBLIGATION') throw new Error('obligation_id unresolved');
      if(settlement.currency!==movement.data.currency||settlement.currency!==obligation.data.currency) throw new Error('currency mismatch across settlement');
      if(settlement.state==='ACTIVE'){
        if(movement.data.movement_status!=='CONFIRMED') throw new Error('ACTIVE settlement requires CONFIRMED movement');
        if(obligation.data.obligation_direction==='PAYABLE'&&movement.data.movement_direction!=='OUT') throw new Error('PAYABLE requires OUT movement');
        if(obligation.data.obligation_direction==='RECEIVABLE'&&movement.data.movement_direction!=='IN') throw new Error('RECEIVABLE requires IN movement');
        if(obligation.lifecycle_state==='CANCELLED') throw new Error('cannot settle CANCELLED obligation');
      }
    }catch(error){errors.push({kind:'SETTLEMENT',settlement_id:settlement.settlement_id,error:error.message});}
  }

  const movementAllocated=new Map();
  const obligationSettled=new Map();
  for(const settlement of active){
    movementAllocated.set(settlement.movement_id,(movementAllocated.get(settlement.movement_id)||0)+settlement.amount);
    obligationSettled.set(settlement.obligation_id,(obligationSettled.get(settlement.obligation_id)||0)+settlement.amount);
  }

  for(const movement of movements){
    const allocated=movementAllocated.get(movement.object_id)||0;
    if(allocated>movement.data.amount){
      errors.push({kind:'MOVEMENT_OVERALLOCATION',object_id:movement.object_id,allocated,amount:movement.data.amount});
    }
    if(movement.data.movement_status==='CONFIRMED'&&allocated===0&&causalRelations(movement,objectMap).length===0){
      errors.push({kind:'ORPHAN_MOVEMENT',object_id:movement.object_id,error:'confirmed movement has neither settlement nor causal non-financial relationship'});
    }
  }
  for(const obligation of obligations){
    const settled=obligationSettled.get(obligation.object_id)||0;
    if(settled>obligation.data.amount){
      errors.push({kind:'OBLIGATION_OVERSETTLEMENT',object_id:obligation.object_id,settled,amount:obligation.data.amount});
    }
  }

  if(errors.length){
    return {
      ok:false,
      schema_version:'CUDO_FINANCIAL_SNAPSHOT_V1',
      errors,
      production_write:false
    };
  }

  const obligationViews=obligations.map(obligation=>{
    const settled=obligationSettled.get(obligation.object_id)||0;
    const amount=obligation.data.amount;
    const outstanding=amount-settled;
    let derivedLifecycle=obligation.lifecycle_state;
    if(obligation.lifecycle_state!=='CANCELLED'){
      derivedLifecycle=settled===0?'OPEN':settled===amount?'SETTLED':'PARTIALLY_SETTLED';
    }
    return {
      object_id:obligation.object_id,
      direction:obligation.data.obligation_direction,
      kind:obligation.data.obligation_kind,
      amount,
      settled_amount:settled,
      outstanding_amount:outstanding,
      derived_lifecycle:derivedLifecycle,
      causal_object_ids:causalRelations(obligation,objectMap).map(x=>x.target_object_id)
    };
  });

  const movementViews=movements.map(movement=>{
    const allocated=movementAllocated.get(movement.object_id)||0;
    return {
      object_id:movement.object_id,
      direction:movement.data.movement_direction,
      amount:movement.data.amount,
      channel:movement.data.channel,
      movement_status:movement.data.movement_status,
      reconciliation_state:movement.data.reconciliation_state,
      allocated_amount:allocated,
      unallocated_amount:movement.data.amount-allocated
    };
  });

  const channelSet=new Set([...Object.keys(openingPositions),...movements.map(x=>x.data.channel)]);
  const channelPositions={};
  for(const channel of [...channelSet].sort()){
    if(!CHANNELS.has(channel)) throw new Error(`opening position channel unsupported: ${channel}`);
    const opening=Number(openingPositions[channel]||0);
    let confirmedIn=0,confirmedOut=0;
    for(const movement of movements){
      if(movement.data.channel!==channel||movement.data.movement_status!=='CONFIRMED') continue;
      if(movement.data.movement_direction==='IN') confirmedIn+=movement.data.amount;
      else confirmedOut+=movement.data.amount;
    }
    channelPositions[channel]={
      opening_position:opening,
      confirmed_in:confirmedIn,
      confirmed_out:confirmedOut,
      operational_position:opening+confirmedIn-confirmedOut
    };
  }

  const confirmed=movements.filter(x=>x.data.movement_status==='CONFIRMED');
  const reconciliationComplete=confirmed.every(x=>x.data.reconciliation_state==='RECONCILED');

  return {
    ok:true,
    schema_version:'CUDO_FINANCIAL_SNAPSHOT_V1',
    currency,
    obligation_views:obligationViews,
    movement_views:movementViews,
    channel_positions:channelPositions,
    reconciliation:{
      confirmed_movements:confirmed.length,
      reconciled_movements:confirmed.filter(x=>x.data.reconciliation_state==='RECONCILED').length,
      complete:reconciliationComplete
    },
    traceability:{
      active_settlements:active.map(settlement=>({
        settlement_id:settlement.settlement_id,
        movement_id:settlement.movement_id,
        obligation_id:settlement.obligation_id,
        amount:settlement.amount
      }))
    },
    production_write:false
  };
}

export function financialCorePolicy(){
  return {
    obligation:'money owed by or to the club, always linked to a cause',
    movement:'actual money movement from club perspective',
    settlement:'amount-bearing edge allocating a confirmed movement to an obligation',
    balance:'derived operational position, never an independent manually-owned value'
  };
}
