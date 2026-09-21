import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync('preview-v8/admin/index.html','utf8');
const control=fs.readFileSync('preview-v8/control/index.html','utf8');
const lab=fs.readFileSync('preview-v8/club-operacion-lab/index.html','utf8');

assert.ok(admin.includes('Control del club · QA'),'admin must preserve the certified action label');
assert.ok(admin.includes('href="../control/"'),'admin must keep the stable control entrypoint');

for (const token of [
  'data-acceptance="human-context"',
  'Qué necesita atención',
  "const READ_MODEL='/qa-v8-google/data/operacion.json'",
  "const STATE_STORE='/qa-v8-google/state/operational-work-state.json'",
  'data-acceptance="accountable"',
  'data-acceptance="assignee"',
  'data-acceptance="next-action"',
  'Ver origen',
  'Ver historial',
  'data-acceptance-action="transition"',
  'script.google.com/macros/s/AKfycbxae8ZOaPJElvF9cTa0EdDzb-KBm4nItqHSnUdZngQ2nRnEEy3nX3AJMQHsySt5lE99Sw/exec?view=work'
]) assert.ok(control.includes(token),'human-first Control missing: '+token);

assert.ok(!control.includes("location.replace('../club-operacion-lab/')"),'Control must not redirect to the lab');
assert.ok(!control.includes('http-equiv="refresh"'),'Control must not meta-refresh to the lab');
assert.ok(!control.includes('localStorage.'),'Control must not use browser-local storage as operational authority');

assert.ok(lab.includes('id="canonicalFullSurface"'),'technical lab remains available as a separate QA surface');
assert.ok(lab.includes('CANONICAL_READ_MODEL_URL'),'technical lab must continue reading the canonical projection');

console.log(JSON.stringify({
  ok:true,
  admin_entrypoint:'/preview-v8/admin/',
  stable_route:'/preview-v8/control/',
  technical_lab:'/preview-v8/club-operacion-lab/',
  human_first:true,
  same_canonical_data:true,
  browser_local_authority:false,
  production_write:false
},null,2));
