// CUDO V8 Google PUBLICO_EXPORT synchronizer. This comment also records the E2E review-to-web certification pass.
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
const MEDIA_DIR = path.join(ROOT, 'preview-v8', 'media');
const MODULES = [
  ['noticias','14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI','CUDO_WEB_NOTICIAS',[],{field:'imagen_ref',multi:false}],
  ['equipos','1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI','CUDO_WEB_EQUIPOS',[],null],
  ['plantel','1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94','CUDO_WEB_PLANTEL',['numero'],{field:'foto_ref',multi:false}],
  ['partidos','1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI','CUDO_WEB_PARTIDOS',['goles_local','goles_visita'],null],
  ['tabla','1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY','CUDO_WEB_TABLA',['posicion','pj','pg','pe','pp','gf','gc','dg','pts'],null],
  ['galeria','1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c','CUDO_WEB_GALERIA',[],{field:'imagen_ref',multi:true}]
].map(([key,spreadsheetId,source,numeric,media]) => ({key,spreadsheetId,source,numeric,media,sheet:'PUBLICO_EXPORT'}));

const WEB_IMAGE_EXT = new Map([
  ['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/gif','gif'],['image/avif','avif']
]);

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

function extractDriveIds(value) {
  const s=String(value||'');
  const ids=[];
  const patterns=[/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/g,/drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/g,/[?&]id=([A-Za-z0-9_-]+)/g];
  for(const re of patterns){let m;while((m=re.exec(s)))if(!ids.includes(m[1]))ids.push(m[1]);}
  return ids;
}

async function driveMeta(token,fileId){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});const data=await r.json();
  if(!r.ok)throw new Error(`Drive metadata ${fileId} HTTP ${r.status}: ${data.error?.message||'desconocido'}`);
  return data;
}

async function ensureDriveImage(token,moduleKey,fileId){
  const meta=await driveMeta(token,fileId),ext=WEB_IMAGE_EXT.get(meta.mimeType);
  if(!ext)throw new Error(`${moduleKey}: archivo ${meta.name||fileId} usa ${meta.mimeType}; conviértelo a JPG, PNG, WEBP, GIF o AVIF antes de publicar.`);
  const dir=path.join(MEDIA_DIR,moduleKey);fs.mkdirSync(dir,{recursive:true});
  const filename=`${fileId}.${ext}`,out=path.join(dir,filename);
  if(!fs.existsSync(out)){
    const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok)throw new Error(`Drive download ${fileId} HTTP ${r.status}`);
    fs.writeFileSync(out,Buffer.from(await r.arrayBuffer()));
  }
  return `media/${moduleKey}/${filename}`;
}

async function materializeMedia(token,module,items){
  if(!module.media)return items;
  const out=[];
  for(const item of items){
    const original=String(item[module.media.field]||'').trim();
    const ids=extractDriveIds(original);
    if(!ids.length){out.push(item);continue;}
    if(!module.media.multi&&ids.length>1)throw new Error(`${module.key}: el registro ${item.id||''} contiene más de una imagen; este módulo acepta sólo una.`);
    const paths=[];for(const id of ids)paths.push(await ensureDriveImage(token,module.key,id));
    if(module.media.multi&&paths.length>1){paths.forEach((p,i)=>out.push({...item,id:`${item.id}-${String(i+1).padStart(2,'0')}`,[module.media.field]:p}));}
    else out.push({...item,[module.media.field]:paths[0]});
  }
  return out;
}

function readExisting(out) {
  if (!fs.existsSync(out)) return null;
  try { return JSON.parse(fs.readFileSync(out,'utf8')); } catch { return null; }
}
function sameItems(a,b) { return JSON.stringify(a ?? []) === JSON.stringify(b ?? []); }

const token = await getAccessToken();
fs.mkdirSync(OUT_DIR,{recursive:true});fs.mkdirSync(MEDIA_DIR,{recursive:true});
const summary = {};
for (const module of MODULES) {
  const rawItems=rowsToItems(await readSheet(token,module.spreadsheetId,module.sheet),module.numeric);
  const items=await materializeMedia(token,module,rawItems);
  const out = path.join(OUT_DIR,`${module.key}.json`);
  const previous = readExisting(out);
  const changed = !previous || previous.schema_version !== '1.0' || previous.source !== module.source || !sameItems(previous.items,items);
  const doc = {schema_version:'1.0',generated_at:changed?new Date().toISOString():(previous.generated_at??null),source:module.source,items};
  fs.writeFileSync(out,JSON.stringify(doc,null,2)+'\n','utf8');
  summary[module.key]={items:items.length,changed,spreadsheetId:module.spreadsheetId};
}
console.log(JSON.stringify({ok:true,modules:summary},null,2));
