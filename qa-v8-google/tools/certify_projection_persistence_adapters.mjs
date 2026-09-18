import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';
import {
  buildProjectionBundle,
  buildSourceChangeCommand,
  planProjectionPersistence,
  applyProjectionPersistence,
  canonicalRevision
} from './projection_persistence_adapters.mjs';

const financialFixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-canonical-financial-fixture-v1.json','utf8'));
const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-projection-persistence-fixture-v1.json','utf8'));

const matchObject={
  schema_version:'CUDO_SHARED_OBJECT_CONTRACT_V1',
  object_id:'CUDO-EVENT-PROJECTION-001',
  object_type:'ACTIVITY_EVENT',
  object_version:1,
  lifecycle_state:'COMPLETED',
  data:{
    competencia:'Amistoso',
    fecha:'2026-08-30',
    hora:'14:00',
    categoria:'TERCERA',
    local:'CUDO',
    visita:'Sara huape',
    recinto:'Cudo',
    estado_partido:'FINALIZADO',
    goles_local:3,
    goles_visita:2
  },
  field_semantics:{
    competencia:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    fecha:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    hora:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    categoria:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    local:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    visita:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    recinto:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    estado_partido:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    goles_local:{state_kind:'SOURCE',source_refs:['fixture://partido']},
    goles_visita:{state_kind:'SOURCE',source_refs:['fixture://partido']}
  },
  relationships:[],
  provenance:{
    created_at:'2026-09-18T15:00:00.000Z',
    updated_at:null,
    source_system:'CUDO_PROJECTION_FIXTURE',
    source_refs:['fixture://partido']
  },
  legacy_refs:[
    {source_system:'CUDO_WEB_PARTIDOS',legacy_id:'QA-PAR-20260905144145-001'}
  ]
};

const objects=[...financialFixture.objects,matchObject];
const snapshot=buildFinancialSnapshot({
  objects,
  settlements:financialFixture.settlements,
  openingPositions:financialFixture.opening_positions,
  currency:financialFixture.currency
});
assert.equal(snapshot.ok,true,JSON.stringify(snapshot.errors));

const generatedAt='2026-09-18T15:30:00.000Z';
const bundle=buildProjectionBundle({
  objects,
  settlements:financialFixture.settlements,
  financialSnapshot:snapshot,
  legacyPublic:fixture.legacy_public,
  generatedAt
});
assert.equal(bundle.source_revision,canonicalRevision({objects,settlements:financialFixture.settlements}));

// Existing preview-v8 public JSON envelope remains compatible, but now declares canonical authority/revision.
const partidos=bundle.public_json.partidos;
assert.equal(partidos.schema_version,'1.0');
assert.equal(partidos.source,'CUDO_WEB_PARTIDOS');
assert.equal(partidos.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(partidos.items.length,1);
assert.deepEqual(partidos.items[0],{
  id:'QA-PAR-20260905144145-001',
  competencia:'Amistoso',
  fecha:'2026-08-30',
  hora:'14:00',
  categoria:'TERCERA',
  local:'CUDO',
  visita:'Sara huape',
  recinto:'Cudo',
  estado_partido:'FINALIZADO',
  goles_local:3,
  goles_visita:2
});

// Admin and Sheets are two projections of the same revision.
assert.equal(bundle.admin.source_revision,bundle.source_revision);
assert.equal(bundle.sheets.source_revision,bundle.source_revision);
assert.equal(bundle.admin.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(bundle.sheets.authority,'CANONICAL_GRAPH_READ_MODEL');
assert.equal(bundle.admin.summary.obligations_total,3);
assert.equal(bundle.sheets.tables.FINANCIAL_OBLIGATIONS.length,4);
assert.equal(bundle.sheets.tables.FINANCIAL_MOVEMENTS.length,5);
assert.equal(bundle.sheets.tables.CHANNEL_POSITIONS.length,3);

// Ingress from any surface is a command only; SOURCE accepted, DERIVED blocked.
const sourceCommand=buildSourceChangeCommand({
  objects,
  surface:'ADMIN',
  objectId:'CUDO-OBL-FIN-SUP-001',
  field:'amount',
  value:160000,
  requestedBy:'sistemas@cudo.cl',
  reason:'Corrección sintética de obligación',
  evidenceRefs:['fixture://admin/financial-obligation']
});
assert.equal(sourceCommand.route,'TRANSACTION_LAYER_REQUIRED');
assert.equal(sourceCommand.changes[0].field,'amount');

const propagationObjects=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-propagation-fixture-v1.json','utf8')).objects;
assert.throws(()=>buildSourceChangeCommand({
  objects:propagationObjects,
  surface:'SHEETS',
  objectId:'CUDO-RESOURCE-SYNTH-BEV-001',
  field:'stock_after_sales',
  value:999,
  requestedBy:'sistemas@cudo.cl',
  reason:'Intento de escribir derivado',
  evidenceRefs:['fixture://derived-write']
}),/direct surface write blocked for DERIVED/);

// Persistence planning is deterministic and dry-run by default.
const plan=planProjectionPersistence({bundle,targets:fixture.targets});
const replayPlan=planProjectionPersistence({bundle,targets:fixture.targets});
assert.deepEqual(replayPlan,plan);
assert.equal(plan.mutations.length,3);
assert.equal(plan.external_atomicity_claimed,false);

const calls=[];
const memory={
  json:new Map([
    ['preview-v8/data/partidos.json',{schema_version:'1.0',source:'CUDO_WEB_PARTIDOS',items:[]}],
    ['preview-v8/admin/data/finance.json',null]
  ]),
  sheets:new Map([
    ['SYNTHETIC-CUDO-ADMIN|FINANCIAL_OBLIGATIONS!A:I',[['OLD']]]
  ])
};
const adapter={
  async readJson(path){calls.push(['readJson',path]);return memory.json.get(path)??null;},
  async writeJson(path,document){calls.push(['writeJson',path]);memory.json.set(path,JSON.parse(JSON.stringify(document)));},
  async readValues(id,range){calls.push(['readValues',id,range]);return JSON.parse(JSON.stringify(memory.sheets.get(id+'|'+range)??[]));},
  async replaceValues(id,range,values){calls.push(['replaceValues',id,range]);memory.sheets.set(id+'|'+range,JSON.parse(JSON.stringify(values)));}
};
const dry=await applyProjectionPersistence({
  plan,
  adapter,
  currentSourceRevision:bundle.source_revision
});
assert.equal(dry.status,'DRY_RUN');
assert.equal(dry.writes_applied,0);
assert.equal(calls.length,0);

// Stale source revision blocks before any write.
const stale=await applyProjectionPersistence({
  plan,
  adapter,
  currentSourceRevision:'CUDO-REVISION-STALE',
  apply:true
});
assert.equal(stale.status,'CONFLICT');
assert.equal(stale.writes_applied,0);
assert.equal(calls.length,0);

// Apply against in-memory adapter proves both JSON and Sheets projection paths.
const applied=await applyProjectionPersistence({
  plan,
  adapter,
  currentSourceRevision:bundle.source_revision,
  apply:true
});
assert.equal(applied.ok,true);
assert.equal(applied.status,'APPLIED');
assert.equal(applied.writes_applied,3);
assert.equal(memory.json.get('preview-v8/data/partidos.json').source_revision,bundle.source_revision);
assert.equal(memory.json.get('preview-v8/admin/data/finance.json').summary.obligations_total,3);
const projectedObligationRows=memory.sheets.get('SYNTHETIC-CUDO-ADMIN|FINANCIAL_OBLIGATIONS!A:I');
assert.ok(projectedObligationRows.slice(1).some(row=>row[0]==='CUDO-OBL-FIN-CLEAN-001'));
assert.ok(projectedObligationRows.slice(1).some(row=>row[0]==='CUDO-OBL-FIN-SUP-001'));
assert.ok(projectedObligationRows.slice(1).some(row=>row[0]==='CUDO-OBL-FIN-SALE-001'));

// Partial external failure returns reverse-order compensation plan and does not claim atomicity.
let writes=0;
const failingMemory={
  json:new Map([
    ['preview-v8/data/partidos.json',{old:'partidos'}],
    ['preview-v8/admin/data/finance.json',{old:'admin'}]
  ])
};
const failingAdapter={
  async readJson(path){return JSON.parse(JSON.stringify(failingMemory.json.get(path)??null));},
  async writeJson(path,document){writes++;failingMemory.json.set(path,JSON.parse(JSON.stringify(document)));},
  async readValues(){return [['OLD']];},
  async replaceValues(){throw new Error('synthetic sheets failure');}
};
const partial=await applyProjectionPersistence({
  plan,
  adapter:failingAdapter,
  currentSourceRevision:bundle.source_revision,
  apply:true
});
assert.equal(partial.ok,false);
assert.equal(partial.status,'PARTIAL_EXTERNAL_FAILURE');
assert.equal(partial.writes_applied,2);
assert.equal(partial.automatic_compensation_executed,false);
assert.equal(partial.compensation_plan.length,2);
assert.equal(partial.compensation_plan[0].path,'preview-v8/admin/data/finance.json');
assert.equal(partial.compensation_plan[1].path,'preview-v8/data/partidos.json');

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_PROJECTION_PERSISTENCE_ADAPTERS_V1',
  legacy_public_json_compatible:true,
  admin_read_model:true,
  sheets_read_model:true,
  single_source_revision_across_surfaces:true,
  source_command_ingress:true,
  derived_direct_write_blocked:true,
  deterministic_projection_plan:true,
  dry_run_default:true,
  stale_revision_conflict:true,
  json_adapter_path:true,
  sheets_adapter_path:true,
  partial_failure_compensation_plan:true,
  external_atomicity_claimed:false,
  production_write:false
},null,2));
