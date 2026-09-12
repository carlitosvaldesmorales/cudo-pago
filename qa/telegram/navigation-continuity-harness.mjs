import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AUDIENCE_CONTEXT,
  NAVIGATION_ACTION,
  NAVIGATION_CONTRACT,
  NAVIGATION_LABEL,
  NAVIGATION_SEMANTICS,
  audienceHomeCallback,
  navigationButton
} from '../../sports-bus/worker/telegram-navigation-contract.js';

const read=path=>fs.readFileSync(path,'utf8');

assert.equal(NAVIGATION_LABEL.BACK,'⬅️ Volver');
assert.equal(NAVIGATION_LABEL.CANCEL,'❌ Cancelar');
assert.equal(NAVIGATION_LABEL.FINISH,'✅ Terminar');
assert.equal(NAVIGATION_LABEL.HOME,'🏠 Inicio');
assert.equal(NAVIGATION_SEMANTICS.BACK.mutates_business_state,false);
assert.equal(NAVIGATION_SEMANTICS.BACK.destroys_navigation_context,false);
assert.equal(NAVIGATION_SEMANTICS.CANCEL.may_discard_unconfirmed_draft,true);
assert.equal(NAVIGATION_SEMANTICS.FINISH.destroys_navigation_context,false);
assert.equal(NAVIGATION_SEMANTICS.HOME.explicit_context_exit,true);
assert.equal(NAVIGATION_SEMANTICS.HOME.destroys_navigation_context,true);
assert.ok(NAVIGATION_CONTRACT.invariants.includes('SHARED_CAPABILITY_RETURNS_TO_ORIGIN_AUDIENCE'));
assert.deepEqual(navigationButton(NAVIGATION_ACTION.BACK,'nav:back'),{text:'⬅️ Volver',callback_data:'nav:back'});
console.log('PASS canonical Back / Cancel / Finish / Home semantics');

assert.equal(audienceHomeCallback(AUDIENCE_CONTEXT.PUBLIC_GENERAL),'tp:public');
assert.equal(audienceHomeCallback(AUDIENCE_CONTEXT.DIRIGENTES),'tp:leaders');
assert.equal(audienceHomeCallback(AUDIENCE_CONTEXT.CHEPICA_PLAY),'mp:home');
assert.equal(audienceHomeCallback('UNKNOWN'),'tp:home');
console.log('PASS audience origin mapping');

const entry=read('sports-bus/worker/telegram-entry-context.js');
assert.match(entry,/data==='tp:public'/);
assert.match(entry,/AUDIENCE_CONTEXT\.PUBLIC_GENERAL/);
assert.match(entry,/data==='tp:leaders'/);
assert.match(entry,/AUDIENCE_CONTEXT\.DIRIGENTES/);
assert.match(entry,/data==='mp:home'/);
assert.match(entry,/AUDIENCE_CONTEXT\.CHEPICA_PLAY/);
assert.match(entry,/data==='nav:back'/);
assert.match(entry,/audienceHomeCallback\(contextCode\)/);
assert.match(entry,/data==='rr:cancel-menu'/);
assert.match(entry,/data==='p3:public'/);
assert.match(entry,/if\(data==='tp:home'\)[\s\S]*clearContext/);
console.log('PASS navigation context persists by audience and Home alone exits context');

const register=read('sports-bus/worker/results-register-v2-entry.js');
assert.ok(!register.includes("text:'❌ Salir'"),'new result-registration surfaces must not emit Salir');
assert.match(register,/navigationButton\(NAVIGATION_ACTION\.BACK,'nav:back'\)/);
assert.match(register,/⬅️ Volver a fechas/);
assert.match(register,/⬅️ Volver a \$\{match\.round_label/);
assert.match(register,/rr:step-back:/);
const backHomeStart=register.indexOf('const backHome=');
const backSeriesStart=register.indexOf('const backSeries=');
assert.ok(backHomeStart>=0&&backSeriesStart>backHomeStart);
const backHomeBlock=register.slice(backHomeStart,backSeriesStart);
assert.ok(!backHomeBlock.includes('home_score=NULL'),'Back from visitor score must preserve the captured home score');
assert.ok(backHomeBlock.includes('away_score=NULL'));
assert.match(register,/Serie cancelada\. Sólo se descartó el trabajo no confirmado/);
console.log('PASS result-entry hierarchy no longer uses exit as back and Back preserves captured state');

const publicTable=read('sports-bus/worker/public-results-table-view.js');
const publicV3=read('sports-bus/worker/public-results-ux-v3.js');
assert.match(publicTable,/navigationButton\(NAVIGATION_ACTION\.BACK, 'nav:back'\)/);
assert.match(publicV3,/navigationButton\(NAVIGATION_ACTION\.BACK, 'nav:back'\)/);
assert.ok(!publicV3.includes("{ text: '🌐 Público', callback_data: 'p3:public' }"),'shared result capability must not hard-code Public as its exit');
console.log('PASS shared results return to the origin audience');

const portal=read('sports-bus/worker/portal-entry.js');
assert.ok(!portal.includes("text:'🏠 Volver'"),'Back must not be represented with the Home icon');
assert.match(portal,/⬅️ Volver a Dirigentes/);
assert.match(portal,/navigationButton\(NAVIGATION_ACTION\.BACK,'nav:back'\)/);
console.log('PASS dirigentes/public nested screens distinguish Back from Home');

const adn=read('docs/architecture/navigation-continuity-adn-v1.md');
for(const invariant of NAVIGATION_CONTRACT.invariants) assert.ok(adn.includes(invariant),`ADN missing ${invariant}`);
assert.ok(adn.includes('AUDIENCE_CONTEXT_NEQ_AUTHORIZATION'));
console.log('PASS navigation ADN is explicit and enforceable');

console.log('RESULT: PASS');
