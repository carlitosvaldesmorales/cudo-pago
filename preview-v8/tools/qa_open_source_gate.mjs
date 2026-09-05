import fs from 'fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE=(process.env.CUDO_QA_BASE||'http://127.0.0.1:4173/preview-v8/').replace(/\/?$/,'/');
const pages=[
  ['inicio',''],
  ['administracion','admin/'],
  ['noticias','noticias/'],
  ['partidos','partidos/'],
  ['equipos','equipos/'],
  ['galeria','galeria/']
];
const failures=[];
const evidence=[];
const browser=await chromium.launch({headless:true});

async function auditPage(name,path,viewport){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const jsErrors=[];
  page.on('pageerror',e=>jsErrors.push(String(e.message||e)));
  const response=await page.goto(new URL(path,BASE).href,{waitUntil:'domcontentloaded',timeout:30000});
  if(!response||!response.ok()) failures.push(`${name}: HTTP ${response?.status()??'sin respuesta'}`);
  await page.waitForTimeout(500);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
  if(overflow) failures.push(`${name}: desborde horizontal en ${viewport.width}x${viewport.height}`);
  if(jsErrors.length) failures.push(`${name}: errores JS: ${jsErrors.join(' | ')}`);

  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  const blocking=axe.violations.filter(v=>['critical','serious'].includes(v.impact||''));
  if(blocking.length) failures.push(`${name}: ${blocking.length} violaciones axe serious/critical: ${blocking.map(v=>v.id).join(', ')}`);
  evidence.push({name,viewport,http:response?.status(),overflow,axeViolations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))});
  await context.close();
}

for(const [name,path] of pages) await auditPage(name,path,{width:1365,height:900});
await auditPage('administracion-mobile','admin/',{width:390,height:844});

const adminHtml=fs.readFileSync('preview-v8/admin/index.html','utf8');
const cfg=JSON.parse(fs.readFileSync('preview-v8/admin/forms-config.json','utf8'));
if(!cfg.maintenance_url) failures.push('admin: maintenance_url no configurada');
if(!cfg.review_url) failures.push('admin: review_url no configurada');
const urls=[...adminHtml.matchAll(/href="(https:\/\/docs\.google\.com\/forms\/d\/e\/[^\"]+\/viewform)"/g)].map(m=>m[1]);
if(cfg.maintenance_url) urls.push(cfg.maintenance_url);
if(cfg.review_url) urls.push(cfg.review_url);
const unique=[...new Set(urls)];
if(unique.length!==8) failures.push(`admin: se esperaban 8 formularios humanos y se detectaron ${unique.length}`);

for(const url of unique){
  try{
    const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(20000)});
    if(!r.ok) failures.push(`formulario no accesible HTTP ${r.status}: ${url}`);
  }catch(e){failures.push(`formulario no accesible: ${url} · ${e.message}`)}
}

await browser.close();
fs.mkdirSync('qa-artifacts',{recursive:true});
fs.writeFileSync('qa-artifacts/open-source-qa.json',JSON.stringify({ok:failures.length===0,engine:['Playwright','axe-core'],pages:evidence,formsChecked:unique.length,failures},null,2)+'\n');
if(failures.length){
  console.error(JSON.stringify({ok:false,failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,pages:evidence.length,formsChecked:unique.length,engines:['Playwright','axe-core']},null,2));
