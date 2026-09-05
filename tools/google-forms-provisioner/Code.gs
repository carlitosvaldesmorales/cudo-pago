const CUDO_FORMS_CONFIG = {
  QA_NOTICIAS: {
    env: 'QA',
    spreadsheetId: '14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_NOTICIAS',
    title: 'CUDO QA · Noticias',
    description: 'Carga de noticias para la web CUDO. Completa los datos en lenguaje simple; la publicación se procesa automáticamente después del control.'
  },
  QA_EQUIPOS: {
    env: 'QA',
    spreadsheetId: '1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_EQUIPOS',
    title: 'CUDO QA · Series y Equipos',
    description: 'Carga de series y equipos que aparecen en la web CUDO. Completa la información solicitada sin tocar planillas ni código.'
  },
  QA_PLANTEL: {
    env: 'QA',
    spreadsheetId: '1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_PLANTEL',
    title: 'CUDO QA · Jugadores / Plantel',
    description: 'Carga de jugadores y plantel para la web CUDO. Usa solamente información pública y fotografías autorizadas.'
  },
  QA_PARTIDOS: {
    env: 'QA',
    spreadsheetId: '1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_PARTIDOS',
    title: 'CUDO QA · Fechas, Partidos y Resultados',
    description: 'Carga una fecha, partido o resultado de CUDO. La web tomará los datos desde el circuito de publicación validado.'
  },
  QA_TABLA: {
    env: 'QA',
    spreadsheetId: '1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_TABLA',
    title: 'CUDO QA · Tabla de Posiciones',
    description: 'Carga una fila de la tabla de posiciones que se muestra en la web CUDO. Ingresa los valores oficiales de la competencia y categoría.'
  },
  QA_GALERIA: {
    env: 'QA',
    spreadsheetId: '1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',
    captureFolderId: '1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY',
    specSheet: 'FORM_SPEC',
    rawSheet: 'RAW_FORM_GALERIA',
    title: 'CUDO QA · Galería',
    description: 'Carga fotografías para la galería de la web CUDO. Usa solamente imágenes autorizadas; si aparecen menores, debe existir autorización correspondiente.'
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

function provisionAllQA() {
  const keys = ['QA_NOTICIAS', 'QA_EQUIPOS', 'QA_PLANTEL', 'QA_PARTIDOS', 'QA_TABLA', 'QA_GALERIA'];
  const results = {};
  const errors = [];
  keys.forEach(key => {
    try {
      results[key] = provisionForm_(CUDO_FORMS_CONFIG[key]);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      results[key] = { ERROR: msg };
      errors.push(`${key}: ${msg}`);
    }
  });
  console.log(JSON.stringify(results, null, 2));
  if (errors.length) {
    throw new Error(`Provisionamiento QA incompleto (${errors.length}/${keys.length} con error):\n${errors.join('\n')}`);
  }
  console.log(`CUDO Forms QA: ${keys.length}/${keys.length} formularios OK`);
  return results;
}

function provisionNoticiasQA() { return provisionForm_(CUDO_FORMS_CONFIG.QA_NOTICIAS); }
function provisionEquiposQA() { return provisionForm_(CUDO_FORMS_CONFIG.QA_EQUIPOS); }
function provisionPlantelQA() { return provisionForm_(CUDO_FORMS_CONFIG.QA_PLANTEL); }
function provisionPartidosQA() { return provisionForm_(CUDO_FORMS_CONFIG.QA_PARTIDOS); }
function provisionTablaQA() { return provisionForm_(CUDO_FORMS_CONFIG.QA_TABLA); }
function provisionGaleriaQA() { return provisionForm_(CUDO_FORMS_CONFIG.QA_GALERIA); }

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

  const rawHeaderValues = raw.getRange(1, 1, 1, raw.getLastColumn()).getValues()[0];
  const rawColumnCount = rawHeaderValues.filter(v => String(v).trim() !== '').length;
  if (rawColumnCount < 2) throw new Error(`${cfg.rawSheet} no tiene encabezados RAW válidos.`);

  const specRows = spec.getRange(2, 1, Math.max(spec.getLastRow() - 1, 0), 6).getValues()
    .filter(r => String(r[0]).trim() !== '');
  if (!specRows.length) throw new Error('FORM_SPEC no contiene preguntas.');

  const existingFormId = String(spec.getRange('I1').getValue() || '').trim();
  if (existingFormId) {
    const existing = FormApp.openById(existingFormId);
    existing.setTitle(cfg.title).setDescription(cfg.description);
    const existingResponseSheet = String(spec.getRange('I5').getValue() || '').trim();
    if (!existingResponseSheet) throw new Error('FORM existente pero RESPONSE_SHEET está vacío en FORM_SPEC.');
    linkRaw_(raw, existingResponseSheet, rawColumnCount);
    validateProvision_(cfg, ss, spec, raw, existing, existingResponseSheet, rawColumnCount, specRows.length);
    return writeMetadata_(spec, existing, existingResponseSheet);
  }

  const beforeSheetIds = new Set(ss.getSheets().map(s => s.getSheetId()));

  const form = FormApp.create(cfg.title, true)
    .setDescription(cfg.description)
    .setConfirmationMessage('Registro recibido. Quedará en revisión antes de publicarse.')
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true)
    .setAcceptingResponses(true);

  specRows.forEach(row => addQuestion_(form, row));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, cfg.spreadsheetId);

  let responseSheet = null;
  for (let i = 0; i < 12; i++) {
    Utilities.sleep(500);
    SpreadsheetApp.flush();
    responseSheet = ss.getSheets().find(s => !beforeSheetIds.has(s.getSheetId()));
    if (responseSheet) break;
  }
  if (!responseSheet) throw new Error('Google no creó una hoja de respuestas nueva después de setDestination().');

  linkRaw_(raw, responseSheet.getName(), rawColumnCount);
  DriveApp.getFileById(form.getId()).moveTo(DriveApp.getFolderById(cfg.captureFolderId));
  validateProvision_(cfg, ss, spec, raw, form, responseSheet.getName(), rawColumnCount, specRows.length);

  return writeMetadata_(spec, form, responseSheet.getName());
}

function validateProvision_(cfg, ss, spec, raw, form, responseSheetName, rawColumnCount, expectedQuestions) {
  const errors = [];
  if (form.getDestinationId() !== cfg.spreadsheetId) errors.push(`destino incorrecto: ${form.getDestinationId()}`);
  if (!form.isAcceptingResponses()) errors.push('formulario no acepta respuestas');
  if (!form.getPublishedUrl()) errors.push('URL pública vacía');
  if (form.getItems().length !== expectedQuestions) errors.push(`preguntas=${form.getItems().length}, esperadas=${expectedQuestions}`);
  if (!ss.getSheetByName(responseSheetName)) errors.push(`pestaña de respuestas inexistente: ${responseSheetName}`);

  const rawFormula = String(raw.getRange('A2').getFormula() || '');
  const safeResponseName = String(responseSheetName).replace(/'/g, "''");
  const lastCol = columnToLetter_(rawColumnCount);
  if (!rawFormula.includes('INDIRECT') || !rawFormula.includes(safeResponseName) || !rawFormula.includes(`A2:${lastCol}`)) {
    errors.push(`RAW no está enlazado de forma estable a ${responseSheetName}!A2:${lastCol}`);
  }

  if (errors.length) throw new Error(`${cfg.env}/${cfg.title}: ${errors.join(' | ')}`);
  return true;
}

function linkRaw_(raw, responseSheetName, columnCount) {
  if (raw.getMaxRows() > 1) raw.getRange(2, 1, raw.getMaxRows() - 1, columnCount).clearContent();
  const responseName = String(responseSheetName).replace(/'/g, "''");
  const lastCol = columnToLetter_(columnCount);
  raw.getRange('A2').setFormula(`=ARRAYFORMULA(INDIRECT("'${responseName}'!A2:${lastCol}"))`);
}

function columnToLetter_(column) {
  let temp = '';
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
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
