export const REVIEW_SHEET_ID='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
export const PERSONAS_SHEET_ID='1X4fefDQaaktoTGjzU77SXFrYj4n9JuaUm45Tnldiu0Y';
export const AUDIT_SHEET='AUDITORIA_REVISION';
export const CONTROL_SHEET='PERSONAS_CONTROL';
export const REVISION_SHEET='REVISION';
export const REVISION_HEADERS=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION','REVISOR','FECHA_REVISION','OBSERVACIONES'];

function clean(v){return String(v??'').trim();}
function norm(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function rowsToObjects(values){
  if(!values.length) return [];
  const h=values[0].map(clean);
  return values.slice(1).map((row,i)=>({__row:i+2,...Object.fromEntries(h.map((x,j)=>[x,clean(row[j])]))})).filter(r=>h.some(x=>r[x]));
}
function colName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
export function personaDecision(value){
  const d=norm(value);
  if(['DAR DE ALTA','APROBAR ALTA','ALTA'].includes(d)) return 'ACTIVATE';
  if(['PEDIR CORRECCION','SOLICITAR CORRECCION'].includes(d)) return 'REQUEST_CORRECTION';
  if(['RECHAZAR','RECHAZAR FICHA'].includes(d)) return 'REJECT';
  return null;
}
function revisionRow(action,id,reviewer,timestamp,observations){
  if(action==='ACTIVATE') return [id,'ALTA','NO','INTERNO','AUTORIZADO',reviewer,timestamp,observations];
  if(action==='REQUEST_CORRECTION') return [id,'REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE',reviewer,timestamp,observations];
  if(action==='REJECT') return [id,'RECHAZADO','NO','INTERNO','PENDIENTE',reviewer,timestamp,observations];
  return null;
}
export async function planPersonaReviewDecisions({readValues,now=()=>new Date().toISOString(),expectedPending=null}){
  const [audit,control,revisions]=await Promise.all([
    readValues(REVIEW_SHEET_ID,`${AUDIT_SHEET}!A:P`),
    readValues(PERSONAS_SHEET_ID,`${CONTROL_SHEET}!A:W`),
    readValues(PERSONAS_SHEET_ID,`${REVISION_SHEET}!A:H`)
  ]);
  if(!audit.length||!control.length||!revisions.length) throw new Error('PERSONA: faltan encabezados de auditoría/control/revisión');
  const ah=audit[0].map(clean),ch=control[0].map(clean),rh=revisions[0].map(clean);
  const ai=Object.fromEntries(ah.map((h,i)=>[h,i]));
  for(const h of ['TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','OBSERVACIONES','REVISOR','ESTADO_PROCESO']) if(ai[h]===undefined) throw new Error(`PERSONA: falta ${h} en AUDITORIA_REVISION`);
  if(ch[0]!=='ID_PERSONA') throw new Error('PERSONA: PERSONAS_CONTROL debe comenzar con ID_PERSONA');
  if(JSON.stringify(rh.slice(0,REVISION_HEADERS.length))!==JSON.stringify(REVISION_HEADERS)) throw new Error('PERSONA: contrato REVISION inesperado');
  const people=rowsToObjects(control),rev=rowsToObjects(revisions);
  const pending=audit.slice(1).map((row,i)=>({row,rowNumber:i+2})).filter(({row})=>norm(row[ai.TIPO_CONTENIDO])==='PERSONA'&&clean(row[ai.IDENTIFICADOR_HUMANO])&&clean(row[ai.DECISION])&&!clean(row[ai.ESTADO_PROCESO]));
  if(expectedPending!==null&&pending.length!==expectedPending) throw new Error(`PERSONA safety gate: pendientes ${pending.length}, esperado ${expectedPending}`);
  const mutations=[],summary=[];
  for(const {row,rowNumber} of pending){
    const id=clean(row[ai.IDENTIFICADOR_HUMANO]),decision=clean(row[ai.DECISION]),action=personaDecision(decision),ts=now();
    const reviewer=clean(row[ai.REVISOR]),obs=clean(row[ai.OBSERVACIONES]);
    const matches=people.filter(p=>p.ID_PERSONA===id);
    let status='APLICADO',result='',resolvedId='';
    if(matches.length!==1){status='BLOQUEADO';result=`Bloqueado: resolución ${matches.length===0?'sin coincidencias':'ambigua'}`;}
    else if(!action){status='BLOQUEADO';result='Bloqueado: decisión PERSONA no implementada';resolvedId=id;}
    else if(!reviewer){status='BLOQUEADO';result='Bloqueado: revisor vacío';resolvedId=id;}
    else {
      resolvedId=id;
      const next=revisionRow(action,id,reviewer,ts,obs);
      const existing=rev.find(r=>r.ID===id);
      if(existing){
        mutations.push({op:'update',kind:'PERSONA_REVISION',spreadsheetId:PERSONAS_SHEET_ID,range:`${REVISION_SHEET}!A${existing.__row}:${colName(REVISION_HEADERS.length)}${existing.__row}`,values:[next]});
      }else{
        mutations.push({op:'append',kind:'PERSONA_REVISION',spreadsheetId:PERSONAS_SHEET_ID,range:`${REVISION_SHEET}!A:H`,values:[next]});
        rev.push({__row:rev.length+2,ID:id});
      }
      result=`${decision} aplicado sin publicación automática`;
    }
    mutations.push({op:'update',kind:'AUDIT',spreadsheetId:REVIEW_SHEET_ID,range:`${AUDIT_SHEET}!J${rowNumber}:N${rowNumber}`,values:[[status,resolvedId,matches.length?String(matches.length):'0',result,ts]]});
    summary.push({row:rowNumber,id,decision,action,status,result});
  }
  return {ok:true,module:'PERSONA',pending_count:pending.length,summary,mutations};
}

async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function getAccessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID,client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET,refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  if(!client_id||!client_secret||!refresh_token) throw new Error('PERSONA: OAuth Google incompleto');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})});
  const d=await r.json(); if(!r.ok||!d.access_token) throw new Error(`PERSONA OAuth HTTP ${r.status}`); return d.access_token;
}
async function adapter(){
  const token=await getAccessToken();
  const request=async(method,url,body)=>{let last;for(let i=0;i<5;i++){const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();const d=text?JSON.parse(text):{};if(r.ok)return d;last={status:r.status,d};if(![429,500,502,503,504].includes(r.status)||i===4)break;await sleep(700*(2**i));}throw new Error(`PERSONA Sheets HTTP ${last?.status}: ${last?.d?.error?.message||'desconocido'}`);};
  return {
    readValues:async(id,range)=>(await request('GET',`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`)).values||[],
    updateValues:async(id,range,values)=>request('PUT',`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,{range,majorDimension:'ROWS',values}),
    appendValues:async(id,range,values)=>request('POST',`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,{range,majorDimension:'ROWS',values})
  };
}
export async function applyPersonaReviewDecisions(opts={}){
  const a=opts.readValues?opts:await adapter();
  const plan=await planPersonaReviewDecisions(a);
  for(const m of plan.mutations){
    if(m.op==='update') await a.updateValues(m.spreadsheetId,m.range,m.values);
    else if(m.op==='append') await a.appendValues(m.spreadsheetId,m.range,m.values);
  }
  return {...plan,applied:true,writes_applied:plan.mutations.length};
}

if(import.meta.url===`file://${process.argv[1]}`){
  applyPersonaReviewDecisions().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack||e);process.exit(1);});
}
