import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);

const MODULES={
  NOTICIA:{spreadsheetId:'14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI',stages:['RAW_FORM_NOTICIAS','NOTICIAS']},
  EQUIPO:{spreadsheetId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',stages:['RAW_FORM_EQUIPOS','CONTROL']},
  PLANTEL:{spreadsheetId:'1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94',stages:['RAW_FORM_PLANTEL','PLANTEL_CONTROL']},
  PARTIDO:{spreadsheetId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',stages:['RAW_FORM_PARTIDOS','CONTROL']},
  TABLA:{spreadsheetId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',stages:['RAW_FORM_TABLA','CONTROL']},
  GALERIA:{spreadsheetId:'1RDs5qukBJnW8L6OBPwo4ZcB3a3xz3tI2XibceTh6Q2c',stages:['RAW_FORM_GALERIA','CONTROL']}
};

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function token(){
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${d.error_description||d.error||'desconocido'}`);
  return d.access_token;
}
async function formulaValues(accessToken,spreadsheetId,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMULA`;
  let last;
  for(let i=0;i<5;i++){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
    const d=await r.json().catch(()=>({}));
    if(r.ok) return d.values||[];
    last={status:r.status,data:d};
    if(![429,500,502,503,504].includes(r.status)||i===4) break;
    await sleep(750*(2**i));
  }
  throw new Error(`Sheets formula read ${spreadsheetId}/${range} HTTP ${last?.status}: ${last?.data?.error?.message||'desconocido'}`);
}
function quoteSheet(title){return `'${title.replaceAll("'","''")}'`;}
function topology(values){
  const formulas=values.flat().map(v=>String(v??'')).filter(v=>v.startsWith('='));
  const refs=new Set();
  for(const formula of formulas){
    for(const match of formula.matchAll(/'([^']+)'!/g)) refs.add(match[1]);
    for(const match of formula.matchAll(/(?:^|[^'A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_ ]*)!/g)) refs.add(match[1].trim());
  }
  return {formula_count:formulas.length,referenced_sheets:[...refs].sort()};
}

const accessToken=await token();
const report={ok:true,mode:'READ_ONLY_FORMULA_TOPOLOGY',privacy:'FORMULA_COUNTS_AND_REFERENCED_SHEET_NAMES_ONLY',timestamp:new Date().toISOString(),modules:{},errors:[]};
for(const [moduleKey,module] of Object.entries(MODULES)){
  report.modules[moduleKey]={};
  for(const stage of module.stages){
    try{
      const values=await formulaValues(accessToken,module.spreadsheetId,`${quoteSheet(stage)}!A1:AZ10`);
      report.modules[moduleKey][stage]=topology(values);
    }catch(error){
      report.ok=false;
      report.errors.push(`${moduleKey}/${stage}: ${String(error?.message||error)}`);
    }
  }
}
fs.mkdirSync('qa-formula-topology',{recursive:true});
fs.writeFileSync('qa-formula-topology/formula-topology.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
