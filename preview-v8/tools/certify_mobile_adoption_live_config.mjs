import fs from 'node:fs';

const LOCAL='preview-v8/shared/adoption-config.js';
const LIVE=process.env.CUDO_LIVE_ADOPTION_CONFIG_URL||'https://cudo.cl/preview-v8/shared/adoption-config.js';
const EXPECTED_ENDPOINT='https://script.google.com/macros/s/AKfycbzZGwp2q8XEU3rZK5jyaddo5lnXTPcChBdPu-G7cnh6xesdVsOBlL2FA1u6f_qbYlqh/exec';

const fail=message=>{throw new Error('MOBILE ADOPTION LIVE CONFIG: '+message)};

function parseConfig(source){
  const window={};
  new Function('window',source)(window);
  return window.CUDO_ADOPTION_CONFIG;
}
function assertConfig(cfg,label){
  if(!cfg||cfg.schema_version!=='CUDO_MOBILE_ADOPTION_CONFIG_V1') fail(label+': schema invalid');
  if(cfg.enabled!==true) fail(label+': signal not enabled');
  if(cfg.endpoint!==EXPECTED_ENDPOINT) fail(label+': endpoint mismatch');
  const url=new URL(cfg.endpoint);
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.startsWith('/macros/s/')||!url.pathname.endsWith('/exec')){
    fail(label+': endpoint outside approved Apps Script surface');
  }
}

const local=parseConfig(fs.readFileSync(LOCAL,'utf8'));
assertConfig(local,'local');

let live=null,last='';
for(let attempt=1;attempt<=60;attempt++){
  try{
    const url=LIVE+(LIVE.includes('?')?'&':'?')+'cert='+encodeURIComponent(process.env.GITHUB_SHA||Date.now());
    const response=await fetch(url,{cache:'no-store'});
    if(response.ok){
      last=await response.text();
      const cfg=parseConfig(last);
      assertConfig(cfg,'live');
      live=cfg;
      break;
    }
  }catch(err){
    last=String(err&&err.message||err);
  }
  await new Promise(r=>setTimeout(r,5000));
}
if(!live) fail('live config did not converge: '+String(last).slice(0,300));

console.log(JSON.stringify({
  ok:true,
  classification:'PASS_MOBILE_ADOPTION_LIVE_CONFIG',
  live_url:LIVE,
  endpoint:live.endpoint,
  enabled:live.enabled,
  production_write:false
},null,2));
