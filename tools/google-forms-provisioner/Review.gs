const CUDO_REVIEW_QA = {
  env: 'QA',
  spreadsheetId: '1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms',
  captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
  specSheet: 'FORM_SPEC',
  rawSheet: 'RAW_FORM_REVISION',
  title: 'CUDO QA · Revisar contenido antes de publicar',
  description: 'Use este formulario para aprobar, rechazar, retirar o reactivar contenido de la web CUDO. Identifique el contenido con palabras normales. Si hay más de una coincidencia, el sistema no aplicará cambios automáticamente.'
};

function provisionRevisionQA() {
  const result = provisionForm_(CUDO_REVIEW_QA);
  initializeReviewAudit_();
  installReviewTrigger_(result.FORM_ID);
  return result;
}

function initializeReviewAudit_() {
  const ss = SpreadsheetApp.openById(CUDO_REVIEW_QA.spreadsheetId);
  const audit = ss.getSheetByName('AUDITORIA_REVISION');
  if (!audit) throw new Error('Falta AUDITORIA_REVISION');
  audit.getRange('A2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";"QA-REV-"&TEXT(RAW_FORM_REVISION!A2:A;"yyyymmddhhmmss")&"-"&TEXT(ROW(RAW_FORM_REVISION!A2:A)-1;"000")))');
  audit.getRange('B2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!A2:A))');
  audit.getRange('C2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!B2:B))');
  audit.getRange('D2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!C2:C))');
  audit.getRange('E2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!D2:D))');
  audit.getRange('F2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!E2:E))');
  audit.getRange('G2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!F2:F))');
  audit.getRange('H2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!G2:G))');
  audit.getRange('I2').setFormula('=ARRAYFORMULA(IF(RAW_FORM_REVISION!A2:A="";"";RAW_FORM_REVISION!H2:H))');
  if (audit.getMaxRows() > 1) audit.getRange(2, 10, audit.getMaxRows() - 1, 5).clearContent();
  SpreadsheetApp.flush();
}
