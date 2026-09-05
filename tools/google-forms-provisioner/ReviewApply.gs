const CUDO_REVIEW_TARGETS = {
  'Noticia': {spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI', sheet:'NOTICIAS', revision:'REVISION', label:r=>[r[3],r[1]].filter(Boolean).join(' · '), auth:true},
  'Equipo / Serie': {spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI', sheet:'CONTROL', revision:'REVISION', label:r=>[r[1],r[2]].filter(Boolean).join(' · '), auth:true},
  'Jugador / Plantel': {spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94', sheet:'PLANTEL_CONTROL', revision:'REVISION', label:r=>[r[3],r[6],r[4] ? '#'+r[4] : ''].filter(Boolean).join(' · '), auth:true},
  'Partido / Resultado': {spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI', sheet:'CONTROL', revision:'REVISION', label:r=>[r[3],r[5],r[6],r[7]].filter(Boolean).join(' · '), auth:false},
  'Tabla de posiciones': {spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY', sheet:'CONTROL', revision:'REVISION', label:r=>[r[4],r[2],r[1]].filter(Boolean).join(' · '), auth:false},
  'Galería': {spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c', sheet:'CONTROL', revision:'REVISION', label:r=>[r[5],r[2],r[3],r[4]].filter(Boolean).join(' · '), auth:true, minors:true}
};

function normalizeHuman_(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}

function installReviewTrigger_(formId){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='handleReviewSubmitQA').forEach(t=>ScriptApp.deleteTrigger(t));
  const form=FormApp.openById(formId);
  ScriptApp.newTrigger('handleReviewSubmitQA').forForm(form).onFormSubmit().create();
}

function handleReviewSubmitQA(e){
  const answers={};
  e.response.getItemResponses().forEach(ir=>answers[ir.getItem().getTitle()]=ir.getResponse());
  const type=String(answers['¿Qué contenido desea revisar?']||'');
  const human=String(answers['Identifique el contenido']||'');
  const decision=String(answers['Decisión de revisión']||'');
  const authorized=String(answers['¿La publicación está autorizada?']||'');
  const minors=String(answers['Si aparecen menores, ¿la autorización fue verificada?']||'');
  const notes=String(answers['Observaciones de revisión']||'');
  const reviewer=String(answers['Nombre del revisor']||'');
  const target=CUDO_REVIEW_TARGETS[type];
  if(!target){writeReviewOutcome_(e.response.getTimestamp(),'ERROR','',0,'Tipo de contenido no soportado');return;}

  const ss=SpreadsheetApp.openById(target.spreadsheetId);
  const source=ss.getSheetByName(target.sheet),revision=ss.getSheetByName(target.revision);
  if(!source||!revision){writeReviewOutcome_(e.response.getTimestamp(),'ERROR','',0,'Falta hoja canónica o REVISION');return;}
  const values=source.getDataRange().getDisplayValues().slice(1).filter(r=>String(r[0]).trim()!=='');
  const needle=normalizeHuman_(human);
  const matches=values.filter(r=>normalizeHuman_(target.label(r)).includes(needle));
  if(matches.length!==1){writeReviewOutcome_(e.response.getTimestamp(),matches.length?'AMBIGUO':'NO_ENCONTRADO','',matches.length,`Coincidencias: ${matches.length}`);return;}

  const id=String(matches[0][0]);
  const gate=reviewGate_(decision,authorized);
  if(!gate){writeReviewOutcome_(e.response.getTimestamp(),'ERROR',id,1,'Decisión no soportada');return;}
  const row=[id,gate.estado,gate.publicar,gate.privacidad,gate.autorizacion];
  if(target.minors)row.push(minors==='SI'?'AUTORIZADO':minors==='NO'?'RECHAZADO':'NO_APLICA');
  row.push(reviewer,new Date(),notes);
  upsertRevision_(revision,id,row);
  SpreadsheetApp.flush();
  writeReviewOutcome_(e.response.getTimestamp(),'APLICADO',id,1,`${decision} aplicado`);
}

function reviewGate_(decision,authorized){
  const auth=authorized==='SI'?'AUTORIZADO':'RECHAZADO';
  if(decision==='Aprobar publicación')return {estado:'PUBLICADO',publicar:'SI',privacidad:'PUBLICO',autorizacion:auth};
  if(decision==='Rechazar publicación')return {estado:'RECHAZADO',publicar:'NO',privacidad:'INTERNO',autorizacion:'RECHAZADO'};
  if(decision==='Aprobar retiro')return {estado:'RETIRADO',publicar:'NO',privacidad:'INTERNO',autorizacion:'PENDIENTE'};
  if(decision==='Aprobar reactivación')return {estado:'PUBLICADO',publicar:'SI',privacidad:'PUBLICO',autorizacion:auth};
  return null;
}

function upsertRevision_(sheet,id,row){
  const last=Math.max(sheet.getLastRow(),1);
  if(last>1){
    const ids=sheet.getRange(2,1,last-1,1).getDisplayValues().flat();
    const idx=ids.findIndex(v=>String(v)===id);
    if(idx>=0){sheet.getRange(idx+2,1,1,row.length).setValues([row]);return;}
  }
  sheet.getRange(last+1,1,1,row.length).setValues([row]);
}

function writeReviewOutcome_(timestamp,status,id,count,result){
  const ss=SpreadsheetApp.openById(CUDO_REVIEW_QA.spreadsheetId);
  const audit=ss.getSheetByName('AUDITORIA_REVISION');
  const rows=audit.getRange(2,2,Math.max(audit.getLastRow()-1,1),1).getValues();
  let rowIndex=audit.getLastRow();
  for(let i=rows.length-1;i>=0;i--){const v=rows[i][0];if(v instanceof Date&&Math.abs(v.getTime()-timestamp.getTime())<2000){rowIndex=i+2;break;}}
  if(rowIndex<2)rowIndex=2;
  audit.getRange(rowIndex,10,1,5).setValues([[status,id,count,result,new Date()]]);
}
