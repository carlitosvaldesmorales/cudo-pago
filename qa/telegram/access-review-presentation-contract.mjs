import fs from 'node:fs';

const canonical=fs.readFileSync('sports-bus/canonical-entry.js','utf8');
const review=fs.readFileSync('sports-bus/worker/access-request-review-entry.js','utf8');

function fail(message){
  console.error(`ACCESS REVIEW CONTRACT FAIL: ${message}`);
  process.exit(1);
}

const confirmationIndex=canonical.indexOf('handleAccessRequestConfirmation');
const intakeIndex=canonical.indexOf('handleAccessRequestIntake');
const reviewIndex=canonical.indexOf('handleAccessRequestReview');
const legacyHomeIndex=canonical.indexOf('handleTelegramChepicaPlayHomeRequest');
if([confirmationIndex,intakeIndex,reviewIndex,legacyHomeIndex].some(x=>x<0)) fail('canonical handlers missing');
if(!(confirmationIndex<intakeIndex&&intakeIndex<reviewIndex&&reviewIndex<legacyHomeIndex)) fail('governed request handlers must precede legacy Chépica Play home');

for(const token of ['declared_name_visible:true','represented_entity_visible:true','technical_identity_visible:true','review_does_not_change_permissions:true']){
  if(!review.includes(token)) fail(`missing contract token ${token}`);
}
for(const token of ['Nombre declarado: ${requesterName(row)}','Representa: ${representedEntity(row)}','Telegram: ${row.username','Sólo ✅ Aprobar puede vincular']){
  if(!review.includes(token)) fail(`review presentation missing ${token}`);
}
if(!review.includes("permission_change:false")) fail('review must not materialize permissions');
if(review.includes("INSERT INTO actor_scope_grants")) fail('review renderer must never materialize grants');

console.log('ACCESS REVIEW CONTRACT OK');
