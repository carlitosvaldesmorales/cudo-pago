import assert from 'node:assert/strict';
import {createArbitrationConstraint,resolvePartialOrder} from './causal_partial_order_arbitration.mjs';

const candidates=[
  'CUDO-ACTION-APPLICATION-DONE',
  'CUDO-ACTION-EXTERNAL-DECISION',
  'CUDO-ACTION-CREATE-RECEIVABLE',
  'CUDO-ACTION-PAY-FINE',
  'CUDO-ACTION-RECALC-ELIGIBILITY',
  'CUDO-ACTION-UNRELATED'
];

const constraints=[
  createArbitrationConstraint({
    predecessorId:'CUDO-ACTION-APPLICATION-DONE',
    successorId:'CUDO-ACTION-EXTERNAL-DECISION',
    constraintCode:'EXTERNAL_DECISION_REQUIRES_APPLICATION_DONE',
    explanation:'La decisión externa sólo puede registrarse después de completar la solicitud.',
    sourceRefs:['arke://CUDO_EXTERNAL_GRANT_FUNDING_DISCOVERY_v1']
  }),
  createArbitrationConstraint({
    predecessorId:'CUDO-ACTION-EXTERNAL-DECISION',
    successorId:'CUDO-ACTION-CREATE-RECEIVABLE',
    constraintCode:'APPROVAL_BEFORE_RECEIVABLE',
    explanation:'La solicitud por sí sola no crea cuenta por cobrar; primero debe existir aprobación.',
    sourceRefs:['arke://CUDO_EXTERNAL_GRANT_FUNDING_DISCOVERY_v1'],
    createdAt:'2026-09-20T01:35:01.000Z'
  }),
  createArbitrationConstraint({
    predecessorId:'CUDO-ACTION-PAY-FINE',
    successorId:'CUDO-ACTION-RECALC-ELIGIBILITY',
    constraintCode:'SETTLEMENT_BEFORE_ELIGIBILITY_RECALCULATION',
    explanation:'La elegibilidad se recalcula según el estado de la multa.',
    sourceRefs:['arke://CUDO_SANCTION_FINE_ELIGIBILITY_DISCOVERY_v1'],
    createdAt:'2026-09-20T01:35:02.000Z'
  })
];

const first=resolvePartialOrder({candidateIds:candidates,constraints});
assert.equal(first.ok,true);
assert.deepEqual(first.executable_now,[
  'CUDO-ACTION-APPLICATION-DONE',
  'CUDO-ACTION-PAY-FINE',
  'CUDO-ACTION-UNRELATED'
]);
assert.deepEqual(first.layers,[
  ['CUDO-ACTION-APPLICATION-DONE','CUDO-ACTION-PAY-FINE','CUDO-ACTION-UNRELATED'],
  ['CUDO-ACTION-EXTERNAL-DECISION','CUDO-ACTION-RECALC-ELIGIBILITY'],
  ['CUDO-ACTION-CREATE-RECEIVABLE']
]);
assert.equal(first.total_order_claimed,false);
assert.ok(first.incomparable_pairs.some(([a,b])=>a==='CUDO-ACTION-APPLICATION-DONE'&&b==='CUDO-ACTION-PAY-FINE'));

const second=resolvePartialOrder({
  candidateIds:candidates,
  constraints,
  completedIds:['CUDO-ACTION-APPLICATION-DONE']
});
assert.ok(second.executable_now.includes('CUDO-ACTION-EXTERNAL-DECISION'));
assert.ok(!second.executable_now.includes('CUDO-ACTION-CREATE-RECEIVABLE'));

const openConstraint=createArbitrationConstraint({
  predecessorId:'CUDO-ACTION-UNRELATED',
  successorId:'CUDO-ACTION-PAY-FINE',
  constraintCode:'NUEVA_RESTRICCION_VALIDADA_NO_PREDEFINIDA',
  explanation:'Prueba open-world de un código de restricción nuevo.',
  sourceRefs:['fixture://arbitration/open-world'],
  createdAt:'2026-09-20T01:35:03.000Z'
});
assert.equal(openConstraint.data.constraint_code,'NUEVA_RESTRICCION_VALIDADA_NO_PREDEFINIDA');

const c1=createArbitrationConstraint({
  predecessorId:'CUDO-ACTION-APPLICATION-DONE',
  successorId:'CUDO-ACTION-EXTERNAL-DECISION',
  constraintCode:'CYCLE_TEST_1',
  explanation:'cycle',
  sourceRefs:['fixture://cycle/1'],
  createdAt:'2026-09-20T01:35:04.000Z'
});
const c2=createArbitrationConstraint({
  predecessorId:'CUDO-ACTION-EXTERNAL-DECISION',
  successorId:'CUDO-ACTION-APPLICATION-DONE',
  constraintCode:'CYCLE_TEST_2',
  explanation:'cycle',
  sourceRefs:['fixture://cycle/2'],
  createdAt:'2026-09-20T01:35:05.000Z'
});
const cycle=resolvePartialOrder({
  candidateIds:['CUDO-ACTION-APPLICATION-DONE','CUDO-ACTION-EXTERNAL-DECISION'],
  constraints:[c1,c2]
});
assert.equal(cycle.ok,false);
assert.equal(cycle.status,'BLOCKED_CYCLE');
assert.deepEqual(cycle.executable_now,[]);

console.log(JSON.stringify({
  ok:true,
  contract:'CUDO_CAUSAL_PARTIAL_ORDER_ARBITRATION_V1',
  causal_precedence:true,
  transitive_layers:first.layers,
  executable_now:first.executable_now,
  incomparable_pair_preserved:true,
  open_constraint_code:true,
  cycle_fail_closed:true,
  total_order_claimed:false,
  global_priority_score:false,
  production_write:false
},null,2));
