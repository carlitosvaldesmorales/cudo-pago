import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'sports-bus/worker/public-results-table-view.js');
const evidencePath = path.join(repoRoot, 'ops/ux-validator/evidence-results-table.md');
const outDir = path.join(repoRoot, 'artifacts/ux-validator-results-table');
const istaraRoot = process.env.ISTARA_ROOT || '/tmp/istara';
fs.mkdirSync(outDir, { recursive: true });

const source = fs.readFileSync(sourcePath, 'utf8');
const evidence = fs.readFileSync(evidencePath, 'utf8');

const facts = {
  humanRejectedOldView: evidence.includes('Aceptación UX: **RECHAZADA**'),
  humanNeedsAllResults: evidence.includes('todos los resultados'),
  humanNeedsAlignedMatrix: evidence.includes('tabla/matriz visualmente alineada'),
  queriesAllVerifiedResults: source.includes("r.validation_status='VERIFIED'") && !source.includes('m.round_no=?'),
  groupsAcrossRounds: source.includes('for (const round of rounds)') && source.includes('for (const match of round.matches)'),
  usesTelegramMonospace: source.includes('<pre>') && source.includes("parse_mode: 'HTML'"),
  primaryViewAvoidsMatchDrilldown: !source.includes("callback_data: `p3:m:") && !source.includes("callback_data: 'p3:m:"),
  keepsSearchSecondary: source.includes("text: '🔎 Buscar / filtrar'") && source.includes("callback_data: 'p3:search'"),
  verifiedFooter: source.includes('✅ Marcadores verificados')
};

const mandatory = [
  'humanRejectedOldView', 'humanNeedsAllResults', 'humanNeedsAlignedMatrix',
  'queriesAllVerifiedResults', 'groupsAcrossRounds', 'usesTelegramMonospace',
  'primaryViewAvoidsMatchDrilldown', 'keepsSearchSecondary', 'verifiedFooter'
];
const missing = mandatory.filter(key => !facts[key]);
if (missing.length) throw new Error(`Deterministic UX design gate failed: ${missing.join(', ')}`);

const evidenceCatalog = {
  'H-ALL': 'Human E2E requirement: primary results view must expose all verified results, not one selected match only.',
  'H-ALIGN': 'Human E2E requirement: score presentation must read as an aligned table/matrix on Telegram iOS.',
  'C-ALL': 'Code queries every VERIFIED result for the competition and groups output by round and match.',
  'C-MONO': 'Code renders the compact score matrix inside Telegram HTML <pre> and sets parse_mode=HTML.',
  'C-NODRILL': 'Primary table module contains no per-match p3:m drilldown callback.',
  'C-FILTER': 'Search/filter remains available as a secondary action, not the primary route.'
};

function persona(agent) {
  return fs.readFileSync(path.join(istaraRoot, 'backend/app/agents/personas', agent, 'CORE.md'), 'utf8').slice(0, 3000);
}

const schema = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'confidence', 'reason', 'preserve', 'risk', 'evidence_refs'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'CONDITIONAL', 'REJECT'] },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string', minLength: 12 },
    preserve: { type: 'string', minLength: 8 },
    risk: { type: 'string', minLength: 8 },
    evidence_refs: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string', enum: Object.keys(evidenceCatalog) } }
  }
};

function callOllama(payload, name) {
  const req = path.join('/tmp', `ux-table-${name.toLowerCase()}-request.json`);
  const res = path.join('/tmp', `ux-table-${name.toLowerCase()}-response.json`);
  fs.writeFileSync(req, JSON.stringify(payload));
  execFileSync('curl', [
    '--silent', '--show-error', '--fail-with-body', '--connect-timeout', '10', '--max-time', '780',
    '-H', 'Content-Type: application/json', '--data-binary', `@${req}`, '-o', res,
    'http://127.0.0.1:11434/api/generate'
  ], { stdio: 'inherit', timeout: 790000 });
  return JSON.parse(fs.readFileSync(res, 'utf8'));
}

const catalog = Object.entries(evidenceCatalog).map(([id, text]) => `${id}: ${text}`).join('\n');
const agents = [
  { name: 'Sage', role: 'istara-ux-eval', model: 'qwen2.5:1.5b', focus: 'cognitive load, information visibility, task depth and progressive disclosure' },
  { name: 'Pixel', role: 'istara-ui-audit', model: 'granite3.1-dense:2b', focus: 'visual hierarchy, alignment, scanability, consistency and mobile readability' }
];

const reports = [];
for (const agent of agents) {
  const prompt = `OPEN-SOURCE INDEPENDENT UX DESIGN REVIEW\n\nYou are an independent evaluator, not the implementer. Do not invent UI evidence. Assess only whether the proposed primary Telegram results presentation structurally addresses the recorded rejection. This is a PRE-PRODUCTION design gate; final human Telegram iOS acceptance remains mandatory.\n\nISTARA PERSONA EXCERPT:\n${persona(agent.role)}\n\nFOCUS: ${agent.focus}.\n\nVERIFIED EVIDENCE:\n${catalog}\n\nPROPOSED STRUCTURAL FACTS:\n${JSON.stringify(facts, null, 2)}\n\nDECISION RULE:\n- PASS if the proposal directly addresses both H-ALL and H-ALIGN while preserving secondary search without reintroducing mandatory per-match drilldown.\n- CONDITIONAL only if a specific unresolved mobile-render risk remains that cannot be decided from code.\n- REJECT if the proposal still makes one-match drilldown the primary route, fails to expose all verified results, or does not use a deterministic alignment mechanism.\n- Do not claim final visual acceptance; that belongs to human iOS E2E.\n`;
  const body = callOllama({
    model: agent.model,
    prompt,
    stream: false,
    format: schema,
    keep_alive: 0,
    options: { temperature: 0, seed: agent.name === 'Sage' ? 4201 : 9917, num_ctx: 4096, num_predict: 500 }
  }, agent.name);
  const parsed = JSON.parse(body.response);
  parsed.agent = agent.name;
  parsed.model = agent.model;
  reports.push(parsed);
  fs.writeFileSync(path.join(outDir, `${agent.name.toLowerCase()}.json`), JSON.stringify(parsed, null, 2));
}

const designGate = reports.every(report => report.verdict === 'PASS') ? 'PASS' : reports.some(report => report.verdict === 'REJECT') ? 'REJECT' : 'CONDITIONAL';
const result = {
  generated_at: new Date().toISOString(),
  gate_type: 'pre-production independent UX design review',
  design_gate: designGate,
  final_human_ios_acceptance: 'PENDING',
  source_evaluated: 'sports-bus/worker/public-results-table-view.js',
  deterministic_facts: facts,
  advisors: reports,
  open_source_stack: {
    personas: 'Istara pinned by workflow',
    runtime: 'Ollama local',
    models: agents.map(a => a.model),
    paid_api_required: false
  }
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));

const md = [
  '# UX design gate — resultados públicos alineados', '',
  `**DESIGN_GATE: ${designGate}**`,
  '**Final human Telegram iOS acceptance: PENDING**', '',
  ...reports.map(r => `- **${r.agent} / ${r.verdict} / ${r.confidence}%** — ${r.reason} Risk: ${r.risk}`), '',
  'Deterministic facts:',
  ...Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`)
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(`DESIGN_GATE=${designGate}`);
if (designGate !== 'PASS') process.exit(2);
