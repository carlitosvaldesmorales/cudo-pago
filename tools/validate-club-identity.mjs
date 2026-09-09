import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'preview-v8/media/clubes');
const manifest = JSON.parse(readFileSync(resolve(dir, 'identity-manifest.json'), 'utf8'));
let failed = false;
for (const [file, meta] of Object.entries(manifest.assets)) {
  const bytes = readFileSync(resolve(dir, file));
  const actual = createHash('sha256').update(bytes).digest('hex');
  const ok = actual === meta.sha256;
  console.log(`${ok ? 'OK' : 'FAIL'} ${file} ${actual}`);
  if (!ok) failed = true;
}
if (failed) {
  console.error('IDENTITY GATE FAILED: existe al menos un activo distinto a su fuente aprobada.');
  process.exit(1);
}
console.log('IDENTITY GATE PASSED');
