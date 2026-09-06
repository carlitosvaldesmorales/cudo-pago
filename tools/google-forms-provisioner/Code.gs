const CUDO_FORMS_CONFIG = {
  QA_NOTICIAS: {env:'QA',spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',captureFolderId:'1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_NOTICIAS',title:'Publicar una noticia del CUDO',description:'Use este formulario cuando el club necesite informar una actividad, resultado, convocatoria o comunicado. Antes de comenzar, tenga preparado el título y el texto revisado. Si la noticia lleva fotografía, use una imagen relacionada y autorizada. Al enviar, la noticia quedará recibida y pendiente de revisión antes de aparecer en la web.',confirmation:'Recibimos la información. Aún no está publicada: quedará pendiente de revisión antes de aparecer en la web del CUDO. Si detectó un error, use la opción “Corregir o retirar contenido” desde la administración web.'},
  QA_EQUIPOS: {env:'QA',spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',captureFolderId:'1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_EQUIPOS',title:'Administrar un equipo o serie del CUDO',description:'Use este formulario para registrar la información pública de una serie del club. Tenga preparado el nombre oficial de la serie y una breve presentación. El envío quedará pendiente de revisión antes de verse en la web.',confirmation:'Recibimos la información de la serie. Quedará pendiente de revisión antes de aparecer en la web del CUDO.'},
  QA_PLANTEL: {env:'QA',spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',captureFolderId:'1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_PLANTEL',title:'Agregar un jugador al plantel',description:'Use este formulario cuando un jugador deba aparecer en el plantel público. Tenga preparado su nombre público, serie, dorsal si corresponde, posición y una fotografía autorizada si será publicada. Este envío no reemplaza la inscripción deportiva y quedará pendiente de revisión.',confirmation:'Recibimos la información del jugador. Aún no está publicada: quedará pendiente de revisión antes de aparecer en el plantel de la web.'},
  QA_PARTIDOS: {env:'QA',spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',captureFolderId:'1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_PARTIDOS',title:'Registrar o actualizar un partido',description:'Use este formulario para informar un próximo partido, registrar un resultado o comunicar un cambio o suspensión. Tenga preparados serie, rival, fecha, lugar y, si terminó, los goles de ambos equipos. El envío quedará pendiente de revisión antes de verse en la web.',confirmation:'Recibimos la información del partido. Quedará pendiente de revisión antes de actualizar la programación, el resultado o el estado visible en la web.'},
  QA_TABLA: {env:'QA',spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',captureFolderId:'1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_TABLA',title:'Actualizar la tabla de posiciones',description:'Use este formulario sólo con una tabla oficial de la competencia. Tenga preparada la fuente oficial y los valores por equipo. La diferencia de goles se calcula automáticamente; mientras se validan las reglas oficiales de desempate y sanciones, copie posición y puntos desde la fuente oficial. El envío quedará pendiente de revisión.',confirmation:'Recibimos la actualización de la tabla. Quedará pendiente de revisión antes de modificar las posiciones visibles en la web.'},
  QA_GALERIA: {env:'QA',spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',captureFolderId:'1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_GALERIA',title:'Subir fotos a la galería del CUDO',description:'Use este formulario para agregar fotografías de un partido o actividad. Confirme que las imágenes pueden publicarse y tenga preparados la fecha y el nombre del evento. Si aparecen menores, la publicación quedará bloqueada hasta verificar la autorización correspondiente. El envío quedará pendiente de revisión.',confirmation:'Recibimos la fotografía y sus datos. Aún no está publicada: quedará pendiente de revisión antes de aparecer en la galería del CUDO.'},
  PROD_PARTIDOS: {env:'PROD',spreadsheetId:'1wD-UcUOU12UbCNtGyEjwXe27F3PrmzMLd6h8H3zmt68',captureFolderId:'1IQkr83hoPnoto21u0JyPcBD6mPBWZyPu',specSheet:'FORM_SPEC',rawSheet:'RAW_FORM_PARTIDOS',title:'CUDO · Partidos y Resultados',description:'Ingreso oficial de partidos y resultados CUDO. La publicación en la web requiere revisión posterior en CONTROL.',confirmation:'Registro recibido. Quedará pendiente de revisión antes de publicarse.'}
};

function provisionAllQA(){const keys=['QA_NOTICIAS','QA_EQUIPOS','QA_PLANTEL','QA_PARTIDOS','QA_TABLA','QA_GALERIA'];const results={},errors=[];keys.forEach(key=>{try{results[key]=provisionForm_(CUDO_FORMS_CONFIG[key]);}catch(err){const msg=String(err&&err.message?err.message:err);results[key]={ERROR:msg};errors.push(`${key}: ${msg}`);}});console.log(JSON.stringify(results,null,2));if(errors.length)throw new Error(`Provisionamiento QA incompleto (${errors.length}/${keys.length} con error):\n${errors.join('\n')}`);console.log(`CUDO Forms QA: ${keys.length}/${keys.length} formularios OK`);return results;}
function provisionNoticiasQA(){return provisionForm_(CUDO_FORMS_CONFIG.QA_NOTICIAS)}
function provisionEquiposQA(){return provisionForm_(CUDO_FORMS_CONFIG.QA_EQUIPOS)}
function provisionPlantelQA(){return provisionForm_(CUDO_FORMS_CONFIG.QA_PLANTEL)}
function provisionPartidosQA(){return provisionForm_(CUDO_FORMS_CONFIG.QA_PARTIDOS)}
function provisionTablaQA(){return provisionForm_(CUDO_FORMS_CONFIG.QA_TABLA)}
function provisionGaleriaQA(){return provisionForm_(CUDO_FORMS_CONFIG.QA_GALERIA)}
function provisionPartidosPROD(confirmacion){if(confirmacion!=='PROVISIONAR_PROD')throw new Error('PROD bloqueado. Ejecuta provisionPartidosPROD("PROVISIONAR_PROD") solo después de aprobar QA.');return provisionForm_(CUDO_FORMS_CONFIG.PROD_PARTIDOS)}

function provisionForm_(cfg){
  const ss=SpreadsheetApp.openById(cfg.spreadsheetId),spec=ss.getSheetByName(cfg.specSheet),raw=ss.getSheetByName(cfg.rawSheet);
  if(!spec||!raw)throw new Error(`Faltan hojas ${cfg.specSheet} o ${cfg.rawSheet}`);
  const rawHeaderValues=raw.getRange(1,1,1,raw.getLastColumn()).getValues()[0];
  const rawColumnCount=rawHeaderValues.filter(v=>String(v).trim()!=='').length;
  if(rawColumnCount<2)throw new Error(`${cfg.rawSheet} no tiene encabezados RAW válidos.`);
  const lastRow=Math.max(spec.getLastRow()-1,0);
  const specRows=lastRow?spec.getRange(2,1,lastRow,7).getValues().filter(r=>String(r[0]).trim()!==''):[];
  if(!specRows.length)throw new Error('FORM_SPEC no contiene preguntas.');
  if(rawColumnCount!==specRows.length+1)throw new Error(`${cfg.rawSheet}: columnas=${rawColumnCount}; preguntas FORM_SPEC=${specRows.length}. Se esperaba Timestamp + una columna por pregunta.`);

  const existingFormId=String(spec.getRange('I1').getValue()||'').trim();
  if(existingFormId){
    const form=FormApp.openById(existingFormId);
    form.setTitle(cfg.title).setDescription(cfg.description).setConfirmationMessage(cfg.confirmation||'Registro recibido. Quedará pendiente de revisión antes de publicarse.').setAllowResponseEdits(false).setShowLinkToRespondAgain(true).setAcceptingResponses(true);
    reconcileQuestions_(form,specRows);
    const responseSheet=String(spec.getRange('I5').getValue()||'').trim();
    if(!responseSheet)throw new Error('FORM existente pero RESPONSE_SHEET está vacío en FORM_SPEC.');
    linkRaw_(raw,responseSheet,rawColumnCount);
    validateProvision_(cfg,ss,raw,form,responseSheet,rawColumnCount,specRows);
    return writeMetadata_(spec,form,responseSheet);
  }

  const beforeSheetIds=new Set(ss.getSheets().map(s=>s.getSheetId()));
  const form=FormApp.create(cfg.title,true).setDescription(cfg.description).setConfirmationMessage(cfg.confirmation||'Registro recibido. Quedará pendiente de revisión antes de publicarse.').setAllowResponseEdits(false).setShowLinkToRespondAgain(true).setAcceptingResponses(true);
  specRows.forEach(row=>addQuestion_(form,row));
  form.setDestination(FormApp.DestinationType.SPREADSHEET,cfg.spreadsheetId);
  let responseSheet=null;
  for(let i=0;i<12;i++){Utilities.sleep(500);SpreadsheetApp.flush();responseSheet=ss.getSheets().find(s=>!beforeSheetIds.has(s.getSheetId()));if(responseSheet)break;}
  if(!responseSheet)throw new Error('Google no creó una hoja de respuestas nueva después de setDestination().');
  linkRaw_(raw,responseSheet.getName(),rawColumnCount);
  DriveApp.getFileById(form.getId()).moveTo(DriveApp.getFolderById(cfg.captureFolderId));
  validateProvision_(cfg,ss,raw,form,responseSheet.getName(),rawColumnCount,specRows);
  return writeMetadata_(spec,form,responseSheet.getName());
}

function removeNavigationBeforeRebuild_(form){
  form.getItems(FormApp.ItemType.LIST).forEach(item=>{
    const list=item.asListItem();
    const values=list.getChoices().map(c=>c.getValue());
    if(values.length)list.setChoiceValues(values);
  });
}
function rebuildQuestions_(form,specRows){removeNavigationBeforeRebuild_(form);const items=form.getItems();for(let i=items.length-1;i>=0;i--)form.deleteItem(i);specRows.forEach(row=>addQuestion_(form,row));}
function reconcileQuestions_(form,specRows){const items=form.getItems();if(items.length!==specRows.length){rebuildQuestions_(form,specRows);return;}for(let i=0;i<specRows.length;i++){const row=specRows[i],item=items[i];if(!itemCompatible_(item,row)){rebuildQuestions_(form,specRows);return;}updateQuestion_(item,row);}}

function isManualFileUploadSlot_(row){const kind=String(row[2]||'').trim().toUpperCase(),dest=String(row[5]||'').trim().toUpperCase();return kind==='TEXTO_CORTO'&&['IMAGEN_REF','FOTO_REF'].includes(dest);}
function itemCompatible_(item,row){
  const kind=String(row[2]).trim().toUpperCase(),type=item.getType();
  if(isManualFileUploadSlot_(row)&&type===FormApp.ItemType.FILE_UPLOAD)return true;
  if(kind==='LISTA')return type===FormApp.ItemType.LIST;
  if(kind==='PARRAFO')return type===FormApp.ItemType.PARAGRAPH_TEXT;
  if(kind==='FECHA')return type===FormApp.ItemType.DATE;
  if(kind==='HORA')return type===FormApp.ItemType.TIME;
  if(kind==='TEXTO_CORTO'||kind==='NUMERO')return type===FormApp.ItemType.TEXT;
  return false;
}

function updateQuestion_(item,row){
  if(isManualFileUploadSlot_(row)&&item.getType()===FormApp.ItemType.FILE_UPLOAD)return item;
  const [,pregunta,tipo,obligatoria,opciones,,ayuda]=row;
  const title=String(pregunta).trim(),required=String(obligatoria).trim().toUpperCase()==='SI',kind=String(tipo).trim().toUpperCase(),help=String(ayuda||'').trim();
  let typed;
  if(kind==='LISTA'){typed=item.asListItem();typed.setChoiceValues(String(opciones).split('|').map(v=>v.trim()).filter(Boolean));}
  else if(kind==='PARRAFO')typed=item.asParagraphTextItem();
  else if(kind==='FECHA')typed=item.asDateItem().setIncludesYear(true);
  else if(kind==='HORA')typed=item.asTimeItem();
  else typed=item.asTextItem();
  typed.setTitle(title).setRequired(required);if(typeof typed.setHelpText==='function')typed.setHelpText(help);
}

function validateProvision_(cfg,ss,raw,form,responseSheetName,rawColumnCount,specRows){
  const errors=[];
  if(form.getDestinationId()!==cfg.spreadsheetId)errors.push(`destino incorrecto: ${form.getDestinationId()}`);
  if(!form.isAcceptingResponses())errors.push('formulario no acepta respuestas');
  if(!form.getPublishedUrl())errors.push('URL pública vacía');
  if(form.getItems().length!==specRows.length)errors.push(`preguntas=${form.getItems().length}, esperadas=${specRows.length}`);
  form.getItems().forEach((item,i)=>{if(!itemCompatible_(item,specRows[i]))errors.push(`tipo incompatible pregunta ${i+1}: ${item.getType()}`);if(String(item.getTitle()).trim()!==String(specRows[i][1]).trim())errors.push(`título no reconciliado pregunta ${i+1}`);});
  if(!ss.getSheetByName(responseSheetName))errors.push(`pestaña de respuestas inexistente: ${responseSheetName}`);
  const rawFormula=String(raw.getRange('A2').getFormula()||''),safeResponseName=String(responseSheetName).replace(/'/g,"''"),lastCol=columnToLetter_(rawColumnCount);
  if(!rawFormula.includes('INDIRECT')||!rawFormula.includes(safeResponseName)||!rawFormula.includes(`A2:${lastCol}`))errors.push(`RAW no está enlazado de forma estable a ${responseSheetName}!A2:${lastCol}`);
  if(errors.length)throw new Error(`${cfg.env}/${cfg.title}: ${errors.join(' | ')}`);return true;
}
function linkRaw_(raw,responseSheetName,columnCount){if(raw.getMaxRows()>1)raw.getRange(2,1,raw.getMaxRows()-1,columnCount).clearContent();const responseName=String(responseSheetName).replace(/'/g,"''"),lastCol=columnToLetter_(columnCount);raw.getRange('A2').setFormula(`=ARRAYFORMULA(INDIRECT("'${responseName}'!A2:${lastCol}"))`)}
function columnToLetter_(column){let temp='',letter='';while(column>0){temp=(column-1)%26;letter=String.fromCharCode(temp+65)+letter;column=(column-temp-1)/26}return letter}

function addQuestion_(form,row){
  const [,pregunta,tipo,obligatoria,opciones,,ayuda]=row,title=String(pregunta).trim(),required=String(obligatoria).trim().toUpperCase()==='SI',kind=String(tipo).trim().toUpperCase(),help=String(ayuda||'').trim();let item;
  switch(kind){case'LISTA':item=form.addListItem().setTitle(title).setChoiceValues(String(opciones).split('|').map(v=>v.trim()).filter(Boolean));break;case'TEXTO_CORTO':case'NUMERO':item=form.addTextItem().setTitle(title);break;case'PARRAFO':item=form.addParagraphTextItem().setTitle(title);break;case'FECHA':item=form.addDateItem().setTitle(title).setIncludesYear(true);break;case'HORA':item=form.addTimeItem().setTitle(title);break;default:throw new Error(`Tipo de pregunta no soportado en FORM_SPEC: ${kind}`)}
  item.setRequired(required);if(typeof item.setHelpText==='function')item.setHelpText(help);return item;
}
function writeMetadata_(spec,form,responseSheetName){const values=[['FORM_ID',form.getId()],['FORM_EDIT_URL',form.getEditUrl()],['FORM_RESPONDER_URL',form.getPublishedUrl()],['LINKED_SPREADSHEET_ID',form.getDestinationId()||''],['RESPONSE_SHEET',responseSheetName||''],['ESTADO',form.isAcceptingResponses()?'ACEPTANDO_RESPUESTAS':'CERRADO'],['ACTUALIZADO',new Date()]];spec.getRange(1,8,values.length,2).setValues(values);return Object.fromEntries(values)}
