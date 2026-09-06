import fs from 'fs';

const html=fs.readFileSync('preview-v8/admin/index.html','utf8');
const cfg=JSON.parse(fs.readFileSync('preview-v8/admin/forms-config.json','utf8'));
const visible=html
  .replace(/<script[\s\S]*?<\/script>/gi,'')
  .replace(/<style[\s\S]*?<\/style>/gi,'')
  .replace(/<[^>]+>/g,' ')
  .replace(/\s+/g,' ');

const checks=[
  ['título humano',visible.includes('Administrar contenido del CUDO')],
  ['noticias',visible.includes('Publicar una noticia')],
  ['equipos',visible.includes('Administrar equipo o serie')],
  ['plantel',visible.includes('Agregar jugador')],
  ['partidos',visible.includes('Registrar partido o resultado')],
  ['tabla',visible.includes('Actualizar tabla')],
  ['galería',visible.includes('Subir a galería')],
  ['mantenimiento',visible.includes('Corregir, actualizar, retirar o reactivar')],
  ['sin exposición técnica',!/(GitHub|JSON|Apps Script|PUBLICO_EXPORT|CONTROL)/i.test(visible)],
  ['config schema',cfg.schema_version==='1.0']
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error(JSON.stringify({ok:false,failed:failed.map(x=>x[0])},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,checks:checks.map(x=>x[0]),maintenanceConfigured:Boolean(cfg.maintenance_url)},null,2));
