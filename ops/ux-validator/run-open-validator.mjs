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
  const text = fs.readFileSync(file, 'utf8');
  // Keep the external persona authoritative while keeping CPU inference bounded.
  return text.slice(0, 3600);
}

function functionExcerpt(code, name, nextName) {
  const start = code.indexOf(`async function ${name}`);
  if (start < 0) return '';
  const end = nextName ? code.indexOf(`async function ${nextName}`, start + 1) : -1;
  return code.slice(start, end > start ? end : Math.min(code.length, start + 5000));
}

function interactionExcerpt(code) {
  const pieces = [
    functionExcerpt(code, 'showHome', 'showDatePicker'),
    functionExcerpt(code, 'showDatePicker', 'showRound'),
    functionExcerpt(code, 'showRound', 'showMatch'),
    functionExcerpt(code, 'showMatch', 'showClubPicker'),
    functionExcerpt(code, 'showClubPicker', 'showClub'),
    functionExcerpt(code, 'showSeriesPicker', 'showSeriesDates'),
    functionExcerpt(code, 'send', 'telegram')
  ].filter(Boolean);
  return pieces.join('\n\n');
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
  return {
    homeChoiceCount,
    usesSendMessage,
    usesEditMessageText,
    navigationDepthToMatchFromHome,
    showsCompletenessSuffix,
    messageAccumulationRisk,
    structuralRedFlag
  };
}

const metrics = deterministicMetrics(source);
const uiCode = interactionExcerpt(source);

const commonTask = `
PRODUCT: Fútbol Chépica public football-results flow inside Telegram on iOS.
PRIMARY USER JOB: a casual supporter wants the latest verified result with minimal effort, while older results must remain discoverable by date, club or series.
SCOPE: information architecture, interaction flow, cognitive load, clarity and mobile fit only. Data integrity/RBAC are already validated.
IMPORTANT: Do not validate a proposed redesign. Evaluate CURRENT V2 from evidence. Do not assume that single-message navigation, latest-first, fewer filters, or any previous idea is correct.

DETERMINISTIC STRUCTURAL METRICS FROM THE REAL SOURCE:
${JSON.stringify(metrics, null, 2)}

HUMAN E2E EVIDENCE:
${evidence}

RELEVANT INTERACTION FUNCTIONS EXTRACTED DIRECTLY FROM CURRENT PRODUCTION SOURCE:
\`\`\`javascript
${uiCode}
\`\`\`

Return ONLY valid JSON:
{
  "verdict": "PASS" | "REJECT" | "CONDITIONAL",
  "highest_severity": "P0" | "P1" | "P2" | "P3" | "NONE",
  "confidence": 0.0,
  "findings": [
    {"severity":"P0|P1|P2|P3","evidence":"specific evidence","impact":"user impact","recommendation":"principle or concrete change"}
  ],
  "what_to_preserve": ["..."],
  "redesign_principles": ["..."],
  "unknowns": ["..."]
}
P1 = material navigation/comprehension/trust/task failure for many users. P2 = avoidable friction/inconsistency. P3 = polish. Maximum 5 findings. Evidence must refer to supplied code, metrics or human observation.
`;

const agents = [
  {
    name: 'Sage',
    istaraAgent: 'istara-ux-eval',
    model: 'qwen2.5:1.5b',
    focus: 'Run a cognitive walkthrough. Focus on decision points, information scent, working-memory burden, depth, backtracking and speed to the primary job.'
  },
  {
    name: 'Pixel',
    istaraAgent: 'istara-ui-audit',
    model: 'smollm2:1.7b',
    focus: 'Run a heuristic UI audit. Focus on system status, real-world language, consistency, recognition over recall, user control, hierarchy, accessibility and unnecessary information.'
  }
];

function callOllama(payload, agentName) {
  const requestFile = path.join('/tmp', `ux-${agentName.toLowerCase()}-request.json`);
  const responseFile = path.join('/tmp', `ux-${agentName.toLowerCase()}-response.json`);
  fs.writeFileSync(requestFile, JSON.stringify(payload));
  try {
    execFileSync('curl', [
      '--silent', '--show-error', '--fail-with-body',
      '--connect-timeout', '10', '--max-time', '780',
      '-H', 'Content-Type: application/json',
      '--data-binary', `@${requestFile}`,
      '-o', responseFile,
      'http://127.0.0.1:11434/api/generate'
    ], { stdio: 'inherit', timeout: 790000 });
  } catch (error) {
    let body = '';
    try { body = fs.readFileSync(responseFile, 'utf8'); } catch {}
    throw new Error(`${agentName} local Ollama call failed${body ? `: ${body}` : ''}`);
  }
  return JSON.parse(fs.readFileSync(responseFile, 'utf8'));
}

function runAgent(agent) {
  const persona = readPersona(agent.istaraAgent);
  const prompt = `OPEN-SOURCE INDEPENDENT VALIDATOR\nYou are not the implementer. Apply the pinned Istara role below critically.\n\nISTARA PERSONA EXCERPT:\n${persona}\n\nASSIGNMENT:\n${agent.focus}\n${commonTask}`;

  const body = callOllama({
    model: agent.model,
    prompt,
    stream: false,
    format: 'json',
    keep_alive: 0,
    options: {
      temperature: 0,
      seed: agent.name === 'Sage' ? 4201 : 9917,
      num_ctx: 4096,
      num_predict: 520
    }
  }, agent.name);

  let parsed;
  try {
    parsed = JSON.parse(body.response);
  } catch {
    throw new Error(`${agent.name} returned invalid JSON: ${String(body.response || '').slice(0, 2000)}`);
  }
  const verdict = String(parsed.verdict || 'CONDITIONAL').toUpperCase();
  parsed.verdict = ['PASS','REJECT','CONDITIONAL'].includes(verdict) ? verdict : 'CONDITIONAL';
  parsed.agent = agent.name;
  parsed.istara_agent = agent.istaraAgent;
  parsed.model = agent.model;
  parsed.runtime_seconds = Number(((body.total_duration || 0) / 1e9).toFixed(1));
  return parsed;
}

const reports = [];
for (const agent of agents) {
  console.log(`Running ${agent.name} with ${agent.model}...`);
  reports.push(runAgent(agent));
  console.log(`${agent.name} complete: ${reports.at(-1).verdict}`);
}

const verdicts = reports.map(r => r.verdict);
let consensus = 'CONDITIONAL';
if (verdicts.every(v => v === 'REJECT')) consensus = 'REJECT';
else if (metrics.structuralRedFlag && verdicts.includes('REJECT')) consensus = 'REJECT';
else if (verdicts.every(v => v === 'PASS') && !metrics.structuralRedFlag) consensus = 'PASS';

const result = {
  generated_at: new Date().toISOString(),
  methodology: {
    orchestrator: 'local deterministic runner',
    external_agent_framework: 'Istara personas pinned by workflow commit',
    runtime: 'Ollama local CPU',
    models: agents.map(a => a.model),
    paid_api_required: false,
    source_evaluated: 'sports-bus/worker/public-results-ux-v2.js'
  },
  deterministic_metrics: metrics,
  validators: reports,
  consensus
};

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));

const md = [
  '# Open-source UX validation — Telegram public results V2',
  '',
  `**Consensus:** ${consensus}`,
  '',
  '## Deterministic structural evidence',
  '',
  '```json', JSON.stringify(metrics, null, 2), '```', '',
  ...reports.flatMap(r => [
    `## ${r.agent} — ${r.model}`,
    '',
    `Verdict: **${r.verdict}** · Highest severity: **${r.highest_severity || 'UNKNOWN'}** · Confidence: **${r.confidence ?? 'n/a'}** · Runtime: **${r.runtime_seconds}s**`,
    '',
    ...(Array.isArray(r.findings) ? r.findings.map(f => `- **${f.severity || '?'}** — ${f.evidence || ''} → ${f.impact || ''} → ${f.recommendation || ''}`) : ['- No structured findings returned.']),
    '',
    '**Preserve:** ' + (Array.isArray(r.what_to_preserve) ? r.what_to_preserve.join('; ') : 'n/a'),
    '',
    '**Redesign principles:** ' + (Array.isArray(r.redesign_principles) ? r.redesign_principles.join('; ') : 'n/a'),
    '',
    '**Unknowns:** ' + (Array.isArray(r.unknowns) ? r.unknowns.join('; ') : 'n/a'),
    ''
  ])
].join('\n');

fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(`UX_CONSENSUS=${consensus}`);
