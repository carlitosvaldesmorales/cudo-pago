import fs from 'fs';

const html=fs.readFileSync('preview-v8/admin/index.html','utf8');
const cfg=JSON.parse(fs.readFileSync('preview-v8/admin/forms-config.json','utf8'));
const visible=html
  .replace(/<script[\s\S]*?<\/script>/gi,'')
  .replace(/<style[\s\S]*?<\/style>/gi,'')
  .replace(/<[^>]+>/g,' ')
  .replace(/\s+/g,' ');
const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
const tally=hrefs.filter(h=>h.startsWith('https://tally.so/r/'));
const google=hrefs.filter(h=>h.startsWith('https://docs.google.com/forms/'));

const checks=[
  ['título humano',visible.includes('Administrar contenido del CUDO')],
  ['noticias',visible.includes('Publicar una noticia')],
  ['equipos',visible.includes('Administrar equipo o serie')],
  ['plantel',visible.includes('Agregar jugador')],
  ['partidos',visible.includes('Registrar partido o resultado')],
  ['tabla',visible.includes('Tabla de posiciones')],
  ['galería',visible.includes('Subir fotos a la galería')],
  ['mantenimiento',visible.includes('Corregir, actualizar, retirar o reactivar')],
  ['sin exposición técnica',!/(GitHub|JSON|Apps Script|PUBLICO_EXPORT)/i.test(visible)],
  ['4 formularios Tally visibles',tally.length===4&&new Set(tally).size===4],
  ['2 formularios Google directos',google.length===2&&new Set(google).size===2],
  ['config schema',/^1\./.test(String(cfg.schema_version||''))],
  ['mantenimiento configurado',typeof cfg.maintenance_url==='string'&&cfg.maintenance_url.startsWith('https://docs.google.com/forms/')],
  ['revisión configurada',typeof cfg.review_url==='string'&&cfg.review_url.startsWith('https://docs.google.com/forms/')],
  ['asignación privada configurada',typeof cfg.event_assignment_url==='string'&&cfg.event_assignment_url.includes('script.google.com/macros/s/')&&cfg.event_assignment_url.includes('view=assignments')],
  ['entrada privada visible',visible.includes('Revisar y asignar responsables')]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error(JSON.stringify({ok:false,failed:failed.map(x=>x[0]),tally:tally.length,google:google.length},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,checks:checks.map(x=>x[0]),tally:tally.length,google:google.length},null,2));
