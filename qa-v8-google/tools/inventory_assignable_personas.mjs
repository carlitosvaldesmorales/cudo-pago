import fs from 'node:fs';

const SHEET_ID='1X4fefDQaaktoTGjzU77SXFrYj4n9JuaUm45Tnldiu0Y';
const RANGE="'PERSONAS_CONTROL'!A:AZ";
const WORK_SHEET_ID='1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw';
const WORK_RANGE="'WORK_CONTROL'!A:AZ";
const OUT='evidence/event-work-real-people/personas-inventory.json';

async function token(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('OAuth secrets missing');
  const r=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})
  });
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error('OAuth refresh failed');
  return d.access_token;
}
function clean(v){return String(v??'').trim();}
async function main(){
  const access=await token();
  const url='https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/'+encodeURIComponent(RANGE)+'?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE';
  const r=await fetch(url,{headers:{Authorization:'Bearer '+access}});
  const d=await r.json();
  if(!r.ok) throw new Error('Sheets HTTP '+r.status+': '+(d.error?.message||'unknown'));
  const rows=d.values||[], headers=(rows[0]||[]).map(clean);
  const workUrl='https://sheets.googleapis.com/v4/spreadsheets/'+WORK_SHEET_ID+'/values/'+encodeURIComponent(WORK_RANGE)+'?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE';
  const wr=await fetch(workUrl,{headers:{Authorization:'Bearer '+access}});
  const wd=await wr.json();
  if(!wr.ok) throw new Error('WORK_CONTROL HTTP '+wr.status+': '+(wd.error?.message||'unknown'));
  const workRows=wd.values||[], workHeaders=(workRows[0]||[]).map(clean);
  const workObjects=workRows.slice(1).map(row=>Object.fromEntries(workHeaders.map((h,i)=>[h,clean(row[i])]))).filter(o=>workHeaders.some(h=>o[h]));
  const actorMap=new Map();
  for(const row of workObjects){
    const actorId=clean(row.RESPONSIBLE_ACTOR_ID),name=clean(row.RESPONSIBLE);
    if(actorId&&name&&!actorMap.has(actorId)) actorMap.set(actorId,{person_ref:actorId,person_display:name,source:'ACTOR_OPERATIONAL',status:'ACTIVE_EVIDENCE_BACKED'});
  }
  const objects=rows.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,clean(row[i])]))).filter(o=>headers.some(h=>o[h]));
  const safeFields=['ID_PERSONA','NOMBRE_PUBLICO','RELACION_CUDO','FUNCION_CLUB','ESTADO','PUBLICAR','PRIVACIDAD'];
  const safe=(o)=>Object.fromEntries(safeFields.filter(k=>headers.includes(k)).map(k=>[k,o[k]||'']));
  const active=objects.filter(o=>clean(o.ESTADO).toUpperCase()==='ALTA');
  const assignable=active.filter(o=>{
    const privacy=clean(o.PRIVACIDAD).toUpperCase();
    return !privacy || privacy==='INTERNO' || privacy==='PRIVADO';
  });
  const result={
    schema_version:'CUDO_ASSIGNABLE_PERSONAS_INVENTORY_V1',
    generated_at:new Date().toISOString(),
    spreadsheet_id:SHEET_ID,
    control_sheet:'PERSONAS_CONTROL',
    production_write:false,
    headers,
    row_count:objects.length,
    state_counts:Object.fromEntries([...new Set(objects.map(o=>clean(o.ESTADO)||'(VACIO)'))].sort().map(s=>[s,objects.filter(o=>(clean(o.ESTADO)||'(VACIO)')===s).length])),
    active_count:active.length,
    assignable_count:assignable.length,
    assignable_people:assignable.map(safe),
    operational_actor_projection:{
      headers:workHeaders,
      row_count:workObjects.length,
      actor_count:actorMap.size,
      actors:[...actorMap.values()]
    },
    combined_assignable_count:actorMap.size+assignable.length,
    safe_fields_exposed:safeFields.filter(k=>headers.includes(k)),
    sensitive_fields_omitted:true
  };
  fs.mkdirSync('evidence/event-work-real-people',{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
