import fs from 'fs';
import path from 'path';

const CLIENT_ID = process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for (const [name, value] of Object.entries({CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN})) {
  if (!value) throw new Error(`${name} no configurado`);
}

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, 'preview-v8', 'data');
const CONTRACT_DIR = path.join(ROOT, 'preview-v8', 'contracts');
const PARTIDOS_CONTRACT = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'partidos-v1.json'), 'utf8'));

const MODULES = [
  ['noticias','14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI','CUDO_WEB_NOTICIAS',[]],
  ['equipos','1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI','CUDO_WEB_EQUIPOS',[]],
  ['plantel','1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94','CUDO_WEB_PLANTEL',['numero']],
  ['partidos','1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI','CUDO_WEB_PARTIDOS',['goles_local','goles_visita']],
  ['tabla','1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY','CUDO_WEB_TABLA',['posicion','pj','pg','pe','pp','gf','gc','dg','pts']],
  ['galeria','1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c','CUDO_WEB_GALERIA',[]]
].map(([key,spreadsheetId,source,numeric]) => ({key,spreadsheetId,source,numeric,sheet:'PUBLICO_EXPORT'}));

async function getAccessToken() {
  const body = new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${data.error_description || data.error || 'desconocido'}`);
  return data.access_token;
}

async function readSheet(token, spreadsheetId, sheet) {
  const range = encodeURIComponent(`${sheet}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r = await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  const data = await r.json();
  if (!r.ok) throw new Error(`Sheets API ${spreadsheetId}/${sheet} HTTP ${r.status}: ${data.error?.message || 'desconocido'}`);
  return data.values || [];
}

function clean(v) { return String(v ?? '').trim(); }
function sameList(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function contractFail(message) { throw new Error(`CONTRATO PARTIDOS: ${message}`); }

function validatePartidosPublicContract(values) {
  if (!values.length) contractFail('PUBLICO_EXPORT no tiene encabezados');
  const actualHeaders = values[0].map(clean).filter(Boolean);
  const expectedHeaders = PARTIDOS_CONTRACT.public_contract.allowed;
  if (!sameList(actualHeaders, expectedHeaders)) {
    contractFail(`PUBLICO_EXPORT headers=${JSON.stringify(actualHeaders)} esperado=${JSON.stringify(expectedHeaders)}`);
  }

  const publicFromForm = ['id', ...PARTIDOS_CONTRACT.form_mapping
    .filter(item => typeof item.public === 'string' && item.public)
    .map(item => item.public)];
  if (!sameList(publicFromForm, expectedHeaders)) {
    contractFail(`form_mapping público=${JSON.stringify(publicFromForm)} no coincide con public_contract.allowed=${JSON.stringify(expectedHeaders)}`);
  }
}

function validatePartidosFormSpec(values) {
  if (!values.length) contractFail('FORM_SPEC no tiene encabezados');
  const headers = values[0].map(clean);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  for (const required of ['ORDEN','PREGUNTA','OBLIGATORIA','OPCIONES','DESTINO_RAW']) {
    if (!(required in index)) contractFail(`FORM_SPEC no contiene columna ${required}`);
  }

  const actual = values.slice(1)
    .filter(row => /^\d+$/.test(clean(row[index.ORDEN])))
    .map(row => ({
      order: Number(clean(row[index.ORDEN])),
      question: clean(row[index.PREGUNTA]),
      raw: clean(row[index.DESTINO_RAW]),
      required: clean(row[index.OBLIGATORIA]).toUpperCase() === 'SI',
      options: clean(row[index.OPCIONES]).split('|').map(clean).filter(Boolean)
    }));

  const expected = PARTIDOS_CONTRACT.form_mapping.map(item => ({
    order: item.order,
    question: item.question,
    raw: item.raw,
    required: item.required
  }));
  const comparableActual = actual.map(({order,question,raw,required}) => ({order,question,raw,required}));
  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    contractFail(`FORM_SPEC no coincide con form_mapping. actual=${JSON.stringify(comparableActual)} esperado=${JSON.stringify(expected)}`);
  }

  const category = actual.find(item => item.raw === 'CATEGORIA');
  if (!category || !sameList(category.options, PARTIDOS_CONTRACT.renderer.category_order)) {
    contractFail(`opciones CATEGORIA=${JSON.stringify(category?.options ?? [])} no coinciden con renderer.category_order=${JSON.stringify(PARTIDOS_CONTRACT.renderer.category_order)}`);
  }

  const state = actual.find(item => item.raw === 'ESTADO_PARTIDO');
  if (!state || !sameList(state.options, PARTIDOS_CONTRACT.public_contract.states)) {
    contractFail(`opciones ESTADO_PARTIDO=${JSON.stringify(state?.options ?? [])} no coinciden con states=${JSON.stringify(PARTIDOS_CONTRACT.public_contract.states)}`);
  }
}

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function rowsToItems(values,numeric) {
  if (!values.length) throw new Error('PUBLICO_EXPORT no tiene encabezados');
  const headers = values[0].map(v=>String(v).trim()).filter(Boolean);
  if (!headers.length) throw new Error('PUBLICO_EXPORT tiene encabezados vacíos');
  return values.slice(1).filter(row=>row.some(v=>String(v??'').trim()!=='')).map(row=>Object.fromEntries(headers.map((h,i)=>[h,numeric.includes(h)?toNumber(row[i]??''):row[i]??''])));
}

function readExisting(out) {
  if (!fs.existsSync(out)) return null;
  try { return JSON.parse(fs.readFileSync(out,'utf8')); } catch { return null; }
}

function sameItems(a,b) { return JSON.stringify(a ?? []) === JSON.stringify(b ?? []); }

const token = await getAccessToken();
fs.mkdirSync(OUT_DIR,{recursive:true});
const summary = {};
for (const module of MODULES) {
  const publicValues = await readSheet(token,module.spreadsheetId,module.sheet);
  if (module.key === 'partidos') {
    validatePartidosPublicContract(publicValues);
    const formValues = await readSheet(token,module.spreadsheetId,PARTIDOS_CONTRACT.pipeline.form_spec_sheet);
    validatePartidosFormSpec(formValues);
  }

  const items = rowsToItems(publicValues,module.numeric);
  const out = path.join(OUT_DIR,`${module.key}.json`);
  const previous = readExisting(out);
  const changed = !previous || previous.schema_version !== '1.0' || previous.source !== module.source || !sameItems(previous.items,items);
  const doc = {
    schema_version:'1.0',
    generated_at: changed ? new Date().toISOString() : (previous.generated_at ?? null),
    source:module.source,
    items
  };
  fs.writeFileSync(out,JSON.stringify(doc,null,2)+'\n','utf8');
  summary[module.key]={items:items.length,changed,spreadsheetId:module.spreadsheetId};
}
console.log(JSON.stringify({ok:true,contract_guard:'CUDO-PARTIDOS-V1',modules:summary},null,2));
