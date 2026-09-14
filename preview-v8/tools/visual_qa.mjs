import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base='http://127.0.0.1:4173/preview-v8';
const outDir='qa-v8-artifacts';
fs.mkdirSync(outDir,{recursive:true});

const readItems=name=>{
  const file=JSON.parse(fs.readFileSync(`preview-v8/data/${name}.json`,'utf8'));
  return Array.isArray(file.items)?file.items:[];
};
const data={
  noticias:readItems('noticias'),
  equipos:readItems('equipos'),
  plantel:readItems('plantel'),
  partidos:readItems('partidos'),
  tabla:readItems('tabla'),
  galeria:readItems('galeria')
};
const uniq=(items,key)=>new Set(items.map(x=>String(x?.[key]??'').trim()).filter(Boolean)).size;
const expected={
  noticias:data.noticias.length,
  equipos:data.equipos.length,
  plantel:data.plantel.length,
  senior:data.plantel.filter(x=>String(x.categoria??'').trim().toUpperCase()==='SENIOR').length,
  galeria:data.galeria.length,
  albums:uniq(data.galeria,'album_id'),
  standings:uniq(data.tabla,'categoria'),
  jornadaRows:data.partidos.length,
  jornadas:uniq(data.partidos,'jornada')
};

const views=[{name:'inicio',path:'/',signature:'.hero-v8'},{name:'club',path:'/club/',signature:'.club-manifesto'},{name:'noticias',path:'/noticias/',signature:'.news-magazine'},{name:'partidos',path:'/partidos/',signature:'.championship-grid'},{name:'equipos',path:'/equipos/',signature:'.roster-intro'},{name:'galeria',path:'/galeria/',signature:'.gallerygrid'}];
const viewports=[{name:'desktop',width:1440,height:1000},{name:'tablet',width:1024,height:900},{name:'mobile',width:390,height:844}];
const report={generated_at:new Date().toISOString(),contract:'preview-v8/DESIGN_MARKETING_CONTRACT.md',dataset_counts:expected,checks:[],errors:[],warnings:[],visual_certification:'PENDING_HUMAN_BASELINE'};
const fail=(view,viewport,rule,detail)=>report.errors.push({view,viewport,rule,detail});
const pass=(view,viewport,rule,detail='OK')=>report.checks.push({view,viewport,rule,detail});
const warn=(view,viewport,rule,detail)=>report.warnings.push({view,viewport,rule,detail});
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
          const contentMedia=[...document.querySelectorAll('.news img,.playermedia img,.photoopen img')].filter(visible).map(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return {src:i.src,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,renderedWidth:r.width,renderedHeight:r.height,objectFit:s.objectFit};});
          return {width:innerWidth,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,visibleText,signature:visible(document.querySelector(signature)),broken:imgs.filter(i=>visible(i)&&i.complete&&i.naturalWidth===0&&i.getAttribute('src')).map(i=>i.src),imageSrcs:imgs.filter(visible).map(i=>i.src),contentMedia,navPartidos:[...document.querySelectorAll('.navlinks a')].filter(a=>a.textContent.trim().toUpperCase()==='PARTIDOS').length,qaVisible:[...document.querySelectorAll('.qa,.seed-note,#seedGlobalNotice')].some(visible),bodyFont:getComputedStyle(document.body).fontFamily,headingFont:getComputedStyle(document.querySelector('h1,h2')||document.body).fontFamily,positions:{hero:top('.hero-v8'),matchRibbon:top('.match-ribbon'),homeNews:top('#homeNews'),championship:top('.championship-top'),standings:top('.standings-priority'),fixture:top('.fixture-secondary'),roster:top('.roster-intro'),teamGrid:top('.teamgrid'),news:top('.news-magazine'),gallery:top('.gallerygrid'),galleryControls:top('.gallery-controls-block')},counts:{news:document.querySelectorAll('.news').length,players:document.querySelectorAll('.player').length,teams:document.querySelectorAll('.team').length,standings:document.querySelectorAll('.standingsblock').length,photos:document.querySelectorAll('.photo').length,albums:document.querySelectorAll('.albumcard').length,chapters:document.querySelectorAll('.club-chapter').length,collage:document.querySelectorAll('.roster-collage img').length,jornadaRows:document.querySelectorAll('.jornada-row').length,jornadas:document.querySelectorAll('#matchGrid .jornada-card').length}};
        },{signature:view.signature});

        if(state.docWidth>state.width+2)fail(view.name,viewport.name,'RESP-01',`overflow ${state.docWidth}>${state.width}`);else pass(view.name,viewport.name,'RESP-01');
        if(!state.signature)fail(view.name,viewport.name,'ART-01',`firma ausente: ${view.signature}`);else pass(view.name,viewport.name,'ART-01');
        if(state.navPartidos!==1)fail(view.name,viewport.name,'NAV-01',`PARTIDOS desktop=${state.navPartidos}`);else pass(view.name,viewport.name,'NAV-01');
        const bannedMatch=state.visibleText.match(banned);
        if(state.qaVisible||bannedMatch){const lines=state.visibleText.split('\n').filter(x=>banned.test(x)).slice(0,4);fail(view.name,viewport.name,'MKT-01',`lenguaje técnico visible: ${lines.join(' | ')||'badge QA/seed'}`)}else pass(view.name,viewport.name,'MKT-01');
        if(state.broken.length)fail(view.name,viewport.name,'MEDIA-01',`imágenes rotas: ${state.broken.slice(0,3).join(', ')}`);else pass(view.name,viewport.name,'MEDIA-01');
        if(state.imageSrcs.some(s=>/jamie|watermark|alamy|shutterstock|gettyimages/i.test(s)))fail(view.name,viewport.name,'MEDIA-02','fuente de imagen con watermark/riesgo editorial');else pass(view.name,viewport.name,'MEDIA-02');

        const malformed=state.contentMedia.filter(m=>!(m.naturalWidth>0&&m.naturalHeight>0&&m.renderedWidth>0&&m.renderedHeight>0));
        if(malformed.length)fail(view.name,viewport.name,'MEDIA-03',`medio sin dimensiones intrínsecas/render: ${JSON.stringify(malformed.slice(0,2))}`);else pass(view.name,viewport.name,'MEDIA-03',`medios=${state.contentMedia.length}`);
        const fitErrors=state.contentMedia.filter(m=>!['cover','contain'].includes(m.objectFit));
        if(fitErrors.length)fail(view.name,viewport.name,'MEDIA-04',`object-fit inseguro: ${JSON.stringify(fitErrors.slice(0,2))}`);else pass(view.name,viewport.name,'MEDIA-04');
        const overflowMedia=state.contentMedia.filter(m=>m.renderedWidth>state.width+2);
        if(overflowMedia.length)fail(view.name,viewport.name,'MEDIA-05',`medio supera viewport: ${JSON.stringify(overflowMedia.slice(0,2))}`);else pass(view.name,viewport.name,'MEDIA-05');
        const undersized=state.contentMedia.filter(m=>m.naturalWidth+1<m.renderedWidth||m.naturalHeight+1<m.renderedHeight);
        if(undersized.length)fail(view.name,viewport.name,'MEDIA-06',`medio ampliado sobre resolución intrínseca: ${JSON.stringify(undersized.slice(0,2))}`);else pass(view.name,viewport.name,'MEDIA-06');

        if(!/Inter/i.test(state.bodyFont))fail(view.name,viewport.name,'BRAND-01',state.bodyFont);else pass(view.name,viewport.name,'BRAND-01');
        if(!/Barlow Condensed/i.test(state.headingFont))fail(view.name,viewport.name,'BRAND-02',state.headingFont);else pass(view.name,viewport.name,'BRAND-02');
        if(pageErrors.length)fail(view.name,viewport.name,'JS-01',pageErrors.slice(0,4).join(' | '));else pass(view.name,viewport.name,'JS-01');

        if(view.name==='inicio'){
          if(!(state.positions.hero<state.positions.matchRibbon&&state.positions.matchRibbon<state.positions.homeNews))fail(view.name,viewport.name,'HOME-ORDER','hero → jornada → noticias no se respeta');else pass(view.name,viewport.name,'HOME-ORDER');
          const crestVisible=await page.locator('.hero-crest').evaluateAll(es=>es.some(e=>getComputedStyle(e).display!=='none')).catch(()=>false);
          if(crestVisible)fail(view.name,viewport.name,'HOME-CREST','escudo gigante heredado sigue visible');else pass(view.name,viewport.name,'HOME-CREST');
          const expectedHomeNews=Math.min(expected.noticias,3),expectedHomePhotos=Math.min(expected.galeria,6);
          if(state.counts.news<expectedHomeNews||state.counts.photos<expectedHomePhotos)fail(view.name,viewport.name,'HOME-VOLUME',JSON.stringify({actual:state.counts,expected:{news:expectedHomeNews,photos:expectedHomePhotos}}));else pass(view.name,viewport.name,'HOME-VOLUME');
        }
        if(view.name==='partidos'){
          if(!(state.positions.championship<state.positions.fixture&&state.positions.standings<state.positions.fixture))fail(view.name,viewport.name,'MATCH-ORDER','tabla/jornada no están antes del fixture');else pass(view.name,viewport.name,'MATCH-ORDER');
          if(state.counts.standings<expected.standings)fail(view.name,viewport.name,'MATCH-TABLE',`tablas=${state.counts.standings} esperadas>=${expected.standings}`);else pass(view.name,viewport.name,'MATCH-TABLE');
          if(state.counts.jornadaRows<expected.jornadaRows||state.counts.jornadas<expected.jornadas)fail(view.name,viewport.name,'MATCH-JORNADA',JSON.stringify({actual:state.counts,expected:{rows:expected.jornadaRows,jornadas:expected.jornadas}}));else pass(view.name,viewport.name,'MATCH-JORNADA');
          const tab=page.locator('#standingsTabs button').nth(2);if(await tab.count()){await tab.click();await page.waitForTimeout(100);const visibleTables=await page.locator('.standingsblock:not([hidden])').count();if(!visibleTables)fail(view.name,viewport.name,'MATCH-TABS','filtro tabla sin resultados');else pass(view.name,viewport.name,'MATCH-TABS');await page.locator('#standingsTabs button').first().click()}
          const resultFilter=page.locator('#matchFilters [data-filter="FINALIZADO"]');if(await resultFilter.count()&&data.partidos.some(i=>String(i.estado_partido??'').toUpperCase()==='FINALIZADO')){await resultFilter.click();const visibleJ=await page.locator('#matchGrid .jornada-card:not([hidden])').count();if(!visibleJ)fail(view.name,viewport.name,'MATCH-FILTER','filtro resultados sin jornadas');else pass(view.name,viewport.name,'MATCH-FILTER');await page.locator('#matchFilters [data-filter="TODOS"]').click()}
        }
        if(view.name==='equipos'){
          if(!(state.positions.roster<state.positions.teamGrid))fail(view.name,viewport.name,'TEAM-ORDER','personas no aparecen antes que categorías');else pass(view.name,viewport.name,'TEAM-ORDER');
          if(state.counts.teams!==expected.equipos||state.counts.players!==expected.plantel)fail(view.name,viewport.name,'TEAM-VOLUME',JSON.stringify({actual:state.counts,expected:{teams:expected.equipos,players:expected.plantel}}));else pass(view.name,viewport.name,'TEAM-VOLUME');
          if(expected.senior>0&&await page.locator('#playerCategory option[value="SENIOR"]').count()){await page.selectOption('#playerCategory','SENIOR');await page.waitForTimeout(80);const visiblePlayers=await page.locator('#playerGrid .player:not([hidden])').count();if(visiblePlayers!==expected.senior)fail(view.name,viewport.name,'TEAM-FILTER',`Senior visibles=${visiblePlayers} esperados=${expected.senior}`);else pass(view.name,viewport.name,'TEAM-FILTER');await page.selectOption('#playerCategory','TODAS');await page.selectOption('#playerPosition','TODAS')}
        }
        if(view.name==='noticias'){
          if(state.counts.news!==expected.noticias)fail(view.name,viewport.name,'NEWS-VOLUME',`noticias=${state.counts.news} esperadas=${expected.noticias}`);else pass(view.name,viewport.name,'NEWS-VOLUME');
          if(expected.noticias>0&&!(await page.locator('.news').first().isVisible()))fail(view.name,viewport.name,'NEWS-HERO','historia principal no visible');else pass(view.name,viewport.name,'NEWS-HERO');
        }
        if(view.name==='galeria'){
          if(!(state.positions.gallery<state.positions.galleryControls))fail(view.name,viewport.name,'GALLERY-ORDER','controles aparecen antes que fotografías');else pass(view.name,viewport.name,'GALLERY-ORDER');
          if(state.counts.photos!==expected.galeria||state.counts.albums!==expected.albums)fail(view.name,viewport.name,'GALLERY-VOLUME',JSON.stringify({actual:state.counts,expected:{photos:expected.galeria,albums:expected.albums}}));else pass(view.name,viewport.name,'GALLERY-VOLUME');
          const first=page.locator('.photoopen').first();if(await first.count()){await first.click();await page.waitForTimeout(100);const lightbox=page.locator('.lightbox:not([hidden]) .lightboximage');const open=await lightbox.count();if(!open)fail(view.name,viewport.name,'GALLERY-LIGHTBOX','lightbox no abrió');else{pass(view.name,viewport.name,'GALLERY-LIGHTBOX');const m=await lightbox.evaluate(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return {naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,renderedWidth:r.width,renderedHeight:r.height,objectFit:s.objectFit}});if(!(m.naturalWidth>0&&m.naturalHeight>0&&m.renderedWidth>0&&m.renderedHeight>0&&m.objectFit==='contain'))fail(view.name,viewport.name,'MEDIA-LIGHTBOX',JSON.stringify(m));else pass(view.name,viewport.name,'MEDIA-LIGHTBOX',JSON.stringify(m))}await page.keyboard.press('Escape')}
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
fs.writeFileSync(path.join(outDir,'qa-report.md'),`# CUDO V8 · QA de contrato visual\n\n- PASS: ${report.summary.passes}\n- WARN: ${report.summary.warnings}\n- FAIL: ${report.summary.errors}\n- Dataset real: ${JSON.stringify(report.dataset_counts)}\n- Certificación visual: **${report.visual_certification}**\n\n${report.errors.map(e=>`- ❌ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')||'- ✅ Sin fallas automáticas del contrato'}\n\n${report.warnings.map(e=>`- ⚠️ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')}\n\n> El gate automático valida responsive, carga y dimensiones reales de medios. La aprobación estética final sigue siendo humana.\n`);
console.log(JSON.stringify(report.summary));
if(report.errors.length)process.exit(1);
