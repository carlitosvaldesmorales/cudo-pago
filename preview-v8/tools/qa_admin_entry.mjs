import fs from 'fs';

const html=fs.readFileSync('preview-v8/admin/index.html','utf8');
const cfg=JSON.parse(fs.readFileSync('preview-v8/admin/forms-config.json','utf8'));
const checks=[
  ['título humano',html.includes('Administrar contenido del CUDO')],
  ['noticias',html.includes('Publicar una noticia')],
  ['equipos',html.includes('Administrar equipo o serie')],
  ['plantel',html.includes('Agregar jugador')],
  ['partidos',html.includes('Registrar partido o resultado')],
  ['tabla',html.includes('Actualizar tabla')],
  ['galería',html.includes('Subir a galería')],
  ['mantenimiento',html.includes('Corregir, actualizar, retirar o reactivar')],
  ['sin exposición técnica',!/>[^<]*(GitHub|JSON|Apps Script|PUBLICO_EXPORT|CONTROL)[^<]*</i.test(html.replace('No necesitas abrir planillas, GitHub, JSON ni código.',''))],
  ['config schema',cfg.schema_version==='1.0']
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error(JSON.stringify({ok:false,failed:failed.map(x=>x[0])},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,checks:checks.map(x=>x[0]),maintenanceConfigured:Boolean(cfg.maintenance_url)},null,2));
