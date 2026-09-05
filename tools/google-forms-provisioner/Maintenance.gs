const CUDO_MAINTENANCE_QA = {
  env: 'QA',
  spreadsheetId: '1KfOxUmdhaCkb9Xcf9OYVTqtdQWy-fizwEVWHwOQ3apY',
  captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
  specSheet: 'FORM_SPEC',
  rawSheet: 'RAW_FORM_MANTENCION',
  title: 'Corregir o retirar contenido publicado',
  description: 'Use este formulario para pedir una corrección, actualización, retiro o reactivación de contenido de la web CUDO. Identifique el contenido con palabras normales; no necesita códigos, planillas ni conocimientos técnicos.',
  confirmation: 'Recibimos su solicitud de cambio. El contenido actual se mantendrá igual hasta que el encargado la revise. Si pidió retirarlo por una situación urgente, contacte al responsable definido por CUDO e indique el nombre y la fecha del contenido.'
};

function provisionMantenimientoQA() {
  const result = provisionForm_(CUDO_MAINTENANCE_QA);
  initializeMaintenanceAudit_();
  return result;
}

function initializeMaintenanceAudit_() {
  const ss = SpreadsheetApp.openById(CUDO_MAINTENANCE_QA.spreadsheetId);
  const audit = ss.getSheetByName('AUDITORIA_MANTENCION');
  if (!audit) throw new Error('Falta AUDITORIA_MANTENCION');
  const raw = ss.getSheetByName(CUDO_MAINTENANCE_QA.rawSheet);
  if (!raw) throw new Error('Falta RAW_FORM_MANTENCION');
  audit.getRange('A2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";"QA-MAN-"&TEXT(RAW_FORM_MANTENCION!A2:A;"yyyymmddhhmmss")&"-"&TEXT(ROW(RAW_FORM_MANTENCION!A2:A)-1;"000")))');
  audit.getRange('B2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!A2:A))');
  audit.getRange('C2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!B2:B))');
  audit.getRange('D2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!C2:C))');
  audit.getRange('E2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!D2:D))');
  audit.getRange('F2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!E2:E))');
  audit.getRange('G2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!F2:F))');
  audit.getRange('H2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!G2:G))');
  audit.getRange('I2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!H2:H))');
  audit.getRange('J2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";"PENDIENTE_REVISION"))');
  audit.getRange('R2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!I2:I))');
  audit.getRange('S2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_MANTENCION!A2:A="";"";RAW_FORM_MANTENCION!J2:J))');
  SpreadsheetApp.flush();
}
