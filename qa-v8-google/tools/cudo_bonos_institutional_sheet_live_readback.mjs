// CUDO original GitHub Actions OAuth only: real existing Sheets API READBACK.
// No writes, no buyers, no money, no new OAuth client or credentials.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {SHEET_ID,SHEETS} from './cudo_bonos_caja_institutional_sink.mjs';
import {getAccessToken,readRange} from './refresh_real_flow_san_ramon_google_sheet.mjs';

export function inspectInstitutionalHeaderReadback(book){
 const result={contract:'CUDO_BONOS_INSTITUTIONAL_SCHEMA_READ_V1',bookId:SHEET_ID,headerConsistent:true,
  legacyRowsPreserved:true,existingTxIds:0,productionWrite:false};
 for(const spec of Object.values(SHEETS)){
  const rows=book?.[spec.name];
  if(!Array.isArray(rows)||!Array.isArray(rows[0])||
     JSON.stringify(rows[0].slice(0,spec.header.length))!==JSON.stringify(spec.header))
   throw Error('INSTITUTIONAL_CUDO_HEADER_MISMATCH_'+spec.name);
  result.existingTxIds+=rows.slice(1).filter(row=>typeof row?.[spec.tx]==='string'&&row[spec.tx]!=='').length;
 }
 return result;
}
export async function readInstitutionalSchemaWithOriginalOAuth(){
 const token=await getAccessToken(),data={};
 for(const spec of Object.values(SHEETS)){
  const last=String.fromCharCode(64+spec.header.length);
  // Header and first historic row are sufficient for schema validation.
  data[spec.name]=await readRange(token,"'"+spec.name+"'!A1:"+last+"2",SHEET_ID);
 }
 return inspectInstitutionalHeaderReadback(data);
}
const isMain=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(isMain){
 try{const x=await readInstitutionalSchemaWithOriginalOAuth();
  console.log(JSON.stringify({ok:true,...x}));}
 catch(e){console.error(JSON.stringify({ok:false,reason:String(e?.message||e).slice(0,130)}));process.exitCode=1}
}
