import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);

const SPREADSHEET_ID='1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI';
const MARKER='CUDO-QA-SYNTH-EQUIPO-35027786202';

async function token(){
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh fallo HTTP ${r.status}`);
  return d.access_token;
}
async function read(accessToken,range){
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r=await fetch(u,{headers:{Authorization:`Bearer ${accessToken}`}});const d=await r.json();
  if(!r.ok) throw new Error(`Sheets read ${range} HTTP ${r.status}: ${d.error?.message||'desconocido'}`);
  return d.values||[];
}
function objects(values){
  const headers=(values[0]||[]).map(v=>String(v??'').trim());
  return values.slice(1).map((row,i)=>({__row:i+2,...Object.fromEntries(headers.map((h,j)=>[h,String(row[j]??'').trim()]))}));
}
const accessToken=await token();
const control=objects(await read(accessToken,'CONTROL!A:M'));
const revision=objects(await read(accessToken,'REVISION!A:H'));
const publico=objects(await read(accessToken,'PUBLICO_EXPORT!A:Z'));
const matches=control.filter(row=>Object.values(row).some(v=>String(v).includes(MARKER)));
if(matches.length!==1) throw new Error(`Esperaba 1 match sintetico y obtuve ${matches.length}`);
const row=matches[0];
const id=row.ID_EQUIPO||row.ID||'';
if(!id) throw new Error('Match sintetico sin ID_EQUIPO');
const revisionMatches=revision.filter(r=>String(r.ID||'')===id);
const publicMatches=publico.filter(r=>Object.values(r).some(v=>String(v)===id||String(v).includes(MARKER)));
const report={
  ok:true,
  mode:'READ_ONLY_SYNTHETIC_TARGET_ONLY',
  marker:MARKER,
  control:{row:row.__row,id_equipo:id,nombre:row.NOMBRE||'',categoria:row.CATEGORIA||'',estado_revision:row.ESTADO_REVISION||row.ESTADO||'',publicar:row.PUBLICAR||''},
  revision_matches:revisionMatches.map(r=>({row:r.__row,id:r.ID||'',estado:r.ESTADO||'',publicar:r.PUBLICAR||'',privacidad:r.PRIVACIDAD||'',autorizacion:r.AUTORIZACION||''})),
  public_match_count:publicMatches.length
};
fs.mkdirSync('qa-review-target',{recursive:true});
fs.writeFileSync('qa-review-target/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
