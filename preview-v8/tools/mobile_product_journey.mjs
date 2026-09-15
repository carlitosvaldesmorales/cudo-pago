import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const baseUrl=process.env.CUDO_BASE_URL||'http://127.0.0.1:4173/preview-v8/';
const liveMode=process.env.CUDO_LIVE_MODE==='1';
const outDir=path.resolve('qa-mobile-certification');
fs.mkdirSync(outDir,{recursive:true});

const requiredPages=['','noticias/','partidos/','equipos/','galeria/','admin/'];
const publicData=['noticias','equipos','plantel','partidos','tabla','galeria'];
const forbiddenPublicTokens=['storage.tally.so/private','accessToken=','signature='];
const sportsApi='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const fixture=JSON.parse(fs.readFileSync('preview-v8/data/championship-fixture.json','utf8'));
const series=JSON.parse(fs.readFileSync('preview-v8/data/anfa-chepica-2026-series-results.json','utf8'));
const expectedAdminActions=[
  {label:'Publicar una noticia',host:'tally.so'},
  {label:'Administrar equipo o serie',host:'docs.google.com'},
  {label:'Agregar jugador',host:'tally.so'},
  {label:'Registrar partido o resultado',host:'docs.google.com'},
  {label:'Actualizar tabla',host:'docs.google.com'},
  {label:'Subir fotos a la galería',host:'tally.so'},
  {label:'Corregir, actualizar, retirar o reactivar',host:'docs.google.com'},
  {label:'Revisar contenido pendiente',host:'docs.google.com'}
];

const profile=(name,engine,deviceName,fallback)=>({
  name,engine,
  context:devices[deviceName]||fallback
});

const profiles=[
  profile('mobile-chromium',chromium,'Pixel 7',{viewport:{width:412,height:915},screen:{width:412,height:915},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'}),
  profile('mobile-webkit',webkit,'iPhone 15',{viewport:{width:393,height:852},screen:{width:393,height:852},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'})
];

const report={
  ok:false,
  mode:liveMode?'LIVE_PRODUCTION':'CONTROLLED_PREMERGE',
  base_url:baseUrl,
  generated_at:new Date().toISOString(),
  profiles:[],
  data_contract:{},
  app_shell_contract:{version:'2.0',required_on:requiredPages},
  admin_action_contract:{expected:expectedAdminActions.map(a=>a.label),live_external_open:liveMode},
  controlled_external_dependencies:{
    sports_event_bus:liveMode?'LIVE_REAL_DEPENDENCY':'INTERCEPTED_WITH_VERSIONED_PRODUCT_SNAPSHOTS',
    service_worker:liveMode?'LIVE_REAL_SERVICE_WORKER':'CERTIFIED_SEPARATELY_AND_BLOCKED_IN_UI_JOURNEY'
  },
  failures:[]
};

async function validatePublicData(request){
  for(const domain of publicData){
    const url=new URL(`data/${domain}.json`,baseUrl).href;
    const response=await request.get(url,{timeout:20000});
    if(!response.ok()) throw new Error(`${domain}: HTTP ${response.status()}`);
    const text=await response.text();
    for(const token of forbiddenPublicTokens){
      if(text.includes(token)) throw new Error(`${domain}: referencia privada detectada (${token})`);
    }
    const data=JSON.parse(text);
    if(!data||!Array.isArray(data.items)) throw new Error(`${domain}: contrato items[] invalido`);
    report.data_contract[domain]={items:data.items.length,source:data.source||null};
  }
}

function installControlledExternalRoutes(context){
  if(liveMode) return Promise.resolve();
  const matches=/^https:\/\/cudo-sports-event-bus\.carlos-valdes-morales\.workers\.dev\/api\/v1\/matches(?:\?|$)/;
  const seriesResults=/^https:\/\/cudo-sports-event-bus\.carlos-valdes-morales\.workers\.dev\/api\/v1\/series-results(?:\?|$)/;
  return Promise.all([
    context.route(matches,route=>route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ok:true,matches:fixture.matches||[],byes:fixture.byes||[]})
    })),
    context.route(seriesResults,route=>route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ok:true,results:series.results||[]})
    }))
  ]);
}

async function validateAdminActions(page,result){
  const cards=page.locator('a.admincard');
  await page.waitForFunction(()=>[...document.querySelectorAll('a.admincard')].every(a=>!a.classList.contains('disabled')&&a.href&&!a.href.endsWith('#')),{timeout:liveMode?15000:5000});
  const actions=await cards.evaluateAll(nodes=>nodes.map(n=>({
    label:(n.querySelector('strong')?.textContent||'').trim(),
    href:n.href,
    disabled:n.classList.contains('disabled')
  })));
  if(actions.length!==expectedAdminActions.length) throw new Error(`admin: ${actions.length} acciones, esperadas ${expectedAdminActions.length}`);
  for(let i=0;i<expectedAdminActions.length;i++){
    const expected=expectedAdminActions[i],actual=actions[i];
    if(actual.label!==expected.label) throw new Error(`admin: accion ${i+1} inesperada "${actual.label}" != "${expected.label}"`);
    if(actual.disabled) throw new Error(`admin: accion deshabilitada ${actual.label}`);
    const parsed=new URL(actual.href);
    if(parsed.protocol!=='https:') throw new Error(`admin: destino no HTTPS ${actual.href}`);
    if(parsed.hostname!==expected.host) throw new Error(`admin: host inesperado para ${actual.label}: ${parsed.hostname}`);
  }

  result.admin_actions=actions.map(a=>({label:a.label,href:a.href,entrypoint:'READY'}));
  if(!liveMode) return;

  for(let i=0;i<expectedAdminActions.length;i++){
    const expected=expectedAdminActions[i];
    const card=cards.nth(i);
    const popupPromise=page.waitForEvent('popup',{timeout:15000});
    await card.click();
    const popup=await popupPromise;
    try{
      await popup.waitForLoadState('domcontentloaded',{timeout:20000});
      const url=popup.url();
      const parsed=new URL(url);
      if(parsed.hostname!==expected.host) throw new Error(`admin: click ${expected.label} abrió host ${parsed.hostname}`);
      const bodyText=(await popup.locator('body').innerText({timeout:10000})).trim();
      if(!bodyText) throw new Error(`admin: click ${expected.label} abrió destino vacío`);
      result.admin_actions[i].entrypoint='LIVE_OPENED';
      result.admin_actions[i].resolved_url=url;
    }finally{
      await popup.close().catch(()=>{});
    }
  }
}

{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  try{
    await validatePublicData(context.request);
  }catch(error){
    report.failures.push(String(error?.message||error));
  }finally{
    await browser.close();
  }
}

for(const p of profiles){
  const browser=await p.engine.launch({headless:true});
  const contextOptions={...p.context,locale:'es-CL',timezoneId:'America/Santiago'};
  if(!liveMode) contextOptions.serviceWorkers='block';
  const context=await browser.newContext(contextOptions);
  await installControlledExternalRoutes(context);
  const page=await context.newPage();
  const result={name:p.name,pages:[],console_errors:[],admin_actions:[]};
  page.on('console',msg=>{if(msg.type()==='error') result.console_errors.push(msg.text())});
  page.on('pageerror',error=>result.console_errors.push(error.message));
  try{
    for(const relative of requiredPages){
      const url=new URL(relative,baseUrl).href;
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      if(!response||!response.ok()) throw new Error(`${p.name} ${relative||'/'}: HTTP ${response?.status()}`);
      await page.waitForFunction(()=>window.CUDO_PWA?.version==='2.0',{timeout:10000});
      await page.waitForTimeout(liveMode?800:300);
      const metrics=await page.evaluate(()=>({
        title:document.title,
        width:document.documentElement.scrollWidth,
        viewport:document.documentElement.clientWidth,
        bodyText:(document.body?.innerText||'').trim().slice(0,120),
        pwaVersion:window.CUDO_PWA?.version||null,
        manifest:document.querySelector('link[rel="manifest"]')?.href||null,
        shellInstall:document.querySelector('[data-cudo-pwa-shell="install"]')!==null
      }));
      if(!metrics.bodyText) throw new Error(`${p.name} ${relative||'/'}: pagina vacia`);
      if(metrics.width>metrics.viewport+2) throw new Error(`${p.name} ${relative||'/'}: overflow horizontal ${metrics.width}>${metrics.viewport}`);
      if(metrics.pwaVersion!=='2.0') throw new Error(`${p.name} ${relative||'/'}: shell PWA v2 ausente`);
      if(!metrics.manifest) throw new Error(`${p.name} ${relative||'/'}: manifest runtime ausente`);
      result.pages.push({path:relative||'/',title:metrics.title,width:metrics.width,viewport:metrics.viewport,pwaVersion:metrics.pwaVersion,manifest:metrics.manifest,shellInstall:metrics.shellInstall});
      if(relative===''){
        await page.screenshot({path:path.join(outDir,`${p.name}-home.png`),fullPage:true});
      }
      if(relative==='partidos/'){
        try{
          await page.locator('.champ-match-card').first().waitFor({state:'visible',timeout:liveMode?15000:5000});
        }catch{
          const cards=await page.locator('.champ-match-card').count();
          if(cards<1) throw new Error(`${p.name}: campeonato no renderizo partidos`);
        }
      }
      if(relative==='admin/'){
        await validateAdminActions(page,result);
        await page.screenshot({path:path.join(outDir,`${p.name}-admin.png`),fullPage:true});
      }
    }
    if(result.console_errors.length) throw new Error(`${p.name}: errores de consola: ${result.console_errors.join(' | ')}`);
  }catch(error){
    report.failures.push(String(error?.message||error));
  }finally{
    report.profiles.push(result);
    await browser.close();
  }
}

report.ok=report.failures.length===0;
fs.writeFileSync(path.join(outDir,'mobile-certification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!report.ok) process.exit(1);
