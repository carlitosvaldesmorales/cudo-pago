import assert from 'node:assert/strict';
import { fixtureLabel } from '../worker/fixture-label.js';

assert.equal(
  fixtureLabel({round_label:'Fecha I',home_name:'Santa Elena La Ruda',away_name:'Unión Orilla'}),
  'Fecha I · Santa Elena La Ruda vs Unión Orilla'
);

assert.equal(
  fixtureLabel({round_label:'Fecha II',home_name:'Unión Orilla',away_name:'San Juan'}),
  'Fecha II · Unión Orilla vs San Juan'
);

console.log('fixture-label local/visit order: OK');
