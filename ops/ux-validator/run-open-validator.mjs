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
const humanEvidence = fs.readFileSync(evidencePath, 'utf8');

function readPersona(agent) {
  return fs.readFileSync(path.join(istaraRoot, 'backend/app/agents/personas', agent, 'CORE.md'), 'utf8').slice(0, 3000);
}

function section(code, startMarker, endMarker) {
  const start = code.indexOf(startMarker);
  if (start < 0) return '';
  const end = endMarker ? code.indexOf(endMarker, start + startMarker.length) : -1;
  return code.slice(start, end > start ? end : code.length);
}

function deterministicFacts(code, evidence) {
  const home = section(code, 'async function showHome', 'async function showDatePicker');
  const datePicker = section(code, 'async function showDatePicker', 'async function showRound');
  const round = section(code, 'async function showRound', 'async function showMatch');

  const facts = {
    homeChoiceCount: (home.match(/callback_data:/g) || []).length,
    usesSendMessage: /telegram\(env,'sendMessage'/.test(code) || /['"]sendMessage['"]/.test(code),
    usesEditMessageText: /editMessageText/.test(code),
    datePickerHasInstruction: datePicker.includes('Elige una fecha para ver sus partidos.'),
    roundHasInstruction: round.includes('Selecciona un partido para ver sus series.'),
    backToResultsLabelPresent: code.includes("text:'⬅️ Resultados'"),
    dateBranchExists: code.includes("data==='px:dates'") && /px:d:/.test(code),
    matchBranchExists: /px:m:/.test(code),
    latestBranchExists: code.includes("data==='px:latest'"),
    panelsAccumulateObserved: evidence.includes('En la misma pantalla quedan visibles paneles anteriores y sus botones.'),
    cognitiveLoadFeedbackObserved: evidence.includes('“Ahora siento que es más carga cognitiva”'),
    functionalPassObserved: evidence.includes('Flujo funcional: PASS.'),
    dataIntegrityPassObserved: evidence.includes('Integridad de datos: PASS.'),
    uxRejectedObserved: evidence.includes('Aceptación UX: RECHAZADA')
  };

  facts.navigationDepthViaDateToMatch = facts.dateBranchExists && facts.matchBranchExists ? 3 : null;
  facts.latestResultClickDepth = facts.latestBranchExists && facts.matchBranchExists ? 2 : null;
  facts.messageAccumulationRisk = facts.usesSendMessage && !facts.usesEditMessageText;

  const required = [
    'datePickerHasInstruction', 'roundHasInstruction', 'backToResultsLabelPresent',
    'panelsAccumulateObserved', 'cognitiveLoadFeedbackObserved', 'functionalPassObserved',
    'dataIntegrityPassObserved', 'uxRejectedObserved'
  ];
  const missing = required.filter(k => !facts[k]);
  if (missing.length) throw new Error(`Required grounding evidence missing: ${missing.join(', ')}`);
  return facts;
}

const facts = deterministicFacts(source, humanEvidence);

const evidenceCatalog = {
  'C-HOME-CHOICES': `Código: la portada pública contiene ${facts.homeChoiceCount} callback choices.`,
  'C-DATE-INSTRUCTION': 'Código: selector por fecha dice “Elige una fecha para ver sus partidos.”',
  'C-ROUND-INSTRUCTION': 'Código: vista de fecha dice “Selecciona un partido para ver sus series.”',
  'C-BACK-LABEL': 'Código: existe botón “⬅️ Resultados”.',
  'C-MESSAGE-MODE': `Código: sendMessage=${facts.usesSendMessage}; editMessageText=${facts.usesEditMessageText}.`,
  'C-DATE-DEPTH': `Código: profundidad desde portada, por fecha, hasta detalle de partido=${facts.navigationDepthViaDateToMatch} selecciones.`,
  'C-LATEST-DEPTH': `Código: desde portada “última fecha” hasta marcador detallado=${facts.latestResultClickDepth} selecciones.`,
  'E2E-PANELS': 'E2E iOS: al avanzar quedan visibles paneles anteriores y sus botones.',
  'E2E-COGNITIVE': 'Feedback humano explícito: “Ahora siento que es más carga cognitiva”.',
  'E2E-FUNCTIONAL': 'E2E: flujo funcional PASS e integridad de datos PASS.',
  'E2E-UX-REJECTED': 'Aceptación humana UX: RECHAZADA / pendiente de rediseño.'
};

const problemEvidence = {
  MESSAGE_ACCUMULATION: ['C-MESSAGE-MODE', 'E2E-PANELS', 'E2E-COGNITIVE'],
  PRIMARY_PATH_COMPLEXITY: ['C-HOME-CHOICES', 'C-LATEST-DEPTH', 'C-DATE-DEPTH', 'E2E-COGNITIVE']
};

const assessmentItem = {
  type: 'object', additionalProperties: false,
  required: ['problem_code', 'severity', 'interpretation', 'recommendation', 'evidence_refs'],
  properties: {
    problem_code: { type: 'string', enum: Object.keys(problemEvidence) },
    severity: { type: 'string', enum: ['P1', 'P2', 'P3', 'NONE'] },
    interpretation: { type: 'string', minLength: 8 },
    recommendation: { type: 'string', minLength: 8 },
    evidence_refs: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: Object.keys(evidenceCatalog) } }
  }
};

const reportSchema = {
  type: 'object', additionalProperties: false,
  required: ['confidence', 'assessments', 'what_to_preserve', 'redesign_principles', 'unknowns'],
  properties: {
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    assessments: { type: 'array', minItems: 2, maxItems: 2, items: assessmentItem },
    what_to_preserve: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', minLength: 8 } },
    redesign_principles: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 8 } },
    unknowns: { type: 'array', maxItems: 2, items: { type: 'string', minLength: 8 } }
  }
};

function assertGrounded(parsed, agentName) {
  const seen = new Set();
  for (const a of parsed.assessments || []) {
    if (seen.has(a.problem_code)) throw new Error(`${agentName}: duplicated problem_code ${a.problem_code}`);
    seen.add(a.problem_code);
    const allowed = new Set(problemEvidence[a.problem_code] || []);
    if (!a.evidence_refs.every(ref => allowed.has(ref))) {
      throw new Error(`${agentName}: ${a.problem_code} cited unrelated evidence ${a.evidence_refs.join(',')}`);
    }
    const text = `${a.interpretation} ${a.recommendation}`;
    if (/empty panel|no (?:clear )?(?:guidance|instruction)/i.test(text)) {
      throw new Error(`${agentName}: contradicted known instruction facts`);
    }
    if (/go back to results/i.test(text)) {
      throw new Error(`${agentName}: invented English UI recommendation for Spanish product`);
    }
  }
  for (const code of Object.keys(problemEvidence)) {
    if (!seen.has(code)) throw new Error(`${agentName}: missing assessment ${code}`);
  }
}

const catalogText = Object.entries(evidenceCatalog).map(([id, fact]) => `${id}: ${fact}`).join('\n');
const commonTask = `
PRODUCT: Fútbol Chépica public football-results flow in Telegram iOS.
PRIMARY JOB: a casual supporter wants the latest verified result with minimal effort; older results remain discoverable.
ROLE BOUNDARY: factual acceptance is NOT yours. Human E2E and deterministic code facts are source of truth. You only assess two pre-grounded UX problem candidates and propose remediation principles.

VERIFIED EVIDENCE CATALOG:\n${catalogText}

CANDIDATES AND ALLOWED EVIDENCE:
- MESSAGE_ACCUMULATION -> ${problemEvidence.MESSAGE_ACCUMULATION.join(', ')}
- PRIMARY_PATH_COMPLEXITY -> ${problemEvidence.PRIMARY_PATH_COMPLEXITY.join(', ')}

KNOWN CONTRADICTION GUARDS:
- There IS an instruction after entering the date picker: “Elige una fecha para ver sus partidos.”
- There IS an instruction in the round view: “Selecciona un partido para ver sus series.”
- There IS a Spanish back label: “⬅️ Resultados”.
Never claim those elements are absent.

OUTPUT:
- Exactly one assessment for each problem_code, no duplicates.
- Severity NONE is allowed if the cited facts do not constitute a meaningful problem by themselves.
- evidence_refs may use ONLY the allowed IDs for that problem_code.
- Do not invent screens, user behavior, visual states, colors, borders, empty panels, tutorials, dropdowns, or labels not supported by the catalog.
- Recommendations must remain conceptual hypotheses; do not prescribe English labels.
`;

const agents = [
  { name: 'Sage', istaraAgent: 'istara-ux-eval', model: 'qwen2.5:1.5b', focus: 'Cognitive walkthrough interpretation: burden, task depth, progressive disclosure and prioritization.' },
  { name: 'Pixel', istaraAgent: 'istara-ui-audit', model: 'granite3.1-dense:2b', focus: 'Heuristic interaction audit: hierarchy, recognition, user control and unnecessary interaction.' }
];

function callOllama(payload, agentName) {
  const req = path.join('/tmp', `ux-${agentName.toLowerCase()}-request.json`);
  const res = path.join('/tmp', `ux-${agentName.toLowerCase()}-response.json`);
  fs.writeFileSync(req, JSON.stringify(payload));
  try {
    execFileSync('curl', [
      '--silent', '--show-error', '--fail-with-body', '--connect-timeout', '10', '--max-time', '780',
      '-H', 'Content-Type: application/json', '--data-binary', `@${req}`, '-o', res,
      'http://127.0.0.1:11434/api/generate'
    ], { stdio: 'inherit', timeout: 790000 });
  } catch {
    let body = '';
    try { body = fs.readFileSync(res, 'utf8'); } catch {}
    throw new Error(`${agentName} local Ollama call failed${body ? `: ${body.slice(0, 2000)}` : ''}`);
  }
  return JSON.parse(fs.readFileSync(res, 'utf8'));
}

function runAgent(agent) {
  const prompt = `OPEN-SOURCE GROUNDED UX ADVISOR\nYou are not the implementer and cannot create evidence. Apply the pinned Istara role only to the verified catalog.\n\nISTARA PERSONA EXCERPT:\n${readPersona(agent.istaraAgent)}\n\nFOCUS:\n${agent.focus}\n${commonTask}`;
  const body = callOllama({
    model: agent.model, prompt, stream: false, format: reportSchema, keep_alive: 0,
    options: { temperature: 0, seed: agent.name === 'Sage' ? 4201 : 9917, num_ctx: 4096, num_predict: 800 }
  }, agent.name);
  fs.writeFileSync(path.join(outDir, `${agent.name.toLowerCase()}-raw.json`), JSON.stringify(body, null, 2));
  let parsed;
  try { parsed = JSON.parse(body.response); }
  catch { throw new Error(`${agent.name} returned invalid JSON: ${String(body.response || '').slice(0, 4000)}`); }
  assertGrounded(parsed, agent.name);
  parsed.agent = agent.name;
  parsed.istara_agent = agent.istaraAgent;
  parsed.model = agent.model;
  parsed.runtime_seconds = Number(((body.total_duration || 0) / 1e9).toFixed(1));
  return parsed;
}

const advisors = [];
for (const agent of agents) {
  console.log(`Running grounded ${agent.name} with ${agent.model}...`);
  advisors.push(runAgent(agent));
  console.log(`${agent.name} grounded report accepted.`);
}

const acceptanceDecision = facts.uxRejectedObserved ? 'REJECT' : 'GAP';
if (acceptanceDecision === 'GAP') throw new Error('No explicit human UX acceptance decision exists.');

const result = {
  generated_at: new Date().toISOString(),
  methodology: {
    acceptance_owner: 'human E2E evidence',
    fact_owner: 'deterministic source inspection + recorded E2E evidence',
    advisor_role: 'open-source LLMs assess only pre-grounded candidates; they cannot decide acceptance or invent evidence',
    external_agent_framework: 'Istara personas pinned by workflow commit',
    runtime: 'Ollama local CPU',
    models: agents.map(a => a.model),
    paid_api_required: false,
    source_evaluated: 'sports-bus/worker/public-results-ux-v2.js'
  },
  acceptance_decision: acceptanceDecision,
  deterministic_facts: facts,
  evidence_catalog: evidenceCatalog,
  problem_evidence: problemEvidence,
  advisors
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));

const md = [
  '# Grounded open-source UX review — Telegram public results V2', '',
  `**Acceptance decision:** ${acceptanceDecision} (owned by recorded human E2E evidence, not by an LLM)`, '',
  '## Verified evidence catalog', '',
  ...Object.entries(evidenceCatalog).map(([id, fact]) => `- **${id}** — ${fact}`), '',
  ...advisors.flatMap(r => [
    `## ${r.agent} — ${r.model}`, '',
    `Confidence: **${r.confidence}/100** · Runtime: **${r.runtime_seconds}s**`, '',
    ...r.assessments.map(a => `- **${a.problem_code} / ${a.severity}** [${a.evidence_refs.join(', ')}] — ${a.interpretation} → ${a.recommendation}`), '',
    `**Preserve:** ${r.what_to_preserve.join('; ')}`, '',
    `**Redesign principles:** ${r.redesign_principles.join('; ')}`, '',
    `**Unknowns:** ${r.unknowns.join('; ')}`, ''
  ])
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(`UX_ACCEPTANCE=${acceptanceDecision}`);
