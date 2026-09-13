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
  {key:'noticias',spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',source:'CUDO_WEB_NOTICIAS',numeric:[],boolean:[],date:['fecha'],time:[],publicRefs:['imagen_ref'],requiredPublicRefs:[]},
  {key:'equipos',spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',source:'CUDO_WEB_EQUIPOS',numeric:[],boolean:[],date:[],time:[],publicRefs:[],requiredPublicRefs:[]},
  {key:'plantel',spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',source:'CUDO_WEB_PLANTEL',numeric:['numero'],boolean:['capitan'],date:[],time:[],publicRefs:['foto_ref'],requiredPublicRefs:[]},
  {key:'partidos',spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',source:'CUDO_WEB_PARTIDOS',numeric:['goles_local','goles_visita'],boolean:[],date:['fecha'],time:['hora'],publicRefs:[],requiredPublicRefs:[]},
  {key:'tabla',spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',source:'CUDO_WEB_TABLA',numeric:['posicion','pj','pg','pe','pp','gf','gc','dg','pts'],boolean:[],date:[],time:[],publicRefs:[],requiredPublicRefs:[]},
  {key:'galeria',spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',source:'CUDO_WEB_GALERIA',numeric:[],boolean:[],date:['fecha'],time:[],publicRefs:['imagen_ref'],requiredPublicRefs:['imagen_ref']}
].map(module => ({...module,sheet:'PUBLICO_EXPORT'}));

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

function parseLocaleNumber(v) {
  const raw = clean(v).replace(',', '.');
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  return parseLocaleNumber(v);
}

function toBoolean(v, field) {
  const normalized = clean(v).toUpperCase();
  if (normalized === 'SI') return true;
  if (normalized === 'NO') return false;
  if (normalized === '') return null;
  throw new Error(`${field}: valor booleano público no reconocido: ${JSON.stringify(v)}`);
}

function toIsoDate(v, field) {
  const value = clean(v);
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const dmy = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    const [,day,month,year] = dmy;
    const iso = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
    const check = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(check.getTime()) && check.toISOString().slice(0,10) === iso) return iso;
  }

  const serial = parseLocaleNumber(value);
  if (serial !== null && serial >= 1 && serial < 100000) {
    const milliseconds = Date.UTC(1899,11,30) + Math.floor(serial) * 86400000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0,10);
  }

  throw new Error(`${field}: fecha pública no reconocida: ${JSON.stringify(v)}`);
}

function toHHMM(v, field) {
  const value = clean(v);
  if (!value) return '';
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const hms = value.match(/^((?:[01]?\d|2[0-3])):([0-5]\d):[0-5]\d$/);
  if (hms) return `${hms[1].padStart(2,'0')}:${hms[2]}`;

  const serial = parseLocaleNumber(value);
  if (serial !== null && serial >= 0) {
    const fraction = serial - Math.floor(serial);
    const totalMinutes = Math.round(fraction * 1440) % 1440;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
  }

  throw new Error(`${field}: hora pública no reconocida: ${JSON.stringify(v)}`);
}

function sanitizePublicRef(v, field) {
  const value = clean(v);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const queryKeys = [...parsed.searchParams.keys()].map(key => key.toLowerCase());
    const privateTally = parsed.hostname === 'storage.tally.so' && parsed.pathname.startsWith('/private/');
    const credentialLike = queryKeys.includes('accesstoken') || queryKeys.includes('signature');
    if (privateTally || credentialLike) {
      console.warn(`PUBLIC_REF_STRIPPED module_field=${field} reason=private_or_signed_reference`);
      return '';
    }
  } catch {
    // Las rutas relativas siguen siendo válidas; el validador público decide su formato.
  }
  return value;
}

function rowToItem(row,headers,module) {
  return Object.fromEntries(headers.map((h,i)=>{
    const raw = row[i] ?? '';
    if (module.date.includes(h)) return [h,toIsoDate(raw,`${module.key}.${h}`)];
    if (module.time.includes(h)) return [h,toHHMM(raw,`${module.key}.${h}`)];
    if (module.numeric.includes(h)) return [h,toNumber(raw)];
    if (module.boolean.includes(h)) return [h,toBoolean(raw,`${module.key}.${h}`)];
    if (module.publicRefs.includes(h)) return [h,sanitizePublicRef(raw,`${module.key}.${h}`)];
    return [h,raw];
  }));
}

function rowsToItems(values,module) {
  if (!values.length) throw new Error('PUBLICO_EXPORT no tiene encabezados');
  const headers = values[0].map(v=>String(v).trim()).filter(Boolean);
  if (!headers.length) throw new Error('PUBLICO_EXPORT tiene encabezados vacíos');

  const items = [];
  for (const row of values.slice(1).filter(row=>row.some(v=>String(v??'').trim()!==''))) {
    const item = rowToItem(row,headers,module);
    const missingRequiredRef = module.requiredPublicRefs.find(field => !clean(item[field]));
    if (missingRequiredRef) {
      console.warn(`PUBLIC_ROW_SKIPPED module=${module.key} reason=missing_safe_required_ref field=${missingRequiredRef}`);
      continue;
    }
    items.push(item);
  }
  return items;
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

  const items = rowsToItems(publicValues,module);
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
