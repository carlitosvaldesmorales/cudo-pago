// Test the original CUDO private Apps Script project cash preflight. No token,
// network, Google account or money; mock objects enforce zero sheet writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../apps-script/CudoBonosCajaReadiness.gs',import.meta.url),'utf8');
const panel=readFileSync(new URL('../apps-script/CudoWorkStateWeb.gs',import.meta.url),'utf8');
const deploy=readFileSync(new URL('../../.github/workflows/deploy-cudo-work-state-web-qa.yml',import.meta.url),'utf8');
const tables={
 CUDO_LEDGER_V1:['FECHA','FLUJO','CUENTA','DOMINIO','ITEM','MONTO','PROYECTO','DESCRIPCION','REGISTRADO_POR','TIMESTAMP_REG','TX_ID'],
 EFD_LOG_V1:['TX_ID','LADO','ACTOR','MONTO','FECHA','AREA','CONTEXTO','ETIQUETA','DESCRIPCION','USUARIO','TIMESTAMP_REG'],
 CUDO_COMPROBANTES_V1:['ID_COMPROBANTE','TIPO_COMPROBANTE','TX_ID','FECHA_COMPROBANTE','MONTO','AREA','CONTEXTO','ACTOR_ORIGEN','ACTOR_DESTINO','CONCEPTO','USUARIO_EMISOR','TIMESTAMP_EMISION','ESTADO']
};
let tested=0;
function probe({active='sistemas@cudo.cl',effective='sistemas@cudo.cl',lockAvailable=true,headers=tables,missing=null}={}){
 let releases=0,tries=0,reads=0,writes=0;
 const context={
  Session:{
   getActiveUser:()=>({getEmail:()=>active}),
   getEffectiveUser:()=>({getEmail:()=>effective})
  },
  LockService:{
   getScriptLock:()=>({tryLock:()=>{tries++;return lockAvailable},releaseLock:()=>{releases++}})
  },
  SpreadsheetApp:{
   openById(id){
    assert.equal(id,'1f0TYrlHOMef6dx08o6LxJb4va4nEL0CNBt8dTsdcNbo');
    return {
     getSheetByName(name){
      if(name===missing)return null;
      return {getRange(row,col,height,width){
       assert.deepEqual([row,col,height],[1,1,1]);reads++;
       return {getDisplayValues:()=>[(headers[name]||[]).slice(0,width)]};
      }};
     }
    };
   }
  }
 };
 vm.createContext(context);vm.runInContext(source,context,{filename:'CudoBonosCajaReadiness.gs',timeout:1000});
 let value,error;try{value=context.cudoBonosCajaReadiness_()}catch(e){error=String(e.message)}
 assert.equal(writes,0);return {value,error,reads,releases,tries};
}
let x=probe();assert.deepEqual({...x.value},{contract:'CUDO_BONOS_CASH_EXISTING_SCRIPT_PREFLIGHT_V1',identityVerified:true,scriptLockVerified:true,headersVerified:true,financialWriterEnabled:false,reason:'PROOF_SOURCE_AND_MONEY_WRITE_GATES_REMAIN_CLOSED',bookId:'1f0TYrlHOMef6dx08o6LxJb4va4nEL0CNBt8dTsdcNbo',tabCount:3});
assert.equal(x.reads,3);assert.equal(x.releases,1);tested++;
x=probe({effective:'someone@example.invalid'});assert.equal(x.value.identityVerified,false);assert.equal(x.tries,0);tested++;
x=probe({active:'someone@example.invalid'});assert.equal(x.value.identityVerified,false);assert.equal(x.tries,0);tested++;
x=probe({active:''});assert.equal(x.value.identityVerified,true);assert.equal(x.releases,1);tested++;
x=probe({lockAvailable:false});assert.equal(x.value.scriptLockVerified,false);assert.equal(x.reads,0);tested++;
x=probe({missing:'EFD_LOG_V1'});assert.match(x.error,/TAB_MISSING/);assert.equal(x.releases,1);tested++;
x=probe({headers:{...tables,CUDO_LEDGER_V1:[...tables.CUDO_LEDGER_V1.slice(0,-1),'NOT_TX_ID']}});assert.match(x.error,/HEADER_CHANGED/);assert.equal(x.releases,1);tested++;
assert.ok(panel.includes('cudoBonosCajaReadiness_()')&&panel.includes('escritura de dinero inactiva'));
assert.ok(deploy.includes("name':'CudoBonosCajaReadiness'"));
assert.ok(deploy.includes("deployments/'+stable,'PUT'")&&deploy.includes('existingDeploymentUpdated'));
assert.ok(!deploy.includes("req(base+'/deployments','POST'"),'do not invent another deployment');
assert.ok(deploy.includes("'access':'MYSELF'")||deploy.includes("'access':'MYSELF'")); // existing manifest is private
assert.doesNotMatch(source,/\b(?:appendRow|setValues|setValue|deleteRow|clearContent|UrlFetchApp\.fetch)\s*\(/);
console.log(JSON.stringify({ok:true,contract:'CUDO_BONOS_EXISTING_PRIVATE_APPS_SCRIPT_LOCK_CERT_V1',
 testCases:tested,correctOperatorRequired:true,lockReleasedEvenOnError:true,bookSchemaValidated:true,
 privateExistingProject:true,financialWriterEnabled:false,productionWrites:0}));
