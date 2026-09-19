import fs from 'node:fs';
import {buildDynamicEventViews} from '../shared/event-resource-projection.mjs';

const golden=JSON.parse(fs.readFileSync(new URL('../data/club-os-mock.json',import.meta.url),'utf8'));
const views=buildDynamicEventViews(golden);

const match=views.find(v=>v.event_id==='MOCK-EVENT-MATCH-SCHEDULED-01');
const bingo=views.find(v=>v.event_id==='MOCK-EVENT-BINGO-01');

if(!match) throw new Error('missing MATCH proof instance');
if(!bingo) throw new Error('missing BINGO proof instance');
if(match.kind!=='MATCH') throw new Error('MATCH proof kind mismatch');
if(bingo.kind!=='FUNDRAISING') throw new Error('BINGO proof kind mismatch');
if(!match.capabilities.includes('SPORTS_COMPETITION')) throw new Error('MATCH sports capability missing');
if(!match.capabilities.includes('VENUE_REQUIRED')) throw new Error('MATCH venue capability missing');
if(!bingo.capabilities.includes('EXTERNAL_PERMISSION')) throw new Error('BINGO external permission capability missing');
if(!bingo.capabilities.includes('SPONSOR_OR_EXTERNAL_SUPPORT')) throw new Error('BINGO sponsor capability missing');
if(!match.active_branches.includes('HUMAN_WORK')) throw new Error('MATCH work branch missing');
if(!bingo.active_branches.includes('HUMAN_WORK')) throw new Error('BINGO work branch missing');
if(!bingo.active_branches.includes('FINANCE')) throw new Error('BINGO finance branch missing');
if(!match.work.some(w=>w.work_id==='MOCK-WORK-PREPARE-FIELD-01')) throw new Error('MATCH field work missing');
if(!bingo.work.some(w=>w.work_id==='MOCK-WORK-MUNICIPAL-AUTH-01')) throw new Error('BINGO permission work missing');
if(!bingo.finance.receivables.some(o=>o.obligation_id==='MOCK-OBL-SPONSOR-01')) throw new Error('BINGO sponsor receivable missing');
if(views.some(v=>v.production_write!==false||v.mock!==true)) throw new Error('projection must remain mock and non-production');

console.log(JSON.stringify({
  result:'PASS',
  schema:'CUDO_DYNAMIC_EVENT_RESOURCE_WEB_MOCK_V1',
  instances:[
    {event_id:match.event_id,kind:match.kind,branches:match.active_branches,capabilities:match.capabilities},
    {event_id:bingo.event_id,kind:bingo.kind,branches:bingo.active_branches,capabilities:bingo.capabilities}
  ]
},null,2));
