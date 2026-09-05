import fs from 'node:fs';
import path from 'node:path';

const dir='qa-v8-artifacts';
const source=path.join(dir,'qa-report.json');
if(!fs.existsSync(source)){
  console.error('No existe qa-report.json');
  process.exit(1);
}
const report=JSON.parse(fs.readFileSync(source,'utf8'));
const instrumentation=[];
const real=[];
for(const error of report.errors||[]){
  const mobileDesktopNav=error.rule==='NAV-03'&&error.viewport==='mobile'&&/desktop=0/.test(error.detail||'');
  const emptyLightboxImage=error.rule==='MEDIA-01'&&String(error.detail||'').trim()==='Imágenes rotas:';
  if(mobileDesktopNav||emptyLightboxImage)instrumentation.push({...error,classification:'INSTRUMENTACION_QA'});
  else real.push(error);
}
report.instrumentation=instrumentation;
report.errors=real;
report.summary={
  passes:(report.checks||[]).length,
  warnings:(report.warnings||[]).length,
  instrumentation:instrumentation.length,
  errors:real.length
};
fs.writeFileSync(path.join(dir,'qa-report-final.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(dir,'qa-report-final.md'),`# CUDO V8 · QA visual final\n\n- PASS: ${report.summary.passes}\n- WARN: ${report.summary.warnings}\n- INSTRUMENTACIÓN: ${report.summary.instrumentation}\n- FAIL REAL: ${report.summary.errors}\n\n## Fallas reales\n${real.map(e=>`- ❌ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')||'- ✅ Sin fallas visuales críticas'}\n\n## Instrumentación conocida\n${instrumentation.map(e=>`- ℹ️ **${e.view}/${e.viewport} · ${e.rule}** — ${e.detail}`).join('\n')||'- Ninguna'}\n`);
console.log(JSON.stringify(report.summary));
if(real.length){
  console.error(JSON.stringify(real,null,2));
  process.exit(1);
}
