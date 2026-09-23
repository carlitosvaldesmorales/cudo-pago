import fs from 'node:fs';
import { chromium } from 'playwright';

const ACTIVITY_ID='QA-ACTIVITY-MATCH-PR219-001';
const WEB_APP='https://script.google.com/macros/s/AKfycbw1WjtJHJZO5RaJ6mtL6Um9afRKXArw9th-wLtUdY7qmClxvF7S3s1JUNL7-5WUjBCeDQ/exec';
const OUT='evidence/event-work-review-assignment/ux-proof.json';

async function main(){
  fs.mkdirSync('evidence/event-work-review-assignment',{recursive:true});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const result={
    schema_version:'CUDO_EVENT_WORK_REVIEW_ASSIGNMENT_UX_PROOF_V1',
    generated_at:new Date().toISOString(),
    production_write:false,
    activity_id:ACTIVITY_ID,
    checks:{},
    decision:'FAIL'
  };
  try{
    await page.goto(WEB_APP+'?activity='+encodeURIComponent(ACTIVITY_ID),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForTimeout(2500);
    const text=(await page.locator('body').innerText()).replace(/\s+/g,' ');
    result.checks.activity_title_visible=/CUDO vs San Juan/i.test(text);
    result.checks.workstream_visible=/cancha y recinto/i.test(text);
    result.checks.task_visible=/Revisión final de cancha/i.test(text);
    result.checks.assignment_visible=/Persona QA 2/i.test(text);
    result.checks.assignment_action_visible=/Reasignar a Persona QA 2/i.test(text);
    await page.screenshot({path:'evidence/event-work-review-assignment/deep-link-live.png',fullPage:true});
    const required=Object.values(result.checks);
    result.decision=required.every(Boolean)?'PASS':'FAIL';
    fs.writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
    if(result.decision!=='PASS') process.exit(1);
  } finally {
    await browser.close();
  }
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
