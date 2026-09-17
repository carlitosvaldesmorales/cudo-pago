const CUDO_PERSONA_INTAKE_SHEET_ID_='1X4fefDQaaktoTGjzU77SXFrYj4n9JuaUm45Tnldiu0Y';
const CUDO_PERSONA_INTAKE_SHEET_='PERSONAS_CONTROL';
const CUDO_PERSONA_TALLY_FORM_ID_='9qeq5p';
const CUDO_PERSONA_NOTIFY_='sistemas@cudo.cl';
const CUDO_PERSONA_ADMIN_URL_='https://cudo.cl/preview-v8/admin/';
const CUDO_PERSONA_INTAKE_KEY_SHA256_='__CUDO_PERSONA_INTAKE_KEY_SHA256__';

function cudoPersonaIntakeDigestHex_(value){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value||''),Utilities.Charset.UTF_8);
  return bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}

function cudoPersonaIntakeJson_(payload){
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function cudoPersonaIntakeSafeText_(value,maxLen){
  let text=String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  if(text.length>(maxLen||500)) text=text.slice(0,maxLen||500);
  if(/^[=+\-@]/.test(text)) text="'"+text;
  return text;
}

function cudoPersonaIntakeField_(fields,label){
  return (fields||[]).find(f=>String(f&&f.label||'').trim()===label)||null;
}

function cudoPersonaIntakeChoiceText_(field){
  if(!field) return '';
  const value=field.value;
  if(!Array.isArray(value)) return cudoPersonaIntakeSafeText_(value,200);
  const options=Array.isArray(field.options)?field.options:[];
  const byId={}; options.forEach(o=>{byId[String(o.id)]=String(o.text||'')});
  return value.map(v=>byId[String(v)]||String(v||'')).filter(Boolean).join(' | ');
}

function cudoPersonaIntakeFile_(field){
  const files=field&&Array.isArray(field.value)?field.value:[];
  if(!files.length||typeof files[0]!=='object') return {id:'',name:''};
  return {
    id:cudoPersonaIntakeSafeText_(files[0].id,120),
    name:cudoPersonaIntakeSafeText_(files[0].name,240),
  };
}

function cudoPersonaIntakeParse_(payload){
  if(!payload||payload.eventType!=='FORM_RESPONSE') throw new Error('Evento Tally no soportado');
  const data=payload.data||{};
  if(String(data.formId||'')!==CUDO_PERSONA_TALLY_FORM_ID_) throw new Error('Formulario Tally no autorizado');
  const submissionId=cudoPersonaIntakeSafeText_(data.submissionId||data.responseId,80);
  if(!/^[A-Za-z0-9_-]{3,80}$/.test(submissionId)) throw new Error('submissionId inválido');
  const fields=Array.isArray(data.fields)?data.fields:[];
  const relation=cudoPersonaIntakeChoiceText_(cudoPersonaIntakeField_(fields,'¿Cómo participas en el CUDO?'));
  const name=cudoPersonaIntakeSafeText_((cudoPersonaIntakeField_(fields,'¿Cómo quieres que aparezca tu nombre?')||{}).value,160);
  const series=cudoPersonaIntakeChoiceText_(cudoPersonaIntakeField_(fields,'Serie o categoría'));
  const position=cudoPersonaIntakeChoiceText_(cudoPersonaIntakeField_(fields,'Posición principal'));
  const number=cudoPersonaIntakeSafeText_((cudoPersonaIntakeField_(fields,'Número de camiseta')||{}).value,20);
  const clubFunction=cudoPersonaIntakeSafeText_((cudoPersonaIntakeField_(fields,'¿Qué función o participación tienes en el club?')||{}).value,180);
  const photo=cudoPersonaIntakeFile_(cudoPersonaIntakeField_(fields,'Tu foto'));
  const social=cudoPersonaIntakeSafeText_((cudoPersonaIntakeField_(fields,'Instagram o Facebook')||{}).value,300);
  const presentation=cudoPersonaIntakeSafeText_((cudoPersonaIntakeField_(fields,'Cuéntanos algo breve sobre ti')||{}).value,1500);
  const photoAuth=cudoPersonaIntakeChoiceText_(cudoPersonaIntakeField_(fields,'Autorización de fotografía'))?'SI':'';
  const reviewAuth=cudoPersonaIntakeChoiceText_(cudoPersonaIntakeField_(fields,'Antes de enviar'))?'SI':'';
  if(!relation||!name) throw new Error('Ficha sin identidad mínima');
  if(reviewAuth!=='SI') throw new Error('Falta autorización de revisión');
  if(photo.id&&photoAuth!=='SI') throw new Error('Foto sin autorización');
  if(relation==='Jugador/a'&&(!series||!position)) throw new Error('Ficha jugador incompleta');
  if(relation!=='Jugador/a'&&!clubFunction) throw new Error('Ficha no jugador incompleta');
  return {
    idPersona:'CUDO-PER-'+submissionId,
    submissionId,
    submittedAt:cudoPersonaIntakeSafeText_(data.createdAt||payload.createdAt,80),
    relation,name,series,position,number,clubFunction,
    photoId:photo.id,photoName:photo.name,social,presentation,
    photoAuth,reviewAuth,
  };
}

function cudoPersonaIntakeFindRow_(sheet,submissionId){
  const last=sheet.getLastRow();
  if(last<2) return 0;
  const values=sheet.getRange(2,2,last-1,1).getDisplayValues();
  for(let i=0;i<values.length;i++) if(String(values[i][0]||'').trim()===submissionId) return i+2;
  return 0;
}

function cudoPersonaIntakeState_(sheet,row){
  SpreadsheetApp.flush();
  return {
    estado:String(sheet.getRange(row,16).getDisplayValue()||''),
    publicar:String(sheet.getRange(row,21).getDisplayValue()||''),
    privacidad:String(sheet.getRange(row,22).getDisplayValue()||''),
  };
}

function cudoPersonaIntakeAssertGovernance_(state){
  if(state.estado!=='PENDIENTE_REVISION'||state.publicar!=='NO'||state.privacidad!=='INTERNO'){
    throw new Error('Gobierno PERSONA no resolvió PENDIENTE_REVISION/NO/INTERNO');
  }
}

function cudoPersonaIntakeNotify_(record,isCertification){
  if(isCertification) return {sent:false,reason:'CERTIFICATION'};
  const props=PropertiesService.getScriptProperties();
  const prop='CUDO_PERSONA_NOTIFIED_'+record.submissionId;
  if(props.getProperty(prop)==='1') return {sent:false,reason:'ALREADY_NOTIFIED'};
  MailApp.sendEmail({
    to:CUDO_PERSONA_NOTIFY_,
    subject:'CUDO · Nueva ficha pendiente · '+record.name,
    body:'CUDO recibió y guardó una nueva ficha de '+record.name+' ('+record.relation+').\n\nRevisar solicitudes: '+CUDO_PERSONA_ADMIN_URL_,
    htmlBody:'<p><b>CUDO recibió y guardó una nueva ficha.</b></p><p>'+record.name+' · '+record.relation+'</p><p><a href="'+CUDO_PERSONA_ADMIN_URL_+'">Revisar solicitudes de fichas</a></p><p>Este aviso se genera después de la persistencia durable en CUDO.</p>',
    name:'CUDO',
  });
  props.setProperty(prop,'1');
  return {sent:true};
}

function doPost(e){
  const supplied=String(e&&e.parameter&&e.parameter.key||'');
  if(!supplied||cudoPersonaIntakeDigestHex_(supplied)!==CUDO_PERSONA_INTAKE_KEY_SHA256_){
    throw new Error('CUDO Persona Intake: acceso no autorizado');
  }
  const raw=String(e&&e.postData&&e.postData.contents||'');
  if(!raw) throw new Error('CUDO Persona Intake: payload vacío');
  const payload=JSON.parse(raw);
  const record=cudoPersonaIntakeParse_(payload);
  const cert=String(e.parameter.cert||'')==='1';
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(7000)) throw new Error('CUDO Persona Intake: recurso ocupado');
  try{
    const sheet=SpreadsheetApp.openById(CUDO_PERSONA_INTAKE_SHEET_ID_).getSheetByName(CUDO_PERSONA_INTAKE_SHEET_);
    if(!sheet) throw new Error('PERSONAS_CONTROL no existe');
    let row=cudoPersonaIntakeFindRow_(sheet,record.submissionId);
    let inserted=false;
    if(!row){
      row=Math.max(2,sheet.getLastRow()+1);
      sheet.getRange(row,1,1,15).setValues([[
        record.idPersona,record.submissionId,record.submittedAt,record.relation,record.name,
        record.series,record.position,record.number,record.clubFunction,record.photoId,record.photoName,
        record.social,record.presentation,record.photoAuth,record.reviewAuth,
      ]]);
      sheet.getRange(row,23).setValue('PERSONA_CUDO');
      inserted=true;
    }
    const state=cudoPersonaIntakeState_(sheet,row);
    cudoPersonaIntakeAssertGovernance_(state);
    const notification=cudoPersonaIntakeNotify_(record,cert);
    return cudoPersonaIntakeJson_({ok:true,inserted,duplicate:!inserted,idPersona:record.idPersona,submissionId:record.submissionId,row,state,notification});
  } finally {
    lock.releaseLock();
  }
}
