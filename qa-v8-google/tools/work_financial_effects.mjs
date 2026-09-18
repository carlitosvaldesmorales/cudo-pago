function clone(v){return JSON.parse(JSON.stringify(v));}

const AUTO_OBLIGATION_RULES={
  IRRIGATION:{
    required_cycle:'PER_COMPLETED_IRRIGATION',
    obligation_kind:'STADIUM_IRRIGATION_SERVICE',
    rule_id:'WORK_FINANCIAL_EFFECT_COMPLETED_IRRIGATION_V1'
  }
};

function obligationIdForWork(work){
  return 'CUDO-OBL-'+work.object_id.replace(/^CUDO-WORK-/,'WORK-');
}

export function deriveFinancialObligationsFromCompletedWork({
  objects,
  now='2026-10-06T18:00:00.000Z'
}){
  const state=clone(objects);
  const objectMap=new Map(state.map(x=>[x.object_id,x]));
  const created=[];
  const audit=[];

  for(const work of state.filter(x=>x.object_type==='WORK_ITEM')){
    if(work.lifecycle_state!=='DONE'){
      audit.push({kind:'NOOP_WORK_NOT_DONE',work_id:work.object_id,state:work.lifecycle_state});
      continue;
    }

    const rule=AUTO_OBLIGATION_RULES[work.data?.work_kind];
    if(!rule){
      audit.push({kind:'NOOP_FINANCIAL_EFFECT_NOT_AUTOMATABLE',work_id:work.object_id,work_kind:work.data?.work_kind||null});
      continue;
    }

    const amount=work.data?.financial_context_amount_clp;
    const cycle=work.data?.financial_context_cycle;
    if(!Number.isInteger(amount)||amount<=0){
      audit.push({kind:'NOOP_EXACT_AMOUNT_REQUIRED',work_id:work.object_id});
      continue;
    }
    if(cycle!==rule.required_cycle){
      audit.push({kind:'NOOP_PAYMENT_BASIS_NOT_MATCHED',work_id:work.object_id,expected:rule.required_cycle,actual:cycle||null});
      continue;
    }

    const obligationId=obligationIdForWork(work);
    if(objectMap.has(obligationId)){
      audit.push({kind:'NOOP_EXISTING_OBLIGATION',work_id:work.object_id,obligation_id:obligationId});
      continue;
    }

    const completionEvidence=(work.provenance?.source_refs||[]).filter(ref=>
      !String(ref).startsWith('artifact:Check-List') &&
      !String(ref).startsWith('qa://synthetic')
    );
    if(completionEvidence.length===0){
      audit.push({kind:'NOOP_COMPLETION_EVIDENCE_REQUIRED',work_id:work.object_id});
      continue;
    }

    const obligation={
      schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
      object_id:obligationId,
      object_type:'FINANCIAL_OBLIGATION',
      object_version:1,
      lifecycle_state:'OPEN',
      data:{
        obligation_direction:'PAYABLE',
        obligation_kind:rule.obligation_kind,
        amount,
        currency:'CLP',
        payee_actor_id:work.data.responsible_actor_id,
        payee_display_name:work.data.responsible_display_name,
        source_work_id:work.object_id,
        payment_context_cycle:cycle,
        payment_context_condition:work.data.financial_context_condition??null
      },
      field_semantics:{
        obligation_direction:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        obligation_kind:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        amount:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        currency:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        payee_actor_id:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        payee_display_name:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        source_work_id:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        payment_context_cycle:{state_kind:'DERIVED',rule_ids:[rule.rule_id]},
        payment_context_condition:{state_kind:'DERIVED',rule_ids:[rule.rule_id]}
      },
      relationships:[
        {
          relationship_id:`REL-${obligationId}-WORK`,
          relationship_type:'CAUSED_BY_WORK_ITEM',
          target_object_id:work.object_id
        }
      ],
      provenance:{
        created_at:now,
        updated_at:null,
        source_system:'CUDO_WORK_FINANCIAL_EFFECT_ENGINE',
        source_refs:[...new Set([...(work.provenance?.source_refs||[])])]
      },
      legacy_refs:[]
    };

    state.push(obligation);
    objectMap.set(obligationId,obligation);
    created.push(obligation);
    audit.push({
      kind:'FINANCIAL_OBLIGATION_CREATED',
      work_id:work.object_id,
      obligation_id:obligationId,
      amount,
      currency:'CLP',
      rule_id:rule.rule_id
    });
  }

  return {ok:true,objects:state,created,audit,production_write:false};
}

export function enrichOperationalProjectionWithFinancialEffects({projection,objects,financialSnapshot=null}){
  const views=new Map((financialSnapshot?.obligation_views||[]).map(x=>[x.object_id,x]));
  const obligations=objects.filter(x=>x.object_type==='FINANCIAL_OBLIGATION');
  const byWork=new Map();

  for(const obligation of obligations){
    const rel=(obligation.relationships||[]).find(x=>x.relationship_type==='CAUSED_BY_WORK_ITEM');
    if(!rel) continue;
    const view=views.get(obligation.object_id);
    byWork.set(rel.target_object_id,{
      obligation_id:obligation.object_id,
      direction:obligation.data.obligation_direction,
      kind:obligation.data.obligation_kind,
      amount_clp:obligation.data.amount,
      settled_amount_clp:view?.settled_amount??0,
      outstanding_amount_clp:view?.outstanding_amount??obligation.data.amount,
      state:view?.derived_lifecycle??obligation.lifecycle_state,
      payee_actor_id:obligation.data.payee_actor_id??null,
      payee_display_name:obligation.data.payee_display_name??null,
      payment_context_cycle:obligation.data.payment_context_cycle??null,
      payment_context_condition:obligation.data.payment_context_condition??null
    });
  }

  return {
    ...clone(projection),
    items:projection.items.map(item=>({
      ...item,
      financial_effect:byWork.get(item.work_id)||null
    }))
  };
}
