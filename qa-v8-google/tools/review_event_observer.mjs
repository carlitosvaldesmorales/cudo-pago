import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REAL_EVENT_SOURCE='apps_script_form_submit';

export function inspectReviewRunLog(text){
  const raw=String(text);
  const sources=[...raw.matchAll(/CUDO_REVIEW_TRIGGER_SOURCE=([^\s]+)/g)].map(m=>m[1]);
  const counts=[...raw.matchAll(/"new_count":\s*([0-9]+)/g)].map(m=>Number(m[1]));
  const newCount=counts.length?Math.max(...counts):0;
  const appliedCount=[...raw.matchAll(/"status":\s*"APLICADO"/g)].length;
  if(!sources.includes(REAL_EVENT_SOURCE)){
    return {ok:false,reason:'NOT_REAL_FORM_EVENT',sources,new_count:newCount,applied_count:appliedCount};
  }
  if(newCount<1){
    return {ok:false,reason:'NO_NEW_FORM_RESPONSE',sources,new_count:newCount,applied_count:appliedCount};
  }
  if(appliedCount<1){
    return {ok:false,reason:'NO_APPLIED_REVIEW_DECISION',sources,new_count:newCount,applied_count:appliedCount};
  }
  return {ok:true,source:REAL_EVENT_SOURCE,new_count:newCount,applied_count:appliedCount};
}

export function assertEventDrivenOnly(workflowText){
  const text=String(workflowText);
  const hasSchedule=/^\s*schedule\s*:/m.test(text);
  const hasCron=/\bcron\s*:/m.test(text);
  if(hasSchedule||hasCron){
    throw new Error('POLLING_NOT_ALLOWED: CUDO Review Engine debe ser event-driven only');
  }
  return {ok:true,polling:false,mode:'EVENT_DRIVEN_ONLY'};
}

export function buildEvidence({runId,headSha,createdAt,title,newCount,appliedCount}){
  return {
    ok:true,
    classification:'PASS_REAL_APPS_SCRIPT_FORM_EVENT_TO_APPLIED_REVIEW_DECISION',
    source:REAL_EVENT_SOURCE,
    review_engine_run_id:Number(runId),
    review_engine_head_sha:String(headSha||''),
    review_engine_created_at:String(createdAt||''),
    review_engine_display_title:String(title||''),
    new_count:Number(newCount),
    applied_count:Number(appliedCount),
    result:'SUCCESS',
    execution_mode:'EVENT_DRIVEN_ONLY',
    polling:false,
  };
}

export function materializeCertification({logText,workflowText,metadata,evidenceDir}){
  const inspection=inspectReviewRunLog(logText);
  if(!inspection.ok) throw new Error(inspection.reason);
  const eventDriven=assertEventDrivenOnly(workflowText);
  const evidence=buildEvidence({...metadata,newCount:inspection.new_count,appliedCount:inspection.applied_count});
  fs.mkdirSync(evidenceDir,{recursive:true});
  fs.writeFileSync(path.join(evidenceDir,'event-driven-latest.json'),JSON.stringify(evidence,null,2)+'\n');
  fs.writeFileSync(path.join(evidenceDir,'event-driven-latest.md'),[
    '# CUDO Review Event-Driven Certification','',
    `run_id: ${evidence.review_engine_run_id}`,
    `source: ${evidence.source}`,
    `new_count: ${evidence.new_count}`,
    `applied_count: ${evidence.applied_count}`,
    'result: PASS_REAL_APPS_SCRIPT_FORM_EVENT_TO_APPLIED_REVIEW_DECISION',
    'execution_mode: event_driven_only',
    'polling: false',''
  ].join('\n'));
  return {inspection,eventDriven,evidence};
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
  console.log(JSON.stringify({
    ok:true,
    source:result.inspection.source,
    new_count:result.inspection.new_count,
    applied_count:result.inspection.applied_count,
    execution_mode:result.eventDriven.mode,
    polling:false
  },null,2));
}
