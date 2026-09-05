function auditHumanFormsQA(){
  const keys=['QA_NOTICIAS','QA_EQUIPOS','QA_PLANTEL','QA_PARTIDOS','QA_TABLA','QA_GALERIA'];
  const out={};
  keys.forEach(key=>{
    const cfg=CUDO_FORMS_CONFIG[key];
    const ss=SpreadsheetApp.openById(cfg.spreadsheetId);
    const spec=ss.getSheetByName(cfg.specSheet);
    const formId=String(spec.getRange('I1').getValue()||'').trim();
    const form=FormApp.openById(formId);
    const items=form.getItems().map(item=>({index:item.getIndex(),title:String(item.getTitle()||''),type:String(item.getType())}));
    out[key]={
      formId,
      title:form.getTitle(),
      description:form.getDescription(),
      confirmation:form.getConfirmationMessage(),
      accepting:form.isAcceptingResponses(),
      publishedUrl:form.getPublishedUrl(),
      items,
      pageBreaks:items.filter(i=>i.type==='PAGE_BREAK'),
      fileUploads:items.filter(i=>i.type==='FILE_UPLOAD')
    };
  });
  return out;
}
