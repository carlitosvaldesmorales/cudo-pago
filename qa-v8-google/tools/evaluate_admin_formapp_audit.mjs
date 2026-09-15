import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalDecision } from './process_review_decisions.mjs';

const ROOT=path.resolve(new URL('../..',import.meta.url).pathname);
const sourcePath=path.resolve(ROOT,'qa-admin-audit/formapp-destination-audit.json');
const outPath=path.resolve(ROOT,'qa-admin-audit/formapp-contract-evaluation.json');
const data=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
assert.equal(data.ok,true,'FormApp audit must be ok');
const forms=data.result||{};

const expected={
  EQUIPO:{
    formId:'1Ila0fWY-bAq5Biuzn5Hp1_CdcDiiLXex91x62zKCUkk',
    url:'https://docs.google.com/forms/d/e/1FAIpQLScMsSWHj_u6waAtMUSbkyTEr15Ckt1kJPMXaLFNYuWyDzw0uA/viewform',
    destinationId:'1GJYChKXx9qAwBu7fhC8V-qmoW5S1Mmq7kP8cuO6khNI',
    questions:['Nombre público del equipo o serie','Serie o categoría','Presentación pública de la serie','Estado actual de la serie','¿La información fue confirmada por el club?','Nombre de quien registra la información','Nota para revisión']
  },
  PARTIDO:{
    formId:'1ZujRoboJGqqkKQJBwJeD1UNMiIYnDzstSWL24n_TtCA',
    url:'https://docs.google.com/forms/d/e/1FAIpQLSfD8jwbGL_kUAYm2A6DR3yYmANMoyTr2ja609JTFqBH9zvg2w/viewform',
    destinationId:'1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI',
    questions:['Competencia','Jornada o fecha del campeonato','Fecha del partido','Hora del partido','Serie o categoría','Equipo local','Equipo visitante','Cancha o recinto','Estado del partido','Goles del equipo local','Goles del equipo visitante','¿De dónde proviene esta información?','Nombre de quien registra la información','Cambio, suspensión u observación para revisión']
  },
  TABLA:{
    formId:'1teEHaQ1xRGJX3Y0sFsF7Y_j67usO-wssXgzCqpPYfUc',
    url:'https://docs.google.com/forms/d/e/1FAIpQLSf_WwBEVwZkvlDFMHnfO3FOFG7h9eUd-6DG4Rh6MW6kix696Q/viewform',
    destinationId:'1evGNco6Si1BYUAdwsBxLGiSMsYEmmojVWlx04NgPodY',
    questions:['Competencia','Serie o categoría','Posición en la tabla','Nombre del equipo','Partidos jugados (PJ)','Partidos ganados (PG)','Partidos empatados (PE)','Partidos perdidos (PP)','Goles a favor (GF)','Goles en contra (GC)','Jornada o fecha hasta la que está actualizada la tabla','Puntos (PTS)','Fuente oficial de la tabla','Nombre de quien registra la información','Nota para revisión']
  }
};

const normalize=s=>String(s??'').trim();
const itemTitles=f=>(f.items||[]).filter(i=>i.type!=='PAGE_BREAK').map(i=>normalize(i.title));
const checks=[];
for(const [key,cfg] of Object.entries(expected)){
  const f=forms[key]; assert.ok(f,`Missing ${key}`);
  assert.equal(f.formId,cfg.formId,`${key} formId`);
  assert.equal(f.publishedUrl,cfg.url,`${key} publishedUrl`);
  assert.equal(f.destinationId,cfg.destinationId,`${key} destinationId`);
  assert.equal(f.accepting,true,`${key} accepting`);
  const titles=itemTitles(f);
  for(const q of cfg.questions) assert.ok(titles.includes(q),`${key} missing question: ${q}`);
  checks.push({key,status:'PASS',destinationId:f.destinationId,accepting:f.accepting,question_count:titles.length});
}

const review=forms.REVIEW; assert.ok(review,'Missing REVIEW');
assert.equal(review.formId,'1YHuKTdApT0dawISYNAolVjn1HlpI7cuBQOs8T7cRgnw');
assert.equal(review.publishedUrl,'https://docs.google.com/forms/d/e/1FAIpQLScSrCXYIqCQzDSzF22_CBC_uOd20CRnkncWqcQ98nZrE4HgFA/viewform');
assert.equal(review.destinationId,'1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms');
assert.equal(review.accepting,true);
const decisionItem=(review.items||[]).find(i=>i.title==='Decisión de revisión');
assert.ok(decisionItem,'Missing review decision item');
const liveDecisions=decisionItem.choices||[];
assert.deepEqual(liveDecisions,['Aprobar publicación','Rechazar publicación','Aprobar retiro','Aprobar reactivación','Aprobar corrección']);
const unsupported=liveDecisions.filter(v=>!canonicalDecision(v));
assert.deepEqual(unsupported,[],'Every live review decision must be supported by processor');
checks.push({key:'REVIEW',status:'PASS',destinationId:review.destinationId,accepting:review.accepting,decisions_supported:liveDecisions.length});

const maintenance=forms.MAINTENANCE; assert.ok(maintenance,'Missing MAINTENANCE');
assert.equal(maintenance.formId,'1vry-EQ7V_DvD6ZF64OaHk4KXtTjtvonIfnnYaG1rruw');
assert.equal(maintenance.publishedUrl,'https://docs.google.com/forms/d/e/1FAIpQLSeHt_FhOGLSks4WjGgyuV6NNboyA8dgtT0bQTR8cinH4oonRg/viewform');
assert.equal(maintenance.destinationId,'1KfOxUmdhaCkb9Xcf9OYVTqtdQWy-fizwEVWHwOQ3apY');
assert.equal(maintenance.accepting,true);
const byTitle=t=>(maintenance.items||[]).find(i=>i.title===t);
assert.deepEqual(byTitle('¿Qué desea hacer?')?.choices,['Corregir información','Actualizar contenido','Retirar de la web','Reactivar contenido']);
assert.deepEqual(byTitle('¿Qué tipo de contenido desea administrar?')?.choices,['Noticia','Equipo / Serie','Jugador / Plantel','Partido / Resultado','Tabla de posiciones','Galería']);
assert.ok((byTitle('¿Qué dato desea cambiar?')?.choices||[]).includes('Otro'));
checks.push({key:'MAINTENANCE',status:'PASS',destinationId:maintenance.destinationId,accepting:maintenance.accepting,action_choices:byTitle('¿Qué desea hacer?')?.choices||[]});

const result={
  ok:true,
  mode:'LIVE_FORMAPP_ADMIN_CONTRACT_EVALUATION',
  generated_at:new Date().toISOString(),
  external_writes:0,
  checks,
  forms_rest_api_required:false,
  conclusion:'EIGHT_ADMIN_ENTRYPOINTS_FORM_CONTRACTS_LIVE_READONLY_PASS'
};
fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
