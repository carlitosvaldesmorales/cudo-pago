import fs from 'node:fs';

const code = fs.readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const safe = fs.readFileSync(new URL('./SafeProvision.gs', import.meta.url), 'utf8');
const failures = [];

function expect(name, condition) {
  if (!condition) failures.push(name);
}

expect('manual upload slot recognizes IMAGEN_REF/FOTO_REF', /\['IMAGEN_REF','FOTO_REF'\]/.test(code));
expect('FILE_UPLOAD is compatible with manual upload slot', /isManualFileUploadSlot_\(row\).*ItemType\.FILE_UPLOAD/s.test(code));
expect('FILE_UPLOAD update is preserved', /isManualFileUploadSlot_\(row\).*ItemType\.FILE_UPLOAD.*return item/s.test(code));
expect('global rebuild invokes destructive safety assertion', /function rebuildQuestions_\([^]*?assertDestructiveRebuildSafe_\([^]*?deleteItem/s.test(code));
expect('protected item detector exists', /function protectedItems_\(/.test(safe));
expect('destructive rebuild blocker exists', /function assertDestructiveRebuildSafe_\(/.test(safe));
expect('protected rebuild fails before mutation', /throw new Error\([^]*reconstrucci[oó]n destructiva BLOQUEADA/s.test(safe));
expect('Partidos destructive rebuild also guarded', /assertDestructiveRebuildSafe_\(form,'Partidos'\)[^]*?deleteItem/s.test(safe));

if (failures.length) {
  console.error('PACK01_GATE_A_STATIC: FAIL');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('PACK01_GATE_A_STATIC: PASS');
console.log('Verified: upload slot compatibility + fail-safe guard before destructive rebuilds.');
