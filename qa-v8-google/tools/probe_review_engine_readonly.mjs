import fs from 'node:fs';

const CLIENT_ID=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
for(const [name,value] of Object.entries({CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN})) if(!value) throw new Error(`${name} no configurado`);

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function token(){const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json();if(!r.ok||!d.access_token)throw new Error(`OAuth refresh falló HTTP ${r.status}`);return d.access_token;}
async function read(accessToken,range,render='FORMATTED_VALUE'){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${REVIEW_SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=${render}`;
  let last;
  for(let i=0;i<5;i++){const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});const d=await r.json();if(r.ok)return d.values||[];last={status:r.status,message:d.error?.message||'desconocido'};if(![429,500,502,503,504].includes(r.status)||i===4)break;await sleep(700*(2**i));}
  throw new Error(`Sheets read ${range} HTTP ${last?.status}: ${last?.message}`);
}
async function metadata(accessToken){const fields=encodeURIComponent('properties(title),sheets(properties(title,index,hidden))');const url=`https://sheets.googleapis.com/v4/spreadsheets/${REVIEW_SHEET_ID}?includeGridData=false&fields=${fields}`;const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}}),d=await r.json();if(!r.ok)throw new Error(`Metadata HTTP ${r.status}`);return d;}
function colName(index){let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function onlyFormulas(values){const out=[];values.forEach((row,r)=>row.forEach((value,c)=>{const text=String(value??'').trim();if(text.startsWith('='))out.push({cell:`${colName(c)}${r+1}`,formula:text});}));return out;}
function headers(values){return (values[0]||[]).map(v=>String(v??'').trim());}
function normalized(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();}
function responseStats(values){
  const h=headers(values);const rows=values.slice(1);const columns=h.map((header,i)=>{const nonEmpty=rows.filter(r=>String(r[i]??'').trim()!=='').length;const safeEnum=/contenido desea revisar|decisi[oó]n de revisi[oó]n|publicaci[oó]n est[aá] autorizada|autorizaci[oó]n fue verificada|qu[eé] dato se corrige/i.test(header);const distinct=safeEnum?[...new Set(rows.map(r=>String(r[i]??'').trim()).filter(Boolean))].sort():undefined;return {column:colName(i),index:i+1,header,non_empty:nonEmpty,...(safeEnum?{distinct_values:distinct}: {})};});
  const occupancy=rows.map((r,rowIndex)=>({row:rowIndex+2,non_empty_columns:r.map((v,i)=>String(v??'').trim()!==''?colName(i):null).filter(Boolean)}));
  return {data_rows:rows.filter(r=>r.some(v=>String(v??'').trim()!=='')).length,columns,occupancy};
}

const accessToken=await token();const meta=await metadata(accessToken);const tabs=(meta.sheets||[]).map(s=>s.properties?.title).filter(Boolean);
const rawHeaders=await read(accessToken,'RAW_FORM_REVISION!A1:Z1');
const responseValues=await read(accessToken,"'Respuestas de formulario 1'!A1:Q100");
const responseHeaders=[headers(responseValues)];
const auditHeaders=await read(accessToken,'AUDITORIA_REVISION!A1:P1');
const rawFormulaWindow=await read(accessToken,'RAW_FORM_REVISION!A1:Z20','FORMULA');
const auditFormulaWindow=await read(accessToken,'AUDITORIA_REVISION!A1:P20','FORMULA');
const formSpec=await read(accessToken,'FORM_SPEC!A1:I20');
const rawFormulas=onlyFormulas(rawFormulaWindow),auditFormulas=onlyFormulas(auditFormulaWindow);const formulaText=[...rawFormulas,...auditFormulas].map(x=>x.formula).join('\n');
const referencedTabs=[...new Set(tabs.filter(tab=>new RegExp(`(?:'${tab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'|${tab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})!`,'i').test(formulaText)))];
const stats=responseStats(responseValues);
const currentDecisionValues=new Set(['APROBAR PUBLICACION','RECHAZAR PUBLICACION','APROBAR RETIRO','APROBAR REACTIVACION','APROBAR CORRECCION']);
const decisionColumns=stats.columns.filter(c=>/decisi[oó]n de revisi[oó]n/i.test(c.header));
const activeDecisionColumns=decisionColumns.filter(c=>(c.distinct_values||[]).some(v=>currentDecisionValues.has(normalized(v))));
const report={ok:true,mode:'READ_ONLY_REVIEW_SOURCE_FORMULA_DISCOVERY',timestamp:new Date().toISOString(),spreadsheet_title:meta.properties?.title||null,tabs,response_headers:headers(responseHeaders),raw_revision_headers:headers(rawHeaders),audit_headers:headers(auditHeaders),raw_revision_formulas:rawFormulas,audit_formulas:auditFormulas,formula_referenced_tabs:referencedTabs,form_spec:formSpec,response_schema_stats:stats,conclusions:{raw_revision_has_formulas:rawFormulas.length>0,audit_has_formulas:auditFormulas.length>0,response_sheet_referenced:referencedTabs.includes('Respuestas de formulario 1'),raw_revision_referenced:referencedTabs.includes('RAW_FORM_REVISION'),response_column_count:stats.columns.length,active_decision_columns:activeDecisionColumns.map(c=>c.column),raw_copy_formula:rawFormulas.find(f=>f.cell==='A2')?.formula||null,raw_copy_covers_active_decision_columns:activeDecisionColumns.every(c=>c.index<=10)}};
fs.mkdirSync('qa-review-probe',{recursive:true});fs.writeFileSync('qa-review-probe/read-only-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,response_column_count:report.conclusions.response_column_count,active_decision_columns:report.conclusions.active_decision_columns,raw_copy_formula:report.conclusions.raw_copy_formula,raw_copy_covers_active_decision_columns:report.conclusions.raw_copy_covers_active_decision_columns,column_non_empty:stats.columns.map(c=>({column:c.column,header:c.header,non_empty:c.non_empty})),occupancy:stats.occupancy},null,2));
