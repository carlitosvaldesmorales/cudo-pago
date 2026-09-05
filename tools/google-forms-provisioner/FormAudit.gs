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

function findFileUploadFormTemplatesQA(){
  const files=DriveApp.getFilesByType(MimeType.GOOGLE_FORMS);
  const candidates=[];
  let scanned=0;
  while(files.hasNext()&&scanned<250){
    const file=files.next();scanned++;
    try{
      const form=FormApp.openById(file.getId());
      const uploads=form.getItems(FormApp.ItemType.FILE_UPLOAD);
      if(uploads.length)candidates.push({id:file.getId(),name:file.getName(),title:form.getTitle(),fileUploadCount:uploads.length,uploadTitles:uploads.map(i=>i.getTitle())});
    }catch(e){}
  }
  return {scanned,candidates};
}
