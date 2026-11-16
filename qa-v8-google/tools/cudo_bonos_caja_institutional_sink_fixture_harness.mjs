import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildFinancialSnapshot} from './canonical_financial_core.mjs';
import {buildSheetsReadModelProjection} from './projection_persistence_adapters.mjs';
import {SHEETS,planCudoBonosInstitutionalCashSync,applyCudoBonosInstitutionalCashSync} from './cudo_bonos_caja_institutional_sink.mjs';
const hex=x=>createHash('sha256').update(x).digest('hex');
const dt='2026-11-16T12:00:00.000Z',stamp='2026-11-16T12:01:00.000Z',rev='CUDO-BONOS-D1-1234567890ABCDEF12345678';
const ids=['00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013'];
const channels=['CASH','BANK_TRANSFER','THIRD_PARTY'];
const objects=[],settlements=[],proofs=[];
for(let i=0;i<ids.length;i++){
 const id=ids[i],ch=channels[i],mid=i===2?'MOV:MP:111':'MOV:OFFLINE:ev-'+(i+1);
 const refs=['SOURCE:'+hex('source-'+i)];
 objects.push({object_id:'RAFFLE_ORDER:'+id,object_type:'RAFFLE_ORDER',data:{}});
 objects.push({object_id:'OBL:'+id,object_type:'FINANCIAL_OBLIGATION',lifecycle_state:'OPEN',
  data:{obligation_direction:'RECEIVABLE',obligation_kind:'RAFFLE_CONTRIBUTION',amount:2000,currency:'CLP'},
  relationships:[{relationship_type:'CAUSED_BY_RAFFLE_ORDER',target_object_id:'RAFFLE_ORDER:'+id}]});
 objects.push({object_id:mid,object_type:'FINANCIAL_MOVEMENT',data:{movement_direction:'IN',
  movement_status:'CONFIRMED',channel:ch,reconciliation_state:i===2?'UNRECONCILED':'RECONCILED',
  amount:2000,currency:'CLP',occurred_at:dt},provenance:{source_refs:refs}});
 settlements.push({settlement_id:'STL:'+i,movement_id:mid,obligation_id:'OBL:'+id,amount:2000,currency:'CLP',state:'ACTIVE',created_at:dt,evidence_refs:refs});
 if(i<2)proofs.push({movementId:mid,obligationId:'OBL:'+id,amountCLP:2000,
  sourceKind:i===0?'OPERATOR_CASH_COUNT':'BANK_STATEMENT_CREDIT',
  verifiedAt:dt,sourceRefDigest:hex('source-'+i),evidenceDigest:hex('evidence-'+i)});
}
const core=buildFinancialSnapshot({objects,settlements});
assert.equal(core.ok,true);
const original=buildSheetsReadModelProjection({financialSnapshot:core,sourceRevision:rev});
const source={contract:'CUDO_SHEETS_READ_MODEL_V1',generatedFrom:'CUDO_BONOS_D1_VERIFIED_CANONICAL_FINANCIAL_CORE_V1',
 readOnly:true,persistedToInstitutionalSheet:false,productionWrite:false,sourceRevision:rev,
 tables:original.tables,sourceProofs:proofs};
const makeBook=()=>Object.fromEntries(Object.values(SHEETS).map(s=>[s.name,[s.header.slice()]]));
const copy=x=>JSON.parse(JSON.stringify(x));
async function test(){
 const book=makeBook();
 // Genuine observed historical CUDO row remains unmodified; K=TX_ID empty.
 book.CUDO_LEDGER_V1.push(['2025-12-03',1,'BAR','PARTIDO','VENTA_BAR',45000,'PARTIDO_20251203','ventas bebidas','charly','2025-12-03','']);
 let p=planCudoBonosInstitutionalCashSync({source,existingBook:book,recordedAt:stamp});
 assert.equal(p.sourceMovementCount,2);
 assert.equal(p.planned.length,6);
 assert.equal(p.skipped.length,0);
 assert.equal(p.planned.filter(x=>x.sheet===SHEETS.ledger.name).reduce((n,x)=>n+x.values[5],0),4000);
 assert.ok(p.planned.every(x=>!x.txId.startsWith('MOV:MP:')),'MP approved must remain THIRD_PARTY unbanked');
 assert.equal(p.planned.find(x=>x.sheet===SHEETS.ledger.name).rowIndex,2);
 assert.equal(book.CUDO_LEDGER_V1[1][5],45000);
 let calls=0,locks=0,d1Reads=0;
 const remoteAuthoritative=copy(source);
 const adapter={async authorizedInstitutionalPrincipal(){return 'sistemas@cudo.cl'},
  async readAuthoritativeCudoFinancialSource(){d1Reads++;return copy(remoteAuthoritative)},
  async readBook(){return copy(book)},
  async withInstitutionalExclusiveLock(f){locks++;return f()},
  async batchWriteAndReadback({mutations,spreadsheetId}){
   calls++;assert.equal(mutations.length,6);assert.ok(spreadsheetId);
   for(const m of mutations){const row=book[m.sheet];assert.ok(!row[m.rowIndex]||row[m.rowIndex].every(v=>v===''||v==null));row[m.rowIndex]=copy(m.values)}
   return {applied:mutations.length,verified:true};
  }};
 const dry=await applyCudoBonosInstitutionalCashSync({source,adapter,recordedAt:stamp,apply:false});
 assert.equal(dry.status,'DRY_RUN');assert.equal(calls,0);assert.equal(locks,0);assert.equal(d1Reads,1);
 const applied=await applyCudoBonosInstitutionalCashSync({source,adapter,recordedAt:stamp,apply:true});
 assert.equal(applied.status,'APPLIED_AND_VERIFIED');assert.equal(applied.writesApplied,6);
 const replay=await applyCudoBonosInstitutionalCashSync({source,adapter,recordedAt:stamp,apply:true});
 assert.equal(replay.status,'NOOP_ALREADY_CURRENT');assert.equal(calls,1);assert.equal(locks,1);assert.equal(d1Reads,4);
 const identical=planCudoBonosInstitutionalCashSync({source,existingBook:book,recordedAt:'2026-11-17T09:00:00Z'});
 assert.equal(identical.planned.length,0,'replay with different wall-clock timestamp remains NOOP');
 const broken=copy(book);broken.CUDO_LEDGER_V1[2][5]=999;
 assert.throws(()=>planCudoBonosInstitutionalCashSync({source,existingBook:broken,recordedAt:stamp}),/TX_CONFLICT/);
 const duplicated=copy(book);duplicated.CUDO_LEDGER_V1.push(copy(duplicated.CUDO_LEDGER_V1[2]));
 assert.throws(()=>planCudoBonosInstitutionalCashSync({source,existingBook:duplicated,recordedAt:stamp}),/DUPLICATE_TX/);
 const missing=copy(source);missing.sourceProofs=proofs.slice(1);
 assert.throws(()=>planCudoBonosInstitutionalCashSync({source:missing,existingBook:book,recordedAt:stamp}),/PROOF_COVERAGE/);
 const forgery=copy(source);forgery.sourceProofs[0].amountCLP=3000;
 assert.throws(()=>planCudoBonosInstitutionalCashSync({source:forgery,existingBook:book,recordedAt:stamp}),/CAUSAL_MISMATCH/);
 const fakeBank=copy(source);fakeBank.sourceProofs[0].sourceKind='BANK_STATEMENT_CREDIT';
 assert.throws(()=>planCudoBonosInstitutionalCashSync({source:fakeBank,existingBook:book,recordedAt:stamp}),/CAUSAL_MISMATCH/);
 assert.throws(()=>planCudoBonosInstitutionalCashSync({source:{...source,sourceRevision:'FAKE'},existingBook:book,recordedAt:stamp}),/PRIVATE_SOURCE/);
 await assert.rejects(applyCudoBonosInstitutionalCashSync({source,adapter:{},recordedAt:stamp,apply:true}),/SINGLE_WRITER_LOCK_REQUIRED/);
 await assert.rejects(applyCudoBonosInstitutionalCashSync({source,adapter:{...adapter,authorizedInstitutionalPrincipal:async()=>null},recordedAt:stamp,apply:true}),/AUTHENTICATED_PRINCIPAL_REQUIRED/);
 const raceBook=makeBook();const raced={async authorizedInstitutionalPrincipal(){return 'sistemas@cudo.cl'},
  async readAuthoritativeCudoFinancialSource(){return copy(source)},
  async readBook(){return copy(raceBook)},async withInstitutionalExclusiveLock(f){raceBook.CUDO_LEDGER_V1.push(['NEW_EXTERNAL_TX']);return f()},async batchWriteAndReadback(){throw Error('SHOULD_NOT_WRITE')}};
 await assert.rejects(applyCudoBonosInstitutionalCashSync({source,adapter:raced,recordedAt:stamp,apply:true}),/SOURCE_CHANGED_BEFORE_COMMIT/);
 // No backed-by-cash entries: empty source means none gets written to institutional book.
 const empty={...source,tables:{...source.tables,FINANCIAL_MOVEMENTS:[source.tables.FINANCIAL_MOVEMENTS[0]],FINANCIAL_OBLIGATIONS:[source.tables.FINANCIAL_OBLIGATIONS[0]]},sourceProofs:[]};
 assert.equal(planCudoBonosInstitutionalCashSync({source:empty,existingBook:book,recordedAt:stamp}).planned.length,0);
 // A snapshot bearing the exact valid schema and sourceRevision but a
 // different evidence/movement cannot be accepted as the institution's
 // authoritative D1, even when a caller asserts it is reconciled.
 const forged=copy(source);forged.sourceProofs[0].sourceRefDigest=hex('fake-valid-looking-receipt');
 await assert.rejects(applyCudoBonosInstitutionalCashSync({source:forged,adapter,recordedAt:stamp,apply:true}),/D1_SOURCE_READBACK_MISMATCH/);
 await assert.rejects(applyCudoBonosInstitutionalCashSync({source,adapter:{...adapter,readAuthoritativeCudoFinancialSource:null},recordedAt:stamp}),/AUTHENTICATED_D1_SOURCE_NOT_WIRED/);
 // Fresh book exercises in-lock readback after independent D1 verification.
 const fresh=makeBook();
 let changeCount=0;const changed={
  ...adapter,async readBook(){return copy(fresh)},
  async readAuthoritativeCudoFinancialSource(){changeCount++;const r=copy(source);
   if(changeCount===2)r.sourceProofs[0].sourceRefDigest=hex('bank-reversal');
   return r;
  },async batchWriteAndReadback(){throw Error('SHOULD_NOT_WRITE_D1_CHANGED')}
 };
 await assert.rejects(applyCudoBonosInstitutionalCashSync({source,adapter:changed,recordedAt:stamp,apply:true}),/D1_SOURCE_CHANGED_BEFORE_COMMIT/);
 assert.equal(changeCount,2);

 console.log(JSON.stringify({ok:true,contract:'CUDO_BONOS_INSTITUTIONAL_CASH_SYNC_PLAN_V1',originalLedgerHistoryPreserved:true,syntheticProofs:2,plannedMutations:6,mpUnbankedNotBooked:true,replayStatus:replay.status,externalRaceRejected:true,wrongMoneyRejected:true,singleWriterRequired:true,independentD1ProofRequired:true,d1ChangedInLockRejected:true,productionWrites:0}));
}
await test();
