import assert from 'node:assert/strict';
import { classifySocialReference } from './resolver.mjs';

const cases = [
  ['@jugador', '', ['instagram','profile','REFERENCE_ONLY']],
  ['@jugador', 'facebook', ['facebook','profile','REFERENCE_ONLY']],
  ['https://www.instagram.com/jugador/', '', ['instagram','profile','REFERENCE_ONLY']],
  ['https://www.instagram.com/p/ABC123/', '', ['instagram','post','ENRICHABLE_PUBLIC_CONTENT']],
  ['https://www.instagram.com/reel/ABC123/', '', ['instagram','reel','ENRICHABLE_PUBLIC_CONTENT']],
  ['https://www.facebook.com/jugador', '', ['facebook','profile','REFERENCE_ONLY']],
  ['https://www.facebook.com/jugador/posts/ABC123/', '', ['facebook','post','ENRICHABLE_PUBLIC_CONTENT']],
  ['https://www.facebook.com/reel/ABC123/', '', ['facebook','reel','ENRICHABLE_PUBLIC_CONTENT']],
];

for (const [input, hint, expected] of cases) {
  const actual = classifySocialReference(input, hint);
  assert.deepEqual([actual.provider, actual.kind, actual.status], expected, input);
}

const invalid = classifySocialReference('esto no es una red social');
assert.equal(invalid.status, 'INVALID');

console.log(JSON.stringify({status:'PASS', cases:cases.length + 1}));
