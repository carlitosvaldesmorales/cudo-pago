import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'sports-bus/worker/public-results-ux-v3.js');
const routerPath = path.join(repoRoot, 'sports-bus/telegram-migration-entry.js');
const evidencePath = path.join(repoRoot, 'ops/ux-validator/evidence-v3.md');
const outDir = path.join(repoRoot, 'artifacts/ux-validator-v3');
const istaraRoot = process.env.ISTARA_ROOT || '/tmp/istara';
fs.mkdirSync(outDir, { recursive: true });

const source = fs.readFileSync(sourcePath, 'utf8');
const router = fs.readFileSync(routerPath, 'utf8');
const evidence = fs.readFileSync(evidencePath, 'utf8');

function readPersona(agent) {
  return fs.readFileSync(path.join(istaraRoot, 'backend/app/agents/personas', agent, 'CORE.md'), 'utf8').slice(0, 2600);
}

function section(code, marker) {
  const start = code.indexOf(marker);
  return start < 0 ? '' : code.slice(start);
}

const renderSection = section(source, 'async function render');
const viewSection = renderSection ? source.slice(0, source.indexOf('async function render')) : source;
const facts = {
  usesEditMessageText: renderSection.includes("'editMessageText'"),
  fallbackSendExists: renderSection.includes("'sendMessage'"),
  directViewSendCount: (viewSection.match(/['\"]sendMessage['\"]/g) || []).length,
  directLatestEntry: source.includes("data === 'tp:public-results' || data === 'p3:latest'") && source.includes('await showRound(env, callback, latest.round_no)'),
  secondarySearchHub: source.includes("data === 'p3:search'") && source.includes("callback_data: 'p3:dates'") && source.includes("callback_data: 'p3:clubs'") && source.includes("callback_data: 'p3:series'"),
  completeCountNoisePresent: source.includes('4/4'),
  incompleteCountWarningPresent: source.includes('⚠️ ${count}/4'),
  historicalV2Compatibility: router.includes('handlePublicResultsUxV3') && router.includes('handlePublicResultsUxV2') && router.indexOf('handlePublicResultsUxV3(request.clone()') < router.indexOf('handlePublicResultsUxV2(request.clone()'),
  destinationVersion3: router.includes("TELEGRAM_PUBLIC_UX_VERSION = '3'"),
  humanV2Rejected: evidence.includes('V2 aceptación UX: RECHAZADA'),
  humanV3Pending: evidence.includes('Aceptación humana V3 en Telegram iOS: PENDIENTE')
};

const technicalRequired = [
  facts.usesEditMessageText,
  facts.fallbackSendExists,
  facts.directViewSendCount === 0,
  facts.directLatestEntry,
  facts.secondarySearchHub,
  !facts.completeCountNoisePresent,
  facts.incompleteCountWarningPresent,
  facts.historicalV2Compatibility,
  facts.destinationVersion3,
  facts.humanV2Rejected,
  facts.humanV3Pending
];
if (technicalRequired.some(x => !x)) {
  console.error(facts);
  throw new Error('V3 deterministic grounding contract is incomplete');
}

const catalog = {
  'V2-HUMAN': 'V2 fue rechazada en iOS: el usuario reportó mayor carga cognitiva y observó que cada navegación añadía otro panel al chat.',
  'V3-MESSAGE-MODE': 'En el camino normal de V3 ninguna vista llama sendMessage directamente: todas llaman render(), que intenta editMessageText sobre el message_id existente. sendMessage sólo existe como recuperación excepcional si Telegram rechaza la edición.',
  'V3-ENTRY': 'Al tocar Resultados verificados, V3 consulta latestRound y reemplaza el panel actual directamente por esa fecha; no muestra antes un selector fecha/club/serie.',
  'V3-SEARCH': 'Fecha, club y serie están detrás de una sola acción secundaria Otros resultados.',
  'V3-COUNT-NOISE': 'Un partido con 4 series completas no muestra 4/4; sólo aparece advertencia cuando el total verificado es distinto de 4.',
  'V3-COMPAT': 'El router ejecuta V3 primero y conserva V2 sólo para callbacks px:* históricos; el bot primario no cambia.',
  'V3-HUMAN-GAP': 'Todavía no existe aceptación humana de V3 en iOS. Esto impide certificar la experiencia final, pero no altera los hechos estructurales del código.'
};

const allowed = {
  MESSAGE_ACCUMULATION: ['V2-HUMAN', 'V3-MESSAGE-MODE', 'V3-HUMAN-GAP'],
  PRIMARY_PATH_COMPLEXITY: ['V2-HUMAN', 'V3-ENTRY', 'V3-SEARCH', 'V3-COUNT-NOISE', 'V3-HUMAN-GAP']
};

const assessmentSchema = {
  type: 'object', additionalProperties: false,
  required: ['problem_code', 'resolution', 'residual_risk', 'reason', 'evidence_refs'],
  properties: {
    problem_code: { type: 'string', enum: ['MESSAGE_ACCUMULATION', 'PRIMARY_PATH_COMPLEXITY'] },
    resolution: { type: 'string', enum: ['ADDRESSED', 'PARTIAL', 'NOT_ADDRESSED'] },
    residual_risk: { type: 'string', enum: ['NONE', 'P3', 'P2', 'P1'] },
    reason: { type: 'string', minLength: 10 },
    evidence_refs: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', enum: Object.keys(catalog) } }
  }
};

const schema = {
  type: 'object', additionalProperties: false,
  required: ['confidence', 'assessments', 'human_gate_required'],
  properties: {
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    assessments: { type: 'array', minItems: 2, maxItems: 2, items: assessmentSchema },
    human_gate_required: { type: 'boolean' }
  }
};

function assertGrounded(report, agent) {
  const seen = new Set();
  for (const item of report.assessments || []) {
    if (seen.has(item.problem_code)) throw new Error(`${agent}: duplicate ${item.problem_code}`);
    seen.add(item.problem_code);
    const okRefs = new Set(allowed[item.problem_code]);
    if (!item.evidence_refs.every(ref => okRefs.has(ref))) throw new Error(`${agent}: unrelated evidence for ${item.problem_code}`);
    if (/human (?:pass|accepted)|usuario (?:aceptó|aprobó)|e2e.*pass/i.test(item.reason)) throw new Error(`${agent}: invented V3 human acceptance`);
    if (item.problem_code === 'MESSAGE_ACCUMULATION') {
      if (/still (?:adds?|creates?|sends?) (?:new |multiple )?(?:messages?|panels?)/i.test(item.reason) || /no (?:clear )?mechanism to prevent/i.test(item.reason)) {
        throw new Error(`${agent}: contradicted verified V3 edit-in-place mechanism`);
      }
      if (item.resolution === 'NOT_ADDRESSED') throw new Error(`${agent}: NOT_ADDRESSED contradicts the verified causal fix for message accumulation`);
    }
    if (item.problem_code === 'PRIMARY_PATH_COMPLEXITY' && item.resolution === 'NOT_ADDRESSED') {
      throw new Error(`${agent}: NOT_ADDRESSED contradicts verified direct-latest and secondary-search structure`);
    }
  }
  if (seen.size !== 2 || !report.human_gate_required) throw new Error(`${agent}: human residual gate must remain explicit`);
}

const catalogText = Object.entries(catalog).map(([id, text]) => `${id}: ${text}`).join('\n');
const common = `
PRODUCT: Fútbol Chépica, consulta pública de resultados dentro de Telegram iOS.
PRIMARY JOB: llegar al resultado verificado más reciente con el mínimo esfuerzo, manteniendo resultados antiguos accesibles.
You are reviewing a CANDIDATE DESIGN, not certifying human acceptance.

VERIFIED CATALOG:\n${catalogText}

Assess exactly two problem codes. Cite only allowed evidence:
MESSAGE_ACCUMULATION -> ${allowed.MESSAGE_ACCUMULATION.join(', ')}
PRIMARY_PATH_COMPLEXITY -> ${allowed.PRIMARY_PATH_COMPLEXITY.join(', ')}

RESOLUTION RUBRIC — evaluate the causal mechanism, not final human acceptance:
- ADDRESSED: the demonstrated V2 cause is structurally removed in the normal V3 path.
- PARTIAL: the cause is materially reduced but a relevant structural source remains.
- NOT_ADDRESSED: the demonstrated V2 cause remains substantially unchanged.
- Human iOS confirmation is a separate final gate. Its absence MUST NOT by itself downgrade a verified structural fix to NOT_ADDRESSED.
- For MESSAGE_ACCUMULATION, editing the same message_id on the normal path means V3 no longer creates a new panel at every step. Historical chat messages may remain visible, but that is not new accumulation caused by V3.
- For PRIMARY_PATH_COMPLEXITY, compare V2's up-front selector with V3's direct latest-round entry and secondary search hub.

Rules:
- Do not invent screens, labels, user behavior, colors, gestures or test outcomes.
- V3 human iOS acceptance is explicitly pending. human_gate_required MUST be true.
- Judge whether the candidate addresses the demonstrated V2 problem, not whether the entire product is perfect.
- Do not claim that editMessageText sends another message or that V3 lacks a mechanism to avoid a new panel on the normal path; that would contradict V3-MESSAGE-MODE.
`;

const agents = [
  { name: 'Sage', persona: 'istara-ux-eval', model: 'qwen2.5:1.5b', focus: 'Cognitive walkthrough, information architecture, decision burden and progressive disclosure.' },
  { name: 'Pixel', persona: 'istara-ui-audit', model: 'granite3.3:2b', focus: 'Interaction heuristics, clutter, user control, hierarchy and unnecessary actions.' }
];

function callOllama(payload, name) {
  const req = `/tmp/v3-${name.toLowerCase()}-req.json`;
  const res = `/tmp/v3-${name.toLowerCase()}-res.json`;
  fs.writeFileSync(req, JSON.stringify(payload));
  execFileSync('curl', ['--silent', '--show-error', '--fail-with-body', '--connect-timeout', '10', '--max-time', '780', '-H', 'Content-Type: application/json', '--data-binary', `@${req}`, '-o', res, 'http://127.0.0.1:11434/api/generate'], { stdio: 'inherit', timeout: 790000 });
  return JSON.parse(fs.readFileSync(res, 'utf8'));
}

const reviews = [];
for (const agent of agents) {
  const prompt = `OPEN-SOURCE GROUNDED UX REVIEWER\nUse the Istara role excerpt as methodology, but the verified catalog below is the only product evidence.\n\nISTARA PERSONA:\n${readPersona(agent.persona)}\n\nFOCUS:\n${agent.focus}\n${common}`;
  const raw = callOllama({ model: agent.model, prompt, stream: false, format: schema, keep_alive: 0, options: { temperature: 0, seed: agent.name === 'Sage' ? 5301 : 7301, num_ctx: 4096, num_predict: 650 } }, agent.name);
  fs.writeFileSync(path.join(outDir, `${agent.name.toLowerCase()}-raw.json`), JSON.stringify(raw, null, 2));
  const parsed = JSON.parse(raw.response);
  assertGrounded(parsed, agent.name);
  reviews.push({ ...parsed, agent: agent.name, model: agent.model, runtime_seconds: Number(((raw.total_duration || 0) / 1e9).toFixed(1)) });
}

const resolutionRank = { ADDRESSED: 2, PARTIAL: 1, NOT_ADDRESSED: 0 };
const minResolution = Math.min(...reviews.flatMap(r => r.assessments.map(a => resolutionRank[a.resolution])));
const candidateStatus = minResolution >= 1 ? 'READY_FOR_HUMAN_E2E' : 'AGENT_REVIEW_BLOCKED';

const result = {
  generated_at: new Date().toISOString(),
  methodology: {
    fact_owner: 'deterministic source inspection',
    review_framework: 'Istara personas pinned by workflow',
    runtime: 'Ollama local CPU',
    paid_api_required: false,
    human_acceptance_owner: 'real Telegram iOS E2E'
  },
  deterministic_facts: facts,
  evidence_catalog: catalog,
  reviews,
  candidate_status: candidateStatus,
  final_ux_acceptance: 'PENDING_HUMAN_E2E'
};
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));

const md = [
  '# Open-source grounded UX review — Telegram results V3', '',
  `**Candidate status:** ${candidateStatus}`, '',
  '**Final UX acceptance:** PENDING_HUMAN_E2E', '',
  '## Deterministic facts', '',
  ...Object.entries(facts).map(([key, value]) => `- ${key}: ${value}`), '',
  ...reviews.flatMap(review => [
    `## ${review.agent} — ${review.model}`, '',
    `Confidence: ${review.confidence}/100 · Runtime: ${review.runtime_seconds}s`, '',
    ...review.assessments.map(a => `- ${a.problem_code}: **${a.resolution} / ${a.residual_risk}** [${a.evidence_refs.join(', ')}] — ${a.reason}`), ''
  ])
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
if (candidateStatus !== 'READY_FOR_HUMAN_E2E') process.exit(1);
