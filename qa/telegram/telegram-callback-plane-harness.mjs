import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareTelegramEntryContext, getTelegramEntryContext } from '../../sports-bus/worker/telegram-entry-context.js';
import { AUDIENCE_CONTEXT } from '../../sports-bus/worker/telegram-navigation-contract.js';
import { AUDIENCE_ACCESS_POLICIES } from '../../sports-bus/worker/audience-access-policy.js';

const SECRET='qa-secret';

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function callbackRequest(data){
  const token=await sha256Hex(`${SECRET}:next`);
  return new Request('https://example.test/webhook/telegram-next',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':token
    },
    body:JSON.stringify({
      callback_query:{
        id:`cb-${data}`,
        from:{id:101,first_name:'QA'},
        message:{message_id:55,chat:{id:101}},
        data
      }
    })
  });
}

function envWithDb(DB){
  return {
    DB,
    TELEGRAM_WEBHOOK_SECRET:SECRET,
    TELEGRAM_BOT_TOKEN_NEXT:'qa-next-token',
    TELEGRAM_BOT_TOKEN:'qa-primary-token'
  };
}

function failingNavigationContextDb(){
  return {
    prepare(sql){
      return {
        bind(){return this;},
        async run(){
          if(/telegram_entry_contexts/.test(sql)) throw new Error('simulated_navigation_context_write_failure');
          return {success:true};
        },
        async first(){
          if(/telegram_entry_contexts/.test(sql)) throw new Error('simulated_navigation_context_read_failure');
          return null;
        }
      };
    }
  };
}

const rootPolicies=new Map(AUDIENCE_ACCESS_POLICIES.map(policy=>[policy.id,policy]));
assert.equal(rootPolicies.get('PUBLIC_GENERAL')?.entry_callback,'tp:public');
assert.equal(rootPolicies.get('DIRIGENTES')?.entry_callback,'tp:leaders');
assert.equal(rootPolicies.get('CHEPICA_PLAY')?.entry_callback,'mp:home');

for(const policy of AUDIENCE_ACCESS_POLICIES){
  const original=await callbackRequest(policy.entry_callback);
  const prepared=await prepareTelegramEntryContext(original,envWithDb(failingNavigationContextDb()));
  assert.equal(prepared.response,null,`${policy.id} must not be blocked by navigation metadata failure`);
  const body=await prepared.request.clone().json();
  assert.equal(body.callback_query.data,policy.entry_callback,`${policy.id} callback must continue unchanged`);
}
console.log('PASS all root audience callbacks survive navigation metadata write failure');

const backPrepared=await prepareTelegramEntryContext(
  await callbackRequest('nav:back'),
  envWithDb(failingNavigationContextDb())
);
assert.equal(backPrepared.response,null);
const backBody=await backPrepared.request.clone().json();
assert.equal(backBody.callback_query.data,'tp:home','failed context lookup must degrade to canonical root, not 500');
console.log('PASS Back degrades safely to root when navigation metadata cannot be read');

assert.equal(
  await getTelegramEntryContext(failingNavigationContextDb(),'101'),
  AUDIENCE_CONTEXT.PUBLIC_GENERAL,
  'context read failure must return safe navigation default'
);
console.log('PASS context read helper degrades safely');

const migration=fs.readFileSync('sports-bus/migrations/0028_telegram_entry_context_audiences.sql','utf8');
for(const contextCode of Object.values(AUDIENCE_CONTEXT)){
  assert.ok(migration.includes(`'${contextCode}'`),`migration must persist canonical audience context ${contextCode}`);
}
assert.match(migration,/CHECK\(context_code IN \('PUBLIC_GENERAL','DIRIGENTES','CHEPICA_PLAY'\)\)/);
console.log('PASS D1 context constraint is aligned with canonical audience contract');

const originalMigration=fs.readFileSync('sports-bus/migrations/0025_telegram_entry_context.sql','utf8');
assert.ok(!originalMigration.includes("'DIRIGENTES'"),'fixture proves the historical schema drift that this migration repairs');
console.log('PASS regression fixture preserves evidence of the historical schema mismatch');

console.log('RESULT: PASS');
