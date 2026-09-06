function provisionAllQASafe(){
  const keys=['QA_NOTICIAS','QA_EQUIPOS','QA_PLANTEL','QA_PARTIDOS','QA_TABLA','QA_GALERIA'];
  const results={},errors=[];
  keys.forEach(key=>{
    try{
      results[key]=key==='QA_PARTIDOS'?provisionPartidosResetSafeQA_():provisionForm_(CUDO_FORMS_CONFIG[key]);
    }catch(err){
      const msg=String(err&&err.message?err.message:err);
      results[key]={ERROR:msg};errors.push(`${key}: ${msg}`);
    }
  });
  if(errors.length)throw new Error(`Provisionamiento QA seguro incompleto (${errors.length}/${keys.length} con error):\n${errors.join('\n')}`);
  return results;
}

/**
 * Returns items that the provisioner must never delete implicitly.
 * FILE_UPLOAD is the first protected type required by CUDO-WEB-FORMS PACK 01.
 * Unknown/non-managed item types are protected as well: destructive rebuild is only
 * permitted when every current non-page item is one of the types created by addQuestion_.
 */
function protectedItems_(form){
  const managed=[
    FormApp.ItemType.TEXT,
    FormApp.ItemType.PARAGRAPH_TEXT,
    FormApp.ItemType.MULTIPLE_CHOICE,
    FormApp.ItemType.CHECKBOX,
    FormApp.ItemType.LIST,
    FormApp.ItemType.DATE,
    FormApp.ItemType.TIME
  ];
  return form.getItems().filter(item=>{
    const type=item.getType();
    if(type===FormApp.ItemType.PAGE_BREAK)return false;
    return managed.indexOf(type)===-1;
  });
}

function assertDestructiveRebuildSafe_(form,context){
  const protectedItems=protectedItems_(form);
  if(!protectedItems.length)return;
  const detail=protectedItems.map(item=>`${item.getType()}: ${String(item.getTitle()||'(sin título)').trim()}`).join(' | ');
  throw new Error(`${context}: reconstrucción destructiva BLOQUEADA; existen ítems protegidos que deben preservarse: ${detail}`);
}

function provisionPartidosResetSafeQA_(){
  const cfg=CUDO_FORMS_CONFIG.QA_PARTIDOS;
  const ss=SpreadsheetApp.openById(cfg.spreadsheetId),spec=ss.getSheetByName(cfg.specSheet),raw=ss.getSheetByName(cfg.rawSheet);
  if(!spec||!raw)throw new Error('Partidos: faltan FORM_SPEC o RAW_FORM_PARTIDOS');
  const formId=String(spec.getRange('I1').getValue()||'').trim();
  if(!formId)throw new Error('Partidos: FORM_ID vacío');
  const form=FormApp.openById(formId);
  const lastRow=Math.max(spec.getLastRow()-1,0);
  const specRows=lastRow?spec.getRange(2,1,lastRow,7).getValues().filter(r=>String(r[0]).trim()!==''):[];
  if(!specRows.length)throw new Error('Partidos: FORM_SPEC vacío');

  // Remove navigation links before deleting/rebuilding page-managed items. Google Forms
  // rejects deleting page-break targets while choices or page breaks still point to them.
  form.getItems(FormApp.ItemType.LIST).forEach(item=>{
    const list=item.asListItem();
    const values=list.getChoices().map(c=>c.getValue());
    if(values.length)list.setChoiceValues(values);
  });
  form.getItems(FormApp.ItemType.PAGE_BREAK).forEach(item=>{
    try{item.asPageBreakItem().setGoToPage(FormApp.PageNavigationType.CONTINUE);}catch(e){}
  });

  const current=form.getItems();
  const nonPages=current.filter(i=>i.getType()!==FormApp.ItemType.PAGE_BREAK);
  let compatible=nonPages.length===specRows.length;
  if(compatible){
    for(let i=0;i<specRows.length;i++){
      if(!itemCompatible_(nonPages[i],specRows[i])||String(nonPages[i].getTitle()).trim()!==String(specRows[i][1]).trim()){compatible=false;break;}
    }
  }
  if(!compatible||current.some(i=>i.getType()===FormApp.ItemType.PAGE_BREAK)){
    // Root safety rule: never mass-delete a form containing FILE_UPLOAD or another
    // non-managed item. This makes a future manual upload question fail-safe instead
    // of being silently destroyed by provisioning.
    assertDestructiveRebuildSafe_(form,'Partidos');
    for(let i=form.getItems().length-1;i>=0;i--)form.deleteItem(i);
    specRows.forEach(row=>addQuestion_(form,row));
  }else{
    nonPages.forEach((item,i)=>updateQuestion_(item,specRows[i]));
  }

  form.setTitle(cfg.title).setDescription(cfg.description).setConfirmationMessage(cfg.confirmation).setAllowResponseEdits(false).setShowLinkToRespondAgain(true).setAcceptingResponses(true);
  const responseSheet=String(spec.getRange('I5').getValue()||'').trim();
  if(!responseSheet||!ss.getSheetByName(responseSheet))throw new Error(`Partidos: pestaña de respuestas inválida: ${responseSheet}`);
  const rawColumnCount=raw.getRange(1,1,1,raw.getLastColumn()).getValues()[0].filter(v=>String(v).trim()!=='').length;
  linkRaw_(raw,responseSheet,rawColumnCount);
  validateProvision_(cfg,ss,raw,form,responseSheet,rawColumnCount,specRows);
  return writeMetadata_(spec,form,responseSheet);
}
