import fs from 'node:fs';

const APPLY=String(process.env.CUDO_EQUIPOS_FORMULA_FIX_APPLY||'').toLowerCase()==='true';
const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [k,v] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!v) throw new Error(`${k} no configurado`);

const SPREADSHEET_ID='1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI';
const CELL="'RAW_FORM_EQUIPOS'!A2";
const MARKER='CUDO-QA-SYNTH-EQUIPO-35027786202';
const EXPECTED_OLD=`=ARRAYFORMULA(QUERY('Respuestas de formulario 1'!A3:N;"select Col1,Col8,Col9,Col10,Col11,Col12,Col13,Col14";0))`;
const DESIRED=`=ARRAYFORMULA(QUERY('Respuestas de formulario 1'!A2:N;"select Col1,Col8,Col9,Col10,Col11,Col12,Col13,Col14";0))`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function token(){
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json(); if(!r.ok||!d.access_token) throw new Error(`OAuth HTTP ${r.status}`); return d.access_token;
}
async function sheets(token,url,options={}){
  let last;
  for(let i=0;i<6;i++){
    const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
    const d=await r.json().catch(()=>({})); if(r.ok)return d; last={status:r.status,msg:d.error?.message};
    if(![429,500,502,503,504].includes(r.status)||i===5)break; await sleep(1500*(i+1));
  }
  throw new Error(`Sheets HTTP ${last?.status}: ${last?.msg||'desconocido'}`);
}
async function readValues(t,range,render='FORMATTED_VALUE'){
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=${render}`;
  return (await sheets(t,u)).values||[];
}
async function writeFormula(t){
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CELL)}?valueInputOption=USER_ENTERED`;
  return sheets(t,u,{method:'PUT',body:JSON.stringify({range:CELL,majorDimension:'ROWS',values:[[DESIRED]]})});
}
function contains(values,marker){return values.some(row=>row.some(v=>String(v??'').includes(marker)));}
async function stages(t){
  const provider=await readValues(t,"'Respuestas de formulario 1'!A1:Z20");
  const raw=await readValues(t,"'RAW_FORM_EQUIPOS'!A1:Z20");
  const control=await readValues(t,"'CONTROL'!A1:Z20");
  const pub=await readValues(t,"'PUBLICO_EXPORT'!A1:Z20");
  return {provider:contains(provider,MARKER),raw:contains(raw,MARKER),control:contains(control,MARKER),public_export:contains(pub,MARKER)};
}

const t=await token();
const beforeValues=await readValues(t,CELL,'FORMULA');
const before=String(beforeValues?.[0]?.[0]??'');
if(before!==EXPECTED_OLD && before!==DESIRED) throw new Error(`Safety gate: fórmula inesperada en ${CELL}`);
const report={ok:true,mode:APPLY?'APPLY_GUARDED_FORMULA_FIX':'DRY_RUN_NO_EXTERNAL_WRITES',cell:CELL,before,desired:DESIRED,already_fixed:before===DESIRED,writes_applied:0,stages_before:await stages(t),stages_after:null};
if(APPLY&&before===EXPECTED_OLD){await writeFormula(t);report.writes_applied=1;}
if(APPLY){
  const afterValues=await readValues(t,CELL,'FORMULA');
  const after=String(afterValues?.[0]?.[0]??'');
  if(after!==DESIRED) throw new Error('La fórmula no quedó en el valor esperado');
  let s;
  for(let i=0;i<10;i++){s=await stages(t);if(s.provider&&s.raw&&s.control&&!s.public_export)break;await sleep(1500);}
  report.stages_after=s;
  if(!(s?.provider&&s?.raw&&s?.control&&!s?.public_export)) throw new Error(`Fix aplicado pero downstream no convergió: ${JSON.stringify(s)}`);
}else report.stages_after=report.stages_before;
fs.mkdirSync('qa-equipos-repair',{recursive:true});
fs.writeFileSync('qa-equipos-repair/equipos-raw-formula-repair.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
