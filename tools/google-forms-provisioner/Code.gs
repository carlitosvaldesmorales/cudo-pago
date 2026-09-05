const CUDO_FORMS_CONFIG = {
  QA_PARTIDOS: {
    env: 'QA',
    spreadsheetId: '1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_PARTIDOS',
    title: 'CUDO QA · Partidos y Resultados',
    description: 'Formulario QA de CUDO para probar el circuito Form → Sheet → CONTROL → PUBLICO_EXPORT → GitHub. No usar para datos reales.'
  },
  PROD_PARTIDOS: {
    env: 'PROD',
    spreadsheetId: '1wD-UcUOU12UbCNtGyEjwXe27F3PrmzMLd6h8H3zmt68',
    captureFolderId: '1IQkr83hoPnoto21u0JyPcBD6mPBWZyPu',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_PARTIDOS',
    title: 'CUDO · Partidos y Resultados',
    description: 'Ingreso oficial de partidos y resultados CUDO. La publicación en la web requiere revisión posterior en CONTROL.'
  }
};

function provisionPartidosQA() {
  return provisionForm_(CUDO_FORMS_CONFIG.QA_PARTIDOS);
}

function provisionPartidosPROD(confirmacion) {
  if (confirmacion !== 'PROVISIONAR_PROD') {
    throw new Error('PROD bloqueado. Ejecuta provisionPartidosPROD("PROVISIONAR_PROD") solo después de aprobar QA.');
  }
  return provisionForm_(CUDO_FORMS_CONFIG.PROD_PARTIDOS);
}

function provisionForm_(cfg) {
  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const spec = ss.getSheetByName(cfg.specSheet);
  const raw = ss.getSheetByName(cfg.rawSheet);
  if (!spec || !raw) throw new Error(`Faltan hojas ${cfg.specSheet} o ${cfg.rawSheet}`);

  // Idempotencia: si ya fue provisionado, no crear un segundo formulario.
  const existingFormId = String(spec.getRange('I1').getValue() || '').trim();
  if (existingFormId) {
    const existing = FormApp.openById(existingFormId);
    return writeMetadata_(spec, existing, String(spec.getRange('I5').getValue() || ''));
  }

  const rows = spec.getRange(2, 1, Math.max(spec.getLastRow() - 1, 0), 6).getValues()
    .filter(r => String(r[0]).trim() !== '');
  if (!rows.length) throw new Error('FORM_SPEC no contiene preguntas.');

  const beforeSheetIds = new Set(ss.getSheets().map(s => s.getSheetId()));

  const form = FormApp.create(cfg.title, true)
    .setDescription(cfg.description)
    .setConfirmationMessage('Registro recibido. Quedará en revisión antes de publicarse.')
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true)
    .setAcceptingResponses(true);

  rows.forEach(row => addQuestion_(form, row));

  // Google, no código propio, mantiene el almacenamiento de respuestas en Sheets.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, cfg.spreadsheetId);
  Utilities.sleep(1500);
  SpreadsheetApp.flush();

  const responseSheet = ss.getSheets().find(s => !beforeSheetIds.has(s.getSheetId()));
  if (!responseSheet) {
    throw new Error('Google no creó una hoja de respuestas nueva después de setDestination().');
  }

  // Conservamos RAW_FORM_PARTIDOS como capa RAW estable para que CONTROL no dependa
  // del nombre que Google asigne a la pestaña de respuestas.
  if (raw.getMaxRows() > 1) raw.getRange(2, 1, raw.getMaxRows() - 1, 15).clearContent();
  const responseName = responseSheet.getName().replace(/'/g, "''");
  raw.getRange('A2').setFormula(`=ARRAYFORMULA('${responseName}'!A2:O)`);

  // Guardar el Form dentro de la carpeta institucional del ambiente.
  DriveApp.getFileById(form.getId()).moveTo(DriveApp.getFolderById(cfg.captureFolderId));

  return writeMetadata_(spec, form, responseSheet.getName());
}

function addQuestion_(form, row) {
  const [, pregunta, tipo, obligatoria, opciones] = row;
  const title = String(pregunta).trim();
  const required = String(obligatoria).trim().toUpperCase() === 'SI';
  const kind = String(tipo).trim().toUpperCase();
  let item;

  switch (kind) {
    case 'LISTA':
      item = form.addListItem()
        .setTitle(title)
        .setChoiceValues(String(opciones).split('|').map(v => v.trim()).filter(Boolean));
      break;
    case 'TEXTO_CORTO':
    case 'NUMERO':
      item = form.addTextItem().setTitle(title);
      break;
    case 'PARRAFO':
      item = form.addParagraphTextItem().setTitle(title);
      break;
    case 'FECHA':
      item = form.addDateItem().setTitle(title).setIncludesYear(true);
      break;
    case 'HORA':
      item = form.addTimeItem().setTitle(title);
      break;
    default:
      throw new Error(`Tipo de pregunta no soportado en FORM_SPEC: ${kind}`);
  }

  item.setRequired(required);
}

function writeMetadata_(spec, form, responseSheetName) {
  const values = [
    ['FORM_ID', form.getId()],
    ['FORM_EDIT_URL', form.getEditUrl()],
    ['FORM_RESPONDER_URL', form.getPublishedUrl()],
    ['LINKED_SPREADSHEET_ID', form.getDestinationId() || ''],
    ['RESPONSE_SHEET', responseSheetName || ''],
    ['ESTADO', form.isAcceptingResponses() ? 'ACEPTANDO_RESPUESTAS' : 'CERRADO'],
    ['ACTUALIZADO', new Date()]
  ];
  spec.getRange(1, 8, values.length, 2).setValues(values);
  return Object.fromEntries(values);
}
