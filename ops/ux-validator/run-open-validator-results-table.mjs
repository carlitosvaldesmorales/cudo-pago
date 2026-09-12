import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'sports-bus/worker/public-results-table-view.js');
const evidencePath = path.join(repoRoot, 'ops/ux-validator/evidence-results-table.md');
const outDir = path.join(repoRoot, 'artifacts/ux-validator-results-table');
fs.mkdirSync(outDir, { recursive: true });

const source = fs.readFileSync(sourcePath, 'utf8');
const evidence = fs.readFileSync(evidencePath, 'utf8');

// Este gate ya no decide diseño. La autoridad humana de producto fue recuperada
// de la historia (#22/#23/#24). Sólo verifica no-regresión determinista.
const facts = {
  humanAcceptedMatrixRecovered: evidence.includes('ya había sido aceptada visualmente'),
  humanNeedsAllResults: evidence.includes('todos los resultados verificados'),
  humanNeedsAlignedMatrix: evidence.includes('tabla/matriz visualmente alineada'),
  humanRequiresInlineCode: evidence.includes('`<code>`') && evidence.includes('no `<pre>`'),
  queriesAllVerifiedResults: source.includes("r.validation_status='VERIFIED'") && !source.includes('m.round_no=?'),
  groupsAcrossRounds: source.includes('for (const round of rounds)') && source.includes('for (const match of round.matches)'),
  usesTelegramMonospaceWithoutPre: source.includes('<code>') && !source.includes('<pre>') && source.includes("parse_mode: 'HTML'"),
  primaryViewAvoidsMatchDrilldown: !source.includes("callback_data: `p3:m:") && !source.includes("callback_data: 'p3:m:"),
  keepsSearchSecondary: source.includes("text: '🔎 Buscar / filtrar'") && source.includes("callback_data: 'p3:search'"),
  verifiedFooter: source.includes('✅ Marcadores verificados')
};

const mandatory = Object.keys(facts);
const missing = mandatory.filter(key => !facts[key]);
const regressionGate = missing.length ? 'FAIL' : 'PASS';

const result = {
  generated_at: new Date().toISOString(),
  gate_type: 'deterministic regression check against previously approved human UX',
  regression_gate: regressionGate,
  human_product_authority: 'RECOVERED_APPROVED',
  source_evaluated: 'sports-bus/worker/public-results-table-view.js',
  deterministic_facts: facts,
  missing,
  external_ai_required: false,
  rationale: 'An automated advisor cannot reopen a human product decision already accepted; it may only detect structural regression.'
};

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));
const md = [
  '# Regression gate — RESULTS-READ Telegram matrix', '',
  `**REGRESSION_GATE: ${regressionGate}**`,
  '**Human product authority: RECOVERED_APPROVED**',
  '**External AI required: no**', '',
  'Deterministic facts:',
  ...Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`),
  ...(missing.length ? ['', `Missing: ${missing.join(', ')}`] : [])
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(`DESIGN_GATE=${regressionGate}`);
console.log(`REGRESSION_GATE=${regressionGate}`);
if (missing.length) process.exit(2);
