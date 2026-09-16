import fs from 'node:fs/promises';
import { resolveSocialReference } from './resolver.mjs';

const SHEET_ID='1fvJedi1WiI_lm-WFGXls4STjddAcdz3_wQN8GG11B94';
const RANGE="'PLANTEL_CONTROL'!A:P";
const QA_PREFIX='QA Social Ref ';

function need(name){
  const value=String(process.env[name]||'').trim();
  if(!value) throw new Error(`${name} not configured`);
  return value;
}

async function accessToken(){
  const body=new URLSearchParams({
    client_id:need('CUDO_GOOGLE_OAUTH_CLIENT_ID'),
    client_secret:need('CUDO_GOOGLE_OAUTH_CLIENT_SECRET'),
    refresh_token:need('CUDO_GOOGLE_REFRESH_TOKEN'),
    grant_type:'refresh_token'
  });
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh failed HTTP ${r.status}`);
  return d.access_token;
}

async function readValues(token){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  const d=await r.json();
  if(!r.ok) throw new Error(`Sheets read failed HTTP ${r.status}: ${d?.error?.message||'unknown'}`);
  return d.values||[];
}

const token=await accessToken();
const rows=await readValues(token);
if(rows.length<2) throw new Error('PLANTEL_CONTROL has no data rows');
const headers=rows[0].map(v=>String(v||'').trim());
const idx=Object.fromEntries(headers.map((h,i)=>[h,i]));
for(const required of ['ID_INTERNO','NOMBRE_DEPORTIVO_PUBLICO','FOTO_REF','ESTADO','PUBLICAR','RED_SOCIAL_REF']){
  if(!(required in idx)) throw new Error(`Missing header ${required}`);
}

const candidates=[];
for(let i=1;i<rows.length;i++){
  const row=rows[i]||[];
  const name=String(row[idx.NOMBRE_DEPORTIVO_PUBLICO]||'').trim();
  if(!name.startsWith(QA_PREFIX)) continue;
  const social=String(row[idx.RED_SOCIAL_REF]||'').trim();
  const foto=String(row[idx.FOTO_REF]||'').trim();
  const estado=String(row[idx.ESTADO]||'').trim();
  const publicar=String(row[idx.PUBLICAR]||'').trim();
  if(!social || foto || estado!=='PENDIENTE_REVISION' || publicar!=='NO') continue;
  const resolved=await resolveSocialReference(social);
  candidates.push({
    source_row:i+1,
    id:String(row[idx.ID_INTERNO]||'').trim(),
    name,
    social,
    estado,
    publicar,
    resolver:{
      status:resolved.status,
      provider:resolved.provider,
      kind:resolved.kind,
      canonical_url:resolved.canonical_url,
      enrichment_attempted:resolved.enrichment_attempted,
      reason:resolved.reason,
      image_candidate:resolved.image_candidate
    }
  });
}

if(candidates.length!==1) throw new Error(`Expected exactly 1 QA social candidate, found ${candidates.length}`);
const item=candidates[0];
if(item.resolver.reason!=='PUBLIC_CONTENT_IMAGE_CANDIDATE_PASS') throw new Error(`Expected image candidate PASS, got ${item.resolver.reason}`);
if(!(item.resolver.image_candidate?.bytes>0)) throw new Error('Image candidate has no bytes');

const out={
  timestamp:new Date().toISOString(),
  scope:'QA_ONLY_REAL_TALLY_TO_SHEET_TO_RESOLVER',
  production_v8_touched:false,
  real_club_data_processed:false,
  user_oauth_required:false,
  result:'PASS',
  candidate:item
};
const outputPath=process.env.CUDO_EVIDENCE_PATH||'sheet-e2e-result.json';
await fs.writeFile(outputPath,JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
