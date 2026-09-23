import fs from 'node:fs';

const SHEET_ID='1Yf2JeTLY6_Vk9URlV2FoXhuKWyJGcXEePx1OmApEYqA';
const TABS=['ACTIVIDADES','FRENTES','RESPONSABLES','TAREAS','EVENTOS'];
const OUT='evidence/event-work-review-assignment/inventory.json';

async function token(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('OAuth secrets missing');
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})
  });
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error('OAuth refresh failed');
  return d.access_token;
}

async function values(access,range){
  const u=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r=await fetch(u,{headers:{Authorization:`Bearer ${access}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`Sheets HTTP ${r.status}: ${d.error?.message||'unknown'}`);
  return d.values||[];
}

function rowObject(headers,row){
  return Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']));
}

async function main(){
  const access=await token();
  const result={
    schema_version:'CUDO_EVENT_WORK_REGISTRY_INVENTORY_V1',
    generated_at:new Date().toISOString(),
    spreadsheet_id:SHEET_ID,
    production_write:false,
    tabs:{}
  };
  for(const tab of TABS){
    const rows=await values(access,`'${tab}'!A:AZ`);
    const headers=rows[0]||[];
    result.tabs[tab]={
      headers,
      row_count:Math.max(0,rows.length-1),
      sample_rows:rows.slice(1,4).map(r=>rowObject(headers,r))
    };
  }
  fs.mkdirSync('evidence/event-work-review-assignment',{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
