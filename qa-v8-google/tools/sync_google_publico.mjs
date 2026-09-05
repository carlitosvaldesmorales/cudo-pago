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

const MODULES = [
  {
    key: 'noticias',
    spreadsheetId: '14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',
    sheet: 'PUBLICO_EXPORT',
    source: 'CUDO_WEB_NOTICIAS',
    numeric: []
  },
  {
    key: 'equipos',
    spreadsheetId: '1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',
    sheet: 'PUBLICO_EXPORT',
    source: 'CUDO_WEB_EQUIPOS',
    numeric: []
  },
  {
    key: 'plantel',
    spreadsheetId: '1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',
    sheet: 'PUBLICO_EXPORT',
    source: 'CUDO_WEB_PLANTEL',
    numeric: ['numero']
  },
  {
    key: 'partidos',
    spreadsheetId: '1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',
    sheet: 'PUBLICO_EXPORT',
    source: 'CUDO_WEB_PARTIDOS',
    numeric: ['goles_local','goles_visita']
  },
  {
    key: 'tabla',
    spreadsheetId: '1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',
    sheet: 'PUBLICO_EXPORT',
    source: 'CUDO_WEB_TABLA',
    numeric: ['posicion','pj','pg','pe','pp','gf','gc','dg','pts']
  },
  {
    key: 'galeria',
    spreadsheetId: '1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',
    sheet: 'PUBLICO_EXPORT',
    source: 'CUDO_WEB_GALERIA',
    numeric: []
  }
];

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(`OAuth refresh falló HTTP ${r.status}: ${data.error_description || data.error || 'desconocido'}`);
  }
  return data.access_token;
}

async function readSheet(accessToken, spreadsheetId, sheet) {
  const range = encodeURIComponent(`${sheet}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r = await fetch(url, {headers:{Authorization:`Bearer ${accessToken}`}});
  const data = await r.json();
  if (!r.ok) throw new Error(`Sheets API ${spreadsheetId}/${sheet} HTTP ${r.status}: ${data.error?.message || 'desconocido'}`);
  return data.values || [];
}

function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function rowsToItems(values, numericFields) {
  if (!values.length) throw new Error('PUBLICO_EXPORT no tiene encabezados');
  const headers = values[0].map(v => String(v).trim()).filter(Boolean);
  if (!headers.length) throw new Error('PUBLICO_EXPORT tiene encabezados vacíos');
  const items = [];
  for (const row of values.slice(1)) {
    const hasData = row.some(v => String(v ?? '').trim() !== '');
    if (!hasData) continue;
    const item = {};
    headers.forEach((h, i) => {
      let v = row[i] ?? '';
      if (numericFields.includes(h)) v = toNumber(v);
      item[h] = v;
    });
    items.push(item);
  }
  return items;
}

function stableDocument(module, items) {
  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    source: module.source,
    items
  };
}

const token = await getAccessToken();
fs.mkdirSync(OUT_DIR, {recursive:true});
const summary = {};

for (const module of MODULES) {
  const values = await readSheet(token, module.spreadsheetId, module.sheet);
  const items = rowsToItems(values, module.numeric);
  const out = path.join(OUT_DIR, `${module.key}.json`);
  fs.writeFileSync(out, JSON.stringify(stableDocument(module, items), null, 2) + '\n', 'utf8');
  summary[module.key] = {items: items.length, spreadsheetId: module.spreadsheetId};
}

console.log(JSON.stringify({ok:true, modules:summary}, null, 2));
