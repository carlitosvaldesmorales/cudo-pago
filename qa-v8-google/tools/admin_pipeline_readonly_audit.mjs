import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalDecision } from './process_review_decisions.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(__dirname,'../..');
const OUT_DIR=path.resolve(ROOT,'qa-admin-audit');
const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const SCRIPT_ID='1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8';

const ACTIONS=[
  {key:'NOTICIA',label:'Publicar una noticia',provider:'tally',url:'https://tally.so/r/Me4Eel',contract:'qa-v8-google/contracts/noticias-v1.json'},
  {key:'EQUIPO',label:'Administrar equipo o serie',provider:'google',url:'https://docs.google.com/forms/d/e/1FAIpQLScMsSWHj_u6waAtMUSbkyTEr15Ckt1kJPMXaLFNYuWyDzw0uA/viewform',contract:'qa-v8-google/contracts/equipos-v1.json'},
  {key:'PLANTEL',label:'Agregar jugador',provider:'tally',url:'https://tally.so/r/Npj7DO',contract:'qa-v8-google/contracts/plantel-v1.json'},
  {key:'PARTIDO',label:'Registrar partido o resultado',provider:'google',url:'https://docs.google.com/forms/d/e/1FAIpQLSfD8jwbGL_kUAYm2A6DR3yYmANMoyTr2ja609JTFqBH9zvg2w/viewform',contract:'qa-v8-google/contracts/partidos-v1.json'},
  {key:'TABLA',label:'Actualizar tabla',provider:'google',url:'https://docs.google.com/forms/d/e/1FAIpQLSf_WwBEVwZkvlDFMHnfO3FOFG7h9eUd-6DG4Rh6MW6kix696Q/viewform',contract:'qa-v8-google/contracts/tabla-v1.json'},
  {key:'GALERIA',label:'Subir fotos a la galería',provider:'tally',url:'https://tally.so/r/QKZ7MX',contract:'qa-v8-google/contracts/galeria-v1.json'},
];

const SPECIAL_FORMS=[
  {key:'MAINTENANCE',label:'Corregir, actualizar, retirar o reactivar',url:'https://docs.google.com/forms/d/e/1FAIpQLSeHt_FhOGLSks4WjGgyuV6NNboyA8dgtT0bQTR8cinH4oonRg/viewform',expectedSheetId:null},
  {key:'REVIEW',label:'Revisar contenido pendiente',url:'https://docs.google.com/forms/d/e/1FAIpQLScSrCXYIqCQzDSzF22_CBC_uOd20CRnkncWqcQ98nZrE4HgFA/viewform',expectedSheetId:REVIEW_SHEET_ID},
];

function clean(v){return String(v??'').trim();}
function responderId(url){return (String(url).match(/\/forms\/d\/e\/([^/]+)/)||[])[1]||null;}
function nonblankRows(values){return (values||[]).slice(1).filter(row=>(row||[]).some(v=>clean(v))).length;}
function headers(values){return ((values||[])[0]||[]).map(clean);}
function contractFor(action){return JSON.parse(fs.readFileSync(path.resolve(ROOT,action.contract),'utf8'));}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function getAccessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [k,v] of Object.entries({client_id,client_secret,refresh_token})) if(!v) throw new Error(`Missing ${k}`);
  const body=new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh HTTP ${r.status}: ${d.error_description||d.error||'unknown'}`);
  return d.access_token;
}

async function fetchJson(url,options={},attempts=5){
  let last;
  for(let i=0;i<attempts;i++){
    const r=await fetch(url,options);
    const text=await r.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch{data={raw:text.slice(0,300)};}
    if(r.ok) return data;
    last={status:r.status,data};
    if(![429,500,502,503,504].includes(r.status)||i===attempts-1) break;
    await sleep(700*(2**i));
  }
  throw new Error(`HTTP ${last?.status}: ${last?.data?.error?.message||last?.data?.raw||'unknown'}`);
}

async function listDriveForms(token){
  const out=[];
  let pageToken='';
  do{
    const params=new URLSearchParams({
      q:"mimeType='application/vnd.google-apps.form' and trashed=false",
      spaces:'drive',
      pageSize:'1000',
      fields:'nextPageToken,files(id,name,modifiedTime)'
    });
    if(pageToken) params.set('pageToken',pageToken);
    const d=await fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`,{headers:{Authorization:`Bearer ${token}`}});
    out.push(...(d.files||[]));
    pageToken=d.nextPageToken||'';
  }while(pageToken);
  return out;
}

function formQuestions(form){
  return (form.items||[]).map(item=>({
    title:clean(item.title),
    choice_options:(item.questionItem?.question?.choiceQuestion?.options||[]).map(o=>clean(o.value)).filter(Boolean)
  })).filter(item=>item.title);
}

async function discoverGoogleForms(token){
  const driveForms=await listDriveForms(token);
  const expectedIds=new Set([...ACTIONS.filter(a=>a.provider==='google').map(a=>responderId(a.url)),...SPECIAL_FORMS.map(f=>responderId(f.url))]);
  const found=new Map();
  for(const file of driveForms){
    let form;
    try{
      form=await fetchJson(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(file.id)}`,{headers:{Authorization:`Bearer ${token}`}});
    }catch{
      continue;
    }
    const rid=responderId(form.responderUri||'');
    if(rid&&expectedIds.has(rid)){
      found.set(rid,{file_id:file.id,name:file.name||form.info?.title||'',modifiedTime:file.modifiedTime||null,linkedSheetId:form.linkedSheetId||null,responderUri:form.responderUri||null,questions:formQuestions(form)});
    }
    if(found.size===expectedIds.size) break;
    await sleep(80);
  }
  return {accessible_form_files:driveForms.length,found};
}

async function spreadsheetMeta(token,id){
  return fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?includeGridData=false&fields=properties(title),sheets(properties(sheetId,title,index))`,{headers:{Authorization:`Bearer ${token}`}});
}

async function batchValues(token,id,sheetNames){
  if(!sheetNames.length) return {};
  const params=new URLSearchParams({majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});
  for(const name of sheetNames) params.append('ranges',`'${String(name).replaceAll("'","''")}'!A:Z`);
  const d=await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet?${params}`,{headers:{Authorization:`Bearer ${token}`}});
  const result={};
  (d.valueRanges||[]).forEach((vr,i)=>{result[sheetNames[i]]=vr.values||[];});
  return result;
}

async function publicReachability(url){
  try{
    const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 CUDO-readonly-audit'}});
    const text=await r.text();
    return {ok:r.ok,status:r.status,final_url:r.url,title:(text.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]?.trim()||null,body_bytes:text.length};
  }catch(e){return {ok:false,status:null,error:e.message};}
}

async function inspectScriptProject(token){
  try{
    const d=await fetchJson(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/content`,{headers:{Authorization:`Bearer ${token}`}});
    const files=(d.files||[]).map(f=>({name:f.name,type:f.type,mentions_review:/AUDITORIA_REVISION|Review/i.test(f.source||''),mentions_maintenance:/MANTEN|CORRECCI|RETIRO|REACTIV/i.test(f.source||'')}));
    return {ok:true,file_count:files.length,files};
  }catch(e){return {ok:false,error:e.message};}
}

async function main(){
  fs.mkdirSync(OUT_DIR,{recursive:true});
  const token=await getAccessToken();
  const forms=await discoverGoogleForms(token);
  const report={
    ok:true,
    mode:'LIVE_READONLY_ADMIN_PIPELINE_AUDIT',
    generated_at:new Date().toISOString(),
    writes_external:0,
    drive_forms_accessible:forms.accessible_form_files,
    actions:[],
    special_forms:[],
    review_engine_alignment:{},
    script_project:await inspectScriptProject(token),
    gaps:[]
  };

  for(const action of ACTIONS){
    const contract=contractFor(action);
    const sheetId=contract.sync.spreadsheet_id;
    const meta=await spreadsheetMeta(token,sheetId);
    const actualSheets=(meta.sheets||[]).map(s=>s.properties?.title).filter(Boolean);
    const expectedSheets=[contract.pipeline.form_spec_sheet,contract.pipeline.raw_sheet,contract.pipeline.control_sheet,contract.pipeline.public_sheet,'REVISION','CORRECCIONES'];
    const present=expectedSheets.filter(s=>actualSheets.includes(s));
    const missing=expectedSheets.filter(s=>!actualSheets.includes(s));
    const values=await batchValues(token,sheetId,present);
    const sample={};
    for(const name of present){sample[name]={headers:headers(values[name]),nonblank_rows:nonblankRows(values[name])};}
    const reach=await publicReachability(action.url);
    let providerLink={};
    if(action.provider==='google'){
      const rid=responderId(action.url);
      const live=forms.found.get(rid)||null;
      const expectedQuestions=contract.form_mapping.map(m=>m.question);
      const liveTitles=(live?.questions||[]).map(q=>q.title);
      providerLink={
        form_discovered:Boolean(live),
        linked_sheet_id:live?.linkedSheetId||null,
        linked_to_expected_sheet:Boolean(live&&live.linkedSheetId===sheetId),
        expected_question_count:expectedQuestions.length,
        live_question_count:liveTitles.length,
        missing_expected_questions:expectedQuestions.filter(q=>!liveTitles.includes(q))
      };
    }else{
      providerLink={
        public_tally_reachable:reach.ok,
        historical_raw_capture_observed:(sample[contract.pipeline.raw_sheet]?.nonblank_rows||0)>0,
        note:'Tally has no Google Forms linkedSheetId contract; connectivity is evidenced read-only by public form reachability plus historical RAW_FORM rows.'
      };
    }
    const actionOk=reach.ok&&missing.length===0&&(
      action.provider==='google'
        ? providerLink.form_discovered&&providerLink.linked_to_expected_sheet&&providerLink.missing_expected_questions.length===0
        : providerLink.public_tally_reachable&&providerLink.historical_raw_capture_observed
    );
    if(!actionOk) report.gaps.push({scope:action.key,type:'CAPTURE_CONNECTIVITY_NOT_FULLY_PROVEN'});
    report.actions.push({
      key:action.key,label:action.label,provider:action.provider,public_form:reach,
      contract_id:contract.contract_id,spreadsheet_id:sheetId,workbook_title:meta.properties?.title||null,
      expected_sheets:expectedSheets,present_sheets:present,missing_sheets:missing,sheet_samples:sample,provider_link:providerLink,
      readonly_connectivity_pass:actionOk
    });
    await sleep(100);
  }

  for(const special of SPECIAL_FORMS){
    const reach=await publicReachability(special.url);
    const live=forms.found.get(responderId(special.url))||null;
    let linkedWorkbook=null;
    if(live?.linkedSheetId){
      try{
        const meta=await spreadsheetMeta(token,live.linkedSheetId);
        const names=(meta.sheets||[]).map(s=>s.properties?.title).filter(Boolean);
        const vals=await batchValues(token,live.linkedSheetId,names.slice(0,12));
        linkedWorkbook={id:live.linkedSheetId,title:meta.properties?.title||null,sheets:names.map(name=>({name,nonblank_rows:nonblankRows(vals[name]||[]),headers:headers(vals[name]||[])}))};
      }catch(e){linkedWorkbook={id:live.linkedSheetId,error:e.message};}
    }
    const item={
      key:special.key,label:special.label,public_form:reach,form_discovered:Boolean(live),
      linked_sheet_id:live?.linkedSheetId||null,expected_sheet_id:special.expectedSheetId,
      linked_to_expected_sheet:special.expectedSheetId?Boolean(live&&live.linkedSheetId===special.expectedSheetId):null,
      questions:live?.questions||[],linked_workbook:linkedWorkbook
    };
    report.special_forms.push(item);
    if(!reach.ok||!live) report.gaps.push({scope:special.key,type:'FORM_NOT_LIVE_OR_NOT_DISCOVERABLE'});
    if(special.expectedSheetId&&live?.linkedSheetId!==special.expectedSheetId) report.gaps.push({scope:special.key,type:'FORM_LINKED_TO_UNEXPECTED_SHEET'});
  }

  const review=report.special_forms.find(f=>f.key==='REVIEW');
  const decisionQuestion=(review?.questions||[]).find(q=>/decisi[oó]n de revisi[oó]n/i.test(q.title));
  const decisionOptions=decisionQuestion?.choice_options||[];
  const unsupportedDecisions=decisionOptions.filter(v=>!canonicalDecision(v));
  report.review_engine_alignment={
    review_form_linked_to_review_workbook:Boolean(review?.linked_to_expected_sheet),
    decision_options:decisionOptions,
    unsupported_decision_options:unsupportedDecisions,
    all_live_decisions_supported:decisionOptions.length>0&&unsupportedDecisions.length===0
  };
  if(!report.review_engine_alignment.all_live_decisions_supported) report.gaps.push({scope:'REVIEW',type:'LIVE_DECISION_VOCABULARY_NOT_FULLY_SUPPORTED'});

  report.summary={
    admin_actions_total:8,
    capture_actions_total:6,
    capture_actions_readonly_pass:report.actions.filter(a=>a.readonly_connectivity_pass).length,
    special_forms_discovered:report.special_forms.filter(f=>f.form_discovered).length,
    review_decisions_aligned:report.review_engine_alignment.all_live_decisions_supported,
    gap_count:report.gaps.length
  };
  report.ok=report.gaps.length===0;
  fs.writeFileSync(path.join(OUT_DIR,'admin-pipeline-readonly-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:report.ok,mode:report.mode,summary:report.summary,gaps:report.gaps},null,2));
}

await main();
