import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'sports-bus/worker/public-results-ux-v2.js');
const evidencePath = path.join(repoRoot, 'ops/ux-validator/evidence-v2.md');
const outDir = path.join(repoRoot, 'artifacts/ux-validator');
const istaraRoot = process.env.ISTARA_ROOT || '/tmp/istara';
fs.mkdirSync(outDir, { recursive: true });

const source = fs.readFileSync(sourcePath, 'utf8');
const evidence = fs.readFileSync(evidencePath, 'utf8');

function readPersona(agent) {
  return fs.readFileSync(path.join(istaraRoot, 'backend/app/agents/personas', agent, 'CORE.md'), 'utf8').slice(0, 3200);
}
function functionExcerpt(code, name, nextName) {
  const start=code.indexOf(`async function ${name}`); if(start<0)return '';
  const end=nextName?code.indexOf(`async function ${nextName}`,start+1):-1;
  return code.slice(start,end>start?end:Math.min(code.length,start+4200));
}
function interactionExcerpt(code) {
  return [
    functionExcerpt(code,'showHome','showDatePicker'),
    functionExcerpt(code,'showDatePicker','showRound'),
    functionExcerpt(code,'showRound','showMatch'),
    functionExcerpt(code,'showMatch','showClubPicker'),
    functionExcerpt(code,'showClubPicker','showClub'),
    functionExcerpt(code,'showSeriesPicker','showSeriesDates')
  ].filter(Boolean).join('\n\n');
}
function deterministicMetrics(code) {
  const hs=code.indexOf('async function showHome'), he=code.indexOf('async function showDatePicker');
  const home=hs>=0&&he>hs?code.slice(hs,he):'';
  const homeChoiceCount=(home.match(/callback_data:/g)||[]).length;
  const usesSendMessage=/['"]sendMessage['"]/.test(code);
  const usesEditMessageText=/['"]editMessageText['"]/.test(code);
  const hasDateBranch=code.includes("data==='px:dates'")&&/px:d:/.test(code);
  const hasMatchBranch=/px:m:/.test(code);
  const navigationDepthToMatchFromHome=hasDateBranch&&hasMatchBranch?3:null;
  const showsCompletenessSuffix=/series_count[^\n]*\/4|\/4`/.test(code);
  const messageAccumulationRisk=usesSendMessage&&!usesEditMessageText;
  const structuralRedFlag=Boolean(messageAccumulationRisk&&homeChoiceCount>=5&&navigationDepthToMatchFromHome>=3);
  return {homeChoiceCount,usesSendMessage,usesEditMessageText,navigationDepthToMatchFromHome,showsCompletenessSuffix,messageAccumulationRisk,structuralRedFlag};
}

const reportSchema={
  type:'object',additionalProperties:false,
  required:['verdict','highest_severity','confidence','findings','what_to_preserve','redesign_principles','unknowns'],
  properties:{
    verdict:{type:'string',enum:['PASS','REJECT','CONDITIONAL']},
    highest_severity:{type:'string',enum:['P0','P1','P2','P3','NONE']},
    confidence:{type:'integer'},
    findings:{type:'array',minItems:2,maxItems:2,items:{type:'object',additionalProperties:false,required:['severity','evidence','impact','recommendation'],properties:{severity:{type:'string',enum:['P0','P1','P2','P3']},evidence:{type:'string'},impact:{type:'string'},recommendation:{type:'string'}}}},
    what_to_preserve:{type:'array',maxItems:2,items:{type:'string'}},
    redesign_principles:{type:'array',minItems:1,maxItems:3,items:{type:'string'}},
    unknowns:{type:'array',maxItems:2,items:{type:'string'}}
  }
};

const metrics=deterministicMetrics(source);
const uiCode=interactionExcerpt(source);
const commonTask=`
PRODUCT: Fútbol Chépica public football-results flow in Telegram iOS.
PRIMARY JOB: a casual supporter wants the latest verified result with minimal effort; older results must remain discoverable.
SCOPE: IA, interaction flow, cognitive load, clarity and mobile fit. Do not evaluate backend/data integrity.
RULE: Evaluate CURRENT V2 only. Prior redesign ideas are hypotheses, not answers.
STRUCTURAL METRICS FROM REAL SOURCE: ${JSON.stringify(metrics)}
HUMAN E2E EVIDENCE:\n${evidence}
CURRENT INTERACTION CODE EXCERPT:\n\`\`\`javascript\n${uiCode}\n\`\`\`
OUTPUT DISCIPLINE: exactly 2 highest-priority findings. Confidence is integer 0-100. Each evidence/impact/recommendation field max 25 words. Each list item max 18 words. No preamble, no markdown, no extra keys.
`;

const agents=[
  {name:'Sage',istaraAgent:'istara-ux-eval',model:'qwen2.5:1.5b',focus:'Cognitive walkthrough: decisions, information scent, working memory, depth, backtracking, speed to primary job.'},
  {name:'Pixel',istaraAgent:'istara-ui-audit',model:'smollm2:1.7b',focus:'Heuristic UI audit: status, language, consistency, recognition, control, hierarchy, accessibility, unnecessary information.'}
];

function callOllama(payload,agentName){
  const req=path.join('/tmp',`ux-${agentName.toLowerCase()}-request.json`),res=path.join('/tmp',`ux-${agentName.toLowerCase()}-response.json`);
  fs.writeFileSync(req,JSON.stringify(payload));
  try{execFileSync('curl',['--silent','--show-error','--fail-with-body','--connect-timeout','10','--max-time','780','-H','Content-Type: application/json','--data-binary',`@${req}`,'-o',res,'http://127.0.0.1:11434/api/generate'],{stdio:'inherit',timeout:790000});}
  catch{let b='';try{b=fs.readFileSync(res,'utf8')}catch{};throw new Error(`${agentName} local Ollama call failed${b?`: ${b.slice(0,2000)}`:''}`);}
  return JSON.parse(fs.readFileSync(res,'utf8'));
}
function runAgent(agent){
  const prompt=`OPEN-SOURCE INDEPENDENT VALIDATOR\nYou are not the implementer. Apply this pinned Istara role critically.\n\nISTARA PERSONA EXCERPT:\n${readPersona(agent.istaraAgent)}\n\nASSIGNMENT:\n${agent.focus}\n${commonTask}`;
  const body=callOllama({model:agent.model,prompt,stream:false,format:reportSchema,keep_alive:0,options:{temperature:0,seed:agent.name==='Sage'?4201:9917,num_ctx:4096,num_predict:1000}},agent.name);
  fs.writeFileSync(path.join(outDir,`${agent.name.toLowerCase()}-raw.json`),JSON.stringify(body,null,2));
  let parsed; try{parsed=JSON.parse(body.response)}catch{throw new Error(`${agent.name} returned invalid JSON: ${String(body.response||'').slice(0,4000)}`)}
  parsed.confidence=Math.max(0,Math.min(100,Number(parsed.confidence)||0));
  parsed.agent=agent.name; parsed.istara_agent=agent.istaraAgent; parsed.model=agent.model; parsed.runtime_seconds=Number(((body.total_duration||0)/1e9).toFixed(1));
  return parsed;
}

const reports=[];
for(const agent of agents){console.log(`Running ${agent.name} with ${agent.model}...`);reports.push(runAgent(agent));console.log(`${agent.name} complete: ${reports.at(-1).verdict}`)}
const verdicts=reports.map(r=>r.verdict);
let consensus='CONDITIONAL';
if(verdicts.every(v=>v==='REJECT'))consensus='REJECT';
else if(metrics.structuralRedFlag&&verdicts.includes('REJECT'))consensus='REJECT';
else if(verdicts.every(v=>v==='PASS')&&!metrics.structuralRedFlag)consensus='PASS';
const result={generated_at:new Date().toISOString(),methodology:{orchestrator:'local deterministic runner',external_agent_framework:'Istara personas pinned by workflow commit',runtime:'Ollama local CPU',models:agents.map(a=>a.model),paid_api_required:false,source_evaluated:'sports-bus/worker/public-results-ux-v2.js'},deterministic_metrics:metrics,validators:reports,consensus};
fs.writeFileSync(path.join(outDir,'report.json'),JSON.stringify(result,null,2));
const md=['# Open-source UX validation — Telegram public results V2','',`**Consensus:** ${consensus}`,'','## Deterministic structural evidence','','```json',JSON.stringify(metrics,null,2),'```','',...reports.flatMap(r=>[`## ${r.agent} — ${r.model}`,'',`Verdict: **${r.verdict}** · Highest severity: **${r.highest_severity}** · Confidence: **${r.confidence}/100** · Runtime: **${r.runtime_seconds}s**`,'',...r.findings.map(f=>`- **${f.severity}** — ${f.evidence} → ${f.impact} → ${f.recommendation}`),'',`**Preserve:** ${r.what_to_preserve.join('; ')}`,'',`**Redesign principles:** ${r.redesign_principles.join('; ')}`,'',`**Unknowns:** ${r.unknowns.join('; ')}`,''])].join('\n');
fs.writeFileSync(path.join(outDir,'report.md'),md);console.log(md);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');console.log(`UX_CONSENSUS=${consensus}`);
