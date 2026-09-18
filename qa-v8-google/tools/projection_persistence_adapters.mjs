import crypto from 'node:crypto';

function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function byId(objects){return new Map(objects.map(x=>[x.object_id,x]));}
function requireField(object,field){
  if(!Object.hasOwn(object.data||{},field)) throw new Error(`${object.object_id}: missing projection field ${field}`);
  return clone(object.data[field]);
}
function legacyId(object,source){
  const ref=(object.legacy_refs||[]).find(x=>x.source_system===source);
  if(!ref?.legacy_id) throw new Error(`${object.object_id}: missing legacy id for ${source}`);
  return ref.legacy_id;
}
export function canonicalRevision({objects,settlements=[]}){
  return 'CUDO-REVISION-'+digest({objects:settlements.length?objects:objects,settlements}).slice(0,24).toUpperCase();
}

export function buildLegacyPublicJsonProjection({
  objects,
  source,
  objectType,
  fields,
  generatedAt,
  sourceRevision
}){
  const items=objects
    .filter(object=>object.object_type===objectType&&(object.legacy_refs||[]).some(x=>x.source_system===source))
    .sort((a,b)=>legacyId(a,source).localeCompare(legacyId(b,source)))
    .map(object=>({
      id:legacyId(object,source),
      ...Object.fromEntries(fields.map(field=>[field,requireField(object,field)]))
    }));
  return {
    schema_version:'1.0',
    generated_at:generatedAt,
    source,
    source_revision:sourceRevision,
    authority:'CANONICAL_GRAPH_READ_MODEL',
    items
  };
}

export function buildAdminFinanceProjection({financialSnapshot,generatedAt,sourceRevision}){
  if(!financialSnapshot?.ok) throw new Error('financial snapshot must be clean before projection');
  const outstanding=financialSnapshot.obligation_views.filter(x=>x.outstanding_amount>0);
  const unreconciled=financialSnapshot.movement_views.filter(x=>x.movement_status==='CONFIRMED'&&x.reconciliation_state!=='RECONCILED');
  return {
    schema_version:'CUDO_ADMIN_FINANCE_READ_MODEL_V1',
    generated_at:generatedAt,
    source_revision:sourceRevision,
    authority:'CANONICAL_GRAPH_READ_MODEL',
    summary:{
      obligations_total:financialSnapshot.obligation_views.length,
      obligations_open:outstanding.length,
      outstanding_payable:outstanding.filter(x=>x.direction==='PAYABLE').reduce((s,x)=>s+x.outstanding_amount,0),
      outstanding_receivable:outstanding.filter(x=>x.direction==='RECEIVABLE').reduce((s,x)=>s+x.outstanding_amount,0),
      confirmed_movements:financialSnapshot.reconciliation.confirmed_movements,
      unreconciled_movements:unreconciled.length,
      reconciliation_complete:financialSnapshot.reconciliation.complete
    },
    obligations:clone(financialSnapshot.obligation_views),
    movements:clone(financialSnapshot.movement_views),
    channel_positions:clone(financialSnapshot.channel_positions),
    reconciliation:clone(financialSnapshot.reconciliation)
  };
}

function row(value){return Array.isArray(value)?value:[value];}
export function buildSheetsReadModelProjection({financialSnapshot,sourceRevision}){
  if(!financialSnapshot?.ok) throw new Error('financial snapshot must be clean before projection');
  const obligationHeaders=['OBJECT_ID','DIRECTION','KIND','AMOUNT','SETTLED_AMOUNT','OUTSTANDING_AMOUNT','STATE','CAUSE_OBJECT_IDS','SOURCE_REVISION'];
  const movementHeaders=['OBJECT_ID','DIRECTION','AMOUNT','CHANNEL','MOVEMENT_STATUS','RECONCILIATION_STATE','ALLOCATED_AMOUNT','UNALLOCATED_AMOUNT','SOURCE_REVISION'];
  const channelHeaders=['CHANNEL','OPENING_POSITION','CONFIRMED_IN','CONFIRMED_OUT','OPERATIONAL_POSITION','SOURCE_REVISION'];
  return {
    schema_version:'CUDO_SHEETS_READ_MODEL_V1',
    source_revision:sourceRevision,
    authority:'CANONICAL_GRAPH_READ_MODEL',
    tables:{
      FINANCIAL_OBLIGATIONS:[
        obligationHeaders,
        ...financialSnapshot.obligation_views.map(x=>[
          x.object_id,x.direction,x.kind,x.amount,x.settled_amount,x.outstanding_amount,
          x.derived_lifecycle,(x.causal_object_ids||[]).join('|'),sourceRevision
        ])
      ],
      FINANCIAL_MOVEMENTS:[
        movementHeaders,
        ...financialSnapshot.movement_views.map(x=>[
          x.object_id,x.direction,x.amount,x.channel,x.movement_status,x.reconciliation_state,
          x.allocated_amount,x.unallocated_amount,sourceRevision
        ])
      ],
      CHANNEL_POSITIONS:[
        channelHeaders,
        ...Object.entries(financialSnapshot.channel_positions).sort(([a],[b])=>a.localeCompare(b)).map(([channel,x])=>[
          channel,x.opening_position,x.confirmed_in,x.confirmed_out,x.operational_position,sourceRevision
        ])
      ]
    }
  };
}

export function buildProjectionBundle({
  objects,
  settlements=[],
  financialSnapshot,
  legacyPublic=[],
  generatedAt='2026-09-18T15:30:00.000Z'
}){
  const sourceRevision=canonicalRevision({objects,settlements});
  const publicJson={};
  for(const config of legacyPublic){
    publicJson[config.key]=buildLegacyPublicJsonProjection({
      objects,
      source:config.source,
      objectType:config.object_type,
      fields:config.fields,
      generatedAt,
      sourceRevision
    });
  }
  return {
    schema_version:'CUDO_PROJECTION_BUNDLE_V1',
    generated_at:generatedAt,
    source_revision:sourceRevision,
    public_json:publicJson,
    admin:buildAdminFinanceProjection({financialSnapshot,generatedAt,sourceRevision}),
    sheets:buildSheetsReadModelProjection({financialSnapshot,sourceRevision})
  };
}

export function buildSourceChangeCommand({objects,surface,objectId,field,value,requestedBy,reason,evidenceRefs=[]}){
  if(!surface||!requestedBy||!reason) throw new Error('ingress command requires surface, requestedBy and reason');
  if(!Array.isArray(evidenceRefs)||evidenceRefs.length===0) throw new Error('ingress command requires evidenceRefs');
  const object=byId(objects).get(objectId);
  if(!object) throw new Error(`ingress object not found: ${objectId}`);
  if(!Object.hasOwn(object.data||{},field)) throw new Error(`ingress field not found: ${objectId}.${field}`);
  const semantic=object.field_semantics?.[field];
  if(!semantic) throw new Error(`ingress semantic missing: ${objectId}.${field}`);
  if(semantic.state_kind!=='SOURCE') throw new Error(`direct surface write blocked for ${semantic.state_kind} field ${objectId}.${field}`);
  return {
    schema_version:'CUDO_SOURCE_CHANGE_COMMAND_V1',
    command_id:'CUDO-CMD-'+digest({surface,objectId,field,value,requestedBy,reason,evidenceRefs}).slice(0,20).toUpperCase(),
    surface,
    requested_by:requestedBy,
    reason,
    evidence_refs:[...evidenceRefs],
    changes:[{object_id:objectId,field,value,source_ref:`surface://${surface}/${objectId}/${field}`}],
    route:'TRANSACTION_LAYER_REQUIRED'
  };
}

export function planProjectionPersistence({bundle,targets}){
  const mutations=[];
  for(const target of targets){
    if(target.kind==='JSON_FILE'){
      const document=target.document==='ADMIN'
        ? bundle.admin
        : bundle.public_json[target.document];
      if(!document) throw new Error(`projection document not found: ${target.document}`);
      mutations.push({
        mutation_id:'CUDO-PROJ-'+digest({target,revision:bundle.source_revision}).slice(0,20).toUpperCase(),
        kind:'JSON_FILE',
        path:target.path,
        document:clone(document),
        source_revision:bundle.source_revision
      });
    }else if(target.kind==='SHEETS_TABLE'){
      const values=bundle.sheets.tables[target.table];
      if(!values) throw new Error(`sheet projection table not found: ${target.table}`);
      mutations.push({
        mutation_id:'CUDO-PROJ-'+digest({target,revision:bundle.source_revision}).slice(0,20).toUpperCase(),
        kind:'SHEETS_RANGE',
        spreadsheet_id:target.spreadsheet_id,
        range:target.range,
        values:clone(values),
        source_revision:bundle.source_revision
      });
    }else{
      throw new Error(`unsupported projection target ${target.kind}`);
    }
  }
  return {
    schema_version:'CUDO_PROJECTION_PERSISTENCE_PLAN_V1',
    plan_id:'CUDO-PROJECTION-PLAN-'+digest({revision:bundle.source_revision,targets}).slice(0,20).toUpperCase(),
    source_revision:bundle.source_revision,
    mutations,
    external_atomicity_claimed:false,
    production_write:false
  };
}

export async function applyProjectionPersistence({
  plan,
  adapter,
  currentSourceRevision,
  apply=false
}){
  if(currentSourceRevision!==plan.source_revision){
    return {
      ok:false,
      status:'CONFLICT',
      reason:'SOURCE_REVISION_MISMATCH',
      expected:plan.source_revision,
      actual:currentSourceRevision,
      writes_applied:0,
      compensation_plan:[],
      production_write:false
    };
  }
  if(!apply){
    return {
      ok:true,
      status:'DRY_RUN',
      plan_id:plan.plan_id,
      writes_applied:0,
      mutations_planned:plan.mutations.length,
      compensation_plan:[],
      production_write:false
    };
  }
  const applied=[];
  for(const mutation of plan.mutations){
    try{
      let before;
      if(mutation.kind==='JSON_FILE'){
        before=await adapter.readJson(mutation.path);
        await adapter.writeJson(mutation.path,mutation.document);
      }else if(mutation.kind==='SHEETS_RANGE'){
        before=await adapter.readValues(mutation.spreadsheet_id,mutation.range);
        await adapter.replaceValues(mutation.spreadsheet_id,mutation.range,mutation.values);
      }else throw new Error(`unsupported mutation kind ${mutation.kind}`);
      applied.push({mutation,before:clone(before)});
    }catch(error){
      const compensationPlan=[...applied].reverse().map(item=>{
        if(item.mutation.kind==='JSON_FILE'){
          return {
            kind:'JSON_FILE_RESTORE',
            path:item.mutation.path,
            previous_document:item.before,
            compensates_mutation_id:item.mutation.mutation_id
          };
        }
        return {
          kind:'SHEETS_RANGE_RESTORE',
          spreadsheet_id:item.mutation.spreadsheet_id,
          range:item.mutation.range,
          previous_values:item.before,
          compensates_mutation_id:item.mutation.mutation_id
        };
      });
      return {
        ok:false,
        status:'PARTIAL_EXTERNAL_FAILURE',
        failed_mutation_id:mutation.mutation_id,
        error:error.message,
        writes_applied:applied.length,
        compensation_plan:compensationPlan,
        automatic_compensation_executed:false,
        production_write:false
      };
    }
  }
  return {
    ok:true,
    status:'APPLIED',
    writes_applied:applied.length,
    compensation_plan:[],
    external_atomicity_claimed:false,
    production_write:false
  };
}
