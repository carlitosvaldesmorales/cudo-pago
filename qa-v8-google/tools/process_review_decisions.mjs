const CLIENT_ID = process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for (const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) {
  if (!value) throw new Error(`${name} no configurado`);
}

const REVIEW_SHEET_ID = '1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const MODULES = {
  NOTICIA: { spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI', revisionSheet:'REVISION' }
};

async function token() {
  const body = new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${d.error_description || d.error || 'desconocido'}`);
  return d.access_token;
}

async function readValues(t, spreadsheetId, range) {
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r = await fetch(u,{headers:{Authorization:`Bearer ${t}`}});
  const d = await r.json();
  if (!r.ok) throw new Error(`Sheets read ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message || 'desconocido'}`);
  return d.values || [];
}

async function updateValues(t, spreadsheetId, range, values) {
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(u,{method:'PUT',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})});
  const d = await r.json();
  if (!r.ok) throw new Error(`Sheets write ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message || 'desconocido'}`);
  return d;
}

async function appendValues(t, spreadsheetId, range, values) {
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetch(u,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})});
  const d = await r.json();
  if (!r.ok) throw new Error(`Sheets append ${spreadsheetId}/${range} HTTP ${r.status}: ${d.error?.message || 'desconocido'}`);
  return d;
}

function transition(decision) {
  if (decision === 'Solicitar corrección') return ['REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE'];
  if (decision === 'Aprobar y publicar') return ['PUBLICADO','SI','PUBLICO','AUTORIZADO'];
  if (decision === 'Rechazar') return ['RECHAZADO','NO','INTERNO','PENDIENTE'];
  return null;
}

const t = await token();
const audit = await readValues(t,REVIEW_SHEET_ID,'AUDITORIA_REVISION!A:P');
if (!audit.length) throw new Error('AUDITORIA_REVISION sin encabezados');
const headers = audit[0];
const idx = Object.fromEntries(headers.map((h,i)=>[h,i]));
const required = ['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','OBSERVACIONES','REVISOR','ESTADO_PROCESO'];
for (const h of required) if (idx[h] === undefined) throw new Error(`Falta columna ${h} en AUDITORIA_REVISION`);

const summary=[];
for (let i=1;i<audit.length;i++) {
  const row=audit[i];
  const id=(row[idx.IDENTIFICADOR_HUMANO]||'').trim();
  const type=(row[idx.TIPO_CONTENIDO]||'').trim();
  const decision=(row[idx.DECISION]||'').trim();
  const processState=(row[idx.ESTADO_PROCESO]||'').trim();
  if (!id || !type || !decision || processState) continue;
  const mod=MODULES[type];
  if (!mod) { summary.push({row:i+1,id,type,decision,status:'IGNORADO_TIPO_NO_IMPLEMENTADO'}); continue; }
  const next=transition(decision);
  if (!next) { summary.push({row:i+1,id,type,decision,status:'IGNORADO_DECISION_NO_IMPLEMENTADA'}); continue; }

  const revisions=await readValues(t,mod.spreadsheetId,`${mod.revisionSheet}!A:H`);
  const existingIndex=revisions.findIndex((r,n)=>n>0 && String(r[0]||'').trim()===id);
  const revRow=[id,...next,(row[idx.REVISOR]||'').trim(),new Date().toISOString(),(row[idx.OBSERVACIONES]||'').trim()];
  if (existingIndex>0) await updateValues(t,mod.spreadsheetId,`${mod.revisionSheet}!A${existingIndex+1}:H${existingIndex+1}`,[revRow]);
  else await appendValues(t,mod.spreadsheetId,`${mod.revisionSheet}!A:H`,[revRow]);

  const auditRow=i+1;
  await updateValues(t,REVIEW_SHEET_ID,`AUDITORIA_REVISION!J${auditRow}:O${auditRow}`,[['APLICADO',id,1,`${decision} aplicado`,new Date().toISOString(),'']]);
  summary.push({row:auditRow,id,type,decision,status:'APLICADO'});
}
console.log(JSON.stringify({ok:true,summary},null,2));
