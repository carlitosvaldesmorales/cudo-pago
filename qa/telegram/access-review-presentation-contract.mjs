import fs from 'node:fs';

const canonical=fs.readFileSync('sports-bus/canonical-entry.js','utf8');
const review=fs.readFileSync('sports-bus/worker/access-request-review-entry.js','utf8');
const decision=fs.readFileSync('sports-bus/worker/telegram-chepica-play-home-entry.js','utf8');
const subject=fs.readFileSync('sports-bus/worker/access-request-presentation.js','utf8');

function fail(message){
  console.error(`ACCESS REVIEW CONTRACT FAIL: ${message}`);
  process.exit(1);
}

const confirmationIndex=canonical.indexOf('const confirmation=await handleAccessRequestConfirmation');
const intakeIndex=canonical.indexOf('const intake=await handleAccessRequestIntake');
const reviewIndex=canonical.indexOf('const review=await handleAccessRequestReview');
const legacyHomeIndex=canonical.indexOf('const chepicaPlayHome=await handleTelegramChepicaPlayHomeRequest');
if([confirmationIndex,intakeIndex,reviewIndex,legacyHomeIndex].some(x=>x<0)) fail('canonical handler calls missing');
if(!(confirmationIndex<intakeIndex&&intakeIndex<reviewIndex&&reviewIndex<legacyHomeIndex)) fail('governed request handlers must precede legacy Chépica Play home');

for(const token of ['declared_name_precedes_telegram_profile:true','represented_entity_is_declarative_context:true','technical_identity_remains_separate:true']){
  if(!subject.includes(token)) fail(`missing subject contract token ${token}`);
}
if(!subject.includes("return row?.declared_name\n    || row?.display_name")) fail('declared name must take precedence over Telegram profile display name');

for(const token of ['declared_name_visible:true','represented_entity_visible:true','technical_identity_visible:true','review_does_not_change_permissions:true']){
  if(!review.includes(token)) fail(`missing contract token ${token}`);
}
for(const token of ['accessRequestSubjectName(row)','accessRequestRepresentedEntity(row)','accessRequestTechnicalIdentity(row)','Sólo ✅ Aprobar puede vincular']){
  if(!review.includes(token)) fail(`review presentation missing ${token}`);
}
if(!review.includes('permission_change:false')) fail('review must not materialize permissions');
if(review.includes('INSERT INTO actor_scope_grants')) fail('review renderer must never materialize grants');

for(const token of [
  '👤 ${accessRequestSubjectName(row)} quedó vinculado a Chépica Play.',
  '🏟️ ${accessRequestRepresentedEntity(row)}',
  '📱 ${accessRequestTechnicalIdentity(row)}',
  '👤 ${accessRequestSubjectName(row)} no fue vinculado a Chépica Play.'
]){
  if(!decision.includes(token)) fail(`decision presentation missing canonical request subject: ${token}`);
}
if(decision.includes('`${row.display_name||row.telegram_user_id} quedó vinculado a Chépica Play.`')) fail('approval must not regress to Telegram profile display name');
if(decision.includes('`${row.display_name||row.telegram_user_id} no fue vinculado a Chépica Play.`')) fail('rejection must not regress to Telegram profile display name');

console.log('ACCESS REVIEW + DECISION PRESENTATION CONTRACT OK');
