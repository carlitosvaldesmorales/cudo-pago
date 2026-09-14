import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const baseUrl=process.env.CUDO_BASE_URL||'http://127.0.0.1:4173/preview-v8/';
const outDir=path.resolve('qa-mobile-certification');
fs.mkdirSync(outDir,{recursive:true});

const requiredPages=['','noticias/','partidos/','equipos/','galeria/','admin/'];
const publicData=['noticias','equipos','plantel','partidos','tabla','galeria'];
const forbiddenPublicTokens=['storage.tally.so/private','accessToken=','signature='];
const sportsApi='https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';
const fixture=JSON.parse(fs.readFileSync('preview-v8/data/championship-fixture.json','utf8'));
const series=JSON.parse(fs.readFileSync('preview-v8/data/anfa-chepica-2026-series-results.json','utf8'));

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
  base_url:baseUrl,
  generated_at:new Date().toISOString(),
  profiles:[],
  data_contract:{},
  controlled_external_dependencies:{
    sports_event_bus:'INTERCEPTED_WITH_VERSIONED_PRODUCT_SNAPSHOTS',
    service_worker:'CERTIFIED_SEPARATELY_AND_BLOCKED_IN_UI_JOURNEY'
  },
  failures:[]
};

async function validatePublicData(request){
  for(const domain of publicData){
    const url=new URL(`data/${domain}.json`,baseUrl).href;
    const response=await request.get(url,{timeout:15000});
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

// La privacidad/contrato de datos es un gate propio. Aunque falle, los journeys siguen
// ejecutándose para dejar evidencia completa del producto y no ocultar defectos secundarios.
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
  const context=await browser.newContext({...p.context,locale:'es-CL',timezoneId:'America/Santiago',serviceWorkers:'block'});
  await installControlledExternalRoutes(context);
  const page=await context.newPage();
  const result={name:p.name,pages:[],console_errors:[]};
  page.on('console',msg=>{if(msg.type()==='error') result.console_errors.push(msg.text())});
  page.on('pageerror',error=>result.console_errors.push(error.message));
  try{
    for(const relative of requiredPages){
      const url=new URL(relative,baseUrl).href;
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
      if(!response||!response.ok()) throw new Error(`${p.name} ${relative||'/'}: HTTP ${response?.status()}`);
      await page.waitForTimeout(300);
      const metrics=await page.evaluate(()=>({
        title:document.title,
        width:document.documentElement.scrollWidth,
        viewport:document.documentElement.clientWidth,
        bodyText:(document.body?.innerText||'').trim().slice(0,120)
      }));
      if(!metrics.bodyText) throw new Error(`${p.name} ${relative||'/'}: pagina vacia`);
      if(metrics.width>metrics.viewport+2) throw new Error(`${p.name} ${relative||'/'}: overflow horizontal ${metrics.width}>${metrics.viewport}`);
      result.pages.push({path:relative||'/',title:metrics.title,width:metrics.width,viewport:metrics.viewport});
      if(relative===''){
        const manifest=await page.locator('link[rel="manifest"]').getAttribute('href');
        if(!manifest) throw new Error(`${p.name}: falta manifest en inicio`);
        await page.screenshot({path:path.join(outDir,`${p.name}-home.png`),fullPage:true});
      }
      if(relative==='partidos/'){
        const cards=await page.locator('.champ-match-card').count();
        if(cards<1) throw new Error(`${p.name}: campeonato no renderizo partidos`);
      }
      if(relative==='admin/'){
        const cards=page.locator('a.admincard');
        const count=await cards.count();
        if(count<8) throw new Error(`${p.name}: admin incompleto; ${count} acciones`);
        const hrefs=await cards.evaluateAll(nodes=>nodes.map(n=>n.href).filter(Boolean));
        const unsafe=hrefs.filter(h=>!h.startsWith('https://')&&!h.startsWith(baseUrl));
        if(unsafe.length) throw new Error(`${p.name}: enlaces admin inseguros: ${unsafe.join(', ')}`);
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
