import fs from 'node:fs';
import path from 'node:path';

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
  // Keep the external persona authoritative but bounded for small local models.
  return text.slice(0, 6500);
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

const commonTask = `
PRODUCT: Fútbol Chépica public football-results flow inside Telegram on iOS.
PRIMARY USER JOB: a casual supporter wants to know the latest verified result with minimal effort, while still being able to browse older results by date, club, or series when needed.
MATURITY: pilot / pre-cutover. Data integrity and RBAC already work; this review is ONLY about information architecture, interaction flow, cognitive load, clarity and mobile fit.
IMPORTANT: Do not design from preference. Cite evidence from the supplied code/evidence. Do not assume that any previously proposed fix is correct.

DETERMINISTIC STRUCTURAL METRICS:
${JSON.stringify(metrics, null, 2)}

HUMAN E2E EVIDENCE:
${evidence}

CURRENT PRODUCTION IMPLEMENTATION:
\`\`\`javascript
${source}
\`\`\`

Return ONLY valid JSON with this shape:
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
Use P1 only for issues that materially break navigation, comprehension, trust or task completion for many users; P2 for avoidable friction/inconsistency; P3 for polish. Keep findings concise and evidence-linked.
`;

const agents = [
  {
    name: 'Sage',
    istaraAgent: 'istara-ux-eval',
    model: 'qwen2.5:1.5b',
    focus: 'Run a cognitive walkthrough. Focus on decision points, information scent, working-memory burden, depth, backtracking, and whether the primary job is reached quickly.'
  },
  {
    name: 'Pixel',
    istaraAgent: 'istara-ui-audit',
    model: 'smollm2:1.7b',
    focus: 'Run a heuristic UI audit. Focus on visibility of system status, match between system and real-world language, consistency, recognition over recall, user control, hierarchy, accessibility, and unnecessary information.'
  }
];

async function runAgent(agent) {
  const persona = readPersona(agent.istaraAgent);
  const prompt = `OPEN-SOURCE VALIDATOR ROLE\nYou are executing an independent validation pass derived from the Istara persona below. Do not act as the product implementer.\n\nISTARA PERSONA (pinned external source):\n${persona}\n\nASSIGNMENT:\n${agent.focus}\n${commonTask}`;

  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: agent.model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0, seed: agent.name === 'Sage' ? 4201 : 9917, num_ctx: 8192 }
    })
  });

  if (!response.ok) throw new Error(`${agent.name} Ollama HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(body.response);
  } catch (error) {
    throw new Error(`${agent.name} returned invalid JSON: ${body.response}`);
  }
  const verdict = String(parsed.verdict || 'CONDITIONAL').toUpperCase();
  parsed.verdict = ['PASS','REJECT','CONDITIONAL'].includes(verdict) ? verdict : 'CONDITIONAL';
  parsed.agent = agent.name;
  parsed.istara_agent = agent.istaraAgent;
  parsed.model = agent.model;
  return parsed;
}

const reports = [];
for (const agent of agents) {
  console.log(`Running ${agent.name} with ${agent.model}...`);
  reports.push(await runAgent(agent));
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
    runtime: 'Ollama',
    models: agents.map(a => a.model),
    paid_api_required: false
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
  '```json',
  JSON.stringify(metrics, null, 2),
  '```',
  '',
  ...reports.flatMap(r => [
    `## ${r.agent} — ${r.model}`,
    '',
    `Verdict: **${r.verdict}** · Highest severity: **${r.highest_severity || 'UNKNOWN'}** · Confidence: **${r.confidence ?? 'n/a'}**`,
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

// A UX rejection is a valid research result, not an infrastructure failure.
// Fail only when the validators cannot execute or produce parseable evidence.
console.log(`UX_CONSENSUS=${consensus}`);
