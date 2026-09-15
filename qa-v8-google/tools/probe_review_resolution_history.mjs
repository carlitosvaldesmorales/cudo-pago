import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);

const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const MODULES={
  NOTICIA:{spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',operationalSheet:'NOTICIAS'},
  EQUIPO:{spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',operationalSheet:'CONTROL'},
  PLANTEL:{spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',operationalSheet:'PLANTEL_CONTROL'},
  PARTIDO:{spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',operationalSheet:'CONTROL'},
  TABLA:{spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',operationalSheet:'CONTROL'},
  GALERIA:{spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',operationalSheet:'CONTROL'}
};
async function token(){const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json();if(!r.ok||!d.access_token)throw new Error(`OAuth refresh falló HTTP ${r.status}`);return d.access_token}
async function readValues(t,id,range){const u=`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;const r=await fetch(u,{headers:{Authorization:`Bearer ${t}`}});const d=await r.json();if(!r.ok)throw new Error(`Sheets ${id}/${range} HTTP ${r.status}`);return d.values||[]}
function objects(values){if(!values.length)return[];const h=values[0].map(v=>String(v||'').trim());return values.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k,String(r[i]??'').trim()]))) }
const t=await token();
const audit=objects(await readValues(t,REVIEW_SHEET_ID,'AUDITORIA_REVISION!A:P'));
const applied=audit.filter(r=>r.ESTADO_PROCESO==='APLICADO').map(r=>({
  TIPO_CONTENIDO:r.TIPO_CONTENIDO,
  IDENTIFICADOR_HUMANO:r.IDENTIFICADOR_HUMANO,
  DECISION:r.DECISION,
  AUTORIZACION_PUBLICACION:r.AUTORIZACION_PUBLICACION,
  AUTORIZACION_MENORES:r.AUTORIZACION_MENORES,
  ESTADO_PROCESO:r.ESTADO_PROCESO,
  ID_RESUELTO:r.ID_RESUELTO,
  COINCIDENCIAS:r.COINCIDENCIAS,
  RESULTADO:r.RESULTADO,
  CAMPO_CORRECCION:r.CAMPO_CORRECCION,
  NUEVO_VALOR:r.NUEVO_VALOR
}));
const operational={};
for(const [key,m] of Object.entries(MODULES)){
  const vals=await readValues(t,m.spreadsheetId,`${m.operationalSheet}!A:Z`);
  operational[key]={sheet:m.operationalSheet,headers:vals[0]?.map(v=>String(v||'').trim()).filter(Boolean)||[],rows:objects(vals).slice(0,10)};
}
const report={ok:true,mode:'READ_ONLY_RESOLUTION_DISCOVERY',timestamp:new Date().toISOString(),applied_audit:applied,operational};
fs.mkdirSync('qa-review-probe',{recursive:true});
fs.writeFileSync('qa-review-probe/resolution-history.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:true,applied_count:applied.length,operational_modules:Object.keys(operational)},null,2));
