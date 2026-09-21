import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const manifestPath=process.env.ARKE_ACCEPTANCE_PATH ||
  path.join(root,'preview-v8','certification','root-acceptance.json');
const baseUrl=(process.env.CUDO_BASE_URL || 'http://127.0.0.1:4173/preview-v8/').replace(/\/+$/,'')+'/';
const reportDir=path.join(root,'qa-root-acceptance');
const reportPath=path.join(reportDir,'report.json');

const failReport=(message,extra={})=>{
  fs.mkdirSync(reportDir,{recursive:true});
  const report={ok:false,error:message,...extra};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
};

if(!fs.existsSync(manifestPath)){
  failReport('manifest missing',{manifestPath});
  process.exit();
}

let manifest;
try{
  manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
}catch(error){
  failReport('manifest must be machine-readable JSON-compatible YAML',{manifestPath,error:error.message});
  process.exit();
}

if(manifest.projection_metadata?.role!=='EXECUTABLE_PROJECTION_NOT_AUTHORITY'){
  failReport('root acceptance must be an executable projection of ARKE, not a parallel authority');
  process.exit();
}
if(!manifest.projection_metadata?.authority_commit||!manifest.projection_metadata?.authority_path){
  failReport('projection metadata missing ARKE authority reference');
  process.exit();
}
if(manifest.schema_version!=='CUDO_ACTIVE_SLICE_ACCEPTANCE_V1'){
  failReport('unexpected manifest schema',{schema_version:manifest.schema_version});
  process.exit();
}
if(manifest.status!=='ACTIVE'||manifest.wip_limit!==1){
  failReport('active slice must be ACTIVE with WIP=1',{status:manifest.status,wip_limit:manifest.wip_limit});
  process.exit();
}
if(!Array.isArray(manifest.acceptance_steps)||!manifest.acceptance_steps.length){
  failReport('acceptance_steps missing');
  process.exit();
}

const requiredIds=new Set(manifest.acceptance_steps.filter(x=>x.required).map(x=>x.id));
const expectedIds=[
  'CUDO-AS-01-ENTRYPOINT',
  'CUDO-AS-02-HUMAN-CONTEXT',
  'CUDO-AS-03-ACCOUNTABLE-ASSIGNEE',
  'CUDO-AS-04-NEXT-ACTION',
  'CUDO-AS-05-ACTION-PATH',
  'CUDO-AS-06-BLOCKERS-EVIDENCE-HISTORY',
  'CUDO-AS-07-CLOSURE-RESULT',
  'CUDO-AS-08-TRACE-PROGRESSIVE',
  'CUDO-AS-09-NO-SYNTHETIC-CONFUSION',
  'CUDO-AS-10-PERSISTENCE-AUTHORITY',
  'CUDO-AS-11-INDEPENDENT-HUMAN-FIRST'
];
for(const id of expectedIds){
  if(!requiredIds.has(id)){
    failReport('required root criterion missing',{id});
    process.exit();
  }
}

const sourcePath=path.join(root,'preview-v8','control','index.html');
if(!fs.existsSync(sourcePath)){
  failReport('primary control source missing',{sourcePath});
  process.exit();
}
const primarySource=fs.readFileSync(sourcePath,'utf8');

const results=[];
const add=(id,pass,evidence,detail='')=>results.push({id,pass:Boolean(pass),evidence,detail});
const runtimeProof=id=>{
  const step=manifest.acceptance_steps.find(x=>x.id===id);
  const proof=step?.runtime_certification;
  return {pass:proof?.state==='PASS'&&Boolean(proof?.evidence_ref),proof:proof||null};
};

let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});

  await page.goto(baseUrl+'admin/',{waitUntil:'networkidle'});
  const controlLink=page.getByRole('link',{name:/Control del club/i}).first();
  const controlLinkVisible=await controlLink.isVisible().catch(()=>false);
  if(controlLinkVisible){
    await Promise.all([
      page.waitForURL(url=>url.pathname.includes('/club-operacion-lab/')||url.pathname.includes('/control/'),{timeout:15000}).catch(()=>{}),
      controlLink.click()
    ]);
    await page.waitForLoadState('networkidle').catch(()=>{});
  }
  const finalUrl=page.url();
  const entryPass=controlLinkVisible && /\/preview-v8\/control\//.test(new URL(finalUrl).pathname);
  add('CUDO-AS-01-ENTRYPOINT',entryPass,{controlLinkVisible,finalUrl},
    entryPass?'Admin reaches Control through the normal path':'Admin entrypoint did not reach Control');

  if(!finalUrl.includes('/control/')){
    await page.goto(baseUrl+'control/',{waitUntil:'networkidle'});
  }
  await page.waitForFunction(
    ()=>document.querySelector('[data-acceptance="assignee"]') || document.querySelector('#caseList .empty'),
    {timeout:15000}
  );

  const visibleText=(await page.locator('body').innerText()).replace(/\s+/g,' ').trim();

  const markerText=async selector=>{
    const loc=page.locator(selector).first();
    if(!await loc.isVisible().catch(()=>false)) return null;
    return (await loc.innerText().catch(()=>'' )).replace(/\s+/g,' ').trim();
  };

  const humanContext=await markerText('[data-acceptance="human-context"]');
  add('CUDO-AS-02-HUMAN-CONTEXT',Boolean(humanContext&&humanContext.length>=20),
    {text:humanContext},humanContext?'Human context marker visible':'Missing human-context marker');

  const accountable=await markerText('[data-acceptance="accountable"]');
  const assignee=await markerText('[data-acceptance="assignee"]');
  add('CUDO-AS-03-ACCOUNTABLE-ASSIGNEE',Boolean(accountable&&assignee),
    {accountable,assignee},accountable&&assignee?'Both concepts visible':'Accountable/assignee distinction missing');

  const nextAction=await markerText('[data-acceptance="next-action"]');
  add('CUDO-AS-04-NEXT-ACTION',Boolean(nextAction),
    {text:nextAction},nextAction?'Next action visible':'Missing next-action marker');

  const actionCount=await page.locator('[data-acceptance-action="assign"],[data-acceptance-action="reassign"],[data-acceptance-action="transition"]').count();
  const visibleActions=[];
  for(let i=0;i<actionCount;i++){
    const loc=page.locator('[data-acceptance-action="assign"],[data-acceptance-action="reassign"],[data-acceptance-action="transition"]').nth(i);
    if(await loc.isVisible().catch(()=>false)) visibleActions.push(await loc.getAttribute('data-acceptance-action'));
  }
  const activityFrame=page.locator('#cudoActivityActionFrame').first();
  const activityFrameVisible=await activityFrame.isVisible().catch(()=>false);
  const activityFrameSrc=await activityFrame.getAttribute('src').catch(()=>null);
  const stableActivitySurface=activityFrameVisible &&
    /script\.google\.com\/macros\/s\/AKfycbw1WjtJHJZO5RaJ6mtL6Um9afRKXArw9th-wLtUdY7qmClxvF7S3s1JUNL7-5WUjBCeDQ\/exec/.test(activityFrameSrc||'');

  const actionProof=runtimeProof('CUDO-AS-05-ACTION-PATH');
  const hasTransition=visibleActions.includes('transition');
  const hasAssignment=visibleActions.includes('assign')||visibleActions.includes('reassign');
  add('CUDO-AS-05-ACTION-PATH',stableActivitySurface&&hasTransition&&hasAssignment&&actionProof.pass,
    {visibleActions,activityFrameVisible,activityFrameSrc,runtime_certification:actionProof.proof},
    stableActivitySurface&&hasTransition&&hasAssignment&&actionProof.pass
      ? 'Primary Control embeds the governed activity action surface and its persistent QA roundtrip is certified'
      : 'Action path is not bound to the primary Control surface and runtime-certified');

  const blockers=await markerText('[data-acceptance="blockers"]');
  const evidence=await markerText('[data-acceptance="evidence"]');
  const history=await markerText('[data-acceptance="history"]');
  const supportProof=runtimeProof('CUDO-AS-06-BLOCKERS-EVIDENCE-HISTORY');
  add('CUDO-AS-06-BLOCKERS-EVIDENCE-HISTORY',Boolean(blockers&&evidence&&history)&&supportProof.pass,
    {blockers,evidence,history,runtime_certification:supportProof.proof},
    blockers&&evidence&&history&&supportProof.pass
      ? 'Blocker/dependency/evidence/history roundtrip certified'
      : 'Visibility alone is insufficient; executed blocker/dependency/evidence/history proof pending');

  const closeVisible=await page.locator('[data-acceptance-action="close"]').first().isVisible().catch(()=>false);
  const resultText=await markerText('[data-acceptance="result"]');
  const closeProof=runtimeProof('CUDO-AS-07-CLOSURE-RESULT');
  add('CUDO-AS-07-CLOSURE-RESULT',Boolean(stableActivitySurface&&closeVisible&&resultText)&&closeProof.pass,
    {activityFrameVisible,activityFrameSrc,closeVisible,resultText,runtime_certification:closeProof.proof},
    stableActivitySurface&&closeVisible&&resultText&&closeProof.pass
      ? 'Closure/result is available from primary Control through the governed action surface with persistent QA proof'
      : 'Closure/result requires a primary-surface binding plus executed persistent roundtrip');

  const progressiveEntryCount=await page.getByRole('button',{name:/Ver origen|Por qué aparece|Ver historial/i}).count()
    + await page.getByRole('link',{name:/Ver origen|Por qué aparece|Ver historial/i}).count();
  const forbidden=(manifest.forbidden_primary_language||[]).filter(token=>visibleText.includes(token));
  add('CUDO-AS-08-TRACE-PROGRESSIVE',progressiveEntryCount>0&&forbidden.length===0,
    {progressiveEntryCount,forbidden},progressiveEntryCount>0&&forbidden.length===0?
      'Traceability is secondary':'Traceability still dominates primary language or lacks human entrypoint');

  const syntheticTokens=['Persona Mock','Directiva Mock','QA SINTÉTICA','Contrato visual','Restablecer demo'];
  const syntheticVisible=syntheticTokens.filter(token=>visibleText.includes(token));
  add('CUDO-AS-09-NO-SYNTHETIC-CONFUSION',syntheticVisible.length===0,
    {syntheticVisible},syntheticVisible.length?'Synthetic/legacy content visible in primary flow':'No synthetic confusion in primary flow');

  const localAuthorityTokens=['localStorage.setItem(','localStorage.getItem(','localStorage.removeItem('];
  const localAuthority=localAuthorityTokens.filter(token=>primarySource.includes(token));
  const persistenceProof=runtimeProof('CUDO-AS-10-PERSISTENCE-AUTHORITY');
  add('CUDO-AS-10-PERSISTENCE-AUTHORITY',localAuthority.length===0&&persistenceProof.pass,
    {localAuthority,runtime_certification:persistenceProof.proof},
    localAuthority.length
      ? 'Browser-local authority still present in primary source'
      : persistenceProof.pass
        ? 'Persistent authority/audit roundtrip certified'
        : 'No browser-local authority, but persistent roundtrip proof is still pending');

  const independent=manifest.acceptance_steps.find(x=>x.id==='CUDO-AS-11-INDEPENDENT-HUMAN-FIRST')?.external_review;
  const independentPass=independent?.state==='PASS'&&Boolean(independent?.evidence_ref);
  add('CUDO-AS-11-INDEPENDENT-HUMAN-FIRST',independentPass,
    {state:independent?.state||null,evidence_ref:independent?.evidence_ref||null},
    independentPass?'Independent human-first acceptance recorded':'Independent human-first acceptance pending');

  await browser.close();
  browser=null;

  const requiredFailures=results.filter(r=>requiredIds.has(r.id)&&!r.pass);
  const report={
    ok:requiredFailures.length===0,
    schema_version:'CUDO_ROOT_ACCEPTANCE_REPORT_V1',
    slice_id:manifest.slice_id,
    declared_human_intent:manifest.declared_human_intent,
    base_url:baseUrl,
    manifest_path:manifestPath,
    root_progress_metric:manifest.progress_policy?.primary_metric||null,
    results,
    required_failures:requiredFailures.map(x=>x.id),
    production_write:false
  };
  fs.mkdirSync(reportDir,{recursive:true});
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(requiredFailures.length){
    throw new Error('ROOT ACCEPTANCE FAIL: '+requiredFailures.map(x=>x.id).join(', '));
  }
}catch(error){
  if(browser) await browser.close().catch(()=>{});
  if(!fs.existsSync(reportPath)){
    failReport(error.message,{stack:error.stack});
  }else{
    console.error(error.message);
    process.exitCode=1;
  }
}
