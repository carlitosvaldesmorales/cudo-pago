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
  const file = path.join(istaraRoot, 'backend/app/agents/personas', agent, 'CORE.md');
  return fs.readFileSync(file, 'utf8').slice(0, 3600);
}

function functionExcerpt(code, name, nextName) {
  const start = code.indexOf(`async function ${name}`);
  if (start < 0) return '';
  const end = nextName ? code.indexOf(`async function ${nextName}`, start + 1) : -1;
  return code.slice(start, end > start ? end : Math.min(code.length, start + 5000));
}

function interactionExcerpt(code) {
  return [
    functionExcerpt(code, 'showHome', 'showDatePicker'),
    functionExcerpt(code, 'showDatePicker', 'showRound'),
    functionExcerpt(code, 'showRound', 'showMatch'),
    functionExcerpt(code, 'showMatch', 'showClubPicker'),
    functionExcerpt(code, 'showClubPicker', 'showClub'),
    functionExcerpt(code, 'showSeriesPicker', 'showSeriesDates'),
    functionExcerpt(code, 'send', 'telegram')
  ].filter(Boolean).join('\n\n');
}

function deterministicMetrics(code) {
  const homeStart = code.indexOf('async function showHome');
  const homeEnd = code.indexOf('async function showDatePicker');
  const home = homeStart >= 0 && homeEnd > homeStart ? code.slice(homeStart, homeEnd) : '';
  const homeChoiceCount = (home.match(/callback_data:/g) || []).length;
  const usesSendMessage = /['"]sendMessage['"]/.test(code);
  const usesEditMessageText = /['"]editMessageText['"]/.test(code);
  const hasDateBranch = code.includes("data==='px:dates'") && /px:d:/.test(code);
  const hasMatchBranch = /px:m:/.test(code);
  const navigationDepthToMatchFromHome = hasDateBranch && hasMatchBranch ? 3 : null;
  const showsCompletenessSuffix = /series_count[^\n]*\/4|\/4`/.test(code);
  const messageAccumulationRisk = usesSendMessage && !usesEditMessageText;
  const structuralRedFlag = Boolean(messageAccumulationRisk && homeChoiceCount >= 5 && navigationDepthToMatchFromHome >= 3);
  return {homeChoiceCount,usesSendMessage,usesEditMessageText,navigationDepthToMatchFromHome,showsCompletenessSuffix,messageAccumulationRisk,structuralRedFlag};
}

const reportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict','highest_severity','confidence','findings','what_to_preserve','redesign_principles','unknowns'],
  properties: {
    verdict: { type: 'string', enum: ['PASS','REJECT','CONDITIONAL'] },
    highest_severity: { type: 'string', enum: ['P0','P1','P2','P3','NONE'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    findings: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity','evidence','impact','recommendation'],
        properties: {
          severity: { type: 'string', enum: ['P0','P1','P2','P3'] },
          evidence: { type: 'string', maxLength: 360 },
          impact: { type: 'string', maxLength: 280 },
          recommendation: { type: 'string', maxLength: 300 }
        }
      }
    },
    what_to_preserve: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 180 } },
    redesign_principles: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', maxLength: 220 } },
    unknowns: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 180 } }
  }
};

const metrics = deterministicMetrics(source);
const uiCode = interactionExcerpt(source);
const commonTask = `
PRODUCT: Fútbol Chépica public football-results flow inside Telegram on iOS.
PRIMARY USER JOB: a casual supporter wants the latest verified result with minimal effort, while older results remain discoverable by date, club or series.
SCOPE: information architecture, interaction flow, cognitive load, clarity and mobile fit only.
IMPORTANT: Evaluate CURRENT V2 only. Do not assume that any prior redesign idea is correct.

STRUCTURAL METRICS FROM REAL SOURCE:
${JSON.stringify(metrics)}

HUMAN E2E EVIDENCE:
${evidence}

INTERACTION FUNCTIONS EXTRACTED FROM CURRENT SOURCE:
\`\`\`javascript
${uiCode}
\`\`\`

Return the requested structured report. Use at most 3 findings. Every finding must cite supplied evidence, not an invented user behavior.
`;

const agents = [
  {name:'Sage',istaraAgent:'istara-ux-eval',model:'qwen2.5:1.5b',focus:'Cognitive walkthrough: decision points, information scent, working-memory burden, depth, backtracking, speed to the primary job.'},
  {name:'Pixel',istaraAgent:'istara-ui-audit',model:'smollm2:1.7b',focus:'Heuristic UI audit: system status, real-world language, consistency, recognition over recall, user control, hierarchy, accessibility, unnecessary information.'}
];

function callOllama(payload, agentName) {
  const requestFile = path.join('/tmp', `ux-${agentName.toLowerCase()}-request.json`);
  const responseFile = path.join('/tmp', `ux-${agentName.toLowerCase()}-response.json`);
  fs.writeFileSync(requestFile, JSON.stringify(payload));
  try {
    execFileSync('curl', ['--silent','--show-error','--fail-with-body','--connect-timeout','10','--max-time','780','-H','Content-Type: application/json','--data-binary',`@${requestFile}`,'-o',responseFile,'http://127.0.0.1:11434/api/generate'], {stdio:'inherit',timeout:790000});
  } catch {
    let body=''; try{body=fs.readFileSync(responseFile,'utf8')}catch{}
    throw new Error(`${agentName} local Ollama call failed${body?`: ${body.slice(0,2000)}`:''}`);
  }
  return JSON.parse(fs.readFileSync(responseFile,'utf8'));
}

function runAgent(agent) {
  const persona = readPersona(agent.istaraAgent);
  const prompt = `OPEN-SOURCE INDEPENDENT VALIDATOR\nYou are not the implementer. Apply the pinned Istara role critically.\n\nISTARA PERSONA EXCERPT:\n${persona}\n\nASSIGNMENT:\n${agent.focus}\n${commonTask}`;
  const body = callOllama({model:agent.model,prompt,stream:false,format:reportSchema,keep_alive:0,options:{temperature:0,seed:agent.name==='Sage'?4201:9917,num_ctx:4096,num_predict:620}},agent.name);
  fs.writeFileSync(path.join(outDir, `${agent.name.toLowerCase()}-raw.json`), JSON.stringify(body,null,2));
  let parsed;
  try { parsed=JSON.parse(body.response); }
  catch { throw new Error(`${agent.name} returned invalid JSON: ${String(body.response||'').slice(0,2400)}`); }
  parsed.agent=agent.name;
  parsed.istara_agent=agent.istaraAgent;
  parsed.model=agent.model;
  parsed.runtime_seconds=Number(((body.total_duration||0)/1e9).toFixed(1));
  return parsed;
}

const reports=[];
for(const agent of agents){
  console.log(`Running ${agent.name} with ${agent.model}...`);
  reports.push(runAgent(agent));
  console.log(`${agent.name} complete: ${reports.at(-1).verdict}`);
}

const verdicts=reports.map(r=>r.verdict);
let consensus='CONDITIONAL';
if(verdicts.every(v=>v==='REJECT')) consensus='REJECT';
else if(metrics.structuralRedFlag&&verdicts.includes('REJECT')) consensus='REJECT';
else if(verdicts.every(v=>v==='PASS')&&!metrics.structuralRedFlag) consensus='PASS';

const result={generated_at:new Date().toISOString(),methodology:{orchestrator:'local deterministic runner',external_agent_framework:'Istara personas pinned by workflow commit',runtime:'Ollama local CPU',models:agents.map(a=>a.model),paid_api_required:false,source_evaluated:'sports-bus/worker/public-results-ux-v2.js'},deterministic_metrics:metrics,validators:reports,consensus};
fs.writeFileSync(path.join(outDir,'report.json'),JSON.stringify(result,null,2));

const md=['# Open-source UX validation — Telegram public results V2','',`**Consensus:** ${consensus}`,'','## Deterministic structural evidence','','```json',JSON.stringify(metrics,null,2),'```','',...reports.flatMap(r=>[`## ${r.agent} — ${r.model}`,'',`Verdict: **${r.verdict}** · Highest severity: **${r.highest_severity}** · Confidence: **${r.confidence}** · Runtime: **${r.runtime_seconds}s**`,'',...r.findings.map(f=>`- **${f.severity}** — ${f.evidence} → ${f.impact} → ${f.recommendation}`),'',`**Preserve:** ${r.what_to_preserve.join('; ')}`,'',`**Redesign principles:** ${r.redesign_principles.join('; ')}`,'',`**Unknowns:** ${r.unknowns.join('; ')}`,''])].join('\n');
fs.writeFileSync(path.join(outDir,'report.md'),md);
console.log(md);
if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
console.log(`UX_CONSENSUS=${consensus}`);
