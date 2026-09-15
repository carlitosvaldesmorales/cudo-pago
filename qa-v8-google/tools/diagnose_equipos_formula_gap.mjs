import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [k,v] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!v) throw new Error(`${k} no configurado`);

const SPREADSHEET_ID='1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI';
const MARKER='CUDO-QA-SYNTH-EQUIPO-35027786202';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function token(){
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth HTTP ${r.status}`);
  return d.access_token;
}
async function read(token,range,render='FORMATTED_VALUE'){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=${render}`;
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}}); const d=await r.json().catch(()=>({}));
    if(r.ok)return d.values||[]; last={status:r.status,msg:d.error?.message};
    if(![429,500,502,503,504].includes(r.status)||i===5)break; await sleep(1500*(i+1));
  }
  throw new Error(`Sheets ${range} HTTP ${last?.status}: ${last?.msg||'desconocido'}`);
}
function formulaCells(values){
  const out=[];
  for(let r=0;r<values.length;r++) for(let c=0;c<(values[r]||[]).length;c++){
    const v=String(values[r][c]??''); if(v.startsWith('='))out.push({row:r+1,col:c+1,formula:v});
  }
  return out;
}
function markerRows(values){
  const rows=[];
  for(let i=0;i<values.length;i++) if((values[i]||[]).some(v=>String(v??'').includes(MARKER))) rows.push(i+1);
  return rows;
}

const t=await token();
const provider=await read(t,"'Respuestas de formulario 1'!A1:Z20");
const rawValues=await read(t,"'RAW_FORM_EQUIPOS'!A1:Z20");
const rawFormulas=await read(t,"'RAW_FORM_EQUIPOS'!A1:Z20",'FORMULA');
const controlValues=await read(t,"'CONTROL'!A1:Z20");
const controlFormulas=await read(t,"'CONTROL'!A1:Z20",'FORMULA');
const revisionFormulas=await read(t,"'REVISION'!A1:Z10",'FORMULA');
const correctionsFormulas=await read(t,"'CORRECCIONES'!A1:Z10",'FORMULA');

const report={
  ok:true,
  mode:'READ_ONLY_EQUIPOS_FORMULA_DIAGNOSTIC',
  marker:MARKER,
  marker_rows:{
    provider:markerRows(provider),
    raw:markerRows(rawValues),
    control:markerRows(controlValues)
  },
  row_counts:{
    provider:Math.max(0,provider.length-1),
    raw:Math.max(0,rawValues.length-1),
    control:Math.max(0,controlValues.length-1)
  },
  formulas:{
    raw:formulaCells(rawFormulas),
    control:formulaCells(controlFormulas),
    revision:formulaCells(revisionFormulas),
    corrections:formulaCells(correctionsFormulas)
  }
};
fs.mkdirSync('qa-equipos-diagnostic',{recursive:true});
fs.writeFileSync('qa-equipos-diagnostic/equipos-formula-gap.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
