// CUDO existing ledger: additive, source-verified TX_ID, NEVER a second balance.
// Pure plan and locked Sheets batch adapter. Financially effective rows require
// a signed/private source readback and an independent CASH/BANK settlement.
// No production OAuth/endpoint/cron/secret is installed by this module.
import {createHash} from 'node:crypto';

export const SHEET_ID='1f0TYrlHOMef6dx08o6LxJb4va4nEL0CNBt8dTsdcNbo';
export const SHEETS=Object.freeze({
 ledger:{name:'CUDO_LEDGER_V1',id:37094293,header:['FECHA','FLUJO','CUENTA','DOMINIO','ITEM','MONTO','PROYECTO','DESCRIPCION','REGISTRADO_POR','TIMESTAMP_REG','TX_ID'],tx:10,amount:5},
 efd:{name:'EFD_LOG_V1',id:1336462948,header:['TX_ID','LADO','ACTOR','MONTO','FECHA','AREA','CONTEXTO','ETIQUETA','DESCRIPCION','USUARIO','TIMESTAMP_REG'],tx:0,amount:3},
 receipts:{name:'CUDO_COMPROBANTES_V1',id:862726793,header:['ID_COMPROBANTE','TIPO_COMPROBANTE','TX_ID','FECHA_COMPROBANTE','MONTO','AREA','CONTEXTO','ACTOR_ORIGEN','ACTOR_DESTINO','CONCEPTO','USUARIO_EMISOR','TIMESTAMP_EMISION','ESTADO'],tx:2,amount:4}
});
const failure=code=>{throw Error(code)};
const hex64=/^[a-f0-9]{64}$/i;
const str=s=>typeof s==='string'?s.trim():'';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const dateValid=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
const iso=s=>new Date(s).toISOString();
const ledgerChannel=channel=>channel==='CASH'?'CAJA_CLUB':channel==='BANK_TRANSFER'?'BANCO':null;
const digest=x=>createHash('sha256').update(String(x)).digest('hex');
const nonempty=r=>r.some(v=>v!==''&&v!==undefined&&v!==null);
// This is NOT a signature verification: it binds the caller's requested
// projection to an independently fetched readback from the existing private
// CUDO D1 treasury source. The adapter must fetch the readback itself using
// its authorized institutional service context, never echo caller input.
function sameCudoCanonicalFinancialSource(requested,independentlyRead){
 if(!independentlyRead||typeof independentlyRead!=='object')return false;
 // Bind the entire immutable contract (orders, amounts, reconciliations,
 // provenance and source proofs) rather than trusting sourceRevision alone.
 return same(requested,independentlyRead);
}


function normalizeBook(book){
 if(!book||typeof book!=='object')failure('CUDO_INSTITUTIONAL_BOOK_MISSING');
 const map={};for(const [key,spec] of Object.entries(SHEETS)){
  const rows=book[spec.name];if(!Array.isArray(rows)||!Array.isArray(rows[0]))failure('CUDO_INSTITUTIONAL_TAB_MISSING_'+spec.name);
  if(!same(rows[0].slice(0,spec.header.length),spec.header))failure('CUDO_INSTITUTIONAL_HEADER_MISMATCH_'+spec.name);
  const seen=new Map();let last=0;
  for(let i=1;i<rows.length;i++){
   const row=rows[i]||[];if(!Array.isArray(row))failure('CUDO_INSTITUTIONAL_ROW_MALFORMED');
   if(nonempty(row))last=i;
   const tx=str(row[spec.tx]);if(!tx)continue;
   if(seen.has(tx))failure('CUDO_INSTITUTIONAL_DUPLICATE_TX_'+spec.name);
   seen.set(tx,row);
  }
  map[key]={spec,seen,nextRowIndex:last+1};
 }
 return map;
}
function verifySource(src){
 if(!src||src.contract!=='CUDO_SHEETS_READ_MODEL_V1'||src.generatedFrom!=='CUDO_BONOS_D1_VERIFIED_CANONICAL_FINANCIAL_CORE_V1'||src.readOnly!==true||src.productionWrite===true||
   !/^CUDO-BONOS-D1-[A-F0-9]{24}$/.test(src.sourceRevision)||src.persistedToInstitutionalSheet!==false)
  failure('CUDO_CANONICAL_PRIVATE_SOURCE_REQUIRED');
 const t=src.tables||{};
 const heads={
  FINANCIAL_MOVEMENTS:['OBJECT_ID','DIRECTION','AMOUNT','CHANNEL','MOVEMENT_STATUS','RECONCILIATION_STATE','ALLOCATED_AMOUNT','UNALLOCATED_AMOUNT','SOURCE_REVISION'],
  FINANCIAL_OBLIGATIONS:['OBJECT_ID','DIRECTION','KIND','AMOUNT','SETTLED_AMOUNT','OUTSTANDING_AMOUNT','STATE','CAUSE_OBJECT_IDS','SOURCE_REVISION']
 };
 for(const [name,header] of Object.entries(heads)){
  if(!Array.isArray(t[name])||!same(t[name][0],header))failure('CUDO_CANONICAL_VIEW_HEADER_MISMATCH_'+name);
 }
 if(!Array.isArray(src.sourceProofs))failure('CUDO_CANONICAL_SOURCE_PROOFS_MISSING');
 const obligations=new Map(t.FINANCIAL_OBLIGATIONS.slice(1).map(x=>[x[0],x]));
 const movements=new Map();
 for(const r of t.FINANCIAL_MOVEMENTS.slice(1)){
  if(!Array.isArray(r)||r.length<9||movements.has(r[0])||r[8]!==src.sourceRevision)failure('CUDO_CANONICAL_MOVEMENT_VIEW_CONFLICT');
  movements.set(r[0],r);
 }
 for(const o of obligations.values())if(o[8]!==src.sourceRevision)failure('CUDO_CANONICAL_OBLIGATION_REVISION_CONFLICT');
 const all=new Map();
 for(const p of src.sourceProofs){
  if(!p||typeof p!=='object'||!/^MOV:OFFLINE:[A-Za-z0-9_-]{3,128}$/.test(p.movementId)||all.has(p.movementId)||
    !/^OBL:[a-f0-9-]{36}$/i.test(p.obligationId)||!hex64.test(str(p.sourceRefDigest))||
    !hex64.test(str(p.evidenceDigest))||!dateValid(p.verifiedAt)||
    !['OPERATOR_CASH_COUNT','BANK_STATEMENT_CREDIT'].includes(p.sourceKind))
    failure('CUDO_CANONICAL_PROOF_INVALID');
  const channel=p.sourceKind==='OPERATOR_CASH_COUNT'?'CASH':'BANK_TRANSFER';
  const m=movements.get(p.movementId),o=obligations.get(p.obligationId);
  if(!m||!o||m[1]!=='IN'||m[3]!==channel||m[4]!=='CONFIRMED'||m[5]!=='RECONCILED'||
    !Number.isSafeInteger(m[2])||m[2]<=0||m[2]!==p.amountCLP||m[6]!==m[2]||m[7]!==0||
    o[1]!=='RECEIVABLE'||o[2]!=='RAFFLE_CONTRIBUTION'||o[6]!=='SETTLED'||o[5]!==0||
    o[4]!==o[3]||o[4]!==m[2])
    failure('CUDO_CANONICAL_FINANCIAL_CAUSAL_MISMATCH');
  all.set(p.movementId,{...p,channel});
 }
 // Every settled CASH/BANK record must have proof. Unknown/MP movements are
 // never silently booked to cash/bank, even if a provider says "approved".
 for(const [id,r] of movements){
  if(['CASH','BANK_TRANSFER'].includes(r[3])&&r[4]==='CONFIRMED'&&r[5]==='RECONCILED'&&!all.has(id))
   failure('CUDO_CANONICAL_OFFLINE_PROOF_COVERAGE_INCOMPLETE');
 }
 return [...all.values()].sort((a,b)=>a.movementId.localeCompare(b.movementId));
}

export function planCudoBonosInstitutionalCashSync({source,existingBook,recordedAt,operator='sistemas@cudo.cl'}){
 const proofs=verifySource(source);
 if(!dateValid(recordedAt)||operator!=='sistemas@cudo.cl')failure('CUDO_INSTITUTIONAL_WRITER_PRINCIPAL_INVALID');
 const book=normalizeBook(existingBook),mutations=[],skipped=[];
 for(const p of proofs){
  const tx=p.movementId,when=iso(p.verifiedAt),stamp=iso(recordedAt);
  const account=ledgerChannel(p.channel),receiptId='CUDO-REC-'+digest(tx).slice(0,24).toUpperCase();
  const subject='BONO_SOLIDARIO_CUDO',context='CUDO-BONOS-PRODUCTION-001';
  // Source references are digests: no payment credentials or buyer PII in Sheets.
  const sourceTag=p.sourceKind+':sha256:'+p.sourceRefDigest.slice(0,16);
  const planned={
   ledger:[when,1,account,'BONOS',subject,p.amountCLP,context,sourceTag,operator,stamp,tx],
   efd:[tx,'IN',account,p.amountCLP,when,'BONOS',context,'APORTE_CONCILIADO',sourceTag,operator,stamp],
   receipts:[receiptId,'BONO_APORTE_VERIFICADO',tx,when,p.amountCLP,'CLUB',context,'APORTANTE_PROTEGIDO','CUDO',sourceTag,operator,stamp,'VERIFICADO']
  };
  for(const [key,values] of Object.entries(planned)){
   const row=book[key].seen.get(tx);
   if(row){
    const existing=row.slice(0,values.length).map(x=>typeof x==='number'?x:String(x||''));
    const expected=values.map(x=>typeof x==='number'?x:String(x));
    // A replay that differs in audit timestamp is benign; everything else
    // must be identical. Never silently rewrite existing money.
    const omit=key==='ledger'?9:key==='efd'?10:11;
    if(existing.some((v,i)=>i!==omit&&String(v)!==String(expected[i])))
      failure('CUDO_INSTITUTIONAL_TX_CONFLICT_'+key);
    skipped.push({sheet:book[key].spec.name,txId:tx});
   }else{
    mutations.push({sheet:book[key].spec.name,sheetId:book[key].spec.id,txId:tx,
     rowIndex:book[key].nextRowIndex++,values});
   }
  }
 }
 return {contract:'CUDO_BONOS_INSTITUTIONAL_CASH_SYNC_PLAN_V1',targetBookId:SHEET_ID,
  sourceRevision:source.sourceRevision,sourceMovementCount:proofs.length,
  dryRun:true,planned:mutations,skipped,productionMoneyWritten:false};
}
export async function applyCudoBonosInstitutionalCashSync({source,adapter,recordedAt,apply=false}){
 if(!adapter||typeof adapter.withInstitutionalExclusiveLock!=='function'||
    typeof adapter.readBook!=='function'||typeof adapter.batchWriteAndReadback!=='function')
  failure('CUDO_INSTITUTIONAL_SINGLE_WRITER_LOCK_REQUIRED');
 // One cannot settle CASH or BANK from a caller-supplied projection, even
 // when the caller included a plausible sourceRevision and evidence digest.
 // The production adapter must fetch its own source from the original
 // authorization-protected CUDO D1 treasury read model.
 if(typeof adapter.readAuthoritativeCudoFinancialSource!=='function')
  failure('CUDO_INSTITUTIONAL_AUTHENTICATED_D1_SOURCE_NOT_WIRED');
 // A friendly email in the source payload is not an operator authorization.
 // The trusted Sheets adapter must attest its actual Google account before
 // any financial operation (or dry-run with PII/private institutional data).
 if(typeof adapter.authorizedInstitutionalPrincipal!=='function'||
    await adapter.authorizedInstitutionalPrincipal()!=='sistemas@cudo.cl')
  failure('CUDO_INSTITUTIONAL_AUTHENTICATED_PRINCIPAL_REQUIRED');
 const trusted=await adapter.readAuthoritativeCudoFinancialSource();
 if(!sameCudoCanonicalFinancialSource(source,trusted))
  failure('CUDO_INSTITUTIONAL_D1_SOURCE_READBACK_MISMATCH');
 const plan=planCudoBonosInstitutionalCashSync({source:trusted,existingBook:await adapter.readBook(),recordedAt});
 if(!apply)return {...plan,status:'DRY_RUN',writesApplied:0};
 if(!plan.planned.length)return {...plan,status:'NOOP_ALREADY_CURRENT',writesApplied:0};
 return adapter.withInstitutionalExclusiveLock(async()=>{
  // Lock applies to this institution's Sheets writer. Re-fetch D1 under
  // that lock so a new cash count, reversal or reconciliation cannot be
  // silently booked using an earlier caller snapshot.
  const trustedUnderLock=await adapter.readAuthoritativeCudoFinancialSource();
  if(!sameCudoCanonicalFinancialSource(trusted,trustedUnderLock))
   failure('CUDO_INSTITUTIONAL_D1_SOURCE_CHANGED_BEFORE_COMMIT');
  const current=planCudoBonosInstitutionalCashSync({source:trustedUnderLock,existingBook:await adapter.readBook(),recordedAt});
  if(!same(current.planned,plan.planned))failure('CUDO_INSTITUTIONAL_SOURCE_CHANGED_BEFORE_COMMIT');
  const write=await adapter.batchWriteAndReadback({spreadsheetId:SHEET_ID,mutations:current.planned});
  if(write?.verified!==true||write.applied!==current.planned.length)failure('CUDO_INSTITUTIONAL_POST_WRITE_UNVERIFIED');
  const check=planCudoBonosInstitutionalCashSync({source:trustedUnderLock,existingBook:await adapter.readBook(),recordedAt});
  if(check.planned.length!==0)failure('CUDO_INSTITUTIONAL_FINAL_READBACK_INCOMPLETE');
  return {...plan,status:'APPLIED_AND_VERIFIED',writesApplied:plan.planned.length,dryRun:false};
 });
}
