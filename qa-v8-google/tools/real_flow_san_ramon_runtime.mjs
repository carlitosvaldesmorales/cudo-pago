import fs from 'node:fs';
import {buildSourceChangeCommand,buildProjectionBundle,planProjectionPersistence} from './projection_persistence_adapters.mjs';
import {buildTransactionPlan,commitTransaction} from './transaction_override_contract.mjs';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';

export function buildRealFlowSanRamonArtifacts(){
  const fixture=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-real-flow-san-ramon-corona-v1.json','utf8'));
  const registry=JSON.parse(fs.readFileSync('qa-v8-google/contracts/cudo-dependency-rule-registry-v1.json','utf8'));
  const commands=fixture.correction_commands.map(c=>buildSourceChangeCommand({
    objects:fixture.objects,
    surface:c.surface,
    objectId:c.object_id,
    field:c.field,
    value:c.value,
    requestedBy:'sistemas@cudo.cl',
    reason:c.reason,
    evidenceRefs:c.evidence_refs
  }));
  const plan=buildTransactionPlan({
    objects:fixture.objects,
    registry,
    changes:commands.flatMap(x=>x.changes),
    activeConditions:fixture.active_conditions,
    requestedBy:'sistemas@cudo.cl',
    reason:'Real CUDO evidence replay: San Ramon Corona row',
    evidenceRefs:["artifact:PEDIDO CUDO.xlsx#'Pedido vs San Ramon 04-05-2025'!B3:L3"],
    now:'2026-09-18T16:30:00.000Z'
  });
  if(plan.status!=='READY') throw new Error(`real flow transaction plan not READY: ${JSON.stringify(plan)}`);
  const committed=commitTransaction({
    currentObjects:fixture.objects,
    plan,
    now:'2026-09-18T16:31:00.000Z'
  });
  if(!committed.ok) throw new Error(`real flow commit failed: ${JSON.stringify(committed)}`);
  const financial=buildFinancialSnapshot({
    objects:committed.objects,
    settlements:[],
    openingPositions:{},
    currency:'CLP'
  });
  if(!financial.ok) throw new Error(`real flow financial snapshot failed: ${JSON.stringify(financial)}`);
  const bundle=buildProjectionBundle({
    objects:committed.objects,
    settlements:[],
    financialSnapshot:financial,
    legacyPublic:fixture.projection.legacy_public,
    generatedAt:'2026-09-18T16:32:00.000Z'
  });
  const persistencePlan=planProjectionPersistence({bundle,targets:fixture.projection.targets});
  const publicJson=bundle.public_json.san_ramon_corona;
  const adminFinance=bundle.admin;
  const sheetModel={
    schema_version:'CUDO_VERSIONED_SHEETS_READ_MODEL_ARTIFACT_V1',
    generated_at:bundle.generated_at,
    source_revision:bundle.source_revision,
    authority:'CANONICAL_GRAPH_READ_MODEL',
    table:'FINANCIAL_OBLIGATIONS',
    values:bundle.sheets.tables.FINANCIAL_OBLIGATIONS
  };
  const manifest={
    schema_version:'CUDO_REAL_FLOW_SAN_RAMON_ARTIFACT_MANIFEST_V1',
    flow_id:fixture.flow_id,
    real_source:{
      artifact:fixture.source_artifact,
      sheet:fixture.source_sheet,
      range:fixture.source_range
    },
    generated_at:bundle.generated_at,
    source_revision:bundle.source_revision,
    transaction_id:plan.transaction_id,
    source_changes:plan.transitions.filter(x=>x.kind==='SOURCE_CHANGE').length,
    derived_recalculations:plan.transitions.filter(x=>x.kind==='DERIVED_RECALCULATION').length,
    persistence_plan_id:persistencePlan.plan_id,
    persistence_mode:'VERSIONED_QA_ARTIFACTS_ONLY',
    production_write:false,
    files:[
      'public.json',
      'admin-finance.json',
      'financial-obligations.json'
    ]
  };
  return {fixture,plan,committed,financial,bundle,persistencePlan,artifacts:{publicJson,adminFinance,sheetModel,manifest}};
}
