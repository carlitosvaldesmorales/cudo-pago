import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REAL_EVENT_SOURCE='apps_script_form_submit';
export const FAST_CRON="    - cron: '*/5 * * * *'";
export const DAILY_CRON="    - cron: '17 9 * * *'";

export function inspectReviewRunLog(text){
  const sources=[...String(text).matchAll(/CUDO_REVIEW_TRIGGER_SOURCE=([^\s]+)/g)].map(m=>m[1]);
  const counts=[...String(text).matchAll(/"new_count":\s*([0-9]+)/g)].map(m=>Number(m[1]));
  const newCount=counts.length?Math.max(...counts):0;
  if(!sources.includes(REAL_EVENT_SOURCE)){
    return {ok:false,reason:'NOT_REAL_FORM_EVENT',sources,new_count:newCount};
  }
  if(newCount<1){
    return {ok:false,reason:'NO_NEW_FORM_RESPONSE',sources,new_count:newCount};
  }
  return {ok:true,source:REAL_EVENT_SOURCE,new_count:newCount};
}

export function reducePollingToDaily(workflowText){
  const text=String(workflowText);
  if(text.includes(FAST_CRON)){
    return {changed:true,text:text.replace(FAST_CRON,DAILY_CRON)};
  }
  if(text.includes(DAILY_CRON)) return {changed:false,text};
  throw new Error('Unexpected scheduler contract; refusing automatic change');
}

export function buildEvidence({runId,headSha,createdAt,title,newCount}){
  return {
    ok:true,
    classification:'PASS_REAL_APPS_SCRIPT_FORM_EVENT_TO_REVIEW_ENGINE',
    source:REAL_EVENT_SOURCE,
    review_engine_run_id:Number(runId),
    review_engine_head_sha:String(headSha||''),
    review_engine_created_at:String(createdAt||''),
    review_engine_display_title:String(title||''),
    new_count:Number(newCount),
    result:'SUCCESS',
    safety_net_transition:'5_MINUTE_POLLING_TO_DAILY_RECONCILIATION',
  };
}

export function materializeCertification({logText,workflowText,metadata,evidenceDir}){
  const inspection=inspectReviewRunLog(logText);
  if(!inspection.ok) throw new Error(`${inspection.reason}: keep polling safety net`);
  const schedule=reducePollingToDaily(workflowText);
  const evidence=buildEvidence({...metadata,newCount:inspection.new_count});
  fs.mkdirSync(evidenceDir,{recursive:true});
  fs.writeFileSync(path.join(evidenceDir,'event-driven-latest.json'),JSON.stringify(evidence,null,2)+'\n');
  fs.writeFileSync(path.join(evidenceDir,'event-driven-latest.md'),[
    '# CUDO Review Event-Driven Certification','',
    `run_id: ${evidence.review_engine_run_id}`,
    `source: ${evidence.source}`,
    `new_count: ${evidence.new_count}`,
    'result: PASS_REAL_APPS_SCRIPT_FORM_EVENT_TO_REVIEW_ENGINE',
    'scheduler_after_pass: daily_reconciliation',''
  ].join('\n'));
  return {inspection,schedule,evidence};
}

const isMain=process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]);
if(isMain){
  const logPath=process.env.CUDO_REVIEW_RUN_LOG;
  const workflowPath=process.env.CUDO_REVIEW_WORKFLOW_PATH||'.github/workflows/cudo-review-engine.yml';
  const evidenceDir=process.env.CUDO_REVIEW_EVENT_EVIDENCE_DIR||'evidence/review-event-bridge';
  if(!logPath) throw new Error('CUDO_REVIEW_RUN_LOG no configurado');
  const result=materializeCertification({
    logText:fs.readFileSync(logPath,'utf8'),
    workflowText:fs.readFileSync(workflowPath,'utf8'),
    metadata:{
      runId:process.env.SOURCE_RUN_ID,
      headSha:process.env.SOURCE_HEAD_SHA,
      createdAt:process.env.SOURCE_CREATED_AT,
      title:process.env.SOURCE_TITLE,
    },
    evidenceDir,
  });
  fs.writeFileSync(workflowPath,result.schedule.text);
  console.log(JSON.stringify({ok:true,source:result.inspection.source,new_count:result.inspection.new_count,schedule_changed:result.schedule.changed},null,2));
}
