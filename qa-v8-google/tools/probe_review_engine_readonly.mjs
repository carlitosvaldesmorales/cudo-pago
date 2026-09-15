import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function token(){
  const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh falló HTTP ${r.status}: ${d.error_description||d.error||'desconocido'}`);
  return d.access_token;
}
async function read(accessToken,range,render='FORMATTED_VALUE'){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${REVIEW_SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=${render}`;
  let last;
  for(let i=0;i<5;i++){
    const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
    const d=await r.json();
    if(r.ok) return d.values||[];
    last={status:r.status,message:d.error?.message||'desconocido'};
    if(![429,500,502,503,504].includes(r.status)||i===4) break;
    await sleep(700*(2**i));
  }
  throw new Error(`Sheets read ${range} HTTP ${last?.status}: ${last?.message}`);
}
async function metadata(accessToken){
  const fields=encodeURIComponent('properties(title),sheets(properties(title,index,hidden))');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${REVIEW_SHEET_ID}?includeGridData=false&fields=${fields}`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}}),d=await r.json();
  if(!r.ok) throw new Error(`Metadata HTTP ${r.status}: ${d.error?.message||'desconocido'}`);
  return d;
}
function colName(index){let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function onlyFormulas(values){
  const out=[];
  values.forEach((row,r)=>row.forEach((value,c)=>{const text=String(value??'').trim();if(text.startsWith('=')) out.push({cell:`${colName(c)}${r+1}`,formula:text});}));
  return out;
}
function headers(values){return (values[0]||[]).map(v=>String(v??'').trim());}

const accessToken=await token();
const meta=await metadata(accessToken);
const tabs=(meta.sheets||[]).map(s=>s.properties?.title).filter(Boolean);
const rawHeaders=await read(accessToken,'RAW_FORM_REVISION!A1:Z1');
const responseHeaders=await read(accessToken,"'Respuestas de formulario 1'!A1:Z1");
const auditHeaders=await read(accessToken,'AUDITORIA_REVISION!A1:P1');
const rawFormulaWindow=await read(accessToken,'RAW_FORM_REVISION!A1:Z20','FORMULA');
const auditFormulaWindow=await read(accessToken,'AUDITORIA_REVISION!A1:P20','FORMULA');
const formSpec=await read(accessToken,'FORM_SPEC!A1:I20');

const rawFormulas=onlyFormulas(rawFormulaWindow);
const auditFormulas=onlyFormulas(auditFormulaWindow);
const formulaText=[...rawFormulas,...auditFormulas].map(x=>x.formula).join('\n');
const referencedTabs=[...new Set(tabs.filter(tab=>new RegExp(`(?:'${tab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'|${tab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})!`,'i').test(formulaText)))];

const report={
  ok:true,
  mode:'READ_ONLY_REVIEW_SOURCE_FORMULA_DISCOVERY',
  timestamp:new Date().toISOString(),
  spreadsheet_title:meta.properties?.title||null,
  tabs,
  response_headers:headers(responseHeaders),
  raw_revision_headers:headers(rawHeaders),
  audit_headers:headers(auditHeaders),
  raw_revision_formulas:rawFormulas,
  audit_formulas:auditFormulas,
  formula_referenced_tabs:referencedTabs,
  form_spec:formSpec,
  conclusions:{
    raw_revision_has_formulas:rawFormulas.length>0,
    audit_has_formulas:auditFormulas.length>0,
    response_sheet_referenced:referencedTabs.includes('Respuestas de formulario 1'),
    raw_revision_referenced:referencedTabs.includes('RAW_FORM_REVISION')
  }
};
fs.mkdirSync('qa-review-probe',{recursive:true});
fs.writeFileSync('qa-review-probe/read-only-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:true,title:report.spreadsheet_title,tabs,raw_formula_count:rawFormulas.length,audit_formula_count:auditFormulas.length,formula_referenced_tabs:referencedTabs,conclusions:report.conclusions},null,2));
