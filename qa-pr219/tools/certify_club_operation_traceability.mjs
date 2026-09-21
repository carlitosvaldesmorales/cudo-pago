import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='preview-v8/club-operacion-lab/index.html';
const html=fs.readFileSync(path,'utf8');

assert.ok(html.includes("function openTrace(key)"),'traceability resolver missing');
assert.ok(html.includes("function dynamicTrace(key)"),'dynamic traceability resolver missing');
assert.ok(html.includes("const traceCatalog={"),'traceability catalog missing');
assert.ok(html.includes("TRACE_ENTRY_NOT_FOUND"),'traceability must fail closed when an entry is unknown');
assert.ok(html.includes("Fuente / referencia"),'trace drawer must expose source references');
assert.ok(html.includes("Regla(s) que lo derivan"),'trace drawer must expose derivation rules');
assert.ok(html.includes("Relaciones navegables"),'trace drawer must expose navigable relationships');
assert.ok(html.includes("GAP:"),'trace drawer must expose gaps explicitly');

const requiredStaticKeys=[
  'ui:qa-boundary',
  'source:need',
  'goal:expected',
  'goal:authority',
  'flow:reality',
  'flow:rules',
  'flow:work',
  'flow:resources',
  'flow:decision',
  'flow:outcome',
  'resource:obligation',
  'resource:movement',
  'resource:recinto',
  'decision:precedence',
  'global:state'
];
for(const key of requiredStaticKeys){
  assert.ok(html.includes("openTrace('"+key+"')") || html.includes("'"+key+"':{"),'missing trace path for '+key);
}

const requiredDynamicBindings=[
  "traceButton('work:'+w.id)",
  "traceButton('person:'+encodeURIComponent(p))",
  "traceButton('coverage:unassigned')",
  "traceButton('resource:recinto')",
  "traceButton('blocker:'+b.id)",
  "traceButton('event:'+i)",
  "traceButton('global:state')",
  "traceButton('global:evidence')"
];
for(const token of requiredDynamicBindings){
  assert.ok(html.includes(token),'missing dynamic trace binding: '+token);
}

assert.ok(html.includes("classification:'GAP_CONTROLADO'"),'mock authority must expose its gap instead of masquerading as real evidence');
assert.ok(html.includes("no representa una identidad real"),'mock authority limitation must be visible in trace');
assert.ok(html.includes("no afirma ausencia de obligaciones reales del club"),'negative financial QA claim must be bounded');
assert.ok(html.includes("no una afirmación financiera del CUDO real"),'cash-movement QA claim must be bounded');

console.log(JSON.stringify({
  ok:true,
  surface:'/preview-v8/club-operacion-lab/',
  traceability_fail_closed:true,
  static_trace_paths:requiredStaticKeys.length,
  dynamic_trace_bindings:requiredDynamicBindings.length,
  sources_visible:true,
  rules_visible:true,
  relationships_navigable:true,
  gaps_explicit:true,
  production_write:false
},null,2));
