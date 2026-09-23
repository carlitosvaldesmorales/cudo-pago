import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('qa-v8-google/apps-script/CudoMobileAdoptionWeb.gs','utf8');
const workflow=fs.readFileSync('.github/workflows/cudo-mobile-adoption-event.yml','utf8');
const fail=message=>{throw new Error('MOBILE ADOPTION EVENT BRIDGE: '+message)};

for(const forbidden of ['schedule:','cron:']){
  if(workflow.includes(forbidden)) fail('polling primitive found: '+forbidden);
}
for(const forbidden of ['Session.getActiveUser','Session.getEffectiveUser','userAgent','device_id','deviceId','email']){
  if(source.includes(forbidden)||workflow.includes(forbidden)) fail('PII/identity token found: '+forbidden);
}

function runCase({enabled,token=true}){
  const rows=[];
  const fetches=[];
  const props={
    CUDO_MOBILE_ADOPTION_EVENT_BRIDGE_ENABLED:enabled?'true':'false',
    CUDO_GITHUB_ACTIONS_TOKEN:token?'fixture-token':''
  };
  const context={
    JSON,Date,RegExp,String,Array,Object,Error,
    ContentService:{MimeType:{JSON:'JSON'},createTextOutput:value=>({value,setMimeType(){return this;}})},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>({appendRow(row){rows.push(row);},getLastRow(){return rows.length+1;}})})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    Utilities:{formatDate:()=>"2026-09-23T23:00:00.000Z"},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]||null})},
    UrlFetchApp:{fetch:(url,options)=>{
      if(rows.length!==1) fail('dispatch happened before canonical append');
      fetches.push({url,options});
      return {getResponseCode:()=>204,getContentText:()=>''};
    }}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const event={postData:{contents:JSON.stringify({
    schema_version:'CUDO_MOBILE_ADOPTION_EVENT_V1',
    event_type:'mobile.production.adoption.observed',
    app_version:'2.0',
    route:'/preview-v8/',
    display_mode:'standalone',
    trigger:'pointerdown'
  })}};
  let error=null;
  let response=null;
  try{response=context.doPost(event);}catch(err){error=String(err&&err.message||err);}
  return {rows,fetches,error,response};
}

const dormant=runCase({enabled:false});
if(dormant.error) fail('dormant case threw '+dormant.error);
if(dormant.rows.length!==1) fail('dormant case did not persist one canonical row');
if(dormant.fetches.length!==0) fail('dormant case dispatched unexpectedly');

const enabled=runCase({enabled:true});
if(enabled.error) fail('enabled case threw '+enabled.error);
if(enabled.rows.length!==1||enabled.fetches.length!==1) fail('enabled case did not append then dispatch exactly once');
const call=enabled.fetches[0];
if(call.url!=='https://api.github.com/repos/carlitosvaldesmorales/cudo-pago/actions/workflows/cudo-mobile-adoption-event.yml/dispatches') fail('dispatch URL drifted');
const body=JSON.parse(call.options.payload);
if(body.ref!=='main') fail('dispatch ref is not main');
const i=body.inputs||{};
if(i.source!=='apps_script_mobile_adoption_post') fail('source mismatch');
if(i.event_type!=='mobile.production.adoption.observed') fail('event type mismatch');
if(i.display_mode!=='standalone'||i.trigger!=='pointerdown') fail('real interaction contract mismatch');
if(i.source_system!=='CUDO_PWA'||i.privacy_class!=='ANONYMOUS_PRIVACY_MINIMAL') fail('source/privacy mismatch');
if(i.sheet_row!=='2') fail('canonical row identity mismatch');

const missingToken=runCase({enabled:true,token:false});
if(missingToken.rows.length!==1) fail('missing-token case lost canonical evidence');
if(!missingToken.error?.includes('falta CUDO_GITHUB_ACTIONS_TOKEN')) fail('missing-token case did not fail closed');

console.log(JSON.stringify({
  ok:true,
  classification:'PASS_DORMANT_EVENT_DRIVEN_ADOPTION_BRIDGE',
  dormant_dispatches:dormant.fetches.length,
  enabled_dispatches:enabled.fetches.length,
  persist_before_dispatch:true,
  polling:false,
  synthetic_production_event:false
},null,2));
