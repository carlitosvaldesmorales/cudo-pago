import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base='http://127.0.0.1:4173/preview-v8';
const outDir='qa-v8-artifacts';
fs.mkdirSync(outDir,{recursive:true});

const views=[
  {name:'inicio',path:'/'},
  {name:'club',path:'/club/'},
  {name:'noticias',path:'/noticias/'},
  {name:'partidos',path:'/partidos/'},
  {name:'equipos',path:'/equipos/'},
  {name:'galeria',path:'/galeria/'}
];
const viewports=[
  {name:'desktop',width:1440,height:1000},
  {name:'tablet',width:1024,height:900},
  {name:'mobile',width:390,height:844}
];

const report={generated_at:new Date().toISOString(),contract:'preview-v8/QA_VISUAL_CONTRACT.md',checks:[],errors:[],warnings:[]};
const fail=(view,viewport,rule,detail)=>report.errors.push({view,viewport,rule,detail});
const warn=(view,viewport,rule,detail)=>report.warnings.push({view,viewport,rule,detail});
const pass=(view,viewport,rule,detail='OK')=>report.checks.push({view,viewport,rule,detail});

const browser=await chromium.launch({headless:true});
try{
  for(const viewport of viewports){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
    for(const view of views){
      const page=await context.newPage();
      const pageErrors=[];
      page.on('pageerror',err=>pageErrors.push(String(err)));
      page.on('console',msg=>{if(msg.type()==='error')pageErrors.push('console: '+msg.text())});
      const url=base+view.path;
      try{
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
        if(!response||!response.ok()){
          fail(view.name,viewport.name,'HTTP',`No cargó correctamente: ${response?.status()}`);
          await page.close();
          continue;
        }
        await page.waitForTimeout(2500);
        await page.evaluate(()=>document.fonts?.ready);

        const state=await page.evaluate(()=>{
          const visible=el=>{
            if(!el)return false;
            const s=getComputedStyle(el),r=el.getBoundingClientRect();
            return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
          };
          const textCount=(rootSelector,label)=>{
            const root=document.querySelector(rootSelector);
            if(!root)return 0;
            return [...root.querySelectorAll('a')].filter(a=>a.textContent.trim().toUpperCase()===label).length;
          };
          const brand=document.querySelector('.brand img');
          const bodyFont=getComputedStyle(document.body).fontFamily;
          const heading=document.querySelector('h1,.section-title');
          const headingFont=heading?getComputedStyle(heading).fontFamily:'';
          const statusVisible=[...document.querySelectorAll('.status')].filter(visible).map(n=>n.textContent.trim());
          const brokenImages=[...document.images].filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.src);
          const activeDesktop=[...document.querySelectorAll('.navlinks a.active')].filter(visible).length;
          const qa=document.querySelector('.qa');
          const stripe=document.querySelector('.club-stripe');
          const topbar=document.querySelector('.topbar');
          return {
            width:window.innerWidth,
            docWidth:document.documentElement.scrollWidth,
            bodyFont,headingFont,
            brand:{exists:!!brand,visible:visible(brand),loaded:!!brand&&brand.complete&&brand.naturalWidth>0,w:brand?.getBoundingClientRect().width||0,h:brand?.getBoundingClientRect().height||0},
            stripe:{exists:!!stripe,visible:visible(stripe),height:stripe?.getBoundingClientRect().height||0},
            topbar:{exists:!!topbar,visible:visible(topbar),height:topbar?.getBoundingClientRect().height||0},
            desktopPartidos:textCount('.navlinks','PARTIDOS'),
            mobilePartidos:textCount('.mobilepanel','PARTIDOS'),
            activeDesktop,
            qaVisible:visible(qa),
            statusVisible,
            brokenImages,
            navlinksVisible:visible(document.querySelector('.navlinks')),
            mobileButtonVisible:visible(document.querySelector('.mobilemenu')),
            seedNotes:[...document.querySelectorAll('.seed-note')].filter(visible).length,
            counts:{
              news:document.querySelectorAll('.news').length,
              players:document.querySelectorAll('.player').length,
              teams:document.querySelectorAll('.team').length,
              matches:document.querySelectorAll('.match').length,
              standings:document.querySelectorAll('.standingsblock').length,
              photos:document.querySelectorAll('.photo').length,
              albums:document.querySelectorAll('.albumcard').length,
              identity:document.querySelectorAll('.identity-card').length
            }
          };
        });

        if(state.docWidth>state.width+2)fail(view.name,viewport.name,'RESP-01',`Overflow horizontal ${state.docWidth}px > ${state.width}px`); else pass(view.name,viewport.name,'RESP-01');
        if(!state.brand.exists||!state.brand.visible||!state.brand.loaded||state.brand.w<35)fail(view.name,viewport.name,'BRAND-01',`Escudo inválido ${JSON.stringify(state.brand)}`); else pass(view.name,viewport.name,'BRAND-01');
        if(!state.stripe.exists||!state.stripe.visible||state.stripe.height<5)fail(view.name,viewport.name,'BRAND-02','Franja CUDO ausente o insuficiente'); else pass(view.name,viewport.name,'BRAND-02');
        if(!state.topbar.exists||!state.topbar.visible||state.topbar.height<70||state.topbar.height>105)fail(view.name,viewport.name,'BRAND-03',`Topbar fuera de rango: ${state.topbar.height}`); else pass(view.name,viewport.name,'BRAND-03');
        if(!/Inter/i.test(state.bodyFont))fail(view.name,viewport.name,'BRAND-04',`Body no declara Inter: ${state.bodyFont}`); else pass(view.name,viewport.name,'BRAND-04');
        if(!/Barlow Condensed/i.test(state.headingFont))fail(view.name,viewport.name,'BRAND-05',`Titular no declara Barlow Condensed: ${state.headingFont}`); else pass(view.name,viewport.name,'BRAND-05');
        if(state.desktopPartidos!==1)fail(view.name,viewport.name,'NAV-01',`PARTIDOS desktop=${state.desktopPartidos}`); else pass(view.name,viewport.name,'NAV-01');
        if(state.mobilePartidos!==1)fail(view.name,viewport.name,'NAV-02',`PARTIDOS móvil=${state.mobilePartidos}`); else pass(view.name,viewport.name,'NAV-02');
        if(state.activeDesktop!==1)fail(view.name,viewport.name,'NAV-03',`Enlaces activos desktop=${state.activeDesktop}`); else pass(view.name,viewport.name,'NAV-03');
        if(state.qaVisible)fail(view.name,viewport.name,'MKT-01','Badge QA visible en vista pública'); else pass(view.name,viewport.name,'MKT-01');
        if(state.statusVisible.some(v=>/^Fuente pública:/i.test(v)))fail(view.name,viewport.name,'MKT-02','Texto técnico Fuente pública visible'); else pass(view.name,viewport.name,'MKT-02');
        if(state.brokenImages.length)fail(view.name,viewport.name,'MEDIA-01',`Imágenes rotas: ${state.brokenImages.slice(0,3).join(', ')}`); else pass(view.name,viewport.name,'MEDIA-01');
        if(pageErrors.length)fail(view.name,viewport.name,'JS-01',pageErrors.slice(0,5).join(' | ')); else pass(view.name,viewport.name,'JS-01');

        if(viewport.name==='mobile'){
          if(state.navlinksVisible)fail(view.name,viewport.name,'RESP-02','Navegación desktop visible en móvil'); else pass(view.name,viewport.name,'RESP-02');
          if(!state.mobileButtonVisible)fail(view.name,viewport.name,'RESP-03','Botón móvil no visible'); else pass(view.name,viewport.name,'RESP-03');
          const btn=page.locator('#menuBtn');
          if(await btn.count()){
            await btn.click();
            await page.waitForTimeout(150);
            const menu=await page.evaluate(()=>{
              const panel=document.querySelector('#mobilePanel');
              const visible=panel&&getComputedStyle(panel).display!=='none';
              const socio=panel?[...panel.querySelectorAll('a')].filter(a=>a.textContent.trim().toUpperCase().includes('HAZTE SOCIO')).length:0;
              return {visible,socio};
            });
            if(!menu.visible)fail(view.name,viewport.name,'NAV-04','Menú móvil no abre'); else pass(view.name,viewport.name,'NAV-04');
            if(menu.socio!==1)fail(view.name,viewport.name,'MKT-03',`CTA HAZTE SOCIO móvil=${menu.socio}`); else pass(view.name,viewport.name,'MKT-03');
            await btn.click();
          }
        }else{
          if(!state.navlinksVisible)fail(view.name,viewport.name,'RESP-04','Navegación desktop oculta'); else pass(view.name,viewport.name,'RESP-04');
        }

        const c=state.counts;
        if(view.name==='inicio'){
          if(c.news<3)fail(view.name,viewport.name,'VOL-01',`Noticias portada=${c.news}`); else pass(view.name,viewport.name,'VOL-01');
          if(c.photos<6)fail(view.name,viewport.name,'VOL-02',`Fotos portada=${c.photos}`); else pass(view.name,viewport.name,'VOL-02');
        }
        if(view.name==='club'&&c.identity!==4)fail(view.name,viewport.name,'VOL-03',`Bloques identidad=${c.identity}`); else if(view.name==='club')pass(view.name,viewport.name,'VOL-03');
        if(view.name==='noticias'&&c.news<6)fail(view.name,viewport.name,'VOL-04',`Noticias=${c.news}`); else if(view.name==='noticias')pass(view.name,viewport.name,'VOL-04');
        if(view.name==='equipos'){
          if(c.teams!==4)fail(view.name,viewport.name,'VOL-05',`Categorías=${c.teams}`); else pass(view.name,viewport.name,'VOL-05');
          if(c.players!==84)fail(view.name,viewport.name,'VOL-06',`Jugadores=${c.players}`); else pass(view.name,viewport.name,'VOL-06');
        }
        if(view.name==='partidos'){
          if(c.matches!==108)fail(view.name,viewport.name,'VOL-07',`Partidos=${c.matches}`); else pass(view.name,viewport.name,'VOL-07');
          if(c.standings!==8)fail(view.name,viewport.name,'VOL-08',`Tablas=${c.standings}`); else pass(view.name,viewport.name,'VOL-08');
        }
        if(view.name==='galeria'){
          if(c.photos!==15)fail(view.name,viewport.name,'VOL-09',`Fotos=${c.photos}`); else pass(view.name,viewport.name,'VOL-09');
          if(c.albums<3)warn(view.name,viewport.name,'VOL-10',`Álbumes detectados=${c.albums}`); else pass(view.name,viewport.name,'VOL-10');
        }

        await page.screenshot({path:path.join(outDir,`${view.name}-${viewport.name}-top.png`),fullPage:false});
        await page.evaluate(()=>window.scrollTo(0,Math.max(0,(document.documentElement.scrollHeight-window.innerHeight)/2)));
        await page.waitForTimeout(100);
        await page.screenshot({path:path.join(outDir,`${view.name}-${viewport.name}-mid.png`),fullPage:false});
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

const summary={passes:report.checks.length,warnings:report.warnings.length,errors:report.errors.length};
report.summary=summary;
fs.writeFileSync(path.join(outDir,'qa-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(outDir,'qa-report.md'),`# CUDO V8 · QA visual\n\n- PASS: ${summary.passes}\n- WARN: ${summary.warnings}\n- FAIL: ${summary.errors}\n\n${report.errors.map(e=>`- ❌ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')||'- ✅ Sin fallas críticas'}\n\n${report.warnings.map(e=>`- ⚠️ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')}\n`);
console.log(JSON.stringify(summary));
if(report.errors.length){
  console.error(JSON.stringify(report.errors,null,2));
  process.exit(1);
}
