// CUDO BONOS: the SAME private CudoWorkStateWeb Apps Script project.
// Do not install another project, ledger, account or scheduled poller.
// Only this host can establish its own effective Session identity and prove
// ScriptLockService works. No payment, settlement, buyer or sheet write.
var CUDO_BONOS_CASH_LEDGER_ID_='1f0TYrlHOMef6dx08o6LxJb4va4nEL0CNBt8dTsdcNbo';
var CUDO_BONOS_CASH_OPERATOR_='sistemas@cudo.cl';
var CUDO_BONOS_CASH_TABS_=[
 {name:'CUDO_LEDGER_V1',header:['FECHA','FLUJO','CUENTA','DOMINIO','ITEM','MONTO','PROYECTO','DESCRIPCION','REGISTRADO_POR','TIMESTAMP_REG','TX_ID']},
 {name:'EFD_LOG_V1',header:['TX_ID','LADO','ACTOR','MONTO','FECHA','AREA','CONTEXTO','ETIQUETA','DESCRIPCION','USUARIO','TIMESTAMP_REG']},
 {name:'CUDO_COMPROBANTES_V1',header:['ID_COMPROBANTE','TIPO_COMPROBANTE','TX_ID','FECHA_COMPROBANTE','MONTO','AREA','CONTEXTO','ACTOR_ORIGEN','ACTOR_DESTINO','CONCEPTO','USUARIO_EMISOR','TIMESTAMP_EMISION','ESTADO']}
];
function cudoBonosCajaReadiness_(){
 var active=String(Session.getActiveUser().getEmail()||'').toLowerCase();
 var effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
 // An active-user label is insufficient: the account executing writes must
 // itself be CUDO's institutionally selected operator.
 if(effective!==CUDO_BONOS_CASH_OPERATOR_||(active&&active!==CUDO_BONOS_CASH_OPERATOR_)){
  return {contract:'CUDO_BONOS_CASH_EXISTING_SCRIPT_PREFLIGHT_V1',
   identityVerified:false,scriptLockVerified:false,headersVerified:false,
   financialWriterEnabled:false,reason:'AUTHENTICATED_EFFECTIVE_CUDO_OPERATOR_REQUIRED'};
 }
 var lock=LockService.getScriptLock();
 if(!lock||!lock.tryLock(2000)){
  return {contract:'CUDO_BONOS_CASH_EXISTING_SCRIPT_PREFLIGHT_V1',
   identityVerified:true,scriptLockVerified:false,headersVerified:false,
   financialWriterEnabled:false,reason:'EXISTING_SCRIPT_LOCK_UNAVAILABLE'};
 }
 try {
  var book=SpreadsheetApp.openById(CUDO_BONOS_CASH_LEDGER_ID_);
  for(var i=0;i<CUDO_BONOS_CASH_TABS_.length;i++){
   var def=CUDO_BONOS_CASH_TABS_[i];
   var sh=book.getSheetByName(def.name);
   if(!sh)throw Error('CUDO_CASH_EXISTING_TAB_MISSING_'+def.name);
   var header=sh.getRange(1,1,1,def.header.length).getDisplayValues()[0];
   if(JSON.stringify(header)!==JSON.stringify(def.header)){
    throw Error('CUDO_CASH_EXISTING_HEADER_CHANGED_'+def.name);
   }
  }
  return {contract:'CUDO_BONOS_CASH_EXISTING_SCRIPT_PREFLIGHT_V1',
   identityVerified:true,scriptLockVerified:true,headersVerified:true,
   financialWriterEnabled:false,reason:'PROOF_SOURCE_AND_MONEY_WRITE_GATES_REMAIN_CLOSED',
   bookId:CUDO_BONOS_CASH_LEDGER_ID_,tabCount:3};
 }finally{
  lock.releaseLock();
 }
}
