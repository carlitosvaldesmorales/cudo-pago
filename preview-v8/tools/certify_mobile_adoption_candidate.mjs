import fs from 'node:fs';
import { chromium, webkit } from 'playwright';

const adoptionSource=fs.readFileSync('preview-v8/shared/adoption.js','utf8');
const configSource=fs.readFileSync('preview-v8/shared/adoption-config.js','utf8');
const siteSource=fs.readFileSync('preview-v8/shared/site.js','utf8');
const serverSource=fs.readFileSync('qa-v8-google/apps-script/CudoMobileAdoptionWeb.gs','utf8');

const fail=message=>{throw new Error('MOBILE ADOPTION CANDIDATE: '+message)};

const configWindow={};
new Function('window',configSource)(configWindow);
const fileConfig=configWindow.CUDO_ADOPTION_CONFIG;
if(!fileConfig||fileConfig.schema_version!=='CUDO_MOBILE_ADOPTION_CONFIG_V1') fail('invalid adoption config schema');
if(typeof fileConfig.enabled!=='boolean') fail('adoption enabled must be boolean');
if(fileConfig.enabled){
  let url;
  try{url=new URL(String(fileConfig.endpoint||''));}catch{fail('enabled adoption endpoint is invalid')}
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.startsWith('/macros/s/')||!url.pathname.endsWith('/exec')) fail('enabled adoption endpoint is outside approved Apps Script surface');
}else if(String(fileConfig.endpoint||'')!==''){
  fail('disabled adoption config must not retain endpoint');
}
if(!siteSource.includes("adoption-config.js")||!siteSource.includes("adoption.js")) fail('site loader does not bind adoption candidate');
for(const forbidden of ['userAgent','Session.getActiveUser','Session.getEffectiveUser','MailApp','email','device_id','deviceId']){
  if(serverSource.includes(forbidden)) fail('server source contains forbidden identity/PII token: '+forbidden);
}
for(const required of [
  "MOBILE_ADOPTION_EVENTS",
  "mobile.production.adoption.observed",
  "ANONYMOUS_PRIVACY_MINIMAL",
  "display_mode!=='standalone'"
]){
  if(!serverSource.includes(required)) fail('server contract missing '+required);
}

const ENDPOINT='https://script.google.com/macros/s/CUDO-QA-ADOPTION/exec';
const PAGE='https://cudo.cl/preview-v8/adoption-certification.html';

async function runScenario(browserType,{webdriver,standalone,expectCount,dedupe=false}){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext();
  await context.addInitScript(({webdriver,standalone})=>{
    try{Object.defineProperty(navigator,'webdriver',{configurable:true,get:()=>webdriver});}catch{}
    try{Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>standalone});}catch{}
    window.__cudoAdoptionBeacons=[];
    try{
      Object.defineProperty(navigator,'sendBeacon',{
        configurable:true,
        value:(url,body)=>{
          Promise.resolve(body&&typeof body.text==='function'?body.text():String(body||''))
            .then(text=>window.__cudoAdoptionBeacons.push({url:String(url),body:text}));
          return true;
        }
      });
    }catch{}
  },{webdriver,standalone});

  const observed=[];
  await context.route('https://cudo.cl/preview-v8/shared/adoption-config.js',route=>{
    route.fulfill({status:200,contentType:'application/javascript',body:
      "window.CUDO_ADOPTION_CONFIG=Object.freeze({schema_version:'CUDO_MOBILE_ADOPTION_CONFIG_V1',enabled:true,endpoint:'"+ENDPOINT+"'});"
    });
  });
  await context.route('https://cudo.cl/preview-v8/shared/adoption.js',route=>{
    route.fulfill({status:200,contentType:'application/javascript',body:adoptionSource});
  });
  await context.route(ENDPOINT,async route=>{
    await route.fulfill({status:204,body:''});
  });
  await context.route(PAGE,route=>{
    route.fulfill({status:200,contentType:'text/html',body:
      '<!doctype html><html><body><button id="use">Usar CUDO</button>'+
      '<script>window.CUDO_PWA={version:"2.0"};<\/script>'+
      '<script src="/preview-v8/shared/adoption-config.js"><\/script>'+
      '<script src="/preview-v8/shared/adoption.js"><\/script>'+
      '</body></html>'
    });
  });

  const page=await context.newPage();
  await page.goto(PAGE,{waitUntil:'load'});
  await page.locator('#use').click();
  await page.waitForTimeout(350);
  const firstBeacons=await page.evaluate(()=>window.__cudoAdoptionBeacons||[]);
  observed.push(...firstBeacons.map(item=>JSON.parse(item.body||'{}')));

  if(observed.length!==expectCount) fail(browserType.name()+': expected '+expectCount+' event(s), got '+observed.length);

  if(expectCount===1){
    const payload=observed[0];
    const keys=Object.keys(payload).sort();
    const expected=['app_version','display_mode','event_type','route','schema_version','trigger'].sort();
    if(JSON.stringify(keys)!==JSON.stringify(expected)) fail(browserType.name()+': payload keys drifted '+JSON.stringify(keys));
    if(payload.schema_version!=='CUDO_MOBILE_ADOPTION_EVENT_V1') fail('schema mismatch');
    if(payload.event_type!=='mobile.production.adoption.observed') fail('event type mismatch');
    if(payload.display_mode!=='standalone') fail('not standalone');
    if(payload.route!=='/preview-v8/adoption-certification.html') fail('route mismatch');
    if(!['pointerdown','keydown'].includes(payload.trigger)) fail('trusted trigger mismatch');
  }

  if(dedupe){
    await page.reload({waitUntil:'load'});
    await page.locator('#use').click();
    await page.waitForTimeout(350);
    const repeatBeacons=await page.evaluate(()=>window.__cudoAdoptionBeacons||[]);
    if(repeatBeacons.length!==0) fail(browserType.name()+': local dedupe did not suppress repeat adoption');
  }

  const state=await page.evaluate(()=>({eligible:window.CUDO_ADOPTION?.eligible===true,reason:window.CUDO_ADOPTION?.reason||null}));
  await browser.close();
  return {browser:browserType.name(),observed:observed.length,state};
}

const results=[];
for(const browserType of [chromium,webkit]){
  results.push(await runScenario(browserType,{webdriver:false,standalone:true,expectCount:1,dedupe:true}));
  results.push(await runScenario(browserType,{webdriver:true,standalone:true,expectCount:0}));
  results.push(await runScenario(browserType,{webdriver:false,standalone:false,expectCount:0}));
}

console.log(JSON.stringify({
  ok:true,
  classification:'PASS_MOBILE_ADOPTION_CANDIDATE_E2E',
  production_write:false,
  production_promotion:fileConfig.enabled===true,
  config_state:fileConfig.enabled?'ENABLED':'DISABLED',
  privacy:'ANONYMOUS_PRIVACY_MINIMAL',
  scenarios:results
},null,2));
