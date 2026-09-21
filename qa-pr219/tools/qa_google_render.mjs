import { chromium } from 'playwright';
import fs from 'node:fs';

const base='http://127.0.0.1:4173/preview-v8';
const read=name=>JSON.parse(fs.readFileSync(`preview-v8/data/${name}.json`,'utf8'));
const clean=v=>String(v??'').trim();
const upper=v=>clean(v).toUpperCase();
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

const datasets={
  noticias:read('noticias'),
  equipos:read('equipos'),
  plantel:read('plantel'),
  partidos:read('partidos'),
  tabla:read('tabla'),
  galeria:read('galeria')
};

for(const item of datasets.partidos.items||[]){
  const local=clean(item.local), visita=clean(item.visita);
  assert(upper(local)==='CUDO'||upper(visita)==='CUDO',`Partido ${item.id} no involucra a CUDO`);
  if(upper(local)==='CUDO')assert(local==='CUDO',`Partido ${item.id}: local debe canonizarse a CUDO, recibido ${JSON.stringify(local)}`);
  if(upper(visita)==='CUDO')assert(visita==='CUDO',`Partido ${item.id}: visita debe canonizarse a CUDO, recibido ${JSON.stringify(visita)}`);
}

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')pageErrors.push(m.text())});

  const checkPage=async(path,items,getExpected)=>{
    const response=await page.goto(base+path,{waitUntil:'networkidle',timeout:45000});
    assert(response?.ok(),`${path}: HTTP ${response?.status()}`);
    await page.waitForTimeout(450);
    const body=clean(await page.locator('body').innerText());
    const normalizedBody=body.toLocaleLowerCase('es');
    for(const item of items||[]){
      const expected=getExpected(item).filter(Boolean);
      for(const token of expected){
        assert(normalizedBody.includes(clean(token).toLocaleLowerCase('es')),`${path}: no se renderizó ${JSON.stringify(token)} del item ${item.id||'sin-id'}`);
      }
    }
  };

  await checkPage('/noticias/',datasets.noticias.items,i=>[i.titulo]);
  await checkPage('/equipos/',datasets.equipos.items,i=>[i.nombre]);
  await checkPage('/equipos/',datasets.plantel.items,i=>[i.nombre_deportivo, i.numero]);
  await checkPage('/galeria/',datasets.galeria.items,i=>[i.titulo, i.album]);
  await checkPage('/partidos/',datasets.tabla.items,i=>[i.equipo]);
  await checkPage('/partidos/',datasets.partidos.items,i=>{
    const rival=upper(i.local)==='CUDO'?i.visita:i.local;
    const tokens=[rival, i.categoria];
    if(upper(i.estado_partido)==='FINALIZADO')tokens.push(`${i.goles_local} - ${i.goles_visita}`);
    return tokens;
  });

  assert(pageErrors.length===0,`Errores JS/console: ${pageErrors.join(' | ')}`);
  console.log('QA Google render E2E todos los módulos: OK');
} finally {
  await browser.close();
}
