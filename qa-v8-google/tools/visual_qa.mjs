import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base='http://127.0.0.1:4173/preview-v8';
const outDir='qa-v8-artifacts';
fs.mkdirSync(outDir,{recursive:true});
const views=[{name:'inicio',path:'/',signature:'.hero-v8'},{name:'club',path:'/club/',signature:'.club-manifesto'},{name:'noticias',path:'/noticias/',signature:'.news-magazine'},{name:'partidos',path:'/partidos/',signature:'.championship-grid'},{name:'equipos',path:'/equipos/',signature:'.roster-intro'},{name:'galeria',path:'/galeria/',signature:'.gallerygrid'}];
const viewports=[{name:'desktop',width:1440,height:1000},{name:'tablet',width:1024,height:900},{name:'mobile',width:390,height:844}];
const report={generated_at:new Date().toISOString(),contract:'preview-v8/DESIGN_MARKETING_CONTRACT.md',checks:[],errors:[],warnings:[],visual_certification:'PENDING_HUMAN_BASELINE'};
const fail=(view,viewport,rule,detail)=>report.errors.push({view,viewport,rule,detail});
const pass=(view,viewport,rule,detail='OK')=>report.checks.push({view,viewport,rule,detail});
const banned=/\b(QA|SEED|MOCK|PREVIEW|FUENTE PÚBLICA|CONTRATO VISUAL|DATOS DE PRUEBA)\b/i;

const browser=await chromium.launch({headless:true});
try{
  for(const viewport of viewports){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
    for(const view of views){
      const page=await context.newPage();
      const pageErrors=[];
      page.on('pageerror',err=>pageErrors.push(String(err)));
      page.on('console',msg=>{if(msg.type()==='error')pageErrors.push('console: '+msg.text())});
      try{
        const response=await page.goto(base+view.path,{waitUntil:'domcontentloaded',timeout:45000});
        if(!response?.ok())throw new Error('HTTP '+response?.status());
        await page.waitForTimeout(2600);
        await page.evaluate(()=>document.fonts?.ready);

        // Recorrer la página real para disparar medios lazy y revisar todas las zonas.
        await page.evaluate(async()=>{
          const step=Math.max(300,Math.floor(innerHeight*.72));
          for(let y=0;y<document.documentElement.scrollHeight;y+=step){scrollTo(0,y);await new Promise(r=>setTimeout(r,35));}
          scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,180));scrollTo(0,0);
        });
        await page.waitForTimeout(450);

        const state=await page.evaluate(({signature})=>{
          const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0};
          const top=sel=>{const e=document.querySelector(sel);return e?e.getBoundingClientRect().top+scrollY:null};
          const imgs=[...document.images];
          const visibleText=[...document.querySelectorAll('body *')].filter(visible).map(n=>n.children.length?'':n.textContent.trim()).filter(Boolean).join('\n');
          return {width:innerWidth,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,visibleText,signature:visible(document.querySelector(signature)),broken:imgs.filter(i=>visible(i)&&i.complete&&i.naturalWidth===0&&i.getAttribute('src')).map(i=>i.src),imageSrcs:imgs.filter(visible).map(i=>i.src),navPartidos:[...document.querySelectorAll('.navlinks a')].filter(a=>a.textContent.trim().toUpperCase()==='PARTIDOS').length,qaVisible:[...document.querySelectorAll('.qa,.seed-note,#seedGlobalNotice')].some(visible),bodyFont:getComputedStyle(document.body).fontFamily,headingFont:getComputedStyle(document.querySelector('h1,h2')||document.body).fontFamily,positions:{hero:top('.hero-v8'),matchRibbon:top('.match-ribbon'),homeNews:top('#homeNews'),championship:top('.championship-top'),standings:top('.standings-priority'),fixture:top('.fixture-secondary'),roster:top('.roster-intro'),teamGrid:top('.teamgrid'),news:top('.news-magazine'),gallery:top('.gallerygrid'),galleryControls:top('.gallery-controls-block')},counts:{news:document.querySelectorAll('.news').length,players:document.querySelectorAll('.player').length,teams:document.querySelectorAll('.team').length,standings:document.querySelectorAll('.standingsblock').length,photos:document.querySelectorAll('.photo').length,albums:document.querySelectorAll('.albumcard').length,chapters:document.querySelectorAll('.club-chapter').length,collage:document.querySelectorAll('.roster-collage img').length,jornadaRows:document.querySelectorAll('.jornada-row').length,jornadas:document.querySelectorAll('#matchGrid .jornada-card').length}};
        },{signature:view.signature});

        if(state.docWidth>state.width+2)fail(view.name,viewport.name,'RESP-01',`overflow ${state.docWidth}>${state.width}`);else pass(view.name,viewport.name,'RESP-01');
        if(!state.signature)fail(view.name,viewport.name,'ART-01',`firma ausente: ${view.signature}`);else pass(view.name,viewport.name,'ART-01');
        if(state.navPartidos!==1)fail(view.name,viewport.name,'NAV-01',`PARTIDOS desktop=${state.navPartidos}`);else pass(view.name,viewport.name,'NAV-01');
        const bannedMatch=state.visibleText.match(banned);
        if(state.qaVisible||bannedMatch){const lines=state.visibleText.split('\n').filter(x=>banned.test(x)).slice(0,4);fail(view.name,viewport.name,'MKT-01',`lenguaje técnico visible: ${lines.join(' | ')||'badge QA/seed'}`)}else pass(view.name,viewport.name,'MKT-01');
        if(state.broken.length)fail(view.name,viewport.name,'MEDIA-01',`imágenes rotas: ${state.broken.slice(0,3).join(', ')}`);else pass(view.name,viewport.name,'MEDIA-01');
        if(state.imageSrcs.some(s=>/jamie|watermark|alamy|shutterstock|gettyimages/i.test(s)))fail(view.name,viewport.name,'MEDIA-02','fuente de imagen con watermark/riesgo editorial');else pass(view.name,viewport.name,'MEDIA-02');
        if(!/Inter/i.test(state.bodyFont))fail(view.name,viewport.name,'BRAND-01',state.bodyFont);else pass(view.name,viewport.name,'BRAND-01');
        if(!/Barlow Condensed/i.test(state.headingFont))fail(view.name,viewport.name,'BRAND-02',state.headingFont);else pass(view.name,viewport.name,'BRAND-02');
        if(pageErrors.length)fail(view.name,viewport.name,'JS-01',pageErrors.slice(0,4).join(' | '));else pass(view.name,viewport.name,'JS-01');

        if(view.name==='inicio'){
          if(!(state.positions.hero<state.positions.matchRibbon&&state.positions.matchRibbon<state.positions.homeNews))fail(view.name,viewport.name,'HOME-ORDER','hero → jornada → noticias no se respeta');else pass(view.name,viewport.name,'HOME-ORDER');
          const crestVisible=await page.locator('.hero-crest').evaluateAll(es=>es.some(e=>getComputedStyle(e).display!=='none')).catch(()=>false);
          if(crestVisible)fail(view.name,viewport.name,'HOME-CREST','escudo gigante heredado sigue visible');else pass(view.name,viewport.name,'HOME-CREST');
          if(state.counts.news<3||state.counts.photos<6)fail(view.name,viewport.name,'HOME-VOLUME',JSON.stringify(state.counts));else pass(view.name,viewport.name,'HOME-VOLUME');
        }
        if(view.name==='partidos'){
          if(!(state.positions.championship<state.positions.fixture&&state.positions.standings<state.positions.fixture))fail(view.name,viewport.name,'MATCH-ORDER','tabla/jornada no están antes del fixture');else pass(view.name,viewport.name,'MATCH-ORDER');
          if(state.counts.standings<4)fail(view.name,viewport.name,'MATCH-TABLE',`tablas=${state.counts.standings}`);else pass(view.name,viewport.name,'MATCH-TABLE');
          if(state.counts.jornadaRows<4||state.counts.jornadas<5)fail(view.name,viewport.name,'MATCH-JORNADA',JSON.stringify(state.counts));else pass(view.name,viewport.name,'MATCH-JORNADA');
          const tab=page.locator('#standingsTabs button').nth(2);if(await tab.count()){await tab.click();await page.waitForTimeout(100);const visibleTables=await page.locator('.standingsblock:not([hidden])').count();if(!visibleTables)fail(view.name,viewport.name,'MATCH-TABS','filtro tabla sin resultados');else pass(view.name,viewport.name,'MATCH-TABS');await page.locator('#standingsTabs button').first().click()}
          const resultFilter=page.locator('#matchFilters [data-filter="FINALIZADO"]');if(await resultFilter.count()){await resultFilter.click();const visibleJ=await page.locator('#matchGrid .jornada-card:not([hidden])').count();if(!visibleJ)fail(view.name,viewport.name,'MATCH-FILTER','filtro resultados sin jornadas');else pass(view.name,viewport.name,'MATCH-FILTER');await page.locator('#matchFilters [data-filter="TODOS"]').click()}
        }
        if(view.name==='equipos'){
          if(!(state.positions.roster<state.positions.teamGrid))fail(view.name,viewport.name,'TEAM-ORDER','personas no aparecen antes que categorías');else pass(view.name,viewport.name,'TEAM-ORDER');
          if(state.counts.collage<4)fail(view.name,viewport.name,'TEAM-COLLAGE',`collage=${state.counts.collage}`);else pass(view.name,viewport.name,'TEAM-COLLAGE');
          if(state.counts.teams!==4||state.counts.players!==84)fail(view.name,viewport.name,'TEAM-VOLUME',JSON.stringify(state.counts));else pass(view.name,viewport.name,'TEAM-VOLUME');
          await page.selectOption('#playerCategory','SENIOR');await page.waitForTimeout(80);const visiblePlayers=await page.locator('#playerGrid .player:not([hidden])').count();if(visiblePlayers!==30)fail(view.name,viewport.name,'TEAM-FILTER',`Senior visibles=${visiblePlayers}`);else pass(view.name,viewport.name,'TEAM-FILTER');await page.selectOption('#playerCategory','TODAS');await page.selectOption('#playerPosition','TODAS')
        }
        if(view.name==='noticias'){
          if(state.counts.news<6)fail(view.name,viewport.name,'NEWS-VOLUME',`noticias=${state.counts.news}`);else pass(view.name,viewport.name,'NEWS-VOLUME');
          if(!(await page.locator('.news').first().isVisible()))fail(view.name,viewport.name,'NEWS-HERO','historia principal no visible');else pass(view.name,viewport.name,'NEWS-HERO');
        }
        if(view.name==='galeria'){
          if(!(state.positions.gallery<state.positions.galleryControls))fail(view.name,viewport.name,'GALLERY-ORDER','controles aparecen antes que fotografías');else pass(view.name,viewport.name,'GALLERY-ORDER');
          if(state.counts.photos!==15||state.counts.albums<3)fail(view.name,viewport.name,'GALLERY-VOLUME',JSON.stringify(state.counts));else pass(view.name,viewport.name,'GALLERY-VOLUME');
          const first=page.locator('.photoopen').first();if(await first.count()){await first.click();await page.waitForTimeout(100);const open=await page.locator('.lightbox:not([hidden])').count();if(!open)fail(view.name,viewport.name,'GALLERY-LIGHTBOX','lightbox no abrió');else pass(view.name,viewport.name,'GALLERY-LIGHTBOX');await page.keyboard.press('Escape')}
        }
        if(view.name==='club'){if(state.counts.chapters<2)fail(view.name,viewport.name,'CLUB-NARRATIVE',`capítulos=${state.counts.chapters}`);else pass(view.name,viewport.name,'CLUB-NARRATIVE')}

        if(viewport.name==='mobile'){
          const menu=page.locator('#menuBtn');if(await menu.count()){await menu.click();await page.waitForTimeout(100);const panelVisible=await page.locator('#mobilePanel.open').count();const socio=await page.locator('#mobilePanel a').filter({hasText:'HAZTE SOCIO'}).count();if(!panelVisible||socio!==1)fail(view.name,viewport.name,'MOBILE-NAV',`panel=${panelVisible} socio=${socio}`);else pass(view.name,viewport.name,'MOBILE-NAV');await menu.click();await page.waitForTimeout(80)}
        }

        await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);
        await page.screenshot({path:path.join(outDir,`${view.name}-${viewport.name}-full.png`),fullPage:true});
        const critical={inicio:['.hero-v8','.match-ribbon'],club:['.club-manifesto','.club-chapter'],noticias:['.news-magazine'],partidos:['.championship-top','.fixture-secondary'],equipos:['.roster-intro','#planteles'],galeria:['.gallerygrid','.gallery-controls-block']}[view.name]||[];
        for(let i=0;i<critical.length;i++){const loc=page.locator(critical[i]).first();if(await loc.count()&&await loc.isVisible())await loc.screenshot({path:path.join(outDir,`${view.name}-${viewport.name}-section-${i+1}.png`)}).catch(()=>{})}
      }catch(error){fail(view.name,viewport.name,'RUN',String(error))}
      await page.close();
    }
    await context.close();
  }
}finally{await browser.close()}

report.summary={passes:report.checks.length,warnings:report.warnings.length,errors:report.errors.length};
fs.writeFileSync(path.join(outDir,'qa-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(outDir,'qa-report.md'),`# CUDO V8 · QA de contrato visual\n\n- PASS: ${report.summary.passes}\n- WARN: ${report.summary.warnings}\n- FAIL: ${report.summary.errors}\n- Certificación visual: **${report.visual_certification}**\n\n${report.errors.map(e=>`- ❌ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')||'- ✅ Sin fallas automáticas del contrato'}\n\n> Un QA automático verde no equivale a aprobación de diseño. La certificación final requiere baseline visual aprobado por humano.\n`);
console.log(JSON.stringify(report.summary));
if(report.errors.length)process.exit(1);
