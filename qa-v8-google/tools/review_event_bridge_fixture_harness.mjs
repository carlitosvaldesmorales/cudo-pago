import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../apps-script/CudoReviewEventBridge.gs',import.meta.url),'utf8');
const EXPECTED_REF='main';

function loadBridge({token='token-qa',responseCode=204,responseBody='',spreadsheetId='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms',existingTriggers=[]}={}){
  const fetchCalls=[];
  const deleted=[];
  let created=0;
  const triggerObjects=existingTriggers.map(handler=>({getHandlerFunction:()=>handler,getUniqueId:()=>`old-${handler}`}));
  const context={
    console,
    JSON,
    Object,
    Boolean,
    Error,
    String,
    PropertiesService:{
      getScriptProperties:()=>({getProperty:key=>key==='CUDO_GITHUB_ACTIONS_TOKEN'?token:null})
    },
    UrlFetchApp:{
      fetch:(url,options)=>{
        fetchCalls.push({url,options});
        return {getResponseCode:()=>responseCode,getContentText:()=>responseBody};
      }
    },
    ScriptApp:{
      getProjectTriggers:()=>triggerObjects,
      deleteTrigger:t=>deleted.push(t.getHandlerFunction()),
      newTrigger:handler=>({
        forSpreadsheet:id=>({
          onFormSubmit:()=>({
            create:()=>{created++;return {getUniqueId:()=>`new-${handler}-${id}`};}
          })
        })
      })
    }
  };
  vm.createContext(context);
  vm.runInContext(source+`\nglobalThis.__bridgeExports={cudoReviewOnFormSubmit,cudoReviewEventBridgePing,installCudoReviewEventBridge,cudoReviewEventBridgeStatus};`,context);
  const event={range:{getSheet:()=>({getParent:()=>({getId:()=>spreadsheetId})})}};
  return {api:context.__bridgeExports,event,fetchCalls,deleted,getCreated:()=>created};
}

function assertDispatch(fetchCalls,expectedSource){
  assert.equal(fetchCalls.length,1);
  assert.equal(fetchCalls[0].url,'https://api.github.com/repos/carlitosvaldesmorales/cudo-pago/actions/workflows/cudo-review-engine.yml/dispatches');
  assert.equal(fetchCalls[0].options.method,'post');
  assert.equal(fetchCalls[0].options.headers.Authorization,'Bearer token-qa');
  assert.deepEqual(JSON.parse(fetchCalls[0].options.payload),{
    ref:EXPECTED_REF,
    inputs:{apply_changes:'true',source:expectedSource}
  });
}

{
  const {api,event,fetchCalls}=loadBridge();
  const result=api.cudoReviewOnFormSubmit(event);
  assert.equal(result.ok,true);
  assert.equal(result.ignored,false);
  assert.equal(result.source,'apps_script_form_submit');
  assert.equal(result.ref,EXPECTED_REF);
  assertDispatch(fetchCalls,'apps_script_form_submit');
}

{
  const {api,fetchCalls}=loadBridge();
  const result=api.cudoReviewEventBridgePing();
  assert.equal(result.ok,true);
  assert.equal(result.github_status,204);
  assert.equal(result.source,'agent_ping');
  assert.equal(result.ref,EXPECTED_REF);
  assertDispatch(fetchCalls,'agent_ping');
}

{
  const {api,event,fetchCalls}=loadBridge({spreadsheetId:'OTHER'});
  const result=api.cudoReviewOnFormSubmit(event);
  assert.equal(result.ignored,true);
  assert.equal(fetchCalls.length,0);
}

{
  const {api,event}=loadBridge({token:''});
  assert.throws(()=>api.cudoReviewOnFormSubmit(event),/falta Script Property/);
  assert.throws(()=>api.cudoReviewEventBridgePing(),/falta Script Property/);
}

{
  const {api,event}=loadBridge({responseCode:403,responseBody:'forbidden'});
  assert.throws(()=>api.cudoReviewOnFormSubmit(event),/GitHub dispatch HTTP 403/);
  assert.throws(()=>api.cudoReviewEventBridgePing(),/GitHub dispatch HTTP 403/);
}

{
  const {api,deleted,getCreated}=loadBridge({existingTriggers:['cudoReviewOnFormSubmit','otherHandler']});
  const result=api.installCudoReviewEventBridge();
  assert.equal(result.ok,true);
  assert.deepEqual(deleted,['cudoReviewOnFormSubmit']);
  assert.equal(getCreated(),1);
}

{
  const {api}=loadBridge({token:'configured',existingTriggers:['cudoReviewOnFormSubmit']});
  const status=api.cudoReviewEventBridgeStatus();
  assert.equal(status.token_configured,true);
  assert.equal(status.trigger_count,1);
  assert.equal(status.dispatch_ref,EXPECTED_REF);
}

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_APPS_SCRIPT_EVENT_BRIDGE',
  source:'qa-v8-google/apps-script/CudoReviewEventBridge.gs',
  dispatch_ref:EXPECTED_REF,
  dispatch_sources:{form:'apps_script_form_submit',ping:'agent_ping'},
  cases:[
    'form-submit-dispatches-official-workflow-with-source-tag-to-main-ref',
    'manual-agent-ping-dispatches-official-workflow-with-distinct-source-tag-to-main-ref',
    'other-spreadsheet-ignored',
    'missing-token-blocked',
    'github-error-blocked',
    'trigger-install-idempotent',
    'status-does-not-expose-token'
  ]
},null,2));
