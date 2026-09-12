import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIENCE_ACCESS_MODE,
  AUTHORIZATION_MODEL,
  AUDIENCE_ACCESS_STATE,
  AUDIENCE_ACCESS_POLICIES,
  getAudienceAccessPolicy,
  resolveAudienceAccessState,
  validateAudienceAccessPolicies
} from '../../sports-bus/worker/audience-access-policy.js';
import {
  AUDIENCE_ROOT_CONTRACT,
  TELEGRAM_ROOT_AUDIENCES
} from '../../sports-bus/worker/telegram-audience-root.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

assert.deepEqual(validateAudienceAccessPolicies(),[]);
assert.deepEqual(TELEGRAM_ROOT_AUDIENCES.map(item=>item.id),['PUBLIC_GENERAL','DIRIGENTES','CHEPICA_PLAY']);
assert.equal(AUDIENCE_ROOT_CONTRACT.root_access_policy_is_canonical,true);
assert.equal(AUDIENCE_ROOT_CONTRACT.restricted_audiences_have_actionable_enrollment,true);
assert.equal(AUDIENCE_ROOT_CONTRACT.request_never_grants_authority,true);
assert.equal(AUDIENCE_ROOT_CONTRACT.approval_precedes_authority_materialization,true);
console.log('PASS root audiences derive from one canonical access-policy registry');

const publicPolicy=getAudienceAccessPolicy('PUBLIC_GENERAL');
assert.equal(publicPolicy.access_mode,AUDIENCE_ACCESS_MODE.OPEN);
assert.equal(publicPolicy.authorization_model,AUTHORIZATION_MODEL.NONE);
assert.equal(publicPolicy.requestable,false);
assert.equal(resolveAudienceAccessState(publicPolicy),AUDIENCE_ACCESS_STATE.OPEN);
console.log('PASS public audience remains open and never enters enrollment');

const dirigentes=getAudienceAccessPolicy('DIRIGENTES');
assert.equal(dirigentes.access_mode,AUDIENCE_ACCESS_MODE.RESTRICTED);
assert.equal(dirigentes.authorization_model,AUTHORIZATION_MODEL.ROLE);
assert.equal(dirigentes.target_authority,'CLUB_ADMIN');
assert.equal(dirigentes.request_callback,'tp:req');
assert.equal(dirigentes.status_callback,'tp:reqstatus');
assert.equal(dirigentes.persistence_adapter,'access_requests');
assert.equal(dirigentes.grants_on_entry,false);
assert.equal(resolveAudienceAccessState(dirigentes,{authorized:true}),AUDIENCE_ACCESS_STATE.AUTHORIZED);
assert.equal(resolveAudienceAccessState(dirigentes,{pending:true}),AUDIENCE_ACCESS_STATE.PENDING);
assert.equal(resolveAudienceAccessState(dirigentes),AUDIENCE_ACCESS_STATE.REQUESTABLE);
console.log('PASS Dirigentes is a restricted actionable ROLE enrollment policy');

const chepica=getAudienceAccessPolicy('CHEPICA_PLAY');
assert.equal(chepica.access_mode,AUDIENCE_ACCESS_MODE.RESTRICTED);
assert.equal(chepica.authorization_model,AUTHORIZATION_MODEL.SCOPED_GRANT);
assert.equal(chepica.target_authority,'MEDIA_PARTNER');
assert.equal(chepica.request_callback,'cp:access-request');
assert.equal(chepica.status_callback,'cp:access-status');
assert.equal(chepica.cancel_callback,'cp:access-cancel');
assert.equal(chepica.persistence_adapter,'partner_access_requests');
assert.equal(chepica.scope_type,'COMPETITION');
assert.equal(chepica.scope_id,'ANFA-CHEPICA-2026');
assert.deepEqual([...chepica.capabilities],['READ_COMPETITION','OBSERVE_RESULT']);
assert.equal(chepica.grants_on_entry,false);
assert.equal(chepica.control_plane_bypass,false);
assert.equal(resolveAudienceAccessState(chepica,{authorized:true}),AUDIENCE_ACCESS_STATE.AUTHORIZED);
assert.equal(resolveAudienceAccessState(chepica,{pending:true}),AUDIENCE_ACCESS_STATE.PENDING);
assert.equal(resolveAudienceAccessState(chepica),AUDIENCE_ACCESS_STATE.REQUESTABLE);
console.log('PASS Chépica Play requires explicit SCOPED_GRANT membership with no control-plane bypass');

for(const policy of AUDIENCE_ACCESS_POLICIES){
  const rootItem=TELEGRAM_ROOT_AUDIENCES.find(item=>item.id===policy.id);
  assert.ok(rootItem,`root item missing for ${policy.id}`);
  assert.equal(rootItem.callback_data,policy.entry_callback);
  assert.equal(rootItem.label,policy.label);
}
console.log('PASS root labels and callbacks cannot drift from access policy');

const dirigentesAdapter=read('sports-bus/worker/portal-entry.js');
assert.ok(dirigentesAdapter.includes("callbackData === 'tp:req'"));
assert.ok(dirigentesAdapter.includes("callbackData === 'tp:reqstatus'"));
assert.ok(dirigentesAdapter.includes('INSERT INTO access_requests'));
assert.ok(dirigentesAdapter.includes("status='APPROVED'"));
assert.ok(dirigentesAdapter.includes("role='CLUB_ADMIN'"));
console.log('PASS Dirigentes adapter implements request -> approval -> role materializer');

const chepicaAdapter=read('sports-bus/worker/telegram-chepica-play-home-entry.js');
assert.ok(chepicaAdapter.includes("data==='cp:access-request'"));
assert.ok(chepicaAdapter.includes("data==='cp:access-status'"));
assert.ok(chepicaAdapter.includes('INSERT INTO partner_access_requests'));
assert.ok(chepicaAdapter.includes('INSERT INTO actor_scope_grants'));
assert.ok(chepicaAdapter.includes("'MEDIA_PARTNER','COMPETITION'"));
assert.ok(chepicaAdapter.includes("[{text:'📝 Solicitar autorización',callback_data:'cp:access-request'}]"));
assert.ok(!chepicaAdapter.includes('privilegedContext'));
assert.ok(!chepicaAdapter.includes('canUsePrivilegedContext'));
const contextAdapter=read('sports-bus/worker/telegram-entry-context.js');
assert.ok(!contextAdapter.includes("['SUPER_ADMIN','PLATFORM_OPERATOR']"));
assert.ok(contextAdapter.includes("membership?.partner_code==='CHEPICA_PLAY'"));
console.log('PASS Chépica Play adapters require explicit membership and contain no admin bypass');

const deadEnd=AUDIENCE_ACCESS_POLICIES.map(policy=>({...policy}));
const cp=deadEnd.find(policy=>policy.id==='CHEPICA_PLAY');
cp.requestable=false;
cp.invitation_supported=false;
assert.ok(validateAudienceAccessPolicies(deadEnd).includes('restricted_audience_dead_end:CHEPICA_PLAY'));

const unsafe=AUDIENCE_ACCESS_POLICIES.map(policy=>({...policy}));
unsafe.find(policy=>policy.id==='DIRIGENTES').grants_on_entry=true;
assert.ok(validateAudienceAccessPolicies(unsafe).includes('entry_must_not_grant_authority:DIRIGENTES'));
const bypass=AUDIENCE_ACCESS_POLICIES.map(policy=>({...policy}));
bypass.find(policy=>policy.id==='CHEPICA_PLAY').control_plane_bypass=true;
assert.ok(validateAudienceAccessPolicies(bypass).includes('scoped_audience_control_plane_bypass_forbidden:CHEPICA_PLAY'));
console.log('PASS policy fails closed on dead ends, authority-on-entry and scoped-audience admin bypass');

console.log('RESULT: PASS');
