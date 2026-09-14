import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base='http://127.0.0.1:4173/preview-v8';
const outDir='qa-v8-artifacts';
fs.mkdirSync(outDir,{recursive:true});

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const publicContracts={
  noticias:readJson('preview-v8/data/noticias.json'),
  galeria:readJson('preview-v8/data/galeria.json')
};
const fixture=readJson('preview-v8/data/championship-fixture.json');
const series=readJson('preview-v8/data/anfa-chepica-2026-series-results.json');

const views=[
  {name:'inicio',path:'/',signature:'.hero-v8'},
  {name:'club',path:'/club/',signature:'.club-manifesto'},
  {name:'noticias',path:'/noticias/',signature:'.news-magazine'},
  {name:'partidos',path:'/partidos/',signature:'#championshipApp'},
  {name:'equipos',path:'/equipos/',signature:'.clubs-shell'},
  {name:'galeria',path:'/galeria/',signature:'.gallerygrid'}
];
const viewports=[
  {name:'desktop',width:1440,height:1000},
  {name:'tablet',width:1024,height:900},
  {name:'mobile',width:390,height:844}
];
const report={
  generated_at:new Date().toISOString(),
  contract:'preview-v8/DESIGN_MARKETING_CONTRACT.md',
  mode:'CURRENT_GOVERNED_PRODUCT',
  checks:[],errors:[],warnings:[],
  visual_certification:'AUTOMATED_CURRENT_PRODUCT_CONTRACT'
};
const fail=(view,viewport,rule,detail)=>report.errors.push({view,viewport,rule,detail});
const pass=(view,viewport,rule,detail='OK')=>report.checks.push({view,viewport,rule,detail});
const banned=/\b(QA|SEED|MOCK|PREVIEW|FUENTE PÚBLICA|CONTRATO VISUAL|DATOS DE PRUEBA)\b/i;

async function installControlledSportsRoutes(context){
  const matches=/^https:\/\/cudo-sports-event-bus\.carlos-valdes-morales\.workers\.dev\/api\/v1\/matches(?:\?|$)/;
  const seriesResults=/^https:\/\/cudo-sports-event-bus\.carlos-valdes-morales\.workers\.dev\/api\/v1\/series-results(?:\?|$)/;
  await Promise.all([
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

const browser=await chromium.launch({headless:true});
try{
  for(const viewport of viewports){
    const context=await browser.newContext({
      viewport:{width:viewport.width,height:viewport.height},
      deviceScaleFactor:1,
      locale:'es-CL',
      timezoneId:'America/Santiago',
      serviceWorkers:'block'
    });
    await installControlledSportsRoutes(context);

    for(const view of views){
      const page=await context.newPage();
      const pageErrors=[];
      page.on('pageerror',err=>pageErrors.push(String(err)));
      page.on('console',msg=>{if(msg.type()==='error')pageErrors.push('console: '+msg.text())});
      try{
        const response=await page.goto(base+view.path,{waitUntil:'domcontentloaded',timeout:45000});
        if(!response?.ok())throw new Error('HTTP '+response?.status());

        if(view.name==='partidos'){
          await page.locator('.champ-match-card').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
          await page.locator('#standTables .stand-table').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
        }else{
          await page.waitForTimeout(700);
        }
        await page.evaluate(()=>document.fonts?.ready);

        await page.evaluate(async()=>{
          const step=Math.max(300,Math.floor(innerHeight*.72));
          for(let y=0;y<document.documentElement.scrollHeight;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,25));}
          scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,120));scrollTo(0,0);
        });
        await page.waitForTimeout(250);

        const state=await page.evaluate(({signature})=>{
          const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0};
          const top=sel=>{const e=document.querySelector(sel);return e?e.getBoundingClientRect().top+scrollY:null};
          const imgs=[...document.images];
          const visibleText=[...document.querySelectorAll('body *')].filter(visible).map(n=>n.children.length?'':n.textContent.trim()).filter(Boolean).join('\n');
          const navPartidos=[...document.querySelectorAll('.navlinks a')].filter(a=>{
            try{return new URL(a.href).pathname.endsWith('/preview-v8/partidos/')}catch{return false}
          }).length;
          return {
            width:innerWidth,
            docWidth:document.documentElement.scrollWidth,
            visibleText,
            signature:visible(document.querySelector(signature)),
            broken:imgs.filter(i=>visible(i)&&i.complete&&i.naturalWidth===0&&i.getAttribute('src')).map(i=>i.src),
            imageSrcs:imgs.filter(visible).map(i=>i.src),
            navPartidos,
            qaVisible:[...document.querySelectorAll('.qa,.seed-note,#seedGlobalNotice')].some(visible),
            bodyFont:getComputedStyle(document.body).fontFamily,
            headingFont:getComputedStyle(document.querySelector('h1,h2')||document.body).fontFamily,
            positions:{
              hero:top('.hero-v8'),
              matchRibbon:top('.match-ribbon'),
              homeNews:top('#homeNews'),
              homeGallery:top('#homeGallery'),
              gallery:top('.gallerygrid'),
              galleryControls:top('.gallery-controls-block')
            },
            counts:{
              news:document.querySelectorAll('.news').length,
              photos:document.querySelectorAll('.photo').length,
              albums:document.querySelectorAll('.albumcard').length,
              chapters:document.querySelectorAll('.club-chapter').length,
              clubCards:document.querySelectorAll('.club-card').length,
              clubCrests:[...document.querySelectorAll('.club-card img.club-crest')].filter(i=>i.complete&&i.naturalWidth>0).length,
              champMatches:document.querySelectorAll('.champ-match-card').length,
              standTables:document.querySelectorAll('#standTables .stand-table').length,
              empties:[...document.querySelectorAll('.empty')].filter(visible).length
            }
          };
        },{signature:view.signature});

        if(state.docWidth>state.width+2)fail(view.name,viewport.name,'RESP-01',`overflow ${state.docWidth}>${state.width}`);else pass(view.name,viewport.name,'RESP-01');
        if(!state.signature)fail(view.name,viewport.name,'ART-01',`firma ausente: ${view.signature}`);else pass(view.name,viewport.name,'ART-01');
        if(state.navPartidos<1)fail(view.name,viewport.name,'NAV-01','falta navegación al módulo Partidos/Campeonato');else pass(view.name,viewport.name,'NAV-01');
        const bannedMatch=state.visibleText.match(banned);
        if(state.qaVisible||bannedMatch){const lines=state.visibleText.split('\n').filter(x=>banned.test(x)).slice(0,4);fail(view.name,viewport.name,'MKT-01',`lenguaje técnico visible: ${lines.join(' | ')||'badge QA/seed'}`)}else pass(view.name,viewport.name,'MKT-01');
        if(state.broken.length)fail(view.name,viewport.name,'MEDIA-01',`imágenes rotas: ${state.broken.slice(0,3).join(', ')}`);else pass(view.name,viewport.name,'MEDIA-01');
        if(state.imageSrcs.some(s=>/jamie|watermark|alamy|shutterstock|gettyimages/i.test(s)))fail(view.name,viewport.name,'MEDIA-02','fuente de imagen con watermark/riesgo editorial');else pass(view.name,viewport.name,'MEDIA-02');
        if(!/Inter/i.test(state.bodyFont))fail(view.name,viewport.name,'BRAND-01',state.bodyFont);else pass(view.name,viewport.name,'BRAND-01');
        if(!/Barlow Condensed/i.test(state.headingFont))fail(view.name,viewport.name,'BRAND-02',state.headingFont);else pass(view.name,viewport.name,'BRAND-02');
        if(pageErrors.length)fail(view.name,viewport.name,'JS-01',pageErrors.slice(0,4).join(' | '));else pass(view.name,viewport.name,'JS-01');

        if(view.name==='inicio'){
          const p=state.positions;
          if(!(p.hero!==null&&p.matchRibbon!==null&&p.homeNews!==null&&p.homeGallery!==null&&p.hero<p.matchRibbon&&p.matchRibbon<p.homeNews&&p.homeNews<p.homeGallery))fail(view.name,viewport.name,'HOME-ORDER','hero → jornada → noticias → galería no se respeta');else pass(view.name,viewport.name,'HOME-ORDER');
          if((publicContracts.noticias.items||[]).length>0&&state.counts.news<1)fail(view.name,viewport.name,'HOME-NEWS','hay noticias públicas pero Inicio no renderiza ninguna');else pass(view.name,viewport.name,'HOME-NEWS');
          if((publicContracts.galeria.items||[]).length>0&&state.counts.photos<1)fail(view.name,viewport.name,'HOME-GALLERY','hay galería pública pero Inicio no renderiza imágenes');else pass(view.name,viewport.name,'HOME-GALLERY');
        }

        if(view.name==='club'){
          if(state.counts.chapters<2)fail(view.name,viewport.name,'CLUB-NARRATIVE',`capítulos=${state.counts.chapters}`);else pass(view.name,viewport.name,'CLUB-NARRATIVE');
        }

        if(view.name==='noticias'){
          const expected=(publicContracts.noticias.items||[]).length;
          if(expected>0&&state.counts.news!==expected)fail(view.name,viewport.name,'NEWS-CONTRACT',`render=${state.counts.news} contrato=${expected}`);
          else if(expected===0&&state.counts.empties<1)fail(view.name,viewport.name,'NEWS-CONTRACT','contrato vacío sin estado vacío visible');
          else pass(view.name,viewport.name,'NEWS-CONTRACT',`render=${state.counts.news} contrato=${expected}`);
        }

        if(view.name==='partidos'){
          if(state.counts.champMatches<1)fail(view.name,viewport.name,'MATCH-RENDER','campeonato sin partidos renderizados');else pass(view.name,viewport.name,'MATCH-RENDER',`partidos=${state.counts.champMatches}`);
          if(state.counts.standTables<2)fail(view.name,viewport.name,'MATCH-STANDINGS',`tablas=${state.counts.standTables}`);else pass(view.name,viewport.name,'MATCH-STANDINGS',`tablas=${state.counts.standTables}`);
          const groupB=page.locator('[data-stand-group="B"]');
          if(await groupB.count()){
            await groupB.click();
            await page.waitForTimeout(120);
            const tables=await page.locator('#standTables .stand-table').count();
            if(tables<2)fail(view.name,viewport.name,'MATCH-GROUP-SWITCH',`Grupo B tablas=${tables}`);else pass(view.name,viewport.name,'MATCH-GROUP-SWITCH');
          }
        }

        if(view.name==='equipos'){
          if(state.counts.clubCards!==11)fail(view.name,viewport.name,'CLUBS-COUNT',`clubes=${state.counts.clubCards}`);else pass(view.name,viewport.name,'CLUBS-COUNT');
          if(state.counts.clubCrests!==11)fail(view.name,viewport.name,'CLUBS-CRESTS',`escudos cargados=${state.counts.clubCrests}`);else pass(view.name,viewport.name,'CLUBS-CRESTS');
        }

        if(view.name==='galeria'){
          const expected=(publicContracts.galeria.items||[]).length;
          if(expected>0&&state.counts.photos!==expected)fail(view.name,viewport.name,'GALLERY-CONTRACT',`render=${state.counts.photos} contrato=${expected}`);
          else if(expected===0&&state.counts.empties<1)fail(view.name,viewport.name,'GALLERY-CONTRACT','contrato vacío sin estado vacío visible');
          else pass(view.name,viewport.name,'GALLERY-CONTRACT',`render=${state.counts.photos} contrato=${expected}`);
          if(expected>0&&!(state.positions.gallery<state.positions.galleryControls))fail(view.name,viewport.name,'GALLERY-ORDER','controles aparecen antes que fotografías');else pass(view.name,viewport.name,'GALLERY-ORDER');
          const first=page.locator('.photoopen').first();
          if(await first.count()){
            await first.click();await page.waitForTimeout(100);
            const open=await page.locator('.lightbox:not([hidden])').count();
            if(!open)fail(view.name,viewport.name,'GALLERY-LIGHTBOX','lightbox no abrió');else pass(view.name,viewport.name,'GALLERY-LIGHTBOX');
            await page.keyboard.press('Escape');
          }
        }

        if(viewport.name==='mobile'){
          const menu=page.locator('#menuBtn');
          if(await menu.count()){
            const panel=page.locator('#mobilePanel');
            if(!(await panel.count())){
              fail(view.name,viewport.name,'MOBILE-NAV','botón móvil sin panel #mobilePanel');
            }else{
              await menu.click();await page.waitForTimeout(100);
              const panelVisible=await page.locator('#mobilePanel.open').count();
              const socio=await page.locator('#mobilePanel a').filter({hasText:'HAZTE SOCIO'}).count();
              const expanded=await menu.getAttribute('aria-expanded');
              if(!panelVisible||socio<1||expanded!=='true')fail(view.name,viewport.name,'MOBILE-NAV',`panel=${panelVisible} socio=${socio} expanded=${expanded}`);else pass(view.name,viewport.name,'MOBILE-NAV');
              await menu.click();await page.waitForTimeout(60);
            }
          }
        }

        await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(60);
        await page.screenshot({path:path.join(outDir,`${view.name}-${viewport.name}-full.png`),fullPage:true});
      }catch(error){
        fail(view.name,viewport.name,'RUN',String(error));
      }
      await page.close();
    }
    await context.close();
  }
}finally{
  await browser.close();
}

report.summary={passes:report.checks.length,warnings:report.warnings.length,errors:report.errors.length};
fs.writeFileSync(path.join(outDir,'qa-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(outDir,'qa-report.md'),`# CUDO V8 · QA visual automatizado\n\n- PASS: ${report.summary.passes}\n- WARN: ${report.summary.warnings}\n- FAIL: ${report.summary.errors}\n- Contrato: **${report.visual_certification}**\n\n${report.errors.map(e=>`- ❌ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')||'- ✅ Sin fallas automáticas del contrato actual'}\n\n> Este gate certifica invariantes release-blocking de UI, responsive, navegación, medios y render contra los datos vigentes. Una revisión creativa opcional no reemplaza ni bloquea esta certificación automática.\n`);
console.log(JSON.stringify(report.summary));
if(report.errors.length)process.exit(1);
