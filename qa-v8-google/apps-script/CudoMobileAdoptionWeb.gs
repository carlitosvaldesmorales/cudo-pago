const CUDO_MOBILE_ADOPTION_SHEET_ID_='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const CUDO_MOBILE_ADOPTION_SHEET_='MOBILE_ADOPTION_EVENTS';
const CUDO_MOBILE_ADOPTION_SCHEMA_='CUDO_MOBILE_ADOPTION_EVENT_V1';
const CUDO_MOBILE_ADOPTION_TYPE_='mobile.production.adoption.observed';
const CUDO_MOBILE_ADOPTION_BRIDGE_=Object.freeze({
  enabledProperty:'CUDO_MOBILE_ADOPTION_EVENT_BRIDGE_ENABLED',
  tokenProperty:'CUDO_GITHUB_ACTIONS_TOKEN',
  dispatchUrl:'https://api.github.com/repos/carlitosvaldesmorales/cudo-pago/actions/workflows/cudo-mobile-adoption-event.yml/dispatches',
  ref:'main',
  source:'apps_script_mobile_adoption_post'
});

function cudoMobileAdoptionJson_(payload){
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function cudoMobileAdoptionText_(value,maxLen){
  let text=String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  if(text.length>(maxLen||200)) text=text.slice(0,maxLen||200);
  if(/^[=+\-@]/.test(text)) text="'"+text;
  return text;
}

function cudoMobileAdoptionParse_(raw){
  if(!raw) throw new Error('CUDO Mobile Adoption: payload vacío');
  const payload=JSON.parse(raw);
  const allowed=['schema_version','event_type','app_version','route','display_mode','trigger'];
  const unexpected=Object.keys(payload||{}).filter(function(key){return allowed.indexOf(key)===-1;});
  if(unexpected.length) throw new Error('CUDO Mobile Adoption: campos no autorizados');
  if(payload.schema_version!==CUDO_MOBILE_ADOPTION_SCHEMA_) throw new Error('CUDO Mobile Adoption: schema inválido');
  if(payload.event_type!==CUDO_MOBILE_ADOPTION_TYPE_) throw new Error('CUDO Mobile Adoption: evento inválido');
  if(payload.display_mode!=='standalone') throw new Error('CUDO Mobile Adoption: display_mode inválido');
  if(['pointerdown','keydown'].indexOf(payload.trigger)===-1) throw new Error('CUDO Mobile Adoption: trigger inválido');

  const route=cudoMobileAdoptionText_(payload.route,180);
  if(!/^\/preview-v8\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*)?$/.test(route)){
    throw new Error('CUDO Mobile Adoption: ruta fuera de alcance');
  }
  const appVersion=cudoMobileAdoptionText_(payload.app_version,32);
  if(!/^[A-Za-z0-9._-]{1,32}$/.test(appVersion)) throw new Error('CUDO Mobile Adoption: versión inválida');

  return {
    schemaVersion:CUDO_MOBILE_ADOPTION_SCHEMA_,
    eventType:CUDO_MOBILE_ADOPTION_TYPE_,
    appVersion:appVersion,
    route:route,
    displayMode:'standalone',
    trigger:payload.trigger
  };
}

function cudoMobileAdoptionBridgeEnabled_(){
  const value=PropertiesService.getScriptProperties().getProperty(CUDO_MOBILE_ADOPTION_BRIDGE_.enabledProperty);
  return String(value||'').toLowerCase()==='true';
}

function cudoMobileAdoptionDispatch_(record,observedAt,rowNumber){
  if(!cudoMobileAdoptionBridgeEnabled_()){
    return {ok:true,dispatched:false,reason:'DISABLED'};
  }
  const token=PropertiesService.getScriptProperties().getProperty(CUDO_MOBILE_ADOPTION_BRIDGE_.tokenProperty);
  if(!token) throw new Error('CUDO Mobile Adoption bridge: falta CUDO_GITHUB_ACTIONS_TOKEN');

  const response=UrlFetchApp.fetch(CUDO_MOBILE_ADOPTION_BRIDGE_.dispatchUrl,{
    method:'post',
    contentType:'application/json',
    headers:{
      Accept:'application/vnd.github+json',
      Authorization:'Bearer '+token,
      'X-GitHub-Api-Version':'2022-11-28'
    },
    payload:JSON.stringify({
      ref:CUDO_MOBILE_ADOPTION_BRIDGE_.ref,
      inputs:{
        source:CUDO_MOBILE_ADOPTION_BRIDGE_.source,
        observed_at:observedAt,
        event_type:record.eventType,
        app_version:record.appVersion,
        route:record.route,
        display_mode:record.displayMode,
        trigger:record.trigger,
        source_system:'CUDO_PWA',
        privacy_class:'ANONYMOUS_PRIVACY_MINIMAL',
        sheet_row:String(rowNumber)
      }
    }),
    muteHttpExceptions:true
  });
  const code=response.getResponseCode();
  if(code!==200&&code!==204){
    throw new Error('CUDO Mobile Adoption bridge: GitHub dispatch HTTP '+code+' '+response.getContentText().slice(0,200));
  }
  return {ok:true,dispatched:true,github_status:code};
}

function doPost(e){
  const record=cudoMobileAdoptionParse_(String(e&&e.postData&&e.postData.contents||''));
  const book=SpreadsheetApp.openById(CUDO_MOBILE_ADOPTION_SHEET_ID_);
  const sheet=book.getSheetByName(CUDO_MOBILE_ADOPTION_SHEET_);
  if(!sheet) throw new Error('CUDO Mobile Adoption: MOBILE_ADOPTION_EVENTS no existe');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000)) throw new Error('CUDO Mobile Adoption: recurso ocupado');
  try{
    const observedAt=Utilities.formatDate(new Date(),'UTC',"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    sheet.appendRow([
      observedAt,
      record.eventType,
      record.appVersion,
      record.route,
      record.displayMode,
      record.trigger,
      'CUDO_PWA',
      'ANONYMOUS_PRIVACY_MINIMAL'
    ]);
    const rowNumber=sheet.getLastRow();
    const bridge=cudoMobileAdoptionDispatch_(record,observedAt,rowNumber);
    return cudoMobileAdoptionJson_({
      ok:true,
      schema_version:record.schemaVersion,
      event_type:record.eventType,
      observed_at:observedAt,
      privacy:'ANONYMOUS_PRIVACY_MINIMAL',
      bridge_dispatched:bridge.dispatched===true
    });
  } finally {
    lock.releaseLock();
  }
}
