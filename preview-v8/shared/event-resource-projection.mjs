const uniq=a=>[...new Set((a||[]).filter(Boolean))];

function relatedRefsForEvent(state,event){
  const directWork=(state.work_items||[]).filter(w=>w.source_ref===event.event_id);
  const workIds=new Set(directWork.map(w=>w.work_id));
  const directObligations=(state.financial_obligations||[]).filter(o=>o.cause_ref===event.event_id||workIds.has(o.cause_ref));
  const obligationIds=new Set(directObligations.map(o=>o.obligation_id));
  const indirectWork=(state.work_items||[]).filter(w=>obligationIds.has(w.source_ref));
  for(const w of indirectWork) workIds.add(w.work_id);
  const obligations=(state.financial_obligations||[]).filter(o=>o.cause_ref===event.event_id||workIds.has(o.cause_ref));
  const allObligationIds=new Set(obligations.map(o=>o.obligation_id));
  const settlements=(state.settlements||[]).filter(s=>allObligationIds.has(s.obligation_id));
  const settlementIds=new Set(settlements.map(s=>s.settlement_id));
  const movementIds=new Set(settlements.map(s=>s.movement_id));
  const movements=(state.financial_movements||[]).filter(m=>movementIds.has(m.movement_id)||(m.settlement_refs||[]).some(x=>settlementIds.has(x)));
  const works=(state.work_items||[]).filter(w=>workIds.has(w.work_id));
  const resourceIds=new Set([...(event.resource_refs||[]),...works.map(w=>w.resource_ref).filter(Boolean)]);
  const resources=(state.resources||[]).filter(r=>resourceIds.has(r.resource_id));
  const refs=new Set([event.event_id,...workIds,...allObligationIds,...resourceIds]);
  const evidence=(state.evidence||[]).filter(e=>(e.related_refs||[]).some(r=>refs.has(r)));
  return {works,obligations,settlements,movements,resources,evidence};
}

export function buildDynamicEventViews(state){
  if(!state||state.schema_version!=='CUDO_CLUB_OS_GOLDEN_MOCK_V1'||state.mock!==true){
    throw new Error('golden mock required');
  }
  const actorById=new Map((state.actors||[]).map(a=>[a.actor_id,a]));
  return (state.events||[]).map(event=>{
    const related=relatedRefsForEvent(state,event);
    const payable=related.obligations.filter(o=>o.direction==='PAYABLE');
    const receivable=related.obligations.filter(o=>o.direction==='RECEIVABLE');
    const cashIn=related.movements.filter(m=>m.status==='CONFIRMED'&&m.direction==='IN').reduce((n,m)=>n+Number(m.amount_clp||0),0);
    const cashOut=related.movements.filter(m=>m.status==='CONFIRMED'&&m.direction==='OUT').reduce((n,m)=>n+Number(m.amount_clp||0),0);
    const activeCapabilities=uniq(event.capabilities||[]);
    const branches=[];
    if(activeCapabilities.some(x=>x==='SPORTS_COMPETITION')) branches.push('SPORT');
    if(activeCapabilities.some(x=>x.includes('VENUE')||x.includes('FACILITY'))) branches.push('FACILITY');
    if(related.works.length) branches.push('HUMAN_WORK');
    if(related.resources.length) branches.push('RESOURCE');
    if(related.obligations.length||related.movements.length) branches.push('FINANCE');
    if(related.evidence.length) branches.push('EVIDENCE');
    return {
      event_id:event.event_id,
      kind:event.kind,
      display_name:event.display_name,
      state:event.state,
      starts_at:event.starts_at||null,
      capabilities:activeCapabilities,
      active_branches:uniq(branches),
      work:related.works.map(w=>({
        work_id:w.work_id,
        title:w.title,
        kind:w.work_kind,
        state:w.state,
        responsible_actor_id:w.responsible_actor_id,
        responsible_name:actorById.get(w.responsible_actor_id)?.display_name||'Sin responsable',
        resource_ref:w.resource_ref||null
      })),
      resources:related.resources.map(r=>({
        resource_id:r.resource_id,
        kind:r.kind,
        display_name:r.display_name,
        state:r.state
      })),
      finance:{
        payables:payable.map(o=>({
          obligation_id:o.obligation_id,kind:o.kind,amount_clp:Number(o.amount_clp||0),
          settled_amount_clp:Number(o.settled_amount_clp||0),outstanding_amount_clp:Number(o.outstanding_amount_clp||0),state:o.state
        })),
        receivables:receivable.map(o=>({
          obligation_id:o.obligation_id,kind:o.kind,amount_clp:Number(o.amount_clp||0),
          settled_amount_clp:Number(o.settled_amount_clp||0),outstanding_amount_clp:Number(o.outstanding_amount_clp||0),state:o.state
        })),
        actual_cash_in_clp:cashIn,
        actual_cash_out_clp:cashOut,
        actual_cash_result_clp:cashIn-cashOut,
        outstanding_payable_clp:payable.reduce((n,o)=>n+Number(o.outstanding_amount_clp||0),0),
        outstanding_receivable_clp:receivable.reduce((n,o)=>n+Number(o.outstanding_amount_clp||0),0)
      },
      evidence:related.evidence.map(e=>({
        evidence_id:e.evidence_id,kind:e.kind,display_name:e.display_name,state:e.state
      })),
      mock:true,
      production_write:false
    };
  });
}
