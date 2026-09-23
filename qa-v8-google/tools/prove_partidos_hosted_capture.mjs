import fs from 'node:fs';
import { chromium } from 'playwright';

const FORM='https://docs.google.com/forms/d/e/1FAIpQLSfD8jwbGL_kUAYm2A6DR3yYmANMoyTr2ja609JTFqBH9zvg2w/viewform';
const SHEET_ID='1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI';
const RUN_ID=process.env.GITHUB_RUN_ID||String(Date.now());
const MARKER=`CUDO-QA-HOSTED-PARTIDO-${RUN_ID}`;
const OUTDIR='evidence/partidos-hosted-capture-poc';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function norm(v){return String(v||'').replace(/\s+/g,' ').trim();}
function ensureOut(){fs.mkdirSync(OUTDIR,{recursive:true});}
function question(page,re){return page.locator('[role="listitem"]:visible').filter({hasText:re}).last();}

async function select(page,re,optionRe){
  const item=question(page,re);
  if(await item.count()!==1) throw new Error(`Question missing: ${re}`);
  const lb=item.locator('[role="listbox"]:visible').first();
  if(await lb.count()!==1) throw new Error(`Listbox missing: ${re}`);
  await lb.click({timeout:10000});
  await page.waitForTimeout(250);
  const options=page.locator('[role="option"]:visible');
  const observed=[];
  for(let i=0;i<await options.count();i++){
    const o=options.nth(i);
    const text=norm(await o.innerText().catch(()=>''));
    const value=norm(await o.getAttribute('data-value'));
    const aria=norm(await o.getAttribute('aria-label'));
    observed.push({text,value,aria});
    if((value&&optionRe.test(value))||(text&&optionRe.test(text))||(aria&&optionRe.test(aria))){
      await o.click({timeout:10000});
      await page.waitForTimeout(300);
      return value||text||aria;
    }
  }
  throw new Error(`Option not found ${optionRe}; observed=${JSON.stringify(observed).slice(0,3000)}`);
}

async function fillText(page,re,value){
  const item=question(page,re);
  if(await item.count()!==1) throw new Error(`Question missing: ${re}`);
  const input=item.locator('input[type="text"]:visible,textarea:visible').first();
  if(await input.count()!==1) throw new Error(`Text input missing: ${re}`);
  await input.fill(value);
}

async function refreshAccessToken(){
  const client_id=process.env.CUDO_GOOGLE_OAUTH_CLIENT_ID;
  const client_secret=process.env.CUDO_GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh_token=process.env.CUDO_GOOGLE_REFRESH_TOKEN;
  for(const [k,v] of Object.entries({client_id,client_secret,refresh_token})) if(!v) throw new Error(`${k} missing`);
  const body=new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();
  if(!r.ok||!d.access_token) throw new Error(`OAuth refresh HTTP ${r.status}: ${d.error_description||d.error||'unknown'}`);
  return d.access_token;
}

async function readValues(token,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`Sheets read ${range} HTTP ${r.status}: ${d.error?.message||'unknown'}`);
  return d.values||[];
}

function hasMarker(rows){return rows.some(row=>row.some(v=>String(v??'').includes(MARKER)));}

async function stageSnapshot(token){
  const [provider,raw,control,pub]=await Promise.all([
    readValues(token,"'Respuestas de formulario 1'!A:AZ"),
    readValues(token,"'RAW_FORM_PARTIDOS'!A:AZ"),
    readValues(token,"'CONTROL'!A:AZ"),
    readValues(token,"'PUBLICO_EXPORT'!A:AZ")
  ]);
  return {
    provider:hasMarker(provider),
    raw:hasMarker(raw),
    control:hasMarker(control),
    public_export:hasMarker(pub)
  };
}

async function waitForStages(token,timeoutMs=120000){
  const deadline=Date.now()+timeoutMs;
  let snap=null;
  while(Date.now()<deadline){
    snap=await stageSnapshot(token);
    if(snap.public_export) throw new Error(`Synthetic marker leaked to PUBLICO_EXPORT: ${JSON.stringify(snap)}`);
    if(snap.provider&&snap.raw&&snap.control) return snap;
    await sleep(3000);
  }
  throw new Error(`Timeout waiting downstream stages: ${JSON.stringify(snap)}`);
}

async function main(){
  ensureOut();
  const token=await refreshAccessToken();
  const preflight=await stageSnapshot(token);
  if(preflight.public_export) throw new Error('Marker unexpectedly in PUBLICO_EXPORT before run');

  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  const evidence={
    schema_version:'CUDO_PARTIDOS_HOSTED_CAPTURE_POC_V1',
    generated_at:new Date().toISOString(),
    run_id:RUN_ID,
    marker:MARKER,
    execution_plane:'GitHub_hosted',
    olam_required:false,
    production_write:false,
    real_club_data:false,
    preflight,
    selections:{},
    writes:0,
    form_submit_confirmed:false,
    postflight:null,
    decision:'FAIL'
  };

  try{
    await page.goto(FORM,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1200);

    evidence.selections.competencia=await select(page,/Competencia/i,/^Copa\/Otro$/i);
    await fillText(page,/Jornada o fecha del campeonato/i,'QA Hosted Roundtrip');
    const dateInput=question(page,/Fecha del partido/i).locator('input[type="date"]:visible').first();
    if(await dateInput.count()!==1) throw new Error('Date input missing');
    await dateInput.fill('2026-09-30');

    const timeItem=question(page,/Hora del partido/i);
    const visibleTimeInputs=timeItem.locator('input:visible');
    const timeCount=await visibleTimeInputs.count();
    const timeShape=[];
    for(let i=0;i<timeCount;i++){
      const el=visibleTimeInputs.nth(i);
      timeShape.push({
        index:i,
        type:await el.getAttribute('type'),
        aria:await el.getAttribute('aria-label'),
        placeholder:await el.getAttribute('placeholder')
      });
    }
    evidence.time_input_shape=timeShape;
    const hour=timeItem.locator('input[aria-label="Hora"]:visible,input[aria-label*="hour" i]:visible').first();
    const minute=timeItem.locator('input[aria-label="Minuto"]:visible,input[aria-label*="minute" i]:visible').first();
    if(await hour.count()===1&&await minute.count()===1){
      await hour.fill('15');
      await minute.fill('00');
    }else if(timeCount>=2){
      await visibleTimeInputs.nth(0).fill('15');
      await visibleTimeInputs.nth(1).fill('00');
    }else if(timeCount===1){
      const only=visibleTimeInputs.first();
      const type=await only.getAttribute('type');
      if(type==='time') await only.fill('15:00');
      else throw new Error('Single unsupported time input: '+JSON.stringify(timeShape));
    }else{
      throw new Error('Time inputs missing: '+JSON.stringify(timeShape));
    }

    evidence.selections.categoria=await select(page,/Serie o categoría/i,/^TERCERA$/i);
    await fillText(page,/Equipo local/i,'CUDO');
    await fillText(page,/Equipo visitante/i,'Rival Sintético QA');
    await fillText(page,/Cancha o recinto/i,MARKER);
    evidence.selections.estado=await select(page,/Estado del partido/i,/^FINALIZADO$/i);

    const next=page.getByRole('button',{name:/Siguiente|Next/i}).last();
    if(await next.count()!==1) throw new Error('Next button missing');
    await next.click({timeout:30000});
    await page.waitForTimeout(800);

    const items=page.locator('[role="listitem"]:visible');
    let local=false,visit=false,obs=false;
    const observed=[];
    for(let i=0;i<await items.count();i++){
      const item=items.nth(i);
      const text=norm(await item.innerText().catch(()=>''));
      const inputs=item.locator('input[type="number"]:visible,input[type="text"]:visible,textarea:visible');
      observed.push({text,input_count:await inputs.count()});
      if(await inputs.count()<1) continue;
      const input=inputs.first();
      if(/goles.*(local|cudo)|marcador.*(local|cudo)/i.test(text)){await input.fill('2');local=true;continue;}
      if(/goles.*(visitante|visita|rival)|marcador.*(visitante|visita|rival)/i.test(text)){await input.fill('1');visit=true;continue;}
      if(/observaciones|comentario|aclaraci/i.test(text)){await input.fill(`SYNTHETIC_QA_DO_NOT_PUBLISH:${MARKER}`);obs=true;}
    }
    evidence.score_page_observed=observed;
    if(!local||!visit) throw new Error(`Score fields unresolved local=${local} visit=${visit}`);

    await page.screenshot({path:`${OUTDIR}/before-submit.png`,fullPage:true});

    const submit=page.getByRole('button',{name:/Enviar|Submit/i}).last();
    if(await submit.count()!==1) throw new Error('Submit button missing');
    const formResponsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&/\/formResponse(?:\?|$)/.test(r.url()),{timeout:30000}).catch(()=>null);
    await submit.click({timeout:30000});
    const formResponse=await formResponsePromise;
    await page.waitForTimeout(1000);
    if(!formResponse) throw new Error('Google Form submit response not observed');
    if(formResponse.status()>=400) throw new Error(`Google Form formResponse HTTP ${formResponse.status()}`);
    evidence.form_submit_confirmed=true;
    evidence.form_response_status=formResponse.status();
    evidence.writes=1;

    evidence.postflight=await waitForStages(token);
    evidence.decision=(evidence.postflight.provider&&evidence.postflight.raw&&evidence.postflight.control&&!evidence.postflight.public_export)?'PASS':'FAIL';
    if(evidence.decision!=='PASS') throw new Error(`Acceptance failed: ${JSON.stringify(evidence.postflight)}`);
  } catch(error){
    evidence.error=String(error?.stack||error);
    throw error;
  } finally {
    evidence.completed_at=new Date().toISOString();
    fs.writeFileSync(`${OUTDIR}/latest.json`,JSON.stringify(evidence,null,2)+'\n');
    fs.writeFileSync(`${OUTDIR}/latest.md`,
      `# CUDO Partidos Hosted Capture POC\n\n`+
      `decision: ${evidence.decision}\n`+
      `run_id: ${RUN_ID}\n`+
      `execution_plane: GitHub_hosted\n`+
      `marker: ${MARKER}\n`+
      `production_write: false\n`+
      `form_submit_confirmed: ${evidence.form_submit_confirmed}\n`+
      `postflight: ${JSON.stringify(evidence.postflight)}\n`+
      (evidence.error?`error: ${evidence.error.replace(/\n/g,' ')}\n`:''));
    await browser.close().catch(()=>{});
  }
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
