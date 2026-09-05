const CUDO_REVIEW_TARGETS = {
  'Noticia': {
    spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI', sheet:'NOTICIAS', revision:'REVISION', corrections:'CORRECCIONES',
    label:r=>[r[3],r[1]].filter(Boolean).join(' · '), auth:true,
    snapshot:[1,3,4,5,6], fields:{'Fecha':1,'Título o nombre':2,'Resumen o descripción':3,'Texto principal':4}
  },
  'Equipo / Serie': {
    spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI', sheet:'CONTROL', revision:'REVISION', corrections:'CORRECCIONES',
    label:r=>[r[1],r[2]].filter(Boolean).join(' · '), auth:true,
    snapshot:[1,2,3,4], fields:{'Título o nombre':1,'Categoría o serie':2,'Resumen o descripción':3}
  },
  'Jugador / Plantel': {
    spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94', sheet:'PLANTEL_CONTROL', revision:'REVISION', corrections:'CORRECCIONES',
    label:r=>[r[3],r[6],r[4]?'#'+r[4]:''].filter(Boolean).join(' · '), auth:true,
    snapshot:[3,4,5,6,7,8], fields:{'Título o nombre':1,'Número de camiseta':2,'Posición':3,'Categoría o serie':4}
  },
  'Partido / Resultado': {
    spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI', sheet:'CONTROL', revision:'REVISION', corrections:'CORRECCIONES',
    label:r=>[r[3],r[5],r[6],r[7]].filter(Boolean).join(' · '), auth:false,
    snapshot:[1,2,3,4,5,6,7,8,9,10,11], fields:{'Fecha':3,'Hora':4,'Categoría o serie':5,'Recinto':8,'Estado del partido':9}
  },
  'Tabla de posiciones': {
    spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY', sheet:'CONTROL', revision:'REVISION', corrections:'CORRECCIONES',
    label:r=>[r[4],r[2],r[1]].filter(Boolean).join(' · '), auth:false,
    snapshot:[1,2,3,4,5,6,7,8,9,10,11,12],
    fields:{'Categoría o serie':2,'Posición en la tabla':3,'Equipo o rival':4,'Partidos jugados (PJ)':5,'Partidos ganados (PG)':6,'Partidos empatados (PE)':7,'Partidos perdidos (PP)':8,'Goles a favor (GF)':9,'Goles en contra (GC)':10,'Puntos':12}
  },
  'Galería': {
    spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c', sheet:'CONTROL', revision:'REVISION', corrections:'CORRECCIONES',
    label:r=>[r[5],r[2],r[3],r[4]].filter(Boolean).join(' · '), auth:true, minors:true,
    snapshot:[1,2,3,4,5,6,7,8], fields:{'Fecha':3,'Categoría o serie':4,'Título o nombre':5,'Resumen o descripción':6}
  }
};

function normalizeHuman_(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function isCudo_(value){const n=normalizeHuman_(value);return n==='cudo'||n==='c u d o'||n.includes('club union deportivo orilla');}

function processPendingReviewsQA(){
  const ss=SpreadsheetApp.openById(CUDO_REVIEW_QA.spreadsheetId);
  const audit=ss.getSheetByName('AUDITORIA_REVISION');
  if(!audit)throw new Error('Falta AUDITORIA_REVISION');
  SpreadsheetApp.flush();
  const last=audit.getLastRow();
  if(last<2)return {processed:0,ok:0,error:0};
  const rows=audit.getRange(2,1,last-1,16).getValues();
  let processed=0,ok=0,error=0;
  rows.forEach((row,i)=>{
    const requestId=String(row[0]||'').trim();
    const status=String(row[9]||'').trim();
    if(!requestId||status)return;
    const data={
      timestamp:row[1] instanceof Date?row[1]:new Date(),
      type:String(row[2]||''), human:String(row[3]||''), decision:String(row[4]||''), authorized:String(row[5]||''), minors:String(row[6]||''),
      notes:String(row[7]||''), reviewer:String(row[8]||''), correctionField:String(row[14]||''), newValue:String(row[15]||'').trim(), rowIndex:i+2
    };
    const outcome=applyReviewData_(data);
    processed++; if(outcome.status==='APLICADO')ok++; else error++;
  });
  return {processed,ok,error};
}

function handleReviewSubmitQA(e){
  const answers={};
  e.response.getItemResponses().forEach(ir=>answers[ir.getItem().getTitle()]=ir.getResponse());
  return applyReviewData_({
    timestamp:e.response.getTimestamp(),
    type:String(answers['¿Qué contenido desea revisar?']||''),
    human:String(answers['Identifique el contenido']||''),
    decision:String(answers['Decisión de revisión']||''),
    authorized:String(answers['¿La publicación está autorizada?']||''),
    minors:String(answers['Si aparecen menores, ¿la autorización fue verificada?']||''),
    notes:String(answers['Observaciones de revisión']||''),
    reviewer:String(answers['Nombre del revisor']||''),
    correctionField:String(answers['¿Qué dato se corrige?']||''),
    newValue:String(answers['¿Cuál es el valor aprobado?']||'').trim()
  });
}

function applyReviewData_(data){
  const target=CUDO_REVIEW_TARGETS[data.type];
  if(!target)return finishReview_(data,'ERROR','',0,'Tipo de contenido no soportado');
  const ss=SpreadsheetApp.openById(target.spreadsheetId);
  const source=ss.getSheetByName(target.sheet),revision=ss.getSheetByName(target.revision),corrections=ss.getSheetByName(target.corrections);
  if(!source||!revision||!corrections)return finishReview_(data,'ERROR','',0,'Falta hoja canónica, REVISION o CORRECCIONES');
  const values=source.getDataRange().getDisplayValues().slice(1).filter(r=>String(r[0]).trim()!=='');
  const needle=normalizeHuman_(data.human);
  if(!needle)return finishReview_(data,'ERROR','',0,'Identificador vacío');
  const matches=values.filter(r=>normalizeHuman_(target.label(r)).includes(needle));
  if(matches.length!==1)return finishReview_(data,matches.length?'AMBIGUO':'NO_ENCONTRADO','',matches.length,`Coincidencias: ${matches.length}`);

  const current=matches[0],id=String(current[0]);
  if(data.decision==='Aprobar corrección'){
    const result=applyCorrection_(target,corrections,current,data.correctionField,data.newValue,data.reviewer,data.notes);
    SpreadsheetApp.flush();
    return finishReview_(data,result.ok?'APLICADO':'ERROR',id,1,result.message);
  }

  const gate=reviewGate_(data.decision,data.authorized);
  if(!gate)return finishReview_(data,'ERROR',id,1,'Decisión no soportada');
  const row=[id,gate.estado,gate.publicar,gate.privacidad,gate.autorizacion];
  if(target.minors)row.push(data.minors==='SI'?'AUTORIZADO':data.minors==='NO'?'RECHAZADO':'NO_APLICA');
  row.push(data.reviewer,new Date(),data.notes);
  upsertById_(revision,id,row);
  SpreadsheetApp.flush();
  return finishReview_(data,'APLICADO',id,1,`${data.decision} aplicado`);
}

function applyCorrection_(target,sheet,current,field,newValue,reviewer,notes){
  if(!field||field==='Otro')return {ok:false,message:'La corrección requiere un dato estructurado distinto de Otro'};
  if(newValue==='')return {ok:false,message:'La corrección requiere un nuevo valor'};
  const snapshot=target.snapshot.map(i=>current[i]??'');
  let correctionIndex=target.fields[field]||null;

  if(target.spreadsheetId==='1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI'){
    const cudoLocal=isCudo_(current[6]);
    if(field==='Equipo o rival')correctionIndex=cudoLocal?7:6;
    if(field==='Goles de CUDO')correctionIndex=cudoLocal?10:11;
    if(field==='Goles del rival')correctionIndex=cudoLocal?11:10;
  }
  if(!correctionIndex)return {ok:false,message:`El dato “${field}” no se puede corregir automáticamente en este tipo de contenido`};

  const numericFields=['Número de camiseta','Goles de CUDO','Goles del rival','Partidos jugados (PJ)','Partidos ganados (PG)','Partidos empatados (PE)','Partidos perdidos (PP)','Goles a favor (GF)','Goles en contra (GC)','Puntos','Posición en la tabla'];
  if(numericFields.includes(field)&&(!/^\d+$/.test(newValue)||Number(newValue)<0))return {ok:false,message:`${field} debe ser un número entero igual o mayor que 0`};
  if(field==='Fecha'&&!/^\d{4}-\d{2}-\d{2}$/.test(newValue))return {ok:false,message:'La fecha aprobada debe escribirse como AAAA-MM-DD'};
  if(field==='Hora'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(newValue))return {ok:false,message:'La hora aprobada debe escribirse como HH:MM en formato 24 horas'};

  snapshot[correctionIndex-1]=newValue;
  if(target.spreadsheetId==='1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY'){
    const gf=Number(snapshot[8]),gc=Number(snapshot[9]);
    if(Number.isFinite(gf)&&Number.isFinite(gc))snapshot[10]=String(gf-gc);
  }
  upsertById_(sheet,String(current[0]),[String(current[0]),...snapshot,reviewer,new Date(),notes]);
  return {ok:true,message:`Corrección aplicada: ${field}`};
}

function reviewGate_(decision,authorized){
  const auth=authorized==='SI'?'AUTORIZADO':'RECHAZADO';
  if(decision==='Aprobar publicación')return {estado:'PUBLICADO',publicar:'SI',privacidad:'PUBLICO',autorizacion:auth};
  if(decision==='Rechazar publicación')return {estado:'RECHAZADO',publicar:'NO',privacidad:'INTERNO',autorizacion:'RECHAZADO'};
  if(decision==='Aprobar retiro')return {estado:'RETIRADO',publicar:'NO',privacidad:'INTERNO',autorizacion:'PENDIENTE'};
  if(decision==='Aprobar reactivación')return {estado:'PUBLICADO',publicar:'SI',privacidad:'PUBLICO',autorizacion:auth};
  return null;
}

function upsertById_(sheet,id,row){
  const last=Math.max(sheet.getLastRow(),1);
  if(last>1){
    const ids=sheet.getRange(2,1,last-1,1).getDisplayValues().flat();
    const idx=ids.findIndex(v=>String(v)===id);
    if(idx>=0){sheet.getRange(idx+2,1,1,row.length).setValues([row]);return;}
  }
  sheet.getRange(last+1,1,1,row.length).setValues([row]);
}

function finishReview_(data,status,id,count,result){
  writeReviewOutcome_(data.timestamp,status,id,count,result,data.correctionField,data.newValue,data.rowIndex);
  return {status,id,count,result};
}

function writeReviewOutcome_(timestamp,status,id,count,result,field,newValue,rowIndex){
  const ss=SpreadsheetApp.openById(CUDO_REVIEW_QA.spreadsheetId),audit=ss.getSheetByName('AUDITORIA_REVISION');
  let targetRow=Number(rowIndex||0);
  if(!targetRow){
    const rows=audit.getRange(2,2,Math.max(audit.getLastRow()-1,1),1).getValues();
    targetRow=Math.max(audit.getLastRow(),2);
    for(let i=rows.length-1;i>=0;i--){const v=rows[i][0];if(v instanceof Date&&Math.abs(v.getTime()-timestamp.getTime())<2000){targetRow=i+2;break;}}
  }
  audit.getRange(targetRow,10,1,7).setValues([[status,id,count,result,new Date(),field||'',newValue||'']]);
}
