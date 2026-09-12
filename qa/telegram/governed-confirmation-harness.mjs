import assert from 'node:assert/strict';
import { handleAccessRequestConfirmation, GOVERNED_CONFIRMATION_CONTRACT } from '../../sports-bus/worker/access-request-confirm-entry.js';

class Statement {
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[];}
  bind(...values){this.values=values;return this;}
  first(){return this.db.first(this.sql,this.values);}
  all(){return this.db.all(this.sql,this.values);}
  run(){return this.db.run(this.sql,this.values);}
}

class FakeDB {
  constructor({failBatch=false}={}){
    this.failBatch=failBatch;
    this.draft={
      intake_id:'ari-9001-demo',
      telegram_user_id:'9001',
      audience_id:'CHEPICA_PLAY',
      state:'REVIEW',
      declared_name:'Usuario prueba',
      represented_entity_id:null,
      represented_entity_label:'Chépica Play'
    };
    this.partnerRequests=[];
    this.events=[];
  }
  prepare(sql){return new Statement(this,sql);}
  async first(sql,values){
    if(sql.includes('FROM access_request_intakes')){
      if(!this.draft) return null;
      const [intakeId,actorId]=values;
      return this.draft.intake_id===intakeId&&this.draft.telegram_user_id===String(actorId)?{...this.draft}:null;
    }
    if(sql.includes("'CHEPICA_PLAY' AS audience_id")&&sql.includes('intake_id=?')){
      const [actorId,intakeId]=values;
      const row=this.partnerRequests.find(r=>r.telegram_user_id===String(actorId)&&r.intake_id===intakeId);
      return row?{...row,audience_id:'CHEPICA_PLAY',represented_entity_label:row.represented_entity}:null;
    }
    if(sql.includes("'DIRIGENTES' AS audience_id")&&sql.includes('FROM access_requests')) return null;
    if(sql.includes('FROM partner_access_requests')&&sql.includes("status='PENDING'")){
      const [actorId]=values;
      const row=this.partnerRequests.find(r=>r.telegram_user_id===String(actorId)&&r.status==='PENDING');
      return row?{...row,audience_id:'CHEPICA_PLAY',represented_entity_label:row.represented_entity}:null;
    }
    return null;
  }
  async all(sql){
    if(sql.includes('FROM reporters')) return {results:[]};
    return {results:[]};
  }
  async run(sql,values){
    if(sql.includes('DELETE FROM access_request_intakes')){
      const [actorId,intakeId]=values;
      if(this.draft&&this.draft.telegram_user_id===String(actorId)&&this.draft.intake_id===intakeId) this.draft=null;
    }
    return {success:true};
  }
  async batch(statements){
    if(this.failBatch) throw new Error('simulated_persistence_failure');
    for(const statement of statements){
      if(statement.sql.includes('INSERT INTO partner_access_requests')){
        const [request_id,telegram_user_id,display_name,username,partner_code,scope_id,created_at,declared_name,represented_entity,intake_id,submitted_at]=statement.values;
        this.partnerRequests.push({
          request_id,telegram_user_id,display_name,username,partner_code,
          requested_role:'MEDIA_PARTNER',scope_type:'COMPETITION',scope_id,
          status:'PENDING',created_at,declared_name,represented_entity,intake_id,submitted_at
        });
      }else if(statement.sql.includes('INSERT OR REPLACE INTO events')){
        this.events.push({sql:statement.sql,values:statement.values});
      }
    }
    return statements.map(()=>({success:true}));
  }
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function requestFor({callbackId='cb-1'}={}){
  const secret='qa-secret:next';
  return new Request('https://qa.invalid/webhook/telegram-next',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-telegram-bot-api-secret-token':await sha256Hex(secret)
    },
    body:JSON.stringify({
      update_id:100,
      callback_query:{
        id:callbackId,
        from:{id:9001,first_name:'QA',username:'qa_actor'},
        data:'ari:confirm:ari-9001-demo',
        message:{message_id:77,chat:{id:9001,type:'private'}}
      }
    })
  });
}

const envFor=db=>({
  DB:db,
  TELEGRAM_WEBHOOK_SECRET:'qa-secret',
  TELEGRAM_BOT_TOKEN:'legacy-token',
  TELEGRAM_BOT_TOKEN_NEXT:'canonical-token'
});

assert.equal(GOVERNED_CONFIRMATION_CONTRACT.callback_ack_is_best_effort,true);
assert.equal(GOVERNED_CONFIRMATION_CONTRACT.durable_transition_precedes_side_effects,true);
assert.equal(GOVERNED_CONFIRMATION_CONTRACT.notification_failure_does_not_revert_submission,true);
assert.equal(GOVERNED_CONFIRMATION_CONTRACT.persistence_failure_preserves_draft,true);
assert.equal(GOVERNED_CONFIRMATION_CONTRACT.repeated_confirmation_is_idempotent,true);
assert.equal(GOVERNED_CONFIRMATION_CONTRACT.failures_must_not_be_silent,true);
console.log('PASS governed confirmation root invariants');

const originalFetch=globalThis.fetch;
try{
  // Regression: an expired/failed Telegram callback acknowledgement must never block REVIEW -> PENDING.
  const db=new FakeDB();
  const calls=[];
  globalThis.fetch=async(url,init={})=>{
    const method=String(url).split('/').at(-1);
    const body=init.body?JSON.parse(String(init.body)):{};
    calls.push({method,body});
    if(method==='answerCallbackQuery'){
      return new Response(JSON.stringify({ok:false,description:'Bad Request: query is too old and response timeout expired or query ID is invalid'}),{
        status:400,headers:{'content-type':'application/json'}
      });
    }
    return new Response(JSON.stringify({ok:true,result:{message_id:77}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };

  let response=await handleAccessRequestConfirmation(await requestFor(),envFor(db));
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.handled,'access_request_submitted');
  assert.equal(body.request_status,'PENDING');
  assert.equal(body.callback_ack,'FAILED_NON_BLOCKING');
  assert.equal(db.partnerRequests.length,1,'durable PENDING must exist even when callback ack fails');
  assert.equal(db.partnerRequests[0].submitted_at!=null,true);
  assert.equal(db.draft,null,'draft is cleared only after durable PENDING is observed');
  assert.ok(calls.some(call=>call.method==='editMessageText'),'applicant must receive a visible PENDING surface');
  console.log('PASS failed callback acknowledgement cannot block durable submission');

  // Repeated tap of the same stale button must converge on the existing PENDING request.
  response=await handleAccessRequestConfirmation(await requestFor({callbackId:'cb-2'}),envFor(db));
  body=await response.json();
  assert.equal(body.handled,'access_request_confirm_idempotent');
  assert.equal(body.request_status,'PENDING');
  assert.equal(db.partnerRequests.length,1,'repeated confirmation must not duplicate the request');
  console.log('PASS repeated confirmation is idempotent');

  // Persistence failure must preserve REVIEW and show an explicit retry path instead of failing silently.
  const failingDb=new FakeDB({failBatch:true});
  const failureCalls=[];
  globalThis.fetch=async(url,init={})=>{
    const method=String(url).split('/').at(-1);
    const body=init.body?JSON.parse(String(init.body)):{};
    failureCalls.push({method,body});
    return new Response(JSON.stringify({ok:true,result:{message_id:77}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };

  response=await handleAccessRequestConfirmation(await requestFor({callbackId:'cb-3'}),envFor(failingDb));
  body=await response.json();
  assert.equal(body.handled,'access_request_submit_retryable_failure');
  assert.equal(body.draft_preserved,true);
  assert.equal(failingDb.draft?.state,'REVIEW');
  assert.equal(failingDb.partnerRequests.length,0);
  const retrySurface=failureCalls.find(call=>call.method==='editMessageText'||call.method==='sendMessage');
  assert.ok(retrySurface);
  assert.match(retrySurface.body.text,/intentar nuevamente|Reintentar/i);
  console.log('PASS persistence failure preserves draft and is visible/retryable');

  console.log('RESULT: PASS');
}finally{
  globalThis.fetch=originalFetch;
}
