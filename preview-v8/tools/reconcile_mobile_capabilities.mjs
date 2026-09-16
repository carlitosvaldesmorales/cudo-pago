import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contractPath=path.join(root,'preview-v8/certification/mobile-capabilities.json');
const outDir=path.resolve('qa-auto-development-reconciler');
const selfTest=process.argv.includes('--self-test');

const fail=message=>{throw new Error(`CUDO RECONCILER: ${message}`)};
const basename=p=>String(p||'').split('/').pop();

function classifyEvidence(run){
  if(!run) return {state:'MISSING_EVIDENCE',reason:'no_completed_workflow_run_found'};
  if(run.conclusion==='success') return {state:'PASS',reason:'latest_completed_run_success'};
  if(['failure','timed_out','startup_failure'].includes(run.conclusion)) return {state:'FAIL',reason:`latest_completed_run_${run.conclusion}`};
  return {state:'INCONCLUSIVE',reason:`latest_completed_run_${run.conclusion||'unknown'}`};
}

function chooseRun(testId,test,runs){
  const workflowName=basename(test.workflow);
  let candidates=runs.filter(r=>basename(r.path)===workflowName && r.status==='completed');
  if(test.source==='qa-v8-google-data') candidates=candidates.filter(r=>r.head_branch==='qa-v8-google-data');
  else if(testId==='LIVE_PRODUCTION_E2E') candidates=candidates.filter(r=>r.head_branch==='main');
  else candidates=candidates.filter(r=>r.event==='pull_request');
  candidates.sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));
  return candidates[0]||null;
}

function reconcile(contract,runs){
  const catalog=contract.automation_catalog||{};
  const capabilities=(contract.capabilities||[]).filter(c=>c.status==='active');
  const testEvidence={};

  for(const [testId,test] of Object.entries(catalog)){
    const run=chooseRun(testId,test,runs);
    const classification=classifyEvidence(run);
    testEvidence[testId]={
      ...classification,
      workflow:test.workflow,
      source:test.source,
      run:run?{
        id:run.id,
        html_url:run.html_url,
        event:run.event,
        head_branch:run.head_branch,
        head_sha:run.head_sha,
        conclusion:run.conclusion,
        created_at:run.created_at,
        updated_at:run.updated_at
      }:null
    };
  }

  const reconciled=capabilities.map((capability,index)=>{
    const evidence=capability.tests.map(testId=>({test_id:testId,...(testEvidence[testId]||{state:'MISSING_EVIDENCE',reason:'test_not_in_catalog'})}));
    const states=evidence.map(e=>e.state);
    let state='CLOSED';
    if(states.includes('FAIL')) state='REGRESSION';
    else if(states.includes('INCONCLUSIVE')) state='BLOCKED';
    else if(states.includes('MISSING_EVIDENCE')) state='GAP';
    return {
      priority:index,
      id:capability.id,
      state,
      release_blocking:capability.release_blocking===true,
      evidence
    };
  });

  const next=reconciled.find(c=>c.state==='REGRESSION')
    || reconciled.find(c=>c.state==='GAP')
    || reconciled.find(c=>c.state==='BLOCKED')
    || null;

  let nextExecutableAction={type:'NONE',capability:null,test:null,reason:'all_declared_capabilities_closed_by_available_automation_evidence'};
  if(next){
    const target=next.evidence.find(e=>e.state==='FAIL')
      || next.evidence.find(e=>e.state==='MISSING_EVIDENCE')
      || next.evidence.find(e=>e.state==='INCONCLUSIVE');
    nextExecutableAction={
      type:next.state==='REGRESSION'?'REPAIR_CAPABILITY':next.state==='GAP'?'MATERIALIZE_OR_RUN_EVIDENCE':'RESOLVE_BLOCKER',
      capability:next.id,
      test:target?.test_id||null,
      reason:target?.reason||next.state
    };
  }

  return {
    schema_version:'0.1-poc',
    mode:'READ_ONLY_RECONCILIATION',
    invariant:'TEST_EVIDENCE_DRIVES_NEXT_ENGINEERING_ACTION',
    generated_at:new Date().toISOString(),
    capabilities:reconciled,
    summary:{
      closed:reconciled.filter(c=>c.state==='CLOSED').length,
      regression:reconciled.filter(c=>c.state==='REGRESSION').length,
      gap:reconciled.filter(c=>c.state==='GAP').length,
      blocked:reconciled.filter(c=>c.state==='BLOCKED').length
    },
    next_executable_action:nextExecutableAction
  };
}

async function githubJson(url,token){
  const response=await fetch(url,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'}});
  if(!response.ok()) fail(`GitHub API ${response.status} ${url}`);
  return response.json();
}

async function fetchRuns(repo,token){
  const encoded=encodeURIComponent(repo);
  const urls=[
    `https://api.github.com/repos/${encoded}/actions/runs?status=completed&per_page=100`,
    `https://api.github.com/repos/${encoded}/actions/runs?branch=qa-v8-google-data&status=completed&per_page=100`,
    `https://api.github.com/repos/${encoded}/actions/runs?branch=main&status=completed&per_page=100`,
    `https://api.github.com/repos/${encoded}/actions/runs?event=pull_request&status=completed&per_page=100`
  ];
  const all=[];
  for(const url of urls){
    const data=await githubJson(url,token);
    all.push(...(data.workflow_runs||[]));
  }
  const byId=new Map();
  for(const run of all) byId.set(run.id,run);
  return [...byId.values()];
}

function markdown(report){
  const lines=[
    '# CUDO automatic development reconciler',
    '',
    `Generated: ${report.generated_at}`,
    '',
    '| Capability | State |',
    '|---|---|'
  ];
  for(const c of report.capabilities) lines.push(`| ${c.id} | ${c.state} |`);
  lines.push('',`Next action: **${report.next_executable_action.type}**`);
  if(report.next_executable_action.capability) lines.push(`Capability: \`${report.next_executable_action.capability}\``);
  if(report.next_executable_action.test) lines.push(`Test: \`${report.next_executable_action.test}\``);
  lines.push('',`Reason: ${report.next_executable_action.reason}`,'');
  return lines.join('\n');
}

function runSelfTest(){
  const contract={automation_catalog:{T1:{workflow:'.github/workflows/t1.yml',source:'local'},T2:{workflow:'.github/workflows/t2.yml',source:'qa-v8-google-data'}},capabilities:[{id:'a',status:'active',release_blocking:true,tests:['T1']},{id:'b',status:'active',release_blocking:true,tests:['T2']}]};
  const base={status:'completed',event:'pull_request',path:'.github/workflows/t1.yml',head_branch:'feature',updated_at:'2026-09-16T10:00:00Z'};
  let report=reconcile(contract,[{...base,id:1,conclusion:'success'}]);
  if(report.capabilities[0].state!=='CLOSED'||report.capabilities[1].state!=='GAP'||report.next_executable_action.capability!=='b') fail('self-test GAP selection failed');
  report=reconcile(contract,[{...base,id:2,conclusion:'failure'}]);
  if(report.capabilities[0].state!=='REGRESSION'||report.next_executable_action.type!=='REPAIR_CAPABILITY') fail('self-test REGRESSION priority failed');
  const qa={id:3,status:'completed',event:'workflow_dispatch',path:'.github/workflows/t2.yml',head_branch:'qa-v8-google-data',updated_at:'2026-09-16T11:00:00Z',conclusion:'success'};
  report=reconcile(contract,[{...base,id:4,conclusion:'success'},qa]);
  if(report.summary.closed!==2||report.next_executable_action.type!=='NONE') fail('self-test CLOSED failed');
  console.log(JSON.stringify({ok:true,self_test:'PASS'},null,2));
}

if(selfTest){
  runSelfTest();
  process.exit(0);
}

if(!fs.existsSync(contractPath)) fail('missing mobile-capabilities.json');
const contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));
const token=process.env.GITHUB_TOKEN;
const repo=process.env.GITHUB_REPOSITORY||'carlitosvaldesmorales/cudo-pago';
if(!token) fail('GITHUB_TOKEN required for live reconciliation');
const runs=await fetchRuns(repo,token);
const report=reconcile(contract,runs);
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'reconciliation.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(outDir,'reconciliation.md'),markdown(report));
console.log(JSON.stringify(report,null,2));
