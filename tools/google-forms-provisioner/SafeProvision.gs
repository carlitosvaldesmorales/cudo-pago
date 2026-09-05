function provisionAllQASafe(){
  const keys=['QA_NOTICIAS','QA_EQUIPOS','QA_PLANTEL','QA_PARTIDOS','QA_TABLA','QA_GALERIA'];
  const results={},errors=[];
  keys.forEach(key=>{
    try{
      results[key]=key==='QA_PARTIDOS'?provisionPartidosBranchedSafeQA_():provisionForm_(CUDO_FORMS_CONFIG[key]);
    }catch(err){
      const msg=String(err&&err.message?err.message:err);
      results[key]={ERROR:msg};errors.push(`${key}: ${msg}`);
    }
  });
  if(errors.length)throw new Error(`Provisionamiento QA seguro incompleto (${errors.length}/${keys.length} con error):\n${errors.join('\n')}`);
  return results;
}

function provisionPartidosBranchedSafeQA_(){
  const cfg=CUDO_FORMS_CONFIG.QA_PARTIDOS;
  const ss=SpreadsheetApp.openById(cfg.spreadsheetId);
  const spec=ss.getSheetByName(cfg.specSheet),raw=ss.getSheetByName(cfg.rawSheet);
  if(!spec||!raw)throw new Error('Partidos: faltan FORM_SPEC o RAW_FORM_PARTIDOS');
  const formId=String(spec.getRange('I1').getValue()||'').trim();
  if(!formId)throw new Error('Partidos: FORM_ID vacío');
  const form=FormApp.openById(formId);
  form.setTitle(cfg.title).setDescription(cfg.description).setConfirmationMessage(cfg.confirmation).setAllowResponseEdits(false).setShowLinkToRespondAgain(true).setAcceptingResponses(true);
  const lastRow=Math.max(spec.getLastRow()-1,0);
  const specRows=lastRow?spec.getRange(2,1,lastRow,7).getValues().filter(r=>String(r[0]).trim()!==''):[];
  const managed=form.getItems().filter(i=>i.getType()!==FormApp.ItemType.PAGE_BREAK);
  if(managed.length!==specRows.length)throw new Error(`Partidos: preguntas gestionadas=${managed.length}; esperadas=${specRows.length}`);
  const errors=[];
  managed.forEach((item,i)=>{
    if(!itemCompatible_(item,specRows[i]))errors.push(`tipo incompatible ${i+1}: ${item.getType()}`);
    if(String(item.getTitle()).trim()!==String(specRows[i][1]).trim())errors.push(`título distinto ${i+1}: ${item.getTitle()}`);
  });
  if(errors.length)throw new Error(`Partidos: ${errors.join(' | ')}`);
  const responseSheet=String(spec.getRange('I5').getValue()||'').trim();
  if(!responseSheet||!ss.getSheetByName(responseSheet))throw new Error(`Partidos: pestaña de respuestas inválida: ${responseSheet}`);
  const rawColumnCount=raw.getRange(1,1,1,raw.getLastColumn()).getValues()[0].filter(v=>String(v).trim()!=='').length;
  linkRaw_(raw,responseSheet,rawColumnCount);
  if(form.getDestinationId()!==cfg.spreadsheetId)throw new Error('Partidos: destino de respuestas incorrecto');
  return writeMetadata_(spec,form,responseSheet);
}
