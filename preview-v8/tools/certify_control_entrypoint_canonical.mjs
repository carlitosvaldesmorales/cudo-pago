import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync('preview-v8/admin/index.html','utf8');
const control=fs.readFileSync('preview-v8/control/index.html','utf8');
const canonical=fs.readFileSync('preview-v8/club-operacion-lab/index.html','utf8');

assert.ok(admin.includes('Control del club · QA'),'admin must preserve the certified action label');
assert.ok(admin.includes('href="../control/"'),'admin must keep the stable control entrypoint');
assert.ok(admin.includes('Cada dato permite seguir de dónde salió'),'admin must communicate traceability');

assert.ok(control.includes("location.replace('../club-operacion-lab/')"),'control must route to canonical surface');
assert.ok(control.includes('meta http-equiv="refresh" content="0;url=../club-operacion-lab/"'),'control must have no-JS redirect fallback');
assert.ok(control.includes('href="../club-operacion-lab/"'),'control must expose a manual fallback link');

for (const token of [
  'id="canonicalFullSurface"',
  'Lo que CUDO ya puede demostrar',
  'CANONICAL_READ_MODEL_URL',
  'Rastrear resumen'
]) assert.ok(canonical.includes(token),'canonical destination missing: '+token);

console.log(JSON.stringify({
  ok:true,
  admin_entrypoint:'/preview-v8/admin/',
  stable_route:'/preview-v8/control/',
  canonical_destination:'/preview-v8/club-operacion-lab/',
  visible_from_admin:true,
  production_write:false
},null,2));
