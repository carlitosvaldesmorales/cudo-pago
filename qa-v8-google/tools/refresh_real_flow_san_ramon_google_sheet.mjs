import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const QA_SPREADSHEET_ID='1SBeVjOan92rcJfW4T5jO47rLF2JuUuh3yiepLUqb_lk';
export const OBLIGATION_RANGE='FINANCIAL_OBLIGATIONS!A1:I2';
export const MANIFEST_RANGE='MANIFEST!A1:B12';
export const ADAPTER_VERSION='CUDO_REAL_QA_SHEETS_REFRESH_ADAPTER_V1';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR=path.resolve(__dirname,'../evidence/real-flow-san-ramon');

function clone(v){return JSON.parse(JSON.stringify(v));}
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function trimRows(values){
  const rows=(values||[]).map(row=>[...(row||[])]);
  while(rows.length&&rows[rows.length-1].every(v=>v===''||v===null||v===undefined)) rows.pop();
  return rows.map(row=>{
    let copy=[...row];
    while(copy.length&&(copy[copy.length-1]===''||copy[copy.length-1]===null||copy[copy.length-1]===undefined)) copy.pop();
    return copy;
  });
}
function same(a,b){return JSON.stringify(stable(trimRows(a)))===JSON.stringify(stable(trimRows(b)));}

export function buildExpectedReadModel(){
  const financial=JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR,'financial-obligations.json'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR,'manifest.json'),'utf8'));
  const obligationValues=clone(financial.values);
  const manifestValues=[
    ['KEY','VALUE'],
    ['FLOW_ID',manifest.flow_id],
    ['SOURCE_ARTIFACT',manifest.real_source.artifact],
    ['SOURCE_SHEET',manifest.real_source.sheet],
    ['SOURCE_RANGE',manifest.real_source.range],
    ['SOURCE_REVISION',manifest.source_revision],
    ['TRANSACTION_ID',manifest.transaction_id],
    ['SOURCE_CHANGES',manifest.source_changes],
    ['DERIVED_RECALCULATIONS',manifest.derived_recalculations],
    ['PERSISTENCE_MODE','CANONICAL_ADAPTER_QA_REFRESH'],
    ['PRODUCTION_WRITE',false],
    ['ADAPTER_VERSION',ADAPTER_VERSION]
  ];
  return {
    schema_version:'CUDO_REAL_QA_SHEETS_EXPECTED_READ_MODEL_V1',
    spreadsheet_id:QA_SPREADSHEET_ID,
    source_revision:manifest.source_revision,
    obligation_values:obligationValues,
    manifest_values:manifestValues,
    fingerprint:digest({obligationValues,manifestValues})
  };
}

export function manifestRevision(values){
  const rows=trimRows(values);
  for(const row of rows.slice(1)){
    if(String(row[0]??'').trim()==='SOURCE_REVISION') return String(row[1]??'').trim();
  }
  return '';
}

export function planQaSheetRefresh({currentObligations,currentManifest,expectedCurrentRevision=null,apply=false}){
  const expected=buildExpectedReadModel();
  const currentRevision=manifestRevision(currentManifest);
  const obligationsMatch=same(currentObligations,expected.obligation_values);
  const manifestMatch=same(currentManifest,expected.manifest_values);
  const currentFingerprint=digest({
    obligations:trimRows(currentObligations),
    manifest:trimRows(currentManifest)
  });

  if(obligationsMatch&&manifestMatch){
    return {
      ok:true,status:'NOOP_ALREADY_CURRENT',
      source_revision:expected.source_revision,
      current_revision:currentRevision,
      current_fingerprint:currentFingerprint,
      expected_fingerprint:expected.fingerprint,
      writes_planned:0,writes_applied:0,
      production_write:false
    };
  }

  if(!apply){
    return {
      ok:true,status:'DRY_RUN_CHANGES_REQUIRED',
      source_revision:expected.source_revision,
      current_revision:currentRevision,
      current_fingerprint:currentFingerprint,
      expected_fingerprint:expected.fingerprint,
      writes_planned:2,writes_applied:0,
      production_write:false
    };
  }

  if(!expectedCurrentRevision){
    return {
      ok:false,status:'BLOCKED_EXPECTED_CURRENT_REVISION_REQUIRED',
      source_revision:expected.source_revision,
      current_revision:currentRevision,
      writes_planned:0,writes_applied:0,
      production_write:false
    };
  }
  if(currentRevision!==expectedCurrentRevision){
    return {
      ok:false,status:'CONFLICT_CURRENT_REVISION_MISMATCH',
      source_revision:expected.source_revision,
      expected_current_revision:expectedCurrentRevision,
      current_revision:currentRevision,
      writes_planned:0,writes_applied:0,
      production_write:false
    };
  }

  return {
    ok:true,status:'READY_TO_APPLY',
    source_revision:expected.source_revision,
    expected_current_revision:expectedCurrentRevision,
    current_revision:currentRevision,
    current_fingerprint:currentFingerprint,
    expected_fingerprint:expected.fingerprint,
    writes_planned:2,writes_applied:0,
    production_write:false
  };
}

async function getAccessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [name,value] of Object.entries({client_id,client_secret,refresh_token})){
    if(!value) throw new Error(`Google OAuth secret missing: ${name}`);
  }
  const body=new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const data=await r.json();
  if(!r.ok||!data.access_token) throw new Error(`OAuth refresh failed HTTP ${r.status}: ${data.error_description||data.error||'unknown'}`);
  return data.access_token;
}

async function readRange(token,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${QA_SPREADSHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  const data=await r.json();
  if(!r.ok) throw new Error(`Sheets read ${range} HTTP ${r.status}: ${data.error?.message||'unknown'}`);
  return data.values||[];
}
async function writeBothRanges(token,expected){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${QA_SPREADSHEET_ID}/values:batchUpdate`;
  const body={
    valueInputOption:'RAW',
    data:[
      {range:OBLIGATION_RANGE,majorDimension:'ROWS',values:expected.obligation_values},
      {range:MANIFEST_RANGE,majorDimension:'ROWS',values:expected.manifest_values}
    ],
    includeValuesInResponse:false
  };
  const r=await fetch(url,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const data=await r.json();
  if(!r.ok) throw new Error(`Sheets batch write HTTP ${r.status}: ${data.error?.message||'unknown'}`);
  return data;
}

export async function refreshRealQaSheet({
  apply=false,
  expectedCurrentRevision=null,
  beforeWriteHook=null
}={}){
  if(process.env.CUDO_QA_SAN_RAMON_SPREADSHEET_ID&&process.env.CUDO_QA_SAN_RAMON_SPREADSHEET_ID!==QA_SPREADSHEET_ID){
    throw new Error('Safety gate: configured spreadsheet ID is not the allowlisted San Ramon QA sheet');
  }
  const token=await getAccessToken();
  const firstObligations=await readRange(token,OBLIGATION_RANGE);
  const firstManifest=await readRange(token,MANIFEST_RANGE);
  const plan=planQaSheetRefresh({
    currentObligations:firstObligations,
    currentManifest:firstManifest,
    expectedCurrentRevision,
    apply
  });
  if(plan.status==='NOOP_ALREADY_CURRENT'||!apply||!plan.ok) return plan;

  if(typeof beforeWriteHook==='function') await beforeWriteHook();

  // TOCTOU guard: re-read immediately before write and require byte-semantic equality with preflight.
  const secondObligations=await readRange(token,OBLIGATION_RANGE);
  const secondManifest=await readRange(token,MANIFEST_RANGE);
  if(!same(secondObligations,firstObligations)||!same(secondManifest,firstManifest)){
    return {
      ok:false,status:'CONFLICT_SURFACE_CHANGED_AFTER_PREFLIGHT',
      source_revision:plan.source_revision,
      writes_planned:0,writes_applied:0,
      production_write:false
    };
  }

  const expected=buildExpectedReadModel();
  await writeBothRanges(token,expected);

  const verifyObligations=await readRange(token,OBLIGATION_RANGE);
  const verifyManifest=await readRange(token,MANIFEST_RANGE);
  if(!same(verifyObligations,expected.obligation_values)||!same(verifyManifest,expected.manifest_values)){
    return {
      ok:false,status:'POST_WRITE_VERIFICATION_FAILED',
      source_revision:expected.source_revision,
      writes_planned:2,writes_applied:2,
      production_write:false
    };
  }
  return {
    ok:true,status:'APPLIED_AND_VERIFIED',
    source_revision:expected.source_revision,
    previous_revision:plan.current_revision,
    surface_fingerprint_before:plan.current_fingerprint,
    expected_fingerprint:expected.fingerprint,
    writes_planned:2,writes_applied:2,
    spreadsheet_id:QA_SPREADSHEET_ID,
    adapter_version:ADAPTER_VERSION,
    production_write:false
  };
}

const isMain=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(isMain){
  const apply=String(process.env.CUDO_QA_SHEET_APPLY||'').toLowerCase()==='true';
  const expectedCurrentRevision=process.env.CUDO_QA_EXPECT_CURRENT_REVISION||null;
  const result=await refreshRealQaSheet({apply,expectedCurrentRevision});
  console.log(JSON.stringify(result,null,2));
  if(!result.ok) process.exitCode=1;
}
